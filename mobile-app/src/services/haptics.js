import * as Haptics from 'expo-haptics';

/**
 * Standardized Haptic Feedback utility for responsive tactile interactions
 */
export const haptic = {
  // Light tap for minor buttons, tabs, date filters
  light: () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
  },

  // Medium impact for card taps, pull-to-refresh, toggles
  medium: () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
  },

  // Heavy impact for destructive or final actions (Logout, Delete, Submit)
  heavy: () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (_) {}
  },

  // Success pattern for login success, data saved, punch recorded
  success: () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}
  },

  // Warning pattern for session timeout alert, unsaved changes
  warning: () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (_) {}
  },

  // Error pattern for network timeout, invalid password, failure
  error: () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (_) {}
  },

  // Subtle selection tick for pickers or list navigation
  selection: () => {
    try {
      Haptics.selectionAsync();
    } catch (_) {}
  }
};
