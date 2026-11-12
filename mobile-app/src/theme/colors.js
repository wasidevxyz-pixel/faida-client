/**
 * BAS Mobile Enterprise Dark Theme Tokens
 * Matches the Reference Screenshot Dark Navy & Glowing Cyan Palette
 */
export const colors = {
  // Brand Accents
  primary: '#0284C7',          // Sky Blue Primary
  primaryLight: '#38BDF8',     // Cyan/Sky Accent
  primaryDark: '#0369A1',      // Deep Sky
  cyan: '#00D2FF',             // Electric Cyan
  emerald: '#10B981',          // Success Emerald
  success: '#10B981',
  warning: '#F59E0B',          // Amber
  danger: '#EF4444',           // Crimson Red

  // Surfaces & Backgrounds (Dark Navy Blue Gradient)
  background: '#070D1E',       // Deep Navy Blue (App Background)
  surface: '#0B1832',          // Elevated Card Surface
  card: '#0B1832',             // Card Background
  surfaceSubtle: '#0E1B33',    // Input & Chip Background
  border: 'rgba(56, 189, 248, 0.2)', // Subtle Cyan Border
  borderLight: 'rgba(255, 255, 255, 0.08)', // Subtle light border
  borderDark: '#1E293B',       // High Contrast Border
  borderCyanGlow: 'rgba(56, 189, 248, 0.35)',

  // KPI Gradients
  gradientSales: ['#047857', '#10B981'],
  gradientCost: ['#0284C7', '#00B4D8'],
  gradientPaid: ['#6366F1', '#8B5CF6'],
  gradientBalance: ['#EF4444', '#F43F5E'],

  // Typography
  textPrimary: '#FFFFFF',      // Pure White Headings
  textLight: '#F8FAFC',        // Bright White
  textSecondary: '#7E9BBE',    // Muted Slate Text
  textMuted: '#64748B',        // Inactive / Placeholder
  textCyan: '#38BDF8',         // Accent Cyan Text
  textInverse: '#070D1E',      // Text on light backgrounds

  // Shadows
  shadow: {
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  }
};

export const Colors = colors;
export default colors;
