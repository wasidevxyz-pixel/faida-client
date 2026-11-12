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

// @desc    Get Employee Payroll Status Report
// @route   GET /api/v1/salary-reports/emp-payroll-status
exports.getEmpPayrollStatus = async (req, res) => {
    try {
        const { month, monthYear, branch, department, code, employeeName, status } = req.query;

        // monthYear comes in format "2026-01"
        const selectedMonth = monthYear || month;
        if (!selectedMonth) {
            return res.status(400).json({
                success: false,
                message: 'Month-Year is required'
            });
        }

        // 1. Build Employee Query — STRICTLY exclude IMP (payrollImportOnly) employees
        let empQuery = {
            isActive: true,
            payrollImportOnly: { $ne: true },
            code: { $not: /^IMP-/i }
        };
        const branchRegex = makeBranchRegex(branch);
        if (branchRegex) {
            empQuery.branch = branchRegex;
        }
        if (department && department !== 'All' && department !== 'Select Department') {
            empQuery.department = department;
        }
        if (code) {
            // Merge with existing $not filter so IMP exclusion is preserved
            empQuery.code = { ...empQuery.code, $regex: code, $options: 'i' };
        }
        if (employeeName) {
            empQuery.name = { $regex: employeeName, $options: 'i' };
        }

        // 2. Fetch Employees
        const employees = await Employee.find(empQuery)
            .populate('department')
            .populate('designation')
            .sort({ name: 1 });

        // 3. Build Payroll Query for the same month
        let payrollQuery = { monthYear: selectedMonth };
        const payrolls = await Payroll.find(payrollQuery);

        // Map payrolls by employee ID for easy lookup
        const payrollMap = {};
        payrolls.forEach(p => {
            payrollMap[p.employee.toString()] = p;
        });

        // 4. Combine and Filter
        let reportData = [];
        employees.forEach(emp => {
            const payroll = payrollMap[emp._id.toString()];
            let empStatus = 'Pending';
            let paymentMode = emp.bankCash || 'Cash';
            let netSalary = 0;

            if (payroll) {
                netSalary = payroll.netTotal || 0;
                // Determine status based on payroll data or employee preference
                empStatus = 'Transfer'; // Default for created payroll in some systems

                if (payroll.bankPaid > 0 && payroll.cashPaid > 0) {
                    paymentMode = 'Both';
                } else if (payroll.bankPaid > 0) {
                    paymentMode = 'Bank';
                } else if (payroll.cashPaid > 0) {
                    paymentMode = 'Cash';
                }
            }

            const dataItem = {
                _id: emp._id,
                code: emp.code,
                name: emp.name,
                designation: emp.designation ? emp.designation.name : '-',
                department: emp.department ? emp.department.name : 'Unassigned',
                paymentMode: paymentMode,
                netSalary: netSalary,
                joiningDate: emp.joiningDate,
                branch: emp.branch || '-',
                status: payroll ? 'Transfer' : 'Pending',
                hasPayroll: !!payroll
            };

            // Apply Status Filter
            let include = false;
            if (!status || status === 'All') {
                include = true;
            } else if (status === 'Pending' && !payroll) {
                include = true;
            } else if (payroll) {
                if (status === 'Transfer') {
                    include = true;
                } else if (status === 'Bank' && (paymentMode === 'Bank' || paymentMode === 'Both')) {
                    include = true;
                } else if (status === 'Cash' && (paymentMode === 'Cash' || paymentMode === 'Both')) {
                    include = true;
                }
            }

            if (include) {
                reportData.push(dataItem);
            }
        });

        res.status(200).json({
            success: true,
            count: reportData.length,
            data: reportData
        });

    } catch (error) {
        console.error('Error in getEmpPayrollStatus:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};
