import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar,
  Image,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator
} from 'react-native';
import api from '../services/api';

const AUDIT_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function EmployeeProfileDetailScreen({ route, navigation }) {
  const { employee } = route.params;

  const now = new Date();
  const [dutyAuditModalVisible, setDutyAuditModalVisible] = useState(false);
  const [auditMonth, setAuditMonth] = useState(now.getMonth() + 1);
  const [auditYear, setAuditYear] = useState(now.getFullYear());
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSummary, setAuditSummary] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState('all'); // 'all', 'late', 'plus', 'minus'

  useEffect(() => {
    if (dutyAuditModalVisible) {
      fetchDutyAudit(auditMonth, auditYear);
    }
  }, [dutyAuditModalVisible, auditMonth, auditYear]);

  const fetchDutyAudit = async (m, y) => {
    setAuditLoading(true);
    try {
      const empId = employee._id || employee.id;
      const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await api.get(`/mobile/admin/employee-report?employeeId=${empId}&startDate=${startStr}&endDate=${endStr}`);
      if (res && res.success) {
        setAuditSummary(res.summary);
        setAuditLogs(res.logs || []);
      }
    } catch (e) {
      console.error('Duty audit fetch error:', e);
    } finally {
      setAuditLoading(false);
    }
  };

  const prevAuditMonth = () => {
    if (auditMonth === 1) {
      setAuditMonth(12);
      setAuditYear(auditYear - 1);
    } else {
      setAuditMonth(auditMonth - 1);
    }
  };

  const nextAuditMonth = () => {
    if (auditMonth === 12) {
      setAuditMonth(1);
      setAuditYear(auditYear + 1);
    } else {
      setAuditMonth(auditMonth + 1);
    }
  };

  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditFilter === 'late') return log.isLate === true;
    if (auditFilter === 'plus') return log.dutyVarianceType === 'plus';
    if (auditFilter === 'minus') return log.dutyVarianceType === 'minus';
    return true;
  });

  const formatCurrency = (val) => {
    return Number(val || 0).toLocaleString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Clean Header with Back Button */}
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
          <Text style={styles.headerTitle}>Employee Profile</Text>
          <Text style={styles.headerSubtitle}>{employee.name} • {employee.code}</Text>
        </View>
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10B981',
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
          onPress={() => navigation.navigate('EmployeeRegistration', { employeeToEdit: employee })}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13 }}>✏️</Text>
          <Text style={{ color: '#34D399', fontSize: 13, fontWeight: '700' }}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Main Hero Profile Card */}
        <View style={styles.profileCard}>
          {employee.photo ? (
            <Image 
              source={{ uri: employee.photo }} 
              style={styles.avatarLargePhoto} 
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{(employee.name || 'E').charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <Text style={styles.empName}>{employee.name}</Text>
          {employee.name_urdu ? (
            <Text style={styles.empNameUrdu}>{employee.name_urdu}</Text>
          ) : null}
          <Text style={styles.empDesignation}>{employee.designation || 'Staff'} • {employee.department || 'General'}</Text>
          <Text style={styles.empCode}>{employee.code} • 📍 {employee.branch}</Text>
          
          <View style={[styles.statusBadge, employee.isActive !== false ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={[styles.statusBadgeText, employee.isActive !== false ? styles.badgeTextActive : styles.badgeTextInactive]}>
              {employee.isActive !== false ? '● ACTIVE EMPLOYEE' : '● INACTIVE'}
            </Text>
          </View>
        </View>

        {/* ── KEY INFORMATION QUICK SUMMARY ── */}
        <Text style={styles.sectionTitle}>⚡ Key Information</Text>
        <View style={styles.keyInfoGrid}>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>Basic Salary</Text>
            <Text style={[styles.keyInfoValue, { color: '#10B981' }]}>Rs. {formatCurrency(employee.basicSalary)}</Text>
          </View>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>ST Loss Rate</Text>
            <Text style={[styles.keyInfoValue, { color: employee.stLoss > 0 ? '#EF4444' : '#94A3B8' }]}>Rs. {formatCurrency(employee.stLoss)}</Text>
          </View>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>Fix Allowance</Text>
            <Text style={[styles.keyInfoValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(employee.fixAllowance)}</Text>
          </View>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>Other Allowance</Text>
            <Text style={[styles.keyInfoValue, { color: '#38BDF8' }]}>Rs. {formatCurrency(employee.otherAllowance)}</Text>
          </View>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>Joining Date</Text>
            <Text style={[styles.keyInfoValue, { color: '#F8FAFC' }]}>{employee.joiningDate || '-'}</Text>
          </View>
          <View style={styles.keyInfoCard}>
            <Text style={styles.keyInfoLabel}>Last Increment</Text>
            <Text style={[styles.keyInfoValue, { color: employee.lastIncrementDate && employee.lastIncrementDate !== '-' ? '#A78BFA' : '#94A3B8' }]}>{employee.lastIncrementDate || '-'}</Text>
          </View>
          <View style={[styles.keyInfoCard, styles.keyInfoCardFull]}>
            <Text style={styles.keyInfoLabel}>CNIC</Text>
            <Text style={[styles.keyInfoValue, { color: '#F8FAFC', fontWeight: 'bold' }]}>{employee.cnic || '-'}</Text>
          </View>
          <View style={[styles.keyInfoCard, styles.keyInfoCardFull]}>
            <Text style={styles.keyInfoLabel}>Contact No</Text>
            <Text style={[styles.keyInfoValue, { color: '#38BDF8', fontWeight: 'bold' }]}>{employee.mobileNo || '-'}</Text>
          </View>
          {employee.acNo && employee.acNo !== '-' && (
            <View style={[styles.keyInfoCard, styles.keyInfoCardFull]}>
              <Text style={styles.keyInfoLabel}>Account No ({employee.selectBank || 'Bank'})</Text>
              <Text style={[styles.keyInfoValue, { color: '#F59E0B', fontWeight: 'bold' }]}>{employee.acNo}</Text>
            </View>
          )}
        </View>

        {/* Action Quick Launch Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.primaryActionButton}
            onPress={() => navigation.navigate('EmployeeReportDetail', { 
              employeeId: employee.id,
              employeeName: employee.name,
              employeeCode: employee.code,
              branch: employee.branch,
              employee: employee,
              fromScreen: 'EmployeeProfileDetail'
            })}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionButtonText}>📊 View Attendance Timesheet</Text>
          </TouchableOpacity>


          <TouchableOpacity 
            style={[styles.primaryActionButton, { backgroundColor: '#0284C7', marginTop: 8 }]}
            onPress={() => navigation.navigate('EmployeeFinancials', { employee, mode: 'payslips' })}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionButtonText}>📄 Monthly Pay Slips & PDF Print</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.primaryActionButton, { backgroundColor: '#DB2777', marginTop: 8 }]}
            onPress={() => navigation.navigate('EmployeeFinancials', { employee, mode: 'advance' })}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionButtonText}>💳 Advance Loan Ledger & Balance</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.primaryActionButton, { backgroundColor: '#F59E0B', marginTop: 8 }]}
            onPress={() => setDutyAuditModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryActionButtonText, { color: '#0F172A', fontWeight: '900' }]}>
              ⏱️ Full Month Duty & Late Hours Audit (+ / -)
            </Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 1: Joining & Employment Information */}
        <Text style={styles.sectionTitle}>Joining &amp; Employment Details</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Joining Date</Text>
            <Text style={[styles.detailValue, { color: '#38BDF8', fontWeight: 'bold' }]}>
              {employee.joiningDate || '-'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last Increment Date</Text>
            <Text style={[styles.detailValue, { color: '#A78BFA', fontWeight: 'bold' }]}>
              {employee.lastIncrementDate || '-'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Confirmation / Issue Date</Text>
            <Text style={styles.detailValue}>{employee.issueDate || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>CNIC Expiry Date</Text>
            <Text style={[styles.detailValue, { color: '#F59E0B' }]}>{employee.expiryDate || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Store Branch</Text>
            <Text style={styles.detailValue}>{employee.branch || 'Central Store'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Department</Text>
            <Text style={styles.detailValue}>{employee.department || 'General'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Designation</Text>
            <Text style={styles.detailValue}>{employee.designation || 'Staff'}</Text>
          </View>
        </View>

        {/* SECTION 2: Salary, Allowances & Financials */}
        <Text style={styles.sectionTitle}>Salary, Allowances &amp; Deductions</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Basic Monthly Salary</Text>
            <Text style={[styles.detailValue, { color: '#10B981', fontWeight: '900', fontSize: 15 }]}>
              Rs. {formatCurrency(employee.basicSalary)}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Salary Type</Text>
            <Text style={styles.detailValue}>{employee.salaryType || 'Per Month'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Fixed Allowance</Text>
            <Text style={styles.detailValue}>Rs. {formatCurrency(employee.fixAllowance)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Other Allowance</Text>
            <Text style={styles.detailValue}>Rs. {formatCurrency(employee.otherAllowance)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Food / Tea Allowance</Text>
            <Text style={styles.detailValue}>
              {employee.foodAllowanceRs > 0 ? `Rs. ${formatCurrency(employee.foodAllowanceRs)}` : (employee.allowFood || 'No Food')}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Method</Text>
            <Text style={[styles.detailValue, { color: '#F59E0B', fontWeight: 'bold' }]}>
              {employee.bankCash || 'Cash'}
            </Text>
          </View>
          {employee.acNo && employee.acNo !== '-' && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Bank Account No</Text>
                <Text style={styles.detailValue}>{employee.acNo} ({employee.selectBank || 'Bank'})</Text>
              </View>
            </>
          )}
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Security Deposit</Text>
            <Text style={styles.detailValue}>Rs. {formatCurrency(employee.securityDeposit)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Short Time (ST) Loss Rate</Text>
            <Text style={styles.detailValue}>Rs. {formatCurrency(employee.stLoss)}</Text>
          </View>
          {employee.deduction > 0 && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Fixed Deduction</Text>
                <Text style={[styles.detailValue, { color: '#EF4444' }]}>Rs. {formatCurrency(employee.deduction)}</Text>
              </View>
            </>
          )}
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Electricity Bill</Text>
            <Text style={[styles.detailValue, { color: employee.electricityBill ? '#10B981' : '#94A3B8' }]}>
              {employee.electricityBill ? '✓ Included' : '✗ Not Included'}
            </Text>
          </View>
        </View>

        {/* SECTION 3: Duty Shift & Attendance Rules */}
        <Text style={styles.sectionTitle}>Shift &amp; Attendance Rules</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duty Shift Timings</Text>
            <Text style={styles.detailValue}>{employee.shift || `${employee.fDutyTime || '09:00 AM'} - ${employee.tDutyTime || '06:00 PM'}`}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Daily Duty Hours</Text>
            <Text style={styles.detailValue}>{employee.dutyHrs || 10} Hours / Day</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Weekly Off Day</Text>
            <Text style={[styles.detailValue, { color: '#F59E0B', fontWeight: 'bold' }]}>
              {employee.offDay || 'Sunday'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Overtime Allowed</Text>
            <Text style={[styles.detailValue, { color: employee.allowOvertime ? '#10B981' : '#94A3B8' }]}>
              {employee.allowOvertime ? '✓ Allowed' : '✗ Not Allowed'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>EOBI Enrolled</Text>
            <Text style={[styles.detailValue, { color: employee.eobi ? '#10B981' : '#94A3B8' }]}>
              {employee.eobi ? '✓ Enrolled' : '✗ No'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>30 Working Days Policy</Text>
            <Text style={[styles.detailValue, { color: employee.thirtyWorkingDays ? '#10B981' : '#94A3B8' }]}>
              {employee.thirtyWorkingDays ? '✓ Active' : '✗ Standard Calendar'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Advance / Loan Allowed</Text>
            <Text style={[styles.detailValue, { color: employee.allowEmployeeAdvance ? '#10B981' : '#94A3B8' }]}>
              {employee.allowEmployeeAdvance ? '✓ Allowed' : '✗ Not Allowed'}
            </Text>
          </View>
        </View>

        {/* SECTION 4: Personal & Contact Details */}
        <Text style={styles.sectionTitle}>Personal &amp; Contact Information</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Father / Husband Name</Text>
            <Text style={styles.detailValue}>{employee.fatherName || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>CNIC Number</Text>
            <Text style={[styles.detailValue, { fontWeight: 'bold', color: '#F8FAFC' }]}>
              {employee.cnic || '-'}
            </Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>CNIC Expiry Date</Text>
            <Text style={styles.detailValue}>{employee.expiryDate || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date of Birth</Text>
            <Text style={styles.detailValue}>{employee.dateOfBirth || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Mobile Number</Text>
            <Text style={[styles.detailValue, { color: '#38BDF8', fontWeight: 'bold' }]}>
              {employee.mobileNo || '-'}
            </Text>
          </View>
          {employee.resPhone && employee.resPhone !== '-' && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Residence Phone</Text>
                <Text style={styles.detailValue}>{employee.resPhone}</Text>
              </View>
            </>
          )}
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Gender / Religion</Text>
            <Text style={styles.detailValue}>{employee.gender || 'Male'} • {employee.religion || 'Islam'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Marital Status / Domicile</Text>
            <Text style={styles.detailValue}>{employee.maritalStatus || 'Single'} • {employee.domicile || '-'}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={{ paddingTop: 4 }}>
            <Text style={styles.detailLabel}>Residential Address</Text>
            <Text style={[styles.detailValue, { marginTop: 4, lineHeight: 18 }]}>
              {employee.address || '-'}
            </Text>
          </View>
        </View>

        {/* Scrollable Back Button for convenient natural reach */}
        <TouchableOpacity 
          style={styles.scrollBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.scrollBackBtnText}>← Back to Employee Directory</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky Bottom Elevated Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back to Directory</Text>
        </TouchableOpacity>
      </View>

      {/* ── MODAL: FULL MONTH DUTY & LATE HOURS AUDIT (+ / -) ── */}
      <Modal visible={dutyAuditModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.auditModalOverlay}>
          <View style={styles.auditModalContainer}>
            {/* Header */}
            <View style={styles.auditModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditModalTitle}>⏱️ Duty &amp; Late Audit</Text>
                <Text style={styles.auditModalSubtitle} numberOfLines={1}>
                  {employee.name} ({employee.code}) • {employee.branch}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.auditCloseBtn}
                onPress={() => setDutyAuditModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.auditCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Shift Timings Bar */}
            <View style={styles.shiftTimingsBar}>
              <Text style={styles.shiftTimingsText}>
                ⏰ Scheduled Shift: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{auditSummary?.scheduledStart || employee.fDutyTime || '--:--'} – {auditSummary?.scheduledEnd || employee.tDutyTime || '--:--'}</Text> • Duty: <Text style={{ color: '#38BDF8', fontWeight: 'bold' }}>{auditSummary?.dutyHrs || 8}h / day</Text>
              </Text>
            </View>

            {/* Month & Year Navigation Bar */}
            <View style={styles.auditMonthBar}>
              <TouchableOpacity style={styles.auditMonthNavBtn} onPress={prevAuditMonth} activeOpacity={0.7}>
                <Text style={styles.auditMonthNavBtnText}>‹ Prev</Text>
              </TouchableOpacity>
              <Text style={styles.auditMonthTitle}>
                {AUDIT_MONTHS[auditMonth - 1]} {auditYear}
              </Text>
              <TouchableOpacity style={styles.auditMonthNavBtn} onPress={nextAuditMonth} activeOpacity={0.7}>
                <Text style={styles.auditMonthNavBtnText}>Next ›</Text>
              </TouchableOpacity>
            </View>

            {/* KPI Summary Cards */}
            <View style={styles.auditKpiGrid}>
              {/* Late Arrivals Card */}
              <View style={[styles.auditKpiCard, { borderColor: '#F59E0B' }]}>
                <Text style={styles.auditKpiLabel}>🚨 LATE ARRIVALS</Text>
                <Text style={[styles.auditKpiValue, { color: '#F59E0B' }]}>
                  {auditSummary?.totalLateDays || 0} <Text style={{ fontSize: 11 }}>Days</Text>
                </Text>
                <Text style={styles.auditKpiSub}>Total: {auditSummary?.totalLateHrs || '0:00'} hrs late</Text>
              </View>

              {/* Net Duty Variance (+/-) */}
              <View style={[styles.auditKpiCard, { borderColor: (auditSummary?.netVarianceMins || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                <Text style={styles.auditKpiLabel}>⚡ NET (+ / -) VARIANCE</Text>
                <Text style={[styles.auditKpiValue, { color: (auditSummary?.netVarianceMins || 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                  {auditSummary?.netVarianceHrs || '0:00'} <Text style={{ fontSize: 11 }}>hrs</Text>
                </Text>
                <Text style={styles.auditKpiSub}>
                  {(auditSummary?.netVarianceMins || 0) >= 0 ? '🟢 Extra Overtime' : '🔴 Short Duty Hours'}
                </Text>
              </View>

              {/* Plus Days (OT) */}
              <View style={[styles.auditKpiCard, { borderColor: '#06B6D4' }]}>
                <Text style={styles.auditKpiLabel}>🟢 PLUS DAYS (+)</Text>
                <Text style={[styles.auditKpiValue, { color: '#06B6D4' }]}>
                  {auditSummary?.plusDaysCount || 0} <Text style={{ fontSize: 11 }}>Days</Text>
                </Text>
                <Text style={styles.auditKpiSub}>Worked &gt; {auditSummary?.dutyHrs || 8} hrs</Text>
              </View>

              {/* Minus Days (Short) */}
              <View style={[styles.auditKpiCard, { borderColor: '#EC4899' }]}>
                <Text style={styles.auditKpiLabel}>🔴 MINUS DAYS (-)</Text>
                <Text style={[styles.auditKpiValue, { color: '#EC4899' }]}>
                  {auditSummary?.minusDaysCount || 0} <Text style={{ fontSize: 11 }}>Days</Text>
                </Text>
                <Text style={styles.auditKpiSub}>Worked &lt; {auditSummary?.dutyHrs || 8} hrs</Text>
              </View>
            </View>

            {/* Filter Tabs */}
            <View style={styles.auditFilterBar}>
              <TouchableOpacity
                style={[styles.auditFilterTab, auditFilter === 'all' && styles.auditFilterTabActive]}
                onPress={() => setAuditFilter('all')}
              >
                <Text style={[styles.auditFilterTabText, auditFilter === 'all' && styles.auditFilterTabTextActive]}>
                  All ({auditLogs.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditFilterTab, auditFilter === 'late' && styles.auditFilterTabActive]}
                onPress={() => setAuditFilter('late')}
              >
                <Text style={[styles.auditFilterTabText, auditFilter === 'late' && { color: '#F59E0B', fontWeight: 'bold' }]}>
                  🚨 Late ({auditSummary?.totalLateDays || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditFilterTab, auditFilter === 'plus' && styles.auditFilterTabActive]}
                onPress={() => setAuditFilter('plus')}
              >
                <Text style={[styles.auditFilterTabText, auditFilter === 'plus' && { color: '#10B981', fontWeight: 'bold' }]}>
                  🟢 Plus ({auditSummary?.plusDaysCount || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditFilterTab, auditFilter === 'minus' && styles.auditFilterTabActive]}
                onPress={() => setAuditFilter('minus')}
              >
                <Text style={[styles.auditFilterTabText, auditFilter === 'minus' && { color: '#EF4444', fontWeight: 'bold' }]}>
                  🔴 Minus ({auditSummary?.minusDaysCount || 0})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Daily Log List */}
            {auditLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Calculating Duty &amp; Late Hours...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredAuditLogs}
                keyExtractor={(item) => item.date}
                contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
                renderItem={({ item }) => {
                  const isPresent = (item.status || '').toLowerCase().includes('present') || item.status === 'P';
                  return (
                    <View style={styles.auditDayCard}>
                      <View style={styles.auditDayHeader}>
                        <View>
                          <Text style={styles.auditDayDate}>{item.date}</Text>
                          <Text style={styles.auditDayName}>{item.day}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          {item.isLate ? (
                            <View style={styles.lateBadge}>
                              <Text style={styles.lateBadgeText}>⏰ {item.lateHrs} LATE</Text>
                            </View>
                          ) : isPresent ? (
                            <View style={styles.onTimeBadge}>
                              <Text style={styles.onTimeBadgeText}>✅ ON TIME</Text>
                            </View>
                          ) : (
                            <View style={styles.statusPill}>
                              <Text style={styles.statusPillText}>{item.status}</Text>
                            </View>
                          )}

                          {item.dutyVarianceType === 'plus' && (
                            <View style={styles.plusPill}>
                              <Text style={styles.plusPillText}>{item.dutyVarianceHrs} (PLUS)</Text>
                            </View>
                          )}
                          {item.dutyVarianceType === 'minus' && (
                            <View style={styles.minusPill}>
                              <Text style={styles.minusPillText}>{item.dutyVarianceHrs} (SHORT)</Text>
                            </View>
                          )}
                          {item.dutyVarianceType === 'exact' && (
                            <View style={styles.exactPill}>
                              <Text style={styles.exactPillText}>0:00 (ON DOT)</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Detail Metrics Row */}
                      <View style={styles.auditDayGrid}>
                        <View style={styles.auditDayCol}>
                          <Text style={styles.auditDayColLabel}>Check In / Out</Text>
                          <Text style={styles.auditDayColVal}>
                            {item.checkIn || '-'} ➔ {item.checkOut || '-'}
                          </Text>
                        </View>
                        <View style={styles.auditDayCol}>
                          <Text style={styles.auditDayColLabel}>Worked / Duty</Text>
                          <Text style={styles.auditDayColVal}>
                            <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{item.workedHrs}</Text> / {auditSummary?.dutyHrs || 8}:00
                          </Text>
                        </View>
                        <View style={styles.auditDayCol}>
                          <Text style={styles.auditDayColLabel}>Overtime / Short</Text>
                          <Text style={[styles.auditDayColVal, { color: item.dutyVarianceType === 'plus' ? '#10B981' : item.dutyVarianceType === 'minus' ? '#EF4444' : '#94A3B8' }]}>
                            {item.overtimeHrs !== '0:00' ? `+${item.overtimeHrs}` : item.shorttimeHrs !== '0:00' ? `-${item.shorttimeHrs}` : '0:00'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <Text style={{ color: '#64748B', fontSize: 14 }}>No attendance records found for this filter.</Text>
                  </View>
                }
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    backgroundColor: '#131D33',
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
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: '#131D33',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarLargePhoto: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#38BDF8',
    backgroundColor: '#0B1120',
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  avatarLargeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#38BDF8',
  },
  empName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  empNameUrdu: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },
  empDesignation: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  empCode: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  statusBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  badgeInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeTextActive: { color: '#10B981' },
  badgeTextInactive: { color: '#EF4444' },

  actionsContainer: {
    marginBottom: 16,
  },
  primaryActionButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 6,
    marginLeft: 4,
  },
  detailsCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 10,
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 8,
  },
  scrollBackBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  scrollBackBtnText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
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
  keyInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  keyInfoCard: {
    backgroundColor: '#131D33',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    width: '48%',
  },
  keyInfoCardFull: {
    width: '100%',
  },
  keyInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  keyInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  auditModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  auditModalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  auditModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 20,
    paddingBottom: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  auditModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  auditModalSubtitle: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600',
  },
  auditCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditCloseText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  shiftTimingsBar: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(56, 189, 248, 0.2)',
  },
  shiftTimingsText: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  auditMonthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  auditMonthNavBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  auditMonthNavBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  auditMonthTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  auditKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 8,
    backgroundColor: '#0F172A',
  },
  auditKpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1.5,
  },
  auditKpiLabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  auditKpiValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  auditKpiSub: {
    fontSize: 10.5,
    color: '#CBD5E1',
    marginTop: 2,
  },
  auditFilterBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 6,
  },
  auditFilterTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditFilterTabActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  auditFilterTabText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  auditFilterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  auditDayCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#24324D',
    marginBottom: 6,
  },
  auditDayDate: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  auditDayName: {
    color: '#94A3B8',
    fontSize: 10.5,
  },
  lateBadge: {
    backgroundColor: '#78350F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  lateBadgeText: {
    color: '#FEF3C7',
    fontSize: 10,
    fontWeight: '800',
  },
  onTimeBadge: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  onTimeBadgeText: {
    color: '#D1FAE5',
    fontSize: 10,
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
  plusPill: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  plusPillText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  minusPill: {
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  minusPillText: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '800',
  },
  exactPill: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  exactPillText: {
    color: '#94A3B8',
    fontSize: 10,
  },
  auditDayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  auditDayCol: {
    flex: 1,
  },
  auditDayColLabel: {
    fontSize: 9.5,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  auditDayColVal: {
    fontSize: 11.5,
    color: '#E2E8F0',
    marginTop: 2,
  },
});
