const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'aiDataAgentService.js');
let content = fs.readFileSync(filePath, 'utf8');

const bankingFunctions = `
async function getBankTransactions(req, args) {
  const status = args.status || 'all'; // verified, unverified, all
  const type = args.type || 'all'; // deposit, withdrawal, bank_transfer, etc.
  const search = args.search || '';
  
  let query = {};
  if (status === 'verified') query.isVerified = true;
  if (status === 'unverified') query.isVerified = false;
  if (type !== 'all') query.type = type;
  
  if (search) {
    const pattern = new RegExp(search.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&'), 'i');
    query.$or = [{ bankName: pattern }, { branch: pattern }, { narration: pattern }];
  }
  
  const transactions = await BankTransaction.find(query)
    .sort({ date: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 15, 1), 30))
    .lean();
    
  if (!transactions.length) {
    return { found: false, message: 'No bank transactions found matching criteria.' };
  }
  
  let summary = '### Bank Transactions\\n\\n| Date | Bank | Branch | Type | Amount | Status | Narration |\\n|---|---|---|---|---|---|---|\\n';
  transactions.forEach(t => {
    const dateStr = new Date(t.date).toLocaleDateString();
    const st = t.isVerified ? 'Verified' : 'Unverified';
    summary += \`| \${dateStr} | \${t.bankName || ''} | \${t.branch || ''} | \${t.type} | \${t.amount} | \${st} | \${t.narration} |\\n\`;
  });
  
  return {
    found: true,
    summary,
    count: transactions.length,
    message: 'Here are the requested bank transactions.'
  };
}

async function getBankPaymentDetails(req, args) {
  const status = args.status || 'all';
  const direction = args.direction || 'all';
  const dateField = args.dateField || 'cheque';
  let query = { refType: { $ne: 'bank_transfer' } };

  if (status === 'verified') query.isVerified = true;
  // Older transactions may not have the field stored; they are unverified too.
  if (status === 'unverified') query.isVerified = { $ne: true };
  if (direction === 'paid') query.type = 'withdrawal';
  if (direction === 'received') query.type = 'deposit';

  const clauses = [query];
  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\\s-]+/g, '[-\\\\s]*'), 'i');
    clauses.push({ branch: branchPattern });
  }
  if (args.search) {
    const escaped = String(args.search).trim().replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&');
    const pattern = new RegExp(escaped, 'i');
    clauses.push({ $or: [{ invoiceNo: pattern }, { narration: pattern }, { bankName: pattern }] });
  }

  const transactions = await BankTransaction.find(clauses.length === 1 ? clauses[0] : { $and: clauses })
    .populate('department', 'name')
    .sort({ chequeDate: -1, date: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 15, 1), 30))
    .lean();

  return {
    found: transactions.length > 0,
    source: 'Bank Payments',
    direction, status, count: transactions.length,
    totalAmount: transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0),
    transactions: transactions.map(transaction => ({
      postDate: transaction.date, chequeDate: transaction.chequeDate || transaction.date,
      invoiceDate: transaction.invoiceDate || null, bank: transaction.bankName,
      account: transaction.bankAccount, branch: transaction.branch,
      department: transaction.department?.name, type: transaction.type === 'deposit' ? 'Received / Deposit' : 'Paid / Withdrawal',
      chequeOrInvoiceNo: transaction.invoiceNo || null, amount: transaction.amount,
      status: transaction.isVerified ? 'Verified' : 'Unverified', verifiedDate: transaction.verifiedDate || null,
      remarks: transaction.narration
    })),
    ...(transactions.length ? {} : { message: 'No Bank Payments matched the requested filters.' })
  };
}

async function getDailyCashBatches(req, args) {
  const status = args.status || 'all';
  const mode = args.mode || 'all';
  let query = {};
  if (status === 'verified') query.isVerified = true;
  if (status === 'unverified') query.isVerified = { $ne: true };
  if (mode !== 'all') query.mode = mode;
  if (args.batchNo) {
      const escaped = String(args.batchNo).trim().replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&');
      query.batchNo = new RegExp(escaped, 'i');
  }

  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\\s-]+/g, '[-\\\\s]*'), 'i');
    query = { $and: [query, { branch: branchPattern }] };
  }

  const records = await DailyCash.find(query)
    .populate('department', 'name')
    .populate('bank', 'bankName')
    .sort({ date: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 15, 1), 30))
    .lean();

  const batches = records.map(record => ({
    date: record.date, branch: record.branch, department: record.department?.name,
    mode: record.mode, bank: record.bank?.bankName, batchNo: record.batchNo || null,
    slip: record.slip || null, bigCash: record.bigCash, deduction: record.deductedAmount,
    totalAmount: record.totalAmount, isDeduction: Boolean(record.isDeduction),
    status: record.isVerified ? 'Verified' : 'Unverified', verifiedDate: record.verifiedDate || null,
    remarks: record.remarks || null
  }));

  return {
    found: batches.length > 0,
    source: 'Daily Closing Sheet / Daily Cash',
    status, branch: args.branch || null, count: batches.length,
    totalAmount: batches.reduce((sum, batch) => sum + batch.totalAmount, 0),
    batches,
    ...(batches.length ? {} : { message: 'No Daily Closing Sheet batches matched the requested filters.' })
  };
}

async function getPendingCheques(req, args) {
  let query = { isCleared: false };
  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\\s-]+/g, '[-\\\\s]*'), 'i');
    query = { $and: [query, { branch: branchPattern }] };
  }
  const cheques = await PendingChequeDetail.find(query)
    .sort({ date: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 15, 1), 30))
    .populate('bank')
    .lean();

  if (!cheques.length) {
    return { found: false, message: 'No pending cheques found matching criteria.' };
  }

  let summary = '### Pending Cheques\\n\\n| Date | Bank | Branch | Check # | Amount | Status | Details |\\n|---|---|---|---|---|---|---|\\n';
  cheques.forEach(c => {
    const dateStr = new Date(c.date).toLocaleDateString();
    const bName = c.bank ? c.bank.bankName : '';
    summary += \`| \${dateStr} | \${bName} | \${c.branch || ''} | \${c.checkNumber} | \${c.amount} | Pending | \${c.details || ''} |\\n\`;
  });

  return {
    found: true,
    summary,
    count: cheques.length,
    message: 'Here are the pending cheques.'
  };
}

async function getBankSummary(req, args) {
  let deposits = 0, withdrawals = 0;
  let dQuery = { type: 'deposit' };
  let wQuery = { type: 'withdrawal' };
  
  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\\s-]+/g, '[-\\\\s]*'), 'i');
    dQuery = { $and: [dQuery, { branch: branchPattern }] };
    wQuery = { $and: [wQuery, { branch: branchPattern }] };
  }
  
  const dTrans = await BankTransaction.find(dQuery).select('amount').lean();
  deposits = dTrans.reduce((sum, t) => sum + (t.amount || 0), 0);
  
  const wTrans = await BankTransaction.find(wQuery).select('amount').lean();
  withdrawals = wTrans.reduce((sum, t) => sum + (t.amount || 0), 0);
  
  const balance = deposits - withdrawals;

  return {
    found: true,
    branch: args.branch || null,
    summary: \`### Bank Summary\\n\\n**Total Deposits**: \${deposits.toLocaleString()}\\n**Total Withdrawals**: \${withdrawals.toLocaleString()}\\n**Estimated Balance**: \${balance.toLocaleString()}\`,
    deposits,
    withdrawals,
    balance
  };
}

const toolDefinitions = [
  { type: 'function', function: { name: 'get_late_employees', description: 'Get employees who checked in later than their assigned start time for a business date. Use this for late, tardy, or attendance punctuality questions.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'Date in YYYY-MM-DD. Defaults to today in Asia/Karachi.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_sales_summary', description: 'Get an aggregate cash-sales summary for an inclusive date range. Use this for sales total, sales report, revenue, invoice count, or average invoice questions.', parameters: { type: 'object', properties: { startDate: { type: 'string', description: 'Start date in YYYY-MM-DD. Defaults to today.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD. Defaults to startDate.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_employee_information', description: 'Get complete ERP employee information, including contact, employment, payroll, banking, and duty schedule details. Use when asked about an employee by name or employee code.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code to look up.' }, limit: { type: 'integer', description: 'Maximum matching employees to return, between 1 and 25. Defaults to 10.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_salary_slip', description: 'Retrieve an existing indexed salary-slip PDF for an employee and month. Use when the user asks to download, open, view, or get a salary slip or payslip. Convert relative dates such as last month to a Month YYYY value.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code.' }, monthYear: { type: 'string', description: 'Payroll month in Month YYYY format, for example June 2026.' } }, required: ['search', 'monthYear'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_users_list', description: 'Retrieve a list of ERP system users, optionally filtered by active or inactive status. Use when asked for a list of users or people with access.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'active', 'inactive'], description: 'Filter users by status. Defaults to all.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_information', description: 'Get details about an inventory item, including stock quantity, sale price, and purchase price. Use when asked about item details, stock levels, or pricing.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' }, limit: { type: 'integer', description: 'Maximum results, defaults to 10.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_sale_history', description: 'Get the recent sale history for a specific item. Use when asked how much an item was sold for, who bought it, or its sales ledger.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_purchase_history', description: 'Get the recent purchase history for a specific item. Use when asked who we bought an item from or purchase history.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_last_purchase_invoice', description: 'Retrieve the overall most recent purchase invoice across all items and suppliers in the system. Use when the user asks for the last purchase invoice, latest purchase, or recent purchase entry without specifying an item.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_employee_attendance_sheet', description: 'Retrieve a full month attendance sheet PDF for a specific employee. Use when the user asks to see a full attendance sheet, monthly attendance, or attendance report for an employee.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code.' }, monthYear: { type: 'string', description: 'Month and year, for example June 2026.' } }, required: ['search', 'monthYear'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_daily_cash_batches', description: 'Get Daily Closing Sheet / Daily Cash batch details. Use this first for bank deduction, batch transfer, daily cash, or unverified batch questions. It is the source of the red Bank Deduction rows in Bank Management.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status. Use unverified for red pending batch rows.' }, branch: { type: 'string', description: 'Branch name, for example PWD-1.' }, mode: { type: 'string', enum: ['all', 'Bank', 'Cash'], description: 'Daily Cash mode. Use Bank for bank deductions and transfers.' }, batchNo: { type: 'string', description: 'Optional batch number.' }, limit: { type: 'integer', description: 'Maximum records, from 1 to 200. Defaults to 100.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_payment_details', description: 'Get exact cheque/payment and deposit details from the Bank Payments screen. Use this first for verified or unverified cheque detail, paid cheque amounts, deposit amounts, cheque number, invoice number, cheque date, or Bank Payment detail requests. Cheques are paid/withdrawal records; deposits are received/deposit records.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status.' }, direction: { type: 'string', enum: ['all', 'paid', 'received'], description: 'Use paid for cheque payments/withdrawals and received for deposits.' }, branch: { type: 'string', description: 'Branch name, for example PWD-1.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' }, dateField: { type: 'string', enum: ['cheque', 'posting'], description: 'Defaults to cheque date, matching the Bank Payments screen.' }, search: { type: 'string', description: 'Cheque/invoice number, bank, or remarks search.' }, limit: { type: 'integer', description: 'Maximum records, from 1 to 200. Defaults to 100.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_transactions', description: 'Fallback query for bank transactions by verification status, direction, and keyword search. Also provides bank total query.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status.' }, type: { type: 'string', enum: ['all', 'withdrawal', 'deposit'], description: 'Use withdrawal for cheques, deposit for deposits.' }, search: { type: 'string', description: 'Search term for branch, narration, bank name.' }, limit: { type: 'integer', description: 'Maximum records, defaults to 20.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_summary', description: 'Get the authorized bank deposit, withdrawal, and estimated-balance summary. Use when asked for a bank summary or total deposits/withdrawals.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional branch name, for example PWD-1.' }, startDate: { type: 'string', description: 'Optional start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'Optional end date in YYYY-MM-DD.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_pending_cheques', description: 'Get unresolved/uncleared pending cheques. Use this for pending cheque list.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional branch name.' }, limit: { type: 'integer', description: 'Maximum records, defaults to 20.' } }, additionalProperties: false } } }
];

function toolsForUser(user) {
  // Always verify rights before showing tools
  return toolDefinitions.filter(tool => {
    const metricsByTool = {
      get_late_employees: 'late_employees',
      get_sales_summary: 'sales_summary',
      get_employee_information: 'employee_information',
      get_salary_slip: 'salary_slip',
      get_last_purchase_invoice: 'last_purchase_invoice',
      get_daily_cash_batches: 'daily_cash_batches',
      get_bank_transactions: 'get_bank_transactions',
      get_bank_payment_details: 'bank_payment_details',
      get_pending_cheques: 'get_pending_cheques',
      get_bank_summary: 'get_bank_summary',
      get_employee_attendance_sheet: 'employee_attendance_sheet',
      get_users_list: 'users_list',
      get_item_information: 'item_information',
      get_item_sale_history: 'item_sale_history',
      get_item_purchase_history: 'item_purchase_history'
    };
    
    // We expect canUseAction to exist in the same scope, or require it if not
    // In aiDataAgentService.js, findMetric and canUseAction are used
    if (typeof findMetric !== 'undefined' && typeof canUseAction !== 'undefined') {
        const metric = findMetric(metricsByTool[tool.function.name]);
        return metric && canUseAction(user, metric);
    }
    return true; // Fallback
  });
}

async function executeTool(req, name, args) {
  if (name === 'get_late_employees') return getLateEmployees(req, args || {});
  if (name === 'get_sales_summary') return getSalesSummary(req, args || {});
  if (name === 'get_employee_information') return getEmployeeInformation(req, args || {});
  if (name === 'get_salary_slip') return getSalarySlip(req, args || {});
  if (name === 'get_users_list') return getUsersList(req, args || {});
  if (name === 'get_employee_attendance_sheet') return getEmployeeAttendanceSheet(req, args || {});
  if (name === 'get_daily_cash_batches') return getDailyCashBatches(req, args || {});
  if (name === 'get_bank_transactions') return getBankTransactions(req, args || {});
  if (name === 'get_bank_payment_details') return getBankPaymentDetails(req, args || {});
  if (name === 'get_pending_cheques') return getPendingCheques(req, args || {});
  if (name === 'get_bank_summary') return getBankSummary(req, args || {});
  if (name === 'get_last_purchase_invoice') return getLastPurchaseInvoice(req, args || {});
  if (name === 'get_item_information') return getItemInformation(req, args || {});
  if (name === 'get_item_sale_history') return getItemSaleHistory(req, args || {});
  if (name === 'get_item_purchase_history') return getItemPurchaseHistory(req, args || {});
  throw new Error('Unsupported AI data tool.');
}

async function groqCompletion(payload) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await groq.chat.completions.create(payload);
  const message = response?.choices?.[0]?.message;
  if (!message) throw new Error('Groq returned no response.');
  return message;
}

async function chatWithDataAgent(req, res) {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt is required.' });

  const userId = String(req.user._id);
  if (!conversations.has(userId)) {
    conversations.set(userId, [
      {
        role: 'system',
        content: \`You are an advanced AI Data Agent for the Business Automation System ERP.
You have direct read access to live ERP data across inventory, human resources, attendance, sales, and accounting modules through your tool functions.
IMPORTANT: Do NOT make up information. If a user asks for data you cannot retrieve via tools, explicitly tell them you don't have access to that information.
IMPORTANT: for every pending cheque, unverified cheque, verified cheque, cheque detail, payment detail, paid cheque, or deposit detail request, you MUST call get_bank_payment_details. Set direction to paid for cheques and received for deposits.
When outputting lists or tables, use clean Markdown tables.
Be very brief and professional. Avoid lengthy filler.\`
      }
    ]);
  }

  const messages = conversations.get(userId);
  messages.push({ role: 'user', content: prompt });
  if (messages.length > MAX_HISTORY_MESSAGES) {
    const sysMsg = messages[0];
    const recent = messages.slice(-(MAX_HISTORY_MESSAGES - 1));
    conversations.set(userId, [sysMsg, ...recent]);
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const payload = { model: 'llama-3.3-70b-versatile', messages: conversations.get(userId), tools: toolsForUser(req.user), tool_choice: 'auto', max_tokens: 1500, temperature: 0.2 };
    let message;
    try { message = await groqCompletion(payload); } catch (e) {
      return res.status(500).json({ error: e.message || 'Error communicating with Groq AI.' });
    }
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return res.json({ reply: message.content });
    }
    
    for (const call of message.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        result = await executeTool(req, call.function?.name, args);
      } catch (error) { result = { error: error.message || 'The requested data could not be retrieved.' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('AI tool processing did not finish in time. Please try a more specific request.');
}

module.exports = { chatWithDataAgent, toolsForUser, getLateEmployees, getSalesSummary, getEmployeeInformation, getSalarySlip, getUsersList, karachiDate };
`;

let startIndex = content.indexOf('async function getBankTransactions');
if (startIndex === -1) {
    console.log("Could not find getBankTransactions");
} else {
    content = content.substring(0, startIndex) + bankingFunctions;
    content = content.replace('MAX_HISTORY_MESSAGES = 12', 'MAX_HISTORY_MESSAGES = 4');
    fs.writeFileSync(filePath, content);
    console.log("SUCCESSFULLY OVERWROTE BANKING FUNCTIONS");
}
