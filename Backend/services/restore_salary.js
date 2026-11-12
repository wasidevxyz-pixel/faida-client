const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'aiDataAgentService.js');
let content = fs.readFileSync(filePath, 'utf8');

const salarySlipCode = `
async function getSalarySlip(req, args) {
  const search = String(args.search || '').trim();
  const monthYear = String(args.monthYear || '').trim();
  if (search.length < 2 || !monthYear) throw new Error('Provide an employee name or code and a month such as June 2026.');
  const pattern = new RegExp(search.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&'), 'i');
  const query = await applyBranchFilter(req, { monthYear, $or: [{ employeeCode: pattern }, { employeeName: pattern }] }, LegacyPayroll);
  const records = await LegacyPayroll.find(query).select('employeeCode employeeName monthYear branch netSalary pageNumber').sort({ employeeName: 1 }).limit(5).lean();
  if (records.length) {
    return { found: true, slips: records.map(record => ({ employeeCode: record.employeeCode, employeeName: record.employeeName, monthYear: record.monthYear, branch: record.branch, netSalary: record.netSalary, downloadUrl: \`/api/v1/legacy-payroll/view-slip?code=\${encodeURIComponent(record.employeeCode)}&monthYear=\${encodeURIComponent(record.monthYear)}\` })) };
  }
  const parsedMonth = new Date(\`\${monthYear} 1\`);
  const payrollMonth = Number.isNaN(parsedMonth.getTime()) ? '' : \`\${parsedMonth.getFullYear()}-\${String(parsedMonth.getMonth() + 1).padStart(2, '0')}\`;
  if (!payrollMonth) return { found: false, message: \`I could not understand the payroll month \${monthYear}.\` };
  const newPayrollQuery = await applyBranchFilter(req, { monthYear: payrollMonth, code: pattern }, Payroll);
  const newPayrollRecords = await Payroll.find(newPayrollQuery).populate('employee', 'name').select('code employee monthYear branch netTotal').sort({ code: 1 }).limit(5).lean();
  if (!newPayrollRecords.length) return { found: false, message: \`No salary slip was found for \${search} in \${monthYear}.\` };
  return { found: true, slips: newPayrollRecords.map(record => ({ employeeCode: record.code, employeeName: record.employee?.name, monthYear, branch: record.branch, netSalary: record.netTotal, downloadUrl: \`/print-payroll?id=\${encodeURIComponent(record._id)}\`, isPrintPage: true })) };
}

const toolDefinitions = [`;

content = content.replace('const toolDefinitions = [', salarySlipCode);
fs.writeFileSync(filePath, content);
console.log("Salary slip restored!");
