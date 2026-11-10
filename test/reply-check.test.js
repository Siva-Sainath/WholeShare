import test from "node:test";
import assert from "node:assert/strict";
import { findUnsupportedFigures, findUnsupportedNames } from "../src/lib/reply-check.js";

const evidence = [{ rows: [{ name: "Austin olive oil", fillPct: 90, currentUnits: 1350, targetUnits: 1500, unitPriceUsd: 10 }], total: 19 }];

test("accepts figures the tools returned", () => {
  assert.deepEqual(findUnsupportedFigures("Austin olive oil is 90% full, 1,350 of 1,500 units at $10.00.", evidence), []);
});

test("accepts simple arithmetic on returned figures", () => {
  assert.deepEqual(findUnsupportedFigures("It needs 150 more units and 50 units cost $500.", evidence, "price 50 units"), []);
});

test("accepts figures the user typed", () => {
  assert.deepEqual(findUnsupportedFigures("Pricing 30 units for you.", evidence, "quote 30 units"), []);
});

test("flags a figure no tool returned", () => {
  assert.deepEqual(findUnsupportedFigures("It is 97% full and costs $8.40.", evidence), ["97%", "$8.40"]);
});

test("ignores small counts and years", () => {
  assert.deepEqual(findUnsupportedFigures("Two groups match in 2026.", evidence), []);
});

test("accepts names that appear in the tool results", () => {
  assert.deepEqual(findUnsupportedNames("Austin Olive Oil is the cheaper pick.", [{ name: "Austin Cold-Pressed Extra Virgin olive oil" }]), []);
});

test("flags an invented supplier name", () => {
  assert.deepEqual(findUnsupportedNames("The supplier is Greenfield Harvest Cooperative.", [{ supplier: "OleoAndaluz Export Cooperativa" }]), ["Greenfield Harvest Cooperative"]);
});
