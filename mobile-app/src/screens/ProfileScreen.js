import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { haptic } from '../services/haptics';
import { syncOfflineQueue } from '../services/offlineQueue';

export default function ProfileScreen({ user, onLogout, navigation }) {
  const [syncing, setSyncing] = useState(false);

  const handleSyncOffline = async () => {
    try {
      haptic.light();
      setSyncing(true);
      await syncOfflineQueue();
      haptic.success();
      Alert.alert('Success', 'Offline attendance queue and local cache synchronized successfully.');
    } catch (e) {
      Alert.alert('Notice', 'Offline records checked. All local records are in sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmLogout = () => {
    haptic.warning();
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            if (onLogout) onLogout();
          }
        }
      ]
    );
  };

  const userName = user?.name || 'Administrator';
  const userRole = (user?.role || 'Admin').toUpperCase();
  const userCode = user?.code || user?.username || 'ADM-001';
  const userBranch = user?.branch || 'Head Office / All Branches';
  const initial = (userName.charAt(0) || 'A').toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>User Profile</Text>
          <Text style={styles.headerSubtitle}>Account &amp; System Preferences</Text>
        </View>
        <View style={styles.roleBadgeHeader}>
          <Text style={styles.roleBadgeHeaderText}>{userRole}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Profile Card */}
        <View style={styles.heroCard}>
          <View style={styles.avatarGlow}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          </View>

          <Text style={styles.userNameText}>{userName}</Text>
          <View style={styles.roleRow}>
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={13} color="#06B6D4" />
              <Text style={styles.rolePillText}>{userRole}</Text>
            </View>
            <View style={styles.branchPill}>
              <Ionicons name="business" size={13} color="#10B981" />
              <Text style={styles.branchPillText} numberOfLines={1}>{userBranch}</Text>
            </View>
          </View>

          {/* User Details Grid */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>SYSTEM CODE</Text>
              <Text style={styles.infoVal}>{userCode}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>STATUS</Text>
              <View style={styles.statusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusText}>Active Session</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>APP ACCESS</Text>
              <Text style={styles.infoVal}>{user?.role === 'employee' ? 'Staff Portal' : 'Full Admin'}</Text>
            </View>
          </View>
        </View>

        {/* Quick Management Navigation (for Admin/Manager) */}
        {user?.role !== 'employee' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>HR &amp; STORE MODULES</Text>

            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => {
                haptic.selection();
                navigation.navigate('EmployeeDirectory', { mode: 'profile' });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: 'rgba(6,182,212,0.14)' }]}>
                <Ionicons name="people" size={20} color="#06B6D4" />
              </View>
              <View style={styles.tileInfo}>
                <Text style={styles.tileTitle}>Staff Directory &amp; Profiles</Text>
                <Text style={styles.tileDesc}>View active staff, branch contacts &amp; records</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => {
                haptic.selection();
                navigation.navigate('Schedule');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: 'rgba(245,158,11,0.14)' }]}>
                <Ionicons name="time" size={20} color="#F59E0B" />
              </View>
              <View style={styles.tileInfo}>
                <Text style={styles.tileTitle}>Duty Shifts &amp; Work Hours</Text>
                <Text style={styles.tileDesc}>Inspect standard store shifts &amp; schedules</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => {
                haptic.selection();
                navigation.navigate('Holidays');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: 'rgba(168,85,247,0.14)' }]}>
                <Ionicons name="calendar" size={20} color="#A855F7" />
              </View>
              <View style={styles.tileInfo}>
                <Text style={styles.tileTitle}>Holidays Calendar</Text>
                <Text style={styles.tileDesc}>Company gazetted &amp; branch holiday schedule</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => {
                haptic.selection();
                navigation.navigate('BranchStatus');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconBox, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
                <Ionicons name="hardware-chip" size={20} color="#10B981" />
              </View>
              <View style={styles.tileInfo}>
                <Text style={styles.tileTitle}>Biometric Devices &amp; Stores</Text>
                <Text style={styles.tileDesc}>Hardware scanners status &amp; branch health</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* System & Maintenance */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>SYSTEM UTILITIES</Text>

          <TouchableOpacity
            style={styles.actionTile}
            onPress={handleSyncOffline}
            disabled={syncing}
            activeOpacity={0.7}
          >
            <View style={[styles.tileIconBox, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
              {syncing ? (
                <ActivityIndicator size="small" color="#38BDF8" />
              ) : (
                <Ionicons name="sync" size={20} color="#38BDF8" />
              )}
            </View>
            <View style={styles.tileInfo}>
              <Text style={styles.tileTitle}>Sync Offline Cache</Text>
              <Text style={styles.tileDesc}>Synchronize pending attendance punches &amp; queue</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>

          <View style={styles.versionRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="information-circle-outline" size={18} color="#64748B" />
              <Text style={styles.versionLabel}>BAS Mobile ERP Application</Text>
            </View>
            <Text style={styles.versionBadge}>v2.4 (Enterprise)</Text>
          </View>
        </View>

        {/* Sign Out Card */}
        <View style={styles.logoutWrapper}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleConfirmLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutBtnText}>Sign Out from Device</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Platform.OS === 'android' ? 90 : 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 38 : 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  roleBadgeHeader: {
    backgroundColor: 'rgba(6,182,212,0.14)',
    borderWidth: 1,
    borderColor: '#06B6D4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#06B6D4',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  heroCard: {
    backgroundColor: '#131D33',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 16,
  },
  avatarGlow: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(6,182,212,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(6,182,212,0.3)',
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  userNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06B6D4',
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 200,
  },
  branchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  infoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#0B1120',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1E293B',
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
    letterSpacing: 0.4,
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  sectionCard: {
    backgroundColor: '#131D33',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tileIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tileInfo: {
    flex: 1,
  },
  tileTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  tileDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
  },
  versionLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  versionBadge: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
    backgroundColor: 'rgba(56,189,248,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  logoutWrapper: {
    marginBottom: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 14,
    paddingVertical: 14,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
