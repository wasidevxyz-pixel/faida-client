import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../../services/haptics';

// Dashboard-matched Navigation Tabs
const ADMIN_TABS = [
  {
    id: 'Dashboard',
    label: 'Home',
    icon: 'grid-outline',
    iconActive: 'grid',
  },
  {
    id: 'WHReports',
    label: 'Warehouse',
    icon: 'cube-outline',
    iconActive: 'cube',
  },
  {
    id: 'Attendance',
    label: 'Attendance',
    icon: 'finger-print-outline',
    iconActive: 'finger-print',
  },
  {
    id: 'EmpSalaryReports',
    label: 'Salaries',
    icon: 'wallet-outline',
    iconActive: 'wallet',
  },
  {
    id: 'EmployeeAdvance',
    label: 'Advances',
    icon: 'cash-outline',
    iconActive: 'cash',
  },
  {
    id: 'EmployeeDirectory',
    label: 'Staff',
    icon: 'people-outline',
    iconActive: 'people',
  },
  {
    id: 'Profile',
    label: 'Profile',
    icon: 'person-circle-outline',
    iconActive: 'person-circle',
  },
];

const EMPLOYEE_TABS = [
  {
    id: 'Dashboard',
    label: 'Home',
    icon: 'grid-outline',
    iconActive: 'grid',
  },
  {
    id: 'Attendance',
    label: 'My Logs',
    icon: 'finger-print-outline',
    iconActive: 'finger-print',
  },
  {
    id: 'EmployeeFinancials',
    label: 'Pay Slips',
    icon: 'receipt-outline',
    iconActive: 'receipt',
  },
  {
    id: 'Schedule',
    label: 'Duty Shift',
    icon: 'time-outline',
    iconActive: 'time',
  },
  {
    id: 'Profile',
    label: 'Profile',
    icon: 'person-circle-outline',
    iconActive: 'person-circle',
  },
];

// Single Tab Item with authentic macOS Dock physics & Dashboard Cyan/Navy theme
function MacDockTabItem({ tab, isActive, onPress }) {
  const liftAnim = useRef(new Animated.Value(isActive ? -4 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(isActive ? 1.12 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(liftAnim, {
        toValue: isActive ? -4 : 0,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.12 : 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  const handlePress = () => {
    // macOS Dock interactive bounce sequence
    Animated.sequence([
      Animated.timing(liftAnim, {
        toValue: -9,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(liftAnim, {
        toValue: -4,
        friction: 4,
        tension: 160,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={handlePress}
      activeOpacity={0.85}
      hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
    >
      <Animated.View
        style={[
          styles.iconSquircle,
          isActive ? styles.iconSquircleActive : styles.iconSquircleInactive,
          {
            transform: [
              { translateY: liftAnim },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Apple macOS squircle top specular gloss */}
        {isActive && <View style={styles.squircleGloss} />}
        
        <Ionicons
          name={isActive ? tab.iconActive : tab.icon}
          size={isActive ? 23 : 21}
          color={isActive ? '#38BDF8' : '#7E9BBE'}
        />
      </Animated.View>

      <Text
        style={[
          styles.tabLabel,
          isActive ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
        numberOfLines={1}
      >
        {tab.label}
      </Text>

      {/* macOS Dock Indicator Dot */}
      {isActive ? (
        <View style={styles.macIndicatorDot} />
      ) : (
        <View style={styles.indicatorPlaceholder} />
      )}
    </TouchableOpacity>
  );
}

export default function BottomNavBar({
  activeScreen = 'Dashboard',
  onNavigate,
  userRole = ''
}) {
  const tabs = userRole === 'employee' ? EMPLOYEE_TABS : ADMIN_TABS;

  const handleTabPress = (tabId) => {
    if (tabId === activeScreen) return;
    try {
      haptic.selection();
    } catch {}
    if (onNavigate) {
      onNavigate(tabId);
    }
  };

  return (
    <View style={styles.outerWrapper}>
      {/* macOS Frosted Glass Dock Container in Dashboard Navy */}
      <View style={styles.macDockContainer}>
        {/* Signature macOS Glass Reflection Bevel */}
        <View style={styles.specularBevel} />

        <View style={styles.tabsRow}>
          {tabs.map((tab) => {
            const isActive = activeScreen === tab.id;
            return (
              <MacDockTabItem
                key={tab.id}
                tab={tab}
                isActive={isActive}
                onPress={() => handleTabPress(tab.id)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    marginHorizontal: 10,
    // Clear Android system navigation bar (Back / Home / Recents 3-button bar)
    marginBottom: Platform.OS === 'android' ? 56 : 24,
    alignItems: 'center',
    position: 'relative',
  },
  macDockContainer: {
    width: '100%',
    backgroundColor: 'rgba(11, 24, 50, 0.96)', // Exact Dashboard Navy Surface
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(56, 189, 248, 0.28)', // Exact Dashboard Cyan Glow Border
    borderTopWidth: 1.6,
    borderTopColor: 'rgba(56, 189, 248, 0.55)', // Apple top highlight reflection
    paddingVertical: 9,
    paddingHorizontal: 2,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 18,
    position: 'relative',
  },
  specularBevel: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1.2,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
  },
  iconSquircle: {
    width: 40,
    height: 34,
    borderRadius: 11, // macOS squircle ratio
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  iconSquircleInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  iconSquircleActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.22)',
    borderWidth: 1.2,
    borderColor: 'rgba(56, 189, 248, 0.65)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  squircleGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  tabLabel: {
    fontSize: 9.2,
    letterSpacing: -0.2,
    marginTop: 2.5,
  },
  tabLabelInactive: {
    color: '#7E9BBE',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },
  macIndicatorDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#38BDF8',
    marginTop: 2,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 4,
  },
  indicatorPlaceholder: {
    width: 4.5,
    height: 4.5,
    marginTop: 2,
  },
});
