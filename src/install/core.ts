import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
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
  skillName: string;
  workspace: string;
}

export type InstallStatus = "installed" | "updated" | "unchanged" | "blocked-conflict" | "blocked-foreign";

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
}

export function buildSkillBody(p: CompositeProposal): string {
  const frontmatter = [
    "---",
    `name: ${p.proposedSkillName}`,
    `description: ${yamlScalar(p.description)}`,
    `metadata:`,
    `  source: skillfit`,
    `  workspace: ${yamlScalar(p.workspace)}`,
    `  scanned-at: ${p.scannedAt}`,
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

export async function readSidecar(sidecarFile: string): Promise<SidecarRecord | null> {
  if (!existsSync(sidecarFile)) return null;
  try {
    const raw = await readFile(sidecarFile, "utf8");
    const parsed = JSON.parse(raw) as SidecarRecord;
    if (parsed.version !== SIDECAR_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function performInstall(ctx: InstallContext): Promise<InstallResult> {
  const skillName = ctx.proposal.proposedSkillName;
  const skillDir = path.join(ctx.installRoot, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");
  const sidecarFile = path.join(skillDir, SIDECAR_FILENAME);

  const existingFile = existsSync(skillFile);
  const sidecar = existingFile ? await readSidecar(sidecarFile) : null;
  const newHash = proposalHash(ctx.proposal);

  if (existingFile && !sidecar) {
    if (!ctx.force) {
      return {
        target: ctx.target,
        status: "blocked-foreign",
        skillDir,
        skillFile,
        sidecarFile,
        reason: `${skillFile} exists but was not installed by skillfit (no sidecar at ${sidecarFile}). Re-run with --force to overwrite.`,
      };
    }
  }

  if (existingFile && sidecar && sidecar.proposalHash === newHash) {
    return {
      target: ctx.target,
      status: "unchanged",
      skillDir,
      skillFile,
      sidecarFile,
      reason: `proposal hash matches sidecar; skill is up-to-date`,
    };
  }

  if (existingFile && sidecar && sidecar.proposalHash !== newHash && !ctx.force) {
    return {
      target: ctx.target,
      status: "blocked-conflict",
      skillDir,
      skillFile,
      sidecarFile,
      reason: `proposal differs from installed version (${sidecar.proposalHash.slice(0, 19)} vs ${newHash.slice(0, 19)}); pass --force to update`,
    };
  }

  await mkdir(skillDir, { recursive: true });
  const body = buildSkillBody(ctx.proposal);
  await writeFile(skillFile, body, "utf8");

  const record: SidecarRecord = {
    version: SIDECAR_VERSION,
    installedBy: `skillfit@${ctx.installerVersion}`,
    installedAt: new Date().toISOString(),
    proposalHash: newHash,
    skillName,
    workspace: ctx.proposal.workspace,
  };
  await writeFile(sidecarFile, JSON.stringify(record, null, 2) + "\n", "utf8");

  return {
    target: ctx.target,
    status: existingFile ? "updated" : "installed",
    skillDir,
    skillFile,
    sidecarFile,
  };
}

function yamlScalar(s: string): string {
  if (/[:#\n]/.test(s)) return JSON.stringify(s);
  return s;
}

export async function ensureWritableRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  try {
    await stat(root);
  } catch (e) {
    throw new Error(`install root not writable: ${root} (${e instanceof Error ? e.message : String(e)})`);
  }
}
