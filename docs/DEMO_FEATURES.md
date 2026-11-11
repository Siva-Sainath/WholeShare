# WholeShare demo menu: every feature, what runs it, and what to show

Live site: https://wholeshare-app.onrender.com. Everything here is real and runs in the PayPal sandbox. No money moves for real.

**The story.** Two neighbouring Brooklyn restaurants buy the same takeout containers. Neon Dumpling Co. (you) pays $31.50 a case alone. Cloud Nine Boba (your teammate, across the street) buys cups. The supplier, Garden State Paper & Packaging, only gives group pricing at 80 cases. Together they get about $22.88 to $20.65. The question WholeShare answers: who holds the money, and what happens when the goods arrive crushed.

Sample documents for both businesses are on the first onboarding screen (invoice PDF, inventory CSV, damage photo).

---

## 1. Features you can show

| # | Feature | What the person sees | What runs it |
|---|---|---|---|
| 1 | **Onboarding from documents** | Drop an invoice PDF, an inventory CSV or XLSX, or a phone photo of an invoice. The profile fills itself and the questions it can already answer are skipped. A card lists each value with its source file. | `unpdf` (pure JavaScript PDF reader), `tesseract.js` (OCR in WebAssembly, English data bundled), `xlsx`. Fireworks model pulls the fields. Every value is checked against the document text and dropped if it is not written there. Files are stored through the JuiceFS-aware storage layer. |
| 2 | **Your own workspace, built at onboarding** | After onboarding the groups, suppliers, shipments and insights are about your business and your city, not a fixed demo. | Per-business workspace generator, owner id carried through every screen. |
| 3 | **Discover** | Search takeout containers and see open groups with fill level, tier, delivery time and supplier trust. A banner says what you pay today against the group price. | AG Grid Enterprise. Search falls back to plural-tolerant word match. |
| 4 | **Compare groups** | Ask Mosaic "compare the two takeout container groups for 12 cases". A table docks beside the chat with the deciding factor and the saving. | Mosaic harness tools (`query`, `compare_groups`), AG Grid in the docked panel, charts and export. |
| 5 | **Join with a PayPal hold** | Approve in PayPal. Only an authorization is placed. The hold appears in My groups with its authorization id. | PayPal Orders v2 `AUTHORIZE`. Pledge saved to disk and put in the ledger. Return and cancel links work on any device. |
| 6 | **Create a group** | "Start a jasmine rice group with Cloud Nine Boba, delivered to both our back doors." The form opens prefilled with two receiving points. You are listed as the leader. | Harness `start_group_buy`, `find_suppliers`. Kernel cloud browsers for live supplier research (about 9 to 25 seconds, show it sped up). |
| 7 | **Delivery timeline** | Shipments on a scheduler, a calendar and a task board. Drag a delivery, book a dock slot, extend the inspection window. Undo works. Mosaic can do the same by typing. | Bryntum Scheduler, Calendar, TaskBoard. One shared schedule service for the person and the agent. |
| 8 | **Supplier step (clearly labelled sample)** | One button on the group page: "Supplier marks delivered (sample supplier)". It is the only step the app plays itself, and it says so. | Delivery store, 48 hour inspection window. |
| 9 | **Accept goods, release payment** | "Goods are fine, release payment" captures the held money. The capture id shows on the group. | PayPal capture of the stored authorization. |
| 10 | **Damage claim and refund** | Report damage with a photo. The claim moves Draft, With supplier, Settled. The refund is proportional to the damaged units. A held order is captured only for the intact units and the rest of the hold is released. | PayPal refund or partial final capture. Claims board. PayPal Disputes webhook (signature checked). |
| 11 | **Insights** | Holds, deliveries and claims as live reports, only about your business. | AG Studio with live data transactions, AG Charts. |
| 12 | **Invoicing for big pledges** | A large pledge produces a PayPal invoice with a QR code. | PayPal Invoicing, Billing plans for dues. |
| 13 | **Live model status** | A card on the landing page shows the model waking up and the real reply time. | Fireworks serverless (MiniMax M3.1 Flash), DeepSeek fallback, status probe. |
| 14 | **Permissions page** | Switches for what Mosaic may do: filter, quotes, drafts, research, schedule. Spend limit per pledge. | Harness permission layer. |

## 2. What Mosaic can do (prompts to paste)

Warm the model first (say "hot" and I will do it), then paste these live:

1. `Which takeout container groups near me can we still join?`
2. `Compare the two takeout container groups for 12 cases`  (table docks in AG Grid, states the saving against $31.50)
3. `Sort that by delivery time and filter to under $24 a unit`
4. `Chart price per unit by group`
5. `Show my open holds and what they add up to`
6. `Move the container delivery up one day`  (Bryntum timeline moves, undo available)
7. `Book the back door slot on Saturday at 8`
8. `Where is my shipment and how long is my inspection window?`
9. `Start a jasmine rice group for Neon Dumpling and Cloud Nine Boba`
10. `File a damage claim for 3 crushed cases`

How it stays safe: a tool allowlist, your permission switches, at most five tool calls per turn, a fact check on the reply, and PayPal always asks you to approve before money is held.

## 3. Sponsors and technologies, one line each

- **Fireworks AI**: serverless inference for Mosaic and for reading documents. MiniMax M3.1 Flash, with a DeepSeek hedge if the first is slow.
- **PayPal**: Orders v2 authorize, capture and refund, Invoicing with QR, Billing, Disputes webhook. Sandbox only.
- **AG Grid**: Enterprise grid in the docked panel, AG Charts, AG Studio reports, scoped to your business.
- **Bryntum**: Scheduler, Calendar and TaskBoard for deliveries and claims, with undo.
- **Kernel**: cloud browsers that research suppliers live.
- **MCP**: our `/mcp` server lets an outside agent use WholeShare with an invite token and the same permission switches.
- **In-page agent tools**: an agent in the browser can filter, sort, chart and schedule on screen through the browser's model-context API (called WebMCP). Say it in the voice-over, not in the UI.
- **JuiceFS**: uploaded business documents go through the storage layer that uses the JuiceFS mount when it is present and local disk otherwise.
- **Render**: Node server, starter plan, 1 GB disk.

## 4. The outside-agent segment (Instinct on WhatsApp, or any chatbot)

Show that WholeShare is not locked inside its own website.

1. On the Agents page, copy the connection (MCP URL plus a bearer invite token), or the plain invite link.
2. In Instinct (or Claude, or any MCP client) ask: `Compare the container groups for 20 cases and get me in.`
3. The assistant calls `compare_groups`, then the new tool `request_pledge_approval`, which returns a **PayPal approval link**. It sends the link to you on WhatsApp.
4. You open it on your phone and approve on PayPal. The hold lands in My groups.
5. While it happens, the Agents page shows **"Live from connected agents"** with the tool and time, and a small toast pops up on any screen.

The point for judges: the agent can search, compare and prepare, but only the person can approve money.

Still needed from you: whether Instinct can add a remote MCP server with a header. If it can, use `https://wholeshare-app.onrender.com/mcp` with `Authorization: Bearer <token>`. If it only takes a link, use the invite link.

## 5. Suggested 3 minute order

| Time | Beat |
|---|---|
| 0:00 | Two owners, same invoice, same answer: the minimum is 80 cases. "$31.50 alone. About $22 together. Who holds the money?" |
| 0:20 | Drop the Neon Dumpling invoice and inventory. Profile fills with the source of each value. |
| 0:40 | Compare two container groups in Mosaic. |
| 0:58 | Join, approve in PayPal, hold id appears. |
| 1:15 | Create a group with Cloud Nine Boba (sped-up Kernel research). |
| 1:30 | Supplier marks delivered, goods are fine, release payment, capture id. |
| 1:50 | Crushed delivery: photo, claim, board moves, refund. |
| 2:15 | Insights in AG Studio. |
| 2:30 | Instinct on WhatsApp sends the approval link, Agents page lights up. |
| 2:50 | Close: money only moves when you approve on PayPal. |

## 6. Honest limits

- One shared workspace on the live site, so only one of you should drive at a time. Resetting the profile in Settings restores the demo state.
- Kernel research takes 9 to 25 seconds. Show it sped up.
- The first Fireworks reply after idle can be slow. Ask me to warm it before you present.
- The Bryntum trial badge is visible.
- Approving a hold needs the PayPal sandbox buyer login. Capture and refund logic is covered by tests with stand-ins; the live run needs that login.
- Without a PayPal hold behind an order, a refund is shown as "LOCAL-RECORD" instead of a PayPal id.
- The browser's native model-context API is not tested in Chrome yet. The in-page tools are verified.
