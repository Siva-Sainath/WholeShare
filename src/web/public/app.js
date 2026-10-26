// Wholeshare Lightweight One-Shot Test Workbench Client

let eventSource = null;
let currentSessionStartTime = 0;
let timerInterval = null;

function setPresetPrompt(text) {
  const input = document.getElementById("oneShotPromptInput");
  if (input) {
    input.value = text;
  }
}

function appendTrajectoryStep(badgeType, text) {
  const feed = document.getElementById("trajectoryFeed");
  if (!feed) return;

  const div = document.createElement("div");
  div.className = "timeline-step";

  let badgeClass = badgeType;
  if (badgeType === "SUCCESS" || badgeType === "PASSED") badgeClass = "RESULT";
  if (badgeType === "ERROR" || badgeType === "REJECTED") badgeClass = "THOUGHT";

  div.innerHTML = `<span class="timeline-badge ${badgeClass}">${badgeType}</span><span>${text}</span>`;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function updateCoalitionCard(coalition) {
  if (!coalition) return;

  const badge = document.getElementById("cardStatusBadge");
  if (badge) {
    badge.textContent = coalition.status;
    badge.className = `card-status-badge ${coalition.status}`;
  }

  const current = coalition.currentUnits || 0;
  const target = coalition.targetUnits || 500;
  const pct = Math.min(100, Math.round((current / target) * 100));

  const unitsLabel = document.getElementById("unitsPledgedLabel");
  if (unitsLabel) unitsLabel.textContent = `${current} / ${target} units pledged`;

  const pctLabel = document.getElementById("pctPledgedLabel");
  if (pctLabel) pctLabel.textContent = `${pct}%`;

  const barFill = document.getElementById("progressBarFill");
  if (barFill) barFill.style.width = `${pct}%`;

  const t1 = document.getElementById("tier1Pill");
  const t2 = document.getElementById("tier2Pill");
  const t3 = document.getElementById("tier3Pill");
  if (t1) t1.classList.toggle("active", current >= 100 && current < 500);
  if (t2) t2.classList.toggle("active", current >= 500 && current < 1000);
  if (t3) t3.classList.toggle("active", current >= 1000);
}

function renderLedger(data) {
  const tbody = document.getElementById("ledgerTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const row of data) {
    const tr = document.createElement("tr");
    tr.id = `row_${row.coalitionId}`;

    const memberDetails = row.members.map(m => {
      let badge = `<span class="badge-auth">${m.status}</span>`;
      if (m.stepUpRequired && m.invoiceQrUrl) {
        badge += ` <span class="badge-qr" onclick="openStepUpModal('${m.invoiceQrUrl}', '${m.authorizedUsd}')">QR Step-Up</span>`;
      }
      const orderRef = m.paypalOrderId ? ` (Order: ${m.paypalOrderId})` : "";
      return `${m.name} (${m.pledgedUnits} units): $${m.authorizedUsd}${orderRef} ${badge}`;
    }).join("<br>");

    tr.innerHTML = `
      <td style="font-family: monospace; font-weight: bold; color: var(--accent-cyan);">${row.coalitionId}</td>
      <td>${row.skuName}</td>
      <td><strong>${row.currentUnits}</strong> / ${row.targetUnits}</td>
      <td>$${row.unitPriceUsd}</td>
      <td style="font-weight: bold; color: #34d399;">$${row.totalEscrowUsd}</td>
      <td>${row.discountTierPct}%</td>
      <td><span class="card-status-badge ${row.status}">${row.status}</span></td>
      <td style="font-size: 11px; line-height: 1.6;">${memberDetails}</td>
    `;
    tbody.appendChild(tr);

    updateCoalitionCard(row);
  }
}

async function fetchLedger() {
  try {
    const res = await fetch("/api/v1/ledger");
    const data = await res.json();
    renderLedger(data);
  } catch (err) {
    console.error("Failed to fetch ledger:", err);
  }
}

function initSse() {
  eventSource = new EventSource("/api/v1/events");

  eventSource.addEventListener("CONNECTED", () => {
    appendTrajectoryStep("SSE", "Connected to live event stream.");
  });

  eventSource.addEventListener("AGENT_SESSION_STARTED", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("SESSION", `Session ${data.payload.sessionId.substring(0, 16)} started.`);
    const statusPill = document.getElementById("copilotStatusPill");
    if (statusPill) statusPill.textContent = "Agent Working...";
  });

  eventSource.addEventListener("AGENT_THOUGHT", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("THOUGHT", data.payload.thought);
  });

  eventSource.addEventListener("AGENT_TOOL_CALL", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("TOOL", `Invoking ${data.payload.toolName}(${JSON.stringify(data.payload.args)})`);
  });

  eventSource.addEventListener("AGENT_TOOL_RESULT", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("RESULT", `${data.payload.toolName} output: ${JSON.stringify(data.payload.result)}`);
    fetchLedger();
  });

  eventSource.addEventListener("AGENT_REFLEXIVE_RETRY", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("RETRY", `Interceptor violation: ${JSON.stringify(data.payload.violations)}. Adjusting...`);
  });

  eventSource.addEventListener("AGENT_FALLBACK", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("FALLBACK", `Model fallback: ${data.payload.reason}`);
  });

  eventSource.addEventListener("AGENT_SESSION_COMPLETED", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("SUCCESS", `Session done in ${data.payload.totalDurationMs}ms: ${data.payload.finalMessage}`);
    const statusPill = document.getElementById("copilotStatusPill");
    if (statusPill) statusPill.textContent = "Harness Ready";
    fetchLedger();
  });

  eventSource.addEventListener("ESCROW_LOCKED", (e) => {
    const data = JSON.parse(e.data);
    appendTrajectoryStep("PAYPAL", `Escrow locked! $${(data.payload.totalEscrowCents / 100).toFixed(2)} placed in PayPal Orders v2 soft holds.`);
    fetchLedger();
  });
}

function handleOneShotSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const input = document.getElementById("oneShotPromptInput");
  const prompt = input ? input.value.trim() : "";
  if (!prompt) return;

  const btn = document.getElementById("btnRunOneShot");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Executing with Qwen 3.5 9B...";
    btn.style.opacity = "0.7";
  }

  currentSessionStartTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsedSec = ((Date.now() - currentSessionStartTime) / 1000).toFixed(1);
    const label = document.getElementById("executionTimerLabel");
    if (label) label.textContent = `Running: ${elapsedSec}s`;
  }, 200);

  appendTrajectoryStep("INPUT", prompt);

  fetch("/api/v1/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  })
    .then(res => res.json())
    .then(result => {
      appendTrajectoryStep("DONE", result.finalMessage || "Deal cycle executed successfully.");
      fetchLedger();
    })
    .catch(err => {
      appendTrajectoryStep("ERROR", `Execution failed: ${err.message}`);
    })
    .finally(() => {
      if (timerInterval) clearInterval(timerInterval);
      const totalSec = ((Date.now() - currentSessionStartTime) / 1000).toFixed(1);
      const label = document.getElementById("executionTimerLabel");
      if (label) label.textContent = `Completed in ${totalSec}s`;

      if (btn) {
        btn.disabled = false;
        btn.textContent = "Execute One-Shot Test";
        btn.style.opacity = "1";
      }
    });
}

async function resetPlatformState() {
  appendTrajectoryStep("SYSTEM", "Resetting platform state to base demonstration values...");
  try {
    await fetch("/api/v1/sme/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sme_austin_01",
        name: "Austin Artisan Bakery",
        sku: "organic-flour-50lb",
        pledgedUnits: 150,
        maxAutoAuthorizeUsd: 1500,
        stepUpThresholdUsd: 1000
      })
    });
    await fetchLedger();
    appendTrajectoryStep("SYSTEM", "Platform state reset successfully.");
  } catch (err) {
    appendTrajectoryStep("ERROR", `Reset failed: ${err.message}`);
  }
}

function openStepUpModal(qrUrl, amountUsd) {
  const modal = document.getElementById("stepUpModal");
  const img = document.getElementById("modalQrImage");
  const details = document.getElementById("modalInvoiceDetails");

  if (img) img.src = qrUrl;
  if (details) details.textContent = `$${amountUsd} USD Authorized`;
  if (modal) modal.style.display = "flex";
}

function closeStepUpModal() {
  const modal = document.getElementById("stepUpModal");
  if (modal) modal.style.display = "none";
}

function approveSandboxStepUp() {
  appendTrajectoryStep("KYC", "PayPal sandbox QR step-up invoice verified. Buyer mandate threshold confirmed.");
  closeStepUpModal();
  fetchLedger();
}

window.addEventListener("DOMContentLoaded", () => {
  initSse();
  fetchLedger();
});
