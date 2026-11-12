import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * Enterprise Shimmer Skeleton Placeholder
 * Smooth 60fps pulsating animation for loading states.
 */
export function SkeletonItem({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
  children
}) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width,
          height,
          borderRadius,
          opacity: pulseAnim,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Skeleton Card for KPI / StatCards
 */
export function SkeletonCard({ height = 110, style }) {
  return (
    <View style={[styles.cardContainer, { height }, style]}>
      <View style={styles.cardHeader}>
        <SkeletonItem width={36} height={36} borderRadius={10} />
        <SkeletonItem width={60} height={18} borderRadius={6} />
      </View>
      <SkeletonItem width="70%" height={22} borderRadius={6} style={{ marginTop: 12 }} />
      <SkeletonItem width="40%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
}

/**
 * Full Dashboard Skeleton Loader (Grid + Chart placeholder)
 */
export function DashboardSkeleton() {
  return (
    <View style={styles.dashboardContainer}>
      {/* Search & Filter Bar Placeholder */}
      <View style={styles.filterRow}>
        <SkeletonItem width="65%" height={42} borderRadius={12} />
        <SkeletonItem width="30%" height={42} borderRadius={12} />
      </View>

      {/* KPI Cards Grid */}
      <View style={styles.gridRow}>
        <SkeletonCard style={{ flex: 1, marginRight: 6 }} />
        <SkeletonCard style={{ flex: 1, marginLeft: 6 }} />
      </View>
      <View style={styles.gridRow}>
        <SkeletonCard style={{ flex: 1, marginRight: 6 }} />
        <SkeletonCard style={{ flex: 1, marginLeft: 6 }} />
      </View>

      {/* Chart Section Placeholder */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <SkeletonItem width={140} height={18} borderRadius={6} />
          <SkeletonItem width={80} height={18} borderRadius={6} />
        </View>
        <SkeletonItem width="100%" height={150} borderRadius={12} style={{ marginTop: 16 }} />
      </View>

      {/* Breakdown List Placeholder */}
      <View style={styles.listCard}>
        <SkeletonItem width={120} height={18} borderRadius={6} style={{ marginBottom: 12 }} />
        <SkeletonItem width="100%" height={48} borderRadius={10} style={{ marginBottom: 8 }} />
        <SkeletonItem width="100%" height={48} borderRadius={10} style={{ marginBottom: 8 }} />
        <SkeletonItem width="100%" height={48} borderRadius={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: '#1E293B',
  },
  cardContainer: {
    backgroundColor: colors?.cardBg || '#131D33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashboardContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: colors?.cardBg || '#131D33',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listCard: {
    backgroundColor: colors?.cardBg || '#131D33',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
});

export default {
  SkeletonItem,
  SkeletonCard,
  DashboardSkeleton,
};
