import path from "node:path";
import os from "node:os";
import { performInstall, ensureWritableRoot, SymlinkEscapeError, blockedSymlinkEscapeResult, type InstallResult } from "./core.js";
import type { CompositeProposal } from "../scan.js";

export type ClaudeScope = "project" | "user";

export interface InstallClaudeOptions {
  proposal: CompositeProposal;
  workspace: string;
  scope: ClaudeScope;
  force: boolean;
  installerVersion: string;
  rootOverride?: string | null;
}

export function resolveClaudeRoot(opts: { workspace: string; scope: ClaudeScope; rootOverride?: string | null }): string {
  if (opts.rootOverride) return path.resolve(opts.rootOverride);
  if (opts.scope === "user") return path.join(os.homedir(), ".claude", "skills");
  return path.join(opts.workspace, ".claude", "skills");
}

export async function installClaude(opts: InstallClaudeOptions): Promise<InstallResult> {
  const installRoot = resolveClaudeRoot(opts);
  const rootOverride = opts.rootOverride != null;
  const allowedPrefix = rootOverride
    ? null
    : opts.scope === "user"
      ? os.homedir()
      : path.resolve(opts.workspace);

  let resolvedRoot: string;
  try {
    resolvedRoot = await ensureWritableRoot(installRoot, { allowedPrefix });
  } catch (e) {
    if (e instanceof SymlinkEscapeError) {
      return blockedSymlinkEscapeResult("claude", e, opts.proposal.proposedSkillName);
    }
    throw e;
  }
  return performInstall({
    proposal: opts.proposal,
    installRoot: resolvedRoot,
    target: "claude",
    force: opts.force,
    installerVersion: opts.installerVersion,
    rootOverride,
  });
}
