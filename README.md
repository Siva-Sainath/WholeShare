# WholeShare

**Small restaurants pool their orders to reach supplier price tiers. An AI assistant does the legwork. PayPal holds the money until delivery is verified.**

WholeShare is a B2B group buying marketplace. Independent businesses that sit on the same street, and cannot reach a supplier's minimum alone, join a *group*. When the group fills, everyone gets the tier price. Mosaic, an AI assistant that lives in the app, finds groups, compares them, joins one, sources suppliers on the live web, moves deliveries and files damage claims. Every change it makes appears on the same screens a person uses.

> Everything runs in the **PayPal sandbox**. No real money moves anywhere in this project. Groups, members and directory suppliers are generated **sample data**, and the app says so.

## Try it (2 minutes)

1. Open the app and finish onboarding. Say what you run in one sentence, for example *We run Golden Lotus Kitchen, a Chinese restaurant in Flushing, Queens.* Mosaic fills the form.
2. Open **Mosaic** and try, in this order:
   - `Which Flushing groups can we still join?`
   - `Compare the two Flushing takeout container groups for 12 cases`
   - `Join the Garden State container group with 12 cases` (the PayPal approval step opens; approve it in the sandbox, or close it)
   - `Where is our container shipment and is it late?`
   - `Move the container delivery up a day`, then `Undo that`
   - `Our delivered containers arrived crushed, 8 cartons, file a claim` (attach any photo)
   - `Find new suppliers for jasmine rice on the web` (a Kernel cloud browser searches live)
3. Watch the sponsor tool rows under each answer, the docked AG Grid beside the chat, and the **Insights**, **Disputes** (Bryntum) and **Agents** pages react to what Mosaic did.
4. **Settings > Agent and AI** has the permission switches. Turn one off and Mosaic asks before doing that kind of thing.

PayPal sandbox buyer login for the approval step: see the testing instructions on the submission page.

## What Mosaic can do

| Job | How it works |
|---|---|
| Find and rank groups | `query` reads any data source with filters, sorting, grouping and totals, and answers from the rows |
| Compare like for like | `compare_groups` prices the same units in each group, with the tier you would reach, delivery days, supplier trust and a verdict per factor |
| Join through PayPal | `join_group` prices the pledge and opens the PayPal approval step. It never pledges or moves money. The person approves |
| Start a group | `start_group_buy` opens the form filled in, including one or several receiving points |
| Set up the account | `setup_profile` fills the profile from one sentence |
| Source suppliers | `find_suppliers` checks the directory, then a **Kernel** cloud browser searches the web. `kernel_read_supplier_site` reads a supplier's pages for price, minimum order and lead time (read only, never submits a form). Web leads are labelled unverified |
| Track and dispute | `track_shipment`, `file_damage_claim` (a draft for human review) and the claims board |
| Change the schedule | `schedule_move_delivery`, extend inspection, book a dock slot per receiving point, resolve conflicts, undo. Dragging a **Bryntum** bar calls the same endpoints |
| PayPal | position report, invoice list, `send_invoice_reminder` (sandbox) |

## How it works

```
Browser (React, Astryx, AG Grid, AG Studio, Bryntum)
   |  POST /api/v1/agent/chat                  ^  SSE /api/v1/events
   v                                           |  text deltas, tool calls, tool results, UI actions
Server (Node)                                  |
   durable-harness: model call -> tool calls -> checks -> model call
   |  1. permission switch for the tool         (user settings)
   |  2. server side argument validation        (interceptor)
   |  3. tool runs, with a deadline             (tool-registry, mosaic-tools)
   |  4. reply figures and names checked        (reply-check)
   v
Fireworks (MiniMax M3.1 Flash, DeepSeek V4.1 Flash as hedge)   Kernel   PayPal sandbox
```

- **One code path.** Mosaic and a person go through the same server validation. Results stream to every open screen, so the grids, the Scheduler and the Studio reports update live.
- **The model cannot move money.** None of its tools pledge, capture or pay out. Writes sit behind user permission switches the model cannot change.
- **Replies are fact checked.** Figures and names in a reply must appear in that turn's tool results. A mismatch triggers one rewrite.
- **Streaming and parallel reads.** Text streams while the model writes. Independent reads run together, slow tools have deadlines, and a turn is capped at five tool calls.
- **Reliability.** Transient Fireworks errors retry. If the primary model has not answered in 5 seconds, the same request also goes to a fallback model and the first answer wins. Requests carry a session affinity header for prompt caching (about 76 percent of prompt tokens served from cache).
- **Spend guard.** A persistent ledger refuses hosted model calls past a budget.

Design notes: `docs/HARNESS.md`, and a comparison with other harnesses and WebMCP implementations in `docs/HARNESS_STUDY.md`.

## Sponsors in the product

- **AG Grid Enterprise**: the docked results panel (status bar, side bar, grouping, integrated charts, CSV export, cell flash), the ledger and member grids. Registered through `AllEnterpriseModule` and `IntegratedChartsModule`.
- **AG Studio**: live reports on PayPal, demand, delivery and members from the unified data registry, with transactions for live updates and the Studio AI assistant through a server side proxy. WebMCP tools come from `api.getAiTools()`.
- **Bryntum**: Scheduler (drag and resize call the same schedule service Mosaic uses, with undo and an audit log), Calendar, TaskBoard claims board and Grid.
- **PayPal (sandbox)**: Orders v2 authorization holds, Invoicing v2, Disputes, Shipment Tracking, Payouts, Billing and Log in with PayPal. Money only moves after the person approves on PayPal.
- **Kernel**: cloud browsers for supplier search, supplier site reading and carrier tracking, with a visible tool row while they run.
- **Fireworks**: MiniMax M3.1 Flash with reasoning off, streamed, with a hedged fallback model.

## Evidence

- A 100 prompt eval across 10 jobs (compare, join, start a group, set up an account, research, quote, schedule, dispute, PayPal, find) with 30 prompts held out and never tuned against: **97 percent, 97 percent on the held out set**. Median 5 to 8 seconds per answer for one person, about 2.9 model calls per prompt, about $0.13 per full run. Results and method: `docs/assets/mosaic-eval.md`.
- `npm run eval:mosaic` reruns it. `npm run verify:ui` loads every screen at two widths and fails on clipped or overlapping controls, broken images, test data and console errors. `npm run test:unit` runs 204 unit tests. `npm run verify-webmcp` runs 54 WebMCP cases.

## Run it

Needs Node 24 or newer.

```bash
npm ci
cp .env.example .env        # then fill in the keys below
npm run build               # bundles the client and bakes the licence keys in
npm start                   # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_BASE_URL`, `PAYPAL_KEY_RETENTION_HOURS`, `MAX_PENDING_RECHECK_COUNT`, `AUTHORIZATION_VALIDITY_DAYS` | PayPal sandbox. The server refuses to start without them rather than faking a gateway |
| `FIREWORKS_API_KEY`, `MOSAIC_PROVIDER=fireworks`, `MOSAIC_MODEL_NAME`, `MOSAIC_EXTRA_BODY` | Mosaic model. Any OpenAI compatible endpoint with tool calling works |
| `MOSAIC_FALLBACK_MODEL`, `MOSAIC_HEDGE_MS`, `MOSAIC_DEV_BUDGET_USD` | Hedge model and spend guard |
| `KERNEL_API_KEY` | Kernel cloud browsers |
| `AG_LICENSE_KEY`, `AG_STUDIO_LICENSE_KEY`, `BRYNTUM_LICENSE_KEY` | UI licences, read at build time |
| `APP_URL` | Public address, for the PayPal connect callback |

Deploy on Render with `render.yaml` (one Node service and a persistent disk, no database). `scripts/render-start.sh` keeps the app's JSON state on the disk.

## Limits, stated plainly

- Groups, members and directory suppliers are **generated sample data**. Web leads from Kernel are real pages but unverified. PayPal invoices and orders are real sandbox objects.
- PayPal runs in the sandbox only. Captures and payouts exist in code and have not been run live.
- Mosaic can be wrong about a photo: it tends to agree with what the user says about damage. Claims stay drafts for human review.
- A reply takes 5 to 8 seconds, with spikes when the hosted model is slow. Web research steps can take 20 seconds or more.
- The app is built for a laptop screen. Phone widths are not supported.
