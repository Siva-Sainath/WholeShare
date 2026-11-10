import type { GridApi } from "ag-grid-community";
import { registerWebMcpTool } from "./webmcp";

// Any AG Grid on screen registers here. WebMCP tools then let an agent inspect and drive it the way a person would:
// read the visible rows, filter, sort, group, export. The agent works on the same grid the user is looking at.

interface Entry { id: string; title: string; api: GridApi; at: number }
const grids = new Map<string, Entry>();

export function registerGrid(id: string, title: string, api: GridApi): () => void {
  const entry: Entry = { id, title, api, at: Date.now() };
  grids.set(id, entry);
  return () => { if (grids.get(id) === entry) grids.delete(id); };
}

function pick(gridId?: unknown): Entry {
  const list = [...grids.values()];
  if (list.length === 0) throw new Error("No grid is on screen. Call wholeshare_show_data or open a screen with a table first.");
  if (gridId) {
    const found = grids.get(String(gridId));
    if (!found) throw new Error(`No grid '${gridId}'. On screen: ${list.map((entry) => entry.id).join(", ")}.`);
    return found;
  }
  return list.sort((a, b) => b.at - a.at)[0];
}

function columns(api: GridApi) {
  return (api.getColumns() ?? []).map((column) => {
    const def = column.getColDef();
    return { colId: column.getColId(), header: def.headerName ?? column.getColId(), sortable: def.sortable !== false, groupable: Boolean(def.enableRowGroup) };
  });
}

function displayedRows(api: GridApi, limit: number): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  api.forEachNodeAfterFilterAndSort((node) => { if (node.data && rows.length < limit) rows.push(node.data as Record<string, unknown>); });
  return rows;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const gridId = { type: "string", description: "Which grid. Defaults to the one opened most recently." };

export function installGridTools(): void {
  registerWebMcpTool({
    name: "grid_list",
    description: "List the AG Grid tables currently on screen.",
    inputSchema: obj({}),
    readOnly: true,
    execute: () => [...grids.values()].map((entry) => ({ id: entry.id, title: entry.title, rowsShown: entry.api.getDisplayedRowCount(), columns: columns(entry.api).length }))
  });
  registerWebMcpTool({
    name: "grid_describe",
    description: "Describe a grid: columns, active filters, sort and grouping.",
    inputSchema: obj({ gridId }),
    readOnly: true,
    execute: (args) => {
      const { api, id, title } = pick(args.gridId);
      const state = api.getColumnState();
      return { id, title, rowsShown: api.getDisplayedRowCount(), columns: columns(api), filters: api.getFilterModel(), sort: state.filter((s) => s.sort).map((s) => ({ column: s.colId, direction: s.sort })), groupedBy: state.filter((s) => s.rowGroup).map((s) => s.colId) };
    }
  });
  registerWebMcpTool({
    name: "grid_get_rows",
    description: "Read the rows the user currently sees, after filters and sort.",
    inputSchema: obj({ gridId, limit: { type: "number", description: "Up to 100." } }),
    readOnly: true,
    execute: (args) => {
      const { api } = pick(args.gridId);
      return { rows: displayedRows(api, Math.min(Number(args.limit) || 25, 100)), totalShown: api.getDisplayedRowCount() };
    }
  });
  registerWebMcpTool({
    name: "grid_filter",
    description: "Filter a grid column. Text columns: contains, equals, startsWith. Number columns: equals, greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual.",
    inputSchema: obj({ gridId, column: { type: "string" }, operator: { type: "string" }, value: {} }, ["column", "value"]),
    execute: (args) => {
      const { api } = pick(args.gridId);
      const column = String(args.column);
      const target = api.getColumns()?.find((entry) => entry.getColId() === column);
      if (!target) throw new Error(`No column '${column}'. Call grid_describe for the column ids.`);
      const operator = String(args.operator || "contains");
      const wanted = args.value;
      const all: unknown[] = [];
      api.forEachNode((node) => { if (node.data) all.push((node.data as Record<string, unknown>)[column]); });
      const numeric = all.some((value) => typeof value === "number");
      const test = (value: unknown): boolean => {
        if (numeric) {
          const left = Number(value); const right = Number(wanted);
          return operator === "greaterThan" ? left > right : operator === "lessThan" ? left < right : operator === "greaterThanOrEqual" ? left >= right : operator === "lessThanOrEqual" ? left <= right : left === right;
        }
        const left = String(value ?? "").toLowerCase(); const right = String(wanted).toLowerCase();
        return operator === "equals" ? left === right : operator === "startsWith" ? left.startsWith(right) : left.includes(right);
      };
      const filterKind = String(target.getColDef().filter ?? "");
      const isSet = filterKind === "true" || filterKind === "agSetColumnFilter";
      const model = isSet
        ? { filterType: "set", values: [...new Set(all.filter(test).map((value) => (value === null || value === undefined ? null : String(value))))] }
        : numeric
          ? { filterType: "number", type: operator, filter: Number(wanted) }
          : { filterType: "text", type: operator, filter: String(wanted) };
      api.setFilterModel({ ...api.getFilterModel(), [column]: model });
      return { rowsShown: api.getDisplayedRowCount(), filters: api.getFilterModel() };
    }
  });
  registerWebMcpTool({
    name: "grid_clear_filters",
    description: "Remove every filter from a grid.",
    inputSchema: obj({ gridId }),
    execute: (args) => { const { api } = pick(args.gridId); api.setFilterModel(null); return { rowsShown: api.getDisplayedRowCount() }; }
  });
  registerWebMcpTool({
    name: "grid_sort",
    description: "Sort a grid by one column.",
    inputSchema: obj({ gridId, column: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } }, ["column"]),
    execute: (args) => {
      const { api } = pick(args.gridId);
      api.applyColumnState({ state: [{ colId: String(args.column), sort: args.direction === "desc" ? "desc" : "asc" }], defaultState: { sort: null } });
      return { first: displayedRows(api, 3) };
    }
  });
  registerWebMcpTool({
    name: "grid_group_by",
    description: "Group a grid by one or more columns. Pass an empty list to ungroup. Uses AG Grid row grouping.",
    inputSchema: obj({ gridId, columns: { type: "array", items: { type: "string" } } }, ["columns"]),
    execute: (args) => {
      const { api } = pick(args.gridId);
      const ids = (Array.isArray(args.columns) ? args.columns : []).map(String);
      api.setRowGroupColumns(ids);
      return { groupedBy: ids, rowsShown: api.getDisplayedRowCount() };
    }
  });
  registerWebMcpTool({
    name: "grid_export_csv",
    description: "Export what the grid shows as CSV. Returns the text and also saves it for the user.",
    inputSchema: obj({ gridId }),
    execute: (args) => {
      const { api, id } = pick(args.gridId);
      const csv = api.getDataAsCsv() ?? "";
      api.exportDataAsCsv({ fileName: `${id}.csv` });
      return { rows: Math.max(csv.split("\n").length - 1, 0), csv: csv.slice(0, 4000) };
    }
  });
}
