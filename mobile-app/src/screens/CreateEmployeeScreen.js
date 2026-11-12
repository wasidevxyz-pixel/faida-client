import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { api } from '../services/api';

export default function CreateEmployeeScreen({ onBack }) {
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dynamic lists from server
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);

  // Form Fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [cnic, setCnic] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('Select Branch');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDesig, setSelectedDesig] = useState('');
  
  // Shift & Salary Defaults
  const [fDutyTime, setFDutyTime] = useState('09:00 AM');
  const [tDutyTime, setTDutyTime] = useState('06:00 PM');
  const [offDay, setOffDay] = useState('Sunday');
  const [basicSalary, setBasicSalary] = useState('0');
  const [allowOvertime, setAllowOvertime] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadFormOptions = async () => {
    setError('');
    setLoadingOptions(true);
    try {
      // 1. Fetch Next Code
      const codeRes = await api.getNextEmployeeCode();
      if (codeRes && codeRes.code) {
        setCode(codeRes.code);
      }

      // 2. Fetch Departments
      const deptRes = await api.getDepartments();
      if (deptRes && Array.isArray(deptRes)) {
        setDepartments(deptRes);
        if (deptRes.length > 0) setSelectedDept(deptRes[0]._id);
      } else if (deptRes && deptRes.data) {
        setDepartments(deptRes.data);
        if (deptRes.data.length > 0) setSelectedDept(deptRes.data[0]._id);
      }

      // 3. Fetch Designations
      const desigRes = await api.getDesignations();
      if (desigRes && Array.isArray(desigRes)) {
        setDesignations(desigRes);
        if (desigRes.length > 0) setSelectedDesig(desigRes[0]._id);
      } else if (desigRes && desigRes.data) {
        setDesignations(desigRes.data);
        if (desigRes.data.length > 0) setSelectedDesig(desigRes.data[0]._id);
      }

      // 4. Fetch Branches (Stores)
      const branchRes = await api.getBranches();
      if (branchRes && branchRes.success && branchRes.data) {
        setBranches([{ name: 'Select Branch' }, ...branchRes.data]);
        setSelectedBranch('Select Branch');
      }

    } catch (err) {
      setError('Error loading dropdown lists: ' + err.message);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadFormOptions();
  }, []);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      setError('Employee Code and Full Name are required');
      return;
    }
    if (!selectedBranch || selectedBranch === 'Select Branch') {
      setError('Please select an assigned store branch');
      return;
    }

    setError('');
    setMessage('');
    setSaving(true);

    const payload = {
      code: code.trim(),
      name: name.trim(),
      fatherName: fatherName.trim(),
      cnic: cnic.trim(),
      mobileNo: mobileNo.trim(),
      branch: selectedBranch,
      department: selectedDept,
      designation: selectedDesig,
      fDutyTime: fDutyTime.trim(),
      tDutyTime: tDutyTime.trim(),
      offDay: offDay.trim(),
      basicSalary: parseFloat(basicSalary) || 0,
      allowOvertime,
      isActive: true
    };

    try {
      const res = await api.createEmployee(payload);
      if (res.success || res._id) {
        setMessage('Employee created successfully! Register fingerprint next.');
        // Reset form for next entry
        setName('');
        setFatherName('');
        setCnic('');
        setMobileNo('');
        setBasicSalary('0');
        // Reload code for next employee
        await loadFormOptions();
      } else {
        setError(res.message || 'Creation failed');
      }
    } catch (err) {
      setError(err.message || 'Server error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loadingOptions) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>Fetching form details...</Text>
      </View>
    );
  }

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
          <Text style={styles.headerTitle}>Add New Employee</Text>
          <Text style={styles.headerSubtitle}>Create employee profile & shift assignment</Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {message ? <Text style={styles.successText}>{message}</Text> : null}

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        
        {/* Step 1: Identity */}
        <Text style={styles.sectionTitle}>1. Personal Information</Text>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Employee Code (Auto-Generated)</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="e.g. EMP-101"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter full name"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Father's Name</Text>
            <TextInput
              style={styles.input}
              value={fatherName}
              onChangeText={setFatherName}
              placeholder="Enter father name"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>CNIC (National ID)</Text>
            <TextInput
              style={styles.input}
              value={cnic}
              onChangeText={setCnic}
              placeholder="e.g. 37405-1234567-8"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mobile Number</Text>
            <TextInput
              style={styles.input}
              value={mobileNo}
              onChangeText={setMobileNo}
              placeholder="e.g. 0300-1234567"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Step 2: Placement */}
        <Text style={styles.sectionTitle}>2. Branch & Job Role</Text>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Assigned Branch</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScroll}>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.name}
                  style={[styles.selectBadge, selectedBranch === b.name && styles.selectBadgeActive]}
                  onPress={() => setSelectedBranch(b.name)}
                >
                  <Text style={[styles.selectBadgeText, selectedBranch === b.name && styles.selectBadgeTextActive]}>
                    {b.name === 'Select Branch' ? '👇 Select Branch' : b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Department</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScroll}>
              {departments.map((d) => (
                <TouchableOpacity
                  key={d._id}
                  style={[styles.selectBadge, selectedDept === d._id && styles.selectBadgeActive]}
                  onPress={() => setSelectedDept(d._id)}
                >
                  <Text style={[styles.selectBadgeText, selectedDept === d._id && styles.selectBadgeTextActive]}>
                    {d.name || d.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Designation</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScroll}>
              {designations.map((d) => (
                <TouchableOpacity
                  key={d._id}
                  style={[styles.selectBadge, selectedDesig === d._id && styles.selectBadgeActive]}
                  onPress={() => setSelectedDesig(d._id)}
                >
                  <Text style={[styles.selectBadgeText, selectedDesig === d._id && styles.selectBadgeTextActive]}>
                    {d.name || d.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Step 3: Work Hours & Salary */}
        <Text style={styles.sectionTitle}>3. Schedule & Salary</Text>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duty Shift Start Time</Text>
            <TextInput
              style={styles.input}
              value={fDutyTime}
              onChangeText={setFDutyTime}
              placeholder="e.g. 09:00 AM"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Duty Shift End Time</Text>
            <TextInput
              style={styles.input}
              value={tDutyTime}
              onChangeText={setTDutyTime}
              placeholder="e.g. 06:00 PM"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Weekly Off Day</Text>
            <TextInput
              style={styles.input}
              value={offDay}
              onChangeText={setOffDay}
              placeholder="e.g. Sunday"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Basic Salary (Rs.)</Text>
            <TextInput
              style={styles.input}
              value={basicSalary}
              onChangeText={setBasicSalary}
              placeholder="0"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.switchGroup}>
            <Text style={styles.switchLabel}>Eligible for Overtime (OT)</Text>
            <Switch
              trackColor={{ false: '#334155', true: 'rgba(6, 182, 212, 0.3)' }}
              thumbColor={allowOvertime ? '#06b6d4' : '#64748b'}
              onValueChange={setAllowOvertime}
              value={allowOvertime}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>CREATE EMPLOYEE</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

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
  centerContainer: {
    flex: 1,
    backgroundColor: '#0B1120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#CBD5E1',
    marginTop: 12,
    fontSize: 14,
  },
  container: {
    padding: 16,
    paddingBottom: 90,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#06b6d4',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  formCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#f8fafc',
  },
  selectScroll: {
    flexDirection: 'row',
    marginTop: 2,
  },
  selectBadge: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  selectBadgeActive: {
    borderColor: '#06b6d4',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  selectBadgeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  selectBadgeTextActive: {
    color: '#06b6d4',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchLabel: {
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 40,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#059669',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  errorText: {
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 10,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  successText: {
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 10,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 13,
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
