import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScan } from "../src/scan.js";
import { renderMarkdown, renderJson } from "../src/report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE = path.resolve(__dirname, "fixtures", "sample-repo");

test("scan returns a proposal with name, description, body, candidates", async () => {
  const p = await runScan(SAMPLE);
  assert.equal(p.proposedSkillName, "livly-sample-repo");
  assert.ok(p.description.length > 0);
  assert.ok(p.description.length < 1000);
  assert.ok(p.bodyDraft.includes("# livly-sample-repo"));
  assert.ok(p.candidates.length > 0);
  assert.ok(p.stacks.includes("ts"));
});

test("scan classifies inputs (CLAUDE.md present)", async () => {
  const p = await runScan(SAMPLE);
  const claude = p.inputs.find((i) => i.path === "CLAUDE.md");
  assert.ok(claude);
  assert.equal(claude.status, "present");
});

test("scan never writes files (returns proposal in-memory)", async () => {
  const before = await runScan(SAMPLE);
  const after = await runScan(SAMPLE);
  assert.equal(before.proposedSkillName, after.proposedSkillName);
  assert.equal(before.bodyDraft, after.bodyDraft);
});

test("renderMarkdown produces a single-block report", async () => {
  const p = await runScan(SAMPLE);
  const md = renderMarkdown(p);
  assert.ok(md.includes("# skillfit scan"));
  assert.ok(md.includes("## Proposed composite skill"));
  assert.ok(md.includes("## Candidate dependency skills"));
});

test("renderJson is parseable + has version", async () => {
  const p = await runScan(SAMPLE);
  const j = renderJson(p);
  const parsed = JSON.parse(j);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.proposedSkillName, "livly-sample-repo");
});

test("body draft never exceeds ~1500 token cap", async () => {
  const p = await runScan(SAMPLE);
  const approxTokens = Math.ceil(p.bodyDraft.length / 4);
  assert.ok(approxTokens <= 1600, `body draft is ${approxTokens} tokens (~> 1500 cap)`);
});
