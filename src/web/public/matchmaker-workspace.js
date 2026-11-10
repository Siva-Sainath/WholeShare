let activeMatchData = null;
let activeClan = null;
let activeMatchVector = null;

const SAMPLE_PROMPTS = [
  {
    label: "Milan Gelato (Pistachio Paste)",
    query: "Artisan Gelato Shop in Milan needing 500kg Sicilian Pistachio Paste"
  },
  {
    label: "Osaka Specialty Coffee",
    query: "Specialty coffee roaster in Osaka needing 300kg Ethiopian green beans"
  },
  {
    label: "Bengaluru Aerospace (Titanium Bolts)",
    query: "Aerospace contractor in Bengaluru needing 2000 precision titanium bolts"
  },
  {
    label: "Austin Artisan Bakery",
    query: "Artisan bakery in Austin needing 4000lb organic bread flour"
  }
];

function initMatchmakerWorkspace() {
  const container = document.getElementById("wholeshareMatchmakerWorkspace");
  if (!container) return;

  renderWorkspaceStructure(container);
}

function renderWorkspaceStructure(container) {
  container.innerHTML = `
    <div class="ws-matchmaker-container">
      <div class="ws-step-header">
        <div class="ws-step-badge">THREE-STEP WORKSPACE</div>
        <h2 class="ws-step-title">Autonomous B2B Syndicate Matchmaking &amp; Escrow</h2>
        <p class="ws-step-desc">Tuned Qwen extracts procurement intent into an 8-field MatchVector. Our ML algorithm scores coalition utility in sub-20ms.</p>
      </div>

      <!-- Step 1: Input -->
      <div class="ws-workspace-card" id="step1Card">
        <div class="ws-card-step-num">STEP 1</div>
        <div class="ws-card-step-title">Procurement Intent &amp; Multi-City Geo Discovery</div>
        <p class="ws-card-step-sub">Enter your business demand in any global city or upload an invoice.</p>

        <div class="ws-prompt-suggestions">
          ${SAMPLE_PROMPTS.map((p, idx) => `
            <button class="ws-sample-chip" onclick="selectSamplePrompt(${idx})">${p.label}</button>
          `).join("")}
        </div>

        <div class="ws-input-action-row">
          <div class="ws-search-wrapper">
            <input type="text" id="wsMatchmakerQueryInput" class="ws-main-input"
              placeholder="e.g. Artisan Gelato Shop in Milan needing 500kg Sicilian Pistachio Paste"
              onkeydown="if(event.key === 'Enter') executeMatchmaking();" />
          </div>
          <button class="ws-primary-action-btn" id="btnRunMatchmaker" onclick="executeMatchmaking()">
            Compress with Qwen &amp; Find ML Match
          </button>
        </div>

        <div class="ws-file-drop-strip" id="wsInvoiceDropZone" onclick="triggerSimulatedInvoice()">
          <span class="ws-drop-hint">Drop B2B Invoice PDF, Photo, or CSV order here for automated document OCR extraction</span>
        </div>
      </div>

      <!-- Step 2: Qwen Compression & ML Match Result -->
      <div class="ws-workspace-card" id="step2Card" style="display: none;">
        <div class="ws-card-step-num">STEP 2</div>
        <div class="ws-card-step-title">Qwen Extracted Intent &amp; Top ML Coalition Utility</div>

        <!-- Compact Qwen Intent Pill Strip -->
        <div class="ws-intent-strip" id="wsIntentPillStrip"></div>

        <!-- Top ML Matched Clan Card -->
        <div class="ws-clan-match-card" id="wsTopClanCard"></div>

        <!-- Alternative Matches Tabs -->
        <div class="ws-alt-matches-row" id="wsAltMatchesRow"></div>
      </div>

      <!-- Step 3: Escrow & Settlement Hand-Off -->
      <div class="ws-workspace-card" id="step3Card" style="display: none;">
        <div class="ws-card-step-num">STEP 3</div>
        <div class="ws-card-step-title">Deterministic PayPal Escrow Hand-Off</div>
        <p class="ws-card-step-sub">Execute soft holds with zero upfront capital lock, or test 48-hour damage inspection recovery.</p>

        <div class="ws-escrow-actions-grid">
          <div class="ws-action-box">
            <div class="ws-action-box-title">PayPal Orders v2 Escrow Authorization</div>
            <p class="ws-action-box-desc">Execute an atomic soft authorization hold. Funds remain in your PayPal account until carrier delivery is verified.</p>
            <button class="ws-btn-authorize" id="btnAuthorizeEscrow" onclick="handleAuthorizeEscrow()">
              1-Click Authorize Share via PayPal Escrow
            </button>
          </div>

          <div class="ws-action-box">
            <div class="ws-action-box-title">48-Hour Inspection &amp; Auto-Dispute Resolution</div>
            <p class="ws-action-box-desc">Simulate transit damage report during the inspection clock. Automatically mediates pro-rata APIMatic refund.</p>
            <button class="ws-btn-dispute" id="btnSimulateDispute" onclick="handleSimulateDispute()">
              1-Click Simulate Damaged Delivery and Auto-Settle Dispute
            </button>
          </div>
        </div>

        <div class="ws-escrow-status-banner" id="wsEscrowStatusBanner" style="display: none;"></div>
      </div>
    </div>
  `;
}

function selectSamplePrompt(index) {
  const item = SAMPLE_PROMPTS[index];
  if (!item) return;
  const input = document.getElementById("wsMatchmakerQueryInput");
  if (input) {
    input.value = item.query;
    executeMatchmaking();
  }
}

function triggerSimulatedInvoice() {
  const input = document.getElementById("wsMatchmakerQueryInput");
  if (input) {
    input.value = "Invoice 9024: Bronte Sicilian Pistachio Paste 500kg wholesale order for Milan artisan bakery, standard delivery";
    executeMatchmaking();
  }
}

async function executeMatchmaking() {
  const input = document.getElementById("wsMatchmakerQueryInput");
  const btn = document.getElementById("btnRunMatchmaker");
  const query = input?.value.trim();

  if (!query) {
    alert("Please enter your business procurement demand or city.");
    return;
  }

  btn.disabled = true;
  btn.innerText = "Analyzing Intent with Qwen...";

  try {
    const res = await fetch("/api/v1/matchmaking/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error(`Matchmaker error status ${res.status}`);
    }

    const data = await res.json();
    activeMatchData = data;
    activeMatchVector = data.matchVector;

    renderMatchResult(data);
  } catch (err) {
    console.error("Matchmaking failed:", err);
    alert(`Matchmaking service error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "Compress with Qwen & Find ML Match";
  }
}

function renderMatchResult(data) {
  const step2 = document.getElementById("step2Card");
  const step3 = document.getElementById("step3Card");
  const intentStrip = document.getElementById("wsIntentPillStrip");
  const clanCard = document.getElementById("wsTopClanCard");
  const altRow = document.getElementById("wsAltMatchesRow");

  if (!step2 || !step3) return;

  step2.style.display = "block";
  step3.style.display = "block";

  const mv = data.matchVector;
  intentStrip.innerHTML = `
    <div class="ws-intent-pill">
      <span class="ws-pill-label">LOCATION</span>
      <span class="ws-pill-val">${mv.city}, ${mv.countryCode} (${mv.settlementCurrency})</span>
    </div>
    <div class="ws-intent-pill">
      <span class="ws-pill-label">DEMAND</span>
      <span class="ws-pill-val">${mv.quantityRequested} units of ${mv.canonicalSku}</span>
    </div>
    <div class="ws-intent-pill">
      <span class="ws-pill-label">TARIFF CLASSIFICATION</span>
      <span class="ws-pill-val">HS ${mv.hsCodePrefix}</span>
    </div>
    <div class="ws-intent-pill">
      <span class="ws-pill-label">LEAD TIME</span>
      <span class="ws-pill-val">&le; ${mv.maxDeliveryDays} days</span>
    </div>
    <div class="ws-intent-pill" style="margin-left: auto;">
      <span class="ws-pill-label">INFERENCE TIME</span>
      <span class="ws-pill-val ws-tabular-nums">${data.durationMs}ms</span>
    </div>
  `;

  const topMatch = data.rankedClans[0];
  activeClan = topMatch.clan;

  renderTopClanDetails(topMatch);

  if (data.rankedClans.length > 1) {
    altRow.innerHTML = `
      <div style="font-size: 11.5px; font-weight: 600; color: #94a3b8; margin-bottom: 8px;">ALTERNATIVE COALITION MATCHES</div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${data.rankedClans.slice(1).map((m, idx) => `
          <button class="ws-alt-chip" onclick="selectAlternativeClan(${idx + 1})">
            [${m.recommendationType}] ${m.clan.name.slice(0, 32)}... (${m.matchScore}% Match)
          </button>
        `).join("")}
      </div>
    `;
  } else {
    altRow.innerHTML = "";
  }

  // Smooth scroll into view
  step2.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectAlternativeClan(index) {
  if (!activeMatchData || !activeMatchData.rankedClans[index]) return;
  const match = activeMatchData.rankedClans[index];
  activeClan = match.clan;
  renderTopClanDetails(match);
}

function renderTopClanDetails(match) {
  const clanCard = document.getElementById("wsTopClanCard");
  const clan = match.clan;
  const fb = match.featureBreakdown;

  const baselinePrice = (activeMatchVector?.currentUnitCostBaseline || (clan.baseUnitPriceCents / 100)).toFixed(2);
  const wholesalePrice = (match.effectiveUnitCostCents / 100).toFixed(2);
  const totalSpend = ((match.effectiveUnitCostCents * (activeMatchVector?.quantityRequested || 100)) / 100).toFixed(2);

  clanCard.innerHTML = `
    <div class="ws-match-card-header">
      <div>
        <div class="ws-match-type-tag">${match.recommendationType}</div>
        <div class="ws-match-clan-name">${clan.name}</div>
        <div class="ws-match-clan-meta">${clan.city}, ${clan.countryCode} &bull; ${clan.canonicalSku} &bull; Supplier: ${clan.supplierName}</div>
      </div>
      <div class="ws-match-score-badge">
        <div class="ws-score-number ws-tabular-nums">${match.matchScore}%</div>
        <div class="ws-score-label">ML MATCH</div>
      </div>
    </div>

    <!-- 4-Bar Feature Attribution Breakdown -->
    <div class="ws-features-grid">
      <div class="ws-feature-bar-box" title="Cosine embedding similarity between query and clan canonical SKU">
        <div class="ws-feature-header">
          <span>Wholesale Savings (x2)</span>
          <span class="ws-tabular-nums">+${match.marginalDiscountPercent}%</span>
        </div>
        <div class="ws-bar-track">
          <div class="ws-bar-fill" style="width: ${Math.round(fb.marginalDiscount * 100)}%; background: #10b981;"></div>
        </div>
      </div>

      <div class="ws-feature-bar-box" title="Proximity of total volume to MOQ completion">
        <div class="ws-feature-header">
          <span>MOQ Fill Velocity (x3)</span>
          <span class="ws-tabular-nums">${Math.round(match.moqCompletionRatio * 100)}%</span>
        </div>
        <div class="ws-bar-track">
          <div class="ws-bar-fill" style="width: ${Math.round(fb.moqVelocity * 100)}%; background: #38bdf8;"></div>
        </div>
      </div>

      <div class="ws-feature-bar-box" title="Haversine domestic distance or trade corridor efficiency">
        <div class="ws-feature-header">
          <span>Corridor Efficiency (x4)</span>
          <span class="ws-tabular-nums">${match.isDomestic ? "Domestic Direct" : "Global Port Lane"}</span>
        </div>
        <div class="ws-bar-track">
          <div class="ws-bar-fill" style="width: ${Math.round(fb.corridorEfficiency * 100)}%; background: #a855f7;"></div>
        </div>
      </div>

      <div class="ws-feature-bar-box" title="Supplier historical PayPal dispute rate">
        <div class="ws-feature-header">
          <span>Supplier Trust Score (x6)</span>
          <span class="ws-tabular-nums">${(fb.supplierTrust * 100).toFixed(1)}%</span>
        </div>
        <div class="ws-bar-track">
          <div class="ws-bar-fill" style="width: ${Math.round(fb.supplierTrust * 100)}%; background: #0070ba;"></div>
        </div>
      </div>
    </div>

    <!-- Pricing and Pool Economics Strip -->
    <div class="ws-economics-strip">
      <div class="ws-econ-box">
        <div class="ws-econ-label">RETAIL BASELINE</div>
        <div class="ws-econ-val ws-tabular-nums">$${baselinePrice} / unit</div>
      </div>
      <div class="ws-econ-box">
        <div class="ws-econ-label">CLAN POOL PRICE</div>
        <div class="ws-econ-val ws-tabular-nums" style="color: #10b981;">$${wholesalePrice} / unit</div>
      </div>
      <div class="ws-econ-box">
        <div class="ws-econ-label">TOTAL PLEDGE SPEND</div>
        <div class="ws-econ-val ws-tabular-nums">$${totalSpend} ${clan.settlementCurrency}</div>
      </div>
      <div class="ws-econ-box">
        <div class="ws-econ-label">ESTIMATED TRANSIT</div>
        <div class="ws-econ-val ws-tabular-nums">${clan.estimatedDeliveryDays} days</div>
      </div>
    </div>
  `;
}

async function handleAuthorizeEscrow() {
  if (!activeClan || !activeMatchVector) {
    alert("Please run matchmaking first to select a clan.");
    return;
  }

  const btn = document.getElementById("btnAuthorizeEscrow");
  const banner = document.getElementById("wsEscrowStatusBanner");
  btn.disabled = true;
  btn.innerText = "Locking PayPal Orders v2 Authorization...";

  try {
    const res = await fetch("/api/v1/matchmaking/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clanId: activeClan.id,
        matchVector: activeMatchVector
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Join failed.");

    banner.style.display = "block";
    banner.className = "ws-escrow-status-banner success";
    banner.innerHTML = `
      <div class="ws-banner-title">PayPal Orders v2 Authorization Locked (State: ${data.escrow.state})</div>
      <div class="ws-banner-text">Soft authorization hold established for ${data.escrow.effectiveUnitPriceCents * activeMatchVector.quantityRequested / 100} ${activeClan.settlementCurrency}. Zero upfront capital captured. 48-Hour post-delivery inspection clock is armed.</div>
    `;

    btn.innerText = "Authorized via PayPal Escrow";
  } catch (err) {
    banner.style.display = "block";
    banner.className = "ws-escrow-status-banner error";
    banner.innerHTML = `<div class="ws-banner-title">Authorization Error</div><div class="ws-banner-text">${err.message}</div>`;
    btn.disabled = false;
    btn.innerText = "1-Click Authorize Share via PayPal Escrow";
  }
}

async function handleSimulateDispute() {
  if (!activeClan) {
    alert("Please run matchmaking first to select a clan.");
    return;
  }

  const btn = document.getElementById("btnSimulateDispute");
  const banner = document.getElementById("wsEscrowStatusBanner");
  btn.disabled = true;
  btn.innerText = "Opening APIMatic Customer Dispute...";

  try {
    const res = await fetch("/api/v1/matchmaking/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clanId: activeClan.id,
        reason: "Inspection failure: 15% damaged packaging detected upon arrival."
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Dispute failed.");

    banner.style.display = "block";
    banner.className = "ws-escrow-status-banner info";
    banner.innerHTML = `
      <div class="ws-banner-title">Dispute Mediated &amp; Settled (State: ${data.escrow.state})</div>
      <div class="ws-banner-text">APIMatic customer dispute closed with pro-rata settlement. Carrier insurance credit applied without counterparty default or litigation penalty.</div>
    `;

    btn.innerText = "Dispute Settled Pro-Rata";
  } catch (err) {
    banner.style.display = "block";
    banner.className = "ws-escrow-status-banner error";
    banner.innerHTML = `<div class="ws-banner-title">Dispute Error</div><div class="ws-banner-text">${err.message}</div>`;
    btn.disabled = false;
    btn.innerText = "1-Click Simulate Damaged Delivery and Auto-Settle Dispute";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMatchmakerWorkspace();
});

