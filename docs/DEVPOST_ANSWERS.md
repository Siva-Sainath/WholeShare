# Devpost answers for WholeShare

Written in plain words. Paste each block into the matching box. Anything in [square brackets] is for you to fill in.

**Check these before you paste.** I could not confirm them from the code or the chat.
1. The links to the Kaggle dataset and the model. They are marked [link].
2. Which coding and design tools you used besides Claude Code. See the last section. Delete any you did not use.
3. Whether you want the PayPal "not yet run live" list in the story. I kept it, because judges respect it.

---

## Project name

WholeShare

## Elevator pitch (165 of 200 characters)

Small restaurants pool orders to reach supplier price tiers. Mosaic, our AI assistant, does the legwork. PayPal holds the money until the goods arrive in good shape.

---

## About the project

## Inspiration

Picture two restaurants across the street from each other. One makes dumplings. The other sells bubble tea. Both buy the same takeout boxes from the same supplier, and both pay $31.50 a case.

The supplier's price drops by up to 22% at 80 cases. Neither shop will ever order 80 cases alone. So they both overpay.

The obvious fix is to order together. It almost never happens, because of three questions. Whose door does the order go to? Who pays what? And who covers the loss if half the boxes show up crushed? Nobody wants to pay a stranger first.

That is a trust problem, and PayPal is built for exactly that. So we made WholeShare.

The problem is huge. There are over 36 million small businesses in the US (SBA Office of Advocacy). Nine in ten US restaurants have fewer than 50 employees (National Restaurant Association). Small buyers pay more per box simply because they order less.

## What it does

WholeShare is a group buying app for small businesses.

- **You start with your paperwork.** Drop in a supplier invoice and an inventory sheet. WholeShare reads them and fills in your business, your supplier and what you pay today. A value is only kept if it is written in your documents. Nothing is made up.
- **You find a group to join.** The app already knows what you buy, so the matching groups are right there, with the price at your volume, the discount tier, the delivery time and how much the supplier can be trusted.
- **You pledge through PayPal.** You approve on PayPal's own screen. PayPal places a hold. Nothing is charged.
- **Mosaic does the legwork.** Mosaic is the assistant inside the app. Ask it to compare two groups and it opens a full comparison with the cheapest, the fastest and the most trusted, and what you would save against what you pay today. Ask it to find new suppliers and it reads their real websites in a cloud browser. Ask it to start a group and it fills in the form from one sentence.
- **You check the goods when they arrive.** Deliveries show on a timeline and a calendar, with a 48 hour inspection window. Accept the goods and the held money is released to the supplier.
- **If something is wrong, you file a claim.** Say what happened, attach a photo, and the claim goes to the supplier with the evidence. The refund is only for the damaged units.
- **Any chatbot can plug in.** Our assistant app, Instinct, on WhatsApp, can use WholeShare through a plain link. It can search, compare and prepare a pledge, and it sends you a PayPal approval link. It can never approve money itself.

The rule behind all of it: the assistant can prepare everything, but only the person can approve a payment.

## How we built it

**PayPal is the trust layer.** The whole design leans on PayPal's authorize-then-capture flow, so the money waits until the goods are right.

- **Orders v2:** each pledge creates an order with intent AUTHORIZE. The buyer approves on PayPal, and we authorize it. That is the hold.
- **PayPal JavaScript SDK v6:** the real PayPal button and approval window on the group page.
- **Payments v2:** capture the hold when the goods are accepted, capture only the undamaged part for a partial claim, void or refund when a claim is settled.
- **Invoicing v2:** big pledges get a PayPal invoice with a QR code first. We have 20 sandbox invoices showing in the app.
- **Log in with PayPal:** connects the business's PayPal identity during onboarding.
- **Disputes webhook:** we verify PayPal's signature before any dispute event changes anything.
- Plus Shipment Tracking and Payouts, which are in the code.

**Mosaic and the harness.** Mosaic runs on Fireworks AI. The main model is MiniMax M3.1 Flash, running serverless with its thinking turned off so it answers fast. DeepSeek V4.1 Flash is the backup if the first one is slow. Around the model we built our own harness. It decides which tools the model may use, checks every argument on the server, limits each turn to five tool calls, and checks every number and name in the reply against what the tools actually returned. Mosaic has 27 tools. The person controls five permission switches: search and filter, prepare quotes, draft claims, research suppliers, change schedules. Everything starts off.

**WebMCP and MCP.** The same tools are exposed three ways. Inside the app, an in-page tool set lets the assistant filter, sort, chart and reschedule what is on the screen, in the spirit of WebMCP. Outside the app, an MCP server lets other agents connect with an invite token. For assistants that can only open a link, there is a plain link version. Instinct uses that one.

**AG Grid, AG Charts and AG Studio** run the tables, charts and reports. **Bryntum** runs the delivery timeline, the calendar and the claims board. Mosaic can open these beside the chat and change them, and so can the person.

**Kernel** runs the cloud browsers that read supplier websites for real prices. **JuiceFS** holds uploaded documents when its drive is mounted. The app runs on **Render**.

**Each business gets its own workspace.** When you finish onboarding, WholeShare builds your groups, shipments and reports from what you buy and where you are. A restaurant never sees another business's shipments.

## The model we trained ourselves

Fireworks AI with MiniMax and DeepSeek is what powers the live app today. We also trained and open sourced our own model, so you do not have to depend on anyone's servers.

- **What it is:** LoRA adapters on Qwen3.5 (4B and 9B), trained to use WholeShare's tools correctly. Link: [model link].
- **How we trained it:** with a method called on-policy self-distillation. In plain words: the model tries a task. A strict rule checker looks at what it did and flags mistakes, like going over a spend limit or an impossible claim step. A teacher copy of the model then reads the mistake and explains the fix, without seeing any private data. The corrected answer becomes new training data.
- **The dataset:** the Kaggle dataset `wholeshare-opsd-dataset`. Link: [Kaggle dataset link]. It is ordered like a course: sourcing first, then escrow, then disputes. Every amount is a whole number of cents. We mixed in 15% of general finance questions (FinQA and TAT-QA) so the model does not forget how to do ordinary money math. It sits on a data lake of 1.64 million records, about 905 thousand of them from public Kaggle datasets.
- **Training:** 4-bit QLoRA, run on free Kaggle GPUs.
- **Running it yourself:** the app has a one line switch that points Mosaic at a local model server instead of Fireworks. So you can run our tuned model on your own machine. Fireworks does not offer the Qwen3.5 base for serverless adapters, which is why the hosted app uses MiniMax and DeepSeek.

## Challenges

- **Making group buying feel safe.** Nobody wants to pay a stranger first. So we built it so money is only ever held, never taken, until the goods arrive. Everyone approves on PayPal's own screen. The assistant can prepare a pledge, but it cannot approve one.
- **Testing the real PayPal hold.** Our first real sandbox approval failed. PayPal reports a successful hold with a status we were not expecting, so our app turned down a good payment. Only a real approval showed us this. We fixed it, and the hold now goes through.
- **Starting a new business without making things up.** A new business has no data. We read its invoice and inventory sheet, and keep a value only if it is written in the documents. Then we build a workspace around what it buys and where it is.
- **Every business sees only its own world.** Early on, a restaurant could see another company's shipments, and screens showed raw ids and codes. We cleaned it up so each business sees its own groups, deliveries and claims, with real names and plain words.
- **Deliveries and disputes are the hard middle.** Goods arrive late, or crushed. We built a 48 hour inspection window, a claim with a photo, and a refund for just the damaged units. We also stopped pretending to be the supplier. A claim shows its real status and waits for their answer.
- **Reading documents on a server.** The tools we first used only existed on our laptops. We switched to ones that run anywhere, and check every value against the document.
- **Making the assistant dependable.** Our first assistant only worked on the exact sentences we tested. We rebuilt it and tried it on 100 new prompts, with 30 held back that we never tuned against. It got 97% on all of them, and 97% on the held back set. Answers take 5 to 8 seconds, and Fireworks AI makes that fast enough to feel live.

## What we are proud of

- **A real PayPal hold from a button inside our app.** The buyer approves on PayPal's own screen and a hold appears in the sandbox. Nothing is charged until the goods are accepted.
- **The assistant can prepare everything, and approve nothing.** Only the person can approve a payment. That rule is built into how the app works, not just a promise.
- **A comparison that speaks in your own money.** It shows what each group would cost you and what you save against what you pay today. For 12 cases of containers, that is $103.46 saved with one group and $52.92 with the other.
- **Setting up a business from its own paperwork.** Drop in an invoice and an inventory sheet, and the app fills in the rest. A value is only kept if it is written in the documents.
- **Any outside assistant can plug in.** Any agent can connect through MCP, or through a plain link. Our assistant app, Instinct, on WhatsApp, asks WholeShare questions and sends the owner a PayPal approval link.
- **Our own tuned model and dataset, open to anyone.** A business can run the whole assistant on its own machine, with no outside service in the middle.

## What we learned

- **Trust is the product.** People will pool orders with strangers once they know their money is only held, and released when the goods are right.
- **Show people their own numbers.** "You pay $31.50 a case today" beats any chart about the market.
- **Test with the real thing early.** A real PayPal approval caught a bug that our practice runs never would.
- **Do not fake the other side.** A claim should show its real status and wait for the supplier, not hand the buyer buttons that pretend to be the supplier.
- **Check every number the assistant says against the data.** And give it tools that match the business, such as compare, join and file a claim, not the screens.

## What is next

- **Finish the money steps live in the sandbox.** Run capture, refund and payouts with the same care as the hold.
- **Let suppliers join.** Suppliers answer claims and confirm shipments themselves, so nothing on that side is a sample.
- **Help neighbours find each other.** When one restaurant starts a group, WholeShare finds nearby businesses that buy the same thing and invites them, so groups fill faster.
- **Orders that repeat.** A restaurant buys containers every month. A standing group would come back each cycle, with a fresh PayPal approval every time.
- **Trust scores earned from real orders.** A supplier's score would come from real deliveries, damage claims and how fast they answer, so the best suppliers stand out.

**Honest limits.** Everything runs in the PayPal sandbox, so no real money moves. The sample shipments and two past claims on the demo business are sample history. Capture, refund, payouts and shipment tracking are written and tested with stand-ins, but we have not run them live yet.

---

## Built with (25 tags)

PayPal Sandbox, PayPal Orders v2, PayPal Payments, PayPal Invoicing, Log in with PayPal, PayPal JS SDK v6, AG Grid, AG Charts, AG Studio, Bryntum, Fireworks AI, MiniMax, DeepSeek, Qwen3.5, Kaggle, Kernel, MCP, WebMCP, JuiceFS, Render, React, TypeScript, Node.js, esbuild, GSAP

## Try it out links

(You will fill these in.)

---

## Explain how your project meets the main technology requirement

WholeShare uses the PayPal sandbox and an AI model together. The two do different jobs. The AI prepares and explains. PayPal holds and moves the money. The AI can never approve a payment.

**PayPal tools, and what each does**

| PayPal tool | What it does in WholeShare | Status |
|---|---|---|
| Orders v2, intent AUTHORIZE | Creates the pledge and, once the buyer approves, authorizes it. That authorization is the hold. | Run live in the sandbox |
| PayPal JavaScript SDK v6 | Shows the PayPal button and opens PayPal's approval window on the group page. | Run live |
| Invoicing v2 (with QR) | A PayPal invoice for larger pledges, before the hold. | Run live (20 invoices in the app) |
| Log in with PayPal | Connects the business's PayPal account during onboarding. | Run live |
| Payments v2: capture | Releases the held money when goods are accepted. A partial capture pays only for the undamaged units. | In code, tested with stand-ins, not yet run live |
| Payments v2: void and refund | Gives back the hold or refunds a captured payment for damaged units. | In code, tested with stand-ins, not yet run live |
| Disputes webhook | Checks PayPal's signature before a dispute event can change a claim. | In code |
| Shipment Tracking and Payouts | Carrier tracking and paying out to suppliers. | In code |

**AI tools, and what each does**

| AI tool | What it does in WholeShare |
|---|---|
| MiniMax M3.1 Flash on Fireworks AI | Mosaic's main model. Reads a request, picks tools, writes the answer. Also reads your documents and pulls out the fields. |
| DeepSeek V4.1 Flash on Fireworks AI | The backup model if the first is slow. |
| Our own Qwen3.5 LoRA adapters (trained with on-policy self-distillation) | An open model you can run locally instead of Fireworks. [model link] |
| AG Studio AI assistant | Edits the reports on the Insights page, through a server proxy. |
| Tesseract OCR | Reads phone photos of invoices. |

Between them sits our harness. It limits the tools the model can use, checks every argument, limits each turn to five calls, and checks every number in the answer against the data.

---

## Which additional sponsor tool(s) did you use?

All of them below are in the running app.

- **AG Grid:** AG Grid Enterprise for the tables, AG Charts for the charts, and AG Studio for the Insights reports. The assistant can sort, filter, group and chart the grid beside the chat.
- **Bryntum:** Scheduler for the delivery timeline, Calendar for inspection windows, TaskBoard for the claims board. The person and the assistant both use the same schedule service, with undo.
- **Kernel:** cloud browsers that read real supplier websites for prices and minimum orders.
- **Fireworks AI:** MiniMax M3.1 Flash and DeepSeek V4.1 Flash for the assistant and for reading documents.
- **MCP and WebMCP:** an MCP server for outside agents, an in-page tool set in the spirit of WebMCP so the assistant can drive the screen, and a plain link for assistants like Instinct on WhatsApp.
- **JuiceFS:** stores uploaded business documents when its drive is mounted.

---

## If you used AG Grid, what was your experience building with AG Grid, AG Charts and AG Studio?

It was good, and it did a lot of our work for us.

**What worked well**
- The grid already did what small businesses need: sorting, filtering, grouping and CSV export, with a clean look once we set the theme. We did not write any of that.
- Charts came almost free. Pick the columns and a chart appears. Our assistant draws charts on a grid this way.
- AG Studio gave us real reports quickly: money held on PayPal, demand and savings, deliveries and claims. Its live transactions mean a report updates when the data changes, with no reload.
- The AI side fits our idea. Studio exposes tools the assistant can call, so the assistant can edit a report the same way a person does.

**What was harder**
- Studio shows whatever data it is given. We had to scope it to the signed-in business, or a restaurant saw other people's shipments in its report.
- Text size and spacing take tuning. The defaults looked small on a video, so we raised the sizes in the theme.
- Chart columns need to be marked as numbers or categories, or a chart can come out empty.

**Would we use it again?** Yes. For a data-heavy product it saved us weeks.

---

## Which AI tools have you leveraged while working on this project?

- **Claude Code (Anthropic):** wrote most of the code, tests and deploys, and ran the browser checks. We used its skills to keep the style and checks consistent.
- **Fireworks AI:** we ran a bake-off of models on our real tool tasks to pick the main one. MiniMax M3.1 Flash passed 21 of 21 at about $0.0008 a call.
- **Qwen3.5 running locally:** the first brain of the app, before we moved to Fireworks. It is also the base of our trained model.
- **Kaggle GPUs:** trained our adapters.
- **Cap (screen recorder) and its agent tools:** recorded the demo.
- [Cursor, Kiro and Google Stitch: the repo has prompt files and scripts for these. Keep them only if you used them.]

---

## Image gallery (15 images, 3:2, PNG, all under 5 MB)

Upload in this order. They are in `~/Movies/WholeShare-demo/devpost-images/`.

| # | File | What it shows (use as the caption) |
|---|---|---|
| 1 | 01-landing-hero.png | Pool demand. Buy with clarity. Mosaic is awake on Fireworks. |
| 2 | 02-the-problem-with-sources.png | Why small buyers pay more, with sourced numbers (SBA, World Bank, National Restaurant Association). |
| 3 | 03-discover-groups-with-saving-banner.png | Matching groups, already filtered to what the business buys, with a saving banner against today's price. |
| 4 | 04-group-page-tiers-and-receiving-point.png | A group page: discount tiers, supplier trust, delivery in five days, and the receiving point. |
| 5 | 05-my-groups-and-escrow.png | My groups: AG Grid with money held on PayPal. |
| 6 | 06-bryntum-delivery-timeline.png | Bryntum Scheduler: shipments in transit, delayed and in the inspection window. |
| 7 | 07-bryntum-calendar-inspection-windows.png | Bryntum Calendar: arrivals and 48 hour inspection windows. |
| 8 | 08-bryntum-claims-board.png | Bryntum TaskBoard: claims from Draft to With supplier to Settled. |
| 9 | 09-claims-ag-grid.png | Damage claims in AG Grid with readable references, not ids. |
| 10 | 10-ag-studio-insights-paypal-position.png | AG Studio: money held on PayPal, open invoices and held by group. |
| 11 | 11-ag-studio-delivery-and-claims.png | AG Studio: on-time rate, delay rate and claimed amount. |
| 12 | 12-agents-outside-access-and-live-feed.png | Agents page: the assistant, the in-page tools, the MCP server and a live feed of outside agents. |
| 13 | 13-mosaic-comparison-panel.png | Mosaic: one sentence opens a full comparison with verdicts, savings and charts. |
| 14 | 14-mosaic-shipments-with-sources.png | Mosaic answering about shipments from real records, with the browser source shown. |
| 15 | 15-onboarding-reads-your-documents.png | Onboarding reads an invoice and inventory sheet and fills the checklist. |
