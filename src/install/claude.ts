import { TARGETS, installToTarget, type Scope } from "./targets.js";
import type { InstallResult } from "./core.js";
import type { CompositeProposal } from "../scan.js";

export type ClaudeScope = Scope;

export interface InstallClaudeOptions {
  proposal: CompositeProposal;
  workspace: string;
  scope: ClaudeScope;
  force: boolean;
  installerVersion: string;
  rootOverride?: string | null;
}

export function resolveClaudeRoot(opts: { workspace: string; scope: ClaudeScope; rootOverride?: string | null }): string {
  return TARGETS.claude.resolveRoot({
    workspace: opts.workspace,
    scope: opts.scope,
    rootOverride: opts.rootOverride ?? null,
  });
}

export function installClaude(opts: InstallClaudeOptions): Promise<InstallResult> {
  return installToTarget({ targetId: "claude", ...opts });
}
