# How WholeShare is built

This page explains how the parts fit together and why they are shaped this way. For setup, see the [README](../README.md).

The diagrams are drawn by `scripts/render-diagrams.js`. Edit the script and run `node scripts/render-diagrams.js` to change them.

## The big picture

![System overview](02-system-overview.png)

WholeShare is one Node.js server and one browser app.

The browser app shows the groups, the delivery timeline, the claims and the reports. It talks to the server over ordinary web routes, and it receives live updates over a stream, so a change made by Mosaic shows up on every open screen.

The server has four jobs.
- **Serve the app and its API.** Web pages, group data, the PayPal routes and the webhook.
- **Run Mosaic.** The harness sits between the model and everything the model can touch.
- **Keep the ledger.** Pledges, shipments and claims are saved as files on a disk, so there is no database to run.
- **Read documents.** PDFs, photos and spreadsheets become a business profile.

Three outside services do the heavy work. PayPal holds and moves money. Fireworks AI runs the language models. Kernel runs cloud browsers that read supplier websites.

A fourth path leads in from outside. An assistant such as Instinct on WhatsApp connects through the MCP server or a plain link, and reaches the same harness with the same rules.

## Why PayPal sits at the center

A buying group only works if people will pay before they trust each other. PayPal's authorize-then-capture flow gives us exactly that. The buyer approves, PayPal places a hold, and nothing is charged until the goods are accepted. We did not invent an escrow system. We used PayPal's.

![The money flow](03-money-flow.png)

Read the diagram from the top.

1. The buyer pledges. The server creates a PayPal order with the intent `AUTHORIZE`.
2. PayPal shows its own approval screen. The buyer approves there, so the app never sees card or login details.
3. The server authorizes the order. A hold now exists. Nothing is charged.
4. The supplier delivers. The buyer has 48 hours to inspect.
5. If the goods are fine, the server captures the hold and the supplier is paid.
6. If some units are damaged, the buyer files a claim with a photo. The server captures only the intact units and releases the rest, or refunds the damaged units if the money was already captured.

Two details keep this safe. Every amount is a whole number of cents, so there are no rounding errors. Every call that changes money carries an idempotency key, so a retry after a network failure never pays twice.

A background worker, `src/daemon/reconciliation.worker.ts`, re-checks operations that are still pending and flags the ones that need a person. PayPal's webhooks arrive at `/api/v1/paypal/webhook`. The handler checks the signature first. Events that arrive out of order wait in a buffer until the event they depend on exists.

## Why the assistant cannot move money

Mosaic is useful because it can do things. It is safe because the harness limits what it can do.

![The Mosaic harness](04-mosaic-harness.png)

A request passes through these steps.

1. The harness adds context to the request: the business profile, the screen the person is on, and what they pay today.
2. The model picks tools. A tool is a small action such as "list groups" or "open the PayPal approval step".
3. The harness checks the person's permission switches. All five start off. If a switch is off, Mosaic stops and says which switch it needs.
4. The server checks every argument before the tool runs.
5. The tool runs. Read tools fetch data. Screen tools open a grid, a timeline or a form. Money tools can only open PayPal's approval step.
6. The harness checks the draft answer. Every number and name in it must appear in the tool results. If one does not, the model rewrites the answer.

No tool can approve a payment. The most a tool can do is open PayPal's approval screen, and the person decides there.

Two more limits apply. A turn allows at most five tool calls. A spend limit stops hosted model calls once a budget is used up.

The code is in `src/lib/durable-harness.js` (the loop), `src/lib/tool-registry.js` (the tools), `src/lib/interceptor.js` (argument checks) and `src/lib/reply-check.js` (the fact check). More detail is in [HARNESS.md](HARNESS.md).

## How outside assistants connect

![Outside agents](05-outside-agents.png)

The same tools can be used from outside the app, in two ways.

- **MCP.** An MCP client connects to `/mcp` with an invite token. The person creates the token on the Agents page and can revoke it at any time.
- **A plain link.** An assistant that can only open links uses `/api/v1/agent/<token>/ask` to ask a question, and `/api/v1/agent/<token>/clans` to list groups.

Both reach the same harness and follow the same permission switches. For money, there is one extra tool, `request_pledge_approval`. It creates a PayPal order and returns an approval link. The assistant sends the link to the owner, who opens it and approves on PayPal. The Agents page shows a live feed of what outside agents are doing.

## Where each business's data lives

When a business finishes onboarding, `src/lib/workspace-seed.js` builds a workspace for it: the groups that match what it buys, plus the pledges and shipments that go with them. Each business sees only its own shipments, claims and reports. The demo runs as one shared workspace, so only one business is active at a time.

Uploaded documents go through `src/lib/storage-driver.js`. It writes to a JuiceFS mount when `JUICEFS_MOUNT_PATH` is set, and to a local folder otherwise.

## The model we trained

The hosted app uses MiniMax M3.1 Flash and DeepSeek V4.1 Flash on Fireworks AI. We also trained LoRA adapters for Qwen3.5 with on-policy self-distillation, so that anyone can run the assistant on their own machine. The method, the dataset and the notebooks are described in the [README](../README.md#how-wholeshare-uses-ai). The training code is in [`training/`](../training/).
