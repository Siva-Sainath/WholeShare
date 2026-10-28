import test from "node:test";
import assert from "node:assert/strict";
import { loadAllFeatures, generateFeatureMapPromptContext } from "../src/lib/feature-map.js";

test("loadAllFeatures loads and parses all cataloged feature maps", () => {
  const features = loadAllFeatures();
  assert.ok(features.length >= 11);

  const clanLobby = features.find(f => f.id === "clan-lobby");
  assert.ok(clanLobby);
  assert.equal(clanLobby.title, "Clash of Clans Syndicate Lobby");
  assert.ok(clanLobby.subFeatures.length > 0);
  assert.ok(clanLobby.userPov.includes("dashboard"));

  const a2aArena = features.find(f => f.id === "a2a-arena");
  assert.ok(a2aArena);
  assert.ok(a2aArena.title.includes("Negotiation Arena"));
});

test("generateFeatureMapPromptContext produces formatted context directory", () => {
  const context = generateFeatureMapPromptContext();
  assert.ok(context.includes("WHOLESHARE PLATFORM FEATURE MAP"));
  assert.ok(context.includes("Clash of Clans Syndicate Lobby"));
  assert.ok(context.includes("Real-Time A2A Negotiation Arena"));
  assert.ok(context.includes("AG Grid Live Syndicate & Escrow Ledger"));
  assert.ok(context.includes("Multiparty Escrow & PayPal Financial Lifecycle"));
});
