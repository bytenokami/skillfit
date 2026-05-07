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
    assert.ok(body.startsWith("---\nname: sample-repo\n"));
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
    assert.ok(result.skillFile.endsWith(path.join("sample-repo", "SKILL.md")));
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
  assert.ok(name.includes("sample-repo"));
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
    assert.equal(sidecar.skillName, "sample-repo");
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

test("install detects on-disk drift (file edited locally) — issue #1", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-drift-"));
  try {
    const proposal = await runScan(SAMPLE);
    const first = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(first.status, "installed");

    const tampered = readFileSync(first.skillFile, "utf8") + "\n## sneaky local edit\n- ignore this\n";
    writeFileSync(first.skillFile, tampered);

    const blocked = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(blocked.status, "blocked-drift");

    const forced = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: true, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(forced.status, "updated");

    const recovered = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    assert.equal(recovered.status, "unchanged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install leaves no .tmp- artifacts on success — issue #2", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-tmp-"));
  try {
    const proposal = await runScan(SAMPLE);
    await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    const fs = await import("node:fs");
    const dirEntries = fs.readdirSync(path.join(root, proposal.proposedSkillName));
    const tmpEntries = dirEntries.filter((e) => e.includes(".tmp-"));
    assert.equal(tmpEntries.length, 0, `expected no tmp artifacts; got ${tmpEntries.join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("YAML frontmatter is robust to nasty repo names (issue #3)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skillfit-yaml-"));
  const fs = await import("node:fs");
  try {
    const nasty = path.join(dir, "weird: ---\n#name");
    fs.mkdirSync(nasty);
    fs.writeFileSync(path.join(nasty, "CLAUDE.md"), "# rules\n- one\n- two\n- three\n");

    const proposal = await runScan(nasty);
    const installRoot = mkdtempSync(path.join(tmpdir(), "skillfit-yaml-out-"));
    try {
      const result = await installClaude({ proposal, workspace: nasty, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: installRoot });
      assert.equal(result.status, "installed");
      const body = readFileSync(result.skillFile, "utf8");
      const lines = body.split("\n");
      const fmEnd = lines.indexOf("---", 1);
      assert.ok(fmEnd > 0, "frontmatter must be terminated by a single --- line, not corrupted by injected content");
      const fmText = lines.slice(0, fmEnd + 1).join("\n");
      assert.ok(!fmText.includes("\n---\n---"), "no double --- breaks");
    } finally {
      rmSync(installRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("symlink-escape on installRoot returns blocked-symlink-escape result (issue #5)", async () => {
  const fs = await import("node:fs");
  const fsp = await import("node:fs/promises");
  const victim = mkdtempSync(path.join(tmpdir(), "skillfit-victim-"));
  const fakeWorkspace = mkdtempSync(path.join(tmpdir(), "skillfit-workspace-"));
  try {
    fs.mkdirSync(path.join(fakeWorkspace, ".claude"));
    fs.symlinkSync(victim, path.join(fakeWorkspace, ".claude", "skills"));
    fs.writeFileSync(path.join(fakeWorkspace, "package.json"), JSON.stringify({
      name: "fake", version: "1.0.0", dependencies: { react: "^18" },
    }));

    const proposal = await runScan(fakeWorkspace);
    const result = await installClaude({
      proposal,
      workspace: fakeWorkspace,
      scope: "project",
      force: false,
      installerVersion: "0.4.0-test",
      rootOverride: null,
    });

    assert.equal(result.status, "blocked-symlink-escape", `expected blocked-symlink-escape; got ${result.status} (${result.reason ?? ""})`);

    const victimEntries = fs.readdirSync(victim);
    assert.equal(victimEntries.length, 0, `victim dir must remain empty (mkdir-before-check would create files); got ${victimEntries.join(",")}`);
  } finally {
    rmSync(victim, { recursive: true, force: true });
    rmSync(fakeWorkspace, { recursive: true, force: true });
  }
});

test("Claude project install accepts workspace outside $HOME (issue #3)", async () => {
  const fs = await import("node:fs");
  const fsp = await import("node:fs/promises");
  const repoOutsideHome = mkdtempSync(path.join(tmpdir(), "skillfit-outside-home-"));
  try {
    fs.writeFileSync(path.join(repoOutsideHome, "package.json"), JSON.stringify({
      name: "outside", version: "1.0.0", dependencies: { react: "^18" },
    }));

    const proposal = await runScan(repoOutsideHome);
    const result = await installClaude({
      proposal,
      workspace: repoOutsideHome,
      scope: "project",
      force: false,
      installerVersion: "0.4.0-test",
      rootOverride: null,
    });
    assert.equal(result.status, "installed", `project install outside $HOME must succeed; got ${result.status} (${result.reason ?? ""})`);
    const realRepo = await fsp.realpath(repoOutsideHome);
    const realSkill = await fsp.realpath(result.skillFile);
    assert.ok(realSkill.startsWith(realRepo), `skillFile must land under workspace, got ${realSkill} not under ${realRepo}`);
  } finally {
    rmSync(repoOutsideHome, { recursive: true, force: true });
  }
});

test("sidecar contains bodyHash distinct from proposalHash", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-bodyhash-"));
  try {
    const proposal = await runScan(SAMPLE);
    const result = await installClaude({ proposal, workspace: SAMPLE, scope: "project", force: false, installerVersion: "0.4.0-test", rootOverride: root });
    const sidecar = JSON.parse(readFileSync(result.sidecarFile, "utf8"));
    assert.ok(sidecar.bodyHash, "sidecar must record bodyHash");
    assert.ok(sidecar.bodyHash.startsWith("sha256:"));
    assert.notEqual(sidecar.bodyHash, sidecar.proposalHash, "bodyHash and proposalHash hash different things");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registry installToTarget treats both targets identically (only paths/notes differ)", async () => {
  const { TARGETS, installToTarget } = await import("../src/install/targets.js");
  const root = mkdtempSync(path.join(tmpdir(), "skillfit-registry-"));
  try {
    const proposal = await runScan(SAMPLE);

    const claudeResult = await installToTarget({
      targetId: "claude", proposal, workspace: SAMPLE, scope: "project", force: false,
      installerVersion: "0.4.0-test", rootOverride: path.join(root, "claude-out"),
    });
    const codexResult = await installToTarget({
      targetId: "codex", proposal, workspace: SAMPLE, scope: "user", force: false,
      installerVersion: "0.4.0-test", rootOverride: path.join(root, "codex-out"),
    });

    assert.equal(claudeResult.status, "installed");
    assert.equal(codexResult.status, "installed");
    assert.equal(TARGETS.claude.supportsProjectScope, true);
    assert.equal(TARGETS.codex.supportsProjectScope, false);
    assert.ok(TARGETS.codex.postInstallNote);
    assert.equal(TARGETS.claude.postInstallNote, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
