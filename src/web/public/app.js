// Wholeshare AI-First Autonomous Wholesale Client
// Real PayPal Sandbox Integration & Qwen 3.5 Copilot

let eventSource = null;
let currentCategoryFilter = "ALL";
let cachedClans = [];

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
    <div class="chat-thought" id="activeAiThought">Connecting to Qwen 3.5 reasoning harness...</div>
    <div id="activeAiContent" style="color: var(--text-secondary); font-style: italic;">Processing request...</div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
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

  if (activeBubble) {
    activeBubble.removeAttribute("id");
  }
  if (thoughtEl) {
    thoughtEl.removeAttribute("id");
  }
  if (contentEl) {
    contentEl.removeAttribute("id");
  }

  const container = document.getElementById("chatHistory");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

async function handleChatSubmit(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  const input = document.getElementById("chatInput");
  const btn = document.getElementById("btnSendChat");
  if (!input) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  input.value = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Analyzing...";
  }

  appendUserMessage(prompt);
  appendAiPlaceholder();

  try {
    const res = await fetch("/api/v1/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Request failed with status " + res.status);
    }

    const reply = data.finalMessage || "Action executed successfully.";
    finalizeAiMessage(reply);
    await refreshClans();
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
  const input = document.getElementById("chatInput");
  if (input) {
    input.value = text;
  }
  handleChatSubmit();
}

function clearChat() {
  const container = document.getElementById("chatHistory");
  if (!container) return;
  container.innerHTML = `
    <div class="chat-bubble ai">
      <strong>Welcome to Wholeshare!</strong> I am your resident procurement copilot powered by Qwen 3.5.
      <br><br>
      I can help you discover wholesale pooling clans across <strong>5 industries</strong> (Bakeries, Coffee Roasters, Tile &amp; Flooring, Packaging, and Hardware), negotiate volume discounts, and lock soft authorization holds in PayPal Sandbox with zero upfront capital deducted.
      <br><br>
      How can I assist your business today?
    </div>
  `;
}

function filterCategory(category, buttonElement) {
  currentCategoryFilter = category;
  const buttons = document.querySelectorAll(".cat-btn");
  buttons.forEach(b => b.classList.remove("active"));
  if (buttonElement) {
    buttonElement.classList.add("active");
  }
  renderClansList();
}

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
  const listContainer = document.getElementById("clansList");
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
    updateTelemetry(detailedClans);
    renderClansList();
  } catch (err) {
    if (listContainer) {
      listContainer.innerHTML = `
        <div style="color: #f87171; font-size: 13px; text-align: center; padding: 30px;">
          Error loading clans: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }
}

function updateTelemetry(clans) {
  const totalClansEl = document.getElementById("totalClansPill");
  const totalEscrowEl = document.getElementById("escrowTotalPill");

  if (totalClansEl) {
    totalClansEl.textContent = `Clans: ${clans.length} Active`;
  }

  let totalCents = 0;
  for (const clan of clans) {
    if (Array.isArray(clan.members)) {
      for (const m of clan.members) {
        totalCents += m.authorizedCents || 0;
      }
    }
  }

  if (totalEscrowEl) {
    totalEscrowEl.textContent = `Locked Escrow: ${formatCurrency(totalCents)}`;
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

    let membersHtml = "";
    if (Array.isArray(clan.members) && clan.members.length > 0) {
      membersHtml = clan.members.map(m => {
        const orderPart = m.paypalOrderId
          ? `<a class="paypal-link" href="https://www.sandbox.paypal.com/activity/payment/${escapeHtml(m.paypalOrderId)}" target="_blank" rel="noopener">PayPal: ${escapeHtml(m.paypalOrderId)}</a>`
          : `<span style="color: var(--text-secondary);">Pending Auth</span>`;
        return `
          <div class="member-line">
            <span><strong>${escapeHtml(m.name)}</strong> (${m.pledgedUnits} units): ${formatCurrency(m.authorizedCents)}</span>
            <span>${orderPart}</span>
          </div>
        `;
      }).join("");
    } else {
      membersHtml = `<div style="color: var(--text-secondary); font-style: italic;">No members joined yet.</div>`;
    }

    html += `
      <div class="clan-card-v2" id="clan_${escapeHtml(clan.id)}">
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
            <span>Current Discount: <strong style="color: #34d399;">${clan.discountTierPct}% OFF</strong></span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>

        <div class="clan-tiers">
          ${tiersHtml}
        </div>

        <div class="members-tray">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">
            Participating SMEs (${clan.members ? clan.members.length : 0})
          </div>
          ${membersHtml}
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn-step" onclick="quickPledgePrompt('${escapeHtml(clan.id)}', '${escapeHtml(clan.sku)}')" style="padding: 6px 14px; font-size: 11.5px;">
            Pledge into Clan via Copilot
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function quickPledgePrompt(clanId, sku) {
  const text = `Join clan ${clanId} for SKU ${sku} with 50 units.`;
  sendPresetMessage(text);
}

function initSse() {
  eventSource = new EventSource("/api/v1/events");

  eventSource.addEventListener("CONNECTED", () => {
    // Live connection established
  });

  eventSource.addEventListener("AGENT_THOUGHT", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.payload && data.payload.thought) {
        updateAiThought(data.payload.thought);
      }
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("AGENT_TOOL_CALL", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.payload) {
        updateAiThought("Invoking tool " + data.payload.toolName + "...");
      }
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("AGENT_TOOL_RESULT", () => {
    refreshClans();
  });

  eventSource.addEventListener("ESCROW_LOCKED", () => {
    refreshClans();
  });

  eventSource.addEventListener("COALITION_MEMBER_JOINED", () => {
    refreshClans();
  });
}

// Backward compatibility helpers
function appendTrajectoryStep(badgeType, text) {
  updateAiThought(`[${badgeType}] ${text}`);
}

function fetchLedger() {
  return refreshClans();
}

window.addEventListener("DOMContentLoaded", () => {
  initSse();
  refreshClans();
});
