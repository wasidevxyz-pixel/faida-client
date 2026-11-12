import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { api } from '../services/api';
import { printAttendanceReport, promptAttendanceReportActions } from '../services/printService';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function AttendanceScreen({ onBack, user }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getMyLogs(selectedMonth, selectedYear);
      if (res.success) {
        setLogs(res.data || []);
      } else {
        setError(res.message || 'Failed to load records');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedMonth, selectedYear]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const handleMonthChange = (increment) => {
    let nextMonth = selectedMonth + increment;
    let nextYear = selectedYear;

    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }

    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Present': return '#10b981'; // Green
      case 'Absent': return '#ef4444'; // Red
      case 'Leave': return '#eab308'; // Yellow
      case 'Half Day': return '#f97316'; // Orange
      case 'Not Marked': return '#94a3b8'; // Slate
      default: return '#94a3b8';
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: 'numeric', weekday: 'short' });
  };

  const parseHrs = (val) => {
    if (!val || val === '-' || val === '--:--') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim().toLowerCase().replace('hrs', '').replace('hr', '').trim();
    if (str.includes(':')) {
      const parts = str.split(':').map(Number);
      return (parts[0] || 0) + ((parts[1] || 0) / 60);
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Compute summary metrics for print
  const presentCount = logs.filter(l => (l.displayStatus || '').toLowerCase().includes('present') || (l.displayStatus || '').toLowerCase() === 'p').length;
  const absentCount = logs.filter(l => (l.displayStatus || '').toLowerCase().includes('absent')).length;
  const leaveCount = logs.filter(l => (l.displayStatus || '').toLowerCase().includes('leave')).length;
  const totalWorkedHours = logs.reduce((acc, l) => acc + parseHrs(l.workedHrs || l.totalHrs), 0);

  const handlePrint = () => {
    promptAttendanceReportActions(
      {
        name: user?.name || 'My Attendance',
        code: user?.code || '--',
        branch: user?.branch?.[0] || 'Central Store'
      },
      `${MONTHS[selectedMonth - 1]} ${selectedYear}`,
      {
        presentDays: presentCount,
        absentDays: absentCount,
        leavesDays: leaveCount,
        totalWorkedHours
      },
      logs.map(l => ({
        date: l.date ? new Date(l.date).toISOString().split('T')[0] : '-',
        day: formatDate(l.date).split(' ')[1] || '-',
        checkIn: l.checkIn || '--:--',
        checkOut: l.checkOut || '--:--',
        workedHrs: l.workedHrs || (l.totalHrs ? `${l.totalHrs} hrs` : '--:--'),
        status: l.displayStatus || 'Present',
        remarks: l.remarks || '-'
      }))
    );
  };

  const renderLogItem = ({ item }) => {
    const statusColor = getStatusColor(item.displayStatus);
    const workedHrs = parseHrs(item.workedHrs || item.totalHrs);

    return (
      <View style={styles.logCard}>
        <View style={styles.cardHeader}>
          <View style={styles.dateBlock}>
            <Text style={styles.dayText}>{formatDate(item.date).split(' ')[1]}</Text>
            <Text style={styles.dateText}>{formatDate(item.date).split(' ')[0]}</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.displayStatus.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>CHECK IN</Text>
            <Text style={styles.detailValue}>{item.checkIn || '--:--'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>CHECK OUT</Text>
            <Text style={styles.detailValue}>{item.checkOut || '--:--'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>WORKED HRS</Text>
            <Text style={styles.detailValue}>{workedHrs > 0 ? `${workedHrs.toFixed(1)}h` : '--:--'}</Text>
          </View>
        </View>

        {item.remarks ? (
          <View style={styles.remarksRow}>
            <Text style={styles.remarksText}>ℹ️ {item.remarks}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="light-content" />

      {/* Clean Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackBtn} 
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerBackBtnIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Attendance History</Text>
          <Text style={styles.headerSubtitle}>{MONTHS[selectedMonth - 1]} {selectedYear}</Text>
        </View>
        <TouchableOpacity style={styles.printBtn} onPress={handlePrint} activeOpacity={0.8}>
          <Text style={styles.printBtnText}>🖨️ Print</Text>
        </TouchableOpacity>
      </View>

      {/* Month Filter Selector */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleMonthChange(-1)}>
          <Text style={styles.arrowText}>◀ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          📅 {MONTHS[selectedMonth - 1]} {selectedYear}
        </Text>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleMonthChange(1)}>
          <Text style={styles.arrowText}>Next ▶</Text>
        </TouchableOpacity>
      </View>

      {/* Prominent Print & Export Action Banner */}
      <View style={styles.printActionCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.printActionTitle}>Monthly Attendance Sheet</Text>
          <Text style={styles.printActionSubtitle}>
            {presentCount} Present • {absentCount} Absent • {totalWorkedHours.toFixed(1)} hrs
          </Text>
        </View>
        <TouchableOpacity style={styles.solidPrintBtn} onPress={handlePrint} activeOpacity={0.8}>
          <Text style={styles.solidPrintBtnText}>🖨️ Print Sheet</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* List Container */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : logs.length > 0 ? (
        <FlatList
          data={logs}
          keyExtractor={(item) => item._id || item.date}
          renderItem={renderLogItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38BDF8']} />}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38BDF8']} />}
          contentContainerStyle={styles.emptyContainer}
        >
          <Text style={styles.emptyText}>No attendance records for this month.</Text>
        </ScrollView>
      )}

      {/* Sticky Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={onBack} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    backgroundColor: '#131D33',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
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
  printBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    elevation: 3,
  },
  printBtnText: {
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131D33',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  arrowBtn: {
    backgroundColor: '#0B1120',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  arrowText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  monthLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginRight: 6,
  },
  dayText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#0B1120',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B1120',
    padding: 10,
    borderRadius: 8,
  },
  detailCol: {
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  remarksRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  remarksText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  errorText: {
    color: '#EF4444',
    padding: 10,
    textAlign: 'center',
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
