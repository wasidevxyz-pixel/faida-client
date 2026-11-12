import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  RefreshControl,
  Linking,
  Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../services/api';

// Safe text extractor
const getSafeString = (val, fallback = '') => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    return val.name || val.title || val.label || val.branch || fallback;
  }
  return String(val || fallback);
};

// Formatting helpers
const formatNum = (val) => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDate = (dateVal) => {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toISOString().split('T')[0];
  } catch {
    return String(dateVal);
  }
};

// Month helper utilities
const getCurrentMonthKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getPreMonthKey = (monthKey = null) => {
  const baseKey = monthKey || getCurrentMonthKey();
  const [y, m] = baseKey.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getNextMonthKey = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthKeyLabel = (monthKey) => {
  if (!monthKey || monthKey === 'all') return 'All Time';
  try {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return String(monthKey);
  }
};

const getAdvanceDeptName = (adv) => {
  const dept = adv?.department || adv?.employee?.department;
  if (!dept) return 'General';
  if (typeof dept === 'object') {
    return dept.name || dept.departmentName || dept.title || 'General';
  }
  return String(dept);
};

// Generate Web-parity Print Slip HTML
export const generateAdvanceSlipHtml = (adv) => {
  const empName = getSafeString(adv.employee?.name, 'Staff Member');
  const empCode = getSafeString(adv.employee?.code || adv.code, 'N/A');
  const deptName = getAdvanceDeptName(adv);
  const desigName = getSafeString(adv.employee?.designation, 'Staff');
  const branchName = getSafeString(adv.branch || adv.employee?.branch, 'Store');
  const dateStr = adv.date
    ? new Date(adv.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const isPay = (adv.transactionType || 'Pay') === 'Pay';
  const slipTitle = isPay ? 'Employee Advance Payment Slip' : 'Employee Advance Recovery Slip';
  const amount = Number(adv.paid || 0);
  const preBal = Number(adv.total || adv.preMonthBal || 0);
  const closeBal = Number(adv.balance !== undefined ? adv.balance : (isPay ? preBal + amount : preBal - amount));
  const docMode = adv.docMode || 'Cash';
  const remarks = adv.remarks || 'Official Advance';
  const createdBy = adv.createdBy?.name || 'Bilal Shah';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${slipTitle}</title>
      <style>
        @page { size: A5 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 15px; margin: 0; color: #0F172A; }
        .container { width: 100%; max-width: 720px; margin: 0 auto; border: 2px solid #0284C7; border-radius: 8px; padding: 18px; background: #FFFFFF; }
        .header { text-align: center; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 22px; font-weight: 900; color: #0284C7; letter-spacing: 0.5px; margin: 0; }
        .subtitle { font-size: 13px; color: #64748B; font-weight: 600; margin-top: 3px; }
        .slip-title-box { display: inline-block; background: ${isPay ? '#0284C7' : '#D97706'}; color: #FFFFFF; font-size: 13px; font-weight: 800; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; margin-top: 8px; letter-spacing: 0.6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
        td { border: 1px solid #CBD5E1; padding: 8px 12px; vertical-align: middle; }
        .label-col { width: 32%; background-color: #F8FAFC; font-weight: 700; color: #475569; }
        .value-col { width: 68%; font-weight: 700; color: #0F172A; }
        .amt-highlight { font-size: 15px; font-weight: 900; color: ${isPay ? '#059669' : '#D97706'}; }
        .bal-highlight { font-size: 15px; font-weight: 900; color: #DC2626; }
        .signatures { display: flex; justify-content: space-between; margin-top: 45px; padding-top: 10px; }
        .sig-box { text-align: center; width: 30%; }
        .sig-line { border-top: 1.5px dashed #475569; margin-top: 32px; margin-bottom: 5px; }
        .sig-label { font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; }
        .footer-note { margin-top: 18px; text-align: center; font-size: 10px; color: #94A3B8; border-top: 1px solid #F1F5F9; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="title">DWATSON GROUP / BAS ERP</div>
          <div class="subtitle">${branchName} • Islamabad • Ph: 051-5895662</div>
          <div><span class="slip-title-box">${slipTitle}</span></div>
        </div>
        <table>
          <tr>
            <td class="label-col">Voucher Date</td>
            <td class="value-col">${dateStr}</td>
          </tr>
          <tr>
            <td class="label-col">Employee Name & Code</td>
            <td class="value-col">${empName} <span style="color:#0284C7; font-weight:800;">(Code: ${empCode})</span></td>
          </tr>
          <tr>
            <td class="label-col">Store Branch</td>
            <td class="value-col">${branchName}</td>
          </tr>
          <tr>
            <td class="label-col">Department & Designation</td>
            <td class="value-col">${deptName} • ${desigName}</td>
          </tr>
          <tr>
            <td class="label-col">Previous Liability Balance</td>
            <td class="value-col">Rs ${preBal.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="label-col">${isPay ? 'Current Advance Paid' : 'Advance Recovery Received'}</td>
            <td class="value-col amt-highlight">Rs ${amount.toLocaleString()} <span style="font-size:11px; color:#64748B; font-weight:600;">(${docMode})</span></td>
          </tr>
          <tr>
            <td class="label-col">Net Closing Liability Balance</td>
            <td class="value-col bal-highlight">Rs ${closeBal.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="label-col">Remarks / Purpose</td>
            <td class="value-col" style="font-weight:600; color:#334155;">${remarks}</td>
          </tr>
        </table>
        <div class="signatures">
          <div class="sig-box">
            <div style="font-size:11px; font-weight:700; color:#0284C7; height:20px;">${createdBy}</div>
            <div class="sig-line"></div>
            <div class="sig-label">Prepared By</div>
          </div>
          <div class="sig-box">
            <div style="height:20px;"></div>
            <div class="sig-line"></div>
            <div class="sig-label">Received By Signature</div>
          </div>
          <div class="sig-box">
            <div style="font-size:11px; font-weight:700; color:#059669; height:20px;">Bilal Shah (Admin)</div>
            <div class="sig-line"></div>
            <div class="sig-label">Approved By Signature</div>
          </div>
        </div>
        <div class="footer-note">
          Computer generated official transaction voucher • 0.01 match with Central ERP Ledger Database
        </div>
      </div>
    </body>
    </html>
  `;
};

export default function EmployeeAdvanceScreen({ route, navigation, onBack }) {
  const navigate = navigation?.navigate || navigation;
  const initialEmployee = route?.params?.employee || null;
  const initialBranch = route?.params?.branch || '';

  // Mode Tabs: 'entry' | 'list' | 'audit' | 'installment'
  const [activeTab, setActiveTab] = useState('entry');

  // Branch & Filter State
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch || '');
  const [isBranchModalVisible, setIsBranchModalVisible] = useState(false);

  // Employees
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployee);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [isEmployeeModalVisible, setIsEmployeeModalVisible] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Form State (Section-Defined: matches Employee Register style)
  const todayStr = new Date().toISOString().split('T')[0];
  const [advanceDate, setAdvanceDate] = useState(todayStr);
  const [editingAdvanceId, setEditingAdvanceId] = useState(null);
  const [transactionType, setTransactionType] = useState('Pay'); // 'Pay' = Give Advance, 'Received' = Recovery
  const [docMode, setDocMode] = useState('Cash'); // 'Cash' | 'Bank'
  const [paidAmount, setPaidAmount] = useState('0');
  const [remarks, setRemarks] = useState('');

  // Financial Balances (Live Temporal Balance from MongoDB)
  const [basicSalary, setBasicSalary] = useState(0);
  const [preMonthBal, setPreMonthBal] = useState(0);
  const [currentMonthBal, setCurrentMonthBal] = useState(0);
  const [totalLiability, setTotalLiability] = useState(0);
  const [projectedBalance, setProjectedBalance] = useState(0);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Advance List State
  const [advancesList, setAdvancesList] = useState([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [listSearchText, setListSearchText] = useState('');
  const [listFilterType, setListFilterType] = useState('All'); // 'All' | 'Pay' | 'Received'
  const [refreshingList, setRefreshingList] = useState(false);

  // Advance List Filters: Month-wise & Department-wise
  const [listMonthFilter, setListMonthFilter] = useState('current'); // 'current' | 'pre' | 'custom' | 'all'
  const [listSelectedMonthKey, setListSelectedMonthKey] = useState(getCurrentMonthKey());
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');

  // Installment Plan State (Pre & Current Month Deductions)
  const [isInstallmentModalVisible, setIsInstallmentModalVisible] = useState(false);
  const [instPreBal1, setInstPreBal1] = useState(0);
  const [instInstallment1, setInstInstallment1] = useState('0');
  const [instRemainingBal1, setInstRemainingBal1] = useState(0);
  const [instPreBal2, setInstPreBal2] = useState(0);
  const [instInstallment2, setInstInstallment2] = useState('0');
  const [instRemainingBal2, setInstRemainingBal2] = useState(0);
  const [loadingInstallment, setLoadingInstallment] = useState(false);

  // --- Bilal Shah Security Authorization Modal State ---
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authUsername, setAuthUsername] = useState('bilal shah');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatusText, setAuthStatusText] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type, title, run }
  const [pendingRecord, setPendingRecord] = useState(null);

  // --- Audit & Analysis Tab State ---
  const [auditScope, setAuditScope] = useState('branch'); // 'branch' | 'department'
  const [auditMonthFilter, setAuditMonthFilter] = useState('current'); // 'current' | 'pre' | 'all'
  const [auditSearch, setAuditSearch] = useState('');
  const [expandedBranch, setExpandedBranch] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);

  // Initial Data Load
  useEffect(() => {
    loadBranches();
  }, []);

  // When branch changes, reload employees & advances
  useEffect(() => {
    if (selectedBranch && selectedBranch !== 'All Branches') {
      loadEmployeesForBranch(selectedBranch);
      loadAdvancesForBranch(selectedBranch);
    } else {
      loadEmployeesForBranch('');
      loadAdvancesForBranch('');
    }
  }, [selectedBranch]);

  // When Employee changes or Date changes, load balances
  useEffect(() => {
    if (selectedEmployee) {
      loadEmployeeBalances(selectedEmployee, advanceDate);
    }
  }, [selectedEmployee, advanceDate]);

  // Live calculation of Projected Balance when amount or type changes
  useEffect(() => {
    const amt = parseFloat(paidAmount) || 0;
    const total = parseFloat(totalLiability) || 0;
    let proj = 0;
    if (transactionType === 'Received') {
      proj = total - amt;
    } else {
      proj = total + amt;
    }
    setProjectedBalance(proj);
  }, [paidAmount, transactionType, totalLiability]);

  // Load Branches
  const loadBranches = async () => {
    try {
      const res = await api.get('/stores');
      const storeList = res?.data || res || [];
      const branchList = Array.isArray(storeList)
        ? storeList.map(s => {
            if (typeof s === 'object' && s !== null) {
              return getSafeString(s.name || s.branch || s.storeName);
            }
            return String(s || '');
          }).filter(Boolean)
        : [];
      const unique = ['All Branches', ...new Set(branchList)];
      setBranches(unique);

      if (!selectedBranch) {
        setSelectedBranch('All Branches');
      }
    } catch (e) {
      console.warn('Error loading branches:', e.message);
    }
  };

  // Load Employees
  const loadEmployeesForBranch = async (branch) => {
    try {
      setLoadingEmployees(true);
      let url = '/employees?isActive=true&light=true&limit=2000';
      if (branch && branch !== 'All Branches') {
        url += `&branch=${encodeURIComponent(branch)}`;
      }
      const res = await api.get(url);
      const list = res?.data || res || [];
      if (Array.isArray(list)) {
        const activeList = list.filter(e => {
          const st = String(e.status || '').toLowerCase();
          return st !== 'resign' && st !== 'import';
        });
        setAllEmployees(activeList);

        if (initialEmployee && !selectedEmployee) {
          const match = activeList.find(e => e._id === initialEmployee._id || e.id === initialEmployee.id);
          if (match) selectEmployee(match);
        }
      }
    } catch (e) {
      console.warn('Error loading employees:', e.message);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Load Advances List from Backend MongoDB
  const loadAdvancesForBranch = async (branch) => {
    try {
      setLoadingAdvances(true);
      let query = '?limit=1000';
      if (branch && branch !== 'All Branches') {
        query += `&branch=${encodeURIComponent(branch)}`;
      }
      const res = await api.getEmployeeAdvances(query);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setAdvancesList(list);
    } catch (e) {
      console.warn('Error loading advances list:', e.message);
    } finally {
      setLoadingAdvances(false);
      setRefreshingList(false);
    }
  };

  // Select an Employee
  const selectEmployee = (emp) => {
    Keyboard.dismiss();
    setSelectedEmployee(emp);
    setIsEmployeeModalVisible(false);
    setBasicSalary(emp.basicSalary || emp.perMonth || 0);
  };

  // Load Employee Balances (Mirroring Web ERP loadEmployeeBalance logic)
  const loadEmployeeBalances = async (emp, curDateStr) => {
    if (!emp?._id && !emp?.id) return;
    const empId = emp._id || emp.id;
    try {
      setLoadingBalances(true);
      const res = await api.getEmployeeAdvances(`?employee=${empId}`);
      const advs = res?.data || (Array.isArray(res) ? res : []);

      // Sort in temporal order
      advs.sort((a, b) => {
        const t1 = new Date(a.date).getTime();
        const t2 = new Date(b.date).getTime();
        if (t1 !== t2) return t1 - t2;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const selectedDate = curDateStr ? new Date(curDateStr) : new Date();
      const sYear = selectedDate.getFullYear();
      const sMonth = selectedDate.getMonth() + 1;
      const selMonthPrefix = `${sYear}-${sMonth.toString().padStart(2, '0')}`;

      // 1. Calculate Pre Month Balance (Closing balance of all prior months)
      const prevMonthAdvs = advs.filter(a => {
        const d = new Date(a.date);
        const aYear = d.getFullYear();
        const aMonth = d.getMonth() + 1;
        const aMonthPrefix = `${aYear}-${aMonth.toString().padStart(2, '0')}`;
        return aMonthPrefix < selMonthPrefix;
      });

      let calculatedPreBal = parseFloat(emp.opening || 0);
      prevMonthAdvs.forEach(a => {
        const amt = parseFloat(a.paid) || 0;
        if (a.transactionType === 'Received') {
          calculatedPreBal -= amt;
        } else {
          calculatedPreBal += amt;
        }
      });
      setPreMonthBal(calculatedPreBal);

      // 2. Calculate Current Month Balance
      const currentMonthHistory = advs.filter(a => {
        const d = new Date(a.date);
        const aYear = d.getFullYear();
        const aMonth = d.getMonth() + 1;
        const aMonthPrefix = `${aYear}-${aMonth.toString().padStart(2, '0')}`;
        const isSameMonth = aMonthPrefix === selMonthPrefix;
        const isOtherRecord = editingAdvanceId ? (a._id !== editingAdvanceId) : true;
        return isSameMonth && isOtherRecord;
      });

      let calculatedCurBal = 0;
      currentMonthHistory.forEach(a => {
        const amt = parseFloat(a.paid) || 0;
        if (a.transactionType === 'Received') {
          calculatedCurBal -= amt;
        } else {
          calculatedCurBal += amt;
        }
      });
      setCurrentMonthBal(calculatedCurBal);

      const total = calculatedPreBal + calculatedCurBal;
      setTotalLiability(total);

      // Initial projected balance
      const enteredAmt = parseFloat(paidAmount) || 0;
      setProjectedBalance(transactionType === 'Received' ? total - enteredAmt : total + enteredAmt);
    } catch (e) {
      console.warn('Error loading employee balance:', e.message);
    } finally {
      setLoadingBalances(false);
    }
  };

  // Clear Form
  const handleClearForm = () => {
    setEditingAdvanceId(null);
    setAdvanceDate(todayStr);
    setTransactionType('Pay');
    setDocMode('Cash');
    setPaidAmount('0');
    setRemarks('');
    if (selectedEmployee) {
      loadEmployeeBalances(selectedEmployee, todayStr);
    }
  };

  // --- Bilal Shah Password Security Verification Flow ---
  const requestBilalShahAuth = (type, title, callback, record = null) => {
    setPendingAction({ type, title, run: callback });
    setPendingRecord(record);
    setAuthError('');
    setAuthPassword('');
    setShowAuthPassword(false);
    setAuthStatusText('');
    setAuthModalVisible(true);
  };

  const handleConfirmAuth = async () => {
    if (!authPassword.trim()) {
      setAuthError('Please enter security password');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthStatusText('Verifying authorization...');
      setAuthError('');

      const res = await api.verifyAdminCredentials(authUsername.trim(), authPassword.trim());

      const token = res?.token || res?.data?.token;
      const user = res?.user || res?.data?.user;

      if (!token && !res?.success) {
        throw new Error(res?.message || 'Authentication failed. Valid credentials required.');
      }

      setAuthStatusText('Authorized successfully!');
      setTimeout(async () => {
        setAuthModalVisible(false);
        setAuthLoading(false);
        if (pendingAction?.run) {
          try {
            await pendingAction.run(token, user);
          } catch (actionErr) {
            console.error('Error executing authorized action:', actionErr);
            Alert.alert('Operation Error', actionErr.message || 'Action failed after authorization');
          }
        }
      }, 400);
    } catch (err) {
      setAuthLoading(false);
      const msg = err.response?.data?.message || err.message || 'Invalid username or password';
      setAuthError(msg);
    }
  };

  // Save Advance (Pay / Recovery)
  const handleSaveAdvance = async () => {
    if (!selectedEmployee) {
      Alert.alert('Required', 'Please select an employee first.');
      return;
    }
    const amt = parseFloat(paidAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid advance amount greater than 0.');
      return;
    }

    const payload = {
      employee: selectedEmployee._id || selectedEmployee.id,
      branch: selectedBranch !== 'All Branches' ? selectedBranch : selectedEmployee.branch,
      department: selectedEmployee.department?._id || selectedEmployee.department || null,
      date: advanceDate,
      paid: amt,
      transactionType,
      docMode,
      remarks: remarks.trim(),
      preMonthBal,
      currentMonthBal,
      total: totalLiability,
      balance: projectedBalance
    };

    try {
      setLoading(true);
      let savedAdv = null;
      if (editingAdvanceId) {
        const updateRes = await api.updateEmployeeAdvance(editingAdvanceId, payload);
        savedAdv = updateRes?.data || payload;
        Alert.alert('Updated', 'Advance entry has been updated successfully!');
      } else {
        const createRes = await api.createEmployeeAdvance(payload);
        savedAdv = createRes?.data || payload;
        Alert.alert(
          'Saved Successfully',
          `${transactionType === 'Pay' ? 'Advance of' : 'Recovery of'} Rs ${formatNum(amt)} recorded for ${selectedEmployee.name}.`,
          [
            { text: 'OK', onPress: () => {} },
            { text: '🖨️ Print Slip', onPress: () => handlePrintAdvanceSlip(savedAdv) },
            { text: '💬 WhatsApp', onPress: () => handleShareWhatsAppSlip(savedAdv) }
          ]
        );
      }
      handleClearForm();
      loadAdvancesForBranch(selectedBranch);
      setActiveTab('list');
    } catch (err) {
      console.error('Error saving advance:', err);
      Alert.alert('Save Failed', err.message || 'Could not save employee advance.');
    } finally {
      setLoading(false);
    }
  };

  // Edit an advance from list
  const handleEditAdvance = (adv) => {
    const empName = getSafeString(adv.employee?.name, 'Staff');
    const amt = formatNum(adv.paid);
    requestBilalShahAuth('edit', `Authorize Edit Advance: ${empName} (Rs ${amt})`, () => {
      setEditingAdvanceId(adv._id);
      setAdvanceDate(formatDate(adv.date));
      setTransactionType(adv.transactionType || 'Pay');
      setDocMode(adv.docMode || 'Cash');
      setPaidAmount(String(adv.paid || 0));
      setRemarks(adv.remarks || '');

      if (adv.employee) {
        const empObj = typeof adv.employee === 'object' ? adv.employee : allEmployees.find(e => e._id === adv.employee);
        if (empObj) {
          setSelectedEmployee(empObj);
          setBasicSalary(empObj.basicSalary || empObj.perMonth || 0);
        }
      }
      setActiveTab('entry');
    }, adv);
  };

  // Delete Advance
  const handleDeleteAdvance = (adv) => {
    const empName = getSafeString(adv.employee?.name, 'Employee');
    const amt = formatNum(adv.paid);
    requestBilalShahAuth('delete', `Authorize Delete Advance: ${empName} (Rs ${amt})`, async (adminToken) => {
      await api.deleteEmployeeAdvance(adv._id, adminToken);
      Alert.alert('Deleted', 'Advance record has been permanently deleted from database.');
      loadAdvancesForBranch(selectedBranch);
      if (selectedEmployee) {
        loadEmployeeBalances(selectedEmployee, advanceDate);
      }
    }, adv);
  };

  // Open Installment Plan Modal / View for Employee
  const handleOpenInstallmentModal = async (emp = null, advRecord = null) => {
    const rawEmp = emp || advRecord?.employee || selectedEmployee;
    const empId = rawEmp?._id || rawEmp?.id || (typeof rawEmp === 'string' ? rawEmp : null) || selectedEmployee?._id;
    if (!empId) {
      Alert.alert('Employee Required', 'Please select an employee first to manage their installment plan.');
      return;
    }

    let fullEmp = allEmployees.find(e =>
      String(e._id) === String(empId) ||
      String(e.id) === String(empId) ||
      String(e.code) === String(rawEmp?.code || advRecord?.code || '')
    ) || (typeof rawEmp === 'object' && rawEmp !== null ? rawEmp : null) || selectedEmployee;

    setSelectedEmployee(fullEmp);
    setIsInstallmentModalVisible(true);
    setLoadingInstallment(true);

    if (advRecord) {
      const initPre = parseFloat(advRecord.preMonthBal !== undefined ? advRecord.preMonthBal : (advRecord.total || 0));
      const initCur = parseFloat(advRecord.currentMonthBal !== undefined ? advRecord.currentMonthBal : (advRecord.paid || 0));
      if (!isNaN(initPre) && initPre > 0) {
        setInstPreBal1(initPre);
        setInstInstallment1(String(initPre));
      }
      if (!isNaN(initCur) && initCur > 0) {
        setInstPreBal2(initCur);
        setInstInstallment2(String(initCur));
      }
    }

    try {
      let empOpening = parseFloat(fullEmp?.opening || rawEmp?.opening || 0);
      if (isNaN(empOpening) || empOpening === 0) {
        try {
          const empDetailRes = await api.get(`/employees/${empId}`);
          if (empDetailRes?.data?.opening !== undefined) {
            empOpening = parseFloat(empDetailRes.data.opening || 0);
            fullEmp = { ...fullEmp, ...empDetailRes.data };
            setSelectedEmployee(fullEmp);
          }
        } catch (_) {}
      }

      const advRes = await api.getEmployeeAdvances(`?employee=${empId}&limit=1000`);
      const advs = advRes?.data || (Array.isArray(advRes) ? advRes : []);

      advs.sort((a, b) => {
        const t1 = new Date(a.date).getTime();
        const t2 = new Date(b.date).getTime();
        if (t1 !== t2) return t1 - t2;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const selectedDate = advanceDate ? new Date(advanceDate) : new Date();
      const sYear = selectedDate.getFullYear();
      const sMonth = selectedDate.getMonth() + 1;
      const selMonthPrefix = `${sYear}-${sMonth.toString().padStart(2, '0')}`;

      // Calculate Pre Bal
      let calcPreBal = parseFloat(empOpening || 0);
      const prevMonthAdvs = advs.filter(a => {
        const d = new Date(a.date);
        const aMonthPrefix = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        return aMonthPrefix < selMonthPrefix;
      });
      prevMonthAdvs.forEach(a => {
        const amt = parseFloat(a.paid) || 0;
        const isPay = (a.transactionType || '').toLowerCase() === 'pay';
        if (isPay) calcPreBal += amt;
        else calcPreBal -= amt;
      });

      // Calculate Current Bal
      const currentMonthHistory = advs.filter(a => {
        const d = new Date(a.date);
        const aMonthPrefix = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        return aMonthPrefix === selMonthPrefix;
      });
      let calcCurBal = 0;
      currentMonthHistory.forEach(a => {
        const amt = parseFloat(a.paid) || 0;
        const isPay = (a.transactionType || '').toLowerCase() === 'pay';
        if (isPay) calcCurBal += amt;
        else calcCurBal -= amt;
      });

      if (advs.length === 0 && advRecord) {
        if (advRecord.preMonthBal !== undefined) calcPreBal = parseFloat(advRecord.preMonthBal) || 0;
        if (advRecord.currentMonthBal !== undefined) calcCurBal = parseFloat(advRecord.currentMonthBal) || 0;
        if (calcPreBal === 0 && calcCurBal === 0 && advRecord.paid) calcCurBal = parseFloat(advRecord.paid) || 0;
      }

      setPreMonthBal(calcPreBal);
      setCurrentMonthBal(calcCurBal);
      setTotalLiability(calcPreBal + calcCurBal);

      setInstPreBal1(calcPreBal);
      setInstPreBal2(calcCurBal);

      // Fetch saved installment plan from backend
      const planRes = await api.getInstallmentPlan(empId, advanceDate);
      const planData = planRes?.data || {};

      let inst1 = planData?.preMonthInstallment?.installment;
      let inst2 = planData?.currentMonthInstallment?.installment;

      if (inst1 === undefined || inst1 === null) inst1 = calcPreBal;
      if (inst2 === undefined || inst2 === null) inst2 = calcCurBal;

      inst1 = Math.max(0, Math.min(Number(inst1) || 0, calcPreBal));
      inst2 = Math.max(0, Math.min(Number(inst2) || 0, calcCurBal));

      setInstInstallment1(String(inst1));
      setInstRemainingBal1(Math.max(0, calcPreBal - inst1));

      setInstInstallment2(String(inst2));
      setInstRemainingBal2(Math.max(0, calcCurBal - inst2));
    } catch (e) {
      console.warn('Error loading installment plan:', e.message);
    } finally {
      setLoadingInstallment(false);
    }
  };

  const handleInst1Change = (val) => {
    setInstInstallment1(val);
    const inst = parseFloat(val) || 0;
    const capped = Math.min(inst, instPreBal1);
    setInstRemainingBal1(Math.max(0, instPreBal1 - capped));
  };

  const handleInst2Change = (val) => {
    setInstInstallment2(val);
    const inst = parseFloat(val) || 0;
    const capped = Math.min(inst, instPreBal2);
    setInstRemainingBal2(Math.max(0, instPreBal2 - capped));
  };

  const handleSaveInstallmentPlan = () => {
    if (!selectedEmployee?._id && !selectedEmployee?.id) {
      Alert.alert('Required', 'Please select an employee first.');
      return;
    }

    const inst1 = Math.min(parseFloat(instInstallment1) || 0, instPreBal1);
    const inst2 = Math.min(parseFloat(instInstallment2) || 0, instPreBal2);

    const payload = {
      employee: selectedEmployee._id || selectedEmployee.id,
      branch: selectedBranch !== 'All Branches' ? selectedBranch : selectedEmployee.branch,
      date: advanceDate,
      preMonthInstallment: {
        preBal: instPreBal1,
        installment: inst1,
        balance: instRemainingBal1
      },
      currentMonthInstallment: {
        preBal: instPreBal2,
        installment: inst2,
        balance: instRemainingBal2
      }
    };

    requestBilalShahAuth('installment', 'Save Advance Monthly Installment Plan', async (adminToken) => {
      await api.saveInstallmentPlan(payload, adminToken);
      setIsInstallmentModalVisible(false);
      Alert.alert(
        'Installment Plan Saved',
        `Monthly deduction of Rs ${formatNum(inst1 + inst2)} has been saved and will sync automatically with employee's payroll slip.`
      );
    });
  };

  // --- Print & WhatsApp Slip Handlers ---
  const handlePrintAdvanceSlip = async (adv) => {
    try {
      const html = generateAdvanceSlipHtml(adv);
      await Print.printAsync({ html });
    } catch (err) {
      Alert.alert('Print Error', err.message || 'Could not trigger print dialog');
    }
  };

  const handleShareWhatsAppSlip = async (adv) => {
    const empName = getSafeString(adv.employee?.name, 'Staff Member');
    const empCode = getSafeString(adv.employee?.code || adv.code, 'N/A');
    const deptName = getAdvanceDeptName(adv);
    const branchName = getSafeString(adv.branch || adv.employee?.branch, 'Store');
    const dateStr = formatDate(adv.date);
    const isPay = (adv.transactionType || 'Pay') === 'Pay';
    const amount = Number(adv.paid || 0);
    const preBal = Number(adv.total || adv.preMonthBal || 0);
    const closeBal = Number(adv.balance !== undefined ? adv.balance : (isPay ? preBal + amount : preBal - amount));

    const slipMsg =
`*DWATSON / BAS ERP*
*${isPay ? '💸 EMPLOYEE ADVANCE PAYMENT SLIP' : '📥 ADVANCE RECOVERY RECEIPT'}*
━━━━━━━━━━━━━━━━━━━━
📅 *Date:* ${dateStr}
👤 *Employee:* ${empName} (Code: ${empCode})
🏢 *Branch:* ${branchName}
🏬 *Dept:* ${deptName}
────────────────────
💰 *${isPay ? 'Advance Paid' : 'Amount Recovered'}:* Rs ${formatNum(amount)}
📊 *Pre Balance:* Rs ${formatNum(preBal)}
🔴 *Closing Balance:* Rs ${formatNum(closeBal)}
💳 *Payment Mode:* ${adv.docMode || 'Cash'}
📝 *Remarks:* ${adv.remarks || 'Official Advance'}
━━━━━━━━━━━━━━━━━━━━
✅ *Authorized by:* Bilal Shah
_Computer generated voucher • Central ERP System_`;

    try {
      const url = `whatsapp://send?text=${encodeURIComponent(slipMsg)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: slipMsg, title: 'Employee Advance Slip' });
      }
    } catch {
      await Share.share({ message: slipMsg, title: 'Employee Advance Slip' });
    }
  };

  // Available departments list
  const availableDepartments = useMemo(() => {
    const set = new Set();
    advancesList.forEach(a => {
      const d = getAdvanceDeptName(a);
      if (d && d !== 'N/A') set.add(d);
    });
    allEmployees.forEach(e => {
      const d = e.department?.name || e.department;
      if (d && typeof d === 'string' && d !== 'N/A') set.add(d);
      else if (d && typeof d === 'object' && d.name) set.add(d.name);
    });
    return ['All Departments', ...Array.from(set).sort()];
  }, [advancesList, allEmployees]);

  const currentMonthKey = getCurrentMonthKey();
  const preMonthKey = getPreMonthKey(currentMonthKey);

  // Filtered advances for List Tab (Filtered by Branch, Dept, and Month Filter)
  const filteredAdvances = useMemo(() => {
    return advancesList.filter(adv => {
      const q = listSearchText.trim().toLowerCase();
      const empName = getSafeString(adv.employee?.name).toLowerCase();
      const empCode = String(adv.employee?.code || adv.code || '').toLowerCase();
      const rem = String(adv.remarks || '').toLowerCase();

      const matchesSearch = !q || empName.includes(q) || empCode.includes(q) || rem.includes(q);
      const matchesType = listFilterType === 'All' || adv.transactionType === listFilterType;

      // Branch filter
      const isAllBranch = !selectedBranch || selectedBranch === 'All Branches';
      const advBranch = String(adv.branch || adv.employee?.branch || '').toLowerCase().trim();
      const targetBranch = String(selectedBranch || '').toLowerCase().trim();
      const matchesBranch = isAllBranch || advBranch.includes(targetBranch) || targetBranch.includes(advBranch);

      // Dept filter
      const isAllDept = !selectedDepartment || selectedDepartment === 'All Departments';
      const advDept = getAdvanceDeptName(adv).toLowerCase().trim();
      const targetDept = String(selectedDepartment || '').toLowerCase().trim();
      const matchesDept = isAllDept || advDept === targetDept;

      // Month filter
      let matchesMonth = true;
      const advDateStr = formatDate(adv.date);
      const advMonthKey = advDateStr ? advDateStr.substring(0, 7) : '';

      if (listMonthFilter === 'current') {
        matchesMonth = advMonthKey === currentMonthKey;
      } else if (listMonthFilter === 'pre') {
        matchesMonth = advMonthKey === preMonthKey;
      } else if (listMonthFilter === 'custom') {
        matchesMonth = advMonthKey === listSelectedMonthKey;
      } else if (listMonthFilter === 'all') {
        matchesMonth = true;
      }

      return matchesSearch && matchesType && matchesBranch && matchesDept && matchesMonth;
    });
  }, [advancesList, listSearchText, listFilterType, selectedBranch, selectedDepartment, listMonthFilter, listSelectedMonthKey, currentMonthKey, preMonthKey]);

  // List View Summary Stats
  const listStats = useMemo(() => {
    let paid = 0;
    let rec = 0;
    const staffSet = new Set();
    filteredAdvances.forEach(a => {
      const amt = parseFloat(a.paid) || 0;
      if (a.transactionType === 'Received') {
        rec += amt;
      } else {
        paid += amt;
      }
      if (a.employee?._id || a.employee?.id) staffSet.add(String(a.employee._id || a.employee.id));
    });
    return {
      paid,
      rec,
      net: paid - rec,
      staffCount: staffSet.size,
      count: filteredAdvances.length
    };
  }, [filteredAdvances]);

  // Filtered Advances for Audit Tab (scoped by auditMonthFilter)
  const auditAdvances = useMemo(() => {
    if (auditMonthFilter === 'all') return advancesList;
    return advancesList.filter(adv => {
      const advDateStr = formatDate(adv.date);
      const advMonthKey = advDateStr ? advDateStr.substring(0, 7) : '';
      if (auditMonthFilter === 'current') return advMonthKey === currentMonthKey;
      if (auditMonthFilter === 'pre') return advMonthKey === preMonthKey;
      return true;
    });
  }, [advancesList, auditMonthFilter, currentMonthKey, preMonthKey]);

  // Enterprise Totals for Audit Tab
  const auditEnterpriseTotals = useMemo(() => {
    let paid = 0;
    let rec = 0;
    const staffSet = new Set();
    auditAdvances.forEach(a => {
      const amt = parseFloat(a.paid) || 0;
      if (a.transactionType === 'Received') {
        rec += amt;
      } else {
        paid += amt;
      }
      if (a.employee?._id || a.employee?.id) staffSet.add(String(a.employee._id || a.employee.id));
    });
    return {
      totalPaid: paid,
      totalReceived: rec,
      netBalance: paid - rec,
      totalStaff: staffSet.size,
      totalRecords: auditAdvances.length
    };
  }, [auditAdvances]);

  // Branch Advance Stats for Audit Tab
  const branchAdvanceStats = useMemo(() => {
    const statsMap = {};
    branches.forEach(b => {
      if (b && b !== 'All Branches') {
        statsMap[b] = {
          branch: b,
          totalPaid: 0,
          totalReceived: 0,
          netBalance: 0,
          transactionsCount: 0,
          employees: {}
        };
      }
    });

    auditAdvances.forEach(adv => {
      const rawBranch = String(adv.branch || adv.employee?.branch || 'Main Branch').trim().replace(/[()]/g, '');
      const bKey = rawBranch || 'Main Branch';
      if (!statsMap[bKey]) {
        statsMap[bKey] = {
          branch: bKey,
          totalPaid: 0,
          totalReceived: 0,
          netBalance: 0,
          transactionsCount: 0,
          employees: {}
        };
      }
      const amt = parseFloat(adv.paid) || 0;
      if (adv.transactionType === 'Received') {
        statsMap[bKey].totalReceived += amt;
        statsMap[bKey].netBalance -= amt;
      } else {
        statsMap[bKey].totalPaid += amt;
        statsMap[bKey].netBalance += amt;
      }
      statsMap[bKey].transactionsCount += 1;

      const empId = adv.employee?._id || adv.employee?.id || adv.employee || adv.code;
      if (empId) {
        if (!statsMap[bKey].employees[empId]) {
          statsMap[bKey].employees[empId] = {
            id: empId,
            name: getSafeString(adv.employee?.name, 'Staff'),
            code: getSafeString(adv.employee?.code || adv.code, 'N/A'),
            designation: getSafeString(adv.employee?.designation, 'Staff'),
            department: getAdvanceDeptName(adv),
            totalPaid: 0,
            totalReceived: 0,
            balance: 0
          };
        }
        if (adv.transactionType === 'Received') {
          statsMap[bKey].employees[empId].totalReceived += amt;
          statsMap[bKey].employees[empId].balance -= amt;
        } else {
          statsMap[bKey].employees[empId].totalPaid += amt;
          statsMap[bKey].employees[empId].balance += amt;
        }
      }
    });

    const list = Object.values(statsMap).map(s => {
      const emps = Object.values(s.employees);
      return {
        branch: s.branch,
        totalPaid: s.totalPaid,
        totalReceived: s.totalReceived,
        netBalance: s.netBalance,
        transactionsCount: s.transactionsCount,
        empCount: emps.length,
        employees: emps.sort((a, b) => b.balance - a.balance)
      };
    });
    return list.sort((a, b) => b.totalPaid - a.totalPaid);
  }, [auditAdvances, branches]);

  // Dept Advance Stats for Audit Tab
  const deptAdvanceStats = useMemo(() => {
    const statsMap = {};
    auditAdvances.forEach(adv => {
      const dKey = getAdvanceDeptName(adv);
      if (!statsMap[dKey]) {
        statsMap[dKey] = {
          department: dKey,
          totalPaid: 0,
          totalReceived: 0,
          netBalance: 0,
          transactionsCount: 0,
          employees: {}
        };
      }
      const amt = parseFloat(adv.paid) || 0;
      if (adv.transactionType === 'Received') {
        statsMap[dKey].totalReceived += amt;
        statsMap[dKey].netBalance -= amt;
      } else {
        statsMap[dKey].totalPaid += amt;
        statsMap[dKey].netBalance += amt;
      }
      statsMap[dKey].transactionsCount += 1;

      const empId = adv.employee?._id || adv.employee?.id || adv.employee || adv.code;
      if (empId) {
        if (!statsMap[dKey].employees[empId]) {
          statsMap[dKey].employees[empId] = {
            id: empId,
            name: getSafeString(adv.employee?.name, 'Staff'),
            code: getSafeString(adv.employee?.code || adv.code, 'N/A'),
            branch: getSafeString(adv.branch || adv.employee?.branch, 'Store'),
            designation: getSafeString(adv.employee?.designation, 'Staff'),
            totalPaid: 0,
            totalReceived: 0,
            balance: 0
          };
        }
        if (adv.transactionType === 'Received') {
          statsMap[dKey].employees[empId].totalReceived += amt;
          statsMap[dKey].employees[empId].balance -= amt;
        } else {
          statsMap[dKey].employees[empId].totalPaid += amt;
          statsMap[dKey].employees[empId].balance += amt;
        }
      }
    });

    const list = Object.values(statsMap).map(s => {
      const emps = Object.values(s.employees);
      return {
        department: s.department,
        totalPaid: s.totalPaid,
        totalReceived: s.totalReceived,
        netBalance: s.netBalance,
        transactionsCount: s.transactionsCount,
        empCount: emps.length,
        employees: emps.sort((a, b) => b.balance - a.balance)
      };
    });
    return list.sort((a, b) => b.totalPaid - a.totalPaid);
  }, [auditAdvances]);

  const filteredBranchAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return branchAdvanceStats;
    return branchAdvanceStats.filter(s => s.branch.toLowerCase().includes(q));
  }, [branchAdvanceStats, auditSearch]);

  const filteredDeptAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return deptAdvanceStats;
    return deptAdvanceStats.filter(s => s.department.toLowerCase().includes(q));
  }, [deptAdvanceStats, auditSearch]);

  // Search filtered employees for picker modal
  const modalFilteredEmployees = useMemo(() => {
    const q = employeeSearchText.trim().toLowerCase();
    if (!q) return allEmployees;
    return allEmployees.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      String(e.code || '').toLowerCase().includes(q)
    );
  }, [allEmployees, employeeSearchText]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack || (() => navigation?.goBack?.())}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Advance Manager</Text>
          <Text style={styles.headerSubtitle}>Official ERP Balance Parity • 0.01 Match</Text>
        </View>
        <TouchableOpacity
          style={styles.headerRightAction}
          onPress={() => loadAdvancesForBranch(selectedBranch)}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={17} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      {/* Mode Switcher Tabs (4 Clear Navigation Cards) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'entry' && styles.tabBtnActive]}
          onPress={() => setActiveTab('entry')}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={15} color={activeTab === 'entry' ? '#38BDF8' : '#94A3B8'} style={{ marginRight: 4 }} />
          <Text style={[styles.tabBtnText, activeTab === 'entry' && styles.tabBtnTextActive]}>
            {editingAdvanceId ? '✏️ Modify' : '➕ Pay'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          onPress={() => setActiveTab('list')}
          activeOpacity={0.7}
        >
          <Ionicons name="list" size={15} color={activeTab === 'list' ? '#38BDF8' : '#94A3B8'} style={{ marginRight: 4 }} />
          <Text style={[styles.tabBtnText, activeTab === 'list' && styles.tabBtnTextActive]}>
            List ({filteredAdvances.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'audit' && styles.tabBtnActive]}
          onPress={() => setActiveTab('audit')}
          activeOpacity={0.7}
        >
          <Ionicons name="pie-chart" size={15} color={activeTab === 'audit' ? '#38BDF8' : '#94A3B8'} style={{ marginRight: 4 }} />
          <Text style={[styles.tabBtnText, activeTab === 'audit' && styles.tabBtnTextActive]}>
            Audit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'installment' && styles.tabBtnActive]}
          onPress={() => {
            if (selectedEmployee) {
              handleOpenInstallmentModal(selectedEmployee);
            } else {
              setActiveTab('installment');
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar" size={15} color={activeTab === 'installment' ? '#38BDF8' : '#94A3B8'} style={{ marginRight: 4 }} />
          <Text style={[styles.tabBtnText, activeTab === 'installment' && styles.tabBtnTextActive]}>
            Installment
          </Text>
        </TouchableOpacity>
      </View>

      {/* ============================================================== */}
      {/* TAB 1: GIVE / PAY ADVANCE (Section-Defined: Employee Register Style) */}
      {/* ============================================================== */}
      {activeTab === 'entry' && (
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Form Banner */}
          <View style={styles.formBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formBannerTitle}>
                {editingAdvanceId ? `Modify Advance: ${selectedEmployee?.name || 'Staff'}` : 'Give Employee Advance'}
              </Text>
              <Text style={styles.formBannerSub}>
                {editingAdvanceId
                  ? 'Update advance transaction with Bilal Shah security verification'
                  : 'Record advance payment or cash recovery with instant balance calculation'}
              </Text>
            </View>
            {editingAdvanceId && (
              <TouchableOpacity style={styles.cancelEditBtn} onPress={handleClearForm}>
                <Ionicons name="add" size={13} color="#FFFFFF" />
                <Text style={styles.cancelEditText}>New Entry</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SECTION 1: EMPLOYEE & PLACEMENT (Cyan Top Border) */}
          <View style={[styles.sectionCard, { borderTopColor: '#38BDF8' }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.18)' }]}>
                <Ionicons name="person" size={16} color="#38BDF8" />
              </View>
              <Text style={styles.sectionHeading}>1. Employee Information</Text>
              {selectedEmployee && (
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>CODE: {selectedEmployee.code || 'N/A'}</Text>
                </View>
              )}
            </View>

            {/* Store Branch Selection */}
            <View style={{ marginBottom: 12 }}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Assigned Branch (Store)</Text>
                <TouchableOpacity onPress={() => setIsBranchModalVisible(true)}>
                  <Text style={styles.fieldChangeLink}>Change ▾</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPillsScroll}>
                {branches.map((b, idx) => {
                  const isSel = (selectedBranch === b) || (!selectedBranch && b === 'All Branches');
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.quickPill, isSel && styles.quickPillActiveBranch]}
                      onPress={() => setSelectedBranch(b)}
                    >
                      <Text style={[styles.quickPillText, isSel && styles.quickPillTextActive]}>{b}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Selected Employee Card */}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>Selected Staff Member *</Text>
              <TouchableOpacity
                style={styles.empSelectCard}
                onPress={() => {
                  setEmployeeSearchText('');
                  setIsEmployeeModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.empAvatarCircle}>
                  <Text style={styles.empAvatarText}>
                    {selectedEmployee ? (getSafeString(selectedEmployee.name, 'E')).substring(0, 1).toUpperCase() : '?'}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.empSelectName} numberOfLines={1}>
                    {selectedEmployee ? selectedEmployee.name : 'Click to Select Employee...'}
                  </Text>
                  <Text style={styles.empSelectSub}>
                    {selectedEmployee
                      ? `Code: ${selectedEmployee.code || 'N/A'} • ${getSafeString(selectedEmployee.branch, 'Store')} • ${getSafeString(selectedEmployee.designation, 'Staff')}`
                      : 'Tap to choose staff member from branch roster'}
                  </Text>
                </View>
                <View style={styles.empSelectActionBtn}>
                  <Text style={styles.empSelectActionText}>Choose</Text>
                  <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Transaction Date */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldCol}>
                <Text style={styles.fieldLabel}>Transaction Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  value={advanceDate}
                  onChangeText={setAdvanceDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                />
              </View>
              <TouchableOpacity
                style={styles.todayResetBtn}
                onPress={() => setAdvanceDate(todayStr)}
              >
                <Ionicons name="calendar-outline" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                <Text style={styles.todayResetText}>Today</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SECTION 2: LIVE FINANCIAL BALANCES (Emerald Top Border) */}
          <View style={[styles.sectionCard, { borderTopColor: '#10B981' }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
                <Ionicons name="analytics" size={16} color="#10B981" />
              </View>
              <Text style={styles.sectionHeading}>2. Live Ledger Balances</Text>
              {loadingBalances && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ActivityIndicator size="small" color="#10B981" />
                  <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>SYNCING</Text>
                </View>
              )}
            </View>

            {/* Balances 2x2 Grid */}
            <View style={styles.balancesGrid}>
              <View style={styles.balanceGridCol}>
                <Text style={styles.balanceGridLabel}>Basic Salary</Text>
                <Text style={[styles.balanceGridValue, { color: '#38BDF8' }]}>
                  Rs {formatNum(basicSalary)}
                </Text>
                <Text style={styles.balanceGridSub}>Per month wage</Text>
              </View>

              <View style={styles.balanceGridCol}>
                <Text style={styles.balanceGridLabel}>Pre-Month Balance</Text>
                <Text style={[styles.balanceGridValue, { color: '#F59E0B' }]}>
                  Rs {formatNum(preMonthBal)}
                </Text>
                <Text style={styles.balanceGridSub}>All prior months balance</Text>
              </View>

              <View style={styles.balanceGridCol}>
                <Text style={styles.balanceGridLabel}>Current Month Advance</Text>
                <Text style={[styles.balanceGridValue, { color: '#A78BFA' }]}>
                  Rs {formatNum(currentMonthBal)}
                </Text>
                <Text style={styles.balanceGridSub}>This month's advance</Text>
              </View>

              <View style={[styles.balanceGridCol, styles.balanceGridColTotal]}>
                <Text style={[styles.balanceGridLabel, { color: '#EF4444' }]}>Total Liability</Text>
                <Text style={[styles.balanceGridValue, { color: '#EF4444', fontSize: 16 }]}>
                  Rs {formatNum(totalLiability)}
                </Text>
                <Text style={styles.balanceGridSub}>Pre + Current Month</Text>
              </View>
            </View>
          </View>

          {/* SECTION 3: TRANSACTION & PAYMENT DETAILS (Amber Top Border) */}
          <View style={[styles.sectionCard, { borderTopColor: '#F59E0B' }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
                <Ionicons name="card" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.sectionHeading}>3. Transaction & Payment Details</Text>
            </View>

            {/* Transaction Type: Pay vs Recovery */}
            <Text style={styles.fieldLabel}>Transaction Type</Text>
            <View style={styles.transTypeRow}>
              <TouchableOpacity
                style={[styles.transTypeBtn, transactionType === 'Pay' && styles.transTypeBtnActivePay]}
                onPress={() => setTransactionType('Pay')}
              >
                <Ionicons
                  name="arrow-up-circle"
                  size={16}
                  color={transactionType === 'Pay' ? '#FFFFFF' : '#10B981'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.transTypeBtnText, transactionType === 'Pay' && styles.transTypeBtnTextActive]}>
                  💸 Give Advance (Pay)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.transTypeBtn, transactionType === 'Received' && styles.transTypeBtnActiveRec]}
                onPress={() => setTransactionType('Received')}
              >
                <Ionicons
                  name="arrow-down-circle"
                  size={16}
                  color={transactionType === 'Received' ? '#FFFFFF' : '#F59E0B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.transTypeBtnText, transactionType === 'Received' && styles.transTypeBtnTextActive]}>
                  📥 Recovery (Received)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Advance Amount Hero Input */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>
                {transactionType === 'Pay' ? 'Advance Amount Given (Rs) *' : 'Recovery Amount (Rs) *'}
              </Text>
              <View style={styles.heroInputBox}>
                <Text style={styles.heroInputCurrency}>Rs</Text>
                <TextInput
                  style={styles.heroInputField}
                  value={paidAmount}
                  keyboardType="numeric"
                  onChangeText={setPaidAmount}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  selectTextOnFocus
                />
              </View>
            </View>

            {/* Payment Mode: Cash vs Bank */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.pillRow}>
                <TouchableOpacity
                  style={[styles.pillSelect, docMode === 'Cash' && styles.pillSelectActive]}
                  onPress={() => setDocMode('Cash')}
                >
                  <Text style={[styles.pillSelectText, docMode === 'Cash' && styles.pillSelectTextActive]}>
                    💵 Cash Payment
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pillSelect, docMode === 'Bank' && styles.pillSelectActive]}
                  onPress={() => setDocMode('Bank')}
                >
                  <Text style={[styles.pillSelectText, docMode === 'Bank' && styles.pillSelectTextActive]}>
                    🏦 Bank Transfer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Remarks / Purpose */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Remarks / Reason for Advance</Text>
              <TextInput
                style={[styles.textInput, { height: 42 }]}
                value={remarks}
                onChangeText={setRemarks}
                placeholder="e.g. Festival advance, medical emergency, household..."
                placeholderTextColor="#64748B"
              />
            </View>
          </View>

          {/* SECTION 4: PROJECTED BALANCE & ACTIONS (Indigo Top Border) */}
          <View style={[styles.sectionCard, { borderTopColor: '#6366F1' }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.18)' }]}>
                <Ionicons name="calculator" size={16} color="#6366F1" />
              </View>
              <Text style={styles.sectionHeading}>4. Projected Closing Balance</Text>
            </View>

            <View style={styles.projectedCard}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.projectedLabel}>PROJECTED CLOSING LIABILITY</Text>
                <Text style={styles.projectedFormula}>
                  Total (Rs {formatNum(totalLiability)}) {transactionType === 'Pay' ? '+' : '-'} Amount (Rs {formatNum(paidAmount)})
                </Text>
              </View>
              <Text style={styles.projectedAmount}>Rs {formatNum(projectedBalance)}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.formActionBtnRow}>
              <TouchableOpacity
                style={styles.formClearBtn}
                onPress={handleClearForm}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#94A3B8" style={{ marginRight: 4 }} />
                <Text style={styles.formClearBtnText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.formSaveBtn}
                onPress={handleSaveAdvance}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.formSaveBtnText}>
                  {editingAdvanceId ? 'Update Advance (Bilal Shah Auth)' : 'Save Advance (Bilal Shah Auth)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ============================================================== */}
      {/* TAB 2: ADVANCE LIST VIEW (Month-wise Summary & Easy Actions) */}
      {/* ============================================================== */}
      {activeTab === 'list' && (
        <View style={{ flex: 1 }}>
          {/* Top Month Filter Bar */}
          <View style={styles.listMonthFilterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listMonthScroll}>
              <TouchableOpacity
                style={[styles.listMonthPill, listMonthFilter === 'current' && styles.listMonthPillActive]}
                onPress={() => {
                  setListMonthFilter('current');
                  setListSelectedMonthKey(currentMonthKey);
                }}
              >
                <Text style={[styles.listMonthPillText, listMonthFilter === 'current' && styles.listMonthPillTextActive]}>
                  📅 Current ({formatMonthKeyLabel(currentMonthKey)})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.listMonthPill, listMonthFilter === 'pre' && styles.listMonthPillActive]}
                onPress={() => {
                  setListMonthFilter('pre');
                  setListSelectedMonthKey(preMonthKey);
                }}
              >
                <Text style={[styles.listMonthPillText, listMonthFilter === 'pre' && styles.listMonthPillTextActive]}>
                  ⏮️ Pre Month ({formatMonthKeyLabel(preMonthKey)})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.listMonthPill, listMonthFilter === 'all' && styles.listMonthPillActive]}
                onPress={() => setListMonthFilter('all')}
              >
                <Text style={[styles.listMonthPillText, listMonthFilter === 'all' && styles.listMonthPillTextActive]}>
                  ♾️ All Time
                </Text>
              </TouchableOpacity>

              {/* Month Stepper */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperArrow}
                  onPress={() => {
                    const base = listMonthFilter === 'custom' ? listSelectedMonthKey : (listMonthFilter === 'pre' ? preMonthKey : currentMonthKey);
                    const prev = getPreMonthKey(base);
                    setListSelectedMonthKey(prev);
                    setListMonthFilter('custom');
                  }}
                >
                  <Ionicons name="chevron-back" size={14} color="#38BDF8" />
                </TouchableOpacity>
                <Text style={styles.stepperLabel}>
                  {listMonthFilter === 'custom' ? formatMonthKeyLabel(listSelectedMonthKey) : 'Browse'}
                </Text>
                <TouchableOpacity
                  style={styles.stepperArrow}
                  onPress={() => {
                    const base = listMonthFilter === 'custom' ? listSelectedMonthKey : (listMonthFilter === 'pre' ? preMonthKey : currentMonthKey);
                    const next = getNextMonthKey(base);
                    setListSelectedMonthKey(next);
                    setListMonthFilter('custom');
                  }}
                >
                  <Ionicons name="chevron-forward" size={14} color="#38BDF8" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>

          {/* Month Summary KPI Banner */}
          <View style={styles.listKpiBanner}>
            <View style={styles.listKpiRow}>
              <View style={styles.listKpiCol}>
                <Text style={styles.listKpiLabel}>Advances Given</Text>
                <Text style={[styles.listKpiVal, { color: '#10B981' }]}>Rs {formatNum(listStats.paid)}</Text>
              </View>
              <View style={styles.listKpiDivider} />
              <View style={styles.listKpiCol}>
                <Text style={styles.listKpiLabel}>Recovered</Text>
                <Text style={[styles.listKpiVal, { color: '#F59E0B' }]}>Rs {formatNum(listStats.rec)}</Text>
              </View>
              <View style={styles.listKpiDivider} />
              <View style={styles.listKpiCol}>
                <Text style={styles.listKpiLabel}>Net Balance</Text>
                <Text style={[styles.listKpiVal, { color: '#38BDF8' }]}>Rs {formatNum(listStats.net)}</Text>
              </View>
              <View style={styles.listKpiDivider} />
              <View style={styles.listKpiCol}>
                <Text style={styles.listKpiLabel}>Active Staff</Text>
                <Text style={[styles.listKpiVal, { color: '#F8FAFC' }]}>{listStats.staffCount}</Text>
              </View>
            </View>
          </View>

          {/* Store Branch Filter Horizontal Pills */}
          <View style={styles.branchFilterStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
              {branches.map((b, idx) => {
                const isSelected = (selectedBranch === b) || (!selectedBranch && b === 'All Branches');
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.filterPill, isSelected && styles.filterPillActiveBranch]}
                    onPress={() => {
                      setSelectedBranch(b);
                      loadAdvancesForBranch(b);
                    }}
                  >
                    <Ionicons name="location" size={11} color={isSelected ? '#FFFFFF' : '#38BDF8'} style={{ marginRight: 4 }} />
                    <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Department Filter Horizontal Pills */}
          <View style={styles.deptFilterStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
              {availableDepartments.map((dept, idx) => {
                const isSelected = selectedDepartment === dept;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.filterPill, isSelected && styles.filterPillActiveDept]}
                    onPress={() => setSelectedDepartment(dept)}
                  >
                    <Ionicons name="briefcase-outline" size={11} color={isSelected ? '#FFFFFF' : '#A78BFA'} style={{ marginRight: 4 }} />
                    <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>{dept}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Search & Transaction Type Pills */}
          <View style={styles.searchBarBox}>
            <View style={styles.searchInner}>
              <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search staff name, code, remarks..."
                placeholderTextColor="#64748B"
                value={listSearchText}
                onChangeText={setListSearchText}
              />
              {listSearchText ? (
                <TouchableOpacity onPress={() => setListSearchText('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.typeSwitcherRow}>
              {['All', 'Pay', 'Received'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typePill, listFilterType === type && styles.typePillActive]}
                  onPress={() => setListFilterType(type)}
                >
                  <Text style={[styles.typePillText, listFilterType === type && styles.typePillTextActive]}>
                    {type === 'Pay' ? 'Given (Pay)' : type === 'Received' ? 'Recoveries' : 'All Types'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Advances FlatList */}
          <FlatList
            data={filteredAdvances}
            keyExtractor={(item) => String(item._id || item.id)}
            contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshingList}
                onRefresh={() => {
                  setRefreshingList(true);
                  loadAdvancesForBranch(selectedBranch);
                }}
                tintColor="#38BDF8"
              />
            }
            renderItem={({ item }) => (
              <View style={styles.advanceCard}>
                {/* Header */}
                <View style={styles.advanceCardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.advanceCardEmpName}>
                      {getSafeString(item.employee?.name, 'Staff Member')}
                    </Text>
                    <Text style={styles.advanceCardSub}>
                      Code: {getSafeString(item.employee?.code || item.code, 'N/A')} • {formatDate(item.date)} • {getSafeString(item.branch, 'Store')} • {getAdvanceDeptName(item)}
                    </Text>
                  </View>
                  <View style={[
                    styles.typeBadge,
                    item.transactionType === 'Pay' ? styles.typeBadgePay : styles.typeBadgeRec
                  ]}>
                    <Text style={[
                      styles.typeBadgeText,
                      item.transactionType === 'Pay' ? styles.typeBadgeTextPay : styles.typeBadgeTextRec
                    ]}>
                      {item.transactionType === 'Pay' ? '💸 Advance Paid' : '📥 Recovery'}
                    </Text>
                  </View>
                </View>

                {/* Amounts Breakdown Strip */}
                <View style={styles.advanceAmountsRow}>
                  <View>
                    <Text style={styles.advAmtLabel}>Amount</Text>
                    <Text style={[styles.advAmtVal, { color: item.transactionType === 'Pay' ? '#10B981' : '#F59E0B' }]}>
                      Rs {formatNum(item.paid)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.advAmtLabel}>Pre Balance</Text>
                    <Text style={styles.advAmtVal}>Rs {formatNum(item.total || item.preMonthBal)}</Text>
                  </View>
                  <View>
                    <Text style={styles.advAmtLabel}>Closing Balance</Text>
                    <Text style={[styles.advAmtVal, { color: '#EF4444' }]}>
                      Rs {formatNum(item.balance)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.advAmtLabel}>Mode</Text>
                    <Text style={styles.advAmtVal}>{item.docMode || 'Cash'}</Text>
                  </View>
                </View>

                {item.remarks ? (
                  <Text style={styles.advanceRemarks} numberOfLines={2}>
                    📝 {item.remarks}
                  </Text>
                ) : null}

                {/* Card Actions: Slip, WhatsApp, Installment, Edit, Delete */}
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={[styles.cardActionBtn, { backgroundColor: '#0284C7' }]}
                    onPress={() => handlePrintAdvanceSlip(item)}
                  >
                    <Ionicons name="print-outline" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
                    <Text style={styles.cardActionBtnText}>Slip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => handleShareWhatsAppSlip(item)}
                  >
                    <Ionicons name="logo-whatsapp" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
                    <Text style={styles.cardActionBtnText}>WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, { backgroundColor: '#6366F1' }]}
                    onPress={() => handleOpenInstallmentModal(item.employee, item)}
                  >
                    <Ionicons name="calendar-outline" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
                    <Text style={styles.cardActionBtnText}>Plan</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.cardActionBtnEdit]}
                    onPress={() => handleEditAdvance(item)}
                  >
                    <Ionicons name="pencil" size={13} color="#38BDF8" style={{ marginRight: 3 }} />
                    <Text style={styles.cardActionBtnTextEdit}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.cardActionBtnDelete]}
                    onPress={() => handleDeleteAdvance(item)}
                  >
                    <Ionicons name="trash-outline" size={13} color="#EF4444" style={{ marginRight: 3 }} />
                    <Text style={styles.cardActionBtnTextDelete}>Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              loadingAdvances ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#38BDF8" />
                  <Text style={{ color: '#94A3B8', marginTop: 8 }}>Loading advances from Central ERP...</Text>
                </View>
              ) : (
                <View style={styles.emptyListBox}>
                  <Ionicons name="document-text-outline" size={42} color="#64748B" />
                  <Text style={styles.emptyListTitle}>No Advance Records Found</Text>
                  <Text style={styles.emptyListSub}>
                    Try changing month filter, branch, or create a new advance.
                  </Text>
                </View>
              )
            }
          />
        </View>
      )}

      {/* ============================================================== */}
      {/* TAB 3: AUDIT & ANALYSIS (Branch-wise, Dept-wise, Month-wise) */}
      {/* ============================================================== */}
      {activeTab === 'audit' && (
        <View style={{ flex: 1, padding: 12 }}>
          {/* Audit Month Filter */}
          <View style={styles.auditMonthBar}>
            <Text style={styles.auditMonthLabel}>AUDIT PERIOD:</Text>
            <View style={styles.auditMonthPills}>
              <TouchableOpacity
                style={[styles.auditMonthPill, auditMonthFilter === 'current' && styles.auditMonthPillActive]}
                onPress={() => setAuditMonthFilter('current')}
              >
                <Text style={[styles.auditMonthPillText, auditMonthFilter === 'current' && styles.auditMonthPillTextActive]}>
                  Current ({formatMonthKeyLabel(currentMonthKey)})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditMonthPill, auditMonthFilter === 'pre' && styles.auditMonthPillActive]}
                onPress={() => setAuditMonthFilter('pre')}
              >
                <Text style={[styles.auditMonthPillText, auditMonthFilter === 'pre' && styles.auditMonthPillTextActive]}>
                  Pre ({formatMonthKeyLabel(preMonthKey)})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditMonthPill, auditMonthFilter === 'all' && styles.auditMonthPillActive]}
                onPress={() => setAuditMonthFilter('all')}
              >
                <Text style={[styles.auditMonthPillText, auditMonthFilter === 'all' && styles.auditMonthPillTextActive]}>
                  All Time
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Audit Scope Switcher: Branch-wise vs Department-wise */}
          <View style={styles.auditTabSwitcher}>
            <TouchableOpacity
              style={[styles.auditTabBtn, auditScope === 'branch' && styles.auditTabBtnActive]}
              onPress={() => setAuditScope('branch')}
              activeOpacity={0.8}
            >
              <Ionicons name="business" size={14} color={auditScope === 'branch' ? '#FFFFFF' : '#94A3B8'} style={{ marginRight: 6 }} />
              <Text style={[styles.auditTabBtnText, auditScope === 'branch' && styles.auditTabBtnTextActive]}>
                🏢 Store Branches ({filteredBranchAudit.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.auditTabBtn, auditScope === 'department' && styles.auditTabBtnActive]}
              onPress={() => setAuditScope('department')}
              activeOpacity={0.8}
            >
              <Ionicons name="briefcase" size={14} color={auditScope === 'department' ? '#FFFFFF' : '#94A3B8'} style={{ marginRight: 6 }} />
              <Text style={[styles.auditTabBtnText, auditScope === 'department' && styles.auditTabBtnTextActive]}>
                🏬 Departments ({filteredDeptAudit.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Enterprise Totals Summary */}
          <View style={styles.branchEnterpriseBanner}>
            <View style={styles.branchEnterpriseRow}>
              <View style={styles.branchEnterpriseCol}>
                <Text style={styles.branchEnterpriseLabel}>Total Given</Text>
                <Text style={[styles.branchEnterpriseValue, { color: '#10B981' }]}>
                  Rs {formatNum(auditEnterpriseTotals.totalPaid)}
                </Text>
              </View>
              <View style={styles.branchEnterpriseDivider} />
              <View style={styles.branchEnterpriseCol}>
                <Text style={styles.branchEnterpriseLabel}>Recovered</Text>
                <Text style={[styles.branchEnterpriseValue, { color: '#F59E0B' }]}>
                  Rs {formatNum(auditEnterpriseTotals.totalReceived)}
                </Text>
              </View>
              <View style={styles.branchEnterpriseDivider} />
              <View style={styles.branchEnterpriseCol}>
                <Text style={styles.branchEnterpriseLabel}>Net Balance</Text>
                <Text style={[styles.branchEnterpriseValue, { color: '#38BDF8' }]}>
                  Rs {formatNum(auditEnterpriseTotals.netBalance)}
                </Text>
              </View>
            </View>
            <View style={styles.branchEnterpriseMetaRow}>
              <Text style={styles.branchEnterpriseMetaText}>
                👥 {auditEnterpriseTotals.totalStaff} staff with active advance records across {branches.length - 1} branches
              </Text>
            </View>
          </View>

          {/* Search Box */}
          <View style={styles.branchSearchBox}>
            <Ionicons name="search" size={15} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.branchSearchInput}
              placeholder={auditScope === 'branch' ? "Search branch name..." : "Search department name..."}
              placeholderTextColor="#64748B"
              value={auditSearch}
              onChangeText={setAuditSearch}
            />
            {auditSearch ? (
              <TouchableOpacity onPress={() => setAuditSearch('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* FlatList for Branch Audit */}
          {auditScope === 'branch' ? (
            <FlatList
              data={filteredBranchAudit}
              keyExtractor={(item) => item.branch}
              contentContainerStyle={{ paddingBottom: 110 }}
              renderItem={({ item: b }) => {
                const isExpanded = expandedBranch === b.branch;
                const recRate = b.totalPaid > 0 ? Math.min(100, Math.round((b.totalReceived / b.totalPaid) * 100)) : 0;
                return (
                  <View style={styles.auditCardItem}>
                    <View style={styles.auditCardItemHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <Ionicons name="location" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                        <Text style={styles.auditCardItemTitle} numberOfLines={1}>{b.branch}</Text>
                        <View style={styles.auditStaffPill}>
                          <Text style={styles.auditStaffPillText}>{b.empCount} Staff</Text>
                        </View>
                      </View>
                      <View style={styles.auditNetBadge}>
                        <Text style={styles.auditNetText}>Rs {formatNum(b.netBalance)}</Text>
                      </View>
                    </View>

                    <View style={styles.auditMetricsRow}>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Given</Text>
                        <Text style={[styles.auditMetricVal, { color: '#10B981' }]}>Rs {formatNum(b.totalPaid)}</Text>
                      </View>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Recovered</Text>
                        <Text style={[styles.auditMetricVal, { color: '#F59E0B' }]}>Rs {formatNum(b.totalReceived)}</Text>
                      </View>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Recovery Rate</Text>
                        <Text style={[styles.auditMetricVal, { color: '#38BDF8' }]}>{recRate}%</Text>
                      </View>
                    </View>

                    <View style={styles.auditProgressTrack}>
                      <View style={[styles.auditProgressBar, { width: `${recRate}%` }]} />
                    </View>

                    <View style={styles.auditActionRow}>
                      <TouchableOpacity
                        style={styles.auditInspectBtn}
                        onPress={() => {
                          setSelectedBranch(b.branch);
                          loadAdvancesForBranch(b.branch);
                          setActiveTab('list');
                        }}
                      >
                        <Ionicons name="list" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.auditInspectBtnText}>Inspect in List</Text>
                      </TouchableOpacity>

                      {b.employees.length > 0 && (
                        <TouchableOpacity
                          style={styles.auditStaffToggleBtn}
                          onPress={() => setExpandedBranch(isExpanded ? null : b.branch)}
                        >
                          <Text style={styles.auditStaffToggleBtnText}>
                            {isExpanded ? 'Hide Staff' : `Staff Breakdown (${b.employees.length})`}
                          </Text>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={13} color="#38BDF8" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {isExpanded && (
                      <View style={styles.staffBreakdownBox}>
                        <Text style={styles.staffBreakdownTitle}>Staff Balances for {b.branch}:</Text>
                        {b.employees.map((emp, idx) => (
                          <View key={emp.id || idx} style={styles.staffRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.staffNameText} numberOfLines={1}>👤 {emp.name}</Text>
                              <Text style={styles.staffCodeText}>Code: {emp.code} • Given: Rs {formatNum(emp.totalPaid)} • Rec: Rs {formatNum(emp.totalReceived)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.staffBalText, { color: emp.balance > 0 ? '#38BDF8' : '#10B981' }]}>
                                Rs {formatNum(emp.balance)}
                              </Text>
                              <Text style={styles.staffBalLabel}>Balance</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          ) : (
            <FlatList
              data={filteredDeptAudit}
              keyExtractor={(item) => item.department}
              contentContainerStyle={{ paddingBottom: 110 }}
              renderItem={({ item: d }) => {
                const isExpanded = expandedDept === d.department;
                const recRate = d.totalPaid > 0 ? Math.min(100, Math.round((d.totalReceived / d.totalPaid) * 100)) : 0;
                return (
                  <View style={styles.auditCardItem}>
                    <View style={styles.auditCardItemHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <Ionicons name="briefcase" size={16} color="#A78BFA" style={{ marginRight: 6 }} />
                        <Text style={styles.auditCardItemTitle} numberOfLines={1}>{d.department}</Text>
                        <View style={[styles.auditStaffPill, { backgroundColor: 'rgba(167, 139, 250, 0.18)' }]}>
                          <Text style={[styles.auditStaffPillText, { color: '#C4B5FD' }]}>{d.empCount} Staff</Text>
                        </View>
                      </View>
                      <View style={styles.auditNetBadge}>
                        <Text style={styles.auditNetText}>Rs {formatNum(d.netBalance)}</Text>
                      </View>
                    </View>

                    <View style={styles.auditMetricsRow}>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Given</Text>
                        <Text style={[styles.auditMetricVal, { color: '#10B981' }]}>Rs {formatNum(d.totalPaid)}</Text>
                      </View>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Recovered</Text>
                        <Text style={[styles.auditMetricVal, { color: '#F59E0B' }]}>Rs {formatNum(d.totalReceived)}</Text>
                      </View>
                      <View style={styles.auditMetricCol}>
                        <Text style={styles.auditMetricLabel}>Recovery Rate</Text>
                        <Text style={[styles.auditMetricVal, { color: '#A78BFA' }]}>{recRate}%</Text>
                      </View>
                    </View>

                    <View style={styles.auditProgressTrack}>
                      <View style={[styles.auditProgressBar, { width: `${recRate}%`, backgroundColor: '#A78BFA' }]} />
                    </View>

                    <View style={styles.auditActionRow}>
                      <TouchableOpacity
                        style={[styles.auditInspectBtn, { backgroundColor: '#7C3AED' }]}
                        onPress={() => {
                          setSelectedDepartment(d.department);
                          setActiveTab('list');
                        }}
                      >
                        <Ionicons name="filter" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.auditInspectBtnText}>Filter in List</Text>
                      </TouchableOpacity>

                      {d.employees.length > 0 && (
                        <TouchableOpacity
                          style={styles.auditStaffToggleBtn}
                          onPress={() => setExpandedDept(isExpanded ? null : d.department)}
                        >
                          <Text style={styles.auditStaffToggleBtnText}>
                            {isExpanded ? 'Hide Staff' : `Staff Breakdown (${d.employees.length})`}
                          </Text>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={13} color="#A78BFA" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {isExpanded && (
                      <View style={styles.staffBreakdownBox}>
                        <Text style={styles.staffBreakdownTitle}>Staff Balances for {d.department}:</Text>
                        {d.employees.map((emp, idx) => (
                          <View key={emp.id || idx} style={styles.staffRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.staffNameText} numberOfLines={1}>👤 {emp.name}</Text>
                              <Text style={styles.staffCodeText}>Code: {emp.code} • Store: {emp.branch || 'Main'} • Given: Rs {formatNum(emp.totalPaid)} • Rec: Rs {formatNum(emp.totalReceived)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.staffBalText, { color: emp.balance > 0 ? '#A78BFA' : '#10B981' }]}>
                                Rs {formatNum(emp.balance)}
                              </Text>
                              <Text style={styles.staffBalLabel}>Balance</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* TAB 4: INSTALLMENT PLANNER (Pre & Current Month Deductions) */}
      {/* ============================================================== */}
      {activeTab === 'installment' && (
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Banner */}
          <View style={styles.formBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formBannerTitle}>Advance Installment Plan</Text>
              <Text style={styles.formBannerSub}>
                Set up monthly salary deductions for Previous & Current month advances.
              </Text>
            </View>
          </View>

          {/* Select Employee Card */}
          <View style={[styles.sectionCard, { borderTopColor: '#38BDF8' }]}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.18)' }]}>
                <Ionicons name="person" size={16} color="#38BDF8" />
              </View>
              <Text style={styles.sectionHeading}>Target Employee</Text>
            </View>

            <TouchableOpacity
              style={styles.empSelectCard}
              onPress={() => {
                setEmployeeSearchText('');
                setIsEmployeeModalVisible(true);
              }}
            >
              <View style={styles.empAvatarCircle}>
                <Text style={styles.empAvatarText}>
                  {selectedEmployee ? (getSafeString(selectedEmployee.name, 'E')).substring(0, 1).toUpperCase() : '?'}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.empSelectName} numberOfLines={1}>
                  {selectedEmployee ? selectedEmployee.name : 'Tap to Select Employee for Plan...'}
                </Text>
                <Text style={styles.empSelectSub}>
                  {selectedEmployee
                    ? `Code: ${selectedEmployee.code || 'N/A'} • Salary: Rs ${formatNum(basicSalary)}`
                    : 'Choose staff member to configure payroll deductions'}
                </Text>
              </View>
              <View style={styles.empSelectActionBtn}>
                <Text style={styles.empSelectActionText}>Select</Text>
                <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          {selectedEmployee && (
            <>
              {/* SECTION 1: PREVIOUS MONTH ADVANCE */}
              <View style={[styles.sectionCard, { borderTopColor: '#F59E0B' }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
                    <Ionicons name="time" size={16} color="#F59E0B" />
                  </View>
                  <Text style={styles.sectionHeading}>1. Previous Month Advance</Text>
                  <Text style={{ color: '#FCD34D', fontWeight: '800', fontSize: 11 }}>
                    Bal: Rs {formatNum(instPreBal1)}
                  </Text>
                </View>

                <View style={styles.instFieldsRow}>
                  <View style={styles.instFieldCol}>
                    <Text style={styles.fieldLabel}>Pre Balance (Locked)</Text>
                    <View style={styles.lockedFieldBox}>
                      <Text style={styles.lockedFieldTextAmber}>Rs {formatNum(instPreBal1)}</Text>
                    </View>
                  </View>
                  <View style={styles.instFieldCol}>
                    <Text style={[styles.fieldLabel, { color: '#F59E0B' }]}>Deduction (Rs)</Text>
                    <TextInput
                      style={styles.instInputAmber}
                      value={instInstallment1}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748B"
                      onChangeText={handleInst1Change}
                      selectTextOnFocus
                    />
                  </View>
                </View>

                <View style={{ marginTop: 6 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                    Remaining Pre Balance:{' '}
                    <Text style={{ color: instRemainingBal1 > 0 ? '#F59E0B' : '#10B981', fontWeight: '800' }}>
                      Rs {formatNum(instRemainingBal1)}
                    </Text>
                  </Text>
                </View>
              </View>

              {/* SECTION 2: CURRENT MONTH ADVANCE */}
              <View style={[styles.sectionCard, { borderTopColor: '#38BDF8' }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.18)' }]}>
                    <Ionicons name="calendar" size={16} color="#38BDF8" />
                  </View>
                  <Text style={styles.sectionHeading}>2. Current Month Advance</Text>
                  <Text style={{ color: '#7DD3FC', fontWeight: '800', fontSize: 11 }}>
                    Bal: Rs {formatNum(instPreBal2)}
                  </Text>
                </View>

                <View style={styles.instFieldsRow}>
                  <View style={styles.instFieldCol}>
                    <Text style={styles.fieldLabel}>Cur Balance (Locked)</Text>
                    <View style={styles.lockedFieldBox}>
                      <Text style={styles.lockedFieldTextCyan}>Rs {formatNum(instPreBal2)}</Text>
                    </View>
                  </View>
                  <View style={styles.instFieldCol}>
                    <Text style={[styles.fieldLabel, { color: '#38BDF8' }]}>Deduction (Rs)</Text>
                    <TextInput
                      style={styles.instInputCyan}
                      value={instInstallment2}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748B"
                      onChangeText={handleInst2Change}
                      selectTextOnFocus
                    />
                  </View>
                </View>

                <View style={{ marginTop: 6 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 11 }}>
                    Remaining Current Balance:{' '}
                    <Text style={{ color: instRemainingBal2 > 0 ? '#38BDF8' : '#10B981', fontWeight: '800' }}>
                      Rs {formatNum(instRemainingBal2)}
                    </Text>
                  </Text>
                </View>
              </View>

              {/* TOTAL SALARY SLIP DEDUCTION CARD */}
              <View style={styles.instTotalCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.instTotalLabel}>TOTAL SALARY DEDUCTION</Text>
                  <Text style={styles.instTotalSub}>
                    Pre ({formatNum(instInstallment1)}) + Cur ({formatNum(instInstallment2)}) • Applied to monthly payroll
                  </Text>
                </View>
                <Text style={styles.instTotalVal}>
                  Rs {formatNum((parseFloat(instInstallment1) || 0) + (parseFloat(instInstallment2) || 0))}
                </Text>
              </View>

              {/* Save Plan Button */}
              <TouchableOpacity
                style={styles.instSaveBtn}
                onPress={handleSaveInstallmentPlan}
                activeOpacity={0.8}
              >
                <Ionicons name="save" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.instSaveBtnText}>Save Installment Plan (Bilal Shah Auth)</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: INSTALLMENT PLAN (Popup Modal from List / Quick Action) */}
      {/* ============================================================== */}
      <Modal visible={isInstallmentModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView
          style={styles.instModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.instModalCard}>
            <View style={styles.instHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.instTitle}>Advance Installment Plan</Text>
                <View style={styles.instEmpBadge}>
                  <Text style={styles.instEmpBadgeText} numberOfLines={1}>
                    👤 {selectedEmployee ? `${selectedEmployee.name || 'Staff'} (${selectedEmployee.code || 'N/A'})` : 'Select Staff'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.instCloseBtn}
                onPress={() => setIsInstallmentModalVisible(false)}
              >
                <Text style={styles.instCloseBtnText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            {loadingInstallment ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#38BDF8" />
                <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 8 }}>Calculating balances & loading plan...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* 1. Pre Month */}
                <View style={styles.instSectionAmber}>
                  <View style={styles.instSectionHeader}>
                    <Text style={styles.instSectionTitleAmber}>1. Previous Month Advance</Text>
                    <Text style={styles.instHeaderBalAmber}>Bal: Rs {formatNum(instPreBal1)}</Text>
                  </View>
                  <View style={styles.instFieldsRow}>
                    <View style={styles.instFieldCol}>
                      <Text style={styles.fieldLabel}>Pre Bal</Text>
                      <View style={styles.lockedFieldBox}>
                        <Text style={styles.lockedFieldTextAmber}>Rs {formatNum(instPreBal1)}</Text>
                      </View>
                    </View>
                    <View style={styles.instFieldCol}>
                      <Text style={[styles.fieldLabel, { color: '#F59E0B' }]}>Deduction (Rs)</Text>
                      <TextInput
                        style={styles.instInputAmber}
                        value={instInstallment1}
                        keyboardType="numeric"
                        onChangeText={handleInst1Change}
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                  <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 4 }}>
                    Remaining Pre Balance: <Text style={{ color: instRemainingBal1 > 0 ? '#F59E0B' : '#10B981', fontWeight: '800' }}>Rs {formatNum(instRemainingBal1)}</Text>
                  </Text>
                </View>

                {/* 2. Cur Month */}
                <View style={styles.instSectionCyan}>
                  <View style={styles.instSectionHeader}>
                    <Text style={styles.instSectionTitleCyan}>2. Current Month Advance</Text>
                    <Text style={styles.instHeaderBalCyan}>Bal: Rs {formatNum(instPreBal2)}</Text>
                  </View>
                  <View style={styles.instFieldsRow}>
                    <View style={styles.instFieldCol}>
                      <Text style={styles.fieldLabel}>Cur Bal</Text>
                      <View style={styles.lockedFieldBox}>
                        <Text style={styles.lockedFieldTextCyan}>Rs {formatNum(instPreBal2)}</Text>
                      </View>
                    </View>
                    <View style={styles.instFieldCol}>
                      <Text style={[styles.fieldLabel, { color: '#38BDF8' }]}>Deduction (Rs)</Text>
                      <TextInput
                        style={styles.instInputCyan}
                        value={instInstallment2}
                        keyboardType="numeric"
                        onChangeText={handleInst2Change}
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                  <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 4 }}>
                    Remaining Cur Balance: <Text style={{ color: instRemainingBal2 > 0 ? '#38BDF8' : '#10B981', fontWeight: '800' }}>Rs {formatNum(instRemainingBal2)}</Text>
                  </Text>
                </View>

                {/* Total Slip Deduction */}
                <View style={styles.instTotalCard}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.instTotalLabel}>TOTAL PAYROLL DEDUCTION</Text>
                    <Text style={styles.instTotalSub}>Pre ({formatNum(instInstallment1)}) + Cur ({formatNum(instInstallment2)})</Text>
                  </View>
                  <Text style={styles.instTotalVal}>
                    Rs {formatNum((parseFloat(instInstallment1) || 0) + (parseFloat(instInstallment2) || 0))}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.instSaveBtn}
                  onPress={handleSaveInstallmentPlan}
                >
                  <Text style={styles.instSaveBtnText}>💾 Save Installment Plan (Bilal Shah Auth)</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: SEARCHABLE EMPLOYEE PICKER */}
      {/* ============================================================== */}
      <Modal visible={isEmployeeModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Employee ({allEmployees.length})</Text>
              <TouchableOpacity onPress={() => setIsEmployeeModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search by code or employee name..."
              placeholderTextColor="#94A3B8"
              value={employeeSearchText}
              onChangeText={setEmployeeSearchText}
              autoFocus
              clearButtonMode="while-editing"
            />

            <FlatList
              data={modalFilteredEmployees}
              keyExtractor={(item, idx) => String(item._id || item.id || item.code || idx)}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 60 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.empPickerItem}
                  onPress={() => selectEmployee(item)}
                  activeOpacity={0.6}
                >
                  <View style={styles.empPickerAvatar}>
                    <Text style={styles.empPickerAvatarText}>
                      {(getSafeString(item.name, 'E')).substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empPickerName}>{getSafeString(item.name, 'Staff')}</Text>
                    <Text style={styles.empPickerSub}>
                      Code: {getSafeString(item.code, 'N/A')} • {getSafeString(item.designation, 'Staff')} • {getSafeString(item.branch, 'Store')}
                    </Text>
                  </View>
                  <Text style={styles.empPickerArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 3: STORE BRANCH PICKER */}
      {/* ============================================================== */}
      <Modal visible={isBranchModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Store Branch</Text>
              <TouchableOpacity onPress={() => setIsBranchModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={branches.filter(b => getSafeString(b) !== 'All Branches')}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.branchPickerItem, selectedBranch === item && styles.branchPickerItemActive]}
                  onPress={() => {
                    setSelectedBranch(item);
                    setIsBranchModalVisible(false);
                  }}
                >
                  <Text style={[styles.branchPickerText, selectedBranch === item && styles.branchPickerTextActive]}>
                    📍 {getSafeString(item)}
                  </Text>
                  {selectedBranch === item && <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 4: BILAL SHAH SECURITY VERIFICATION */}
      {/* ============================================================== */}
      <Modal
        visible={authModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !authLoading && setAuthModalVisible(false)}
      >
        <View style={styles.authModalOverlay}>
          <View style={styles.authModalCard}>
            <View style={styles.authModalHeader}>
              <Text style={{ fontSize: 32, marginBottom: 6 }}>🔐</Text>
              <Text style={styles.authModalTitle}>Bilal Shah Authorization</Text>
              <Text style={styles.authModalSubtitle}>
                {pendingAction?.title || 'Advance Module Security Check'}
              </Text>
              <Text style={styles.authNoticeText}>
                ⚠️ Only Bilal Shah is permitted to give, modify, installment-plan or delete advances.
              </Text>
            </View>

            {pendingRecord ? (
              <View style={styles.authTargetRecordBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.authTargetRecordEmp}>
                    👤 {getSafeString(pendingRecord.employee?.name, 'Staff')} ({getSafeString(pendingRecord.employee?.code || pendingRecord.code, 'N/A')})
                  </Text>
                  <View style={[
                    styles.authTargetBadge,
                    { backgroundColor: pendingRecord.transactionType === 'Received' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)' }
                  ]}>
                    <Text style={{
                      color: pendingRecord.transactionType === 'Received' ? '#F59E0B' : '#10B981',
                      fontSize: 10,
                      fontWeight: '700'
                    }}>
                      {pendingRecord.transactionType === 'Received' ? 'Recovery' : 'Advance'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.authTargetRecordDetails}>
                  Amount: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Rs {formatNum(pendingRecord.paid || pendingRecord.amount || 0)}</Text> • Branch: {getSafeString(pendingRecord.branch, 'Store')} • {formatDate(pendingRecord.date)}
                </Text>
              </View>
            ) : null}

            {authError ? (
              <View style={styles.authErrorBox}>
                <Text style={styles.authErrorText}>{authError}</Text>
              </View>
            ) : null}

            {authLoading ? (
              <View style={styles.authStatusBox}>
                <ActivityIndicator size="small" color="#38BDF8" />
                <Text style={styles.authStatusText}>{authStatusText || 'Verifying credentials...'}</Text>
              </View>
            ) : null}

            <View style={styles.authInputGroup}>
              <Text style={styles.authInputLabel}>Authorized Username</Text>
              <TextInput
                style={[styles.authInput, { backgroundColor: '#0B132B' }]}
                value={authUsername}
                onChangeText={setAuthUsername}
                placeholder="bilal shah"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                editable={!authLoading}
              />
            </View>

            <View style={styles.authInputGroup}>
              <Text style={styles.authInputLabel}>Password</Text>
              <View style={styles.authPasswordRow}>
                <TextInput
                  style={[styles.authInput, { flex: 1, backgroundColor: '#0B132B', borderRightWidth: 0 }]}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="Enter Bilal Shah password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showAuthPassword}
                  editable={!authLoading}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.authPasswordToggle}
                  onPress={() => setShowAuthPassword(!showAuthPassword)}
                >
                  <Text style={{ fontSize: 16 }}>{showAuthPassword ? '👁️' : '🙈'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.authActionRow}>
              <TouchableOpacity
                style={styles.authCancelBtn}
                onPress={() => setAuthModalVisible(false)}
                disabled={authLoading}
              >
                <Text style={styles.authCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.authConfirmBtn,
                  pendingAction?.type === 'delete' && { backgroundColor: '#DC2626' }
                ]}
                onPress={handleConfirmAuth}
                disabled={authLoading}
              >
                <Text style={styles.authConfirmBtnText}>
                  {pendingAction?.type === 'delete'
                    ? '🗑️ Authorize & Delete'
                    : pendingAction?.type === 'edit'
                    ? '✏️ Authorize & Edit'
                    : 'Authorize & Proceed'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 48 : 14,
    paddingBottom: 10,
    backgroundColor: '#0B132B',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  backBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: '#38BDF8',
    fontSize: 10.5,
    marginTop: 1,
    fontWeight: '600',
  },
  headerRightAction: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },

  // 4 Top Mode Switcher Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0B132B',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    borderColor: '#38BDF8',
  },
  tabBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Form Scroll & Section Cards (Employee Register Style)
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    padding: 12,
    paddingBottom: 60,
  },
  formBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  formBannerTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  formBannerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cancelEditText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 3,
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sectionHeading: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionBadgeText: {
    color: '#38BDF8',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Field Elements
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
  },
  fieldChangeLink: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldCol: {
    flex: 1,
  },
  textInput: {
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  todayResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 12,
    marginTop: 20,
  },
  todayResetText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },

  // Quick Branch Pills
  quickPillsScroll: {
    paddingBottom: 2,
  },
  quickPill: {
    backgroundColor: '#0B132B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickPillActiveBranch: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  quickPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  quickPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Selected Employee Card
  empSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  empAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empAvatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  empSelectName: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  empSelectSub: {
    color: '#94A3B8',
    fontSize: 10.5,
    marginTop: 2,
  },
  empSelectActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  empSelectActionText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    marginRight: 2,
  },

  // Balances 2x2 Grid
  balancesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  balanceGridCol: {
    width: '48.5%',
    backgroundColor: '#0B132B',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  balanceGridColTotal: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  balanceGridLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceGridValue: {
    fontSize: 14.5,
    fontWeight: '900',
    marginTop: 3,
  },
  balanceGridSub: {
    color: '#64748B',
    fontSize: 9.5,
    marginTop: 2,
  },

  // Transaction Type Toggle
  transTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  transTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  transTypeBtnActivePay: {
    backgroundColor: '#059669',
    borderColor: '#10B981',
  },
  transTypeBtnActiveRec: {
    backgroundColor: '#D97706',
    borderColor: '#F59E0B',
  },
  transTypeBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  transTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Hero Amount Input
  heroInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    paddingHorizontal: 12,
    height: 48,
  },
  heroInputCurrency: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 6,
  },
  heroInputField: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  // Mode Pills
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillSelect: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillSelectActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  pillSelectText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  pillSelectTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Projected Balance Card & Submit
  projectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B132B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  projectedLabel: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  projectedFormula: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 3,
  },
  projectedAmount: {
    color: '#818CF8',
    fontSize: 18,
    fontWeight: '900',
  },
  formActionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  formClearBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  formSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 8,
    height: 44,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  formSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // --- List Tab Styles ---
  listMonthFilterBar: {
    backgroundColor: '#0B132B',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  listMonthScroll: {
    alignItems: 'center',
    paddingBottom: 2,
  },
  listMonthPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  listMonthPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  listMonthPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  listMonthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#070F20',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  stepperArrow: {
    padding: 3,
  },
  stepperLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 3,
  },
  listKpiBanner: {
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  listKpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listKpiCol: {
    flex: 1,
    alignItems: 'center',
  },
  listKpiLabel: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listKpiVal: {
    fontSize: 12.5,
    fontWeight: '900',
    marginTop: 2,
  },
  listKpiDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#334155',
  },
  branchFilterStrip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deptFilterStrip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterPillsScroll: {
    paddingBottom: 2,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActiveBranch: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  filterPillActiveDept: {
    backgroundColor: '#7C3AED',
    borderColor: '#A78BFA',
  },
  filterPillText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchBarBox: {
    backgroundColor: '#1E293B',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  typeSwitcherRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  typePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#0B132B',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typePillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  typePillText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  typePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Advance Cards
  advanceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  advanceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  advanceCardEmpName: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  advanceCardSub: {
    color: '#94A3B8',
    fontSize: 10.5,
    marginTop: 2,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  typeBadgePay: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  typeBadgeRec: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  typeBadgeTextPay: {
    color: '#10B981',
  },
  typeBadgeTextRec: {
    color: '#F59E0B',
  },
  advanceAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B132B',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  advAmtLabel: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '600',
  },
  advAmtVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  advanceRemarks: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  cardActionBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardActionBtnEdit: {
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  cardActionBtnTextEdit: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardActionBtnDelete: {
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  cardActionBtnTextDelete: {
    color: '#EF4444',
    fontSize: 10.5,
    fontWeight: '700',
  },
  emptyListBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyListTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  emptyListSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },

  // --- Audit Tab Styles ---
  auditMonthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditMonthLabel: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '800',
  },
  auditMonthPills: {
    flexDirection: 'row',
    gap: 6,
  },
  auditMonthPill: {
    backgroundColor: '#0B132B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditMonthPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  auditMonthPillText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  auditMonthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  auditTabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#0B132B',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  auditTabBtnActive: {
    backgroundColor: '#0284C7',
  },
  auditTabBtnText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  auditTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  branchEnterpriseBanner: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  branchEnterpriseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branchEnterpriseCol: {
    flex: 1,
    alignItems: 'center',
  },
  branchEnterpriseDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
  },
  branchEnterpriseLabel: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  branchEnterpriseValue: {
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 2,
  },
  branchEnterpriseMetaRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  branchEnterpriseMetaText: {
    color: '#94A3B8',
    fontSize: 10.5,
    textAlign: 'center',
  },
  branchSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
  },
  branchSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  auditCardItem: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditCardItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  auditCardItemTitle: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  auditStaffPill: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  auditStaffPillText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  auditNetBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  auditNetText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  auditMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B132B',
    borderRadius: 6,
    padding: 8,
  },
  auditMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  auditMetricLabel: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '600',
  },
  auditMetricVal: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  auditProgressTrack: {
    height: 4,
    backgroundColor: '#0B132B',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  auditProgressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  auditActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  auditInspectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 6,
    borderRadius: 6,
  },
  auditInspectBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  auditStaffToggleBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    paddingVertical: 6,
    borderRadius: 6,
  },
  auditStaffToggleBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  staffBreakdownBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#334155',
  },
  staffBreakdownTitle: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B132B',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  staffNameText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  staffCodeText: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  staffBalText: {
    fontSize: 12,
    fontWeight: '800',
  },
  staffBalLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '600',
  },

  // --- Installments Planner Styles ---
  instFieldsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  instFieldCol: {
    flex: 1,
  },
  lockedFieldBox: {
    backgroundColor: '#0B132B',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lockedFieldTextAmber: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '700',
  },
  lockedFieldTextCyan: {
    color: '#7DD3FC',
    fontSize: 13,
    fontWeight: '700',
  },
  instInputAmber: {
    backgroundColor: '#0B132B',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  instInputCyan: {
    backgroundColor: '#0B132B',
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  instTotalCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instTotalLabel: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  instTotalSub: {
    color: '#A7F3D0',
    fontSize: 10,
    marginTop: 2,
  },
  instTotalVal: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '900',
  },
  instSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 46,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  instSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // Modal 1: Installment Card Dialog
  instModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  instModalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    padding: 16,
  },
  instHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  instTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  instEmpBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  instEmpBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  instCloseBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  instCloseBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  instSectionAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  instSectionCyan: {
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  instSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  instSectionTitleAmber: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '800',
  },
  instSectionTitleCyan: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  instHeaderBalAmber: {
    color: '#FCD34D',
    fontSize: 11,
    fontWeight: '800',
  },
  instHeaderBalCyan: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '800',
  },

  // Picker Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  modalCloseText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  modalSearchInput: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  empPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  empPickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  empPickerAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  empPickerName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  empPickerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  empPickerArrow: {
    color: '#64748B',
    fontSize: 20,
    marginLeft: 6,
  },
  branchPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  branchPickerItemActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
  },
  branchPickerText: {
    color: '#F8FAFC',
    fontSize: 14,
  },
  branchPickerTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },

  // Bilal Shah Auth Modal
  authModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#0284C7',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  authModalHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  authModalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  authModalSubtitle: {
    color: '#38BDF8',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  authNoticeText: {
    color: '#F59E0B',
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  authTargetRecordBox: {
    backgroundColor: '#0B132B',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  authTargetRecordEmp: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  authTargetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  authTargetRecordDetails: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  authErrorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  authErrorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  authStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 8,
  },
  authStatusText: {
    color: '#38BDF8',
    fontSize: 12,
  },
  authInputGroup: {
    marginBottom: 12,
  },
  authInputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  authInput: {
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    color: '#FFFFFF',
    fontSize: 13,
  },
  authPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authPasswordToggle: {
    backgroundColor: '#0B132B',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#334155',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  authCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCancelBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  authConfirmBtn: {
    flex: 1.8,
    backgroundColor: '#0284C7',
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
