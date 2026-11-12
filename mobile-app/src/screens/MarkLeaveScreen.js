import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  StatusBar,
  Alert,
  ScrollView,
  Platform 
} from 'react-native';
import api from '../services/api';

export default function MarkLeaveScreen({ route, navigation }) {
  const { employee } = route.params;

  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      Alert.alert('Invalid Format', 'Please enter dates in YYYY-MM-DD format (e.g., 2026-08-27)');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      Alert.alert('Invalid Range', 'Start Date cannot be after End Date');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/mobile/admin/mark-leave', {
        employeeId: employee.id,
        startDate,
        endDate,
        remarks: remarks.trim() || 'Official Leave registered from Mobile App'
      });

      if (response && response.success) {
        Alert.alert(
          'Success', 
          response.message || 'Leave successfully registered!',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', response.message || 'Failed to register leave');
      }
    } catch (error) {
      console.error('Error marking leave:', error);
      Alert.alert('Error', error.message || 'A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.headerTitle}>Register Leave</Text>
          <Text style={styles.headerSubtitle}>For {employee.name} ({employee.code}) • {employee.branch}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.formContainer}>
        {/* Start Date */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>START DATE (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.textInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="e.g. 2026-08-27"
            placeholderTextColor="#64748B"
            maxLength={10}
          />
        </View>

        {/* End Date */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>END DATE (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.textInput}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="e.g. 2026-08-27"
            placeholderTextColor="#64748B"
            maxLength={10}
          />
        </View>

        {/* Remarks */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>REMARKS / REASON</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Specify reason (e.g. Medical leave, Annual leave)"
            placeholderTextColor="#64748B"
            multiline={true}
            numberOfLines={4}
          />
        </View>

        {/* Submit button */}
        <TouchableOpacity 
          style={[styles.submitButton, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>SUBMIT LEAVE REQUEST</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky Bottom Footer Back Button */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.footerBackBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.footerBackBtnText}>← Back to Profile</Text>
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
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 44) : 14,
    paddingBottom: 14,
    backgroundColor: '#131D33',
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
  formContainer: {
    padding: 20,
    paddingBottom: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#131D33',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#F1F5F9',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
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
