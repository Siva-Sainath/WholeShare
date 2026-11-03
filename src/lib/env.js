import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let envLoaded = false;

export function loadProjectEnv() {
  if (envLoaded) return;
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    envLoaded = true;
    return;
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error(`Warning: Failed to load .env file from ${envPath}: ${err.message}`);
  }
  envLoaded = true;
}

export function getRequiredHmacSecret() {
  loadProjectEnv();
  const secret = process.env.SYNDICATE_HMAC_SECRET || process.env.WHOSHARE_GATEWAY_SECRET || process.env.WHOSHARE_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing required SYNDICATE_HMAC_SECRET in environment.");
  }
  return secret;
}

loadProjectEnv();
