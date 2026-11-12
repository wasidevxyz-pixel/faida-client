import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar,
  ScrollView,
  Image,
  Platform,
  Modal,
  Linking
} from 'react-native';
import api from '../services/api';

export default function EmployeeDirectoryScreen({ navigation, route, onBack }) {
  const mode = route?.params?.mode || 'profile';
  const [search, setSearch] = useState('');
  const [branches, setBranches] = useState(['Select Branch', 'All Branches']);
  const [selectedBranch, setSelectedBranch] = useState('Select Branch');
  const [modalVisible, setModalVisible] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchSeqRef = useRef(0);
  const searchTimeoutRef = useRef(null);

  const getBranchName = (b) => {
    if (!b) return '';
    if (typeof b === 'string') return b.trim();
    if (typeof b === 'object') return (b.name || b.branch || b.title || b.code || '').trim();
    return String(b).trim();
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      let rawList = [];
      try {
        const res = await api.get('/mobile/admin/branches');
        rawList = res?.data || res?.branches || [];
      } catch (err1) {
        console.warn('Fallback to /stores for branches:', err1.message);
        const storesRes = await api.get('/stores');
        rawList = storesRes?.data || storesRes || [];
      }

      if (!Array.isArray(rawList) || rawList.length === 0) {
        const storesRes = await api.get('/stores');
        rawList = storesRes?.data || storesRes || [];
      }

      const seen = new Set();
      seen.add('select branch');
      seen.add('all branches');
      seen.add('all');

      const cleanBranches = ['Select Branch', 'All Branches'];

      if (Array.isArray(rawList)) {
        rawList.forEach(item => {
          const name = getBranchName(item);
          const key = name.toLowerCase().replace(/[()]/g, '').trim();
          if (name && !seen.has(key)) {
            seen.add(key);
            cleanBranches.push(name);
          }
        });
      }

      const sorted = [
        'Select Branch',
        'All Branches',
        ...cleanBranches.slice(2).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      ];

      setBranches(sorted);
    } catch (e) {
      console.error('Error loading branches in EmployeeDirectoryScreen:', e);
    }
  };

  const fetchEmployees = async (searchTerm = '', branchName = 'Select Branch') => {
    const cleanBranch = getBranchName(branchName);
    if (!cleanBranch || cleanBranch === 'Select Branch') {
      setEmployees([]);
      setLoading(false);
      return;
    }
    const currentSeq = ++searchSeqRef.current;
    try {
      setLoading(true);
      // Build query string manually — api.js is a raw fetch wrapper that doesn't support { params }
      const qp = new URLSearchParams({ limit: '1000' });
      if (searchTerm && searchTerm.trim()) qp.set('search', searchTerm.trim());
      if (cleanBranch && cleanBranch !== 'All Branches') qp.set('branch', cleanBranch);

      const res = await api.get(`/mobile/admin/employees-directory?${qp.toString()}`);
      if (currentSeq !== searchSeqRef.current) return;
      if (res && Array.isArray(res.data)) {
        if (searchTerm) {
          setEmployees(prev => {
            const seen = new Set(res.data.map(e => String(e._id || e.id || e.code)));
            const remaining = prev.filter(e => !seen.has(String(e._id || e.id || e.code)));
            return [...res.data, ...remaining];
          });
        } else {
          setEmployees(res.data);
        }
      }
    } catch (e) {
      console.error('Error loading employees:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const list = Array.isArray(employees) ? employees : [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(emp => {
      if (!emp) return false;
      const name = String(emp.name || '').toLowerCase();
      const code = String(emp.code || '').toLowerCase();
      const branch = String(emp.branch || '').toLowerCase();
      const desig = String(emp.designation || '').toLowerCase();
      return name.includes(q) || code.includes(q) || branch.includes(q) || desig.includes(q);
    });
  }, [employees, search]);

  const handleSearch = (text) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchEmployees(text.trim(), selectedBranch);
      }, 350);
    }
  };

  const handleBranchSelect = (b) => {
    const bName = getBranchName(b);
    setSelectedBranch(bName);
    if (bName === 'Select Branch') {
      setEmployees([]);
    } else {
      fetchEmployees(search, bName);
    }
  };

  const handleEmployeePress = (employee) => {
    if (mode === 'financials') {
      navigation.navigate('EmployeeFinancials', { employee, mode: 'payslips' });
    } else if (mode === 'advance') {
      navigation.navigate('EmployeeFinancials', { employee, mode: 'advance' });
    } else if (mode === 'timesheet') {
      navigation.navigate('EmployeeReportDetail', {
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.code,
        branch: employee.branch,
        employee: employee,
        fromScreen: 'EmployeeDirectory'
      });
    } else if (mode === 'leave') {
      navigation.navigate('MarkLeave', { employee });
    } else {
      navigation.navigate('EmployeeProfileDetail', { employee });
    }
  };

  const getHeaderInfo = () => {
    switch (mode) {
      case 'financials':
        return { title: 'Employee Pay Slips', subtitle: 'Select an employee to print monthly salary slips' };
      case 'advance':
        return { title: 'Advance & Loan Ledger', subtitle: 'Select an employee to view advance balance & deductions' };
      case 'timesheet':
        return { title: 'Employee Attendance Timesheet', subtitle: 'Select an employee for complete monthly attendance breakdown' };
      case 'leave':
        return { title: 'Register Official Leave', subtitle: 'Select an employee to register leave' };
      default:
        return { title: 'Employee Directory', subtitle: 'Complete Staff Directory & Records' };
    }
  };

  const headerInfo = getHeaderInfo();

  const renderEmployeeItem = ({ item }) => {
    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => handleEmployeePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.avatarPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{(item.name || 'E').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{item.name}</Text>
            <Text style={styles.empCode}>{item.code} • <Text style={styles.designationText}>{item.designation}</Text></Text>
          </View>
          <Text style={styles.branchBadge}>{item.branch}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Mobile: <Text style={styles.infoValue}>{item.mobileNo || '-'}</Text></Text>
          <Text style={styles.infoLabel}>Shift: <Text style={styles.infoValue}>{item.shift || 'General'}</Text></Text>
        </View>

        {/* Quick Contact & Action Buttons */}
        <View style={styles.contactRow}>
          {item.mobileNo ? (
            <>
              <TouchableOpacity
                style={styles.contactBtnCall}
                onPress={() => Linking.openURL(`tel:${item.mobileNo}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.contactBtnTextCall}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contactBtnWA}
                onPress={() => {
                  let num = String(item.mobileNo).replace(/[^0-9]/g, '');
                  if (num.startsWith('0')) num = '92' + num.slice(1);
                  Linking.openURL(`https://wa.me/${num}`);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.contactBtnTextWA}>💬 WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              borderWidth: 1,
              borderColor: '#10B981',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
            onPress={() => navigation.navigate('EmployeeRegistration', { employeeToEdit: item })}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 11 }}>✏️</Text>
            <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700' }}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.viewProfileBtn}
            onPress={() => handleEmployeePress(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewProfileBtnText}>View File →</Text>
          </TouchableOpacity>
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
          <Text style={styles.headerTitle}>{headerInfo.title}</Text>
          <Text style={styles.headerSubtitle}>{headerInfo.subtitle}</Text>
        </View>
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10B981',
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
          onPress={() => navigation.navigate('EmployeeRegistration')}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13 }}>📝</Text>
          <Text style={{ color: '#34D399', fontSize: 12, fontWeight: '800' }}>+ Register</Text>
        </TouchableOpacity>
      </View>

      {/* Branch Selector & Dropdown */}
      {branches.length > 1 && (
        <View style={styles.branchFilterBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={styles.branchFilterLabel}>BRANCH FILTER</Text>
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownBtnText} numberOfLines={1}>
                {getBranchName(selectedBranch) === 'Select Branch' ? '👇 Select Branch' : getBranchName(selectedBranch) === 'All Branches' ? '🌐 All Branches' : `📍 ${getBranchName(selectedBranch)}`}
              </Text>
              <Text style={styles.dropdownBtnArrow}>▼</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
            {branches.map((b, idx) => {
              const bName = getBranchName(b);
              const isSelected = getBranchName(selectedBranch) === bName;
              return (
                <TouchableOpacity 
                  key={idx}
                  style={[styles.branchPill, isSelected && styles.branchPillActive]}
                  onPress={() => handleBranchSelect(bName)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.branchPillText, isSelected && styles.branchPillTextActive]}>
                    {bName === 'Select Branch' ? '👇 Select Branch' : bName === 'All Branches' ? '🌐 All Branches' : `📍 ${bName}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by employee name or code..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={handleSearch}
        />
      </View>

      {/* List */}
      {selectedBranch === 'Select Branch' ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🏢</Text>
          <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 6 }}>Please Select a Branch</Text>
          <Text style={[styles.emptyText, { maxWidth: 300, textAlign: 'center' }]}>
            Choose a store branch or "All Branches" from the options above to view staff directory records.
          </Text>
        </View>
      ) : loading && employees.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Searching directory...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item) => item.id || item._id}
          renderItem={renderEmployeeItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No employees found matching criteria</Text>
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
              renderItem={({ item }) => {
                const bName = getBranchName(item);
                const isSelected = getBranchName(selectedBranch) === bName;
                return (
                  <TouchableOpacity 
                    style={[styles.modalItem, isSelected && styles.selectedModalItem]}
                    onPress={() => {
                      handleBranchSelect(bName);
                      setModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.selectedModalItemText]}>
                      {bName === 'Select Branch' ? '👇 Select Branch' : bName === 'All Branches' ? '🌐 All Branches' : `📍 ${bName}`}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
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
  branchFilterBar: {
    backgroundColor: '#131D33',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  branchScroll: {
    flexDirection: 'row',
  },
  branchPill: {
    backgroundColor: '#0B1120',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#131D33',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  searchInput: {
    backgroundColor: '#0B1120',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
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
    alignItems: 'center',
  },
  avatarPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  avatarText: {
    color: '#38BDF8',
    fontSize: 16,
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
  branchBadge: {
    backgroundColor: '#0B1120',
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  infoValue: {
    color: '#F1F5F9',
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  contactBtnCall: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  contactBtnTextCall: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  contactBtnWA: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  contactBtnTextWA: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  viewProfileBtn: {
    marginLeft: 'auto',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  viewProfileBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
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
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  branchFilterLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
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
