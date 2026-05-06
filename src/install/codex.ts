import path from "node:path";
import os from "node:os";
import { performInstall, ensureWritableRoot, SymlinkEscapeError, blockedSymlinkEscapeResult, type InstallResult } from "./core.js";
import type { CompositeProposal } from "../scan.js";

export interface InstallCodexOptions {
  proposal: CompositeProposal;
  force: boolean;
  installerVersion: string;
  rootOverride?: string | null;
}

export function resolveCodexRoot(opts: { rootOverride?: string | null }): string {
  if (opts.rootOverride) return path.resolve(opts.rootOverride);
  return path.join(os.homedir(), ".agents", "skills");
}

export async function installCodex(opts: InstallCodexOptions): Promise<InstallResult> {
  const installRoot = resolveCodexRoot(opts);
  const rootOverride = opts.rootOverride != null;
  const allowedPrefix = rootOverride ? null : os.homedir();

  let resolvedRoot: string;
  try {
    resolvedRoot = await ensureWritableRoot(installRoot, { allowedPrefix });
  } catch (e) {
    if (e instanceof SymlinkEscapeError) {
      return blockedSymlinkEscapeResult("codex", e, opts.proposal.proposedSkillName);
    }
    throw e;
  }
  return performInstall({
    proposal: opts.proposal,
    installRoot: resolvedRoot,
    target: "codex",
    force: opts.force,
    installerVersion: opts.installerVersion,
    rootOverride,
  });
}
