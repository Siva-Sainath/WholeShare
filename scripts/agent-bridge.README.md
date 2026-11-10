# Agent Bridge

A local, autonomous way for the paired Muse agent to run terminal commands
on this Mac. No cloud service, no tunnel, no third party account. Everything
runs on this Mac, and the transport is the Mac file system, which the agent
already reaches through the paired device.

## How it works

- The agent writes one JSON command per line to
  `.scratch/agent-bridge/commands.jsonl`.
- `scripts/agent-bridge.js` watches that file, runs the command here, and
  writes the result to `.scratch/agent-bridge/results/<id>.json`.
- The agent reads the result back with the device file tools.

## What it may run

Only an allowlist, inside this project folder only, with no shell:

- npm scripts: build, build:bryntum, test, test:unit, check, check:mocks,
  verify:zero-sim, lint, lint:features, doctor, seed, verify, verify:escrow,
  verify:paypal, verify:gateway, verify:fsm, verify:durable, verify:tokens,
  verify:one-shot, verify:full-harness, tools:list, eval:model,
  toolkit:test, agent:cycle.
- Local probes only: `http://localhost:3000/` and its API paths, and
  `http://127.0.0.1:8000/v1/models`.
- `start-server` runs `node src/web/server.js` in the background on
  port 3000. `stop-server` stops it. `status` reports bridge and server state.

It refuses anything else. No sudo, no rm, no extra arguments, no pipes,
no redirects, no reading or printing of `.env` or any secret. Output is
redacted for secret patterns. Every command is appended to
`.scratch/agent-bridge/log.jsonl`.

## Start it

By hand, once, from the project folder:

```
node scripts/agent-bridge.js
```

Or install it so it starts on its own at login (autonomous, local):

```
launchctl load ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
```

## Stop it

Any one of these:

```
touch .scratch/agent-bridge/STOP
launchctl unload ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
```

Or press Ctrl-C in the terminal running it. It also stops itself after
30 minutes with no commands. It never auto starts unless the LaunchAgent
above is installed, and it never runs unattended: the LaunchAgent starts
it at login, and it still stops after 30 minutes idle.

## Remove it

```
launchctl unload ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
rm ~/Library/LaunchAgents/com.wholeshare.agent-bridge.plist
rm scripts/agent-bridge.js scripts/agent-bridge.README.md
rm -rf .scratch/agent-bridge
```

## Security, stated plainly

This is a local remote code execution channel. Whoever can write the
command file can run the allowlisted commands as the macOS user, with
Full Disk Access. That is the point of it, and it is also the risk.
It is opt in per session, time boxed, fully logged, and stopped by the
owner when done. Do not leave it running when the work is finished.
