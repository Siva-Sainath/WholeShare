/**
 * WholeShare Production AG Studio Shipped Report State
 *
 * Pattern adapted from AG Grid Blog: "Build a payments dashboard without building a dashboard"
 * and AG Studio Community Showcase (https://www.ag-grid.com/studio/community/).
 *
 * Features:
 * 1. KPI/Value Widget: Total Escrow Committed ($USD) with full xSpan 12 width
 * 2. Bar/Column Chart: Escrow Volume by Group ($USD) across full xSpan 12 width
 * 3. Table/Grid: Member Authorizations & Status (fake PayPal order IDs removed)
 * Plus active page-level filters for Group Status and SKU Name.
 *
 * Themed to Stitch light: Canvas #FAF8F3, Card #FFFFFF, Border #E7E2D8, Accent #0070BA.
 */

export const SHIPPED_STUDIO_STATE: any = {
  version: "3.1.0",
  selectedPageId: "page-escrow-summary",
  panels: {
    filters: {
      collapsed: false,
      width: 260
    }
  },
  pages: [
    {
      id: "page-escrow-summary",
      name: "Escrow & Group Intelligence",
      layout: {
        type: "widget",
        columns: 12,
        rowHeight: 44,
        widgetPadding: 12,
        backgroundColor: "transparent",
        widgetBackgroundColor: "#FFFFFF",
        widgetBorderEnabled: true,
        widgetBorderRadius: 8,
        widgetBorderColor: "#E7E2D8"
      },
      widgets: {
        "widget-kpi-escrow": {
          id: "widget-kpi-escrow",
          type: "value",
          format: {
            title: { text: "Total Escrow Committed", enabled: true },
            style: {
              typography: { fontSize: 28, fontWeight: "bold" },
              color: "#0070BA",
              verticalAlign: "center",
              textAlign: "left"
            }
          },
          dataMapping: {
            value: [{ id: "coalitions.totalEscrowUsd", aggregation: "sum" }]
          }
        },
        "widget-chart-escrow": {
          id: "widget-chart-escrow",
          type: "column-chart-grouped",
          format: {
            title: { text: "Escrow Volume by Group", enabled: true }
          },
          dataMapping: {
            categoryKey: [{ id: "coalitions.sku" }],
            valueKey: [{ id: "coalitions.totalEscrowUsd", aggregation: "sum" }]
          }
        },
        "widget-grid-members": {
          id: "widget-grid-members",
          type: "grid",
          format: {
            title: { text: "Member Commitments & Authorizations", enabled: true },
            style: {
              columnAutoSize: true
            }
          },
          dataMapping: {
            cols: [
              { id: "memberships.name" },
              { id: "memberships.pledgedUnits" },
              { id: "memberships.authorizedUsd" },
              { id: "memberships.status" }
            ]
          }
        }
      },
      widgetLayout: {
        "widget-kpi-escrow": {
          xTrack: 0,
          yTrack: 0,
          xSpan: 12,
          ySpan: 3
        },
        "widget-chart-escrow": {
          xTrack: 0,
          yTrack: 3,
          xSpan: 12,
          ySpan: 6
        },
        "widget-grid-members": {
          xTrack: 0,
          yTrack: 9,
          xSpan: 12,
          ySpan: 6
        }
      },
      filter: {
        page: [
          {
            field: { id: "coalitions.status" },
            view: { expanded: true }
          },
          {
            field: { id: "coalitions.skuName" },
            view: { expanded: true }
          }
        ]
      }
    }
  ]
};

export function getStudioInitialState(): any {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem("wholeshare_studio_saved_state");
      if (saved) {
        if (
          saved.includes("paypalOrderId") ||
          saved.includes('"xSpan":4') ||
          saved.includes('"xSpan": 4') ||
          saved.includes("Total Escrow Co...")
        ) {
          window.localStorage.removeItem("wholeshare_studio_saved_state");
          return SHIPPED_STUDIO_STATE;
        }
        const parsed = JSON.parse(saved);
        if (parsed && parsed.pages && parsed.pages.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // Fall back to shipped state on parse or storage errors
  }
  return SHIPPED_STUDIO_STATE;
}
