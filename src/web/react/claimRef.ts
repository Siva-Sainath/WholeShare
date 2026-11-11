// People see a short reference and plain words, never the internal ids and codes behind a claim.
export function claimRef(id: string): string {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `CLM-${1000 + (hash % 9000)}`;
}

const REASONS: Record<string, string> = {
  DAMAGED_TRANSIT: "Damaged in transit",
  MISSING_ITEMS: "Items missing",
  WRONG_ITEM: "Wrong item delivered",
  QUALITY_ISSUE: "Quality problem",
  LATE_DELIVERY: "Arrived late"
};

// A stored description can start with a code such as "DAMAGED_TRANSIT - ". Show it as a reason and keep the person's own words.
export function splitReason(description: string | undefined): { reason: string | null; text: string } {
  const match = String(description ?? "").match(/^([A-Z][A-Z_]+)\s+-\s+([\s\S]*)$/);
  if (!match) return { reason: null, text: String(description ?? "") };
  return { reason: REASONS[match[1]] ?? match[1].toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), text: match[2] };
}

// "clan-nyc-containers-eastern" becomes "Nyc containers eastern" only when no real name is known.
export function plainGroupName(name: string | undefined, id: string): string {
  if (name && name.trim()) return name;
  return id.replace(/^clan-/, "").replace(/-\d+$/, "").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}
