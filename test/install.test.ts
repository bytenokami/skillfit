import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScan } from "../src/scan.js";
import { installClaude, resolveClaudeRoot } from "../src/install/claude.js";
import { installCodex, resolveCodexRoot } from "../src/install/codex.js";
import { proposalHash, buildSkillBody, SIDECAR_FILENAME } from "../src/install/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE = path.resolve(__dirname, "fixtures", "sample-repo");

test("install claude writes SKILL.md + sidecar in target dir", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-claude-"));
  try {
    const proposal = await runScan(SAMPLE);
    const result = await installClaude({
      proposal,
      workspace: SAMPLE,
      scope: "project",
      force: false,
      installerVersion: "0.4.0-test",
      rootOverride: root,
    });
    assert.equal(result.status, "installed");
    assert.equal(result.target, "claude");
    assert.ok(existsSync(result.skillFile));
    assert.ok(existsSync(result.sidecarFile));

    const body = readFileSync(result.skillFile, "utf8");
    assert.ok(body.startsWith("---\nname: livly-sample-repo\n"));
    assert.ok(body.includes("description:"));
    assert.ok(body.includes("metadata:"));
    assert.ok(body.includes("source: skillfit"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install codex writes SKILL.md + sidecar (same shape, different default root)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-codex-"));
  try {
    const proposal = await runScan(SAMPLE);
    const result = await installCodex({
      proposal,
      force: false,
      installerVersion: "0.4.0-test",
      rootOverride: root,
    });
    assert.equal(result.status, "installed");
    assert.equal(result.target, "codex");
    assert.ok(existsSync(result.skillFile));
    assert.ok(result.skillFile.endsWith(path.join("livly-sample-repo", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-running install with same proposal is unchanged (idempotent)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-idem-"));
  try {
    const proposal = await runScan(SAMPLE);
    const first = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    const second = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(first.status, "installed");
    assert.equal(second.status, "unchanged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install blocks on foreign file without --force", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-foreign-"));
  try {
    const proposal = await runScan(SAMPLE);
    const skillDir = path.join(root, proposal.proposedSkillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), "# pre-existing user-authored skill\n");

    const blocked = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(blocked.status, "blocked-foreign");

    const forced = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: true, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(forced.status, "updated");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install blocks on hash conflict when proposal changes (without --force)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-conflict-"));
  try {
    const proposal = await runScan(SAMPLE);
    await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });

    const tampered = { ...proposal, description: proposal.description + " (mutated for test)" };
    const blocked = await installClaude({ proposal: tampered, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(blocked.status, "blocked-conflict");

    const forced = await installClaude({ proposal: tampered, workspace: SAMPLE, scope: "project", force: true, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(forced.status, "updated");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proposalHash is deterministic + sensitive to candidate changes", async () => {
  const proposal = await runScan(SAMPLE);
  const a = proposalHash(proposal);
  const b = proposalHash(proposal);
  assert.equal(a, b);

  const mutated = { ...proposal, candidates: [...proposal.candidates, { id: "x-new", evidence: "test", stack: "ts" as const }] };
  const c = proposalHash(mutated);
  assert.notEqual(a, c);
});

test("buildSkillBody YAML frontmatter is well-formed (parseable name + description)", async () => {
  const proposal = await runScan(SAMPLE);
  const body = buildSkillBody(proposal);
  const fm = body.match(/^---\n([\s\S]+?)\n---/);
  assert.ok(fm, "frontmatter block must exist");
  const lines = fm![1]!.split("\n");
  const name = lines.find((l) => l.startsWith("name:"));
  assert.ok(name);
  assert.ok(name.includes("livly-sample-repo"));
  const desc = lines.find((l) => l.startsWith("description:"));
  assert.ok(desc);
});

test("sidecar contains version, hash, name, workspace", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-sidecar-"));
  try {
    const proposal = await runScan(SAMPLE);
    const result = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    const sidecar = JSON.parse(readFileSync(result.sidecarFile, "utf8"));
    assert.equal(sidecar.version, 1);
    assert.equal(sidecar.skillName, "livly-sample-repo");
    assert.ok(sidecar.proposalHash.startsWith("sha256:"));
    assert.ok(sidecar.installedBy.startsWith("skillfit@"));
    assert.equal(typeof sidecar.installedAt, "string");
    assert.equal(typeof sidecar.workspace, "string");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default Claude root resolves to .claude/skills/ in workspace (project scope)", () => {
  const root = resolveClaudeRoot({ workspace: "/tmp/some-repo", scope: "project" });
  assert.equal(root, path.join("/tmp/some-repo", ".claude", "skills"));
});

test("default Codex root resolves to ~/.agents/skills/", () => {
  const root = resolveCodexRoot({});
  assert.ok(root.endsWith(path.join(".agents", "skills")), `unexpected codex root: ${root}`);
});

test("sidecar filename is .skillfit.lock.json", () => {
  assert.equal(SIDECAR_FILENAME, ".skillfit.lock.json");
});
