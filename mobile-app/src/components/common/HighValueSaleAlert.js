import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions
} from 'react-native';
import { colors } from '../../theme/colors';
import { haptic } from '../../services/haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function HighValueSaleAlert({
  visible,
  sale,
  onDismiss,
  duration = 6000
}) {
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (visible && sale) {
      haptic.warning();
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, sale, duration, slideAnim]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!visible || !sale) return null;

  const formattedAmount = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(sale.totalAmount || sale.amount || 0);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.innerCard}
        onPress={handleDismiss}
        activeOpacity={0.9}
      >
        <View style={styles.iconBadge}>
          <Text style={{ fontSize: 20 }}>💰</Text>
        </View>

        <View style={styles.infoCol}>
          <View style={styles.topRow}>
            <Text style={styles.badgeText}>HIGH-VALUE SALE</Text>
            <Text style={styles.branchText}>{sale.branch || 'Central ERP'}</Text>
          </View>
          <Text style={styles.amountText}>PKR {formattedAmount}</Text>
          <Text style={styles.customerText} numberOfLines={1}>
            {sale.customerName ? `Customer: ${sale.customerName}` : 'Cash Sale Completed'}
          </Text>
        </View>

        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  innerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoCol: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  badgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  branchText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  amountText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  customerText: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
});
