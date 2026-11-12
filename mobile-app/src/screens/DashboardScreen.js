import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  SafeAreaView,
  StatusBar,
  Modal,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect
} from 'react-native-svg';
import { api, getCachedData } from '../services/api';
import { haptic } from '../services/haptics';
import OfflineBanner from '../components/common/OfflineBanner';
import SalesTrendChart from '../components/common/SalesTrendChart';
import { DashboardSkeleton } from '../components/common/SkeletonPlaceholder';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

export default function DashboardScreen({ user, onLogout, navigation }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Dashboard Active Tab: 'sales' | 'operations' | 'hr'
  const [adminTab, setAdminTab] = useState('sales');

  // Sidebar Drawer Visibility
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Branch Selection & Checklist States
  const [branches, setBranches] = useState(['All Branches']);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [hrBranch, setHrBranch] = useState('Select Branch');
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [branchEmployees, setBranchEmployees] = useState([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('all'); // 'all' | 'present' | 'not_marked' | 'absent' | 'leave'

  // Dedicated Revenue & Profit Trajectory Branch States (Separated from top filter)
  const [chartBranch, setChartBranch] = useState('All Branches');
  const [chartBranchModalVisible, setChartBranchModalVisible] = useState(false);
  const [chartDailyTrend, setChartDailyTrend] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  const getTodayDateString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getFirstDayOfMonthString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  };

  // Sales Board States
  const [salesPeriod, setSalesPeriod] = useState('month');
  const [customStartDate, setCustomStartDate] = useState(getFirstDayOfMonthString());
  const [customEndDate, setCustomEndDate] = useState(getTodayDateString());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [salesData, setSalesData] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState('');
  const [expandedPaymentBranch, setExpandedPaymentBranch] = useState(null);

  const loadData = async () => {
    setError('');
    try {
      if (user && user.role === 'employee') {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const res = await api.getMyLogs(month, year);
        if (res.success && res.data && res.data.length > 0) {
          const todayDateStr = now.toISOString().split('T')[0];
          const todayRecord = res.data.find(log => {
            const logDateStr = new Date(log.date).toISOString().split('T')[0];
            return logDateStr === todayDateStr;
          });
          setTodayLog(todayRecord || null);
        }
      } else {
        // Parallel execution: fetch summary, branches list, and sales dashboard simultaneously
        const fetchSummaryTask = async () => {
          try {
            const res = await api.getAdminSummary();
            if (res && res.success) {
              setDashboardData(res);
            }
          } catch (sErr) {
            console.warn('Error fetching admin summary:', sErr.message);
          }
        };

        const fetchBranchesTask = async () => {
          try {
            let rawBranches = [];
            try {
              const bRes = await api.get('/mobile/admin/branches');
              if (bRes?.success && Array.isArray(bRes.data) && bRes.data.length > 0) {
                rawBranches = bRes.data;
              }
            } catch {}

            if (rawBranches.length === 0) {
              try {
                const sRes = await api.get('/stores');
                const sList = sRes?.data || sRes || [];
                if (Array.isArray(sList) && sList.length > 0) {
                  rawBranches = sList.map(s => s.name || s.branch || s);
                }
              } catch {}
            }

            if (rawBranches.length === 0) {
              try {
                const mbRes = await api.get('/mobile/branches');
                const mbList = mbRes?.data || mbRes?.stores || [];
                if (Array.isArray(mbList) && mbList.length > 0) {
                  rawBranches = mbList.map(s => s.name || s.branch || s);
                }
              } catch {}
            }

            const seen = new Set();
            const cleanBranches = ['All Branches'];
            seen.add('all branches');
            seen.add('all');
            seen.add('select branch');

            rawBranches.forEach(b => {
              const rawName = typeof b === 'string' ? b : (b?.name || b?.branch || '');
              const trimmed = rawName.trim().replace(/[()]/g, '');
              const key = trimmed.toLowerCase();
              if (trimmed && !seen.has(key)) {
                seen.add(key);
                cleanBranches.push(trimmed);
              }
            });

            if (cleanBranches.length > 1) {
              setBranches(cleanBranches);
              setSelectedBranch(prev => (prev && prev !== 'Select Branch' && cleanBranches.includes(prev)) ? prev : 'All Branches');
            }
          } catch (bErr) {
            console.error('Error fetching branches list:', bErr.message);
          }
        };

        const targetBranch = (selectedBranch && selectedBranch !== 'Select Branch') ? selectedBranch : 'All Branches';
        const fetchSalesTask = fetchSalesDashboard(salesPeriod, targetBranch, customStartDate, customEndDate);

        // Run all three requests in parallel for 3x faster initial load
        await Promise.allSettled([fetchSummaryTask(), fetchBranchesTask(), fetchSalesTask]);
      }
    } catch (err) {
      setError(err.message || 'Error loading dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSalesDashboard = async (
    period = 'month',
    branchName = selectedBranch || 'All Branches',
    startDate = customStartDate,
    endDate = customEndDate
  ) => {
    if (user?.role === 'employee') return;
    setSalesLoading(true);
    try {
      const activeBranch = (branchName && branchName !== 'All Branches' && branchName !== 'Select Branch') ? branchName : '';
      const branchParam = activeBranch ? `&branch=${encodeURIComponent(activeBranch)}` : '';
      let url = `/mobile/admin/sales-dashboard?period=${period}${branchParam}`;
      if (period === 'custom') {
        const s = startDate || customStartDate;
        const e = endDate || customEndDate;
        url += `&startDate=${encodeURIComponent(s)}&endDate=${encodeURIComponent(e)}`;
      }
      const res = await api.get(url);
      if (res && res.success) {
        setSalesData(res);
        if (res.dailyTrend && chartBranch === 'All Branches') {
          setChartDailyTrend(res.dailyTrend);
        }
        if (res.categories && res.categories.length > 0) {
          setActiveCategoryTab(prev => {
            const exists = res.categories.some(c => c.name === prev);
            return exists ? prev : res.categories[0].name;
          });
        }
      }
    } catch (err) {
      console.error('Error fetching sales dashboard:', err);
    } finally {
      setSalesLoading(false);
    }
  };

  const fetchDedicatedChartTrend = async (
    period = salesPeriod,
    bName = chartBranch,
    sDate = customStartDate,
    eDate = customEndDate
  ) => {
    if (user?.role === 'employee') return;
    setChartLoading(true);
    try {
      const activeBranch = (bName && bName !== 'All Branches' && bName !== 'Select Branch') ? bName : '';
      const branchParam = activeBranch ? `&branch=${encodeURIComponent(activeBranch)}` : '';
      let url = `/mobile/admin/sales-dashboard?period=${period}${branchParam}`;
      if (period === 'custom') {
        url += `&startDate=${encodeURIComponent(sDate)}&endDate=${encodeURIComponent(eDate)}`;
      }
      const res = await api.get(url);
      if (res && res.success && res.dailyTrend) {
        setChartDailyTrend(res.dailyTrend);
      }
    } catch (e) {
      console.error('Error fetching dedicated chart trend:', e);
    } finally {
      setChartLoading(false);
    }
  };

  const handleChartBranchSelect = (branchName) => {
    const target = (!branchName || branchName === 'Select Branch') ? 'All Branches' : branchName;
    setChartBranch(target);
    setChartBranchModalVisible(false);
    try {
      haptic.selection();
    } catch {}
    fetchDedicatedChartTrend(salesPeriod, target, customStartDate, customEndDate);
  };

  const handleQuickPreset = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    const toStr = to.toISOString().split('T')[0];
    const fromStr = from.toISOString().split('T')[0];
    setCustomStartDate(fromStr);
    setCustomEndDate(toStr);
    fetchSalesDashboard('custom', selectedBranch, fromStr, toStr);
    if (chartBranch !== 'All Branches') {
      fetchDedicatedChartTrend('custom', chartBranch, fromStr, toStr);
    }
  };

  const handleQuickMonth = () => {
    const fromStr = getFirstDayOfMonthString();
    const toStr = getTodayDateString();
    setCustomStartDate(fromStr);
    setCustomEndDate(toStr);
    fetchSalesDashboard('custom', selectedBranch, fromStr, toStr);
    if (chartBranch !== 'All Branches') {
      fetchDedicatedChartTrend('custom', chartBranch, fromStr, toStr);
    }
  };

  const fetchBranchEmployees = async (branchName) => {
    if (!branchName || branchName === 'Select Branch') {
      setBranchEmployees([]);
      setBranchLoading(false);
      return;
    }
    setBranchLoading(true);
    try {
      const branchParam = encodeURIComponent(branchName || 'All Branches');
      const response = await api.get(`/mobile/admin/branch-status?branch=${branchParam}`);
      if (response && response.success && Array.isArray(response.data)) {
        setBranchEmployees(response.data);
      } else {
        setBranchEmployees([]);
      }
    } catch (err) {
      console.error('Error loading branch status for dashboard:', err);
      setBranchEmployees([]);
    } finally {
      setBranchLoading(false);
    }
  };

  const handleBranchSelect = (branchName) => {
    const target = (!branchName || branchName === 'Select Branch') ? 'All Branches' : branchName;
    setSelectedBranch(target);
    fetchSalesDashboard(salesPeriod, target, customStartDate, customEndDate);
  };

  const handleHrBranchSelect = (branchName) => {
    const target = branchName || 'Select Branch';
    setHrBranch(target);
    setBranchModalVisible(false);
    if (target === 'Select Branch') {
      setBranchEmployees([]);
    } else {
      fetchBranchEmployees(target);
    }
  };

  const handlePeriodChange = (period) => {
    setSalesPeriod(period);
    if (period === 'custom') {
      fetchSalesDashboard('custom', selectedBranch, customStartDate, customEndDate);
      if (chartBranch !== 'All Branches') {
        fetchDedicatedChartTrend('custom', chartBranch, customStartDate, customEndDate);
      }
    } else {
      fetchSalesDashboard(period, selectedBranch);
      if (chartBranch !== 'All Branches') {
        fetchDedicatedChartTrend(period, chartBranch);
      }
    }
  };

  useEffect(() => {
    // 1. Instant Cache Hydration: Render cached dashboard immediately in ~5ms
    let isMounted = true;
    (async () => {
      try {
        const [cachedSummary, cachedSales] = await Promise.all([
          getCachedData('/mobile/admin/summary'),
          getCachedData(`/mobile/admin/sales-dashboard?period=${salesPeriod}`),
        ]);

        if (isMounted) {
          if (cachedSummary?.data) setDashboardData(cachedSummary.data);
          if (cachedSales?.data) setSalesData(cachedSales.data);
          if (cachedSummary?.data || cachedSales?.data) {
            setLoading(false); // Instantly display without waiting for network!
          }
        }
      } catch {}

      // 2. Fetch fresh live data in background
      if (isMounted) {
        loadData();
      }
    })();

    return () => { isMounted = false; };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
      if (adminTab === 'hr' && hrBranch && hrBranch !== 'Select Branch') {
        await fetchBranchEmployees(hrBranch);
      }
    } catch {}
    setRefreshing(false);
  };

  const getSalesPeriodLabel = () => {
    switch (salesPeriod) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'week': return 'This Week';
      case 'custom': return `${customStartDate} to ${customEndDate}`;
      default: {
        const now = new Date();
        return now.toLocaleString('default', { month: 'long', year: 'numeric' });
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.mainWrapper}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Text style={styles.welcomeText}>BAS Executive Dashboard</Text>
          <ActivityIndicator size="small" color="#06B6D4" />
        </View>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Employee Dashboard View
  // -------------------------------------------------------------
  const renderEmployeeView = () => {
    const totalHrs = todayLog ? (parseFloat(todayLog.workedHrs || todayLog.totalHrs || 0)) : 0;
    const goalHrs = 9.0;
    const progressPercent = Math.min(100, Math.round((totalHrs / goalHrs) * 100));

    return (
      <ScrollView
        contentContainerStyle={styles.employeeContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
      >
        <View style={styles.statusCard}>
          <Text style={styles.cardSubtitle}>TODAY'S ATTENDANCE STATUS</Text>
          <View style={styles.cardHeader}>
            <Text style={styles.statusTitle}>
              {todayLog ? (todayLog.displayStatus || 'PRESENT').toUpperCase() : 'NOT SCANNED YET'}
            </Text>
            <View style={[styles.statusDot, todayLog?.isPresent ? styles.dotGreen : styles.dotRed]} />
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>CHECK IN</Text>
              <Text style={styles.metricVal}>{todayLog?.checkIn || '--:--'}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>CHECK OUT</Text>
              <Text style={styles.metricVal}>{todayLog?.checkOut || '--:--'}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>WORKED</Text>
              <Text style={[styles.metricVal, { color: '#38BDF8' }]}>
                {todayLog?.workedHrs || `${totalHrs.toFixed(1)} hrs`}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Employee Actions */}
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation('EmployeeFinancials', { mode: 'payslips' })}
            activeOpacity={0.7}
          >
            <Text style={styles.quickActionIcon}>📄</Text>
            <Text style={styles.quickActionTitle}>Pay Slips</Text>
            <Text style={styles.quickActionDesc}>View & Print Slips</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation('EmployeeFinancials', { mode: 'advance' })}
            activeOpacity={0.7}
          >
            <Text style={styles.quickActionIcon}>💳</Text>
            <Text style={styles.quickActionTitle}>Advance Ledger</Text>
            <Text style={styles.quickActionDesc}>Check Loan Balance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation('Attendance')}
            activeOpacity={0.7}
          >
            <Text style={styles.quickActionIcon}>📅</Text>
            <Text style={styles.quickActionTitle}>My Logs</Text>
            <Text style={styles.quickActionDesc}>Monthly Timesheet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation('Schedule')}
            activeOpacity={0.7}
          >
            <Text style={styles.quickActionIcon}>⏰</Text>
            <Text style={styles.quickActionTitle}>Duty Shift</Text>
            <Text style={styles.quickActionDesc}>Timings & Off Days</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.bottomLogoutCard}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.bottomLogoutText}>🚪 Logout / Switch Account</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // -------------------------------------------------------------
  // TAB 1: Executive Sales & Payment Details View (Exact 1-to-1 Web Dashboard)
  // -------------------------------------------------------------
  const renderSalesDashboardView = () => {
    const totals = salesData?.totals || { totalSales: 0, totalCost: 0, totalProfit: 0, totalPaid: 0, totalBalance: 0, margin: 0 };
    const categories = salesData?.categories || [];

    // Categories to display based on selected category tab
    const categoriesToDisplay = activeCategoryTab === 'All Categories' || !activeCategoryTab
      ? categories
      : categories.filter(c => c.name === activeCategoryTab);

    // Dynamic totals matching the selected view (All Categories or individual Category Tab)
    const activeCat = (activeCategoryTab && activeCategoryTab !== 'All Categories')
      ? categories.find(c => c.name === activeCategoryTab)
      : null;

    const displayedTotals = activeCat
      ? {
          totalSales: Number(activeCat.totalSale) || 0,
          totalCost: Number(activeCat.totalCost) || 0,
          totalPaid: Number(activeCat.totalPaid) || 0,
          totalBalance: (activeCat.totalBalance !== undefined && activeCat.totalBalance !== null)
            ? Number(activeCat.totalBalance)
            : ((Number(activeCat.totalCost) || 0) - (Number(activeCat.totalPaid) || 0))
        }
      : {
          totalSales: Number(totals.totalSales) || 0,
          totalCost: Number(totals.totalCost) || 0,
          totalPaid: Number(totals.totalPaid) || 0,
          totalBalance: (totals.totalBalance !== undefined && totals.totalBalance !== null)
            ? Number(totals.totalBalance)
            : ((Number(totals.totalCost) || 0) - (Number(totals.totalPaid) || 0))
        };

    return (
      <ScrollView
        style={styles.adminScrollView}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
      >
        {/* Top Header Controls: Period & Branch Selector */}
        {/* Payment Details Container */}
        <View style={styles.execBanner}>
          <View style={styles.execBannerTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <View style={styles.execWalletBadge}>
                <Ionicons name="wallet" size={20} color="#00D2FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.execBannerTitle}>
                  Payment Details <Text style={styles.execBannerDate}>({getSalesPeriodLabel()})</Text>
                </Text>
                <Text style={styles.execBannerSub} numberOfLines={1}>
                  Central Sales, Cost &amp; Vendor Payments Overview
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.refreshIconBtn}
              onPress={() => {
                if (salesPeriod === 'custom') {
                  setShowStartPicker(true);
                } else {
                  fetchSalesDashboard(salesPeriod, selectedBranch, customStartDate, customEndDate);
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={18} color="#00D2FF" />
            </TouchableOpacity>
          </View>

          {/* Time Filter Pills */}
          <View style={styles.periodPillRow}>
            {['today', 'yesterday', 'week', 'month', 'custom'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodPill, salesPeriod === p && styles.periodPillActive]}
                onPress={() => handlePeriodChange(p)}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.periodPillText, salesPeriod === p && styles.periodPillTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Custom'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Date Range Selector — Native Calendar Picker */}
          {salesPeriod === 'custom' && (
            <View style={styles.customDateContainer}>
              <View style={styles.customDateInputsRow}>
                {/* FROM DATE */}
                <View style={styles.customDateCol}>
                  <Text style={styles.customDateLabel}>📅 FROM DATE</Text>
                  <TouchableOpacity
                    style={styles.customDateInput}
                    onPress={() => { setShowEndPicker(false); setShowStartPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#F8FAFC', fontSize: 12, fontWeight: '600' }}>
                      {customStartDate || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* TO DATE */}
                <View style={styles.customDateCol}>
                  <Text style={styles.customDateLabel}>📅 TO DATE</Text>
                  <TouchableOpacity
                    style={styles.customDateInput}
                    onPress={() => { setShowStartPicker(false); setShowEndPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#F8FAFC', fontSize: 12, fontWeight: '600' }}>
                      {customEndDate || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.customDateApplyBtn}
                  onPress={() => {
                    setShowStartPicker(false);
                    setShowEndPicker(false);
                    fetchSalesDashboard('custom', selectedBranch, customStartDate, customEndDate);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.customDateApplyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>

              {/* Native Calendar Picker for Start Date */}
              {showStartPicker && (
                <DateTimePicker
                  value={customStartDate ? new Date(customStartDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(event, selectedDate) => {
                    setShowStartPicker(Platform.OS === 'ios');
                    if (event.type === 'dismissed') { setShowStartPicker(false); return; }
                    if (selectedDate) {
                      const y = selectedDate.getFullYear();
                      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const d = String(selectedDate.getDate()).padStart(2, '0');
                      setCustomStartDate(`${y}-${m}-${d}`);
                    }
                  }}
                  themeVariant="dark"
                />
              )}

              {/* Native Calendar Picker for End Date */}
              {showEndPicker && (
                <DateTimePicker
                  value={customEndDate ? new Date(customEndDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  onChange={(event, selectedDate) => {
                    setShowEndPicker(Platform.OS === 'ios');
                    if (event.type === 'dismissed') { setShowEndPicker(false); return; }
                    if (selectedDate) {
                      const y = selectedDate.getFullYear();
                      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const d = String(selectedDate.getDate()).padStart(2, '0');
                      setCustomEndDate(`${y}-${m}-${d}`);
                    }
                  }}
                  themeVariant="dark"
                />
              )}

              {/* Quick Preset Buttons */}
              <View style={styles.customPresetsRow}>
                <TouchableOpacity onPress={() => handleQuickPreset(7)} style={styles.presetChip} activeOpacity={0.7}>
                  <Text style={styles.presetChipText}>Last 7D</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleQuickPreset(15)} style={styles.presetChip} activeOpacity={0.7}>
                  <Text style={styles.presetChipText}>Last 15D</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleQuickPreset(30)} style={styles.presetChip} activeOpacity={0.7}>
                  <Text style={styles.presetChipText}>Last 30D</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleQuickMonth()} style={styles.presetChip} activeOpacity={0.7}>
                  <Text style={styles.presetChipText}>This Month</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Branch Filter Horizontal Scroll & Dropdown */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.branchSelectTitle}>STORE BRANCH</Text>
              <TouchableOpacity
                style={styles.dashDropdownBtn}
                onPress={() => setBranchModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="storefront-outline" size={13} color="#38BDF8" style={{ marginRight: 5 }} />
                <Text style={styles.dashDropdownBtnText} numberOfLines={1}>
                  {selectedBranch || 'All Branches'}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#38BDF8" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {branches.map((b, idx) => {
                const isSelected = selectedBranch === b;
                const isAll = b === 'All Branches';
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.salesBranchPill, isSelected && styles.salesBranchPillActive]}
                    onPress={() => handleBranchSelect(b)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isAll ? "business-outline" : "location"}
                      size={13}
                      color={isAll ? (isSelected ? "#FFFFFF" : "#38BDF8") : "#EF4444"}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.salesBranchPillText, isSelected && styles.salesBranchPillTextActive]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Branch Night Closing & SMS Hub Banner */}
        <TouchableOpacity
          style={styles.nightClosingBanner}
          onPress={() => navigation('BranchNightClosing')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <View style={styles.nightClosingIconCircle}>
              <Ionicons name="moon" size={18} color="#FBBF24" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.nightClosingTitle} numberOfLines={1}>
                Branch Night Closing &amp; SMS Hub
              </Text>
              <Text style={styles.nightClosingSub} numberOfLines={1}>
                View Daily Sale, Cash Activity &amp; WhatsApp summaries
              </Text>
            </View>
          </View>
          <View style={styles.nightClosingBtn}>
            <Text style={styles.nightClosingBtnText}>Open</Text>
            <Ionicons name="arrow-forward" size={12} color="#FFFFFF" style={{ marginLeft: 3 }} />
          </View>
        </TouchableOpacity>

        {/* 4 Dashboard KPI Cards (2x2 Grid) */}
        <View style={styles.webKpiGrid}>
          {/* Total Sales (Emerald Green) */}
          <View style={[styles.webKpiCard, { backgroundColor: '#059669' }]}>
            <View style={styles.webKpiTopRow}>
              <View style={styles.webKpiIconCircle}>
                <Ionicons name="cart-outline" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.webKpiLabel} numberOfLines={1}>TOTAL SALES</Text>
            </View>
            <Text style={styles.webKpiValue}>{formatCurrency(displayedTotals.totalSales)}</Text>
            <View style={styles.webKpiBottomRow}>
              <View style={styles.webKpiTrendBadge}>
                <Ionicons name="arrow-up" size={10} color="#D1FAE5" style={{ marginRight: 2 }} />
                <Text style={styles.webKpiTrendText}>+12.4%</Text>
              </View>
              <Svg width={46} height={18} viewBox="0 0 46 18">
                <Path
                  d="M 2 14 Q 14 16, 22 9 T 36 7 T 44 3"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </View>

          {/* Total Cost (Ocean Blue) */}
          <View style={[styles.webKpiCard, { backgroundColor: '#0284C7' }]}>
            <View style={styles.webKpiTopRow}>
              <View style={styles.webKpiIconCircle}>
                <Ionicons name="layers-outline" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.webKpiLabel} numberOfLines={1}>TOTAL COST</Text>
            </View>
            <Text style={styles.webKpiValue}>{formatCurrency(displayedTotals.totalCost)}</Text>
            <View style={styles.webKpiBottomRow}>
              <View style={styles.webKpiTrendBadge}>
                <Ionicons name="arrow-up" size={10} color="#E0F2FE" style={{ marginRight: 2 }} />
                <Text style={[styles.webKpiTrendText, { color: '#E0F2FE' }]}>+8.7%</Text>
              </View>
              <Svg width={46} height={18} viewBox="0 0 46 18">
                <Path
                  d="M 2 13 Q 14 15, 22 8 T 36 8 T 44 3"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </View>

          {/* Category Payments (Indigo / Violet) */}
          <View style={[styles.webKpiCard, { backgroundColor: '#6366F1' }]}>
            <View style={styles.webKpiTopRow}>
              <View style={styles.webKpiIconCircle}>
                <Ionicons name="card-outline" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.webKpiLabel} numberOfLines={1}>CATEGORY PAYMENTS</Text>
            </View>
            <Text style={styles.webKpiValue}>{formatCurrency(displayedTotals.totalPaid)}</Text>
            <View style={styles.webKpiBottomRow}>
              <View style={styles.webKpiTrendBadge}>
                <Ionicons name="arrow-up" size={10} color="#EDE9FE" style={{ marginRight: 2 }} />
                <Text style={[styles.webKpiTrendText, { color: '#EDE9FE' }]}>+10.2%</Text>
              </View>
              <Svg width={46} height={18} viewBox="0 0 46 18">
                <Path
                  d="M 2 14 Q 14 16, 22 9 T 36 7 T 44 3"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </View>

          {/* Balance Payment (Coral Red) */}
          <View style={[styles.webKpiCard, { backgroundColor: displayedTotals.totalBalance > 0 ? '#EF4444' : '#10B981' }]}>
            <View style={styles.webKpiTopRow}>
              <View style={styles.webKpiIconCircle}>
                <Ionicons name="wallet-outline" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.webKpiLabel} numberOfLines={1}>BALANCE PAYMENT</Text>
            </View>
            <Text style={styles.webKpiValue}>{formatCurrency(displayedTotals.totalBalance)}</Text>
            <View style={styles.webKpiBottomRow}>
              <View style={styles.webKpiTrendBadge}>
                <Ionicons name="arrow-up" size={10} color="#FFE4E6" style={{ marginRight: 2 }} />
                <Text style={[styles.webKpiTrendText, { color: '#FFE4E6' }]}>+6.3%</Text>
              </View>
              <Svg width={46} height={18} viewBox="0 0 46 18">
                <Path
                  d="M 2 14 Q 14 16, 22 10 T 36 8 T 44 4"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.5)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </View>
        </View>

        {/* PAYMENT DETAIL REPORT Section Heading */}
        <View style={styles.subSectionHeadingRow}>
          <Ionicons name="receipt" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
          <Text style={styles.subSectionHeadingText}>
            PAYMENT DETAIL REPORT <Text style={styles.subSectionDateText}>({getSalesPeriodLabel()})</Text>
          </Text>
        </View>

        {/* Category Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {['All Categories', ...categories.map(c => c.name)].map((catName, idx) => {
            const isSelected = (activeCategoryTab === catName || (catName === 'All Categories' && !activeCategoryTab));
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.catTabPill, isSelected && styles.catTabPillActive]}
                onPress={() => setActiveCategoryTab(catName)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="folder"
                  size={13}
                  color={isSelected ? '#FFFFFF' : '#F59E0B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.catTabPillText, isSelected && styles.catTabPillTextActive]}>
                  {catName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category Breakdown Tables (1-to-1 Web Layout) */}
        {salesLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingSubtext}>Loading Payment Details...</Text>
          </View>
        ) : categoriesToDisplay.length > 0 ? (
          categoriesToDisplay.map((cat, cIdx) => (
            <View key={cIdx} style={styles.tableCard}>
              {/* Solid Blue Category Header Bar */}
              <View style={styles.tableCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                  <Ionicons name="folder" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.tableCardTitle} numberOfLines={1}>
                    {cat.name.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.tableCardHeaderBadge}>
                  <Text style={styles.tableCardHeaderBadgeText}>
                    {cat.branches?.length || 0} Stores
                  </Text>
                </View>
              </View>

              {/* Table Column Headers - Full Width, Zero Horizontal Scrolling */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCell, styles.colBranch]}>
                  <Text style={[styles.thText, { textAlign: 'left' }]} numberOfLines={1} adjustsFontSizeToFit>BRANCH</Text>
                </View>
                <View style={[styles.thCell, styles.colSale]}>
                  <Text style={[styles.thText, { textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>SALE</Text>
                </View>
                <View style={[styles.thCell, styles.colCost]}>
                  <Text style={[styles.thText, { textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>COST</Text>
                </View>
                <View style={[styles.thCell, styles.colPaid]}>
                  <Text style={[styles.thText, { textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>PAID</Text>
                </View>
                <View style={[styles.thCell, styles.thCellLast, styles.colBal]}>
                  <Text style={[styles.thText, { textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>BALANCE</Text>
                </View>
              </View>

              {/* Branch Data Rows with Clear Cell Borders */}
              {cat.branches && cat.branches.length > 0 ? (
                cat.branches.map((b, bIdx) => {
                  const bSale = Number(b.sale) || 0;
                  const bCost = Number(b.cost) || 0;
                  const bPaid = Number(b.paid) || 0;
                  const bBal = (b.balance !== undefined && b.balance !== null)
                    ? Number(b.balance)
                    : (bCost - bPaid);
                  const isExpanded = expandedPaymentBranch === `${cIdx}_${bIdx}`;

                  return (
                    <View key={bIdx}>
                      <TouchableOpacity
                        style={[
                          styles.tableDataRow,
                          bIdx % 2 === 1 && { backgroundColor: 'rgba(255, 255, 255, 0.02)' },
                          isExpanded && { backgroundColor: 'rgba(56, 189, 248, 0.08)' }
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          haptic.selection();
                          setExpandedPaymentBranch(prev => prev === `${cIdx}_${bIdx}` ? null : `${cIdx}_${bIdx}`);
                        }}
                      >
                        {/* Branch Name & Rank with Ample Space */}
                        <View style={[styles.tdCell, styles.colBranch]}>
                          <Text style={styles.tdBranchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            <Text style={styles.rankNumText}>#{b.rank || (bIdx + 1)} </Text>
                            {b.branch}
                          </Text>
                        </View>

                        {/* Sale Amount with Generous Width */}
                        <View style={[styles.tdCell, styles.colSale]}>
                          <Text style={styles.tdSaleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {formatCurrency(bSale)}
                          </Text>
                        </View>

                        {/* Cost */}
                        <View style={[styles.tdCell, styles.colCost]}>
                          <Text style={styles.tdCostText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {formatCurrency(bCost)}
                          </Text>
                        </View>

                        {/* Paid */}
                        <View style={[styles.tdCell, styles.colPaid]}>
                          <Text style={styles.tdPaidText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {formatCurrency(bPaid)}
                          </Text>
                        </View>

                        {/* Balance */}
                        <View style={[styles.tdCell, styles.tdCellLast, styles.colBal]}>
                          <Text
                            style={[styles.tdBalText, { color: bBal > 0 ? '#EF4444' : '#10B981' }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                          >
                            {formatCurrency(bBal)}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Expandable Quick Audit Bar */}
                      {isExpanded && (
                        <View style={styles.expandedBranchRow}>
                          <View style={styles.expandedRowTop}>
                            <Text style={styles.expandedBranchTitle}>📍 {b.branch} ({cat.name})</Text>
                            <Text style={styles.expandedRankBadge}>Rank #{b.rank || (bIdx + 1)}</Text>
                          </View>
                          <View style={styles.expandedGrid}>
                            <View style={styles.expandedItem}>
                              <Text style={styles.expandedLabel}>NET SALE</Text>
                              <Text style={styles.expandedValSale}>Rs. {formatCurrency(bSale)}</Text>
                            </View>
                            <View style={styles.expandedDivider} />
                            <View style={styles.expandedItem}>
                              <Text style={styles.expandedLabel}>GROSS COST</Text>
                              <Text style={styles.expandedValCost}>Rs. {formatCurrency(bCost)}</Text>
                            </View>
                            <View style={styles.expandedDivider} />
                            <View style={styles.expandedItem}>
                              <Text style={styles.expandedLabel}>PAID VENDOR</Text>
                              <Text style={styles.expandedValPaid}>Rs. {formatCurrency(bPaid)}</Text>
                            </View>
                            <View style={styles.expandedDivider} />
                            <View style={styles.expandedItem}>
                              <Text style={styles.expandedLabel}>LIABILITY BAL</Text>
                              <Text style={[styles.expandedValBal, { color: bBal > 0 ? '#EF4444' : '#10B981' }]}>
                                Rs. {formatCurrency(bBal)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyTable}>
                  <Text style={styles.emptyText}>No branch records for this category</Text>
                </View>
              )}

              {/* Grand Total Row with matching column grid and cell borders */}
              {(() => {
                const cSale = Number(cat.totalSale) || 0;
                const cCost = Number(cat.totalCost) || 0;
                const cPaid = Number(cat.totalPaid) || 0;
                const cBal = (cat.totalBalance !== undefined && cat.totalBalance !== null)
                  ? Number(cat.totalBalance)
                  : (cCost - cPaid);

                return (
                  <View style={styles.tableGrandTotalRow}>
                    <View style={[styles.tdTotalCell, styles.colBranch]}>
                      <Text style={styles.tdGrandTotalBranchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        Grand Total
                      </Text>
                    </View>
                    <View style={[styles.tdTotalCell, styles.colSale]}>
                      <Text style={styles.tdGrandTotalSaleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatCurrency(cSale)}
                      </Text>
                    </View>
                    <View style={[styles.tdTotalCell, styles.colCost]}>
                      <Text style={styles.tdGrandTotalCostText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatCurrency(cCost)}
                      </Text>
                    </View>
                    <View style={[styles.tdTotalCell, styles.colPaid]}>
                      <Text style={styles.tdGrandTotalPaidText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatCurrency(cPaid)}
                      </Text>
                    </View>
                    <View style={[styles.tdTotalCell, styles.tdTotalCellLast, styles.colBal]}>
                      <Text
                        style={[styles.tdGrandTotalBalText, { color: cBal > 0 ? '#EF4444' : '#10B981' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {formatCurrency(cBal)}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No category records found for this period.</Text>
          </View>
        )}

        {/* SECTION: Executive Category Performance Matrix */}
        <View style={{ marginTop: 26, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.subSectionHeading}>EXECUTIVE CATEGORY PERFORMANCE</Text>
            <Text style={{ color: '#38BDF8', fontSize: 11, fontWeight: '700' }}>
              📍 {selectedBranch || 'All Branches'}
            </Text>
          </View>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: -4, marginBottom: 12 }}>
            Revenue Contribution & Gross Profit Margins
          </Text>
        </View>

        {categories.length > 0 ? (
          <View style={styles.execCategoryList}>
            {(() => {
              const grandSales = categories.reduce((sum, c) => sum + (c.totalSale || 0), 0) || 1;
              const sorted = [...categories].sort((a, b) => (b.totalSale || 0) - (a.totalSale || 0));

              return sorted.map((cat, idx) => {
                const sharePercent = Math.min(100, Math.round(((cat.totalSale || 0) / grandSales) * 100));
                const isTop = idx === 0;
                const marginNum = parseFloat(cat.margin) || 0;
                const marginColor = marginNum >= 20 ? '#10B981' : marginNum >= 12 ? '#38BDF8' : '#F59E0B';

                // Category Icon
                const nameLower = (cat.name || '').toLowerCase();
                let icon = '📁';
                if (nameLower.includes('pharm') || nameLower.includes('med')) icon = '💊';
                else if (nameLower.includes('cosmet') || nameLower.includes('beauty')) icon = '💄';
                else if (nameLower.includes('consum') || nameLower.includes('general')) icon = '🧴';
                else if (nameLower.includes('herb') || nameLower.includes('organic')) icon = '🌿';
                else if (nameLower.includes('baby') || nameLower.includes('food')) icon = '🍼';

                return (
                  <View key={cat.id || idx} style={styles.execCatCard}>
                    {/* Top Header Row with Rank Badge, Icon, Name, and Margin Pill */}
                    <View style={styles.execCatHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.execRankBadge, isTop && styles.execRankBadgeTop]}>
                          <Text style={[styles.execRankText, isTop && styles.execRankTextTop]}>
                            #{idx + 1}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 18, marginRight: 8 }}>{icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.execCatName} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <Text style={styles.execCatShare}>
                            {sharePercent}% of total revenue
                          </Text>
                        </View>
                      </View>

                      {/* Margin Pill */}
                      <View style={[styles.execMarginPill, { borderColor: marginColor, backgroundColor: `${marginColor}18` }]}>
                        <Text style={[styles.execMarginText, { color: marginColor }]}>
                          {cat.margin}% Margin
                        </Text>
                      </View>
                    </View>

                    {/* Progress Bar of Revenue Share */}
                    <View style={styles.execProgressBg}>
                      <View style={[styles.execProgressFill, { width: `${Math.max(6, sharePercent)}%`, backgroundColor: isTop ? '#06B6D4' : '#38BDF8' }]} />
                    </View>

                    {/* 3-Column Financial Metrics Breakdown */}
                    <View style={styles.execMetricsRow}>
                      <View style={styles.execMetricItem}>
                        <Text style={styles.execMetricLabel}>TOTAL SALES</Text>
                        <Text style={styles.execMetricValueSale}>{formatCurrency(cat.totalSale)}</Text>
                      </View>

                      <View style={styles.execMetricDivider} />

                      <View style={styles.execMetricItem}>
                        <Text style={styles.execMetricLabel}>GROSS COST</Text>
                        <Text style={styles.execMetricValueCost}>{formatCurrency(cat.totalCost)}</Text>
                      </View>

                      <View style={styles.execMetricDivider} />

                      <View style={styles.execMetricItem}>
                        <Text style={styles.execMetricLabel}>NET PROFIT</Text>
                        <Text style={styles.execMetricValueProfit}>{formatCurrency(cat.totalProfit)}</Text>
                      </View>
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        ) : null}

        {/* SECTION: Dedicated Branch Selector for Revenue & Profit Trajectory (Moved to Last) */}
        <View style={[styles.chartBranchControlCard, { marginTop: 24 }]}>
          <View style={styles.chartBranchControlHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.chartBranchControlIcon}>📈</Text>
              <Text style={styles.chartBranchControlTitle}>REVENUE &amp; PROFIT TRAJECTORY</Text>
            </View>
            <TouchableOpacity
              style={styles.chartBranchDropdownBtn}
              onPress={() => setChartBranchModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.chartBranchDropdownBtnText} numberOfLines={1}>
                {chartBranch === 'All Branches' ? '🌐 All Branches' : `📍 ${chartBranch}`}
              </Text>
              <Text style={styles.chartBranchDropdownBtnArrow}>▼</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {branches.filter(b => b !== 'Select Branch').map((b, idx) => {
              const isSelected = chartBranch === b;
              return (
                <TouchableOpacity
                  key={`chart-branch-${idx}`}
                  style={[styles.chartBranchPill, isSelected && styles.chartBranchPillActive]}
                  onPress={() => handleChartBranchSelect(b)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chartBranchPillText, isSelected && styles.chartBranchPillTextActive]}>
                    {b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Interactive Revenue Curve with Dedicated Branch Indicator (Moved to Last) */}
        <SalesTrendChart
          data={chartDailyTrend || salesData?.dailyTrend}
          title="Revenue & Profit Trajectory"
          subtitle={`Branch: ${chartBranch || 'All Branches'} • Daily Breakdown`}
          branchName={chartBranch || 'All Branches'}
        />

        {/* Easy Reach Bottom Logout Bar (Elevated for Android Navigation Bar) */}
        <TouchableOpacity
          style={styles.bottomLogoutCard}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.bottomLogoutText}>🚪 Logout / Switch Account</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // -------------------------------------------------------------
  // TAB 2: Combined HR Analytics & Live Attendance Dashboard View
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // TAB 2: HR Command Center & Operations Dashboard View
  // -------------------------------------------------------------
  const renderHRView = () => {
    const hrBranchesList = ['Select Branch', ...branches];
    const isBranchChosen = hrBranch && hrBranch !== 'Select Branch';

    const empList = Array.isArray(branchEmployees) ? branchEmployees : [];
    const totalCount = empList.length;
    const presentCount = empList.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toLowerCase();
      return s.includes('present') || s === 'p' || s.includes('half') || s.includes('short');
    }).length;
    const notMarkedCount = empList.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toLowerCase();
      return s.includes('not marked') || s === '' || s === '-' || s === 'unmarked';
    }).length;
    const absentCount = empList.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toLowerCase();
      return (s.includes('absent') || s === 'a') && !s.includes('not');
    }).length;
    const leaveCount = empList.filter(e => {
      if (!e) return false;
      const s = (e.status || '').toLowerCase();
      return s.includes('leave');
    }).length;

    const hasBranchData = empList.length > 0;
    const totalStaff = hasBranchData ? totalCount : (dashboardData?.summary?.totalActive || 0);
    const presentToday = hasBranchData ? presentCount : (dashboardData?.summary?.present || 0);
    const notMarkedToday = hasBranchData ? notMarkedCount : (dashboardData?.summary?.notMarked ?? Math.max(0, totalStaff - presentToday));
    const absentToday = hasBranchData ? absentCount : (dashboardData?.summary?.absent || 0);
    const onLeave = hasBranchData ? leaveCount : (dashboardData?.summary?.leave || 0);
    const presenceRate = totalStaff > 0 ? Math.round((presentToday / totalStaff) * 100) : 0;

    return (
      <ScrollView
        style={styles.adminScrollView}
        contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
      >
        {/* Branch Selector Header (Always at Top) */}
        <View style={[styles.branchSelectContainer, { marginTop: 10 }]}>
          <View style={styles.branchSelectHeaderRow}>
            <Text style={styles.branchSelectTitle}>Filter Store Branch</Text>
            <TouchableOpacity
              style={styles.dashDropdownBtn}
              onPress={() => setBranchModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dashDropdownBtnText} numberOfLines={1}>
                {hrBranch === 'Select Branch' ? '👇 Select Branch' : hrBranch === 'All Branches' ? '🌐 All Branches' : `📍 ${hrBranch}`}
              </Text>
              <Text style={styles.dashDropdownBtnArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
            {hrBranchesList.map((b, idx) => {
              const isSelected = hrBranch === b;
              return (
                <TouchableOpacity
                  key={`hr-pill-${idx}`}
                  style={[styles.branchPill, isSelected && styles.branchPillActive]}
                  onPress={() => handleHrBranchSelect(b)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.branchPillText, isSelected && styles.branchPillTextActive]}>
                    {b === 'Select Branch' ? '👇 Select Branch' : b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!isBranchChosen ? (
          <View style={styles.selectBranchPromptCard}>
            <View style={styles.selectBranchPromptIconBox}>
              <Text style={{ fontSize: 32 }}>🏢</Text>
            </View>
            <Text style={styles.selectBranchPromptTitle}>Select a Store Branch</Text>
            <Text style={styles.selectBranchPromptSub}>
              Choose a specific store branch above or tap below to view live duty status, workforce KPIs, and attendance records.
            </Text>
            <View style={styles.quickBranchGrid}>
              {branches.filter(b => b !== 'Select Branch').map((b, idx) => (
                <TouchableOpacity
                  key={`quick-hr-${idx}`}
                  style={styles.quickBranchChip}
                  onPress={() => handleHrBranchSelect(b)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickBranchChipText}>{b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {/* Store HR & Workforce KPI Banner */}
            <View style={styles.hrKpiBanner}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.hrBannerSub}>STORE WORKFORCE • {hrBranch.toUpperCase()}</Text>
                <View style={styles.liveBiometricTag}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.liveBiometricTagText}>Live Biometric</Text>
                </View>
              </View>
              <Text style={styles.hrBannerTitle}>Workforce Presence: {presenceRate}%</Text>
              
              <View style={styles.presenceBarTrack}>
                <View style={[styles.presenceBarFill, { width: `${Math.min(100, Math.max(0, presenceRate))}%` }]} />
              </View>

              <Text style={styles.hrBannerDesc}>
                {`${presentToday} of ${totalStaff} employees on duty today in ${hrBranch}.`}
              </Text>
            </View>

            <View style={styles.hrKpiGrid}>
              <View style={[styles.hrKpiCard, { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
                <Text style={[styles.hrKpiNum, { color: '#10B981' }]}>{presentToday}</Text>
                <Text style={styles.hrKpiLabel}>Present Today</Text>
              </View>
              <View style={[styles.hrKpiCard, { borderColor: 'rgba(56, 189, 248, 0.4)', backgroundColor: 'rgba(56, 189, 248, 0.08)' }]}>
                <Text style={[styles.hrKpiNum, { color: '#38BDF8' }]}>{notMarkedToday}</Text>
                <Text style={styles.hrKpiLabel}>Not Marked</Text>
              </View>
              <View style={[styles.hrKpiCard, { borderColor: 'rgba(245, 158, 11, 0.4)', backgroundColor: 'rgba(245, 158, 11, 0.08)' }]}>
                <Text style={[styles.hrKpiNum, { color: '#F59E0B' }]}>{onLeave}</Text>
                <Text style={styles.hrKpiLabel}>Approved Leaves</Text>
              </View>
              <View style={[styles.hrKpiCard, { borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
                <Text style={[styles.hrKpiNum, { color: '#EF4444' }]}>{absentToday}</Text>
                <Text style={styles.hrKpiLabel}>Marked Absent</Text>
              </View>
            </View>

            {/* Branch Quick Staffing Snapshot Card */}
            <View style={{
              backgroundColor: '#131D33',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(56, 189, 248, 0.25)',
              padding: 16,
              marginTop: 14,
              marginBottom: 10,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View>
                  <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '800' }}>
                    🏢 {hrBranch} Staffing Snapshot
                  </Text>
                  <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>
                    {branchLoading ? 'Refreshing status...' : `${totalCount} registered staff members`}
                  </Text>
                </View>
                {branchLoading && <ActivityIndicator size="small" color="#38BDF8" />}
              </View>

              {/* Prominent CTA to Open Full Live Attendance */}
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(2, 132, 199, 0.2)',
                  borderColor: '#0284C7',
                  borderWidth: 1.2,
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
                onPress={() => navigation('BranchEmployees', { branch: hrBranch })}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>🕒</Text>
                  <Text style={{ color: '#38BDF8', fontWeight: '800', fontSize: 13.5 }}>
                    Open Full Live Attendance ({totalCount} Staff)
                  </Text>
                </View>
                <Text style={{ color: '#38BDF8', fontWeight: 'bold', fontSize: 16 }}>→</Text>
              </TouchableOpacity>

              {/* Top 5 Staff Quick Preview */}
              {empList.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Active Staff Preview
                  </Text>
                  {empList.slice(0, 5).map((item, idx) => {
                    const s = (item?.status || '').toLowerCase();
                    const isPresent = s.includes('present') || s === 'p';
                    const isLeave = s.includes('leave');
                    const isAbsent = (s.includes('absent') || s === 'a') && !s.includes('not');
                    const statusColor = isPresent ? '#10B981' : isLeave ? '#F59E0B' : isAbsent ? '#EF4444' : '#94A3B8';
                    const statusLabel = isPresent ? '● Present' : isLeave ? '● Leave' : isAbsent ? '● Absent' : '○ Not Marked';

                    return (
                      <View
                        key={`preview-emp-${item?.id || idx}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#0F172A',
                          borderRadius: 10,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          justifyContent: 'space-between',
                          borderWidth: 1,
                          borderColor: '#1E293B',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#38BDF8', fontWeight: 'bold', fontSize: 12 }}>{(item?.name || 'E').charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#F1F5F9', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{item?.name}</Text>
                            <Text style={{ color: '#64748B', fontSize: 11 }}>{item?.code} • {item?.designation || 'Staff'}</Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusLabel}</Text>
                          <Text style={{ color: '#94A3B8', fontSize: 10.5 }}>{item?.checkIn && item.checkIn !== '-' ? `In: ${item.checkIn}` : '--:--'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Branch Fast Actions */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderColor: '#10B981',
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                  }}
                  onPress={() => navigation('GenerateSalarySlip', { branch: hrBranch })}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>⚡</Text>
                  <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>Pay Slip</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(236, 72, 153, 0.12)',
                    borderColor: '#EC4899',
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                  }}
                  onPress={() => navigation('EmployeeAdvance', { branch: hrBranch })}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>💳</Text>
                  <Text style={{ color: '#F472B6', fontSize: 12, fontWeight: '800' }}>Advances</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(139, 92, 246, 0.12)',
                    borderColor: '#8B5CF6',
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                  }}
                  onPress={() => navigation('EmployeeDirectory', { branch: hrBranch })}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>👥</Text>
                  <Text style={{ color: '#A78BFA', fontSize: 12, fontWeight: '800' }}>Directory</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderColor: '#10B981',
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                  }}
                  onPress={() => navigation('EmployeeRegistration', { branch: hrBranch })}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>📝</Text>
                  <Text style={{ color: '#34D399', fontSize: 12, fontWeight: '800' }}>Reg/Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* SECTION 1: HR & WORKFORCE CORE MODULES */}
        <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
          👥 Staffing &amp; Attendance Operations
        </Text>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmployeeDirectory', { mode: 'profile' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: '#38BDF8' }]}>
            <Text style={styles.hrModuleIcon}>👥</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Staff Directory &amp; Full Profiles</Text>
            <Text style={styles.hrModuleSub}>Search employees by branch, designation, contact numbers &amp; full profile records</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hrModuleCard, { borderColor: 'rgba(16, 185, 129, 0.5)', borderWidth: 1 }]}
          onPress={() => navigation('EmployeeRegistration')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Text style={styles.hrModuleIcon}>📝</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.hrModuleTitle}>Employee Registration &amp; Edit</Text>
              <View style={{ backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>ADMIN</Text>
              </View>
            </View>
            <Text style={styles.hrModuleSub}>Register new staff, edit records, auto-sync salary increment &amp; verify changes</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('BranchEmployees', { branch: isBranchChosen ? hrBranch : undefined })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.15)', borderColor: '#0284C7' }]}>
            <Text style={styles.hrModuleIcon}>🕒</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Live Branch Attendance Monitor</Text>
            <Text style={styles.hrModuleSub}>Real-time biometric punch logs, daily check-in/out times, and duty hours</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('Schedule')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
            <Text style={styles.hrModuleIcon}>⏰</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Shift &amp; Duty Timing Roster</Text>
            <Text style={styles.hrModuleSub}>Assign duty timings, manage employee shift hours &amp; schedule rotations</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('MarkLeave')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#EF4444' }]}>
            <Text style={styles.hrModuleIcon}>🏖️</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Mark Leave / Leave Desk</Text>
            <Text style={styles.hrModuleSub}>Record employee leaves, medical / casual absences, and approvals</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('Holidays')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Text style={styles.hrModuleIcon}>📅</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Store Holidays Calendar</Text>
            <Text style={styles.hrModuleSub}>Manage official gazetted and company store holidays</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('CreateEmployee')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.15)', borderColor: '#6366F1' }]}>
            <Text style={styles.hrModuleIcon}>➕</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Add New Employee</Text>
            <Text style={styles.hrModuleSub}>Onboard new staff, assign branch, designation, salary &amp; duty shift</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('BranchStatus')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderColor: '#0EA5E9' }]}>
            <Text style={styles.hrModuleIcon}>🏢</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Branch Status &amp; Headcount</Text>
            <Text style={styles.hrModuleSub}>View branch opening status, active store workforce count, and overview</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        {/* SECTION 2: PAYROLL & FINANCIAL COMPENSATION */}
        <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 12 }]}>
          💰 Payroll &amp; Compensation Management
        </Text>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('GenerateSalarySlip', { branch: isBranchChosen ? hrBranch : undefined })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Text style={styles.hrModuleIcon}>⚡</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Generate Monthly Salary Slip</Text>
            <Text style={styles.hrModuleSub}>Instant salary slip calculation, overtime, deductions &amp; official PDF print</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmpSalaryReports', { initialTab: 'payroll_list' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.15)', borderColor: '#0284C7' }]}>
            <Text style={styles.hrModuleIcon}>📋</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Salary &amp; Payroll Master Register</Text>
            <Text style={styles.hrModuleSub}>Monthly payroll reports, bank disbursements, cash payments &amp; salary sheets</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmployeeFinancials', { mode: 'payslips' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
            <Text style={styles.hrModuleIcon}>📄</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Salary Pay Slips Archive</Text>
            <Text style={styles.hrModuleSub}>View 12-month salary slips, earnings, deductions &amp; print PDF slips</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hrModuleCard, { borderColor: 'rgba(236, 72, 153, 0.4)', borderWidth: 1 }]}
          onPress={() => navigation('EmployeeAdvance', { branch: isBranchChosen ? hrBranch : undefined })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(236, 72, 153, 0.2)', borderColor: '#EC4899' }]}>
            <Text style={styles.hrModuleIcon}>💸</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.hrModuleTitle}>Employee Advance & Installments</Text>
              <View style={{ backgroundColor: '#EC4899', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>MASTER</Text>
              </View>
            </View>
            <Text style={styles.hrModuleSub}>Give advance, modify, add monthly installment plans & delete (Bilal Shah Auth)</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmployeeFinancials', { mode: 'advance' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#EC4899' }]}>
            <Text style={styles.hrModuleIcon}>💳</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Employee Advance Ledger</Text>
            <Text style={styles.hrModuleSub}>Outstanding advance balances, active monthly deduction plans &amp; logs</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmployeeFinancials', { mode: 'branch_advances', branch: isBranchChosen ? hrBranch : undefined })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }]}>
            <Text style={styles.hrModuleIcon}>🏢</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Branch Advances Register</Text>
            <Text style={styles.hrModuleSub}>Monthly branch-wise advance payouts, collections and overall register print</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('EmployeeDirectory', { mode: 'attendance' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: '#8B5CF6' }]}>
            <Text style={styles.hrModuleIcon}>📊</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>Monthly Attendance Timesheets</Text>
            <Text style={styles.hrModuleSub}>Timesheets, daily check-in/out, worked hours, overtime &amp; short-time logs</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        {/* SECTION 3: WAREHOUSE & INVENTORY OPERATIONS */}
        <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 12 }]}>
          📦 Commercial &amp; Warehouse Operations
        </Text>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('WHSaleEntry')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(6, 182, 212, 0.15)', borderColor: '#06B6D4' }]}>
            <Text style={styles.hrModuleIcon}>🛒</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>WH Sale Entry (Invoice)</Text>
            <Text style={styles.hrModuleSub}>Barcode scan, commercial invoicing, instant PDF print &amp; WhatsApp share</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('WHPurchaseEntry')}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
            <Text style={styles.hrModuleIcon}>📥</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>WH Purchase Entry (Inward)</Text>
            <Text style={styles.hrModuleSub}>Barcode scan, vendor bill receiving, stock influx &amp; print</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hrModuleCard}
          onPress={() => navigation('WHReports', { initialTab: 'customer_ledger' })}
          activeOpacity={0.8}
        >
          <View style={[styles.hrModuleIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.15)', borderColor: '#0284C7' }]}>
            <Text style={styles.hrModuleIcon}>📦</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hrModuleTitle}>WH Reports Center</Text>
            <Text style={styles.hrModuleSub}>Customer Ledger, Balances, Stock Position, Item Ledger, Activity &amp; Audits</Text>
          </View>
          <Text style={styles.hrModuleArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomLogoutCard}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.bottomLogoutText}>🚪 Logout / Switch Account</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // -------------------------------------------------------------
  // TAB 3: Operations Live Monitor View
  // -------------------------------------------------------------
  const renderOperationsView = () => {
    const totalCount = branchEmployees.length;
    const presentCount = branchEmployees.filter(e => {
      const s = (e.status || '').toLowerCase();
      return s.includes('present') || s === 'p' || s.includes('half') || s.includes('short');
    }).length;
    const notMarkedCount = branchEmployees.filter(e => {
      const s = (e.status || '').toLowerCase();
      return s.includes('not marked') || s === '' || s === '-' || s === 'unmarked';
    }).length;
    const absentCount = branchEmployees.filter(e => {
      const s = (e.status || '').toLowerCase();
      return (s.includes('absent') || s === 'a') && !s.includes('not');
    }).length;
    const leaveCount = branchEmployees.filter(e => {
      const s = (e.status || '').toLowerCase();
      return s.includes('leave');
    }).length;

    const filteredEmployees = branchEmployees.filter(emp => {
      const s = (emp.status || '').toLowerCase();
      const isPresent = s.includes('present') || s === 'p' || s.includes('half') || s.includes('short');
      const isNotMarked = s.includes('not marked') || s === '' || s === '-' || s === 'unmarked';
      const isAbsent = (s.includes('absent') || s === 'a') && !s.includes('not');
      const isLeave = s.includes('leave');

      if (attendanceFilter === 'present' && !isPresent) return false;
      if (attendanceFilter === 'not_marked' && !isNotMarked) return false;
      if (attendanceFilter === 'absent' && !isAbsent) return false;
      if (attendanceFilter === 'leave' && !isLeave) return false;

      const q = dashboardSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.code || '').toLowerCase().includes(q) ||
        (emp.designation || '').toLowerCase().includes(q)
      );
    });
    return (
      <ScrollView
        style={styles.adminScrollView}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
      >
        {/* Branch Selector Header */}
        <View style={styles.branchSelectContainer}>
          <View style={styles.branchSelectHeaderRow}>
            <Text style={styles.branchSelectTitle}>Select Store Branch</Text>
            <TouchableOpacity
              style={styles.dashDropdownBtn}
              onPress={() => setBranchModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dashDropdownBtnText} numberOfLines={1}>
                {selectedBranch === 'All Branches' ? '🌐 All Branches' : `📍 ${selectedBranch}`}
              </Text>
              <Text style={styles.dashDropdownBtnArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
            {branches.map((b, idx) => {
              const isSelected = selectedBranch === b;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.branchPill, isSelected && styles.branchPillActive]}
                  onPress={() => handleBranchSelect(b)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.branchPillText, isSelected && styles.branchPillTextActive]}>
                    {b === 'All Branches' ? '🌍 All Branches' : `📍 ${b}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!selectedBranch ? (
          <View style={styles.selectBranchPromptCard}>
            <View style={styles.selectBranchPromptIconBox}>
              <Text style={{ fontSize: 32 }}>🏢</Text>
            </View>
            <Text style={styles.selectBranchPromptTitle}>Select a Store Branch</Text>
            <Text style={styles.selectBranchPromptSub}>
              Please select a branch from the list above or the dropdown to view live operational status and employee logs.
            </Text>
            <View style={styles.quickBranchGrid}>
              {branches.filter(b => b !== 'All Branches' && b !== 'Select Branch').map((b, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickBranchChip}
                  onPress={() => handleBranchSelect(b)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickBranchChipText}>📍 {b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {/* Dynamic Branch Summary Cards & Interactive Filters */}
            <View style={styles.summaryRow}>
              <TouchableOpacity 
                style={[styles.summaryCard, attendanceFilter === 'all' && styles.summaryCardActiveAll]}
                onPress={() => setAttendanceFilter('all')}
                activeOpacity={0.7}
              >
                <Text style={styles.summaryNum}>{totalCount}</Text>
                <Text style={[styles.summaryLabel, attendanceFilter === 'all' && styles.textActiveLabel]}>Total Staff</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, styles.bgGreen, attendanceFilter === 'present' && styles.summaryCardActiveGreen]}
                onPress={() => setAttendanceFilter('present')}
                activeOpacity={0.7}
              >
                <Text style={[styles.summaryNum, styles.textGreen]}>{presentCount}</Text>
                <Text style={[styles.summaryLabel, attendanceFilter === 'present' && styles.textActiveLabel]}>Present</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, styles.bgBlue, attendanceFilter === 'not_marked' && styles.summaryCardActiveBlue]}
                onPress={() => setAttendanceFilter('not_marked')}
                activeOpacity={0.7}
              >
                <Text style={[styles.summaryNum, styles.textBlue]}>{notMarkedCount}</Text>
                <Text style={[styles.summaryLabel, attendanceFilter === 'not_marked' && styles.textActiveLabel]}>Not Marked</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, styles.bgRed, attendanceFilter === 'absent' && styles.summaryCardActiveRed]}
                onPress={() => setAttendanceFilter('absent')}
                activeOpacity={0.7}
              >
                <Text style={[styles.summaryNum, styles.textRed]}>{absentCount}</Text>
                <Text style={[styles.summaryLabel, attendanceFilter === 'absent' && styles.textActiveLabel]}>Absent</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.summaryCard, styles.bgYellow, attendanceFilter === 'leave' && styles.summaryCardActiveYellow]}
                onPress={() => setAttendanceFilter('leave')}
                activeOpacity={0.7}
              >
                <Text style={[styles.summaryNum, styles.textYellow]}>{leaveCount}</Text>
                <Text style={[styles.summaryLabel, attendanceFilter === 'leave' && styles.textActiveLabel]}>Leave</Text>
              </TouchableOpacity>
            </View>

            {/* Search Field */}
            <View style={styles.dashSearchContainer}>
              <TextInput
                style={styles.dashSearchInput}
                placeholder="Search by employee name (e.g. Bilal), code..."
                placeholderTextColor="#64748B"
                value={dashboardSearch}
                onChangeText={setDashboardSearch}
              />
            </View>

            {/* Employee Cards List */}
            {branchLoading ? (
              <View style={styles.promptCard}>
                <ActivityIndicator size="large" color="#0284C7" />
                <Text style={[styles.promptSubtitle, { marginTop: 12 }]}>Fetching branch records...</Text>
              </View>
            ) : filteredEmployees.length > 0 ? (
              filteredEmployees.map((item, idx) => {
                const s = (item.status || '').toLowerCase();
                const isPresent = s.includes('present') || s === 'p';
                const isHalf = s.includes('half') || s.includes('short');
                const isLeave = s.includes('leave');
                const isAbsent = (s.includes('absent') || s === 'a') && !s.includes('not');
                const isNotMarked = s.includes('not marked') || s === '' || s === '-' || s === 'unmarked';

                let badgeStyle = styles.badgeNotMarked;
                let badgeTextStyle = styles.textNotMarked;
                let displayLabel = '○ Not Marked';

                if (isPresent) {
                  badgeStyle = styles.badgePresent;
                  badgeTextStyle = styles.textPresent;
                  displayLabel = '● Present';
                } else if (isHalf) {
                  badgeStyle = styles.badgeHalf;
                  badgeTextStyle = styles.textHalf;
                  displayLabel = '● Half Day';
                } else if (isLeave) {
                  badgeStyle = styles.badgeLeave;
                  badgeTextStyle = styles.textLeave;
                  displayLabel = '● On Leave';
                } else if (isAbsent) {
                  badgeStyle = styles.badgeAbsent;
                  badgeTextStyle = styles.textAbsent;
                  displayLabel = '● Absent';
                }

                return (
                  <TouchableOpacity
                    key={item.id || idx}
                    style={styles.dashEmpCard}
                    onPress={() => navigation('EmployeeReportDetail', {
                      employeeId: item.id,
                      employeeName: item.name,
                      employeeCode: item.code,
                      branch: item.branch || selectedBranch,
                      fromScreen: 'Dashboard'
                    })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dashEmpHeader}>
                      <View style={styles.dashEmpAvatar}>
                        <Text style={styles.dashEmpAvatarText}>{(item.name || 'E').charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.dashEmpName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.dashEmpCode}>{item.code} • {item.designation || 'Staff'}</Text>
                        {selectedBranch === 'All Branches' && item.branch && (
                          <Text style={styles.branchSubBadge}>📍 {item.branch}</Text>
                        )}
                      </View>
                      <View style={[styles.statusBadge, badgeStyle]}>
                        <Text style={[styles.statusBadgeText, badgeTextStyle]}>{displayLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.dashDivider} />

                    <View style={styles.dashTimeRow}>
                      <View style={styles.dashTimeBox}>
                        <Text style={styles.dashTimeLabel}>CHECK IN</Text>
                        <Text style={[styles.dashTimeVal, isPresent && item.checkIn && item.checkIn !== '-' ? styles.timeValGreen : {}]}>
                          {item.checkIn || '-'}
                        </Text>
                      </View>
                      <View style={styles.dashTimeBox}>
                        <Text style={styles.dashTimeLabel}>CHECK OUT</Text>
                        <Text style={styles.dashTimeVal}>{item.checkOut || '-'}</Text>
                      </View>
                      <View style={styles.dashTimeBox}>
                        <Text style={styles.dashTimeLabel}>WORKED</Text>
                        <Text style={[styles.dashTimeVal, isPresent && item.workedHrs && item.workedHrs !== '-' ? styles.timeValBlue : {}]}>
                          {item.workedHrs ? `${item.workedHrs} hrs` : '-'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyEmployeesCard}>
                <Text style={styles.emptyEmployeesIcon}>📋</Text>
                <Text style={styles.emptyEmployeesText}>
                  {dashboardSearch ? 'No employees match your search.' : `No employees found matching '${attendanceFilter.replace('_', ' ')}' filter.`}
                </Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.bottomLogoutCard}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.bottomLogoutText}>🚪 Logout / Switch Account</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // -------------------------------------------------------------
  // Branch Selector Dropdown Modal
  // -------------------------------------------------------------
  const renderBranchModal = () => {
    const isHr = adminTab === 'hr';
    const currentSelected = isHr ? hrBranch : selectedBranch;
    const modalBranches = isHr ? ['Select Branch', ...branches] : branches;

    return (
      <Modal
        visible={branchModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBranchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isHr ? 'Choose HR Branch' : 'Choose Store Branch'}</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={modalBranches}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => {
                const isSelected = currentSelected === item;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.selectedModalItem]}
                    onPress={() => {
                      if (isHr) {
                        handleHrBranchSelect(item);
                      } else {
                        handleBranchSelect(item);
                      }
                      setBranchModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.selectedModalItemText]}>
                      {item === 'Select Branch' ? '👇 Select Branch' : item === 'All Branches' ? '🌐 All Branches' : `📍 ${item}`}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    );
  };

  // -------------------------------------------------------------
  // Dedicated Trajectory Chart Branch Dropdown Modal
  // -------------------------------------------------------------
  const renderChartBranchModal = () => {
    return (
      <Modal
        visible={chartBranchModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setChartBranchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Trajectory Store Branch</Text>
              <TouchableOpacity onPress={() => setChartBranchModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={branches.filter(b => b !== 'Select Branch')}
              keyExtractor={(item, idx) => `chart-branch-modal-${idx}`}
              renderItem={({ item }) => {
                const isSelected = chartBranch === item;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.selectedModalItem]}
                    onPress={() => handleChartBranchSelect(item)}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.selectedModalItemText]}>
                      {item === 'All Branches' ? '🌐 All Branches' : `📍 ${item}`}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    );
  };

  // -------------------------------------------------------------
  // Sidebar Drawer Component
  // -------------------------------------------------------------
  const renderSidebarDrawer = () => {
    return (
      <Modal
        visible={sidebarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSidebarVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={() => setSidebarVisible(false)}
          />

          <View style={styles.drawerContent}>
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarText}>{(user?.name || 'A').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.drawerUserName} numberOfLines={1}>{user?.name || 'Administrator'}</Text>
                <Text style={styles.drawerUserRole}>{(user?.role || 'Admin').toUpperCase()} • BAS SYSTEM</Text>
              </View>
              <TouchableOpacity onPress={() => setSidebarVisible(false)} style={styles.drawerCloseBtn}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.drawerNavScroll} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* SECTION: MAIN DASHBOARDS */}
              <Text style={styles.drawerSectionTitle}>MAIN DASHBOARDS</Text>

              <TouchableOpacity
                style={[styles.drawerNavItem, adminTab === 'sales' && styles.drawerNavItemActive]}
                onPress={() => {
                  setAdminTab('sales');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📈</Text>
                <Text style={[styles.drawerNavText, adminTab === 'sales' && styles.drawerNavTextActive]}>
                  Executive Sales Board
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, adminTab === 'hr' && styles.drawerNavItemActive]}
                onPress={() => {
                  setAdminTab('hr');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>👥</Text>
                <Text style={[styles.drawerNavText, adminTab === 'hr' && styles.drawerNavTextActive]}>
                  HR Operations &amp; Modules
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, { backgroundColor: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)', borderWidth: 1 }]}
                onPress={() => {
                  navigation('BranchNightClosing');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🌙</Text>
                <Text style={[styles.drawerNavText, { color: '#818CF8', fontWeight: '700' }]}>
                  Branch Night Closing (SMS)
                </Text>
              </TouchableOpacity>

              {/* SECTION: WAREHOUSE OPERATIONS & REPORTS */}
              <Text style={styles.drawerSectionTitle}>WAREHOUSE OPERATIONS</Text>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHSaleEntry');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🛒</Text>
                <Text style={[styles.drawerNavText, { color: '#06B6D4', fontWeight: 'bold' }]}>WH Sale Entry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHPurchaseEntry');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📥</Text>
                <Text style={[styles.drawerNavText, { color: '#10B981', fontWeight: 'bold' }]}>WH Purchase Entry</Text>
              </TouchableOpacity>

              <Text style={[styles.drawerSectionTitle, { marginTop: 12 }]}>WAREHOUSE REPORTS</Text>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'customer_ledger' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📑</Text>
                <Text style={styles.drawerNavText}>WH Customer Ledger</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'customer_balances' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>💳</Text>
                <Text style={styles.drawerNavText}>WH Customer Balances</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'stock_position' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📦</Text>
                <Text style={styles.drawerNavText}>WH Stock Position</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'item_ledger' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🔄</Text>
                <Text style={styles.drawerNavText}>WH Item Ledger</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'stock_activity' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📊</Text>
                <Text style={styles.drawerNavText}>WH Stock Activity</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('WHReports', { initialTab: 'stock_audit' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📋</Text>
                <Text style={styles.drawerNavText}>WH Stock Audit Report</Text>
              </TouchableOpacity>

              {/* SECTION: EMPLOYEE & SALARY REPORTS */}
              <View style={styles.drawerSectionHeaderRow}>
                <Text style={styles.drawerSectionTitle}>EMPLOYEE &amp; SALARY REPORTS</Text>
                <View style={styles.drawerSectionBadge}>
                  <Text style={styles.drawerSectionBadgeText}>16 REPORTS</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_ledger' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📑</Text>
                <Text style={styles.drawerNavText}>Employee Ledger</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_balances' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>💳</Text>
                <Text style={styles.drawerNavText}>Employee Balances</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'advance_pay_rec' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>💵</Text>
                <Text style={styles.drawerNavText}>Employee Advance (Pay/Rec)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'salary_detail' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📊</Text>
                <Text style={styles.drawerNavText}>Employee Salary Detail</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'bank_paid' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🏦</Text>
                <Text style={styles.drawerNavText}>Bank Paid Salary Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'cash_paid' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>💰</Text>
                <Text style={styles.drawerNavText}>Cash Paid Salary Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'payroll_status' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🔒</Text>
                <Text style={styles.drawerNavText}>Emp Payroll Status</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)', borderWidth: 1 }]}
                onPress={() => {
                  navigation('GenerateSalarySlip');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>⚡</Text>
                <Text style={[styles.drawerNavText, { color: '#10B981', fontWeight: '700' }]}>Generate Salary Slip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'payroll_list' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📋</Text>
                <Text style={styles.drawerNavText}>Employee PayRoll List</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'payroll_summary' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🏢</Text>
                <Text style={styles.drawerNavText}>Employee PayRoll Summary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_increment' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📈</Text>
                <Text style={styles.drawerNavText}>Employee Increment Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'overtime_shorttime' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>⏰</Text>
                <Text style={styles.drawerNavText}>OverTime &amp; Short Time</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'advance_activity' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🔄</Text>
                <Text style={styles.drawerNavText}>Employee Advance Activity</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, { backgroundColor: 'rgba(236, 72, 153, 0.12)', borderColor: 'rgba(236, 72, 153, 0.35)', borderWidth: 1 }]}
                onPress={() => {
                  navigation('EmployeeAdvance');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>💳</Text>
                <Text style={[styles.drawerNavText, { color: '#F472B6', fontWeight: '700' }]}>Employee Advance & Plans</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_attendance' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📅</Text>
                <Text style={styles.drawerNavText}>Emp. Attendance Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_schedule' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🗓️</Text>
                <Text style={styles.drawerNavText}>Employee Schedule Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'emp_info' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>👥</Text>
                <Text style={styles.drawerNavText}>Employees Info Master</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmpSalaryReports', { initialTab: 'wht_ded' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🧾</Text>
                <Text style={styles.drawerNavText}>WHT Ded Detail</Text>
              </TouchableOpacity>

              {/* SECTION: STAFF & TIME MANAGEMENT */}
              <Text style={styles.drawerSectionTitle}>STAFF &amp; TIME MANAGEMENT</Text>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmployeeDirectory', { mode: 'profile' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>👥</Text>
                <Text style={styles.drawerNavText}>Staff Directory &amp; Profiles</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('EmployeeDirectory', { mode: 'attendance' });
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📊</Text>
                <Text style={styles.drawerNavText}>Monthly Attendance Sheets</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('BranchStatus');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>🖥️</Text>
                <Text style={styles.drawerNavText}>Biometric Devices Status</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('Schedule');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>⏰</Text>
                <Text style={styles.drawerNavText}>Duty Shifts &amp; Schedules</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerNavItem}
                onPress={() => {
                  navigation('Holidays');
                  setSidebarVisible(false);
                }}
              >
                <Text style={styles.drawerNavIcon}>📅</Text>
                <Text style={styles.drawerNavText}>Holidays Calendar</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Drawer Logout Footer */}
            <View style={styles.drawerFooter}>
              <TouchableOpacity
                style={styles.drawerLogoutBtn}
                onPress={() => {
                  setSidebarVisible(false);
                  onLogout();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.drawerLogoutBtnText}>🚪 Logout Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="light-content" />

      {/* Top Header matching reference design */}
      <View style={styles.header}>
        {user?.role !== 'employee' && (
          <TouchableOpacity
            style={styles.menuHamburgerBtn}
            onPress={() => {
              haptic.light();
              setSidebarVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="menu-outline" size={16} color="#38BDF8" style={{ marginRight: 4 }} />
            <Text style={styles.menuHamburgerText}>MENU</Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1, marginHorizontal: 8, justifyContent: 'center' }}>
          {/* Top Line: User Name & Role Pill */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.welcomeText} numberOfLines={1}>
              {user?.name || 'Bilal Shah'}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{(user?.role || 'ADMIN').toUpperCase()}</Text>
            </View>
          </View>

          {/* Sub Line: Branch Selector & Live Synced Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}
              onPress={() => setBranchModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.branchText} numberOfLines={1}>
                {selectedBranch || 'All Branches'}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#38BDF8" style={{ marginLeft: 3 }} />
            </TouchableOpacity>

            <View style={styles.liveSyncBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.liveSyncText}>Live Synced</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => {
            haptic.warning();
            onLogout();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={15} color="#F87171" style={{ marginRight: 4 }} />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Offline and Cached Network Indicator */}
      <OfflineBanner
        isOffline={Boolean(dashboardData?._isOffline || salesData?._isOffline)}
        isCached={Boolean(dashboardData?._cachedAt || salesData?._cachedAt)}
        lastUpdated={
          dashboardData?._cachedAt
            ? new Date(dashboardData._cachedAt).toLocaleTimeString()
            : salesData?._cachedAt
            ? new Date(salesData._cachedAt).toLocaleTimeString()
            : undefined
        }
        onRefresh={onRefresh}
      />

      {/* Top Segmented Switcher: Executive Sales Board vs HR & Attendance */}
      {user?.role !== 'employee' && (
        <View style={styles.topTabBar}>
          <TouchableOpacity
            style={[styles.topTabBtn, adminTab === 'sales' && styles.topTabBtnActive]}
            onPress={() => {
              haptic.selection();
              setAdminTab('sales');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="bar-chart"
              size={15}
              color={adminTab === 'sales' ? '#FFFFFF' : '#7E9BBE'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.topTabBtnText, adminTab === 'sales' && styles.topTabBtnTextActive]}>
              Executive Sales Board
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topTabBtn, adminTab === 'hr' && styles.topTabBtnActive]}
            onPress={() => {
              haptic.selection();
              setAdminTab('hr');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={15}
              color={adminTab === 'hr' ? '#FFFFFF' : '#7E9BBE'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.topTabBtnText, adminTab === 'hr' && styles.topTabBtnTextActive]}>
              HR & Attendance
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Render selected view */}
      {user?.role === 'employee'
        ? renderEmployeeView()
        : adminTab === 'sales'
          ? renderSalesDashboardView()
          : renderHRView()}

      {/* Render Sidebar Drawer Modal */}
      {renderSidebarDrawer()}

      {/* Render Branch Selector Dropdown Modal */}
      {renderBranchModal()}

      {/* Render Dedicated Trajectory Chart Branch Modal */}
      {renderChartBranchModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: '#070D1E',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#070D1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSubtext: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 38) : 12,
    paddingBottom: 10,
    backgroundColor: '#070D1E',
    borderBottomWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.12)',
  },
  menuHamburgerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 22, 44, 0.85)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#38BDF8',
  },
  menuHamburgerText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'nowrap',
  },
  branchText: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '600',
    maxWidth: 130,
  },
  roleBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 6,
  },
  roleBadgeText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: 'bold',
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginLeft: 6,
  },
  livePulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  liveSyncText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  logoutBtnText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: 'bold',
  },
  topTabBar: {
    flexDirection: 'row',
    backgroundColor: '#0B1528',
    padding: 4,
    borderRadius: 14,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  topTabBtnActive: {
    backgroundColor: '#0284C7',
  },
  topTabBtnText: {
    color: '#7E9BBE',
    fontSize: 12,
    fontWeight: '700',
  },
  topTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  adminScrollView: {
    flex: 1,
  },
  bottomLogoutCard: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  bottomLogoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Executive Sales Board Styles
  execBanner: {
    backgroundColor: '#0B1832',
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(56, 189, 248, 0.22)',
  },
  execWalletBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0B2245',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  execBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  execBannerTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  execBannerDate: {
    fontSize: 13,
    color: '#38BDF8',
    fontWeight: '700',
  },
  execBannerSub: {
    fontSize: 11,
    color: '#7E9BBE',
    marginTop: 2,
  },
  refreshIconBtn: {
    backgroundColor: '#0B2245',
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  periodPillRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 6,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#0E1B33',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
  },
  periodPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  periodPillText: {
    fontSize: 11,
    color: '#7E9BBE',
    fontWeight: '700',
  },
  periodPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  customDateContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 10,
    marginTop: 10,
  },
  customDateInputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customDateCol: {
    flex: 1,
  },
  customDateLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  customDateInput: {
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  customDateApplyBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customDateApplyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  customPresetsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
    justifyContent: 'space-between',
  },
  presetChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
  },
  salesBranchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1B33',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
  },
  salesBranchPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderColor: '#38BDF8',
  },
  salesBranchPillText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  salesBranchPillTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },

  // Night Closing & SMS Hub Banner Styles
  nightClosingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0A1A36',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderWidth: 1.2,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  nightClosingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0B2245',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  nightClosingTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  nightClosingSub: {
    color: '#7E9BBE',
    fontSize: 10.5,
    marginTop: 1,
  },
  nightClosingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  nightClosingBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },

  // 4-Quadrant KPI Cards Grid (2x2 Gradient Layout)
  webKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  webKpiCard: {
    width: '48.5%',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 104,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  webKpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  webKpiIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  webKpiLabel: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    flex: 1,
  },
  webKpiValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  webKpiBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webKpiTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webKpiTrendText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D1FAE5',
  },

  // Category Section Theme Banner
  sectionThemeBanner: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  sectionThemeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionThemeSub: {
    fontSize: 11,
    color: '#E0F2FE',
    marginTop: 2,
  },
  subSectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  subSectionHeadingText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  subSectionDateText: {
    color: '#7E9BBE',
    fontSize: 11,
    fontWeight: 'normal',
  },
  subSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  execCategoryList: {
    gap: 12,
  },
  execCatCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  execCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  execRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  execRankBadgeTop: {
    backgroundColor: 'rgba(6, 182, 212, 0.22)',
    borderWidth: 1,
    borderColor: '#06B6D4',
  },
  execRankText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  execRankTextTop: {
    color: '#38BDF8',
    fontWeight: '900',
  },
  execCatName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  execCatShare: {
    color: '#64748B',
    fontSize: 10.5,
    marginTop: 1,
  },
  execMarginPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  execMarginText: {
    fontSize: 11,
    fontWeight: '800',
  },
  execProgressBg: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  execProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  execMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E172A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  execMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  execMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  execMetricLabel: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  execMetricValueSale: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '800',
  },
  execMetricValueCost: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '700',
  },
  execMetricValueProfit: {
    color: '#10B981',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Tabbed Branch Rankings Table
  catTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1B33',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
  },
  catTabPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  catTabPillText: {
    color: '#7E9BBE',
    fontSize: 12,
    fontWeight: 'bold',
  },
  catTabPillTextActive: {
    color: '#FFFFFF',
  },
  // Payment Detail Report Table - Full Width Bordered Grid Styles
  tableCard: {
    backgroundColor: '#0A1326',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  tableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0369A1',
  },
  tableCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tableCardHeaderBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  tableCardHeaderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#070E1E',
    borderBottomWidth: 1.5,
    borderBottomColor: '#1E293B',
  },
  thCell: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  thCellLast: {
    borderRightWidth: 0,
  },
  thText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0A1326',
  },
  tdCell: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  tdCellLast: {
    borderRightWidth: 0,
  },
  colBranch: {
    flex: 1.6,
  },
  colSale: {
    flex: 1.2,
  },
  colCost: {
    flex: 0.95,
  },
  colPaid: {
    flex: 0.95,
  },
  colBal: {
    flex: 1.0,
  },
  tdBranchText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  rankNumText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
  },
  tdSaleText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  tdCostText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'right',
  },
  tdPaidText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  tdBalText: {
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'right',
  },

  // Grand Total Row in Tables
  tableGrandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#040914',
    borderTopWidth: 2,
    borderTopColor: '#38BDF8',
  },
  tdTotalCell: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  tdTotalCellLast: {
    borderRightWidth: 0,
  },
  tdGrandTotalBranchText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  tdGrandTotalSaleText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  tdGrandTotalCostText: {
    color: '#CBD5E1',
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  tdGrandTotalPaidText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'right',
  },
  tdGrandTotalBalText: {
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'right',
  },

  // Expandable Branch Details Drawer
  expandedBranchRow: {
    backgroundColor: '#07152E',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    borderLeftWidth: 3,
    borderLeftColor: '#38BDF8',
  },
  expandedRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandedBranchTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  expandedRankBadge: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '700',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expandedGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#040A17',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  expandedItem: {
    flex: 1,
    alignItems: 'center',
  },
  expandedDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#1E293B',
  },
  expandedLabel: {
    color: '#64748B',
    fontSize: 8.5,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  expandedValSale: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '800',
  },
  expandedValCost: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  expandedValPaid: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '800',
  },
  expandedValBal: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  tableMarginBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tableMarginText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyTable: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },

  // Sidebar Drawer Styles
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  drawerContent: {
    width: '82%',
    backgroundColor: '#0F172A',
    height: '100%',
    borderRightWidth: 1,
    borderColor: '#1E293B',
    display: 'flex',
    flexDirection: 'column',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48,
    paddingBottom: 16,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  drawerUserName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  drawerUserRole: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 8,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  drawerNavScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  drawerSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  drawerSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  drawerSectionBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  drawerSectionBadgeText: {
    color: '#38BDF8',
    fontSize: 8.5,
    fontWeight: '800',
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 3,
  },
  drawerNavItemActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
  },
  drawerNavIcon: {
    fontSize: 17,
    width: 28,
  },
  drawerNavText: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  drawerNavTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  drawerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#131D33',
  },
  drawerLogoutBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  drawerLogoutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // HR & Operations General Styles
  employeeContainer: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotGreen: { backgroundColor: '#10B981' },
  dotRed: { backgroundColor: '#EF4444' },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 10,
  },
  metricBox: { flex: 1 },
  metricLabel: { fontSize: 10, color: '#64748B', fontWeight: 'bold' },
  metricVal: { fontSize: 13, fontWeight: 'bold', color: '#F8FAFC', marginTop: 2 },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  quickActionBtn: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 14,
    width: '48%',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  quickActionIcon: { fontSize: 24, marginBottom: 8 },
  quickActionTitle: { fontSize: 13, fontWeight: 'bold', color: '#F8FAFC' },
  quickActionDesc: { fontSize: 10, color: '#64748B', marginTop: 2 },

  branchSelectContainer: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  branchSelectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  branchSelectTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: 'bold',
  },
  branchBadgeActiveLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  branchScroll: {
    paddingVertical: 2,
  },
  branchPill: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  branchPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  branchPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 4,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#131D33',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  summaryCardActiveAll: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  summaryCardActiveGreen: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  summaryCardActiveBlue: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  summaryCardActiveRed: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  summaryCardActiveYellow: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  summaryNum: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  summaryLabel: { fontSize: 8.5, color: '#64748B', fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  textActiveLabel: { color: '#F8FAFC', fontWeight: '800' },
  bgGreen: { borderColor: 'rgba(16, 185, 129, 0.4)' },
  textGreen: { color: '#10B981' },
  bgBlue: { borderColor: 'rgba(56, 189, 248, 0.4)' },
  textBlue: { color: '#38BDF8' },
  bgRed: { borderColor: 'rgba(239, 68, 68, 0.4)' },
  textRed: { color: '#EF4444' },
  bgYellow: { borderColor: 'rgba(245, 158, 11, 0.4)' },
  textYellow: { color: '#F59E0B' },

  dashSearchContainer: {
    backgroundColor: '#131D33',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  dashSearchInput: {
    color: '#F8FAFC',
    fontSize: 13,
  },
  dashEmpCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  dashEmpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dashEmpAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#0284C7',
  },
  dashEmpAvatarText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 15,
  },
  dashEmpName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  dashEmpCode: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  branchSubBadge: {
    fontSize: 9.5,
    color: '#0284C7',
    fontWeight: 'bold',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePresent: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  badgeNotMarked: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: '#64748B',
  },
  badgeAbsent: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  badgeLeave: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  badgeHalf: {
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: '#F97316',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  textPresent: {
    color: '#10B981',
  },
  textNotMarked: {
    color: '#94A3B8',
  },
  textAbsent: {
    color: '#EF4444',
  },
  textLeave: {
    color: '#F59E0B',
  },
  textHalf: {
    color: '#FB923C',
  },
  timeValGreen: {
    color: '#10B981',
    fontWeight: 'bold',
  },
  timeValBlue: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  dashCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  dashCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dashBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dashBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  dashDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 8,
  },
  dashTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dashTimeBox: { flex: 1 },
  dashTimeLabel: { fontSize: 9, color: '#64748B', fontWeight: 'bold' },
  dashTimeVal: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  emptyEmployeesCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyEmployeesIcon: { fontSize: 32, marginBottom: 8 },
  emptyEmployeesText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  promptCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    marginTop: 10,
  },
  promptSubtitle: { color: '#94A3B8', fontSize: 13 },
  errorText: {
    color: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 12,
  },

  // Branch Prompt Card
  selectBranchPromptCard: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  selectBranchPromptIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  selectBranchPromptTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  selectBranchPromptSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  quickBranchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  quickBranchChip: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  quickBranchChipText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },

  // HR Specific
  hrKpiBanner: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  hrBannerSub: { fontSize: 10, fontWeight: 'bold', color: '#38BDF8', letterSpacing: 0.5 },
  hrBannerTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginTop: 4 },
  hrBannerDesc: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  liveBiometricTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveBiometricTagText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  presenceBarTrack: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    marginVertical: 8,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#334155',
  },
  presenceBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  dashQuickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  dashQuickActionPill: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dashQuickActionText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
  },
  hrKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  hrKpiCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    width: '48%',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  hrKpiNum: { fontSize: 20, fontWeight: '800' },
  hrKpiLabel: { fontSize: 10, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#F8FAFC' },
  hrModuleCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  hrModuleIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  hrModuleIcon: { fontSize: 20 },
  hrModuleTitle: { fontSize: 14, fontWeight: 'bold', color: '#F8FAFC' },
  hrModuleSub: { fontSize: 10, color: '#94A3B8', marginTop: 2, lineHeight: 14 },
  hrModuleArrow: { fontSize: 18, color: '#38BDF8', fontWeight: 'bold', marginLeft: 8 },
  bottomLogoutCard: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: Platform.OS === 'android' ? 36 : 20,
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  bottomLogoutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dashDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    maxWidth: '65%',
  },
  dashDropdownBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  dashDropdownBtnArrow: {
    color: '#94A3B8',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  modalCloseText: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#0B1120',
  },
  selectedModalItem: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  modalItemText: {
    fontSize: 14,
    color: '#F1F5F9',
  },
  selectedModalItemText: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  modalCheck: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  chartBranchControlCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  chartBranchControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartBranchControlIcon: {
    fontSize: 14,
  },
  chartBranchControlTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.6,
  },
  chartBranchDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 180,
  },
  chartBranchDropdownBtnText: {
    color: '#F8FAFC',
    fontSize: 11.5,
    fontWeight: '700',
    marginRight: 6,
  },
  chartBranchDropdownBtnArrow: {
    color: '#38BDF8',
    fontSize: 9,
  },
  chartBranchPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 6,
  },
  chartBranchPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
  },
  chartBranchPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  chartBranchPillTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
});
