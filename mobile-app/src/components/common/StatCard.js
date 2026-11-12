import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../../services/haptics';
import { colors } from '../../theme/colors';

export default function StatCard({
  title,
  value,
  subtitle,
  iconName = 'stats-chart',
  iconColor = colors.cyan,
  accentColor = colors.cyan,
  trend,
  trendPositive = true,
  onPress,
  style
}) {
  const handlePress = () => {
    if (onPress) {
      haptic.selection();
      onPress();
    }
  };

  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper
      style={[
        styles.card,
        { borderLeftColor: accentColor },
        style
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}1A` }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        {trend !== undefined && trend !== null && (
          <View
            style={[
              styles.trendBadge,
              {
                backgroundColor: trendPositive
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              }
            ]}
          >
            <Ionicons
              name={trendPositive ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={trendPositive ? colors.emerald : colors.danger}
            />
            <Text
              style={[
                styles.trendText,
                { color: trendPositive ? colors.emerald : colors.danger }
              ]}
            >
              {trend}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textLight,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  }
});
