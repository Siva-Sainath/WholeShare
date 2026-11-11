// Draws the README and architecture diagrams as SVG and renders each one to a PNG in docs/architecture.
// Run: node scripts/render-diagrams.js
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../docs/architecture/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const C = { bg: "#F6F9FC", ink: "#0F1F2E", mut: "#5C6A79", line: "#D5E1EC", blue: "#0070BA", blueS: "#E6F1F9", gold: "#FFC439", goldS: "#FFF4D6", goldD: "#8A5A00", green: "#1F9D6B", greenS: "#E3F6EE", vio: "#6D5BD0", vioS: "#EFEBFF", red: "#D6453D", redS: "#FDECEA", navy: "#0B1B2B" };
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

class Svg {
  constructor(w, h) { this.w = w; this.h = h; this.parts = []; this.defs = []; this.markers = new Set(); }
  add(s) { this.parts.push(s); return this; }
  marker(color) {
    const id = `m${color.slice(1)}`;
    if (!this.markers.has(id)) { this.markers.add(id); this.defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker>`); }
    return id;
  }
  rect(x, y, w, h, { fill = "#fff", stroke = C.line, r = 18, sw = 1.6, shadow = false } = {}) {
    return this.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${shadow ? ' filter="url(#sh)"' : ""}/>`);
  }
  text(x, y, lines, { size = 22, weight = 500, fill = C.ink, anchor = "start", gap = 1.3, mono = false } = {}) {
    const arr = Array.isArray(lines) ? lines : [lines];
    const tsp = arr.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * gap}">${esc(l)}</tspan>`).join("");
    return this.add(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${mono ? ' font-family="Geist Mono, ui-monospace, monospace"' : ""}>${tsp}</text>`);
  }
  pill(x, y, label, { fill = C.blueS, fg = C.blue, size = 20, padX = 18, h = 40 } = {}) {
    const w = Math.round(label.length * size * 0.55 + padX * 2);
    this.rect(x, y, w, h, { fill, stroke: "none", r: h / 2, sw: 0 });
    this.text(x + w / 2, y + h / 2 + size * 0.35, label, { size, weight: 600, fill: fg, anchor: "middle" });
    return w;
  }
  arrow(points, { color = C.mut, dash = false, w = 2.6 } = {}) {
    const id = this.marker(color);
    return this.add(`<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ' stroke-dasharray="7 7"' : ""} marker-end="url(#${id})"/>`);
  }
  icon(name, cx, cy, s, color) {
    const k = s / 24; const g = (inner) => this.add(`<g transform="translate(${cx - s / 2} ${cy - s / 2}) scale(${k})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`);
    const icons = {
      person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
      doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
      search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
      card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 11h18M7 15h4"/>',
      bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M8 19v2M16 19v2"/>',
      truck: '<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
      alert: '<path d="M12 3l10 17H2z"/><path d="M12 10v4M12 17h.01"/>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
      disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      loop: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
      grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
      sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
    };
    return g(icons[name] || icons.check);
  }
  card(x, y, w, h, { title, sub = [], icon, accent = C.blue, soft = C.blueS, titleSize = 25, subSize = 19, tag } = {}) {
    this.rect(x, y, w, h, { shadow: true });
    this.rect(x, y, w, 10, { fill: accent, stroke: "none", r: 5, sw: 0 });
    if (icon) { this.rect(x + 20, y + 30, 52, 52, { fill: soft, stroke: "none", r: 14, sw: 0 }); this.icon(icon, x + 46, y + 56, 28, accent); }
    const ty = icon ? y + 118 : y + 52;
    this.text(x + 22, ty, Array.isArray(title) ? title : [title], { size: titleSize, weight: 700 });
    const subY = ty + (Array.isArray(title) ? title.length : 1) * titleSize * 1.3 + 8;
    this.text(x + 22, subY, sub, { size: subSize, weight: 400, fill: C.mut, gap: 1.38 });
    if (tag) this.pill(x + 22, y + h - 56, tag, { fill: soft, fg: accent, size: 16, h: 32, padX: 14 });
    return this;
  }
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" font-family="Geist, Inter, Helvetica, Arial, sans-serif">
<defs>${this.defs.join("")}<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#0F1F2E" flood-opacity="0.10"/></filter>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF3FB"/><stop offset="0.55" stop-color="#F9FBFE"/><stop offset="1" stop-color="#FFF6DD"/></linearGradient></defs>
<rect width="${this.w}" height="${this.h}" fill="url(#bg)"/>${this.parts.join("")}</svg>`;
  }
}

const logo = (s, cx, cy, r) => {
  s.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.blue}" stroke-width="${r * 0.28}" stroke-dasharray="${r * 3.2} ${r * 1.6}" stroke-linecap="round"/>`);
  s.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.gold}" stroke-width="${r * 0.28}" stroke-dasharray="${r * 1.2} ${r * 7}" stroke-dashoffset="${-r * 3.4}" stroke-linecap="round"/>`);
  s.add(`<circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="${C.navy}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="${C.gold}"/>`);
};

// ---------- 1. hero ----------
function hero() {
  const s = new Svg(1600, 600);
  logo(s, 130, 150, 44);
  s.text(205, 172, "WholeShare", { size: 80, weight: 800 });
  s.text(80, 270, ["Pool orders. Hold the money."], { size: 46, weight: 700 });
  s.text(80, 332, ["Release it when the goods arrive right."], { size: 46, weight: 700, fill: C.blue });
  s.text(80, 398, ["Small businesses buy together. An AI assistant does the legwork.", "PayPal holds the money until delivery is checked."], { size: 25, weight: 400, fill: C.mut });
  let x = 80; const y = 492;
  for (const [label, fill, fg] of [["PayPal sandbox", C.blueS, C.blue], ["Fireworks AI", C.vioS, C.vio], ["AG Grid", C.greenS, C.green], ["Bryntum", C.goldS, C.goldD], ["Kernel", "#EDEFF2", C.mut], ["MCP", C.vioS, C.vio]]) x += s.pill(x, y, label, { fill, fg, size: 21, h: 44 }) + 14;
  const cards = [
    ["1", "Neighbours pool one order", "Each business joins the group.", C.blue, C.blueS, "person"],
    ["2", "PayPal holds the money", "Nothing is charged yet.", C.goldD, C.goldS, "lock"],
    ["3", "Released when goods are right", "Only damaged units are refunded.", C.green, C.greenS, "shield"]
  ];
  cards.forEach(([n, t, sub, col, soft, ic], i) => {
    const y0 = 70 + i * 160;
    s.rect(1050, y0, 500, 128, { shadow: true });
    s.rect(1050, y0, 12, 128, { fill: col === C.goldD ? C.gold : col, stroke: "none", r: 6, sw: 0 });
    s.rect(1086, y0 + 28, 72, 72, { fill: soft, stroke: "none", r: 20, sw: 0 });
    s.icon(ic, 1122, y0 + 64, 38, col);
    s.text(1180, y0 + 62, t, { size: 26, weight: 700 });
    s.text(1180, y0 + 98, sub, { size: 21, weight: 400, fill: C.mut });
    if (i < 2) s.arrow([[1300, y0 + 128], [1300, y0 + 160]], { color: C.mut });
  });
  return s;
}

// ---------- 2. how it works ----------
function journey() {
  const s = new Svg(1600, 560);
  s.text(40, 62, "From paperwork to refund", { size: 38, weight: 800 });
  s.text(40, 98, "Six steps. The assistant can prepare every one, and only you approve the money.", { size: 22, weight: 400, fill: C.mut });
  const steps = [
    ["Start with your paperwork", ["Drop in an invoice and", "an inventory sheet. Only", "what is written is kept."], "doc", C.blue, C.blueS, "Documents"],
    ["Find a group", ["Matching groups show", "price, tier, delivery", "time and supplier trust."], "search", C.blue, C.blueS, "Discover"],
    ["Pledge on PayPal", ["You approve on PayPal's", "screen. A hold is placed.", "Nothing is charged."], "card", C.goldD, C.goldS, "PayPal"],
    ["Ask Mosaic", ["Compare groups, search", "suppliers, start a group.", "It prepares only."], "bot", C.vio, C.vioS, "AI assistant"],
    ["Check the goods", ["A timeline and calendar", "track delivery and a", "48 hour inspection."], "truck", C.green, C.greenS, "Bryntum"],
    ["Claim if damaged", ["A photo and a sentence.", "Refund covers only the", "damaged units."], "alert", C.red, C.redS, "PayPal refund"]
  ];
  steps.forEach(([t, sub, ic, col, soft, tag], i) => {
    const x = 20 + i * 262;
    s.card(x, 140, 244, 380, { title: t.length > 17 ? [t.split(" ").slice(0, -1).join(" "), t.split(" ").slice(-1)[0]] : t, sub, icon: ic, accent: col === C.goldD ? C.gold : col, soft, tag, titleSize: 24, subSize: 17.5 });
    s.add(`<circle cx="${x + 208}" cy="${140 + 56}" r="20" fill="${col === C.goldD ? C.gold : col}"/>`);
    s.text(x + 208, 140 + 63, String(i + 1), { size: 20, weight: 800, fill: col === C.goldD ? C.navy : "#fff", anchor: "middle" });
    if (i < 5) s.arrow([[x + 246, 330], [x + 262 + -2, 330]], { color: C.mut, w: 3 });
  });
  return s;
}

// ---------- 3. system ----------
function system() {
  const s = new Svg(1600, 1000);
  const band = (y, h, label, col, lx = 70) => { s.rect(40, y, 1520, h, { fill: "rgba(255,255,255,0.55)", stroke: C.line, r: 26, sw: 1.4 }); s.text(lx, y + 34, label.toUpperCase(), { size: 17, weight: 700, fill: col, anchor: lx > 100 ? "middle" : "start" }); };
  band(30, 190, "People", C.mut);
  band(270, 440, "WholeShare server on Render  ·  Node.js", C.blue, 800);
  band(760, 200, "Outside services", C.mut, 800);
  const box = (x, y, w, h, title, sub, col, soft, ic) => {
    s.rect(x, y, w, h, { shadow: true }); s.rect(x, y, 10, h, { fill: col, stroke: "none", r: 5, sw: 0 });
    s.rect(x + 28, y + h / 2 - 28, 56, 56, { fill: soft, stroke: "none", r: 16, sw: 0 }); s.icon(ic, x + 56, y + h / 2, 30, col);
    s.text(x + 100, y + h / 2 - (sub.length > 1 ? 14 : 4), title, { size: 22, weight: 700 });
    s.text(x + 100, y + h / 2 + (sub.length > 1 ? 16 : 24), sub, { size: 16, weight: 400, fill: C.mut, gap: 1.3 });
  };
  box(100, 78, 470, 110, "Business owner", ["The WholeShare app in a browser", "React · AG Grid · Bryntum · AG Studio"], C.blue, C.blueS, "person");
  box(1030, 78, 470, 110, "Outside assistant", ["Instinct on WhatsApp, or any MCP client", "Uses an invite token the owner controls"], C.vio, C.vioS, "bot");
  const cw = 330, xs = [100, 450, 800, 1150];
  box(xs[0], 330, cw, 140, "Web app and API", ["Pages, group data, live", "updates on every screen"], C.blue, C.blueS, "grid");
  box(xs[1], 330, cw, 140, "Ledger", ["Pledges, shipments, claims", "saved on disk, no database"], C.green, C.greenS, "disk");
  box(xs[2], 330, cw, 140, "Reconciler", ["Re-checks PayPal calls", "still pending, flags problems"], C.goldD, C.goldS, "loop");
  box(xs[3], 330, 350, 140, "MCP and link routes", ["/mcp and /agent/<token>", "Same rules as the app"], C.vio, C.vioS, "link");
  box(xs[0], 530, cw, 140, "PayPal gateway", ["Orders, payments, invoices,", "sign-in, verified webhooks"], C.blue, C.blueS, "card");
  box(xs[1], 530, 680, 140, "Mosaic harness", ["Permission switches  ·  argument checks  ·  five tool calls a turn", "Fact check on every reply  ·  spend limit on model calls"], C.vio, C.vioS, "shield");
  box(xs[3], 530, 350, 140, "Document reader", ["PDF, photo (OCR), sheet.", "Keeps only what it says"], C.green, C.greenS, "doc");
  const svc = (x, w, title, sub, col, soft, ic) => box(x, 810, w, 110, title, sub, col, soft, ic);
  svc(100, 330, "PayPal sandbox", ["Orders, Payments, Invoicing,", "Log in, Webhooks"], C.blue, C.blueS, "card");
  svc(450, 330, "Fireworks AI", ["MiniMax M3.1 Flash, with", "DeepSeek V4.1 Flash backup"], C.vio, C.vioS, "bot");
  svc(800, 330, "Kernel browsers", ["Read supplier websites", "for price and lead time"], C.mut, "#EDEFF2", "globe");
  svc(1150, 350, "JuiceFS or disk", ["Uploaded documents", "(JuiceFS when mounted)"], C.green, C.greenS, "disk");
  const down = (x, y1, y2, col) => s.arrow([[x, y1], [x, y2]], { color: col, w: 3 });
  down(265, 188, 330, C.blue); down(1325, 188, 330, C.vio);
  down(265, 470, 530, C.blue);
  s.arrow([[1325, 470], [1325, 500], [1000, 500], [1000, 530]], { color: C.vio });
  s.arrow([[420, 470], [420, 500], [540, 500], [540, 530]], { color: C.blue });
  down(660, 470, 530, C.green);
  down(265, 670, 810, C.blue); down(600, 670, 810, C.vio); down(960, 670, 810, C.mut); down(1325, 670, 810, C.green);
  s.arrow([[335, 810], [335, 670]], { color: C.goldD, dash: true, w: 2.2 });
  s.text(350, 748, "webhooks", { size: 16, weight: 600, fill: C.goldD });
  return s;
}

// ---------- 4. money flow ----------
function money() {
  const s = new Svg(1600, 900);
  s.text(40, 60, "How the money moves", { size: 38, weight: 800 });
  s.text(40, 96, "PayPal authorizes first and captures later, so money waits until the goods are right.", { size: 22, weight: 400, fill: C.mut });
  const lanes = [["Buyer", 150, C.blue], ["WholeShare", 290, C.vio], ["PayPal", 430, C.goldD], ["Supplier", 570, C.green]];
  lanes.forEach(([n, y, col], i) => { s.rect(40, y, 1520, 124, { fill: i % 2 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.85)", stroke: C.line, r: 20, sw: 1.2 }); s.rect(40, y, 150, 124, { fill: col, stroke: "none", r: 20, sw: 0 }); s.text(115, y + 70, n, { size: 24, weight: 700, fill: col === C.goldD ? C.navy : "#fff", anchor: "middle" }); });
  const cx = [330, 570, 810, 1050, 1290, 1480];
  const laneY = { Buyer: 150, WholeShare: 290, PayPal: 430, Supplier: 570 };
  const node = (n, lane, col, text, { fill = "#fff", stroke = C.line, fg = C.ink, tag } = {}) => {
    const w = col === 5 ? 160 : 190, h = 84, x = cx[col] - w / 2, y = laneY[lane] + 20;
    s.rect(x, y, w, h, { fill, stroke, r: 16, sw: 1.8, shadow: true });
    s.text(x + 14, y + 26, text, { size: 17, weight: 600, fill: fg, gap: 1.22 });
    if (tag) s.text(x + 14, y + h - 10, tag, { size: 14, weight: 600, fill: C.mut, mono: true });
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };
  const a1 = node(1, "Buyer", 0, ["1  Pledges", "12 cases"]);
  const a2 = node(2, "WholeShare", 1, ["2  Creates an order", "intent AUTHORIZE"], { tag: "Orders v2" });
  const a3 = node(3, "PayPal", 1, ["3  Shows its own", "approval screen"], { tag: "JS SDK v6" });
  const a4 = node(4, "Buyer", 2, ["4  Approves", "on PayPal"]);
  const a5 = node(5, "WholeShare", 2, ["5  Authorizes", "the order"], { tag: "Orders authorize" });
  const a6 = node(6, "PayPal", 2, ["6  HOLD placed", "Nothing charged"], { fill: C.goldS, stroke: C.gold, fg: C.goldD });
  const a7 = node(7, "Supplier", 3, ["7  Delivers", "the goods"]);
  const a8 = node(8, "Buyer", 3, ["8  Inspects within", "48 hours"]);
  const b1 = node(9, "WholeShare", 4, ["9  Goods fine:", "capture the hold"], { fill: C.greenS, stroke: C.green, fg: C.green, tag: "Payments capture" });
  const b2 = node(10, "PayPal", 4, ["Supplier is paid", ""], { fill: C.greenS, stroke: C.green, fg: C.green });
  const c0 = node(11, "Buyer", 5, ["Damaged:", "files claim"], { fill: C.redS, stroke: C.red, fg: C.red });
  const c1 = node(12, "WholeShare", 5, ["Capture intact", "units only"], { fill: C.redS, stroke: C.red, fg: C.red });
  const c2 = node(13, "PayPal", 5, ["Rest released", "or refunded"], { fill: C.redS, stroke: C.red, fg: C.red, tag: "refund" });
  const elbow = (a, b, col = C.mut) => {
    if (a.cx === b.cx) return s.arrow([[a.cx, b.cy > a.cy ? a.y + a.h : a.y], [a.cx, b.cy > a.cy ? b.y : b.y + b.h]], { color: col });
    const mid = (a.x + a.w + b.x) / 2;
    if (Math.abs(a.cy - b.cy) < 4) return s.arrow([[a.x + a.w, a.cy], [b.x, b.cy]], { color: col });
    return s.arrow([[a.x + a.w, a.cy], [mid, a.cy], [mid, b.cy], [b.x, b.cy]], { color: col });
  };
  elbow(a1, a2); elbow(a2, a3); elbow(a3, a4); elbow(a4, a5); elbow(a5, a6, C.goldD);
  elbow(a6, a7); elbow(a7, a8); elbow(a8, b1, C.green); elbow(b1, b2, C.green);
  s.arrow([[a8.x + a8.w, a8.cy], [c0.x, c0.cy]], { color: C.red });
  elbow(c0, c1, C.red); elbow(c1, c2, C.red);
  // state bar
  s.text(40, 726, "WHERE THE MONEY IS", { size: 17, weight: 700, fill: C.mut });
  const bar = [[40, 520, "Not yet pledged", "#EDEFF2", C.mut], [560, 590, "HELD by PayPal (not charged)", C.gold, C.navy], [1150, 230, "Paid to supplier", C.green, "#fff"], [1380, 180, "Partly refunded", C.red, "#fff"]];
  bar.forEach(([x, w, label, fill, fg]) => { s.rect(x, 744, w, 64, { fill, stroke: "none", r: 14, sw: 0 }); s.text(x + w / 2, 784, label, { size: 21, weight: 700, fill: fg, anchor: "middle" }); });
  s.text(40, 856, "Every amount is a whole number of cents. Every call that changes money carries an idempotency key, so a retry never pays twice.", { size: 19, weight: 500, fill: C.mut });
  return s;
}

// ---------- 5. harness ----------
function harness() {
  const s = new Svg(1600, 590);
  s.text(40, 60, "Why the assistant cannot move money", { size: 38, weight: 800 });
  s.text(40, 96, "Every request passes through our harness before a tool can run.", { size: 22, weight: 400, fill: C.mut });
  const st = [
    ["You ask", ["Type a request", "in plain words"], "person", C.blue, C.blueS],
    ["Context", ["Adds your profile,", "screen and price"], "doc", C.blue, C.blueS],
    ["Model picks", ["Fireworks AI chooses", "which tools to use"], "bot", C.vio, C.vioS],
    ["Permission", ["Five switches, all off", "until you turn one on"], "lock", C.goldD, C.goldS],
    ["Server checks", ["Every argument, five", "tool calls at most"], "shield", C.green, C.greenS],
    ["Tool runs", ["Read · Screen · Money:", "PayPal step only"], "sliders", C.blue, C.blueS],
    ["Fact check", ["Every figure must", "match the results"], "check", C.green, C.greenS]
  ];
  st.forEach(([t, sub, ic, col, soft], i) => {
    const x = 20 + i * 226;
    s.card(x, 140, 204, 250, { title: t, sub, icon: ic, accent: col === C.goldD ? C.gold : col, soft, titleSize: 23, subSize: 17.5 });
    s.add(`<circle cx="${x + 172}" cy="196" r="17" fill="${col === C.goldD ? C.gold : col}"/>`);
    s.text(x + 172, 202, String(i + 1), { size: 17, weight: 800, fill: col === C.goldD ? C.navy : "#fff", anchor: "middle" });
    if (i < 6) s.arrow([[x + 206, 265], [x + 224, 265]], { color: C.mut, w: 3 });
  });
  s.rect(40, 428, 1520, 110, { fill: C.navy, stroke: "none", r: 24, shadow: true });
  s.icon("lock", 112, 483, 44, C.gold);
  s.text(160, 474, "No tool can pledge, capture or pay out.", { size: 30, weight: 800, fill: "#fff" });
  s.text(160, 512, "The most a tool can do is open PayPal's approval screen. The person decides there.", { size: 22, weight: 400, fill: "#C8D6E4" });
  return s;
}

// ---------- 6. outside agents ----------
function outside() {
  const s = new Svg(1600, 520);
  s.text(40, 60, "Any assistant can plug in. Only you approve the money.", { size: 38, weight: 800 });
  s.text(40, 96, "Instinct on WhatsApp uses a plain link. Any MCP client can connect too. Both follow your permission switches.", { size: 22, weight: 400, fill: C.mut });
  const n = [
    ["Instinct, or any chatbot", ["Asks about groups,", "compares prices"], "bot", C.vio, C.vioS],
    ["Plain link or MCP", ["With an invite token you", "can revoke at any time"], "link", C.vio, C.vioS],
    ["Mosaic harness", ["Same permissions and", "checks as the app"], "shield", C.blue, C.blueS],
    ["PayPal order", ["Mosaic asks PayPal for", "an approval link"], "card", C.goldD, C.goldS],
    ["You approve", ["Open the link on your", "phone, approve on PayPal"], "person", C.green, C.greenS],
    ["Hold placed", ["Shows live on the", "Agents page"], "check", C.green, C.greenS]
  ];
  n.forEach(([t, sub, ic, col, soft], i) => {
    const x = 20 + i * 262;
    s.card(x, 140, 244, 250, { title: t.length > 18 ? [t.split(" ").slice(0, 2).join(" "), t.split(" ").slice(2).join(" ")] : t, sub, icon: ic, accent: col === C.goldD ? C.gold : col, soft, titleSize: 23, subSize: 17.5 });
    if (i < 5) s.arrow([[x + 246, 265], [x + 260, 265]], { color: C.mut, w: 3 });
  });
  s.rect(40, 418, 1520, 64, { fill: C.goldS, stroke: "none", r: 18, sw: 0 });
  s.text(70, 458, "The assistant can search, compare and prepare. It cannot approve a payment, and a revoked token stops working at once.", { size: 22, weight: 600, fill: C.goldD });
  return s;
}

const JOBS = [["00-hero", hero()], ["01-journey", journey()], ["02-system-overview", system()], ["03-money-flow", money()], ["04-mosaic-harness", harness()], ["05-outside-agents", outside()]];
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
for (const [name, svg] of JOBS) {
  const page = await browser.newPage();
  await page.setViewport({ width: svg.w, height: svg.h, deviceScaleFactor: 1.5 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500&display=swap"></head><body style="margin:0">${svg.svg()}</body></html>`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}.png` });
  writeFileSync(`${OUT}${name}.svg`, svg.svg());
  await page.close();
  console.log(name, `${svg.w}x${svg.h}`);
}
await browser.close();
