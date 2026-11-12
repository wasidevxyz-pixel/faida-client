import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../../services/haptics';
import { colors } from '../../theme/colors';

export default function HeaderBar({
  title,
  subtitle,
  onBack,
  rightAction,
  rightIcon,
  rightLabel,
  branchName,
  badgeText
}) {
  const handleBack = () => {
    haptic.light();
    if (onBack) onBack();
  };

  const handleRightPress = () => {
    haptic.medium();
    if (rightAction) rightAction();
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusBarSpacer} />
      <View style={styles.contentRow}>
        {/* Left: Back button or icon */}
        {onBack ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textLight} />
          </TouchableOpacity>
        ) : (
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>BAS</Text>
          </View>
        )}

        {/* Center: Title & Subtitle */}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title || 'BAS Mobile ERP'}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : branchName ? (
            <View style={styles.branchPill}>
              <View style={styles.branchDot} />
              <Text style={styles.branchText} numberOfLines={1}>
                {branchName}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Right Action or Badge */}
        {rightAction ? (
          <TouchableOpacity
            style={[styles.iconButton, rightLabel ? styles.labelButton : null]}
            onPress={handleRightPress}
            activeOpacity={0.7}
          >
            {rightIcon && <Ionicons name={rightIcon} size={20} color={colors.cyan} />}
            {rightLabel ? (
              <Text style={styles.rightButtonText}>{rightLabel}</Text>
            ) : null}
          </TouchableOpacity>
        ) : badgeText ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  statusBarSpacer: {
    height: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 24),
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  logoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  logoBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.cyan,
    letterSpacing: 0.5,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textLight,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 3,
  },
  branchDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.emerald,
    marginRight: 5,
  },
  branchText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  labelButton: {
    width: 'auto',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rightButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.cyan,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.emerald,
  },
  placeholder: {
    width: 38,
  }
});
