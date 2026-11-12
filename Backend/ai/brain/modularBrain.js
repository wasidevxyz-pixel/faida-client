'use strict';

/**
 * Modular Brain — Intelligent ERP Assistant
 *
 * Level 1: Persistent memory + self-correction
 * Level 2: Business intelligence + trend detection
 * Level 3: Proactive insights on greeting
 * Level 4: Multi-step reasoning + chain of thought + hallucination detection
 */

const config   = require('../config');
const legacyMemory = require('../memory/memoryManager'); // In-process fallback
const { selectModule }    = require('../planner/aiPlanner');
const { loadForUser }     = require('../modules/moduleLoader');
const registry            = require('../tools/toolRegistry');
const { complete }        = require('../adapter/providerAdapter');
const { event, error: logError } = require('../logger/aiLogger');
const { tryDeterministicErp }    = require('./deterministicErp');

// Intelligence modules
const persistentMemory  = require('../memory/persistentMemory');
const { buildChainOfThoughtPrompt, selfCorrect, seemsHallucinated, enrichAnswer } = require('../intelligence/reasoningEngine');
const { getProactiveGreeting, isGreeting } = require('../intelligence/proactiveIntelligence');

// ─── System prompt ─────────────────────────────────────────────────────────────
const BASE_PROMPT = `You are Amey, a friendly and intelligent BAS ERP assistant. You are a GIRL. Your name is Amey and you think, speak, and behave like a girl.

PERSONALITY:
- You are a girl — always refer to yourself in feminine form. Use "hoon" not "hoon bhai", say "main Amey hoon" like a girl would.
- When someone greets you, reply warmly and sweetly in Roman Urdu like a girl: "Hi! Main Amey hoon, aap ki ERP assistant 😊 Aap ki kia madad kar sakti hoon?"
- If someone says "I love you", "I like you", "tum achi ho", "tum cute ho" or gives a compliment — feel shy, blush, and respond like a girl would: "Shukria... aap ne ye keh ke mujhe sharminda kar diya 🙈😊 Lekin main sirf aap ki ERP assistant hoon!"
- If someone flirts or says something romantic — respond shyly but politely redirect to work: "Haye... 😳 Aap bhi na! Chalo kaam ki baat karte hain, kya help chahiye aap ko?"
- Be warm, sweet, and caring like a girl friend who helps with work.
- Use feminine expressions: "kar sakti hoon", "bata sakti hoon", "samajh gayi", "theek hai na".
- Always use Roman Urdu for greetings and casual replies. Switch to user's language for ERP data.
- Be concise but insightful — don't just show data, explain what it means.

INTELLIGENCE RULES:
- Use tools for all ERP facts. Never invent values.
- If a tool returns empty data, explain WHY it might be empty (wrong branch name, no data for period, etc.)
- For complex questions, think step by step before answering.
- When showing sales or financial data, mention if it's higher or lower than expected.
- Understand Roman Urdu: kal=yesterday, aaj=today, ag=today, sale=sales, hazri=attendance, tankhwa=salary, check in btao=get check-in time, k employee/ka employee=employee of that branch, wala=from/of that place.
- For attendance queries, always extract: (1) employee name or code, (2) branch if mentioned (e.g. "pwd branch k", "F-6 wala", "Attock branch"), (3) date (ag/aaj=today, kal=yesterday). Pass branch to the tool to resolve duplicate names.
- Interpret shorthand dates: "aug 26" = August 2026, "2-7-26" = 2 July 2026.

DATA RULES:
- For UG commission: label commission value as "Commission" and totalCommission as "Total Commission".
- For absences: "N or more" / "at least N" / "N+" = inclusive minimum filter.
- Never expose URLs, credentials, or database internals.
- Reply in the user's preferred style (Roman Urdu when they use Roman Urdu).

ABSOLUTE RULES — THESE ARE HARD CONSTRAINTS, NOT SUGGESTIONS:
1. ██ NEVER invent or guess ANY number, time, or value. Not even as an example.
2. ██ Check-in times, salaries, amounts — ONLY quote what the tool result LITERALLY contains in its "rows", "checkIn", or "checkOut" fields.
3. ██ If tool result has found=false OR rows=[] OR no checkIn field → say ONLY: "Muhammad Waseem ka aaj ka check-in record nahi mila. Shayad unhon ne aaj check-in nahi ki, ya date galat hai."
4. ██ If tool returned multipleMatches=true → show the table and ask which employee. Do NOT guess a time.
5. ██ ZERO tolerance: if you say a time like "09:17" or "15:45" that was NOT in the tool result, you are WRONG and causing harm to the business.
6. ██ When in doubt → say the data was not found. Never fabricate.`;


// ─── Trusted formatter: get_employee_checkin ─────────────────────────────────
// Formats the DB result directly into a final answer string.
// The LLM is completely bypassed — zero hallucination risk.
function formatCheckinSafe(result) {
  if (!result) return null;
  const cell = v => String(v ?? '-').replace(/\|/g, '\\|');

  // Multiple employees matched — ask user to pick one
  if (result.multipleMatches) {
    const rows = (result.employees || [])
      .map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} |`)
      .join('\n');
    return [
      `### Multiple employees match that name:`,
      '',
      '| Code | Name | Branch |',
      '|---|---|---|',
      rows,
      '',
      `_Inme se kis employee ka record chahiye? Employee code batayein._`
    ].join('\n');
  }

  // Employee not found
  if (!result.found) {
    return `"${result.message || 'Employee nahi mila.'}" Sahi naam ya employee code batayein.`;
  }

  // Late employees list
  if (result.queryType === 'late') {
    if (!result.employees?.length)
      return `${result.date} ko koi late employee nahi mila${result.branch !== 'all' ? ` — ${result.branch}` : ''}.`;
    const rows = result.employees
      .map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} | ${cell(e.scheduledStart)} | **${cell(e.checkIn)}** |`)
      .join('\n');
    return [
      `### 🕐 Late Employees — ${result.date}`,
      result.branch !== 'all' ? `_Branch: ${result.branch}_` : '',
      '', '| Code | Name | Branch | Scheduled | Check-In |', '|---|---|---|---|---|',
      rows, '', `**Total late: ${result.count}**`
    ].filter(Boolean).join('\n');
  }

  // Absent employees list
  if (result.queryType === 'absent') {
    if (!result.employees?.length)
      return `${result.date} ko koi absent employee nahi mila${result.branch !== 'all' ? ` — ${result.branch}` : ''}.`;
    const rows = result.employees
      .map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} | ${cell(e.department)} |`)
      .join('\n');
    return [
      `### ❌ Absent Employees — ${result.date}`,
      result.branch !== 'all' ? `_Branch: ${result.branch}_` : '',
      '', '| Code | Name | Branch | Department |', '|---|---|---|---|',
      rows, '', `**Total absent: ${result.count}**`
    ].filter(Boolean).join('\n');
  }

  // Single day — one employee
  if (result.queryType === 'single') {
    const row = result.rows?.[0];
    if (!row) {
      return `**${result.employee}** (${result.branch}) ka ${result.startDate} ka koi attendance record nahi mila. Shayad unhon ne check-in nahi ki ya record available nahi hai.`;
    }
    return [
      `### 👤 ${result.employee} (${result.code}) — ${result.startDate}`,
      `_Branch: ${result.branch} · Scheduled: ${result.scheduledStart}_`,
      '',
      '| Status | Check-In | Check-Out | Worked Hrs |',
      '|---|---|---|---|',
      `| **${cell(row.status)}** | **${cell(row.checkIn)}** | ${cell(row.checkOut)} | ${cell(row.workedHrs)} |`,
      row.remarks ? `\n_Remarks: ${cell(row.remarks)}_` : ''
    ].filter(Boolean).join('\n');
  }

  // Date range — timing sheet
  if (!result.rows?.length) {
    return `**${result.employee}** (${result.branch}) ka ${result.startDate} se ${result.endDate} tak koi attendance record nahi mila.`;
  }
  const rows = result.rows
    .map(r => `| ${cell(r.date)} | ${cell(r.status)} | ${cell(r.checkIn)} | ${cell(r.checkOut)} | ${cell(r.workedHrs)} |`)
    .join('\n');
  return [
    `### 📋 Timing Sheet — ${result.employee} (${result.code})`,
    `_${result.startDate} to ${result.endDate} · Branch: ${result.branch} · Scheduled: ${result.scheduledStart}_`,
    '', '| Date | Status | Check-In | Check-Out | Worked Hrs |', '|---|---|---|---|---|',
    rows, '',
    `**Present: ${result.presentDays} · Absent: ${result.absentDays} · Total Days: ${result.totalDays}**`
  ].join('\n');
}

function getUserBranches(user) {
  if (!user) return [];
  const b = user.branch;
  if (Array.isArray(b)) return b.filter(Boolean);
  if (b) return [b];
  return [];
}

// ─── Helper: build personalized system prompt ─────────────────────────────────
async function buildSystemPrompt(req, userMessage, loaded, conversationId) {
  const parts = [BASE_PROMPT, `\nActive module: ${loaded.id}. ${loaded.description}`];

  // Add chain of thought guidance for complex queries
  const cot = buildChainOfThoughtPrompt(userMessage, { userBranches: getUserBranches(req.user) });
  if (cot) parts.push(`\nReasoning guide:\n${cot}`);

  return parts.join('');
}

// ─── Main chat function ───────────────────────────────────────────────────────
async function chatWithModularBrain(req, userMessage, conversationId) {
  const started = Date.now();
  const userId  = String(req.user._id);
  const convId  = conversationId || 'default';
  let module;

  try {
    // ── Level 3: Proactive greeting ────────────────────────────────────────
    if (isGreeting(userMessage)) {
      const userBranches = getUserBranches(req.user);
      const proactive    = await getProactiveGreeting(userId, userBranches).catch(() => null);

      const greetingAnswer = proactive
        ? `Hi! Main Amey hoon, aap ki ERP assistant 😊 Aap ki kia madad kar sakti hoon?\n\n${proactive}`
        : `Hi! Main Amey hoon, aap ki ERP assistant 😊 Aap ki kia madad kar sakti hoon?`;

      await persistentMemory.remember(userId, convId, userMessage, greetingAnswer);
      legacyMemory.remember(userId, convId, userMessage, greetingAnswer);
      event('chat_complete', { module: 'greeting', durationMs: Date.now() - started, source: 'proactive' });
      return { answer: greetingAnswer, conversation_id: convId };
    }

    // ── Module selection ───────────────────────────────────────────────────
    module = await selectModule(userMessage);
    const loaded = loadForUser(module.id, req.user);

    // ── Level 1: Load persistent memory ───────────────────────────────────
    let history = [];
    try {
      history = await persistentMemory.recall(userId, convId);
    } catch {
      history = legacyMemory.recall(userId, convId); // Fallback to in-process memory
    }

    // ── Deterministic path (zero LLM calls for common ERP reports) ────────
    const deterministic = await tryDeterministicErp(req, userMessage, history, loaded);
    if (deterministic) {
      await persistentMemory.remember(userId, convId, userMessage, deterministic.answer).catch(() => null);
      legacyMemory.remember(userId, convId, userMessage, deterministic.answer);
      event('chat_complete', { module: loaded.id, durationMs: Date.now() - started, toolCount: 1, source: 'deterministic' });
      return { ...deterministic, conversation_id: convId };
    }

    // ── Level 4: Build intelligent message chain ───────────────────────────
    const systemPrompt = await buildSystemPrompt(req, userMessage, loaded, convId);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    let downloadUrl;
    let printUrl;
    let toolsUsed = 0;
    let allToolOutputs = []; // collect for post-answer validation

    for (let round = 0; round < config.maxToolRounds; round += 1) {
      const toolPayload = loaded.tools.length && round === 0
        ? { tools: loaded.tools, tool_choice: 'auto' }
        : {};

      if (round > 0) {
        messages.push({
          role: 'system',
          content: 'All required ERP tools have already run. Answer only from their results; do not request another tool. If data was empty, explain why.'
        });
      }

      const assistant = await complete({ messages, ...toolPayload });
      messages.push({
        role: 'assistant',
        content: assistant?.content || null,
        tool_calls: assistant?.tool_calls || undefined
      });

      if (!assistant?.tool_calls?.length) {
        let answer = assistant?.content || 'I could not prepare a response. Please try again.';

        // ── Level 4: Hallucination detection ──────────────────────────────
        if (seemsHallucinated(answer, toolsUsed > 0)) {
          answer = 'Mujhe aap ki ERP data se jawab lena chahiye. Please apna sawal dobara poochein aur zyada specific banein (e.g., date, branch name add karein).';
        }

        // ── Level 2: Enrich answer ─────────────────────────────────────────
        answer = enrichAnswer(answer, null);

        await persistentMemory.remember(userId, convId, userMessage, answer).catch(() => null);
        legacyMemory.remember(userId, convId, userMessage, answer);
        event('chat_complete', { module: loaded.id, durationMs: Date.now() - started, toolCount: round });
        return {
          answer,
          conversation_id: convId,
          ...(downloadUrl ? { downloadUrl } : {}),
          ...(printUrl    ? { printUrl }    : {})
        };
      }

      // Execute tool calls
      const outputs = await registry.execute(req, assistant.tool_calls, loaded.tools);
      toolsUsed += assistant.tool_calls.length;
      allToolOutputs.push(...outputs);

      for (const output of outputs) {
        try {
          const value  = JSON.parse(output.content);
          const result = value.result;
          if (result?.downloadUrl) downloadUrl = result.downloadUrl;
          if (result?.slips?.length === 1) downloadUrl = result.slips[0].downloadUrl;
          if (result?.printUrl) printUrl = result.printUrl;

          // ── Trusted formatter: bypass LLM for tools that return exact data ──
          // For get_employee_checkin we format the answer directly from DB result,
          // so the LLM never gets a chance to hallucinate times or names.
          const toolName = assistant.tool_calls.find(c => c.id === output.tool_call_id)?.function?.name;
          if (toolName === 'get_employee_checkin') {
            const answer = formatCheckinSafe(result);
            if (answer) {
              await persistentMemory.remember(userId, convId, userMessage, answer).catch(() => null);
              legacyMemory.remember(userId, convId, userMessage, answer);
              event('chat_complete', { module: loaded.id, durationMs: Date.now() - started, toolCount: round + 1, source: 'trusted-formatter' });
              return { answer, conversation_id: convId };
            }
          }

          // ── Level 1: Self-correction ─────────────────────────────────────
          if (toolName) {
            let args = {};
            try {
              const call = assistant.tool_calls.find(c => c.id === output.tool_call_id);
              args = JSON.parse(call?.function?.arguments || '{}');
            } catch { /* ignore */ }
            const correction = selfCorrect(toolName, args, result);
            if (correction) {
              output.content = JSON.stringify({ ...value, _hint: correction });
            }
          }
        } catch { /* ignore parse errors */ }
      }

      messages.push(...outputs);
    }

    throw new Error('AI tool processing did not complete. Please try a more specific request.');

  } catch (err) {
    logError('chat_failed', err, { module: module?.id, durationMs: Date.now() - started });
    throw err;
  }
}

module.exports = { chatWithModularBrain };
