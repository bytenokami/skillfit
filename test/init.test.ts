import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE = path.resolve(__dirname, "fixtures", "sample-repo");

test("runInit on sample repo writes lockfile and skill files", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-init-"));
  cpSync(SAMPLE, dir, { recursive: true });
  try {
    const result = await runInit({ repoRoot: dir, yes: true });
    assert.ok(result.lock.skills.length > 0, "lock should have skills");
    assert.ok(existsSync(path.join(dir, "skillfit-lock.json")));
    assert.ok(existsSync(path.join(dir, ".claude", "skills")));

    const reactSkill = result.lock.skills.find((s) => s.id === "react");
    assert.ok(reactSkill, "react skill should be in lock (used in code)");

    const tailwind = result.lock.dropped.find((d) => d.id === "tailwind");
    assert.ok(tailwind, "tailwind should be dropped (declared but unused)");

    assert.equal(result.pendingApproval, 1, "repo-rules should require approval on first run");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
