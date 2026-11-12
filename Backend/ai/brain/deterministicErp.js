// High-confidence ERP requests should not depend on an LLM choosing the right
// function schema.  This small parser covers the report/list requests people
// make most often and always calls the same permission-checked data handlers.
const { executeTool } = require('../../services/aiDataAgentService');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Short 3-letter abbreviations mapped to full month names
const MONTH_ABBR = { jan:'january', feb:'february', mar:'march', apr:'april', may:'may', jun:'june', jul:'july', aug:'august', sep:'september', oct:'october', nov:'november', dec:'december' };

function monthRange(text) {
  const allNames = [...MONTHS, ...Object.keys(MONTH_ABBR)].join('|');
  const match = String(text).match(new RegExp('\\b(' + allNames + ')\\s+(\\d{2}|20\\d{2})\\b', 'i'));
  if (!match) return null;
  const rawName = match[1].toLowerCase();
  const fullName = MONTH_ABBR[rawName] || rawName;
  const month = MONTHS.indexOf(fullName) + 1;
  if (month === 0) return null;
  const rawYear = match[2];
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate: `${year}-${String(month).padStart(2, '0')}-${lastDay}` };
}

function karachiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function relativeDayRange(text) {
  // Matches: yesterday, yday, kal, kl (Roman Urdu for yesterday)
  if (!/\b(?:yesterday|yday|kal|kl)\b/i.test(String(text || ''))) return null;
  const yesterday = new Date(`${karachiToday()}T00:00:00+05:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, '0'), String(yesterday.getDate()).padStart(2, '0')].join('-');
  return { startDate: date, endDate: date };
}

// Parse specific calendar dates in common shorthand formats:
//   "2-07-26", "2/7/26", "02-07-2026", "July 2", "2 July 2026", "2 july"
// Returns a YYYY-MM-DD string or null.
function specificDateFromText(text) {
  const value = String(text || '');

  // Format: D-MM-YY, D/MM/YY, DD-MM-YY, DD/MM/YY, DD-MM-YYYY, DD/MM/YYYY
  const dmyMatch = value.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2}|\d{4})\b/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const rawYear = dmyMatch[3];
    const year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Format: "July 2 2026", "2 July 2026", "2 July 26", "July 2"
  const monthNames = MONTHS.join('|');
  const wordDmy = value.match(new RegExp(
    `\\b(?:(\\d{1,2})\\s+(?:${monthNames})(?:\\s+(\\d{2}|20\\d{2}))?|(?:${monthNames})\\s+(\\d{1,2})(?:\\s+(\\d{2}|20\\d{2}))?)\\b`, 'i'
  ));
  if (wordDmy) {
    let day, monthStr, yearStr;
    if (wordDmy[1]) { day = wordDmy[1]; } // D Month
    if (wordDmy[3]) { day = wordDmy[3]; } // Month D
    if (wordDmy[2]) yearStr = wordDmy[2];
    if (wordDmy[4]) yearStr = wordDmy[4];
    const monthIndex = MONTHS.findIndex(m => new RegExp(`\\b${m}\\b`, 'i').test(value));
    if (monthIndex !== -1 && day) {
      const year = yearStr
        ? (yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10))
        : new Date().getFullYear();
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
  }

  return null;
}

function stockCategoryFromText(text) {
  const match = String(text || '').match(/\b(?:show(?:\s+me)?\s+)?(?:warehouse\s+)?stock(?:\s+in\s+hand|\s+position)?\s+(.+?)\s+categor(?:y|ies)\b/i);
  if (!match) return undefined;
  const value = match[1]
    .replace(/\b(?:show|me|give|download|report|pdf|stock|in|hand|of|for|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || undefined;
}

function branchFromText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const compact = value.match(/\b([a-z]{2,12})\s*[-\s]\s*(\d+)\b/i);
  if (compact && !MONTHS.includes(compact[1].toLowerCase())) return `${compact[1]}-${compact[2]}`.toUpperCase();
  // Do not treat the word after "branch" as a branch name: in "branch wise"
  // it is only a grouping instruction, not a filter.
  const inBranch = value.match(/\b(?:in|for)\s+([a-z][a-z .'-]{2,50}?)(?=\s+(?:branch|employee|staff|sale|sales|payment|report|ki|ke|kay|k)\b|$)/i);
  if (inBranch) return inBranch[1].trim();
  // Also accept normal word order such as "Pakistan Town branch active
  // employee list". Here "branch" labels the preceding branch name.
  const explicitBranch = value.match(/^(?:show(?: me)?\s+)?([a-z][a-z .'-]{2,50}?)\s+branch\b/i);
  if (explicitBranch) return explicitBranch[1].trim();
  // A very common short request is simply "Pakistan Town employee list".
  // The words before employee/staff are the branch in this form.
  const listBranch = value.match(/^([a-z][a-z .'-]{2,50}?)\s+(?:employee|employees|staff)\b/i);
  if (listBranch) {
    const branch = listBranch[1]
      .replace(/^(?:mujhe|mujay|show(?: me)?|list|all|active)\s+/i, '')
      .replace(/\s+(?:ki|ke|kay|k)$/i, '')
      .trim();
    if (branch) return branch;
  }
  const possessive = value.match(/\b([a-z][a-z .'-]{2,50}?)\s+(?:ki|ke|kay|k)\s+(?:employee|employees|staff)\b/i);
  if (possessive) {
    return possessive[1].replace(/^(?:mujhe|mujay|show(?: me)?|please|all|active)\s+/i, '').trim();
  }
  return undefined;
}

function departmentFromText(text) {
  const match = String(text || '').match(/\b([a-z][a-z\s'-]{1,50}?)\s+department\b/i);
  if (!match) return undefined;
  // When a full branch name comes first ("Pakistan Town branch Optics
  // department"), discard everything through the word branch.
  const rawDepartment = match[1].replace(/^.*?\bbranch\b/i, '');
  const department = rawDepartment
    .replace(/\b(?:branch|active|employee|employees|staff|list|show|me|all|in|for)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return department || undefined;
}

function designationFromText(text) {
  const match = String(text || '').match(/\b([a-z][a-z\s'-]{1,50}?)\s+designation\b/i);
  if (!match) return undefined;
  const designation = match[1].split(/\bdepartment\b/i).pop()
    .replace(/\b(?:branch|active|employee|employees|staff|list|show|me|all|in|for|department)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return designation || undefined;
}

function cell(value) { return String(value ?? '-').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' '); }
function money(value) { return Number(value || 0).toLocaleString(); }

function salesByBranch(result) {
  if (!result || !result.rows || !result.rows.length) {
    return 'No warehouse sales were found for the selected period.';
  }
  const branches = result.branches || [];
  if (!branches.length) return 'No branch data found for the selected period.';
  const grand = result.grandTotals || {};

  // Branch-wise sections
  const branchSections = branches.flatMap(branch => {
    const rows  = result.rows.filter(row => Number(row[`${branch} (Sales)`] || 0) || Number(row[`${branch} (Cost)`] || 0));
    const total = result.branchTotals?.[branch] || {};
    return [
      `#### 🏢 ${cell(branch)}`, '',
      '| Category | Sale | Cost | Profit |',
      '|---|---:|---:|---:|',
      ...rows.map(row => `| ${cell(row.category)} | ${money(row[`${branch} (Sales)`])} | ${money(row[`${branch} (Cost)`])} | ${money(row[`${branch} (Profit)`])} |`),
      '', `**${cell(branch)} total:** Sale **${money(total.sales)}** · Cost ${money(total.cost)} · Profit ${money(total.profit)} PKR`, ''
    ];
  });

  // Category-wise summary across all branches
  const categoryTotals = new Map();
  for (const row of result.rows) {
    for (const branch of branches) {
      const s = Number(row[`${branch} (Sales)`] || 0);
      const c = Number(row[`${branch} (Cost)`]  || 0);
      if (!s && !c) continue;
      const entry = categoryTotals.get(row.category) || { sales: 0, cost: 0, profit: 0 };
      entry.sales  += s;
      entry.cost   += c;
      entry.profit += s - c;
      categoryTotals.set(row.category, entry);
    }
  }
  const categorySummary = [
    '### 📊 Category-wise Summary', '',
    '| Category | Total Sale | Total Cost | Profit |',
    '|---|---:|---:|---:|',
    ...[...categoryTotals.entries()]
      .sort((a, b) => b[1].sales - a[1].sales)
      .map(([cat, v]) => `| ${cell(cat)} | ${money(v.sales)} | ${money(v.cost)} | ${money(v.profit)} |`)
  ];

  return [
    '### 📈 Sales Report — Branch-wise, Category-wise', '',
    `_Period: ${result.startDate} to ${result.endDate}_`, '',
    ...branchSections,
    ...categorySummary,
    '',
    '---',
    `**Grand Total Sale: ${money(grand.sales)} PKR**  `,
    `**Grand Total Profit: ${money(grand.profit)} PKR**`
  ].join('\n');
}

function paymentTable(result) {
  if (!result || !result.rows || !result.rows.length) {
    return `No category-wise payments were found for the selected period${result?.startDate ? ` (${result.startDate} to ${result.endDate})` : ''}.`;
  }

  const period = `_Period: ${result.startDate} to ${result.endDate}_`;

  // ── Group by branch ──────────────────────────────────────────────────────
  const branchMap = new Map();
  const categoryMap = new Map();

  for (const row of result.rows) {
    const branch   = row.branch   || 'Unassigned';
    const category = row.category || 'Unknown';
    const sales    = Number(row.sales   || 0);
    const cost     = Number(row.cost    || 0);
    const paid     = Number(row.paid    || 0);
    const balance  = Number(row.balance || 0);

    // Branch grouping
    const bg = branchMap.get(branch) || { branch, rows: [], sales: 0, cost: 0, paid: 0, balance: 0 };
    bg.rows.push(row);
    bg.sales   += sales;
    bg.cost    += cost;
    bg.paid    += paid;
    bg.balance += balance;
    branchMap.set(branch, bg);

    // Category grouping
    const cg = categoryMap.get(category) || { category, sales: 0, cost: 0, paid: 0, balance: 0 };
    cg.sales   += sales;
    cg.cost    += cost;
    cg.paid    += paid;
    cg.balance += balance;
    categoryMap.set(category, cg);
  }

  const grandTotals = result.rows.reduce((t, row) => ({
    sales:   t.sales   + Number(row.sales   || 0),
    cost:    t.cost    + Number(row.cost    || 0),
    paid:    t.paid    + Number(row.paid    || 0),
    balance: t.balance + Number(row.balance || 0)
  }), { sales: 0, cost: 0, paid: 0, balance: 0 });

  // ── Branch-wise sections ──────────────────────────────────────────────────
  const branchSections = [...branchMap.values()]
    .sort((a, b) => b.sales - a.sales || a.branch.localeCompare(b.branch))
    .flatMap(group => [
      `#### 🏢 ${cell(group.branch)}`,
      '',
      '| Category | Sale | Cost | Paid | Balance |',
      '|---|---:|---:|---:|---:|',
      ...group.rows
        .sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
        .map(row => `| ${cell(row.category)} | ${money(row.sales)} | ${money(row.cost)} | ${money(row.paid)} | ${money(row.balance)} |`),
      '',
      `**${cell(group.branch)} total:** Sale **${money(group.sales)}** · Cost ${money(group.cost)} · Paid ${money(group.paid)} · Balance ${money(group.balance)} PKR`,
      ''
    ]);

  // ── Category-wise summary ─────────────────────────────────────────────────
  const categorySections = [
    '### 📊 Category-wise Summary',
    '',
    '| Category | Total Sale | Total Cost | Total Paid | Balance |',
    '|---|---:|---:|---:|---:|',
    ...[...categoryMap.values()]
      .sort((a, b) => b.sales - a.sales)
      .map(c => `| ${cell(c.category)} | ${money(c.sales)} | ${money(c.cost)} | ${money(c.paid)} | ${money(c.balance)} |`)
  ];

  return [
    '### 💳 Payment Report — Branch-wise & Category-wise',
    '',
    period,
    '',
    ...branchSections,
    ...categorySections,
    '',
    '---',
    `**Grand Total Sale: ${money(grandTotals.sales)} PKR**  `,
    `**Grand Total Cost: ${money(grandTotals.cost)} PKR**  `,
    `**Grand Total Paid: ${money(grandTotals.paid)} PKR**  `,
    `**Outstanding Balance: ${money(grandTotals.balance)} PKR**`
  ].join('\n');
}

function employeeList(result, requestedBranch, requestedDepartment, requestedDesignation) {
  const scope = [result.branch || requestedBranch, result.department || requestedDepartment, result.designation || requestedDesignation].filter(Boolean).join(' — ');
  if (!result.employees?.length) return `No active employees were found for ${scope || 'your authorized branches'}.`;
  return [
    `### Active Employees — ${scope || 'All authorized branches'}`, '',
    '| Code | Employee | Branch | Department | Designation |',
    '|---|---|---|---|---|',
    ...result.employees.map(employee => `| ${cell(employee.code)} | ${cell(employee.name)} | ${cell(employee.branch)} | ${cell(employee.department?.name || employee.department)} | ${cell(employee.designation?.name || employee.designation)} |`),
    '', `**Total active employees:** ${result.count}`
  ].join('\n');
}

function formatEmployeeDetail(result) {
  // Handle array result (multiple matches)
  const employees = Array.isArray(result) ? result
    : Array.isArray(result?.employees) ? result.employees
    : result?.found !== false && result?.name ? [result] : [];

  if (!employees.length) {
    return result?.message || 'Employee not found. Please check the name or code and try again.';
  }

  if (employees.length > 1) {
    return [
      `### Multiple Employees Found`,
      '',
      '| Code | Name | Branch | Department |',
      '|---|---|---|---|',
      ...employees.map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} | ${cell(e.department?.name || e.department)} |`),
      '',
      `_${employees.length} employees matched. Please be more specific._`
    ].join('\n');
  }

  const e = employees[0];
  const lines = [
    `### 👤 ${cell(e.name)} (${cell(e.code)})`,
    '',
    `| Field | Value |`,
    `|---|---|`,
    e.branch       ? `| Branch | ${cell(e.branch)} |` : null,
    e.department?.name || e.department ? `| Department | ${cell(e.department?.name || e.department)} |` : null,
    e.designation?.name || e.designation ? `| Designation | ${cell(e.designation?.name || e.designation)} |` : null,
    e.mobileNo     ? `| Mobile | ${cell(e.mobileNo)} |` : null,
    e.cnic         ? `| CNIC | ${cell(e.cnic)} |` : null,
    e.joiningDate  ? `| Joining Date | ${cell(new Date(e.joiningDate).toLocaleDateString('en-PK'))} |` : null,
    e.basicSalary  ? `| Basic Salary | ${Number(e.basicSalary).toLocaleString()} PKR |` : null,
    e.salaryType   ? `| Salary Type | ${cell(e.salaryType)} |` : null,
    e.fDutyTime    ? `| Duty Hours | ${cell(e.fDutyTime)} – ${cell(e.tDutyTime)} |` : null,
    e.isActive !== undefined ? `| Status | ${e.isActive ? '✅ Active' : '❌ Inactive'} |` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

function customerBalancesByCategory(result) {
  if (!result.rows?.length) return 'No customer balances were found for your authorized branches.';
  const sections = result.rows
    .sort((a, b) => String(a.category).localeCompare(String(b.category)))
    .flatMap(group => [
      `#### ${cell(group.category)}`,
      '',
      '| Customer | Balance | Status |',
      '|---|---:|---|',
      ...group.details
        .sort((a, b) => String(a.customer).localeCompare(String(b.customer)))
        .map(customer => `| ${cell(customer.customer)} | ${money(customer.balance)} | ${cell(customer.status)} |`),
      '',
      `**${cell(group.category)} total:** ${money(group.balance)} PKR`,
      ''
    ]);
  return [
    '### Customer Balances — Category-wise',
    '',
    ...sections,
    `**Grand total balance:** ${money(result.totalBalance)} PKR  `,
    `**Customers:** ${Number(result.customerCount || 0).toLocaleString()}`
  ].join('\n');
}

async function tryDeterministicErp(req, message, history, loaded) {
  try {
    return await _tryDeterministicErpInner(req, message, history, loaded);
  } catch (err) {
    console.error('[Deterministic ERP] Unexpected error:', err.message);
    return null; // Fall through to LLM path
  }
}

async function _tryDeterministicErpInner(req, message, history, loaded) {
  const current = String(message || '');
  const previousUser = [...(history || [])].reverse().find(item => item.role === 'user')?.content || '';
  // A reply such as “July 2026” completes the immediately preceding request.
  const text = monthRange(current) && !/\b(sale|sales|payment|employee|staff|report)\b/i.test(current)
    ? `${previousUser} ${current}` : current;
  const hasTool = name => loaded.tools.some(tool => tool.function.name === name);
  const dates = monthRange(text) || relativeDayRange(text) || (/\b(?:today|aaj)\b/i.test(text) ? { startDate: karachiToday(), endDate: karachiToday() } : null);
  const specificDate = specificDateFromText(text);

  // --- Check-in / Check-out / Timing Sheet ---
  // Catches: "3428 check in time today", "bilal pwd-1 check in", "attendance 3428",
  //          "muhammad bilal attendance", "timing sheet ali july", "absent today", "late today"
  // NOTE: hasTool check removed — attendance queries always go direct to DB
  const wantsCheckin = /\bcheck[-\s]?(?:in|out)\b/i.test(text)
    || /\btiming\s*sheet\b/i.test(text)
    || /\bworked\s*hrs?\b/i.test(text)
    || /\battendance\b/i.test(text)
    || /\bhazri\b/i.test(text);
  const wantsAbsent = /\babsent\s*(?:employees?|staff|log|list|today|kal|aaj)?\b/i.test(text) && !/\bno.*check.?in\b/i.test(text);
  const wantsLate   = /\blate\s*(?:employees?|staff|aaj|today)?\b/i.test(text) && /\b(today|aaj)\b/i.test(text);
  const queryDate   = specificDate || (dates ? dates.startDate : karachiToday());

  if (wantsLate) {
    const result = await executeTool(req, 'get_employee_checkin', {
      queryType: 'late', startDate: queryDate, branch: branchFromText(text)
    });
    return { answer: formatCheckinResult(result) };
  }
  if (wantsAbsent) {
    const result = await executeTool(req, 'get_employee_checkin', {
      queryType: 'absent', startDate: queryDate, branch: branchFromText(text)
    });
    return { answer: formatCheckinResult(result) };
  }
  // NOTE: Individual employee check-in queries (wantsCheckin with a name/code)
  // are intentionally NOT handled here. The LLM path handles them — it understands
  // Roman Urdu, mixed languages, branch context, and messy natural language far better
  // than any regex parser. Examples it handles natively:
  //   "muhammad waseem pwd branch k employee ka check in time btao ag ka"
  //   "3428 ki hazri kal ki"
  //   "ali ka aaj check in kab tha"

  // --- Employee detail / info by name or code ---
  // Catches: "tell me about muhammad waseem", "muhammad bilal detail",
  //          "3428 employee info", "bilal pwd-1 info", "who is bilal", "waseem kaun hai"
  const wantsEmpDetail = (
    /\b(?:detail|details|info|information|profile|mulumat|malomat|about|kaun|kon|kaun\s*hai|kon\s*hai|batao|bata)\b/i.test(text)
    || /\btell\s+me\s+about\b/i.test(text)
    || /\bwho\s+is\b/i.test(text)
  )
    && !/\b(?:sale|payment|stock|attendance|hazri|check.?in|department|branch\s*wise)\b/i.test(text);

  if (wantsEmpDetail) {
    const codeMatch = text.match(/\b(\d{3,6})\b/);
    let search = null;
    if (codeMatch) {
      search = codeMatch[1];
    } else {
      const stopWords = /\b(tell|me|about|who|is|detail|details|info|information|profile|employee|emp|staff|show|ki|ka|ke|ko|mulumat|malomat|batao|bata|kaun|kon|hai|hain|branch|pwd|check|attendance|hazri|k\s*employee|ka\s*employee|mujay|mujhe|please)\b/gi;
      const cleaned = text.replace(stopWords, ' ').replace(/\s+/g, ' ').trim();
      const words = cleaned.split(' ').filter(w => w.length >= 2 && /^[a-z]+$/i.test(w));
      if (words.length >= 1) search = words.slice(0, 4).join(' ');
    }
    if (search && search.trim().length >= 3) {
      const result = await executeTool(req, 'get_employee_information', {
        search: search.trim(),
        branch: branchFromText(text)
      });
      if (result && (result.found !== false || (Array.isArray(result.employees) && result.employees.length))) {
        return { answer: formatEmployeeDetail(result) };
      }
      return { answer: `"${search.trim()}" naam ka koi employee nahi mila. Sahi naam ya employee code batayein.` };
    }
  }

  // --- Department-Wise Sale Report (MUST run before category-wise routes) ---
  // "department" / "dept" refer to closing-sheet department counters — NOT warehouse categories.
  // Catches: "department wise sale PWD-1 july", "dept wise sale july 2026",
  //          "difference wise sale", "PWD-1 department sale july"
  const wantsDeptWiseSale = hasTool('get_dept_wise_sale_report') && (
    /\bdept(?:artment)?[-\s]?wise\b/i.test(text) ||
    /\bdiff(?:erence)?[-\s]?wise\b/i.test(text) ||
    (/\bdept(?:artment)?\b/i.test(text) && /\bsales?\b/i.test(text))
  );
  if (wantsDeptWiseSale && dates) {
    const result = await executeTool(req, 'get_dept_wise_sale_report', {
      ...dates,
      branch: branchFromText(text),
      department: departmentFromText(text)
    });
    return { answer: formatDeptWiseSaleReport(result) };
  }

  // People frequently type category as "catagoiry", "categry", etc. Treat
  // those common phonetic spellings as the same grouping instruction so the
  // request stays on the trusted report path instead of falling back to an
  // LLM that can misread the period or claim the data is unavailable.
  // Explicitly exclude dept/department so those never hit the warehouse sale route.
  const wantsBranchCategory = /\bbranch(?:es)?[-\s]?wise\b/i.test(text)
    && /\b(?:category|categories|categor\w*|catag\w*)\b/i.test(text)
    && !/\bdept(?:artment)?\b/i.test(text);
  const wantsCategoryWise = /\b(?:category|categories|categor\w*|catag\w*)[-\s]?wise\b/i.test(text)
    && !/\bdept(?:artment)?\b/i.test(text);
  // Roman Urdu: "category wise sale kal", "kal ki category wise sale"
  const wantsSale = /\bsales?\b/i.test(text) || /\bsale\s*ki\b/i.test(text) || /\bsale\s*report\b/i.test(text) || /\bki\s*sale\b/i.test(text);

  if (dates && wantsBranchCategory && /\bpayment\b/i.test(text) && true) {
    const result = await executeTool(req, 'get_payment_report', { ...dates, branch: branchFromText(text), limit: 200 });
    return { answer: paymentTable(result) };
  }
  // “Payment report July 2026” should be just as reliable as the longer
  // branch/category-wise phrasing. The formatter already groups every row by
  // branch and category, so no additional wording is needed from the user.
  if (dates && /\bpayment\b/i.test(text) && true) {
    const result = await executeTool(req, 'get_payment_report', { ...dates, branch: branchFromText(text), limit: 200 });
    return { answer: paymentTable(result) };
  }
  if (dates && wantsBranchCategory && wantsSale && true) {
    const result = await executeTool(req, 'get_sales_department_report', { ...dates, branch: branchFromText(text), pivotBy: 'branch' });
    return { answer: salesByBranch(result) };
  }
  // A category-wise sales request is an all-branches report unless the user
  // explicitly names a branch. Keep it on the deterministic route so an LLM
  // cannot accidentally select the warehouse-customer-sales tool or omit
  // branches from the result.
  if (dates && wantsCategoryWise && wantsSale && !/\bpayment\b/i.test(text) && true) {
    const result = await executeTool(req, 'get_sales_department_report', { ...dates, branch: branchFromText(text), pivotBy: 'branch' });
    return { answer: salesByBranch(result) };
  }
  // Plain sale request with any date: "yesterday sale", "kal sale", "kal ki sale",
  // "today sale", "sale july 2026", "aaj ki sale" — always returns branch+category report.
  if (dates && wantsSale && !/\bpayment\b/i.test(text) && true) {
    const result = await executeTool(req, 'get_sales_department_report', { ...dates, branch: branchFromText(text), pivotBy: 'branch' });
    return { answer: salesByBranch(result) };
  }
  // Customer-balance requests default to the useful category layout: every
  // customer in a category, then that category's total. “Category-wise” is
  // optional wording, not a required command.
  if (/\bcustomer(?:s)?\b[\s\S]{0,80}\bbal(?:ance|ances)?\b|\bbal(?:ance|ances)?\b[\s\S]{0,80}\bcustomer(?:s)?\b/i.test(text)
    && hasTool('get_wh_customer_balance_report')) {
    const result = await executeTool(req, 'get_wh_customer_balance_report', {
      branch: branchFromText(text), groupBy: 'category'
    });
    return { answer: customerBalancesByCategory(result) };
  }
  if (/\b(?:warehouse\s+)?stock(?:\s+in\s+hand|\s+position)?\b/i.test(text)
    && /\b(?:report|pdf|download|category|categories|categor\w*|catag\w*)\b/i.test(text)) {
    const category = stockCategoryFromText(text);
    return {
      answer: category
        ? `Your ${category} category stock-in-hand PDF is ready to download.`
        : 'Your category-wise stock-in-hand PDF is ready to download.',
      downloadUrl: `/api/v1/ai/reports/wh-stock-in-hand.pdf${category ? `?category=${encodeURIComponent(category)}` : ''}`
    };
  }

  // --- PDF request for sale/payment report ---
  // "pdf do", "pdf chahiye", "give me pdf", "download report"
  const wantsPdf = /\b(?:pdf|download|print)\b/i.test(text) || /\bpdf\s*(?:do|dena|chahiye|de|send)\b/i.test(text);
  if (wantsPdf && dates && /\bpayment\b/i.test(text)) {
    const result = await executeTool(req, 'get_payment_report', { ...dates, branch: branchFromText(text), limit: 500 });
    const answer  = paymentTable(result);
    return { answer, downloadUrl: null }; // Frontend renders markdown as PDF via html2pdf
  }
  if (wantsPdf && dates && wantsSale) {
    const result = await executeTool(req, 'get_sales_department_report', { ...dates, branch: branchFromText(text), pivotBy: 'branch' });
    const answer  = salesByBranch(result);
    return { answer, downloadUrl: null };
  }
  if (wantsPdf && /\bstock\b/i.test(text)) {
    const category = stockCategoryFromText(text);
    return {
      answer: 'Your stock-in-hand PDF is ready.',
      downloadUrl: `/api/v1/ai/reports/wh-stock-in-hand.pdf${category ? `?category=${encodeURIComponent(category)}` : ''}`
    };
  }

  // --- Salary slip ---
  // "salary slip bilal", "3428 salary slip june 2026", "slip do june 26"
  const wantsSlip = /\bsalary\s*slip\b/i.test(text) || /\bslip\b/i.test(text) || /\btankhwa\s*slip\b/i.test(text);
  if (wantsSlip) {
    const codeMatch = text.match(/\b(\d{3,6})\b/);
    const nameMatch = text.match(/\b(?:slip\s+(?:for\s+)?)?([a-z][a-z\s]{2,30}?)(?=\s+(?:slip|salary|june|july|aug|sep|jan|feb|mar|apr|may|oct|nov|dec|\d{4}|$))/i);
    const search    = codeMatch ? codeMatch[1] : (nameMatch ? nameMatch[1].replace(/\b(?:slip|salary|tankhwa|show|me|ki|ka)\b/gi, ' ').trim() : null);
    const month     = dates ? `${new Date(dates.startDate).toLocaleString('en', { month: 'long' })} ${new Date(dates.startDate).getFullYear()}` : null;
    if (search) {
      const result = await executeTool(req, 'get_salary_slip', { search, monthYear: month });
      return { answer: formatSlipResult(result), downloadUrl: result?.slips?.[0]?.downloadUrl || null };
    }
  }

  // --- Employee list (all active) ---
  if (/\b(employee|employees|staff)\b/i.test(text) && /\b(list|show|all|active|sab)\b/i.test(text)) {
    const branch     = branchFromText(text);
    const department = departmentFromText(text);
    const designation = designationFromText(text);
    const result     = await executeTool(req, 'get_employee_information', { search: 'all active employees', status: 'active', all: true, branch, department, designation, limit: 1000 });
    return { answer: employeeList(result, branch, department, designation) };
  }

  // --- Daily Closing Sheet Summary Message ---
  const wantsDailySummary = /\b(?:closing\s*sheet|daily\s*sale|sale\s*msg|sale\s*message|cash\s*activity|bank\s*activity|income\s*statement|zakat|dept.*sale.*activity|daily.*msg|msg|message)\b/i.test(text);
  if (wantsDailySummary && specificDate) {
    const result = await executeTool(req, 'get_closing_sheet_daily_summary', { date: specificDate, branch: branchFromText(text) });
    return { answer: formatDailyClosingSheetSummary(result) };
  }
  if (wantsDailySummary && /\btoday\b|\baaj\b/i.test(text)) {
    const result = await executeTool(req, 'get_closing_sheet_daily_summary', { date: karachiToday(), branch: branchFromText(text) });
    return { answer: formatDailyClosingSheetSummary(result) };
  }
  if (wantsDailySummary && /\bkal\b|\byesterday\b/i.test(text)) {
    const y = new Date(`${karachiToday()}T00:00:00+05:00`);
    y.setDate(y.getDate() - 1);
    const yDate = [y.getFullYear(), String(y.getMonth() + 1).padStart(2, '0'), String(y.getDate()).padStart(2, '0')].join('-');
    const result = await executeTool(req, 'get_closing_sheet_daily_summary', { date: yDate, branch: branchFromText(text) });
    return { answer: formatDailyClosingSheetSummary(result) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatter: Department-Wise Sale Report
// ---------------------------------------------------------------------------
function formatDeptWiseSaleReport(result) {
  if (!result.rows || !result.rows.length) {
    return `No department-wise sale data found for the period ${result.startDate} to ${result.endDate}${result.branch !== 'All authorized branches' ? ` — ${result.branch}` : ''}.`;
  }

  const cell = v => String(v ?? '-').replace(/\|/g, '\\|');
  const money = v => Number(v || 0).toLocaleString();

  // Group rows by branch
  const branchMap = new Map();
  for (const row of result.rows) {
    const b = row.branch || 'Unassigned';
    if (!branchMap.has(b)) branchMap.set(b, []);
    branchMap.get(b).push(row);
  }

  const sections = [...branchMap.entries()].flatMap(([branch, rows]) => {
    const branchTotalSale = rows.reduce((s, r) => s + Number(r.totalSale || 0), 0);
    const branchTotalBatch = rows.reduce((s, r) => s + Number(r.batchAmount || 0), 0);
    const branchDiff = rows.reduce((s, r) => s + Number(r.difference || 0), 0);
    const branchComm = rows.reduce((s, r) => s + Number(r.commission || 0), 0);
    return [
      `#### ${cell(branch)}`, '',
      '| Department | Batch Amount | Total Sale | Commission | Difference | Disc% |',
      '|---|---:|---:|---:|---:|---:|',
      ...rows.map(r => `| ${cell(r.department)} | ${money(r.batchAmount)} | ${money(r.totalSale)} | ${money(r.commission)} | ${money(r.difference)} | ${Number(r.discountPer || 0).toFixed(2)}% |`),
      '',
      `**${cell(branch)} total:** Sale ${money(branchTotalSale)} PKR · Batch ${money(branchTotalBatch)} PKR · Commission ${money(branchComm)} PKR · Diff ${money(branchDiff)} PKR`,
      ''
    ];
  });

  const t = result.totals || {};
  return [
    `### Department-Wise Sale Report`, '',
    `_Period: ${result.startDate} to ${result.endDate}_`,
    result.department !== 'All departments' ? `_Department: ${result.department}_` : '',
    result.branch !== 'All authorized branches' ? `_Branch: ${result.branch}_` : '',
    '',
    ...sections,
    `**Grand Total Sale:** ${money(t.totalSale)} PKR  `,
    `**Grand Batch Amount:** ${money(t.batchAmount)} PKR  `,
    `**Grand Commission:** ${money(t.commission)} PKR  `,
    `**Grand Difference:** ${money(t.difference)} PKR  `,
    `**Grand Discount Value:** ${money(t.discountValue)} PKR`
  ].filter(line => line !== null && line !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// Formatter: Daily Closing Sheet Summary
// ---------------------------------------------------------------------------
function formatDailyClosingSheetSummary(result) {
  if (!result.found) return result.message || 'No closing sheet data found for this date.';

  const money = v => Number(v || 0).toLocaleString();
  const cell = v => String(v ?? '-').replace(/\|/g, '\\|');

  const lines = [
    `## 📋 Daily Sale Summary — ${result.date}`,
    result.branch !== 'All authorized' ? `_Branch: ${result.branch}_` : '_All authorized branches_',
    ''
  ];

  // Cash Activity
  lines.push('### 💵 Cash Activity');
  if (result.cashActivity?.byBranch?.length) {
    lines.push('| Branch | Cash Sales |', '|---|---:|');
    for (const b of result.cashActivity.byBranch) {
      lines.push(`| ${cell(b.branch)} | ${money(b.total)} PKR |`);
    }
  }
  lines.push(`**Total Cash Sale: ${money(result.cashActivity?.totalSale)} PKR**`, '');

  // Bank Activity
  lines.push('### 🏦 Bank Activity');
  if (result.bankActivity?.byBranch?.length) {
    lines.push('| Branch | Bank Sales |', '|---|---:|');
    for (const b of result.bankActivity.byBranch) {
      lines.push(`| ${cell(b.branch)} | ${money(b.total)} PKR |`);
    }
  }
  lines.push(`**Total Bank Sale: ${money(result.bankActivity?.totalSale)} PKR**`, '');

  // Income Statement
  const income = result.incomeStatement || {};
  lines.push('### 📊 Income Statement');
  if (income.expenses?.length) {
    lines.push('**Expenses:**', '| Branch | Description | Amount |', '|---|---|---:|');
    for (const e of income.expenses) {
      lines.push(`| ${cell(e.branch)} | ${cell(e.description || e.head || 'Expense')} | ${money(e.amount)} PKR |`);
    }
  }
  if (income.receipts?.length) {
    lines.push('', '**Receipts:**', '| Branch | Description | Amount |', '|---|---|---:|');
    for (const r of income.receipts) {
      lines.push(`| ${cell(r.branch)} | ${cell(r.description || 'Receipt')} | ${money(r.amount)} PKR |`);
    }
  }
  lines.push(
    `**Total Expenses: ${money(income.totalExpenses)} PKR**  `,
    `**Total Receipts: ${money(income.totalReceipts)} PKR**  `,
    `**Net Income: ${money(income.netIncome)} PKR**`,
    ''
  );

  // Zakat
  const zakat = result.zakat || {};
  if (zakat.records?.length) {
    lines.push('### 🌙 Zakat');
    lines.push('| Branch | Type | Amount | Remarks |', '|---|---|---:|---|');
    for (const z of zakat.records) {
      lines.push(`| ${cell(z.branch)} | ${cell(z.type)} | ${money(z.amount)} PKR | ${cell(z.remarks)} |`);
    }
    lines.push(`**Total Pay: ${money(zakat.totalPay)} PKR · Total Receive: ${money(zakat.totalReceive)} PKR**`, '');
  }

  // Department-Wise Sale Activity
  const deptActivity = result.departmentActivity || {};
  if (deptActivity.rows?.length) {
    lines.push('### 🏪 Department-Wise Sale Activity');
    lines.push('| Branch | Department | Batch Amount | Total Sale | Commission | Difference |', '|---|---|---:|---:|---:|---:|');
    for (const d of deptActivity.rows) {
      lines.push(`| ${cell(d.branch)} | ${cell(d.department)} | ${money(d.batchAmount)} | ${money(d.totalSale)} | ${money(d.commission)} | ${money(d.difference)} |`);
    }
    lines.push(`**Total Dept Sale: ${money(deptActivity.totalSale)} PKR**`, '');
  }

  // Closing01 summary
  if (result.closing01Summary?.length) {
    lines.push('### 📁 Closing Sheet Summary (Closing 01)');
    lines.push('| Branch | Opening Cash | Received Cash | Counter Total | Grand Total |', '|---|---:|---:|---:|---:|');
    for (const s of result.closing01Summary) {
      lines.push(`| ${cell(s.branch)} | ${money(s.openingCash)} | ${money(s.receivedCash)} | ${money(s.counterCashTotal)} | ${money(s.grandTotal)} |`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatter: Employee Check-in / Timing Sheet
// ---------------------------------------------------------------------------
function formatCheckinResult(result) {
  const money = v => Number(v || 0).toLocaleString();
  const cell = v => String(v ?? '-').replace(/\|/g, '\\|');

  if (result.queryType === 'late') {
    if (!result.employees?.length) return `No late employees found for ${result.date}${result.branch !== 'all' ? ` — ${result.branch}` : ''}.`;
    return [
      `### 🕐 Late Employees — ${result.date}`,
      result.branch !== 'all' ? `_Branch: ${result.branch}_` : '',
      '',
      '| Code | Name | Branch | Scheduled | Check-In |',
      '|---|---|---|---|---|',
      ...result.employees.map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} | ${cell(e.scheduledStart)} | **${cell(e.checkIn)}** |`),
      '', `**Total late: ${result.count}**`
    ].filter(Boolean).join('\n');
  }

  if (result.queryType === 'absent') {
    if (!result.employees?.length) return `No absent employees found for ${result.date}${result.branch !== 'all' ? ` — ${result.branch}` : ''}.`;
    return [
      `### ❌ Absent Employees — ${result.date}`,
      result.branch !== 'all' ? `_Branch: ${result.branch}_` : '',
      '',
      '| Code | Name | Branch | Department |',
      '|---|---|---|---|',
      ...result.employees.map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} | ${cell(e.department)} |`),
      '', `**Total absent: ${result.count}**`
    ].filter(Boolean).join('\n');
  }

  if (!result.found) return result.message || 'Employee not found.';

  // Multiple employees matched the search — ask user to specify
  if (result.multipleMatches) {
    return [
      `### Multiple Employees Found`,
      '',
      result.message || 'Please specify which employee you mean:',
      '',
      '| Code | Name | Branch |',
      '|---|---|---|',
      ...result.employees.map(e => `| ${cell(e.code)} | ${cell(e.name)} | ${cell(e.branch)} |`),
      '',
      `_${result.employees.length} employees matched. Please provide the employee code or full name to get the check-in details._`
    ].join('\n');
  }

  if (result.queryType === 'single') {
    const row = result.rows?.[0];
    if (!row) return `No attendance record found for **${result.employee}** on ${result.startDate}.`;
    return [
      `### 👤 ${result.employee} (${result.code}) — ${result.startDate}`,
      `_Branch: ${result.branch} · Scheduled Start: ${result.scheduledStart}_`,
      '',
      `| Status | Check-In | Check-Out | Worked Hrs |`,
      `|---|---|---|---|`,
      `| **${cell(row.status)}** | **${cell(row.checkIn)}** | ${cell(row.checkOut)} | ${cell(row.workedHrs)} |`,
      row.remarks ? `\n_Remarks: ${cell(row.remarks)}_` : ''
    ].filter(Boolean).join('\n');
  }

  // Range / timing sheet
  if (!result.rows?.length) return `No attendance records found for **${result.employee}** from ${result.startDate} to ${result.endDate}.`;
  return [
    `### 📋 Timing Sheet — ${result.employee} (${result.code})`,
    `_${result.startDate} to ${result.endDate} · Branch: ${result.branch} · Scheduled: ${result.scheduledStart}_`,
    '',
    '| Date | Status | Check-In | Check-Out | Worked Hrs |',
    '|---|---|---|---|---|',
    ...result.rows.map(r => `| ${cell(r.date)} | ${cell(r.status)} | ${cell(r.checkIn)} | ${cell(r.checkOut)} | ${cell(r.workedHrs)} |`),
    '',
    `**Present: ${result.presentDays} · Absent: ${result.absentDays} · Total Days: ${result.totalDays}**`
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Formatter: Salary Slip
// ---------------------------------------------------------------------------
function formatSlipResult(result) {
  if (!result) return 'Salary slip not found.';
  if (result.found === false) return result.message || 'Salary slip not found.';
  const slips = result.slips || [];
  if (!slips.length) return result.message || 'No salary slip found for this period.';
  if (slips.length === 1) {
    const s = slips[0];
    return [
      `### 📄 Salary Slip — ${cell(s.employeeName || s.employeeCode)}`,
      `_Month: ${cell(s.monthYear)} · Branch: ${cell(s.branch || 'N/A')}_`,
      '',
      `**Net Salary: ${Number(s.netSalary || s.netTotal || 0).toLocaleString()} PKR**`,
      '',
      '_PDF is ready to download._'
    ].join('\n');
  }
  return [
    `### Salary Slips Found (${slips.length})`,
    '',
    '| Employee | Month | Branch | Net Salary |',
    '|---|---|---|---:|',
    ...slips.map(s => `| ${cell(s.employeeName || s.employeeCode)} | ${cell(s.monthYear)} | ${cell(s.branch || '')} | ${Number(s.netSalary || s.netTotal || 0).toLocaleString()} PKR |`)
  ].join('\n');
}

module.exports = { tryDeterministicErp, monthRange, relativeDayRange, stockCategoryFromText, branchFromText, departmentFromText, designationFromText, specificDateFromText };
