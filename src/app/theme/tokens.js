/**
 * Brand tokens for the admin panel.
 *
 * Source of truth for the hues is the mobile app's palette
 * (Ecommerce/src/constants/colors.js). Values below are the admin-panel
 * adaptations documented in docs/ADMIN_PANEL_PLAN.md §8.1 — a few are
 * deliberately darker or lighter than the app's so text and icons clear
 * WCAG AA against admin surfaces, which are denser than the app's.
 */

/** Hues taken unchanged from the app, for parity in charts, badges and previews. */
export const ARISE = {
  primary: '#2874F0',
  primaryDark: '#1B5FC7',
  primaryLight: '#EFF6FF',
  ctaYellow: '#FFC200',
  ctaGold: '#FFE11B',
  ratingGreen: '#26A541',
  ratingGreenBg: '#EAF7EC',
  badgeDark: '#212121',
  offerRed: '#CC0C39',
  offerRedLight: '#FBE7EC',
  campaignGradientStart: '#F5443A',
  campaignGradientEnd: '#FF8A3D',
  error: '#FF6161',
  warning: '#FFA41C',
};

export const LIGHT = {
  colorPrimary: ARISE.primary,
  colorPrimaryHover: '#3D83F2',
  colorPrimaryActive: ARISE.primaryDark,
  colorPrimaryBg: ARISE.primaryLight,
  colorSuccess: ARISE.ratingGreen,
  colorSuccessBg: ARISE.ratingGreenBg,
  colorWarning: ARISE.warning,
  colorWarningBg: '#FFF3E0',
  // The app's #FF6161 fails AA on white for text, so destructive text and
  // buttons use the deeper offer red while #FF6161 stays for large accents.
  colorError: ARISE.offerRed,
  colorErrorBg: ARISE.offerRedLight,
  colorErrorAccent: ARISE.error,
  colorInfo: ARISE.primary,
  colorText: '#212121',
  // App's #878787 is 3.5:1 on white — darkened to clear 4.5:1 for body text.
  colorTextSecondary: '#6B6B6B',
  colorTextTertiary: '#8A8A8A',
  colorBgLayout: '#F1F3F6',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBorder: '#E0E0E0',
  colorBorderSecondary: '#F0F0F0',
  colorFillQuaternary: '#F7F8FA',
  // Sidebar is a dark rail in both themes, the way large ops consoles read best.
  colorSiderBg: '#111418',
  colorSiderText: 'rgba(255,255,255,0.72)',
  colorSiderTextActive: '#FFFFFF',
  colorSiderItemActiveBg: 'rgba(40,116,240,0.20)',
  colorHeaderBg: '#FFFFFF',
  colorAccent: ARISE.ctaYellow,
};

export const DARK = {
  // Primary is lifted two steps: #2874F0 on a #181B21 surface is too dim.
  colorPrimary: '#4C8DF6',
  colorPrimaryHover: '#6FA3F8',
  colorPrimaryActive: '#3D83F2',
  colorPrimaryBg: '#16243B',
  colorSuccess: '#3DBE5A',
  colorSuccessBg: '#14271A',
  colorWarning: '#FFB547',
  colorWarningBg: '#2A1F0E',
  colorError: '#FF7A7A',
  colorErrorBg: '#2E1417',
  colorErrorAccent: '#FF7A7A',
  colorInfo: '#4C8DF6',
  colorText: '#E8EAED',
  colorTextSecondary: '#A0A4AB',
  colorTextTertiary: '#7C818B',
  colorBgLayout: '#0F1115',
  colorBgContainer: '#181B21',
  colorBgElevated: '#1F232B',
  colorBorder: '#2A2E36',
  colorBorderSecondary: '#22262D',
  colorFillQuaternary: '#1C2027',
  colorSiderBg: '#13161B',
  colorSiderText: 'rgba(255,255,255,0.70)',
  colorSiderTextActive: '#FFFFFF',
  colorSiderItemActiveBg: 'rgba(76,141,246,0.22)',
  colorHeaderBg: '#181B21',
  colorAccent: ARISE.ctaYellow,
};

/** Shared, theme-independent shape and type scale (plan §8.1). */
export const SHAPE = {
  borderRadius: 6,
  borderRadiusLG: 8,
  borderRadiusSM: 4,
  controlHeight: 36,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyCode: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: 14,
  fontSizeSM: 12,
  fontSizeLG: 16,
  fontSizeHeading1: 30,
  fontSizeHeading2: 24,
  fontSizeHeading3: 20,
  fontSizeHeading4: 16,
  sizeUnit: 4,
  wireframe: false,
};

/** 4-pt spacing scale, used by layout components instead of magic numbers. */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export const LAYOUT = {
  siderWidth: 248,
  siderCollapsedWidth: 64,
  headerHeight: 56,
  contentMaxWidth: 1680,
};
