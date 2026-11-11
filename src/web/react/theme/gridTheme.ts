import { themeQuartz } from "ag-grid-community";
import { studioTheme } from "ag-studio";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "../themes/stitchTokens";

// One AG Grid and AG Studio look for the whole app, matching the Astryx surfaces.
const shared = {
  backgroundColor: STITCH_COLORS.card,
  foregroundColor: STITCH_COLORS.ink,
  textColor: STITCH_COLORS.ink,
  accentColor: STITCH_COLORS.blue,
  borderColor: "#EDE9DF",
  fontFamily: STITCH_TYPOGRAPHY.sans,
  fontSize: 14
};

export const wsGridTheme = themeQuartz.withParams({
  ...shared,
  chromeBackgroundColor: STITCH_COLORS.canvas,
  headerBackgroundColor: STITCH_COLORS.canvas,
  headerTextColor: STITCH_COLORS.muted,
  headerFontFamily: STITCH_TYPOGRAPHY.sans,
  headerFontSize: 13,
  headerFontWeight: 600,
  rowHoverColor: "rgba(0, 112, 186, 0.045)",
  selectedRowBackgroundColor: "rgba(0, 112, 186, 0.09)",
  oddRowBackgroundColor: STITCH_COLORS.card,
  headerHeight: 42,
  rowHeight: 56,
  spacing: 8,
  borderRadius: 10,
  wrapperBorderRadius: 12,
  columnBorder: false,
  rowBorder: true,
  cellHorizontalPadding: 16
});

// AG Studio and its charts: compact semibold titles, a branded series palette, quiet grid lines.
// Typography, shape and palette follow the same pattern as AG Grid's own Studio demos.
const SANS = STITCH_TYPOGRAPHY.sans;

export const wsStudioTheme = studioTheme.withParams({
  fontFamily: SANS,
  fontSize: 14,
  accentColor: STITCH_COLORS.blue,
  backgroundColor: STITCH_COLORS.card,
  foregroundColor: STITCH_COLORS.ink,
  borderColor: "#E7E2D8",
  browserColorScheme: "light",
  studioWrapperBackgroundColor: "#F4F0E8",
  studioCanvasBackgroundColor: "#F4F0E8",
  studioPanelHeaderFontFamily: SANS,
  studioPanelHeaderFontSize: 13,
  studioPanelHeaderFontWeight: 600,
  studioWidgetTitleFontFamily: SANS,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600,
  studioWidgetSubtitleFontFamily: SANS,
  studioWidgetSubtitleFontSize: 13,
  studioWidgetCaptionFontFamily: SANS,
  studioWidgetCaptionFontSize: 14,
  studioWidgetBorderRadius: 12,
  gridFontFamily: SANS,
  gridFontSize: 13,
  gridHeaderFontFamily: SANS,
  gridHeaderFontSize: 12,
  gridHeaderFontWeight: 600,
  gridCellFontFamily: SANS,
  gridCellFontSize: 13,
  gridRowBorder: true,
  chartFontFamily: SANS,
  chartTooltipBorder: false,
  chartGridLineColor: "#EFEBE3",
  spacing: 9,
  borderRadius: 8,
  chartPaletteFills1Color: "#0070BA",
  chartPaletteFills2Color: "#FFC439",
  chartPaletteFills3Color: "#19B5C9",
  chartPaletteFills4Color: "#F2545B",
  chartPaletteFills5Color: "#8B6CF0",
  chartPaletteFills6Color: "#2FA66A",
  chartPaletteStrokes1Color: "#0070BA",
  chartPaletteStrokes2Color: "#FFC439",
  chartPaletteStrokes3Color: "#19B5C9",
  chartPaletteStrokes4Color: "#F2545B",
  chartPaletteStrokes5Color: "#8B6CF0",
  chartPaletteStrokes6Color: "#2FA66A"
});
