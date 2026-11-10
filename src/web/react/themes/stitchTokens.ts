// Stitch design tokens for WholeShare.
// Extracted from the newest Stitch export nodes.
// Canonical source is Discover. It has the most complete hand written config.
// Generated Material nodes use a different blue grey palette. That palette is excluded here.
// Green is not a brand color. Emerald appears only as a status color.
// Gold is the single primary call to action color. Blue is the only accent.

export const STITCH_COLORS = {
  canvas: '#FAF8F3',
  card: '#FFFFFF',
  surface: '#F4EFEB',
  surfaceHover: '#F6F4EE',
  ink: '#0F1F2E',
  inkLight: '#1C3146',
  text: '#0F1F2E',
  muted: '#5C6A79',
  mutedLight: '#8D9CAE',
  border: '#E7E2D8',
  borderSubtle: '#EFECE6',
  scrollbarThumb: '#D7D0C5',
  blue: '#0070BA',
  blueHover: '#005EA6',
  blueDark: '#003087',
  blueLight: '#EBF4FA',
  blueDeep: '#005792',
  bluePale: '#D1E4FF',
  gold: '#FFC439',
  goldHover: '#F2B82F',
  goldDeep: '#EAA820',
  status: {
    successText: 'emerald-700',
    successDot: 'emerald-500',
    warningText: 'amber-800',
    warningFill: 'amber-500',
    warningBg: 'amber-100',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
  },
} as const;

export const STITCH_TYPOGRAPHY = {
  sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', monospace",
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  labelCaps: { size: '11px', lineHeight: '16px', letterSpacing: '0.06em', weight: 600 },
  labelNumericSm: { size: '12px', lineHeight: '16px', letterSpacing: '0em', weight: 500 },
  bodySm: { size: '13px', lineHeight: '18px', letterSpacing: '0em', weight: 400 },
  bodyMd: { size: '14px', lineHeight: '20px', letterSpacing: '0em', weight: 400 },
  labelNumericMd: { size: '14px', lineHeight: '20px', letterSpacing: '-0.01em', weight: 500 },
  bodyLg: { size: '16px', lineHeight: '24px', letterSpacing: '-0.005em', weight: 400 },
  headlineSm: { size: '18px', lineHeight: '26px', letterSpacing: '-0.01em', weight: 600 },
  labelNumericLg: { size: '20px', lineHeight: '26px', letterSpacing: '-0.02em', weight: 500 },
  headlineMd: { size: '22px', lineHeight: '30px', letterSpacing: '-0.015em', weight: 600 },
  headlineLg: { size: '28px', lineHeight: '36px', letterSpacing: '-0.02em', weight: 600 },
  displayHeroMobile: { size: '30px', lineHeight: '38px', letterSpacing: '-0.02em', weight: 600 },
  displayHero: { size: '40px', lineHeight: '48px', letterSpacing: '-0.03em', weight: 600 },
} as const;

export const STITCH_SPACING = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '40px',
  gutter: '24px',
  margin: '24px',
  marginLg: '48px',
} as const;

export const STITCH_RADIUS = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  hero: '32px',
  full: '9999px',
} as const;

export const STITCH_SHADOWS = {
  subtle: '0 1px 3px rgba(15, 31, 46, 0.05)',
  card: '0 4px 16px rgba(15, 31, 46, 0.06)',
  nav: '0 1px 8px rgba(15, 31, 46, 0.04)',
  pill: '0 4px 20px -2px rgba(15, 31, 46, 0.05)',
  glassCard: '0 10px 30px -5px rgba(15, 31, 46, 0.04), 0 2px 6px -1px rgba(15, 31, 46, 0.02)',
  glassDark: '0 10px 30px -5px rgba(0, 0, 0, 0.25)',
  glass: '0 20px 48px -12px rgba(15, 31, 46, 0.08), 0 4px 16px -2px rgba(15, 31, 46, 0.03)',
  glassXl: '0 25px 60px -15px rgba(15, 31, 46, 0.12), 0 8px 24px -4px rgba(15, 31, 46, 0.04)',
} as const;

export const STITCH_GLASS = {
  blur: '16px',
  blurNav: '12px',
  blurNavStrong: '24px',
  pillBg: 'rgba(255, 255, 255, 0.88)',
  cardBg: 'rgba(255, 255, 255, 0.92)',
  darkBg: 'rgba(15, 31, 46, 0.96)',
  navBg: 'rgba(255, 255, 255, 0.85)',
  headerBg: 'rgba(255, 255, 255, 0.95)',
  border: '#E7E2D8',
  borderDark: 'rgba(255, 255, 255, 0.12)',
} as const;

export const STITCH_MOSAIC = {
  tiles: [
    { fill: '#0070BA', opacity: 0.85 },
    { fill: '#0070BA', opacity: 0.45 },
    { fill: '#FFC439', opacity: 1 },
    { fill: '#0070BA', opacity: 0.6 },
    { fill: '#0070BA', opacity: 1 },
    { fill: '#0F1F2E', opacity: 0.2 },
  ],
  compactTiles: ['#0070BA', '#FFC439', '#005792', '#D1E4FF'],
  sizes: [32, 40, 48],
  minSize: 20,
  clearSpace: '1X',
} as const;

export const STITCH_TOKENS = {
  colors: STITCH_COLORS,
  typography: STITCH_TYPOGRAPHY,
  spacing: STITCH_SPACING,
  radius: STITCH_RADIUS,
  shadows: STITCH_SHADOWS,
  glass: STITCH_GLASS,
  mosaic: STITCH_MOSAIC,
} as const;
