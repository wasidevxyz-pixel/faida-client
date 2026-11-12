const Attendance = require('../models/Attendance');
const Item = require('../models/Item');
const BankTransaction = require('../models/BankTransaction');
const PendingCheque = require('../models/PendingCheque');
const PendingChequeDetail = require('../models/PendingChequeDetail');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const WHPurchase = require('../models/WHPurchase');
const CashSale = require('../models/CashSale');
const Employee = require('../models/Employee');
const LegacyPayroll = require('../models/LegacyPayroll');
const Payroll = require('../models/Payroll');
const User = require('../models/User');
const EmployeeLedger = require('../models/EmployeeLedger');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const ClosingSheet = require('../models/ClosingSheet');
const DailyCash = require('../models/DailyCash');
const Voucher = require('../models/Voucher');
const PartyCategory = require('../models/PartyCategory');
const WHCustomer = require('../models/WHCustomer');
const WHLedger = require('../models/WHLedger');
const WHSale = require('../models/WHSale');
const WHItem = require('../models/WHItem');
const WHStockLog = require('../models/WHStockLog');
const Expense = require('../models/Expense');
const Zakat = require('../models/Zakat');
const MonthlyBalance = require('../models/MonthlyBalance');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const { applyBranchFilter } = require('../middleware/auth');
const { canUseAction, findMetric } = require('../config/aiActionCatalog');

const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY_MESSAGES = 4;
const conversations = new Map();

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function karachiDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.AI_TIMEZONE || 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateRange(date) {
  // ERP dates are business dates in Pakistan, rather than UTC calendar days.
  const start = new Date(`${date}T00:00:00+05:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { $gte: start, $lt: end };
}

function dateRangeInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+05:00`);
  const end = new Date(`${endDate}T00:00:00+05:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { $gte: start, $lt: end };
}

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) {
    if (match[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}

function asMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getLateEmployees(req, args) {
  const date = isValidDate(args.date) ? args.date : karachiDate();
  const query = await applyBranchFilter(req, {
    date: dateRange(date), displayStatus: { $in: ['Present', 'Half Day'] }, checkIn: { $nin: ['', null] }
  }, Attendance);
  const records = await Attendance.find(query)
    .populate({ path: 'employee', select: 'name code branch fDutyTime scheduleFDutyTime isActive' })
    .select('employee branch checkIn displayStatus').limit(101)
    .lean();
  const lateEmployees = records.flatMap(record => {
    const employee = record.employee;
    if (!employee || employee.isActive === false) return [];
    const scheduled = parseTime(employee.scheduleFDutyTime || employee.fDutyTime);
    const checkedIn = parseTime(record.checkIn);
    if (scheduled === null || checkedIn === null || checkedIn <= scheduled) return [];
    return [{ name: employee.name, code: employee.code, branch: record.branch || employee.branch, checkIn: record.checkIn, scheduledStart: employee.scheduleFDutyTime || employee.fDutyTime }];
  }).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const truncated = lateEmployees.length > 100;
  return { date, count: lateEmployees.length, employees: lateEmployees.slice(0, 100), truncated };
}

async function getEmployeesWithNoCheckins(req, args) {
  const { startDate, endDate, branch } = args || {};
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error('Provide a valid inclusive date range in YYYY-MM-DD format.');
  }
  if (!String(branch || '').trim()) throw new Error('Provide the employee branch.');

  const branchPattern = branchMatchPattern(branch);
  const employeeQuery = await applyBranchFilter(req, { isActive: true, branch: branchPattern }, Employee);
  const employees = await Employee.find(employeeQuery).select('_id name code branch department designation').populate('department', 'name').populate('designation', 'name').sort({ name: 1 }).lean();
  if (!employees.length) return { startDate, endDate, branch, count: 0, employees: [], message: 'No active employees were found for that branch.' };

  const employeeIds = employees.map(employee => employee._id);
  const checkedInIds = await Attendance.distinct('employee', {
    employee: { $in: employeeIds },
    date: dateRangeInclusive(startDate, endDate),
    checkIn: { $nin: ['', null, '-', '--:--'] }
  });
  const checkedIn = new Set(checkedInIds.map(id => String(id)));
  const absentEmployees = employees
    .filter(employee => !checkedIn.has(String(employee._id)))
    .map(employee => ({
      name: employee.name,
      code: employee.code,
      branch: employee.branch,
      department: employee.department?.name || null,
      designation: employee.designation?.name || null
    }));
  const truncated = absentEmployees.length > 200;
  return { startDate, endDate, branch, count: absentEmployees.length, employees: absentEmployees.slice(0, 200), truncated };
}

async function getMonthlyAbsenceSummary(req, args) {
  const { startDate, endDate, branch, minAbsentDays } = args || {};
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error('Provide a valid inclusive date range in YYYY-MM-DD format.');
  }
  const employeeFilter = { isActive: true };
  if (String(branch || '').trim()) employeeFilter.branch = branchMatchPattern(branch);
  const employeeQuery = await applyBranchFilter(req, employeeFilter, Employee);
  const employees = await Employee.find(employeeQuery).select('_id name code branch department designation').populate('department', 'name').populate('designation', 'name').sort({ name: 1 }).lean();
  if (!employees.length) return { startDate, endDate, branch: branch || null, totalActiveEmployees: 0, message: 'No active employees were found in the authorized branch scope.' };

  const employeeIds = employees.map(employee => employee._id);
  const [absentRecords, checkedInIds] = await Promise.all([
    Attendance.find({ employee: { $in: employeeIds }, date: dateRangeInclusive(startDate, endDate), displayStatus: { $in: ['Absent', 'A'] } }).select('employee date').lean(),
    Attendance.distinct('employee', { employee: { $in: employeeIds }, date: dateRangeInclusive(startDate, endDate), checkIn: { $nin: ['', null, '-', '--:--'] } })
  ]);
  const employeeById = new Map(employees.map(employee => [String(employee._id), employee]));
  const absentDatesByEmployee = new Map();
  for (const record of absentRecords) {
    const employeeId = String(record.employee);
    const date = new Date(record.date).toISOString().slice(0, 10);
    if (!absentDatesByEmployee.has(employeeId)) absentDatesByEmployee.set(employeeId, new Set());
    absentDatesByEmployee.get(employeeId).add(date);
  }
  const absentEmployees = [...absentDatesByEmployee.entries()]
    .map(([employeeId, dates]) => {
      const employee = employeeById.get(employeeId);
      return { name: employee.name, code: employee.code, branch: employee.branch, department: employee.department?.name || null, designation: employee.designation?.name || null, absentDays: dates.size };
    })
    .sort((a, b) => b.absentDays - a.absentDays || a.name.localeCompare(b.name));
  const minimum = Number.isInteger(minAbsentDays) && minAbsentDays > 0 ? minAbsentDays : null;
  const employeesAtOrAboveMinimum = minimum
    ? absentEmployees.filter(employee => employee.absentDays >= minimum)
    : [];
  const checkedIn = new Set(checkedInIds.map(id => String(id)));
  const noCheckinEmployees = employees
    .filter(employee => !checkedIn.has(String(employee._id)))
    .map(employee => ({ name: employee.name, code: employee.code, branch: employee.branch, department: employee.department?.name || null, designation: employee.designation?.name || null }));
  return {
    startDate,
    endDate,
    branch: branch || null,
    totalActiveEmployees: employees.length,
    employeesWithAbsences: absentEmployees.length,
    totalAbsentDays: absentEmployees.reduce((total, employee) => total + employee.absentDays, 0),
    mostAbsentEmployees: absentEmployees.slice(0, 25),
    minAbsentDays: minimum,
    minimumAbsenceMeaning: minimum ? `${minimum} or more absent days (inclusive)` : null,
    employeesAtOrAboveMinimumCount: employeesAtOrAboveMinimum.length,
    employeesAtOrAboveMinimum: employeesAtOrAboveMinimum.slice(0, 200),
    noCheckinEmployeeCount: noCheckinEmployees.length,
    employeesWithNoCheckins: noCheckinEmployees.slice(0, 100),
    truncated: absentEmployees.length > 25 || noCheckinEmployees.length > 100 || employeesAtOrAboveMinimum.length > 200
  };
}

async function getEmployeeCurrentAdvanceReport(req, args) {
  const { startDate, endDate, branch } = args || {};
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error('Provide a valid inclusive date range in YYYY-MM-DD format.');
  }
  const employeeFilter = { isActive: true };
  if (String(branch || '').trim()) employeeFilter.branch = branchMatchPattern(branch);
  const employeeQuery = await applyBranchFilter(req, employeeFilter, Employee);
  const employees = await Employee.find(employeeQuery).select('_id name code branch opening basicSalary').sort({ code: 1 }).lean();
  if (!employees.length) return { startDate, endDate, branch: branch || null, count: 0, employees: [], message: 'No active employees were found in the authorized branch scope.' };

  const periodStart = new Date(`${startDate}T00:00:00+05:00`);
  const periodEnd = new Date(`${endDate}T23:59:59.999+05:00`);
  const employeeIds = employees.map(employee => employee._id);
  const transactions = await EmployeeAdvance.find({ employee: { $in: employeeIds } }).select('employee date transactionType paid').lean();
  const transactionsByEmployee = new Map();
  for (const transaction of transactions) {
    const id = String(transaction.employee);
    if (!transactionsByEmployee.has(id)) transactionsByEmployee.set(id, []);
    transactionsByEmployee.get(id).push(transaction);
  }
  const rows = employees.map(employee => {
    let openingBalance = Number(employee.opening || 0);
    let currentAdvance = 0;
    let recoveredFromSalary = 0;
    for (const transaction of transactionsByEmployee.get(String(employee._id)) || []) {
      const amount = Number(transaction.paid || 0);
      const transactionDate = new Date(transaction.date);
      if (transactionDate < periodStart) {
        openingBalance += transaction.transactionType === 'Pay' ? amount : -amount;
      } else if (transactionDate <= periodEnd) {
        if (transaction.transactionType === 'Pay') currentAdvance += amount;
        else recoveredFromSalary += amount;
      }
    }
    const totalAdvance = openingBalance + currentAdvance;
    const balance = totalAdvance - recoveredFromSalary;
    return { code: employee.code, name: employee.name, branch: employee.branch, openingBalance: asMoney(openingBalance), currentAdvance: asMoney(currentAdvance), recoveredFromSalary: asMoney(recoveredFromSalary), balance: asMoney(balance) };
  }).filter(row => row.currentAdvance > 0).sort((a, b) => b.currentAdvance - a.currentAdvance || a.name.localeCompare(b.name));
  return {
    startDate,
    endDate,
    branch: branch || null,
    count: rows.length,
    totalCurrentAdvance: asMoney(rows.reduce((total, row) => total + row.currentAdvance, 0)),
    employees: rows,
    note: 'Current advance is the salary advance paid during the requested period. Opening balance and recovered-from-salary are included for context.'
  };
}

async function getSalesSummary(req, args) {
  const today = karachiDate();
  const startDate = isValidDate(args.startDate) ? args.startDate : today;
  const endDate = isValidDate(args.endDate) && args.endDate >= startDate ? args.endDate : startDate;
  const query = await applyBranchFilter(req, { date: dateRangeInclusive(startDate, endDate) }, CashSale);
  const [totals] = await CashSale.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 }, average: { $avg: '$totalAmount' } } }
  ]);
  return { startDate, endDate, currency: 'PKR', totalSales: asMoney(totals?.total), invoiceCount: totals?.count || 0, averageInvoiceValue: asMoney(totals?.average) };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function branchMatchPattern(value) {
  // Attendance screens commonly store branch names in parentheses, while users
  // naturally omit them (for example, “Ghouri Town” vs “(Ghouri Town)”).
  const normalized = String(value || '').trim().replace(/^\(+\s*|\s*\)+$/g, '').trim();
  return new RegExp(`^\\s*\\(?\\s*${escapeRegex(normalized)}\\s*\\)?\\s*$`, 'i');
}

async function getEmployeeLedgerReport(req, args) {
  const { search, startDate, endDate } = args;
  const pattern = new RegExp(escapeRegex(search), 'i');
  
  const employee = await Employee.findOne(await applyBranchFilter(req, {
    $or: [{ code: pattern }, { name: pattern }]
  }, Employee));

  if (!employee) return { found: false, message: `Could not find an employee matching '${search}'.` };

  let query = { employee: employee._id };
  if (startDate || endDate) {
    query.date = dateRangeInclusive(startDate, endDate);
  }

  const entries = await EmployeeLedger.find(query).sort({ date: 1, createdAt: 1 }).lean();

  if (!entries.length) {
    return { found: false, message: `No ledger entries found for ${employee.name} in the specified date range.` };
  }

  let rows = entries.map(e => `| ${e.date ? new Date(e.date).toISOString().split('T')[0] : ''} | ${markdownCell(e.type)} | ${markdownCell(e.description)} | ${Number(e.debit || 0).toLocaleString()} | ${Number(e.credit || 0).toLocaleString()} | ${Number(e.balance || 0).toLocaleString()} |`);

  return {
    found: true,
    message: [
      `### Ledger for ${employee.name} (${employee.code})`,
      `| Date | Type | Description | Advance (Debit) | Return (Credit) | Balance |`,
      `|---|---|---|---|---|---|`,
      ...rows
    ].join('\n')
  };
}

async function getSalaryDateRangeReport(req, args) {
  const { search, startDate, endDate } = args;
  const pattern = new RegExp(escapeRegex(search), 'i');
  
  const employee = await Employee.findOne(await applyBranchFilter(req, {
    $or: [{ code: pattern }, { name: pattern }]
  }, Employee));

  if (!employee) return { found: false, message: `Could not find an employee matching '${search}'.` };

  const newPayrolls = await Payroll.find({ employee: employee._id }).lean();
  const legacyPayrolls = await LegacyPayroll.find({ employeeCode: employee.code }).lean();

  const allPayrolls = [];
  const startDt = startDate ? new Date(startDate) : new Date('1970-01-01');
  const endDt = endDate ? new Date(endDate) : new Date('2099-12-31');

  for (const p of newPayrolls) {
    if (!p.monthYear) continue;
    const pDate = new Date(p.monthYear + '-01');
    if (pDate >= startDt && pDate <= endDt) {
      allPayrolls.push({ month: p.monthYear, netSalary: p.netTotal || 0 });
    }
  }
  for (const p of legacyPayrolls) {
    if (!p.monthYear) continue;
    const pDate = new Date(p.monthYear);
    if (pDate >= startDt && pDate <= endDt && !Number.isNaN(pDate.getTime())) {
      allPayrolls.push({ month: p.monthYear, netSalary: p.netSalary || 0 });
    }
  }

  allPayrolls.sort((a, b) => new Date(a.month) - new Date(b.month));

  if (!allPayrolls.length) {
    return { found: false, message: `No historical salary records found for ${employee.name} in the specified date range.` };
  }

  const rows = allPayrolls.map(p => `| ${markdownCell(p.month)} | ${Number(p.netSalary).toLocaleString()} PKR |`);
  const total = allPayrolls.reduce((sum, p) => sum + (Number(p.netSalary) || 0), 0);

  return {
    found: true,
    message: [
      `### Salary History for ${employee.name} (${employee.code})`,
      `| Month | Net Salary |`,
      `|---|---|`,
      ...rows,
      `**Total Paid in Range:** ${total.toLocaleString()} PKR`
    ].join('\n')
  };
}

async function getEmployeeSalaryReport(req, args) {
  let query = { isActive: true };

  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\s-]+/g, '[-\\s]*'), 'i');
    query = { $and: [query, { branch: branchPattern }] };
  }

  if (args.department) {
    const EmployeeDepartment = require('../models/EmployeeDepartment');
    const deptPattern = new RegExp(escapeRegex(String(args.department).trim()), 'i');
    const depts = await EmployeeDepartment.find({ name: deptPattern }).select('_id name').lean();
    if (depts.length > 0) {
      query = { $and: [query, { department: { $in: depts.map(d => d._id) } }] };
    } else {
       return { found: false, message: `No department found matching '${args.department}'. Check the exact department name.` };
    }
  }

  if (args.minSalary !== undefined || args.maxSalary !== undefined) {
    query.basicSalary = {};
    if (args.minSalary !== undefined) query.basicSalary.$gte = args.minSalary;
    if (args.maxSalary !== undefined) query.basicSalary.$lte = args.maxSalary;
  }

  query = await applyBranchFilter(req, query, Employee);

  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);

  const employees = await Employee.find(query)
    .populate('department', 'name')
    .populate('designation', 'name')
    .sort({ basicSalary: -1, name: 1 })
    .limit(limit)
    .lean();

  if (!employees.length) {
    return { found: false, message: 'No active employees matched the requested salary criteria.' };
  }

  const rows = employees.map(emp => {
    return `| ${markdownCell(emp.name)} | ${markdownCell(emp.code)} | ${markdownCell(emp.branch)} | ${markdownCell(emp.department?.name)} | ${markdownCell(emp.designation?.name)} | ${Number(emp.basicSalary || 0).toLocaleString()} PKR |`;
  });

  return {
    found: true,
    count: employees.length,
    truncated: employees.length === limit,
    message: [
      `### Employee Salary Report`,
      '',
      '| Employee Name | Code | Branch | Department | Designation | Basic Salary |',
      '|---|---|---|---|---|---:|',
      ...rows,
      '',
      `**Total matched:** ${employees.length}`
    ].join('\n')
  };
}

async function getEmployeeInformation(req, args) {
  let search = String(args.search || '').trim();
  const allowAllKeywords = /^(all|all employees|all active|all active employees|active employees|active)$/i;
  // A list request uses words such as "all active employees", which are
  // longer than two characters. Check it before the normal name/code lookup;
  // otherwise the system searches that literal phrase and can return an
  // unrelated employee whose record happens to match a fallback word.
  const status = String(args.status || '').toLowerCase();
  if (allowAllKeywords.test(search) || status === 'active' || args.all === true) {
    const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 1000);
    const { query, branch } = await reportQueryForBranch(req, Employee, null, args.branch);
    query.isActive = true;
    if (String(args.department || '').trim()) {
      const EmployeeDepartment = require('../models/EmployeeDepartment');
      const departments = await EmployeeDepartment.find({ name: new RegExp(escapeRegex(args.department), 'i') }).select('_id name').lean();
      if (!departments.length) {
        return { branch: branch || null, department: args.department, count: 0, employees: [], message: `No department matches "${args.department}". Check the exact department name.` };
      }
      query.department = { $in: departments.map(department => department._id) };
    }
    if (String(args.designation || '').trim()) {
      const Designation = require('../models/Designation');
      const designations = await Designation.find({ name: new RegExp(`^${escapeRegex(args.designation)}$`, 'i') }).select('_id').lean();
      if (!designations.length) {
        return { branch: branch || null, department: args.department || null, designation: args.designation, count: 0, employees: [], message: `No designation matches "${args.designation}".` };
      }
      query.designation = { $in: designations.map(designation => designation._id) };
    }
    const employees = await Employee.find(await applyBranchFilter(req, query, Employee))
      .populate('department', 'name')
      .populate('designation', 'name')
      .select('code name branch department designation')
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    return {
      branch: branch || null, department: args.department || null, designation: args.designation || null,
      count: employees.length,
      employees: employees.map(e => ({ code: e.code, name: e.name, branch: e.branch, department: e.department?.name || null, designation: e.designation?.name || null }))
    };
  }
  if (search.length < 2) {
    throw new Error('Provide at least two characters of an employee name or code.');
  }
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  const pattern = new RegExp(escapeRegex(search), 'i');
  const { query, branch } = await reportQueryForBranch(req, Employee, null, args.branch);
  query.$or = [{ code: pattern }, { name: pattern }];
  let employees = await Employee.find(query)
    .populate('department', 'name')
    .populate('designation', 'name')
    .select('code name name_urdu fatherName cnic branch department designation address mobileNo resPhone dateOfBirth joiningDate expiryDate resignDate gender maritalStatus domicile basicSalary salaryType fixAllowance otherAllowance foodAllowanceRs deduction bankCash acNo selectBank bankDetails fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs isActive')
    .sort({ name: 1 }).limit(limit).lean();
  // Employee List names may use an initial (for example, "M.SHAFIQ AHMED")
  // while the user asks for "Muhammad Shafiq Ahmed". If an exact phrase did
  // not match, retry using the meaningful name words within the same branch.
  if (!employees.length) {
    const nameWords = search.split(/\s+/).filter(word => word.length > 1 && !/^muhammad$/i.test(word));
    for (const word of nameWords) {
      const fallbackQuery = { ...query, $or: [{ code: new RegExp(escapeRegex(word), 'i') }, { name: new RegExp(escapeRegex(word), 'i') }] };
      employees = await Employee.find(fallbackQuery)
        .populate('department', 'name')
        .populate('designation', 'name')
        .select('code name name_urdu fatherName cnic branch department designation address mobileNo resPhone dateOfBirth joiningDate expiryDate resignDate gender maritalStatus domicile basicSalary salaryType fixAllowance otherAllowance foodAllowanceRs deduction bankCash acNo selectBank bankDetails fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs isActive')
        .sort({ name: 1 }).limit(limit).lean();
      if (employees.length) break;
    }
  }
  console.error('[AI DEBUG] getEmployeeInformation called with args:', args, 'query:', JSON.stringify(query), 'Found count:', employees.length);
  return {
    branch: branch || null,
    count: employees.length,
    employees: employees.map(employee => ({
      code: employee.code, name: employee.name, nameUrdu: employee.name_urdu, fatherName: employee.fatherName,
      cnic: employee.cnic, branch: employee.branch, department: employee.department?.name, designation: employee.designation?.name,
      contact: { mobile: employee.mobileNo, residencePhone: employee.resPhone, address: employee.address },
      employment: { active: employee.isActive, joiningDate: employee.joiningDate, expiryDate: employee.expiryDate, resignDate: employee.resignDate, gender: employee.gender, maritalStatus: employee.maritalStatus, domicile: employee.domicile },
      payroll: { basicSalary: employee.basicSalary, salaryType: employee.salaryType, allowances: { fixed: employee.fixAllowance, other: employee.otherAllowance, food: employee.foodAllowanceRs }, deduction: employee.deduction, paymentMethod: employee.bankCash },
      banking: { accountNumber: employee.acNo, bank: employee.selectBank, accounts: employee.bankDetails },
      dutySchedule: { from: employee.scheduleFDutyTime || employee.fDutyTime, to: employee.scheduleTDutyTime || employee.tDutyTime, offDay: employee.offDay, totalHours: employee.totalHrs }
    }))
  };
}

async function getUsersList(req, args) {
  const query = {};
  if (args.status === 'active') query.isActive = true;
  else if (args.status === 'inactive') query.isActive = false;

  const users = await User.find(query).select('name email role branch department isActive').sort({ name: 1 }).lean();
  return {
    count: users.length,
    users: users.map(user => ({
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      department: user.department,
      status: user.isActive ? 'Active' : 'Inactive'
    }))
  };
}


async function getItemInformation(req, args) {
  const search = String(args.search || '').trim();
  if (search.length < 2) throw new Error('Provide at least two characters of an item name or SKU.');
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  const pattern = new RegExp(escapeRegex(search), 'i');
  
  const query = { $or: [{ sku: pattern }, { name: pattern }, { barcode: pattern }] };
  const items = await Item.find(query).select('name sku barcode category purchasePrice salePrice stockQty unit isActive').limit(limit).lean();
  
  return {
    count: items.length,
    items: items.map(item => ({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      category: item.category,
      purchasePrice: item.purchasePrice,
      salePrice: item.salePrice,
      stockQty: item.stockQty,
      unit: item.unit,
      status: item.isActive ? 'Active' : 'Inactive'
    }))
  };
}

async function getItemSaleHistory(req, args) {
  const search = String(args.search || '').trim();
  if (search.length < 2) throw new Error('Provide an item name or SKU to view sale history.');
  const pattern = new RegExp(escapeRegex(search), 'i');
  const items = await Item.find({ $or: [{ sku: pattern }, { name: pattern }] }).select('_id name').limit(1).lean();
  if (!items.length) return { found: false, message: 'Item not found.' };
  
  const itemId = items[0]._id;
  const itemName = items[0].name;
  
  const sales = await Sale.find({ 'items.item': itemId }).populate('party', 'name').select('invoiceNumber date party items grandTotal').sort({ date: -1 }).limit(10).lean();
  
  const history = sales.map(sale => {
    const saleItem = sale.items.find(i => String(i.item) === String(itemId));
    return {
      date: sale.date,
      invoice: sale.invoiceNumber,
      customer: sale.party ? sale.party.name : 'Unknown',
      quantitySold: saleItem ? saleItem.quantity : 0,
      rate: saleItem ? saleItem.rate : 0
    };
  });
  
  return { itemName, historyCount: history.length, history };
}

async function getItemPurchaseHistory(req, args) {
  const search = String(args.search || '').trim();
  if (search.length < 2) throw new Error('Provide an item name or SKU to view purchase history.');
  const pattern = new RegExp(escapeRegex(search), 'i');
  const items = await Item.find({ $or: [{ sku: pattern }, { name: pattern }] }).select('_id name').limit(1).lean();
  if (!items.length) return { found: false, message: 'Item not found.' };
  
  const itemId = items[0]._id;
  const itemName = items[0].name;
  
  const purchases = await Purchase.find({ 'items.item': itemId }).populate('supplier', 'name').select('invoiceNo date supplier items').sort({ date: -1 }).limit(10).lean();
  
  const history = purchases.map(purchase => {
    const pItem = purchase.items.find(i => String(i.item) === String(itemId));
    return {
      date: purchase.date,
      invoice: purchase.invoiceNo,
      supplier: purchase.supplier ? purchase.supplier.name : 'Unknown',
      quantityPurchased: pItem ? pItem.quantity : 0,
      price: pItem ? (pItem.price || pItem.rate || 0) : 0
    };
  });
  
  return { itemName, historyCount: history.length, history };
}


async function getLastPurchaseInvoice(req, args) {
  let purchase = await Purchase.findOne().sort({ date: -1, createdAt: -1 }).populate('supplier', 'name').select('_id invoiceNo date supplier grandTotal items branch').lean();
  let whPurchase = await WHPurchase.findOne().sort({ date: -1, createdAt: -1 }).populate('supplier', 'name').select('_id invoiceNo date supplier grandTotal items branch').lean();
  
  let latest = null;
  let type = '';
  
  if (purchase && whPurchase) {
    if (new Date(purchase.date) >= new Date(whPurchase.date)) {
      latest = purchase; type = 'purchase';
    } else {
      latest = whPurchase; type = 'wh_purchase';
    }
  } else if (purchase) {
    latest = purchase; type = 'purchase';
  } else if (whPurchase) {
    latest = whPurchase; type = 'wh_purchase';
  }

  if (!latest) {
    return { found: false, message: 'No purchase invoices found.' };
  }

  const itemsCount = latest.items ? latest.items.length : 0;
  const url = type === 'purchase' ? `/print-invoice?id=${latest._id}&type=purchase` : `/wh-print?id=${latest._id}&type=purchase`;
  
  return {
    found: true,
    invoiceNo: latest.invoiceNo,
    date: latest.date,
    supplier: latest.supplier ? latest.supplier.name : 'Unknown',
    grandTotal: latest.grandTotal,
    branch: latest.branch,
    itemsCount,
    downloadUrl: url,
    isPrintPage: true
  };
}


// ---------------------------------------------------------------------------
// Employee Attendance Detail Tool
// Handles: check-in/out time, worked hours, date-range timing sheet,
//          late employees list, absent employees list — all in one tool.
// ---------------------------------------------------------------------------
async function getEmployeeCheckin(req, args) {
  const search = String(args.search || '').trim();
  const startDate = isValidDate(args.startDate) ? args.startDate : karachiDate();
  const endDate = isValidDate(args.endDate) && args.endDate >= startDate ? args.endDate : startDate;
  const queryType = String(args.queryType || 'single').toLowerCase(); // single | range | late | absent

  // ── Late employees for a date ───────────────────────────────────────────────
  if (queryType === 'late') {
    const date = startDate;
    const query = await applyBranchFilter(req, {
      date: dateRange(date),
      displayStatus: { $in: ['Present', 'Half Day'] },
      checkIn: { $nin: ['', null] }
    }, Attendance);
    if (args.branch) query.branch = branchMatchPattern(args.branch);
    const records = await Attendance.find(query)
      .populate({ path: 'employee', select: 'name code branch fDutyTime scheduleFDutyTime isActive' })
      .select('employee branch checkIn displayStatus').limit(200).lean();
    const late = records.flatMap(r => {
      const emp = r.employee;
      if (!emp || emp.isActive === false) return [];
      const scheduled = parseTime(emp.scheduleFDutyTime || emp.fDutyTime);
      const actual = parseTime(r.checkIn);
      if (scheduled === null || actual === null || actual <= scheduled) return [];
      return [{ name: emp.name, code: emp.code, branch: r.branch || emp.branch, checkIn: r.checkIn, scheduledStart: emp.scheduleFDutyTime || emp.fDutyTime }];
    }).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return { queryType: 'late', date, branch: args.branch || 'all', count: late.length, employees: late };
  }

  // ── Absent employees for a date ─────────────────────────────────────────────
  if (queryType === 'absent') {
    const date = startDate;
    let empQuery = await applyBranchFilter(req, { isActive: true }, Employee);
    if (args.branch) empQuery.branch = branchMatchPattern(args.branch);
    const employees = await Employee.find(empQuery).select('_id name code branch department').populate('department', 'name').lean();
    const presentIds = new Set(
      (await Attendance.distinct('employee', {
        date: dateRange(date),
        displayStatus: { $in: ['Present', 'Half Day'] }
      })).map(id => String(id))
    );
    const absent = employees
      .filter(e => !presentIds.has(String(e._id)))
      .map(e => ({ name: e.name, code: e.code, branch: e.branch, department: e.department?.name || null }));
    return { queryType: 'absent', date, branch: args.branch || 'all', count: absent.length, employees: absent.slice(0, 200) };
  }

  // ── Single employee check-in / range timing sheet ──────────────────────────
  if (!search) throw new Error('Provide employee name or code.');
  const pattern = new RegExp(escapeRegex(search), 'i');
  const empQuery = await applyBranchFilter(req, {
    $or: [{ code: pattern }, { name: pattern }], isActive: true
  }, Employee);
  // If a branch hint was provided (e.g. "pwd branch k employee"), narrow the search
  if (args.branch) empQuery.branch = branchMatchPattern(args.branch);
  const employees = await Employee.find(empQuery).select('_id name code branch fDutyTime scheduleFDutyTime').limit(5).lean();
  if (!employees.length) return { found: false, message: `Employee "${search}" not found.` };

  // If multiple employees match, return the list and ask the user to clarify
  if (employees.length > 1) {
    return {
      found: true,
      multipleMatches: true,
      message: `Multiple employees match "${search}". Please specify which one:`,
      employees: employees.map(e => ({
        name: e.name,
        code: e.code,
        branch: e.branch
      }))
    };
  }

  const emp = employees[0];
  const records = await Attendance.find({
    employee: emp._id,
    date: dateRangeInclusive(startDate, endDate)
  }).sort({ date: 1 }).select('date checkIn checkOut workedHrs totalHrs displayStatus breakHrs remarks branch').lean();

  const rows = records.map(r => ({
    date: new Date(r.date).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' }),
    status: r.displayStatus || 'Unknown',
    checkIn: r.checkIn || '--:--',
    checkOut: r.checkOut || '--:--',
    workedHrs: r.workedHrs || '-',
    totalHrs: r.totalHrs ? Number(r.totalHrs).toFixed(2) : '-',
    remarks: r.remarks || ''
  }));

  const totalDays = rows.length;
  const presentDays = rows.filter(r => ['Present', 'Half Day'].includes(r.status)).length;
  const absentDays = rows.filter(r => r.status === 'Absent').length;

  return {
    found: true,
    queryType: startDate === endDate ? 'single' : 'range',
    employee: emp.name,
    code: emp.code,
    branch: emp.branch,
    scheduledStart: emp.scheduleFDutyTime || emp.fDutyTime || 'N/A',
    startDate, endDate,
    totalDays, presentDays, absentDays,
    rows
  };
}

async function getEmployeeAttendanceSheet(req, args) {
  const search = String(args.search || '').trim();
  const monthYear = String(args.monthYear || '').trim();
  if (search.length < 2 || !monthYear) throw new Error('Provide an employee name or code and a month such as June 2026.');
  const pattern = new RegExp(escapeRegex(search), 'i');
  
  const employees = await Employee.find({ $or: [{ code: pattern }, { name: pattern }] }).select('_id name code').limit(1).lean();
  if (!employees.length) return { found: false, message: `Employee "${search}" not found.` };
  
  const emp = employees[0];
  
  const parsedMonth = new Date(`${monthYear} 1`);
  if (Number.isNaN(parsedMonth.getTime())) return { found: false, message: `I could not understand the month ${monthYear}.` };
  
  const y = parsedMonth.getFullYear();
  const m = parsedMonth.getMonth();
  
  const pad = num => String(num).padStart(2, '0');
  const fromDate = `${y}-${pad(m+1)}-01`;
  const toDate = `${y}-${pad(m+1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  
  return {
    found: true,
    employeeName: emp.name,
    monthYear,
    downloadUrl: `/print-employee-attendance-report?employee=${emp._id}&from=${fromDate}&to=${toDate}`,
    isPrintPage: true
  };
}



async function getBankTransactions(req, args) {
  const status = args.status || 'all'; // verified, unverified, all
  const type = args.type || 'all'; // deposit, withdrawal, bank_transfer, etc.
  const search = args.search || '';
  
  let query = {};
  if (status === 'verified') query.isVerified = true;
  if (status === 'unverified') query.isVerified = false;
  if (type !== 'all') query.type = type;
  
  if (search) {
    const pattern = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
    query.$or = [{ bankName: pattern }, { branch: pattern }, { narration: pattern }];
  }
  
  const transactions = await BankTransaction.find(query)
    .sort({ date: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 15, 1), 30))
    .lean();
    
  if (!transactions.length) {
    return { found: false, message: 'No bank transactions found matching criteria.' };
  }
  
  let summary = '### Bank Transactions\n\n| Date | Bank | Branch | Type | Amount | Status | Narration |\n|---|---|---|---|---|---|---|\n';
  transactions.forEach(t => {
    const dateStr = new Date(t.date).toLocaleDateString();
    const st = t.isVerified ? 'Verified' : 'Unverified';
    summary += `| ${dateStr} | ${t.bankName || ''} | ${t.branch || ''} | ${t.type} | ${t.amount} | ${st} | ${t.narration} |\n`;
  });
  
  return {
    found: true,
    summary,
    count: transactions.length,
    message: 'Here are the requested bank transactions.'
  };
}

function reportDates(args) {
  const today = karachiDate();
  const startDate = isValidDate(args.startDate) ? args.startDate : today;
  const endDate = isValidDate(args.endDate) && args.endDate >= startDate ? args.endDate : startDate;
  return { startDate, endDate, date: dateRangeInclusive(startDate, endDate) };
}

function normalizeBranchName(value) {
  return String(value || '').replace(/\bbranch\b/gi, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

async function reportQueryForBranch(req, Model, date, requestedBranch) {
  const allowedQuery = await applyBranchFilter(req, date ? { date } : {}, Model);
  if (!requestedBranch) return { query: allowedQuery, branch: null };
  const wanted = normalizeBranchName(requestedBranch);
  const availableBranches = await Model.distinct('branch', allowedQuery);
  const matchedBranches = availableBranches.filter(candidate => normalizeBranchName(candidate) === wanted);
  if (!matchedBranches.length) throw new Error(`No allowed branch matches "${requestedBranch}" for this period.`);
  return { query: { ...allowedQuery, branch: { $in: matchedBranches } }, branch: matchedBranches[0] };
}

async function getSalesDepartmentReport(req, args) {
  const hasDateRange = isValidDate(args.startDate) || isValidDate(args.endDate);
  const { startDate, endDate, date } = hasDateRange
    ? reportDates(args)
    : { startDate: null, endDate: null, date: null };
  const { query, branch } = await reportQueryForBranch(req, ClosingSheet, date, args.branch);
  const sheets = await ClosingSheet.find(query).select('date branch closing02.data').lean();
  const categoryIds = new Set();
  sheets.forEach(sheet => (sheet.closing02?.data?.warehouseSale || []).forEach(row => row.category && categoryIds.add(String(row.category))));
  const categories = await PartyCategory.find({ _id: { $in: [...categoryIds] } }).select('name').lean();
  const names = new Map(categories.map(category => [String(category._id), category.name]));
  const requestedCategory = String(args.category || '').trim().toLowerCase();
  const groupByBranch = Boolean(args.groupByBranch);
  // If the caller asked to group by branch, treat that as a pivot-by-branch intent
  // so AI calls that set `groupByBranch` (e.g. WH customer sales mapping) will
  // automatically return a category × branch pivot without requiring an
  // explicit `pivotBy: 'branch'` argument.
  const pivotByBranch = String(args.pivotBy || '').toLowerCase() === 'branch' || groupByBranch;
  const totals = new Map();
  for (const sheet of sheets) for (const data of (sheet.closing02?.data?.warehouseSale || [])) {
    const category = names.get(String(data.category)) || 'Unknown Category';
    if (requestedCategory && !category.toLowerCase().includes(requestedCategory)) continue;
    const sheetBranch = sheet.branch || 'Unassigned Branch';
    const key = groupByBranch ? `${sheetBranch}|${category}` : category;
    const current = totals.get(key) || { branch: sheetBranch, category, sales: 0, discount: 0, cost: 0, days: new Set() };
    current.sales += Number(data.sale || 0);
    current.cost += Number(data.cost || 0);
    current.days.add(`${sheetBranch}|${new Date(sheet.date).toISOString().slice(0, 10)}`);
    totals.set(key, current);
  }
  // If pivot requested, produce category rows with one column per branch
  if (pivotByBranch) {
    const categoryMap = new Map();
    const branchesSet = new Set();
    for (const sheet of sheets) {
      const sheetBranch = sheet.branch || 'Unassigned Branch';
      (sheet.closing02?.data?.warehouseSale || []).forEach(data => {
        const category = names.get(String(data.category)) || 'Unknown Category';
        if (requestedCategory && !category.toLowerCase().includes(requestedCategory)) return;
        branchesSet.add(sheetBranch);
        const catRow = categoryMap.get(category) || { category, byBranch: new Map(), totalSales: 0, totalCost: 0, totalDiscount: 0 };
        const saleVal = Number(data.sale || 0);
        const costVal = Number(data.cost || 0);
        const discountVal = Number(data.discount || 0);
        const prev = catRow.byBranch.get(sheetBranch) || { sales: 0, cost: 0, discount: 0 };
        prev.sales += saleVal;
        prev.cost += costVal;
        prev.discount += discountVal;
        catRow.byBranch.set(sheetBranch, prev);
        catRow.totalSales += saleVal;
        catRow.totalCost += costVal;
        catRow.totalDiscount += discountVal;
        categoryMap.set(category, catRow);
      });
    }
    const branches = [...branchesSet].sort();

    // Build rows with explicit Sales/Cost/Profit columns per branch and totals
    const rows = [...categoryMap.values()].map(cat => {
      const cols = {};
      let grandSales = 0, grandCost = 0, grandDiscount = 0;
      for (const b of branches) {
        const by = cat.byBranch.get(b) || { sales: 0, cost: 0, discount: 0 };
        grandSales += by.sales; grandCost += by.cost; grandDiscount += by.discount;
        cols[`${b} (Sales)`] = asMoney(by.sales);
        cols[`${b} (Cost)`] = asMoney(by.cost);
        const profit = by.sales - by.cost;
        cols[`${b} (Profit)`] = asMoney(profit);
      }
      const totalProfit = grandSales - grandCost;
      cols.TotalSales = asMoney(grandSales);
      cols.TotalCost = asMoney(grandCost);
      cols.TotalProfit = asMoney(totalProfit);
      cols.ProfitMargin = grandSales ? `${Math.round((totalProfit / grandSales) * 1000) / 10}%` : '0%';
      return { category: cat.category, ...cols };
    }).sort((a, b) => Number(b.TotalSales) - Number(a.TotalSales) || a.category.localeCompare(b.category));

    // CSV generation (Category, for each branch: Sales, Cost, Profit, then totals)
    const header = ['Category', ...branches.flatMap(b => [`${b} (Sales)`, `${b} (Cost)`, `${b} (Profit)`]), 'TotalSales', 'TotalCost', 'TotalProfit', 'ProfitMargin'];
    const csvRows = [header.join(',')];
    for (const r of rows) {
      const cols = [r.category, ...branches.flatMap(b => [String(r[`${b} (Sales)`] || 0), String(r[`${b} (Cost)`] || 0), String(r[`${b} (Profit)`] || 0)]), String(r.TotalSales || 0), String(r.TotalCost || 0), String(r.TotalProfit || 0), r.ProfitMargin || ''];
      csvRows.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }

    // Compute branch totals and grand totals
    const branchTotals = {};
    let grand = { sales: 0, cost: 0, profit: 0 };
    for (const b of branches) {
      const sales = rows.reduce((s, r) => s + (Number(r[`${b} (Sales)`]) || 0), 0);
      const cost = rows.reduce((s, r) => s + (Number(r[`${b} (Cost)`]) || 0), 0);
      const profit = rows.reduce((s, r) => s + (Number(r[`${b} (Profit)`]) || 0), 0);
      branchTotals[b] = { sales: asMoney(sales), cost: asMoney(cost), profit: asMoney(profit) };
      grand.sales += sales; grand.cost += cost; grand.profit += profit;
    }

    return {
      source: 'Closing Sheet → Closing 02 → Warehouse Sale (pivot)',
      startDate, endDate,
      branch: branch || 'All allowed branches',
      category: args.category || 'All categories',
      pivotBy: 'branch',
      branches,
      branchTotals,
      grandTotals: { sales: asMoney(grand.sales), cost: asMoney(grand.cost), profit: asMoney(grand.profit), profitMargin: grand.sales ? `${Math.round((grand.profit / grand.sales) * 1000) / 10}%` : '0%' },
      count: rows.length,
      rows: rows.slice(0, 500),
      truncated: rows.length > 500,
      csv: csvRows.join('\n')
    };
  }

  const rows = [...totals.values()].map(row => ({ branch: row.branch, category: row.category, sales: asMoney(row.sales), cost: asMoney(row.cost), profit: asMoney(row.sales - row.cost), records: row.days.size })).sort((a, b) => groupByBranch ? a.branch.localeCompare(b.branch) || b.sales - a.sales : b.sales - a.sales);
  return { source: 'Closing Sheet → Closing 02 → Warehouse Sale', startDate, endDate, branch: branch || 'All allowed branches', category: args.category || 'All categories', groupByBranch, count: rows.length, rows: rows.slice(0, 100), truncated: rows.length > 100 };
}

// ---------------------------------------------------------------------------
// Department-Wise Sale Report (from Closing Sheet closing02.data)
// Mirrors /department-sales-report page: batch, total sale, SR, commission,
// difference, discount. Supports branch filter and single-dept filter.
// ---------------------------------------------------------------------------
async function getDeptWiseSaleReport(req, args) {
  const { startDate, endDate, date } = reportDates(args);
  const { query: baseQuery, branch } = await reportQueryForBranch(req, ClosingSheet, date, args.branch);
  const sheets = await ClosingSheet.find(baseQuery).select('date branch closing02').lean();

  // Resolve dept IDs to names
  const allDeptIds = new Set();
  sheets.forEach(sheet => {
    const data = sheet.closing02?.data || {};
    Object.entries(data).forEach(([deptId, deptData]) => {
      if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId) || !deptData) return;
      if (mongoose.isValidObjectId(deptId)) allDeptIds.add(deptId);
    });
  });

  const depts = await Department.find({ _id: { $in: [...allDeptIds] } }).select('name').lean();
  const deptIdToName = new Map(depts.map(d => [d._id.toString(), (d.name || '').trim()]));

  // Optional: filter by department name (partial, case-insensitive)
  const deptFilter = String(args.department || '').toLowerCase().trim();

  // Aggregation: key = branch + dept
  const aggregated = new Map();

  for (const sheet of sheets) {
    const sheetBranch = sheet.branch || 'Unassigned';
    const data = sheet.closing02?.data || {};

    for (const [deptId, deptData] of Object.entries(data)) {
      if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId) || !deptData) continue;
      const deptName = deptIdToName.get(deptId) || 'UNKNOWN';
      if (deptFilter && !deptName.toLowerCase().includes(deptFilter)) continue;

      const key = `${sheetBranch}||${deptName}`;
      const existing = aggregated.get(key) || {
        branch: sheetBranch,
        department: deptName,
        batchAmount: 0,
        totalSale: 0,
        srCount: 0,
        commission: 0,
        difference: 0,
        discountValue: 0,
        discountPer: 0,
        days: 0
      };

      existing.batchAmount += parseFloat(deptData.counterClosing || deptData.batchAmount || 0);
      existing.totalSale += parseFloat(deptData.totalSaleComputer || 0);
      existing.srCount += parseFloat(deptData.srCount || deptData.tSaleManual || 0);
      existing.commission += parseFloat(deptData.commission || 0);
      existing.difference += parseFloat(deptData.difference || 0);
      existing.discountValue += parseFloat(deptData.discountValue || 0);
      existing.discountPer += parseFloat(deptData.discountPer || 0);
      existing.days += 1;
      aggregated.set(key, existing);
    }
  }

  const rows = [...aggregated.values()]
    .map(row => ({
      branch: row.branch,
      department: row.department,
      batchAmount: asMoney(row.batchAmount),
      totalSale: asMoney(row.totalSale),
      srCount: asMoney(row.srCount),
      commission: asMoney(row.commission),
      difference: asMoney(row.difference),
      discountValue: asMoney(row.discountValue),
      discountPer: row.days > 0 ? asMoney(row.discountPer / row.days) : 0,
      days: row.days
    }))
    .sort((a, b) => a.branch.localeCompare(b.branch) || b.totalSale - a.totalSale);

  // Compute totals
  const totals = rows.reduce((sum, row) => ({
    batchAmount: sum.batchAmount + Number(row.batchAmount),
    totalSale: sum.totalSale + Number(row.totalSale),
    commission: sum.commission + Number(row.commission),
    difference: sum.difference + Number(row.difference),
    discountValue: sum.discountValue + Number(row.discountValue)
  }), { batchAmount: 0, totalSale: 0, commission: 0, difference: 0, discountValue: 0 });

  return {
    source: 'Closing Sheet → Closing 02 → Department-Wise Sale Report',
    startDate, endDate,
    branch: branch || 'All authorized branches',
    department: args.department || 'All departments',
    rows: rows.slice(0, 500),
    truncated: rows.length > 500,
    totals: {
      batchAmount: asMoney(totals.batchAmount),
      totalSale: asMoney(totals.totalSale),
      commission: asMoney(totals.commission),
      difference: asMoney(totals.difference),
      discountValue: asMoney(totals.discountValue)
    }
  };
}

// ---------------------------------------------------------------------------
// Daily Closing Sheet Summary Message
// Returns cash activity, bank activity, income statement, zakat, and
// department-wise sale activity for a given date and optional branch.
// ---------------------------------------------------------------------------
async function getClosingSheetDailySummary(req, args) {
  const date = isValidDate(args.date) ? args.date : karachiDate();
  const requestedBranch = args.branch || null;

  const dayRange = dateRangeInclusive(date, date);
  const dayStart = new Date(`${date}T00:00:00+05:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Build branch-filtered query for ClosingSheet
  let sheetQuery = { date: dayRange };
  if (requestedBranch) sheetQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  sheetQuery = await applyBranchFilter(req, sheetQuery, ClosingSheet);
  const sheets = await ClosingSheet.find(sheetQuery).lean();

  if (!sheets.length) {
    return { found: false, date, branch: requestedBranch || 'all authorized', message: `No closing sheet found for ${date}${requestedBranch ? ` — ${requestedBranch}` : ''}.` };
  }

  // --- CLOSING SHEET SUMMARY (closing01) ---
  const closing01Summary = sheets.map(sheet => ({
    branch: sheet.branch,
    openingCash: sheet.closing01?.openingCash || 0,
    receivedCash: sheet.closing01?.receivedCash || 0,
    counterCashTotal: sheet.closing01?.counterCashTotal || 0,
    totalClosing02: sheet.closing01?.totalClosing02 || 0,
    grandTotal: sheet.closing01?.grandTotal || 0
  }));

  // --- DEPT-WISE SALE ACTIVITY from closing02 ---
  const deptIds = new Set();
  sheets.forEach(sheet => {
    const data = sheet.closing02?.data || {};
    Object.keys(data).forEach(id => {
      if (!['warehouseSale', 'prevRecovery', 'commission'].includes(id) && mongoose.isValidObjectId(id)) {
        deptIds.add(id);
      }
    });
  });
  const depts = await Department.find({ _id: { $in: [...deptIds] } }).select('name').lean();
  const deptIdToName = new Map(depts.map(d => [d._id.toString(), (d.name || '').trim()]));

  const deptActivity = [];
  for (const sheet of sheets) {
    const data = sheet.closing02?.data || {};
    for (const [deptId, deptData] of Object.entries(data)) {
      if (['warehouseSale', 'prevRecovery', 'commission'].includes(deptId) || !deptData) continue;
      deptActivity.push({
        branch: sheet.branch,
        department: deptIdToName.get(deptId) || 'UNKNOWN',
        batchAmount: asMoney(parseFloat(deptData.counterClosing || deptData.batchAmount || 0)),
        totalSale: asMoney(parseFloat(deptData.totalSaleComputer || 0)),
        commission: asMoney(parseFloat(deptData.commission || 0)),
        difference: asMoney(parseFloat(deptData.difference || 0)),
        discountValue: asMoney(parseFloat(deptData.discountValue || 0))
      });
    }
  }

  // --- CASH ACTIVITY ---
  let cashQuery = { date: dayRange, mode: 'Cash' };
  if (requestedBranch) cashQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  cashQuery = await applyBranchFilter(req, cashQuery, CashSale);
  const cashSalesResult = await CashSale.aggregate([
    { $match: cashQuery },
    { $group: { _id: '$branch', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
  ]);

  // --- BANK ACTIVITY ---
  let bankQuery = { date: dayRange, mode: { $ne: 'Cash' } };
  if (requestedBranch) bankQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  bankQuery = await applyBranchFilter(req, bankQuery, CashSale);
  const bankSalesResult = await CashSale.aggregate([
    { $match: bankQuery },
    { $group: { _id: '$branch', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
  ]);

  // --- INCOME STATEMENT (Expenses & Receipts) ---
  let expQuery = { date: dayRange, type: 'expense' };
  if (requestedBranch) expQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  expQuery = await applyBranchFilter(req, expQuery, Expense);
  const expenses = await Expense.find(expQuery).select('branch description head subHead amount').lean();

  let recQuery = { date: dayRange, type: 'receipt' };
  if (requestedBranch) recQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  recQuery = await applyBranchFilter(req, recQuery, Expense);
  const receipts = await Expense.find(recQuery).select('branch description amount').lean();

  // --- ZAKAT ---
  let zakatQuery = { date: dayRange };
  if (requestedBranch) zakatQuery.branch = new RegExp(requestedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  zakatQuery = await applyBranchFilter(req, zakatQuery, Zakat);
  const zakatRecords = await Zakat.find(zakatQuery).select('branch type amount remarks zakatNo').lean();

  const zakatPay = zakatRecords.filter(z => z.type === 'Pay').reduce((s, z) => s + Number(z.amount || 0), 0);
  const zakatReceive = zakatRecords.filter(z => z.type === 'Receive').reduce((s, z) => s + Number(z.amount || 0), 0);

  // Summaries
  const totalCashSale = cashSalesResult.reduce((s, r) => s + r.total, 0);
  const totalBankSale = bankSalesResult.reduce((s, r) => s + r.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalReceipts = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalDeptSale = deptActivity.reduce((s, d) => s + Number(d.totalSale), 0);

  return {
    found: true,
    date,
    branch: requestedBranch || 'All authorized',
    // Cash Activity
    cashActivity: {
      totalSale: asMoney(totalCashSale),
      byBranch: cashSalesResult.map(r => ({ branch: r._id, total: asMoney(r.total), count: r.count }))
    },
    // Bank Activity
    bankActivity: {
      totalSale: asMoney(totalBankSale),
      byBranch: bankSalesResult.map(r => ({ branch: r._id, total: asMoney(r.total), count: r.count }))
    },
    // Income Statement
    incomeStatement: {
      totalExpenses: asMoney(totalExpenses),
      totalReceipts: asMoney(totalReceipts),
      netIncome: asMoney(totalReceipts - totalExpenses),
      expenses: expenses.map(e => ({ branch: e.branch, description: e.description, head: e.head, subHead: e.subHead, amount: asMoney(e.amount) })),
      receipts: receipts.map(r => ({ branch: r.branch, description: r.description, amount: asMoney(r.amount) }))
    },
    // Zakat
    zakat: {
      totalPay: asMoney(zakatPay),
      totalReceive: asMoney(zakatReceive),
      records: zakatRecords.map(z => ({ branch: z.branch, type: z.type, amount: asMoney(z.amount), remarks: z.remarks, no: z.zakatNo }))
    },
    // Department-Wise Sale Activity
    departmentActivity: {
      totalSale: asMoney(totalDeptSale),
      rows: deptActivity.sort((a, b) => a.branch.localeCompare(b.branch) || b.totalSale - a.totalSale)
    },
    // Closing01 summary
    closing01Summary
  };
}

async function getPaymentReport(req, args) {
  const { startDate, endDate, date } = reportDates(args);
  const { query: closingSheetQuery, branch } = await reportQueryForBranch(req, ClosingSheet, date, args.branch);
  const voucherAllowedQuery = await applyBranchFilter(req, { date }, Voucher);
  const query = branch ? { ...voucherAllowedQuery, branch } : voucherAllowedQuery;
  if (args.voucherType) query.voucherType = args.voucherType;
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
  const [vouchers, sheets] = await Promise.all([
    Voucher.find(query).select('voucherNo voucherType date branch entries').sort({ date: -1 }).limit(10001).lean(),
    ClosingSheet.find(closingSheetQuery).select('branch closing02.data.warehouseSale').lean()
  ]);
  const categoryIds = new Set(sheets.flatMap(sheet => (sheet.closing02?.data?.warehouseSale || []).map(row => String(row.category)).filter(Boolean)));
  const categories = await PartyCategory.find({ _id: { $in: [...categoryIds] } }).select('name').lean();
  const categoryNames = new Map(categories.map(category => [String(category._id), category.name]));
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const requestedCategory = normalize(args.category);
  const rows = new Map();
  const add = (category, branch, field, amount) => { if (requestedCategory && !normalize(category).includes(requestedCategory)) return; const key = `${category}|${branch}`; const row = rows.get(key) || { category, branch, sales: 0, cost: 0, paid: 0 }; row[field] += Number(amount || 0); rows.set(key, row); };
  sheets.forEach(sheet => (sheet.closing02?.data?.warehouseSale || []).forEach(row => add(categoryNames.get(String(row.category)) || 'Unknown Category', sheet.branch || '-', 'sales', row.sale) || add(categoryNames.get(String(row.category)) || 'Unknown Category', sheet.branch || '-', 'cost', row.cost)));
  vouchers.forEach(voucher => (voucher.entries || []).filter(entry => entry.detail === 'Category Wise Payment').forEach(entry => add(entry.account || 'Unknown Category', voucher.branch || '-', 'paid', entry.debit)));
  const resultRows = [...rows.values()].map(row => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? asMoney(value) : value])), balance: asMoney(row.cost - row.paid) })).sort((a, b) => b.sales - a.sales);
  return { source: 'Payment Reports (Closing Sheets warehouse sale + Category Wise Payment vouchers)', startDate, endDate, count: Math.min(resultRows.length, limit), truncated: resultRows.length > limit, rows: resultRows.slice(0, limit) };
}

async function findWHCustomer(search) {
  const value = String(search || '').trim();
  if (value.length < 2) throw new Error('Provide at least two characters of the warehouse customer name or code.');
  const pattern = new RegExp(escapeRegex(value), 'i');
  const customer = await WHCustomer.findOne({ $or: [{ customerName: pattern }, { code: pattern }] }).select('customerName code currentBalance customerCategory').lean();
  if (!customer) throw new Error('Warehouse customer not found.');
  return customer;
}

async function getWHCustomerBalanceReport(req, args) {
  const query = await applyBranchFilter(req, args.branch ? { branch: args.branch } : {}, WHCustomer);
  if (args.customerName) query.customerName = new RegExp(escapeRegex(args.customerName), 'i');
  else if (args.search) query.$or = [{ customerName: new RegExp(escapeRegex(args.search), 'i') }, { code: new RegExp(escapeRegex(args.search), 'i') }];

  // A customer category is part of the customer master record.  It is not an
  // item/product category, so aggregate the actual customer balances here
  // instead of asking the model to infer categories from sales history.
  if (['category', 'branch'].includes(args.groupBy)) {
    const customers = await WHCustomer.find(query)
      .populate('customerCategory', 'name')
      .populate('branch', 'name')
      .select('customerName currentBalance customerCategory branch')
      .lean();
    const grouped = new Map();
    for (const customer of customers) {
      const group = args.groupBy === 'category'
        ? customer.customerCategory?.name || 'Uncategorized'
        : customer.branch?.name || 'Unassigned Branch';
      const row = grouped.get(group) || { [args.groupBy]: group, customers: 0, balance: 0, details: [] };
      row.customers += 1;
      const balance = asMoney(customer.currentBalance);
      row.balance += balance;
      row.details.push({
        customer: customer.customerName || '', balance,
        status: balance === 0 ? 'Settled' : balance > 0 ? 'Pending' : 'Credit'
      });
      grouped.set(group, row);
    }
    const rows = [...grouped.values()]
      .map(row => ({ ...row, balance: asMoney(row.balance), details: row.details.sort((a, b) => a.customer.localeCompare(b.customer)) }))
      .sort((a, b) => b.balance - a.balance || a[args.groupBy].localeCompare(b[args.groupBy]));
    return {
      source: 'WH Customer Balance Report', groupBy: args.groupBy,
      count: rows.length, customerCount: customers.length,
      totalBalance: asMoney(rows.reduce((sum, row) => sum + row.balance, 0)), rows
    };
  }

  const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 200);
  const customers = await WHCustomer.find(query).populate('customerCategory', 'name').populate('branch', 'name').select('customerName currentBalance customerCategory branch').sort({ customerName: 1 }).limit(limit + 1).lean();
  const rows = customers.slice(0, limit).filter(customer => !args.balanceOnly || Number(customer.currentBalance || 0) !== 0).map(customer => ({ customer: customer.customerName, category: customer.customerCategory?.name || '', branch: customer.branch?.name || '', balance: asMoney(customer.currentBalance) }));
  return { source: 'WH Customer Balance Report', count: rows.length, truncated: customers.length > limit, rows };
}

async function getWHCustomerSalesOrPaymentReport(req, args, reportType) {
  // WHSale does not store a branch directly.  First restrict the customer set
  // to the signed-in user's allowed branches, then use only those invoices.
  const customerQuery = await applyBranchFilter(req, {}, WHCustomer);
  const customerIds = (await WHCustomer.find(customerQuery).select('_id').lean()).map(customer => customer._id);
  const query = { status: 'Posted', customer: { $in: customerIds } };
  if (isValidDate(args.startDate) || isValidDate(args.endDate)) {
    const startDate = isValidDate(args.startDate) ? args.startDate : args.endDate;
    const endDate = isValidDate(args.endDate) && args.endDate >= startDate ? args.endDate : startDate;
    query.invoiceDate = dateRangeInclusive(startDate, endDate);
  }
  const invoices = await WHSale.find(query)
    .populate({ path: 'customer', select: 'customerName customerCategory', populate: { path: 'customerCategory', select: 'name' } })
    .select('customer netTotal paidAmount invoiceBalance')
    .limit(10001)
    .lean();
  const totals = new Map();
  for (const invoice of invoices.slice(0, 10000)) {
    if (!invoice.customer) continue;
    const category = invoice.customer.customerCategory?.name || 'Uncategorized';
    const customer = invoice.customer.customerName || 'Unknown Customer';
    const key = `${category}|${String(invoice.customer._id)}`;
    const row = totals.get(key) || { category, customer, invoices: 0, sales: 0, paid: 0, balance: 0 };
    row.invoices += 1;
    row.sales += Number(invoice.netTotal || 0);
    row.paid += Number(invoice.paidAmount || 0);
    row.balance += Number(invoice.invoiceBalance || 0);
    totals.set(key, row);
  }
  const groups = new Map();
  for (const row of totals.values()) {
    const group = groups.get(row.category) || { category: row.category, invoices: 0, sales: 0, paid: 0, balance: 0, customers: [] };
    group.invoices += row.invoices;
    group.sales += row.sales;
    group.paid += row.paid;
    group.balance += row.balance;
    group.customers.push({ customer: row.customer, invoices: row.invoices, sales: asMoney(row.sales), paid: asMoney(row.paid), balance: asMoney(row.balance) });
    groups.set(row.category, group);
  }
  const rows = [...groups.values()]
    .map(group => ({ ...group, sales: asMoney(group.sales), paid: asMoney(group.paid), balance: asMoney(group.balance), customers: group.customers.sort((a, b) => b[reportType === 'payment' ? 'paid' : 'sales'] - a[reportType === 'payment' ? 'paid' : 'sales'] || a.customer.localeCompare(b.customer)) }))
    .sort((a, b) => b[reportType === 'payment' ? 'paid' : 'sales'] - a[reportType === 'payment' ? 'paid' : 'sales'] || a.category.localeCompare(b.category));
  return {
    source: reportType === 'payment' ? 'Warehouse Customer Payment Report (Posted WH Sales)' : 'Warehouse Customer Sales Report (Posted WH Sales)',
    groupBy: 'customer registration category', reportType,
    count: rows.length, invoiceCount: rows.reduce((sum, row) => sum + row.invoices, 0),
    totalSales: asMoney(rows.reduce((sum, row) => sum + row.sales, 0)),
    totalPaid: asMoney(rows.reduce((sum, row) => sum + row.paid, 0)),
    totalBalance: asMoney(rows.reduce((sum, row) => sum + row.balance, 0)),
    truncated: invoices.length > 10000, rows
  };
}

async function getWHCustomerLedgerReport(req, args) {
  const customer = await findWHCustomer(args.customer);
  const { startDate, endDate, date } = reportDates(args);
  const entries = await WHLedger.find({ customer: customer._id, date }).select('date description refType debit credit runningBalance').sort({ date: 1, createdAt: 1 }).limit(501).lean();
  const before = await WHLedger.aggregate([{ $match: { customer: customer._id, date: { $lt: date.$gte } } }, { $group: { _id: null, balance: { $sum: { $subtract: ['$debit', '$credit'] } } } }]);
  return { source: 'WH Customer Ledger Report', customer: customer.customerName, code: customer.code, startDate, endDate, openingBalance: asMoney(before[0]?.balance), count: Math.min(entries.length, 500), truncated: entries.length > 500, entries: entries.slice(0, 500) };
}

async function getWHStockPositionReport(req, args) {
  const query = { isActive: { $ne: false } };
  if (args.search) query.$or = [{ itemsCode: new RegExp(escapeRegex(args.search), 'i') }, { barcode: new RegExp(escapeRegex(args.search), 'i') }, { name: new RegExp(escapeRegex(args.search), 'i') }];
  const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 200);
  const items = await WHItem.find(query).populate('category', 'name').populate('company', 'name').select('itemsCode barcode name category company costPrice salePrice retailPrice incentive stock').sort({ seqId: 1, name: 1 }).limit(limit + 1).lean();
  let rows = items.slice(0, limit).map(item => ({ code: item.barcode || item.itemsCode, item: item.name, company: item.company?.name || '', category: item.category?.name || '', stock: asMoney((item.stock || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)), costPrice: asMoney(item.costPrice), salePrice: asMoney(item.salePrice), retailPrice: asMoney(item.retailPrice) }));
  if (args.category) rows = rows.filter(row => row.category.toLowerCase().includes(String(args.category).toLowerCase()));
  if (args.criteria === 'zero') rows = rows.filter(row => row.stock === 0);
  if (args.criteria === 'greater') rows = rows.filter(row => row.stock > 0);
  if (args.criteria === 'less') rows = rows.filter(row => row.stock < 0);
  return { source: 'WH Stock Position Report', count: rows.length, truncated: items.length > limit, rows };
}

async function getWHItemLedgerReport(req, args) {
  const item = await WHItem.findOne({ $or: [{ name: new RegExp(escapeRegex(String(args.item || '')), 'i') }, { itemsCode: new RegExp(escapeRegex(String(args.item || '')), 'i') }, { barcode: new RegExp(escapeRegex(String(args.item || '')), 'i') }] }).select('name itemsCode barcode stock').lean();
  if (!item) throw new Error('Warehouse item not found.');
  const { startDate, endDate, date } = reportDates(args);
  const logs = await WHStockLog.find({ item: item._id, date }).select('date refId refType remarks qty type previousQty newQty').sort({ date: 1, createdAt: 1 }).limit(501).lean();
  const previous = await WHStockLog.findOne({ item: item._id, date: { $lt: date.$gte } }).sort({ date: -1, createdAt: -1 }).lean();
  return { source: 'WH Item Ledger Report', item: item.name, code: item.barcode || item.itemsCode, startDate, endDate, openingBalance: asMoney(previous?.newQty || item.stock?.[0]?.opening || 0), count: Math.min(logs.length, 500), truncated: logs.length > 500, entries: logs.slice(0, 500).map(log => ({ date: log.date, reference: log.refId, type: log.refType, description: log.remarks || log.refType, quantityIn: log.type === 'in' ? Math.abs(log.qty) : 0, quantityOut: log.type === 'out' ? Math.abs(log.qty) : 0, balance: log.newQty })) };
}

async function getWHStockActivityReport(req, args) {
  const { startDate, endDate, date } = reportDates(args);
  const itemQuery = { isActive: { $ne: false } };
  if (args.search) itemQuery.$or = [{ name: new RegExp(escapeRegex(args.search), 'i') }, { itemsCode: new RegExp(escapeRegex(args.search), 'i') }];
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
  const items = await WHItem.find(itemQuery).select('name itemsCode stock').sort({ name: 1 }).limit(limit + 1).lean();
  const itemIds = items.slice(0, limit).map(item => item._id);
  const logs = await WHStockLog.find({ item: { $in: itemIds }, date }).select('item refType type qty').lean();
  const grouped = new Map(itemIds.map(id => [String(id), { purchases: 0, sales: 0, returns: 0, adjustments: 0 }]));
  for (const log of logs) { const row = grouped.get(String(log.item)); const quantity = Number(log.qty || 0); if (log.refType === 'purchase') row.purchases += log.type === 'in' ? quantity : -quantity; else if (log.refType === 'sale') row.sales += log.type === 'out' ? quantity : -quantity; else if (log.refType === 'sales_return') row.returns += log.type === 'in' ? quantity : -quantity; else if (log.refType === 'purchase_return') row.returns -= log.type === 'out' ? quantity : -quantity; else if (log.refType === 'audit') row.adjustments += log.type === 'out' ? -quantity : quantity; }
  return { source: 'WH Stock Activity Report', startDate, endDate, count: itemIds.length, truncated: items.length > limit, rows: items.slice(0, limit).map(item => { const activity = grouped.get(String(item._id)); const closing = (item.stock || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0); return { item: item.name, code: item.itemsCode, purchases: asMoney(activity.purchases), sales: asMoney(activity.sales), returns: asMoney(activity.returns), adjustments: asMoney(activity.adjustments), currentStock: asMoney(closing) }; }) };
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

  // Apply the requested date range to the same date column the user selected.
  // A cheque date may be absent on older records, so use the posting date for
  // those records when cheque-date filtering is requested.
  const requestedDateField = dateField === 'posting' ? 'date' : 'chequeDate';
  const startDate = args.startDate ? new Date(`${args.startDate}T00:00:00.000Z`) : null;
  const endDate = args.endDate ? new Date(`${args.endDate}T23:59:59.999Z`) : null;
  if ((startDate && !Number.isNaN(startDate.getTime())) || (endDate && !Number.isNaN(endDate.getTime()))) {
    const dateRange = {};
    if (startDate && !Number.isNaN(startDate.getTime())) dateRange.$gte = startDate;
    if (endDate && !Number.isNaN(endDate.getTime())) dateRange.$lte = endDate;
    if (requestedDateField === 'chequeDate') {
      clauses.push({ $or: [{ chequeDate: dateRange }, { chequeDate: null, date: dateRange }] });
    } else {
      clauses.push({ date: dateRange });
    }
  }

  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\s-]+/g, '[-\\s]*'), 'i');
    clauses.push({ branch: branchPattern });
  }
  if (args.search) {
    const escaped = String(args.search).trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pattern = new RegExp(escaped, 'i');
    clauses.push({ $or: [{ invoiceNo: pattern }, { narration: pattern }, { bankName: pattern }] });
  }

  const transactions = await BankTransaction.find(clauses.length === 1 ? clauses[0] : { $and: clauses })
    .populate('department', 'name')
    .sort({ chequeDate: -1, date: -1 })
    .limit(Math.min(Math.max(Number(args.limit) || 500, 1), 500))
    .lean();

  return {
    found: transactions.length > 0,
    source: 'Bank Detail — Bank Payment',
    direction, status, count: transactions.length,
    totalAmount: transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0),
    transactions: transactions.map(transaction => ({
      postDate: transaction.date, chequeDate: transaction.chequeDate || transaction.date,
      invoiceDate: transaction.invoiceDate || null, bank: transaction.bankName,
      account: transaction.bankAccount, branch: transaction.branch,
      department: transaction.department?.name,
      chequeNo: transaction.invoiceNo || null,
      amount: transaction.amount,
      status: transaction.isVerified ? 'Verified' : 'Unverified', verifiedDate: transaction.verifiedDate || null,
      remarks: transaction.narration,
      recordType: 'Bank Payment / Cheque'
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
      const escaped = String(args.batchNo).trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      query.batchNo = new RegExp(escaped, 'i');
  }

  if (args.branch) {
    const branchPattern = new RegExp(String(args.branch).trim().replace(/[\s-]+/g, '[-\\s]*'), 'i');
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
    const branchPattern = new RegExp(String(args.branch).trim().replace(/([a-zA-Z])([0-9])/g, '$1-$2').replace(/[\s-]+/g, '[-\\s]*'), 'i');
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

  let summary = '### Pending Cheques\n\n| Date | Bank | Branch | Check # | Amount | Status | Details |\n|---|---|---|---|---|---|---|\n';
  cheques.forEach(c => {
    const dateStr = new Date(c.date).toLocaleDateString();
    const bName = c.bank ? c.bank.bankName : '';
    summary += `| ${dateStr} | ${bName} | ${c.branch || ''} | ${c.checkNumber} | ${c.amount} | Pending | ${c.details || ''} |\n`;
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
    const branchPattern = new RegExp(String(args.branch).trim().replace(/([a-zA-Z])([0-9])/g, '$1-$2').replace(/[\s-]+/g, '[-\\s]*'), 'i');
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
    summary: `### Bank Summary\n\n**Total Deposits**: ${deposits.toLocaleString()}\n**Total Withdrawals**: ${withdrawals.toLocaleString()}\n**Estimated Balance**: ${balance.toLocaleString()}`,
    deposits,
    withdrawals,
    balance
  };
}


async function getSalarySlip(req, args) {
  const search = String(args.search || '').trim();
  const monthYear = String(args.monthYear || '').trim();
  if (search.length < 2 || !monthYear) throw new Error('Provide an employee name or code and a month such as June 2026.');
  const pattern = new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
  const legacyBaseQuery = await applyBranchFilter(req, { monthYear, $or: [{ employeeCode: pattern }, { employeeName: pattern }] }, LegacyPayroll);
  const branchPattern = args.branch
    ? new RegExp(String(args.branch).replace(/\bbranch\b/gi, '').trim().replace(/([a-zA-Z])([0-9])/g, '$1-$2').replace(/[\s-]+/g, '[-\\s]*'), 'i')
    : null;
  const query = branchPattern ? { $and: [legacyBaseQuery, { branch: branchPattern }] } : legacyBaseQuery;
  const records = await LegacyPayroll.find(query).select('employeeCode employeeName monthYear branch netSalary pageNumber').sort({ employeeName: 1 }).limit(5).lean();
  if (records.length) {
    return { found: true, slips: records.map(record => ({ employeeCode: record.employeeCode, employeeName: record.employeeName, monthYear: record.monthYear, branch: record.branch, netSalary: record.netSalary, downloadUrl: `/api/v1/legacy-payroll/view-slip?code=${encodeURIComponent(record.employeeCode)}&monthYear=${encodeURIComponent(record.monthYear)}` })) };
  }
  const parsedMonth = new Date(`${monthYear} 1`);
  const payrollMonth = Number.isNaN(parsedMonth.getTime()) ? '' : `${parsedMonth.getFullYear()}-${String(parsedMonth.getMonth() + 1).padStart(2, '0')}`;
  if (!payrollMonth) return { found: false, message: `I could not understand the payroll month ${monthYear}.` };
  // Payroll stores the employee's display name on the related Employee document,
  // while `code` only contains the payroll/employee code. Resolve name searches
  // first so requests such as "Waseem, PWD-1, May 2026" find modern slips too.
  const employeeNameQuery = await applyBranchFilter(req, {
    $or: [{ code: pattern }, { name: pattern }]
  }, Employee);
  let matchingEmployees = await Employee.find(employeeNameQuery).select('_id').limit(50).lean();

  if (!matchingEmployees.length) {
    const nameWords = search.split(/\s+/).filter(word => word.length > 1 && !/^muhammad$/i.test(word));
    for (const word of nameWords) {
      const fallbackQuery = await applyBranchFilter(req, { $or: [{ code: new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }, { name: new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }] }, Employee);
      matchingEmployees = await Employee.find(fallbackQuery).select('_id').limit(50).lean();
      if (matchingEmployees.length) break;
    }
  }

  const payrollEmployeeIds = matchingEmployees.map(employee => employee._id);
  const newPayrollSearch = payrollEmployeeIds.length
    ? { $or: [{ code: pattern }, { employee: { $in: payrollEmployeeIds } }] }
    : { code: pattern };
  const newPayrollBaseQuery = await applyBranchFilter(req, { monthYear: payrollMonth, ...newPayrollSearch }, Payroll);
  const newPayrollQuery = branchPattern ? { $and: [newPayrollBaseQuery, { branch: branchPattern }] } : newPayrollBaseQuery;
  const newPayrollRecords = await Payroll.find(newPayrollQuery).populate('employee', 'name').select('code employee monthYear branch netTotal').sort({ code: 1 }).limit(5).lean();
  if (!newPayrollRecords.length) return { found: false, message: `No salary slip was found for ${search} in ${monthYear}.` };
  return { found: true, slips: newPayrollRecords.map(record => ({ employeeCode: record.code, employeeName: record.employee?.name, monthYear, branch: record.branch, netSalary: record.netTotal, downloadUrl: `/print-payroll?id=${encodeURIComponent(record._id)}`, isPrintPage: true })) };
}

async function getCommissionHistory(req, args) {
  const { branch, month, year, type, department, employee } = args || {};
  if (!branch || !month || !year) throw new Error('Provide branch, month, and year for the commission history.');
  
  // The AI tool schema intentionally accepts natural language months (e.g.
  // "May"), while EmployeeCommission stores periods as YYYY-MM.
  const monthNames = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  const normalizedMonth = String(month).trim().toLowerCase();
  const monthNumber = monthNames[normalizedMonth]
    || monthNames[normalizedMonth.slice(0, 3) === 'sep' ? 'september' : normalizedMonth]
    || Number(normalizedMonth);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error('Provide a valid month number or month name.');
  }
  const monthString = String(monthNumber).padStart(2, '0');
  const monthYear = `${year}-${monthString}`;
  
  const isUG = String(type || '').toUpperCase() === 'UG';
  
  try {
    const CommissionBranch = require('../models/CommissionBranch');
    const EmployeeCommission = require('../models/EmployeeCommission');
    
    const query = { monthYear };
    if (isUG) query.type = 'sale_commission';
    
    const cb = await CommissionBranch.findOne({ name: { $regex: new RegExp(branch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') } });
    
    if (cb) {
        query.$or = [
            { commissionBranch: cb._id },
            { branch: { $regex: new RegExp(branch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') } }
        ];
    } else {
        query.branch = { $regex: new RegExp(branch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') };
    }
    
    if (department) query.department = { $regex: new RegExp(department, 'i') };
    
    let records = await EmployeeCommission.find(query).populate('commissionBranch', 'name').lean();

    // A parent branch can contain more than one UG commission sheet. Resolve
    // the requested branch to its own commission branch (e.g. Ghouri Town →
    // G.T, Chandni Chowk → CH-CK, Giga Mall → GIGA) before returning data.
    if (isUG) {
      const requestedName = String(branch).toLowerCase().replace(/[^a-z0-9]/g, '');
      const requestedInitials = (String(branch).match(/[a-z0-9]+/gi) || [])
        .map(part => part.charAt(0)).join('').toLowerCase();
      const scoreCommissionBranch = (commissionBranchName) => {
        const parts = (String(commissionBranchName).match(/[a-z0-9]+/gi) || [])
          .map(part => part.toLowerCase())
          .filter(part => part !== 'dw');
        const code = parts.join('');
        const codeInitials = parts.map(part => part.charAt(0)).join('');
        if (!code) return 0;
        if (code === requestedName) return 100;
        if (requestedName.includes(code) || code.includes(requestedName)) return 80;
        if (requestedInitials.length > 1 && codeInitials === requestedInitials) return 70;
        return 0;
      };
      const scores = records.map(record => scoreCommissionBranch(record.commissionBranch?.name));
      const bestScore = Math.max(0, ...scores);
      if (bestScore > 0) records = records.filter((record, index) => scores[index] === bestScore);
    }
    
    if (!records || records.length === 0) {
        return { found: false, message: `Could not find any commission data for branch ${branch} in ${monthYear}.` };
    }
    
    let returnData = [];
    for (const rec of records) {
        let filteredData = rec.data;
        if (employee) {
            const empRegex = new RegExp(employee, 'i');
            filteredData = filteredData.filter(d => empRegex.test(d.name) || empRegex.test(d.code));
        }
        
        if (filteredData.length > 0) {
            returnData.push({
                _id: rec._id,
                monthYear: rec.monthYear,
                branch: rec.branch,
                commissionBranchName: rec.commissionBranch?.name || rec.commissionBranch,
                department: rec.department,
                type: rec.type,
                data: filteredData
            });
        }
    }
    
    if (returnData.length === 0) {
        return { found: false, message: `Found commission records, but no data matched employee '${employee}'.` };
    }
    
    // The UG print report rounds each row before adding its totals. Return the
    // same employee summary so an AI answer cannot disagree with the report.
    const printSummary = isUG
      ? Object.values(returnData.reduce((summary, record) => {
        for (const row of record.data) {
          const key = row.id || row.code || row.name;
          if (!summary[key]) {
            summary[key] = {
              employee: row.name || 'Unknown employee',
              code: row.code || '',
              commissionBranch: record.commissionBranchName,
              commission: 0,
              totalCommission: 0
            };
          }
          summary[key].commission += Math.round(Number(row.commission) || 0);
          summary[key].totalCommission += Math.round(Number(row.totalData) || 0);
        }
        return summary;
      }, {}))
      : undefined;

    return {
      found: true,
      source: 'database',
      data: returnData,
      ...(printSummary ? {
        printSummary,
        printSummaryNote: 'For UG commission, use printSummary values exactly. Commission is the print report Commission column; totalCommission is its separate Total Commission column. Each source row is rounded before it is added.'
      } : {}),
      ...(isUG && returnData.length === 1 ? { printUrl: `/employee-sale-commission?printId=${encodeURIComponent(returnData[0]._id)}` } : {})
    };
  } catch (error) {
    return { found: false, message: `Could not fetch commission data: ${error.message}` };
  }
}

const toolDefinitions = [
  { type: 'function', function: { name: 'get_late_employees', description: 'Get employees who checked in later than their assigned start time for a business date. Use this for late, tardy, or attendance punctuality questions.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'Date in YYYY-MM-DD. Defaults to today in Asia/Karachi.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_employees_with_no_checkins', description: 'List active employees in a branch who have no valid check-in record at all during an inclusive date range. Use for absent-all-month, no attendance, or did not check in questions. This does not count employees who checked in even once.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Employee branch name, for example Ghouri Town.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' } }, required: ['branch', 'startDate', 'endDate'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_monthly_absence_summary', description: 'Summarize attendance absences for a date range: total active employees, employees with one or more recorded absences, total absent days, most absent employees, and employees with no check-in at all. Use for monthly absence summaries, most absent employee, or absent-day counts. When the user asks for employees absent N days or more, set minAbsentDays to N. Branch is optional.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional employee branch name, for example Ghouri Town.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' }, minAbsentDays: { type: 'integer', minimum: 1, description: 'Optional minimum recorded absent days, inclusive. Use for phrases such as 6 or more absences.' } }, required: ['startDate', 'endDate'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_employee_current_advance_report', description: 'List employees who received a salary advance during an inclusive date range, optionally for a branch. Use for staff advance, current advance, salary advance, advance list, or advance taken in a month. Return the current-period advance together with opening balance, salary recovery, and remaining balance.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional employee branch name, for example PWD-1.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' } }, required: ['startDate', 'endDate'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_sales_summary', description: 'Get an aggregate cash-sales summary for an inclusive date range. Use this for sales total, sales report, revenue, invoice count, or average invoice questions.', parameters: { type: 'object', properties: { startDate: { type: 'string', description: 'Start date in YYYY-MM-DD. Defaults to today.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD. Defaults to startDate.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_sales_department_report', description: 'Get the same Closing Sheet based Sales Report shown on the Sales Report screen, grouped by department/category. Use for requests such as "medicine category sales for July". Always include startDate and endDate when the user gives a period.', parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, branch: { type: 'string' }, category: { type: 'string', description: 'Department or category name, for example Medicine.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_payment_report', description: 'Get the same category/branch Sales, Cost, Paid and Balance data shown by Payment Reports. Its sources are Closing Sheet warehouse sales and Category Wise Payment vouchers.', parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, branch: { type: 'string' }, category: { type: 'string' }, voucherType: { type: 'string', enum: ['JV', 'CRV', 'CPV', 'BPV', 'BRV'] }, limit: { type: 'integer' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_customer_sales_report', description: 'For sales, get Closing Sheet → Closing 02 → Warehouse Sale entries grouped by branch and category; this source has no individual customer invoices. For payments, get posted warehouse payments grouped by customer registration category and customer. If the user states a month, send its first and last dates.', parameters: { type: 'object', properties: { reportType: { type: 'string', enum: ['sales', 'payment'] }, startDate: { type: 'string' }, endDate: { type: 'string' } }, required: ['reportType'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_customer_balance_report', description: 'Get warehouse customer balances. Use groupBy="category" to list every customer under their registration category, with category customer count and total balance; use groupBy="branch" for the same detailed grouping by branch. This is not a product/item-category report.', parameters: { type: 'object', properties: { search: { type: 'string' }, branch: { type: 'string' }, groupBy: { type: 'string', enum: ['category', 'branch'] }, balanceOnly: { type: 'boolean' }, limit: { type: 'integer' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_customer_ledger_report', description: 'Get a warehouse customer ledger with opening balance and transaction detail for an inclusive date range.', parameters: { type: 'object', properties: { customer: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' } }, required: ['customer'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_stock_position_report', description: 'Get warehouse stock position, prices, category and current stock. Use for stock position or inventory availability questions.', parameters: { type: 'object', properties: { search: { type: 'string' }, category: { type: 'string' }, criteria: { type: 'string', enum: ['all', 'zero', 'greater', 'less'] }, limit: { type: 'integer' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_item_ledger_report', description: 'Get the warehouse item ledger including opening stock, dated ins, outs and balances.', parameters: { type: 'object', properties: { item: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' } }, required: ['item'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_wh_stock_activity_report', description: 'Get warehouse stock activity by item: purchases, sales, returns and adjustments for an inclusive date range.', parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_employee_information', description: 'Get complete ERP employee information, including contact, employment, payroll, banking, and duty schedule details. When the user mentions a branch, you MUST send it in branch so a same-named employee from another branch is never returned.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code to look up. Do not include the branch in this value.' }, branch: { type: ['string', 'null'], description: 'Employee branch mentioned by the user, for example PWD-1.' }, limit: { type: 'integer', description: 'Maximum matching employees to return, between 1 and 25. Defaults to 10.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_employee_ledger_report', description: 'Get an employee ledger with advances, returns, adjustments, and payroll transactions for an inclusive date range.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or code.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_salary_date_range_report', description: 'Get historical salary records (payroll data) for a specific employee over a date range. Use when asked for salary from to date.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or code.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_employee_salary_report', description: 'Get a report of employees filtered by salary range, branch, and department. Use when the user asks for employees with salaries greater than, less than, or within a range, optionally filtered by branch or department.', parameters: { type: 'object', properties: { minSalary: { type: 'number', description: 'Minimum basic salary (inclusive).' }, maxSalary: { type: 'number', description: 'Maximum basic salary (inclusive).' }, branch: { type: 'string', description: 'Branch name, e.g. Ghouri Town.' }, department: { type: 'string', description: 'Department name, e.g. Grocery.' }, limit: { type: 'integer', description: 'Maximum results, defaults to 50.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_salary_slip', description: 'Retrieve an existing indexed salary-slip PDF for an employee and month. Use when the user asks to download, open, view, or get a salary slip or payslip. If the user mentions a branch, you MUST pass it separately in branch and MUST NOT append it to search.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code only; exclude branch words.' }, branch: { type: ['string', 'null'], description: 'Branch stated by the user, for example PWD-1.' }, monthYear: { type: 'string', description: 'Payroll month in Month YYYY format, for example June 2026.' } }, required: ['search', 'monthYear'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_users_list', description: 'Retrieve a list of ERP system users, optionally filtered by active or inactive status. Use when asked for a list of users or people with access.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'active', 'inactive'], description: 'Filter users by status. Defaults to all.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_information', description: 'Get details about an inventory item, including stock quantity, sale price, and purchase price. Use when asked about item details, stock levels, or pricing.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' }, limit: { type: 'integer', description: 'Maximum results, defaults to 10.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_sale_history', description: 'Get the recent sale history for a specific item. Use when asked how much an item was sold for, who bought it, or its sales ledger.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_item_purchase_history', description: 'Get the recent purchase history for a specific item. Use when asked who we bought an item from or purchase history.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Item name or SKU.' } }, required: ['search'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_last_purchase_invoice', description: 'Retrieve the overall most recent purchase invoice across all items and suppliers in the system. Use when the user asks for the last purchase invoice, latest purchase, or recent purchase entry without specifying an item.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_employee_attendance_sheet', description: 'Retrieve a full month attendance sheet PDF for a specific employee. Use when the user asks to see a full attendance sheet, monthly attendance, or attendance report for an employee.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or employee code.' }, monthYear: { type: 'string', description: 'Month and year, for example June 2026.' } }, required: ['search', 'monthYear'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_employee_checkin', description: 'Get employee attendance details: check-in time, check-out time, worked hours, timing sheet. Also lists late or absent employees for a date. Use for ANY attendance/hazri/check-in question about a specific employee. Roman Urdu guide: "ag/aaj"=today, "kal"=yesterday, "hazri"=attendance, "check in time btao"=get check-in time, "k employee / ka employee"=employee of that branch, "pwd branch k"=PWD branch, "F-6 wala"=F-6 branch. Extract: employee name or code from the message (ignore branch words, urdu words, date words), branch name if mentioned, date (ag/aaj=today, kal=yesterday). Examples: "muhammad waseem pwd branch k employee ka check in time btao ag ka" → search="muhammad waseem", branch="pwd", startDate=today. "3428 ki hazri kal" → search="3428", startDate=yesterday. "ali ka aaj check in" → search="ali", startDate=today.', parameters: { type: 'object', properties: { search: { type: 'string', description: 'Employee name or code. Required for single/range queries. Omit for late/absent lists.' }, queryType: { type: 'string', enum: ['single', 'range', 'late', 'absent'], description: 'single=one employee one day, range=one employee date range, late=all late employees for a date, absent=all absent employees for a date. Default: single.' }, startDate: { type: 'string', description: 'Date or start date in YYYY-MM-DD. Defaults to today.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD for range queries.' }, branch: { type: 'string', description: 'Optional branch name to narrow search when multiple employees share the same name. Extract from phrases like "pwd branch", "F-6 wala", "Attock branch k".' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_daily_cash_batches', description: 'Get Daily Closing Sheet / Daily Cash batch details. Use this first for bank deduction, batch transfer, daily cash, or unverified batch questions. It is the source of the red Bank Deduction rows in Bank Management.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status. Use unverified for red pending batch rows.' }, branch: { type: 'string', description: 'Branch name, for example PWD-1.' }, mode: { type: 'string', enum: ['all', 'Bank', 'Cash'], description: 'Daily Cash mode. Use Bank for bank deductions and transfers.' }, batchNo: { type: 'string', description: 'Optional batch number.' }, limit: { type: 'integer', description: 'Maximum records, from 1 to 200. Defaults to 100.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_payment_details', description: 'Get the same records shown in Bank Detail → Bank Payment. For any cheque request (including unverified, verified, pending, paid, or cheque detail), direction MUST be "paid". This returns only withdrawal/cheque rows—the same red unverified Bank Payment rows—and never deposits. Include chequeNo and remarks in the response. Use direction "received" only when the user explicitly asks for deposits. Never use "all" unless the user explicitly asks for both cheques and deposits.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status.' }, direction: { type: 'string', enum: ['all', 'paid', 'received'], description: 'Use "paid" only for cheque/withdrawal requests; "received" only for deposit requests.' }, branch: { type: 'string', description: 'Branch name, for example PWD-1.' }, startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' }, dateField: { type: 'string', enum: ['cheque', 'posting'], description: 'Defaults to cheque date.' }, search: { type: 'string', description: 'Cheque/invoice number, bank, or remarks search.' }, limit: { type: 'integer', description: 'Maximum records, from 1 to 500. Defaults to 500.' } }, required: ['direction'], additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_transactions', description: 'Fallback query for bank transactions by verification status, direction, and keyword search. Also provides bank total query.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'verified', 'unverified'], description: 'Verification status.' }, type: { type: 'string', enum: ['all', 'withdrawal', 'deposit'], description: 'Use withdrawal for cheques, deposit for deposits.' }, search: { type: 'string', description: 'Search term for branch, narration, bank name.' }, limit: { type: 'integer', description: 'Maximum records, defaults to 20.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_bank_summary', description: 'Get the authorized bank deposit, withdrawal, and estimated-balance summary. Use when asked for a bank summary or total deposits/withdrawals.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional branch name, for example PWD-1.' }, startDate: { type: 'string', description: 'Optional start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'Optional end date in YYYY-MM-DD.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_pending_cheques', description: 'Get unresolved/uncleared pending cheques. Use this for pending cheque list.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional branch name.' }, limit: { type: 'integer', description: 'Maximum records, defaults to 20.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'find_duplicate_cheques', description: 'Find duplicate cheque entries from Bank Detail -> Bank Payment. Use when the user asks for duplicate cheques or identical cheque entries.', parameters: { type: 'object', properties: { branch: { type: 'string', description: 'Optional branch name.' }, matchAmount: { type: 'boolean', description: 'Set to true if amounts must match, false if amounts can differ.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_dept_wise_sale_report', description: 'Get the Department Wise Sales Report from closing sheets (same as the /department-sales-report screen). Shows batch amount, total sale, SR count, commission, difference, and discount per department per branch. Use for department-wise sale, dept sale report, branch-wise dept sale, specific department sales, or difference-wise sale questions. Supports optional branch and department filters.', parameters: { type: 'object', properties: { startDate: { type: 'string', description: 'Start date in YYYY-MM-DD.' }, endDate: { type: 'string', description: 'End date in YYYY-MM-DD.' }, branch: { type: 'string', description: 'Optional branch name to filter, e.g. F-6 or Attock.' }, department: { type: 'string', description: 'Optional department name to filter, e.g. Cosmetics or Optics.' } }, additionalProperties: false } } }
  ,{ type: 'function', function: { name: 'get_closing_sheet_daily_summary', description: 'Get a full daily closing sheet summary message for a specific date. Returns: cash activity (cash sales by branch), bank activity (non-cash sales by branch), income statement (expenses and receipts), zakat records, and department-wise sale activity. Use for daily sale message, 2-07-26 sale message, closing sheet msg, daily closing summary, cash activity, bank activity, income statement, or zakat questions for a specific date.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'Date in YYYY-MM-DD. Defaults to today.' }, branch: { type: 'string', description: 'Optional branch name to filter. Omit for all authorized branches.' } }, additionalProperties: false } } }
];

function toolsForUser(user, userMessage = '') {
  // Always verify rights before showing tools
  const permittedTools = toolDefinitions.filter(tool => {
    const metricsByTool = {
      get_late_employees: 'late_employees',
      get_employees_with_no_checkins: 'employee_information',
      get_monthly_absence_summary: 'employee_information',
      get_employee_current_advance_report: 'employee_information',
      get_sales_summary: 'sales_summary',
      get_sales_department_report: 'sales_department_report',
      get_payment_report: 'payment_report_data',
      get_wh_customer_sales_report: 'sales_department_report',
      get_wh_customer_balance_report: 'wh_customer_balance_report_data',
      get_wh_customer_ledger_report: 'wh_customer_ledger_report_data',
      get_wh_stock_position_report: 'wh_stock_position_report_data',
      get_wh_item_ledger_report: 'wh_item_ledger_report_data',
      get_wh_stock_activity_report: 'wh_stock_activity_report_data',
      get_employee_information: 'employee_information',
      get_employee_ledger_report: 'employee_information',
      get_salary_date_range_report: 'employee_information',
      get_employee_salary_report: 'employee_information',
      get_salary_slip: 'salary_slip',
      get_last_purchase_invoice: 'last_purchase_invoice',
      get_daily_cash_batches: 'daily_cash_batches',
      get_bank_transactions: 'get_bank_transactions',
      get_bank_payment_details: 'bank_payment_details',
      get_pending_cheques: 'get_pending_cheques',
      find_duplicate_cheques: 'bank_payment_details',
      get_bank_summary: 'get_bank_summary',
      get_employee_attendance_sheet: 'employee_attendance_sheet',
      get_employee_checkin: 'employee_attendance_sheet',
      get_users_list: 'users_list',
      get_item_information: 'item_information',
      get_item_sale_history: 'item_sale_history',
      get_item_purchase_history: 'item_purchase_history',
      get_commission_history: 'emp_commission',
      get_dept_wise_sale_report: 'dept_wise_sale_report',
      get_closing_sheet_daily_summary: 'closing_sheet_daily_summary'
    };
    
    // We expect canUseAction to exist in the same scope, or require it if not
    // In aiDataAgentService.js, findMetric and canUseAction are used
    if (typeof findMetric !== 'undefined' && typeof canUseAction !== 'undefined') {
        const metric = findMetric(metricsByTool[tool.function.name]);
        return metric && canUseAction(user, metric);
    }
    return true; // Fallback
  });

  // Tool schemas are sent with every model request.  Sending the entire ERP
  // catalogue exceeds the 8K TPM allowance for a simple cheque question.
  // Use the precise authorized tool for bank-cheque requests.
  const message = String(userMessage).toLowerCase();
  if (/\b(cheque|cheques|chq|bank payment|deposit)\b/.test(message)) {
    return permittedTools.filter(tool => ['get_bank_payment_details', 'get_pending_cheques', 'find_duplicate_cheques'].includes(tool.function.name));
  }
  return permittedTools;
}

async function executeTool(req, name, args) {
  console.log('TOOL CALLED:', name, args);
  if (name === 'get_late_employees') return getLateEmployees(req, args || {});
  if (name === 'get_employees_with_no_checkins') return getEmployeesWithNoCheckins(req, args || {});
  if (name === 'get_monthly_absence_summary') return getMonthlyAbsenceSummary(req, args || {});
  if (name === 'get_employee_current_advance_report') return getEmployeeCurrentAdvanceReport(req, args || {});
  if (name === 'get_sales_summary') return getSalesSummary(req, args || {});
  if (name === 'get_sales_department_report') return getSalesDepartmentReport(req, args || {});
  if (name === 'get_dept_wise_sale_report') return getDeptWiseSaleReport(req, args || {});
  if (name === 'get_closing_sheet_daily_summary') return getClosingSheetDailySummary(req, args || {});
  if (name === 'get_payment_report') return getPaymentReport(req, args || {});
  if (name === 'get_wh_customer_sales_report') {
    return args?.reportType === 'payment'
      ? getWHCustomerSalesOrPaymentReport(req, args || {}, 'payment')
      : getSalesDepartmentReport(req, { ...(args || {}), groupByBranch: true });
  }
  if (name === 'get_wh_customer_balance_report') return getWHCustomerBalanceReport(req, args || {});
  if (name === 'get_wh_customer_ledger_report') return getWHCustomerLedgerReport(req, args || {});
  if (name === 'get_wh_stock_position_report') return getWHStockPositionReport(req, args || {});
  if (name === 'get_wh_item_ledger_report') return getWHItemLedgerReport(req, args || {});
  if (name === 'get_wh_stock_activity_report') return getWHStockActivityReport(req, args || {});
  if (name === 'get_employee_information') return getEmployeeInformation(req, args || {});
  if (name === 'get_employee_ledger_report') return getEmployeeLedgerReport(req, args || {});
  if (name === 'get_salary_date_range_report') return getSalaryDateRangeReport(req, args || {});
  if (name === 'get_employee_salary_report') return getEmployeeSalaryReport(req, args || {});
  if (name === 'get_salary_slip') return getSalarySlip(req, args || {});
  if (name === 'get_users_list') return getUsersList(req, args || {});
  if (name === 'get_employee_attendance_sheet') return getEmployeeAttendanceSheet(req, args || {});
  if (name === 'get_employee_checkin') return getEmployeeCheckin(req, args || {});
  if (name === 'get_daily_cash_batches') return getDailyCashBatches(req, args || {});
  if (name === 'get_bank_transactions') return getBankTransactions(req, args || {});
  if (name === 'get_bank_payment_details') return getBankPaymentDetails(req, args || {});
  if (name === 'get_pending_cheques') return getPendingCheques(req, args || {});
  if (name === 'find_duplicate_cheques') {
    const groups = await findDuplicateChequeEntries(req, args?.branch, args?.matchAmount);
    return { found: groups.length > 0, answer: formatDuplicateChequeEntries(groups, args?.branch, args?.matchAmount) };
  }
  if (name === 'get_bank_summary') return getBankSummary(req, args || {});
  if (name === 'get_last_purchase_invoice') return getLastPurchaseInvoice(req, args || {});
  if (name === 'get_item_information') return getItemInformation(req, args || {});
  if (name === 'get_item_sale_history') return getItemSaleHistory(req, args || {});
  if (name === 'get_item_purchase_history') return getItemPurchaseHistory(req, args || {});
  if (name === 'get_commission_history') return getCommissionHistory(req, args || {});
  throw new Error('Unsupported AI data tool.');
}

function keyFor(req, conversationId) { return `${req.user._id}:${conversationId || 'default'}`; }

function markdownCell(value) {
  return String(value ?? '-').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function customerBalanceGroupFromMessage(message) {
  const text = String(message || '').toLowerCase();
  const mentionsCustomerBalance = /\bcustomer(?:s)?\b[\s\S]{0,80}\b(?:bal|balances?)\b|\b(?:bal|balances?)\b[\s\S]{0,80}\bcustomer(?:s)?\b/.test(text);
  if (!mentionsCustomerBalance) return null;
  if (/\bcategory|categories|categor(?:y|ies)[-\s]?wise\b/.test(text)) return 'category';
  if (/\bbranch(?:es)?\b|\bbranch[-\s]?wise\b/.test(text)) return 'branch';
  return null;
}

function customerBalanceNameKeywordFromMessage(message) {
  const text = String(message || '').trim();
  const mentionsCustomerBalance = /\bcustomer(?:s)?\b[\s\S]{0,80}\b(?:bal|balances?)\b|\b(?:bal|balances?)\b[\s\S]{0,80}\bcustomer(?:s)?\b/i.test(text);
  if (!mentionsCustomerBalance) return null;
  // Examples: "PWD show me customer balance" and "show me PWD customer balance".
  const prefix = text.match(/^\s*([a-z0-9-]{2,20})\s+(?:show|give|list|find)\b[\s\S]*\bcustomer(?:s)?\b[\s\S]*\bbalances?\b/i);
  if (prefix) return prefix[1];
  const afterShow = text.match(/\b(?:show|give|list|find)\b\s+(?:me\s+)?(?:the\s+)?([a-z0-9-]{2,20})\s+customer(?:s)?\b[\s\S]*\bbalances?\b/i);
  if (afterShow) return afterShow[1];
  // In this ERP, users often refer to the branch code embedded in a customer
  // name (for example DW-BR-PWD-(MED-AIMS)), rather than the branch field.
  const nameBranch = text.match(/\b([a-z0-9-]{2,20})\s+branch\b/i);
  return nameBranch ? nameBranch[1] : null;
}

function formatCustomerBalanceSummary(result) {
  const label = result.groupBy === 'branch' ? 'Branch' : 'Customer Category';
  if (!result.rows.length) return `No warehouse customer balances were found for the selected ${label.toLowerCase()} grouping.`;
  const groups = result.rows.flatMap(row => [
    `#### ${markdownCell(row[result.groupBy])} — ${Number(row.customers || 0).toLocaleString()} customer${row.customers === 1 ? '' : 's'}`,
    '',
    '| Customer Name | Balance | Status |',
    '|---|---:|---|',
    ...row.details.map(customer => `| ${markdownCell(customer.customer)} | ${Number(customer.balance || 0).toLocaleString()} | ${customer.status} |`),
    '',
    `**${markdownCell(row[result.groupBy])} total:** ${Number(row.balance || 0).toLocaleString()} PKR`,
    ''
  ]);
  return [
    `### Warehouse Customer Balances by ${label}`,
    '',
    `_Source: ${result.source}_`,
    '',
    ...groups,
    `**Customers:** ${Number(result.customerCount || 0).toLocaleString()}  `,
    `**Total balance:** ${Number(result.totalBalance || 0).toLocaleString()} PKR`
  ].join('\n');
}

function formatCustomerBalanceList(result, keyword) {
  if (!result.rows.length) return `No warehouse customers with "${markdownCell(keyword)}" in their customer name were found.`;
  const rows = result.rows.map(customer => `| ${markdownCell(customer.customer)} | ${markdownCell(customer.category)} | ${Number(customer.balance || 0).toLocaleString()} | ${customer.balance === 0 ? 'Settled' : customer.balance > 0 ? 'Pending' : 'Credit'} |`);
  return [
    `### Customer Balances — Name contains "${markdownCell(keyword)}"`,
    '',
    `_Source: ${result.source}_`,
    '',
    '| Customer Name | Category | Balance | Status |',
    '|---|---|---:|---|',
    ...rows,
    '',
    `**Matching customers:** ${result.count.toLocaleString()}`,
    result.truncated ? '_Only the first 200 matching customers are shown._' : ''
  ].filter(Boolean).join('\n');
}

function formatWarehouseCustomerBalanceReport(result) {
  if (!result.rows.length) return 'No warehouse customer balances were found.';
  return [
    '### Warehouse Customer Balance Report',
    '',
    `_Source: ${result.source}_`,
    '',
    '| Customer Name | Category | Branch | Balance | Status |',
    '|---|---|---|---:|---|',
    ...result.rows.map(customer => `| ${markdownCell(customer.customer)} | ${markdownCell(customer.category)} | ${markdownCell(customer.branch)} | ${Number(customer.balance || 0).toLocaleString()} | ${customer.balance === 0 ? 'Settled' : customer.balance > 0 ? 'Pending' : 'Credit'} |`),
    '',
    `**Customers shown:** ${Number(result.count || 0).toLocaleString()}  `,
    `**Total balance:** ${Number(result.rows.reduce((sum, customer) => sum + Number(customer.balance || 0), 0)).toLocaleString()} PKR`,
    result.truncated ? '\n_Only the first 200 customers are shown._' : ''
  ].filter(Boolean).join('\n');
}

function customerCategoryReportTypeFromMessage(message) {
  const text = String(message || '').toLowerCase();
  const customerWise = /\bcustomer(?:s)?[-\s]?wise\b|\bcustomer(?:s)?\b/.test(text);
  const branchWise = /\bbranch(?:es)?[-\s]?wise\b|\bbranch(?:es)?\b/.test(text);
  const categoryWise = /\bcategory|\bgroup\b/.test(text);
  if ((!customerWise && !branchWise) || !categoryWise) return null;
  if (/\bpayment(?:s)?\b/.test(text)) return 'payment';
  if (/\bsales?\b/.test(text)) return 'sales';
  return null;
}

function customerReportMonthRange(message) {
  const text = String(message || '');
  const explicitRange = text.match(/\bfrom\s+(20\d{2}-\d{2}-\d{2})\s+(?:to|until|through)\s+(20\d{2}-\d{2}-\d{2})\b/i);
  if (explicitRange && isValidDate(explicitRange[1]) && isValidDate(explicitRange[2])) {
    return { startDate: explicitRange[1], endDate: explicitRange[2] };
  }
  if (/\byesterday\b/i.test(text)) {
    // Work with the Pakistan business-date components directly. Converting
    // Pakistan midnight to UTC first would make 30 Jul appear as 29 Jul, and
    // subtracting another day incorrectly returns 28 Jul.
    const [year, month, day] = karachiDate().split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - 1);
    const value = date.toISOString().slice(0, 10);
    return { startDate: value, endDate: value };
  }
  if (/\btoday\b/i.test(text)) {
    const value = karachiDate();
    return { startDate: value, endDate: value };
  }
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const dayFirst = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](\d{2}|20\d{2})\b/);
  if (dayFirst) {
    const year = dayFirst[3].length === 2 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]);
    const value = `${year}-${String(dayFirst[2]).padStart(2, '0')}-${String(dayFirst[1]).padStart(2, '0')}`;
    if (isValidDate(value)) return { startDate: value, endDate: value };
  }
  // A concise ERP request such as "show me 29 date sale" means the 29th of
  // the current business month, rather than a branch named "ME-29".
  const dayOnly = text.match(/\b(0?[1-9]|[12]\d|3[01])\s*(?:date|day)\b/i);
  if (dayOnly) {
    const [year, month] = karachiDate().split('-').map(Number);
    const value = `${year}-${String(month).padStart(2, '0')}-${String(dayOnly[1]).padStart(2, '0')}`;
    if (isValidDate(value)) return { startDate: value, endDate: value };
  }
  // ERP shorthand such as "May 26" means the full month of May 2026,
  // matching the Sales Report page's From Date/To Date period.
  const named = text.match(new RegExp(`\\b(${monthNames.join('|')})\\s+(\\d{2}|20\\d{2})\\b`, 'i'));
  const numeric = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  let year, month;
  if (named) { year = named[2].length === 2 ? 2000 + Number(named[2]) : Number(named[2]); month = monthNames.indexOf(named[1].toLowerCase()) + 1; }
  else if (numeric) { year = Number(numeric[1]); month = Number(numeric[2]); }
  else if (/\bthis\s+month\b/i.test(text)) {
    const [currentYear, currentMonth] = karachiDate().split('-').map(Number);
    year = currentYear; month = currentMonth;
  } else return {};
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
}

function salesBranchFromMessage(message) {
  // Accept compact branch notation before or after "sale report", such as
  // "PWD 1 sale" and "sale report PWD 1". Exclude month-year shorthand
  // (for example, "May 26") from being considered a branch.
  const months = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
  const nonBranchWords = new Set(['me', 'show', 'date', 'day', 'sale', 'sales', 'report', 'for', 'on']);
  const matches = String(message || '').matchAll(/\b([a-z]{2,8})\s*[-\s]\s*(\d+)\b/gi);
  for (const match of matches) {
    const prefix = match[1].toLowerCase();
    if (!months.has(prefix) && !nonBranchWords.has(prefix)) return `${match[1]}-${match[2]}`.toUpperCase();
  }
  return null;
}

function isDateWiseSalesRequest(message) {
  const text = String(message || '').toLowerCase();
  if (!/\bsales?\b/.test(text) || /\b(customer|category|branch|payment)\b/.test(text)) return false;
  const range = customerReportMonthRange(text);
  return Boolean(range.startDate && range.endDate);
}

function formatDateWiseSalesSummary(result, startDate, endDate) {
  const label = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
  return [
    `### Sales Summary — ${label}`,
    '',
    '_Source: Cash Sales_',
    '',
    `**Sales:** ${Number(result.total || 0).toLocaleString()} PKR  `,
    `**Invoices:** ${Number(result.count || 0).toLocaleString()}  `,
    `**Average invoice:** ${Number(result.average || 0).toLocaleString()} PKR`
  ].join('\n');
}

function formatCustomerSalesOrPaymentReport(result) {
  const valueLabel = result.reportType === 'payment' ? 'Paid' : 'Sales';
  if (!result.rows.length) return `No posted warehouse ${result.reportType === 'payment' ? 'payments' : 'sales'} were found for the selected period.`;
  const groups = result.rows.flatMap(group => [
    `#### ${markdownCell(group.category)} — ${group.customers.length} customer${group.customers.length === 1 ? '' : 's'}`,
    '',
    `| Customer Name | Invoices | ${valueLabel} | Balance |`,
    '|---|---:|---:|---:|',
    ...group.customers.map(customer => `| ${markdownCell(customer.customer)} | ${Number(customer.invoices).toLocaleString()} | ${Number(customer[result.reportType === 'payment' ? 'paid' : 'sales']).toLocaleString()} | ${Number(customer.balance).toLocaleString()} |`),
    '',
    `**${markdownCell(group.category)} total ${valueLabel.toLowerCase()}:** ${Number(group[result.reportType === 'payment' ? 'paid' : 'sales']).toLocaleString()} PKR`,
    ''
  ]);
  return [
    `### Customer-wise ${result.reportType === 'payment' ? 'Payment' : 'Sales'} Report — Category-wise`,
    '',
    `_Source: ${result.source}_`,
    '',
    ...groups,
    `**Invoices:** ${Number(result.invoiceCount).toLocaleString()}  `,
    `**Total sales:** ${Number(result.totalSales).toLocaleString()} PKR  `,
    `**Total paid:** ${Number(result.totalPaid).toLocaleString()} PKR  `,
    `**Total balance:** ${Number(result.totalBalance).toLocaleString()} PKR`,
    result.truncated ? '\n_Only the first 10,000 invoices are included._' : ''
  ].filter(Boolean).join('\n');
}

function formatClosingSheetWarehouseSaleReport(result) {
  if (!result.rows.length) return 'No Warehouse Sale rows were saved in Closing Sheet → Closing 02 for the selected period.';
  const groupedByBranch = Boolean(result.groupByBranch);
  return [
    groupedByBranch ? '### Warehouse Sales Report — Branch-wise, Category-wise' : '### Warehouse Sales Report — Category-wise',
    '',
    `_Source: ${result.source}_`,
    '',
    `**Period:** ${result.startDate && result.endDate ? `${result.startDate} to ${result.endDate}` : 'All saved Closing Sheets'}  `,
    `**Branch:** ${markdownCell(result.branch || 'All allowed branches')}`,
    '',
    groupedByBranch ? '| Branch | Category | Sale | Cost | Profit | Profit Margin |' : '| Category | Sale | Cost | Profit | Profit Margin |',
    groupedByBranch ? '|---|---|---:|---:|---:|---:|' : '|---|---:|---:|---:|',
    ...result.rows.map(row => groupedByBranch
      ? `| ${markdownCell(row.branch)} | ${markdownCell(row.category)} | ${Number(row.sales || 0).toLocaleString()} | ${Number(row.cost || 0).toLocaleString()} | ${Number(row.profit || 0).toLocaleString()} | ${(Number(row.sales || 0) ? (Number(row.profit || 0) / Number(row.sales || 0) * 100).toFixed(1) : '0.0')}% |`
      : `| ${markdownCell(row.category)} | ${Number(row.sales || 0).toLocaleString()} | ${Number(row.cost || 0).toLocaleString()} | ${Number(row.profit || 0).toLocaleString()} | ${(Number(row.sales || 0) ? (Number(row.profit || 0) / Number(row.sales || 0) * 100).toFixed(1) : '0.0')}% |`),
    '',
    `**Total sale:** ${Number(result.rows.reduce((sum, row) => sum + Number(row.sales || 0), 0)).toLocaleString()} PKR  `,
    `**Total cost:** ${Number(result.rows.reduce((sum, row) => sum + Number(row.cost || 0), 0)).toLocaleString()} PKR  `,
    `**Total profit:** ${Number(result.rows.reduce((sum, row) => sum + Number(row.profit || 0), 0)).toLocaleString()} PKR`,
    result.truncated ? '\n_Only the first 100 categories are shown._' : ''
  ].filter(Boolean).join('\n');
}

function formatClosingSheetSalesSummary(result) {
  const totalSales = result.rows.reduce((sum, row) => sum + Number(row.sales || 0), 0);
  const totalCost = result.rows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
  const branches = new Set(result.rows.map(row => row.branch).filter(Boolean));
  return [
    `### Closing-Sheet Sales — ${result.startDate || 'All saved dates'}`,
    '',
    `_Source: ${result.source}_`,
    '',
    `**Total Sales:** PKR ${totalSales.toLocaleString()}  `,
    `**Total Cost:** PKR ${totalCost.toLocaleString()}  `,
    `**Total Profit:** PKR ${(totalSales - totalCost).toLocaleString()}  `,
    `**Categories:** ${result.rows.length}  `,
    `**Branches:** ${branches.size}`
  ].join('\n');
}

function formatBranchCategoryPaymentReport(result) {
  if (!result.rows.length) return 'No category-wise payments were found for the selected period.';
  const categories = new Map();
  for (const row of result.rows) {
    const group = categories.get(row.category) || { category: row.category, rows: [], sales: 0, cost: 0, paid: 0, balance: 0 };
    group.rows.push(row);
    group.sales += Number(row.sales || 0);
    group.cost += Number(row.cost || 0);
    group.paid += Number(row.paid || 0);
    group.balance += Number(row.balance || 0);
    categories.set(row.category, group);
  }
  const categoryTables = [...categories.values()]
    .sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category))
    .flatMap(group => [
      `#### ${markdownCell(group.category)}`,
      '',
      ...group.rows
        .sort((a, b) => b.sales - a.sales || a.branch.localeCompare(b.branch))
        .map((row, index) => `${index + 1}. **${markdownCell(row.branch)}** — Sale ${Number(row.sales || 0).toLocaleString()}, Cost ${Number(row.cost || 0).toLocaleString()}, Paid ${Number(row.paid || 0).toLocaleString()}, Balance ${Number(row.balance || 0).toLocaleString()}`),
      '',
      `**Category total:** Sale ${group.sales.toLocaleString()}, Cost ${group.cost.toLocaleString()}, Paid ${group.paid.toLocaleString()}, Balance ${group.balance.toLocaleString()}`,
      ''
    ]);
  return [
    '### Payment Report — Branch-wise, Category-wise',
    '',
    `_Source: ${result.source}_`,
    '',
    `**Period:** ${result.startDate} to ${result.endDate}`,
    '',
    ...categoryTables,
    `**Total paid:** ${Number(result.rows.reduce((sum, row) => sum + Number(row.paid || 0), 0)).toLocaleString()} PKR  `,
    `**Outstanding balance:** ${Number(result.rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)).toLocaleString()} PKR`,
    result.truncated ? '\n_Only the first 50 rows are shown._' : ''
  ].filter(Boolean).join('\n');
}

function bankDetailBranchFromMessage(message) {
  const match = String(message).match(/\b([a-z]{2,8})\s*-\s*(\d+)\b|\b([a-z]{2,8})\s+(\d+)\s+branch\b/i);
  if (!match) return undefined;
  return `${match[1] || match[3]}-${match[2] || match[4]}`.toUpperCase();
}

function formatChequeDetails(result, branch) {
  const branchLabel = branch || 'All Branches';
  const statusLabel = result.status === 'verified' ? 'Verified' : 'Unverified';
  if (!result.found) return `No ${statusLabel.toLowerCase()} cheque details were found for ${branchLabel}.`;
  const rows = result.transactions.map(transaction => {
    const date = transaction.postDate ? new Date(transaction.postDate).toISOString().slice(0, 10) : '-';
    return `| ${markdownCell(date)} | ${markdownCell(transaction.bank)} | ${markdownCell(transaction.branch)} | ${markdownCell(transaction.chequeNo)} | ${Number(transaction.amount || 0).toLocaleString()} | ${markdownCell(transaction.remarks)} |`;
  });
  return [
    `### ${statusLabel} Cheque Details — ${branchLabel}`,
    '',
    '_Source: Bank Detail → Bank Payment (unverified rows)_',
    '',
    '| Post Date | Bank | Branch | Cheque No | Amount | Remarks |',
    '|---|---|---|---|---:|---|',
    ...rows,
    '',
    `**Total entries:** ${result.count}  `,
    `**Total ${statusLabel.toLowerCase()} amount:** ${Number(result.totalAmount || 0).toLocaleString()} PKR`
  ].join('\n');
}

function chequeNumberFromTransaction(transaction) {
  const narration = String(transaction.narration || '');
  const narrationMatch = narration.match(/\b(?:chq|cheque)\s*#?\s*([a-z0-9-]+)/i);
  if (narrationMatch) return narrationMatch[1].toUpperCase();
  const invoiceNo = String(transaction.invoiceNo || '').trim();
  return invoiceNo && invoiceNo !== '-' ? invoiceNo.toUpperCase() : null;
}

async function findDuplicateChequeEntries(req, branch, matchAmount) {
  let query = { type: 'withdrawal', refType: { $ne: 'bank_transfer' } };
  if (branch) {
    const branchPattern = new RegExp(String(branch).replace(/[\s-]+/g, '[-\\s]*'), 'i');
    query.branch = branchPattern;
  }
  query = await applyBranchFilter(req, query, BankTransaction);
  const transactions = await BankTransaction.find(query)
    .populate('department', 'name')
    .sort({ date: 1, _id: 1 })
    .limit(10000)
    .lean();

  const groups = new Map();
  for (const transaction of transactions) {
    const chequeNo = chequeNumberFromTransaction(transaction);
    if (!chequeNo) continue;
    const amount = Number(transaction.amount || 0);
    const key = matchAmount ? `${chequeNo}|${amount.toFixed(2)}` : chequeNo;
    const entries = groups.get(key) || [];
    entries.push({ ...transaction, chequeNo, amount });
    groups.set(key, entries);
  }
  return [...groups.values()].filter(entries => entries.length > 1);
}

function formatDuplicateChequeEntries(groups, branch, matchAmount) {
  const branchLabel = branch || 'All Branches';
  const matchDescription = matchAmount ? 'the same cheque number and amount' : 'the same cheque number (amount may differ)';
  if (!groups.length) return `No duplicate cheque entries were found in ${branchLabel} when matching ${matchDescription}.`;
  const rows = groups.flatMap(entries => entries.map(transaction => {
    const date = transaction.date ? new Date(transaction.date).toISOString().slice(0, 10) : '-';
    return `| ${markdownCell(transaction.chequeNo)} | ${Number(transaction.amount).toLocaleString()} | ${markdownCell(date)} | ${markdownCell(transaction.bankName)} | ${markdownCell(transaction.department?.name)} | ${markdownCell(transaction.narration)} |`;
  }));
  return [
    `### Duplicate Cheque Entries — ${branchLabel}`,
    '',
    `_Matched from Bank Detail → Bank Payment by ${matchDescription}._`,
    '',
    '| Cheque No | Amount | Post Date | Bank | Department | Remarks |',
    '|---|---:|---|---|---|---|',
    ...rows,
    '',
    `**Duplicate groups:** ${groups.length}  `,
    `**Duplicate entries:** ${rows.length}`
  ].join('\n');
}

async function chatWithDataAgent(req, userMessage, conversationId) {
  const messageText = String(userMessage || '');
  const key = keyFor(req, conversationId);
  const history = conversations.get(key) || [];
  const tools = toolsForUser(req.user, userMessage);
  const messages = [
    { role: 'system', content: `You are Amey, an advanced ERP assistant. Use tools for all factual ERP data; never invent report values. For the Sales Report page, use get_sales_department_report. For payment, warehouse customer balance/ledger, stock position, item ledger, stock activity requests, use the matching get_*_report tool. For employee ledger or historical salary ranges, use the new get_employee_ledger_report and get_salary_date_range_report tools. For a salary-slip result, state that the slip is opening in a new tab; never invent URLs. If the user asks for a "summary", analyze the data mathematically (totals, trends) and output a concise paragraph. If the user asks for "detail", output the full Markdown table. If the user asks to "create a PDF" or "download PDF" of the current report, explicitly instruct them to click the 'Download Reply as PDF' button at the top-right of the AI panel.` },
    ...history,
    { role: 'user', content: userMessage }
  ];
  let downloadUrl;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    // Retrieve facts in round one, then require a natural-language answer from
    // the model. This prevents repeated tool calls from ending in a timeout.
    const allowToolCalls = round === 0 && tools.length > 0;
    const { complete } = require('../ai/adapter/providerAdapter');
    const assistant = await complete({ 
      messages,
      tools: allowToolCalls ? tools : undefined, 
      tool_choice: allowToolCalls ? 'auto' : 'none', 
      temperature: 0.2, 
      max_tokens: 800 
    });
    messages.push({ role: 'assistant', content: assistant.content || null, tool_calls: assistant.tool_calls || undefined });
    if (!Array.isArray(assistant.tool_calls) || !assistant.tool_calls.length) {
      const answer = assistant.content || 'I could not prepare a response. Please try again.';
      conversations.set(key, [{ role: 'user', content: userMessage }, { role: 'assistant', content: answer }]);
      return { answer, conversation_id: conversationId || 'default', ...(downloadUrl ? { downloadUrl } : {}) };
    }
    for (const call of assistant.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        result = await executeTool(req, call.function?.name, args);
        if (result.downloadUrl) downloadUrl = result.downloadUrl;
        if (call.function?.name === 'get_salary_slip' && result.slips?.length === 1) {
          downloadUrl = result.slips[0].downloadUrl;
        }
      } catch (error) { result = { error: error.message || 'The requested data could not be retrieved.' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error('AI tool processing did not finish in time. Please try a more specific request.');
}

function formatDailyCashBatches(result) {
  if (!result.found) return `No ${result.status} batch details were found for ${result.branch || 'all branches'}.`;
  
  const rows = result.batches.map(batch => {
    const date = batch.date ? new Date(batch.date).toISOString().slice(0, 10) : '-';
    return `| ${markdownCell(date)} | ${markdownCell(batch.branch)} | ${markdownCell(batch.batchNo)} | ${markdownCell(batch.mode)} | ${Number(batch.totalAmount || 0).toLocaleString()} | ${markdownCell(batch.status)} |`;
  });
  return [
    `### ${result.status === 'unverified' ? 'Unverified' : (result.status === 'verified' ? 'Verified' : 'All')} Batch Details — ${result.branch || 'All Branches'}`,
    '',
    '_Source: Daily Closing Sheet / Daily Cash_',
    '',
    '| Date | Branch | Batch No | Mode | Amount | Status |',
    '|---|---|---|---|---:|---|',
    ...rows,
    '',
    `**Total Amount:** ${Number(result.totalAmount || 0).toLocaleString()} PKR`,
    `**Count:** ${result.count}`
  ].join('\n');
}

// `toolDefinitions` and `executeTool` are intentionally exported for the
// modular brain. They remain the sole, permission-aware path from an AI tool
// call to ERP data; an AI provider never gets database access.
module.exports = {
  chatWithDataAgent,
  toolsForUser,
  toolDefinitions,
  executeTool,
  getLateEmployees,
  getSalesSummary,
  getEmployeeInformation,
  getSalarySlip,
  getUsersList,
  karachiDate
};
