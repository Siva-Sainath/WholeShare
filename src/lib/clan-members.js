import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let cache = null;

export function getGeneratedMembers(clanId) {
  if (!cache) {
    const file = resolve(process.cwd(), "data/generated/clan-members.json");
    cache = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  return (cache[clanId] ?? []).map((member) => ({
    ...member,
    authorizedUsd: (member.authorizedCents / 100).toFixed(2)
  }));
}
