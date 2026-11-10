import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// A person's own Studio reports, kept on the server so they survive a browser change.
const FILE = () => resolve(process.cwd(), ".scratch", "studio-state.json");

export function loadStudioState() {
  try {
    return existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), "utf8")) : null;
  } catch {
    return null;
  }
}

export function saveStudioState(state) {
  if (state == null) {
    if (existsSync(FILE())) rmSync(FILE());
    return;
  }
  if (typeof state !== "object" || !Array.isArray(state.pages)) throw new Error("That is not a Studio report.");
  mkdirSync(dirname(FILE()), { recursive: true });
  writeFileSync(FILE(), JSON.stringify(state), "utf8");
}
