import path from "node:path";
import os from "node:os";
import {
  performInstall,
  ensureWritableRoot,
  SymlinkEscapeError,
  blockedSymlinkEscapeResult,
  type InstallResult,
} from "./core.js";
import type { CompositeProposal } from "../scan.js";

export type TargetId = "claude" | "codex";
export type Scope = "project" | "user";

export interface TargetResolveOpts {
  workspace: string;
  scope: Scope;
  rootOverride: string | null;
}

export interface InstallTargetSpec {
  id: TargetId;
  supportsProjectScope: boolean;
  resolveRoot(opts: TargetResolveOpts): string;
  resolveAllowedPrefix(opts: TargetResolveOpts): string | null;
  postInstallNote?: string;
}

export const TARGETS: Record<TargetId, InstallTargetSpec> = {
  claude: {
    id: "claude",
    supportsProjectScope: true,
    resolveRoot(opts) {
      if (opts.rootOverride) return path.resolve(opts.rootOverride);
      if (opts.scope === "user") return path.join(os.homedir(), ".claude", "skills");
      return path.join(opts.workspace, ".claude", "skills");
    },
    resolveAllowedPrefix(opts) {
      if (opts.rootOverride) return null;
      return opts.scope === "user" ? os.homedir() : path.resolve(opts.workspace);
    },
  },
  codex: {
    id: "codex",
    supportsProjectScope: false,
    resolveRoot(opts) {
      if (opts.rootOverride) return path.resolve(opts.rootOverride);
      return path.join(os.homedir(), ".agents", "skills");
    },
    resolveAllowedPrefix(opts) {
      if (opts.rootOverride) return null;
      return os.homedir();
    },
    postInstallNote: "restart the Codex CLI to discover the skill",
  },
};

export interface InstallToTargetOpts {
  targetId: TargetId;
  proposal: CompositeProposal;
  workspace: string;
  scope: Scope;
  force: boolean;
  installerVersion: string;
  rootOverride?: string | null;
}

export async function installToTarget(opts: InstallToTargetOpts): Promise<InstallResult> {
  const spec = TARGETS[opts.targetId];
  if (!spec) throw new Error(`unknown install target: ${opts.targetId}`);

  const resolveOpts: TargetResolveOpts = {
    workspace: opts.workspace,
    scope: opts.scope,
    rootOverride: opts.rootOverride ?? null,
  };

  const installRoot = spec.resolveRoot(resolveOpts);
  const allowedPrefix = spec.resolveAllowedPrefix(resolveOpts);
  const rootOverride = opts.rootOverride != null;

  let resolvedRoot: string;
  try {
    resolvedRoot = await ensureWritableRoot(installRoot, { allowedPrefix });
  } catch (e) {
    if (e instanceof SymlinkEscapeError) {
      return blockedSymlinkEscapeResult(spec.id, e, opts.proposal.proposedSkillName);
    }
    throw e;
  }

  return performInstall({
    proposal: opts.proposal,
    installRoot: resolvedRoot,
    target: spec.id,
    force: opts.force,
    installerVersion: opts.installerVersion,
    rootOverride,
  });
}
