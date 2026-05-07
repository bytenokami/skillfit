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
  assert.equal(p.proposedSkillName, "sample-repo");
  assert.ok(p.description.length > 0);
  assert.ok(p.description.length < 1000);
  assert.ok(p.bodyDraft.includes("# sample-repo"));
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
  assert.equal(parsed.proposedSkillName, "sample-repo");
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

test("renderMarkdown includes recommendations block + rollback column", async () => {
  const p = await runScan(SAMPLE);
  const { renderMarkdown } = await import("../src/report.js");
  const md = renderMarkdown(p);
  assert.ok(md.includes("## Recommendations"));
  assert.ok(md.includes("## Instruction topology"));
  assert.ok(md.includes("rollback"), "Recommendations table must include rollback column");
});

test("topology skip rec requires symlinks to resolve to canonical agent_rules.md", async () => {
  const { mkdtempSync, rmSync, writeFileSync, symlinkSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-bad-symlink-"));
  try {
    mkdirSync(path.join(dir, "decoy"));
    writeFileSync(path.join(dir, "agent_rules.md"), "# real rules\n- one\n");
    writeFileSync(path.join(dir, "decoy", "other.md"), "# decoy\n- two\n");
    symlinkSync("decoy/other.md", path.join(dir, "AGENTS.md"));
    symlinkSync("decoy/other.md", path.join(dir, "CLAUDE.md"));

    const p = await runScan(dir);
    const skipRec = p.recommendations.find((r) => r.id === "local/shared-agent-rules" && r.action === "skip");
    const blockedRec = p.recommendations.find((r) => r.id === "local/shared-agent-rules" && r.action === "blocked");
    assert.equal(skipRec, undefined, "must NOT skip when symlinks point to wrong target");
    assert.ok(blockedRec, "must block when symlinks resolve away from canonical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content-dup distinct from symlink-dup (issue #1)", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-content-dup-"));
  try {
    const content = "# rules\n- one\n- two\n- three\n";
    writeFileSync(path.join(dir, "CLAUDE.md"), content);
    writeFileSync(path.join(dir, "AGENTS.md"), content);

    const p = await runScan(dir);
    const claude = p.inputs.find((i) => i.path === "CLAUDE.md");
    const agents = p.inputs.find((i) => i.path === "AGENTS.md");
    assert.ok(claude && agents);

    const dups = p.inputs.filter((i) => i.status === "content-dup" || i.status === "symlink-dup");
    assert.equal(dups.length, 1, "exactly one of the pair should be flagged duplicate");
    assert.equal(dups[0]!.status, "content-dup", "regular-file dup must be content-dup, not symlink-dup");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("body cap noise flag fires on oversized rule input (issue #2)", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-oversize-"));
  try {
    const big = Array.from({ length: 800 }, (_, i) => `- rule line ${i} with enough text to consume tokens consistently`).join("\n");
    writeFileSync(path.join(dir, "CLAUDE.md"), `# rules\n${big}\n`);

    const p = await runScan(dir);
    const truncatedNoise = p.noise.find((n) => n.reason.includes("token cap"));
    assert.ok(truncatedNoise, `expected truncation noise flag; got ${JSON.stringify(p.noise)}`);
    assert.ok(p.bodyDraft.includes("[truncated"), "body should carry truncation marker");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Go v2 sub-package classified as v2, not v1 (issue #5)", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-go-v2-"));
  try {
    writeFileSync(
      path.join(dir, "go.mod"),
      `module example.com/test\n\ngo 1.22\n\nrequire (\n\tgithub.com/aws/aws-sdk-go-v2/service/s3 v1.0.0\n\tgithub.com/aws/aws-sdk-go-v2/config v1.0.0\n)\n`,
    );

    const p = await runScan(dir);
    const ids = p.candidates.map((c) => c.id);
    assert.ok(ids.includes("go-aws-sdk-v2"), `expected go-aws-sdk-v2; got ${ids.join(", ")}`);
    assert.ok(!ids.includes("go-aws-sdk-v1"), `must not classify v2 sub-pkg as v1`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nested AGENTS.md does not break root unification check (issue #4)", async () => {
  const { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-nested-"));
  try {
    writeFileSync(path.join(dir, "agent_rules.md"), "# canonical\n- one\n- two\n- three\n");
    symlinkSync("agent_rules.md", path.join(dir, "AGENTS.md"));
    symlinkSync("agent_rules.md", path.join(dir, "CLAUDE.md"));

    mkdirSync(path.join(dir, "subproj"));
    writeFileSync(path.join(dir, "subproj", "AGENTS.md"), "# subproject\n- a\n- b\n");

    const p = await runScan(dir);
    const skipRec = p.recommendations.find((r) => r.id === "local/shared-agent-rules" && r.action === "skip");
    assert.ok(skipRec, `nested rule file must not block root unification; got recs: ${JSON.stringify(p.recommendations.map((r) => `${r.action}/${r.id}`))}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --version reports package.json version (no drift)", async () => {
  const { execFileSync } = await import("node:child_process");
  const cliPath = path.resolve(__dirname, "..", "dist", "cli.js");
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const fs = await import("node:fs");
  if (!fs.existsSync(cliPath)) return;
  const pkgVersion = (JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string }).version;
  const out = execFileSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" }).trim();
  assert.equal(out, pkgVersion, `CLI version (${out}) must match package.json (${pkgVersion})`);
});
