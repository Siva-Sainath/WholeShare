// Script to construct the verified WholeShare index.html with strict view isolation
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WholeShare: Autonomous AI-First B2B Wholesale Escrow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/ag-grid.min.css">
  <link rel="stylesheet" href="/ag-theme-quartz.min.css">
  <link rel="stylesheet" href="/bryntum.css">
  <link rel="stylesheet" href="/globals.css">
  <link rel="stylesheet" href="/animations.css">
  <link rel="stylesheet" href="/app.css">
</head>
<body class="ws-app-body">

  <!-- ======================================================================
       VIEW 1: STANDALONE LANDING PAGE (Tallyfold + Quillery Bento)
       Strictly isolated: #workspaceShell is hidden when landing is active.
       ====================================================================== -->
  <div id="viewLanding" data-ws-view="landing" class="ws-landing-wrapper">
    <!-- Minimal Glass Topbar (64px) -->
    <header class="ws-landing-header">
      <div class="ws-landing-nav-inner">
        <div class="ws-nav-brand">
          <svg class="ws-vault-logo-sm" viewBox="0 0 48 48" fill="none" style="width: 28px; height: 28px;" aria-label="WholeShare Escrow Vault">
            <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="4 2"/>
            <path d="M24 6 A18 18 0 0 1 39.5 33" stroke="#0070ba" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M39.5 33 A18 18 0 0 1 8.5 33" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M8.5 33 A18 18 0 0 1 24 6" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
            <polygon points="24,17 30,20.5 30,27.5 24,31 18,27.5 18,20.5" fill="#15181e" stroke="#10b981" stroke-width="1.5"/>
            <circle cx="24" cy="24" r="2.5" fill="#10b981"/>
          </svg>
          <span class="ws-brand-title">WHOLESHARE</span>
          <span class="ws-badge-status-pill ws-tabular-nums">LIVE PAYPAL SANDBOX</span>
        </div>
        <div class="ws-landing-nav-actions">
          <button class="btn-titanium" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'radar' } })">
            Launch Live Workspace
          </button>
          <button class="btn-paypal-gold" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'onboarding' } })">
            Start Business Onboarding
          </button>
        </div>
      </div>
    </header>

    <!-- Tallyfold Instrument-Panel Hero Section -->
    <main class="ws-tallyfold-hero">
      <div class="ws-tallyfold-container">
        <!-- Eyebrow Badge -->
        <div class="ws-instrument-eyebrow">
          <span class="ws-pulse-indicator"></span>
          <span class="ws-eyebrow-text">AUTONOMOUS B2B ESCROW ON PAYPAL FOR BUSINESS</span>
        </div>

        <!-- Headline & Subheadline -->
        <h1 class="ws-tallyfold-title">
          Tier-1 Factory Pricing for SMEs. Backed by PayPal Programmable Escrow.
        </h1>
        <p class="ws-tallyfold-subtitle">
          Small businesses aggregate purchasing volume into wholesale Clans, locking wholesale tier pricing with zero-fraud Orders v2 escrow and automated pro-rata dispute mediation.
        </p>

        <!-- CTA Buttons -->
        <div class="ws-tallyfold-actions">
          <button class="btn-paypal-gold ws-btn-lg" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'radar' } })">
            <span>Explore Wholesale Clans</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <button class="btn-titanium ws-btn-lg" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'onboarding' } })">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Onboard Business Profile</span>
          </button>
        </div>

        <!-- Tallyfold 3-Cell Telemetry Strip -->
        <div class="ws-telemetry-strip" data-testid="tallyfold-strip">
          <div class="ws-telemetry-cell ws-card">
            <span class="ws-telemetry-label">LIVE ESCROW LOCKED</span>
            <div class="ws-telemetry-value ws-tabular-nums" id="heroLockedEscrow">$142,800.00</div>
            <span class="ws-telemetry-meta">Orders v2 soft authorizations</span>
          </div>
          <div class="ws-telemetry-cell ws-card">
            <span class="ws-telemetry-label">ACTIVE PURCHASING CLANS</span>
            <div class="ws-telemetry-value ws-tabular-nums" id="heroActiveClans">18 Clans</div>
            <span class="ws-telemetry-meta">Multi-party buyer coalitions</span>
          </div>
          <div class="ws-telemetry-cell ws-card">
            <span class="ws-telemetry-label">AVERAGE VOLUME SAVINGS</span>
            <div class="ws-telemetry-value ws-tabular-nums" style="color: #38bdf8;" id="heroAvgSavings">28.4% Below Retail</div>
            <span class="ws-telemetry-meta">Tier-1 commercial pricing</span>
          </div>
        </div>

        <!-- Reviewer Persona Pills -->
        <div class="ws-persona-launcher">
          <span class="ws-persona-launcher-label">QUICK REVIEWER PERSONAS:</span>
          <div class="ws-persona-pill-group">
            <button class="ws-persona-pill" onclick="window.wholeshareCmd.dispatch({ action: 'START_PERSONA_ONBOARDING', params: { personaId: 'sme_austin_01' } })">
              <span class="ws-pill-badge">Austin</span>
              <span class="ws-pill-title">Artisan Sourdough Bakery</span>
              <span class="ws-pill-val ws-tabular-nums">$23,591.00</span>
            </button>
            <button class="ws-persona-pill" onclick="window.wholeshareCmd.dispatch({ action: 'START_PERSONA_ONBOARDING', params: { personaId: 'sme_bean_02' } })">
              <span class="ws-pill-badge">Medellin</span>
              <span class="ws-pill-title">Medellin Coffee Collective</span>
              <span class="ws-pill-val ws-tabular-nums">$41,200.00</span>
            </button>
            <button class="ws-persona-pill" onclick="window.wholeshareCmd.dispatch({ action: 'START_PERSONA_ONBOARDING', params: { personaId: 'sme_green_03' } })">
              <span class="ws-pill-badge">Shenzhen</span>
              <span class="ws-pill-title">Shenzhen SMT Electronics</span>
              <span class="ws-pill-val ws-tabular-nums">$68,450.00</span>
            </button>
            <button class="ws-persona-pill" onclick="window.wholeshareCmd.dispatch({ action: 'START_PERSONA_ONBOARDING', params: { personaId: 'sme_magnolia_02' } })">
              <span class="ws-pill-badge">Naivasha</span>
              <span class="ws-pill-title">Naivasha Floriculture</span>
              <span class="ws-pill-val ws-tabular-nums">$12,800.00</span>
            </button>
          </div>
        </div>

        <!-- Quillery 2x2 Asymmetric Bento Grid -->
        <div class="ws-bento-grid">
          <div class="ws-bento-card ws-card ws-card-spotlight">
            <div class="ws-bento-header">
              <span class="ws-bento-badge">PAYPAL ORDERS V2</span>
              <span class="ws-brand-pill" style="color: #10b981;">SOFT AUTHORIZATION</span>
            </div>
            <h3 class="ws-bento-title">Two-Step B2B Escrow Architecture</h3>
            <p class="ws-bento-desc">
              Buyers lock purchasing allocations via PayPal Orders v2 soft holds. Working capital remains in the buyer account until supplier freight reaches destination dock and passes the 48-hour inspection protocol.
            </p>
            <div class="ws-bento-metric-row">
              <span class="ws-bento-sublabel">Default Protection</span>
              <span class="ws-bento-subval ws-tabular-nums">100.0% Guaranteed</span>
            </div>
          </div>

          <div class="ws-bento-card ws-card ws-card-spotlight">
            <div class="ws-bento-header">
              <span class="ws-bento-badge">DEMAND POOLING</span>
              <span class="ws-brand-pill" style="color: #38bdf8;">MOQ THRESHOLD</span>
            </div>
            <h3 class="ws-bento-title">Autonomous Wholesale Clans</h3>
            <p class="ws-bento-desc">
              Small businesses pool volume to satisfy Minimum Order Quantities (MOQ). Live progress tracks calculate real-time savings ladders, automatically triggering supplier purchase orders upon reaching capacity.
            </p>
            <div class="ws-bento-metric-row">
              <span class="ws-bento-sublabel">Discount Ceiling</span>
              <span class="ws-bento-subval ws-tabular-nums">35.0% Volume Savings</span>
            </div>
          </div>

          <div class="ws-bento-card ws-card ws-card-spotlight">
            <div class="ws-bento-header">
              <span class="ws-bento-badge">FREIGHT GOVERNANCE</span>
              <span class="ws-brand-pill" style="color: #f59e0b;">MULTIMODAL ARBITRATION</span>
            </div>
            <h3 class="ws-bento-title">48-Hour Inspection Shield</h3>
            <p class="ws-bento-desc">
              Upon carrier delivery confirmation, the inspection clock activates. Members upload damaged freight photos and carrier bills of lading, driving automated pro-rata refund calculations through PayPal Disputes API.
            </p>
            <div class="ws-bento-metric-row">
              <span class="ws-bento-sublabel">Dispute Window</span>
              <span class="ws-bento-subval ws-tabular-nums">48 Hours Post-Delivery</span>
            </div>
          </div>

          <div class="ws-bento-card ws-card ws-card-spotlight">
            <div class="ws-bento-header">
              <span class="ws-bento-badge">AGENT INTEGRATION</span>
              <span class="ws-brand-pill" style="color: #a855f7;">WEBCMD + WEBMCP</span>
            </div>
            <h3 class="ws-bento-title">Autonomous Agent Parity</h3>
            <p class="ws-bento-desc">
              Every operation available to human users is programmatically exposed to external AI procurement agents via WebCmd statechart dispatch and standard WebMCP tools.
            </p>
            <div class="ws-bento-metric-row">
              <span class="ws-bento-sublabel">API Response</span>
              <span class="ws-bento-subval ws-tabular-nums">&lt; 80ms Latency</span>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div> <!-- /#viewLanding -->


  <!-- ======================================================================
       WORKSPACE SHELL: Efferd Dashboard 2 & 3
       Contains persistent left sidebar, contextual topbar, and mainStage.
       ====================================================================== -->
  <div id="workspaceShell" class="ws-app-layout" style="display: none;">

    <!-- Persistent Left Sidebar Navigation -->
    <aside class="ws-sidebar" id="appSidebar" aria-label="Main Navigation">
      <!-- Brand Header -->
      <div class="ws-sidebar-brand">
        <div class="ws-brand-mark" aria-hidden="true">
          <svg class="ws-vault-logo" viewBox="0 0 48 48" fill="none" style="width: 32px; height: 32px;" aria-label="WholeShare Escrow Vault">
            <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="4 2"/>
            <path d="M24 6 A18 18 0 0 1 39.5 33" stroke="#0070ba" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M39.5 33 A18 18 0 0 1 8.5 33" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M8.5 33 A18 18 0 0 1 24 6" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
            <polygon points="24,17 30,20.5 30,27.5 24,31 18,27.5 18,20.5" fill="#15181e" stroke="#10b981" stroke-width="1.5"/>
            <circle cx="24" cy="24" r="2.5" fill="#10b981"/>
          </svg>
        </div>
        <div class="ws-brand-info">
          <div class="ws-brand-title-row">
            <span class="ws-brand-text">WholeShare</span>
            <span class="ws-brand-pill">ESCROW</span>
          </div>
          <span class="ws-brand-sub">PayPal for Business</span>
        </div>
        <span class="ws-status-dot-pulse" title="PayPal Sandbox Live"></span>
      </div>

      <!-- Navigation Links -->
      <nav class="ws-sidebar-nav" aria-label="Workspace Pages">
        <div class="ws-nav-group-label">WORKSPACE VIEWS</div>
        <button class="ws-nav-item active" data-nav="onboarding" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'onboarding' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          <span class="ws-nav-label">Onboarding &amp; Profile</span>
        </button>
        <button class="ws-nav-item" data-nav="radar" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'radar' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
          <span class="ws-nav-label">Matchmaking Radar</span>
        </button>
        <button class="ws-nav-item" data-nav="ledger" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'ledger' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span class="ws-nav-label">Escrow Ledger (AG Grid)</span>
        </button>
        <button class="ws-nav-item" data-nav="logistics" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'logistics' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <span class="ws-nav-label">Logistics &amp; Disputes (Bryntum)</span>
        </button>
        <button class="ws-nav-item" data-nav="leader" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'leader' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span class="ws-nav-label">Clan Leader Console</span>
        </button>
        <button class="ws-nav-item" data-nav="subscriptions" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'subscriptions' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          <span class="ws-nav-label">Subscriptions &amp; Dues</span>
        </button>
        <button class="ws-nav-item" data-nav="settings" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'settings' } })">
          <svg class="ws-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span class="ws-nav-label">Governance &amp; Settings</span>
        </button>
      </nav>

      <!-- Sidebar Footer Persona -->
      <div class="ws-sidebar-footer">
        <div class="ws-profile-card ws-card" onclick="openPersonaModal()">
          <div class="ws-avatar" id="sidebarAvatar">AA</div>
          <div class="ws-profile-info">
            <span class="ws-profile-name" id="sidebarProfileName">Austin Artisan Bakery</span>
            <span class="ws-profile-tier" id="sidebarProfileTier">KYB VERIFIED &bull; TIER 1</span>
          </div>
          <button class="ws-btn-persona-switch" title="Switch Persona">&#8646;</button>
        </div>
      </div>
    </aside>

    <!-- Content Viewport -->
    <div class="ws-viewport">
      <!-- Top Contextual Action Bar (56px) -->
      <header class="ws-topbar" data-testid="telemetry-header">
        <div class="ws-topbar-left">
          <button class="ws-breadcrumb-root" onclick="window.wholeshareCmd.dispatch({ action: 'NAVIGATE_VIEW', params: { view: 'landing' } })">WholeShare</button>
          <span class="ws-breadcrumb-sep">/</span>
          <span class="ws-breadcrumb-current" id="topbarBreadcrumb">Onboarding &amp; Profile</span>
        </div>
        <div class="ws-topbar-right">
          <div class="telemetry-pill ws-tabular-nums" id="navLockedEscrowPill" style="color: #10b981;">
            Escrow: $23,591.00
          </div>
          <button class="ws-topbar-action-btn" onclick="exportMatchmakingSnapshot()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export Snapshot</span>
          </button>
          <button class="ws-topbar-action-btn ws-btn-copilot" onclick="toggleCopilot(true)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Ask Qwen (Cmd+K)</span>
          </button>
        </div>
      </header>

      <!-- Main Stage Container with Strictly Isolated Views -->
      <main class="ws-main-stage" id="mainStage">

        <!-- ==================================================================
             VIEW 2: PROGRESSIVE ONBOARDING (View: onboarding)
             ================================================================== -->
        <section id="viewOnboarding" data-ws-view="onboarding" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Business Onboarding &amp; Procurement Intake</h2>
            <div class="ws-page-subtitle">Configure business legal identity, upload past procurement invoices, and establish spending boundaries.</div>
          </div>

          <div class="ws-onboarding-split">
            <!-- Left: Document & File Intake Dropper -->
            <div class="ws-intake-card ws-card">
              <h3 class="ws-card-title">1. Procurement Knowledge Dropper</h3>
              <p class="ws-card-desc">Drop past supplier invoices (PDF), wholesale price sheets (XLSX/CSV), or paste catalog links. Qwen auto-extracts your commodity profile.</p>

              <div class="ws-dropzone" id="onboardingDropzone" onclick="document.getElementById('onboardingFileInput').click()">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span class="ws-drop-text">Drag commercial invoice, price sheet, or click to browse</span>
                <span class="ws-drop-sub">Accepts PDF, XLSX, CSV, PNG, TXT</span>
                <input type="file" id="onboardingFileInput" style="display: none;" onchange="handleOnboardingFileUpload(this.files)">
              </div>

              <div class="ws-sample-kits">
                <span class="ws-sample-kits-label ws-tabular-nums">DEMO INVOICE KITS (1-CLICK LOAD):</span>
                <div class="ws-sample-btn-group">
                  <button type="button" class="ws-btn-sample ws-tabular-nums" onclick="loadSampleInvoiceKit('sysco_bakery')">Sysco Organic Flour Invoice (PDF)</button>
                  <button type="button" class="ws-btn-sample ws-tabular-nums" onclick="loadSampleInvoiceKit('coffee_manifest')">Medellin Green Coffee Manifest (XLSX)</button>
                  <button type="button" class="ws-btn-sample ws-tabular-nums" onclick="loadSampleInvoiceKit('smt_electronics')">Shenzhen Component BOM (CSV)</button>
                </div>
              </div>

              <!-- Qwen Extracted Fact Review Box -->
              <div class="ws-extracted-box" id="qwenExtractedPreview">
                <div class="ws-extracted-header">
                  <span class="ws-brand-pill" style="color: #10b981;">QWEN 3.5 EXTRACTOR</span>
                  <span class="ws-tabular-nums" style="font-size: 11px; color: var(--ws-text-muted);">Confidence: 99.2%</span>
                </div>
                <div class="ws-extracted-body" id="extractedFactsList">
                  <div class="ws-fact-row"><span class="ws-fact-k">Business Name:</span><span class="ws-fact-v" id="factBusiness">Austin Artisan Bakery</span></div>
                  <div class="ws-fact-row"><span class="ws-fact-k">Target Commodity:</span><span class="ws-fact-v" id="factCommodity">Organic Bread Flour (50lb Sacks)</span></div>
                  <div class="ws-fact-row"><span class="ws-fact-k">Monthly Demand:</span><span class="ws-fact-v ws-tabular-nums" id="factVolume">200 Units / Month</span></div>
                  <div class="ws-fact-row"><span class="ws-fact-k">Baseline Unit Price:</span><span class="ws-fact-v ws-tabular-nums" id="factPrice">$28.50 / unit</span></div>
                </div>
              </div>
            </div>

            <!-- Right: 3-Step Segmented Stepper -->
            <div class="ws-stepper-card ws-card">
              <div class="ws-stepper-header">
                <h3 class="ws-card-title">2. Profile &amp; Spend Boundaries</h3>
                <!-- Segmented Stepper Progress -->
                <div class="ws-stepper-progress" data-step="1">
                  <div class="ws-step-indicator active ws-tabular-nums" id="stepIndicator1">Step 1: Identity</div>
                  <div class="ws-step-indicator ws-tabular-nums" id="stepIndicator2">Step 2: Demands</div>
                  <div class="ws-step-indicator ws-tabular-nums" id="stepIndicator3">Step 3: Spend Limits</div>
                </div>
              </div>

              <form id="onboardingForm" onsubmit="handleOnboardingSubmit(event)">
                <!-- Step 1 Pane -->
                <div class="ws-step-pane" id="stepPane1">
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="onboardBusinessName">Legal Business Name</label>
                    <input type="text" id="onboardBusinessName" class="ws-input" value="Austin Artisan Bakery Co" required>
                  </div>
                  <div class="ws-form-row">
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardTaxId">Tax ID / EIN</label>
                      <input type="text" id="onboardTaxId" class="ws-input" value="US-EIN-74-8921043" required>
                    </div>
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardCategory">Industry Category</label>
                      <select id="onboardCategory" class="ws-select">
                        <option value="Food & Beverage" selected>Food &amp; Beverage</option>
                        <option value="Specialty Coffee">Specialty Coffee</option>
                        <option value="Electronics MRO">Electronics MRO</option>
                        <option value="Floriculture">Floriculture</option>
                        <option value="Packaging & Paper">Packaging &amp; Paper</option>
                      </select>
                    </div>
                  </div>
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="onboardPaypalEmail">PayPal Business Merchant Email</label>
                    <input type="email" id="onboardPaypalEmail" class="ws-input" value="procurement@austinbakery.com" required>
                  </div>
                  <div class="ws-step-actions">
                    <button type="button" class="btn-titanium" onclick="goToStep(2)">Proceed to Demands &rarr;</button>
                  </div>
                </div>

                <!-- Step 2 Pane -->
                <div class="ws-step-pane" id="stepPane2" style="display: none;">
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="onboardSku">Primary Commodity SKU</label>
                    <input type="text" id="onboardSku" class="ws-input" value="flour-organic-wheat-50lb" required>
                  </div>
                  <div class="ws-form-row">
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardVolume">Monthly Volume Requirement</label>
                      <input type="number" id="onboardVolume" class="ws-input ws-tabular-nums" value="200" min="1" required>
                    </div>
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardTargetPrice">Target Wholesale Price (USD)</label>
                      <input type="number" id="onboardTargetPrice" class="ws-input ws-tabular-nums" value="20.50" step="0.01" required>
                    </div>
                  </div>
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="onboardCity">Primary Receiving City / Depot</label>
                    <input type="text" id="onboardCity" class="ws-input" value="Austin, Texas, USA" required>
                  </div>
                  <div class="ws-step-actions">
                    <button type="button" class="btn-titanium" onclick="goToStep(1)">&larr; Back</button>
                    <button type="button" class="btn-titanium" onclick="goToStep(3)">Set Spend Limits &rarr;</button>
                  </div>
                </div>

                <!-- Step 3 Pane -->
                <div class="ws-step-pane" id="stepPane3" style="display: none;">
                  <div class="ws-form-row">
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardAutoAuth">Max Auto-Authorize Soft Hold</label>
                      <input type="number" id="onboardAutoAuth" class="ws-input ws-tabular-nums" value="5000" min="100" step="100" required>
                    </div>
                    <div class="ws-form-group">
                      <label class="ws-form-label" for="onboardQrThreshold">Step-Up QR Threshold (USD)</label>
                      <input type="number" id="onboardQrThreshold" class="ws-input ws-tabular-nums" value="1000" min="500" step="100" required>
                    </div>
                  </div>
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="onboardAgentKey">External Agent Rest Token (ACP Parity)</label>
                    <input type="text" id="onboardAgentKey" class="ws-input ws-tabular-nums" value="acp_tok_live_79a21b38f9024c" readonly>
                  </div>
                  <div class="ws-step-actions">
                    <button type="button" class="btn-titanium" onclick="goToStep(2)">&larr; Back</button>
                    <button type="submit" class="btn-paypal-gold">Save Profile &amp; Open Matchmaking Radar</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>


        <!-- ==================================================================
             VIEW 3: CLAN MATCHMAKING RADAR (View: radar)
             ================================================================== -->
        <section id="viewRadar" data-ws-view="radar" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Wholesale Clan Matchmaking Radar</h2>
            <div class="ws-page-subtitle">Form and join multi-buyer coalitions, pool purchasing volume, and capture factory tier pricing.</div>
          </div>

          <!-- Radar Filter & Action Strip -->
          <div class="ws-radar-control-strip ws-card">
            <div class="ws-radar-category-pills">
              <button class="ws-cat-pill active" onclick="filterRadarCategory('ALL')">All Verticals</button>
              <button class="ws-cat-pill" onclick="filterRadarCategory('Food & Beverage')">Food &amp; Beverage</button>
              <button class="ws-cat-pill" onclick="filterRadarCategory('Specialty Coffee')">Specialty Coffee</button>
              <button class="ws-cat-pill" onclick="filterRadarCategory('Electronics MRO')">Electronics MRO</button>
              <button class="ws-cat-pill" onclick="filterRadarCategory('Floriculture')">Floriculture</button>
              <button class="ws-cat-pill" onclick="filterRadarCategory('Packaging & Paper')">Packaging</button>
            </div>
            <div class="ws-radar-search-row">
              <input type="text" id="radarSearchInput" class="ws-input" placeholder="Search commodity, supplier, or trade corridor..." oninput="handleRadarSearch(this.value)">
              <div class="ws-slider-wrapper">
                <span class="ws-slider-label">Min Volume:</span>
                <input type="range" id="radarMoqSlider" min="50" max="1000" step="50" value="100" oninput="handleRadarMoqSlider(this.value)">
                <span class="ws-slider-val ws-tabular-nums" id="radarMoqVal">100 units</span>
              </div>
              <button class="btn-titanium" onclick="exportMatchmakingSnapshot('json')">
                <span>Export JSON</span>
              </button>
              <button class="btn-titanium" onclick="exportMatchmakingSnapshot('csv')">
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <!-- 3-Column Clan Opportunity Cards Grid -->
          <div class="ws-clan-grid" id="radarClanGrid">
            <!-- Rendered dynamically by app.js from data/processed/clans_universe.json -->
          </div>
        </section>


        <!-- ==================================================================
             VIEW 4: ESCROW LEDGER (AG Grid Enterprise 31.3 & AG Studio) (View: ledger)
             ================================================================== -->
        <section id="viewLedger" data-ws-view="ledger" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Escrow Transactions &amp; Settlement Ledger</h2>
            <div class="ws-page-subtitle">Real-time financial journal of Orders v2 soft authorizations, invoice step-ups, and settlement payouts.</div>
          </div>

          <!-- Top KPI Ribbon -->
          <div class="ws-kpi-ribbon">
            <div class="ws-kpi-card ws-card">
              <span class="ws-kpi-label">LOCKED ESCROW VOLUME</span>
              <div class="ws-kpi-val ws-tabular-nums" id="ledgerKpiLocked">$142,800.00</div>
              <span class="ws-kpi-sub">PayPal Orders v2 holds</span>
            </div>
            <div class="ws-kpi-card ws-card">
              <span class="ws-kpi-label">ACTIVE SOFT HOLDS</span>
              <div class="ws-kpi-val ws-tabular-nums" id="ledgerKpiActiveHolds">18 Holds</div>
              <span class="ws-kpi-sub">Pre-authorized allocations</span>
            </div>
            <div class="ws-kpi-card ws-card">
              <span class="ws-kpi-label">STEP-UP QR INVOICES</span>
              <div class="ws-kpi-val ws-tabular-nums" id="ledgerKpiInvoices">7 Invoices</div>
              <span class="ws-kpi-sub ws-tabular-nums">&gt;$1,000 KYB compliance</span>
            </div>
            <div class="ws-kpi-card ws-card">
              <span class="ws-kpi-label">SETTLED PAYOUTS</span>
              <div class="ws-kpi-val ws-tabular-nums" style="color: #10b981;" id="ledgerKpiSettled">$89,450.00</div>
              <span class="ws-kpi-sub">Released post-inspection</span>
            </div>
          </div>

          <!-- AG Studio Natural-Language Agent Bridge Bar -->
          <div class="ws-ag-studio-bar ws-card">
            <div class="ws-studio-input-wrap">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <input type="text" id="agStudioQueryInput" class="ws-input ws-studio-input" placeholder="Instruct Qwen to filter, sort, or inspect ledger (e.g. 'Filter clans over 50% funded and sort by escrow')..." onkeydown="if(event.key==='Enter') executeAgStudioQuery(this.value)">
              <button class="btn-titanium ws-btn-sm" onclick="executeAgStudioQuery(document.getElementById('agStudioQueryInput').value)">Execute Agent Query</button>
            </div>
            <div class="ws-studio-quick-chips">
              <span class="ws-chips-label">QUICK FILTERS:</span>
              <button class="ws-quick-chip ws-tabular-nums" onclick="executeAgStudioQuery('Show coalitions over 50% funded')">&gt;50% Funded</button>
              <button class="ws-quick-chip" onclick="executeAgStudioQuery('Sort by highest escrow locked')">Sort Highest Escrow</button>
              <button class="ws-quick-chip" onclick="executeAgStudioQuery('Show only food and bakery vertical')">Food &amp; Bakery</button>
              <button class="ws-quick-chip" onclick="executeAgStudioQuery('Reset all grid filters')">Reset Grid</button>
            </div>
          </div>

          <!-- Full-Bleed AG Grid Container -->
          <div class="ws-grid-wrapper ws-card" style="padding: 0; overflow: hidden;">
            <div id="agGridLedgerContainer" class="ag-theme-quartz-dark" style="height: 520px; width: 100%;"></div>
          </div>
        </section>


        <!-- ==================================================================
             VIEW 5: LOGISTICS & DISPUTES (Bryntum Scheduler 8.0) (View: logistics)
             ================================================================== -->
        <section id="viewLogistics" data-ws-view="logistics" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">5-Stage Freight Logistics &amp; Inspection Shield</h2>
            <div class="ws-page-subtitle">Real-time freight milestones, carrier transit tracking, 48-hour delivery inspection window, and pro-rata damage mediation.</div>
          </div>

          <!-- Operations Mode Bar -->
          <div class="ws-logistics-toolbar ws-card">
            <div class="ws-toolbar-left">
              <span class="ws-toolbar-label">VIEWPORT MODE:</span>
              <button class="ws-mode-btn active" id="btnTimelineMode" onclick="setLogisticsMode('TIMELINE')">Bryntum Timeline View</button>
              <button class="ws-mode-btn" id="btnClaimsMode" onclick="setLogisticsMode('CLAIMS')">Active Damage Claims</button>
            </div>
            <div class="ws-toolbar-right">
              <button class="btn-titanium ws-btn-sm" onclick="openDisputeDrawer('coalition_flour_01')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Report Freight Damage (48h Clock)</span>
              </button>
            </div>
          </div>

          <!-- Real Bryntum Scheduler Container -->
          <div class="ws-bryntum-wrapper ws-card" style="padding: 0; overflow: hidden;">
            <div id="bryntumTimelineContainer" class="ws-bryntum-mount" style="height: 520px; width: 100%;"></div>
          </div>
        </section>


        <!-- ==================================================================
             VIEW 6: CLAN LEADER CONSOLE (View: leader)
             ================================================================== -->
        <section id="viewLeader" data-ws-view="leader" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Clan Leader Command Console</h2>
            <div class="ws-page-subtitle">Form wholesale coalitions, establish subscription pricing, inspect member pledges, and trigger atomic batch captures.</div>
          </div>

          <div class="ws-leader-split">
            <!-- Left: Clan Creation & Dues Pricing Wizard -->
            <div class="ws-leader-card ws-card">
              <h3 class="ws-card-title">1. Form Wholesale Coalition &amp; Subscription Terms</h3>
              <p class="ws-card-desc">Define commodity specifications, volume thresholds, and monthly vs discounted annual dues.</p>

              <form id="clanCreationForm" onsubmit="handleCreateClan(event)">
                <div class="ws-form-group">
                  <label class="ws-form-label" for="newClanName">Coalition / Clan Name</label>
                  <input type="text" id="newClanName" class="ws-input" value="Texas Sourdough Commercial Flour Coalition" required>
                </div>
                <div class="ws-form-row">
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="newClanSku">Target Commodity SKU</label>
                    <input type="text" id="newClanSku" class="ws-input" value="flour-organic-wheat-50lb" required>
                  </div>
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="newClanMoq">MOQ Target (Units)</label>
                    <input type="number" id="newClanMoq" class="ws-input ws-tabular-nums" value="500" min="50" required>
                  </div>
                </div>
                <div class="ws-form-row">
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="newMonthlyDues">Monthly Dues ($/month)</label>
                    <input type="number" id="newMonthlyDues" class="ws-input ws-tabular-nums" value="49" min="1" required>
                  </div>
                  <div class="ws-form-group">
                    <label class="ws-form-label" for="newYearlyDues">Yearly Dues ($/year &bull; 15% discount)</label>
                    <input type="number" id="newYearlyDues" class="ws-input ws-tabular-nums" value="499" min="10" required>
                  </div>
                </div>
                <div class="ws-form-group">
                  <label class="ws-form-label" for="newCommitmentTerm">Commitment Term &amp; Cancellation Notice</label>
                  <select id="newCommitmentTerm" class="ws-select">
                    <option value="1_YEAR" selected>1 Year Commitment (30-day notice)</option>
                    <option value="6_MONTH">6 Months Commitment (15-day notice)</option>
                    <option value="OPEN">Month-to-Month Open Term</option>
                  </select>
                </div>
                <button type="submit" class="btn-paypal-gold">Form Coalition &amp; Publish to Radar</button>
              </form>
            </div>

            <!-- Right: Member Escrow Audit & Atomic Batch Capture -->
            <div class="ws-leader-card ws-card">
              <h3 class="ws-card-title">2. Member Escrow Audit &amp; Batch Capture</h3>
              <p class="ws-card-desc">All member Orders v2 soft authorizations locked for Texas Sourdough Flour Coalition.</p>

              <div class="ws-table-container">
                <table class="ws-table">
                  <thead>
                    <tr>
                      <th>Member Business</th>
                      <th>Pledged Units</th>
                      <th>Authorized Escrow</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="leaderMemberTableBody">
                    <tr>
                      <td>Austin Artisan Bakery</td>
                      <td class="ws-tabular-nums">200 units</td>
                      <td class="ws-tabular-nums">$4,100.00</td>
                      <td><span class="ws-status-badge status-authorized">AUTHORIZED</span></td>
                    </tr>
                    <tr>
                      <td>Hill Country Pastries</td>
                      <td class="ws-tabular-nums">150 units</td>
                      <td class="ws-tabular-nums">$3,075.00</td>
                      <td><span class="ws-status-badge status-authorized">AUTHORIZED</span></td>
                    </tr>
                    <tr>
                      <td>San Antonio Bagels</td>
                      <td class="ws-tabular-nums">150 units</td>
                      <td class="ws-tabular-nums">$3,075.00</td>
                      <td><span class="ws-status-badge status-authorized">AUTHORIZED</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="ws-batch-capture-box">
                <div class="ws-batch-info">
                  <span class="ws-batch-total-label">Total Escrow Ready to Capture:</span>
                  <span class="ws-batch-total-val ws-tabular-nums">$10,250.00</span>
                </div>
                <button class="btn-paypal-gold ws-btn-lg" onclick="triggerAtomicBatchCapture()">
                  <span>Execute Atomic Batch Capture &amp; Freight Release</span>
                </button>
              </div>
            </div>
          </div>
        </section>


        <!-- ==================================================================
             VIEW 7: SUBSCRIPTIONS & DUES (View: subscriptions)
             ================================================================== -->
        <section id="viewSubscriptions" data-ws-view="subscriptions" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Clan Membership Subscriptions &amp; Invoicing</h2>
            <div class="ws-page-subtitle">PayPal Subscriptions billing API, monthly vs discounted annual commitments, and automated notice management.</div>
          </div>

          <div class="ws-subs-grid">
            <!-- Active Subscription Plan Card -->
            <div class="ws-plan-card ws-card ws-card-spotlight">
              <div class="ws-plan-header">
                <span class="ws-brand-pill" style="color: #38bdf8;">ACTIVE MEMBERSHIP</span>
                <span class="ws-status-badge status-authorized">ACTIVE</span>
              </div>
              <h3 class="ws-plan-title">Commercial Sourdough Wholesale Clan</h3>
              <div class="ws-plan-price-row">
                <span class="ws-price-num ws-tabular-nums">$49.00</span>
                <span class="ws-price-period">/ month billed via PayPal</span>
              </div>
              <p class="ws-plan-desc">Enables volume aggregation, zero-fraud escrow participation, and 48-hour freight inspection arbitration.</p>
              
              <div class="ws-plan-terms-box">
                <div class="ws-term-row"><span class="ws-term-k">Commitment Term:</span><span class="ws-term-v">1 Year Fixed Rate</span></div>
                <div class="ws-term-row"><span class="ws-term-k">Cancellation Notice:</span><span class="ws-term-v">30 Days Prior to Renewal</span></div>
                <div class="ws-term-row"><span class="ws-term-k">Annual Savings Option:</span><span class="ws-term-v" style="color: #10b981;">Switch to $499/yr (Save 15%)</span></div>
              </div>

              <div class="ws-plan-actions">
                <button class="btn-paypal-gold" onclick="switchSubscriptionCadence('YEARLY')">Upgrade to Annual ($499/yr)</button>
                <button class="btn-titanium" onclick="requestSubscriptionCancellation()">Request Cancellation Protocol</button>
              </div>
            </div>

            <!-- Dues Ledger & Invoicing v2 QR -->
            <div class="ws-subs-ledger-card ws-card">
              <h3 class="ws-card-title">Membership Dues Billing History</h3>
              <p class="ws-card-desc">PayPal Invoicing v2 step-up QR verification for recurring clan administration.</p>

              <div class="ws-table-container">
                <table class="ws-table">
                  <thead>
                    <tr>
                      <th>Billing Period</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Nov 2026 - Dec 2026</td>
                      <td class="ws-tabular-nums">$49.00</td>
                      <td>PayPal Subscriptions</td>
                      <td><span class="ws-status-badge status-authorized">PAID</span></td>
                    </tr>
                    <tr>
                      <td>Oct 2026 - Nov 2026</td>
                      <td class="ws-tabular-nums">$49.00</td>
                      <td>PayPal Subscriptions</td>
                      <td><span class="ws-status-badge status-authorized">PAID</span></td>
                    </tr>
                    <tr>
                      <td>Sep 2026 - Oct 2026</td>
                      <td class="ws-tabular-nums">$49.00</td>
                      <td>PayPal Subscriptions</td>
                      <td><span class="ws-status-badge status-authorized">PAID</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>


        <!-- ==================================================================
             VIEW 8: GOVERNANCE & SETTINGS (View: settings)
             ================================================================== -->
        <section id="viewSettings" data-ws-view="settings" class="ws-view-container" style="display: none;">
          <div class="ws-page-header">
            <h2 class="ws-page-title">Governance, Security &amp; Settings Boundary</h2>
            <div class="ws-page-subtitle">Role-gated policy boundaries, spend authorization thresholds, and cryptographic HMAC integrity keys.</div>
          </div>

          <div class="ws-settings-grid">
            <!-- Card 1: SME Member Guardrails (Editable) -->
            <div class="ws-settings-card ws-card">
              <div class="ws-card-badge-row">
                <span class="ws-brand-pill" style="color: #10b981;">MEMBER GUARDRAILS</span>
                <span style="font-size: 11px; color: var(--ws-text-muted);">Editable</span>
              </div>
              <h3 class="ws-card-title">Spend &amp; Authorization Limits</h3>
              
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingAutoAuth">Max Auto-Authorize Soft Hold (USD)</label>
                <input type="number" id="settingAutoAuth" class="ws-input ws-tabular-nums" value="5000">
              </div>
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingStepUp">Step-Up KYC QR Threshold (USD)</label>
                <input type="number" id="settingStepUp" class="ws-input ws-tabular-nums" value="1000">
              </div>
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingDisputeWindow">Dispute Inspection Window</label>
                <input type="text" id="settingDisputeWindow" class="ws-input" value="48 Hours Post Carrier Scan" readonly>
              </div>
              <button class="btn-titanium" onclick="saveMemberSettings()">Save Member Guardrails</button>
            </div>

            <!-- Card 2: Clan Leader Billing Terms (Role Gated) -->
            <div class="ws-settings-card ws-card">
              <div class="ws-card-badge-row">
                <span class="ws-brand-pill" style="color: #38bdf8;">LEADER POLICY</span>
                <span style="font-size: 11px; color: var(--ws-text-muted);">Role Gated</span>
              </div>
              <h3 class="ws-card-title">Coalition Billing Terms</h3>
              
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingMonthlyDues">Monthly Membership Dues</label>
                <input type="number" id="settingMonthlyDues" class="ws-input ws-tabular-nums" value="49">
              </div>
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingYearlyDues">Annual Membership Dues</label>
                <input type="number" id="settingYearlyDues" class="ws-input ws-tabular-nums" value="499">
              </div>
              <div class="ws-form-group">
                <label class="ws-form-label" for="settingNoticeDays">Cancellation Notice Window</label>
                <input type="number" id="settingNoticeDays" class="ws-input ws-tabular-nums" value="30">
              </div>
              <button class="btn-titanium" onclick="saveLeaderSettings()">Update Leader Policy</button>
            </div>

            <!-- Card 3: Immutable System Invariants (Cryptographically Locked) -->
            <div class="ws-settings-card ws-card">
              <div class="ws-card-badge-row">
                <span class="ws-brand-pill" style="color: #f59e0b;">IMMUTABLE INVARIANTS</span>
                <span style="font-size: 11px; color: #ef4444;">Locked (HTTP 403 on edit)</span>
              </div>
              <h3 class="ws-card-title">Financial Policy Boundary</h3>
              
              <div class="ws-lock-item">
                <span class="ws-lock-label">KYB Status:</span>
                <span class="ws-lock-val">VERIFIED &bull; TIER 1 (PayPal API Verified)</span>
              </div>
              <div class="ws-lock-item">
                <span class="ws-lock-label">Escrow Primitive:</span>
                <span class="ws-lock-val">Orders v2 (intent: "AUTHORIZE")</span>
              </div>
              <div class="ws-lock-item">
                <span class="ws-lock-label">HMAC Ingress Secret:</span>
                <span class="ws-lock-val ws-tabular-nums">hmac_sha256_e819b02a9401...</span>
              </div>
              <div class="ws-lock-item">
                <span class="ws-lock-label">Zero-Simulation Gate:</span>
                <span class="ws-lock-val" style="color: #10b981;">STRICT ENFORCEMENT &bull; ZERO MOCKS</span>
              </div>
            </div>
          </div>
        </section>

      </main> <!-- /#mainStage -->
    </div> <!-- /.ws-viewport -->
  </div> <!-- /#workspaceShell -->


  <!-- ======================================================================
       GLOBAL SLIDE-OVER DRAWERS & MODALS
       ====================================================================== -->
  <!-- 48-Hour Multimodal Damage Claim Drawer -->
  <div id="disputeSlideOverDrawer" class="ws-drawer" aria-hidden="true" style="display: none;">
    <div class="ws-drawer-backdrop" onclick="closeDisputeDrawer()"></div>
    <div class="ws-drawer-content ws-card">
      <div class="ws-drawer-header">
        <h3 class="ws-drawer-title">48-Hour Freight Damage Claim</h3>
        <button class="ws-drawer-close" onclick="closeDisputeDrawer()">&times;</button>
      </div>
      <div class="ws-drawer-body">
        <p class="ws-drawer-desc">Carrier manifest confirmed delivery. You have 48 hours to upload inspection proof. Pro-rata arbitration will calculate the adjusted payout release.</p>
        
        <form id="disputeForm" onsubmit="handleDisputeSubmit(event)">
          <div class="ws-form-group">
            <label class="ws-form-label">Carrier Tracking Number (USPS / UPS / FedEx)</label>
            <input type="text" id="disputeTracking" class="ws-input" value="1Z9999999999999999" readonly>
          </div>
          <div class="ws-form-row">
            <div class="ws-form-group">
              <label class="ws-form-label">Total Sacks Shipped</label>
              <input type="number" id="disputeTotalUnits" class="ws-input ws-tabular-nums" value="200" readonly>
            </div>
            <div class="ws-form-group">
              <label class="ws-form-label">Damaged / Missing Sacks</label>
              <input type="number" id="disputeDamagedUnits" class="ws-input ws-tabular-nums" value="20" min="1" max="200" oninput="calculateProRataRefund(this.value)">
            </div>
          </div>

          <!-- Photo Proof Dropper -->
          <div class="ws-form-group">
            <label class="ws-form-label">Photographic Damage Proof</label>
            <div class="ws-dropzone ws-dropzone-sm" onclick="document.getElementById('disputePhotoInput').click()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span class="ws-drop-text" style="font-size: 11.5px;">Click to attach freight photographs</span>
              <input type="file" id="disputePhotoInput" style="display: none;" onchange="handleDisputePhotoUpload(this.files)">
            </div>
          </div>

          <!-- Pro-Rata Arbitration Calculation Preview -->
          <div class="ws-arbitration-preview ws-card" style="padding: 12px; background: rgba(0,0,0,0.3);">
            <div class="ws-term-row"><span class="ws-term-k">Original Authorization:</span><span class="ws-term-v ws-tabular-nums" id="arbOriginalHold">$4,100.00</span></div>
            <div class="ws-term-row"><span class="ws-term-k">Pro-Rata Refund Claim:</span><span class="ws-term-v ws-tabular-nums" style="color: #ef4444;" id="arbRefundAmt">-$410.00</span></div>
            <div class="ws-term-row"><span class="ws-term-k">Adjusted Supplier Release:</span><span class="ws-term-v ws-tabular-nums" style="color: #10b981;" id="arbPayoutAmt">$3,690.00</span></div>
          </div>

          <div class="ws-drawer-actions">
            <button type="submit" class="btn-paypal-gold">Submit Claim to PayPal Disputes API</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Qwen 3.5 Copilot Drawer -->
  <div id="copilotDrawer" class="ws-copilot-drawer" aria-hidden="true" style="display: none;">
    <div class="ws-copilot-backdrop" onclick="toggleCopilot(false)"></div>
    <div class="ws-copilot-panel ws-card">
      <div class="ws-copilot-header">
        <div class="ws-copilot-title-row">
          <span class="ws-status-dot-pulse"></span>
          <span class="ws-copilot-title">Qwen 3.5 AI Copilot</span>
          <span class="ws-brand-pill" style="color: #10b981;">WebCmd &bull; Live Engine</span>
        </div>
        <button class="ws-drawer-close" onclick="toggleCopilot(false)">&times;</button>
      </div>
      <div class="ws-copilot-chat" id="copilotChatMessages">
        <div class="ws-chat-msg ws-msg-system">
          <span class="ws-msg-text">Connected to live local Qwen 3.5 engine on port 11434. Tool registry loaded with 47 PayPal actions. How can I assist your procurement today?</span>
        </div>
      </div>
      <div class="ws-copilot-input-area">
        <input type="text" id="copilotInput" class="ws-input" placeholder="Ask Qwen to execute escrow holds, inspect clans, or query ledger..." onkeydown="if(event.key==='Enter') sendCopilotMessage()">
        <button class="btn-titanium ws-btn-sm" onclick="sendCopilotMessage()">Send</button>
      </div>
    </div>
  </div>

  <!-- Persona Switcher Modal -->
  <div id="personaModal" class="ws-modal" style="display: none;">
    <div class="ws-modal-backdrop" onclick="closePersonaModal()"></div>
    <div class="ws-modal-content ws-card">
      <div class="ws-modal-header">
        <h3 class="ws-modal-title">Select Active SME Persona</h3>
        <button class="ws-modal-close" onclick="closePersonaModal()">&times;</button>
      </div>
      <div class="ws-modal-body">
        <div class="ws-persona-options">
          <button class="ws-persona-option-btn ws-card" onclick="selectPersona('sme_austin_01')">
            <span class="ws-avatar">AA</span>
            <div>
              <div class="ws-profile-name">Austin Artisan Bakery</div>
              <div class="ws-profile-tier">Austin, TX &bull; Organic Flour Buyer</div>
            </div>
          </button>
          <button class="ws-persona-option-btn ws-card" onclick="selectPersona('sme_bean_02')">
            <span class="ws-avatar">MC</span>
            <div>
              <div class="ws-profile-name">Medellin Coffee Collective</div>
              <div class="ws-profile-tier">Medellin, Colombia &bull; Green Coffee Buyer</div>
            </div>
          </button>
          <button class="ws-persona-option-btn ws-card" onclick="selectPersona('sme_green_03')">
            <span class="ws-avatar">SZ</span>
            <div>
              <div class="ws-profile-name">Shenzhen SMT Electronics</div>
              <div class="ws-profile-tier">Shenzhen, China &bull; SMT Components</div>
            </div>
          </button>
          <button class="ws-persona-option-btn ws-card" onclick="selectPersona('sme_magnolia_02')">
            <span class="ws-avatar">NF</span>
            <div>
              <div class="ws-profile-name">Naivasha Floriculture</div>
              <div class="ws-profile-tier">Naivasha, Kenya &bull; Cold-Chain Floriculture</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div id="toastContainer" class="ws-toast-container" aria-live="polite"></div>

  <!-- Enterprise License Registration (Bryntum & AG Grid / AG Studio) -->
  <script>
  </script>

  <!-- AG Grid Enterprise & Bryntum Scheduler Bundles -->
  <script src="/ag-grid-enterprise.min.js"></script>
  <script src="/app.js"></script>
</body>
</html>
`;

writeFileSync(resolve(process.cwd(), "src/web/public/index.html"), HTML, "utf8");
console.log("Successfully generated src/web/public/index.html with strict view isolation.");
