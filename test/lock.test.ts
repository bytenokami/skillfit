import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  emptyLock,
  readLock,
  writeLock,
  upsertSkill,
  findSkill,
} from "../src/lock.js";

test("lockfile round-trips", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-lock-"));
  try {
    const lockPath = path.join(dir, "skillfit-lock.json");
    const lock = emptyLock("0.x");
    upsertSkill(lock, {
      id: "react",
      origin: "verified",
      source: "autoskills",
      hash: "sha256:abc",
    });
    await writeLock(lock, lockPath);

    const loaded = await readLock(lockPath);
    assert.ok(loaded);
    assert.equal(loaded.skills.length, 1);
    assert.equal(findSkill(loaded, "react")?.id, "react");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upsertSkill replaces by id", () => {
  const lock = emptyLock("0.x");
  upsertSkill(lock, { id: "react", origin: "verified", source: "autoskills", hash: "sha256:1" });
  upsertSkill(lock, { id: "react", origin: "verified", source: "autoskills", hash: "sha256:2" });
  assert.equal(lock.skills.length, 1);
  assert.equal(findSkill(lock, "react")?.hash, "sha256:2");
});

test("readLock returns null when file missing", async () => {
  const result = await readLock("/tmp/skillfit-nonexistent-" + Date.now() + ".json");
  assert.equal(result, null);
});
