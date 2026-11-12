import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar,
  Modal,
  ScrollView,
  Platform
} from 'react-native';
import api from '../services/api';
import { printAttendanceReport } from '../services/printService';

const MONTHS = [
  { label: 'January', value: 1 },
  { label: 'February', value: 2 },
  { label: 'March', value: 3 },
  { label: 'April', value: 4 },
  { label: 'May', value: 5 },
  { label: 'June', value: 6 },
  { label: 'July', value: 7 },
  { label: 'August', value: 8 },
  { label: 'September', value: 9 },
  { label: 'October', value: 10 },
  { label: 'November', value: 11 },
  { label: 'December', value: 12 }
];

const YEARS = [2024, 2025, 2026, 2027];

export default function EmployeeReportDetailScreen({ route, navigation }) {
  const { employeeId, employeeName, employeeCode, branch } = route?.params || {};

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [monthModalVisible, setMonthModalVisible] = useState(false);
  const [yearModalVisible, setYearModalVisible] = useState(false);

  useEffect(() => {
    fetchReport(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  const fetchReport = async (month, year) => {
    setLoading(true);
    try {
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const response = await api.get(
        `/mobile/admin/employee-report?employeeId=${employeeId}&startDate=${startStr}&endDate=${endStr}`
      );
      if (response && response.success) {
        setSummary(response.summary);
        setLogs(response.logs || []);
      }
    } catch (error) {
      console.error('Error fetching employee report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthLabel = (mValue) => {
    const found = MONTHS.find(m => m.value === mValue);
    return found ? found.label : '';
  };

  const getStatusBadgeStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s === '-' || s.includes('upcoming') || s.includes('pending')) {
      return { bg: '#1E293B', text: '#94A3B8', label: '-' };
    }
    if (s.includes('present') || s === 'p') {
      return { bg: '#1B382B', text: '#52C41A', label: 'Present' };
    }
    if (s.includes('leave') || s === 'leave') {
      return { bg: '#3C2E15', text: '#FADB14', label: 'Leave' };
    }
    if (s.includes('half') || s.includes('short')) {
      return { bg: '#3C2715', text: '#FA8C16', label: 'Half Day' };
    }
    if (s.includes('holiday')) {
      return { bg: '#2B1B3C', text: '#B37FEB', label: 'Holiday' };
    }
    if (s.includes('off')) {
      return { bg: '#1E293B', text: '#94A3B8', label: 'Weekly Off' };
    }
    return { bg: '#3C1E22', text: '#FF4D4F', label: 'Absent' };
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1]) - 1;
    return `${parts[2]} ${monthsShort[mIdx]}`;
  };

  const renderLogItem = ({ item }) => {
    const badge = getStatusBadgeStyle(item.status);
    const hasOT = item.overtimeHrs && item.overtimeHrs !== '0:00';
    const hasST = item.shorttimeHrs && item.shorttimeHrs !== '0:00';

    return (
      <View style={styles.logCard}>
        <View style={styles.logCardHeader}>
          <View>
            <Text style={styles.logDate}>
              {formatDateLabel(item.date)} <Text style={styles.logDay}>• {item.day}</Text>
            </Text>
          </View>
          <View style={[styles.badgeContainer, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>
              {badge.label}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.timesContainer}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>CHECK IN</Text>
            <Text style={[styles.timeValue, item.checkIn !== '--:--' && { color: '#52C41A' }]}>
              {item.checkIn}
            </Text>
          </View>

          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>CHECK OUT</Text>
            <Text style={[styles.timeValue, item.checkOut !== '--:--' && { color: '#FF4D4F' }]}>
              {item.checkOut}
            </Text>
          </View>

          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>WORKED</Text>
            <Text style={styles.timeValue}>{item.workedHrs} hrs</Text>
          </View>
        </View>

        {(hasOT || hasST || (item.remarks && item.remarks !== '-')) && (
          <View style={styles.miniMetricsContainer}>
            {hasOT && (
              <View style={[styles.miniMetricBadge, { backgroundColor: 'rgba(82, 196, 26, 0.15)' }]}>
                <Text style={[styles.miniMetricText, { color: '#52C41A' }]}>OT: +{item.overtimeHrs}</Text>
              </View>
            )}
            {hasST && (
              <View style={[styles.miniMetricBadge, { backgroundColor: 'rgba(250, 140, 22, 0.15)' }]}>
                <Text style={[styles.miniMetricText, { color: '#FA8C16' }]}>Late/Short: -{item.shorttimeHrs}</Text>
              </View>
            )}
            {item.remarks && item.remarks !== '-' && (
              <View style={[styles.miniMetricBadge, { backgroundColor: 'rgba(148, 163, 184, 0.1)' }]}>
                <Text style={[styles.miniMetricText, { color: '#94A3B8' }]}>{item.remarks}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
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
          <Text style={styles.headerTitle}>{employeeName}</Text>
          <Text style={styles.headerSubtitle}>{employeeCode} • {branch}</Text>
        </View>
        <TouchableOpacity 
          style={styles.printHeaderBtn}
          onPress={() => printAttendanceReport(
            { name: employeeName, code: employeeCode, branch },
            `${getMonthLabel(selectedMonth)} ${selectedYear}`,
            summary || {},
            logs || []
          )}
          activeOpacity={0.8}
        >
          <Text style={styles.printHeaderBtnText}>🖨️ Print</Text>
        </TouchableOpacity>
      </View>

      {/* Date Pickers Bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setMonthModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.filterButtonLabel}>Month</Text>
          <Text style={styles.filterButtonText}>{getMonthLabel(selectedMonth)} ▾</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setYearModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.filterButtonLabel}>Year</Text>
          <Text style={styles.filterButtonText}>{selectedYear} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* Prominent Print & Export Action Banner */}
      <View style={styles.printActionCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.printActionTitle}>Monthly Attendance Sheet</Text>
          <Text style={styles.printActionSubtitle}>
            {getMonthLabel(selectedMonth)} {selectedYear} • {logs.length} entries
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.solidPrintBtn}
          onPress={() => printAttendanceReport(
            { name: employeeName, code: employeeCode, branch },
            `${getMonthLabel(selectedMonth)} ${selectedYear}`,
            summary || {},
            logs || []
          )}
          activeOpacity={0.8}
        >
          <Text style={styles.solidPrintBtnText}>🖨️ Print PDF</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <Text style={styles.loadingText}>Compiling monthly report details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {/* Summary Section */}
          {summary && (
            <View style={styles.summaryContainer}>
              <Text style={styles.sectionTitle}>Summary Report</Text>
              
              <View style={styles.summaryGrid}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryBoxLabel}>TOTAL HOURS</Text>
                  <Text style={styles.summaryBoxValue}>{summary.totalWorkedHrs}</Text>
                </View>

                <View style={[styles.summaryBox, { borderColor: '#1B382B' }]}>
                  <Text style={[styles.summaryBoxLabel, { color: '#52C41A' }]}>OVERTIME</Text>
                  <Text style={[styles.summaryBoxValue, { color: '#52C41A' }]}>{summary.totalOvertimeHrs}</Text>
                </View>

                <View style={[styles.summaryBox, { borderColor: '#3C2715' }]}>
                  <Text style={[styles.summaryBoxLabel, { color: '#FA8C16' }]}>SHORT TIME</Text>
                  <Text style={[styles.summaryBoxValue, { color: '#FA8C16' }]}>{summary.totalShorttimeHrs}</Text>
                </View>
              </View>

              <View style={[styles.summaryGrid, { marginTop: 10 }]}>
                <View style={styles.summaryMiniBox}>
                  <Text style={styles.miniBoxNum}>{summary.presentDays}</Text>
                  <Text style={styles.miniBoxLabel}>Present</Text>
                </View>
                <View style={[styles.summaryMiniBox, { borderLeftColor: '#334155' }]}>
                  <Text style={[styles.miniBoxNum, { color: '#FF4D4F' }]}>{summary.absentDays}</Text>
                  <Text style={styles.miniBoxLabel}>Absent</Text>
                </View>
                <View style={[styles.summaryMiniBox, { borderLeftColor: '#334155' }]}>
                  <Text style={[styles.miniBoxNum, { color: '#FADB14' }]}>{summary.leaveDays}</Text>
                  <Text style={styles.miniBoxLabel}>Leaves</Text>
                </View>
                <View style={[styles.summaryMiniBox, { borderLeftColor: '#334155' }]}>
                  <Text style={[styles.miniBoxNum, { color: '#B37FEB' }]}>{summary.holidayCount}</Text>
                  <Text style={styles.miniBoxLabel}>Holidays</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginHorizontal: 20, marginTop: 25, marginBottom: 10 }]}>
            Attendance logs timeline
          </Text>

          {/* Daily Logs list */}
          <FlatList
            data={logs}
            keyExtractor={(item) => item.date}
            renderItem={renderLogItem}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No attendance records for this month</Text>
              </View>
            }
          />

          {/* Scrollable Back Button */}
          <TouchableOpacity 
            style={styles.scrollBackBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.scrollBackBtnText}>← Back to Employees</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Sticky Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back to Employees</Text>
        </TouchableOpacity>
      </View>

      {/* Month Picker Modal */}
      <Modal
        visible={monthModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month</Text>
              <TouchableOpacity onPress={() => setMonthModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={MONTHS}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.pickerItem, item.value === selectedMonth && styles.selectedPickerItem]}
                  onPress={() => setSelectedMonth(item.value)}
                >
                  <Text style={[styles.pickerItemText, item.value === selectedMonth && styles.selectedPickerItemText]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Year Picker Modal */}
      <Modal
        visible={yearModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Year</Text>
              <TouchableOpacity onPress={() => setYearModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={YEARS}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.pickerItem, item === selectedYear && styles.selectedPickerItem]}
                  onPress={() => setSelectedYear(item)}
                >
                  <Text style={[styles.pickerItemText, item === selectedYear && styles.selectedPickerItemText]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
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
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    backgroundColor: '#131D33',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginRight: 10,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600',
  },
  printHeaderBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    elevation: 3,
  },
  printHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  printActionCard: {
    backgroundColor: '#131D33',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  printActionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  printActionSubtitle: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 2,
  },
  solidPrintBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  solidPrintBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterButton: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterButtonLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#F1F5F9',
    fontWeight: '500',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryBoxLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  summaryBoxValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 6,
  },
  summaryMiniBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  miniBoxNum: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#52C41A',
  },
  miniBoxLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  logCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  logDay: {
    color: '#64748B',
    fontWeight: 'normal',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  holidayNameText: {
    fontSize: 12,
    color: '#B37FEB',
    marginTop: 4,
    fontWeight: '500',
  },
  logDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 10,
  },
  logDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logDetailBox: {
    flex: 1,
    alignItems: 'center',
  },
  logDetailLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  logDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  miniMetricBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8,
  },
  miniMetricText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    width: '80%',
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  modalCloseText: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '600',
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
    alignItems: 'center',
  },
  selectedPickerItem: {
    backgroundColor: '#0F172A',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#F1F5F9',
  },
  selectedPickerItemText: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  scrollBackBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
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
});
