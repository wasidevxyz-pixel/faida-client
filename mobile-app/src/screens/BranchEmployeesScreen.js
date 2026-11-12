import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Modal, 
  SafeAreaView, 
  StatusBar,
  TextInput,
  Platform,
  ScrollView
} from 'react-native';
import api from '../services/api';

export default function BranchEmployeesScreen({ navigation, onBack, route }) {
  const initialBranch = route?.params?.branch && route.params.branch !== 'All Branches' ? route.params.branch : 'Select Branch';
  const [branches, setBranches] = useState(['Select Branch', 'All Branches']);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setBranchesLoading(true);
    try {
      let rawBranches = [];
      try {
        const response = await api.get('/mobile/admin/branches');
        if (response && response.success && Array.isArray(response.data) && response.data.length > 0) {
          rawBranches = response.data;
        }
      } catch (err) {
        console.warn('BranchEmployeesScreen: /mobile/admin/branches error:', err);
      }

      if (rawBranches.length === 0) {
        try {
          const sRes = await api.get('/stores');
          const sList = sRes?.data || sRes?.stores || sRes;
          if (Array.isArray(sList) && sList.length > 0) {
            rawBranches = sList.map(s => s.name || s.branch || s);
          }
        } catch {}
      }

      if (rawBranches.length === 0) {
        try {
          const mbRes = await api.get('/mobile/branches');
          const mbList = mbRes?.data || mbRes?.branches || mbRes;
          if (Array.isArray(mbList) && mbList.length > 0) {
            rawBranches = mbList.map(s => s.name || s.branch || s);
          }
        } catch {}
      }

      const seen = new Set();
      const clean = ['Select Branch', 'All Branches'];
      seen.add('select branch');
      seen.add('all branches');
      seen.add('all');

      const branchList = [];
      rawBranches.forEach(b => {
        const rawName = typeof b === 'string' ? b : (b?.name || b?.branch || '');
        const trimmed = (rawName || '').trim().replace(/[()]/g, '');
        const key = trimmed.toLowerCase();
        if (trimmed && !seen.has(key)) {
          seen.add(key);
          branchList.push(trimmed);
        }
      });

      branchList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      const fullList = [...clean, ...branchList];
      setBranches(fullList);

      if (initialBranch && initialBranch !== 'Select Branch') {
        setSelectedBranch(initialBranch);
        fetchEmployees(initialBranch);
      }
    } catch (error) {
      console.error('Error fetching branches list in BranchEmployeesScreen:', error);
    } finally {
      setBranchesLoading(false);
    }
  };

  const fetchEmployees = async (branchName) => {
    if (!branchName || branchName === 'Select Branch') {
      setEmployees([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const branchParam = branchName !== 'All Branches' ? `branch=${encodeURIComponent(branchName)}` : 'branch=All%20Branches';
      const response = await api.get(`/mobile/admin/branch-status?${branchParam}`);
      if (response && response.success && Array.isArray(response.data)) {
        setEmployees(response.data);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching branch status:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const selectBranch = (branch) => {
    const target = branch || 'Select Branch';
    setSelectedBranch(target);
    setModalVisible(false);
    if (target === 'Select Branch') {
      setEmployees([]);
    } else {
      fetchEmployees(target);
    }
  };

  const [statusFilter, setStatusFilter] = useState('all');

  const getStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('present') || s === 'p') {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981', label: '● Present' };
    }
    if (s.includes('half') || s.includes('short')) {
      return { bg: 'rgba(249, 115, 22, 0.15)', text: '#FB923C', label: '● Half Day' };
    }
    if (s.includes('leave') || s === 'leave') {
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', label: '● On Leave' };
    }
    if (s.includes('not marked') || s === '' || s === '-' || s === 'unmarked') {
      return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94A3B8', label: '○ Not Marked' };
    }
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', label: '● Absent' };
  };

  const empList = Array.isArray(employees) ? employees : [];
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

  const filteredEmployees = empList.filter(emp => {
    if (!emp) return false;
    const s = (emp.status || '').toLowerCase();
    const isPresent = s.includes('present') || s === 'p' || s.includes('half') || s.includes('short');
    const isNotMarked = s.includes('not marked') || s === '' || s === '-' || s === 'unmarked';
    const isAbsent = (s.includes('absent') || s === 'a') && !s.includes('not');
    const isLeave = s.includes('leave');

    if (statusFilter === 'present' && !isPresent) return false;
    if (statusFilter === 'not_marked' && !isNotMarked) return false;
    if (statusFilter === 'absent' && !isAbsent) return false;
    if (statusFilter === 'leave' && !isLeave) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.code || '').toLowerCase().includes(q) ||
      (emp.branch || '').toLowerCase().includes(q) ||
      (emp.designation || '').toLowerCase().includes(q)
    );
  });

  const handleEmpClick = (item) => {
    if (!item) return;
    const params = {
      employeeId: item.id || item._id,
      employeeName: item.name,
      employeeCode: item.code,
      branch: item.branch || selectedBranch,
      fromScreen: 'Attendance'
    };
    if (navigation?.navigate) {
      navigation.navigate('EmployeeReportDetail', params);
    } else if (typeof navigation === 'function') {
      navigation('EmployeeReportDetail', params);
    }
  };

  const renderEmployeeItem = ({ item }) => {
    if (!item) return null;
    const statusStyle = getStatusStyle(item.status);

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => handleEmpClick(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{(item.name || 'E').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.empName}>{item.name || 'Unnamed Staff'}</Text>
            <Text style={styles.empCode}>{item.code || '---'} • <Text style={styles.designationText}>{item.designation || 'Staff'}</Text> • <Text style={{ color: '#0284C7' }}>{item.branch || selectedBranch}</Text></Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.timeRow}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>CHECK IN</Text>
            <Text style={[styles.timeVal, item.checkIn && item.checkIn !== '-' && { color: '#10B981', fontWeight: 'bold' }]}>
              {item.checkIn || '-'}
            </Text>
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>CHECK OUT</Text>
            <Text style={[styles.timeVal, item.checkOut && item.checkOut !== '-' && { color: '#FF4D4F' }]}>
              {item.checkOut || '-'}
            </Text>
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>WORK HOURS</Text>
            <Text style={[styles.timeVal, item.workedHrs && item.workedHrs !== '-' && { color: '#38BDF8', fontWeight: 'bold' }]}>{item.workedHrs || '-'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
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
          <Text style={styles.headerTitle}>Live Branch Attendance</Text>
          <Text style={styles.headerSubtitle}>Active Staff • Real-time Check-In / Out Times</Text>
        </View>
      </View>

      {/* Selector Section & Search */}
      <View style={styles.selectorContainer}>
        {/* Horizontal Branch Selector Pills & Dropdown Trigger */}
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.selectorLabel}>SELECT BRANCH</Text>
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownBtnText} numberOfLines={1}>
                {selectedBranch === 'Select Branch' ? '👇 Select Branch' : selectedBranch === 'All Branches' ? '🌐 All Branches' : `📍 ${selectedBranch}`}
              </Text>
              <Text style={styles.dropdownBtnArrow}>▼</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingTop: 4, paddingBottom: 2 }}
          >
            {branches.map((b) => {
              const isSelected = selectedBranch === b;
              return (
                <TouchableOpacity
                  key={`branch-pill-${b}`}
                  style={[
                    styles.branchPill,
                    isSelected && styles.branchPillActive
                  ]}
                  onPress={() => selectBranch(b)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.branchPillText,
                      isSelected && styles.branchPillTextActive
                    ]}
                  >
                    {b === 'Select Branch' ? '👇 Select Branch' : b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Dynamic Branch Summary Cards & Interactive Filters */}
        <View style={styles.summaryRow}>
          <TouchableOpacity 
            style={[styles.summaryCard, statusFilter === 'all' && styles.summaryCardActiveAll]}
            onPress={() => setStatusFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={styles.summaryNum}>{totalCount}</Text>
            <Text style={[styles.summaryLabel, statusFilter === 'all' && styles.textActiveLabel]}>Total Staff</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryCard, styles.bgGreen, statusFilter === 'present' && styles.summaryCardActiveGreen]}
            onPress={() => setStatusFilter('present')}
            activeOpacity={0.7}
          >
            <Text style={[styles.summaryNum, styles.textGreen]}>{presentCount}</Text>
            <Text style={[styles.summaryLabel, statusFilter === 'present' && styles.textActiveLabel]}>Present</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryCard, styles.bgBlue, statusFilter === 'not_marked' && styles.summaryCardActiveBlue]}
            onPress={() => setStatusFilter('not_marked')}
            activeOpacity={0.7}
          >
            <Text style={[styles.summaryNum, styles.textBlue]}>{notMarkedCount}</Text>
            <Text style={[styles.summaryLabel, statusFilter === 'not_marked' && styles.textActiveLabel]}>Not Marked</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryCard, styles.bgRed, statusFilter === 'absent' && styles.summaryCardActiveRed]}
            onPress={() => setStatusFilter('absent')}
            activeOpacity={0.7}
          >
            <Text style={[styles.summaryNum, styles.textRed]}>{absentCount}</Text>
            <Text style={[styles.summaryLabel, statusFilter === 'absent' && styles.textActiveLabel]}>Absent</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryCard, styles.bgYellow, statusFilter === 'leave' && styles.summaryCardActiveYellow]}
            onPress={() => setStatusFilter('leave')}
            activeOpacity={0.7}
          >
            <Text style={[styles.summaryNum, styles.textYellow]}>{leaveCount}</Text>
            <Text style={[styles.summaryLabel, statusFilter === 'leave' && styles.textActiveLabel]}>Leave</Text>
          </TouchableOpacity>
        </View>

        {/* Search Box */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search employee by name (e.g. Bilal) or code..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Employees List */}
      {selectedBranch === 'Select Branch' ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🏢</Text>
          <Text style={{ color: '#F8FAFC', fontSize: 17, fontWeight: '800', marginBottom: 6 }}>Please Select a Store Branch</Text>
          <Text style={[styles.emptyText, { maxWidth: 310, textAlign: 'center', marginBottom: 16 }]}>
            Choose a branch or "All Branches" from the options above or tap below to view live attendance records, punch times, and shift logs.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 12 }}>
            {branches.filter(b => b !== 'Select Branch').map((b, idx) => (
              <TouchableOpacity
                key={`branch-chip-${idx}`}
                style={{
                  backgroundColor: '#1E293B',
                  borderWidth: 1,
                  borderColor: 'rgba(56, 189, 248, 0.3)',
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 20,
                }}
                onPress={() => selectBranch(b)}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#38BDF8', fontSize: 13, fontWeight: '700' }}>
                  {b === 'All Branches' ? '🌐 All Branches' : `📍 ${b}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Fetching branch records...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item, idx) => String(item?.id || item?._id || item?.code || idx)}
          renderItem={renderEmployeeItem}
          contentContainerStyle={styles.listContent}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No employees found matching criteria.</Text>
            </View>
          }
        />
      )}

      {/* Branch Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Branch</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={branches}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.modalItem, item === selectedBranch && styles.selectedModalItem]}
                  onPress={() => selectBranch(item)}
                >
                  <Text style={[styles.modalItemText, item === selectedBranch && styles.selectedModalItemText]}>
                    {item === 'Select Branch' ? '👇 Select Branch' : item === 'All Branches' ? '🌐 All Branches' : `📍 ${item}`}
                  </Text>
                  {item === selectedBranch && <Text style={styles.modalCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

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
  container: {
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
  selectorContainer: {
    backgroundColor: '#131D33',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  dropdownButton: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  selectorTopRow: {
    marginBottom: 8,
  },
  branchPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  branchPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderColor: '#38BDF8',
  },
  branchPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  branchPillTextActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  searchBox: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginTop: 8,
  },
  searchInput: {
    color: '#F8FAFC',
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    gap: 4,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#0B1120',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 3,
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
  summaryNum: { fontSize: 14, fontWeight: '800', color: '#F8FAFC' },
  summaryLabel: { fontSize: 8, color: '#64748B', fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  textActiveLabel: { color: '#F8FAFC', fontWeight: '800' },
  bgGreen: { borderColor: 'rgba(16, 185, 129, 0.4)' },
  textGreen: { color: '#10B981' },
  bgBlue: { borderColor: 'rgba(56, 189, 248, 0.4)' },
  textBlue: { color: '#38BDF8' },
  bgRed: { borderColor: 'rgba(239, 68, 68, 0.4)' },
  textRed: { color: '#EF4444' },
  bgYellow: { borderColor: 'rgba(245, 158, 11, 0.4)' },
  textYellow: { color: '#F59E0B' },
  listContent: {
    padding: 16,
    paddingBottom: 90,
  },
  card: {
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
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarText: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: 'bold',
  },
  empName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  empCode: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  designationText: {
    color: '#38BDF8',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0B1120',
    padding: 10,
    borderRadius: 8,
  },
  timeBox: {
    alignItems: 'center',
    flex: 1,
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 2,
  },
  timeVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 10,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  dropdownBtn: {
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
  dropdownBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  dropdownBtnArrow: {
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
