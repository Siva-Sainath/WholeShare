import { MosaicLogo } from "./components/MosaicLogo";
import React, { useState, useEffect } from "react";
import { ActiveView, OnboardingPrefill } from "./types";
import { LandingPage } from "./components/LandingPage";
import { WorkspaceShell, ActionNoticeBanner, ExtendedSlideOverState, ActionNotice, ModelActivity } from "./components/WorkspaceShell";
import { OnboardingView } from "./components/OnboardingView";
import { DiscoverView } from "./components/DiscoverView";
import { MyGroupsView } from "./components/MyGroupsView";
import { DisputesView } from "./components/DisputesView";
import { PayPalHubView } from "./components/PayPalHubView";
import { AgentsView } from "./components/AgentsView";
import { SettingsView } from "./components/SettingsView";
import { MosaicDeepWorkView } from "./components/MosaicDeepWorkView";
import { AgentInvitePage } from "./components/AgentInvitePage";
import { MosaicActivityPill } from "./components/MosaicActivityPill";
import { createWebmcpDispatcher } from "./webmcp-dispatcher";
import { resolveView, LEGACY_VIEW_ALIASES, VALID_VIEWS } from "./router";
import { PayPalAttribution } from "./components/PayPalAttribution";
import { GroupView } from "./components/GroupView";
import { CanvasDock } from "./components/CanvasDock";
import { GroupDashboardView } from "./components/GroupDashboardView";
import { InsightsView } from "./components/InsightsView";

export const App: React.FC = () => {
  const groupIdFromHash = (): string | null => {
    const match = typeof window !== "undefined" ? window.location.hash.match(/^#group\/([^/?]+)/) : null;
    return match ? decodeURIComponent(match[1]) : null;
  };
  const myGroupIdFromHash = (): string | null => {
    const match = typeof window !== "undefined" ? window.location.hash.match(/^#mygroup\/([^/?]+)/) : null;
    return match ? decodeURIComponent(match[1]) : null;
  };
  const insightsPageFromHash = (): string | null => {
    const match = typeof window !== "undefined" ? window.location.hash.match(/^#insights\/([^/?]+)/) : null;
    return match ? decodeURIComponent(match[1]) : null;
  };
  const getInitialView = (): ActiveView => {
    if (insightsPageFromHash()) return "insights";
    if (groupIdFromHash()) return "group";
    if (myGroupIdFromHash()) return "mygroup";
    if (typeof window !== "undefined" && window.location.hash) {
      const resolved = resolveView(window.location.hash.replace("#", ""));
      if (resolved) {
        window.location.hash = resolved === "landing" ? "" : resolved;
        return resolved;
      }
    }
    return "landing";
  };
  const [agentToken, setAgentToken] = useState<string | null>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const match = window.location.hash.match(/^#agent\/([a-zA-Z0-9_-]+)$/);
      return match ? match[1] : null;
    }
    return null;
  });
  const [activeView, setActiveView] = useState<ActiveView>(getInitialView);
  const [groupId, setGroupId] = useState<string | null>(groupIdFromHash);
  const [myGroupId, setMyGroupId] = useState<string | null>(myGroupIdFromHash);
  const [insightsPage, setInsightsPage] = useState<string | null>(insightsPageFromHash);
  const [onboardingConfirmed, setOnboardingConfirmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wholeshare_onboarding_confirmed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleHash = () => {
      const match = window.location.hash.match(/^#agent\/([a-zA-Z0-9_-]+)$/);
      if (match) {
        setAgentToken(match[1]);
        return;
      }
      setAgentToken(null);
      const h = window.location.hash.replace("#", "");
      const legacyTarget = LEGACY_VIEW_ALIASES[h];
      if (legacyTarget) {
        window.location.hash = legacyTarget;
        setActiveView(legacyTarget);
        return;
      }
      let isConfirmed = onboardingConfirmed;
      try {
        if (localStorage.getItem("wholeshare_onboarding_confirmed") === "true") {
          isConfirmed = true;
          setOnboardingConfirmed(true);
        }
      } catch {}
      if (groupIdFromHash()) {
        setActiveView("group");
        setGroupId(groupIdFromHash());
        return;
      }
      if (insightsPageFromHash()) {
        setActiveView("insights");
        setInsightsPage(insightsPageFromHash());
        return;
      }
      if (myGroupIdFromHash()) {
        setActiveView("mygroup");
        setMyGroupId(myGroupIdFromHash());
        return;
      }
      const hashView = resolveView(h);
      if (hashView) setActiveView(hashView);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [onboardingConfirmed]);
  const [radarFilter, setRadarFilter] = useState<{ query?: string; category?: string } | null>(null);
  const [ledgerQuery, setLedgerQuery] = useState<string>("");
  const [onboardingPrefill, setOnboardingPrefill] = useState<OnboardingPrefill | null>(null);
  const [slideOver, setSlideOver] = useState<ExtendedSlideOverState | null>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [modelActivity, setModelActivity] = useState<ModelActivity | null>(null);
  const [theme, setTheme] = useState<"obsidian" | "light">("light");

  const handleNavigate = (view: ActiveView | string) => {
    setAgentToken(null);
    let target = resolveView(view);
    if (target === "onboarding" && onboardingConfirmed) {
      target = "discover";
    }
    if (target) {
      setActiveView(target);
      window.location.hash = target === "landing" ? "" : target;
    }
  };

  // Wire theme setting switch
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    let styleEl = document.getElementById("ws-theme-switch");
    if (theme === "light") {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "ws-theme-switch";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        :root {
          --ws-bg-canvas: #f8fafc;
          --ws-bg-sidebar: #f1f5f9;
          --ws-bg-surface: #ffffff;
          --ws-bg-elevated: #ffffff;
          --ws-bg-card: #ffffff;
          --ws-bg-subtle: #e2e8f0;
          --ws-bg-hover: #f1f5f9;
          --ws-bg-active: rgba(0, 0, 0, 0.05);
          --ws-border-hairline: 1px solid #cbd5e1;
          --ws-border-subtle: rgba(0, 0, 0, 0.08);
          --ws-text-primary: #0f172a;
          --ws-text-secondary: #334155;
          --ws-text-muted: #64748b;
        }
        .ws-workspace-shell, .ws-app-body, .ws-root-viewport {
          background-color: #f8fafc !important;
          color: #0f172a !important;
        }
      `;
    } else if (styleEl) {
      styleEl.remove();
    }
  }, [theme]);

  const executeActionInternal = createWebmcpDispatcher({
    activeView,
    theme,
    slideOver,
    onboardingPrefill,
    handleNavigate,
    setRadarFilter,
    setLedgerQuery,
    setOnboardingPrefill,
    setOnboardingConfirmed,
    setSlideOver,
    setActionNotice,
    setModelActivity,
    setTheme
  });

  useEffect(() => {
    // Expose programmatic WebCmd dispatch bridge supporting all 23 actions
    window.wholeshareCmd = {
      dispatch: (cmd: any) => {
        if (!cmd) return false;
        const action = cmd.action || cmd.type;
        const params = cmd.params || cmd.payload || cmd.args || {};
        return executeActionInternal(action, params);
      }
    };

    window.switchActiveView = (view: ActiveView) => {
      handleNavigate(view);
    };

    // Support hash navigation
    const handleHash = () => {
      const match = window.location.hash.match(/^#agent\/([a-zA-Z0-9_-]+)$/);
      if (match) {
        setAgentToken(match[1]);
        return;
      }
      setAgentToken(null);
      const hashView = resolveView(window.location.hash.replace("#", ""));
      if (hashView) {
        setActiveView(hashView);
      }
    };

    window.addEventListener("hashchange", handleHash);
    handleHash();

    // SSE EventSource for real-time model action execution
    const events = new EventSource("/api/v1/events");
    const applyUiAction = (event: MessageEvent<string>) => {
      try {
        const raw = JSON.parse(event.data) as Record<string, any>;

        // Handle actionDispatcher envelope
        const payload = raw.payload;
        if (payload && typeof payload.type === "string") {
          if (payload.type === "STATE_SYNC" || payload.type === "connected" || payload.type === "PING") return;
          executeActionInternal(payload.type, payload);
          return;
        }

        // Handle qwenDispatcher envelope
        const eventName = raw.event;
        const data = raw.data;
        if (eventName) {
          if (eventName === "STATE_SYNC" || eventName === "connected" || eventName === "PING") return;
          executeActionInternal(eventName, data || {});
        }
      } catch {
        // Ignore malformed events and retain current view
      }
    };

    events.addEventListener("UI_ACTION", applyUiAction as EventListener);
    // One place that says which datasets a server event changes. Reports, grids and boards listen to ws:data-changed.
    const DATA_EVENTS: Record<string, string[]> = {
      CLAIM_APPROVED: ["claims"], CLAIM_RESPONDED: ["claims"], CLAIM_INTAKEN: ["claims"],
      SHIPMENT_DELIVERY_CONFIRMED: ["ledger", "groups", "shipments"], MEMBER_PLEDGED: ["ledger", "groups", "members"], PAYPAL_PLEDGE_AUTHORIZED: ["ledger", "groups", "members"],
      ESCROW_AUTHORIZED: ["ledger"], ESCROW_CAPTURED: ["ledger"], ESCROW_DISPUTED: ["ledger", "claims"], COALITION_LOCKED: ["ledger", "groups"], COALITION_SETTLED: ["ledger", "groups"],
      COALITION_UPDATED: ["ledger", "groups"], COALITION_CREATED: ["groups"], DEBT_SETTLED: ["ledger"],
      WORKSPACE_SEEDED: ["ledger", "groups", "members", "shipments", "claims"],
      CLAN_CREATED: ["ledger", "groups", "members"], PLEDGE_RECORDED: ["ledger", "groups", "members"], PLEDGE_RELEASED: ["ledger", "groups", "members"],
      MEMBER_LEFT_CLAN: ["ledger", "groups", "members"], COALITION_THRESHOLD_MET: ["ledger", "groups"], SHIPMENT_DELIVERED: ["ledger", "groups", "shipments"]
    };
    for (const [name, sources] of Object.entries(DATA_EVENTS)) {
      events.addEventListener(name, () => {
        window.dispatchEvent(new CustomEvent("ws:data-changed", { detail: { sources } }));
        if (name.startsWith("CLAIM_")) window.dispatchEvent(new Event("ws:claims-changed"));
      });
    }
    events.addEventListener("SCHEDULE_CHANGED", (message) => {
      let actor = "";
      try {
        const data = JSON.parse((message as MessageEvent<string>).data) as { change?: { actor?: string }; payload?: { change?: { actor?: string } } };
        actor = data.payload?.change?.actor ?? data.change?.actor ?? "";
      } catch {
        actor = "";
      }
      window.dispatchEvent(new CustomEvent("ws:schedule-changed", { detail: { actor } }));
      window.dispatchEvent(new CustomEvent("ws:data-changed", { detail: { sources: ["shipments"] } }));
    });
    events.onmessage = applyUiAction;

    return () => {
      window.removeEventListener("hashchange", handleHash);
      events.close();
    };
  }, [activeView, onboardingPrefill, theme]);

  const isOnboarding = !onboardingConfirmed || activeView === "onboarding";

  const renderActiveView = () => {
    if (!onboardingConfirmed && activeView !== "landing") {
      return (
        <OnboardingView
          onComplete={() => {
            setOnboardingConfirmed(true);
            try {
              localStorage.setItem("wholeshare_onboarding_confirmed", "true");
            } catch {}
            handleNavigate("discover");
          }}
          prefill={onboardingPrefill}
        />
      );
    }

    switch (activeView) {
      case "onboarding":
        return (
          <OnboardingView
            onComplete={() => {
              setOnboardingConfirmed(true);
              try {
                localStorage.setItem("wholeshare_onboarding_confirmed", "true");
              } catch {}
              handleNavigate("discover");
            }}
            prefill={onboardingPrefill}
          />
        );
      case "discover":
        return <DiscoverView externalQuery={radarFilter?.query} externalCategory={radarFilter?.category} />;
      case "my-groups":
        return <MyGroupsView externalQuery={ledgerQuery} />;
      case "disputes":
        return <DisputesView />;
      case "paypal":
        return <PayPalHubView />;
      case "group":
        return groupId ? <GroupView clanId={groupId} /> : <DiscoverView />;
      case "insights":
        return <InsightsView key={insightsPage ?? "default"} page={insightsPage ?? undefined} />;
      case "mygroup":
        return myGroupId ? <GroupDashboardView clanId={myGroupId} /> : <MyGroupsView externalQuery={ledgerQuery} />;
      case "agents":
        return <AgentsView />;
      case "settings":
        return <SettingsView />;
      case "mosaic-chat":
        return <MosaicDeepWorkView />;
      default:
        return <DiscoverView />;
    }
  };

  if (agentToken) {
    return (
      <div className="ws-root-viewport" data-theme={theme}>
        <AgentInvitePage token={agentToken} onNavigate={handleNavigate} />
        <PayPalAttribution />
      </div>
    );
  }

  return (
    <div className="ws-root-viewport" data-theme={theme}>
      {activeView === "landing" ? (
        <LandingPage onNavigate={handleNavigate} />
      ) : isOnboarding ? (
        <div className="ws-onboarding-frame" data-ws-view="onboarding-frame">
          <div className="ws-onboarding-bar">
            <button type="button" className="ws-appbar-brand" onClick={() => handleNavigate("landing")} aria-label="WholeShare home">
              <MosaicLogo size={40} textSize={22} />
            </button>
            <button type="button" className="ws-appbar-tab" onClick={() => handleNavigate("landing")}>Exit setup</button>
          </div>
          <div className="ws-onboarding-body">
            <div style={{ width: "100%", maxWidth: 1240 }}>
              <ActionNoticeBanner notice={actionNotice} onClose={() => setActionNotice(null)} />
              {renderActiveView()}
            </div>
          </div>
        </div>
      ) : (
        <WorkspaceShell
          activeView={activeView}
          onNavigate={handleNavigate}
          slideOver={slideOver}
          onCloseSlideOver={() => setSlideOver(null)}
          actionNotice={actionNotice}
          onCloseNotice={() => setActionNotice(null)}
          modelActivity={modelActivity}
        >
          {renderActiveView()}
        </WorkspaceShell>
      )}
      <CanvasDock />
      <MosaicActivityPill />
    </div>
  );
};
