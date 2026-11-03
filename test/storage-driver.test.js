import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { storageDriver } from "../src/lib/storage-driver.js";

test("storageDriver reports healthy POSIX or JuiceFS environment", () => {
  const diag = storageDriver.getDiagnostics();
  assert.ok(diag.driver === "juicefs" || diag.driver === "local_posix");
  assert.ok(existsSync(diag.lakeDir));
  assert.ok(existsSync(diag.memoryDir));
  assert.equal(diag.atomicRenameSupported, true);
  assert.equal(diag.posixLocksSupported, true);
});

test("storageDriver maps lakehouse partitions and memory paths accurately", () => {
  const bronzePath = storageDriver.getLakePath("bronze", "inv_test.json");
  assert.ok(bronzePath.includes("lake/bronze/inv_test.json"));

  const memoryPath = storageDriver.getMemoryEntityPath("buyer_austin_bakery");
  assert.ok(memoryPath.includes("memory/entities/buyer_austin_bakery.md"));
});

test("storageDriver executes atomic writes with immediate file consistency", () => {
  const testFile = resolve(process.cwd(), "data/lake/bronze", `test_atomic_${Date.now()}.json`);
  const payload = JSON.stringify({ test: "atomic_write_verified", integerCents: 10000 });

  storageDriver.writeAtomic(testFile, payload);
  assert.ok(existsSync(testFile));

  const readBack = storageDriver.readSafe(testFile);
  assert.equal(readBack, payload);

  // Clean up test file
  unlinkSync(testFile);
  assert.equal(existsSync(testFile), false);
});

