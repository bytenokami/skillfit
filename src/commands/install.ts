import path from "node:path";
import { runScan } from "../scan.js";
import { installToTarget, TARGETS, type TargetId } from "../install/targets.js";
import type { InstallResult } from "../install/core.js";
import type { ClaudeScope } from "../install/claude.js";
import { log } from "../util/log.js";

export type InstallTarget = TargetId | "both";

export interface InstallOptions {
  cwd: string;
  target: InstallTarget;
  scope: ClaudeScope;
  force: boolean;
  claudeRoot?: string | null;
  codexRoot?: string | null;
  installerVersion: string;
}

export interface InstallSummary {
  proposalName: string;
  results: InstallResult[];
  hadBlock: boolean;
}

export async function runInstall(opts: InstallOptions): Promise<InstallSummary> {
  const repoRoot = path.resolve(opts.cwd);
  const proposal = await runScan(repoRoot);

  log.info(`installing composite '${proposal.proposedSkillName}' (target=${opts.target}, scope=${opts.scope}${opts.force ? ", force" : ""})`);

  const targets: TargetId[] = opts.target === "both" ? ["claude", "codex"] : [opts.target];
  const results: InstallResult[] = [];

  for (const id of targets) {
    const rootOverride = id === "claude" ? opts.claudeRoot : opts.codexRoot;
    const r = await installToTarget({
      targetId: id,
      proposal,
      workspace: repoRoot,
      scope: opts.scope,
      force: opts.force,
      installerVersion: opts.installerVersion,
      rootOverride: rootOverride ?? null,
    });
    results.push(r);
    logResult(r);
    const note = TARGETS[id].postInstallNote;
    if (note && (r.status === "installed" || r.status === "updated")) {
      log.info(`${id}: ${note}`);
    }
  }

  const hadBlock = results.some((r) => r.status.startsWith("blocked-"));
  return { proposalName: proposal.proposedSkillName, results, hadBlock };
}

function logResult(r: InstallResult): void {
  switch (r.status) {
    case "installed":
      log.ok(`${r.target}: installed → ${r.skillFile}`);
      break;
    case "updated":
      log.ok(`${r.target}: updated → ${r.skillFile}`);
      break;
    case "unchanged":
      log.info(`${r.target}: unchanged (${r.skillFile})`);
      break;
    case "blocked-conflict":
      log.warn(`${r.target}: blocked (proposal change). ${r.reason ?? ""}`);
      break;
    case "blocked-foreign":
      log.warn(`${r.target}: blocked (foreign file). ${r.reason ?? ""}`);
      break;
    case "blocked-drift":
      log.warn(`${r.target}: blocked (on-disk drift). ${r.reason ?? ""}`);
      break;
    case "blocked-symlink-escape":
      log.warn(`${r.target}: blocked (symlink escape). ${r.reason ?? ""}`);
      break;
  }
}
