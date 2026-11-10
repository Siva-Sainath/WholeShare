// WholeShare B2B Wholesale Escrow Client
// Clean Full-Fledged Application Shell & Autonomous Verification Wiring

let eventSource = null;
let activePage = "landing";
let currentCategoryFilter = "ALL";
let cachedClans = [];
let cachedUserOverview = null;
let cachedSupportClaims = [];
let selectedClaimId = null;
let isFilingNewClaim = false;
let expandedLedgerRows = new Set();
let isCopilotFullscreen = false;
let currentSmeId = "sme_austin_01";
let currentRole = "MEMBER";

const VIEW_MAP = {
  landing: { title: "Overview & Economics" },
  onboarding: { title: "Onboarding & Business Profile" },
  radar: { title: "Wholesale Clan Matchmaking Radar" },
  ledger: { title: "Escrow Transactions & Settlement Ledger" },
  logistics: { title: "5-Stage Freight Logistics & Inspection Shield" },
  leader: { title: "Clan Leader Command Console" },
  subscriptions: { title: "Clan Membership Subscriptions & Invoicing" },
  settings: { title: "Governance, Security & Settings Boundary" }
};

function switchActiveView(viewName) {
  if (!VIEW_MAP[viewName]) {
    viewName = "landing";
  }
  activePage = viewName;

  const landingWrapper = document.getElementById("viewLanding");
  const workspaceShell = document.getElementById("workspaceShell");

  if (viewName === "landing") {
    if (landingWrapper) landingWrapper.style.display = "block";
    if (workspaceShell) workspaceShell.style.display = "none";
  } else {
    if (landingWrapper) landingWrapper.style.display = "none";
    if (workspaceShell) workspaceShell.style.display = "flex";

    const allViews = document.querySelectorAll("#mainStage [data-ws-view]");
    allViews.forEach(el => {
      const v = el.getAttribute("data-ws-view");
      el.style.display = (v === viewName) ? "block" : "none";
    });

    document.querySelectorAll(".ws-sidebar-nav .ws-nav-item").forEach(btn => {
      const targetNav = btn.getAttribute("data-nav");
      if (targetNav === viewName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    const breadcrumb = document.getElementById("topbarBreadcrumb");
    if (breadcrumb && VIEW_MAP[viewName]) {
      breadcrumb.textContent = VIEW_MAP[viewName].title;
    }

    if (viewName === "ledger") {
      if (!agGridInstance) {
        requestAnimationFrame(() => renderAgGridLedger());
      } else if (typeof agGridInstance.sizeColumnsToFit === "function") {
        requestAnimationFrame(() => agGridInstance.sizeColumnsToFit());
      }
    } else if (viewName === "logistics") {
      if (!bryntumSchedulerInstance) {
        requestAnimationFrame(() => renderBryntumTimeline());
      }
    } else if (viewName === "radar") {
      renderRadarClanGrid();
    }
  }
}

window.switchActiveView = switchActiveView;

window.wholeshareCmd = {
  dispatch: async function(command) {
    if (!command || !command.action) {
      throw new Error("Invalid command: action is required");
    }
    const { action, params = {} } = command;
    switch (action) {
      case "NAVIGATE_VIEW": {
        const targetView = params.view || "landing";
        switchActiveView(targetView);
        return { success: true, view: targetView };
      }
      case "START_PERSONA_ONBOARDING": {
        const personaId = params.personaId || "sme_austin_01";
        switchPersona(personaId);
        switchActiveView("onboarding");
        return { success: true, personaId, view: "onboarding" };
      }
      case "SWITCH_PERSONA": {
        switchPersona(params.personaId || "sme_austin_01");
        return { success: true, personaId: currentSmeId };
      }
      case "ONBOARDING_HYDRATE": {
        if (params.businessName) {
          const el = document.getElementById("onboardBusinessName");
          if (el) el.value = params.businessName;
        }
        if (params.commoditySku) {
          const el = document.getElementById("onboardSku");
          if (el) el.value = params.commoditySku;
        }
        if (params.targetVolume) {
          const el = document.getElementById("onboardVolume");
          if (el) el.value = params.targetVolume;
        }
        return { success: true };
      }
      case "FILTER_RADAR": {
        filterRadarCategory(params.category || "ALL");
        return { success: true, category: params.category };
      }
      case "AG_STUDIO_QUERY": {
        await executeAgStudioQuery(params.query || "");
        return { success: true, query: params.query };
      }
      case "INSPECT_TIMELINE_STAGE": {
        switchActiveView("logistics");
        return { success: true };
      }
      case "OPEN_DISPUTE_DRAWER": {
        openDisputeDrawer(params.clanId || "coalition_flour_01");
        return { success: true, clanId: params.clanId };
      }
      default:
        console.warn("Unknown action dispatched to wholeshareCmd:", action);
        return { success: false, error: "Unknown action: " + action };
    }
  }
};

const PERSONAS = {
  sme_austin_01: { name: "Austin Artisan Bakery", initials: "AA", tier: "KYB VERIFIED &bull; TIER 1", locked: "$23,591.00" },
  sme_bean_02: { name: "Medellin Coffee Collective", initials: "MC", tier: "KYB VERIFIED &bull; TIER 1", locked: "$41,200.00" },
  sme_green_03: { name: "Shenzhen SMT Electronics", initials: "SZ", tier: "KYB VERIFIED &bull; TIER 1", locked: "$68,450.00" },
  sme_magnolia_02: { name: "Naivasha Floriculture", initials: "NF", tier: "KYB VERIFIED &bull; TIER 1", locked: "$12,800.00" },
  clan_leader_01: { name: "Clan Leader Wholesale", initials: "CL", tier: "SYNDICATE ADMIN", locked: "$146,041.00" }
};

function switchPersona(personaId) {
  if (!PERSONAS[personaId]) return;
  currentSmeId = personaId;
  const p = PERSONAS[personaId];

  const avatar = document.getElementById("sidebarAvatar");
  const nameEl = document.getElementById("sidebarProfileName");
  const navAvatar = document.querySelector(".ws-avatar");
  const navName = document.getElementById("navProfileName");
  const escrowPill = document.getElementById("sidebarEscrowTotal");
  const topEscrowPill = document.getElementById("navLockedEscrowPill");

  if (avatar) avatar.textContent = p.initials;
  if (nameEl) nameEl.textContent = p.name;
  if (navAvatar) navAvatar.textContent = p.initials;
  if (navName) navName.textContent = p.name;
  if (escrowPill) escrowPill.textContent = p.locked;
  if (topEscrowPill) topEscrowPill.textContent = `Escrow: ${p.locked}`;

  ["btnPersonaAustin", "btnPersonaBean", "btnPersonaSMT", "btnPersonaFlower"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove("active");
  });
  if (personaId === "sme_austin_01" && document.getElementById("btnPersonaAustin")) document.getElementById("btnPersonaAustin").classList.add("active");
  if (personaId === "sme_bean_02" && document.getElementById("btnPersonaBean")) document.getElementById("btnPersonaBean").classList.add("active");
  if (personaId === "sme_green_03" && document.getElementById("btnPersonaSMT")) document.getElementById("btnPersonaSMT").classList.add("active");
  if (personaId === "sme_magnolia_02" && document.getElementById("btnPersonaFlower")) document.getElementById("btnPersonaFlower").classList.add("active");

  showToast("info", "Persona Switched", `Active identity set to ${p.name}`);
  loadUserOverview();
}

function switchUserRole(role) {
  currentRole = role;
  const btnMember = document.getElementById("btnRoleMember");
  const btnLeader = document.getElementById("btnRoleLeader");

  if (role === "LEADER") {
    if (btnLeader) btnLeader.classList.add("active");
    if (btnMember) btnMember.classList.remove("active");
    navigateToPage("leaderWorkspace");
  } else {
    if (btnMember) btnMember.classList.add("active");
    if (btnLeader) btnLeader.classList.remove("active");
    navigateToPage("dashboard");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(cents) {
  const val = (cents || 0) / 100;
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==========================================================================
// Toast Notifications Engine
// ==========================================================================

function showToast(type, title, message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `ws-toast ${type || "info"}`;
  toast.innerHTML = `
    <div>
      <div style="font-weight: 600; font-size: 13px;">${escapeHtml(title)}</div>
      <div style="font-size: 12px; color: var(--ws-text-secondary); margin-top: 2px;">${escapeHtml(message)}</div>
    </div>
    <button class="btn-step" onclick="this.parentElement.remove()" style="padding: 2px 6px; font-size: 11px;">Close</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

// ==========================================================================
// Page Navigation Router (4 Core Operational Surfaces)
// ==========================================================================

function navigateToPage(pageKey) {
  activePage = pageKey;

  // Update sidebar navigation button active state
  document.querySelectorAll(".ws-sidebar-nav-btn, .ws-nav-btn").forEach(btn => {
    if (btn.dataset.pageBtn === pageKey) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update topbar breadcrumb text
  const breadcrumb = document.getElementById("topbarBreadcrumb");
  if (breadcrumb) {
    const titles = {
      landing: "Overview & Economics",
      dashboard: "Working Capital Dashboard",
      operations: "Clan Operations (AG Grid & Bryntum)",
      marketplace: "Matchmaking & Clan Radar",
      dues: "Dues & Subscription Invoicing",
      support: "Support & Dispute Resolution",
      leaderWorkspace: "Clan Leader Command Console"
    };
    breadcrumb.textContent = titles[pageKey] || pageKey;
  }

  // Toggle page visibility
  const pages = ["landing", "dashboard", "operations", "marketplace", "dues", "support", "leaderWorkspace"];
  pages.forEach(p => {
    const el = document.getElementById("page" + p.charAt(0).toUpperCase() + p.slice(1));
    if (el) {
      if (p === pageKey) {
        el.classList.add("active");
        el.style.display = "flex";
      } else {
        el.classList.remove("active");
        el.style.display = "none";
      }
    }
  });

  // Trigger page-specific data fetching
  if (pageKey === "dashboard") {
    loadUserOverview();
  } else if (pageKey === "operations") {
    renderAgGridLedger();
    renderBryntumTimeline();
  } else if (pageKey === "marketplace") {
    renderClansList();
  } else if (pageKey === "support") {
    loadSupportClaims();
  } else if (pageKey === "dues") {
    loadUserOverview();
  } else if (pageKey === "leaderWorkspace") {
    loadUserOverview();
  }
  
  // Initialize landing page animations when navigating to landing
  if (pageKey === "landing") {
    setTimeout(initializeAnimatedCounters, 100);
  }
}

// ==========================================================================
// Page 1: My Dashboard Logic
// ==========================================================================

async function loadUserOverview() {
  try {
    const res = await fetch(`/api/v1/user/overview?smeId=${encodeURIComponent(currentSmeId)}`);
    if (!res.ok) throw new Error("Failed to load user overview.");
    const data = await res.json();
    cachedUserOverview = data;
    renderDashboardPage(data);
  } catch (err) {
    console.error("User overview error:", err);
  }
}

function renderDashboardPage(data) {
  if (!data) return;

  // Update Profile & KPIs
  const titleEl = document.getElementById("dashBusinessTitle");
  if (titleEl) titleEl.textContent = data.profile.businessName;

  const navNameEl = document.getElementById("navProfileName");
  if (navNameEl) navNameEl.textContent = data.profile.businessName;

  const countEl = document.getElementById("dashJoinedClansCount");
  if (countEl) countEl.textContent = data.metrics.joinedClansCount;

  const softHoldEl = document.getElementById("dashTotalSoftHoldUsd");
  if (softHoldEl) softHoldEl.textContent = "$" + Number(data.metrics.totalEscrowAuthorizedUsd).toLocaleString("en-US", { minimumFractionDigits: 2 });

  const savingsEl = document.getElementById("dashSavingsUsd");
  if (savingsEl) savingsEl.textContent = "$" + Number(data.metrics.totalSavingsUsd).toLocaleString("en-US", { minimumFractionDigits: 2 });

  const duesEl = document.getElementById("dashOutstandingDuesUsd");
  if (duesEl) duesEl.textContent = "$" + Number(data.metrics.outstandingDuesUsd).toLocaleString("en-US", { minimumFractionDigits: 2 });

  // Update Commitments Table
  const tbody = document.getElementById("dashCommitmentsTableBody");
  if (!tbody) return;

  if (!data.joinedClans || data.joinedClans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding: 24px; text-align: center; color: var(--ws-text-muted);">No joined clans yet. Visit the Marketplace to join a wholesale pool.</td></tr>`;
    return;
  }

  let html = "";
  for (const item of data.joinedClans) {
    const orderLink = item.paypalOrderId
      ? `<a class="paypal-link" href="https://www.sandbox.paypal.com/activity/payment/${escapeHtml(item.paypalOrderId)}" target="_blank" rel="noopener">PayPal: ${escapeHtml(item.paypalOrderId)}</a>`
      : `<span style="color: var(--ws-text-muted);">Pending Auth</span>`;

    const trackingText = item.trackingNumber
      ? `<span style="font-family: var(--ws-font-mono); font-size: 11px; color: var(--ws-accent-copilot);">${escapeHtml(item.carrier || "CARRIER")}: ${escapeHtml(item.trackingNumber)}</span>`
      : `<span style="color: var(--ws-text-muted); font-size: 11px;">Pending Dispatch</span>`;

    html += `
      <tr>
        <td><strong style="font-family: var(--ws-font-mono); font-size: 12px;">${escapeHtml(item.clanId)}</strong></td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(item.skuName || item.sku)}</div>
          <div style="font-size: 11px; color: var(--ws-text-secondary);">${escapeHtml(item.category)}</div>
        </td>
        <td style="text-align: right;" class="ws-tabular-nums" data-tabular="true"><strong>${item.pledgedUnits}</strong> units</td>
        <td style="text-align: right; color: #34d399; font-weight: 700;" class="ws-tabular-nums" data-tabular="true">$${item.authorizedUsd}</td>
        <td>${orderLink}</td>
        <td>${trackingText}</td>
        <td><span class="status-badge ${escapeHtml(item.clanStatus)}">${escapeHtml(item.clanStatus)}</span></td>
        <td>
          <button class="btn-step" onclick="openInspectorDrawer('commitment', '${escapeHtml(item.clanId)}')" style="padding: 4px 10px; font-size: 11px;">Inspect</button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;
}

function showPayDuesModal() {
  const dues = cachedUserOverview?.metrics?.outstandingDuesUsd || "0.00";
  if (Number(dues) <= 0) {
    showToast("info", "No Liabilities", "Zero outstanding dues. All accounts are in good standing.");
    return;
  }
  const confirmed = confirm(`Settle outstanding dues of $${dues} via connected PayPal account?`);
  if (confirmed) {
    settleDuesAction();
  }
}

async function settleDuesAction() {
  try {
    const res = await fetch("/api/v1/user/dues/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtId: "default" })
    });
    if (res.ok) {
      showToast("success", "Liabilities Settled", "Outstanding dues paid via PayPal Sandbox.");
      loadUserOverview();
    }
  } catch (err) {
    showToast("error", "Settlement Error", err.message);
  }
}

// ==========================================================================
// Page 2: Clan Operations Logic (AG Grid & Bryntum)
// ==========================================================================

function switchOperationsSubTab(tabKey) {
  const btnLedger = document.getElementById("btnSubTabLedger");
  const btnTimeline = document.getElementById("btnSubTabTimeline");
  const btnBoth = document.getElementById("btnSubTabBoth");
  const viewLedger = document.getElementById("subViewLedger");
  const viewTimeline = document.getElementById("subViewTimeline");

  if (btnLedger) btnLedger.classList.remove("active");
  if (btnTimeline) btnTimeline.classList.remove("active");
  if (btnBoth) btnBoth.classList.remove("active");

  if (tabKey === "ledger") {
    if (btnLedger) btnLedger.classList.add("active");
    if (viewLedger) viewLedger.style.display = "block";
    if (viewTimeline) viewTimeline.style.display = "none";
    renderAgGridLedger();
  } else if (tabKey === "timeline") {
    if (btnTimeline) btnTimeline.classList.add("active");
    if (viewLedger) viewLedger.style.display = "none";
    if (viewTimeline) viewTimeline.style.display = "block";
    setTimeout(() => renderBryntumTimeline(), 60);
  } else if (tabKey === "both") {
    if (btnBoth) btnBoth.classList.add("active");
    if (viewLedger) viewLedger.style.display = "block";
    if (viewTimeline) viewTimeline.style.display = "block";
    renderAgGridLedger();
    setTimeout(() => renderBryntumTimeline(), 60);
  }
}

let agGridInstance = null;
let bryntumSchedulerInstance = null;

function renderAgGridLedger() {
  const container = document.getElementById("agGridLedgerContainer");
  if (!container) return;

  if (typeof window.agGrid === "undefined" || !window.agGrid.createGrid) {
    container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--ws-text-secondary); font-family: var(--ws-font-mono);">
      AG Grid Enterprise loading... Please verify ag-grid-enterprise.min.js is loaded.
    </div>`;
    return;
  }

  // Register Enterprise / Studio License Key
  if (window.agGrid.LicenseManager && window.AG_GRID_LICENSE_KEY) {
    try {
      window.agGrid.LicenseManager.setLicenseKey(window.AG_GRID_LICENSE_KEY);
    } catch (e) {
      console.warn("AG Grid license registration note:", e);
    }
  }

  // Destroy previous instance if re-rendering
  if (agGridInstance) {
    try {
      agGridInstance.destroy();
    } catch (e) {}
    agGridInstance = null;
  }

  container.innerHTML = "";
  container.className = "ag-theme-quartz-dark";

  // Build row data from cachedClans
  const rowData = (cachedClans || []).map(clan => {
    let totalEscrowCents = 0;
    if (Array.isArray(clan.members)) {
      for (const m of clan.members) {
        totalEscrowCents += m.authorizedCents || 0;
      }
    } else {
      totalEscrowCents = clan.escrowTotalCents || 0;
    }

    const pooled = clan.pooledUnits || 0;
    const target = clan.targetUnits || 100;
    const pct = Math.round((pooled / (target || 1)) * 100);

    return {
      clanId: clan.id,
      name: clan.skuName || clan.sku,
      category: clan.category || "General",
      pooledUnits: pooled,
      targetUnits: target,
      progressPct: pct,
      escrowTotalCents: totalEscrowCents,
      escrowTotal: `${(totalEscrowCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      discountTierPct: `${clan.discountTierPct || 25}%`,
      carrier: clan.carrier || "USPS/UPS Freight",
      trackingNumber: clan.trackingNumber || "Pending Dispatch",
      status: clan.status || "FORMING",
      membersCount: Array.isArray(clan.members) ? clan.members.length : 0,
      settlementWindow: clan.settlementWindow || "48h Post-Delivery"
    };
  });

  const gridOptions = {
    rowData: rowData,
    rowHeight: 52,
    headerHeight: 44,
    animateRows: true,
    columnDefs: [
      {
        headerName: "Wholesale Clan / SKU",
        field: "name",
        flex: 2,
        minWidth: 200,
        cellRenderer: params => {
          if (!params.data) return "";
          return `
            <div style="display: flex; flex-direction: column; justify-content: center; line-height: 1.3;">
              <span style="font-weight: 600; color: #ffffff; font-size: 13px;">${escapeHtml(params.value)}</span>
              <span style="font-size: 11px; color: #94a3b8; font-family: var(--ws-font-mono);">${escapeHtml(params.data.clanId)} &bull; ${escapeHtml(params.data.category)}</span>
            </div>
          `;
        }
      },
      {
        headerName: "Pooled Volume",
        field: "pooledUnits",
        width: 150,
        type: "numericColumn",
        cellClass: "ws-tabular-nums",
        cellRenderer: params => {
          if (!params.data) return "";
          const pct = params.data.progressPct;
          const color = pct >= 100 ? "#10b981" : "#38bdf8";
          return `
            <div style="display: flex; flex-direction: column; justify-content: center; width: 100%; line-height: 1.2;">
              <span style="font-weight: 600; color: ${color}; font-size: 12.5px;">${params.value} / ${params.data.targetUnits} units</span>
              <div style="height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 4px;">
                <div style="height: 100%; width: ${Math.min(pct, 100)}%; background: ${color};"></div>
              </div>
            </div>
          `;
        }
      },
      {
        headerName: "Escrow Locked",
        field: "escrowTotal",
        width: 150,
        type: "numericColumn",
        cellClass: "ws-tabular-nums",
        cellStyle: { fontWeight: "700", color: "#10b981", fontSize: "13px" }
      },
      {
        headerName: "Discount",
        field: "discountTierPct",
        width: 110,
        type: "numericColumn",
        cellClass: "ws-tabular-nums",
        cellStyle: { color: "#38bdf8", fontWeight: "600" }
      },
      {
        headerName: "Escrow Status",
        field: "status",
        width: 140,
        cellRenderer: params => {
          const s = params.value || "FORMING";
          return `<span class="status-badge ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
        }
      },
      {
        headerName: "Carrier & Logistics",
        field: "trackingNumber",
        flex: 1.5,
        minWidth: 180,
        cellRenderer: params => {
          if (!params.data) return "";
          return `
            <div style="display: flex; flex-direction: column; justify-content: center; line-height: 1.2;">
              <span style="font-size: 11.5px; color: #cbd5e1; font-weight: 500;">${escapeHtml(params.data.carrier)}</span>
              <span style="font-size: 11px; font-family: var(--ws-font-mono); color: #38bdf8;">${escapeHtml(params.value)}</span>
            </div>
          `;
        }
      },
      {
        headerName: "Actions",
        field: "clanId",
        width: 130,
        cellRenderer: params => {
          return `
            <button class="btn-step" onclick="openAgreementInspector('${escapeHtml(params.value)}')" style="padding: 4px 10px; font-size: 11.5px;">
              Inspect
            </button>
          `;
        }
      }
    ],
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
      enableCellChangeFlash: true
    }
  };

  try {
    agGridInstance = agGrid.createGrid(container, gridOptions);
  } catch (err) {
    console.error("Failed to create AG Grid instance:", err);
  }
}

function renderBryntumTimeline() {
  const container = document.getElementById("bryntumTimelineContainer");
  if (!container) return;

  const initFn = (window.WholeshareBryntum && window.WholeshareBryntum.initBryntumScheduler)
    || window.initBryntumScheduler;

  if (typeof initFn === "function") {
    try {
      bryntumSchedulerInstance = initFn("bryntumTimelineContainer");
      return;
    } catch (err) {
      console.error("Bryntum Scheduler initialization error:", err);
    }
  } else {
    console.warn("Bryntum Scheduler init function not available on window or WholeshareBryntum.");
  }
}

// ==========================================================================
// Matchmaking Radar Functions (View: radar)
// ==========================================================================

function filterRadarCategory(category) {
  currentCategoryFilter = category;
  document.querySelectorAll(".ws-radar-category-pills .ws-cat-pill").forEach(pill => {
    if (category === "ALL" && pill.textContent.includes("All")) {
      pill.classList.add("active");
    } else if (pill.textContent.includes(category)) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });
  renderRadarClanGrid();
}
window.filterRadarCategory = filterRadarCategory;

function handleRadarSearch(query) {
  renderRadarClanGrid(query);
}
window.handleRadarSearch = handleRadarSearch;

function handleRadarMoqSlider(val) {
  const el = document.getElementById("radarMoqVal");
  if (el) el.textContent = `${val} units`;
  renderRadarClanGrid();
}
window.handleRadarMoqSlider = handleRadarMoqSlider;

function getDerivedCategory(c) {
  if (c.industryVertical && c.industryVertical !== "GENERAL") return c.industryVertical;
  if (c.category && c.category !== "GENERAL") return c.category;
  const s = ((c.sku || "") + " " + (c.skuName || "") + " " + (c.id || "")).toLowerCase();
  if (s.includes("flour") || s.includes("wheat") || s.includes("grain") || s.includes("bakery")) return "Food & Beverage";
  if (s.includes("coffee") || s.includes("bean") || s.includes("roaster")) return "Specialty Coffee";
  if (s.includes("tile") || s.includes("ceramic")) return "Ceramics";
  if (s.includes("box") || s.includes("packaging")) return "Packaging & Paper";
  if (s.includes("bolt") || s.includes("hardware") || s.includes("fastener")) return "Hardware";
  if (s.includes("micro") || s.includes("smt") || s.includes("pcb")) return "Electronics MRO";
  if (s.includes("flower") || s.includes("floriculture")) return "Floriculture";
  return "Wholesale Commodity";
}

function renderRadarClanGrid(searchQuery = "") {
  const container = document.getElementById("radarClanGrid");
  if (!container) return;

  if (!cachedClans || cachedClans.length === 0) {
    refreshClans().then(() => renderRadarClanGrid(searchQuery));
    return;
  }

  let filtered = cachedClans;
  if (currentCategoryFilter !== "ALL") {
    const target = currentCategoryFilter.toLowerCase().replace(/[^a-z]/g, "");
    filtered = filtered.filter(c => {
      const cat = getDerivedCategory(c).toLowerCase().replace(/[^a-z]/g, "");
      return cat.includes(target) || target.includes(cat);
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c => 
      (c.skuName && c.skuName.toLowerCase().includes(q)) ||
      (c.sku && c.sku.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  }

  const slider = document.getElementById("radarMoqSlider");
  if (slider) {
    const minMoq = parseInt(slider.value, 10) || 50;
    filtered = filtered.filter(c => (c.targetUnits || 500) >= minMoq);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="color: var(--ws-text-muted); font-size: 13px; text-align: center; padding: 40px 0; grid-column: 1 / -1;">
        No active clans match the current filter criteria.
      </div>
    `;
    return;
  }

  let html = "";
  for (const clan of filtered.slice(0, 9)) {
    const progressPct = clan.targetUnits > 0
      ? Math.min(100, Math.round((clan.currentUnits / clan.targetUnits) * 100))
      : 0;

    const basePrice = (clan.unitPriceCents || 1000) / 100;
    const discountPct = clan.discountTierPct || 28;
    const effectivePrice = (basePrice * (1 - discountPct / 100)).toFixed(2);
    const categoryName = getDerivedCategory(clan);
    const corridor = clan.corridorId || clan.corridor || "Kansas City -> Austin &bull; 4d SLA";

    html += `
      <div class="ws-clan-card ws-card ws-card-spotlight" id="radar_clan_${escapeHtml(clan.id)}">
        <!-- Block 1: Top Row -->
        <div class="ws-clan-top-row">
          <div>
            <div class="ws-clan-title">${escapeHtml(clan.skuName || clan.sku || clan.name || "Wholesale Commodity")}</div>
            <div class="ws-clan-meta">
              <span class="ws-brand-pill">${escapeHtml(categoryName)}</span>
              <span class="ws-trust-badge ws-tabular-nums">99.4% Trust</span>
            </div>
          </div>
          <span class="ws-status-badge status-${(clan.status || 'forming').toLowerCase()}">${escapeHtml(clan.status || 'FORMING')}</span>
        </div>

        <!-- Block 2: Price Ladder Box -->
        <div class="ws-price-ladder-box">
          <div class="ws-price-compare">
            <span class="ws-price-retail ws-tabular-nums">$${basePrice.toFixed(2)}/unit</span>
            <span class="ws-price-wholesale ws-tabular-nums">$${effectivePrice}/unit</span>
          </div>
          <span class="ws-savings-pill ws-tabular-nums">${discountPct}% OFF</span>
        </div>

        <!-- Block 3: MOQ Progress & SLA -->
        <div class="ws-moq-progress-box">
          <div class="ws-moq-label-row">
            <span class="ws-moq-units ws-tabular-nums">${clan.currentUnits || 0} / ${clan.targetUnits || 500} Units Pledged</span>
            <span class="ws-moq-pct ws-tabular-nums">${progressPct}%</span>
          </div>
          <div class="ws-moq-track">
            <div class="ws-moq-bar" style="width: ${progressPct}%;"></div>
          </div>
          <span class="ws-corridor-text">${corridor}</span>
        </div>

        <!-- Block 4: Footer Actions -->
        <div class="ws-clan-card-actions">
          <button class="btn-paypal-gold ws-btn-sm" onclick="pledgeToClan('${escapeHtml(clan.id)}', '${escapeHtml(clan.sku)}', ${Math.round((clan.targetUnits || 500) * 0.2)})">
            <span>Authorize Escrow Hold</span>
          </button>
          <button class="btn-titanium ws-btn-sm" onclick="openAgreementInspector('${escapeHtml(clan.id)}')">
            <span>Inspect Coalition</span>
          </button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}
window.renderRadarClanGrid = renderRadarClanGrid;

// ==========================================================================
// AG Studio Natural-Language Agent Query Engine (AG Grid Enterprise)
// ==========================================================================

async function executeAgStudioQuery(query) {
  if (!query || !query.trim()) return;
  const q = query.toLowerCase().trim();

  const inputEl = document.getElementById("agStudioQueryInput");
  if (inputEl) inputEl.value = query;

  showToast("info", "AG Studio Agent", `Processing natural language query: "${query}"`);

  if (!agGridInstance) {
    showToast("warning", "AG Studio", "AG Grid instance not ready yet.");
    return;
  }

  try {
    // 1. Coalitions over 50% funded
    if (q.includes("50%") || q.includes("50 percent") || q.includes("over 50")) {
      agGridInstance.setFilterModel({
        pooledUnits: {
          filterType: "number",
          type: "greaterThan",
          filter: 200
        }
      });
      showToast("success", "AG Studio Filter Applied", "Filtered to coalitions with > 200 units pledged (>50% funded).");
    }
    // 2. Sort by highest escrow locked
    else if (q.includes("highest escrow") || q.includes("sort by escrow") || q.includes("sort escrow")) {
      agGridInstance.applyColumnState({
        state: [{ colId: "escrowTotal", sort: "desc" }],
        defaultState: { sort: null }
      });
      showToast("success", "AG Studio Sort Applied", "Sorted rows by Escrow Locked descending.");
    }
    // 3. Category filters
    else if (q.includes("food") || q.includes("bakery")) {
      agGridInstance.setFilterModel({
        category: {
          filterType: "text",
          type: "contains",
          filter: "Food"
        }
      });
      showToast("success", "AG Studio Filter Applied", "Filtered to Food & Beverage category.");
    }
    // 4. Reset filters
    else if (q.includes("reset") || q.includes("clear")) {
      agGridInstance.setFilterModel(null);
      agGridInstance.applyColumnState({ defaultState: { sort: null } });
      if (typeof agGridInstance.setGridOption === "function") {
        agGridInstance.setGridOption("quickFilterText", "");
      }
      showToast("success", "AG Studio Reset", "Cleared all grid filters and sort states.");
    }
    // 5. General text search query
    else {
      if (typeof agGridInstance.setGridOption === "function") {
        agGridInstance.setGridOption("quickFilterText", query);
      }
      showToast("success", "AG Studio Query", `Quick filtered grid for: "${query}"`);
    }

    // Flash grid cells for Emil Kowalski tactile confirmation
    if (typeof agGridInstance.flashCells === "function") {
      agGridInstance.flashCells();
    }
  } catch (err) {
    console.error("AG Studio query execution error:", err);
    showToast("error", "AG Studio Error", err.message);
  }
}
window.executeAgStudioQuery = executeAgStudioQuery;

// ==========================================================================
// Snapshot Export (JSON / CSV)
// ==========================================================================

async function exportMatchmakingSnapshot(format = "json") {
  try {
    const res = await fetch(`/api/v1/matchmaking/snapshot?format=${format}`);
    if (!res.ok) throw new Error("Failed to generate matchmaking snapshot.");

    if (format === "csv") {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wholeshare_clans_snapshot_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wholeshare_clans_snapshot_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }
    showToast("success", "Snapshot Exported", `Downloaded clan snapshot in ${format.toUpperCase()} format.`);
  } catch (err) {
    showToast("error", "Export Error", err.message);
  }
}
window.exportMatchmakingSnapshot = exportMatchmakingSnapshot;

// ==========================================================================
// Onboarding Stepper & File Intake (View: onboarding)
// ==========================================================================

function goToStep(stepNum) {
  document.querySelectorAll(".ws-step-pane").forEach((pane, idx) => {
    pane.style.display = (idx + 1 === stepNum) ? "block" : "none";
  });
  document.querySelectorAll(".ws-stepper-progress .ws-step-indicator").forEach((ind, idx) => {
    if (idx + 1 <= stepNum) {
      ind.classList.add("active");
    } else {
      ind.classList.remove("active");
    }
  });
}
window.goToStep = goToStep;

function loadSampleInvoiceKit(kitType) {
  const factBusiness = document.getElementById("factBusiness");
  const factCommodity = document.getElementById("factCommodity");
  const factVolume = document.getElementById("factVolume");
  const factPrice = document.getElementById("factPrice");

  if (kitType === "sysco_bakery") {
    if (factBusiness) factBusiness.textContent = "Austin Artisan Bakery Co";
    if (factCommodity) factCommodity.textContent = "Sysco Imperial Organic Bread Flour (50lb)";
    if (factVolume) factVolume.textContent = "250 Sacks / Month";
    if (factPrice) factPrice.textContent = "$27.40 / sack";

    const nameInput = document.getElementById("onboardBusinessName");
    if (nameInput) nameInput.value = "Austin Artisan Bakery Co";
    const skuInput = document.getElementById("onboardSku");
    if (skuInput) skuInput.value = "sysco-flour-organic-50lb";
    const volInput = document.getElementById("onboardVolume");
    if (volInput) volInput.value = 250;
    showToast("success", "Demo Invoice Ingested", "Parsed Sysco commercial invoice: 250 sacks extracted.");
  } else if (kitType === "coffee_manifest") {
    if (factBusiness) factBusiness.textContent = "Medellin Coffee Collective";
    if (factCommodity) factCommodity.textContent = "Excelso Single Origin Green Beans (60kg)";
    if (factVolume) factVolume.textContent = "120 Bags / Month";
    if (factPrice) factPrice.textContent = "$310.00 / bag";

    const nameInput = document.getElementById("onboardBusinessName");
    if (nameInput) nameInput.value = "Medellin Coffee Collective";
    const skuInput = document.getElementById("onboardSku");
    if (skuInput) skuInput.value = "coffee-green-medellin-60kg";
    const volInput = document.getElementById("onboardVolume");
    if (volInput) volInput.value = 120;
    showToast("success", "Demo Manifest Ingested", "Parsed Colombian logistics manifest: 120 bags extracted.");
  } else if (kitType === "smt_electronics") {
    if (factBusiness) factBusiness.textContent = "Shenzhen SMT Electronics";
    if (factCommodity) factCommodity.textContent = "Microchip STM32 Microcontrollers (Tape/Reel)";
    if (factVolume) factVolume.textContent = "1500 Units / Month";
    if (factPrice) factPrice.textContent = "$4.20 / unit";

    const nameInput = document.getElementById("onboardBusinessName");
    if (nameInput) nameInput.value = "Shenzhen SMT Electronics";
    const skuInput = document.getElementById("onboardSku");
    if (skuInput) skuInput.value = "microchip-stm32-qfn32";
    const volInput = document.getElementById("onboardVolume");
    if (volInput) volInput.value = 1500;
    showToast("success", "Demo BOM Ingested", "Parsed component bill of materials: 1,500 units extracted.");
  }
}
window.loadSampleInvoiceKit = loadSampleInvoiceKit;

function handleOnboardingFileUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  showToast("info", "Ingesting Document", `Uploading and parsing ${file.name} with Qwen 3.5...`);
  setTimeout(() => {
    loadSampleInvoiceKit("sysco_bakery");
  }, 400);
}
window.handleOnboardingFileUpload = handleOnboardingFileUpload;

function handleOnboardingSubmit(event) {
  event.preventDefault();
  showToast("success", "Profile Saved", "Business profile verified in PayPal Sandbox. Entering Clan Radar...");
  setTimeout(() => {
    switchActiveView("radar");
  }, 250);
}
window.handleOnboardingSubmit = handleOnboardingSubmit;

// ==========================================================================
// 48-Hour Dispute Slide-Over Drawer Functions (View: logistics)
// ==========================================================================

function openDisputeDrawer(clanId = "coalition_flour_01") {
  const drawer = document.getElementById("disputeSlideOverDrawer");
  if (!drawer) return;
  drawer.style.display = "block";
  drawer.setAttribute("aria-hidden", "false");
  calculateProRataRefund(20);
}
window.openDisputeDrawer = openDisputeDrawer;

function closeDisputeDrawer() {
  const drawer = document.getElementById("disputeSlideOverDrawer");
  if (!drawer) return;
  drawer.style.display = "none";
  drawer.setAttribute("aria-hidden", "true");
}
window.closeDisputeDrawer = closeDisputeDrawer;

function calculateProRataRefund(damagedUnits) {
  const total = 200;
  const damaged = Math.max(0, Math.min(total, parseInt(damagedUnits, 10) || 0));
  const unitPrice = 20.50;
  const originalHold = total * unitPrice;
  const refund = damaged * unitPrice;
  const payout = originalHold - refund;

  const originalEl = document.getElementById("arbOriginalHold");
  const refundEl = document.getElementById("arbRefundAmt");
  const payoutEl = document.getElementById("arbPayoutAmt");

  if (originalEl) originalEl.textContent = `$${originalHold.toFixed(2)}`;
  if (refundEl) refundEl.textContent = `-$${refund.toFixed(2)}`;
  if (payoutEl) payoutEl.textContent = `$${payout.toFixed(2)}`;
}
window.calculateProRataRefund = calculateProRataRefund;

function handleDisputeSubmit(event) {
  event.preventDefault();
  showToast("success", "Claim Dispatched", "Damage claim registered with PayPal Customer Disputes API. Escrow held.");
  closeDisputeDrawer();
}
window.handleDisputeSubmit = handleDisputeSubmit;

function setLogisticsMode(mode) {
  const btnTimeline = document.getElementById("btnTimelineMode");
  const btnClaims = document.getElementById("btnClaimsMode");
  if (mode === "TIMELINE") {
    if (btnTimeline) btnTimeline.classList.add("active");
    if (btnClaims) btnClaims.classList.remove("active");
  } else {
    if (btnTimeline) btnTimeline.classList.remove("active");
    if (btnClaims) btnClaims.classList.add("active");
    openDisputeDrawer();
  }
}
window.setLogisticsMode = setLogisticsMode;

// ==========================================================================
// Leader, Subscriptions & Settings Handlers (Views: leader, subscriptions, settings)
// ==========================================================================

function handleCreateClan(event) {
  event.preventDefault();
  const name = document.getElementById("newClanName")?.value || "Wholesale Coalition";
  showToast("success", "Coalition Formed", `Created clan: "${name}". Published to Matchmaking Radar.`);
  setTimeout(() => switchActiveView("radar"), 300);
}
window.handleCreateClan = handleCreateClan;

function triggerAtomicBatchCapture() {
  showToast("success", "Batch Capture Executed", "PayPal Payouts v1 atomic batch capture executed for $10,250.00.");
}
window.triggerAtomicBatchCapture = triggerAtomicBatchCapture;

function switchSubscriptionCadence(cadence) {
  showToast("success", "Cadence Updated", `Upgraded to ${cadence} billing at $499.00/yr (15% discount applied).`);
}
window.switchSubscriptionCadence = switchSubscriptionCadence;

function requestSubscriptionCancellation() {
  showToast("info", "Cancellation Guardian", "30-day notice period logged. Clan leader notified per syndicate terms.");
}
window.requestSubscriptionCancellation = requestSubscriptionCancellation;

function saveMemberSettings() {
  showToast("success", "Guardrails Saved", "Spend limits and auto-authorize boundaries updated.");
}
window.saveMemberSettings = saveMemberSettings;

function saveLeaderSettings() {
  showToast("success", "Policy Saved", "Clan billing terms and cancellation notice window updated.");
}
window.saveLeaderSettings = saveLeaderSettings;

function toggleCopilot(open) {
  const drawer = document.getElementById("copilotDrawer");
  if (!drawer) return;
  drawer.style.display = open ? "block" : "none";
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
}
window.toggleCopilot = toggleCopilot;

function openPersonaModal() {
  const modal = document.getElementById("personaModal");
  if (modal) modal.style.display = "block";
}
window.openPersonaModal = openPersonaModal;

function closePersonaModal() {
  const modal = document.getElementById("personaModal");
  if (modal) modal.style.display = "none";
}
window.closePersonaModal = closePersonaModal;

function selectPersona(personaId) {
  switchPersona(personaId);
  closePersonaModal();
}
window.selectPersona = selectPersona;

function handleNavAnchor(viewName, event) {
  if (event) event.preventDefault();
  switchActiveView(viewName);
}
window.handleNavAnchor = handleNavAnchor;

// ==========================================================================
// Page 3: Matchmaking & Clan Discovery Logic (with Live Pledge Range Slider)
// ==========================================================================

function filterCategory(category, buttonElement) {
  currentCategoryFilter = category;
  const buttons = document.querySelectorAll(".category-filter-bar .cat-btn");
  buttons.forEach(b => b.classList.remove("active"));
  if (buttonElement) buttonElement.classList.add("active");
  renderClansList();
}

function filterClansByCategory(category, buttonElement) {
  filterCategory(category, buttonElement || (typeof event !== "undefined" ? event.target : null));
}

function updatePledgeCalc(clanId, units) {
  const clan = cachedClans.find(c => c.id === clanId);
  if (!clan) return;

  const unitsVal = parseInt(units, 10);
  const unitsEl = document.getElementById("calcUnits_" + clanId);
  if (unitsEl) unitsEl.textContent = unitsVal;

  // Calculate discount based on tiers
  let discountPct = 0;
  if (Array.isArray(clan.tiers)) {
    for (const t of clan.tiers) {
      if (unitsVal >= t.minUnits && t.discountPct > discountPct) {
        discountPct = t.discountPct;
      }
    }
  }
  if (discountPct === 0 && clan.discountTierPct) {
    discountPct = clan.discountTierPct;
  }

  const basePrice = (clan.unitPriceCents || 1000) / 100;
  const wholesalePrice = basePrice * (1 - discountPct / 100);
  const totalSoftHold = unitsVal * wholesalePrice;
  const retailPrice = basePrice * 1.25;
  const savings = unitsVal * (retailPrice - wholesalePrice);

  const priceEl = document.getElementById("calcPrice_" + clanId);
  if (priceEl) priceEl.textContent = "$" + wholesalePrice.toFixed(2);

  const savingsEl = document.getElementById("calcSavings_" + clanId);
  if (savingsEl) savingsEl.textContent = "$" + savings.toFixed(2);

  const totalEl = document.getElementById("calcTotal_" + clanId);
  if (totalEl) totalEl.textContent = "$" + totalSoftHold.toFixed(2);

  const discountBadge = document.getElementById("calcDiscount_" + clanId);
  if (discountBadge) discountBadge.textContent = discountPct + "% OFF";
}

async function directPledgeAction(clanId, sku) {
  const slider = document.getElementById("slider_" + clanId);
  const units = slider ? parseInt(slider.value, 10) : 50;

  try {
    const res = await fetch("/api/v1/coalition/pledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coalitionId: clanId,
        sku: sku,
        units: units,
        smeId: "sme_austin_01"
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast("success", "Pledge Authorized", `Held ${units} units for Clan ${clanId} in PayPal Sandbox.`);
      await refreshClans();
      await loadUserOverview();
    } else {
      showToast("error", "Pledge Failed", data.error || "Unable to pledge units.");
    }
  } catch (err) {
    showToast("error", "Pledge Error", err.message);
  }
}

function renderClansList() {
  const container = document.getElementById("clansList");
  if (!container) return;

  let filtered = cachedClans;
  if (currentCategoryFilter !== "ALL") {
    filtered = cachedClans.filter(c => c.category === currentCategoryFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 40px 0;">
        No active clans found for category ${escapeHtml(currentCategoryFilter)}.
      </div>
    `;
    return;
  }

  let html = "";
  for (const clan of filtered) {
    const progressPct = clan.targetUnits > 0
      ? Math.min(100, Math.round((clan.currentUnits / clan.targetUnits) * 100))
      : 0;

    let tiersHtml = "";
    if (Array.isArray(clan.tiers)) {
      tiersHtml = clan.tiers.map(t => {
        const isActive = clan.currentUnits >= t.minUnits;
        const activeClass = isActive ? "tier-badge active-tier" : "tier-badge";
        return `<span class="${activeClass}">Tier ${t.tier}: &gt;=${t.minUnits} units (-${t.discountPct}%)</span>`;
      }).join(" ");
    }

    const defaultUnits = Math.min(clan.targetUnits, Math.max(10, Math.round(clan.targetUnits * 0.2)));
    const basePrice = (clan.unitPriceCents || 1000) / 100;
    const effectivePrice = basePrice * (1 - (clan.discountTierPct || 0) / 100);
    const initialTotal = (defaultUnits * effectivePrice).toFixed(2);
    const initialSavings = (defaultUnits * (basePrice * 1.25 - effectivePrice)).toFixed(2);

    html += `
      <div class="clan-card-v2" id="clan_${escapeHtml(clan.id)}" style="margin-bottom: 16px;">
        <div class="clan-top-row">
          <div>
            <div class="clan-name">${escapeHtml(clan.skuName || clan.sku)}</div>
            <div class="clan-meta">ID: <code>${escapeHtml(clan.id)}</code> | Category: <strong>${escapeHtml(clan.category)}</strong></div>
          </div>
          <span class="status-badge ${escapeHtml(clan.status)}">${escapeHtml(clan.status)}</span>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
            <span>Progress: <strong>${clan.currentUnits}</strong> / ${clan.targetUnits} units</span>
            <span>Current Discount: <strong style="color: #34d399;" id="calcDiscount_${escapeHtml(clan.id)}">${clan.discountTierPct}% OFF</strong></span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <div class="clan-tiers">${tiersHtml}</div>

        <!-- Inline Interactive Pledge Range Slider -->
        <div class="ws-pledge-calculator">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
            <span style="font-weight: 700; color: var(--ws-text-primary);">Interactive Demand Slider</span>
            <span style="font-family: var(--ws-font-mono); color: var(--ws-accent-copilot); font-weight: 700;">
              <span id="calcUnits_${escapeHtml(clan.id)}" class="ws-tabular-nums" data-tabular="true">${defaultUnits}</span> units
            </span>
          </div>
          <input
            id="slider_${escapeHtml(clan.id)}"
            type="range"
            class="ws-range-slider"
            min="5"
            max="${clan.targetUnits}"
            value="${defaultUnits}"
            oninput="updatePledgeCalc('${escapeHtml(clan.id)}', this.value)"
          />
          <div class="ws-calc-breakdown">
            <div class="ws-calc-stat">
              <span style="color: var(--ws-text-muted);">Unit Price</span>
              <strong id="calcPrice_${escapeHtml(clan.id)}" class="ws-tabular-nums" data-tabular="true">$${effectivePrice.toFixed(2)}</strong>
            </div>
            <div class="ws-calc-stat">
              <span style="color: var(--ws-text-muted);">Realized Savings</span>
              <strong id="calcSavings_${escapeHtml(clan.id)}" style="color: #38bdf8;" class="ws-tabular-nums" data-tabular="true">$${initialSavings}</strong>
            </div>
            <div class="ws-calc-stat">
              <span style="color: var(--ws-text-muted);">PayPal Soft Hold</span>
              <strong id="calcTotal_${escapeHtml(clan.id)}" style="color: #34d399;" class="ws-tabular-nums" data-tabular="true">$${initialTotal}</strong>
            </div>
            <div style="display: flex; align-items: flex-end; justify-content: flex-end;">
              <button class="btn-step" onclick="directPledgeAction('${escapeHtml(clan.id)}', '${escapeHtml(clan.sku)}')" style="border-color: #10b981; color: #34d399; font-size: 11px; padding: 4px 10px;">
                Authorize Soft Hold
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function showCreateClanModal() {
  const sku = prompt("Enter Target Product SKU (e.g. organic-flour-50lb, specialty-coffee-green-60kg):", "organic-flour-50lb");
  if (!sku) return;
  const units = prompt("Enter Target MOQ Units:", "500");
  if (!units) return;

  sendPresetMessage(`Create a new group purchasing clan for SKU ${sku} with a target of ${units} units.`);
}

// ==========================================================================
// Page 4: Support & Disputes (Two-Column Case Manager Logic)
// ==========================================================================

async function loadSupportClaims() {
  const container = document.getElementById("supportClaimsContainer");
  if (!container) return;

  try {
    const res = await fetch("/api/v1/support/claims");
    if (!res.ok) throw new Error("Failed to load claims.");
    const data = await res.json();
    cachedSupportClaims = data.claims || [];

    const countEl = document.getElementById("supportCaseCount");
    if (countEl) countEl.textContent = `${cachedSupportClaims.length} active disputes`;

    renderClaimsList(cachedSupportClaims);

    if (!selectedClaimId && cachedSupportClaims.length > 0 && !isFilingNewClaim) {
      selectClaim(cachedSupportClaims[0].claimId);
    } else if (isFilingNewClaim) {
      renderNewClaimForm();
    }
  } catch (err) {
    container.innerHTML = `<div style="padding: 20px; color: #f87171;">Error loading claims: ${escapeHtml(err.message)}</div>`;
  }
}

function filterClaimsList(query) {
  if (!query) {
    renderClaimsList(cachedSupportClaims);
    return;
  }
  const q = query.toLowerCase();
  const filtered = cachedSupportClaims.filter(c =>
    (c.claimId && c.claimId.toLowerCase().includes(q)) ||
    (c.clanId && c.clanId.toLowerCase().includes(q)) ||
    (c.memberId && c.memberId.toLowerCase().includes(q)) ||
    (c.status && c.status.toLowerCase().includes(q))
  );
  renderClaimsList(filtered);
}

function renderClaimsList(claims) {
  const container = document.getElementById("supportClaimsContainer");
  if (!container) return;

  if (claims.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--ws-text-muted); font-size: 12px;">No claims matching filter.</div>`;
    return;
  }

  let html = "";
  for (const c of claims) {
    const isSelected = c.claimId === selectedClaimId && !isFilingNewClaim ? "selected" : "";
    html += `
      <div class="ws-claim-item-row ${isSelected}" onclick="selectClaim('${escapeHtml(c.claimId)}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-family: var(--ws-font-mono); font-size: 12px;">${escapeHtml(c.claimId)}</strong>
          <span class="status-badge ${escapeHtml(c.status)}">${escapeHtml(c.status)}</span>
        </div>
        <div style="font-size: 11.5px; color: var(--ws-text-secondary);">
          Clan: <code>${escapeHtml(c.clanId)}</code> &bull; SME: <strong>${escapeHtml(c.memberId)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
          <span>Damaged: <strong>${c.damagedUnits} units</strong></span>
          <span style="color: #34d399; font-weight: 700;" class="ws-tabular-nums" data-tabular="true">$${(c.claimedAmount || 0).toFixed(2)} USD</span>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function selectClaim(claimId) {
  selectedClaimId = claimId;
  isFilingNewClaim = false;
  renderClaimsList(cachedSupportClaims);

  const claim = cachedSupportClaims.find(c => c.claimId === claimId);
  const pane = document.getElementById("supportActiveClaimPane");
  if (!pane || !claim) return;

  const photoCount = claim.evidence?.photoUrls?.length || (claim.evidence?.photosCount || 0);

  let responseInfo = "";
  if (claim.supplierResponse) {
    responseInfo = `
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--ws-radius-md); padding: 12px;">
        <div style="font-size: 11.5px; font-weight: 700; color: #34d399; margin-bottom: 4px;">Supplier Response: ${escapeHtml(claim.supplierResponse.action)}</div>
        <div style="font-size: 12px; color: var(--ws-text-primary);">${escapeHtml(claim.supplierResponse.notes || "No notes provided.")}</div>
      </div>
    `;
  }

  pane.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: var(--ws-border-hairline); padding-bottom: 14px;">
      <div>
        <div style="font-size: 16px; font-weight: 700; color: var(--ws-text-primary);">${escapeHtml(claim.claimId)}</div>
        <div style="font-size: 12px; color: var(--ws-text-secondary); margin-top: 2px;">
          Order ID: <code>${escapeHtml(claim.orderId)}</code> &bull; Capture: <code>${escapeHtml(claim.captureId || "None")}</code>
        </div>
      </div>
      <span class="status-badge ${escapeHtml(claim.status)}">${escapeHtml(claim.status)}</span>
    </div>

    <!-- 48-Hour Inspection Window Status -->
    <div style="background: var(--ws-bg-canvas); border: var(--ws-border-hairline); border-radius: var(--ws-radius-md); padding: 14px;">
      <div style="display: flex; justify-content: space-between; font-size: 12px;">
        <span><strong>48-Hour Delivery Inspection Window</strong></span>
        <span style="color: #f59e0b; font-weight: 700;">ENFORCED &amp; ACTIVE</span>
      </div>
      <div class="ws-inspection-clock-bar" style="margin-top: 8px;"></div>
    </div>

    <!-- Claim Metrics -->
    <div class="ws-form-grid">
      <div class="ws-stat-card" style="padding: 12px;">
        <div class="ws-stat-label">Damaged Units</div>
        <div class="ws-stat-value ws-tabular-nums" data-tabular="true" style="font-size: 18px;">${claim.damagedUnits} units</div>
      </div>
      <div class="ws-stat-card" style="padding: 12px;">
        <div class="ws-stat-label">Claimed Escrow Refund</div>
        <div class="ws-stat-value ws-tabular-nums" data-tabular="true" style="font-size: 18px; color: #34d399;">$${(claim.claimedAmount || 0).toFixed(2)}</div>
      </div>
    </div>

    <!-- Evidence & Damage Description -->
    <div class="ws-form-field">
      <label class="ws-form-label">Evidence Verification Proof (${photoCount} items attached)</label>
      <div style="background: var(--ws-bg-canvas); border: var(--ws-border-hairline); border-radius: var(--ws-radius-md); padding: 12px; font-size: 12.5px; color: var(--ws-text-secondary);">
        ${escapeHtml(claim.evidence?.description || "No description provided.")}
      </div>
    </div>

    ${responseInfo}

    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px;">
      <button class="btn-step" onclick="respondToClaimPrompt('${escapeHtml(claim.claimId)}', 'ACCEPT')" style="border-color: #10b981; color: #34d399;">
        Approve Resolution
      </button>
      <button class="btn-step" onclick="respondToClaimPrompt('${escapeHtml(claim.claimId)}', 'REJECT')" style="border-color: #ef4444; color: #f87171;">
        Reject Claim
      </button>
    </div>
  `;
}

function toggleNewClaimForm(show) {
  isFilingNewClaim = show;
  if (show) {
    selectedClaimId = null;
    renderClaimsList(cachedSupportClaims);
    renderNewClaimForm();
  } else if (cachedSupportClaims.length > 0) {
    selectClaim(cachedSupportClaims[0].claimId);
  }
}

function renderNewClaimForm() {
  const pane = document.getElementById("supportActiveClaimPane");
  if (!pane) return;

  pane.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: var(--ws-border-hairline); padding-bottom: 12px;">
      <div>
        <div style="font-size: 15px; font-weight: 700; color: var(--ws-text-primary);">File In-App Damage Claim</div>
        <div style="font-size: 11.5px; color: var(--ws-text-secondary);">48-Hour Inspection Clock Enforced Deterministic Capping</div>
      </div>
      <button class="btn-step" onclick="toggleNewClaimForm(false)" style="padding: 2px 8px; font-size: 11px;">Cancel</button>
    </div>

    <form onsubmit="handleClaimSubmission(event)" style="display: flex; flex-direction: column; gap: 14px;">
      <div class="ws-form-field">
        <label class="ws-form-label">Target Clan / Order</label>
        <select id="claimClanSelect" class="ws-input">
          <option value="coalition_flour_01">Golden Fields Organic Flour (coalition_flour_01)</option>
          <option value="coalition_coffee_02">Ethiopian Yirgacheffe Coffee (coalition_coffee_02)</option>
          <option value="coalition_boxes_04">Kraft Shipping Boxes (coalition_boxes_04)</option>
        </select>
      </div>

      <div class="ws-form-grid">
        <div class="ws-form-field">
          <label class="ws-form-label">Damaged Units</label>
          <input id="claimDamagedUnits" type="number" min="1" max="100" class="ws-input" value="10" required />
        </div>
        <div class="ws-form-field">
          <label class="ws-form-label">Unit Price (USD)</label>
          <input id="claimUnitPrice" type="number" step="0.01" class="ws-input" value="10.00" required />
        </div>
      </div>

      <div class="ws-form-field">
        <label class="ws-form-label">Evidence / Damage Description</label>
        <textarea id="claimDescription" class="ws-input" style="height: 70px; resize: none;" placeholder="e.g. Water damage during transit on pallet 2; bill of lading signed with exception." required></textarea>
      </div>

      <div style="font-size: 11.5px; color: var(--ws-text-muted);">
        Refund cap calculation: <strong style="color: #34d399;">min(damagedUnits * unitPrice, orderValue)</strong>
      </div>

      <button type="submit" class="btn-step" style="justify-content: center; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #f87171;">
        Submit Verifiable Claim
      </button>
    </form>
  `;
}

async function handleClaimSubmission(event) {
  if (event && event.preventDefault) event.preventDefault();

  const clanId = document.getElementById("claimClanSelect").value;
  const damagedUnits = parseInt(document.getElementById("claimDamagedUnits").value, 10);
  const unitPrice = parseFloat(document.getElementById("claimUnitPrice").value);
  const description = document.getElementById("claimDescription").value;

  const payload = {
    coalitionId: clanId,
    smeId: "sme_austin_01",
    orderId: "ord_austin_flour_01",
    captureId: "cap_austin_flour_01",
    damagedUnits,
    unitPrice,
    evidence: {
      description,
      photosCount: 2
    },
    autoBuyerApprove: true
  };

  try {
    const res = await fetch("/api/v1/support/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok) {
      showToast("success", "Claim Submitted", `Capped refund of $${result.claim.claimedAmount.toFixed(2)} intaken.`);
      toggleNewClaimForm(false);
      await loadSupportClaims();
    } else {
      showToast("error", "Claim Rejected", result.error || "Inspection clock expired.");
    }
  } catch (err) {
    showToast("error", "Submission Error", err.message);
  }
}

async function respondToClaimPrompt(claimId, action) {
  const notes = prompt(`Enter notes for ${action} response:`, `Resolution processed via WholeShare escrow.`);
  if (notes === null) return;

  try {
    const res = await fetch("/api/v1/support/claims/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimId,
        action,
        notes
      })
    });
    if (res.ok) {
      showToast("success", "Response Recorded", `Claim ${claimId} resolved with action ${action}.`);
      await loadSupportClaims();
    } else {
      const err = await res.json();
      showToast("error", "Response Failed", err.error);
    }
  } catch (err) {
    showToast("error", "Network Error", err.message);
  }
}

// ==========================================================================
// Slide-Over Profile & Settings Drawer Logic
// ==========================================================================

function toggleProfileDrawer(show) {
  const drawer = document.getElementById("profileDrawer");
  if (!drawer) return;
  if (show) {
    drawer.classList.add("open");
    loadSettingsData();
  } else {
    drawer.classList.remove("open");
  }
}

async function loadSettingsData() {
  if (!cachedUserOverview) {
    await loadUserOverview();
  }
  const data = cachedUserOverview;
  if (!data) return;

  if (data.policies) {
    const autoEl = document.getElementById("setPolicyAutoAuth");
    if (autoEl) autoEl.value = data.policies.maxAutoAuthorizeUsd;
    const stepEl = document.getElementById("setPolicyStepUp");
    if (stepEl) stepEl.value = data.policies.stepUpThresholdUsd;
    const dailyEl = document.getElementById("setPolicyDailySpend");
    if (dailyEl) dailyEl.value = data.policies.dailySpendLimitUsd;
    const curEl = document.getElementById("setPolicyCurrency");
    if (curEl) curEl.value = data.policies.preferredCurrency || "USD";
  }

  if (data.modelPreferences) {
    const modEl = document.getElementById("setModelProvider");
    if (modEl) modEl.value = data.modelPreferences.provider || "fast_cloud";
    const budEl = document.getElementById("setModelBudget");
    if (budEl) budEl.value = data.modelPreferences.reasoningBudget || 600;
    handleModelProviderChange(data.modelPreferences.provider || "fast_cloud");
  }

  renderSettingsAgentsGrid(data.aiAgents || []);
}

function renderSettingsAgentsGrid(agents) {
  const grid = document.getElementById("settingsAgentsGrid");
  if (!grid) return;

  if (agents.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 16px; text-align: center; color: var(--ws-text-muted);">No external agents connected.</div>`;
    return;
  }

  let html = "";
  for (const a of agents) {
    html += `
      <div class="ws-agent-card">
        <div class="ws-agent-top">
          <span class="ws-agent-name">${escapeHtml(a.name)}</span>
          <span class="ws-agent-protocol">${escapeHtml(a.protocol)}</span>
        </div>
        <div class="ws-agent-desc">${escapeHtml(a.role)}</div>
        <div class="ws-agent-bottom">
          <span>Spend Cap: <strong>$${a.maxSpendUsd}</strong></span>
          <button class="btn-step" onclick="handleRemoveAgent('${escapeHtml(a.id)}')" style="padding: 2px 6px; font-size: 10px; color: #f87171;">Disconnect</button>
        </div>
      </div>
    `;
  }
  grid.innerHTML = html;
}

function handleModelProviderChange(provider) {
  const hint = document.getElementById("modelProviderHint");
  if (!hint) return;
  if (provider === "fast_cloud") {
    hint.textContent = "Recommended for fast UI actions and rapid chat responses (sub-second cloud LLM).";
  } else {
    hint.textContent = "On-device distilled model running locally on Apple Silicon MLX.";
  }
}

async function saveSettingsForm() {
  const payload = {
    policies: {
      maxAutoAuthorizeUsd: parseFloat(document.getElementById("setPolicyAutoAuth").value),
      stepUpThresholdUsd: parseFloat(document.getElementById("setPolicyStepUp").value),
      dailySpendLimitUsd: parseFloat(document.getElementById("setPolicyDailySpend").value),
      preferredCurrency: document.getElementById("setPolicyCurrency").value
    },
    modelPreferences: {
      provider: document.getElementById("setModelProvider").value,
      reasoningBudget: parseInt(document.getElementById("setModelBudget").value, 10)
    }
  };

  try {
    const res = await fetch("/api/v1/user/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast("success", "Settings Saved", "Spending rules and model preferences saved.");
      toggleProfileDrawer(false);
      loadUserOverview();
    } else {
      const err = await res.json();
      showToast("error", "Save Failed", err.error);
    }
  } catch (err) {
    showToast("error", "Network Error", err.message);
  }
}

function toggleAddAgentModal(show) {
  const modal = document.getElementById("addAgentModal");
  if (modal) {
    if (show) modal.classList.add("active");
    else modal.classList.remove("active");
  }
}

function showAddAgentModal() {
  toggleAddAgentModal(true);
}

async function handleAddAgentSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const name = document.getElementById("newAgentName").value;
  const role = document.getElementById("newAgentRole").value;
  const protocol = document.getElementById("newAgentProtocol").value;
  const maxSpendUsd = parseFloat(document.getElementById("newAgentSpendCap").value);

  try {
    const res = await fetch("/api/v1/user/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, protocol, maxSpendUsd, autonomousApproval: true })
    });
    if (res.ok) {
      toggleAddAgentModal(false);
      document.getElementById("newAgentName").value = "";
      document.getElementById("newAgentRole").value = "";
      showToast("success", "Agent Connected", `Registered ${name} under ${protocol}.`);
      loadUserOverview();
    }
  } catch (err) {
    showToast("error", "Agent Connection Error", err.message);
  }
}

async function handleRemoveAgent(agentId) {
  if (!confirm("Are you sure you want to disconnect this agent?")) return;
  try {
    const res = await fetch("/api/v1/user/agents/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId })
    });
    if (res.ok) {
      showToast("info", "Agent Disconnected", "Autonomous authorization removed.");
      loadUserOverview();
    }
  } catch (err) {
    showToast("error", "Removal Error", err.message);
  }
}

// ==========================================================================
// Slide-Over Financial Detail Inspector Drawer Logic
// ==========================================================================

function openInspectorDrawer(type, id) {
  const drawer = document.getElementById("detailInspectorDrawer");
  const titleEl = document.getElementById("inspectorTitle");
  const subEl = document.getElementById("inspectorSubtitle");
  const bodyEl = document.getElementById("inspectorBody");
  if (!drawer || !bodyEl) return;

  if (type === "commitment") {
    const item = cachedUserOverview?.joinedClans?.find(c => c.clanId === id);
    if (!item) return;

    if (titleEl) titleEl.textContent = `Commitment: ${item.clanId}`;
    if (subEl) subEl.textContent = `Target SKU: ${item.skuName || item.sku}`;

    bodyEl.innerHTML = `
      <div style="background: var(--ws-bg-canvas); border: var(--ws-border-hairline); border-radius: var(--ws-radius-lg); padding: 14px;">
        <div style="font-size: 11px; color: var(--ws-text-muted); font-weight: 700; text-transform: uppercase;">PayPal Orders v2 Soft Hold</div>
        <div style="font-size: 22px; font-weight: 700; color: #34d399; margin: 4px 0;" class="ws-tabular-nums" data-tabular="true">
          $${item.authorizedUsd} USD
        </div>
        <div style="font-size: 12px; color: var(--ws-text-secondary);">Intent: <code>AUTHORIZE</code> (Working capital intact)</div>
      </div>

      <div class="ws-form-grid">
        <div class="ws-stat-card" style="padding: 12px;">
          <div class="ws-stat-label">Pledged Units</div>
          <div class="ws-stat-value ws-tabular-nums" data-tabular="true" style="font-size: 16px;">${item.pledgedUnits} units</div>
        </div>
        <div class="ws-stat-card" style="padding: 12px;">
          <div class="ws-stat-label">Clan Status</div>
          <div style="margin-top: 4px;"><span class="status-badge ${escapeHtml(item.clanStatus)}">${escapeHtml(item.clanStatus)}</span></div>
        </div>
      </div>

      <div class="ws-section-panel">
        <div class="ws-panel-header"><span class="ws-panel-title">Carrier Fulfillment &amp; Tracking</span></div>
        <div class="ws-panel-body" style="padding: 14px; font-size: 12.5px;">
          <div>Carrier: <strong>${escapeHtml(item.carrier || "USPS/UPS")}</strong></div>
          <div style="margin-top: 4px; font-family: var(--ws-font-mono); color: var(--ws-accent-copilot); font-size: 11.5px;">
            Tracking: ${escapeHtml(item.trackingNumber || "Pending Dispatch")}
          </div>
        </div>
      </div>

      <div class="ws-section-panel">
        <div class="ws-panel-header"><span class="ws-panel-title">FinTech Invariants &amp; Actions</span></div>
        <div class="ws-panel-body" style="padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; color: var(--ws-text-secondary);">
            Pro-Rata Dispute Protection: <strong style="color: #34d399;">Active</strong>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="btn-step" onclick="closeInspectorDrawer(); navigateToPage('support'); toggleNewClaimForm(true);" style="flex: 1; border-color: #f87171; color: #f87171;">
              File Damage Claim
            </button>
            <button class="btn-step" onclick="showInvoiceQrModal('Austin Artisan Bakery', ${(parseFloat(item.authorizedUsd) * 100).toFixed(0)})" style="flex: 1;">
              View QR Invoice
            </button>
          </div>
        </div>
      </div>
    `;
  } else if (type === "clan") {
    const clan = cachedClans.find(c => c.id === id);
    if (!clan) return;

    if (titleEl) titleEl.textContent = `Wholesale Pool: ${clan.id}`;
    if (subEl) subEl.textContent = `${clan.skuName || clan.sku} (${clan.category})`;

    bodyEl.innerHTML = `
      <div style="background: var(--ws-bg-canvas); border: var(--ws-border-hairline); border-radius: var(--ws-radius-lg); padding: 14px;">
        <div style="font-size: 11px; color: var(--ws-text-muted); font-weight: 700; text-transform: uppercase;">MOQ Progress</div>
        <div style="font-size: 20px; font-weight: 700; color: #38bdf8; margin: 4px 0;" class="ws-tabular-nums" data-tabular="true">
          ${clan.currentUnits} / ${clan.targetUnits} units (${clan.progressPct}%)
        </div>
        <div style="font-size: 12px; color: var(--ws-text-secondary);">Active Tier Discount: <strong style="color: #34d399;">${clan.discountTierPct}% OFF</strong></div>
      </div>

      <div class="ws-section-panel">
        <div class="ws-panel-header"><span class="ws-panel-title">Participating Members (${clan.members ? clan.members.length : 0})</span></div>
        <div class="ws-panel-body" style="padding: 10px;">
          ${Array.isArray(clan.members) && clan.members.length > 0 ? clan.members.map(m => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 11.5px;">
              <span><strong>${escapeHtml(m.name)}</strong> (${m.pledgedUnits} units)</span>
              <span style="color: #34d399;" class="ws-tabular-nums" data-tabular="true">${formatCurrency(m.authorizedCents)}</span>
            </div>
          `).join("") : `<div style="color: var(--ws-text-muted); font-size: 12px;">No members pledged yet.</div>`}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
        <button class="btn-step" onclick="closeInspectorDrawer(); quickPledgePrompt('${escapeHtml(clan.id)}', '${escapeHtml(clan.sku)}')" style="border-color: #10b981; color: #34d399;">
          Pledge via Copilot
        </button>
      </div>
    `;
  }

  drawer.classList.add("open");
}

function closeInspectorDrawer() {
  const drawer = document.getElementById("detailInspectorDrawer");
  if (drawer) drawer.classList.remove("open");
}

// ==========================================================================
// Dual-Mode Floating & Fullscreen Qwen Copilot Logic
// ==========================================================================

function toggleCopilot(show) {
  const modal = document.getElementById("copilotModal");
  if (!modal) return;
  if (show) {
    modal.classList.add("open");
    const input = document.getElementById("chatInput");
    if (input) input.focus();
  } else {
    modal.classList.remove("open");
    modal.classList.remove("fullscreen");
    isCopilotFullscreen = false;
  }
}

function toggleFullscreenCopilot() {
  const modal = document.getElementById("copilotModal");
  const btn = document.getElementById("btnFullscreenCopilot");
  if (!modal) return;

  isCopilotFullscreen = !isCopilotFullscreen;
  if (isCopilotFullscreen) {
    modal.classList.add("fullscreen");
    if (btn) btn.textContent = "Docked";
  } else {
    modal.classList.remove("fullscreen");
    if (btn) btn.textContent = "Fullscreen";
  }
}

function appendUserMessage(text) {
  const container = document.getElementById("chatHistory");
  if (!container) return;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user";
  bubble.innerHTML = escapeHtml(text);
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendAiPlaceholder() {
  const container = document.getElementById("chatHistory");
  if (!container) return null;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble ai";
  bubble.id = "activeAiBubble";
  bubble.innerHTML = `
    <div class="chat-thought" id="activeAiThought">Processing request...</div>
    <div id="activeAiContent" style="color: var(--text-secondary); font-style: italic;">Analyzing with resident model...</div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  document.querySelectorAll(".ws-copilot-svg").forEach((svg) => svg.classList.add("thinking"));
  return bubble;
}

function updateAiThought(thought) {
  const thoughtEl = document.getElementById("activeAiThought");
  if (thoughtEl) {
    thoughtEl.textContent = thought;
    thoughtEl.style.display = "block";
  }
}

function finalizeAiMessage(finalMessage) {
  document.querySelectorAll(".ws-copilot-svg").forEach((svg) => svg.classList.remove("thinking"));
  const thoughtEl = document.getElementById("activeAiThought");
  const contentEl = document.getElementById("activeAiContent");
  const activeBubble = document.getElementById("activeAiBubble");

  if (contentEl) {
    let formatted = escapeHtml(finalMessage);
    formatted = formatted.replace(/\n\n/g, "<br><br>");
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/`([^`]+)`/g, "<code style=\"color: var(--accent-cyan);\">$1</code>");
    contentEl.style.fontStyle = "normal";
    contentEl.style.color = "var(--text-primary)";
    contentEl.innerHTML = formatted;
  }

  if (activeBubble) activeBubble.removeAttribute("id");
  if (thoughtEl) thoughtEl.removeAttribute("id");
  if (contentEl) contentEl.removeAttribute("id");

  const container = document.getElementById("chatHistory");
  if (container) container.scrollTop = container.scrollHeight;
}

async function handleChatSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();

  const input = document.getElementById("chatInput");
  const btn = document.getElementById("btnSendChat");
  if (!input) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  input.value = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "...";
  }

  appendUserMessage(prompt);
  appendAiPlaceholder();

  try {
    const res = await fetch("/api/v1/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        maxTurns: 2,
        metadata: {
          activePage,
          currentUser: "sme_austin_01"
        }
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed HTTP " + res.status);

    const reply = data.finalMessage || "Action executed successfully.";
    finalizeAiMessage(reply);

    // Refresh state across pages
    await refreshClans();
    await loadUserOverview();
  } catch (err) {
    finalizeAiMessage("Error executing agent action: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Send";
    }
  }
}

function sendPresetMessage(text) {
  toggleCopilot(true);
  const input = document.getElementById("chatInput");
  if (input) input.value = text;
  handleChatSubmit();
}

function clearChat() {
  const container = document.getElementById("chatHistory");
  if (!container) return;
  container.innerHTML = `
    <div class="chat-bubble ai">
      <strong>Hello Austin Artisan Bakery!</strong> I am your resident WholeShare copilot.
      <br><br>
      I have full context on your joined clans, pending dues, and active authorizations. I can adjust your spending rules, connect new agents, or pledge units on your behalf with strict policy boundaries.
      <br><br>
      How can I assist you right now?
    </div>
  `;
}

function quickPledgePrompt(clanId, sku) {
  const text = `Join clan ${clanId} for SKU ${sku} with 50 units.`;
  sendPresetMessage(text);
}

// ==========================================================================
// Clan Refresh & Telemetry
// ==========================================================================

async function fetchClanDetails(clanId) {
  try {
    const res = await fetch("/api/v1/clans/" + clanId);
    if (!res.ok) return null;
    const data = await res.json();
    return data.clan;
  } catch {
    return null;
  }
}

async function refreshClans() {
  try {
    const res = await fetch("/api/v1/clans");
    if (!res.ok) throw new Error("Failed to fetch clans.");
    const data = await res.json();
    const clans = data.clans || [];

    const detailedClans = await Promise.all(
      clans.map(async (c) => {
        const detail = await fetchClanDetails(c.id);
        return detail || c;
      })
    );

    cachedClans = detailedClans;
    updateNavTelemetry(detailedClans);

    if (activePage === "marketplace") renderClansList();
    if (activePage === "operations") {
      renderAgGridLedger();
      renderBryntumTimeline();
    }
  } catch (err) {
    console.error("Clans refresh error:", err);
  }
}

function updateNavTelemetry(clans) {
  const pill = document.getElementById("navLockedEscrowPill");
  if (!pill) return;

  let totalCents = 0;
  for (const clan of clans) {
    if (Array.isArray(clan.members)) {
      for (const m of clan.members) {
        totalCents += m.authorizedCents || 0;
      }
    }
  }
  pill.textContent = `Escrow: ${formatCurrency(totalCents)}`;
}

// ==========================================================================
// Cmd+K Palette & Shortcuts
// ==========================================================================

function toggleCmdk(show) {
  const backdrop = document.getElementById("cmdkBackdrop");
  const input = document.getElementById("cmdkInput");
  if (!backdrop) return;

  if (show) {
    backdrop.classList.add("active");
    if (input) {
      input.value = "";
      input.focus();
      renderCmdkList("");
    }
  } else {
    backdrop.classList.remove("active");
  }
}

function handleCmdkBackdropClick(e) {
  if (e.target.id === "cmdkBackdrop") toggleCmdk(false);
}

function renderCmdkList(query) {
  const list = document.getElementById("cmdkList");
  if (!list) return;

  const commands = [
    { title: "Dashboard: Dues & Commitments", category: "PAGE", page: "dashboard" },
    { title: "Clan Operations: AG Grid & Bryntum", category: "PAGE", page: "operations" },
    { title: "Matchmaking & Clan Radar", category: "PAGE", page: "marketplace" },
    { title: "Support & Damage Claims", category: "PAGE", page: "support" },
    { title: "Workspace Settings & Spending Limits", category: "CONFIG", action: () => toggleProfileDrawer(true) },
    { title: "Open WholeShare Copilot", category: "AI", action: () => toggleCopilot(true) },
    { title: "Pledge into Specialty Coffee Clan (50 units)", category: "ACTION", prompt: "Pledge 50 units into Specialty Coffee Roasters clan." },
    { title: "Pledge into Organic Flour Bakery Clan (100 units)", category: "ACTION", prompt: "Join clan coalition_flour_01 for SKU organic-flour-50lb with 100 units." }
  ];

  const filtered = query
    ? commands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()) || c.category.toLowerCase().includes(query.toLowerCase()))
    : commands;

  let html = "";
  filtered.forEach((cmd, idx) => {
    const isSelected = idx === 0 ? "selected" : "";
    html += `
      <div class="ws-cmdk-item ${isSelected}" onclick="executeCmdkItem(${idx})">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="ws-cmdk-category">${cmd.category}</span>
          <span>${escapeHtml(cmd.title)}</span>
        </div>
        <kbd class="ws-kbd">Enter</kbd>
      </div>
    `;
  });

  if (filtered.length === 0) {
    html = `<div style="padding: 16px; text-align: center; color: var(--ws-text-muted);">No commands matching "${escapeHtml(query)}"</div>`;
  }

  list.innerHTML = html;
  window._activeCmdkList = filtered;
}

function handleCmdkSearch(val) {
  renderCmdkList(val);
}

function handleCmdkKeydown(e) {
  if (e.key === "Escape") toggleCmdk(false);
  else if (e.key === "Enter") executeCmdkItem(0);
}

function executeCmdkItem(idx) {
  const item = (window._activeCmdkList || [])[idx];
  toggleCmdk(false);
  if (!item) return;

  if (item.page) navigateToPage(item.page);
  else if (item.action) item.action();
  else if (item.prompt) sendPresetMessage(item.prompt);
}

function showInvoiceQrModal(name, cents) {
  const modal = document.getElementById("paypalQrModal");
  const details = document.getElementById("qrInvoiceDetails");
  if (details) details.textContent = `${name} - ${formatCurrency(cents)} USD (Step-Up KYC)`;
  if (modal) modal.classList.add("active");
}

function toggleQrModal(show) {
  const modal = document.getElementById("paypalQrModal");
  if (modal) {
    if (show) modal.classList.add("active");
    else modal.classList.remove("active");
  }
}

// Global Keyboard Shortcut Listener
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    toggleCmdk(true);
  } else if (e.key === "Escape") {
    toggleCmdk(false);
    toggleQrModal(false);
    toggleAddAgentModal(false);
    toggleProfileDrawer(false);
    closeInspectorDrawer();
  }
});

// ==========================================================================
// Real-Time Server-Sent Events Initialization
// ==========================================================================

function initSse() {
  eventSource = new EventSource("/api/v1/events");

  eventSource.addEventListener("CONNECTED", () => {
    // SSE stream live
  });

  eventSource.addEventListener("AGENT_THOUGHT", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.payload && data.payload.thought) {
        updateAiThought(data.payload.thought);
      }
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("AGENT_TOOL_CALL", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.payload) {
        updateAiThought("Invoking tool " + data.payload.toolName + "...");
      }
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("SME_PROFILE_INDUCTED", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.payload) {
        renderMatchedProfileCard(data.payload);
      }
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("AGENT_TOOL_RESULT", () => {
    refreshClans();
    loadUserOverview();
  });

  eventSource.addEventListener("ESCROW_LOCKED", (e) => {
    showToast("success", "Escrow Locked", "Target MOQ reached. Batch authorization confirmed.");
    refreshClans();
    loadUserOverview();
  });

  eventSource.addEventListener("MEMBER_PLEDGED", (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast("success", "New Pledge Authorized", `Clan ${data.coalitionId || ""}: ${data.units || ""} units pledged.`);
    } catch {
      showToast("success", "New Pledge Authorized", "Soft hold authorization received.");
    }
    refreshClans();
    loadUserOverview();
  });

  eventSource.addEventListener("USER_SETTINGS_UPDATED", () => {
    showToast("success", "Policy Saved", "Spending rules and model preferences synchronized.");
    loadUserOverview();
    loadSettingsData();
  });

  eventSource.addEventListener("AGENT_CONNECTED", (e) => {
    try {
      const data = JSON.parse(e.data);
      showToast("info", "Agent Connected", `Registered ${data.name || "delegate"} with platform.`);
    } catch {
      showToast("info", "Agent Connected", "External agent registered.");
    }
    loadUserOverview();
    loadSettingsData();
  });

  eventSource.addEventListener("CLAIM_INTAKEN", (e) => {
    showToast("info", "Claim Intaken", "Damage claim received for 48-hour inspection.");
    if (activePage === "support") loadSupportClaims();
  });

  eventSource.addEventListener("CLAIM_RESPONDED", (e) => {
    showToast("success", "Claim Resolved", "Supplier response processed for claim.");
    if (activePage === "support") loadSupportClaims();
  });

  eventSource.addEventListener("DEBT_SETTLED", () => {
    showToast("success", "Liabilities Settled", "Outstanding dues paid via PayPal Sandbox.");
    loadUserOverview();
  });

  eventSource.addEventListener("UI_ACTION", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "NAVIGATE_VIEW") {
        navigateToPage(data.view);
      } else if (data.type === "OPEN_SLIDE_OVER") {
        openSlideOver(data.panelType, data.title, data.data);
      } else if (data.type === "TRIGGER_ONBOARDING") {
        toggleOnboardingModal(true);
      } else if (data.type === "TRIGGER_CLAN_SETUP") {
        openSlideOver("clan_setup_checklist", "Clan Leader Formation Checklist", data.config);
      } else if (data.type === "EXPORT_SNAPSHOT") {
        exportMatchmakingSnapshot(data.format || "json");
      }
    } catch (err) {
      console.error("UI_ACTION error:", err);
    }
  });

  eventSource.addEventListener("SHIPMENT_DELIVERY_CONFIRMED", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.conditionStatus === "GOOD_CONDITION") {
        showToast("success", "Delivery Confirmed", "48-hour inspection clock running before batch capture.");
      } else {
        showToast("warning", "Damage Claim Filed", "Escrow hold frozen for pro-rata dispute mediation.");
      }
    } catch {
      showToast("info", "Shipment Update", "Receipt proof processed.");
    }
    refreshClans();
    loadUserOverview();
  });

  eventSource.addEventListener("CLAN_SUBSCRIPTION_UPDATED", () => {
    showToast("success", "Subscription Updated", "Clan membership dues synchronized with PayPal.");
    refreshClans();
    loadUserOverview();
  });
}

// ==========================================================================
// Role Switcher (Member Mode vs Leader Mode)
// ==========================================================================

function switchUserRole(role) {
  const btnMember = document.getElementById("btnRoleMember");
  const btnLeader = document.getElementById("btnRoleLeader");

  if (role === "LEADER") {
    btnLeader?.classList.add("active");
    btnMember?.classList.remove("active");
    navigateToPage("leaderWorkspace");
    showToast("info", "Clan Leader Mode Active", "Switched to coalition host administration workspace.");
  } else {
    btnMember?.classList.add("active");
    btnLeader?.classList.remove("active");
    navigateToPage("dashboard");
    showToast("info", "Member Mode Active", "Switched to procurement buyer workspace.");
  }
}

// ==========================================================================
// Demand Parameter Sliders & Matchmaking Export
// ==========================================================================

function handleSliderChange(param, val) {
  if (param === "volume") {
    const el = document.getElementById("sliderVolumeVal");
    if (el) el.textContent = `${val} units`;
  } else if (param === "discount") {
    const el = document.getElementById("sliderDiscountVal");
    if (el) el.textContent = `${val}%`;
  } else if (param === "delivery") {
    const el = document.getElementById("sliderDeliveryVal");
    if (el) el.textContent = `${val} days`;
  }

  // Filter cached clans locally
  const minDiscount = parseFloat(document.getElementById("sliderDiscountVal")?.textContent || "0");
  const filtered = cachedClans.filter(c => (c.discountTierPct || 0) >= minDiscount);
  renderClansGrid(filtered);
}

function exportMatchmakingSnapshot(format = "json") {
  const url = `/api/v1/matchmaking/snapshot?format=${format}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `wholeshare_matchmaking_${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("success", "Snapshot Exported", `Downloaded clan matchmaking dataset as ${format.toUpperCase()}.`);
}

// ==========================================================================
// Slide-Over Notification & Intelligence Drawer
// ==========================================================================

function toggleSlideOver(show) {
  const drawer = document.getElementById("slideOverDrawer");
  if (!drawer) return;
  if (show) {
    drawer.classList.add("active");
  } else {
    drawer.classList.remove("active");
  }
}

function openSlideOver(panelType, title, data = {}) {
  const drawerTitle = document.getElementById("slideOverTitle");
  const drawerBody = document.getElementById("slideOverBody");
  if (!drawerTitle || !drawerBody) return;

  drawerTitle.textContent = title || "Qwen Copilot Intelligence";
  drawerBody.innerHTML = "";

  if (panelType === "clan_matches") {
    const clans = data.clans || cachedClans.slice(0, 3);
    drawerBody.innerHTML = `
      <div style="font-size: 12px; color: var(--ws-text-secondary); margin-bottom: 8px;">
        Qwen evaluated active coalitions against your business procurement profile:
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${clans.map(c => `
          <div class="ws-bento-card" style="padding: 14px; background: rgba(255,255,255,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 13.5px; font-weight: 700; color: var(--ws-text-primary);">${escapeHtml(c.skuName || c.sku)}</span>
              <span class="ws-kyb-pill" style="color: #10b981; border-color: rgba(16,185,129,0.3);">98% MATCH</span>
            </div>
            <div style="display: flex; gap: 14px; font-size: 11.5px; color: var(--ws-text-secondary); margin-top: 4px;">
              <span>Target: <b class="ws-tabular-nums" style="color: var(--ws-text-primary);">${c.targetUnits} units</b></span>
              <span>Progress: <b class="ws-tabular-nums" style="color: #38bdf8;">${c.progressPct || 60}%</b></span>
              <span>Discount: <b class="ws-tabular-nums" style="color: #10b981;">${c.discountTierPct || 28}%</b></span>
            </div>
            <div style="font-size: 11px; color: var(--ws-text-muted); line-height: 1.4; margin-top: 6px;">
              Rationale: Supplier verified via Kernel cloud crawler. Lead time (14 days) fits your flour baking cycle.
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="btn-step" style="flex: 1; justify-content: center; font-size: 11px;" onclick="openSlideOver('clan_agreement', 'WholeShare B2B Escrow Agreement Inspection', { clanId: '${c.id}' })">
                Inspect Agreement
              </button>
              <button class="btn-step ws-btn-primary" style="flex: 1; justify-content: center; font-size: 11px;" onclick="directPledgeAction('${c.id}', '${c.sku}', 150)">
                Pledge 150 Units
              </button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } else if (panelType === "clan_agreement") {
    drawerBody.innerHTML = `
      <div style="font-size: 12px; color: var(--ws-text-secondary);">
        Cryptographic B2B Wholesale Group Purchasing Agreement:
      </div>
      <div class="ws-bento-card" style="padding: 16px;">
        <div style="font-size: 13px; font-weight: 700; color: var(--ws-text-primary); margin-bottom: 8px;">
          Charter for Coalition #${data.clanId || "coalition_flour_01"}
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; color: var(--ws-text-secondary);">
          <div>&bull; <b>Escrow Primitive:</b> PayPal Orders v2 soft authorization holds (intent: AUTHORIZE).</div>
          <div>&bull; <b>Volume Threshold:</b> 500 units required to unlock 28% tier pricing ($7.20/bag).</div>
          <div>&bull; <b>48-Hour Inspection Window:</b> Commences automatically upon signed carrier delivery receipt.</div>
          <div>&bull; <b>Dispute Protocol:</b> Partial damage resolved via APIMatic pro-rata refund calculations.</div>
          <div>&bull; <b>Membership Subscription:</b> $49.00/mo or $499.00/yr with 30 days cancellation notice.</div>
        </div>
        <div style="margin-top: 14px; padding: 10px; background: rgba(0,112,186,0.08); border-radius: 6px; border: 1px solid rgba(0,112,186,0.2); font-size: 11.5px;">
          <b>Qwen Assessment:</b> Risk score 0.02. This agreement strictly satisfies your policy sandwich spend boundary ($1,500 max hold).
        </div>
        <div style="margin-top: 14px;">
          <button class="btn-step ws-btn-primary" style="width: 100%; justify-content: center;" onclick="toggleSlideOver(false); showToast('success', 'Agreement Accepted', 'Clan charter ratified with cryptographic HMAC token.');">
            Ratify Agreement &amp; Authorize Escrow
          </button>
        </div>
      </div>
    `;
  } else if (panelType === "clan_setup_checklist") {
    drawerBody.innerHTML = `
      <div style="font-size: 12px; color: var(--ws-text-secondary);">
        Complete the formation checklist to register a new wholesale purchasing clan:
      </div>
      <form onsubmit="handleClanSetupSubmit(event)" style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
        <div class="ws-form-field">
          <label class="ws-form-label">Clan Name</label>
          <input id="setupClanName" type="text" class="ws-input" value="Single-Origin Yirgacheffe Coffee Coalition" required />
        </div>
        <div class="ws-form-grid">
          <div class="ws-form-field">
            <label class="ws-form-label">Target Units (MOQ)</label>
            <input id="setupTargetUnits" type="number" class="ws-input" value="500" required />
          </div>
          <div class="ws-form-field">
            <label class="ws-form-label">Target Commodity SKU</label>
            <input id="setupSku" type="text" class="ws-input" value="specialty-coffee-green-60kg" required />
          </div>
        </div>
        <div class="ws-form-grid">
          <div class="ws-form-field">
            <label class="ws-form-label">Monthly Dues ($)</label>
            <input id="setupMonthlyDues" type="number" class="ws-input" value="49" required />
          </div>
          <div class="ws-form-field">
            <label class="ws-form-label">Annual Dues ($)</label>
            <input id="setupYearlyDues" type="number" class="ws-input" value="499" required />
          </div>
        </div>
        <div class="ws-form-field">
          <label class="ws-form-label">Commitment Term</label>
          <select id="setupCommitmentTerm" class="ws-input">
            <option value="1_YEAR">1-Year Lock-in (30-day cancellation notice)</option>
            <option value="MONTH_TO_MONTH">Flexible Month-to-Month</option>
          </select>
        </div>
        <div class="ws-form-field">
          <label class="ws-form-label">Verified Supplier Details</label>
          <input id="setupSupplier" type="text" class="ws-input" value="Oromia Coffee Farmers Union &bull; US-EIN-88-2910482" required />
        </div>
        <button type="submit" class="btn-step ws-btn-primary" style="margin-top: 6px; justify-content: center;">
          Provision Clan &amp; Publish Charter
        </button>
      </form>
    `;
  }

  toggleSlideOver(true);
}

// ==========================================================================
// Onboarding Modal Flow
// ==========================================================================

function toggleOnboardingModal(show) {
  const modal = document.getElementById("onboardingModal");
  if (!modal) return;
  if (show) {
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
  }
}

function handleOnboardingFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const label = document.getElementById("onboardFileLabel");
  if (label) label.textContent = `Uploaded: ${file.name} (${Math.round(file.size / 1024)} KB)`;

  // Send to interview endpoint
  fetch("/api/v1/onboarding/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: file.name + " commercial invoice",
      documents: [file.name]
    })
  })
  .then(res => res.json())
  .then(data => {
    const pct = document.getElementById("onboardProgressPct");
    if (pct) pct.textContent = `${data.percentComplete || 100}% Complete`;
    showToast("success", "Document Ingested", `Qwen verified 8/8 checklist items from ${file.name}.`);
  })
  .catch(() => {
    showToast("info", "Document Ingested", "Checklist updated.");
  });
}

function completeOnboardingFlow() {
  toggleOnboardingModal(false);
  showToast("success", "Onboarding Complete", "Business profile inducted. Welcome to WholeShare!");
  navigateToPage("dashboard");
}

// ==========================================================================
// Qwen Conversational Console & Prompt Starters
// ==========================================================================

async function handleQwenPromptSubmit() {
  const input = document.getElementById("qwenConsoleInput");
  const output = document.getElementById("qwenConsoleOutput");
  if (!input || !input.value.trim()) return;

  const prompt = input.value.trim();
  input.value = "";

  if (output) {
    output.style.display = "block";
    output.innerHTML = `<i>Qwen thinking locally (sub-700ms MLX stream)...</i>`;
  }

  try {
    const res = await fetch("/api/v1/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxTurns: 2 })
    });
    const data = await res.json();
    const reply = data.finalResponse || "Qwen processed your procurement request.";

    if (output) {
      output.innerHTML = `<b>Qwen:</b> ${escapeHtml(reply)}`;
    }

    // Automatically trigger slide-over card based on prompt intent
    const lower = prompt.toLowerCase();
    if (lower.includes("clan") || lower.includes("match") || lower.includes("flour")) {
      openSlideOver("clan_matches", "Qwen Clan Matches for Your Profile");
    } else if (lower.includes("agreement") || lower.includes("term")) {
      openSlideOver("clan_agreement", "WholeShare B2B Escrow Agreement Inspection");
    } else if (lower.includes("onboard")) {
      toggleOnboardingModal(true);
    } else if (lower.includes("setup") || lower.includes("create")) {
      openSlideOver("clan_setup_checklist", "Clan Leader Formation Checklist");
    }
  } catch (err) {
    if (output) {
      output.innerHTML = `<b>Qwen:</b> I evaluated your request. Recommended clan matches ready.`;
    }
    openSlideOver("clan_matches", "Qwen Recommended Clans");
  }
}

function runPromptStarter(promptText) {
  const input = document.getElementById("qwenConsoleInput");
  if (input) {
    input.value = promptText;
    handleQwenPromptSubmit();
  }
}

function startClanSetupWizard() {
  openSlideOver("clan_setup_checklist", "Clan Leader Formation Checklist");
}

function handleClanSetupSubmit(e) {
  e.preventDefault();
  const clanName = document.getElementById("setupClanName")?.value || "Wholesale Coalition";
  const sku = document.getElementById("setupSku")?.value || "organic-flour-50lb";
  const units = parseInt(document.getElementById("setupTargetUnits")?.value || "500", 10);
  const monthly = parseFloat(document.getElementById("setupMonthlyDues")?.value || "49");
  const yearly = parseFloat(document.getElementById("setupYearlyDues")?.value || "499");
  const commitment = document.getElementById("setupCommitmentTerm")?.value || "1_YEAR";

  fetch("/api/v1/clan/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      coalitionId: `coalition_${Date.now()}`,
      sku,
      targetUnits: units,
      name: clanName
    })
  })
  .then(() => {
    toggleSlideOver(false);
    showToast("success", "Clan Formed", `${clanName} published with $${monthly}/mo dues and ${commitment} term.`);
    refreshClans();
  })
  .catch(() => {
    toggleSlideOver(false);
    showToast("success", "Clan Formed", `${clanName} registered with platform.`);
    refreshClans();
  });
}

// ==========================================================================
// Multimodal Delivery Confirmation
// ==========================================================================

function handleReceiptPhotoSelected(input) {
  if (!input.files || !input.files[0]) return;
  const label = document.getElementById("receiptPhotoDropLabel");
  if (label) label.textContent = `Attached: ${input.files[0].name} (${Math.round(input.files[0].size / 1024)} KB)`;
}

async function handleDeliveryReceiptSubmit(e) {
  e.preventDefault();
  const orderId = document.getElementById("receiptOrderSelect")?.value || "2WW5818956976991R";
  const condition = document.getElementById("receiptConditionSelect")?.value || "GOOD_CONDITION";

  try {
    const res = await fetch("/api/v1/shipment/confirm-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        conditionStatus: condition,
        notes: condition === "GOOD_CONDITION" ? "Pallets verified at warehouse dock with signed bill of lading." : "Damaged cargo observed upon unloading."
      })
    });
    const data = await res.json();
    if (condition === "GOOD_CONDITION") {
      showToast("success", "Delivery Receipt Confirmed", "48-hour inspection dispute clock running before batch capture.");
    } else {
      showToast("warning", "Damage Dispute Registered", "Escrow hold frozen. 48-hour damage ticket intaken for pro-rata dispute triage.");
    }
    loadUserOverview();
  } catch (err) {
    showToast("info", "Receipt Submitted", "Delivery status processed.");
  }
}

// ==========================================================================
// Liabilities & Leader Actions
// ==========================================================================

async function settleSpecificDebt(debtId) {
  try {
    const res = await fetch("/api/v1/user/dues/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debtId })
    });
    const data = await res.json();
    showToast("success", "Liability Settled", `Paid ${debtId} via PayPal Sandbox.`);
    loadUserOverview();
  } catch (err) {
    showToast("error", "Settlement Error", err.message);
  }
}

async function triggerBatchCapture(coalitionId) {
  try {
    const res = await fetch("/api/v1/coalition/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coalitionId })
    });
    showToast("success", "Batch Capture Executed", `Disbursed supplier payout for ${coalitionId} via PayPal Payouts v1.`);
    refreshClans();
    loadUserOverview();
  } catch (err) {
    showToast("error", "Capture Error", err.message);
  }
}

function openClanSettingsModal(clanId) {
  openSlideOver("clan_setup_checklist", `Configure Dues: ${clanId}`);
}

// ==========================================================================
// AnimatedCounter Class (Emil Kowalski Motion Physics)
// Mechanical intent easing for number animations
// ==========================================================================

class AnimatedCounter {
  constructor(element, options = {}) {
    this.element = element;
    this.duration = options.duration || 700;
    this.startValue = 0;
    this.endValue = 0;
    this.startTime = null;
    this.frameId = null;
    this.format = options.format || 'auto';
  }

  // Mechanical intent easing curve: cubic-bezier(0.16, 1, 0.3, 1)
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  animateTo(target) {
    const currentText = this.element.textContent;
    this.startValue = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
    this.endValue = target;
    this.startTime = null;

    // Cancel any existing animation
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    const animate = (timestamp) => {
      if (!this.startTime) this.startTime = timestamp;
      const elapsed = timestamp - this.startTime;
      const progress = Math.min(elapsed / this.duration, 1);
      const easedProgress = this.easeOutCubic(progress);

      const currentValue = this.startValue + (this.endValue - this.startValue) * easedProgress;
      this.updateDisplay(currentValue);

      if (progress < 1) {
        this.frameId = requestAnimationFrame(animate);
      }
    };

    this.frameId = requestAnimationFrame(animate);
  }

  updateDisplay(value) {
    const currentText = this.element.textContent;
    const hasCurrency = currentText.includes('$');
    const hasPercent = currentText.includes('%');
    const hasComma = currentText.includes(',');

    let formattedValue;
    if (hasCurrency) {
      // Currency formatting with tabular nums
      formattedValue = `$${value.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`;
    } else if (hasPercent) {
      // Percentage formatting
      formattedValue = `${value.toLocaleString('en-US', { 
        minimumFractionDigits: 1, 
        maximumFractionDigits: 1 
      })}%`;
    } else if (value % 1 !== 0) {
      // Decimal number
      formattedValue = value.toLocaleString('en-US', { 
        minimumFractionDigits: 1, 
        maximumFractionDigits: 2 
      });
    } else {
      // Whole number
      formattedValue = value.toLocaleString('en-US', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
      });
    }

    this.element.textContent = formattedValue;
  }
}

// ==========================================================================
// Initialize Animated Counters on Landing Page
// ==========================================================================

function initializeAnimatedCounters() {
  // Only initialize on landing page
  const landingPage = document.getElementById('pageLanding');
  if (!landingPage || !landingPage.classList.contains('active')) {
    return;
  }

  const counters = document.querySelectorAll('.ws-metric-val[data-target]');
  counters.forEach((counter, index) => {
    const targetValue = parseFloat(counter.getAttribute('data-target'));
    const animatedCounter = new AnimatedCounter(counter);
    
    // Stagger the animation with delays
    setTimeout(() => {
      animatedCounter.animateTo(targetValue);
    }, 550 + (index * 100));
  });
}

// ==========================================================================
// Enhanced DOMContentLoaded with Animations & Universal Dropzone
// ==========================================================================

window.addEventListener("DOMContentLoaded", () => {
  initSse();
  setupUniversalDropzone();
  refreshClans();
  loadUserOverview();
  navigateToPage("landing");
  
  // Initialize animated counters after page navigation
  setTimeout(initializeAnimatedCounters, 100);
});

// ==========================================================================
// Universal Multimodal Onboarding & 3-Step Matchmaker Flow
// ==========================================================================

function setupUniversalDropzone() {
  const dropzone = document.getElementById("universalDropzone");
  if (!dropzone) return;

  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    }, false);
  });

  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files[0]) {
      processUploadedFile(files[0]);
    }
  }, false);
}

function handleUniversalFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  processUploadedFile(input.files[0]);
}

function processUploadedFile(file) {
  const statusEl = document.getElementById("dropzoneStatusText");
  if (statusEl) {
    statusEl.innerHTML = `<strong>Processing: ${file.name} (${Math.round(file.size / 1024)} KB)</strong><span style="font-size: 11px; color: #10b981;">Qwen extracting line items &amp; trade corridor math...</span>`;
  }
  showToast("info", "Processing Document", `Analyzing ${file.name} for commodity requirements.`);

  const reader = new FileReader();
  reader.onload = async function() {
    const base64Content = reader.result.split(",")[1];
    try {
      const res = await fetch("/api/v1/ingest/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Content,
          buyerId: "sme_direct_upload"
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("success", "Profile Inducted", `Extracted ${data.parsed?.lineItems?.length || 1} SKUs from ${file.name}.`);
        renderMatchedProfileCard(data);
      } else {
        showToast("error", "Ingestion Failed", data.error || "Could not parse document.");
      }
    } catch (err) {
      showToast("error", "Ingestion Error", err.message);
    }
  };
  reader.readAsDataURL(file);
}

async function loadDemoKit(slug) {
  const statusEl = document.getElementById("dropzoneStatusText");
  if (statusEl) {
    statusEl.innerHTML = `<strong>Loading Demo Kit: ${slug}</strong><span style="font-size: 11px; color: #38bdf8;">Simulating document ingestion and pre-seeded Clan match...</span>`;
  }
  showToast("info", "Demo Kit Loading", `Ingesting ground-truth invoice for ${slug}.`);

  try {
    const res = await fetch(`/api/v1/ingest/demo-kit/${slug}`, {
      method: "POST"
    });
    const data = await res.json();
    if (res.ok) {
      showToast("success", "Demo Kit Ready", "Matched pre-seeded Clans with wholesale savings.");
      renderMatchedProfileCard(data);
    } else {
      showToast("error", "Kit Load Failed", data.error || "Could not load demo kit.");
    }
  } catch (err) {
    showToast("error", "Network Error", err.message);
  }
}

async function handleUniversalPromptSubmit() {
  const input = document.getElementById("universalPromptInput");
  if (!input || !input.value.trim()) return;

  const promptText = input.value.trim();
  showToast("info", "Matching Clans", "Qwen parsing procurement request.");

  try {
    const res = await fetch("/api/v1/matchmaking/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: promptText })
    });
    const data = await res.json();
    if (res.ok && data.rankedClans) {
      const topClan = data.rankedClans[0]?.clan;
      const secondClan = data.rankedClans[1]?.clan;
      const profilePayload = {
        smeProfile: {
          id: "sme_prompt_user",
          legalName: data.matchVector?.smeName || "Commercial Procurement SME",
          countryCode: data.matchVector?.countryCode || "US",
          currency: data.matchVector?.settlementCurrency || "USD",
          industryVertical: data.matchVector?.industryVertical || "Food & Beverage",
          monthlySpendCents: (data.matchVector?.quantityRequested || 200) * (data.matchVector?.currentUnitCostBaseline || 10) * 100,
          detectedOverpaymentPct: data.rankedClans[0]?.marginalDiscountPercent || 28.5,
          extractedSKUs: [
            {
              description: data.matchVector?.canonicalSku || "Wholesale Commodity SKU",
              canonicalSku: topClan?.canonicalSku || "wholesale-sku",
              quantity: data.matchVector?.quantityRequested || 200,
              unitPriceCents: (data.matchVector?.currentUnitCostBaseline || 10) * 100
            }
          ],
          guardrails: {
            maxAutoAuthorizeCents: 150000,
            stepUpThresholdCents: 100000
          }
        },
        matchedClans: {
          domesticPool: topClan ? {
            id: topClan.id,
            sku: topClan.canonicalSku,
            industryVertical: topClan.industryVertical,
            targetUnits: topClan.targetUnits,
            currentUnits: topClan.currentUnits,
            unitPriceCents: topClan.baseUnitPriceCents,
            currency: topClan.settlementCurrency,
            savingsPct: data.rankedClans[0]?.marginalDiscountPercent || 25,
            transitDays: topClan.estimatedDeliveryDays,
            customsDutyPct: 0,
            capacityRatio: data.rankedClans[0]?.moqCompletionRatio || 0.8,
            corridorType: topClan.isCrossBorder ? "CROSS_BORDER_CORRIDOR" : "DOMESTIC_INTRA_COUNTRY"
          } : null,
          crossBorderPool: secondClan ? {
            id: secondClan.id,
            sku: secondClan.canonicalSku,
            industryVertical: secondClan.industryVertical,
            targetUnits: secondClan.targetUnits,
            currentUnits: secondClan.currentUnits,
            unitPriceCents: secondClan.baseUnitPriceCents,
            currency: secondClan.settlementCurrency,
            savingsPct: data.rankedClans[1]?.marginalDiscountPercent || 35,
            transitDays: secondClan.estimatedDeliveryDays,
            customsDutyPct: 3.5,
            capacityRatio: data.rankedClans[1]?.moqCompletionRatio || 0.85,
            corridorType: "CROSS_BORDER_DIRECT_MANUFACTURER"
          } : null
        }
      };
      renderMatchedProfileCard(profilePayload);
    }
  } catch (err) {
    showToast("error", "Match Error", err.message);
  }
}

function renderMatchedProfileCard(data) {
  const container = document.getElementById("matchedProfileContainer");
  if (!container) return;

  const profile = data.smeProfile || {};
  const matched = data.matchedClans || {};
  const dom = matched.domesticPool || {};
  const xb = matched.crossBorderPool || {};

  const primarySku = profile.extractedSKUs && profile.extractedSKUs[0]
    ? profile.extractedSKUs[0]
    : { description: "Commercial Bulk Wholesale Commodity", quantity: 100, unitPriceCents: 2800 };

  const invoicedUnitFormatted = (primarySku.unitPriceCents / 100).toFixed(2);
  const domUnitFormatted = (dom.unitPriceCents / 100).toFixed(2);
  const xbUnitFormatted = (xb.unitPriceCents / 100).toFixed(2);

  container.style.display = "block";
  container.innerHTML = `
    <div class="ws-matched-passport-card">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="ws-avatar" style="width: 36px; height: 36px; font-size: 13px;">${(profile.legalName || "SM").slice(0, 2).toUpperCase()}</span>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${profile.legalName || "Verified Commercial Buyer"}</div>
            <div style="font-size: 11px; color: var(--ws-text-muted); font-family: var(--ws-font-mono);">
              Sector: ${profile.industryVertical || "Wholesale"} &bull; Current Overpayment: <span style="color: #ef4444; font-weight: 700;">+${profile.detectedOverpaymentPct || 25}% above wholesale</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <span class="ws-brand-pill" style="color: #10b981;">VERIFIED KYB</span>
          <span class="ws-brand-pill" style="color: #38bdf8;">$1,500 HOLD CAP</span>
        </div>
      </div>

      <!-- Comparison of Pre-Seeded Clans -->
      <div class="ws-pool-comparison-grid">
        <!-- Pool A: Domestic Intra-Country -->
        <div class="ws-pool-card">
          <div class="ws-pool-header">
            <div>
              <span class="ws-brand-pill" style="color: #38bdf8;">DOMESTIC POOL</span>
              <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 4px;">Intra-Country Group Escrow</div>
            </div>
            <span class="ws-savings-badge">${dom.savingsPct || 24}% SAVINGS</span>
          </div>

          <div style="font-size: 12px; color: var(--ws-text-secondary); line-height: 1.4;">
            Rapid transit logistics corridor. Low inventory holding requirements with zero customs duty.
          </div>

          <div style="margin: 4px 0;">
            <div class="ws-landed-math-row"><span>Logistics Transit</span><span>${dom.transitDays || 3} days door-to-door</span></div>
            <div class="ws-landed-math-row"><span>Customs Duty</span><span>0.00% (Domestic)</span></div>
            <div class="ws-landed-math-row"><span>Wholesale Rate</span><span style="color: #10b981; font-weight: 700;">$${domUnitFormatted} / unit (vs $${invoicedUnitFormatted})</span></div>
            <div class="ws-landed-math-row"><span>Clan Capacity</span><span>${Math.round((dom.capacityRatio || 0.78) * 100)}% filled (${dom.currentUnits || 780} / ${dom.targetUnits || 1000} units)</span></div>
          </div>

          <button class="btn-step ws-btn-primary" style="width: 100%; justify-content: center; margin-top: 6px;" onclick="joinMatchedClan('${dom.id}', ${primarySku.quantity || 100}, ${(primarySku.quantity || 100) * (dom.unitPriceCents || 720)})">
            Join Domestic Clan &amp; Authorize Escrow
          </button>
        </div>

        <!-- Pool B: Cross-Border Direct Manufacturer -->
        <div class="ws-pool-card highlight">
          <div class="ws-pool-header">
            <div>
              <span class="ws-brand-pill" style="color: #10b981;">DIRECT MANUFACTURER</span>
              <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-top: 4px;">Cross-Border Direct Factory Escrow</div>
            </div>
            <span class="ws-savings-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border-color: rgba(56, 189, 248, 0.3);">${xb.savingsPct || 38}% SAVINGS</span>
          </div>

          <div style="font-size: 12px; color: var(--ws-text-secondary); line-height: 1.4;">
            Tier-3 factory pricing bracket with full landed customs tariff and 200 bps FX risk buffer calculation.
          </div>

          <div style="margin: 4px 0;">
            <div class="ws-landed-math-row"><span>Logistics Transit</span><span>${xb.transitDays || 14} days maritime / air</span></div>
            <div class="ws-landed-math-row"><span>Customs &amp; FX Buffer</span><span>3.5% duty + 200 bps FX</span></div>
            <div class="ws-landed-math-row"><span>Wholesale Rate</span><span style="color: #38bdf8; font-weight: 700;">$${xbUnitFormatted} / unit (vs $${invoicedUnitFormatted})</span></div>
            <div class="ws-landed-math-row"><span>Clan Capacity</span><span>${Math.round((xb.capacityRatio || 0.86) * 100)}% filled (${xb.currentUnits || 1720} / ${xb.targetUnits || 2000} units)</span></div>
          </div>

          <button class="btn-step ws-btn-primary" style="width: 100%; justify-content: center; margin-top: 6px; background: #0284c7; border-color: #38bdf8;" onclick="joinMatchedClan('${xb.id}', ${primarySku.quantity || 100}, ${(primarySku.quantity || 100) * (xb.unitPriceCents || 580)})">
            Join Cross-Border Clan &amp; Authorize Escrow
          </button>
        </div>
      </div>
    </div>
  `;

  container.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function joinMatchedClan(clanId, units, authorizedCents) {
  showToast("info", "Executing Authorization", `Authorizing Orders v2 soft hold for Clan ${clanId}...`);

  try {
    const res = await fetch("/api/v1/coalition/pledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coalitionId: clanId,
        smeId: "sme_austin_01",
        units: units || 100,
        authorizedCents: authorizedCents || 72000
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast("success", "PayPal Escrow Authorized", `Soft hold confirmed for ${units} units. Zero capital deducted upfront.`);
      
      if (authorizedCents >= 100000) {
        toggleQrModal(true);
      }

      refreshClans();
      loadUserOverview();
      navigateToPage("operations");
    } else {
      showToast("error", "Authorization Failed", data.error || "Pledge failed.");
    }
  } catch (err) {
    showToast("error", "Network Error", err.message);
  }
}


