# WholeShare demo guide

How to show one business using the whole platform, with the exact prompts and numbers that work on the live site (https://wholeshare-app.onrender.com). Every prompt and figure below was run against the live site on 11 Nov 2026. PayPal is sandbox only: no real money moves.

## 1. The business

**Neon Dumpling Co.** (you). A dumpling restaurant at 218 Bedford Avenue, Brooklyn. It buys 12 cases a month of 32 oz kraft takeout containers from **Garden State Paper & Packaging** at **$31.50 a case**. A small restaurant gets no volume price, because the group tiers start when a group reaches 80 cases.

**Cloud Nine Boba** (your teammate). A café on Court Street that buys 16 oz clear cups. Same problem, different product.

The one-line problem for judges: *small restaurants pay full price because none of them can order 80 cases alone, and nobody wants to pay a stranger up front.* WholeShare pools their orders, holds each person's money on PayPal without taking it, and only releases it once the goods arrive in good shape.

## 2. Before you record

1. **Sign out first.** There is now a Sign out button next to the business name in the top bar. It clears the profile, disconnects PayPal and returns the site to the sample workspace. Use it between takes and when the teammate takes over. There is one shared workspace on the live site, so only one person can be signed in at a time.
2. **Turn on Mosaic's permissions** (Settings, or the Allow button when Mosaic asks). All five are off by default for safety: search and filter, prepare quotes, draft messages and claims, research suppliers, change schedules. Mosaic stops and tells you which one it needs. This is part of the story: you decide what it may do.
3. **Warm the model.** Tell me when to warm Fireworks and I will do it. The first reply after idle can be slow.
4. Have the PayPal sandbox buyer login ready for the approval screen.
5. Sample documents are on the first onboarding screen. Damage photo: `src/web/public/demo-kits/photos/damaged-parcel-crushed.jpg`.

## 3. What is in the demo market (real numbers)

| Group | Supplier | Filled | Price at your 12 cases | Delivery |
|---|---|---|---|---|
| Takeout containers 32 oz, **Eastern Imports** | Eastern Wholesale Packaging Imports | 41 of 80 | **$22.88** (18% off $27.90 list), $274.54 total | 12 days, trust 0.86 |
| Takeout containers 32 oz, **Garden State** | Garden State Paper & Packaging | 38 of 80 | **$27.09** (14% off $31.50 list), $325.08 total | 5 days, trust 0.97 |
| Clear cups 16 oz with lids | | 29 of 50 | $54.52 (6% off $58.00) | 5 days |
| Nitrile gloves, case of 1,000 | | 32 of 60 | $58.88 (8% off $64.00) | 7 days |
| Jasmine rice 25 lb | | 84 of 120 | | |

Neon Dumpling already has orders in motion, so the shipment and hold screens are not empty: 12 cases of containers from Garden State in transit (due 13 Nov), 8 cases from Eastern delivered with the 48 hour inspection window open, and holds on rice, gloves and napkins.

Each business sees only its own groups, holds, shipments and claims. Neon Dumpling shows its two container shipments. A business onboarded from documents, such as Cloud Nine Boba, gets its own generated set, so the timeline and grids change when you sign out and onboard as someone else.

## 4. How Neon Dumpling uses the platform, step by step

**Step 1. Onboard from documents (20 s).** Drop `neon-dumpling-invoice.pdf` and `neon-dumpling-inventory.csv`. Mosaic reads them and shows each value with its source file: business, address, supplier, and "you pay $31.50 a case for containers". Only values written in the documents are kept; anything else is left blank and asked. Photos of an invoice work too (OCR).
*Tech: unpdf and tesseract.js read the files with no server tools, Fireworks pulls the fields, every value is checked against the text, files go through the JuiceFS-aware storage layer.*

**Step 2. Find and compare groups (30 s).** In Mosaic chat:
- `Which takeout container groups can we still join?`
  Returns both groups and says what you save against the $31.50 you pay today.
- `Compare the two takeout container groups for 12 cases`
  Opens a table beside the chat. Eastern is cheaper ($22.88 against $27.09, about $50 less on 12 cases). Garden State is faster (5 days against 12) and the supplier you already trust (0.97 against 0.86). Mosaic names the deciding factor and what you give up.
*Tech: Fireworks inference, Mosaic harness tools `query`, `resolve`, `compare_groups`, AG Grid Enterprise.*

**Step 3. Join (20 s).** `Join the Garden State takeout container group with 12 cases`
The PayPal approval step opens with 12 units at $27.09, $325.08 total. Approve with the sandbox buyer. Only an authorization is placed. The hold and its PayPal id appear in My groups.
*Tech: PayPal Orders v2 authorize. Mosaic prepares, only you approve.*

**Step 4. Create a new group (25 s).** Nothing exists for boba straws, so start one:
`Start a group buy for wide boba straws, 8 cases, delivered to our back door on Bedford Avenue and to Cloud Nine Boba on Court Street`
Mosaic searches for suppliers, then opens the Start a group buy form already filled in, with both receiving points. You review it and publish. Say "sped up" for the supplier research on screen.
*Tech: harness `find_suppliers` and `start_group_buy`, Kernel cloud browsers for live supplier pages.*

**Step 5. Track the delivery (20 s).** `Where is my shipment and when does my inspection window end?`
Gives tracking, expected date and the inspection deadline for each shipment. Then `Move the Garden State container delivery up one day` and the delivery moves on the Bryntum timeline, with undo.
*Tech: Bryntum Scheduler, Calendar and TaskBoard through one schedule service shared by you and Mosaic.*

**Step 6. Goods arrive: release the money (20 s).** On the group page, the sample supplier marks the goods delivered (this one button is labelled as the sample supplier). Then "Goods are fine, release payment" captures the held money and shows the PayPal capture id.
*Tech: PayPal capture of the stored authorization.*

**Step 7. Goods arrive damaged: claim and refund (30 s).** For the Eastern shipment (delivered, window open): attach the crushed-parcel photo in chat and type `File a damage claim for 3 crushed cases on the Eastern container shipment`. Mosaic asks for the photo if it is missing, then drafts the claim. The claim moves Draft, With supplier, Settled on the claims board. The refund is proportional to the damaged units. If the money was only held, the supplier is paid for the intact units and the rest of the hold is released.
*Tech: PayPal refund or partial final capture, Disputes webhook, photo evidence.*

**Step 8. Insights (15 s).** Open Insights: holds, deliveries and claims for this business only. In chat, with the table open, try `Sort that by delivery time`, `Chart price per unit by group` and `Show my open holds and what they add up to`. These drive the grid on screen, so run each once before recording, because they depend on what table is open.
*Tech: AG Studio reports, AG Charts, in-page agent tools (WebMCP).*

**Step 9. Cloud Nine Boba joins (15 s).** Sign out, then onboard as Cloud Nine Boba with its own documents. Its workspace is built from what it buys. In chat: `Which clear cup groups can we still join?` shows the cups group at 29 of 50.

## 5. The outside-agent segment (Instinct on WhatsApp, or any chatbot)

Message from Instinct: `Compare the container groups for 20 cases and get me in.`
1. Instinct calls our MCP server (`/mcp`) with the invite token from the Agents page.
2. It runs `compare_groups` and then the new `request_pledge_approval` tool, which returns a **PayPal approval link** and the amount.
3. Instinct sends you the link on WhatsApp. You open it on your phone and approve on PayPal.
4. The hold appears in My groups. The Agents page shows **Live from connected agents** with the tool and time, and a toast appears on any screen.

The point: any agent can search, compare and prepare, but only the person can approve money.
Open question for you: can Instinct add a remote MCP server with a bearer header (use `https://wholeshare-app.onrender.com/mcp`), or only take a link (use the invite link)?

## 6. Technology behind each part

- **Fireworks AI**: serverless inference for Mosaic and for reading documents (MiniMax M3.1 Flash, DeepSeek as a hedge).
- **Mosaic harness**: tool allowlist, permission switches, at most five tool calls per turn, a fact check on every reply, streaming.
- **PayPal**: Orders v2 authorize, capture, refund; Invoicing with QR for large pledges; Billing; Disputes webhook with signature check.
- **AG Grid**: Enterprise grid in the docked panel, AG Charts, AG Studio reports.
- **Bryntum**: Scheduler, Calendar, TaskBoard.
- **Kernel**: cloud browsers for supplier research.
- **MCP** at `/mcp`: lets outside agents use WholeShare under the same permissions.
- **WebMCP** (say it in the voice-over only): in-page tools an agent in the browser can call to filter, sort and chart.
- **JuiceFS**: uploaded documents use the JuiceFS mount when present, local disk otherwise.
- **Render**: Node server, 1 GB disk.

## 7. Limits to know

- Chat replies take about 3 to 8 seconds once warm. Supplier research (Kernel) takes 9 to 25 seconds.
- Creating a group by chat needs the research and draft permissions on. Without them Mosaic says exactly which one is missing.
- Mosaic never approves payments. Join opens the PayPal step and waits.
- A refund on an order with no PayPal hold behind it is shown as "LOCAL-RECORD" instead of a PayPal id.
- The sandbox buyer login is needed to approve a hold. Capture and refund logic is covered by tests with stand-ins; the live run needs that login.
- The Bryntum trial badge is visible.
- The Sort, Chart and filter prompts depend on the table that is open. Test them once before recording.
