import { TARGETS, installToTarget } from "./targets.js";
import type { InstallResult } from "./core.js";
import type { CompositeProposal } from "../scan.js";

export interface InstallCodexOptions {
  proposal: CompositeProposal;
  force: boolean;
  installerVersion: string;
  rootOverride?: string | null;
}

export function resolveCodexRoot(opts: { rootOverride?: string | null }): string {
  return TARGETS.codex.resolveRoot({
    workspace: "",
    scope: "user",
    rootOverride: opts.rootOverride ?? null,
  });
}

export function installCodex(opts: InstallCodexOptions): Promise<InstallResult> {
  return installToTarget({
    targetId: "codex",
    proposal: opts.proposal,
    workspace: "",
    scope: "user",
    force: opts.force,
    installerVersion: opts.installerVersion,
    rootOverride: opts.rootOverride ?? null,
  });
}
