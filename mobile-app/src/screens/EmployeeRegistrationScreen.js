import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView,
  Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const RELIGIONS = ['All Religions', 'Muslim', 'Christian', 'Hindu', 'Other'];
const SALARY_MODES = ['All Modes', 'Bank', 'Cash'];
const STATUSES = ['All Status', 'Active', 'Inactive'];
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
const BANKS = ['Select Bank', 'HBL', 'ALF', 'BOP', 'BIP', 'BAHL', 'MCB', 'UBL', 'MEEZAN'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FROM_TIME_PRESETS = ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];
const TO_TIME_PRESETS = ['05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM'];

// Convert any raw time value ('17', '17:00', '17:00:00', '09:00', '9:00 AM') into standard 12-hour 'hh:mm AM/PM'
const formatTime12Hour = (val) => {
  if (!val) return '09:00 PM';
  const str = String(val).trim();

  // Already 12-hour format e.g. "05:00 PM", "5:00 PM", "09:30 AM"
  const m12 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (m12) {
    const hh = String(Number(m12[1])).padStart(2, '0');
    const mm = m12[2];
    const ampm = m12[3].toUpperCase();
    return `${hh}:${mm} ${ampm}`;
  }

  // 24-hour format e.g. "17:00" or "17:00:00"
  const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    let h = Number(m24[1]);
    const mm = m24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${mm} ${ampm}`;
  }

  // Raw number e.g. "17", "9"
  if (/^\d{1,2}$/.test(str)) {
    let h = Number(str);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:00 ${ampm}`;
  }

  return str;
};

export default function EmployeeRegistrationScreen({ route = { params: {} }, navigation, onBack }) {
  // Screen Mode: 'list' (Employee Directory) or 'form' (Register / Modify)
  const [activeTab, setActiveTab] = useState('list');

  // Loading States
  const [loadingList, setLoadingList] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  // Raw Employee Data & Options
  const [allEmployees, setAllEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);

  // --- Filter States (for Directory) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('All Branches');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('All Departments');
  const [selectedDesigFilter, setSelectedDesigFilter] = useState('All Designations');
  const [selectedReligionFilter, setSelectedReligionFilter] = useState('All Religions');
  const [selectedSalaryModeFilter, setSelectedSalaryModeFilter] = useState('All Modes');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All Status');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // --- Searchable Picker Modals (Department, Designation & Branch) ---
  const [deptPickerVisible, setDeptPickerVisible] = useState(false);
  const [deptPickerSearch, setDeptPickerSearch] = useState('');
  const [deptPickerTarget, setDeptPickerTarget] = useState('form'); // 'form' or 'filter'

  const [desigPickerVisible, setDesigPickerVisible] = useState(false);
  const [desigPickerSearch, setDesigPickerSearch] = useState('');
  const [desigPickerTarget, setDesigPickerTarget] = useState('form'); // 'form' or 'filter'

  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [branchPickerSearch, setBranchPickerSearch] = useState('');
  const [branchPickerTarget, setBranchPickerTarget] = useState('form'); // 'form' or 'filter'

  // --- Form States (for Register / Modify) ---
  const [isEditing, setIsEditing] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [originalBasicSalary, setOriginalBasicSalary] = useState('');
  const [isSalaryModified, setIsSalaryModified] = useState(false);

  // Form Fields: Section 1 - Personal Info
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameUrdu, setNameUrdu] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [cnic, setCnic] = useState('');
  const [gender, setGender] = useState('Male');
  const [maritalStatus, setMaritalStatus] = useState('Single');
  const [religion, setReligion] = useState('Muslim');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Form Fields: Section 2 - Employment Info
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDesig, setSelectedDesig] = useState('');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [isActive, setIsActive] = useState(true);
  const [commEmp, setCommEmp] = useState(false);

  // Form Fields: Section 3 - Compensation & Fix Details
  const [basicSalary, setBasicSalary] = useState('');
  const [salaryType, setSalaryType] = useState('monthly');
  const [fixAllowance, setFixAllowance] = useState('0');
  const [otherAllowance, setOtherAllowance] = useState('0');
  const [stLoss, setStLoss] = useState('0');
  const [incrDate, setIncrDate] = useState(new Date().toISOString().split('T')[0]);

  // Form Fields: Section 4 - Access Controls & Entitlements (Web parity)
  const [payFullSalaryThroughBank, setPayFullSalaryThroughBank] = useState(false);
  const [allowOvertime, setAllowOvertime] = useState(true);
  const [otst30WorkingDays, setOtst30WorkingDays] = useState(true);
  const [eobi, setEobi] = useState(false);
  const [electricityBill, setElectricityBill] = useState(false);
  const [thirtyWorkingDays, setThirtyWorkingDays] = useState(false);
  const [allowEmployeeAdvance, setAllowEmployeeAdvance] = useState(true);
  const [allowRottiPerks, setAllowRottiPerks] = useState(false);
  const [dontAllowRottiPerks, setDontAllowRottiPerks] = useState(false);
  const [allowNashtaPerks, setAllowNashtaPerks] = useState(false);
  const [dontAllowNashtaPerks, setDontAllowNashtaPerks] = useState(false);

  // Form Fields: Section 5 - Bank Details
  const [bankCash, setBankCash] = useState('Cash'); // 'Bank' or 'Cash'
  const [selectBank, setSelectBank] = useState('');
  const [acNo, setAcNo] = useState('');

  // Form Fields: Section 6 - Duty Schedule (12-hour AM/PM: Default 12 Hours 09:00 AM to 09:00 PM)
  const [fDutyTime, setFDutyTime] = useState('09:00 AM');
  const [tDutyTime, setTDutyTime] = useState('09:00 PM');
  const [offDay, setOffDay] = useState('Sunday');

  // Form Fields: Section 7 - Contact & Dates
  const [mobileNo, setMobileNo] = useState('');
  const [address, setAddress] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // Form Alerts & Validation
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // --- Security Verification Modal States ---
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authUsername, setAuthUsername] = useState('bilal shah');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatusText, setAuthStatusText] = useState('');

  // --- In-App Result Modal (Success / Error) ---
  const [saveResultModal, setSaveResultModal] = useState({
    visible: false,
    type: 'success',
    title: '',
    message: '',
    details: null
  });

  // Initial Load
  useEffect(() => {
    loadDropdownOptions();
    fetchEmployeesList();
  }, []);

  // Fetch Dropdown Options (Branches, Departments, Designations)
  const loadDropdownOptions = async () => {
    setLoadingOptions(true);
    try {
      const [deptRes, desigRes, branchRes] = await Promise.all([
        api.getDepartments().catch(() => []),
        api.getDesignations().catch(() => []),
        api.getBranches().catch(() => ({ data: [] }))
      ]);

      const depts = Array.isArray(deptRes) ? deptRes : (deptRes?.data || []);
      const desigs = Array.isArray(desigRes) ? desigRes : (desigRes?.data || []);
      const brs = Array.isArray(branchRes) ? branchRes : (branchRes?.data || []);

      setDepartments(depts);
      setDesignations(desigs);
      setBranches(brs);
      // For new employee registration, branch, department & designation are left unselected so user chooses explicitly
    } catch (err) {
      console.warn('Error loading form options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  // Fetch All Employees for List
  const fetchEmployeesList = async () => {
    setLoadingList(true);
    try {
      const res = await api.getAllEmployees();
      if (res && res.success && Array.isArray(res.data)) {
        setAllEmployees(res.data);
      } else if (Array.isArray(res)) {
        setAllEmployees(res);
      } else {
        setAllEmployees([]);
      }
    } catch (err) {
      console.error('Error fetching employee list:', err);
      Alert.alert('Error', 'Unable to load employees. Please check network connection.');
    } finally {
      setLoadingList(false);
    }
  };

  // Auto-fetch Next Employee Code for New Registration
  const fetchNextCode = async () => {
    try {
      const res = await api.getNextEmployeeCode();
      if (res && res.code) {
        setCode(res.code);
      }
    } catch (e) {
      console.warn('Failed to get next code:', e);
    }
  };

  // Helper to switch to Create Mode
  const handleStartCreate = () => {
    clearForm();
    setIsEditing(false);
    setEditingEmployeeId(null);
    fetchNextCode();
    setActiveTab('form');
  };

  // Helper to accurately match Department by ID or Name and return its database _id
  const resolveDeptMatch = (empDept, availableDepts = departments) => {
    if (!empDept) return '';
    let rawId = '';
    let rawName = '';

    if (typeof empDept === 'object' && empDept !== null) {
      rawId = String(empDept._id || '').trim();
      rawName = String(empDept.name || empDept.title || '').trim();
    } else {
      const str = String(empDept).trim();
      if (/^[0-9a-fA-F]{24}$/.test(str)) {
        rawId = str;
      } else {
        rawName = str;
      }
    }

    const deptsList = availableDepts && availableDepts.length > 0 ? availableDepts : departments;

    // 1. Exact match by _id
    if (rawId && deptsList && deptsList.length > 0) {
      const found = deptsList.find(d => String(d._id) === rawId);
      if (found) return String(found._id);
    }

    // 2. Exact or case-insensitive match by name
    if (rawName && deptsList && deptsList.length > 0) {
      const normName = rawName.toLowerCase();
      const found = deptsList.find(d => String(d.name || d.title || '').trim().toLowerCase() === normName);
      if (found) return String(found._id);
    }

    // 3. Fallback: preserve valid 24-character hexadecimal ObjectId
    if (rawId && /^[0-9a-fA-F]{24}$/.test(rawId)) {
      return rawId;
    }

    return '';
  };

  // Helper to accurately match Designation by ID or Name and return its database _id
  const resolveDesigMatch = (empDesig, availableDesigs = designations) => {
    if (!empDesig) return '';
    let rawId = '';
    let rawName = '';

    if (typeof empDesig === 'object' && empDesig !== null) {
      rawId = String(empDesig._id || '').trim();
      rawName = String(empDesig.name || empDesig.title || '').trim();
    } else {
      const str = String(empDesig).trim();
      if (/^[0-9a-fA-F]{24}$/.test(str)) {
        rawId = str;
      } else {
        rawName = str;
      }
    }

    const desigsList = availableDesigs && availableDesigs.length > 0 ? availableDesigs : designations;

    // 1. Exact match by _id
    if (rawId && desigsList && desigsList.length > 0) {
      const found = desigsList.find(des => String(des._id) === rawId);
      if (found) return String(found._id);
    }

    // 2. Exact or case-insensitive match by name
    if (rawName && desigsList && desigsList.length > 0) {
      const normName = rawName.toLowerCase();
      const found = desigsList.find(des => String(des.name || des.title || '').trim().toLowerCase() === normName);
      if (found) return String(found._id);
    }

    // 3. Fallback: preserve valid 24-character hexadecimal ObjectId
    if (rawId && /^[0-9a-fA-F]{24}$/.test(rawId)) {
      return rawId;
    }

    return '';
  };

  // Populate form fields from employee data object
  const populateFormValues = (emp) => {
    // Section 1
    setCode(emp.code || '');
    setName(emp.name || '');
    setNameUrdu(emp.name_urdu || '');
    setFatherName(emp.fatherName || '');
    setCnic(emp.cnic || '');
    setGender(emp.gender || 'Male');
    setMaritalStatus(emp.maritalStatus || 'Single');
    setReligion(emp.religion || 'Muslim');
    setDateOfBirth(emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '');
    setPhoto(emp.photo || emp.facePhotoUrl || null);

    // Section 2: Branch, Department, Designation
    const bName = typeof emp.branch === 'object' ? emp.branch?.name : emp.branch;
    setSelectedBranch(bName || (branches[0]?.name || ''));

    const matchedDeptId = resolveDeptMatch(emp.department);
    if (matchedDeptId) setSelectedDept(matchedDeptId);
    else if (emp.department) setSelectedDept(typeof emp.department === 'object' ? String(emp.department._id || emp.department.name || emp.department.title || '') : String(emp.department));

    const matchedDesigId = resolveDesigMatch(emp.designation);
    if (matchedDesigId) setSelectedDesig(matchedDesigId);
    else if (emp.designation) setSelectedDesig(typeof emp.designation === 'object' ? String(emp.designation._id || emp.designation.name || emp.designation.title || '') : String(emp.designation));

    setJoiningDate(emp.joiningDate ? emp.joiningDate.split('T')[0] : '');
    setIsActive(emp.isActive !== false);
    setCommEmp(Boolean(emp.commEmp));

    // Section 3: Salary & Increment
    const salStr = String(emp.basicSalary ?? '');
    setBasicSalary(salStr);
    setOriginalBasicSalary(salStr);
    setIsSalaryModified(false);
    setSalaryType(emp.salaryType || 'monthly');
    setFixAllowance(String(emp.fixAllowance ?? '0'));
    setOtherAllowance(String(emp.otherAllowance ?? '0'));
    setStLoss(String(emp.stLoss ?? '0'));
    setIncrDate(emp.incrDate ? emp.incrDate.split('T')[0] : new Date().toISOString().split('T')[0]);

    // Section 4: Access Controls (Web Parity)
    setPayFullSalaryThroughBank(Boolean(emp.payFullSalaryThroughBank));
    setAllowOvertime(Boolean(emp.allowOvertime));
    setOtst30WorkingDays(Boolean(emp.otst30WorkingDays));
    setEobi(Boolean(emp.eobi));
    setElectricityBill(Boolean(emp.electricityBill));
    setThirtyWorkingDays(Boolean(emp.thirtyWorkingDays));
    setAllowEmployeeAdvance(Boolean(emp.allowEmployeeAdvance));
    setAllowRottiPerks(Boolean(emp.allowRottiPerks));
    setDontAllowRottiPerks(Boolean(emp.dontAllowRottiPerks));
    setAllowNashtaPerks(Boolean(emp.allowNashtaPerks));
    setDontAllowNashtaPerks(Boolean(emp.dontAllowNashtaPerks));

    // Section 5: Bank Details
    setBankCash(emp.bankCash === 'Bank' || emp.selectBank ? 'Bank' : 'Cash');
    setSelectBank(emp.selectBank || '');
    setAcNo(emp.acNo || '');

    // Section 6: Duty Schedule (12-hour AM/PM format)
    setFDutyTime(formatTime12Hour(emp.fDutyTime || '09:00 AM'));
    setTDutyTime(formatTime12Hour(emp.tDutyTime || '06:00 PM'));
    setOffDay(emp.offDay || 'Sunday');

    // Section 7: Contact & Identity Dates
    setMobileNo(emp.mobileNo || '');
    setAddress(emp.address || '');
    setIssueDate(emp.issueDate ? emp.issueDate.split('T')[0] : '');
    setExpiryDate(emp.expiryDate ? emp.expiryDate.split('T')[0] : '');
  };

  // Helper to switch to Edit Mode with Selected Employee
  const handleStartEdit = async (emp) => {
    setIsEditing(true);
    const empId = emp._id || emp.id;
    setEditingEmployeeId(empId);
    setFormError('');
    setFormSuccess('');
    setActiveTab('form');

    // 1. Initial instant population from the passed employee item (avoids blank/reset delay)
    populateFormValues(emp);

    // 2. Fetch full, fresh record directly from the server with cache-busting
    try {
      const fullRes = await api.getEmployeeById(empId);
      if (fullRes && fullRes.success && fullRes.data) {
        populateFormValues(fullRes.data);
      }
    } catch (e) {
      console.warn('Using list employee data for edit:', e);
    }
  };

  // Route Params Listener: if navigated with employeeToEdit or branch filter
  useEffect(() => {
    const params = route?.params;
    if (params?.employeeToEdit) {
      handleStartEdit(params.employeeToEdit);
    } else if (params?.branch) {
      setSelectedBranchFilter(params.branch);
    }
  }, [route?.params]);
 
  // When departments load/update from server, ensure selectedDept resolves to exact database _id
  useEffect(() => {
    if (selectedDept && departments && departments.length > 0) {
      const resolved = resolveDeptMatch(selectedDept, departments);
      if (resolved && resolved !== selectedDept) {
        setSelectedDept(resolved);
      }
    }
  }, [departments]);

  // When designations load/update from server, ensure selectedDesig resolves to exact database _id
  useEffect(() => {
    if (selectedDesig && designations && designations.length > 0) {
      const resolved = resolveDesigMatch(selectedDesig, designations);
      if (resolved && resolved !== selectedDesig) {
        setSelectedDesig(resolved);
      }
    }
  }, [designations]);

  // Clear Form Fields
  const clearForm = () => {
    setCode('');
    setName('');
    setNameUrdu('');
    setFatherName('');
    setCnic('');
    setGender('Male');
    setMaritalStatus('Single');
    setReligion('Muslim');
    setDateOfBirth('');
    setSelectedBranch('');
    setSelectedDept('');
    setSelectedDesig('');
    setJoiningDate(new Date().toISOString().split('T')[0]);
    setIsActive(true);
    setCommEmp(false);
    setBasicSalary('');
    setOriginalBasicSalary('');
    setIsSalaryModified(false);
    setSalaryType('monthly');
    setFixAllowance('0');
    setOtherAllowance('0');
    setStLoss('0');
    setIncrDate(new Date().toISOString().split('T')[0]);
    setPayFullSalaryThroughBank(false);
    setAllowOvertime(true);
    setOtst30WorkingDays(true);
    setEobi(false);
    setElectricityBill(false);
    setThirtyWorkingDays(false);
    setAllowEmployeeAdvance(true);
    setAllowRottiPerks(false);
    setDontAllowRottiPerks(false);
    setAllowNashtaPerks(false);
    setDontAllowNashtaPerks(false);
    setBankCash('Cash');
    setSelectBank('');
    setAcNo('');
    setFDutyTime('09:00 AM');
    setTDutyTime('09:00 PM');
    setOffDay('Sunday');
    setMobileNo('');
    setAddress('');
    setIssueDate('');
    setPhoto(null);
    setPhotoModalVisible(false);
    setFormError('');
    setFormSuccess('');
  };

  // Helper to ensure valid URI format for local/remote/base64 employee photos
  const getPhotoUri = (photoVal) => {
    if (!photoVal) return null;
    const str = String(photoVal).trim();
    if (str.startsWith('data:') || str.startsWith('http://') || str.startsWith('https://') || str.startsWith('file://')) {
      return str;
    }
    if (str.length > 50 && !str.includes(' ') && !str.includes('\n')) {
      return `data:image/jpeg;base64,${str}`;
    }
    return str;
  };

  // Pick Image from Gallery
  const pickFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your device photo gallery to set employee profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/jpeg';
        const photoData = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        setPhoto(photoData);
        setPhotoModalVisible(false);
      }
    } catch (err) {
      console.error('Failed to pick photo from gallery:', err);
      Alert.alert('Error', 'Failed to pick photo from gallery.');
    }
  };

  // Capture Image using Device Camera
  const takeFromCamera = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow camera access to take an employee profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/jpeg';
        const photoData = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        setPhoto(photoData);
        setPhotoModalVisible(false);
      }
    } catch (err) {
      console.error('Failed to take photo with camera:', err);
      Alert.alert('Error', 'Failed to take photo with camera.');
    }
  };

  // Remove Employee Profile Picture
  const handleRemovePhoto = () => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this employee profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPhoto('');
            setPhotoModalVisible(false);
          }
        }
      ]
    );
  };

  // Salary Modification Auto Increment Date Detection
  const handleSalaryChange = (newVal) => {
    setBasicSalary(newVal);
    if (isEditing && originalBasicSalary !== '' && String(newVal).trim() !== String(originalBasicSalary).trim()) {
      setIsSalaryModified(true);
      setIncrDate(new Date().toISOString().split('T')[0]);
    } else if (isEditing && String(newVal).trim() === String(originalBasicSalary).trim()) {
      setIsSalaryModified(false);
    }
  };

  // Calculate duty duration
  const dutyHoursText = useMemo(() => {
    try {
      const parseTime12 = (str) => {
        if (!str) return null;
        const norm = formatTime12Hour(str);
        const match = norm.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;
        let hours = Number(match[1]);
        const minutes = Number(match[2]);
        const modifier = match[3].toUpperCase();
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      const fromMin = parseTime12(fDutyTime);
      const toMin = parseTime12(tDutyTime);
      if (fromMin !== null && toMin !== null) {
        let diff = toMin - fromMin;
        if (diff < 0) diff += 24 * 60;
        const hrs = (diff / 60).toFixed(1);
        return `${hrs} hrs`;
      }
    } catch {}
    return '12.0 hrs';
  }, [fDutyTime, tDutyTime]);

  // --- Real-time Filtered Lists for Searchable Picker Modals ---
  const pickerFilteredDepts = useMemo(() => {
    if (!deptPickerSearch.trim()) return departments;
    const q = deptPickerSearch.trim().toLowerCase();
    return departments.filter(d => (d.name || d.title || '').toLowerCase().includes(q));
  }, [departments, deptPickerSearch]);

  const pickerFilteredDesigs = useMemo(() => {
    if (!desigPickerSearch.trim()) return designations;
    const q = desigPickerSearch.trim().toLowerCase();
    return designations.filter(des => (des.name || des.title || '').toLowerCase().includes(q));
  }, [designations, desigPickerSearch]);

  const pickerFilteredBranches = useMemo(() => {
    if (!branchPickerSearch.trim()) return branches;
    const q = branchPickerSearch.trim().toLowerCase();
    return branches.filter(b => (b.name || '').toLowerCase().includes(q));
  }, [branches, branchPickerSearch]);

  // --- Filtering & Searching Logic ---
  const filteredEmployees = useMemo(() => {
    let list = [...allEmployees];

    // 1. Text Search (Name, Code, CNIC, Mobile)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(emp => {
        const nameMatch = (emp.name || '').toLowerCase().includes(q);
        const codeMatch = String(emp.code || '').toLowerCase().includes(q);
        const cnicMatch = (emp.cnic || '').toLowerCase().includes(q);
        const mobileMatch = (emp.mobileNo || '').includes(q);
        const desigMatch = (typeof emp.designation === 'object' ? emp.designation?.name : emp.designation || '').toLowerCase().includes(q);
        return nameMatch || codeMatch || cnicMatch || mobileMatch || desigMatch;
      });
    }

    // 2. Branch Filter
    if (selectedBranchFilter !== 'All Branches') {
      list = list.filter(emp => {
        const b = typeof emp.branch === 'object' ? emp.branch?.name : emp.branch;
        return b === selectedBranchFilter;
      });
    }

    // 3. Department Filter (Resilient match by _id, name, or resolved name)
    if (selectedDeptFilter !== 'All Departments') {
      const targetDeptName = getDeptName(selectedDeptFilter).toLowerCase();
      const targetDeptId = String(selectedDeptFilter).toLowerCase();
      list = list.filter(emp => {
        const dId = String(typeof emp.department === 'object' ? (emp.department?._id || '') : (emp.department || '')).toLowerCase();
        const dName = String(typeof emp.department === 'object' ? (emp.department?.name || emp.department?.title || '') : '').toLowerCase();
        const resolvedName = getDeptName(emp.department).toLowerCase();
        return (
          dId === targetDeptId ||
          (dName && dName === targetDeptName) ||
          (dName && dName === targetDeptId) ||
          (resolvedName && resolvedName !== '-' && resolvedName === targetDeptName) ||
          (resolvedName && resolvedName !== '-' && resolvedName === targetDeptId)
        );
      });
    }

    // 4. Designation Filter (Resilient match by _id, name, or resolved name)
    if (selectedDesigFilter !== 'All Designations') {
      const targetDesigName = getDesigName(selectedDesigFilter).toLowerCase();
      const targetDesigId = String(selectedDesigFilter).toLowerCase();
      list = list.filter(emp => {
        const desId = String(typeof emp.designation === 'object' ? (emp.designation?._id || '') : (emp.designation || '')).toLowerCase();
        const desName = String(typeof emp.designation === 'object' ? (emp.designation?.name || emp.designation?.title || '') : '').toLowerCase();
        const resolvedName = getDesigName(emp.designation).toLowerCase();
        return (
          desId === targetDesigId ||
          (desName && desName === targetDesigName) ||
          (desName && desName === targetDesigId) ||
          (resolvedName && resolvedName !== '-' && resolvedName === targetDesigName) ||
          (resolvedName && resolvedName !== '-' && resolvedName === targetDesigId)
        );
      });
    }

    // 5. Religion Filter
    if (selectedReligionFilter !== 'All Religions') {
      list = list.filter(emp => {
        const r = emp.religion || 'Muslim';
        return r.toLowerCase() === selectedReligionFilter.toLowerCase();
      });
    }

    // 6. Salary Mode Filter (Bank vs Cash)
    if (selectedSalaryModeFilter !== 'All Modes') {
      list = list.filter(emp => {
        const isBank = emp.bankCash === 'Bank' || Boolean(emp.payFullSalaryThroughBank) || Boolean(emp.selectBank);
        return selectedSalaryModeFilter === 'Bank' ? isBank : !isBank;
      });
    }

    // 7. Status Filter (Active vs Inactive)
    if (selectedStatusFilter !== 'All Status') {
      const wantActive = selectedStatusFilter === 'Active';
      list = list.filter(emp => (emp.isActive !== false) === wantActive);
    }

    return list;
  }, [
    allEmployees,
    searchQuery,
    selectedBranchFilter,
    selectedDeptFilter,
    selectedDesigFilter,
    selectedReligionFilter,
    selectedSalaryModeFilter,
    selectedStatusFilter
  ]);

  // Aggregate Metrics for Directory KPIs
  const directoryMetrics = useMemo(() => {
    let total = allEmployees.length;
    let active = 0;
    let bankCount = 0;
    let cashCount = 0;

    allEmployees.forEach(e => {
      if (e.isActive !== false) active++;
      const isBank = e.bankCash === 'Bank' || Boolean(e.payFullSalaryThroughBank) || Boolean(e.selectBank);
      if (isBank) bankCount++;
      else cashCount++;
    });

    return { total, active, bankCount, cashCount };
  }, [allEmployees]);

  // Build Payload from Form Fields
  const buildPayload = () => {
    return {
      code: code.trim(),
      name: name.trim(),
      name_urdu: nameUrdu.trim(),
      fatherName: fatherName.trim(),
      cnic: cnic.trim(),
      photo: photo !== null ? photo : '',
      branch: selectedBranch,
      department: (resolveDeptMatch(selectedDept) || selectedDept) || null,
      designation: (resolveDesigMatch(selectedDesig) || selectedDesig) || null,
      address: address.trim(),
      acNo: acNo.trim(),
      selectBank: selectBank.trim(),
      mobileNo: mobileNo.trim(),
      dateOfBirth: dateOfBirth || null,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      joiningDate: joiningDate || null,
      incrDate: incrDate || null,
      gender,
      religion,
      maritalStatus,
      isActive,
      commEmp,
      basicSalary: parseFloat(basicSalary) || 0,
      salaryType,
      fixAllowance: parseFloat(fixAllowance) || 0,
      otherAllowance: parseFloat(otherAllowance) || 0,
      stLoss: parseFloat(stLoss) || 0,
      bankCash: bankCash === 'Bank' ? 'Bank' : 'Cash',
      payFullSalaryThroughBank,
      allowOvertime,
      otst30WorkingDays,
      eobi,
      electricityBill,
      thirtyWorkingDays,
      allowEmployeeAdvance,
      allowRottiPerks,
      dontAllowRottiPerks,
      allowNashtaPerks,
      dontAllowNashtaPerks,
      fDutyTime: formatTime12Hour(fDutyTime),
      tDutyTime: formatTime12Hour(tDutyTime),
      offDay
    };
  };

  // Submit Handler: Triggers validation and routing (New vs Modify)
  const handleFormSubmit = () => {
    setFormError('');
    setFormSuccess('');

    // Validations
    if (!code.trim() || !name.trim()) {
      setFormError('Employee Code and Full Name are strictly required.');
      return;
    }
    if (!selectedBranch || selectedBranch === 'Select Branch' || selectedBranch === 'Choose Branch') {
      setFormError('Please choose an assigned Branch (Store).');
      return;
    }
    if (!selectedDept || selectedDept === 'Choose Department') {
      setFormError('Please choose a Department.');
      return;
    }
    if (!selectedDesig || selectedDesig === 'Choose Designation') {
      setFormError('Please choose a Designation.');
      return;
    }
    if (bankCash === 'Bank' && !acNo.trim()) {
      setFormError('Please provide an Account Number when Salary Mode is set to Bank.');
      return;
    }

    if (isEditing) {
      // Modifying Employee: Open Security Verification Modal
      setAuthError('');
      setAuthPassword('');
      setAuthStatusText('');
      setAuthModalVisible(true);
    } else {
      // Creating New Employee: Proceed directly
      executeCreateEmployee();
    }
  };

  // Execute Creation (POST)
  const executeCreateEmployee = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await api.createEmployee(payload);
      if (res && (res.success || res.data)) {
        setSaveResultModal({
          visible: true,
          type: 'success',
          title: 'Employee Registered Successfully!',
          message: `Employee ${name} (${code}) has been created in the database.`,
          details: `Assigned Store: ${selectedBranch}`
        });
        clearForm();
        fetchEmployeesList();
      } else {
        setFormError(res?.message || 'Error registering employee.');
      }
    } catch (e) {
      setFormError(e.message || 'Error saving employee');
    } finally {
      setSaving(false);
    }
  };

  // Execute Modification (PUT) after Bilal Shah Authorization
  const handleAuthorizeAndSave = async () => {
    setAuthError('');
    if (!authUsername.trim() || !authPassword) {
      setAuthError('Please enter both username and password.');
      return;
    }

    setAuthLoading(true);
    setAuthStatusText('🔐 Verifying Bilal Shah authorization...');

    try {
      // 1. Authenticate against server
      const authRes = await api.verifyAdminCredentials(authUsername.trim(), authPassword);

      if (!authRes || !authRes.success) {
        setAuthError(authRes?.message || 'Invalid credentials. Authorization failed.');
        setAuthLoading(false);
        setAuthStatusText('');
        return;
      }

      // 2. Strict User Check: Must be "bilal shah"
      const returnedEmail = (authRes.email || authRes.code || authRes.username || '').toLowerCase().trim();
      const returnedName = (authRes.name || '').toLowerCase().trim();
      const typedUser = authUsername.toLowerCase().trim();

      const isBilalShah =
        typedUser === 'bilal shah' ||
        typedUser === 'bilal' ||
        returnedEmail === 'bilal shah' ||
        returnedName.includes('bilal');

      if (!isBilalShah) {
        setAuthError('⛔ ACCESS DENIED: Only Bilal Shah is authorized to modify employee data in the mobile app.');
        setAuthLoading(false);
        setAuthStatusText('');
        return;
      }

      // 3. User is Bilal Shah: Execute Update
      setAuthStatusText('💾 Saving changes to database & web app...');
      const payload = buildPayload();
      const updateRes = await api.updateEmployee(editingEmployeeId, payload);

      if (updateRes && (updateRes.success || updateRes.data)) {
        setAuthModalVisible(false);
        setAuthLoading(false);
        setAuthPassword('');
        setAuthStatusText('');

        // Show dedicated custom Success Modal with full details & confirmation
        setSaveResultModal({
          visible: true,
          type: 'success',
          title: 'Employee Updated Successfully!',
          message: `Employee ${name} (${code}) has been saved in the database and synchronized to the web ERP.`,
          details: isSalaryModified ? `⚡ Increment Date was automatically updated to Today (${incrDate}).` : null
        });

        fetchEmployeesList();
      } else {
        setAuthLoading(false);
        setAuthStatusText('');
        setAuthError(updateRes?.message || 'Failed to update employee in database.');
      }
    } catch (err) {
      setAuthLoading(false);
      setAuthStatusText('');
      setAuthError(err.message || 'Authorization failed. Please check network and try again.');
    }
  };

  // Helper for Department Name display
  const getDeptName = (dept) => {
    if (!dept) return '-';
    if (typeof dept === 'object' && (dept.name || dept.title)) return String(dept.name || dept.title);
    const val = String(typeof dept === 'object' ? (dept._id || '') : dept).trim();
    if (!val || val === 'All Departments') return 'All Departments';

    const foundById = departments.find(d => String(d._id) === val);
    if (foundById) return foundById.name || foundById.title;

    const foundByName = departments.find(d => String(d.name || d.title || '').trim().toLowerCase() === val.toLowerCase());
    if (foundByName) return foundByName.name || foundByName.title;

    if (!/^[0-9a-fA-F]{24}$/.test(val)) return val;
    return departments.length > 0 ? '-' : 'Loading...';
  };

  // Helper for Designation Name display
  const getDesigName = (desig) => {
    if (!desig) return '-';
    if (typeof desig === 'object' && (desig.name || desig.title)) return String(desig.name || desig.title);
    const val = String(typeof desig === 'object' ? (desig._id || '') : desig).trim();
    if (!val || val === 'All Designations') return 'All Designations';

    const foundById = designations.find(d => String(d._id) === val);
    if (foundById) return foundById.name || foundById.title;

    const foundByName = designations.find(d => String(d.name || d.title || '').trim().toLowerCase() === val.toLowerCase());
    if (foundByName) return foundByName.name || foundByName.title;

    if (!/^[0-9a-fA-F]{24}$/.test(val)) return val;
    return designations.length > 0 ? '-' : 'Loading...';
  };

  // Render Individual Employee Card in Directory Mode
  const renderEmployeeCard = ({ item }) => {
    const isBank = item.bankCash === 'Bank' || Boolean(item.payFullSalaryThroughBank) || Boolean(item.selectBank);
    const branchName = typeof item.branch === 'object' ? item.branch?.name : item.branch;

    return (
      <View style={styles.card}>
        {/* Card Header: Avatar, Name, Code, Status */}
        <View style={styles.cardHeader}>
          {item.photo || item.facePhotoUrl ? (
            <Image
              source={{ uri: getPhotoUri(item.photo || item.facePhotoUrl) }}
              style={styles.avatarImg}
            />
          ) : (
            <View style={[styles.avatarBox, { backgroundColor: isBank ? '#3b82f6' : '#10b981' }]}>
              <Text style={styles.avatarLetter}>{(item.name || 'E').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.cardTitleBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.empName}>{item.name}</Text>
              <Text style={styles.empCodeBadge}>#{item.code}</Text>
            </View>
            {item.name_urdu ? (
              <Text style={styles.empUrdu}>{item.name_urdu}</Text>
            ) : null}
            {item.fatherName ? (
              <Text style={styles.empSub}>S/O {item.fatherName}</Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, item.isActive !== false ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, item.isActive !== false ? styles.statusTextActive : styles.statusTextInactive]}>
              {item.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>

        {/* Chips Row: Branch, Dept, Desig, Religion */}
        <View style={styles.chipsRow}>
          <View style={[styles.chip, styles.chipBranch]}>
            <Ionicons name="business-outline" size={12} color="#0284c7" />
            <Text style={styles.chipTextBranch} numberOfLines={1}>{branchName || 'No Branch'}</Text>
          </View>
          <View style={[styles.chip, styles.chipDept]}>
            <Ionicons name="layers-outline" size={12} color="#7c3aed" />
            <Text style={styles.chipTextDept} numberOfLines={1}>{getDeptName(item.department)}</Text>
          </View>
          <View style={[styles.chip, styles.chipDesig]}>
            <Ionicons name="ribbon-outline" size={12} color="#059669" />
            <Text style={styles.chipTextDesig} numberOfLines={1}>{getDesigName(item.designation)}</Text>
          </View>
          {item.religion ? (
            <View style={[styles.chip, styles.chipReligion]}>
              <Text style={styles.chipTextReligion}>{item.religion}</Text>
            </View>
          ) : null}
        </View>

        {/* Badges for Access Controls & Lock */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: 12, marginBottom: 8 }}>
          {item.payFullSalaryThroughBank ? (
            <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3b82f6', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="card" size={11} color="#38bdf8" />
              <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: '800' }}>🏦 FULL BANK SALARY</Text>
            </View>
          ) : null}
          {item.fixAllowance > 0 ? (
            <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="lock-closed" size={11} color="#fbbf24" />
              <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '800' }}>🔒 FIX: Rs. {Number(item.fixAllowance).toLocaleString()}</Text>
            </View>
          ) : null}
          {item.eobi ? (
            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: '#34d399', fontSize: 10, fontWeight: '800' }}>EOBI</Text>
            </View>
          ) : null}
          {item.allowOvertime ? (
            <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: '#8b5cf6', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: '#c084fc', fontSize: 10, fontWeight: '800' }}>OVERTIME</Text>
            </View>
          ) : null}
        </View>

        {/* Financial & Timing Row */}
        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>BASIC SALARY</Text>
            <View style={styles.salaryValueRow}>
              <Text style={styles.salaryText}>Rs. {Number(item.basicSalary || 0).toLocaleString()}</Text>
              <View style={[styles.modePill, isBank ? styles.modeBank : styles.modeCash]}>
                <Ionicons name={isBank ? 'card-outline' : 'cash-outline'} size={11} color={isBank ? '#2563eb' : '#d97706'} />
                <Text style={[styles.modeText, isBank ? styles.modeTextBank : styles.modeTextCash]}>
                  {isBank ? (item.selectBank || 'BANK') : 'CASH'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.infoColRight}>
            <Text style={styles.infoLabel}>DUTY TIMING (12-HR)</Text>
            <Text style={styles.infoValue}>
              🕒 {formatTime12Hour(item.fDutyTime || '09:00 AM')} - {formatTime12Hour(item.tDutyTime || '06:00 PM')}
            </Text>
          </View>
        </View>

        {/* Card Footer Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionEditBtn}
            onPress={() => handleStartEdit(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={16} color="#ffffff" />
            <Text style={styles.actionEditText}>Edit & Modify</Text>
          </TouchableOpacity>

          {item.mobileNo ? (
            <TouchableOpacity
              style={styles.actionCallBtn}
              onPress={() => Linking.openURL(`tel:${item.mobileNo}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={15} color="#0284c7" />
              <Text style={styles.actionCallText}>{item.mobileNo}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Header - with Camera Cutout Margin */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => (onBack ? onBack() : navigation?.goBack())}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerMainTitle}>Employee Hub</Text>
          <Text style={styles.headerSubTitle}>bas.dwatson.co • ERP Mobile</Text>
        </View>
        <TouchableOpacity
          style={styles.headerAddBtn}
          onPress={handleStartCreate}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Navigation Segment Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          onPress={() => setActiveTab('list')}
          activeOpacity={0.8}
        >
          <Ionicons name="people" size={17} color={activeTab === 'list' ? '#38bdf8' : '#94a3b8'} />
          <Text style={[styles.tabBtnText, activeTab === 'list' && styles.tabBtnTextActive]}>
            Directory ({filteredEmployees.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'form' && styles.tabBtnActive]}
          onPress={() => setActiveTab('form')}
          activeOpacity={0.8}
        >
          <Ionicons name="create" size={17} color={activeTab === 'form' ? '#38bdf8' : '#94a3b8'} />
          <Text style={[styles.tabBtnText, activeTab === 'form' && styles.tabBtnTextActive]}>
            {isEditing ? 'Modify Employee' : 'Registration Form'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: EMPLOYEE DIRECTORY & LIST */}
      {activeTab === 'list' && (
        <View style={styles.tabContent}>
          {/* KPI Dashboard Metrics Cards */}
          <View style={styles.kpiContainer}>
            <View style={[styles.kpiCard, { borderLeftColor: '#38bdf8' }]}>
              <Text style={styles.kpiValue}>{directoryMetrics.total}</Text>
              <Text style={styles.kpiLabel}>TOTAL STAFF</Text>
            </View>
            <View style={[styles.kpiCard, { borderLeftColor: '#10b981' }]}>
              <Text style={[styles.kpiValue, { color: '#10b981' }]}>{directoryMetrics.active}</Text>
              <Text style={styles.kpiLabel}>ACTIVE</Text>
            </View>
            <View style={[styles.kpiCard, { borderLeftColor: '#6366f1' }]}>
              <Text style={[styles.kpiValue, { color: '#6366f1' }]}>{directoryMetrics.bankCount}</Text>
              <Text style={styles.kpiLabel}>BANK PAY</Text>
            </View>
            <View style={[styles.kpiCard, { borderLeftColor: '#f59e0b' }]}>
              <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>{directoryMetrics.cashCount}</Text>
              <Text style={styles.kpiLabel}>CASH PAY</Text>
            </View>
          </View>

          {/* Search Bar & Multi-Filter Trigger */}
          <View style={styles.searchBarRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search name, code, CNIC, mobile..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.filterButton,
                (selectedBranchFilter !== 'All Branches' ||
                  selectedDeptFilter !== 'All Departments' ||
                  selectedDesigFilter !== 'All Designations' ||
                  selectedReligionFilter !== 'All Religions' ||
                  selectedSalaryModeFilter !== 'All Modes' ||
                  selectedStatusFilter !== 'All Status') && styles.filterButtonActive
              ]}
              onPress={() => setFilterModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Active Filter Chips Bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFilterChipsScroll}>
            {selectedBranchFilter !== 'All Branches' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Branch: {selectedBranchFilter}</Text>
                <TouchableOpacity onPress={() => setSelectedBranchFilter('All Branches')}>
                  <Ionicons name="close" size={14} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            )}
            {selectedDeptFilter !== 'All Departments' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Dept: {getDeptName(selectedDeptFilter)}</Text>
                <TouchableOpacity onPress={() => setSelectedDeptFilter('All Departments')}>
                  <Ionicons name="close" size={14} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            )}
            {selectedDesigFilter !== 'All Designations' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Desig: {getDesigName(selectedDesigFilter)}</Text>
                <TouchableOpacity onPress={() => setSelectedDesigFilter('All Designations')}>
                  <Ionicons name="close" size={14} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            )}
            {selectedSalaryModeFilter !== 'All Modes' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Mode: {selectedSalaryModeFilter}</Text>
                <TouchableOpacity onPress={() => setSelectedSalaryModeFilter('All Modes')}>
                  <Ionicons name="close" size={14} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            )}
            {selectedStatusFilter !== 'All Status' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Status: {selectedStatusFilter}</Text>
                <TouchableOpacity onPress={() => setSelectedStatusFilter('All Status')}>
                  <Ionicons name="close" size={14} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Employees List */}
          {loadingList ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Loading employees...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredEmployees}
              keyExtractor={(item) => item._id || item.code || String(Math.random())}
              renderItem={renderEmployeeCard}
              contentContainerStyle={styles.listContent}
              refreshing={loadingList}
              onRefresh={fetchEmployeesList}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Ionicons name="people-outline" size={48} color="#475569" />
                  <Text style={styles.emptyTitle}>No Employees Found</Text>
                  <Text style={styles.emptySub}>Try adjusting search criteria or filter options.</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* TAB 2: EMPLOYEE REGISTRATION / EDIT FORM */}
      {activeTab === 'form' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formScrollContent}>
            {/* Form Top Title */}
            <View style={styles.formBanner}>
              <View>
                <Text style={styles.formBannerTitle}>
                  {isEditing ? `Modify: ${name || code}` : 'New Employee Registration'}
                </Text>
                <Text style={styles.formBannerSub}>
                  {isEditing ? 'Edit full employee details with Bilal Shah verification' : 'Add a new staff member to the organization'}
                </Text>
              </View>
              {isEditing && (
                <TouchableOpacity style={styles.cancelEditBtn} onPress={handleStartCreate}>
                  <Ionicons name="add" size={14} color="#ffffff" />
                  <Text style={styles.cancelEditText}>New Entry</Text>
                </TouchableOpacity>
              )}
            </View>

            {formError ? (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                <Text style={styles.errorAlertText}>{formError}</Text>
              </View>
            ) : null}

            {formSuccess ? (
              <View style={styles.successAlert}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                <Text style={styles.successAlertText}>{formSuccess}</Text>
              </View>
            ) : null}

            {/* SECTION 1: PERSONAL PROFILE */}
            <View style={[styles.sectionCard, { borderTopColor: '#38bdf8' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="person" size={18} color="#38bdf8" />
                <Text style={styles.sectionHeading}>1. Personal Profile</Text>
                {isEditing && (
                  <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '800' }}>🔒 CODE LOCKED</Text>
                  </View>
                )}
              </View>

              {/* Profile Photo Uploader & Preview Box */}
              <View style={styles.photoContainer}>
                <TouchableOpacity
                  style={styles.photoAvatarWrapper}
                  onPress={() => setPhotoModalVisible(true)}
                  activeOpacity={0.8}
                >
                  {photo ? (
                    <Image
                      source={{ uri: getPhotoUri(photo) }}
                      style={styles.photoAvatar}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="person" size={38} color="#94a3b8" />
                    </View>
                  )}
                  <View style={styles.photoCameraBadge}>
                    <Ionicons name="camera" size={13} color="#ffffff" />
                  </View>
                </TouchableOpacity>

                <View style={styles.photoActionDetails}>
                  <Text style={styles.photoTitle}>Employee Profile Photo</Text>
                  <Text style={styles.photoSubtitle}>
                    {photo ? 'Photo uploaded • Tap to view or change' : 'No photo uploaded • Camera or Gallery'}
                  </Text>
                  <View style={styles.photoBtnRow}>
                    <TouchableOpacity
                      style={styles.photoActionBtn}
                      onPress={() => setPhotoModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={photo ? 'sync-outline' : 'camera-outline'} size={14} color="#38bdf8" />
                      <Text style={styles.photoActionBtnText}>{photo ? 'Change Photo' : 'Upload Photo'}</Text>
                    </TouchableOpacity>
                    {photo ? (
                      <TouchableOpacity
                        style={[styles.photoActionBtn, styles.photoActionBtnDanger]}
                        onPress={handleRemovePhoto}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        <Text style={[styles.photoActionBtnText, { color: '#ef4444' }]}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Employee Code *</Text>
                  <TextInput
                    style={[styles.textInput, isEditing && styles.textInputDisabled]}
                    value={code}
                    onChangeText={setCode}
                    placeholder="e.g. 1001"
                    placeholderTextColor="#64748b"
                    editable={!isEditing}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Full Name (English) *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Muhammad Ali"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Name (Urdu)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={nameUrdu}
                    onChangeText={setNameUrdu}
                    placeholder="نام اردو میں"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Father's Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={fatherName}
                    onChangeText={setFatherName}
                    placeholder="Father Name"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>CNIC (National ID)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={cnic}
                    onChangeText={setCnic}
                    placeholder="37405-XXXXXXX-X"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Date of Birth (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dateOfBirth}
                    onChangeText={setDateOfBirth}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              {/* Gender, Marital Status, Religion Pill Selectors */}
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.pillRow}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.pillSelect, gender === g && styles.pillSelectActive]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.pillSelectText, gender === g && styles.pillSelectTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Marital Status</Text>
              <View style={styles.pillRow}>
                {MARITAL_STATUSES.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.pillSelect, maritalStatus === m && styles.pillSelectActive]}
                    onPress={() => setMaritalStatus(m)}
                  >
                    <Text style={[styles.pillSelectText, maritalStatus === m && styles.pillSelectTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Religion</Text>
              <View style={styles.pillRow}>
                {RELIGIONS.filter(r => r !== 'All Religions').map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.pillSelect, religion === r && styles.pillSelectActive]}
                    onPress={() => setReligion(r)}
                  >
                    <Text style={[styles.pillSelectText, religion === r && styles.pillSelectTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* SECTION 2: EMPLOYMENT & PLACEMENT */}
            <View style={[styles.sectionCard, { borderTopColor: '#6366f1' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="business" size={18} color="#6366f1" />
                <Text style={styles.sectionHeading}>2. Employment & Placement</Text>
              </View>

              {/* Assigned Branch Selector Card */}
              <View style={styles.dropdownCard}>
                <View style={styles.dropdownHeaderRow}>
                  <Text style={styles.fieldLabel}>Assigned Branch (Store) *</Text>
                  <View style={[styles.dropdownBadge, !selectedBranch ? { backgroundColor: 'rgba(148, 163, 184, 0.12)', borderColor: '#475569' } : { backgroundColor: 'rgba(2, 132, 199, 0.15)', borderColor: '#0284c7' }]}>
                    <Text style={[styles.dropdownBadgeText, { color: selectedBranch ? '#38bdf8' : '#94a3b8' }]}>{selectedBranch || 'Choose Branch'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    setBranchPickerTarget('form');
                    setBranchPickerSearch('');
                    setBranchPickerVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownButtonLeft}>
                    <View style={styles.dropdownIconCircleBranch}>
                      <Ionicons name="business" size={16} color={selectedBranch ? "#38bdf8" : "#94a3b8"} />
                    </View>
                    <Text style={[styles.dropdownButtonText, !selectedBranch && { color: '#94a3b8' }]} numberOfLines={1}>
                      {selectedBranch || 'Choose Branch...'}
                    </Text>
                  </View>
                  <View style={styles.dropdownButtonRight}>
                    <Text style={styles.dropdownChangeLabel}>Choose</Text>
                    <Ionicons name="chevron-down" size={16} color="#94a3b8" />
                  </View>
                </TouchableOpacity>

                {/* Quick Selection Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPillScroll}>
                  {branches.map(b => {
                    const isSelected = selectedBranch === b.name;
                    return (
                      <TouchableOpacity
                        key={b._id || b.name}
                        style={[styles.quickPill, isSelected && styles.quickPillActiveBranch]}
                        onPress={() => setSelectedBranch(b.name)}
                      >
                        <Text style={[styles.quickPillText, isSelected && styles.quickPillTextActive]}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.quickPillMore}
                    onPress={() => {
                      setBranchPickerTarget('form');
                      setBranchPickerSearch('');
                      setBranchPickerVisible(true);
                    }}
                  >
                    <Text style={styles.quickPillMoreText}>All ({branches.length}) »</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Department Selector Card */}
              <View style={styles.dropdownCard}>
                <View style={styles.dropdownHeaderRow}>
                  <Text style={styles.fieldLabel}>Department *</Text>
                  <View style={[styles.dropdownBadge, !selectedDept ? { backgroundColor: 'rgba(148, 163, 184, 0.12)', borderColor: '#475569' } : { backgroundColor: 'rgba(192, 132, 252, 0.15)', borderColor: '#9333ea' }]}>
                    <Text style={[styles.dropdownBadgeText, { color: selectedDept ? '#c084fc' : '#94a3b8' }]}>{selectedDept ? getDeptName(selectedDept) : 'Choose Department'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    setDeptPickerTarget('form');
                    setDeptPickerSearch('');
                    setDeptPickerVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownButtonLeft}>
                    <View style={styles.dropdownIconCircleDept}>
                      <Ionicons name="layers" size={16} color={selectedDept ? "#c084fc" : "#94a3b8"} />
                    </View>
                    <Text style={[styles.dropdownButtonText, !selectedDept && { color: '#94a3b8' }]} numberOfLines={1}>
                      {selectedDept ? getDeptName(selectedDept) : 'Choose Department...'}
                    </Text>
                  </View>
                  <View style={styles.dropdownButtonRight}>
                    <Text style={styles.dropdownChangeLabel}>Choose</Text>
                    <Ionicons name="chevron-down" size={16} color="#94a3b8" />
                  </View>
                </TouchableOpacity>

                {/* Quick Selection Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPillScroll}>
                  {departments.slice(0, 8).map(d => {
                    const isSelected = String(selectedDept) === String(d._id) || String(getDeptName(selectedDept)).toLowerCase() === String(d.name).toLowerCase();
                    return (
                      <TouchableOpacity
                        key={d._id}
                        style={[styles.quickPill, isSelected && styles.quickPillActiveDept]}
                        onPress={() => setSelectedDept(String(d._id))}
                      >
                        <Text style={[styles.quickPillText, isSelected && styles.quickPillTextActive]}>
                          {d.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.quickPillMore}
                    onPress={() => {
                      setDeptPickerTarget('form');
                      setDeptPickerSearch('');
                      setDeptPickerVisible(true);
                    }}
                  >
                    <Text style={styles.quickPillMoreText}>All ({departments.length}) »</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Designation Selector Card */}
              <View style={styles.dropdownCard}>
                <View style={styles.dropdownHeaderRow}>
                  <Text style={styles.fieldLabel}>Designation *</Text>
                  <View style={[styles.dropdownBadge, !selectedDesig ? { backgroundColor: 'rgba(148, 163, 184, 0.12)', borderColor: '#475569' } : { backgroundColor: 'rgba(5, 150, 105, 0.15)', borderColor: '#059669' }]}>
                    <Text style={[styles.dropdownBadgeText, { color: selectedDesig ? '#34d399' : '#94a3b8' }]}>{selectedDesig ? getDesigName(selectedDesig) : 'Choose Designation'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    setDesigPickerTarget('form');
                    setDesigPickerSearch('');
                    setDesigPickerVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownButtonLeft}>
                    <View style={styles.dropdownIconCircleDesig}>
                      <Ionicons name="ribbon" size={16} color={selectedDesig ? "#34d399" : "#94a3b8"} />
                    </View>
                    <Text style={[styles.dropdownButtonText, !selectedDesig && { color: '#94a3b8' }]} numberOfLines={1}>
                      {selectedDesig ? getDesigName(selectedDesig) : 'Choose Designation...'}
                    </Text>
                  </View>
                  <View style={styles.dropdownButtonRight}>
                    <Text style={styles.dropdownChangeLabel}>Choose</Text>
                    <Ionicons name="chevron-down" size={16} color="#94a3b8" />
                  </View>
                </TouchableOpacity>

                {/* Quick Selection Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPillScroll}>
                  {designations.slice(0, 8).map(des => {
                    const isSelected = String(selectedDesig) === String(des._id) || String(getDesigName(selectedDesig)).toLowerCase() === String(des.name).toLowerCase();
                    return (
                      <TouchableOpacity
                        key={des._id}
                        style={[styles.quickPill, isSelected && styles.quickPillActiveDesig]}
                        onPress={() => setSelectedDesig(String(des._id))}
                      >
                        <Text style={[styles.quickPillText, isSelected && styles.quickPillTextActive]}>
                          {des.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.quickPillMore}
                    onPress={() => {
                      setDesigPickerTarget('form');
                      setDesigPickerSearch('');
                      setDesigPickerVisible(true);
                    }}
                  >
                    <Text style={styles.quickPillMoreText}>All ({designations.length}) »</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Joining Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={joiningDate}
                    onChangeText={setJoiningDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Employee Status</Text>
                  <View style={styles.switchRowCompact}>
                    <Text style={{ color: isActive ? '#10b981' : '#ef4444', fontWeight: '700', fontSize: 13 }}>
                      {isActive ? 'Active Employee' : 'Inactive'}
                    </Text>
                    <Switch
                      value={isActive}
                      onValueChange={setIsActive}
                      trackColor={{ false: '#334155', true: '#10b981' }}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.switchTitle}>Commission Employee</Text>
                  <Text style={styles.switchDesc}>Enables sales commissions tracking</Text>
                </View>
                <Switch
                  value={commEmp}
                  onValueChange={setCommEmp}
                  trackColor={{ false: '#334155', true: '#6366f1' }}
                />
              </View>
            </View>

            {/* SECTION 3: COMPENSATION & FIX DETAILS */}
            <View style={[styles.sectionCard, { borderTopColor: '#10b981' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="cash" size={18} color="#10b981" />
                <Text style={styles.sectionHeading}>3. Compensation & Fix Details</Text>
              </View>

              {/* Automatic Increment Date Trigger Notification */}
              {isSalaryModified ? (
                <View style={styles.salaryAlertBox}>
                  <Ionicons name="sparkles" size={16} color="#10b981" />
                  <Text style={styles.salaryAlertText}>
                    ⚡ Basic Salary modified — Increment Date will automatically be updated to today ({incrDate})
                  </Text>
                </View>
              ) : null}

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Basic Salary (PKR) *</Text>
                  <TextInput
                    style={[styles.textInput, isSalaryModified && styles.textInputHighlight]}
                    value={basicSalary}
                    onChangeText={handleSalaryChange}
                    placeholder="e.g. 45000"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Salary Type</Text>
                  <View style={styles.pillRow}>
                    {['monthly', 'daily'].map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.pillSelect, salaryType === type && styles.pillSelectActive]}
                        onPress={() => setSalaryType(type)}
                      >
                        <Text style={[styles.pillSelectText, salaryType === type && styles.pillSelectTextActive]}>
                          {type === 'monthly' ? 'Monthly' : 'Daily'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.fieldLabel}>Fix Allowance (PKR)</Text>
                    <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '800' }}>🔒 FIXED</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={fixAllowance}
                    onChangeText={setFixAllowance}
                    placeholder="0"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Other Allowance (PKR)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={otherAllowance}
                    onChangeText={setOtherAllowance}
                    placeholder="0"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>ST Loss Rate (PKR)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={stLoss}
                    onChangeText={setStLoss}
                    placeholder="0"
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Increment Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={[styles.textInput, isSalaryModified && styles.textInputHighlight]}
                    value={incrDate}
                    onChangeText={setIncrDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>
            </View>

            {/* SECTION 4: ACCESS CONTROLS & LOCKED ENTITLEMENTS (Web Parity) */}
            <View style={[styles.sectionCard, { borderTopColor: '#f59e0b' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="lock-closed" size={18} color="#f59e0b" />
                <Text style={styles.sectionHeading}>4. Access Controls & Entitlements</Text>
                <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '800' }}>🔒 ACCESS CONTROLS</Text>
                </View>
              </View>

              {/* 🏦 Highlight Card: Full Salary Through Bank */}
              <View style={[styles.accessHighlightCard, payFullSalaryThroughBank && styles.accessHighlightCardActive]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="card" size={18} color={payFullSalaryThroughBank ? '#38bdf8' : '#94a3b8'} />
                    <Text style={styles.accessHighlightTitle}>Pay Full Salary Through Bank</Text>
                  </View>
                  <Text style={styles.accessHighlightSub}>
                    Disallow cash payroll; full compensation routed through registered bank account
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.activeStatusPill, payFullSalaryThroughBank ? styles.activeStatusPillOn : styles.activeStatusPillOff]}>
                    <Text style={[styles.activeStatusPillText, payFullSalaryThroughBank ? styles.activeStatusPillTextOn : styles.activeStatusPillTextOff]}>
                      {payFullSalaryThroughBank ? '🟢 ACTIVE' : '⚪ OFF'}
                    </Text>
                  </View>
                  <Switch
                    value={payFullSalaryThroughBank}
                    onValueChange={setPayFullSalaryThroughBank}
                    trackColor={{ false: '#334155', true: '#38bdf8' }}
                  />
                </View>
              </View>

              {/* Access Control Switches Grid */}
              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Allow Overtime</Text>
                  <Text style={styles.accessSwitchSub}>Authorize OT calculation and payouts</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: allowOvertime ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {allowOvertime ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={allowOvertime} onValueChange={setAllowOvertime} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>OTST 30 Working Days</Text>
                  <Text style={styles.accessSwitchSub}>Calculate overtime based on 30 working days standard</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: otst30WorkingDays ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {otst30WorkingDays ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={otst30WorkingDays} onValueChange={setOtst30WorkingDays} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>EOBI Registration & Deductions</Text>
                  <Text style={styles.accessSwitchSub}>Enable Employees' Old-Age Benefits Institution share</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: eobi ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {eobi ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={eobi} onValueChange={setEobi} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Electricity Bill Allowance</Text>
                  <Text style={styles.accessSwitchSub}>Staff utility bill allowance eligible</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: electricityBill ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {electricityBill ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={electricityBill} onValueChange={setElectricityBill} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Thirty Working Days</Text>
                  <Text style={styles.accessSwitchSub}>Fixed 30 calendar working days salary scale</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: thirtyWorkingDays ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {thirtyWorkingDays ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={thirtyWorkingDays} onValueChange={setThirtyWorkingDays} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Allow Employee Advances</Text>
                  <Text style={styles.accessSwitchSub}>Allow salary loans and monthly advances</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: allowEmployeeAdvance ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {allowEmployeeAdvance ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch value={allowEmployeeAdvance} onValueChange={setAllowEmployeeAdvance} trackColor={{ false: '#334155', true: '#10b981' }} />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Allow Rotti Perks</Text>
                  <Text style={styles.accessSwitchSub}>Provide company meal entitlement</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: allowRottiPerks ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {allowRottiPerks ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch
                    value={allowRottiPerks}
                    onValueChange={(val) => {
                      setAllowRottiPerks(val);
                      if (val) setDontAllowRottiPerks(false);
                    }}
                    trackColor={{ false: '#334155', true: '#10b981' }}
                  />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accessSwitchTitle, { color: '#f87171' }]}>Dont Allow Rotti Perks</Text>
                  <Text style={styles.accessSwitchSub}>Strictly exclude from food perks</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: dontAllowRottiPerks ? '#ef4444' : '#64748b', fontWeight: '700' }}>
                    {dontAllowRottiPerks ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch
                    value={dontAllowRottiPerks}
                    onValueChange={(val) => {
                      setDontAllowRottiPerks(val);
                      if (val) setAllowRottiPerks(false);
                    }}
                    trackColor={{ false: '#334155', true: '#ef4444' }}
                  />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accessSwitchTitle}>Allow Nashta Perks</Text>
                  <Text style={styles.accessSwitchSub}>Provide breakfast allowance</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: allowNashtaPerks ? '#10b981' : '#64748b', fontWeight: '700' }}>
                    {allowNashtaPerks ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch
                    value={allowNashtaPerks}
                    onValueChange={(val) => {
                      setAllowNashtaPerks(val);
                      if (val) setDontAllowNashtaPerks(false);
                    }}
                    trackColor={{ false: '#334155', true: '#10b981' }}
                  />
                </View>
              </View>

              <View style={styles.accessSwitchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accessSwitchTitle, { color: '#f87171' }]}>Dont Allow Nashta Perks</Text>
                  <Text style={styles.accessSwitchSub}>Strictly exclude from breakfast</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: dontAllowNashtaPerks ? '#ef4444' : '#64748b', fontWeight: '700' }}>
                    {dontAllowNashtaPerks ? 'ACTIVE' : 'OFF'}
                  </Text>
                  <Switch
                    value={dontAllowNashtaPerks}
                    onValueChange={(val) => {
                      setDontAllowNashtaPerks(val);
                      if (val) setAllowNashtaPerks(false);
                    }}
                    trackColor={{ false: '#334155', true: '#ef4444' }}
                  />
                </View>
              </View>
            </View>

            {/* SECTION 5: BANK & PAYOUT DETAILS */}
            <View style={[styles.sectionCard, { borderTopColor: '#3b82f6' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="card" size={18} color="#3b82f6" />
                <Text style={styles.sectionHeading}>5. Bank & Payout Details</Text>
              </View>

              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.pillRow}>
                {['Cash', 'Bank'].map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.pillSelect, bankCash === mode && styles.pillSelectActive]}
                    onPress={() => setBankCash(mode)}
                  >
                    <Ionicons
                      name={mode === 'Bank' ? 'card-outline' : 'cash-outline'}
                      size={14}
                      color={bankCash === mode ? '#ffffff' : '#94a3b8'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.pillSelectText, bankCash === mode && styles.pillSelectTextActive]}>
                      {mode} Payout
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {bankCash === 'Bank' && (
                <>
                  <Text style={styles.fieldLabel}>Bank Name</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                    {BANKS.map(b => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.pillSelect, selectBank === b && styles.pillSelectActive]}
                        onPress={() => setSelectBank(b)}
                      >
                        <Text style={[styles.pillSelectText, selectBank === b && styles.pillSelectTextActive]}>
                          {b}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={styles.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Bank Account Number *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={acNo}
                        onChangeText={setAcNo}
                        placeholder="e.g. 00427900123403"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* SECTION 6: DUTY TIMING & SCHEDULE (12-HOUR FORMAT) */}
            <View style={[styles.sectionCard, { borderTopColor: '#a855f7' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="time" size={18} color="#a855f7" />
                <Text style={styles.sectionHeading}>6. Duty Timing & Work Hours (12-Hour)</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>From Duty Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={fDutyTime}
                    onChangeText={setFDutyTime}
                    placeholder="09:00 AM"
                    placeholderTextColor="#64748b"
                  />
                  {/* From Time Quick Presets */}
                  <View style={styles.quickPresetRow}>
                    {FROM_TIME_PRESETS.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.quickPresetBtn, fDutyTime === t && styles.quickPresetBtnActive]}
                        onPress={() => setFDutyTime(t)}
                      >
                        <Text style={[styles.quickPresetText, fDutyTime === t && styles.quickPresetTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>To Duty Time (12-Hour)</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: '#a855f7' }]}
                    value={tDutyTime}
                    onChangeText={(v) => setTDutyTime(v)}
                    placeholder="06:00 PM"
                    placeholderTextColor="#64748b"
                  />
                  {/* To Time Quick Presets */}
                  <View style={styles.quickPresetRow}>
                    {TO_TIME_PRESETS.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.quickPresetBtn, tDutyTime === t && styles.quickPresetBtnActive]}
                        onPress={() => setTDutyTime(t)}
                      >
                        <Text style={[styles.quickPresetText, tDutyTime === t && styles.quickPresetTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.timingBadgeRow}>
                <View style={styles.timingChip}>
                  <Ionicons name="timer-outline" size={14} color="#a855f7" />
                  <Text style={styles.timingChipText}>Calculated Shift Duration: {dutyHoursText}</Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Weekly Off Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {DAYS.map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.pillSelect, offDay === day && styles.pillSelectActive]}
                    onPress={() => setOffDay(day)}
                  >
                    <Text style={[styles.pillSelectText, offDay === day && styles.pillSelectTextActive]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* SECTION 7: CONTACT & IDENTITY */}
            <View style={[styles.sectionCard, { borderTopColor: '#0d9488' }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="call" size={18} color="#0d9488" />
                <Text style={styles.sectionHeading}>7. Contact & Identity Dates</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Mobile Number</Text>
                  <TextInput
                    style={styles.textInput}
                    value={mobileNo}
                    onChangeText={setMobileNo}
                    placeholder="0300-1234567"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>CNIC Issue Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={issueDate}
                    onChangeText={setIssueDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Residential Address</Text>
                  <TextInput
                    style={[styles.textInput, { height: 60 }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Full residential address"
                    placeholderTextColor="#64748b"
                    multiline
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>CNIC Expiry Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={expiryDate}
                    onChangeText={setExpiryDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>
            </View>

            {/* FORM ACTION SUBMIT BUTTON */}
            <View style={styles.submitContainer}>
              <TouchableOpacity
                style={[styles.submitButton, isEditing ? styles.submitButtonEdit : styles.submitButtonNew]}
                onPress={handleFormSubmit}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name={isEditing ? 'shield-checkmark' : 'person-add'} size={18} color="#ffffff" />
                    <Text style={styles.submitButtonText}>
                      {isEditing ? 'Save Changes & Authorize' : 'Register New Employee'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SEARCHABLE DEPARTMENT PICKER MODAL */}
      {/* ─────────────────────────────────────────────────────────── */}
      <Modal visible={deptPickerVisible} transparent animationType="slide">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            {/* Header */}
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={styles.dropdownIconCircleDept}>
                  <Ionicons name="layers" size={18} color="#c084fc" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Select Department</Text>
                  <Text style={styles.pickerModalSub}>
                    {deptPickerTarget === 'filter' ? 'Filter employee directory' : 'Assign to employee registration'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.pickerModalCloseBtn}
                onPress={() => setDeptPickerVisible(false)}
              >
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Search Input Box */}
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search department by name..."
                placeholderTextColor="#64748b"
                value={deptPickerSearch}
                onChangeText={setDeptPickerSearch}
                autoCorrect={false}
              />
              {deptPickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setDeptPickerSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Department List */}
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {deptPickerTarget === 'filter' && (
                <TouchableOpacity
                  style={[
                    styles.pickerItemRow,
                    selectedDeptFilter === 'All Departments' && styles.pickerItemRowSelected
                  ]}
                  onPress={() => {
                    setSelectedDeptFilter('All Departments');
                    setDeptPickerVisible(false);
                  }}
                >
                  <View style={styles.pickerItemLeft}>
                    <View style={[styles.pickerItemIconBox, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                      <Ionicons name="apps" size={16} color="#94a3b8" />
                    </View>
                    <Text style={[
                      styles.pickerItemText,
                      selectedDeptFilter === 'All Departments' && styles.pickerItemTextSelected
                    ]}>
                      All Departments
                    </Text>
                  </View>
                  {selectedDeptFilter === 'All Departments' && (
                    <View style={styles.pickerCheckmarkCircle}>
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {pickerFilteredDepts.length === 0 ? (
                <View style={styles.pickerEmptyBox}>
                  <Ionicons name="alert-circle-outline" size={32} color="#64748b" />
                  <Text style={styles.pickerEmptyText}>No departments match "{deptPickerSearch}"</Text>
                </View>
              ) : (
                pickerFilteredDepts.map(d => {
                  const deptIdStr = String(d._id);
                  const isSelected = deptPickerTarget === 'form'
                    ? (String(selectedDept) === deptIdStr || String(getDeptName(selectedDept)).toLowerCase() === String(d.name).toLowerCase())
                    : (String(selectedDeptFilter) === deptIdStr || String(getDeptName(selectedDeptFilter)).toLowerCase() === String(d.name).toLowerCase());

                  return (
                    <TouchableOpacity
                      key={d._id}
                      style={[
                        styles.pickerItemRow,
                        isSelected && styles.pickerItemRowSelected
                      ]}
                      onPress={() => {
                        if (deptPickerTarget === 'form') {
                          setSelectedDept(deptIdStr);
                        } else {
                          setSelectedDeptFilter(deptIdStr);
                        }
                        setDeptPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerItemLeft}>
                        <View style={[styles.pickerItemIconBox, isSelected && { backgroundColor: 'rgba(192, 132, 252, 0.25)' }]}>
                          <Ionicons name="layers" size={16} color={isSelected ? '#c084fc' : '#94a3b8'} />
                        </View>
                        <Text style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected
                        ]}>
                          {d.name}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={[styles.pickerCheckmarkCircle, { backgroundColor: '#c084fc' }]}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#475569" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SEARCHABLE DESIGNATION PICKER MODAL */}
      {/* ─────────────────────────────────────────────────────────── */}
      <Modal visible={desigPickerVisible} transparent animationType="slide">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            {/* Header */}
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={styles.dropdownIconCircleDesig}>
                  <Ionicons name="ribbon" size={18} color="#34d399" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Select Designation</Text>
                  <Text style={styles.pickerModalSub}>
                    {desigPickerTarget === 'filter' ? 'Filter employee directory' : 'Assign to employee registration'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.pickerModalCloseBtn}
                onPress={() => setDesigPickerVisible(false)}
              >
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Search Input Box */}
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search designation by name..."
                placeholderTextColor="#64748b"
                value={desigPickerSearch}
                onChangeText={setDesigPickerSearch}
                autoCorrect={false}
              />
              {desigPickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setDesigPickerSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Designation List */}
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {desigPickerTarget === 'filter' && (
                <TouchableOpacity
                  style={[
                    styles.pickerItemRow,
                    selectedDesigFilter === 'All Designations' && styles.pickerItemRowSelectedDesig
                  ]}
                  onPress={() => {
                    setSelectedDesigFilter('All Designations');
                    setDesigPickerVisible(false);
                  }}
                >
                  <View style={styles.pickerItemLeft}>
                    <View style={[styles.pickerItemIconBox, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                      <Ionicons name="apps" size={16} color="#94a3b8" />
                    </View>
                    <Text style={[
                      styles.pickerItemText,
                      selectedDesigFilter === 'All Designations' && styles.pickerItemTextSelected
                    ]}>
                      All Designations
                    </Text>
                  </View>
                  {selectedDesigFilter === 'All Designations' && (
                    <View style={[styles.pickerCheckmarkCircle, { backgroundColor: '#34d399' }]}>
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {pickerFilteredDesigs.length === 0 ? (
                <View style={styles.pickerEmptyBox}>
                  <Ionicons name="alert-circle-outline" size={32} color="#64748b" />
                  <Text style={styles.pickerEmptyText}>No designations match "{desigPickerSearch}"</Text>
                </View>
              ) : (
                pickerFilteredDesigs.map(des => {
                  const desIdStr = String(des._id);
                  const isSelected = desigPickerTarget === 'form'
                    ? (String(selectedDesig) === desIdStr || String(getDesigName(selectedDesig)).toLowerCase() === String(des.name).toLowerCase())
                    : (String(selectedDesigFilter) === desIdStr || String(getDesigName(selectedDesigFilter)).toLowerCase() === String(des.name).toLowerCase());

                  return (
                    <TouchableOpacity
                      key={des._id}
                      style={[
                        styles.pickerItemRow,
                        isSelected && styles.pickerItemRowSelectedDesig
                      ]}
                      onPress={() => {
                        if (desigPickerTarget === 'form') {
                          setSelectedDesig(desIdStr);
                        } else {
                          setSelectedDesigFilter(desIdStr);
                        }
                        setDesigPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerItemLeft}>
                        <View style={[styles.pickerItemIconBox, isSelected && { backgroundColor: 'rgba(52, 211, 153, 0.25)' }]}>
                          <Ionicons name="ribbon" size={16} color={isSelected ? '#34d399' : '#94a3b8'} />
                        </View>
                        <Text style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected
                        ]}>
                          {des.name}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={[styles.pickerCheckmarkCircle, { backgroundColor: '#34d399' }]}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#475569" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SEARCHABLE BRANCH PICKER MODAL */}
      {/* ─────────────────────────────────────────────────────────── */}
      <Modal visible={branchPickerVisible} transparent animationType="slide">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            {/* Header */}
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={styles.dropdownIconCircleBranch}>
                  <Ionicons name="business" size={18} color="#38bdf8" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Select Branch</Text>
                  <Text style={styles.pickerModalSub}>
                    {branchPickerTarget === 'filter' ? 'Filter employee directory' : 'Assign to employee registration'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.pickerModalCloseBtn}
                onPress={() => setBranchPickerVisible(false)}
              >
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Search Input Box */}
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Search branch by name..."
                placeholderTextColor="#64748b"
                value={branchPickerSearch}
                onChangeText={setBranchPickerSearch}
                autoCorrect={false}
              />
              {branchPickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setBranchPickerSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Branch List */}
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {branchPickerTarget === 'filter' && (
                <TouchableOpacity
                  style={[
                    styles.pickerItemRow,
                    selectedBranchFilter === 'All Branches' && styles.pickerItemRowSelectedBranch
                  ]}
                  onPress={() => {
                    setSelectedBranchFilter('All Branches');
                    setBranchPickerVisible(false);
                  }}
                >
                  <View style={styles.pickerItemLeft}>
                    <View style={[styles.pickerItemIconBox, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                      <Ionicons name="apps" size={16} color="#94a3b8" />
                    </View>
                    <Text style={[
                      styles.pickerItemText,
                      selectedBranchFilter === 'All Branches' && styles.pickerItemTextSelected
                    ]}>
                      All Branches
                    </Text>
                  </View>
                  {selectedBranchFilter === 'All Branches' && (
                    <View style={[styles.pickerCheckmarkCircle, { backgroundColor: '#38bdf8' }]}>
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {pickerFilteredBranches.length === 0 ? (
                <View style={styles.pickerEmptyBox}>
                  <Ionicons name="alert-circle-outline" size={32} color="#64748b" />
                  <Text style={styles.pickerEmptyText}>No branches match "{branchPickerSearch}"</Text>
                </View>
              ) : (
                pickerFilteredBranches.map(b => {
                  const isSelected = branchPickerTarget === 'form'
                    ? selectedBranch === b.name
                    : selectedBranchFilter === b.name;

                  return (
                    <TouchableOpacity
                      key={b._id || b.name}
                      style={[
                        styles.pickerItemRow,
                        isSelected && styles.pickerItemRowSelectedBranch
                      ]}
                      onPress={() => {
                        if (branchPickerTarget === 'form') {
                          setSelectedBranch(b.name);
                        } else {
                          setSelectedBranchFilter(b.name);
                        }
                        setBranchPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerItemLeft}>
                        <View style={[styles.pickerItemIconBox, isSelected && { backgroundColor: 'rgba(56, 189, 248, 0.25)' }]}>
                          <Ionicons name="business" size={16} color={isSelected ? '#38bdf8' : '#94a3b8'} />
                        </View>
                        <Text style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextSelected
                        ]}>
                          {b.name}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={[styles.pickerCheckmarkCircle, { backgroundColor: '#38bdf8' }]}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color="#475569" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* FILTER MODAL */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={styles.filterModalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter Employees</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalScroll}>
              <View style={styles.filterHeaderWithAction}>
                <Text style={styles.filterSectionTitle}>Branch</Text>
                <TouchableOpacity
                  style={styles.filterSearchBtnBranch}
                  onPress={() => {
                    setBranchPickerTarget('filter');
                    setBranchPickerSearch('');
                    setBranchPickerVisible(true);
                  }}
                >
                  <Ionicons name="search" size={12} color="#38bdf8" />
                  <Text style={styles.filterSearchBtnTextBranch}>Search Branch</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {['All Branches', ...branches.map(b => b.name)].map(b => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.pillSelect, selectedBranchFilter === b && styles.pillSelectActive]}
                    onPress={() => setSelectedBranchFilter(b)}
                  >
                    <Text style={[styles.pillSelectText, selectedBranchFilter === b && styles.pillSelectTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.filterHeaderWithAction}>
                <Text style={styles.filterSectionTitle}>Department</Text>
                <TouchableOpacity
                  style={styles.filterSearchBtnDept}
                  onPress={() => {
                    setDeptPickerTarget('filter');
                    setDeptPickerSearch('');
                    setDeptPickerVisible(true);
                  }}
                >
                  <Ionicons name="search" size={12} color="#c084fc" />
                  <Text style={styles.filterSearchBtnTextDept}>Search ({departments.length})</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {['All Departments', ...departments.map(d => d._id || d.name)].map(id => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.pillSelect, selectedDeptFilter === id && styles.pillSelectActive]}
                    onPress={() => setSelectedDeptFilter(id)}
                  >
                    <Text style={[styles.pillSelectText, selectedDeptFilter === id && styles.pillSelectTextActive]}>
                      {id === 'All Departments' ? 'All Departments' : getDeptName(id)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.filterHeaderWithAction}>
                <Text style={styles.filterSectionTitle}>Designation</Text>
                <TouchableOpacity
                  style={styles.filterSearchBtnDesig}
                  onPress={() => {
                    setDesigPickerTarget('filter');
                    setDesigPickerSearch('');
                    setDesigPickerVisible(true);
                  }}
                >
                  <Ionicons name="search" size={12} color="#34d399" />
                  <Text style={styles.filterSearchBtnTextDesig}>Search ({designations.length})</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {['All Designations', ...designations.map(d => d._id || d.name)].map(id => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.pillSelect, selectedDesigFilter === id && styles.pillSelectActive]}
                    onPress={() => setSelectedDesigFilter(id)}
                  >
                    <Text style={[styles.pillSelectText, selectedDesigFilter === id && styles.pillSelectTextActive]}>
                      {id === 'All Designations' ? 'All Designations' : getDesigName(id)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.filterSectionTitle}>Payment Mode</Text>
              <View style={styles.pillRow}>
                {SALARY_MODES.map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.pillSelect, selectedSalaryModeFilter === mode && styles.pillSelectActive]}
                    onPress={() => setSelectedSalaryModeFilter(mode)}
                  >
                    <Text style={[styles.pillSelectText, selectedSalaryModeFilter === mode && styles.pillSelectTextActive]}>{mode}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Status</Text>
              <View style={styles.pillRow}>
                {STATUSES.map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.pillSelect, selectedStatusFilter === st && styles.pillSelectActive]}
                    onPress={() => setSelectedStatusFilter(st)}
                  >
                    <Text style={[styles.pillSelectText, selectedStatusFilter === st && styles.pillSelectTextActive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={styles.filterResetBtn}
                onPress={() => {
                  setSelectedBranchFilter('All Branches');
                  setSelectedDeptFilter('All Departments');
                  setSelectedDesigFilter('All Designations');
                  setSelectedReligionFilter('All Religions');
                  setSelectedSalaryModeFilter('All Modes');
                  setSelectedStatusFilter('All Status');
                }}
              >
                <Text style={styles.filterResetText}>Reset All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.filterApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BILAL SHAH AUTHORIZATION SECURITY MODAL */}
      <Modal visible={authModalVisible} transparent animationType="fade">
        <View style={styles.authModalOverlay}>
          <View style={styles.authModalCard}>
            <View style={styles.authModalHeader}>
              <View style={styles.authIconCircle}>
                <Ionicons name="shield-checkmark" size={28} color="#10b981" />
              </View>
              <Text style={styles.authModalTitle}>Admin Authorization Required</Text>
              <Text style={styles.authModalSub}>
                Only Bilal Shah is authorized to modify employee records in the mobile app.
              </Text>
            </View>

            {authError ? (
              <View style={styles.authErrorBox}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={styles.authErrorText}>{authError}</Text>
              </View>
            ) : null}

            {authLoading ? (
              <View style={styles.authStatusContainer}>
                <ActivityIndicator color="#38bdf8" size="small" />
                <Text style={styles.authStatusText}>{authStatusText || 'Processing request...'}</Text>
              </View>
            ) : null}

            <View style={styles.authInputBox}>
              <Text style={styles.authInputLabel}>Username</Text>
              <View style={styles.authInputWrapper}>
                <Ionicons name="person-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.authTextInput}
                  value={authUsername}
                  onChangeText={setAuthUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  editable={!authLoading}
                />
              </View>
            </View>

            <View style={styles.authInputBox}>
              <Text style={styles.authInputLabel}>Password</Text>
              <View style={styles.authInputWrapper}>
                <Ionicons name="lock-closed-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.authTextInput}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showAuthPassword}
                  editable={!authLoading}
                />
                <TouchableOpacity onPress={() => setShowAuthPassword(!showAuthPassword)}>
                  <Ionicons name={showAuthPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.authModalButtons}>
              <TouchableOpacity
                style={styles.authCancelBtn}
                onPress={() => setAuthModalVisible(false)}
                disabled={authLoading}
              >
                <Text style={styles.authCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.authConfirmBtn}
                onPress={handleAuthorizeAndSave}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.authConfirmText}>Authorize & Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DEDICATED IN-APP RESULT MODAL (SUCCESS & ERROR POPUP) */}
      <Modal visible={saveResultModal.visible} transparent animationType="fade">
        <View style={styles.resultModalOverlay}>
          <View style={styles.resultModalContent}>
            <View style={[styles.resultIconCircle, saveResultModal.type === 'success' ? styles.resultIconSuccess : styles.resultIconError]}>
              <Ionicons
                name={saveResultModal.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={52}
                color={saveResultModal.type === 'success' ? '#10b981' : '#ef4444'}
              />
            </View>

            <Text style={styles.resultModalTitle}>{saveResultModal.title}</Text>
            
            <View style={styles.resultAuthBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#10b981" />
              <Text style={styles.resultAuthBadgeText}>AUTHORIZED BY BILAL SHAH</Text>
            </View>

            <Text style={styles.resultModalMessage}>{saveResultModal.message}</Text>

            {saveResultModal.details ? (
              <View style={styles.resultDetailsBox}>
                <Ionicons name="sparkles" size={14} color="#10b981" />
                <Text style={styles.resultDetailsText}>{saveResultModal.details}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.resultModalButton}
              onPress={() => {
                setSaveResultModal({ visible: false, type: 'success', title: '', message: '', details: null });
                clearForm();
                setIsEditing(false);
                setActiveTab('list');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.resultModalButtonText}>OK • Return to Directory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PROFILE PHOTO SOURCE SELECTOR MODAL */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.photoModalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View style={styles.photoModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.photoModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-circle-outline" size={22} color="#38bdf8" />
                <Text style={styles.photoModalTitle}>Profile Photo</Text>
              </View>
              <TouchableOpacity onPress={() => setPhotoModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {photo ? (
              <View style={styles.photoPreviewBox}>
                <Image
                  source={{ uri: getPhotoUri(photo) }}
                  style={styles.photoModalPreviewImg}
                />
              </View>
            ) : null}

            <View style={styles.photoModalOptions}>
              <TouchableOpacity
                style={styles.photoModalOptionBtn}
                onPress={takeFromCamera}
                activeOpacity={0.8}
              >
                <View style={[styles.photoModalOptionIcon, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                  <Ionicons name="camera" size={22} color="#38bdf8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoModalOptionTitle}>Take New Photo</Text>
                  <Text style={styles.photoModalOptionDesc}>Open camera to take employee picture</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748b" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoModalOptionBtn}
                onPress={pickFromGallery}
                activeOpacity={0.8}
              >
                <View style={[styles.photoModalOptionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="images" size={22} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoModalOptionTitle}>Choose from Gallery</Text>
                  <Text style={styles.photoModalOptionDesc}>Select from device photo album</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748b" />
              </TouchableOpacity>

              {photo ? (
                <TouchableOpacity
                  style={[styles.photoModalOptionBtn, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}
                  onPress={handleRemovePhoto}
                  activeOpacity={0.8}
                >
                  <View style={[styles.photoModalOptionIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="trash" size={22} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.photoModalOptionTitle, { color: '#ef4444' }]}>Remove Photo</Text>
                    <Text style={styles.photoModalOptionDesc}>Delete this employee profile photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.photoModalCancelBtn}
              onPress={() => setPhotoModalVisible(false)}
            >
              <Text style={styles.photoModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
    // Generous top padding to clear camera punch-hole, notch, and status bar
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 38) : 16
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  headerBackBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#334155'
  },
  headerTitleBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12
  },
  headerMainTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3
  },
  headerSubTitle: {
    fontSize: 11,
    color: '#38bdf8',
    marginTop: 2
  },
  headerAddBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#10b981'
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)'
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8'
  },
  tabBtnTextActive: {
    color: '#38bdf8'
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#334155'
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff'
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 3
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 44
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#ffffff',
    fontSize: 13
  },
  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: '#334155',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterButtonActive: {
    backgroundColor: '#6366f1'
  },
  activeFilterChipsScroll: {
    maxHeight: 34,
    marginBottom: 8
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    gap: 6
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8'
  },
  listContent: {
    paddingBottom: 24
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  avatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff'
  },
  cardTitleBox: {
    flex: 1
  },
  empName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  empCodeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  empUrdu: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 2
  },
  empSub: {
    fontSize: 11,
    color: '#94a3b8'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12
  },
  statusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
    borderWidth: 1
  },
  statusInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
    borderWidth: 1
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900'
  },
  statusTextActive: {
    color: '#10b981'
  },
  statusTextInactive: {
    color: '#ef4444'
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4
  },
  chipBranch: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderColor: '#0284c7',
    borderWidth: 1
  },
  chipTextBranch: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8'
  },
  chipDept: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderColor: '#7c3aed',
    borderWidth: 1
  },
  chipTextDept: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c084fc'
  },
  chipDesig: {
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    borderColor: '#059669',
    borderWidth: 1
  },
  chipTextDesig: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34d399'
  },
  chipReligion: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    borderWidth: 1
  },
  chipTextReligion: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fbbf24'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },
  infoCol: {
    flex: 1
  },
  infoColRight: {
    alignItems: 'flex-end',
    flex: 1
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2
  },
  salaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  salaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10b981'
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 3
  },
  modeBank: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)'
  },
  modeCash: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)'
  },
  modeText: {
    fontSize: 9,
    fontWeight: '800'
  },
  modeTextBank: {
    color: '#38bdf8'
  },
  modeTextCash: {
    color: '#fbbf24'
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10
  },
  actionEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6
  },
  actionEditText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  actionCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderColor: '#0284c7',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4
  },
  actionCallText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700'
  },
  formScroll: {
    flex: 1
  },
  formScrollContent: {
    padding: 14,
    paddingBottom: 40
  },
  formBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#38bdf8'
  },
  formBannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff'
  },
  formBannerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4
  },
  cancelEditText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8
  },
  errorAlertText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
    flex: 1
  },
  successAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8
  },
  successAlertText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
    flex: 1
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: '#334155'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    flex: 1,
    marginLeft: 8
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12
  },
  fieldCol: {
    flex: 1
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 6
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#ffffff',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textInputDisabled: {
    backgroundColor: '#1e293b',
    color: '#64748b'
  },
  textInputHighlight: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)'
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12
  },
  pillScroll: {
    marginBottom: 12
  },
  pillSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 6
  },
  pillSelectActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8'
  },
  pillSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8'
  },
  pillSelectTextActive: {
    color: '#0f172a'
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginTop: 4
  },
  switchRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  salaryAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8
  },
  salaryAlertText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    flex: 1
  },
  // Access Controls Styling
  accessHighlightCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  accessHighlightCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)'
  },
  accessHighlightTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  },
  accessHighlightSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 3
  },
  activeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  activeStatusPillOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)'
  },
  activeStatusPillOff: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)'
  },
  activeStatusPillText: {
    fontSize: 10,
    fontWeight: '800'
  },
  activeStatusPillTextOn: {
    color: '#10b981'
  },
  activeStatusPillTextOff: {
    color: '#94a3b8'
  },
  accessSwitchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  accessSwitchTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0'
  },
  accessSwitchSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1
  },
  // Duty Time Styling
  quickPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6
  },
  quickPresetBtn: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4
  },
  quickPresetBtnActive: {
    backgroundColor: '#a855f7',
    borderColor: '#a855f7'
  },
  quickPresetText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8'
  },
  quickPresetTextActive: {
    color: '#ffffff'
  },
  timingBadgeRow: {
    marginBottom: 12
  },
  timingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#a855f7',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6
  },
  timingChipText: {
    color: '#c084fc',
    fontSize: 11,
    fontWeight: '800'
  },
  submitContainer: {
    marginTop: 10,
    marginBottom: 30
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8
  },
  submitButtonNew: {
    backgroundColor: '#38bdf8'
  },
  submitButtonEdit: {
    backgroundColor: '#10b981'
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 10
  },
  emptyBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#cbd5e1',
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  filterModalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%'
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  filterModalScroll: {
    marginVertical: 10
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    marginTop: 12,
    marginBottom: 6
  },
  filterModalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155'
  },
  filterResetBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  filterResetText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700'
  },
  filterApplyBtn: {
    flex: 2,
    backgroundColor: '#38bdf8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  filterApplyText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900'
  },
  // Auth Modal
  authModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  authModalCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155'
  },
  authModalHeader: {
    alignItems: 'center',
    marginBottom: 16
  },
  authIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  authModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center'
  },
  authModalSub: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4
  },
  authErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 6
  },
  authErrorText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '700',
    flex: 1
  },
  authStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8
  },
  authStatusText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700'
  },
  authInputBox: {
    marginBottom: 12
  },
  authInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 4
  },
  authInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    height: 42
  },
  authTextInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13
  },
  authModalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10
  },
  authCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  authCancelText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700'
  },
  authConfirmBtn: {
    flex: 2,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authConfirmText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900'
  },
  // In-App Result Modal (Success / Error Popup)
  resultModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  resultModalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  resultIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  resultIconSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)'
  },
  resultIconError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)'
  },
  resultModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center'
  },
  resultAuthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    marginBottom: 10,
    gap: 4
  },
  resultAuthBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  resultModalMessage: {
    fontSize: 13,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12
  },
  resultDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    gap: 6
  },
  resultDetailsText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    flex: 1
  },
  resultModalButton: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900'
  },
  // Section 2 Dropdown Cards & Quick Selection
  dropdownCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginBottom: 14
  },
  dropdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  dropdownBadge: {
    backgroundColor: 'rgba(192, 132, 252, 0.15)',
    borderColor: '#c084fc',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  dropdownBadgeText: {
    color: '#c084fc',
    fontSize: 11,
    fontWeight: '800'
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10
  },
  dropdownButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10
  },
  dropdownButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  dropdownButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    flex: 1
  },
  dropdownChangeLabel: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700'
  },
  dropdownIconCircleBranch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dropdownIconCircleDept: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(192, 132, 252, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dropdownIconCircleDesig: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickPillScroll: {
    flexDirection: 'row'
  },
  quickPill: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6
  },
  quickPillActiveBranch: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8'
  },
  quickPillActiveDept: {
    backgroundColor: 'rgba(192, 132, 252, 0.2)',
    borderColor: '#c084fc'
  },
  quickPillActiveDesig: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderColor: '#34d399'
  },
  quickPillText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  quickPillTextActive: {
    color: '#ffffff',
    fontWeight: '800'
  },
  quickPillMore: {
    backgroundColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickPillMoreText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800'
  },
  // Filter Modal Search Trigger Buttons
  filterHeaderWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6
  },
  filterSearchBtnBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 6
  },
  filterSearchBtnTextBranch: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700'
  },
  filterSearchBtnDept: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(192, 132, 252, 0.12)',
    borderRadius: 6
  },
  filterSearchBtnTextDept: {
    color: '#c084fc',
    fontSize: 11,
    fontWeight: '700'
  },
  filterSearchBtnDesig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderRadius: 6
  },
  filterSearchBtnTextDesig: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700'
  },
  // Searchable Picker Modals
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end'
  },
  pickerModalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '85%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: '#334155'
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  pickerModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  pickerModalTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900'
  },
  pickerModalSub: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2
  },
  pickerModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8
  },
  pickerSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 10
  },
  pickerList: {
    maxHeight: 420,
    paddingHorizontal: 16
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  pickerItemRowSelected: {
    borderColor: '#c084fc',
    backgroundColor: 'rgba(192, 132, 252, 0.1)'
  },
  pickerItemRowSelectedDesig: {
    borderColor: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.1)'
  },
  pickerItemRowSelectedBranch: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)'
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  pickerItemIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pickerItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    flex: 1
  },
  pickerItemTextSelected: {
    color: '#ffffff',
    fontWeight: '900'
  },
  pickerCheckmarkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pickerEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8
  },
  pickerEmptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600'
  },
  // Profile Photo Uploader Styles
  photoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 14
  },
  photoAvatarWrapper: {
    position: 'relative',
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2.5,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4
  },
  photoAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  photoCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#0284c7',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center'
  },
  photoActionDetails: {
    flex: 1,
    gap: 4
  },
  photoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2
  },
  photoSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 6
  },
  photoBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)'
  },
  photoActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8'
  },
  photoActionBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)'
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#38bdf8'
  },
  // Photo Picker Modal Styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  photoModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10
  },
  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  photoModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  photoPreviewBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14
  },
  photoModalPreviewImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#38bdf8'
  },
  photoModalOptions: {
    marginTop: 8,
    gap: 8
  },
  photoModalOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155'
  },
  photoModalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  photoModalOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },
  photoModalOptionDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  photoModalCancelBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#334155'
  },
  photoModalCancelText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700'
  }
});
