import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform,
  Modal,
  TextInput,
  FlatList
} from 'react-native';
import { api } from '../services/api';

export default function ScheduleScreen({ onBack, route, employeeId = null }) {
  const initialEmpId = route?.params?.employeeId || employeeId;
  const [currentEmpId, setCurrentEmpId] = useState(initialEmpId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState('');

  // Staff picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [employeesList, setEmployeesList] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSchedule = async (targetId = currentEmpId) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSchedule(targetId);
      if (res && res.success) {
        setSchedule(res.data);
        if (res.data?._id) {
          setCurrentEmpId(res.data._id);
        }
      } else {
        setError(res?.message || 'Failed to load schedule');
      }
    } catch (err) {
      setError(err?.message || 'Network error fetching schedule');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchEmployeesList = async () => {
    setLoadingEmployees(true);
    try {
      const res = await api.get('/mobile/admin/employees-directory?limit=500');
      if (res && res.success && Array.isArray(res.data)) {
        setEmployeesList(res.data);
      }
    } catch (err) {
      console.warn('Could not load employees directory for schedule picker:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    fetchSchedule(initialEmpId);
    fetchEmployeesList();
  }, [initialEmpId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedule(currentEmpId);
  };

  const handleSelectEmployee = (emp) => {
    setPickerVisible(false);
    setCurrentEmpId(emp._id);
    fetchSchedule(emp._id);
  };

  const filteredEmployees = employeesList.filter(emp => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = emp.name?.toLowerCase().includes(q);
    const codeMatch = emp.code?.toLowerCase().includes(q);
    const branchMatch = emp.branch?.toLowerCase().includes(q);
    return nameMatch || codeMatch || branchMatch;
  });

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
          <Text style={styles.headerTitle}>Duty Shift & Schedule</Text>
          <Text style={styles.headerSubtitle}>Timing configurations, shift & off-days</Text>
        </View>
        <TouchableOpacity 
          style={styles.switchStaffBtn}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.switchStaffBtnText}>👥 Switch</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity 
            style={styles.selectStaffActionBtn}
            onPress={() => setPickerVisible(true)}
          >
            <Text style={styles.selectStaffActionBtnText}>Select Staff Member</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading shift schedule...</Text>
        </View>
      ) : schedule ? (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38BDF8']} />}
        >
          {/* Employee Header */}
          <View style={styles.profileCard}>
            <View style={styles.profileCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.empName}>{schedule.name}</Text>
                <Text style={styles.empCode}>
                  {schedule.code || 'EMP'} • <Text style={{ color: '#38BDF8' }}>{schedule.branch || 'Central Store'}</Text>
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.changeEmpBadge}
                onPress={() => setPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.changeEmpBadgeText}>Change ⇄</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Timings List */}
          <Text style={styles.sectionTitle}>Duty Timing Details</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Standard Duty Shift</Text>
              <Text style={styles.infoValue}>
                {schedule.fDutyTime || '09:00 AM'} - {schedule.tDutyTime || '06:00 PM'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Scheduled Times</Text>
              <Text style={styles.infoValue}>
                {schedule.scheduleFDutyTime || schedule.fDutyTime || '09:00 AM'} - {schedule.scheduleTDutyTime || schedule.tDutyTime || '06:00 PM'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Weekly Off Day</Text>
              <Text style={[styles.infoValue, styles.offDayText]}>
                {schedule.offDay || 'Sunday'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Target Hours / Shift</Text>
              <Text style={styles.infoValue}>
                {schedule.dutyHours ? `${schedule.dutyHours} Hours` : '9.0 Hours'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Overtime Eligibility</Text>
              <Text style={[styles.infoValue, { color: schedule.allowOvertime ? '#10B981' : '#EF4444' }]}>
                {schedule.allowOvertime ? 'Eligible' : 'Not Allowed'}
              </Text>
            </View>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Shift Compliance</Text>
            <Text style={styles.noteText}>
              Ensure check-in scans match the scheduled shift start window to avoid late penalty or short-time deduction.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⏰</Text>
          <Text style={styles.emptyText}>No schedule information available</Text>
          <TouchableOpacity 
            style={styles.selectStaffActionBtn}
            onPress={() => setPickerVisible(true)}
          >
            <Text style={styles.selectStaffActionBtnText}>Select Staff Member</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Employee Selector Modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Staff Member</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, code or branch..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />

            {loadingEmployees ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color="#38BDF8" />
              </View>
            ) : (
              <FlatList
                data={filteredEmployees}
                keyExtractor={(item) => item._id || item.id || String(item.code)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.empPickerItem,
                      currentEmpId === item._id && styles.empPickerItemActive
                    ]}
                    onPress={() => handleSelectEmployee(item)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empPickerName, currentEmpId === item._id && styles.empPickerNameActive]}>
                        {item.name}
                      </Text>
                      <Text style={styles.empPickerSub}>
                        {item.code} • {item.branch || 'Branch'} • {item.designation?.name || item.designation || 'Staff'}
                      </Text>
                    </View>
                    {currentEmpId === item._id && (
                      <Text style={styles.activeCheckmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Text style={styles.emptyText}>No employees found</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Sticky Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={onBack} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back</Text>
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
  switchStaffBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  switchStaffBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 10,
  },
  container: {
    padding: 16,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  profileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  empCode: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  changeEmpBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  changeEmpBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  offDayText: {
    color: '#F59E0B',
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  noteBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    padding: 14,
    marginTop: 16,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    margin: 16,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  selectStaffActionBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectStaffActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#131D33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseBtnText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    marginBottom: 14,
  },
  modalLoading: {
    padding: 30,
    alignItems: 'center',
  },
  empPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  empPickerItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
  },
  empPickerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  empPickerNameActive: {
    color: '#38BDF8',
  },
  empPickerSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  activeCheckmark: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalEmpty: {
    padding: 30,
    alignItems: 'center',
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
