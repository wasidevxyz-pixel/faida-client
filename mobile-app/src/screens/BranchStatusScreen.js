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

export default function BranchStatusScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');

  const fetchBranches = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getBranches();
      if (res.success) {
        setBranches(res.data || []);
      } else {
        setError(res.message || 'Failed to load branches');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBranches();
  };

  const formatLastSeen = (isoStr) => {
    if (!isoStr) return 'Never Connected';
    const date = new Date(isoStr);
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'short'
    });
  };

  const renderBranchItem = ({ item }) => {
    const branchName = typeof item === 'string' ? item : (item.branch || item.name || 'Branch');
    const branchCode = typeof item === 'object' ? (item.branchCode || item.code || 'N/A') : 'N/A';
    const punchesToday = typeof item === 'object' ? (item.punchesToday || 0) : 0;
    const isOnline = typeof item === 'object' ? (item.status === 'ONLINE' || item.isOnline || punchesToday > 0) : true;
    const deviceOnline = typeof item === 'object' ? (item.deviceOnline !== undefined ? item.deviceOnline : isOnline) : true;
    const bridgeOnline = typeof item === 'object' ? (item.bridgeOnline !== undefined ? item.bridgeOnline : isOnline) : true;
    const lastSeen = typeof item === 'object' ? item.lastSeen : null;

    return (
      <View style={styles.branchCard}>
        <View style={styles.mainInfo}>
          <View>
            <Text style={styles.branchName}>{branchName}</Text>
            <Text style={styles.branchCode}>CODE: {branchCode}</Text>
          </View>
          <View style={[styles.statusBadge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
            <Text style={[styles.badgeText, isOnline ? styles.textOnline : styles.textOffline]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {punchesToday > 0 && (
          <View style={[styles.deviceRow, { backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 6, borderRadius: 6, marginVertical: 4 }]}>
            <Text style={[styles.deviceLabel, { color: '#10B981', fontWeight: '700' }]}>⚡ Live Attendance Today:</Text>
            <Text style={[styles.deviceVal, { color: '#10B981', fontWeight: '800' }]}>
              {punchesToday} Machine Punches
            </Text>
          </View>
        )}

        <View style={styles.deviceRow}>
          <Text style={styles.deviceLabel}>Biometric Device:</Text>
          <Text style={[styles.deviceVal, { color: deviceOnline ? '#10B981' : '#EF4444' }]}>
            {deviceOnline ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
        </View>

        <View style={styles.deviceRow}>
          <Text style={styles.deviceLabel}>Bridge Service:</Text>
          <Text style={[styles.deviceVal, { color: bridgeOnline ? '#10B981' : '#EF4444' }]}>
            {bridgeOnline ? '🟢 Running' : '🔴 Offline'}
          </Text>
        </View>

        <View style={styles.lastSeenRow}>
          <Text style={styles.lastSeenLabel}>Last Sync / Activity:</Text>
          <Text style={styles.lastSeenVal}>{formatLastSeen(lastSeen)}</Text>
        </View>
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
          <Text style={styles.headerTitle}>Biometric Devices & Sync</Text>
          <Text style={styles.headerSubtitle}>Real-time Branch Connectivity</Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* List Container */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
        </View>
      ) : branches.length > 0 ? (
        <FlatList
          data={branches}
          keyExtractor={(item) => item.branchCode || item.branch}
          renderItem={renderBranchItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38BDF8']} />}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38BDF8']} />}
          contentContainerStyle={styles.emptyContainer}
        >
          <Text style={styles.emptyText}>No branch bridge records found.</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  branchCard: {
    backgroundColor: '#131D33',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  mainInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
    paddingBottom: 12,
    marginBottom: 12,
  },
  branchName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  branchCode: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  badgeOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  textOnline: {
    color: '#10B981',
  },
  textOffline: {
    color: '#EF4444',
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  deviceLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  deviceVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  lastSeenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lastSeenLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  lastSeenVal: {
    fontSize: 13,
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
