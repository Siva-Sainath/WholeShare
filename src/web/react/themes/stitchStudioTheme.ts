import { studioTheme } from "ag-studio";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "./stitchTokens";

export const stitchStudioTheme = studioTheme.withParams({
  backgroundColor: STITCH_COLORS.card,
  foregroundColor: STITCH_COLORS.ink,
  textColor: STITCH_COLORS.ink,
  accentColor: STITCH_COLORS.blue,
  borderColor: STITCH_COLORS.border,
  fontFamily: STITCH_TYPOGRAPHY.sans,
  studioWidgetBorderRadius: 8,
  gridHeaderTextColor: STITCH_COLORS.muted,
  gridRowHeight: 44
});

