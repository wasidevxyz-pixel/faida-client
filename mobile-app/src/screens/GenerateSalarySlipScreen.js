import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Keyboard
} from 'react-native';
import api from '../services/api';
import { 
  printSalarySlip, 
  promptThermalSalarySlipOptions, 
  shareSalarySlipViaWhatsApp 
} from '../services/printService';

// Safe text extractor to avoid "Objects are not valid as a React child" errors
const getSafeString = (val, fallback = '') => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    return val.name || val.title || val.label || val.branch || fallback;
  }
  return String(val || fallback);
};

// Format Helpers
const formatNum = (val) => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDecimal = (val, dec = 2) => {
  const num = parseFloat(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toFixed(dec);
};

// Convert decimal hours (e.g. 81.7) to HH:MM (81:42)
const decimalToTime = (decimal) => {
  if (!decimal || isNaN(decimal)) return '0:00';
  const hrs = Math.floor(decimal);
  const mins = Math.round((decimal - hrs) * 60);
  return `${hrs}:${mins.toString().padStart(2, '0')}`;
};

// Convert HH:MM or "HH:MM (Decimal)" to Decimal
const timeToDecimal = (str) => {
  if (!str) return 0;
  const s = String(str).split('(')[0].trim();
  if (s.includes(':')) {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) + ((m || 0) / 60);
  }
  return parseFloat(s) || 0;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function GenerateSalarySlipScreen({ route, navigation, onBack }) {
  // Navigation props
  const navigate = navigation?.navigate || navigation;
  const initialEmployeeId = route?.params?.employeeId || null;
  const initialBranch = route?.params?.branch || '';

  // Filter State
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');
  const [selectedMonthYear, setSelectedMonthYear] = useState(`${defaultYear}-${defaultMonth}`);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch || '');
  const [branches, setBranches] = useState([]);
  const [branchBanks, setBranchBanks] = useState([]);

  // Employees List & Search
  const [allEmployees, setAllEmployees] = useState([]);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isEmployeeModalVisible, setIsEmployeeModalVisible] = useState(false);
  const [isBranchModalVisible, setIsBranchModalVisible] = useState(false);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPayrollId, setCurrentPayrollId] = useState(null);

  // --- Security Verification Modal for Slip Deletion ---
  const [deleteAuthModalVisible, setDeleteAuthModalVisible] = useState(false);
  const [deleteAuthUsername, setDeleteAuthUsername] = useState('bilal shah');
  const [deleteAuthPassword, setDeleteAuthPassword] = useState('');
  const [showDeleteAuthPassword, setShowDeleteAuthPassword] = useState(false);
  const [deleteAuthError, setDeleteAuthError] = useState('');
  const [deleteAuthLoading, setDeleteAuthLoading] = useState(false);
  const [deleteAuthStatusText, setDeleteAuthStatusText] = useState('');

  // Top Header Checkboxes (100% matched to Web ERP payroll.html)
  const [payAdvSalary, setPayAdvSalary] = useState(false);
  const [wkDays30, setWkDays30] = useState(false);
  const [salThrBank, setSalThrBank] = useState(false);
  const [checkShortWeek, setCheckShortWeek] = useState(false);

  // Form Fields State
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [bankName, setBankName] = useState('');
  const [offDay, setOffDay] = useState('Sunday');
  const [branchBank, setBranchBank] = useState('');
  const [remarks, setRemarks] = useState('');

  // Attendance & Time Basis
  const [basicSalary, setBasicSalary] = useState('0');
  const [totalDays, setTotalDays] = useState('30');
  const [totalWdsPerMonth, setTotalWdsPerMonth] = useState('30');
  const [totalHrsPerDay, setTotalHrsPerDay] = useState('8');
  const [totalHrsPerMonth, setTotalHrsPerMonth] = useState('240');
  const [workedDays, setWorkedDays] = useState('0');
  const [workedHrs, setWorkedHrs] = useState('0:00');
  const [workedAmount, setWorkedAmount] = useState('0');
  const [totalAbsents, setTotalAbsents] = useState('0');
  const [allowedLeaves, setAllowedLeaves] = useState('0');
  const [totalPerDay, setTotalPerDay] = useState('0.00');
  const [totalPerHr, setTotalPerHr] = useState('0.00');

  // Earnings
  const [overTimeHrs, setOverTimeHrs] = useState('0:00');
  const [overTimeAmount, setOverTimeAmount] = useState('0');
  const [rotiDays, setRotiDays] = useState('0');
  const [rotiAmount, setRotiAmount] = useState('0');
  const [nashtaDays, setNashtaDays] = useState('0');
  const [nashtaAmount, setNashtaAmount] = useState('0');
  const [monthlyComm, setMonthlyComm] = useState('0');
  const [ugComm, setUgComm] = useState('0');
  const [warehouseComm, setWarehouseComm] = useState('0');
  const [fixAllowance, setFixAllowance] = useState('0');
  const [stLessAllow, setStLessAllow] = useState('0');
  const [otherAllow, setOtherAllow] = useState('0');
  const [earningsTotal, setEarningsTotal] = useState('0');

  // Deductions
  const [shortTimeHrs, setShortTimeHrs] = useState('0:00');
  const [shortTimeAmount, setShortTimeAmount] = useState('0');
  const [shortWeekDays, setShortWeekDays] = useState('0');
  const [tfc, setTfc] = useState('0');
  const [foodDeduction, setFoodDeduction] = useState('0'); // Food Rate
  const [ebDeduction, setEbDeduction] = useState('0'); // Total Food Cost
  const [umrahDeduction, setUmrahDeduction] = useState('0');
  const [otherDeduction, setOtherDeduction] = useState('0');
  const [securityDeposit, setSecurityDeposit] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [pDays, setPDays] = useState('0');
  const [deductionsTotal, setDeductionsTotal] = useState('0');

  // Net Calculation & Advances
  const [grossTotal, setGrossTotal] = useState('0');
  const [cmAdv, setCmAdv] = useState('0');
  const [cmAdvRec, setCmAdvRec] = useState('0');
  const [pmAdv, setPmAdv] = useState('0');
  const [pmAdvRec, setPmAdvRec] = useState('0');
  const [totalAdv, setTotalAdv] = useState('0');
  const [totalAdvRec, setTotalAdvRec] = useState('0');
  const [netTotal, setNetTotal] = useState('0');
  const [wht, setWht] = useState('0');
  const [bankAmt, setBankAmt] = useState('0');
  const [bankPaid, setBankPaid] = useState('0');
  const [cashPaid, setCashPaid] = useState('0');
  const [balance, setBalance] = useState('0');

  // Hidden / Internal variables
  const baseShortHrsRef = useRef(0);
  const fullStLessAllowRef = useRef(0);
  const activeShortWeekSourceRef = useRef('auto'); // 'auto' | 'checkbox' | 'tsw' | 'stHrs'

  // Load Initial Branches
  useEffect(() => {
    loadBranches();
  }, []);

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

      if (!selectedBranch && unique.length > 1) {
        // Pick first store if no branch selected
        const firstStore = unique.find(b => b !== 'All Branches') || unique[0];
        setSelectedBranch(firstStore);
      }
    } catch (e) {
      console.warn('Error loading branches:', e.message);
    }
  };

  // Load Branch Banks & Employees when branch changes
  useEffect(() => {
    if (selectedBranch && selectedBranch !== 'All Branches') {
      loadBranchBanks(selectedBranch);
      loadEmployeesForBranch(selectedBranch);
    }
  }, [selectedBranch]);

  const loadBranchBanks = async (branch) => {
    try {
      const res = await api.get('/banks');
      const list = res?.data || res || [];
      if (Array.isArray(list)) {
        const filtered = list.filter(b => b.branch === branch && b.isActive && b.bankType === 'Branch Bank');
        setBranchBanks(filtered);
        if (filtered.length > 0 && !branchBank) {
          setBranchBank(filtered[0].bankName);
        }
      }
    } catch (e) {
      console.warn('Error loading banks:', e.message);
    }
  };

  const loadEmployeesForBranch = async (branch) => {
    try {
      setLoading(true);
      let url = '/employees?isActive=true&light=true';
      if (branch && branch !== 'All Branches') {
        url += `&branch=${encodeURIComponent(branch)}`;
      }
      const res = await api.get(url);
      const list = res?.data || res || [];
      if (Array.isArray(list)) {
        setAllEmployees(list);

        // If initial employee provided in route, auto-select
        if (initialEmployeeId) {
          const match = list.find(e => e._id === initialEmployeeId || e.id === initialEmployeeId);
          if (match) {
            selectEmployee(match);
          }
        }
      }
    } catch (e) {
      console.warn('Error loading employees:', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick Month Navigation (+1 / -1 Month)
  const shiftMonth = (delta) => {
    const [yStr, mStr] = selectedMonthYear.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + delta;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    const newMonthYear = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonthYear(newMonthYear);
  };

  // When Employee or Month changes, trigger loadOrCalculate
  useEffect(() => {
    if (selectedEmployee && selectedMonthYear) {
      loadOrCalculate(selectedEmployee._id, selectedMonthYear, selectedBranch, wkDays30);
    }
  }, [selectedEmployee, selectedMonthYear]);

  const selectEmployee = (emp) => {
    Keyboard.dismiss();
    setSelectedEmployee(emp);
    setEmployeeSearchText(`${emp.code || 'N/A'} - ${getSafeString(emp.name, 'Employee')}`);
    setIsEmployeeModalVisible(false);
    setCode(emp.code || '');
    const emp30Days = Boolean(emp.thirtyWorkingDays || emp.otst30WorkingDays);
    setWkDays30(emp30Days);
    setSalThrBank(Boolean(emp.payFullSalaryThroughBank));
    activeShortWeekSourceRef.current = 'auto';
  };

  // Central Load or Calculate API Engine (Exact Backend Engine)
  const loadOrCalculate = async (empId, monthYr, branch, force30Days = false) => {
    if (!empId || !monthYr) return;
    try {
      setCalculating(true);
      setCurrentPayrollId(null);

      // Execute calculation and saved check in parallel
      const [calcRes, checkRes] = await Promise.all([
        api.post('/payrolls/calculate', {
          employeeId: empId,
          monthYear: monthYr,
          branch: branch !== 'All Branches' ? branch : undefined,
          thirtyWorkingDays: force30Days
        }),
        api.get(`/payrolls?employee=${empId}&monthYear=${monthYr}`)
      ]);

      const calcData = calcRes?.data || calcRes;
      const checkData = checkRes?.data || checkRes;
      const savedList = Array.isArray(checkData) ? checkData : (checkData?.data || []);

      if (savedList && savedList.length > 0) {
        const savedRecord = savedList[0];
        setCurrentPayrollId(savedRecord._id);
        populateFormFromData(savedRecord);

        // Overlay fresh attendance calculations if calc succeeded
        if (calcData) {
          setTotalDays(String(calcData.totalDays || 30));
          setTotalWdsPerMonth(String(calcData.totalWdsPerMonth || 30));
          setTotalHrsPerDay(String(calcData.totalHrsPerDay || 8));
          setTotalHrsPerMonth(String(calcData.totalHrsPerMonth || 240));
          setWorkedDays(String(calcData.workedDays || 0));
          setTotalAbsents(String(calcData.totalAbsents != null ? calcData.totalAbsents : 0));
          setAllowedLeaves(String(calcData.allowedLeaves != null ? calcData.allowedLeaves : 0));
          setWorkedHrs(decimalToTime(calcData.workedHrs || 0));
          setOverTimeHrs(decimalToTime(calcData.overTimeHrs || 0));
          setOverTimeAmount(String(Math.round(calcData.overTime || 0)));
          setShortTimeHrs(decimalToTime(calcData.shortTimeHrs || 0));
          setShortTimeAmount(String(Math.round(calcData.shortTimeAmount || 0)));
          baseShortHrsRef.current = parseFloat(calcData.shortTimeHrs || 0);
          fullStLessAllowRef.current = parseFloat(calcData.fullStLessAllow || 0);
        }
      } else if (calcData) {
        populateFormFromData(calcData);
      }
    } catch (err) {
      console.error('Error calculating payroll:', err);
      Alert.alert('Calculation Notice', err?.message || 'Could not fetch backend calculations.');
    } finally {
      setCalculating(false);
    }
  };

  // Populate UI inputs from received object
  const populateFormFromData = (data) => {
    if (!data) return;

    setCode(data.code || '');
    setDepartment(typeof data.department === 'object' ? data.department?.name : (data.department || 'N/A'));
    setDesignation(typeof data.designation === 'object' ? data.designation?.name : (data.designation || 'N/A'));
    setBankName(data.bank || data.selectBank || 'N/A');
    setOffDay(data.offDay || 'Sunday');

    setBasicSalary(String(data.perMonth || data.basicSalary || 0));
    setTotalDays(String(data.totalDays || 30));
    setTotalWdsPerMonth(String(data.totalWdsPerMonth || 30));
    setTotalHrsPerDay(String(data.totalHrsPerDay || 8));
    setTotalHrsPerMonth(String(data.totalHrsPerMonth || 240));
    setWorkedDays(String(data.workedDays || 0));
    setWorkedHrs(decimalToTime(data.workedHrs || 0));
    setTotalAbsents(String(data.totalAbsents || 0));
    setAllowedLeaves(String(data.allowedLeaves || 0));

    // Flags
    setSalThrBank(Boolean(data.payFullSalaryThroughBank));
    setPayAdvSalary(Boolean(data.payAdvSalary));
    setWkDays30(Boolean(data.thirtyWorkingDays));
    setCheckShortWeek(Boolean(data.isShortWeek));

    // Rates & Hours
    baseShortHrsRef.current = parseFloat(data.shortTimeHrs || 0);
    fullStLessAllowRef.current = parseFloat(data.fullStLessAllow || data.stLoss || 0);

    setOverTimeHrs(decimalToTime(data.overTimeHrs || 0));
    setOverTimeAmount(String(Math.round(data.overTime || 0)));
    setShortTimeHrs(decimalToTime(data.shortTimeHrs || 0));
    setShortTimeAmount(String(Math.round(data.shortTimeAmount || 0)));
    setShortWeekDays(String(data.shortWeekDays || data.ttw || 0));

    // Earnings
    setRotiDays(String(data.rotiDays || 0));
    setRotiAmount(String(data.rent || data.rotiAmount || 0));
    setNashtaDays(String(data.nashtaDays || 0));
    setNashtaAmount(String(data.teaAllowance || data.nashtaAmount || 0));
    setMonthlyComm(String(data.monthlyComm || 0));
    setUgComm(String(data.ugComm || 0));
    setWarehouseComm(String(data.warehouseComm || 0));
    setFixAllowance(String(data.natin || data.fixAllowance || 0));
    setStLessAllow(String(data.stLateAllow || data.stLessAllow || 0));
    setOtherAllow(String(data.otherAllow || 0));

    // Deductions
    setTfc(String(data.fund || data.tfc || 0));
    setFoodDeduction(String(data.food || 0));
    setEbDeduction(String(data.ebDeduction || 0));
    setUmrahDeduction(String(data.umrahDeduction || 0));
    setOtherDeduction(String(data.otherDeduction || 0));
    setSecurityDeposit(String(data.securityDeposit || 0));
    setPenalty(String(data.penalty || 0));
    setPDays(String(data.pDays || 0));

    // Advances
    setCmAdv(String(data.csMale || data.cmAdv || 0));
    setCmAdvRec(String(data.cmAdvRec || 0));
    setPmAdv(String(data.pAAdv || data.pmAdv || 0));
    setPmAdvRec(String(data.pmAdvRec || 0));

    // Bank & Disbursement
    setBankAmt(String(data.bankAmt || 0));
    setWht(String(data.wht || 0));
    setBankPaid(String(data.bankPaid || 0));
    setCashPaid(String(data.cashPaid || 0));
    setRemarks(data.remarks || '');
    if (data.branchBank) setBranchBank(data.branchBank);

    // Run local math calculations
    runMathRecalculation();
  };

  // Run Math Recalculation (100% Identical to Web ERP payroll.js calculateTotals())
  const runMathRecalculation = useCallback(() => {
    const basic = parseFloat(basicSalary) || 0;
    const dutyHrs = parseFloat(totalHrsPerDay) || 8;
    const wdsPerMonth = parseFloat(totalWdsPerMonth) || 30;

    // Salary Per Day & Salary Per Hour
    const perDayAmt = basic / wdsPerMonth;
    const hourlyRate = perDayAmt / dutyHrs;
    setTotalPerDay(perDayAmt.toFixed(2));
    setTotalPerHr(hourlyRate.toFixed(2));

    // OT and ST Rate = Basic / 30 / DutyHours (Fixed 30 Divisor as per BAS specification)
    const otstHourlyRate = basic / 30 / dutyHrs;

    // OT Amount
    const otDecimal = timeToDecimal(overTimeHrs);
    const otAmt = Math.round(otDecimal * otstHourlyRate);
    setOverTimeAmount(String(otAmt));

    // Dynamic ST.LessAllow calculation
    const fullSTAllow = fullStLessAllowRef.current || 0;
    const currentShortHrs = timeToDecimal(shortTimeHrs);
    const stDeduction = (fullSTAllow / 30 / dutyHrs) * currentShortHrs;
    const computedStAllow = Math.max(0, Math.round(fullSTAllow - stDeduction));
    setStLessAllow(String(computedStAllow));

    // Earnings Total
    const rAmt = parseFloat(rotiAmount) || 0;
    const nAmt = parseFloat(nashtaAmount) || 0;
    const mComm = parseFloat(monthlyComm) || 0;
    const ugCommission = parseFloat(ugComm) || 0;
    const wComm = parseFloat(warehouseComm) || 0;
    const fAllow = parseFloat(fixAllowance) || 0;
    const oAllow = parseFloat(otherAllow) || 0;

    const totalEarn = Math.round(otAmt + rAmt + nAmt + mComm + ugCommission + wComm + fAllow + computedStAllow + oAllow);
    setEarningsTotal(String(totalEarn));

    // Short Week & Short Time Calculation (100% Web ERP payroll.js match)
    let currentShortWeekDays = parseFloat(shortWeekDays) || 0;
    let computedShortHrs = baseShortHrsRef.current;

    if (activeShortWeekSourceRef.current === 'tsw') {
      // User manually edited TSW (shortWeekDays) - keep unlocked and recalculate ShortTime
      computedShortHrs = baseShortHrsRef.current + (currentShortWeekDays * dutyHrs);
      setShortTimeHrs(decimalToTime(computedShortHrs));
    } else if (activeShortWeekSourceRef.current === 'stHrs') {
      // User manually edited ShortTime (Hrs)
      computedShortHrs = timeToDecimal(shortTimeHrs);
      currentShortWeekDays = Math.max(0, Math.round((computedShortHrs - baseShortHrsRef.current) / dutyHrs));
      setShortWeekDays(String(currentShortWeekDays));
    } else {
      if (checkShortWeek) {
        const workedDecimal = timeToDecimal(workedHrs);
        const weeksWorked = workedDecimal / dutyHrs / 7;
        const calculatedShortWeeks = Math.max(0, 4 - weeksWorked);
        currentShortWeekDays = Math.round(calculatedShortWeeks);
        setShortWeekDays(String(currentShortWeekDays));
        computedShortHrs = baseShortHrsRef.current + (currentShortWeekDays * dutyHrs);
        setShortTimeHrs(decimalToTime(computedShortHrs));
      } else {
        computedShortHrs = baseShortHrsRef.current;
        setShortTimeHrs(decimalToTime(computedShortHrs));
        setShortWeekDays('0');
      }
    }

    const shortAmt = Math.round(computedShortHrs * otstHourlyRate);
    setShortTimeAmount(String(shortAmt));

    // Food / EB deduction
    const foodRate = parseFloat(foodDeduction) || 0;
    const wDays = parseFloat(workedDays) || 0;
    const computedEbDeduction = Math.round(foodRate * wDays);
    setEbDeduction(String(computedEbDeduction));

    // Deductions Total
    const tfcAmt = parseFloat(tfc) || 0;
    const uDeduct = parseFloat(umrahDeduction) || 0;
    const oDeduct = parseFloat(otherDeduction) || 0;
    const secDep = parseFloat(securityDeposit) || 0;
    const penAmt = parseFloat(penalty) || 0;

    const totalDeduct = Math.round(shortAmt + tfcAmt + computedEbDeduction + uDeduct + oDeduct + secDep + penAmt);
    setDeductionsTotal(String(totalDeduct));

    // Worked Amount (Basic - Short Time)
    const computedWorkedAmount = Math.round(basic - shortAmt);
    setWorkedAmount(String(computedWorkedAmount));

    // Gross Total = Basic + Earnings - Deductions
    const computedGross = Math.round(basic + totalEarn - totalDeduct);
    setGrossTotal(String(computedGross));

    // Advances Recovery
    const cmRecovery = parseFloat(cmAdvRec) || 0;
    const pmRecovery = parseFloat(pmAdvRec) || 0;
    const totalAdvRecovery = Math.round(cmRecovery + pmRecovery);
    setTotalAdvRec(String(totalAdvRecovery));

    const cmBalance = parseFloat(cmAdv) || 0;
    const pmBalance = Math.max(0, parseFloat(pmAdv) || 0);
    const totalAdvanceBalance = Math.round(cmBalance + pmBalance);
    setTotalAdv(String(totalAdvanceBalance));

    // Net Total (Pre-Tax) = Gross Total - Advance Recovery
    const preTaxNet = Math.round(computedGross - totalAdvRecovery);
    setNetTotal(String(preTaxNet));

    // Progressive WHT (Income Tax 2025-2026) if Sal Thr Bank
    let computedWht = 0;
    if (salThrBank) {
      const annualSalary = preTaxNet * 12;
      let annualTax = 0;

      if (annualSalary <= 600000) {
        annualTax = 0;
      } else if (annualSalary <= 1200000) {
        annualTax = (annualSalary - 600000) * 0.01;
      } else if (annualSalary <= 2200000) {
        annualTax = 6000 + (annualSalary - 1200000) * 0.11;
      } else if (annualSalary <= 3200000) {
        annualTax = 116000 + (annualSalary - 2200000) * 0.23;
      } else if (annualSalary <= 4100000) {
        annualTax = 346000 + (annualSalary - 3200000) * 0.30;
      } else {
        annualTax = 616000 + (annualSalary - 4100000) * 0.35;
      }

      if (annualSalary > 10000000) {
        annualTax += (annualTax * 0.09);
      }

      computedWht = Math.round(annualTax / 12);
    }
    setWht(String(computedWht));

    const afterWhtNet = Math.round(preTaxNet - computedWht);

    // Split Bank vs Cash
    if (salThrBank) {
      setBankAmt(String(preTaxNet));
      setBankPaid(String(afterWhtNet));
      setCashPaid('0');
    } else {
      setBankAmt('0');
      setBankPaid('0');
      setCashPaid(String(preTaxNet));
    }

    const totalPaid = (salThrBank ? afterWhtNet : preTaxNet);
    const computedBalance = Math.round(preTaxNet - computedWht - totalPaid);
    setBalance(String(computedBalance));
  }, [
    basicSalary, totalHrsPerDay, totalWdsPerMonth, overTimeHrs, shortTimeHrs,
    rotiAmount, nashtaAmount, monthlyComm, ugComm, warehouseComm, fixAllowance, otherAllow,
    checkShortWeek, shortWeekDays, workedHrs, foodDeduction, workedDays,
    tfc, umrahDeduction, otherDeduction, securityDeposit, penalty,
    cmAdv, cmAdvRec, pmAdv, pmAdvRec, salThrBank
  ]);

  // Recalculate whenever inputs change
  useEffect(() => {
    runMathRecalculation();
  }, [runMathRecalculation]);

  // Save Payroll (Exact Web ERP POST /api/v1/payrolls payload)
  const handleSavePayroll = async () => {
    if (!selectedEmployee) {
      Alert.alert('Selection Required', 'Please select an employee first.');
      return;
    }

    const basic = parseFloat(basicSalary) || 0;
    const wHrs = timeToDecimal(workedHrs);

    if (basic <= 0) {
      Alert.alert('Validation Error', 'Employee Basic Salary cannot be zero.');
      return;
    }
    if (wHrs <= 0) {
      Alert.alert('Validation Error', 'Employee Worked(Hrs) cannot be zero.');
      return;
    }

    if (salThrBank && !branchBank) {
      Alert.alert('Bank Required', 'Please select a Branch Bank to proceed with bank payment.');
      return;
    }

    const payload = {
      employee: selectedEmployee._id,
      monthYear: selectedMonthYear,
      branch: selectedBranch !== 'All Branches' ? selectedBranch : selectedEmployee.branch,
      code: code || selectedEmployee.code,
      bank: bankName || 'N/A',
      department: department || 'N/A',
      designation: designation || 'N/A',
      totalDays: parseFloat(totalDays) || 30,
      totalWdsPerMonth: parseFloat(totalWdsPerMonth) || 30,
      totalAbsents: parseFloat(totalAbsents) || 0,
      allowedLeaves: parseFloat(allowedLeaves) || 0,
      totalWdsPerMonthHrs: totalHrsPerMonth,
      totalHrsPerMonth: totalHrsPerMonth,
      totalHrsPerDay: parseFloat(totalHrsPerDay) || 8,
      perMonth: basic,
      offDay: offDay,
      totalPerDay: parseFloat(totalPerDay) || 0,
      totalPerHr: parseFloat(totalPerHr) || 0,
      workedHrs: wHrs,
      workedDays: parseFloat(workedDays) || 0,
      overTime: parseFloat(overTimeAmount) || 0,
      rent: parseFloat(rotiAmount) || 0,
      natin: parseFloat(fixAllowance) || 0,
      monthlyComm: parseFloat(monthlyComm) || 0,
      ugComm: parseFloat(ugComm) || 0,
      warehouseComm: parseFloat(warehouseComm) || 0,
      teaAllowance: parseFloat(nashtaAmount) || 0,
      nashtaDays: parseFloat(nashtaDays) || 0,
      stLateAllow: parseFloat(stLessAllow) || 0,
      otherAllow: parseFloat(otherAllow) || 0,
      rotiDays: parseFloat(rotiDays) || 0,
      earningsTotal: parseFloat(earningsTotal) || 0,
      overTimeHrs: timeToDecimal(overTimeHrs),
      shortWeek: parseFloat(shortTimeAmount) || 0,
      shortTimeAmount: parseFloat(shortTimeAmount) || 0,
      shortWeekDays: parseFloat(shortWeekDays) || 0,
      isShortWeek: checkShortWeek,
      ttw: parseFloat(shortWeekDays) || 0,
      fund: parseFloat(tfc) || 0,
      food: parseFloat(foodDeduction) || 0,
      ebDeduction: parseFloat(ebDeduction) || 0,
      ugrm: 0,
      securityDeposit: parseFloat(securityDeposit) || 0,
      penalty: parseFloat(penalty) || 0,
      otherDeduction: parseFloat(otherDeduction) || 0,
      umrahDeduction: parseFloat(umrahDeduction) || 0,
      deductionsTotal: parseFloat(deductionsTotal) || 0,
      grossTotal: parseFloat(grossTotal) || 0,
      csMale: parseFloat(cmAdv) || 0,
      pAAdv: parseFloat(pmAdv) || 0,
      pmAdvRec: parseFloat(pmAdvRec) || 0,
      cmAdvRec: parseFloat(cmAdvRec) || 0,
      totalAdv: parseFloat(totalAdvRec) || 0,
      totalAdvRec: parseFloat(totalAdv) || 0,
      netTotal: parseFloat(netTotal) || 0,
      bankAmt: parseFloat(bankAmt) || 0,
      wht: parseFloat(wht) || 0,
      bankPaid: parseFloat(bankPaid) || 0,
      cashPaid: parseFloat(cashPaid) || 0,
      rebate: parseFloat(balance) || 0,
      remarks: remarks || '',
      branchBank: branchBank || '',
      shortTimeHrs: timeToDecimal(shortTimeHrs),

      // Flags
      payAdvSalary: payAdvSalary,
      thirtyWorkingDays: wkDays30,
      payFullSalaryThroughBank: salThrBank
    };

    try {
      setSaving(true);
      let response;
      if (currentPayrollId) {
        response = await api.put(`/payrolls/${currentPayrollId}`, payload);
      } else {
        response = await api.post('/payrolls', payload);
      }

      const resData = response?.data || response;
      if (response && (response.success || resData?.success || resData?._id)) {
        const savedDoc = resData.data || resData;
        setCurrentPayrollId(savedDoc._id);
        Alert.alert(
          'Payroll Saved Successfully',
          `Salary slip for ${selectedEmployee.name} (${selectedMonthYear}) has been saved to database and synchronized with Web ERP.\nNet Salary: Rs ${formatNum(netTotal)}`,
          [
            { text: '💬 WhatsApp Share (1-Tap)', onPress: () => handleWhatsAppShare(savedDoc) },
            { text: '🖨️ 58/80mm Thermal Print', onPress: () => handleThermalPrint(savedDoc) },
            { text: '📄 View / Print PDF', onPress: () => handlePrintSlip(savedDoc) },
            { text: '📋 Go to Salary List', onPress: () => navigate('EmpSalaryReports', { initialTab: 'payroll_list' }) },
            { text: 'OK' }
          ]
        );
      } else {
        Alert.alert('Save Failed', resData?.message || 'Error occurred while saving payroll.');
      }
    } catch (e) {
      console.error('Save payroll error:', e);
      Alert.alert('Save Error', e?.message || 'Server error while saving payroll record.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------
  // DELETE EXISTING PAYROLL SLIP (Strictly Bilal Shah password authorized)
  // -----------------------------------------------------------------
  const handlePromptDeleteCurrentSlip = () => {
    if (!currentPayrollId) return;
    setDeleteAuthUsername('bilal shah');
    setDeleteAuthPassword('');
    setShowDeleteAuthPassword(false);
    setDeleteAuthError('');
    setDeleteAuthStatusText('');
    setDeleteAuthModalVisible(true);
  };

  const handleAuthorizeAndDeleteCurrentSlip = async () => {
    setDeleteAuthError('');
    if (!deleteAuthUsername.trim() || !deleteAuthPassword) {
      setDeleteAuthError('Please enter both username and password.');
      return;
    }
    if (!currentPayrollId) {
      setDeleteAuthError('No existing payroll slip found to delete.');
      return;
    }

    setDeleteAuthLoading(true);
    setDeleteAuthStatusText('🔐 Verifying Bilal Shah authorization...');

    try {
      const authRes = await api.verifyAdminCredentials(deleteAuthUsername.trim(), deleteAuthPassword);
      if (!authRes || !authRes.success) {
        setDeleteAuthError(authRes?.message || 'Invalid credentials. Authorization failed.');
        setDeleteAuthLoading(false);
        setDeleteAuthStatusText('');
        return;
      }

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

      setDeleteAuthStatusText('🗑️ Deleting payroll slip from database & web ERP...');
      const deleteRes = await api.deletePayroll(currentPayrollId, authRes.token);

      if (deleteRes && (deleteRes.success || deleteRes.data)) {
        const empName = selectedEmployee?.name || 'Employee';
        const mYear = selectedMonthYear;

        setDeleteAuthModalVisible(false);
        setDeleteAuthLoading(false);
        setDeleteAuthPassword('');
        setDeleteAuthStatusText('');
        setCurrentPayrollId(null);

        Alert.alert(
          '✓ Salary Slip Deleted',
          `The existing salary slip for ${empName} (${mYear}) has been permanently deleted from MongoDB and Web ERP.\n\nNow recalculating attendance & figures so you can save a fresh new slip.`,
          [{ text: 'OK' }]
        );

        if (selectedEmployee) {
          loadOrCalculate(selectedEmployee._id, selectedMonthYear, selectedBranch, wkDays30);
        }
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

  const getSlipDataObject = (payrollDoc = null) => {
    return payrollDoc || {
      _id: currentPayrollId,
      employee: selectedEmployee,
      code: code || selectedEmployee?.code,
      name: selectedEmployee?.name,
      monthYear: selectedMonthYear,
      branch: selectedBranch,
      department: department,
      designation: designation,
      bank: bankName,
      perMonth: parseFloat(basicSalary),
      workedDays: parseFloat(workedDays),
      workedHrs: timeToDecimal(workedHrs),
      overTime: parseFloat(overTimeAmount),
      overTimeHrs: timeToDecimal(overTimeHrs),
      shortTimeAmount: parseFloat(shortTimeAmount),
      shortTimeHrs: timeToDecimal(shortTimeHrs),
      shortWeekDays: parseFloat(shortWeekDays),
      rent: parseFloat(rotiAmount),
      teaAllowance: parseFloat(nashtaAmount),
      monthlyComm: parseFloat(monthlyComm),
      ugComm: parseFloat(ugComm),
      warehouseComm: parseFloat(warehouseComm),
      natin: parseFloat(fixAllowance),
      stLateAllow: parseFloat(stLessAllow),
      otherAllow: parseFloat(otherAllow),
      earningsTotal: parseFloat(earningsTotal),
      fund: parseFloat(tfc),
      ebDeduction: parseFloat(ebDeduction),
      umrahDeduction: parseFloat(umrahDeduction),
      otherDeduction: parseFloat(otherDeduction),
      securityDeposit: parseFloat(securityDeposit),
      penalty: parseFloat(penalty),
      deductionsTotal: parseFloat(deductionsTotal),
      grossTotal: parseFloat(grossTotal),
      pAAdv: parseFloat(pmAdv),
      csMale: parseFloat(cmAdv),
      pmAdvRec: parseFloat(pmAdvRec),
      cmAdvRec: parseFloat(cmAdvRec),
      totalAdv: parseFloat(totalAdvRec),
      netTotal: parseFloat(netTotal),
      wht: parseFloat(wht),
      bankPaid: parseFloat(bankPaid),
      cashPaid: parseFloat(cashPaid),
      rebate: parseFloat(balance),
      payAdvSalary: payAdvSalary,
      payFullSalaryThroughBank: salThrBank,
      thirtyWorkingDays: wkDays30,
      remarks: remarks
    };
  };

  // Print Standard Official PDF Salary Slip
  const handlePrintSlip = async (payrollDoc = null) => {
    if (!selectedEmployee) {
      Alert.alert('Notice', 'Please select an employee first.');
      return;
    }
    const slipData = getSlipDataObject(payrollDoc);
    try {
      await printSalarySlip(selectedEmployee, slipData);
    } catch (e) {
      console.error('Print error:', e);
      Alert.alert('Print Error', e.message);
    }
  };

  // 1-Tap 58mm/80mm Bluetooth Thermal Slip Print
  const handleThermalPrint = (payrollDoc = null) => {
    if (!selectedEmployee) {
      Alert.alert('Notice', 'Please select an employee first.');
      return;
    }
    const slipData = getSlipDataObject(payrollDoc);
    promptThermalSalarySlipOptions(selectedEmployee, slipData);
  };

  // 1-Tap WhatsApp Share Direct to Employee Mobile
  const handleWhatsAppShare = async (payrollDoc = null) => {
    if (!selectedEmployee) {
      Alert.alert('Notice', 'Please select an employee first.');
      return;
    }
    const slipData = getSlipDataObject(payrollDoc);
    await shareSalarySlipViaWhatsApp(selectedEmployee, slipData);
  };

  // Filtered Employees for Modal Picker
  const modalFilteredEmployees = allEmployees.filter(e => {
    const q = employeeSearchText.trim().toLowerCase();
    if (!q) return true;
    return (
      (e.name || '').toLowerCase().includes(q) ||
      (String(e.code || '')).toLowerCase().includes(q)
    );
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Page Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack || (() => navigation?.goBack?.())}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Generate Salary Slip</Text>
          <Text style={styles.headerSubtitle}>0.01 Match with Web ERP</Text>
        </View>
        <TouchableOpacity
          style={styles.listShortcutBtn}
          onPress={() => navigate('EmpSalaryReports', { initialTab: 'payroll_list' })}
          activeOpacity={0.7}
        >
          <Text style={styles.listShortcutBtnText}>📋 List</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Month & Branch Filter Bar */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            {/* Month Navigator */}
            <View style={styles.monthNavBox}>
              <Text style={styles.filterLabel}>Month - Year</Text>
              <View style={styles.monthPill}>
                <TouchableOpacity style={styles.monthArrow} onPress={() => shiftMonth(-1)}>
                  <Text style={styles.monthArrowText}>◀</Text>
                </TouchableOpacity>
                <Text style={styles.monthText}>{selectedMonthYear}</Text>
                <TouchableOpacity style={styles.monthArrow} onPress={() => shiftMonth(1)}>
                  <Text style={styles.monthArrowText}>▶</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Branch Selector */}
            <View style={styles.branchBox}>
              <Text style={styles.filterLabel}>Store Branch</Text>
              <TouchableOpacity
                style={styles.branchSelectBtn}
                onPress={() => setIsBranchModalVisible(true)}
              >
                <Text style={styles.branchSelectText} numberOfLines={1}>
                  {getSafeString(selectedBranch, 'Select Branch')}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Top Header Checkbox Controls (100% Web ERP Match) */}
          <View style={styles.headerCheckRow}>
            <TouchableOpacity
              style={[styles.checkPill, payAdvSalary && styles.checkPillActive]}
              onPress={() => setPayAdvSalary(!payAdvSalary)}
              activeOpacity={0.7}
            >
              <Text style={styles.checkIcon}>{payAdvSalary ? '☑' : '☐'}</Text>
              <Text style={[styles.checkLabel, payAdvSalary && styles.checkLabelActive]}>Pay Adv Salary</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkPill, wkDays30 && styles.checkPillActive]}
              onPress={() => {
                const next = !wkDays30;
                setWkDays30(next);
                if (selectedEmployee) {
                  loadOrCalculate(selectedEmployee._id, selectedMonthYear, selectedBranch, next);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.checkIcon}>{wkDays30 ? '☑' : '☐'}</Text>
              <Text style={[styles.checkLabel, wkDays30 && styles.checkLabelActive]}>30 Wk Days</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkPill, salThrBank && styles.checkPillActive]}
              onPress={() => setSalThrBank(!salThrBank)}
              activeOpacity={0.7}
            >
              <Text style={styles.checkIcon}>{salThrBank ? '☑' : '☐'}</Text>
              <Text style={[styles.checkLabel, salThrBank && styles.checkLabelActive]}>Sal Thr Bank</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.checkPill, checkShortWeek && styles.checkPillActive]}
              onPress={() => {
                activeShortWeekSourceRef.current = 'checkbox';
                setCheckShortWeek(!checkShortWeek);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.checkIcon}>{checkShortWeek ? '☑' : '☐'}</Text>
              <Text style={[styles.checkLabel, checkShortWeek && styles.checkLabelActive]}>ShortWeek</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Employee Search & Selection Card */}
        <View style={styles.empSelectCard}>
          <Text style={styles.cardHeaderTitle}>👤 Select Employee</Text>
          <TouchableOpacity
            style={styles.empSearchBtn}
            onPress={() => setIsEmployeeModalVisible(true)}
          >
            <Text style={styles.empSearchBtnIcon}>🔍</Text>
            <Text style={styles.empSearchBtnText} numberOfLines={1}>
              {selectedEmployee ? `${selectedEmployee.code || ''} - ${getSafeString(selectedEmployee.name, 'Employee')}` : 'Tap to search employee by name or code...'}
            </Text>
          </TouchableOpacity>

          {calculating && (
            <View style={styles.calcLoadingBox}>
              <ActivityIndicator size="small" color="#0284C7" />
              <Text style={styles.calcLoadingText}>Calculating attendance, advances & commissions from backend...</Text>
            </View>
          )}

          {currentPayrollId && (
            <View style={[styles.existingPayrollBadge, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.existingPayrollText}>
                  ✓ Existing Payroll Record Found in MongoDB ({currentPayrollId.substring(currentPayrollId.length - 8)})
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 10.5, marginTop: 2 }}>
                  To recalculate and save a fresh slip, delete this existing record first.
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: '#DC2626',
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: '#EF4444'
                }}
                onPress={handlePromptDeleteCurrentSlip}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 }}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* SECTION 1: EMPLOYEE PROFILE & ATTENDANCE (GREEN THEME) */}
        <View style={styles.sectionCard}>
          <View style={[styles.sectionHeader, styles.headerGreen]}>
            <Text style={styles.sectionHeaderText}>Employee Profile & Attendance</Text>
            <Text style={styles.sectionHeaderBadge}>Base: {wkDays30 ? '30 Days' : `${totalDays} Days`}</Text>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Code</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen]} value={code} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Department</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen]} value={department} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Designation</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen]} value={designation} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Bank</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen]} value={bankName} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Basic Salary (Rs) 🔒</Text>
                <TextInput
                  style={[styles.inputBox, styles.bgGreen, styles.boldText, styles.lockedInput]}
                  value={basicSalary}
                  editable={false}
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Off Day 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={offDay} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Days / Month 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={totalDays} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Working Days 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={totalWdsPerMonth} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Hrs Per Day 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={totalHrsPerDay} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Req Monthly Hrs 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={totalHrsPerMonth} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Salary Per Day 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={`Rs ${totalPerDay}`} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Salary Per Hour 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={`Rs ${totalPerHr}`} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Worked (Hrs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.boldText, styles.lockedInput]} value={workedHrs} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Worked Days 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.boldText, styles.lockedInput]} value={workedDays} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Absents 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={totalAbsents} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Allowed Leaves 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgGreen, styles.lockedInput]} value={allowedLeaves} editable={false} />
              </View>
            </View>

            <View style={styles.summaryHighlightRow}>
              <Text style={styles.summaryHighlightLabel}>Worked Amount (Basic - Short Time):</Text>
              <Text style={styles.summaryHighlightVal}>Rs {formatNum(workedAmount)}</Text>
            </View>
          </View>
        </View>

        {/* SECTION 2: EARNINGS & COMMISSIONS (BLUE THEME) */}
        <View style={styles.sectionCard}>
          <View style={[styles.sectionHeader, styles.headerBlue]}>
            <Text style={styles.sectionHeaderText}>Earnings & Commissions</Text>
            <Text style={styles.sectionHeaderBadge}>Total: Rs {formatNum(earningsTotal)}</Text>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>OverTime (Hrs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={overTimeHrs} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>OverTime (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.boldText, styles.lockedInput]} value={overTimeAmount} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Rotti (Days) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={rotiDays} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Rotti Amount (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={rotiAmount} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Nashta (Days) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={nashtaDays} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Nashta Amount (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={nashtaAmount} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Monthly Comm (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.boldText, styles.lockedInput]} value={monthlyComm} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>UG Comm (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.boldText, styles.lockedInput]} value={ugComm} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>WareHouse Comm (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={warehouseComm} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Fix Allowance (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={fixAllowance} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>ST.Less Allow (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={stLessAllow} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Other Allowance (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.lockedInput]} value={otherAllow} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Earnings (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgBlue, styles.boldText, styles.lockedInput]} value={earningsTotal} editable={false} />
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 3: DEDUCTIONS (RED THEME) */}
        <View style={styles.sectionCard}>
          <View style={[styles.sectionHeader, styles.headerRed]}>
            <Text style={styles.sectionHeaderText}>Deductions & Recoveries</Text>
            <Text style={styles.sectionHeaderBadge}>Total: Rs {formatNum(deductionsTotal)}</Text>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>ShortTime (Hrs) 🔒</Text>
                <TextInput
                  style={[styles.inputBox, styles.bgRed, styles.lockedInput]}
                  value={shortTimeHrs}
                  editable={false}
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>ShortTime Amount (Rs) 🔒</Text>
                <TextInput
                  style={[styles.inputBox, styles.bgRed, styles.boldText, styles.lockedInput]}
                  value={shortTimeAmount}
                  editable={false}
                />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: '#F59E0B' }]}>TSW (Short Week Days) ✏️</Text>
                <TextInput
                  style={[styles.inputBox, styles.bgRed, styles.boldText, { borderColor: '#F59E0B' }]}
                  value={shortWeekDays}
                  keyboardType="numeric"
                  onChangeText={(text) => {
                    activeShortWeekSourceRef.current = 'tsw';
                    setShortWeekDays(text);
                  }}
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>TFC / Fund (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={tfc} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Food Rate / Day 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={foodDeduction} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>T. Food Exp (EB Total) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={ebDeduction} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Umrah Deduction (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={umrahDeduction} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Other Deduction (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={otherDeduction} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Security Deposit (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={securityDeposit} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Penalty (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.bgRed, styles.lockedInput]} value={penalty} editable={false} />
              </View>
            </View>

            <View style={styles.summaryHighlightRow}>
              <Text style={styles.summaryHighlightLabel}>Total Deductions:</Text>
              <Text style={[styles.summaryHighlightVal, { color: '#EF4444' }]}>Rs {formatNum(deductionsTotal)}</Text>
            </View>
          </View>
        </View>

        {/* SECTION 4: NET CALCULATION & DISBURSEMENT */}
        <View style={styles.sectionCard}>
          <View style={[styles.sectionHeader, styles.headerPurple]}>
            <Text style={styles.sectionHeaderText}>Net Calculation & Advances</Text>
            <TouchableOpacity onPress={() => loadOrCalculate(selectedEmployee?._id, selectedMonthYear, selectedBranch, wkDays30)}>
              <Text style={{ color: '#E0E7FF', fontSize: 12 }}>🔄 Recalculate</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Gross Total (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.boldText, styles.lockedInput]} value={grossTotal} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>CM Advance & Recovery 🔒</Text>
                <View style={styles.splitRow}>
                  <TextInput style={[styles.inputBox, styles.lockedInput, { flex: 1, marginRight: 4 }]} placeholder="Bal" value={cmAdv} editable={false} />
                  <TextInput style={[styles.inputBox, styles.lockedInput, { flex: 1 }]} placeholder="Rec" value={cmAdvRec} editable={false} />
                </View>
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>PM Advance & Recovery 🔒</Text>
                <View style={styles.splitRow}>
                  <TextInput style={[styles.inputBox, styles.lockedInput, { flex: 1, marginRight: 4 }]} placeholder="Bal" value={pmAdv} editable={false} />
                  <TextInput style={[styles.inputBox, styles.lockedInput, { flex: 1 }]} placeholder="Rec" value={pmAdvRec} editable={false} />
                </View>
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Total Adv Recovery (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.boldText, styles.lockedInput]} value={totalAdvRec} editable={false} />
              </View>
            </View>

            {/* Net Total Hero Card */}
            <View style={styles.netHeroCard}>
              <Text style={styles.netHeroLabel}>NET PAYABLE SALARY</Text>
              <Text style={styles.netHeroAmount}>Rs {formatNum(netTotal)}</Text>
              <Text style={styles.netHeroSub}>
                Formula: Gross (Rs {formatNum(grossTotal)}) - Advance Recovered (Rs {formatNum(totalAdvRec)})
              </Text>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>WHT (Income Tax) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.lockedInput]} value={wht} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Bank Paid (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.boldText, styles.lockedInput]} value={bankPaid} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Cash Paid (Rs) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.boldText, styles.lockedInput]} value={cashPaid} editable={false} />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Balance / Rebate 🔒</Text>
                <TextInput style={[styles.inputBox, styles.lockedInput]} value={balance} editable={false} />
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Branch Bank (Disbursement) 🔒</Text>
                <TextInput style={[styles.inputBox, styles.lockedInput]} value={branchBank} editable={false} placeholder="Branch Bank" />
              </View>
              <View style={styles.gridCol}>
                <Text style={[styles.fieldLabel, { color: '#38BDF8' }]}>Remarks ✏️</Text>
                <TextInput style={[styles.inputBox, { borderColor: '#0284C7' }]} value={remarks} onChangeText={setRemarks} placeholder="Optional notes" />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Dock (Matching Web ERP Save/List + Thermal + WhatsApp) */}
      <View style={styles.bottomDock}>
        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnSave]}
          onPress={handleSavePayroll}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.dockBtnIcon}>💾</Text>
              <Text style={styles.dockBtnText} numberOfLines={1} adjustsFontSizeToFit>Save</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, { backgroundColor: '#16A34A' }]}
          onPress={() => handleWhatsAppShare()}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>💬</Text>
          <Text style={styles.dockBtnText} numberOfLines={1} adjustsFontSizeToFit>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, { backgroundColor: '#D97706' }]}
          onPress={() => handleThermalPrint()}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>🖨️</Text>
          <Text style={styles.dockBtnText} numberOfLines={1} adjustsFontSizeToFit>Thermal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnPrint]}
          onPress={() => handlePrintSlip()}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>📄</Text>
          <Text style={styles.dockBtnText} numberOfLines={1} adjustsFontSizeToFit>PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dockBtn, styles.dockBtnList]}
          onPress={() => navigate('EmpSalaryReports', { initialTab: 'payroll_list' })}
          activeOpacity={0.8}
        >
          <Text style={styles.dockBtnIcon}>📋</Text>
          <Text style={styles.dockBtnText} numberOfLines={1} adjustsFontSizeToFit>List</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: Employee Search Picker (Top-Anchored Dropdown Design) */}
      <Modal 
        visible={isEmployeeModalVisible} 
        animationType="fade" 
        transparent 
        onRequestClose={() => {
          Keyboard.dismiss();
          setIsEmployeeModalVisible(false);
        }}
      >
        <KeyboardAvoidingView 
          style={styles.empTopModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.empTopModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>👤</Text>
                <Text style={styles.modalTitle}>Select Employee ({allEmployees.length})</Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  Keyboard.dismiss();
                  setIsEmployeeModalVisible(false);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
              >
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBoxWrapper}>
              <Text style={{ fontSize: 14, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={styles.modalSearchInputTop}
                placeholder="Search name, code, or branch..."
                placeholderTextColor="#94A3B8"
                value={employeeSearchText}
                onChangeText={setEmployeeSearchText}
                autoFocus
                returnKeyType="search"
              />
              {Boolean(employeeSearchText) && (
                <TouchableOpacity 
                  onPress={() => setEmployeeSearchText('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: '#94A3B8', fontSize: 15, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={modalFilteredEmployees}
              keyExtractor={(item, idx) => String(item._id || item.id || item.code || idx)}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.empPickerItemCard}
                  onPress={() => {
                    Keyboard.dismiss();
                    selectEmployee(item);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={styles.empPickerAvatar}>
                    <Text style={styles.empPickerAvatarText}>{(getSafeString(item.name, 'E')).substring(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.empPickerName}>{getSafeString(item.name, 'Staff')}</Text>
                      <View style={styles.empCodeBadge}>
                        <Text style={styles.empCodeBadgeText}>ID: {getSafeString(item.code, 'N/A')}</Text>
                      </View>
                    </View>
                    <Text style={styles.empPickerSub}>
                      {getSafeString(item.designation, 'Staff')} • {getSafeString(item.branch, getSafeString(selectedBranch, 'Store'))}
                    </Text>
                  </View>
                  <Text style={styles.empPickerArrow}>›</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 25, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>No employees found matching search.</Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Branch Picker */}
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
                  {selectedBranch === item && <Text style={{ color: '#0284C7', fontWeight: 'bold' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* SECURITY VERIFICATION MODAL FOR CURRENT SLIP DELETION */}
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

            {/* Targeted Slip Info */}
            <View style={styles.deleteTargetBox}>
              <Text style={styles.deleteTargetTitle}>Target Salary Slip:</Text>
              <Text style={styles.deleteTargetEmp}>
                {selectedEmployee?.name || 'Employee'} (#{code || selectedEmployee?.code || '-'})
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={styles.deleteTargetSub}>
                  Period: {selectedMonthYear}
                </Text>
                <Text style={[styles.deleteTargetSub, { color: '#10B981', fontWeight: 'bold' }]}>
                  Net: Rs. {formatNum(netTotal)}
                </Text>
              </View>
            </View>

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
                onPress={handleAuthorizeAndDeleteCurrentSlip}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : (Platform.OS === 'ios' ? 48 : 20),
    paddingBottom: 14,
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
    color: '#10B981',
    fontWeight: '500',
    marginTop: 1,
  },
  listShortcutBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  listShortcutBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    padding: 12,
  },
  filterCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  monthNavBox: {
    flex: 1,
  },
  branchBox: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  monthArrow: {
    padding: 6,
  },
  monthArrowText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  monthText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  branchSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  branchSelectText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: {
    color: '#94A3B8',
    fontSize: 10,
    marginLeft: 4,
  },
  headerCheckRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  checkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  checkPillActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    borderColor: '#38BDF8',
  },
  checkIcon: {
    color: '#38BDF8',
    fontSize: 13,
    marginRight: 4,
  },
  checkLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  checkLabelActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  empSelectCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  empSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  empSearchBtnIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  empSearchBtnText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  calcLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderRadius: 6,
  },
  calcLoadingText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  existingPayrollBadge: {
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  existingPayrollText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerGreen: {
    backgroundColor: '#059669',
  },
  headerBlue: {
    backgroundColor: '#0284C7',
  },
  headerRed: {
    backgroundColor: '#DC2626',
  },
  headerPurple: {
    backgroundColor: '#6366F1',
  },
  sectionHeaderText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionHeaderBadge: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '600',
  },
  cardContent: {
    padding: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  gridCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  inputBox: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  boldText: {
    fontWeight: '700',
  },
  bgGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  bgBlue: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  bgRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  summaryHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryHighlightLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryHighlightVal: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  splitRow: {
    flexDirection: 'row',
  },
  netHeroCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    padding: 14,
    alignItems: 'center',
    marginVertical: 10,
  },
  netHeroLabel: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  netHeroAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 4,
  },
  netHeroSub: {
    color: '#C7D2FE',
    fontSize: 10,
    textAlign: 'center',
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
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dockBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 10,
    minHeight: 52,
  },
  dockBtnSave: {
    backgroundColor: '#10B981',
  },
  dockBtnPrint: {
    backgroundColor: '#0284C7',
  },
  dockBtnList: {
    backgroundColor: '#475569',
  },
  dockBtnIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  dockBtnText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  empTopModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.88)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 28 : 50,
    paddingHorizontal: 12,
  },
  empTopModalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    padding: 16,
    maxHeight: '82%',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 24,
  },
  modalSearchBoxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 6 : 10,
    marginBottom: 12,
  },
  modalSearchInputTop: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  empPickerItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    borderRadius: 12,
    marginVertical: 4,
  },
  empCodeBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  empCodeBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
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
  empModalContent: {
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'android' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
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
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  empPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  lockedInput: {
    opacity: 0.95,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: 'rgba(51, 65, 85, 0.65)',
    color: '#E2E8F0',
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
    color: '#fff',
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
});
