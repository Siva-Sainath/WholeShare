import test from "node:test";
import assert from "node:assert/strict";
import { listSources, querySource } from "../src/lib/data-sources.js";

test("lists the named sources", () => {
  const ids = listSources().map((source) => source.id);
  for (const id of ["groups", "members", "ledger", "claims", "shipments", "paypal_invoices"]) assert.ok(ids.includes(id));
});

test("filters, sorts and limits plain rows", async () => {
  const austin = await querySource("groups", { filter: [{ field: "city", value: "Austin" }], sort: { field: "fillPct", direction: "desc" }, limit: 3 });
  assert.equal(austin.count, 3);
  assert.ok(austin.total >= 3);
  assert.ok(austin.rows.every((row) => row.city === "Austin"));
  assert.ok(austin.rows[0].fillPct >= austin.rows[1].fillPct);
});

test("computes the current tier price", async () => {
  const result = await querySource("groups", { filter: [{ field: "id", value: "clan-austin-specialty-grade-002" }] });
  const row = result.rows[0];
  assert.equal(row.listPriceUsd, 9.5);
  assert.equal(row.tierDiscountPct, 22);
  assert.equal(row.unitPriceUsd, 7.41);
});

test("rejects unknown sources and bad filters", async () => {
  await assert.rejects(() => querySource("nope"), /Unknown data source/);
  await assert.rejects(() => querySource("groups", { filter: [{ field: "city", op: "wat", value: "x" }] }), /Bad filter/);
});
