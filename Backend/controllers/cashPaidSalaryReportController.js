const Employee = require('../models/Employee');
const Payroll = require('../models/Payroll');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');

const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', ''].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

// @desc    Get Cash Paid Salary Report
// @route   GET /api/v1/salary-reports/cash-paid
exports.getCashPaidReport = async (req, res) => {
    try {
        const { month, branches, branch, code, employeeId, department, designation, paidStatus } = req.query;

        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required'
            });
        }

        let query = { monthYear: month };

        const branchParam = branches || branch;
        if (branchParam) {
            const branchList = branchParam.split(',').map(b => b.trim()).filter(b => b !== '');
            const regexes = branchList.map(makeBranchRegex).filter(Boolean);
            if (regexes.length === 1) {
                query.branch = regexes[0];
            } else if (regexes.length > 1) {
                query.branch = { $in: regexes };
            }
        }

        if (employeeId) query.employee = employeeId;
        if (code) query.code = { $regex: code, $options: 'i' };
        if (department) {
            const dept = await EmployeeDepartment.findById(department);
            if (dept) query.department = dept.name;
        }
        if (designation) {
            const desig = await Designation.findById(designation);
            if (desig) query.designation = desig.name;
        }

        console.log('Cash Paid Report Query:', JSON.stringify(query));

        let payrolls = await Payroll.find(query)
            .populate('employee')
            .sort({ code: 1 });

        // Filter out placeholder 'Import Only' employees
        payrolls = payrolls.filter(p => {
            const emp = p.employee;
            return !(emp?.payrollImportOnly || (p.code && /^IMP-/i.test(p.code)));
        });

        // Filter by Paid Status
        if (paidStatus === 'Not Paid') {
            payrolls = payrolls.filter(p => p.cashPaid === 0 && p.payAdvSalary !== true && p.payFullSalaryThroughBank !== true && (p.bankPaid || 0) === 0);
        } else if (paidStatus === 'Advance') {
            payrolls = payrolls.filter(p => p.cashPaid > 0 && p.payAdvSalary === true);
        } else if (paidStatus === 'All') {
            // Show everything
        } else {
            // Default and "Paid" status: Show only regular cash payments (exclude Advance Paid and Bank Paid)
            payrolls = payrolls.filter(p => p.cashPaid > 0 && p.payAdvSalary !== true && (p.bankPaid || 0) === 0);
        }

        const reportData = payrolls.map(p => ({
            code: p.code,
            name: p.employee ? p.employee.name : 'Unknown',
            department: p.department || 'N/A',
            designation: p.designation || 'N/A',
            salaryStatus: p.payAdvSalary ? 'Advance Paid (Already Collected)' :
                (p.bankPaid > 0 && p.cashPaid > 0 ? 'Mixed Paid' :
                    (p.bankPaid > 0 ? 'Bank Paid' :
                        (p.cashPaid > 0 ? 'Cash Paid' : 'Not Paid'))),
            basicSalary: p.perMonth || 0,
            grossSalary: p.grossTotal || 0,
            totalDeduction: p.deductionsTotal || 0,
            netSalary: p.netTotal || 0,
            cashPaid: p.cashPaid || 0,
            payAdvSalary: p.payAdvSalary || false
        }));

        res.status(200).json({
            success: true,
            data: reportData
        });

    } catch (error) {
        console.error('Error in getCashPaidReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
