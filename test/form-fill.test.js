import test from "node:test";
import assert from "node:assert/strict";
import { FORMS } from "../src/lib/form-fill.js";

test("each form declares required fields that exist", () => {
  for (const [name, form] of Object.entries(FORMS)) {
    for (const key of form.required) assert.ok(key in form.fields, `${name} requires unknown field ${key}`);
  }
});

test("create-group has the supplier mode choices the modal uses", () => {
  assert.deepEqual(FORMS["create-group"].fields.supplierMode.values, ["VOTE", "URL", "KERNEL"]);
});
