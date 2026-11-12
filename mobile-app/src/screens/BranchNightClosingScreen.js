import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Linking,
  Platform,
  Alert,
  StatusBar,
  SafeAreaView
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';

const REPORT_MODES = [
  { key: 'daily_sale', label: 'Daily Sale', icon: '📊' },
  { key: 'cash_activity', label: 'Cash Activity', icon: '💵' },
  { key: 'income_statement', label: 'Income Statement', icon: '📑' },
  { key: 'dept_wise_activity', label: 'Dept & Activity', icon: '🏢' },
];

export default function BranchNightClosingScreen({ navigation, onBack }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [closingSheets, setClosingSheets] = useState([]);
  const [singleSheet, setSingleSheet] = useState(null);
  const [cashSalesData, setCashSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active Report Type & View Type
  const [activeReportMode, setActiveReportMode] = useState('daily_sale');
  const [viewType, setViewType] = useState('visual'); // 'visual' | 'sms'

  // Format Date YYYY-MM-DD
  const formattedDateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  // Navigate Date
  const changeDateByDays = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const cleanBranchName = (b) => (b || '').trim().toLowerCase().replace(/[\(\)\s_-]/g, '');

  const toTitleCase = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const formatNum = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US');
  };

  const formatSmsNumber = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return Math.round(Number(val)).toLocaleString();
  };

  // Helper to extract closing02 data for department robustly
  const getDataForDept = (closing02, dept) => {
    if (!closing02 || typeof closing02 !== 'object') return {};
    const dIdStr = (dept._id || dept.id || '').toString();
    const dName = (dept.name || '').trim();
    const dNameUpper = dName.toUpperCase();
    const dNameLower = dName.toLowerCase();

    if (dIdStr && closing02[dIdStr]) return closing02[dIdStr];
    if (dName && closing02[dName]) return closing02[dName];
    if (dNameUpper && closing02[dNameUpper]) return closing02[dNameUpper];
    if (dNameLower && closing02[dNameLower]) return closing02[dNameLower];

    for (const k of Object.keys(closing02)) {
      if (k.toLowerCase() === dNameLower) return closing02[k];
    }
    return {};
  };

  // Helper to extract opening amount for department
  const getOpeningForDept = (sheet, dept) => {
    if (!sheet || !Array.isArray(sheet.departmentOpening)) return 0;
    const dIdStr = (dept._id || dept.id || '').toString();
    const dNameUpper = (dept.name || '').trim().toUpperCase();

    const found = sheet.departmentOpening.find(x => {
      if (!x) return false;
      const xDeptId = x.department?._id ? x.department._id.toString() : (x.department ? x.department.toString() : '');
      if (xDeptId && dIdStr && xDeptId === dIdStr) return true;
      const xName = (x.department?.name || x.name || '').trim().toUpperCase();
      if (xName && dNameUpper && xName === dNameUpper) return true;
      return false;
    });
    return Number(found?.amount) || 0;
  };

  // 1. Initial Load of Metadata (Stores & Departments)
  const loadMetadata = async () => {
    try {
      const [storesRes, deptsRes] = await Promise.all([
        api.get('/stores'),
        api.get('/departments')
      ]);

      const storeList = storesRes?.data || storesRes || [];
      const branchList = Array.isArray(storeList)
        ? storeList.map(s => s.name || s.branch || s).filter(Boolean)
        : [];
      const uniqueBranches = Array.from(new Set(branchList));
      setBranches(uniqueBranches);

      const deptList = deptsRes?.data || deptsRes || [];
      setDepartments(Array.isArray(deptList) ? deptList : []);
    } catch (e) {
      console.warn('Error loading metadata:', e.message);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  // 2. Fetch Closing Sheets & Cash Sales
  // Calls the exact Web ERP endpoints: /closing-sheets?date=...&branch=... and /cash-sales?date=...&branch=...
  const fetchClosingData = useCallback(async () => {
    try {
      setLoading(true);

      const isAll = selectedBranch === 'All Branches';
      const promises = [
        api.get(`/closing-sheets/report?startDate=${formattedDateStr}&endDate=${formattedDateStr}`),
        api.get(isAll ? `/cash-sales?date=${formattedDateStr}` : `/cash-sales?date=${formattedDateStr}&branch=${encodeURIComponent(selectedBranch)}`)
      ];

      // If specific branch selected, query the single closing sheet directly just like Web ERP
      if (!isAll) {
        promises.push(
          api.get(`/closing-sheets?date=${formattedDateStr}&branch=${encodeURIComponent(selectedBranch)}`)
            .catch(err => {
              console.warn('Direct sheet fetch fallback:', err.message);
              return null;
            })
        );
      }

      const results = await Promise.all(promises);
      const sheetsRes = results[0];
      const cashSalesRes = results[1];
      const singleSheetRes = results[2];

      const sheets = sheetsRes?.data || sheetsRes || [];
      setClosingSheets(Array.isArray(sheets) ? sheets : []);

      const csList = cashSalesRes?.data || cashSalesRes || [];
      setCashSalesData(Array.isArray(csList) ? csList : []);

      if (singleSheetRes?.data) {
        setSingleSheet(singleSheetRes.data);
      } else {
        setSingleSheet(null);
      }
    } catch (e) {
      console.warn('Error fetching closing data:', e.message);
      Alert.alert('Notice', 'Could not load closing sheets for this date: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [formattedDateStr, selectedBranch]);

  useEffect(() => {
    fetchClosingData();
  }, [fetchClosingData]);

  // Identify which branches have submitted closing sheets (All branches overview)
  const branchStatusMap = useMemo(() => {
    const map = {};
    branches.forEach(b => {
      const curBranch = cleanBranchName(b);
      const found = closingSheets.find(s => {
        const sheetBranch = cleanBranchName(s.branch);
        return sheetBranch === curBranch || sheetBranch.includes(curBranch) || curBranch.includes(sheetBranch);
      });
      map[b] = {
        isClosed: Boolean(found),
        sheet: found || null
      };
    });
    return map;
  }, [branches, closingSheets]);

  const totalBranchesCount = branches.length;
  const closedBranchesCount = Object.values(branchStatusMap).filter(b => b.isClosed).length;

  // Summary totals for each branch when "All Branches" is selected
  const branchTotalsList = useMemo(() => {
    return branches.map(b => {
      const curBranch = cleanBranchName(b);
      const sheet = closingSheets.find(s => {
        const sheetBranch = cleanBranchName(s.branch);
        return sheetBranch === curBranch || sheetBranch.includes(curBranch) || curBranch.includes(sheetBranch);
      });

      let bSale = 0;
      let bCC = 0;
      let bDiff = 0;
      let bCashRec = 0;
      let bOpening = 0;
      let bDeductions = 0;

      if (sheet) {
        const c02 = sheet.closing02?.data || {};
        Object.keys(c02).forEach(k => {
          const v = c02[k];
          if (v && typeof v === 'object') {
            const sComp = Number(v.totalSaleComputer) || 0;
            bSale += sComp;
            bCC += Number(v.bankTotal) || 0;
            bDiff += Number(v.difference) || 0;
            bCashRec += Number(v.receivedCash) || 0;
            const rate = v.deduction !== undefined ? Number(v.deduction) : 0;
            bDeductions += Math.round((sComp * rate) / 100);
          }
        });

        if (Array.isArray(sheet.departmentOpening)) {
          sheet.departmentOpening.forEach(x => {
            bOpening += Number(x?.amount) || 0;
          });
        }
      }

      // Add auto cash sales for this branch
      const bSales = cashSalesData.filter(s => {
        const sBranch = cleanBranchName(s.branch);
        return sBranch === curBranch || sBranch.includes(curBranch) || curBranch.includes(sBranch);
      });
      const autoSale = bSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
      bSale += autoSale;

      const physicalCash = bCashRec > 0 ? bCashRec : Math.max(0, bSale - bCC);
      const netCash = Math.max(0, bOpening + physicalCash - bDeductions);

      return {
        branch: b,
        isClosed: Boolean(sheet),
        totalSale: bSale,
        totalCC: bCC,
        totalCashReceived: physicalCash,
        difference: bDiff,
        openingCash: bOpening,
        deductions: bDeductions,
        netCash: netCash
      };
    });
  }, [branches, closingSheets, cashSalesData]);

  // Active closing sheets for currently selected branch
  const activeSheets = useMemo(() => {
    if (selectedBranch === 'All Branches') {
      return closingSheets;
    }
    if (singleSheet && (singleSheet.closing02 || singleSheet.departmentOpening)) {
      return [singleSheet];
    }
    const target = cleanBranchName(selectedBranch);
    return closingSheets.filter(s => {
      const sb = cleanBranchName(s.branch);
      return sb === target || sb.includes(target) || target.includes(sb);
    });
  }, [closingSheets, selectedBranch, singleSheet]);

  // STRICT Filter: Only departments belonging to the selected branch!
  const candidateDepts = useMemo(() => {
    if (!departments || departments.length === 0) return [];
    if (selectedBranch === 'All Branches') {
      return departments.filter(d => d.isActive !== false);
    }

    const target = cleanBranchName(selectedBranch);
    const branchMatched = departments.filter(d => {
      if (d.isActive === false) return false;
      const dbBranch = cleanBranchName(d.branch);
      return dbBranch === target || dbBranch.includes(target) || target.includes(dbBranch);
    });

    if (branchMatched.length > 0) return branchMatched;

    // Fallback: check if department IDs or names match activeSheets closing02
    return departments.filter(d => {
      const dIdStr = (d._id || d.id || '').toString();
      const dName = (d.name || '').trim().toLowerCase();
      return activeSheets.some(s => {
        const c02 = s.closing02?.data || {};
        if (c02[dIdStr]) return true;
        for (const k of Object.keys(c02)) {
          if (k.toLowerCase() === dName) return true;
        }
        return false;
      });
    });
  }, [departments, selectedBranch, activeSheets]);

  // Aggregate Department Data & SMS figures (Exact match to Web ERP closing-sheet.js)
  const aggregatedData = useMemo(() => {
    let totalSale = 0;
    let totalCC = 0;
    let totalDifference = 0;

    const mainDepts = [];
    const cashCounterEntries = [];
    const allCalculatedDepts = [];

    candidateDepts.forEach(d => {
      const dId = d._id || d.id;
      const dName = d.name || 'Unknown';
      const upperName = dName.trim().toUpperCase();

      // Exclude "Cash Received From Counter" / "CASH REC FROM COUNTER" from department-wise breakdown
      const isCashRecCounter = (
        (upperName.includes('CASH REC') || upperName.includes('CASH RECEIVED') || upperName.includes('CASH RECEIVE')) &&
        upperName.includes('COUNTER')
      ) || upperName === 'CASH REC FROM COUNTER' || upperName === 'CASH RECEIVED FROM COUNTER';

      if (isCashRecCounter) {
        return;
      }

      const isMain = Boolean(d.closing2DeptDropDown);

      let manualSale = 0;
      let ccSale = 0;
      let discValue = 0;
      let discPer = 0;
      let diff = 0;
      let recCash = 0;
      let opAmt = 0;

      activeSheets.forEach(sheet => {
        const c02 = sheet.closing02?.data || {};
        const data = getDataForDept(c02, d);

        manualSale += Number(data.totalSaleComputer) || 0;
        ccSale += Number(data.bankTotal) || 0;
        discValue += Number(data.discountValue) || 0;
        if (data.discountPer) discPer = Number(data.discountPer);
        diff += Number(data.difference) || 0;
        recCash += Number(data.receivedCash) || 0;

        opAmt += getOpeningForDept(sheet, d);
      });

      // Cash sales matching this department
      const deptSales = cashSalesData.filter(s => {
        const sDeptId = s.department ? (s.department._id || s.department).toString() : null;
        return sDeptId === String(dId) || (s.cashCounter && s.cashCounter.toUpperCase() === dName.toUpperCase());
      });
      const autoSale = deptSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
      const combinedSale = manualSale + autoSale;

      // Filter out departments with ZERO activity so ghost departments never clutter the screen
      const hasAnyData = combinedSale > 0 || ccSale > 0 || recCash > 0 || diff !== 0 || discValue > 0 || opAmt > 0;
      if (!hasAnyData) return;

      const deptItem = {
        id: dId,
        name: dName,
        isMain,
        sale: combinedSale,
        manualSale,
        autoSale,
        ccSale,
        discValue,
        discPer,
        diff,
        receivedCash: recCash,
        opening: opAmt
      };

      allCalculatedDepts.push(deptItem);

      if (isMain) {
        mainDepts.push(deptItem);
      } else {
        cashCounterEntries.push(deptItem);
      }

      totalSale += combinedSale;
      totalCC += ccSale;
      totalDifference += diff;
    });

    // All section cash received sum (Physical cash received from all counters/departments)
    let totalCashReceived = 0;
    allCalculatedDepts.forEach(d => {
      const rec = d.receivedCash > 0 ? d.receivedCash : Math.max(0, d.sale - d.ccSale);
      totalCashReceived += rec;
    });

    // Net Cash in Hand for Daily Sale: sum of cash received across all sections, or fallback to (totalSale - totalCC)
    const netCashInHand = totalCashReceived > 0 ? totalCashReceived : Math.max(0, totalSale - totalCC);

    // Cash Activity Items (matching Web ERP generateSMSPreview logic)
    const totalCounterSales = cashSalesData.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

    let totalPercentageCashSum = 0;
    candidateDepts.forEach(d => {
      if ((d.name || '').toUpperCase() === 'PERCENTAGE CASH') return;
      activeSheets.forEach(sheet => {
        const c02 = sheet.closing02?.data || {};
        const state = getDataForDept(c02, d);
        const sComp = Number(state.totalSaleComputer) || 0;
        const rate = state.deduction !== undefined ? Number(state.deduction) : (Number(d.deduction) || 0);
        totalPercentageCashSum += Math.round((sComp * rate) / 100);
      });
    });

    let cashActivityTotalNet = 0;
    let totalOpeningCash = 0;
    let totalDeductions = 0;
    const cashActivityList = [];

    candidateDepts.forEach(dept => {
      const dName = (dept.name || '').toUpperCase();
      let deptOp = 0;
      let recCashSheet = 0;
      let saleComp = 0;
      let savedRate = dept.deduction || 0;

      activeSheets.forEach(sheet => {
        const c02 = sheet.closing02?.data || {};
        const state = getDataForDept(c02, dept);
        deptOp += getOpeningForDept(sheet, dept);
        recCashSheet += Number(state.receivedCash) || 0;
        saleComp += Number(state.totalSaleComputer) || 0;
        if (state.deduction !== undefined) savedRate = Number(state.deduction);
      });

      if (deptOp === 0 && dName !== 'OPTICS' && dName !== 'PERCENTAGE CASH' && recCashSheet === 0) {
        return;
      }

      let recCashCounter = 0;
      if (dName === 'OPTICS') {
        recCashCounter = totalCounterSales;
      }
      let recCash = recCashSheet + recCashCounter;
      if (dName === 'PERCENTAGE CASH') {
        recCash = 0;
      }

      const ded = Math.round((saleComp * savedRate) / 100);
      let percCashRec = 0;
      if (dName === 'PERCENTAGE CASH') {
        percCashRec = totalPercentageCashSum;
      }

      let grandTotal = Math.round(deptOp + recCash + (dName === 'PERCENTAGE CASH' ? percCashRec : 0));
      const isCashRecFromCounterDept = (
        (dName.includes('CASH REC') || dName.includes('CASH RECEIVED')) &&
        dName.includes('COUNTER')
      );
      if (isCashRecFromCounterDept) grandTotal = 0;

      const netTotal = Math.round(grandTotal - ded);
      cashActivityTotalNet += netTotal;

      if (!isCashRecFromCounterDept) {
        totalOpeningCash += deptOp;
        totalDeductions += ded;
        cashActivityList.push({
          id: dept._id || dept.id,
          name: toTitleCase(dept.name),
          opening: deptOp,
          receivedCash: dName === 'PERCENTAGE CASH' ? percCashRec : recCash,
          deduction: ded,
          netCash: netTotal
        });
      }
    });

    // Income Statement figures (matching Web ERP generateSMSPreview)
    let closingBalance = 0;
    activeSheets.forEach(sheet => {
      closingBalance += parseFloat(sheet.closing01?.diffBalance || sheet.diffBalance) || 0;
    });

    let cashCounterByDept = {};
    let totalCashCounterSale = 0;
    cashSalesData.forEach(s => {
      let deptName = 'Unknown';
      if (s.department && typeof s.department === 'object' && s.department.name) {
        deptName = s.department.name;
      } else if (s.department && typeof s.department === 'string') {
        deptName = s.department;
      } else if (s.cashCounter) {
        deptName = s.cashCounter;
      }
      const amount = Number(s.totalAmount) || 0;
      if (!cashCounterByDept[deptName]) cashCounterByDept[deptName] = 0;
      cashCounterByDept[deptName] += amount;
      totalCashCounterSale += amount;
    });

    const calculatedOpening = closingBalance - totalCashCounterSale;

    return {
      totalSale,
      totalCC,
      totalDifference,
      totalCashReceived,
      netCashInHand,
      cashActivityTotalNet,
      totalNetCash: cashActivityTotalNet,
      totalOpeningCash,
      totalDeductions,
      departments: allCalculatedDepts,
      mainDepts,
      cashCounterEntries,
      cashActivityList,
      incomeStatement: {
        closingBalance,
        calculatedOpening,
        totalCashCounterSale,
        cashCounterByDept
      }
    };
  }, [activeSheets, candidateDepts, cashSalesData]);

  // Generate Official SMS Text (100% Exact match to Web ERP generateSMSPreview())
  const generatedSMSText = useMemo(() => {
    const branchLabel = selectedBranch === 'All Branches' ? 'All Branches' : toTitleCase(selectedBranch);
    const dateLabel = formattedDateStr;

    if (activeReportMode === 'daily_sale') {
      let t = `Daily Sale 🔴\n`;
      t += `Branch: (${branchLabel})\n`;
      t += `Date: ${dateLabel}\n`;
      t += `Total Sale: ${formatSmsNumber(aggregatedData.totalSale)}\n`;
      t += `Total CC Sale: ${formatSmsNumber(aggregatedData.totalCC)}\n`;

      aggregatedData.mainDepts.forEach(dept => {
        t += `${toTitleCase(dept.name)} Sale: ${formatSmsNumber(dept.sale)}\n`;
        t += `${toTitleCase(dept.name)} Disc Value: ${formatSmsNumber(dept.discValue)}\n`;
        t += `${toTitleCase(dept.name)} Disc Per: ${formatSmsNumber(dept.discPer)}\n`;
        t += `${toTitleCase(dept.name)} CC Sale: ${formatSmsNumber(dept.ccSale)}\n`;
        t += `${toTitleCase(dept.name)} Diff: ${formatSmsNumber(dept.diff)}\n`;
      });

      aggregatedData.cashCounterEntries.forEach(entry => {
        t += `${toTitleCase(entry.name)} Sale: ${formatSmsNumber(entry.sale)}\n`;
      });

      return t.trim();
    }

    if (activeReportMode === 'cash_activity') {
      let t = `Cash Activity 🔴\n`;
      t += `Branch: (${branchLabel})\n`;
      t += `Date: ${dateLabel}\n`;

      aggregatedData.cashActivityList.forEach(item => {
        t += `${item.name} Cash: ${formatSmsNumber(item.netCash)}\n`;
      });

      t += `Total Net Cash: ${formatSmsNumber(aggregatedData.totalNetCash)}\n`;
      return t.trim();
    }

    if (activeReportMode === 'income_statement') {
      let t = `(${branchLabel})\n`;
      t += `Date: ${dateLabel}\n`;
      t += `Daily Sale and Cash Details\n`;

      const deptNames = Object.keys(aggregatedData.incomeStatement.cashCounterByDept);
      if (deptNames.length > 0) {
        deptNames.forEach(name => {
          t += `${toTitleCase(name)} Cash Sale = ${formatSmsNumber(aggregatedData.incomeStatement.cashCounterByDept[name])}\n`;
        });
      }
      t += `Total = ${formatSmsNumber(aggregatedData.incomeStatement.totalCashCounterSale)}\n\n`;

      t += `Cash Activity\n`;
      t += `Opening Balance = ${formatSmsNumber(aggregatedData.incomeStatement.calculatedOpening)}\n`;
      t += `Cash Sale = ${formatSmsNumber(aggregatedData.incomeStatement.totalCashCounterSale)}\n`;
      t += `Total Balance = ${formatSmsNumber(aggregatedData.incomeStatement.closingBalance)}\n`;
      return t.trim();
    }

    if (activeReportMode === 'dept_wise_activity') {
      let t = `Daily Sale 🔴\n`;
      t += `Branch: (${branchLabel})\n`;
      t += `Date: ${dateLabel}\n`;
      t += `Total Sale: ${formatSmsNumber(aggregatedData.totalSale)}\n`;
      t += `Total CC Sale: ${formatSmsNumber(aggregatedData.totalCC)}\n`;

      aggregatedData.mainDepts.forEach(dept => {
        t += `${toTitleCase(dept.name)} Sale: ${formatSmsNumber(dept.sale)}\n`;
        t += `${toTitleCase(dept.name)} Disc Value: ${formatSmsNumber(dept.discValue)}\n`;
        t += `${toTitleCase(dept.name)} Disc Per: ${formatSmsNumber(dept.discPer)}\n`;
        t += `${toTitleCase(dept.name)} CC Sale: ${formatSmsNumber(dept.ccSale)}\n`;
        t += `${toTitleCase(dept.name)} Diff: ${formatSmsNumber(dept.diff)}\n`;
      });

      aggregatedData.cashCounterEntries.forEach(entry => {
        t += `${toTitleCase(entry.name)} Sale: ${formatSmsNumber(entry.sale)}\n`;
      });

      t += `\n\nCash Activity 🔴\n`;
      t += `Branch: (${branchLabel})\n`;
      t += `Date: ${dateLabel}\n`;

      aggregatedData.cashActivityList.forEach(item => {
        t += `${item.name} Cash: ${formatSmsNumber(item.netCash)}\n`;
      });

      t += `Total Net Cash: ${formatSmsNumber(aggregatedData.totalNetCash)}\n`;
      return t.trim();
    }

    return '';
  }, [activeReportMode, selectedBranch, formattedDateStr, aggregatedData]);

  // Share to WhatsApp
  const handleShareWhatsApp = async () => {
    try {
      const url = `whatsapp://send?text=${encodeURIComponent(generatedSMSText)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: generatedSMSText });
      }
    } catch (e) {
      Share.share({ message: generatedSMSText });
    }
  };

  // Universal Share / Copy
  const handleCopyOrShare = async () => {
    try {
      await Share.share({
        message: generatedSMSText,
        title: `Night Closing - ${selectedBranch} (${formattedDateStr})`
      });
    } catch (e) {
      Alert.alert('Share Error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack || (() => navigation?.goBack?.())}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Branch Night Closing</Text>
          <Text style={styles.headerSubtitle}>Executive SMS & Sales Hub</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            setRefreshing(true);
            fetchClosingData();
          }}
        >
          <Text style={styles.refreshBtnText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Date Navigator Bar */}
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.dateArrowBtn} onPress={() => changeDateByDays(-1)}>
          <Text style={styles.dateArrowText}>◀</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateCenterBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateCalendarIcon}>📅</Text>
          <Text style={styles.dateCenterText}>
            {selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
          <Text style={styles.dateDropdownArrow}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateArrowBtn} onPress={() => changeDateByDays(1)}>
          <Text style={styles.dateArrowText}>▶</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.todayQuickChip}
          onPress={() => setSelectedDate(new Date())}
        >
          <Text style={styles.todayQuickText}>Today</Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {/* Branch Status Strip (Closing Status at a Glance) */}
      <View style={styles.branchStatusContainer}>
        <View style={styles.branchStatusHeaderRow}>
          <Text style={styles.branchStatusTitle}>Store Branches Reconciled</Text>
          <View style={styles.branchStatusCountBadge}>
            <Text style={styles.branchStatusCountText}>
              🟢 {closedBranchesCount} / {totalBranchesCount} Closed Tonight
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
          {/* All Branches Option */}
          <TouchableOpacity
            style={[styles.branchPill, selectedBranch === 'All Branches' && styles.branchPillActive]}
            onPress={() => setSelectedBranch('All Branches')}
            activeOpacity={0.7}
          >
            <Text style={[styles.branchPillText, selectedBranch === 'All Branches' && styles.branchPillTextActive]}>
              🌍 All Branches
            </Text>
          </TouchableOpacity>

          {/* Individual Branches */}
          {branches.map((b, idx) => {
            const isClosed = branchStatusMap[b]?.isClosed;
            const isSelected = selectedBranch === b;
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.branchPill,
                  isSelected && styles.branchPillActive,
                  isClosed ? styles.branchPillClosed : styles.branchPillPending
                ]}
                onPress={() => setSelectedBranch(b)}
                activeOpacity={0.7}
              >
                <Text style={styles.branchPillDot}>{isClosed ? '🟢' : '🟡'}</Text>
                <Text style={[styles.branchPillText, isSelected && styles.branchPillTextActive]}>
                  {b}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Mode Selector Tabs (Daily Sale, Cash Activity, Income Statement, Dept & Activity) */}
      <View style={styles.reportTabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.reportTabsScroll}
        >
          {REPORT_MODES.map((mode) => {
            const isActive = activeReportMode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[styles.reportTabBtn, isActive && styles.reportTabBtnActive]}
                onPress={() => setActiveReportMode(mode.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.reportTabIcon}>{mode.icon}</Text>
                <Text
                  style={[styles.reportTabText, isActive && styles.reportTabTextActive]}
                  numberOfLines={1}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* View Switcher (Visual Cards vs Raw SMS Text) */}
      <View style={styles.viewSwitcherBar}>
        <TouchableOpacity
          style={[styles.viewSwitchItem, viewType === 'visual' && styles.viewSwitchItemActive]}
          onPress={() => setViewType('visual')}
        >
          <Text style={[styles.viewSwitchText, viewType === 'visual' && styles.viewSwitchTextActive]}>
            📱 Visual Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewSwitchItem, viewType === 'sms' && styles.viewSwitchItemActive]}
          onPress={() => setViewType('sms')}
        >
          <Text style={[styles.viewSwitchText, viewType === 'sms' && styles.viewSwitchTextActive]}>
            💬 Standard SMS Text
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>Fetching closing figures for {formattedDateStr}...</Text>
        </View>
      ) : activeSheets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🌙</Text>
          <Text style={styles.emptyTitle}>Closing Sheet Not Submitted Yet</Text>
          <Text style={styles.emptySubtext}>
            {selectedBranch === 'All Branches'
              ? `No branch has submitted night closing for ${formattedDateStr} yet.`
              : `Branch ${selectedBranch} has not submitted their daily closing sheet for ${formattedDateStr}.`}
          </Text>
        </View>
      ) : viewType === 'visual' ? (
        /* VISUAL EXECUTIVE DASHBOARD - Dynamic by activeReportMode */
        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 120 }}>
          
          {/* TAB 1: DAILY SALE VIEW */}
          {activeReportMode === 'daily_sale' && (
            <>
              {/* Daily Sale KPI Grid */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderColor: 'rgba(2, 132, 199, 0.4)', backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>TOTAL COMPUTER SALE</Text>
                    <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>Rs. {formatNum(aggregatedData.totalSale)}</Text>
                    <Text style={styles.kpiSub}>From Computer Register</Text>
                  </View>

                  <View style={[styles.kpiCard, { borderColor: 'rgba(168, 85, 247, 0.4)', backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>CREDIT CARD / BANK</Text>
                    <Text style={[styles.kpiValue, { color: '#C084FC' }]}>Rs. {formatNum(aggregatedData.totalCC)}</Text>
                    <Text style={styles.kpiSub}>CC Swiped at Counters</Text>
                  </View>
                </View>

                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>TOTAL CASH RECEIVED</Text>
                    <Text style={[styles.kpiValue, { color: '#10B981' }]}>Rs. {formatNum(aggregatedData.totalCashReceived)}</Text>
                    <Text style={styles.kpiSub}>All Sections Cash Received</Text>
                  </View>

                  <View style={[
                    styles.kpiCard,
                    aggregatedData.totalDifference < 0
                      ? { borderColor: 'rgba(239, 68, 68, 0.5)', backgroundColor: 'rgba(239, 68, 68, 0.12)' }
                      : { borderColor: 'rgba(51, 65, 85, 0.6)', backgroundColor: 'rgba(15, 23, 42, 0.6)' }
                  ]}>
                    <Text style={styles.kpiLabel}>CASH SHORTAGE / DIFF</Text>
                    <Text style={[
                      styles.kpiValue,
                      { color: aggregatedData.totalDifference < 0 ? '#EF4444' : '#94A3B8' }
                    ]}>
                      {aggregatedData.totalDifference === 0
                        ? 'Rs. 0 (Clean ✓)'
                        : `Rs. ${formatNum(aggregatedData.totalDifference)} ${aggregatedData.totalDifference < 0 ? '🔴 Short' : '🟢 Excess'}`}
                    </Text>
                    <Text style={styles.kpiSub}>Physical vs System Diff</Text>
                  </View>
                </View>
              </View>

              {/* ALL BRANCHES: Show Cards for Totals Only! SINGLE BRANCH: Show Full Department Breakdown */}
              {selectedBranch === 'All Branches' ? (
                <>
                  {/* Additional Total Overview Cards */}
                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiCard, { borderColor: 'rgba(56, 189, 248, 0.4)', backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>NET CASH IN HAND</Text>
                      <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>Rs. {formatNum(aggregatedData.netCashInHand)}</Text>
                      <Text style={styles.kpiSub}>All Branches Physical Net</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>STORE RECONCILIATION</Text>
                      <Text style={[styles.kpiValue, { color: '#10B981' }]}>{closedBranchesCount} / {totalBranchesCount}</Text>
                      <Text style={styles.kpiSub}>Branches Closed Tonight</Text>
                    </View>
                  </View>

                  {/* Branch-Wise Total Sales Cards */}
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🏪 Store Branches Total Sales (Totals Only)</Text>
                    <Text style={styles.deptSectionBadge}>{branches.length} Branches</Text>
                  </View>

                  {branchTotalsList.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No branch totals available for this date.</Text>
                    </View>
                  ) : (
                    branchTotalsList.map((b, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.branchTotalCard}
                        onPress={() => setSelectedBranch(b.branch)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.branchTotalCardHeader}>
                          <View style={styles.deptNameRow}>
                            <Text style={{ fontSize: 13 }}>{b.isClosed ? '🟢' : '🟡'}</Text>
                            <Text style={styles.branchTotalCardTitle}>{b.branch}</Text>
                          </View>
                          <View style={[
                            styles.branchTotalStatusBadge,
                            b.isClosed ? styles.statusBadgeClosed : styles.statusBadgePending
                          ]}>
                            <Text style={[
                              styles.branchTotalStatusText,
                              b.isClosed ? styles.statusTextClosed : styles.statusTextPending
                            ]}>
                              {b.isClosed ? 'Closed ✓' : 'Pending'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalGrid}>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Total Sale</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#38BDF8' }]}>Rs. {formatNum(b.totalSale)}</Text>
                          </View>

                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Cash Received</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#10B981' }]}>Rs. {formatNum(b.totalCashReceived)}</Text>
                          </View>

                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>CC / Bank</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#C084FC' }]}>Rs. {formatNum(b.totalCC)}</Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalCardFooter}>
                          <Text style={styles.branchTotalHint}>Tap to view department breakdown →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              ) : (
                /* SINGLE BRANCH: Department Breakdown Section */
                <>
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🏢 Department Wise Breakdown (SMS Flow)</Text>
                    <Text style={styles.deptSectionBadge}>{aggregatedData.departments.length} Active</Text>
                  </View>

                  {aggregatedData.departments.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No active department sales recorded for this branch.</Text>
                    </View>
                  ) : (
                    aggregatedData.departments.map((dept, idx) => {
                      const hasDifference = dept.diff !== 0;
                      const cashRec = dept.receivedCash || Math.max(0, dept.sale - dept.ccSale);
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.deptCard,
                            hasDifference && dept.diff < 0 && styles.deptCardWarning
                          ]}
                        >
                          {/* Department Header */}
                          <View style={styles.deptCardHeader}>
                            <View style={styles.deptNameRow}>
                              <Text style={styles.deptIcon}>
                                {dept.name.toLowerCase().includes('med') ? '💊' : dept.name.toLowerCase().includes('groc') ? '🛒' : dept.name.toLowerCase().includes('cosm') ? '💄' : '📦'}
                              </Text>
                              <Text style={styles.deptName}>{toTitleCase(dept.name)}</Text>
                            </View>
                            <View style={styles.deptBadgeTag}>
                              <Text style={styles.deptBadgeTagText}>{dept.isMain ? 'Main Department' : 'Cash Counter'}</Text>
                            </View>
                          </View>

                          {/* Sequential SMS Flow for this Department */}
                          <View style={styles.smsSequenceContainer}>
                            {/* 1. Sale */}
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>1. {toTitleCase(dept.name)} Sale:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#38BDF8', fontWeight: '800' }]}>
                                Rs. {formatNum(dept.sale)}
                              </Text>
                            </View>

                            {/* 2. Cash Received */}
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>2. Cash Received:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#10B981', fontWeight: '700' }]}>
                                Rs. {formatNum(cashRec)}
                              </Text>
                            </View>

                            {/* 3. CC Sale / Bank */}
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>3. CC Sale (Card Payment):</Text>
                              <Text style={[styles.smsSeqValue, { color: '#C084FC', fontWeight: '700' }]}>
                                Rs. {formatNum(dept.ccSale)}
                              </Text>
                            </View>

                            {/* 4. Discount */}
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>4. Discount:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#F59E0B' }]}>
                                Rs. {formatNum(dept.discValue)} {dept.discPer ? `(${dept.discPer}%)` : ''}
                              </Text>
                            </View>

                            {/* 5. Difference */}
                            <View style={[styles.smsSeqRow, styles.smsSeqRowDiff]}>
                              <Text style={styles.smsSeqLabel}>5. Difference / Diff:</Text>
                              <View style={[
                                styles.diffPill,
                                dept.diff === 0 ? styles.diffPillClean : dept.diff < 0 ? styles.diffPillShort : styles.diffPillExcess
                              ]}>
                                <Text style={[
                                  styles.diffPillText,
                                  dept.diff === 0 ? styles.diffTextClean : dept.diff < 0 ? styles.diffTextShort : styles.diffTextExcess
                                ]}>
                                  {dept.diff === 0 ? 'Rs. 0 (Balanced ✓)' : `Rs. ${formatNum(dept.diff)} ${dept.diff < 0 ? '🔴 Short' : '🟢 Excess'}`}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </>
          )}

          {/* TAB 2: CASH ACTIVITY VIEW */}
          {activeReportMode === 'cash_activity' && (
            <>
              {/* Cash Activity Top KPIs */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)', flex: 1.5 }]}>
                    <Text style={styles.kpiLabel}>TOTAL NET CASH IN HAND</Text>
                    <Text style={[styles.kpiValue, { color: '#10B981', fontSize: 18 }]}>Rs. {formatNum(aggregatedData.totalNetCash)}</Text>
                    <Text style={styles.kpiSub}>Final Reconciled Net</Text>
                  </View>

                  <View style={[styles.kpiCard, { borderColor: 'rgba(2, 132, 199, 0.4)', backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>TOTAL CASH RECEIVED</Text>
                    <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>Rs. {formatNum(aggregatedData.totalCashReceived)}</Text>
                    <Text style={styles.kpiSub}>All Sections</Text>
                  </View>
                </View>

                {selectedBranch === 'All Branches' && (
                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiCard, { borderColor: 'rgba(245, 158, 11, 0.4)', backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>TOTAL OPENING CASH</Text>
                      <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>Rs. {formatNum(aggregatedData.totalOpeningCash)}</Text>
                      <Text style={styles.kpiSub}>All Branches Opening</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>TOTAL DEDUCTIONS</Text>
                      <Text style={[styles.kpiValue, { color: '#EF4444' }]}>Rs. {formatNum(aggregatedData.totalDeductions)}</Text>
                      <Text style={styles.kpiSub}>All Sections Deductions</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* ALL BRANCHES: Only Cards for Totals! SINGLE BRANCH: Department Cash Movement */}
              {selectedBranch === 'All Branches' ? (
                <>
                  {/* Consolidated Cash Summary Card */}
                  <View style={styles.reconCard}>
                    <Text style={styles.reconCardTitle}>💵 All Branches Cash Reconciliation</Text>
                    <View style={styles.reconRow}>
                      <Text style={styles.reconLabel}>Total Opening Cash:</Text>
                      <Text style={styles.reconValue}>Rs. {formatNum(aggregatedData.totalOpeningCash)}</Text>
                    </View>
                    <View style={styles.reconRow}>
                      <Text style={styles.reconLabel}>(+) Total Cash Received:</Text>
                      <Text style={[styles.reconValue, { color: '#10B981' }]}>Rs. {formatNum(aggregatedData.totalCashReceived)}</Text>
                    </View>
                    <View style={styles.reconRow}>
                      <Text style={styles.reconLabel}>(-) Total Deductions:</Text>
                      <Text style={[styles.reconValue, { color: '#EF4444' }]}>Rs. {formatNum(aggregatedData.totalDeductions)}</Text>
                    </View>
                    <View style={[styles.reconRow, styles.reconRowTotal]}>
                      <Text style={[styles.reconLabel, { color: '#F8FAFC', fontWeight: '800' }]}>(=) Total Net Cash in Hand:</Text>
                      <Text style={[styles.reconValue, { color: '#10B981', fontWeight: '800' }]}>
                        Rs. {formatNum(aggregatedData.totalNetCash)}
                      </Text>
                    </View>
                  </View>

                  {/* Branch Wise Cash Movement Cards (Totals Only) */}
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🏪 Branch Cash Movement (Totals Only)</Text>
                    <Text style={styles.deptSectionBadge}>{branches.length} Branches</Text>
                  </View>

                  {branchTotalsList.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No branch cash totals available for this date.</Text>
                    </View>
                  ) : (
                    branchTotalsList.map((b, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.branchTotalCard}
                        onPress={() => setSelectedBranch(b.branch)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.branchTotalCardHeader}>
                          <View style={styles.deptNameRow}>
                            <Text style={{ fontSize: 13 }}>{b.isClosed ? '🟢' : '🟡'}</Text>
                            <Text style={styles.branchTotalCardTitle}>{b.branch}</Text>
                          </View>
                          <View style={styles.cashActNetPill}>
                            <Text style={styles.cashActNetLabel}>Net: </Text>
                            <Text style={styles.cashActNetValue}>Rs. {formatNum(b.netCash)}</Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalGrid}>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Opening Cash</Text>
                            <Text style={styles.branchTotalColValue}>Rs. {formatNum(b.openingCash)}</Text>
                          </View>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Cash Received</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#10B981' }]}>Rs. {formatNum(b.totalCashReceived)}</Text>
                          </View>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Deductions</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#EF4444' }]}>Rs. {formatNum(b.deductions)}</Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalCardFooter}>
                          <Text style={styles.branchTotalHint}>Tap to view department cash movement →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              ) : (
                /* SINGLE BRANCH: Department Cash Movement List */
                <>
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>💵 Department Cash Movement</Text>
                    <Text style={styles.deptSectionBadge}>{aggregatedData.cashActivityList.length} Depts</Text>
                  </View>

                  {aggregatedData.cashActivityList.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No department cash activity recorded for this date.</Text>
                    </View>
                  ) : (
                    aggregatedData.cashActivityList.map((item, idx) => (
                      <View key={idx} style={styles.cashActCard}>
                        <View style={styles.cashActHeader}>
                          <Text style={styles.cashActTitle}>{item.name}</Text>
                          <View style={styles.cashActNetPill}>
                            <Text style={styles.cashActNetLabel}>Net: </Text>
                            <Text style={styles.cashActNetValue}>Rs. {formatNum(item.netCash)}</Text>
                          </View>
                        </View>

                        <View style={styles.cashActGrid}>
                          <View style={styles.cashActGridCol}>
                            <Text style={styles.cashActGridLabel}>Opening Cash</Text>
                            <Text style={styles.cashActGridValue}>Rs. {formatNum(item.opening)}</Text>
                          </View>

                          <View style={styles.cashActGridCol}>
                            <Text style={styles.cashActGridLabel}>Cash Received</Text>
                            <Text style={[styles.cashActGridValue, { color: '#10B981' }]}>Rs. {formatNum(item.receivedCash)}</Text>
                          </View>

                          <View style={styles.cashActGridCol}>
                            <Text style={styles.cashActGridLabel}>Deductions</Text>
                            <Text style={[styles.cashActGridValue, { color: '#EF4444' }]}>Rs. {formatNum(item.deduction)}</Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </>
              )}
            </>
          )}

          {/* TAB 3: INCOME STATEMENT VIEW */}
          {activeReportMode === 'income_statement' && (
            <>
              {/* Income Statement Top KPIs */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderColor: 'rgba(2, 132, 199, 0.4)', backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>CASH COUNTER SALES</Text>
                    <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>
                      Rs. {formatNum(aggregatedData.incomeStatement.totalCashCounterSale)}
                    </Text>
                    <Text style={styles.kpiSub}>Counters Combined</Text>
                  </View>

                  <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>CLOSING BALANCE</Text>
                    <Text style={[styles.kpiValue, { color: '#10B981' }]}>
                      Rs. {formatNum(aggregatedData.incomeStatement.closingBalance)}
                    </Text>
                    <Text style={styles.kpiSub}>Night Handover Balance</Text>
                  </View>
                </View>
              </View>

              {/* Department breakdown ONLY for single branch */}
              {selectedBranch !== 'All Branches' && (
                <>
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🛒 Daily Cash Counter Sales by Dept</Text>
                  </View>

                  {Object.keys(aggregatedData.incomeStatement.cashCounterByDept).length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No cash sales logged on counters for this date.</Text>
                    </View>
                  ) : (
                    Object.entries(aggregatedData.incomeStatement.cashCounterByDept).map(([dept, amount], idx) => (
                      <View key={idx} style={styles.incStatRowCard}>
                        <Text style={styles.incStatDeptName}>{toTitleCase(dept)} Cash Sale</Text>
                        <Text style={styles.incStatDeptAmt}>Rs. {formatNum(amount)}</Text>
                      </View>
                    ))
                  )}
                </>
              )}

              {/* Cash Activity Reconciliation Card (Cards for totals) */}
              <View style={styles.reconCard}>
                <Text style={styles.reconCardTitle}>📑 Cash Activity Summary</Text>

                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>Opening Balance:</Text>
                  <Text style={styles.reconValue}>Rs. {formatNum(aggregatedData.incomeStatement.calculatedOpening)}</Text>
                </View>

                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>(+) Cash Counter Sale:</Text>
                  <Text style={[styles.reconValue, { color: '#38BDF8' }]}>Rs. {formatNum(aggregatedData.incomeStatement.totalCashCounterSale)}</Text>
                </View>

                <View style={[styles.reconRow, styles.reconRowTotal]}>
                  <Text style={[styles.reconLabel, { color: '#F8FAFC', fontWeight: '800' }]}>(=) Total Closing Balance:</Text>
                  <Text style={[styles.reconValue, { color: '#10B981', fontWeight: '800' }]}>
                    Rs. {formatNum(aggregatedData.incomeStatement.closingBalance)}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* TAB 4: DEPT WISE ACTIVITY VIEW */}
          {activeReportMode === 'dept_wise_activity' && (
            <>
              {/* Dept & Activity Overview KPIs */}
              <View style={styles.kpiContainer}>
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderColor: 'rgba(2, 132, 199, 0.4)', backgroundColor: 'rgba(2, 132, 199, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>TOTAL SALES</Text>
                    <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>Rs. {formatNum(aggregatedData.totalSale)}</Text>
                    <Text style={styles.kpiSub}>Computer Registers</Text>
                  </View>

                  <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                    <Text style={styles.kpiLabel}>TOTAL CASH RECEIVED</Text>
                    <Text style={[styles.kpiValue, { color: '#10B981' }]}>Rs. {formatNum(aggregatedData.totalCashReceived)}</Text>
                    <Text style={styles.kpiSub}>All Sections Cash Received</Text>
                  </View>
                </View>

                {selectedBranch === 'All Branches' && (
                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiCard, { borderColor: 'rgba(168, 85, 247, 0.4)', backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>CREDIT CARD / BANK</Text>
                      <Text style={[styles.kpiValue, { color: '#C084FC' }]}>Rs. {formatNum(aggregatedData.totalCC)}</Text>
                      <Text style={styles.kpiSub}>Card Payments</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                      <Text style={styles.kpiLabel}>TOTAL NET CASH</Text>
                      <Text style={[styles.kpiValue, { color: '#10B981' }]}>Rs. {formatNum(aggregatedData.totalNetCash)}</Text>
                      <Text style={styles.kpiSub}>Net Cash Movement</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* ALL BRANCHES: Only Cards for Totals! SINGLE BRANCH: Combined Department Cards */}
              {selectedBranch === 'All Branches' ? (
                <>
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🏪 Store Branches Activity (Totals Only)</Text>
                    <Text style={styles.deptSectionBadge}>{branches.length} Branches</Text>
                  </View>

                  {branchTotalsList.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No branch totals available for this date.</Text>
                    </View>
                  ) : (
                    branchTotalsList.map((b, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.branchTotalCard}
                        onPress={() => setSelectedBranch(b.branch)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.branchTotalCardHeader}>
                          <View style={styles.deptNameRow}>
                            <Text style={{ fontSize: 13 }}>{b.isClosed ? '🟢' : '🟡'}</Text>
                            <Text style={styles.branchTotalCardTitle}>{b.branch}</Text>
                          </View>
                          <View style={styles.cashActNetPill}>
                            <Text style={styles.cashActNetLabel}>Net: </Text>
                            <Text style={styles.cashActNetValue}>Rs. {formatNum(b.netCash)}</Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalGrid}>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Total Sale</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#38BDF8' }]}>Rs. {formatNum(b.totalSale)}</Text>
                          </View>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>CC / Bank</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#C084FC' }]}>Rs. {formatNum(b.totalCC)}</Text>
                          </View>
                          <View style={styles.branchTotalCol}>
                            <Text style={styles.branchTotalColLabel}>Cash Received</Text>
                            <Text style={[styles.branchTotalColValue, { color: '#10B981' }]}>Rs. {formatNum(b.totalCashReceived)}</Text>
                          </View>
                        </View>

                        <View style={styles.branchTotalCardFooter}>
                          <Text style={styles.branchTotalHint}>Tap to view department activity flow →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              ) : (
                /* SINGLE BRANCH: Combined Department Cards */
                <>
                  <View style={styles.deptSectionHeader}>
                    <Text style={styles.deptSectionTitle}>🏢 Combined Sales & Activity Flow</Text>
                    <Text style={styles.deptSectionBadge}>{aggregatedData.departments.length} Depts</Text>
                  </View>

                  {aggregatedData.departments.length === 0 ? (
                    <View style={styles.emptyCardBox}>
                      <Text style={styles.emptyCardText}>No department activity recorded for this branch.</Text>
                    </View>
                  ) : (
                    aggregatedData.departments.map((dept, idx) => {
                      const cashRec = dept.receivedCash || Math.max(0, dept.sale - dept.ccSale);
                      return (
                        <View key={idx} style={styles.deptCard}>
                          <View style={styles.deptCardHeader}>
                            <View style={styles.deptNameRow}>
                              <Text style={styles.deptIcon}>📦</Text>
                              <Text style={styles.deptName}>{toTitleCase(dept.name)}</Text>
                            </View>
                            <View style={styles.deptBadgeTag}>
                              <Text style={styles.deptBadgeTagText}>{dept.isMain ? 'Main' : 'Counter'}</Text>
                            </View>
                          </View>

                          <View style={styles.smsSequenceContainer}>
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>Sale:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#38BDF8', fontWeight: '700' }]}>Rs. {formatNum(dept.sale)}</Text>
                            </View>
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>CC Sale / Bank:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#C084FC', fontWeight: '700' }]}>Rs. {formatNum(dept.ccSale)}</Text>
                            </View>
                            <View style={styles.smsSeqRow}>
                              <Text style={styles.smsSeqLabel}>Difference:</Text>
                              <Text style={[styles.smsSeqValue, { color: dept.diff < 0 ? '#EF4444' : '#10B981' }]}>
                                Rs. {formatNum(dept.diff)}
                              </Text>
                            </View>
                            <View style={[styles.smsSeqRow, styles.smsSeqRowDiff]}>
                              <Text style={styles.smsSeqLabel}>Cash Movement:</Text>
                              <Text style={[styles.smsSeqValue, { color: '#10B981', fontWeight: '800' }]}>
                                Rs. {formatNum(cashRec)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </>
          )}

        </ScrollView>
      ) : (
        /* RAW STANDARD SMS PREVIEW (FOR COPY / WHATSAPP) */
        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={styles.smsCard}>
            <View style={styles.smsCardHeader}>
              <Text style={styles.smsCardTitle}>Official SMS Text Output</Text>
              <Text style={styles.smsCardNotice}>Format strictly matching Web ERP</Text>
            </View>
            <Text style={styles.smsTextContent}>{generatedSMSText}</Text>
          </View>
        </ScrollView>
      )}

      {/* Floating Bottom Action Dock */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnWhatsApp]}
          onPress={handleShareWhatsApp}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>💬</Text>
          <Text style={styles.dockBtnText}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnCopy]}
          onPress={handleCopyOrShare}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>📋</Text>
          <Text style={styles.dockBtnText}>Share / Copy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnToggle]}
          onPress={() => setViewType(viewType === 'visual' ? 'sms' : 'visual')}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>{viewType === 'visual' ? '📄' : '📱'}</Text>
          <Text style={styles.dockBtnText}>{viewType === 'visual' ? 'SMS View' : 'Visual View'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  backBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '500',
    marginTop: 1,
  },
  refreshBtn: {
    padding: 6,
  },
  refreshBtnText: {
    fontSize: 18,
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dateArrowBtn: {
    padding: 6,
  },
  dateArrowText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dateCenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  dateCalendarIcon: {
    fontSize: 13,
  },
  dateCenterText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  dateDropdownArrow: {
    color: '#94A3B8',
    fontSize: 11,
  },
  todayQuickChip: {
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
    borderColor: '#0284C7',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  todayQuickText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  branchStatusContainer: {
    backgroundColor: '#131D33',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  branchStatusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  branchStatusTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  branchStatusCountBadge: {
    backgroundColor: '#1E293B',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  branchStatusCountText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  branchScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  branchPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  branchPillClosed: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  branchPillPending: {
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  branchPillDot: {
    fontSize: 10,
  },
  branchPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  reportTabsWrapper: {
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  reportTabsScroll: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
    alignItems: 'center',
  },
  reportTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  reportTabBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  reportTabIcon: {
    fontSize: 13,
  },
  reportTabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  reportTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  viewSwitcherBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  viewSwitchItem: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  viewSwitchItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  viewSwitchText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  viewSwitchTextActive: {
    color: '#10B981',
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  kpiContainer: {
    marginBottom: 10,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'center',
    minHeight: 74,
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 4,
  },
  kpiSub: {
    color: '#64748B',
    fontSize: 9,
  },
  deptSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  deptSectionTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  deptSectionBadge: {
    color: '#94A3B8',
    fontSize: 11,
    backgroundColor: '#1E293B',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  emptyCardBox: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyCardText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  deptCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 8,
  },
  deptCardWarning: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  deptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  deptNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deptIcon: {
    fontSize: 14,
  },
  deptName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  deptBadgeTag: {
    backgroundColor: '#0F172A',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deptBadgeTagText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  smsSequenceContainer: {
    paddingTop: 8,
    gap: 6,
  },
  smsSeqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.4)',
  },
  smsSeqRowDiff: {
    borderBottomWidth: 0,
    paddingTop: 6,
  },
  smsSeqLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  smsSeqValue: {
    fontSize: 13,
    color: '#F8FAFC',
  },
  diffPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  diffPillClean: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  diffPillShort: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  diffPillExcess: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  diffPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  diffTextClean: {
    color: '#10B981',
  },
  diffTextShort: {
    color: '#EF4444',
  },
  diffTextExcess: {
    color: '#38BDF8',
  },
  /* Cash Activity Visual Styles */
  cashActCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 8,
  },
  cashActHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 8,
  },
  cashActTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  cashActNetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  cashActNetLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  cashActNetValue: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  cashActGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cashActGridCol: {
    flex: 1,
  },
  cashActGridLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 2,
  },
  cashActGridValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  /* Income Statement Visual Styles */
  incStatRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  incStatDeptName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  incStatDeptAmt: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  reconCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.4)',
    padding: 14,
    marginTop: 12,
    marginBottom: 10,
  },
  reconCardTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  reconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  reconRowTotal: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    marginTop: 6,
    paddingTop: 8,
  },
  reconLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  reconValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  /* Raw SMS Styles */
  smsCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
  },
  smsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 10,
  },
  smsCardTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  smsCardNotice: {
    color: '#64748B',
    fontSize: 10,
  },
  smsTextContent: {
    color: '#E2E8F0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  dockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  dockBtnWhatsApp: {
    backgroundColor: '#25D366',
  },
  dockBtnCopy: {
    backgroundColor: '#0284C7',
  },
  dockBtnToggle: {
    backgroundColor: '#475569',
  },
  dockBtnIcon: {
    fontSize: 15,
  },
  dockBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  /* Branch Total Card Styles for All Branches View */
  branchTotalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 8,
  },
  branchTotalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 8,
  },
  branchTotalCardTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  branchTotalStatusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeClosed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  branchTotalStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextClosed: {
    color: '#10B981',
  },
  statusTextPending: {
    color: '#FBBF24',
  },
  branchTotalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  branchTotalCol: {
    flex: 1,
  },
  branchTotalColLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 2,
  },
  branchTotalColValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  branchTotalCardFooter: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.4)',
    alignItems: 'flex-end',
  },
  branchTotalHint: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
});
