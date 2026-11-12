import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  Alert,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import api from '../services/api';
import {
  printGenericSalaryReport,
  printSalarySlip,
  promptSalarySlipActions,
  printEmployeePayrollSummaryReport,
  previewEmployeePayrollSummaryReport,
  promptPayrollSummaryActions
} from '../services/printService';

const REPORT_TABS = [
  { key: 'payroll_list', label: 'Payroll List', icon: '📋', title: 'Employee Monthly Payroll List' },
  { key: 'salary_detail', label: 'Salary Detail', icon: '📊', title: 'Employee Salary Detail (Contracts & Structure)' },
  { key: 'payroll_summary', label: 'Payroll Summary', icon: '🏢', title: 'Employee PayRoll Summary' },
  { key: 'bank_paid', label: 'Bank Paid', icon: '🏦', title: 'Bank Paid Salary Register' },
  { key: 'cash_paid', label: 'Cash Paid', icon: '💰', title: 'Cash Paid Salary Register' },
  { key: 'emp_ledger', label: 'Emp Ledger', icon: '📑', title: 'Employee Advance Ledger Report' },
  { key: 'emp_balances', label: 'Emp Balances', icon: '💳', title: 'Employee Balances Report' },
  { key: 'advance_pay_rec', label: 'Advance Pay/Rec', icon: '💵', title: 'Employee Advance Payment & Recovery' },
  { key: 'emp_increment', label: 'Increments', icon: '📈', title: 'Employee Increment Due Report' },
  { key: 'overtime_shorttime', label: 'OT & Short Time', icon: '⏰', title: 'OverTime & Short Time Report' },
  { key: 'short_week', label: 'Short Week (TSW)', icon: '📅', title: 'Employee Short Week (TSW) Deduction Report' },
  { key: 'wht_ded', label: 'WHT Deductions', icon: '🧾', title: 'Withholding Tax (WHT) Deduction Register' },
  { key: 'payroll_status', label: 'Payroll Status', icon: '🔒', title: 'Employee Payroll Approval Status' },
  { key: 'emp_attendance', label: 'Attendance', icon: '📅', title: 'Monthly Attendance Summary' },
  { key: 'advance_activity', label: 'Adv Activity', icon: '🔄', title: 'Employee Advance Activity Timeline' },
  { key: 'emp_info', label: 'Emp Info', icon: '👥', title: 'Employees Master Directory' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const safeText = (val, fallback = '') => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.name) return String(val.name);
    if (val.title) return String(val.title);
    if (val.code) return String(val.code);
    return fallback;
  }
  return fallback;
};

const formatCurrency = (val) => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  } catch (e) {
    return String(dateString);
  }
};

const calculateServiceTime = (joinDateStr, targetYear, targetMonth) => {
  if (!joinDateStr || joinDateStr === '-') return 'N/A';
  try {
    const join = new Date(joinDateStr);
    if (isNaN(join.getTime())) return 'N/A';
    const target = new Date(targetYear, targetMonth, 0);
    let years = target.getFullYear() - join.getFullYear();
    let months = target.getMonth() - join.getMonth();
    let days = target.getDate() - join.getDate();
    if (days < 0) {
      months--;
      const lastMonth = new Date(target.getFullYear(), target.getMonth(), 0);
      days += lastMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    const parts = [];
    if (years > 0) parts.push(`${years} Year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} Month${months > 1 ? 's' : ''}`);
    if (days > 0) parts.push(`${days} Day${days > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' ') : '0 Days';
  } catch (e) {
    return 'N/A';
  }
};

const extractArrayData = (res) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.list)) return res.data.list;
  if (Array.isArray(res.data?.records)) return res.data.records;
  if (Array.isArray(res.data?.data)) return res.data.data;
  if (Array.isArray(res.list)) return res.list;
  if (Array.isArray(res.records)) return res.records;
  if (Array.isArray(res.payrolls)) return res.payrolls;
  if (Array.isArray(res.employees)) return res.employees;
  if (Array.isArray(res.advances)) return res.advances;
  if (Array.isArray(res.financials?.paySlips)) return res.financials.paySlips;
  if (Array.isArray(res.financials?.advanceLedger)) return res.financials.advanceLedger;
  if (Array.isArray(res.financials?.branchAdvances)) return res.financials.branchAdvances;
  return [];
};

// Flattens grouped data from /api/v1/employee-salary-detail/report
const flattenSalaryDetailGrouped = (groupedObj) => {
  if (!groupedObj || typeof groupedObj !== 'object') return [];
  if (Array.isArray(groupedObj)) return groupedObj;
  const flat = [];
  for (const [branch, depts] of Object.entries(groupedObj)) {
    if (typeof depts === 'object' && depts !== null) {
      for (const [dept, deptData] of Object.entries(depts)) {
        if (Array.isArray(deptData?.employees)) {
          deptData.employees.forEach(emp => {
            flat.push({
              ...emp,
              branch: emp.branch || branch,
              department: emp.department || dept
            });
          });
        }
      }
    }
  }
  return flat;
};

export default function EmpSalaryReportsScreen({ route, navigation }) {
  const initialTab = route?.params?.initialTab || 'payroll_list';
  const initialEmployee = route?.params?.employee || null;

  // Navigation & Active Tab
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filter States (Default to 'Select Branch' so user explicitly selects)
  const [branches, setBranches] = useState(['Select Branch', 'All Branches']);
  const [selectedBranch, setSelectedBranch] = useState('Select Branch');
  const [branchModalVisible, setBranchModalVisible] = useState(false);

  // Month & Year Filter (Default: July 2026 where verified payrolls reside)
  const [selectedMonth, setSelectedMonth] = useState(7);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [monthModalVisible, setMonthModalVisible] = useState(false);

  // Date Range for Ledger (From Month & To Month with interactive Modal)
  const [ledgerFromMonth, setLedgerFromMonth] = useState(1);
  const [ledgerToMonth, setLedgerToMonth] = useState(12);
  const [ledgerRangeModalVisible, setLedgerRangeModalVisible] = useState(false);

  // Single Employee Filter (for Ledger)
  const [employeesList, setEmployeesList] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployee);
  const [empPickerVisible, setEmpPickerVisible] = useState(false);
  const [empSearchText, setEmpSearchText] = useState('');
  const searchSeqRef = useRef(0);
  const searchTimeoutRef = useRef(null);

  // Search in table
  const [searchQuery, setSearchQuery] = useState('');

  // Data & Loading States
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [reportSummary, setReportSummary] = useState(null);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // --- Security Verification Modal for Salary Slip Deletion ---
  const [deleteAuthModalVisible, setDeleteAuthModalVisible] = useState(false);
  const [deleteAuthUsername, setDeleteAuthUsername] = useState('bilal shah');
  const [deleteAuthPassword, setDeleteAuthPassword] = useState('');
  const [showDeleteAuthPassword, setShowDeleteAuthPassword] = useState(false);
  const [deleteAuthError, setDeleteAuthError] = useState('');
  const [deleteAuthLoading, setDeleteAuthLoading] = useState(false);
  const [deleteAuthStatusText, setDeleteAuthStatusText] = useState('');
  const [payrollToDelete, setPayrollToDelete] = useState(null);

  // In-App Result Modal for Slip Deletion
  const [deleteResultModal, setDeleteResultModal] = useState({
    visible: false,
    title: '',
    message: '',
    details: null
  });

  // Load distinct branches & employees on mount
  useEffect(() => {
    fetchBranches();
    fetchEmployees('', true);
  }, []);

  // Fetch report whenever filters change
  useEffect(() => {
    fetchActiveReport();
  }, [activeTab, selectedBranch, selectedMonth, selectedYear, selectedEmployee, ledgerFromMonth, ledgerToMonth]);

  const fetchBranches = async () => {
    try {
      const res = await api.get('/mobile/admin/branches');
      if (res && res.success && res.data && res.data.length > 0) {
        const raw = res.data;
        const seen = new Set();
        const clean = ['Select Branch', 'All Branches'];
        seen.add('select branch');
        seen.add('all branches');
        seen.add('all');
        raw.forEach(b => {
          const t = safeText(b).trim();
          const key = t.toLowerCase().replace(/[()]/g, '');
          if (t && !seen.has(key)) {
            seen.add(key);
            clean.push(t);
          }
        });
        setBranches(clean);
        setSelectedBranch('Select Branch');
      }
    } catch (e) {
      console.error('Error loading branches for reports:', e);
    }
  };

  const fetchEmployees = async (query = '', isInitial = false) => {
    const currentSeq = ++searchSeqRef.current;
    try {
      const branchQuery = (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'Select Branch') ? `&branch=${encodeURIComponent(selectedBranch)}` : '';
      const q = query ? `?search=${encodeURIComponent(query)}${branchQuery}` : `?limit=2000${branchQuery}`;
      const res = await api.get(`/mobile/admin/employees-directory${q}`);
      // Discard older out-of-order network responses to prevent race condition
      if (currentSeq !== searchSeqRef.current) return;
      if (res && res.success) {
        const emps = extractArrayData(res);
        if (query) {
          // Merge newly found items with existing list
          setEmployeesList(prev => {
            const seen = new Set(emps.map(e => String(e._id || e.id || e.code)));
            const remaining = prev.filter(e => !seen.has(String(e._id || e.id || e.code)));
            return [...emps, ...remaining];
          });
        } else {
          setEmployeesList(emps);
        }
        if (isInitial && !selectedEmployee && emps.length > 0) {
          setSelectedEmployee(emps[0]);
        }
      }
    } catch (e) {
      console.error('Error loading employees for reports:', e);
    }
  };

  // Instant 0ms client-side filter for employee ledger modal
  const filteredEmployeesForModal = useMemo(() => {
    const list = Array.isArray(employeesList) ? employeesList : [];
    if (!empSearchText.trim()) return list;
    const q = empSearchText.trim().toLowerCase();
    return list.filter(emp => {
      if (!emp) return false;
      const name = safeText(emp.name || emp.empName).toLowerCase();
      const code = safeText(emp.code || emp.empCode).toLowerCase();
      const branch = safeText(emp.branch).toLowerCase();
      const desig = safeText(emp.designation?.name || emp.designation).toLowerCase();
      return name.includes(q) || code.includes(q) || branch.includes(q) || desig.includes(q);
    });
  }, [employeesList, empSearchText]);

  const handleEmpModalSearchChange = (text) => {
    setEmpSearchText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchEmployees(text.trim(), false);
      }, 350);
    }
  };

  const monthYearStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const monthNameStr = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
  const dateParamStr = `${monthYearStr}-01`;
  const lastDayOfMonthStr = `${monthYearStr}-${new Date(selectedYear, selectedMonth, 0).getDate()}`;

  const fetchActiveReport = async () => {
    if (!selectedBranch || selectedBranch === 'Select Branch') {
      setLoading(false);
      setErrorMessage('');
      setReportData([]);
      setReportSummary(null);
      setExpandedRowId(null);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setReportData([]);
    setReportSummary(null);
    setExpandedRowId(null);

    const branchParam = (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'Select Branch') ? `&branch=${encodeURIComponent(selectedBranch)}&branches=${encodeURIComponent(selectedBranch)}` : '';

    try {
      let resultItems = [];

      switch (activeTab) {
        case 'salary_detail': {
          // Master Employee Salary Detail (Basic, Fix Allow, ST Loss, Other Allow, Net Contract Salary)
          const res = await api.get(`/employee-salary-detail/report?t=${Date.now()}${branchParam}`);
          if (res && res.success && res.data) {
            resultItems = flattenSalaryDetailGrouped(res.data);
          }
          if (resultItems.length === 0) {
            const res2 = await api.get(`/hr-dashboard/salary-detail?t=${Date.now()}${branchParam}`);
            resultItems = extractArrayData(res2);
          }
          break;
        }

        case 'payroll_list': {
          // Monthly Generated Payroll List
          const res = await api.get(`/hr-dashboard/salary-list?t=${Date.now()}${branchParam}&date=${dateParamStr}`);
          resultItems = extractArrayData(res);
          if (resultItems.length === 0) {
            let fallbackUrl = `/payrolls?monthYear=${monthYearStr}`;
            if (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'all' && selectedBranch !== 'Select Branch') {
              fallbackUrl += `&branch=${encodeURIComponent(selectedBranch)}`;
            }
            const res2 = await api.get(fallbackUrl);
            resultItems = extractArrayData(res2);
          }
          break;
        }

        case 'payroll_summary': {
          // Exact 1:1 match with Web ERP /employee-payroll-summary-report
          let url = `/payrolls?monthYear=${monthYearStr}`;
          if (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'all') {
            url += `&branch=${encodeURIComponent(selectedBranch)}`;
          }
          const res = await api.get(url);
          resultItems = extractArrayData(res);
          break;
        }

        case 'bank_paid': {
          // Bank Paid Salary Register
          const res = await api.get(`/salary-reports/bank-paid?month=${monthYearStr}${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'cash_paid': {
          // Cash Paid Salary Register
          const res = await api.get(`/salary-reports/cash-paid?month=${monthYearStr}&paidStatus=All${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'payroll_status': {
          // Employee Payroll Status Report
          const res = await api.get(`/salary-reports/emp-payroll-status?monthYear=${monthYearStr}${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'emp_ledger': {
          // Employee Advance Ledger (With From-Month and To-Month Date Range)
          if (selectedEmployee) {
            const empCode = selectedEmployee.code || selectedEmployee.empCode || selectedEmployee.id || selectedEmployee._id;
            const fromDate = `${selectedYear}-${String(ledgerFromMonth).padStart(2, '0')}-01`;
            const toDate = `${selectedYear}-${String(ledgerToMonth).padStart(2, '0')}-${new Date(selectedYear, ledgerToMonth, 0).getDate()}`;
            try {
              const res = await api.get(`/hr-dashboard/advance-ledger?employeeCode=${encodeURIComponent(empCode)}&fromDate=${fromDate}&toDate=${toDate}&employeeId=${encodeURIComponent(empCode)}`);
              resultItems = extractArrayData(res);
              if (res && res.summary) {
                setReportSummary(res.summary);
              }
            } catch (err) {
              console.error('Error fetching advance-ledger:', err);
              const res2 = await api.get(`/mobile/employee/financials?employeeId=${empCode}&month=${ledgerToMonth}&year=${selectedYear}`);
              resultItems = extractArrayData(res2);
            }
          }
          break;
        }

        case 'emp_balances': {
          // Employee Advance Balances
          try {
            const res = await api.get(`/hr-dashboard/advance-summary?t=${Date.now()}${branchParam}`);
            resultItems = extractArrayData(res);
            if (res && res.data && !Array.isArray(res.data)) {
              setReportSummary(res.data);
            }
          } catch (err) {
            const res2 = await api.get(`/mobile/employee/financials?mode=branch_advances&branch=${encodeURIComponent(selectedBranch || 'All Branches')}&month=${selectedMonth}&year=${selectedYear}`);
            resultItems = extractArrayData(res2);
          }
          break;
        }

        case 'advance_pay_rec': {
          // Advance Payment & Recovery Report
          const startOfYear = `${selectedYear}-01-01`;
          const endOfYear = `${selectedYear}-12-31`;
          const res = await api.get(`/employee-advances/report?startDate=${startOfYear}&endDate=${endOfYear}${branchParam}`);
          resultItems = extractArrayData(res);
          if (res && res.summary) setReportSummary(res.summary);
          break;
        }

        case 'emp_increment': {
          // Increments Due in Selected Month/Year — EXACT 1:1 match with Web ERP employee-increment-report.html
          let allEmps = [];
          try {
            const res = await api.get(`/employees?limit=5000${branchParam}`);
            allEmps = extractArrayData(res);
          } catch (e) {
            console.error('Error fetching /employees for increment report:', e);
          }
          if (!allEmps || allEmps.length === 0) {
            try {
              const res2 = await api.get(`/mobile/admin/employees-directory?limit=5000${branchParam}`);
              allEmps = extractArrayData(res2);
            } catch (e2) {
              console.error('Error fetching /employees-directory for increment report:', e2);
            }
          }

          const targetYear = selectedYear;
          const targetMonth = selectedMonth - 1; // 0-indexed month (August = 7)

          const dueEmps = (allEmps || []).filter(e => {
            if (!e) return false;
            // Branch filtering
            if (selectedBranch && selectedBranch !== 'All Branches') {
              const b = safeText(e.branch).toLowerCase().replace(/[()]/g, '').trim();
              const selB = selectedBranch.toLowerCase().replace(/[()]/g, '').trim();
              if (b !== selB) return false;
            }

            const rawIncr = e.incrDate || e.lastIncrementDate;
            const lastDate = rawIncr ? new Date(rawIncr) : (e.joiningDate ? new Date(e.joiningDate) : null);
            if (!lastDate || isNaN(lastDate.getTime())) return false;

            const nextDueYear = lastDate.getFullYear() + 1;
            const nextDueMonth = lastDate.getMonth();

            return nextDueYear === targetYear && nextDueMonth === targetMonth;
          });

          resultItems = dueEmps.map(e => {
            const basic = Number(e.basicSalary || e.perMonth || e.basic || 0);
            const allow = Number(e.fixAllowance || 0) + Number(e.stLoss || 0) + Number(e.otherAllowance || 0);
            const net = basic + allow;
            const rawIncr = e.incrDate || e.lastIncrementDate;
            let nextIncStr = 'N/A';
            if (rawIncr) {
              const d = new Date(rawIncr);
              if (!isNaN(d.getTime())) {
                d.setFullYear(d.getFullYear() + 1);
                nextIncStr = formatDate(d);
              }
            }
            const deptName = typeof e.department === 'object' ? (e.department?.name || '') : (e.department || '');
            const desigName = typeof e.designation === 'object' ? (e.designation?.name || '') : (e.designation || '');

            return {
              ...e,
              basicSalary: basic,
              allowance: allow,
              netSalary: net,
              nextIncDate: nextIncStr,
              department: deptName,
              designation: desigName
            };
          });
          break;
        }

        case 'overtime_shorttime': {
          // OverTime & Short Time Report
          const res = await api.get(`/reports/overtime-shorttime?from=${dateParamStr}&to=${lastDayOfMonthStr}&criteria=Both${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'short_week': {
          // Employee Short Week (TSW) Deduction Report
          const res = await api.get(`/reports/short-week?monthYear=${monthYearStr}${branchParam}&onlyShortWeek=true`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'wht_ded': {
          // Withholding Tax Deduction Detail
          const res = await api.get(`/employees/reports/wh-ded-report?fromMonth=${monthYearStr}&toMonth=${monthYearStr}${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'emp_attendance': {
          // Monthly Attendance Summary
          const res = await api.get(`/attendance?from=${dateParamStr}&to=${lastDayOfMonthStr}&limit=5000${branchParam}`);
          const rawAtt = extractArrayData(res);
          const empMap = {};
          rawAtt.forEach(a => {
            const empCode = safeText(a.employee?.code || a.code || a.employeeCode);
            if (!empCode) return;
            if (!empMap[empCode]) {
              empMap[empCode] = {
                code: empCode,
                name: safeText(a.employee?.name || a.employeeName || a.name, 'Staff'),
                branch: safeText(a.branch || a.employee?.branch, '-'),
                designation: safeText(a.employee?.designation?.name || a.employee?.designation || a.designation, 'Staff'),
                presentDays: 0,
                absentDays: 0,
                workedMins: 0,
                lateIns: 0,
                totalDays: 0
              };
            }
            empMap[empCode].totalDays++;
            if (a.status === 'Present' || a.checkIn) {
              empMap[empCode].presentDays++;
            } else if (a.status === 'Absent') {
              empMap[empCode].absentDays++;
            }
            if (a.isLate) empMap[empCode].lateIns++;
            if (Number(a.workedMinutes)) empMap[empCode].workedMins += Number(a.workedMinutes);
          });
          resultItems = Object.values(empMap);
          break;
        }

        case 'advance_activity': {
          const startOfYear = `${selectedYear}-01-01`;
          const endOfYear = `${selectedYear}-12-31`;
          const res = await api.get(`/employee-advances/report?startDate=${startOfYear}&endDate=${endOfYear}${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        case 'emp_info': {
          const res = await api.get(`/mobile/admin/employees-directory?limit=1000${branchParam}`);
          resultItems = extractArrayData(res);
          break;
        }

        default:
          break;
      }

      setReportData(Array.isArray(resultItems) ? resultItems : []);
    } catch (err) {
      console.error(`Error loading report ${activeTab}:`, err);
      setErrorMessage(err.message || 'Unable to fetch report data.');
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract net amount for any report row
  const getRowNetAmount = (item) => {
    if (!item || typeof item !== 'object') return 0;
    if (activeTab === 'emp_attendance') return Number(item.presentDays || 0);
    if (activeTab === 'emp_increment') return Number(item.basicSalary || 0);
    if (activeTab === 'payroll_summary') return Number(item.netTotal ?? item.totalNetSalary ?? item.grossTotal ?? item.perMonth ?? item.totalBasicSalary ?? 0);
    if (activeTab === 'overtime_shorttime') return Number(item.netRs ?? item.netAmount ?? item.otRs ?? 0);
    if (activeTab === 'short_week') return Number(item.extraShortDeduction ?? item.totalShortDeduction ?? 0);
    if (activeTab === 'wht_ded') return Number(item.whtDeduction ?? item.wht ?? 0);
    if (activeTab === 'bank_paid') return Number(item.amount ?? item.netTotal ?? item.bankPaid ?? 0);
    if (activeTab === 'cash_paid') return Number(item.cashPaid ?? item.netSalary ?? item.netTotal ?? 0);
    if (activeTab === 'emp_ledger') return Number(item.balance ?? item.debit ?? 0);
    if (activeTab === 'payroll_list') {
      const bPaid = Number(item.bankPaid || 0);
      const cPaid = Number(item.cashPaid || 0);
      if (bPaid > 0) return bPaid;
      if (cPaid > 0) return cPaid;
      if (item.netTotal !== undefined && item.wht) {
        return Math.max(0, Number(item.netTotal) - Number(item.wht));
      }
      return Number(item.netTotal ?? item.netSalary ?? item.netPayable ?? 0);
    }
    return Number(
      item.netTotal ??
      item.netSalary ??
      item.netPayable ??
      item.amount ??
      item.currentSalary ??
      item.newSalary ??
      item.basicSalary ??
      item.perMonth ??
      item.balance ??
      item.advanceBalance ??
      item.whtAmount ??
      item.taxAmount ??
      item.otAmount ??
      item.overtimePay ??
      0
    );
  };

  // Filter items by search query
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(reportData) ? reportData : [];
    if (!searchQuery.trim()) return safeData;
    const q = searchQuery.toLowerCase().trim();
    return safeData.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const name = safeText(item.name || item.employeeName || item.empName || item.employee?.name || item._id).toLowerCase();
      const code = safeText(item.code || item.employeeCode || item.empCode || item.employee?.code).toLowerCase();
      const branch = safeText(item.branch || item.department || item.bank || item._id).toLowerCase();
      const desc = safeText(item.description || item.narration || item.remarks || item.designation).toLowerCase();
      const cnic = safeText(item.cnic).toLowerCase();
      return name.includes(q) || code.includes(q) || branch.includes(q) || desc.includes(q) || cnic.includes(q);
    });
  }, [reportData, searchQuery]);

  // Navigate between months
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const currentTabObj = REPORT_TABS.find(t => t.key === activeTab) || REPORT_TABS[0];

  // -----------------------------------------------------------------
  // SALARY PAYSLIP DIRECT PRINT & WEB LINK HANDLER (Payroll List only)
  // -----------------------------------------------------------------
  const handlePrintSlip = async (item) => {
    try {
      const payrollId = item._id || item.id || item.payrollId;
      const emp = {
        name: safeText(item.name || item.employee?.name || item.empName, 'Staff'),
        code: safeText(item.code || item.employee?.code || item.empCode, '-'),
        branch: safeText(item.branch || item.employee?.branch, selectedBranch),
        designation: safeText(item.designation?.name || item.designation || item.employee?.designation, 'Staff'),
        department: safeText(item.department?.name || item.department || item.employee?.department, 'General')
      };

      const basic = Number(item.perMonth ?? item.basicSalary ?? item.basic ?? 0);
      const gross = Number(item.grossTotal ?? item.grossSalary ?? item.earningsTotal ?? 0);
      const ded = Number(item.deductionsTotal ?? item.totalDeductions ?? 0);
      const net = Number(item.netTotal ?? item.netSalary ?? item.netPayable ?? 0);

      const slip = {
        ...item,
        _id: payrollId,
        id: payrollId,
        payrollId,
        monthYear: item.monthYear || monthYearStr,
        branch: emp.branch,
        perMonth: basic,
        basicSalary: basic,
        grossTotal: gross,
        grossSalary: gross,
        deductionsTotal: ded,
        totalDeductions: ded,
        netTotal: net,
        netSalary: net,
        bankPaid: Number(item.bankPaid || 0),
        cashPaid: Number(item.cashPaid || 0),
        overTime: Number(item.overTime || 0),
        natin: Number(item.natin || item.fixAllowance || 0),
        monthlyComm: Number(item.monthlyComm || item.commission || 0),
        warehouseComm: Number(item.warehouseComm || 0),
        otherAllow: Number(item.otherAllow || item.otherAllowance || 0),
        rent: Number(item.rent || 0),
        teaAllowance: Number(item.teaAllowance || 0),
        stLateAllow: Number(item.stLateAllow || 0),
        shortWeek: Number(item.shortWeek || item.shortTimeAmount || item.shortTime || 0),
        shortTimeAmount: Number(item.shortTimeAmount || item.shortWeek || 0),
        ebDeduction: Number(item.ebDeduction || item.food || item.mess || 0),
        pAAdv: Number(item.pAAdv || 0),
        csMale: Number(item.csMale || 0),
        pmAdvRec: Number(item.pmAdvRec || 0),
        cmAdvRec: Number(item.cmAdvRec || 0),
        totalAdvRec: Number(item.totalAdvRec || ((item.pmAdvRec || 0) + (item.cmAdvRec || 0)) || 0),
        totalAdv: Number(item.totalAdv || ((item.pAAdv || 0) + (item.csMale || 0)) || 0),
        penalty: Number(item.penalty || 0),
        otherDeduction: Number(item.otherDeduction || 0),
        umrahDeduction: Number(item.umrahDeduction || 0),
        wht: Number(item.wht || item.whtAmount || 0),
        securityDeposit: Number(item.securityDeposit || 0),
        workedDays: safeText(item.workedDays, '-'),
        workedHrs: item.workedHrs ? Number(item.workedHrs).toFixed(1) : '-'
      };

      promptSalarySlipActions(emp, slip);
    } catch (err) {
      console.error('Error opening slip actions:', err);
      Alert.alert('Print Error', 'Could not open salary slip options: ' + err.message);
    }
  };

  // -----------------------------------------------------------------
  // SALARY SLIP DELETE HANDLERS (Strictly Bilal Shah password authorized)
  // -----------------------------------------------------------------
  const handlePromptDeleteSlip = (item) => {
    setPayrollToDelete(item);
    setDeleteAuthUsername('bilal shah');
    setDeleteAuthPassword('');
    setShowDeleteAuthPassword(false);
    setDeleteAuthError('');
    setDeleteAuthStatusText('');
    setDeleteAuthModalVisible(true);
  };

  const handleAuthorizeAndDeletePayroll = async () => {
    setDeleteAuthError('');
    if (!deleteAuthUsername.trim() || !deleteAuthPassword) {
      setDeleteAuthError('Please enter both username and password.');
      return;
    }

    if (!payrollToDelete) {
      setDeleteAuthError('No salary slip selected for deletion.');
      return;
    }

    const payrollId = payrollToDelete._id || payrollToDelete.id || payrollToDelete.payrollId;
    if (!payrollId) {
      setDeleteAuthError('Unable to identify payroll record ID.');
      return;
    }

    setDeleteAuthLoading(true);
    setDeleteAuthStatusText('🔐 Verifying Bilal Shah authorization...');

    try {
      // 1. Authenticate against backend server
      const authRes = await api.verifyAdminCredentials(deleteAuthUsername.trim(), deleteAuthPassword);

      if (!authRes || !authRes.success) {
        setDeleteAuthError(authRes?.message || 'Invalid credentials. Authorization failed.');
        setDeleteAuthLoading(false);
        setDeleteAuthStatusText('');
        return;
      }

      // 2. Strict User Check: Must be "bilal shah"
      const returnedEmail = (authRes.email || authRes.code || authRes.username || '').toLowerCase().trim();
      const returnedName = (authRes.name || '').toLowerCase().trim();
      const typedUser = deleteAuthUsername.toLowerCase().trim();

      const isBilalShah =
        typedUser === 'bilal shah' ||
        typedUser === 'bilal' ||
        returnedEmail === 'bilal shah' ||
        returnedName.includes('bilal');

      if (!isBilalShah) {
        setDeleteAuthError('⛔ ACCESS DENIED: Only Bilal Shah is authorized to delete salary slips.');
        setDeleteAuthLoading(false);
        setDeleteAuthStatusText('');
        return;
      }

      // 3. Authorized: Execute DELETE on Backend MongoDB & Web ERP
      setDeleteAuthStatusText('🗑️ Deleting payroll slip from database & web ERP...');
      const deleteRes = await api.deletePayroll(payrollId, authRes.token);

      if (deleteRes && (deleteRes.success || deleteRes.data)) {
        const empName = safeText(payrollToDelete.name || payrollToDelete.employee?.name || payrollToDelete.empName, 'Employee');
        const mYear = payrollToDelete.monthYear || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

        setDeleteAuthModalVisible(false);
        setDeleteAuthLoading(false);
        setDeleteAuthPassword('');
        setDeleteAuthStatusText('');
        setPayrollToDelete(null);

        // Show Success Result Modal
        setDeleteResultModal({
          visible: true,
          title: 'Salary Slip Deleted Successfully!',
          message: `The salary slip for ${empName} (${mYear}) has been permanently deleted from MongoDB and Web ERP.`,
          details: 'You can now calculate and generate a brand-new slip.'
        });

        // Refresh active report list immediately
        fetchActiveReport();
      } else {
        setDeleteAuthError(deleteRes?.message || 'Failed to delete salary slip.');
        setDeleteAuthLoading(false);
        setDeleteAuthStatusText('');
      }
    } catch (e) {
      setDeleteAuthError(e.message || 'Error deleting salary slip.');
      setDeleteAuthLoading(false);
      setDeleteAuthStatusText('');
    }
  };

  // -----------------------------------------------------------------
  // PRINT / EXPORT PDF BUILDER (Exact Web App Format)
  // -----------------------------------------------------------------
  const handlePrintReport = async (isPreview = false) => {
    if (!filteredData || filteredData.length === 0) {
      Alert.alert('Empty Report', 'No records found to generate PDF.');
      return;
    }

    // Special handler for Employee Payroll Summary (100% Match with Web ERP landscape report)
    if (activeTab === 'payroll_summary') {
      if (isPreview) {
        // Download / Share Official PDF
        await printEmployeePayrollSummaryReport({
          payrolls: filteredData,
          monthYear: monthYearStr,
          branch: selectedBranch
        });
      } else {
        // In-App Visual Landscape Preview (Print Spooler with Zoom & Save as PDF)
        await previewEmployeePayrollSummaryReport({
          payrolls: filteredData,
          monthYear: monthYearStr,
          branch: selectedBranch
        });
      }
      return;
    }

    const meta = {
      'Report Period': activeTab === 'salary_detail' ? 'Master Salary Structure' : (activeTab === 'emp_ledger' ? `${MONTH_NAMES[ledgerFromMonth - 1]} - ${MONTH_NAMES[ledgerToMonth - 1]} ${selectedYear}` : monthNameStr),
      'Store Branch': selectedBranch,
      'Total Records': `${filteredData.length} entries`,
      ...(activeTab === 'emp_ledger' && selectedEmployee ? { 'Employee': `${safeText(selectedEmployee.name)} (#${safeText(selectedEmployee.code)})` } : {})
    };

    let columns = [];

    switch (activeTab) {
      case 'salary_detail':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code || r.empCode)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name || r.empName), style: 'width: 26%; font-weight: bold;' },
          { header: 'Branch / Dept', render: r => `${safeText(r.branch, '-')} • ${safeText(r.department?.name || r.department)}`, style: 'width: 22%;' },
          { header: 'Incr. Date', render: r => formatDate(r.incrDate), style: 'width: 10%; text-align: center;' },
          { header: 'Basic Salary', render: r => formatCurrency(r.basicSalary || r.perMonth || r.basic), align: 'right', style: 'width: 11%; font-weight: bold;' },
          { header: 'Fix Allow', render: r => formatCurrency(r.fixAllowance), align: 'right', style: 'width: 7%;' },
          { header: 'ST Loss', render: r => Number(r.stLoss) > 0 ? `-${formatCurrency(r.stLoss)}` : '0', align: 'right', style: 'width: 7%; color: #dc2626;' },
          { header: 'Other Allow', render: r => formatCurrency(r.otherAllowance), align: 'right', style: 'width: 9%;' },
          { header: 'Net Salary', render: r => formatCurrency(r.netSalary || ((r.basicSalary || 0) + (r.fixAllowance || 0) + (r.otherAllowance || 0) - (r.stLoss || 0))), align: 'right', style: 'width: 10%; font-weight: bold; color: #0284c7;' }
        ];
        break;

      case 'payroll_summary':
        columns = [
          { header: 'Sr#', render: (_, idx) => idx + 1, style: 'width: 6%; text-align: center;' },
          { header: 'Branch Name', render: r => safeText(r._id || r.branch), style: 'width: 32%; font-weight: bold;' },
          { header: 'Staff Enrolled', render: r => `${r.employeeCount || 0} Staff`, style: 'width: 14%; text-align: center;' },
          { header: 'Total Basic', render: r => formatCurrency(r.totalBasicSalary), align: 'right', style: 'width: 16%;' },
          { header: 'Allowances', render: r => formatCurrency(r.totalAllowances), align: 'right', style: 'width: 14%;' },
          { header: 'Deductions', render: r => formatCurrency(r.totalDeductions), align: 'right', style: 'width: 14%; color: #dc2626;' },
          { header: 'Net Disbursed', render: r => formatCurrency(r.totalNetSalary), align: 'right', style: 'width: 18%; font-weight: bold; color: #16a34a;' }
        ];
        break;

      case 'emp_increment':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code)}`, style: 'width: 8%; text-align: center;' },
          { header: 'Employee Name', render: r => safeText(r.name), style: 'width: 20%; font-weight: bold;' },
          { header: 'Branch / Dept', render: r => `${safeText(r.branch, '-')} • ${safeText(r.department?.name || r.department)}`, style: 'width: 18%;' },
          { header: 'Service Time', render: r => calculateServiceTime(r.joiningDate, selectedYear, selectedMonth), style: 'width: 18%; text-align: center;' },
          { header: 'Basic Salary', render: r => formatCurrency(r.basicSalary), align: 'right', style: 'width: 10%; font-weight: bold;' },
          { header: 'Allowance', render: r => formatCurrency(r.allowance || (r.fixAllowance || 0) + (r.stLoss || 0) + (r.otherAllowance || 0)), align: 'right', style: 'width: 8%;' },
          { header: 'Net Salary', render: r => formatCurrency(r.netSalary || ((r.basicSalary || 0) + (r.allowance || 0))), align: 'right', style: 'width: 10%; font-weight: bold; color: #16a34a;' },
          { header: 'Last Inc Date', render: r => formatDate(r.incrDate || r.lastIncrementDate), style: 'width: 10%; text-align: center;' },
          { header: 'Next Inc Date', render: r => r.nextIncDate || formatDate(r.incrDate || r.lastIncrementDate), style: 'width: 10%; text-align: center;' }
        ];
        break;

      case 'overtime_shorttime':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name), style: 'width: 24%; font-weight: bold;' },
          { header: 'Worked / Req', render: r => `${safeText(r.workedHrs, '0:00')} / ${safeText(r.reqHrs, '0:00')}h`, style: 'width: 18%; text-align: center;' },
          { header: 'OT Pay', render: r => Number(r.otRs) > 0 ? `+Rs. ${formatCurrency(r.otRs)} (${r.otHrs})` : '-', align: 'right', style: 'width: 18%; color: #16a34a;' },
          { header: 'ST Loss', render: r => Number(r.stRs) > 0 ? `-Rs. ${formatCurrency(r.stRs)} (${r.stHrs})` : '-', align: 'right', style: 'width: 18%; color: #dc2626;' },
          { header: 'Net OT/ST', render: r => `Rs. ${formatCurrency(r.netRs)}`, align: 'right', style: 'width: 14%; font-weight: bold; color: #0284c7;' }
        ];
        break;

      case 'bank_paid':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code || r.employee?.code)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name || r.employee?.name), style: 'width: 26%; font-weight: bold;' },
          { header: 'Branch', render: r => safeText(r.branch), style: 'width: 18%;' },
          { header: 'Bank', render: r => safeText(r.orderingBank || 'ALF'), style: 'width: 10%;' },
          { header: 'Debit Account', render: r => safeText(r.debitAccount, '-'), style: 'width: 20%; font-family: monospace;' },
          { header: 'Credit A/C (IBAN)', render: r => safeText(r.creditAccount, '-'), style: 'width: 20%; font-family: monospace;' },
          { header: 'Disbursed (Rs.)', render: r => formatCurrency(r.amount || r.bankPaid), align: 'right', style: 'width: 14%; font-weight: bold; color: #0284c7;' }
        ];
        break;

      case 'cash_paid':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code || r.employee?.code)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name || r.employee?.name), style: 'width: 32%; font-weight: bold;' },
          { header: 'Branch / Dept', render: r => `${safeText(r.branch, '-')} • ${safeText(r.department)}`, style: 'width: 26%;' },
          { header: 'Net Cash (Rs.)', render: r => formatCurrency(r.cashPaid || r.netSalary || r.netTotal), align: 'right', style: 'width: 18%; font-weight: bold;' },
          { header: 'Receiver Signature', render: () => '________________', align: 'center', style: 'width: 16%;' }
        ];
        break;

      case 'payroll_status':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code || r.empCode)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name), style: 'width: 32%; font-weight: bold;' },
          { header: 'Branch / Dept', render: r => `${safeText(r.branch, '-')} • ${safeText(r.department?.name || r.department)}`, style: 'width: 28%;' },
          { header: 'Status', render: r => safeText(r.status, 'Generated'), style: 'width: 16%; text-align: center;' },
          { header: 'Gross Salary', render: r => formatCurrency(r.grossSalary || r.basicSalary), align: 'right', style: 'width: 16%; font-weight: bold;' }
        ];
      case 'short_week':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.employeeName || r.name), style: 'width: 28%; font-weight: bold;' },
          { header: 'Branch', render: r => safeText(r.branch, '-'), style: 'width: 16%;' },
          { header: 'Basic Salary', render: r => formatCurrency(r.basicSalary), align: 'right', style: 'width: 12%;' },
          { header: 'TSW Days', render: r => `+${r.shortWeekDays || 0} d`, align: 'center', style: 'width: 10%; color: #dc2626; font-weight: bold;' },
          { header: 'Extra ST', render: r => `${r.extraShortHrsStr || r.extraShortHrs || 0}h`, align: 'center', style: 'width: 10%;' },
          { header: 'TSW Ded (Rs.)', render: r => formatCurrency(r.extraShortDeduction), align: 'right', style: 'width: 16%; font-weight: bold; color: #dc2626;' }
        ];
        break;

      case 'wht_ded':
        columns = [
          { header: 'Sr#', render: (_, idx) => idx + 1, style: 'width: 6%; text-align: center;' },
          { header: 'Employee Name', render: r => safeText(r.name), style: 'width: 30%; font-weight: bold;' },
          { header: 'CNIC', render: r => safeText(r.cnic, '-'), style: 'width: 22%;' },
          { header: 'Pre-Tax Net', render: r => formatCurrency(r.netTotal), align: 'right', style: 'width: 14%;' },
          { header: 'WHT Tax Deduction', render: r => formatCurrency(r.whtDeduction), align: 'right', style: 'width: 14%; font-weight: bold; color: #dc2626;' },
          { header: 'Bank Disbursed', render: r => formatCurrency(r.bankPaid), align: 'right', style: 'width: 14%; font-weight: bold; color: #0284c7;' }
        ];
        break;

      case 'emp_ledger':
        columns = [
          { header: 'Date', render: r => formatDate(r.date), style: 'width: 14%;' },
          { header: 'Type', render: r => safeText(r.type, 'Advance'), style: 'width: 14%; font-weight: bold;' },
          { header: 'Description / Remarks', render: r => safeText(r.narration || r.description || r.remarks, '-'), style: 'width: 38%;' },
          { header: 'Debit (+)', render: r => Number(r.debit) > 0 ? formatCurrency(r.debit) : '-', align: 'right', style: 'width: 11%; color: #dc2626;' },
          { header: 'Credit (-)', render: r => Number(r.credit) > 0 ? formatCurrency(r.credit) : '-', align: 'right', style: 'width: 11%; color: #16a34a;' },
          { header: 'Balance', render: r => formatCurrency(r.balance), align: 'right', style: 'width: 12%; font-weight: bold; color: #0284c7;' }
        ];
        break;

      case 'emp_balances':
        columns = [
          { header: 'Sr#', render: (_, idx) => idx + 1, style: 'width: 6%; text-align: center;' },
          { header: 'Code', render: r => `#${safeText(r.code || r.empCode)}`, style: 'width: 12%;' },
          { header: 'Employee Name', render: r => safeText(r.name || r.empName), style: 'width: 38%; font-weight: bold;' },
          { header: 'Branch', render: r => safeText(r.branch, '-'), style: 'width: 22%;' },
          { header: 'Advance Balance', render: r => `Rs. ${formatCurrency(r.balance || r.advanceBalance || r.outstanding)}`, align: 'right', style: 'width: 22%; font-weight: bold; color: #dc2626;' }
        ];
        break;

      case 'emp_attendance':
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code)}`, style: 'width: 10%;' },
          { header: 'Employee Name', render: r => safeText(r.name), style: 'width: 34%; font-weight: bold;' },
          { header: 'Branch', render: r => safeText(r.branch, '-'), style: 'width: 20%;' },
          { header: 'Present Days', render: r => `${r.presentDays || 0} d`, style: 'width: 12%; text-align: center; color: #16a34a; font-weight: bold;' },
          { header: 'Absent Days', render: r => `${r.absentDays || 0} d`, style: 'width: 12%; text-align: center; color: #dc2626; font-weight: bold;' },
          { header: 'Worked Hours', render: r => `${(Number(r.workedMins || 0) / 60).toFixed(1)} hrs`, style: 'width: 12%; text-align: center;' }
        ];
        break;

      default:
        columns = [
          { header: 'Code', render: r => `#${safeText(r.code || r.empCode)}`, style: 'width: 8%;' },
          { header: 'Employee Name', render: r => safeText(r.name || r.empName), style: 'width: 26%; font-weight: bold;' },
          { header: 'Branch', render: r => safeText(r.branch, '-'), style: 'width: 16%;' },
          { header: 'Basic Rate', render: r => formatCurrency(r.perMonth || r.basicSalary || r.basic), align: 'right', style: 'width: 12%;' },
          { header: 'Gross Earned', render: r => formatCurrency(r.grossTotal || r.grossSalary || r.gross), align: 'right', style: 'width: 12%;' },
          { header: 'Deductions', render: r => formatCurrency(r.deductionsTotal || r.totalDeductions || r.deductions), align: 'right', style: 'width: 12%; color: #dc2626;' },
          { header: 'Net Payable', render: r => formatCurrency(r.netTotal || r.netSalary || r.netPayable || r.amount), align: 'right', style: 'width: 14%; font-weight: bold; color: #0284c7;' }
        ];
        break;
    }

    const totalPayableSum = filteredData.reduce((sum, r) => sum + getRowNetAmount(r), 0);
    const summaryCards = [
      { label: 'Total Records', value: `${filteredData.length} entries`, type: 'blue' },
      { label: activeTab === 'emp_attendance' ? 'Total Present Days' : 'Total Computed Value', value: activeTab === 'emp_attendance' ? `${totalPayableSum} Days` : `Rs. ${formatCurrency(totalPayableSum)}`, type: 'green' }
    ];

    await printGenericSalaryReport({
      title: currentTabObj.title,
      subtitle: `Official HR & Accounting Register — ${monthNameStr}`,
      meta,
      summaryCards,
      columns,
      rows: filteredData,
      footerTotals: [
        { colspan: Math.max(1, columns.length - 2), value: 'REPORT GRAND TOTALS:', style: 'text-align: right;' },
        { value: activeTab === 'emp_attendance' ? `${totalPayableSum} Days` : `Rs. ${formatCurrency(totalPayableSum)}`, style: 'text-align: right;' }
      ]
    }, isPreview);
  };

  // -----------------------------------------------------------------
  // RENDER CARD ITEMS (Specialized Per Tab)
  // -----------------------------------------------------------------
  const renderItem = ({ item, index }) => {
    if (!item || typeof item !== 'object') return null;

    const isExpanded = expandedRowId === (item.id || item._id || index);
    const toggleExpand = () => setExpandedRowId(isExpanded ? null : (item.id || item._id || index));

    // ─── 1. ATTENDANCE REPORT CARD (Distinct Screen Card Layout) ───
    if (activeTab === 'emp_attendance') {
      const name = safeText(item.name, 'Staff');
      const code = safeText(item.code, '-');
      const branch = safeText(item.branch, '-');
      const desig = safeText(item.designation, 'Staff');
      const present = Number(item.presentDays || 0);
      const absent = Number(item.absentDays || 0);
      const workedHrs = (Number(item.workedMins || 0) / 60).toFixed(1);
      const late = Number(item.lateIns || 0);

      return (
        <TouchableOpacity
          style={[styles.reportCard, isExpanded && styles.reportCardExpanded]}
          onPress={toggleExpand}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#10B981' }]}>
              <Text style={[styles.cardAvatarText, { color: '#10B981' }]}>📅</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardDesigText}>{desig}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Monthly Attendance</Text>
              <Text style={[styles.cardAmountValue, { color: '#10B981' }]}>
                {present} {present === 1 ? 'Day' : 'Days'} Present
              </Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Present: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{present} d</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Absent: <Text style={{ color: absent > 0 ? '#EF4444' : '#94A3B8', fontWeight: 'bold' }}>{absent} d</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Worked: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{workedHrs}h</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Late: <Text style={{ color: late > 0 ? '#F59E0B' : '#94A3B8', fontWeight: 'bold' }}>{late}</Text>
            </Text>
          </View>

          {isExpanded && (
            <View style={styles.cardExpandedBody}>
              <View style={styles.cardDivider} />
              <View style={styles.expandedGrid}>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Total Present Days</Text>
                  <Text style={[styles.expandedVal, { color: '#10B981' }]}>{present} Days</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Total Absent Days</Text>
                  <Text style={[styles.expandedVal, { color: '#EF4444' }]}>{absent} Days</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Total Worked Hours</Text>
                  <Text style={[styles.expandedVal, { color: '#38BDF8' }]}>{workedHrs} Hours</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Late Arrivals</Text>
                  <Text style={[styles.expandedVal, { color: '#F59E0B' }]}>{late} Times</Text>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // ─── 2. PAYROLL SUMMARY (Exact Web ERP Employee PayRoll Summary) ───
    if (activeTab === 'payroll_summary') {
      // Branch Rollup fallback if item has employeeCount and no individual employee
      if (item.employeeCount && !item.employee && !item.code) {
        const branchName = safeText(item._id || item.branch, 'Store Branch');
        const staffCount = Number(item.employeeCount || 0);
        const totalBasic = Number(item.totalBasicSalary || 0);
        const totalAllow = Number(item.totalAllowances || 0);
        const totalDed = Number(item.totalDeductions || 0);
        const totalNet = Number(item.totalNetSalary || 0);

        return (
          <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardAvatarCircle, { borderColor: '#10B981' }]}>
                <Text style={[styles.cardAvatarText, { color: '#10B981' }]}>🏢</Text>
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.cardNameText}>📍 {branchName}</Text>
                <View style={styles.cardMetaPillRow}>
                  <Text style={styles.cardDesigText}>👥 {staffCount} Staff Enrolled</Text>
                </View>
              </View>
              <View style={styles.cardAmountBox}>
                <Text style={styles.cardAmountLabel}>Total Net Payroll</Text>
                <Text style={[styles.cardAmountValue, { color: '#10B981' }]}>Rs. {formatCurrency(totalNet)}</Text>
              </View>
            </View>

            <View style={styles.compactMetricRow}>
              <Text style={styles.compactMetricText}>
                Basic: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs. {formatCurrency(totalBasic)}</Text>
              </Text>
              <Text style={styles.compactMetricText}>
                Allow: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(totalAllow)}</Text>
              </Text>
              <Text style={styles.compactMetricText}>
                Ded: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Rs. {formatCurrency(totalDed)}</Text>
              </Text>
            </View>
          </TouchableOpacity>
        );
      }

      // Individual Employee Summary Record (100% Web ERP Match)
      const empName = safeText(item.name || item.employee?.name || item.employeeName, 'Staff');
      const empCode = safeText(item.code || item.employee?.code, '-');
      const branchName = safeText(item.branch, 'Main Store');
      const deptName = safeText(item.department?.name || item.department || item.employee?.department?.name, 'General');

      // Duty Hours
      const reqHrs = Number(item.totalHrsPerMonth || 0);
      const otHrs = Number(item.overTimeHrs || 0);
      const wrkHrs = Number(item.workedHrs || 0) + otHrs;
      const stHrs = Number(item.shortTimeHrs || 0);

      // Financials
      const basic = Number(item.perMonth || item.basicSalary || 0);
      const ot = Number(item.overTime || 0);
      const rent = Number(item.rent || 0);
      const tea = Number(item.teaAllowance || 0);
      const mComm = Number(item.monthlyComm || 0);
      const wComm = Number(item.warehouseComm || 0);
      const allow = Number(item.natin || 0) + Number(item.stLateAllow || 0) + Number(item.otherAllow || 0);
      const eTotal = basic + ot + rent + tea + mComm + wComm + allow;

      const shortTime = Number(item.shortTimeAmount || item.shortWeek || 0);
      const penalty = Number(item.penalty || 0);
      const food = Number(item.ebDeduction || item.food || 0);
      const sec = Number(item.securityDeposit || 0);
      const otherDed = Number(item.otherDeduction || 0) + Number(item.umrahDeduction || 0);
      const whtDed = Number(item.wht || 0);
      const dTotal = shortTime + penalty + food + sec + otherDed + Number(item.fund || 0) + Number(item.ttw || 0) + whtDed;

      const grossTotal = Math.max(0, item.grossTotal != null ? Number(item.grossTotal) : (eTotal - dTotal));
      const prevAdv = Number(item.pAAdv || 0);
      const currentAdv = Number(item.csMale || 0);
      const totalBal = prevAdv + currentAdv;
      const recov = Number(((item.pmAdvRec || 0) + (item.cmAdvRec || 0)) || item.totalAdvRec || item.advanceDed || item.totalAdv || 0);
      const remBal = totalBal - recov;
      const netTotal = item.netTotal != null ? Number(item.netTotal) : Math.max(0, grossTotal - recov);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#10B981' }]}>
              <Text style={[styles.cardAvatarText, { color: '#10B981' }]}>{(empName || 'E').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{empName}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{empCode}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardDesigText}>📍 {branchName} • 🏷️ {deptName}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Net Disbursed</Text>
              <Text style={[styles.cardAmountValue, { color: '#10B981' }]}>Rs. {formatCurrency(netTotal)}</Text>
            </View>
          </View>

          {/* Duty Hours & Key Metrics */}
          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Duty: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{wrkHrs.toFixed(0)}h / {reqHrs.toFixed(0)}h</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Gross: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(grossTotal)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Ded: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Rs. {formatCurrency(dTotal)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Adv: <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>Rs. {formatCurrency(recov)}</Text>
            </Text>
          </View>

          {/* Expanded Breakdown */}
          {isExpanded && (
            <View style={styles.cardExpandedBody}>
              <View style={styles.cardDivider} />
              <View style={styles.expandedGrid}>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Required Duty</Text>
                  <Text style={styles.expandedVal}>{reqHrs} hrs</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Worked Actual</Text>
                  <Text style={[styles.expandedVal, { color: '#10B981', fontWeight: 'bold' }]}>{wrkHrs} hrs</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>OverTime</Text>
                  <Text style={[styles.expandedVal, { color: '#38BDF8' }]}>{otHrs}h (+Rs. {formatCurrency(ot)})</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>ShortTime</Text>
                  <Text style={[styles.expandedVal, { color: '#EF4444' }]}>{stHrs}h (-Rs. {formatCurrency(shortTime)})</Text>
                </View>

                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Monthly Basic</Text>
                  <Text style={styles.expandedVal}>Rs. {formatCurrency(basic)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Total Earnings</Text>
                  <Text style={[styles.expandedVal, { color: '#38BDF8', fontWeight: 'bold' }]}>Rs. {formatCurrency(eTotal)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Total Deductions</Text>
                  <Text style={[styles.expandedVal, { color: '#EF4444', fontWeight: 'bold' }]}>Rs. {formatCurrency(dTotal)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Gross Salary</Text>
                  <Text style={[styles.expandedVal, { color: '#F8FAFC', fontWeight: 'bold' }]}>Rs. {formatCurrency(grossTotal)}</Text>
                </View>

                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Prev Adv Balance</Text>
                  <Text style={styles.expandedVal}>Rs. {formatCurrency(prevAdv)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Current Advance</Text>
                  <Text style={styles.expandedVal}>Rs. {formatCurrency(currentAdv)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Adv Deduction (Recov)</Text>
                  <Text style={[styles.expandedVal, { color: '#EF4444', fontWeight: 'bold' }]}>Rs. {formatCurrency(recov)}</Text>
                </View>
                <View style={styles.expandedCol}>
                  <Text style={styles.expandedLabel}>Remaining Adv Bal</Text>
                  <Text style={[styles.expandedVal, { color: '#F59E0B' }]}>Rs. {formatCurrency(remBal)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cardSlipPrintBtn}
                onPress={() => handlePrintSlip(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.cardSlipPrintBtnText}>📄 Print / View Salary Pay Slip</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // ─── 3. INCREMENT REPORT (Exact 1:1 match with Web App) ───
    if (activeTab === 'emp_increment') {
      const name = safeText(item.name, 'Staff');
      const code = safeText(item.code, '-');
      const branch = safeText(item.branch, '-');
      const dept = safeText(item.department?.name || item.department, '');
      const basic = Number(item.basicSalary || 0);
      const allow = Number(item.allowance || (item.fixAllowance || 0) + (item.stLoss || 0) + (item.otherAllowance || 0));
      const serviceTime = calculateServiceTime(item.joiningDate, selectedYear, selectedMonth);
      const lastInc = formatDate(item.incrDate || item.lastIncrementDate);
      const nextInc = item.nextIncDate || formatDate(item.incrDate || item.lastIncrementDate);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#F59E0B' }]}>
              <Text style={[styles.cardAvatarText, { color: '#F59E0B' }]}>📈</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
                {dept ? (
                  <>
                    <Text style={styles.cardDot}>•</Text>
                    <Text style={styles.cardDesigText}>{dept}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Basic Salary</Text>
              <Text style={[styles.cardAmountValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(basic)}</Text>
              {allow > 0 ? (
                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: 'bold', textAlign: 'right' }}>
                  +Rs. {formatCurrency(allow)} (Allow)
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Service: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{serviceTime}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Last Inc: <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>{lastInc}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Next Due: <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>{nextInc}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 4. OVERTIME & SHORT TIME REPORT ───
    if (activeTab === 'overtime_shorttime') {
      const name = safeText(item.name, 'Staff');
      const code = safeText(item.code, '-');
      const branch = safeText(item.branch, '-');
      const workedHrs = safeText(item.workedHrs, '0:00');
      const reqHrs = safeText(item.reqHrs, '0:00');
      const otRs = Number(item.otRs || 0);
      const stRs = Number(item.stRs || 0);
      const netRs = Number(item.netRs || 0);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: netRs >= 0 ? '#10B981' : '#EF4444' }]}>
              <Text style={[styles.cardAvatarText, { color: netRs >= 0 ? '#10B981' : '#EF4444' }]}>⏰</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Net OT/ST Balance</Text>
              <Text style={[styles.cardAmountValue, { color: netRs >= 0 ? '#10B981' : '#EF4444' }]}>
                {netRs >= 0 ? `+Rs. ${formatCurrency(netRs)}` : `-Rs. ${formatCurrency(Math.abs(netRs))}`}
              </Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Worked: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{workedHrs}h</Text> / {reqHrs}h
            </Text>
            <Text style={styles.compactMetricText}>
              OT: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>+Rs. {formatCurrency(otRs)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              ST: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>-Rs. {formatCurrency(stRs)}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 5. BANK PAID REGISTER ───
    if (activeTab === 'bank_paid') {
      const name = safeText(item.name || item.employee?.name, 'Staff');
      const code = safeText(item.code || item.employee?.code, '-');
      const branch = safeText(item.branch, '-');
      const orderingBank = safeText(item.orderingBank, 'ALF');
      const debitAccount = safeText(item.debitAccount, '-');
      const creditAccount = safeText(item.creditAccount, '-');
      const amount = Number(item.amount || item.bankPaid || 0);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#38BDF8' }]}>
              <Text style={[styles.cardAvatarText, { color: '#38BDF8' }]}>🏦</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Bank Disbursed</Text>
              <Text style={[styles.cardAmountValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(amount)}</Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Bank: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{orderingBank}</Text>
            </Text>
            <Text style={styles.compactMetricText} numberOfLines={1}>
              Cr A/C: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{creditAccount}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 6. CASH PAID REGISTER ───
    if (activeTab === 'cash_paid') {
      const name = safeText(item.name || item.employee?.name, 'Staff');
      const code = safeText(item.code || item.employee?.code, '-');
      const branch = safeText(item.branch, '-');
      const dept = safeText(item.department, 'Staff');
      const cashPaid = Number(item.cashPaid || item.netSalary || item.netTotal || 0);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#F59E0B' }]}>
              <Text style={[styles.cardAvatarText, { color: '#F59E0B' }]}>💰</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Cash Disbursed</Text>
              <Text style={[styles.cardAmountValue, { color: '#F59E0B' }]}>Rs. {formatCurrency(cashPaid)}</Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Dept: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{dept}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Status: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>Disbursed in Cash</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 7. PAYROLL STATUS ───
    if (activeTab === 'payroll_status') {
      const name = safeText(item.name, 'Staff');
      const code = safeText(item.code, '-');
      const branch = safeText(item.branch, '-');
      const status = safeText(item.status, 'Pending');
      const isApproved = status === 'Approved' || status === 'Generated';

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: isApproved ? '#10B981' : '#F59E0B' }]}>
              <Text style={[styles.cardAvatarText, { color: isApproved ? '#10B981' : '#F59E0B' }]}>🔒</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>Payroll Status</Text>
              <Text style={[styles.cardAmountValue, { color: isApproved ? '#10B981' : '#F59E0B' }]}>{status}</Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Month: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{monthNameStr}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Type: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Monthly Audit</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 8. WHT DEDUCTIONS REGISTER ───
    if (activeTab === 'wht_ded') {
      const name = safeText(item.name, 'Staff');
      const cnic = safeText(item.cnic, '-');
      const netTotal = Number(item.netTotal || 0);
      const wht = Number(item.whtDeduction || item.wht || 0);
      const bankPaid = Number(item.bankPaid || 0);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#EF4444' }]}>
              <Text style={[styles.cardAvatarText, { color: '#EF4444' }]}>🧾</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>CNIC: {cnic}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>WHT Tax Deduction</Text>
              <Text style={[styles.cardAmountValue, { color: '#EF4444' }]}>Rs. {formatCurrency(wht)}</Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Pre-Tax Net: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs. {formatCurrency(netTotal)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Bank Paid: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(bankPaid)}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 8b. SHORT WEEK (TSW) DEDUCTION REPORT ───
    if (activeTab === 'short_week') {
      const name = safeText(item.employeeName || item.name, 'Staff');
      const code = safeText(item.code, '-');
      const branch = safeText(item.branch, '-');
      const dept = safeText(item.department, '-');
      const basic = Number(item.basicSalary || 0);
      const tswDays = Number(item.shortWeekDays || 0);
      const extraHrs = safeText(item.extraShortHrsStr || `${item.extraShortHrs || 0}:00`);
      const extraDed = Number(item.extraShortDeduction || 0);
      const totalDed = Number(item.totalShortDeduction || 0);

      return (
        <TouchableOpacity style={styles.reportCard} onPress={toggleExpand} activeOpacity={0.8}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardAvatarCircle, { borderColor: '#EF4444' }]}>
              <Text style={[styles.cardAvatarText, { color: '#EF4444' }]}>📅</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardNameText}>{name}</Text>
              <View style={styles.cardMetaPillRow}>
                <Text style={styles.cardCodeText}>#{code}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardBranchText}>📍 {branch}</Text>
                <Text style={styles.cardDot}>•</Text>
                <Text style={styles.cardDesigText}>{dept}</Text>
              </View>
            </View>
            <View style={styles.cardAmountBox}>
              <Text style={styles.cardAmountLabel}>TSW Extra Ded</Text>
              <Text style={[styles.cardAmountValue, { color: '#EF4444' }]}>Rs. {formatCurrency(extraDed)}</Text>
            </View>
          </View>

          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              TSW: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>+{tswDays} Day{tswDays > 1 ? 's' : ''}</Text> ({extraHrs})
            </Text>
            <Text style={styles.compactMetricText}>
              Total Short Ded: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs. {formatCurrency(totalDed)}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // ─── 9. GENERAL CARDS (Salary Detail, Payroll List, Ledger, Balances, etc.) ───
    const name = safeText(item.name || item.employeeName || item.empName || item.employee?.name, 'Staff Member');
    const code = safeText(item.code || item.employeeCode || item.empCode || item.employee?.code, '-');
    const branch = safeText(item.branch || item.employee?.branch, selectedBranch || '-');
    const designation = safeText(item.designation?.name || item.designation || item.employee?.designation, 'Staff');
    const department = safeText(item.department?.name || item.department || item.employee?.department, '');
    const incrDate = formatDate(item.incrDate);

    const isSalaryDetail = activeTab === 'salary_detail';
    const isPayrollList = activeTab === 'payroll_list';

    // Exact Advance Recovery & Slip Deductions Calculation (Matches Web ERP print-payroll.html)
    const advRecovery = (item.pmAdvRec !== undefined || item.cmAdvRec !== undefined)
      ? (Number(item.pmAdvRec || 0) + Number(item.cmAdvRec || 0))
      : Number(item.totalAdvRec ?? item.advanceDed ?? (item.totalAdv && !item.pmAdvRec ? item.totalAdv : 0));

    const otherDed = Number(item.otherDeduction || 0);
    const penalty = Number(item.penalty || 0) + Number(item.umrahDeduction || 0);
    const wht = Number(item.wht ?? item.whtAmount ?? 0);
    const securityDeposit = Number(item.securityDeposit || 0);
    const shortTimeDed = Number(item.shortWeek ?? item.shortTimeAmount ?? item.shortTime ?? 0);
    const mess = Number(item.ebDeduction || item.food || 0);
    const ttw = Number(item.ttw || 0);
    const fund = Number(item.fund || 0);
    const ugrm = Number(item.ugrm || 0);

    // EXACT TOTAL DEDUCTIONS: Sum of all deductions including advance recovery & WHT (matches Salary Slip line 844)
    const computedSlipDeductions = shortTimeDed + advRecovery + otherDed + penalty + wht + securityDeposit + ttw + fund + ugrm + mess;
    const finalDedAmount = isPayrollList
      ? (computedSlipDeductions > 0 ? computedSlipDeductions : (Number(item.deductionsTotal || 0) + advRecovery + wht))
      : Number(item.deductionsTotal ?? item.totalDeductions ?? item.deductions ?? 0);

    const netAmount = getRowNetAmount(item);
    const basicAmount = Number(item.basicSalary ?? item.perMonth ?? item.basic ?? 0);
    const grossAmount = Number(item.grossTotal ?? item.grossSalary ?? item.gross ?? basicAmount);
    const dedAmount = finalDedAmount;
    const bankAmount = Number(item.bankPaid ?? item.bankAmt ?? 0);
    const cashAmount = Number(item.cashPaid ?? 0);
    const advAmount = advRecovery;
    const fixAllow = Number(item.fixAllowance || 0);
    const otherAllow = Number(item.otherAllowance || 0);
    const stLoss = Number(item.stLoss || 0);
    const workedDays = safeText(item.workedDays, '-');
    const workedHrs = item.workedHrs ? Number(item.workedHrs).toFixed(1) : '-';

    return (
      <TouchableOpacity
        style={[styles.reportCard, isExpanded && styles.reportCardExpanded]}
        onPress={toggleExpand}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardAvatarCircle}>
            <Text style={styles.cardAvatarText}>{(name || 'E').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.cardNameText}>{name}</Text>
            <View style={styles.cardMetaPillRow}>
              <Text style={styles.cardCodeText}>#{code}</Text>
              <Text style={styles.cardDot}>•</Text>
              <Text style={styles.cardDesigText}>{designation}</Text>
              {branch ? (
                <>
                  <Text style={styles.cardDot}>•</Text>
                  <Text style={styles.cardBranchText}>📍 {branch}</Text>
                </>
              ) : null}
            </View>
          </View>

          {/* Key Metric Highlight */}
          <View style={styles.cardAmountBox}>
            {isSalaryDetail ? (
              <>
                <Text style={styles.cardAmountLabel}>Contract Basic</Text>
                <Text style={[styles.cardAmountValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(basicAmount)}</Text>
              </>
            ) : isPayrollList ? (
              <>
                <Text style={styles.cardAmountLabel}>Net Payable</Text>
                <Text style={[styles.cardAmountValue, { color: '#10B981' }]}>Rs. {formatCurrency(netAmount)}</Text>
              </>
            ) : activeTab === 'emp_ledger' ? (
              <>
                <Text style={styles.cardAmountLabel}>Balance</Text>
                <Text style={[styles.cardAmountValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(item.balance)}</Text>
              </>
            ) : activeTab === 'emp_balances' ? (
              <>
                <Text style={styles.cardAmountLabel}>Advance Balance</Text>
                <Text style={[styles.cardAmountValue, { color: '#EF4444' }]}>Rs. {formatCurrency(item.balance || item.advanceBalance)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardAmountLabel}>Net Amount</Text>
                <Text style={[styles.cardAmountValue, { color: '#10B981' }]}>Rs. {formatCurrency(netAmount)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Compact Sub-Row */}
        {isSalaryDetail ? (
          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Fix: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs. {formatCurrency(fixAllow)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Other: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(otherAllow)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Incr: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{incrDate}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Net: <Text style={{ color: '#0284C7', fontWeight: 'bold' }}>Rs. {formatCurrency(netAmount)}</Text>
            </Text>
          </View>
        ) : isPayrollList ? (
          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Basic: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs. {formatCurrency(basicAmount)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Gross: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(grossAmount)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Ded: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Rs. {formatCurrency(dedAmount)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Days: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{workedDays} d</Text>
            </Text>
          </View>
        ) : activeTab === 'emp_ledger' ? (
          <View style={styles.compactMetricRow}>
            <Text style={styles.compactMetricText}>
              Date: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{formatDate(item.date)}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Debit: <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>{Number(item.debit) > 0 ? `Rs. ${formatCurrency(item.debit)}` : '-'}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Credit: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{Number(item.credit) > 0 ? `Rs. ${formatCurrency(item.credit)}` : '-'}</Text>
            </Text>
            <Text style={styles.compactMetricText}>
              Bal: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>Rs. {formatCurrency(item.balance)}</Text>
            </Text>
          </View>
        ) : null}

        {/* Expandable Breakdown */}
        {isExpanded && (
          <View style={styles.cardExpandedBody}>
            <View style={styles.cardDivider} />
            <View style={styles.expandedGrid}>
              {isSalaryDetail ? (
                <>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Monthly Basic Salary</Text>
                    <Text style={[styles.expandedVal, { color: '#38BDF8' }]}>Rs. {formatCurrency(basicAmount)}</Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Fix Allowance</Text>
                    <Text style={styles.expandedVal}>Rs. {formatCurrency(fixAllow)}</Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Other Allowance</Text>
                    <Text style={styles.expandedVal}>Rs. {formatCurrency(otherAllow)}</Text>
                  </View>
                  {stLoss > 0 && (
                    <View style={styles.expandedCol}>
                      <Text style={styles.expandedLabel}>ST Loss Deduction</Text>
                      <Text style={[styles.expandedVal, { color: '#EF4444' }]}>- Rs. {formatCurrency(stLoss)}</Text>
                    </View>
                  )}
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Contract Net Salary</Text>
                    <Text style={[styles.expandedVal, { color: '#10B981' }]}>Rs. {formatCurrency(netAmount)}</Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Department</Text>
                    <Text style={styles.expandedVal}>{department || 'General'}</Text>
                  </View>
                </>
              ) : isPayrollList ? (
                <>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Monthly Basic Rate</Text>
                    <Text style={styles.expandedVal}>Rs. {formatCurrency(basicAmount)}</Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Worked Attendance</Text>
                    <Text style={styles.expandedVal}>{workedDays} Days ({workedHrs} hrs)</Text>
                  </View>
                  {shortTimeDed > 0 && (
                    <View style={styles.expandedCol}>
                      <Text style={styles.expandedLabel}>Short Time / Days Loss</Text>
                      <Text style={[styles.expandedVal, { color: '#EF4444' }]}>- Rs. {formatCurrency(shortTimeDed)}</Text>
                    </View>
                  )}
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Gross Earned</Text>
                    <Text style={[styles.expandedVal, { color: '#38BDF8' }]}>Rs. {formatCurrency(grossAmount)}</Text>
                  </View>
                  {advAmount > 0 && (
                    <View style={styles.expandedCol}>
                      <Text style={styles.expandedLabel}>Advance Deduction</Text>
                      <Text style={[styles.expandedVal, { color: '#EF4444' }]}>Rs. {formatCurrency(advAmount)}</Text>
                    </View>
                  )}
                  {wht > 0 && (
                    <View style={styles.expandedCol}>
                      <Text style={styles.expandedLabel}>Salary WHT</Text>
                      <Text style={[styles.expandedVal, { color: '#EF4444' }]}>Rs. {formatCurrency(wht)}</Text>
                    </View>
                  )}
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Total Deductions</Text>
                    <Text style={[styles.expandedVal, { color: '#EF4444' }]}>Rs. {formatCurrency(dedAmount)}</Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Disbursement Mode</Text>
                    <Text style={[styles.expandedVal, { color: cashAmount > 0 ? '#F59E0B' : '#38BDF8' }]}>
                      {cashAmount > 0 ? `Cash: Rs. ${formatCurrency(cashAmount)}` : `Bank: Rs. ${formatCurrency(bankAmount)}`}
                    </Text>
                  </View>
                </>
              ) : activeTab === 'emp_ledger' ? (
                <>
                  <View style={[styles.expandedCol, { width: '100%' }]}>
                    <Text style={styles.expandedLabel}>Transaction Description / Narration</Text>
                    <Text style={[styles.expandedVal, { color: '#F8FAFC' }]}>
                      {safeText(item.narration || item.description || item.remarks, 'Advance Entry')}
                    </Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Transaction Type</Text>
                    <Text style={[styles.expandedVal, { color: item.debit > 0 ? '#EF4444' : '#10B981' }]}>
                      {safeText(item.type, item.debit > 0 ? 'Pay (Debit)' : 'Received (Credit)')}
                    </Text>
                  </View>
                  <View style={styles.expandedCol}>
                    <Text style={styles.expandedLabel}>Closing Running Balance</Text>
                    <Text style={[styles.expandedVal, { color: '#38BDF8' }]}>Rs. {formatCurrency(item.balance)}</Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* Direct Action Buttons: Print Slip, Recalculate & Delete Slip (ONLY for Monthly Payroll List) */}
            {isPayrollList ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.cardSlipPrintBtn, { flex: 1, backgroundColor: '#0284C7' }]}
                    onPress={() => handlePrintSlip(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cardSlipPrintBtnText}>📄 Print Slip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardSlipPrintBtn, { flex: 1, backgroundColor: '#10B981' }]}
                    onPress={() => {
                      const nav = navigation?.navigate || navigation;
                      nav('GenerateSalarySlip', {
                        employeeId: item.employee?._id || item.employee?.id || item.employee,
                        branch: item.branch,
                        monthYear: item.monthYear || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cardSlipPrintBtnText}>⚡ Recalculate / Slip</Text>
                  </TouchableOpacity>
                </View>

                {/* Delete Slip Option (Strictly protected by Bilal Shah authorization) */}
                <TouchableOpacity
                  style={[styles.cardSlipPrintBtn, { backgroundColor: '#DC2626', borderWidth: 1, borderColor: '#EF4444' }]}
                  onPress={() => handlePromptDeleteSlip(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cardSlipPrintBtnText, { fontWeight: '800' }]}>🗑️ Delete Slip (Database & Web ERP)</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const totalCalculatedNet = filteredData.reduce((sum, r) => sum + getRowNetAmount(r), 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#131D33" />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack ? navigation.goBack() : navigation.navigate('Dashboard')}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerBackIcon}>←</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{currentTabObj.title}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {selectedBranch} • {activeTab === 'salary_detail' ? 'Master Salary Structure' : (activeTab === 'emp_ledger' ? `${MONTH_SHORT[ledgerFromMonth - 1]} - ${MONTH_SHORT[ledgerToMonth - 1]} ${selectedYear}` : monthNameStr)}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerPrintBtn, { backgroundColor: '#0284C7' }]}
            onPress={() => handlePrintReport(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.headerPrintBtnText}>👁️ View PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerPrintBtn, { backgroundColor: '#10B981' }]}
            onPress={() => handlePrintReport(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.headerPrintBtnText}>📥 Download</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Horizontal Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabButton, { backgroundColor: 'rgba(236, 72, 153, 0.16)', borderColor: '#EC4899', borderWidth: 1 }]}
            onPress={() => {
              const nav = typeof navigation === 'function' ? navigation : (navigation?.navigate ? (s, p) => navigation.navigate(s, p) : null);
              if (nav) {
                nav('EmployeeAdvance', { branch: selectedBranch !== 'Select Branch' && selectedBranch !== 'All Branches' ? selectedBranch : undefined });
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>💳</Text>
            <Text style={[styles.tabText, { color: '#F472B6', fontWeight: '800' }]}>
              Advances Manager
            </Text>
          </TouchableOpacity>
          {REPORT_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.tabIcon}>{tab.icon}</Text>
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter Toolbar */}
      <View style={styles.filterToolbar}>
        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setBranchModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.filterChipLabel}>STORE BRANCH</Text>
          <Text style={styles.filterChipVal} numberOfLines={1}>
            {selectedBranch === 'Select Branch' ? '👇 Select Branch' : selectedBranch === 'All Branches' ? '🌍 All Branches' : `📍 ${selectedBranch}`}
          </Text>
        </TouchableOpacity>

        {activeTab !== 'salary_detail' && activeTab !== 'emp_ledger' ? (
          <View style={styles.monthPillRow}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.monthArrowBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.monthArrowText}>◀</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.monthCenterBtn}
              onPress={() => setMonthModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.monthCenterText}>📅 {monthNameStr}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrowBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.monthArrowText}>▶</Text>
            </TouchableOpacity>
          </View>
        ) : activeTab === 'emp_ledger' ? (
          <TouchableOpacity
            style={[styles.filterChip, { flex: 1.3, borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}
            onPress={() => setLedgerRangeModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipLabel, { color: '#38BDF8' }]}>LEDGER MONTH RANGE ▾</Text>
            <Text style={styles.filterChipVal} numberOfLines={1}>
              📅 {MONTH_SHORT[ledgerFromMonth - 1]} - {MONTH_SHORT[ledgerToMonth - 1]} {selectedYear}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.filterChip, { flex: 0.8 }]}>
            <Text style={styles.filterChipLabel}>REPORT TYPE</Text>
            <Text style={styles.filterChipVal} numberOfLines={1}>🏢 Master Contract</Text>
          </View>
        )}
      </View>

      {/* Employee Ledger Summary Cards */}
      {activeTab === 'emp_ledger' && reportSummary ? (
        <View style={styles.ledgerSummaryGrid}>
          <View style={[styles.ledgerSummaryCard, { borderColor: '#38BDF8' }]}>
            <Text style={styles.ledgerSummaryLabel}>OPENING</Text>
            <Text style={[styles.ledgerSummaryVal, { color: '#38BDF8' }]}>
              Rs. {formatCurrency(reportSummary.openingBalance)}
            </Text>
          </View>
          <View style={[styles.ledgerSummaryCard, { borderColor: '#EF4444' }]}>
            <Text style={styles.ledgerSummaryLabel}>TOTAL DEBIT (+)</Text>
            <Text style={[styles.ledgerSummaryVal, { color: '#EF4444' }]}>
              Rs. {formatCurrency(reportSummary.totalDebit || reportSummary.totalPay)}
            </Text>
          </View>
          <View style={[styles.ledgerSummaryCard, { borderColor: '#10B981' }]}>
            <Text style={styles.ledgerSummaryLabel}>TOTAL CREDIT (-)</Text>
            <Text style={[styles.ledgerSummaryVal, { color: '#10B981' }]}>
              Rs. {formatCurrency(reportSummary.totalCredit || reportSummary.totalReceived)}
            </Text>
          </View>
          <View style={[styles.ledgerSummaryCard, { borderColor: '#F59E0B' }]}>
            <Text style={styles.ledgerSummaryLabel}>CLOSING</Text>
            <Text style={[styles.ledgerSummaryVal, { color: '#F59E0B' }]}>
              Rs. {formatCurrency(reportSummary.closingBalance)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Single Employee Picker (for Ledger) */}
      {activeTab === 'emp_ledger' ? (
        <>
          <TouchableOpacity
            style={styles.empSelectBanner}
            onPress={() => setEmpPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18, marginRight: 8 }}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.empSelectLabel}>SELECT EMPLOYEE FOR ADVANCE LEDGER</Text>
              <Text style={styles.empSelectName}>
                {selectedEmployee ? `${safeText(selectedEmployee.name)} (#${safeText(selectedEmployee.code)})` : 'Tap to Select Employee'}
              </Text>
            </View>
            <Text style={styles.empSelectArrow}>Change ▾</Text>
          </TouchableOpacity>

          {/* Dedicated From Date / To Date Selector Bar */}
          <View style={styles.ledgerRangeBar}>
            <TouchableOpacity
              style={styles.ledgerRangeSubBtn}
              onPress={() => setLedgerRangeModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.ledgerRangeSubLabel}>FROM DATE</Text>
              <Text style={styles.ledgerRangeSubVal}>
                📅 01-{MONTH_SHORT[ledgerFromMonth - 1]}-{selectedYear} ▾
              </Text>
            </TouchableOpacity>

            <Text style={{ color: '#64748B', fontWeight: 'bold', fontSize: 14 }}>➔</Text>

            <TouchableOpacity
              style={styles.ledgerRangeSubBtn}
              onPress={() => setLedgerRangeModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.ledgerRangeSubLabel}>TO DATE</Text>
              <Text style={styles.ledgerRangeSubVal}>
                📅 {new Date(selectedYear, ledgerToMonth, 0).getDate()}-{MONTH_SHORT[ledgerToMonth - 1]}-{selectedYear} ▾
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Presets Row */}
          <View style={styles.presetQuickRow}>
            <TouchableOpacity
              style={[styles.presetQuickChip, ledgerFromMonth === 1 && ledgerToMonth === 12 && styles.presetQuickChipActive]}
              onPress={() => {
                setLedgerFromMonth(1);
                setLedgerToMonth(12);
              }}
            >
              <Text style={[styles.presetQuickText, ledgerFromMonth === 1 && ledgerToMonth === 12 && styles.presetQuickTextActive]}>
                Full Year {selectedYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetQuickChip, ledgerFromMonth === 1 && ledgerToMonth === 6 && styles.presetQuickChipActive]}
              onPress={() => {
                setLedgerFromMonth(1);
                setLedgerToMonth(6);
              }}
            >
              <Text style={[styles.presetQuickText, ledgerFromMonth === 1 && ledgerToMonth === 6 && styles.presetQuickTextActive]}>
                Jan - Jun
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetQuickChip, ledgerFromMonth === 7 && ledgerToMonth === 12 && styles.presetQuickChipActive]}
              onPress={() => {
                setLedgerFromMonth(7);
                setLedgerToMonth(12);
              }}
            >
              <Text style={[styles.presetQuickText, ledgerFromMonth === 7 && ledgerToMonth === 12 && styles.presetQuickTextActive]}>
                Jul - Dec
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetQuickChip, ledgerFromMonth === selectedMonth && ledgerToMonth === selectedMonth && styles.presetQuickChipActive]}
              onPress={() => {
                setLedgerFromMonth(selectedMonth);
                setLedgerToMonth(selectedMonth);
              }}
            >
              <Text style={[styles.presetQuickText, ledgerFromMonth === selectedMonth && ledgerToMonth === selectedMonth && styles.presetQuickTextActive]}>
                {MONTH_SHORT[selectedMonth - 1]} Only
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {/* Action Banner for Generating Salary Slip */}
      {activeTab === 'payroll_list' && (
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderColor: '#10B981',
            borderWidth: 1,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            marginHorizontal: 16,
            marginBottom: 8,
          }}
          onPress={() => {
            const nav = navigation?.navigate || navigation;
            nav('GenerateSalarySlip', { branch: selectedBranch });
          }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16 }}>⚡</Text>
            <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 13 }}>
              Generate Monthly Salary Slip (PayRoll)
            </Text>
          </View>
          <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 13 }}>+ New ➔</Text>
        </TouchableOpacity>
      )}

      {/* Real-time Search Box */}
      <View style={styles.searchBox}>
        <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by name, code, designation, branch..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Summary KPI Strip */}
      <View style={styles.kpiStrip}>
        <View style={styles.kpiStripCard}>
          <Text style={styles.kpiStripNum}>{filteredData.length}</Text>
          <Text style={styles.kpiStripLabel}>
            {activeTab === 'emp_attendance' ? 'Staff Enrolled' : (activeTab === 'emp_increment' ? 'Increments Due' : (activeTab === 'emp_ledger' ? 'Ledger Entries' : (activeTab === 'payroll_summary' ? 'Staff Enrolled' : 'Total Records')))}
          </Text>
        </View>
        <View style={[styles.kpiStripCard, { borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
          <Text style={[styles.kpiStripNum, { color: '#10B981' }]}>
            {activeTab === 'emp_attendance'
              ? `${filteredData.reduce((sum, r) => sum + (r.presentDays || 0), 0)} Days`
              : `Rs. ${formatCurrency(totalCalculatedNet)}`}
          </Text>
          <Text style={styles.kpiStripLabel}>
            {activeTab === 'emp_attendance'
              ? 'Total Present Days'
              : activeTab === 'emp_increment'
              ? 'Total Basic Salary'
              : activeTab === 'salary_detail'
              ? 'Total Contract Basic'
              : activeTab === 'payroll_summary'
              ? 'Total Net Disbursed'
              : activeTab === 'wht_ded'
              ? 'Total WHT Deducted'
              : activeTab === 'payroll_status'
              ? 'Total Enrolled Staff'
              : activeTab === 'emp_ledger'
              ? 'Current Balance'
              : 'Computed Total'}
          </Text>
        </View>
      </View>

      {/* Official Web ERP Payroll Summary Quick Banner */}
      {activeTab === 'payroll_summary' && filteredData.length > 0 ? (
        <View style={{
          marginHorizontal: 14,
          marginBottom: 10,
          backgroundColor: '#1E293B',
          borderRadius: 10,
          padding: 10,
          borderWidth: 1,
          borderColor: '#38BDF8',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ color: '#F8FAFC', fontWeight: 'bold', fontSize: 12 }}>
              📄 Official Employee PayRoll Summary
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 2 }}>
              Exact Web ERP layout (Landscape) with Duty, OverTime, ShortTime, Advances & Deductions
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#0284C7',
                paddingHorizontal: 9,
                paddingVertical: 6,
                borderRadius: 6
              }}
              onPress={() => previewEmployeePayrollSummaryReport({
                payrolls: filteredData,
                monthYear: monthYearStr,
                branch: selectedBranch
              })}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 11 }}>👁️ Preview</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: '#10B981',
                paddingHorizontal: 9,
                paddingVertical: 6,
                borderRadius: 6
              }}
              onPress={() => printEmployeePayrollSummaryReport({
                payrolls: filteredData,
                monthYear: monthYearStr,
                branch: selectedBranch
              })}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 11 }}>📥 PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Error Banner if any */}
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
        </View>
      ) : null}

      {/* Main Content List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading {currentTabObj.title}...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item, index) => String(item?.id || item?._id || item?.code || index)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            selectedBranch === 'Select Branch' ? (
              <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 44, marginBottom: 12 }}>🏢</Text>
                <Text style={styles.emptyTitle}>Please Select a Branch</Text>
                <Text style={[styles.emptySub, { maxWidth: 300, textAlign: 'center' }]}>
                  Choose a store branch or "All Branches" from the STORE BRANCH dropdown above to load {currentTabObj.title}.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No Records Found</Text>
                <Text style={styles.emptySub}>
                  {activeTab === 'emp_ledger'
                    ? `No advance ledger entries found between ${MONTH_SHORT[ledgerFromMonth - 1]} and ${MONTH_SHORT[ledgerToMonth - 1]} ${selectedYear}.`
                    : activeTab === 'emp_increment'
                    ? `No employees have an increment due in ${monthNameStr}.`
                    : `No data available for ${monthNameStr} in ${selectedBranch}.`}
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Branch Selection Modal */}
      <Modal
        visible={branchModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Store Branch</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={branches}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedBranch === item && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedBranch(item);
                    setBranchModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedBranch === item && styles.modalItemTextActive]}>
                    {item === 'Select Branch' ? '👇 Select Branch' : item === 'All Branches' ? '🌍 All Branches' : `📍 ${item}`}
                  </Text>
                  {selectedBranch === item ? <Text style={styles.modalItemCheck}>✓</Text> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Single Month & Year Selection Modal (General) */}
      <Modal
        visible={monthModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMonthModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month &amp; Year</Text>
              <TouchableOpacity onPress={() => setMonthModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {MONTH_NAMES.map((mName, idx) => {
                const mNum = idx + 1;
                const isSelected = selectedMonth === mNum;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      setSelectedMonth(mNum);
                      setMonthModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {mName} {selectedYear}
                    </Text>
                    {isSelected ? <Text style={styles.modalItemCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Comprehensive Ledger Date Range Modal (From Month -> To Month + Year) */}
      <Modal
        visible={ledgerRangeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLedgerRangeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.sheetHandleContainer}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Ledger Period</Text>
              <TouchableOpacity onPress={() => setLedgerRangeModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {/* Year Selector */}
              <Text style={styles.rangeSectionTitle}>SELECT YEAR</Text>
              <View style={styles.yearBtnRow}>
                {[2024, 2025, 2026, 2027].map(yr => (
                  <TouchableOpacity
                    key={yr}
                    style={[styles.yearBtn, selectedYear === yr && styles.yearBtnActive]}
                    onPress={() => setSelectedYear(yr)}
                  >
                    <Text style={[styles.yearBtnText, selectedYear === yr && styles.yearBtnTextActive]}>
                      {yr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Quick Presets */}
              <Text style={styles.rangeSectionTitle}>QUICK PRESETS</Text>
              <View style={styles.presetRow}>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => {
                    setLedgerFromMonth(1);
                    setLedgerToMonth(12);
                  }}
                >
                  <Text style={styles.presetBtnText}>Full Year (Jan-Dec)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => {
                    setLedgerFromMonth(1);
                    setLedgerToMonth(6);
                  }}
                >
                  <Text style={styles.presetBtnText}>H1 (Jan-Jun)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => {
                    setLedgerFromMonth(7);
                    setLedgerToMonth(12);
                  }}
                >
                  <Text style={styles.presetBtnText}>H2 (Jul-Dec)</Text>
                </TouchableOpacity>
              </View>

              {/* From Month Grid */}
              <Text style={styles.rangeSectionTitle}>FROM MONTH: {MONTH_NAMES[ledgerFromMonth - 1]}</Text>
              <View style={styles.monthGrid}>
                {MONTH_SHORT.map((m, idx) => {
                  const mNum = idx + 1;
                  const isSelected = ledgerFromMonth === mNum;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.gridMonthBtn, isSelected && styles.gridMonthBtnActiveFrom]}
                      onPress={() => {
                        setLedgerFromMonth(mNum);
                        if (mNum > ledgerToMonth) setLedgerToMonth(mNum);
                      }}
                    >
                      <Text style={[styles.gridMonthText, isSelected && styles.gridMonthTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* To Month Grid */}
              <Text style={styles.rangeSectionTitle}>TO MONTH: {MONTH_NAMES[ledgerToMonth - 1]}</Text>
              <View style={styles.monthGrid}>
                {MONTH_SHORT.map((m, idx) => {
                  const mNum = idx + 1;
                  const isSelected = ledgerToMonth === mNum;
                  const isBeforeFrom = mNum < ledgerFromMonth;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.gridMonthBtn, isSelected && styles.gridMonthBtnActiveTo, isBeforeFrom && { opacity: 0.4 }]}
                      onPress={() => {
                        if (mNum < ledgerFromMonth) {
                          setLedgerFromMonth(mNum);
                        }
                        setLedgerToMonth(mNum);
                      }}
                    >
                      <Text style={[styles.gridMonthText, isSelected && styles.gridMonthTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Apply Button */}
              <TouchableOpacity
                style={styles.applyRangeBtn}
                onPress={() => setLedgerRangeModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.applyRangeBtnText}>
                  Apply Range ({MONTH_SHORT[ledgerFromMonth - 1]} - {MONTH_SHORT[ledgerToMonth - 1]} {selectedYear})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Employee Search & Picker Modal (for Ledger) */}
      <Modal
        visible={empPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEmpPickerVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { height: '82%', maxHeight: '92%' }]}>
            <View style={styles.sheetHandleContainer}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee for Ledger</Text>
              <TouchableOpacity onPress={() => setEmpPickerVisible(false)}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Type name (e.g. Mudassir, Rafi) or code..."
                placeholderTextColor="#64748B"
                value={empSearchText}
                onChangeText={handleEmpModalSearchChange}
              />
            </View>

            <FlatList
              data={filteredEmployeesForModal}
              keyExtractor={(item, idx) => String(item?.id || item?._id || idx)}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedEmployee?.id === item?.id || selectedEmployee?._id === item?.id || selectedEmployee?.code === item?.code;
                return (
                  <TouchableOpacity
                    style={[styles.empPickerItem, isSelected && styles.empPickerItemActive]}
                    onPress={() => {
                      setSelectedEmployee(item);
                      setEmpPickerVisible(false);
                    }}
                  >
                    <View style={styles.cardAvatarCircle}>
                      <Text style={styles.cardAvatarText}>{(safeText(item?.name) || 'E').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.cardNameText, isSelected && { color: '#38BDF8' }]}>{safeText(item?.name)}</Text>
                      <Text style={styles.cardCodeText}>#{safeText(item?.code)} • {safeText(item?.branch, 'Main')}</Text>
                    </View>
                    {isSelected ? <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SECURITY VERIFICATION MODAL FOR SALARY SLIP DELETION */}
      <Modal
        visible={deleteAuthModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !deleteAuthLoading && setDeleteAuthModalVisible(false)}
      >
        <View style={styles.authModalOverlay}>
          <View style={styles.authModalCard}>
            <View style={styles.authModalHeader}>
              <View style={[styles.authIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#EF4444' }]}>
                <Text style={{ fontSize: 28 }}>🗑️</Text>
              </View>
              <Text style={styles.authModalTitle}>Delete Salary Slip Authorization</Text>
              <Text style={styles.authModalSub}>
                Only Bilal Shah is authorized to permanently delete salary slips from MongoDB and Web ERP.
              </Text>
            </View>

            {/* Targeted Employee & Slip Details */}
            {payrollToDelete && (
              <View style={styles.deleteTargetBox}>
                <Text style={styles.deleteTargetTitle}>Target Salary Slip:</Text>
                <Text style={styles.deleteTargetEmp}>
                  {safeText(payrollToDelete.name || payrollToDelete.employee?.name || payrollToDelete.empName, 'Employee')}
                  {' '}(#{safeText(payrollToDelete.code || payrollToDelete.employee?.code || payrollToDelete.empCode, '-')})
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={styles.deleteTargetSub}>
                    Period: {payrollToDelete.monthYear || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`}
                  </Text>
                  <Text style={[styles.deleteTargetSub, { color: '#10B981', fontWeight: 'bold' }]}>
                    Net: Rs. {formatCurrency(payrollToDelete.netTotal ?? payrollToDelete.netSalary ?? payrollToDelete.netPayable ?? 0)}
                  </Text>
                </View>
              </View>
            )}

            {deleteAuthError ? (
              <View style={styles.authErrorBox}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>⚠️</Text>
                <Text style={styles.authErrorText}>{deleteAuthError}</Text>
              </View>
            ) : null}

            {deleteAuthLoading ? (
              <View style={styles.authStatusContainer}>
                <ActivityIndicator color="#EF4444" size="small" />
                <Text style={styles.authStatusText}>{deleteAuthStatusText || 'Deleting salary slip...'}</Text>
              </View>
            ) : null}

            <View style={styles.authInputBox}>
              <Text style={styles.authInputLabel}>Username</Text>
              <View style={styles.authInputWrapper}>
                <Text style={{ fontSize: 16, marginRight: 8, color: '#64748B' }}>👤</Text>
                <TextInput
                  style={styles.authTextInput}
                  value={deleteAuthUsername}
                  onChangeText={setDeleteAuthUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  editable={!deleteAuthLoading}
                />
              </View>
            </View>

            <View style={styles.authInputBox}>
              <Text style={styles.authInputLabel}>Password</Text>
              <View style={styles.authInputWrapper}>
                <Text style={{ fontSize: 16, marginRight: 8, color: '#64748B' }}>🔒</Text>
                <TextInput
                  style={styles.authTextInput}
                  value={deleteAuthPassword}
                  onChangeText={setDeleteAuthPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showDeleteAuthPassword}
                  editable={!deleteAuthLoading}
                />
                <TouchableOpacity onPress={() => setShowDeleteAuthPassword(!showDeleteAuthPassword)}>
                  <Text style={{ fontSize: 16, color: '#94A3B8' }}>{showDeleteAuthPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.authModalButtons}>
              <TouchableOpacity
                style={styles.authCancelBtn}
                onPress={() => setDeleteAuthModalVisible(false)}
                disabled={deleteAuthLoading}
              >
                <Text style={styles.authCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.authConfirmBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleAuthorizeAndDeletePayroll}
                disabled={deleteAuthLoading}
              >
                {deleteAuthLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>🗑️ Authorize & Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DEDICATED IN-APP RESULT MODAL FOR DELETION */}
      <Modal visible={deleteResultModal.visible} transparent={true} animationType="fade">
        <View style={styles.authModalOverlay}>
          <View style={styles.authModalCard}>
            <View style={styles.authModalHeader}>
              <View style={[styles.authIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
                <Text style={{ fontSize: 28 }}>✅</Text>
              </View>
              <Text style={[styles.authModalTitle, { color: '#10B981' }]}>{deleteResultModal.title}</Text>
              <Text style={styles.authModalSub}>{deleteResultModal.message}</Text>
              {deleteResultModal.details ? (
                <View style={styles.resultDetailsBox}>
                  <Text style={styles.resultDetailsText}>{deleteResultModal.details}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.authConfirmBtn, { backgroundColor: '#10B981', marginTop: 14 }]}
              onPress={() => setDeleteResultModal({ visible: false, title: '', message: '', details: null })}
            >
              <Text style={[styles.authConfirmText, { textAlign: 'center' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 6 : 28) : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  headerBackIcon: {
    color: '#38BDF8',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  headerPrintBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerPrintBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tabsContainer: {
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  tabsScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginRight: 4,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  tabIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  filterToolbar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0E1729',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    backgroundColor: '#131D33',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  filterChipLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  filterChipVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 1,
  },
  monthPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  monthArrowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  monthArrowText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  monthCenterBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  monthCenterText: {
    color: '#F8FAFC',
    fontSize: 11.5,
    fontWeight: '700',
  },
  ledgerSummaryGrid: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  ledgerSummaryCard: {
    flex: 1,
    backgroundColor: '#131D33',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  ledgerSummaryLabel: {
    fontSize: 7.5,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  ledgerSummaryVal: {
    fontSize: 10.5,
    fontWeight: '800',
    marginTop: 2,
  },
  empSelectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  empSelectLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  empSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  empSelectArrow: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D33',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
  },
  kpiStrip: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  kpiStripCard: {
    flex: 1,
    backgroundColor: '#131D33',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  kpiStripNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  kpiStripLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: 'bold',
    marginTop: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 90,
  },
  reportCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  reportCardExpanded: {
    borderColor: '#38BDF8',
    backgroundColor: '#162238',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  cardAvatarText: {
    color: '#38BDF8',
    fontSize: 14.5,
    fontWeight: '800',
  },
  cardNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cardMetaPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  cardCodeText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  cardDot: {
    fontSize: 10,
    color: '#64748B',
    marginHorizontal: 4,
  },
  cardDesigText: {
    fontSize: 10.5,
    color: '#38BDF8',
    fontWeight: '500',
  },
  cardBranchText: {
    fontSize: 10.5,
    color: '#CBD5E1',
  },
  cardAmountBox: {
    alignItems: 'flex-end',
  },
  cardAmountLabel: {
    fontSize: 8.5,
    color: '#64748B',
    fontWeight: 'bold',
  },
  cardAmountValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  compactMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  compactMetricText: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  cardExpandedBody: {
    marginTop: 10,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginBottom: 10,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expandedCol: {
    width: '48%',
    backgroundColor: '#0B1120',
    padding: 8,
    borderRadius: 6,
  },
  expandedLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: 'bold',
  },
  expandedVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  cardSlipPrintBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  cardSlipPrintBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalCloseBtn: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#0B1120',
  },
  modalItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  modalItemText: {
    fontSize: 13.5,
    color: '#F8FAFC',
  },
  modalItemTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  modalItemCheck: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 15,
  },
  sheetHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  pickerSearchInput: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  empPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#0E1729',
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  empPickerItemActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  rangeSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  yearBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  yearBtn: {
    flex: 1,
    backgroundColor: '#0B1120',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  yearBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  yearBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 13,
  },
  yearBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#0B1120',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  presetBtnText: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridMonthBtn: {
    width: '23%',
    backgroundColor: '#0B1120',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  gridMonthBtnActiveFrom: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  gridMonthBtnActiveTo: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  gridMonthText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  gridMonthTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  applyRangeBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 24,
  },
  applyRangeBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  ledgerRangeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  ledgerRangeSubBtn: {
    flex: 1,
    backgroundColor: '#131D33',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  ledgerRangeSubLabel: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  ledgerRangeSubVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  presetQuickRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  presetQuickChip: {
    flex: 1,
    backgroundColor: '#0E1729',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  presetQuickChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  presetQuickText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  presetQuickTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  // Auth Modal Styles for Delete
  authModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  authModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  authIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
  },
  authModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 6,
  },
  authModalSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
  },
  deleteTargetBox: {
    backgroundColor: '#0E1729',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteTargetTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteTargetEmp: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 2,
  },
  deleteTargetSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  authErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  authErrorText: {
    color: '#EF4444',
    fontSize: 12,
    flex: 1,
    fontWeight: '600',
  },
  authStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  authStatusText: {
    color: '#38BDF8',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  authInputBox: {
    marginBottom: 12,
  },
  authInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  authInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1729',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  authTextInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
  },
  authModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  authCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  authConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  resultDetailsBox: {
    backgroundColor: '#0E1729',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
  },
  resultDetailsText: {
    color: '#94A3B8',
    fontSize: 11.5,
    textAlign: 'center',
  },
});
