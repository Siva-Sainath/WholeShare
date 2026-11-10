# Mosaic harness

Any model with OpenAI style tool calling can drive WholeShare. The model proposes tool calls. The server checks permissions and guardrails, runs them, and every screen updates from the same events.

Connect a model by setting env and restarting:

- `MOSAIC_PROVIDER` local, fireworks, openai, openrouter or custom
- `MOSAIC_MODEL_NAME` the model id
- `FIREWORKS_API_KEY` or `MOSAIC_MODEL_API_KEY`
- `MOSAIC_EXTRA_BODY` optional JSON merged into each request
- `MOSAIC_ALLOW_CLOUD_FALLBACK` true to allow an OpenRouter retry. Default false.

Read `GET /api/v1/harness` for the live tool list, effects, permissions and guardrails. Run `node --test test/harness-contract.test.js` for the model free contract check and `node scripts/verify-harness.js` for the live proof, which writes `docs/assets/harness-proof.md`.

## WebMCP

Tools are declared on `document.modelContext` following the WebMCP proposal for the API shape. AG Grid's post "WebMCP in AG Studio dashboards" is the source only for the Studio tool list (`api.getAiTools()`). See `docs/HARNESS_STUDY.md` for how this compares with other harnesses. A browser agent, the WebMCP extension or ChatGPT Desktop can list them and act in the user's own session, so the user's own tokens are spent and our server pays for none. Where the browser has no native modelContext, a compatible object is installed so the same tools can still be listed and called.

Always on:
- `wholeshare_describe`, `wholeshare_navigate`, `wholeshare_query_data`, `wholeshare_show_data`, `wholeshare_open_report`, `wholeshare_open_group`, `wholeshare_find_suppliers`, `wholeshare_start_group_buy`, `wholeshare_snapshot`

AG Grid, registered by every grid on screen:
- `grid_list`, `grid_describe`, `grid_get_rows`, `grid_filter`, `grid_clear_filters`, `grid_sort`, `grid_group_by`, `grid_export_csv`

AG Studio Agent Framework, registered while Insights is open and removed when it closes. These are the tools from `api.getAiTools()`:
- `studio_view_schema`, `studio_view_report`, `studio_view_page`, `studio_view_widget`, `studio_execute_query`, `studio_create_expression`, `studio_add_widget`, `studio_position_widget`, `studio_remove_widget`, plus the page and widget filter tools

Nothing exposed here moves money. Verify with `node scripts/verify-webmcp-tools.js`.

## Choosing and constraining a model

`docs/assets/model-arena.md` compares models on the same 21 golden prompts. The model is the cheap part. The safety comes from the harness, so a different model keeps the same limits:
- the model only ever sees an allowlist of tools, and no tool moves money
- every write tool is behind a user permission the model cannot change
- arguments are checked on the server (a product must appear in the person's own words, schedule changes follow validation rules)
- web results are stored as unverified leads
- the golden prompt suite and `scripts/verify-harness.js` fail when a model drifts

Current choice: Fireworks `minimax-m3p1-flash` with `MOSAIC_EXTRA_BODY={"reasoning_effort":"none"}`. Local Qwen remains available by removing the three `MOSAIC_*` and `FIREWORKS_API_KEY` lines from `.env`.
