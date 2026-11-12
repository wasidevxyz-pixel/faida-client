import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar, 
  ScrollView, 
  TextInput, 
  Modal, 
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import api from '../services/api';
import {
  printSalarySlip,
  printAdvanceLedger,
  printBranchAdvancesOverview,
  promptSalarySlipActions,
  promptAdvanceLedgerActions,
  promptBranchAdvancesActions,
  shareSalarySlipViaWhatsApp,
  promptThermalSalarySlipOptions
} from '../services/printService';
import DateTimePicker from '@react-native-community/datetimepicker';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function EmployeeFinancialsScreen({ route, navigation }) {
  const initialEmployee = route?.params?.employee || null;
  const initialMode = route?.params?.mode === 'advance' ? 'ledger' : route?.params?.mode === 'branch_advances' ? 'branch_advances' : 'payslips';

  // Active Tab: 'payslips' | 'ledger' | 'branch_advances'
  const [activeTab, setActiveTab] = useState(initialMode);

  // Filter States
  const [branches, setBranches] = useState(['Select Branch', 'All Branches']);
  const [selectedBranch, setSelectedBranch] = useState(initialEmployee?.branch || 'Select Branch');
  const [pickerBranchFilter, setPickerBranchFilter] = useState('Select Branch');
  const [employeesList, setEmployeesList] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployee);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [employeePickerVisible, setEmployeePickerVisible] = useState(false);
  const searchSeqRef = useRef(0);
  const searchTimeoutRef = useRef(null);

  // Month & Year Filter
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // Advance Ledger Date Range States
  const [ledgerFilterType, setLedgerFilterType] = useState('range'); // 'range' | 'month' | 'all'
  const [ledgerStartDate, setLedgerStartDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  );
  const [ledgerEndDate, setLedgerEndDate] = useState(
    now.toISOString().split('T')[0]
  );
  const [showLedgerStartPicker, setShowLedgerStartPicker] = useState(false);
  const [showLedgerEndPicker, setShowLedgerEndPicker] = useState(false);

  // Data States
  const [financials, setFinancials] = useState(null);
  const [branchAdvancesData, setBranchAdvancesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSlipId, setExpandedSlipId] = useState(null);
  const [showAllSlips, setShowAllSlips] = useState(true); // Default to all slips — avoids empty screen when current month has no payroll

  const selectedEmpId = selectedEmployee?.id || selectedEmployee?._id || initialEmployee?.id || null;

  // Load initial branches & employees
  useEffect(() => {
    loadBranches();
    loadEmployees('', true);
  }, [selectedBranch]);

  useEffect(() => {
    if (activeTab === 'branch_advances') {
      fetchBranchAdvances();
    } else if (selectedEmpId) {
      fetchFinancials(selectedEmpId);
    }
  }, [activeTab, selectedEmpId, selectedMonth, selectedYear, selectedBranch, ledgerFilterType, ledgerStartDate, ledgerEndDate]);

  const loadBranches = async () => {
    try {
      let raw = [];
      const res = await api.get('/mobile/admin/branches');
      if (res && res.success) {
        raw = res.data || [];
      } else {
        const storesRes = await api.get('/stores');
        raw = storesRes?.data || storesRes || [];
      }
      const seen = new Set();
      const clean = ['Select Branch', 'All Branches'];
      seen.add('select branch');
      seen.add('all branches');
      seen.add('all');
      raw.forEach(b => {
        const name = typeof b === 'object' && b !== null ? (b.name || b.branch || b.title || '') : String(b || '');
        const t = name.trim().replace(/[()]/g, '');
        const key = t.toLowerCase();
        if (t && !seen.has(key)) {
          seen.add(key);
          clean.push(t);
        }
      });
      setBranches(clean);
    } catch (e) {
      console.error('Error loading branches:', e);
    }
  };

  const loadEmployees = async (searchQuery = '', isInitial = false) => {
    const currentSeq = ++searchSeqRef.current;
    try {
      const branchParam = (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'Select Branch') ? `&branch=${encodeURIComponent(selectedBranch)}` : '';
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const res = await api.get(`/mobile/admin/employees-directory?limit=1000${branchParam}${searchParam}`);
      if (currentSeq !== searchSeqRef.current) return;
      if (res && res.success) {
        const emps = res.data || [];
        if (searchQuery) {
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
      console.error('Error loading employees for financials:', e);
    }
  };

  const handleEmployeeSearch = (text) => {
    setEmployeeSearchText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        loadEmployees(text.trim(), false);
      }, 350);
    }
  };

  const fetchFinancials = async (targetId, overrideParams = {}) => {
    const empId = targetId || selectedEmpId;
    if (!empId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const empCode = selectedEmployee?.code || '';

      // TAB 2: ADVANCE LEDGER - Use the exact same proven API endpoint as the web application
      if (activeTab === 'ledger') {
        const filterType = overrideParams.filterType !== undefined ? overrideParams.filterType : ledgerFilterType;
        const codeParam = empCode || selectedEmployee?.code || empId;
        let ledgerUrl = `/mobile/employee/advance-ledger?employeeCode=${encodeURIComponent(codeParam)}`;
        
        if (filterType === 'range') {
          const sDate = overrideParams.startDate || ledgerStartDate;
          const eDate = overrideParams.endDate || ledgerEndDate;
          if (sDate) ledgerUrl += `&fromDate=${encodeURIComponent(sDate)}`;
          if (eDate) ledgerUrl += `&toDate=${encodeURIComponent(eDate)}`;
        } else if (filterType === 'month') {
          const m = overrideParams.month || selectedMonth;
          const y = overrideParams.year || selectedYear;
          const sDate = `${y}-${String(m).padStart(2, '0')}-01`;
          const lastDay = new Date(y, m, 0).getDate();
          const eDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          ledgerUrl += `&fromDate=${encodeURIComponent(sDate)}&toDate=${encodeURIComponent(eDate)}`;
        }
        // If filterType === 'all', omit fromDate/toDate to get entire history

        const ledgerRes = await api.get(ledgerUrl);
        if (ledgerRes && ledgerRes.success) {
          const sum = ledgerRes.summary || {};
          const emp = ledgerRes.employee || {};
          const opBal = sum.openingBalance !== undefined ? sum.openingBalance : (emp.openingBalance || 0);
          const clBal = sum.closingBalance !== undefined ? sum.closingBalance : opBal;
          const totPay = sum.totalPay !== undefined ? sum.totalPay : (sum.totalDebit || 0);
          const totRec = sum.totalReceived !== undefined ? sum.totalReceived : (sum.totalCredit || 0);

          const rows = (ledgerRes.data || []).map((r, idx) => ({
            id: r._id || `${r.date}-${idx}`,
            date: r.date,
            transactionType: r.type || (r.debit > 0 ? 'Pay' : 'Received'),
            docMode: r.docMode || 'Cash',
            amount: r.debit > 0 ? r.debit : (r.credit > 0 ? r.credit : 0),
            debit: r.debit || 0,
            credit: r.credit || 0,
            balance: r.balance !== undefined ? r.balance : clBal,
            remarks: r.remarks || r.narration || '-'
          }));

          setFinancials(prev => ({
            ...(prev || {}),
            openingBalance: opBal,
            advanceBalance: clBal,
            closingBalance: clBal,
            totalAdvancesTaken: totPay,
            totalAdvancesDeducted: totRec,
            periodAdvancesTaken: totPay,
            periodAdvancesDeducted: totRec,
            periodClosingBalance: clBal,
            ledgerTransactions: rows,
            allHistoryCount: rows.length,
            startDate: (filterType === 'range' || filterType === 'month') ? (overrideParams.startDate || ledgerStartDate) : null
          }));
          return;
        }
      }

      // TAB 1: PAY SLIPS & GENERAL FINANCIALS
      let url = `/mobile/employee/financials?employeeId=${encodeURIComponent(empId)}`;
      if (empCode) {
        url += `&code=${encodeURIComponent(empCode)}`;
      }
      url += `&month=${selectedMonth}&year=${selectedYear}`;

      const response = await api.get(url);
      if (response && response.success) {
        setFinancials(response.financials);
        if (response.employee && !selectedEmployee?.basicSalary && response.employee.basicSalary) {
          setSelectedEmployee(prev => ({ ...(prev || {}), ...response.employee }));
        }
      }
    } catch (error) {
      console.error('Error fetching financials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLedgerPreset = (preset) => {
    const today = new Date();
    if (preset === 'this_month') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const startStr = `${y}-${m}-01`;
      const endStr = today.toISOString().split('T')[0];
      setLedgerStartDate(startStr);
      setLedgerEndDate(endStr);
      setLedgerFilterType('range');
      fetchFinancials(selectedEmpId, { filterType: 'range', startDate: startStr, endDate: endStr });
    } else if (preset === 'last_month') {
      const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const startStr = prevMonthDate.toISOString().split('T')[0];
      const endStr = lastDayPrevMonth.toISOString().split('T')[0];
      setLedgerStartDate(startStr);
      setLedgerEndDate(endStr);
      setLedgerFilterType('range');
      fetchFinancials(selectedEmpId, { filterType: 'range', startDate: startStr, endDate: endStr });
    } else if (preset === '90_days') {
      const past = new Date();
      past.setDate(past.getDate() - 90);
      const startStr = past.toISOString().split('T')[0];
      const endStr = today.toISOString().split('T')[0];
      setLedgerStartDate(startStr);
      setLedgerEndDate(endStr);
      setLedgerFilterType('range');
      fetchFinancials(selectedEmpId, { filterType: 'range', startDate: startStr, endDate: endStr });
    } else if (preset === 'all') {
      setLedgerFilterType('all');
      fetchFinancials(selectedEmpId, { filterType: 'all' });
    }
  };

  const fetchBranchAdvances = async () => {
    setLoading(true);
    try {
      const branchParam = (selectedBranch && selectedBranch !== 'Select Branch') ? encodeURIComponent(selectedBranch) : 'All Branches';
      const url = `/mobile/employee/financials?mode=branch_advances&branch=${branchParam}&month=${selectedMonth}&year=${selectedYear}`;
      const response = await api.get(url);
      if (response && response.success) {
        setBranchAdvancesData(response);
      }
    } catch (error) {
      console.error('Error fetching branch advances:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpandSlip = (id) => {
    setExpandedSlipId(expandedSlipId === id ? null : id);
  };

  const formatMonthYear = (monthNum, yearNum) => {
    return `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;
  };

  const selectPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const selectCurrentMonth = () => {
    const cur = new Date();
    setSelectedMonth(cur.getMonth() + 1);
    setSelectedYear(cur.getFullYear());
  };

  const filteredEmployeesForPicker = employeesList.filter(emp => {
    if (pickerBranchFilter && pickerBranchFilter !== 'All Branches') {
      const b = (emp.branch || '').toLowerCase();
      const targetB = pickerBranchFilter.toLowerCase();
      if (b !== targetB && !b.includes(targetB)) return false;
    }
    const q = employeeSearchText.trim().toLowerCase();
    if (!q) return true;
    return (
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.code || '').toLowerCase().includes(q) ||
      (emp.branch || '').toLowerCase().includes(q) ||
      (emp.designation || '').toLowerCase().includes(q)
    );
  });

  // -------------------------------------------------------------
  // Render Pay Slip Card
  // -------------------------------------------------------------
  const renderPaySlipItem = ({ item }) => {
    const isExpanded = expandedSlipId === item.id;
    const grossTotal = item.earnings?.total || item.basicSalary || 0;
    const deductionsTotal = item.deductions?.total || 0;

    return (
      <View style={styles.slipCard}>
        <View style={styles.slipCardHeader}>
          <TouchableOpacity 
            style={{ flex: 1 }}
            onPress={() => toggleExpandSlip(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.slipMonthBadge}>
              <Text style={styles.slipMonthText}>{item.monthYear || formatMonthYear(selectedMonth, selectedYear)}</Text>
            </View>
            <Text style={styles.slipStats}>
              Days Worked: <Text style={{ color: '#F1F5F9', fontWeight: 'bold' }}>{item.workedDays}</Text> • Hours: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{(item.workedHrs || 0).toFixed(1)} hrs</Text>
            </Text>
            <Text style={styles.tapToViewText}>
              {isExpanded ? '▲ Hide Breakdown' : '▼ Tap for Full Breakdown'}
            </Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <View style={styles.netSalaryContainer}>
              <Text style={styles.netSalaryLabel}>NET SALARY</Text>
              <Text style={styles.netSalaryValue}>Rs. {(item.netSalary || 0).toLocaleString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
              <TouchableOpacity 
                style={[styles.directPrintBtn, { backgroundColor: '#16A34A', paddingHorizontal: 6, paddingVertical: 4 }]}
                onPress={() => shareSalarySlipViaWhatsApp(selectedEmployee || { name: item.employeeName || 'Staff', code: item.employeeCode || '00' }, item)}
                activeOpacity={0.8}
              >
                <Text style={styles.directPrintBtnText}>💬 WA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.directPrintBtn, { backgroundColor: '#D97706', paddingHorizontal: 6, paddingVertical: 4 }]}
                onPress={() => promptThermalSalarySlipOptions(selectedEmployee || { name: item.employeeName || 'Staff', code: item.employeeCode || '00' }, item)}
                activeOpacity={0.8}
              >
                <Text style={styles.directPrintBtnText}>🖨️ POS</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.directPrintBtn, { backgroundColor: '#0284C7', paddingHorizontal: 6, paddingVertical: 4 }]}
                onPress={() => promptSalarySlipActions(selectedEmployee || { name: item.employeeName || 'Staff', code: item.employeeCode || '00' }, item)}
                activeOpacity={0.8}
              >
                <Text style={styles.directPrintBtnText}>📄 PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            
            {/* Earnings Breakdown */}
            <Text style={styles.subSectionTitle}>EARNINGS BREAKDOWN</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Basic Monthly Salary</Text>
              <Text style={styles.metricValue}>Rs. {(item.basicSalary || 0).toLocaleString()}</Text>
            </View>
            {item.earnings?.rent > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>House Rent Allowance</Text>
                <Text style={styles.metricValue}>Rs. {item.earnings.rent.toLocaleString()}</Text>
              </View>
            )}
            {item.earnings?.overtime > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Overtime Pay</Text>
                <Text style={styles.metricValue}>Rs. {item.earnings.overtime.toLocaleString()}</Text>
              </View>
            )}
            {item.earnings?.teaAllowance > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Tea Allowance</Text>
                <Text style={styles.metricValue}>Rs. {item.earnings.teaAllowance.toLocaleString()}</Text>
              </View>
            )}
            {item.earnings?.other > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Other Allowances</Text>
                <Text style={styles.metricValue}>Rs. {item.earnings.other.toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.metricRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Gross Earnings</Text>
              <Text style={[styles.totalValue, { color: '#10B981' }]}>Rs. {grossTotal.toLocaleString()}</Text>
            </View>

            {/* Deductions Breakdown */}
            <Text style={[styles.subSectionTitle, { marginTop: 14 }]}>DEDUCTIONS BREAKDOWN</Text>
            {item.deductions?.advanceDeduction > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Advance Salary Recovery</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  - Rs. {item.deductions.advanceDeduction.toLocaleString()}
                </Text>
              </View>
            )}
            {item.deductions?.shortTime > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Short Time Penalty</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  - Rs. {item.deductions.shortTime.toLocaleString()}
                </Text>
              </View>
            )}
            {item.deductions?.food > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Food & Mess Charges</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  - Rs. {item.deductions.food.toLocaleString()}
                </Text>
              </View>
            )}
            {item.deductions?.penalty > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Other Penalties</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  - Rs. {item.deductions.penalty.toLocaleString()}
                </Text>
              </View>
            )}
            {item.deductions?.other > 0 && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Misc Deductions</Text>
                <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                  - Rs. {item.deductions.other.toLocaleString()}
                </Text>
              </View>
            )}
            <View style={[styles.metricRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Deductions</Text>
              <Text style={[styles.totalValue, { color: '#EF4444' }]}>
                Rs. {deductionsTotal.toLocaleString()}
              </Text>
            </View>

            {item.remarks && item.remarks !== '-' && (
              <View style={styles.remarksBox}>
                <Text style={styles.remarksLabel}>Remarks:</Text>
                <Text style={styles.remarksText}>{item.remarks}</Text>
              </View>
            )}

            {/* Print / Share Pay Slip Button */}
            <TouchableOpacity 
              style={styles.printSlipBtn}
              onPress={() => promptSalarySlipActions(selectedEmployee || { name: 'Staff', code: '00' }, item)}
              activeOpacity={0.8}
            >
              <Text style={styles.printSlipBtnText}>🖨️ Print / Share Official Pay Slip</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // -------------------------------------------------------------
  // Render Advance Ledger Transaction Row
  // -------------------------------------------------------------
  const renderLedgerItem = ({ item }) => {
    if (item.isOpening) {
      return (
        <View style={[styles.ledgerCard, { borderColor: '#0284C7', backgroundColor: '#0C203B' }]}>
          <View style={styles.ledgerHeaderRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.ledgerTypeRow}>
                <View style={[styles.ledgerBadge, { backgroundColor: 'rgba(56, 189, 248, 0.2)' }]}>
                  <Text style={[styles.ledgerBadgeText, { color: '#38BDF8' }]}>
                    BALANCE B/F (OPENING)
                  </Text>
                </View>
                <Text style={styles.ledgerDocMode}>Prior</Text>
              </View>
              <Text style={styles.ledgerDate}>📅 As of {item.date}</Text>
            </View>
            
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.ledgerAmount, { color: '#38BDF8' }]}>
                Rs. {(item.amount || 0).toLocaleString()}
              </Text>
              <Text style={styles.ledgerBalance}>Bal: Rs. {(item.balance || 0).toLocaleString()}</Text>
            </View>
          </View>

          {item.remarks && (
            <Text style={[styles.ledgerRemarks, { color: '#94A3B8' }]}>Note: {item.remarks}</Text>
          )}
        </View>
      );
    }

    const isPay = (item.transactionType || 'Pay').toLowerCase() === 'pay';

    return (
      <View style={styles.ledgerCard}>
        <View style={styles.ledgerHeaderRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.ledgerTypeRow}>
              <View style={[styles.ledgerBadge, isPay ? styles.badgePay : styles.badgeRec]}>
                <Text style={[styles.ledgerBadgeText, isPay ? styles.textRed : styles.textGreen]}>
                  {isPay ? 'ADVANCE ISSUED' : 'DEDUCTED / RECEIVED'}
                </Text>
              </View>
              <Text style={styles.ledgerDocMode}>{item.docMode || 'Cash'}</Text>
            </View>
            <Text style={styles.ledgerDate}>📅 {item.date}</Text>
          </View>
          
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.ledgerAmount, isPay ? styles.textRed : styles.textGreen]}>
              {isPay ? '+' : '-'} Rs. {(item.amount !== undefined && item.amount !== null && item.amount > 0 ? item.amount : (item.debit || item.credit || item.paid || 0)).toLocaleString()}
            </Text>
            <Text style={styles.ledgerBalance}>Bal: Rs. {(item.balance || 0).toLocaleString()}</Text>
          </View>
        </View>

        {item.remarks && item.remarks !== '-' && (
          <Text style={styles.ledgerRemarks}>Note: {item.remarks}</Text>
        )}
      </View>
    );
  };

  // -------------------------------------------------------------
  // Render Branch Advances Overview Row
  // -------------------------------------------------------------
  const renderBranchAdvanceRow = ({ item, index }) => {
    const isPay = (item.transactionType || 'Pay').toLowerCase() === 'pay';

    return (
      <View style={styles.branchAdvCard}>
        <View style={styles.branchAdvHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.branchAdvEmpName}>{item.employeeName}</Text>
            <Text style={styles.branchAdvCode}>{item.employeeCode} • <Text style={{ color: '#38BDF8' }}>{item.branch}</Text></Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.branchAdvAmount, isPay ? styles.textRed : styles.textGreen]}>
              Rs. {(item.amount || 0).toLocaleString()}
            </Text>
            <View style={[styles.branchAdvTypePill, isPay ? styles.badgePay : styles.badgeRec]}>
              <Text style={[styles.branchAdvTypePillText, isPay ? styles.textRed : styles.textGreen]}>
                {item.transactionType} ({item.docMode})
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.branchAdvFooter}>
          <Text style={styles.branchAdvDate}>📅 {item.date}</Text>
          <Text style={styles.branchAdvBal}>Remaining Bal: Rs. {(item.balance || 0).toLocaleString()}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Screen Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackBtn} 
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerBackBtnIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Financials & Pay Slips</Text>
          <Text style={styles.headerSubtitle}>
            {activeTab === 'branch_advances' 
              ? `Branch Advances • ${selectedBranch}` 
              : `${selectedEmployee?.name || 'Employee'} (${selectedEmployee?.code || '--'})`}
          </Text>
        </View>
      </View>

      {/* Top Tab Navigator */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'payslips' && styles.tabItemActive]}
          onPress={() => setActiveTab('payslips')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'payslips' && styles.tabTextActive]}>📄 Pay Slips</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'ledger' && styles.tabItemActive]}
          onPress={() => setActiveTab('ledger')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'ledger' && styles.tabTextActive]}>💳 Advance Ledger</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'branch_advances' && styles.tabItemActive]}
          onPress={() => setActiveTab('branch_advances')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'branch_advances' && styles.tabTextActive]}>🏢 Branch Advances</Text>
        </TouchableOpacity>
      </View>

      {/* Filters Bar: Branch & Employee Selector */}
      <View style={styles.filtersBar}>
        {/* Branch Selector Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
          {branches.map((b, idx) => (
            <TouchableOpacity 
              key={idx}
              style={[styles.branchPill, selectedBranch === b && styles.branchPillActive]}
              onPress={() => setSelectedBranch(b)}
              activeOpacity={0.7}
            >
              <Text style={[styles.branchPillText, selectedBranch === b && styles.branchPillTextActive]}>
                {b === 'Select Branch' ? '👇 Select Branch' : b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Employee Search / Selector Button (Only for Pay slips and Ledger tabs) */}
        {activeTab !== 'branch_advances' && (
          <TouchableOpacity 
            style={styles.empSelectButton}
            onPress={() => setEmployeePickerVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.empSelectLeft}>
              <Text style={styles.empSelectLabel}>SELECTED EMPLOYEE:</Text>
              <Text style={styles.empSelectName} numberOfLines={1}>
                👤 {selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.code})` : 'Tap to search employee...'}
              </Text>
            </View>
            <Text style={styles.empSelectAction}>Change ▾</Text>
          </TouchableOpacity>
        )}

        {/* Month & Year Quick Switcher Bar */}
        <View style={styles.monthSwitcherRow}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={selectPreviousMonth} activeOpacity={0.7}>
            <Text style={styles.monthNavBtnText}>◀ Last Month</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.monthDisplayBtn}
            onPress={() => setMonthPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.monthDisplayText}>📅 {formatMonthYear(selectedMonth, selectedYear)} ▾</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.monthNavBtn} onPress={selectCurrentMonth} activeOpacity={0.7}>
            <Text style={styles.monthNavBtnText}>This Month ▶</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#06B6D4" />
          <Text style={styles.loadingText}>Fetching financial records...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {/* TAB 1: PAY SLIPS */}
          {activeTab === 'payslips' && (
            <View>
              {/* Employee Summary Card */}
              {selectedEmployee && (
                <View style={styles.empSummaryCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empCardName}>{selectedEmployee.name}</Text>
                    <Text style={styles.empCardDetails}>
                      {selectedEmployee.code} • {selectedEmployee.designation || 'Staff'} • {selectedEmployee.branch}
                    </Text>
                  </View>
                  <View style={styles.basicSalaryBox}>
                    <Text style={styles.basicSalaryLabel}>BASIC SALARY</Text>
                    <Text style={styles.basicSalaryValue}>Rs. {(selectedEmployee.basicSalary || 0).toLocaleString()}</Text>
                  </View>
                </View>
              )}

              {/* Pay Slips List */}
              <View style={[styles.sectionHeaderRow, { alignItems: 'center', justifyContent: 'space-between' }]}>
                <View>
                  <Text style={styles.sectionTitle}>Monthly Pay Slips</Text>
                  <Text style={styles.sectionSubtitle}>({financials?.paySlips?.length || 0} records)</Text>
                </View>
                {selectedEmployee && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#10B981',
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}
                    onPress={() => {
                      const nav = navigation?.navigate || navigation;
                      nav('GenerateSalarySlip', {
                        employeeId: selectedEmployee?._id || selectedEmployee?.id,
                        branch: selectedEmployee?.branch,
                        employee: selectedEmployee
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 13 }}>⚡</Text>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Generate Slip</Text>
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={(showAllSlips && financials?.allAvailableSlips?.length > 0) ? financials.allAvailableSlips : (financials?.paySlips || [])}
                keyExtractor={(item, idx) => item.id || String(idx)}
                renderItem={renderPaySlipItem}
                scrollEnabled={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📄</Text>
                    <Text style={styles.emptyText}>No pay slip generated for {formatMonthYear(selectedMonth, selectedYear)}</Text>
                    <Text style={styles.emptySubtext}>You can generate it now or view slips from previous months</Text>

                    {financials?.allAvailableSlips?.length > 0 && (
                      <View style={{ backgroundColor: '#1E293B', padding: 12, borderRadius: 10, marginVertical: 12, borderWidth: 1, borderColor: '#38BDF8', width: '100%', alignItems: 'center' }}>
                        <Text style={{ color: '#38BDF8', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
                          📋 {financials.allAvailableSlips.length} Available Pay Slip(s) Found
                        </Text>
                        <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
                          Past slips found ({financials.allAvailableSlips.map(s => s.monthYear).filter(Boolean).slice(0, 3).join(', ')})
                        </Text>
                        <TouchableOpacity
                          style={{ backgroundColor: '#0284C7', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 }}
                          onPress={() => setShowAllSlips(!showAllSlips)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                            {showAllSlips ? 'Show Only Selected Month' : '📂 View All Available Slips'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {selectedEmployee && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#10B981',
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          marginTop: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6
                        }}
                        onPress={() => {
                          const nav = navigation?.navigate || navigation;
                          nav('GenerateSalarySlip', {
                            employeeId: selectedEmployee?._id || selectedEmployee?.id,
                            branch: selectedEmployee?.branch,
                            employee: selectedEmployee
                          });
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 14 }}>⚡</Text>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Generate Slip for {selectedEmployee.name}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            </View>
          )}

          {/* TAB 2: ADVANCE LEDGER */}
          {activeTab === 'ledger' && (
            <View>
              {/* Date Filter Card for Advance Ledger */}
              <View style={styles.ledgerFilterCard}>
                <View style={styles.ledgerFilterTopRow}>
                  <Text style={styles.ledgerFilterHeading}>📅 LEDGER DATE FILTER</Text>
                  <View style={styles.ledgerTypeChipsRow}>
                    <TouchableOpacity
                      style={[styles.ledgerTypeChip, ledgerFilterType === 'range' && styles.ledgerTypeChipActive]}
                      onPress={() => setLedgerFilterType('range')}
                    >
                      <Text style={[styles.ledgerTypeChipText, ledgerFilterType === 'range' && styles.ledgerTypeChipTextActive]}>
                        Date Range
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ledgerTypeChip, ledgerFilterType === 'all' && styles.ledgerTypeChipActive]}
                      onPress={() => handleLedgerPreset('all')}
                    >
                      <Text style={[styles.ledgerTypeChipText, ledgerFilterType === 'all' && styles.ledgerTypeChipTextActive]}>
                        All History
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Quick Presets */}
                <View style={styles.ledgerPresetsRow}>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => handleLedgerPreset('this_month')}>
                    <Text style={styles.presetBtnText}>This Month</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => handleLedgerPreset('last_month')}>
                    <Text style={styles.presetBtnText}>Last Month</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.presetBtn} onPress={() => handleLedgerPreset('90_days')}>
                    <Text style={styles.presetBtnText}>Last 90 Days</Text>
                  </TouchableOpacity>
                </View>

                {/* From & To Date Selector */}
                {ledgerFilterType === 'range' && (
                  <View style={styles.rangeSelectorContainer}>
                    <View style={styles.dateInputsRow}>
                      <View style={styles.datePickerInputGroup}>
                        <Text style={styles.datePickerLabel}>FROM DATE</Text>
                        <TouchableOpacity 
                          style={styles.datePickerBox}
                          onPress={() => setShowLedgerStartPicker(true)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.datePickerValueText}>{ledgerStartDate}</Text>
                          <Text style={styles.calendarIcon}>📅</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.datePickerInputGroup}>
                        <Text style={styles.datePickerLabel}>TO DATE</Text>
                        <TouchableOpacity 
                          style={styles.datePickerBox}
                          onPress={() => setShowLedgerEndPicker(true)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.datePickerValueText}>{ledgerEndDate}</Text>
                          <Text style={styles.calendarIcon}>📅</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.applyFilterBtn}
                      onPress={() => fetchFinancials(selectedEmpId, { filterType: 'range', startDate: ledgerStartDate, endDate: ledgerEndDate })}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.applyFilterBtnText}>🔍 Check Ledger</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {showLedgerStartPicker && (
                  <DateTimePicker
                    value={new Date(ledgerStartDate || Date.now())}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(event, selectedDate) => {
                      setShowLedgerStartPicker(false);
                      if (selectedDate) {
                        const dateStr = selectedDate.toISOString().split('T')[0];
                        setLedgerStartDate(dateStr);
                      }
                    }}
                  />
                )}

                {showLedgerEndPicker && (
                  <DateTimePicker
                    value={new Date(ledgerEndDate || Date.now())}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(event, selectedDate) => {
                      setShowLedgerEndPicker(false);
                      if (selectedDate) {
                        const dateStr = selectedDate.toISOString().split('T')[0];
                        setLedgerEndDate(dateStr);
                      }
                    }}
                  />
                )}
              </View>

              {/* Advance Summary Card */}
              <View style={styles.advanceSummaryCard}>
                <Text style={styles.advanceCardTitle}>SALARY ADVANCE OVERVIEW</Text>
                
                <View style={styles.advBalanceRow}>
                  <View>
                    <Text style={styles.advBalanceLabel}>CURRENT OUTSTANDING BALANCE</Text>
                    <Text style={styles.advBalanceValue}>
                      Rs. {(financials?.advanceBalance || 0).toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.printLedgerBtn}
                    onPress={() => promptAdvanceLedgerActions(
                      selectedEmployee || { name: 'Staff', code: '00' },
                      financials || {},
                      financials?.ledgerTransactions || []
                    )}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.printLedgerBtnText}>📄 PDF / Print Ledger</Text>
                  </TouchableOpacity>
                </View>

                {financials?.openingBalance > 0 && (
                  <View style={styles.openingBalCard}>
                    <Text style={styles.openingBalLabel}>📌 Balance B/F (Prior Periods):</Text>
                    <Text style={styles.openingBalVal}>Rs. {financials.openingBalance.toLocaleString()}</Text>
                  </View>
                )}

                {financials?.installmentPlan?.monthlyInstallment > 0 && (
                  <View style={styles.installmentPlanBox}>
                    <Text style={styles.installmentPlanText}>
                      ⚡ Active Installment Plan: Rs. {financials.installmentPlan.monthlyInstallment.toLocaleString()} / month deduction
                    </Text>
                  </View>
                )}

                <View style={styles.advMetricsRow}>
                  <View style={styles.advMetricBox}>
                    <Text style={styles.advMetricNum} numberOfLines={1} adjustsFontSizeToFit>
                      Rs. {(financials?.periodAdvancesTaken !== undefined ? financials.periodAdvancesTaken : (financials?.totalAdvancesTaken || 0)).toLocaleString()}
                    </Text>
                    <Text style={styles.advMetricLabel} numberOfLines={1}>{financials?.startDate ? 'Period Advances' : 'Total Advances'}</Text>
                  </View>
                  <View style={styles.advMetricBox}>
                    <Text style={[styles.advMetricNum, { color: '#10B981' }]} numberOfLines={1} adjustsFontSizeToFit>
                      Rs. {(financials?.periodAdvancesDeducted !== undefined ? financials.periodAdvancesDeducted : (financials?.totalAdvancesDeducted || 0)).toLocaleString()}
                    </Text>
                    <Text style={styles.advMetricLabel} numberOfLines={1}>{financials?.startDate ? 'Period Recovered' : 'Total Recovered'}</Text>
                  </View>
                  {financials?.startDate && (
                    <View style={styles.advMetricBox}>
                      <Text style={[styles.advMetricNum, { color: '#F59E0B' }]} numberOfLines={1} adjustsFontSizeToFit>
                        Rs. {(financials?.periodClosingBalance !== undefined ? financials.periodClosingBalance : (financials?.advanceBalance || 0)).toLocaleString()}
                      </Text>
                      <Text style={styles.advMetricLabel} numberOfLines={1}>Closing Balance</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Transactions Timeline */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Advance Transaction History</Text>
                <Text style={styles.sectionSubtitle}>({financials?.ledgerTransactions?.length || 0} entries)</Text>
              </View>

              <FlatList
                data={financials?.ledgerTransactions || []}
                keyExtractor={(item, idx) => item.id || String(idx)}
                renderItem={renderLedgerItem}
                scrollEnabled={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>💳</Text>
                    <Text style={styles.emptyText}>No advance records found in this date range.</Text>
                    {financials?.allHistoryCount > 0 && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#0284C7',
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          marginTop: 10
                        }}
                        onPress={() => handleLedgerPreset('all')}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          📜 View All History ({financials.allHistoryCount} past records)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            </View>
          )}

          {/* TAB 3: BRANCH ADVANCES (CURRENT / SELECTED MONTH) */}
          {activeTab === 'branch_advances' && (
            <View>
              {/* Branch Summary Box */}
              <View style={styles.branchSummaryCard}>
                <View style={styles.branchSummaryTop}>
                  <View>
                    <Text style={styles.branchSumTitle}>{selectedBranch} • {formatMonthYear(selectedMonth, selectedYear)}</Text>
                    <Text style={styles.branchSumSubtitle}>Current Month Branch Advances Register</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.printLedgerBtn}
                    onPress={() => promptBranchAdvancesActions(
                      selectedBranch,
                      formatMonthYear(selectedMonth, selectedYear),
                      branchAdvancesData?.summary || {},
                      branchAdvancesData?.transactions || []
                    )}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.printLedgerBtnText}>📄 PDF / Print Report</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.branchSumGrid}>
                  <View style={styles.branchSumBox}>
                    <Text style={[styles.branchSumVal, { color: '#EF4444' }]}>
                      Rs. {(branchAdvancesData?.summary?.totalPaid || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.branchSumLbl}>Advances Issued</Text>
                  </View>
                  <View style={styles.branchSumBox}>
                    <Text style={[styles.branchSumVal, { color: '#10B981' }]}>
                      Rs. {(branchAdvancesData?.summary?.totalReceived || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.branchSumLbl}>Recovered</Text>
                  </View>
                  <View style={styles.branchSumBox}>
                    <Text style={styles.branchSumVal}>
                      {branchAdvancesData?.summary?.count || 0}
                    </Text>
                    <Text style={styles.branchSumLbl}>Transactions</Text>
                  </View>
                </View>
              </View>

              {/* Transactions List */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Branch Advances Log</Text>
                <Text style={styles.sectionSubtitle}>({branchAdvancesData?.transactions?.length || 0} records)</Text>
              </View>

              <FlatList
                data={branchAdvancesData?.transactions || []}
                keyExtractor={(item, idx) => item.id || String(idx)}
                renderItem={renderBranchAdvanceRow}
                scrollEnabled={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏢</Text>
                    <Text style={styles.emptyText}>No advances recorded in {selectedBranch} for {formatMonthYear(selectedMonth, selectedYear)}</Text>
                  </View>
                }
              />
            </View>
          )}
        </ScrollView>
      )}

      {/* Employee Search & Picker Modal */}
      <Modal
        visible={employeePickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEmployeePickerVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.sheetHandleContainer}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalTitle}>Search & Select Employee</Text>
                <View style={styles.pickerCountBadge}>
                  <Text style={styles.pickerCountBadgeText}>{filteredEmployeesForPicker.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setEmployeePickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <View style={styles.modalSearchInputWrapper}>
                <Text style={styles.searchIconText}>🔍</Text>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Type name (e.g. Bilal), code or branch..."
                  placeholderTextColor="#64748B"
                  value={employeeSearchText}
                  onChangeText={handleEmployeeSearch}
                  autoFocus={false}
                />
                {employeeSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => handleEmployeeSearch('')} style={styles.clearSearchBtn}>
                    <Text style={styles.clearSearchText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* In-Modal Branch Filter Chips */}
            {branches && branches.length > 1 && (
              <View style={styles.pickerBranchChipsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerBranchScroll}>
                  {branches.map((b, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.pickerBranchChip, pickerBranchFilter === b && styles.pickerBranchChipActive]}
                      onPress={() => setPickerBranchFilter(b)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pickerBranchChipText, pickerBranchFilter === b && styles.pickerBranchChipTextActive]}>
                        {b === 'Select Branch' ? '👇 Select Branch' : b === 'All Branches' ? '🌐 All Branches' : b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <FlatList
              data={filteredEmployeesForPicker}
              keyExtractor={(item) => item.id || item._id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selectedEmployee?.id === item.id || selectedEmployee?._id === item.id || selectedEmployee?.id === item._id;
                return (
                  <TouchableOpacity 
                    style={[
                      styles.empPickerItem, 
                      isSelected && styles.empPickerItemActive
                    ]}
                    onPress={() => {
                      setSelectedEmployee(item);
                      setEmployeePickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.empPickerAvatar, isSelected && { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                      <Text style={styles.empPickerAvatarText}>{(item.name || 'E').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.empPickerName, isSelected && { color: '#38BDF8' }]}>{item.name}</Text>
                      <View style={styles.empPickerMetaRow}>
                        <Text style={styles.empPickerCode}>#{item.code} • {item.designation || 'Staff'}</Text>
                        {item.branch && (
                          <View style={styles.empPickerBranchTag}>
                            <Text style={styles.empPickerBranchTagText}>{item.branch}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.checkmarkBadge}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>🔍</Text>
                  <Text style={styles.emptyText}>No employees match your search</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Try searching with another name or code</Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Month Picker Modal */}
      <Modal
        visible={monthPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMonthPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month & Year</Text>
              <TouchableOpacity onPress={() => setMonthPickerVisible(false)}>
                <Text style={styles.modalCloseBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Year Selector Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#334155', backgroundColor: '#0F172A' }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', marginRight: 4 }}>YEAR:</Text>
              {[2023, 2024, 2025, 2026].map((yr) => (
                <TouchableOpacity
                  key={yr}
                  style={[{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1E293B' }, selectedYear === yr && { backgroundColor: '#0284C7', borderColor: '#38BDF8' }]}
                  onPress={() => setSelectedYear(yr)}
                  activeOpacity={0.7}
                >
                  <Text style={[{ color: '#94A3B8', fontSize: 12, fontWeight: '700' }, selectedYear === yr && { color: '#fff' }]}>
                    {yr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={MONTH_NAMES.map((name, index) => ({ month: index + 1, name }))}
              keyExtractor={(item) => String(item.month)}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.monthPickerItem, selectedMonth === item.month && styles.monthPickerItemActive]}
                  onPress={() => {
                    setSelectedMonth(item.month);
                    setMonthPickerVisible(false);
                  }}
                >
                  <Text style={[styles.monthPickerText, selectedMonth === item.month && styles.monthPickerTextActive]}>
                    {item.name} {selectedYear}
                  </Text>
                  {selectedMonth === item.month && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Sticky Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    backgroundColor: '#131D33',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerBackBtnIcon: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#131D33',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 3,
  },
  tabItemActive: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  tabText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  filtersBar: {
    backgroundColor: '#131D33',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  branchScroll: {
    flexDirection: 'row',
    paddingBottom: 8,
  },
  branchPill: {
    backgroundColor: '#0B1120',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  branchPillActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  branchPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  branchPillTextActive: {
    color: '#38BDF8',
  },
  empSelectButton: {
    backgroundColor: '#0B1120',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  empSelectLeft: {
    flex: 1,
    marginRight: 10,
  },
  empSelectLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  empSelectName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 2,
  },
  empSelectAction: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '700',
  },
  monthSwitcherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  monthNavBtn: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  monthNavBtnText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  monthDisplayBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  monthDisplayText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },
  empSummaryCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  empCardName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  empCardDetails: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  basicSalaryBox: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  basicSalaryLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
  },
  basicSalaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 6,
    fontWeight: '600',
  },
  slipCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  slipCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slipMonthBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  slipMonthText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  slipStats: {
    fontSize: 12,
    color: '#94A3B8',
  },
  netSalaryContainer: {
    alignItems: 'flex-end',
  },
  netSalaryLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
  },
  netSalaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
  },
  directPrintBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  directPrintBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  tapToViewText: {
    fontSize: 10,
    color: '#38BDF8',
    marginTop: 4,
    fontWeight: '700',
  },
  expandedContent: {
    marginTop: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  subSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  metricLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  totalRow: {
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  remarksBox: {
    backgroundColor: '#0B1120',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  remarksLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
  },
  remarksText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  printSlipBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    elevation: 3,
  },
  printSlipBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  advanceSummaryCard: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  advanceCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  advBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  advBalanceLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  advBalanceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#38BDF8',
    marginTop: 2,
  },
  printLedgerBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  printLedgerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  installmentPlanBox: {
    backgroundColor: '#0B1120',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  installmentPlanText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  advMetricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  advMetricBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#0B1120',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  advMetricNum: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'center',
  },
  advMetricLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 3,
    textAlign: 'center',
  },
  ledgerCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  ledgerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ledgerTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ledgerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  badgePay: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  badgeRec: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  ledgerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  textRed: { color: '#EF4444' },
  textGreen: { color: '#10B981' },
  ledgerDocMode: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  ledgerDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  ledgerAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  ledgerBalance: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  ledgerRemarks: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 4,
  },
  branchSummaryCard: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  branchSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  branchSumTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  branchSumSubtitle: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 2,
  },
  branchSumGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B1120',
    borderRadius: 10,
    padding: 10,
  },
  branchSumBox: {
    alignItems: 'center',
    width: '32%',
  },
  branchSumVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  branchSumLbl: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  branchAdvCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  branchAdvHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  branchAdvEmpName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  branchAdvCode: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  branchAdvAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  branchAdvTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  branchAdvTypePillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  branchAdvFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  branchAdvDate: {
    fontSize: 11,
    color: '#64748B',
  },
  branchAdvBal: {
    fontSize: 11,
    color: '#94A3B8',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131D33',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'android' ? 20 : 34,
    height: '82%',
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sheetHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  pickerCountBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  pickerCountBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  modalSearchBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalSearchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
  },
  searchIconText: {
    fontSize: 14,
    marginRight: 8,
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pickerBranchChipsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerBranchScroll: {
    paddingVertical: 2,
  },
  pickerBranchChip: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginRight: 6,
  },
  pickerBranchChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  pickerBranchChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  pickerBranchChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  empPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0E1729',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  empPickerItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38BDF8',
  },
  empPickerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#1E293B',
  },
  empPickerAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#38BDF8',
  },
  empPickerName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  empPickerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    flexWrap: 'wrap',
  },
  empPickerCode: {
    fontSize: 11,
    color: '#94A3B8',
    marginRight: 8,
  },
  empPickerBranchTag: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  empPickerBranchTagText: {
    fontSize: 9.5,
    color: '#38BDF8',
    fontWeight: '700',
  },
  checkmarkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  modalEmpty: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#0B1120',
  },
  monthPickerItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  monthPickerText: {
    fontSize: 14,
    color: '#F1F5F9',
  },
  monthPickerTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  footerBar: {
    backgroundColor: '#131D33',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 56 : 28,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  footerBackBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  footerBackBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Ledger Date Filter Styles
  ledgerFilterCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  ledgerFilterTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ledgerFilterHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.8,
  },
  ledgerTypeChipsRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 2,
  },
  ledgerTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ledgerTypeChipActive: {
    backgroundColor: '#0284C7',
  },
  ledgerTypeChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  ledgerTypeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ledgerPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetBtnText: {
    fontSize: 11.5,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  rangeSelectorContainer: {
    marginTop: 4,
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  datePickerInputGroup: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  datePickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerValueText: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  calendarIcon: {
    fontSize: 14,
  },
  applyFilterBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  openingBalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
  openingBalLabel: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
  },
  openingBalVal: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
