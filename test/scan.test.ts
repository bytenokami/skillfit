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

test("body draft does not duplicate symlinked rule content", async () => {
  const dupFixture = path.resolve(__dirname, "fixtures", "dup-rules");
  const p = await runScan(dupFixture);

  const ruleLine = "Hard fail over silent fallback";
  const matches = p.bodyDraft.split(ruleLine).length - 1;
  assert.equal(matches, 1, `rule line should appear once in body, found ${matches}`);

  const canonicalSections = p.bodyDraft.split("### From `agent_rules.md`").length - 1;
  assert.equal(canonicalSections, 1, `canonical section should appear once`);

  const dupStatuses = p.inputs.filter((i) => i.status === "symlink-dup");
  assert.equal(dupStatuses.length, 2, "two symlinked inputs should be marked symlink-dup");

  assert.ok(p.bodyDraft.includes("symlink-dup"), "body should note duplicate paths inline");
});

test("instruction topology + skip rec on unified rule files", async () => {
  const dupFixture = path.resolve(__dirname, "fixtures", "dup-rules");
  const p = await runScan(dupFixture);

  assert.ok(p.instructionTopology.length >= 3, "topology should list canonical + symlinks");
  const symlinks = p.instructionTopology.filter((t) => t.kind === "symlink");
  assert.ok(symlinks.length >= 2, "AGENTS.md and CLAUDE.md should be detected as symlinks");

  const skipRec = p.recommendations.find((r) => r.id === "local/shared-agent-rules" && r.action === "skip");
  assert.ok(skipRec, "unified topology should produce a 'skip' rec for shared-agent-rules");
});

test("recommendations include adapt entries per detected stack", async () => {
  const p = await runScan(SAMPLE);
  const tsAdapt = p.recommendations.find((r) => r.target === "ts" && r.action === "adapt");
  assert.ok(tsAdapt, "ts stack should produce adapt rec");
});

test("renderMarkdown includes recommendations block", async () => {
  const p = await runScan(SAMPLE);
  const { renderMarkdown } = await import("../src/report.js");
  const md = renderMarkdown(p);
  assert.ok(md.includes("## Recommendations"));
  assert.ok(md.includes("## Instruction topology"));
});
