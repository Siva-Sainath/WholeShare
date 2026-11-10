/**
 * WholeShare Master Design Tokens: Stitch Light
 * Single Source of Truth for Colors, Typography, Spacing, Shadows, and Motion.
 */

export const STITCH_DESIGN_TOKENS = {
  colors: {
    // Surfaces
    canvas: "#FAF8F3",
    sidebar: "#FFFFFF",
    surface: "#F4EFEB",
    elevated: "#FFFFFF",
    card: "#FFFFFF",
    border: "#E7E2D8",
    borderSubtle: "#EFECE6",
    borderHairline: "1px solid #E7E2D8",
    hover: "#F6F4EE",
    active: "rgba(0, 112, 186, 0.08)",
    overlay: "rgba(15, 31, 46, 0.4)",

    // Typography
    textPrimary: "#0F1F2E",
    textSecondary: "#1C3146",
    textMuted: "#5C6A79",

    // Accents & Financial States
    paypalBlue: "#0070ba",
    paypalGold: "#ffc439",
    settled: "#10b981",
    warning: "#f59e0b",
    dispute: "#ef4444"
  },

  fonts: {
    sans: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", monospace'
  },

  typeScale: {
    xs: { fontSize: "12px", lineHeight: "16px" },
    sm: { fontSize: "14px", lineHeight: "20px" },
    base: { fontSize: "16px", lineHeight: "24px" },
    lg: { fontSize: "18px", lineHeight: "28px" },
    xl: { fontSize: "20px", lineHeight: "28px" },
    "2xl": { fontSize: "24px", lineHeight: "32px" },
    "3xl": { fontSize: "30px", lineHeight: "36px" },
    "4xl": { fontSize: "36px", lineHeight: "40px" },
    "5xl": { fontSize: "48px", lineHeight: "48px" },
    "6xl": { fontSize: "60px", lineHeight: "60px" }
  },

  spacing: {
    0: "0px",
    25: "2px",
    50: "4px",
    75: "8px",
    100: "12px",
    150: "16px",
    200: "24px",
    250: "32px",
    300: "40px",
    350: "48px",
    400: "64px",
    500: "80px",
    600: "96px"
  },

  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px"
  },

  shadows: {
    sm: "0 1px 3px rgba(15, 31, 46, 0.05)",
    md: "0 4px 16px rgba(15, 31, 46, 0.06)",
    lg: "0 20px 48px -12px rgba(15, 31, 46, 0.12)"
  },

  motion: {
    baseEase: "cubic-bezier(0.22, 1, 0.36, 1)",
    fast: "150ms",
    normal: "250ms",
    slow: "600ms",
    pressScale: "scale(0.98)"
  }
} as const;

export const OBSIDIAN_TREASURY = STITCH_DESIGN_TOKENS;

export function getCssVariables(): string {
  const c = STITCH_DESIGN_TOKENS.colors;
  const f = STITCH_DESIGN_TOKENS.fonts;
  const s = STITCH_DESIGN_TOKENS.shadows;
  const r = STITCH_DESIGN_TOKENS.radius;
  const m = STITCH_DESIGN_TOKENS.motion;

  return `
:root {
  --ws-bg-canvas: ${c.canvas};
  --ws-bg-sidebar: ${c.sidebar};
  --ws-bg-surface: ${c.surface};
  --ws-bg-elevated: ${c.elevated};
  --ws-bg-card: ${c.card};
  --ws-bg-subtle: ${c.surface};
  --ws-bg-hover: ${c.hover};
  --ws-bg-active: ${c.active};
  --ws-bg-overlay: ${c.overlay};

  --ws-border-hairline: ${c.borderHairline};
  --ws-border-subtle: ${c.borderSubtle};
  --ws-border-strong: ${c.border};
  --ws-border-focus: ${c.paypalBlue};

  --ws-text-primary: ${c.textPrimary};
  --ws-text-secondary: ${c.textSecondary};
  --ws-text-muted: ${c.textMuted};
  --ws-text-inverse: #FFFFFF;

  --ws-accent-paypal: ${c.paypalBlue};
  --ws-accent-wholesale: ${c.paypalGold};
  --ws-accent-settled: ${c.settled};
  --ws-accent-warning: ${c.warning};
  --ws-accent-dispute: ${c.dispute};

  --ws-font-sans: ${f.sans};
  --ws-font-mono: ${f.mono};

  --ws-shadow-sm: ${s.sm};
  --ws-shadow-md: ${s.md};
  --ws-shadow-lg: ${s.lg};

  --ws-radius-sm: ${r.sm};
  --ws-radius-md: ${r.md};
  --ws-radius-lg: ${r.lg};
  --ws-radius-xl: ${r.xl};
  --ws-radius-full: ${r.full};

  --ws-ease-base: ${m.baseEase};
  --ws-duration-fast: ${m.fast};
  --ws-duration-normal: ${m.normal};
  --ws-duration-slow: ${m.slow};
}
`;
}
