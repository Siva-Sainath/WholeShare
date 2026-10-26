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

// --- Document & Picture Ingestion Trial Workbench Logic ---
let activeUploadFile = null;
let activeUploadPayload = null;

function handleDragOver(e) {
  e.preventDefault();
  const dropZone = document.getElementById("dropZoneArea");
  if (dropZone) dropZone.classList.add("dragover");
}

function handleDragLeave(e) {
  e.preventDefault();
  const dropZone = document.getElementById("dropZoneArea");
  if (dropZone) dropZone.classList.remove("dragover");
}

function handleFileDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById("dropZoneArea");
  if (dropZone) dropZone.classList.remove("dragover");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processUploadedFile(e.dataTransfer.files[0]);
  }
}

function handleFileSelected(e) {
  if (e.target && e.target.files && e.target.files.length > 0) {
    processUploadedFile(e.target.files[0]);
  }
}

function processUploadedFile(file) {
  activeUploadFile = file;
  const previewCard = document.getElementById("previewCard");
  const fileNameLabel = document.getElementById("previewFileName");
  const fileSizeLabel = document.getElementById("previewFileSize");
  const imgContainer = document.getElementById("imagePreviewContainer");
  const imgEl = document.getElementById("previewImageElement");
  const textContainer = document.getElementById("textPreviewContainer");

  if (!previewCard || !fileNameLabel || !fileSizeLabel) return;

  previewCard.style.display = "block";
  fileNameLabel.textContent = file.name;
  fileSizeLabel.textContent = `${Math.round(file.size / 1024)} KB`;

  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
  const isExcel = /\.(xlsx|xls)$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("excel");

  if (isImage) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      if (imgEl) imgEl.src = dataUrl;
      if (imgContainer) imgContainer.style.display = "block";
      if (textContainer) textContainer.style.display = "none";
      activeUploadPayload = {
        fileName: file.name,
        mimeType: file.type || "image/png",
        content: dataUrl,
        buyerId: "sme_artisan_trial"
      };
    };
    reader.readAsDataURL(file);
  } else if (isExcel) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      const commaIdx = dataUrl.indexOf(",");
      const base64Content = dataUrl.slice(commaIdx + 1);
      if (textContainer) {
        textContainer.textContent = `[Excel Spreadsheet Workbook: ${file.name}]\nFormat: Office Open XML (.xlsx)\nSize: ${file.size} bytes\nReady for multi-sheet dynamic table extraction.`;
        textContainer.style.display = "block";
      }
      if (imgContainer) imgContainer.style.display = "none";
      activeUploadPayload = {
        fileName: file.name,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64Content,
        buyerId: "sme_artisan_trial"
      };
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      if (textContainer) {
        textContainer.textContent = text.slice(0, 1500);
        textContainer.style.display = "block";
      }
      if (imgContainer) imgContainer.style.display = "none";
      activeUploadPayload = {
        fileName: file.name,
        mimeType: file.name.endsWith(".csv") ? "text/csv" : "application/json",
        content: text,
        buyerId: "sme_artisan_trial"
      };
    };
    reader.readAsText(file);
  }
}

async function loadSampleDocument(type) {
  const previewCard = document.getElementById("previewCard");
  const fileNameLabel = document.getElementById("previewFileName");
  const fileSizeLabel = document.getElementById("previewFileSize");
  const imgContainer = document.getElementById("imagePreviewContainer");
  const imgEl = document.getElementById("previewImageElement");
  const textContainer = document.getElementById("textPreviewContainer");

  if (type === "realistic-image") {
    try {
      const res = await fetch("/realistic_sysco_commercial_invoice.png");
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target.result;
        if (fileNameLabel) fileNameLabel.textContent = "realistic_sysco_commercial_invoice.png";
        if (fileSizeLabel) fileSizeLabel.textContent = `${Math.round(blob.size / 1024)} KB`;
        if (imgEl) imgEl.src = dataUrl;
        if (imgContainer) imgContainer.style.display = "block";
        if (textContainer) textContainer.style.display = "none";
        if (previewCard) previewCard.style.display = "block";

        activeUploadPayload = {
          fileName: "realistic_sysco_commercial_invoice.png",
          mimeType: "image/png",
          content: dataUrl,
          buyerId: "sme_artisan_trial"
        };
        await submitActiveIngestion();
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      alert("Failed to load sample image: " + err.message);
    }
  } else if (type === "xlsx") {
    try {
      const res = await fetch("/sysco_distributor_order.xlsx");
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target.result;
        const commaIdx = dataUrl.indexOf(",");
        const base64Content = dataUrl.slice(commaIdx + 1);
        if (fileNameLabel) fileNameLabel.textContent = "sysco_distributor_order.xlsx";
        if (fileSizeLabel) fileSizeLabel.textContent = `${Math.round(blob.size / 1024)} KB`;
        if (textContainer) {
          textContainer.textContent = `[Excel Workbook: sysco_distributor_order.xlsx]\nSheets: 'Invoice & PO', 'Quality Specs'\nStatus: Multi-column tabular manifest loaded with quantities and prices.`;
          textContainer.style.display = "block";
        }
        if (imgContainer) imgContainer.style.display = "none";
        if (previewCard) previewCard.style.display = "block";

        activeUploadPayload = {
          fileName: "sysco_distributor_order.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64Content,
          buyerId: "sme_artisan_trial"
        };
        await submitActiveIngestion();
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      alert("Failed to load sample XLSX: " + err.message);
    }
  } else if (type === "csv") {
    try {
      const res = await fetch("/b2b_procurement_order.csv");
      const text = await res.text();
      if (fileNameLabel) fileNameLabel.textContent = "b2b_procurement_order.csv";
      if (fileSizeLabel) fileSizeLabel.textContent = `${(text.length / 1024).toFixed(1)} KB`;
      if (textContainer) {
        textContainer.textContent = text;
        textContainer.style.display = "block";
      }
      if (imgContainer) imgContainer.style.display = "none";
      if (previewCard) previewCard.style.display = "block";

      activeUploadPayload = {
        fileName: "b2b_procurement_order.csv",
        mimeType: "text/csv",
        content: text,
        buyerId: "sme_artisan_trial"
      };
      await submitActiveIngestion();
    } catch (err) {
      alert("Failed to load sample CSV: " + err.message);
    }
  } else if (type === "json") {
    const sample = {
      vendorName: "Sysco Food Services",
      invoiceNumber: `INV_SYS_${Date.now()}`,
      invoiceDate: new Date().toISOString().slice(0, 10),
      paymentTerms: "NET_30",
      lineItems: [
        {
          description: "Organic Artisan Bread Flour 50lb Bag",
          quantity: 200,
          unitPriceCents: 2850,
          proteinPct: 12.7,
          organic: true
        },
        {
          description: "Stone Ground Whole Wheat Flour 50lb",
          quantity: 100,
          unitPriceCents: 2600,
          proteinPct: 13.0,
          organic: true
        }
      ]
    };
    const content = JSON.stringify(sample, null, 2);
    if (fileNameLabel) fileNameLabel.textContent = "sample_sysco_invoice.json";
    if (fileSizeLabel) fileSizeLabel.textContent = "1.2 KB";
    if (textContainer) {
      textContainer.textContent = content;
      textContainer.style.display = "block";
    }
    if (imgContainer) imgContainer.style.display = "none";
    if (previewCard) previewCard.style.display = "block";

    activeUploadPayload = {
      fileName: "sample_sysco_invoice.json",
      mimeType: "application/json",
      content,
      buyerId: "sme_artisan_trial"
    };
    await submitActiveIngestion();
  }
}

async function submitActiveIngestion() {
  if (!activeUploadPayload) {
    alert("Please select or drop a document or picture first.");
    return;
  }

  const btn = document.getElementById("btnProcessIngest");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Extracting & Normalizing...";
  }

  try {
    const res = await fetch("/api/v1/ingest/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activeUploadPayload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Ingestion request failed.");
    }

    renderExtractionResults(data);
    appendTrajectoryStep("INGEST", `Document ${data.fileName} processed via ${data.parsed.extractionMethod}. Total: $${(data.parsed.totalAmountCents / 100).toFixed(2)}. Instinct Memory baseline updated.`);
  } catch (err) {
    alert(`Ingestion error: ${err.message}`);
    appendTrajectoryStep("ERROR", `Ingestion failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Process Document & Sync to Instinct Memory";
    }
  }
}

function renderExtractionResults(record) {
  const emptyState = document.getElementById("extractionEmptyState");
  const dataContainer = document.getElementById("extractionDataContainer");
  const badge = document.getElementById("extractionMethodBadge");
  const vendor = document.getElementById("resVendor");
  const invoiceNum = document.getElementById("resInvoiceNum");
  const terms = document.getElementById("resTerms");
  const total = document.getElementById("resTotal");
  const itemsBody = document.getElementById("resLineItemsBody");
  const memoryId = document.getElementById("resMemoryEntityId");
  const rawOcrBlock = document.getElementById("rawOcrBlock");
  const rawOcrContent = document.getElementById("rawOcrContent");

  if (emptyState) emptyState.style.display = "none";
  if (dataContainer) dataContainer.style.display = "block";

  if (badge) {
    badge.textContent = record.parsed.extractionMethod;
    badge.style.display = "inline-block";
  }

  if (vendor) vendor.textContent = record.parsed.vendorName;
  if (invoiceNum) invoiceNum.textContent = record.parsed.invoiceNumber;
  if (terms) terms.textContent = record.parsed.paymentTerms;
  if (total) total.textContent = `$${(record.parsed.totalAmountCents / 100).toFixed(2)} (${record.parsed.totalAmountCents}¢)`;

  if (itemsBody) {
    itemsBody.innerHTML = "";
    for (const item of record.parsed.lineItems) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.rawDescription}</td>
        <td><code style="color: var(--accent-cyan);">${item.canonicalSku}</code></td>
        <td>${item.quantity}</td>
        <td>$${(item.unitPriceCents / 100).toFixed(2)}</td>
        <td style="font-weight: 700; color: #34d399;">$${(item.totalCents / 100).toFixed(2)}</td>
      `;
      itemsBody.appendChild(tr);
    }
  }

  if (memoryId && record.memorySync) {
    memoryId.textContent = `${record.memorySync.entityId} (Updated ${new Date().toLocaleTimeString()})`;
  }

  if (record.parsed.rawOcrText) {
    if (rawOcrBlock) rawOcrBlock.style.display = "block";
    if (rawOcrContent) rawOcrContent.textContent = record.parsed.rawOcrText;
  } else {
    if (rawOcrBlock) rawOcrBlock.style.display = "none";
  }
}

async function inspectBaselineMemory() {
  try {
    const res = await fetch("/api/v1/ingest/documents?buyerId=sme_artisan_trial");
    const data = await res.json();
    if (data.baseline) {
      alert(`Instinct Memory Baseline for ${data.baseline.buyerId}:\n\nPrimary SKU: ${data.baseline.sku}\nHistorical Unit Price: $${(data.baseline.baselineUnitPriceCents / 100).toFixed(2)}\nMonthly Pledged Units: ${data.baseline.monthlyPledgedUnits}\nVendor: ${data.baseline.vendorName || "N/A"}\nFacts Count: ${data.baseline.facts.length}\n\nFacts:\n${data.baseline.facts.join("\n")}`);
    } else {
      alert("No baseline data found in Instinct Memory for this buyer yet.");
    }
  } catch (err) {
    alert("Failed to query baseline: " + err.message);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initSse();
  fetchLedger();
});
