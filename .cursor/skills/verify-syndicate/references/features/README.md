# Wholeshare Feature Map (Materialized Memory)

This index provides instant navigation context for agents driving and verifying Wholeshare. Each feature corresponds to a user-facing surface or infrastructure subsystem with specific control paths, driving commands, preconditions, and proof standards.

---

## Master Feature Index

| Feature Document | Target Surface | Key User POV Actions | Primary Control Command |
| :--- | :--- | :--- | :--- |
| **[judge-simulator.md](judge-simulator.md)** | Top Sticky Control Bar | 1-Click execution of 4-stage lifecycle | `control-syndicate.mjs match-clan` |
| **[clan-lobby.md](clan-lobby.md)** | Top-Left Panel (35% Width) | Browse purchasing clans, view MOQ progress rings | `control-syndicate.mjs spawn-sme` |
| **[a2a-arena.md](a2a-arena.md)** | Top-Right Panel (65% Width) | Radial A2A node canvas, animated particles | `control-syndicate.mjs wait-settle` |
| **[ag-grid-ledger.md](ag-grid-ledger.md)** | Bottom Panel (Full Width) | Master-Detail financial table, cell flashing | `control-syndicate.mjs lock-escrow` |
| **[escrow-lifecycle.md](escrow-lifecycle.md)** | Financial Escrow Pipeline | Soft Auth, Batch Capture, APIMatic Dispute | `control-syndicate.mjs lock-escrow` |
| **[rate-limiting-gateway.md](rate-limiting-gateway.md)** | Gateway & Ingress Layer | Token/Leaky/Sliding-window limiter prototypes | `control-syndicate.mjs rate-limit` |
| **[cloud-deploy-render.md](cloud-deploy-render.md)** | Cloud & Docker Stack | Render IaC, Docker Compose, PostgreSQL & Redis | `control-syndicate.mjs doctor` |

---

## Architectural Grounding
When making modifications to any UI component, backend route, or infrastructure layer:
1. Locate the feature file corresponding to the component.
2. Review the `Driving it with control-syndicate` section for the exact verification command.
3. Assert that changes satisfy the observable end state described in the document.
4. Run `node .cursor/skills/verify-syndicate/control-syndicate.mjs wait-settle` before capturing UI snapshots.
5. Run `node .cursor/skills/verify-syndicate/control-syndicate.mjs features:lint` to verify that all feature maps strictly adhere to the mandatory 4-header standard.
