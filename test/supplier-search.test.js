import test from "node:test";
import assert from "node:assert/strict";
import { searchDirectory, supplierRows, loadDirectory } from "../src/lib/supplier-search.js";
import { SOURCES, resolveSourceId } from "../src/lib/data-sources.js";

test("every directory supplier is labelled simulated", () => {
  const directory = loadDirectory();
  assert.ok(directory.length > 200);
  assert.ok(directory.every((supplier) => supplier.source === "simulated"));
});

test("the directory covers Indian suppliers and fasteners", () => {
  const indian = loadDirectory().filter((supplier) => supplier.countryCode === "IN");
  assert.ok(indian.length >= 50);
  const hits = searchDirectory({ product: "hex bolt zinc", country: "India" });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.countryCode === "IN"));
});

test("plural search words match singular product names", () => {
  const hits = searchDirectory({ product: "hex bolts" });
  assert.ok(hits.length > 0);
});

test("suppliers is a data source with simulated rows labelled", () => {
  assert.equal(resolveSourceId("vendors"), "suppliers");
  assert.ok(SOURCES.suppliers);
  assert.ok(supplierRows().every((row) => row.source === "simulated" || row.source.startsWith("web lead")));
});
