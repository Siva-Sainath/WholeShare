import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = resolve('/Users/siva/.gemini/antigravity-ide/scratch/wholeshare');
const diagramsDir = resolve(projectRoot, 'diagrams');
const docsDiagramsDir = resolve(projectRoot, 'docs/diagrams');

mkdirSync(diagramsDir, { recursive: true });
mkdirSync(docsDiagramsDir, { recursive: true });

console.log('Rendering High-Definition Architecture Diagrams & tldraw Bundles...');

// 1. High-Definition Master Architecture Diagram (HTML + CSS Cards for 100% Crisp Legibility)
const masterArchHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    background: #0b0f19;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    color: #f8fafc;
    width: 1650px;
  }
  .header {
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 16px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  h1 { margin: 0; font-size: 24pt; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
  .subtitle { font-size: 11pt; color: #94a3b8; margin-top: 4px; }
  .badge-tag { background: #1e3a8a; color: #93c5fd; padding: 4px 10px; border-radius: 4px; font-size: 9pt; font-weight: 700; border: 1px solid #3b82f6; }

  /* 4 Stage Grid */
  .stages-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
  .stage-card {
    background: #111827;
    border: 1.5px solid #1f2937;
    border-radius: 10px;
    padding: 20px;
    position: relative;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
  }
  .stage-1 { border-top: 4px solid #3b82f6; }
  .stage-2 { border-top: 4px solid #10b981; }
  .stage-3 { border-top: 4px solid #f59e0b; }
  .stage-4 { border-top: 4px solid #ec4899; }

  .stage-title {
    font-size: 13pt;
    font-weight: 800;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .dev-pill { font-size: 8pt; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 700; }
  .dev-1 { background: #1e3a8a; color: #60a5fa; }
  .dev-2 { background: #78350f; color: #fcd34d; }

  .block-list { display: flex; flex-direction: column; gap: 10px; }
  .node-box {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 10px 14px;
  }
  .node-header {
    font-weight: 700;
    font-size: 10pt;
    color: #e2e8f0;
    display: flex;
    justify-content: space-between;
  }
  .node-desc { font-size: 8.5pt; color: #94a3b8; margin-top: 4px; line-height: 1.4; }
  .code-inline {
    background: #0f172a;
    color: #38bdf8;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 8pt;
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid #1e293b;
  }

  .connector-arrow {
    text-align: center;
    color: #64748b;
    font-size: 12pt;
    margin: 4px 0;
  }
  .callout-endpoint {
    background: #022c22;
    border-left: 3px solid #10b981;
    padding: 6px 10px;
    font-size: 8pt;
    color: #6ee7b7;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    margin-top: 4px;
    border-radius: 0 4px 4px 0;
  }
  .callout-paypal {
    background: #172554;
    border-left: 3px solid #3b82f6;
    padding: 6px 10px;
    font-size: 8pt;
    color: #93c5fd;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    margin-top: 4px;
    border-radius: 0 4px 4px 0;
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>WHOLESHARE: End-to-End System Architecture</h1>
    <div class="subtitle">Autonomous B2B Group Purchasing & Multiparty Escrow Platform on PayPal for Business</div>
  </div>
  <div class="badge-tag">PayPal AI Hackathon 2026 | Production Blueprint</div>
</div>

<div class="stages-grid">
  <!-- STAGE 1 -->
  <div class="stage-card stage-1">
    <div class="stage-title">
      <span style="color:#60a5fa;">STAGE 1: Dual-Mode Ingress & Bounded Personal Agent</span>
      <span class="dev-pill dev-1">Developer 1</span>
    </div>
    <div class="block-list">
      <div class="node-box">
        <div class="node-header">
          <span>1. Ingress Gateways (Web & Bot Webhooks)</span>
          <span class="code-inline">POST /api/sme/spawn</span>
        </div>
        <div class="node-desc">Accepts Natural Language prompt from Web UI or signed Telegram/Grok webhook events. Requires <span class="code-inline">X-Syndicate-HMAC-SHA256</span> with 300s replay window.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>2. Deterministic Policy Sandwich</span>
          <span class="code-inline">validateFinancialIntent()</span>
        </div>
        <div class="node-desc">Zero-trust firewall enforcing PostgreSQL bounds: <span class="code-inline">orderAmount &le; max_auto_authorize_usd</span> and <span class="code-inline">unitPrice &le; initialPrice</span>. Halts execution if violated.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>3. PayPal Cash-Flow Pre-Flight Check</span>
          <span class="code-inline">@paypal/agent-toolkit</span>
        </div>
        <div class="callout-paypal">POST /v2/invoicing/invoices + send_invoice_reminder</div>
        <div class="node-desc">Queries unpaid customer receivables via <span class="code-inline">list_invoices</span> and fires reminders to unlock working capital before committing to Clan.</div>
      </div>
    </div>
  </div>

  <!-- STAGE 2 -->
  <div class="stage-card stage-2">
    <div class="stage-title">
      <span style="color:#34d399;">STAGE 2: Kernel Wholesale Sourcing & Clan Matchmaking</span>
      <span class="dev-pill dev-1">Developer 1</span>
    </div>
    <div class="block-list">
      <div class="node-box">
        <div class="node-header">
          <span>1. Kernel Cloud Browser Sourcing Worker</span>
          <span class="code-inline">onkernel.com</span>
        </div>
        <div class="callout-endpoint">Scrapes Live B2B Tier Tables &rarr; Tier 1 ($10) / Tier 2 ($7.20) / Tier 3 ($5.80)</div>
        <div class="node-desc">Launches headless cloud browser, captures pricing table, and stores cryptographic screenshot hash proof in PostgreSQL.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>2. Clan Matchmaking Engine</span>
          <span class="code-inline">PostgreSQL State Machine</span>
        </div>
        <div class="node-desc">Aggregates member units: <span class="code-inline">FORMING</span> (0-99%) &rarr; <span class="code-inline">THRESHOLD_MET</span> (100% MOQ reached). Emits Server-Sent Events (SSE).</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>3. Visual Telemetry (A2A Arena & AG Grid)</span>
          <span class="code-inline">enableCellChangeFlash</span>
        </div>
        <div class="node-desc">Streams negotiation particles on radial graph canvas and updates AG Grid Master-Detail rows with instant savings badge (28% off).</div>
      </div>
    </div>
  </div>

  <!-- STAGE 3 -->
  <div class="stage-card stage-3">
    <div class="stage-title">
      <span style="color:#fbbf24;">STAGE 3: PayPal Multiparty Escrow & Batch Capture</span>
      <span class="dev-pill dev-2">Developer 2</span>
    </div>
    <div class="block-list">
      <div class="node-box">
        <div class="node-header">
          <span>1. PayPal Orders v2 Multiparty Authorization</span>
          <span class="code-inline">intent: "AUTHORIZE"</span>
        </div>
        <div class="callout-paypal">POST /v2/checkout/orders (Header: PayPal-Request-Id: hash)</div>
        <div class="node-desc">Places soft authorization hold per SME ($1,440 / $1,080 / $1,080). Zero upfront cash deduction until entire Clan unlocks.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>2. PayPal Invoicing v2 & QR Step-Up</span>
          <span class="code-inline">generate_invoice_qr_code</span>
        </div>
        <div class="callout-paypal">POST /v2/invoicing/invoices/{id}/generate-qr-code</div>
        <div class="node-desc">Generates human-in-the-loop auditable invoice and scannable QR code if order exceeds SME auto-spend policy threshold.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>3. Atomic Batch Capture & Tier-Drop Rebates</span>
          <span class="code-inline">POST /v2/payments/authorizations/{id}/capture</span>
        </div>
        <div class="node-desc">Simultaneous capture when 100% SMEs authorized. If 4th SME joins dropping unit price to $5.80, fires instant <span class="code-inline">create_refund</span> rebate.</div>
      </div>
    </div>
  </div>

  <!-- STAGE 4 -->
  <div class="stage-card stage-4">
    <div class="stage-title">
      <span style="color:#f472b6;">STAGE 4: Fulfillment Sync, APIMatic Disputes & Settlement</span>
      <span class="dev-pill dev-2">Developer 2</span>
    </div>
    <div class="block-list">
      <div class="node-box">
        <div class="node-header">
          <span>1. PayPal Shipment Tracking Sync</span>
          <span class="code-inline">POST /v1/shipping/trackers-batch</span>
        </div>
        <div class="callout-paypal">carrier: "UPS", tracking_number: "1Z9999999999999999"</div>
        <div class="node-desc">Registers carrier tracking. Polls delivery timestamp to strictly enforce 48-hour inspection window for disputes.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>2. APIMatic-Typed Customer Disputes v1</span>
          <span class="code-inline">/v1/customer/disputes</span>
        </div>
        <div class="callout-endpoint">provide_evidence(photoHash) &rarr; make_offer(PARTIAL_REFUND)</div>
        <div class="node-desc">SME files claim with photo SHA256 perceptual hash. A2A negotiation settles pro-rata $300 refund for SME #3, releasing $3,300 to supplier.</div>
      </div>
      <div class="connector-arrow">&darr;</div>
      <div class="node-box">
        <div class="node-header">
          <span>3. Settlement & Zapier ERP Webhook</span>
          <span class="code-inline">POST /v2/payments/captures/{id}/refund</span>
        </div>
        <div class="node-desc">Updates AG Grid row to <span class="code-inline">PARTIAL_REFUND_SETTLED (-$300)</span>, dispatches Zapier webhook to QuickBooks/Xero, and updates strategy memory.</div>
      </div>
    </div>
  </div>
</div>

</body>
</html>`;

const archFileHtml = resolve(diagramsDir, '01_master_architecture_diagram.html');
const archFilePng = resolve(diagramsDir, '01_master_architecture_diagram.png');
const archDocsPng = resolve(docsDiagramsDir, '01_master_architecture_diagram.png');

writeFileSync(archFileHtml, masterArchHtml, 'utf-8');
console.log('Rendering 01_master_architecture_diagram.png (High-Def)...');
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1650,1150 --screenshot="${archFilePng}" "${archFileHtml}"`, { stdio: 'inherit' });
copyFileSync(archFilePng, archDocsPng);

// 2. High-Definition pstack Autonomous Engineering Flywheel
const pstackHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; width: 1600px;
  }
  h2 { margin: 0 0 16px 0; font-size: 18pt; color: #38bdf8; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
  .step-box { background: #1e293b; border: 1.5px solid #334155; border-radius: 8px; padding: 16px; position: relative; }
  .step-num { font-size: 20pt; font-weight: 800; color: #38bdf8; opacity: 0.8; }
  .step-title { font-size: 11pt; font-weight: 700; color: #ffffff; margin: 6px 0; }
  .step-desc { font-size: 8.5pt; color: #94a3b8; line-height: 1.4; }
  .code { background: #0f172a; color: #7dd3fc; font-family: monospace; font-size: 7.5pt; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h2>The pstack Autonomous Agentic Engineering & Verification Flywheel</h2>
<div class="grid">
  <div class="step-box">
    <div class="step-num">01</div>
    <div class="step-title">Ground Context</div>
    <div class="step-desc">Run <span class="code">/how</span> (runtime paths in parallel), <span class="code">/why</span> (historical commits, Slack, PRs), <span class="code">/recall</span> (mine chat history), and <span class="code">/in-your-own-words</span> before writing any code.</div>
  </div>
  <div class="step-box">
    <div class="step-num">02</div>
    <div class="step-title">Architect Arena</div>
    <div class="step-desc">Run <span class="code">/architect</span>: spawn independent candidate runners across model families. Sketch caller usage, core types, and public signatures first. Cross-judge against interface depth.</div>
  </div>
  <div class="step-box">
    <div class="step-num">03</div>
    <div class="step-title">Build the Lever</div>
    <div class="step-desc">Create <span class="code">control-syndicate.mjs</span>: John Ousterhout's deep modules philosophy, subcommands for progressive disclosure, mandatory <span class="code">--dry-run</span>, and machine-readable JSON outputs.</div>
  </div>
  <div class="step-box">
    <div class="step-num">04</div>
    <div class="step-title">Prototype with Code</div>
    <div class="step-desc">"Measure a hundred times, cut once". Test 2-3 visual/functional variants behind a switcher. Measure empirical layout and execution timings before committing.</div>
  </div>
  <div class="step-box">
    <div class="step-num">05</div>
    <div class="step-title">Materialize Memory</div>
    <div class="step-desc">Maintain Feature Maps in <span class="code">references/features/README.md</span>. Save context tokens: catalog each user journey with controls, driving commands, and gotchas.</div>
  </div>
  <div class="step-box">
    <div class="step-num">06</div>
    <div class="step-title">Swarm & Maintain</div>
    <div class="step-desc">Use <span class="code">/swarm</span> to fan out cloud agents to fuzz UI state machines. Run <span class="code">/maintain-verification-skill</span> daily to keep the CLI and Feature Maps 100% honest.</div>
  </div>
</div>
</body>
</html>`;

const pstackHtmlFile = resolve(diagramsDir, '02_pstack_engineering_flywheel.html');
const pstackPngFile = resolve(diagramsDir, '02_pstack_engineering_flywheel.png');
const pstackDocsPng = resolve(docsDiagramsDir, '02_pstack_engineering_flywheel.png');

writeFileSync(pstackHtmlFile, pstackHtml, 'utf-8');
console.log('Rendering 02_pstack_engineering_flywheel.png...');
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1600,480 --screenshot="${pstackPngFile}" "${pstackHtmlFile}"`, { stdio: 'inherit' });
copyFileSync(pstackPngFile, pstackDocsPng);

// 3. High-Definition FinTech Security Pipeline
const secHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; width: 1600px;
  }
  h2 { margin: 0 0 16px 0; font-size: 18pt; color: #ef4444; border-bottom: 2px solid #b91c1c; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
  .sec-box { background: #1c1917; border: 1.5px solid #44403c; border-radius: 8px; padding: 16px; border-top: 3px solid #ef4444; }
  .layer-tag { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: #f87171; }
  .sec-title { font-size: 10.5pt; font-weight: 700; color: #ffffff; margin: 6px 0; }
  .sec-desc { font-size: 8.5pt; color: #a8a29e; line-height: 1.4; }
  .code { background: #292524; color: #fca5a5; font-family: monospace; font-size: 7.5pt; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h2>Wholeshare: 6-Layer FinTech Security & Anti-Fraud Defense Pipeline</h2>
<div class="grid">
  <div class="sec-box">
    <div class="layer-tag">Layer 1: Ingress Guard</div>
    <div class="sec-title">Cryptographic HMAC</div>
    <div class="sec-desc">Telegram and Grok Bot webhooks require <span class="code">X-Syndicate-HMAC-SHA256</span> signatures. Verified against pre-shared secret with 300-second replay window.</div>
  </div>
  <div class="sec-box">
    <div class="layer-tag">Layer 2: Policy Sandwich</div>
    <div class="sec-title">Deterministic Math</div>
    <div class="sec-desc">LLMs never touch PayPal mutation APIs directly. Invariant check: <span class="code">amount &le; max_auto_usd</span> and <span class="code">unitPrice &le; initialQuote</span>. Halts in code if violated.</div>
  </div>
  <div class="sec-box">
    <div class="layer-tag">Layer 3: KYB Verification</div>
    <div class="sec-title">Sybil & Collusion Shield</div>
    <div class="sec-desc">Every SME must hold a verified PayPal Sandbox account and sign an <span class="code">AUTHORIZE</span> hold before pledge counts. Unbacked pledges marked <span class="code">UNVERIFIED_INTENT</span>.</div>
  </div>
  <div class="sec-box">
    <div class="layer-tag">Layer 4: Idempotency</div>
    <div class="sec-title">Exactly-Once Execution</div>
    <div class="sec-desc">Every financial mutation carries deterministic header: <span class="code">PayPal-Request-Id: hash(clan + sme + stage)</span>. Network retries cannot trigger duplicate charges or double refunds.</div>
  </div>
  <div class="sec-box">
    <div class="layer-tag">Layer 5: Dispute Tamper</div>
    <div class="sec-title">Multimodal Hashing</div>
    <div class="sec-desc">SHA256 perceptual hashing prevents photo evidence reuse. Cross-checks PayPal carrier <span class="code">DELIVERED</span> timestamp: claims must fall within 48h inspection window.</div>
  </div>
  <div class="sec-box">
    <div class="layer-tag">Layer 6: Step-Up Auth</div>
    <div class="sec-title">Human-in-the-Loop QR</div>
    <div class="sec-desc">Transactions exceeding SME auto-spend policy generate a PayPal Invoice QR code (<span class="code">generate_invoice_qr_code</span>) sent to owner for explicit cryptographic approval.</div>
  </div>
</div>
</body>
</html>`;

const secHtmlFile = resolve(diagramsDir, '03_fintech_security_pipeline.html');
const secPngFile = resolve(diagramsDir, '03_fintech_security_pipeline.png');
const secDocsPng = resolve(docsDiagramsDir, '03_fintech_security_pipeline.png');

writeFileSync(secHtmlFile, secHtml, 'utf-8');
console.log('Rendering 03_fintech_security_pipeline.png...');
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1600,480 --screenshot="${secPngFile}" "${secHtmlFile}"`, { stdio: 'inherit' });
copyFileSync(secPngFile, secDocsPng);

// 4. High-Definition Clan State Machine Lifecycle
const stateHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; width: 1600px;
  }
  h2 { margin: 0 0 16px 0; font-size: 18pt; color: #a855f7; border-bottom: 2px solid #7e22ce; padding-bottom: 8px; }
  .flow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 20px; }
  .state-node { background: #18181b; border: 1.5px solid #3f3f46; border-radius: 8px; padding: 14px; width: 230px; text-align: center; }
  .state-badge { font-size: 8pt; font-weight: 700; text-transform: uppercase; padding: 3px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px; }
  .badge-forming { background: #1e3a8a; color: #93c5fd; }
  .badge-threshold { background: #064e3b; color: #6ee7b7; }
  .badge-locked { background: #78350f; color: #fde68a; }
  .badge-fulfilling { background: #4c1d95; color: #c4b5fd; }
  .badge-disputed { background: #7f1d1d; color: #fca5a5; }
  .badge-settled { background: #047857; color: #a7f3d0; }

  .state-title { font-size: 11pt; font-weight: 800; color: #ffffff; margin-bottom: 4px; }
  .state-desc { font-size: 8pt; color: #a1a1aa; line-height: 1.35; }
  .arrow { font-size: 16pt; color: #a855f7; font-weight: 800; }
  .code { background: #27272a; color: #e4e4e7; font-family: monospace; font-size: 7.5pt; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h2>Syndicate Purchasing Clan Lifecycle (PostgreSQL & PayPal State Transitions)</h2>
<div class="flow">
  <div class="state-node">
    <span class="state-badge badge-forming">Step 1</span>
    <div class="state-title">FORMING</div>
    <div class="state-desc">SMEs join pool with unit pledges (0-99% MOQ). Personal Agents negotiate terms. Real-time SSE updates.</div>
  </div>
  <div class="arrow">&rarr;</div>
  <div class="state-node">
    <span class="state-badge badge-threshold">Step 2</span>
    <div class="state-title">THRESHOLD_MET</div>
    <div class="state-desc">100% MOQ reached. Scraped Kernel wholesale discount unlocks (Tier 2 @ 28% savings). State locks for checkout.</div>
  </div>
  <div class="arrow">&rarr;</div>
  <div class="state-node">
    <span class="state-badge badge-locked">Step 3</span>
    <div class="state-title">LOCKED</div>
    <div class="state-desc">All SMEs execute PayPal Order <span class="code">intent: AUTHORIZE</span>. Master Orchestrator executes atomic batch Capture.</div>
  </div>
  <div class="arrow">&rarr;</div>
  <div class="state-node">
    <span class="state-badge badge-fulfilling">Step 4</span>
    <div class="state-title">FULFILLING</div>
    <div class="state-desc">Supplier registers carrier tracking via <span class="code">create_shipment_tracking</span>. 48h post-delivery window begins.</div>
  </div>
  <div class="arrow">&rarr;</div>
  <div class="state-node">
    <span class="state-badge badge-disputed">Optional</span>
    <div class="state-title">DISPUTED</div>
    <div class="state-desc">Damaged goods claim filed. APIMatic typed Customer Disputes v1 mediates pro-rata refund (-$300) without freezing Clan.</div>
  </div>
  <div class="arrow">&rarr;</div>
  <div class="state-node">
    <span class="state-badge badge-settled">Final</span>
    <div class="state-title">SETTLED</div>
    <div class="state-desc">Net captured funds finalized. Zapier accounting webhook dispatches to QuickBooks/Xero. Strategy memory updated.</div>
  </div>
</div>
</body>
</html>`;

const stateHtmlFile = resolve(diagramsDir, '04_clan_state_lifecycle.html');
const statePngFile = resolve(diagramsDir, '04_clan_state_lifecycle.png');
const stateDocsPng = resolve(docsDiagramsDir, '04_clan_state_lifecycle.png');

writeFileSync(stateHtmlFile, stateHtml, 'utf-8');
console.log('Rendering 04_clan_state_lifecycle.png...');
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1600,450 --screenshot="${statePngFile}" "${stateHtmlFile}"`, { stdio: 'inherit' });
copyFileSync(statePngFile, stateDocsPng);

// 5. High-Definition 4-Zone Dashboard Wireframe (Updated styling)
const uiWireframeHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px; background: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; width: 1600px;
  }
  h2 { margin: 0 0 16px 0; font-size: 18pt; color: #38bdf8; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 35% 65%; gap: 16px; }
  .zone { background: #111827; border: 1.5px solid #1f2937; border-radius: 8px; padding: 18px; }
  .zone-full { grid-column: 1 / -1; }
  .title { font-weight: 800; font-size: 11pt; color: #38bdf8; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
  .tag { background: #0369a1; color: #e0f2fe; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; }
  .content { font-size: 9pt; color: #cbd5e1; line-height: 1.5; }
  .btn { background: #2563eb; color: white; padding: 6px 12px; border-radius: 4px; font-size: 8.5pt; font-weight: 700; display: inline-block; }
  .badge-green { color: #4ade80; font-weight: 700; }
  .badge-amber { color: #fbbf24; font-weight: 700; }
  .code { background: #1f2937; color: #38bdf8; font-family: monospace; font-size: 8pt; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h2>Wholeshare: 4-Zone Synchronized Financial Command Center Layout</h2>
<div class="grid">
  <!-- ZONE 1 -->
  <div class="zone zone-full" style="border-top: 3px solid #38bdf8;">
    <div class="title">
      <span>ZONE 1: Sticky Top Bar - Judge God-Mode Simulator & Security Telemetry</span>
      <span class="tag">Top Sticky Control Header</span>
    </div>
    <div class="content" style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; gap: 10px;">
        <span class="btn">1. Spawn SME & Scrape Tiers</span>
        <span class="btn">2. Form Clan & Matchmake</span>
        <span class="btn">3. Lock PayPal Escrow ($3,600)</span>
        <span class="btn" style="background:#dc2626;">4. File Dispute (-$300)</span>
      </div>
      <div>
        <span class="badge-green">&bull; OAuth2: ACTIVE (Sandbox)</span> &nbsp;|&nbsp;
        <span class="badge-green">&bull; HMAC: ENFORCED</span> &nbsp;|&nbsp;
        <span class="badge-green">&bull; Policy Cap: &le;$1,000</span> &nbsp;|&nbsp;
        <span class="badge-green">&bull; Kernel Browser: READY</span>
      </div>
    </div>
  </div>

  <!-- ZONE 2 -->
  <div class="zone" style="border-top: 3px solid #10b981;">
    <div class="title">
      <span>ZONE 2: "Clash of Clans" Syndicate Lobby</span>
      <span class="tag">35% Width</span>
    </div>
    <div class="content">
      <strong>Active Purchasing Clan Cards:</strong><br>
      • <strong>Golden Fields Organic Flour (50 lb Bag):</strong> 350 / 500 units pledged (70% full)<br>
      • <strong>Tier Unlock Progress Ring:</strong> Tier 1 ($10.00/u) &rarr; <span class="badge-green">Tier 2 ($7.20/u - UNLOCKED 28% OFF!)</span> &rarr; Tier 3 ($5.80/u)<br>
      • <strong>Pledged Avatars:</strong> Austin Bakery (200u), Bean & Leaf Roasters (150u)<br><br>
      <strong>Dual-Mode SME Ingress Drawer:</strong><br>
      • Natural Language Textarea (e.g. <em>"Austin Bakery needing 200kg organic flour, max $300"</em>)<br>
      • <strong>Connect External Agent:</strong> Reveals HMAC webhook URL & signed curl samples for Grok Bot / Telegram.
    </div>
  </div>

  <!-- ZONE 3 -->
  <div class="zone" style="border-top: 3px solid #f59e0b;">
    <div class="title">
      <span>ZONE 3: Live A2A Negotiation & Deal-Making Arena</span>
      <span class="tag">65% Width</span>
    </div>
    <div class="content">
      <strong>Radial Multi-Agent Node Graph Canvas:</strong><br>
      • <strong>Center Core Node:</strong> Master Syndicate Orchestrator (Deterministic State Machine)<br>
      • <strong>Satellite Nodes:</strong> SME Agent 1, SME Agent 2, Kernel Cloud Scraper, Wholesale Supplier Agent<br>
      • <strong>Animated Particle Beams:</strong> Directional glowing pulses animate along edges during message passing.<br>
      • <strong>Interactive Speech Bubbles:</strong> Displays plain-English negotiation intent (*"Counter-offer: Pledging 150 units if unit price drops below $7.50"*), with click-to-expand APIMatic typed JSON payloads.
    </div>
  </div>

  <!-- ZONE 4 -->
  <div class="zone zone-full" style="border-top: 3px solid #ec4899;">
    <div class="title">
      <span>ZONE 4: AG Grid Live Syndicate & Escrow Ledger</span>
      <span class="tag">100% Width (Bottom Command Matrix)</span>
    </div>
    <div class="content">
      <strong>Financial Data Grid (Master-Detail with enableCellChangeFlash):</strong><br>
      • <strong>Master Clan Row:</strong> Clan ID (<span class="code">clan_flour_01</span>) | Target SKU (<span class="code">organic-flour-50lb</span>) | Pledged Units (500) | Escrow Total ($3,600.00) | Savings (28%) | Status (<span class="code">LOCKED</span>) | Carrier Tracking (<span class="code">1Z9999999999999999</span>)<br>
      • <strong>Expandable SME Member Detail Rows:</strong><br>
      &nbsp;&nbsp; - SME #1 (Austin Bakery): 200 units | Authorized: $1,440.00 | PayPal Order: <span class="code">ORD-SANDBOX-AUTH-9812A</span> | [View QR Invoice Modal] | Net Captured: $1,440.00<br>
      &nbsp;&nbsp; - SME #2 (Bean & Leaf): 150 units | Authorized: $1,080.00 | PayPal Order: <span class="code">ORD-SANDBOX-AUTH-4419B</span> | [View QR Invoice Modal] | Net Captured: $1,080.00<br>
      &nbsp;&nbsp; - SME #3 (GreenLeaf): 150 units | Authorized: $1,080.00 | Dispute Status: <span class="badge-amber">PARTIAL_REFUND_SETTLED (-$300.00)</span> | Net Captured: $780.00<br>
      • <strong>Cell Change Flashing:</strong> Green flash when funds are authorized/captured; amber flash when partial refund settles.
    </div>
  </div>
</div>
</body>
</html>`;

const uiWireframeHtmlFile = resolve(diagramsDir, '05_ui_4zone_dashboard_layout.html');
const uiWireframePngFile = resolve(diagramsDir, '05_ui_4zone_dashboard_layout.png');
const uiWireframeDocsPng = resolve(docsDiagramsDir, '05_ui_4zone_dashboard_layout.png');

writeFileSync(uiWireframeHtmlFile, uiWireframeHtml, 'utf-8');
console.log('Rendering 05_ui_4zone_dashboard_layout.png (High-Def)...');
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=0b0f19 --run-all-compositor-stages-before-draw --virtual-time-budget=6000 --window-size=1600,980 --screenshot="${uiWireframePngFile}" "${uiWireframeHtmlFile}"`, { stdio: 'inherit' });
copyFileSync(uiWireframePngFile, uiWireframeDocsPng);

// Copy high-definition images to the artifact directory for markdown previewing
const artifactDir = '/Users/siva/.gemini/antigravity-ide/brain/4928d23e-8385-4bb9-869b-d60a8d668b2d';
copyFileSync(archFilePng, resolve(artifactDir, '01_master_architecture_diagram.png'));
copyFileSync(pstackPngFile, resolve(artifactDir, '02_pstack_engineering_flywheel.png'));
copyFileSync(secPngFile, resolve(artifactDir, '03_fintech_security_pipeline.png'));
copyFileSync(statePngFile, resolve(artifactDir, '04_clan_state_lifecycle.png'));
copyFileSync(uiWireframePngFile, resolve(artifactDir, '05_ui_4zone_dashboard_layout.png'));

console.log('All 5 High-Definition Diagram PNGs generated successfully!');
