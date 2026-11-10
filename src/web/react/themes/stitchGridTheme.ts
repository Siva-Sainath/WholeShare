import { themeQuartz } from "ag-grid-community";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "./stitchTokens";

export const stitchGridTheme = themeQuartz.withParams({
  backgroundColor: STITCH_COLORS.card,
  foregroundColor: STITCH_COLORS.ink,
  textColor: STITCH_COLORS.ink,
  accentColor: STITCH_COLORS.blue,
  borderColor: STITCH_COLORS.border,
  chromeBackgroundColor: STITCH_COLORS.surface,
  headerBackgroundColor: STITCH_COLORS.card,
  headerTextColor: STITCH_COLORS.muted,
  headerFontFamily: STITCH_TYPOGRAPHY.sans,
  fontFamily: STITCH_TYPOGRAPHY.sans,
  rowHoverColor: STITCH_COLORS.surfaceHover,
  selectedRowBackgroundColor: "rgba(0, 112, 186, 0.08)",
  oddRowBackgroundColor: STITCH_COLORS.card,
  headerHeight: 44,
  rowHeight: 48,
  borderRadius: 8,
  wrapperBorderRadius: 8
});

