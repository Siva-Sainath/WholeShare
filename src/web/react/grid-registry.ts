import type { GridApi } from "ag-grid-community";

declare global {
  interface Window {
    __wholeshareGrids?: Record<string, GridApi>;
  }
}

export type GridName = "ledger" | "discoverMembers" | "discoverTiers" | "discoverComparable" | "discoverActivity";

export function registerGrid(name: GridName, api: GridApi): void {
  window.__wholeshareGrids = { ...window.__wholeshareGrids, [name]: api };
}

export function unregisterGrid(name: GridName, api: GridApi): void {
  const grids = window.__wholeshareGrids;
  if (grids && grids[name] === api) {
    const { [name]: _removed, ...rest } = grids;
    window.__wholeshareGrids = rest;
  }
}

export function getGrid(name: GridName): GridApi | undefined {
  return window.__wholeshareGrids?.[name];
}
