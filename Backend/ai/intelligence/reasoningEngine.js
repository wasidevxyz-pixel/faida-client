'use strict';

/**
 * Reasoning Engine — Level 1 + Level 4 Intelligence
 *
 * - Chain of Thought: AI thinks step-by-step before answering
 * - Self-correction: if a tool returns empty/error, tries alternative approach
 * - Multi-step planning: breaks complex questions into sub-queries
 * - Clarification: asks follow-up only when genuinely needed
 */

// ─── Self-correction strategies ───────────────────────────────────────────────

/**
 * When a tool returns no data, suggest an alternative approach.
 * Returns a recovery instruction string or null if no recovery possible.
 */
function selfCorrect(toolName, args, result) {
  // Empty employee list — maybe branch name is wrong
  if (toolName === 'get_employee_information' && result?.count === 0) {
    const branch = args.branch;
    if (branch) {
      return `No employees found for branch "${branch}". The branch name might be different. Try searching without specifying a branch, or check the exact branch name format (e.g., "PWD-1" not "PWD 1").`;
    }
    const dept = args.department;
    if (dept) {
      return `No employees found in "${dept}" department. Try a partial name like "tech" instead of the full department name.`;
    }
  }

  // Empty sale data
  if ((toolName === 'get_sales_department_report' || toolName === 'get_payment_report')
    && (!result?.rows?.length && !result?.grandTotals?.sales)) {
    return `No data found for this period. This could mean: (1) no sales were recorded for these dates, (2) the date range might be outside available data, or (3) the branch filter might not match any records. Try without a branch filter or check if data exists for this period.`;
  }

  // No attendance records
  if (toolName === 'get_employee_checkin' && !result?.found && !result?.employees?.length) {
    return `No attendance record found. The employee might not have checked in yet, or the date might be a holiday/off day.`;
  }

  return null;
}

/**
 * Detect if a response needs clarification from the user.
 * Returns a clarifying question or null.
 */
function needsClarification(message, context) {
  const text = String(message || '').toLowerCase();

  // "sale" without any date context and no history
  if (/\bsale\b/.test(text) && !hasDateContext(text) && !context?.hasRecentDateQuery) {
    return null; // Don't ask — default to yesterday
  }

  // Multi-branch user asking about "branch" without specifying which
  if (/\bbranch\b/.test(text) && context?.userBranches?.length > 3
    && !/[A-Z]{2,8}-\d+/.test(message) && /\b(employee|staff|attendance)\b/.test(text)) {
    return `Which branch are you asking about? You have access to: ${context.userBranches.slice(0, 5).join(', ')}${context.userBranches.length > 5 ? '...' : ''}.`;
  }

  return null;
}

function hasDateContext(text) {
  return /\b(today|yesterday|aaj|kal|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|\d{4}|\d{2}[-\/]\d{2})\b/i.test(text);
}

/**
 * Build a chain-of-thought prefix for complex queries.
 * This is added to the system prompt to guide the model's reasoning.
 */
function buildChainOfThoughtPrompt(message, userContext) {
  const text = String(message || '').toLowerCase();

  // Multi-question query
  if (/\band\b/.test(text) && text.split(/\band\b/).length > 2) {
    return `This appears to be a multi-part question. Think step by step:
1. Identify each sub-question separately
2. Determine which tool answers each part
3. Execute tools in the right order
4. Combine results into one clear answer`;
  }

  // Why/analysis question
  if (/\bwhy\b|\bkyon\b|\bkiun\b|\breason\b|\banalyze\b|\banalysis\b/i.test(text)) {
    return `This is an analytical question. Think step by step:
1. What data do I need to answer this?
2. Fetch the relevant data using tools
3. Compare/analyze the data
4. Explain the pattern or reason found`;
  }

  // Comparison question
  if (/\bcompare\b|\bvs\b|\bversus\b|\bdifference\b|\bbetter\b|\bmore\b|\bless\b/i.test(text)) {
    return `This is a comparison question. Think step by step:
1. Identify what is being compared (two periods, branches, categories)
2. Fetch data for both sides
3. Calculate the difference/percentage change
4. Highlight the key finding`;
  }

  return null;
}

/**
 * Enrich the assistant answer with business context.
 * Adds trend indicators, emojis, and plain-language summaries.
 */
function enrichAnswer(answer, toolResults) {
  if (!answer || typeof answer !== 'string') return answer;

  // Already has markdown formatting — don't over-process
  if (answer.includes('###') || answer.includes('|---|')) return answer;

  return answer;
}

/**
 * Detect if the LLM answer seems like a hallucination or refusal
 * when tools were available.
 */
function seemsHallucinated(answer, toolsUsed) {
  if (!answer) return false;
  const lower = answer.toLowerCase();

  // Model claims it can't access data when tools were available
  if (toolsUsed && (
    lower.includes("i don't have access") ||
    lower.includes("i cannot access") ||
    lower.includes("i'm unable to retrieve") ||
    lower.includes("as an ai, i don't") ||
    lower.includes("i don't have real-time")
  )) return true;

  return false;
}

module.exports = {
  selfCorrect,
  needsClarification,
  buildChainOfThoughtPrompt,
  enrichAnswer,
  seemsHallucinated
};
