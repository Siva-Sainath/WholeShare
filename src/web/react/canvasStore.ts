// The canvas is the dock beside the page where Mosaic puts what it found.
export type ArtifactKind = "grid" | "groups" | "invoices" | "research" | "timeline" | "board";

export interface Artifact {
  kind: ArtifactKind;
  title: string;
  source?: string;
  filter?: Array<{ field: string; op?: string; value: unknown }>;
  sort?: { field: string; direction?: string } | null;
  limit?: number;
  note?: string;
  count?: number;
  total?: number;
  // research artifacts
  url?: string;
  query?: string;
  snippets?: string[];
  fetchedAt?: string;
}

interface CanvasState {
  artifact: Artifact | null;
  openedAt: number;
}

let state: CanvasState = { artifact: null, openedAt: 0 };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function presentArtifact(artifact: Artifact): void {
  state = { artifact, openedAt: Date.now() };
  emit();
}

export function closeCanvas(): void {
  state = { artifact: null, openedAt: state.openedAt };
  emit();
}

export function getCanvas(): CanvasState {
  return state;
}

export function subscribeCanvas(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.kind === "string" && ["grid", "groups", "invoices", "research", "timeline", "board"].includes(record.kind) && typeof record.title === "string";
}
