import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// The built-in New York demo market was renamed. Files kept on a persistent disk still hold the old ids and names,
// so they are rewritten once at boot. Running it again changes nothing.
const REPLACEMENTS = [
  ["clan-flushing-", "clan-nyc-"],
  ["sup-flushing-", "sup-nyc-"],
  ["Golden Lotus Kitchen", "Neon Dumpling Co."],
  ["Jade Garden Noodle Bar", "Tin Roof Taqueria"],
  ["Sweet Pearl Bubble Tea", "Cloud Nine Boba"],
  ["Flushing", "New York"]
];
const MAX_BYTES = 8 * 1024 * 1024;

function jsonFiles(dir, depth = 0) {
  if (!existsSync(dir) || depth > 2) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let stats;
    try { stats = statSync(path); } catch { continue; }
    if (stats.isDirectory()) out.push(...jsonFiles(path, depth + 1));
    else if (name.endsWith(".json") && stats.size <= MAX_BYTES) out.push(path);
  }
  return out;
}

export function migrateStoryNames(root = process.cwd()) {
  const targets = [resolve(root, ".scratch"), resolve(root, "data", "user_settings.json")];
  const files = targets.flatMap((target) => (target.endsWith(".json") ? (existsSync(target) ? [target] : []) : jsonFiles(target)));
  let changed = 0;
  for (const file of files) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    let next = text;
    for (const [from, to] of REPLACEMENTS) next = next.split(from).join(to);
    if (next !== text) {
      try { writeFileSync(file, next, "utf8"); changed += 1; } catch { /* left as it was */ }
    }
  }
  return changed;
}
