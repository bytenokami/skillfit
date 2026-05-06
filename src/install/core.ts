import { mkdir, readFile, writeFile, rename, unlink, stat, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256 } from "../util/hash.js";
import type { CompositeProposal } from "../scan.js";

export const SIDECAR_FILENAME = ".skillfit.lock.json";
export const SIDECAR_VERSION = 1;

export interface SidecarRecord {
  version: number;
  installedBy: string;
  installedAt: string;
  proposalHash: string;
  bodyHash: string;
  skillName: string;
  workspace: string;
}

export type InstallStatus =
  | "installed"
  | "updated"
  | "unchanged"
  | "blocked-conflict"
  | "blocked-foreign"
  | "blocked-drift"
  | "blocked-symlink-escape";

export interface InstallResult {
  target: "claude" | "codex";
  status: InstallStatus;
  skillDir: string;
  skillFile: string;
  sidecarFile: string;
  reason?: string;
}

export interface InstallContext {
  proposal: CompositeProposal;
  installRoot: string;
  target: "claude" | "codex";
  force: boolean;
  installerVersion: string;
  rootOverride: boolean;
}

export function buildSkillBody(p: CompositeProposal): string {
  const frontmatter = [
    "---",
    `name: ${yamlPlain(p.proposedSkillName)}`,
    `description: ${JSON.stringify(p.description)}`,
    `metadata:`,
    `  source: skillfit`,
    `  workspace: ${JSON.stringify(p.workspace)}`,
    `  scanned-at: ${JSON.stringify(p.scannedAt)}`,
    `  stacks: ${JSON.stringify(p.stacks)}`,
    `  candidates: ${p.candidates.length}`,
    "---",
    "",
  ].join("\n");
  return frontmatter + p.bodyDraft.replace(/^# .+\n+/m, "") + "\n";
}

export function proposalHash(p: CompositeProposal): string {
  return sha256(JSON.stringify({
    name: p.proposedSkillName,
    description: p.description,
    body: p.bodyDraft,
    stacks: p.stacks,
    candidates: p.candidates.map((c) => ({ id: c.id, evidence: c.evidence, stack: c.stack })),
    inputs: p.inputs,
    recommendations: p.recommendations,
  }));
}

export function bodyHash(body: string): string {
  return sha256(body);
}

export async function readSidecar(sidecarFile: string): Promise<SidecarRecord | null> {
  if (!existsSync(sidecarFile)) return null;
  try {
    const raw = await readFile(sidecarFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<SidecarRecord>;
    if (parsed.version !== SIDECAR_VERSION) return null;
    if (!parsed.proposalHash || !parsed.bodyHash || !parsed.skillName) return null;
    return parsed as SidecarRecord;
  } catch {
    return null;
  }
}

export async function ensureWritableRoot(root: string, options: { rootOverride: boolean }): Promise<string> {
  await mkdir(root, { recursive: true });
  try {
    await stat(root);
  } catch (e) {
    throw new Error(`install root not writable: ${root} (${e instanceof Error ? e.message : String(e)})`);
  }
  const resolved = await realpath(root);
  if (!options.rootOverride) {
    const home = await realpath(os.homedir());
    if (!resolved.startsWith(home + path.sep) && resolved !== home) {
      throw new SymlinkEscapeError(root, resolved, home);
    }
  }
  return resolved;
}

export class SymlinkEscapeError extends Error {
  readonly tag = "SymlinkEscapeError";
  constructor(public readonly requested: string, public readonly resolved: string, public readonly expectedPrefix: string) {
    super(`install root escapes expected prefix: requested=${requested} resolved=${resolved} expected-under=${expectedPrefix}`);
  }
}

export async function performInstall(ctx: InstallContext): Promise<InstallResult> {
  const skillName = ctx.proposal.proposedSkillName;
  const skillDir = path.join(ctx.installRoot, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");
  const sidecarFile = path.join(skillDir, SIDECAR_FILENAME);
  const newProposalHash = proposalHash(ctx.proposal);
  const newBody = buildSkillBody(ctx.proposal);
  const newBodyHash = bodyHash(newBody);

  const skillExists = existsSync(skillFile);
  const sidecar = skillExists ? await readSidecar(sidecarFile) : await readSidecar(sidecarFile);

  if (skillExists && !sidecar) {
    if (!ctx.force) {
      return result(ctx.target, "blocked-foreign", skillDir, skillFile, sidecarFile, `${skillFile} exists but was not installed by skillfit (no usable sidecar at ${sidecarFile}). Re-run with --force to overwrite.`);
    }
  }

  if (skillExists && sidecar) {
    let onDiskBodyHash: string;
    try {
      onDiskBodyHash = bodyHash(await readFile(skillFile, "utf8"));
    } catch (e) {
      return result(ctx.target, "blocked-foreign", skillDir, skillFile, sidecarFile, `failed to read installed SKILL.md for drift check: ${e instanceof Error ? e.message : String(e)}`);
    }
    const driftedOnDisk = onDiskBodyHash !== sidecar.bodyHash;
    const proposalChanged = sidecar.proposalHash !== newProposalHash;

    if (driftedOnDisk && !ctx.force) {
      return result(ctx.target, "blocked-drift", skillDir, skillFile, sidecarFile, `installed SKILL.md does not match recorded bodyHash (file edited or sidecar tampered). Re-run with --force to overwrite (your local edits will be lost).`);
    }

    if (!proposalChanged && !driftedOnDisk) {
      return result(ctx.target, "unchanged", skillDir, skillFile, sidecarFile, `proposal hash + body hash both match sidecar; skill is up-to-date`);
    }

    if (proposalChanged && !ctx.force) {
      return result(ctx.target, "blocked-conflict", skillDir, skillFile, sidecarFile, `proposal differs from installed version (${sidecar.proposalHash.slice(0, 19)} vs ${newProposalHash.slice(0, 19)}); pass --force to update`);
    }
  }

  await mkdir(skillDir, { recursive: true });
  const record: SidecarRecord = {
    version: SIDECAR_VERSION,
    installedBy: `skillfit@${ctx.installerVersion}`,
    installedAt: new Date().toISOString(),
    proposalHash: newProposalHash,
    bodyHash: newBodyHash,
    skillName,
    workspace: ctx.proposal.workspace,
  };
  const sidecarTmp = `${sidecarFile}.tmp-${process.pid}`;
  const skillTmp = `${skillFile}.tmp-${process.pid}`;
  try {
    await writeFile(sidecarTmp, JSON.stringify(record, null, 2) + "\n", "utf8");
    await writeFile(skillTmp, newBody, "utf8");
    await rename(sidecarTmp, sidecarFile);
    await rename(skillTmp, skillFile);
  } catch (e) {
    await safeUnlink(sidecarTmp);
    await safeUnlink(skillTmp);
    throw e;
  }

  return result(ctx.target, skillExists ? "updated" : "installed", skillDir, skillFile, sidecarFile);
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {
    /* ignore */
  }
}

function result(target: "claude" | "codex", status: InstallStatus, skillDir: string, skillFile: string, sidecarFile: string, reason?: string): InstallResult {
  return { target, status, skillDir, skillFile, sidecarFile, reason };
}

const YAML_PLAIN_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
function yamlPlain(s: string): string {
  return YAML_PLAIN_RE.test(s) ? s : JSON.stringify(s);
}
