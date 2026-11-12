const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Payroll = require('../models/Payroll');
const Bank = require('../models/Bank');

const makeBranchRegex = (branchStr) => {
    if (!branchStr || typeof branchStr !== 'string') return null;
    const clean = branchStr.trim().replace(/^[()]+|[()]+$/g, '').trim();
    if (!clean || ['all branches', 'all', 'select branch', ''].includes(clean.toLowerCase())) return null;
    const escaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    return new RegExp('^\\(?\\s*' + escaped + '\\s*\\)?$', 'i');
};

// @desc    Get Bank Paid Salary Report
// @route   GET /api/v1/salary-reports/bank-paid
exports.getBankPaidReport = async (req, res) => {
    try {
        const { month, branches, branch, code, employeeId, type, exportCsv } = req.query;

        // month comes in format "2026-01", which matches monthYear in Payroll model
        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required for bank paid salary report'
            });
        }

        // Build query for Payroll collection
        let query = { monthYear: month };

        // Branch Filter (Multi-Select or Single Select)
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

        // Employee filters
        if (employeeId) {
            query.employee = employeeId;
        }
        if (code) {
            query.code = { $regex: code, $options: 'i' };
        }

        console.log('Payroll Query:', JSON.stringify(query));

        // Fetch payrolls and populate employee details
        const payrolls = await Payroll.find(query)
            .populate('employee')
            .sort({ code: 1 });

        console.log(`Found ${payrolls.length} payroll entries for ${month}`);

        // Fetch all branch banks to identify the designated payroll bank for each branch
        const allBranchBanks = await Bank.find({
            isActive: true,
            bankType: 'Branch Bank'
        });

        const payrollBankMap = {}; // Maps Branch Name -> Designated Bank Name
        const debitAccountMap = {}; // Maps Branch Name -> Designated Account No

        allBranchBanks.forEach(bank => {
            // If this is marked as payroll bank, it takes priority
            if (bank.isPayrollBank === true) {
                payrollBankMap[bank.branch] = (bank.bankName || '').trim().toLowerCase();
                debitAccountMap[bank.branch] = bank.accountNo;
            }
            // Fallback: If no payroll bank exists for this branch yet, pick the first one
            if (!payrollBankMap[bank.branch]) {
                payrollBankMap[bank.branch] = (bank.bankName || '').trim().toLowerCase();
                debitAccountMap[bank.branch] = bank.accountNo;
            }
        });

        console.log('Designated Payroll Banks:', payrollBankMap);

        // Filter and transform based on report type
        let reportData = [];

        for (const payroll of payrolls) {
            const emp = payroll.employee;

            // Skip if employee not found or is a placeholder 'Import Only' employee
            // NOTE: Removed !emp.isActive check so that already created salary records remain visible even if employee is later marked inactive.
            if (!emp || emp.payrollImportOnly || (emp.code && /^IMP-/i.test(emp.code))) continue;

            const branchName = payroll.branch || emp.branch;
            const designatedBank = payrollBankMap[branchName] || '';
            const employeeBank = (payroll.bank || emp.selectBank || '').trim().toLowerCase();

            // Category classification
            // SAME BRANCH: Employee Bank == Branch Designated Payroll Bank
            // OTH BRANCH: Employee Bank != Branch Designated Payroll Bank
            const isSameBranchBank = (designatedBank !== '' && employeeBank !== '' && employeeBank === designatedBank);
            const isOtherBank = (designatedBank !== '' && employeeBank !== '' && employeeBank !== designatedBank);

            let includeInReport = false;
            let amount = 0;

            if (type === 'full') {
                // OTH BRANCH BANK SALARY button calls type='full'
                // Include if it's an "Other Bank" AND has bank payment
                if (isOtherBank) {
                    amount = payroll.bankPaid;
                    // Fallback for netTotal if no split performed
                    if (amount === 0 && payroll.cashPaid === 0) amount = payroll.netTotal;

                    if (amount > 0) {
                        includeInReport = true;
                    }
                }
            } else if (type === 'branch_bank') {
                // SAME BRANCH BANK SALARY button calls type='branch_bank'
                // Include if it's "Same Bank" AND has bank payment
                if (isSameBranchBank) {
                    amount = payroll.bankPaid;
                    if (amount === 0 && payroll.cashPaid === 0) amount = payroll.netTotal;

                    if (amount > 0) {
                        includeInReport = true;
                    }
                }
            } else if (type === 'half') {
                // Half bank paid: Positive bankPaid but not necessarily full transfer
                // (Old logic for general bank transfers that aren't specific to 'Same' vs 'Other')
                if (payroll.bankPaid > 0 && !isOtherBank) {
                    includeInReport = true;
                    amount = payroll.bankPaid;
                }
            } else {
                // Default: Include all bank payments (Both Same Branch & Other Bank)
                amount = payroll.bankPaid;
                if (amount === 0 && payroll.cashPaid === 0 && payroll.bankCash === 'Bank') {
                    amount = payroll.netTotal;
                }
                if (amount > 0) {
                    includeInReport = true;
                }
            }


            if (includeInReport && amount > 0) {
                // Determine the branch for debit account lookup
                const { singleBranch } = req.query;
                const lookupBranch = singleBranch || branchName;
                
                // Use the designated account number for this branch
                const debitAccount = debitAccountMap[lookupBranch] || '';

                console.log(`  - Debit account for branch ${lookupBranch}: ${debitAccount || 'None'}`);

                reportData.push({
                    _id: emp._id,
                    code: emp.code || payroll.code,
                    name: emp.name,
                    branch: branchName,
                    debitAccount: debitAccount,
                    creditAccount: emp.acNo || emp.bankDetails?.alf || '',
                    amount: amount,
                    orderingBank: designatedBank.toUpperCase() || emp.selectBank || 'BAFL',
                    transactionId: payroll._id
                });
            }
        }

        console.log(`Filtered to ${reportData.length} employees for report type: ${type}`);

        res.status(200).json({
            success: true,
            data: reportData
        });

    } catch (error) {
        console.error('Error in getBankPaidReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Export Bank Paid Salary Report CSV
// @route   GET /api/v1/salary-reports/bank-paid-export
exports.exportBankPaidReport = async (req, res) => {
    try {
        const { month, branches, code, employeeId, type } = req.query;

        if (!month) {
            return res.status(400).send('Month is required for CSV export');
        }

        // Build query for Payroll collection
        let query = { monthYear: month };

        // Branch Filter (Multi-Select)
        if (branches) {
            const branchList = branches.split(',').map(b => b.trim()).filter(b => b !== '');
            if (branchList.length > 0) {
                query.branch = { $in: branchList };
            }
        }

        // Employee filters
        if (employeeId) {
            query.employee = employeeId;
        }
        if (code) {
            query.code = { $regex: code, $options: 'i' };
        }

        // Fetch payrolls and populate employee details
        const payrolls = await Payroll.find(query)
            .populate('employee')
            .sort({ code: 1 });

        // Fetch all branch banks to identify the designated payroll bank for each branch
        const allBranchBanks = await Bank.find({
            isActive: true,
            bankType: 'Branch Bank'
        });

        const payrollBankMap = {}; // Maps Branch Name -> Designated Bank Name
        const debitAccountMap = {}; // Maps Branch Name -> Designated Account No

        allBranchBanks.forEach(bank => {
            if (bank.isPayrollBank === true) {
                payrollBankMap[bank.branch] = (bank.bankName || '').trim().toLowerCase();
                debitAccountMap[bank.branch] = bank.accountNo;
            }
            if (!payrollBankMap[bank.branch]) {
                payrollBankMap[bank.branch] = (bank.bankName || '').trim().toLowerCase();
                debitAccountMap[bank.branch] = bank.accountNo;
            }
        });

        let reportData = [];

        for (const payroll of payrolls) {
            const emp = payroll.employee;
            if (!emp || emp.payrollImportOnly || (emp.code && /^IMP-/i.test(emp.code))) continue;

            const branchName = payroll.branch || emp.branch;
            const designatedBank = payrollBankMap[branchName] || '';
            const employeeBank = (payroll.bank || emp.selectBank || '').trim().toLowerCase();

            const isSameBranchBank = (designatedBank !== '' && employeeBank !== '' && employeeBank === designatedBank);
            const isOtherBank = (designatedBank !== '' && employeeBank !== '' && employeeBank !== designatedBank);

            let includeInReport = false;
            let amount = 0;

            if (type === 'full') {
                if (isOtherBank) {
                    amount = payroll.bankPaid;
                    if (amount === 0 && payroll.cashPaid === 0) amount = payroll.netTotal;
                    if (amount > 0) includeInReport = true;
                }
            } else if (type === 'branch_bank') {
                if (isSameBranchBank) {
                    amount = payroll.bankPaid;
                    if (amount === 0 && payroll.cashPaid === 0) amount = payroll.netTotal;
                    if (amount > 0) includeInReport = true;
                }
            } else if (type === 'half') {
                if (payroll.bankPaid > 0 && !isOtherBank) {
                    includeInReport = true;
                    amount = payroll.bankPaid;
                }
            }

            if (includeInReport && amount > 0) {
                const { singleBranch } = req.query;
                const lookupBranch = singleBranch || branchName;
                const debitAccount = debitAccountMap[lookupBranch] || '';

                reportData.push({
                    code: emp.code || payroll.code,
                    name: emp.name,
                    branch: branchName,
                    debitAccount: debitAccount,
                    creditAccount: emp.acNo || emp.bankDetails?.alf || '',
                    amount: amount,
                    orderingBank: designatedBank.toUpperCase() || emp.selectBank || 'BAFL',
                    transactionId: payroll._id
                });
            }
        }

        // Generate CSV content
        let csv = '';
        if (type === 'full') {
            csv += 'Sr No,Employee Name,Account #,Net Total\n';
            reportData.forEach((row, index) => {
                csv += `"${index + 1}","${(row.name || '').replace(/"/g, '""')}","\t${row.creditAccount || ''}",${row.amount}\n`;
            });
        } else {
            csv += 'Sr No,DEBIT ACCT.NO,ACCOUNT TITLE,CREDIT ACCT.NO,DEBIT CURRENCY,DEBIT AMOUNT,MONTH,ORDERING BANK\n';
            const [yr, mn] = month.split('-');
            const dateObj = new Date(yr, mn - 1);
            const monthStr = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-');

            reportData.forEach((row, index) => {
                csv += `"${index + 1}","${row.debitAccount || 'PK53ALFH00335001005137840'}","${(row.name || '').replace(/"/g, '""')}","\t${row.creditAccount || ''}","PKR",${row.amount},"${monthStr}","${row.orderingBank || 'BAFL'}"\n`;
            });
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="bank_paid_salary_report_${type || 'report'}_${month}.csv"`);
        return res.send(csv);

    } catch (error) {
        console.error('Error in exportBankPaidReport:', error);
        res.status(500).send(error.message);
    }
};
