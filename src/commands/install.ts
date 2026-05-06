import path from "node:path";
import { runScan } from "../scan.js";
import { installClaude, type ClaudeScope } from "../install/claude.js";
import { installCodex } from "../install/codex.js";
import type { InstallResult } from "../install/core.js";
import { log } from "../util/log.js";

export type InstallTarget = "claude" | "codex" | "both";

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

  const results: InstallResult[] = [];

  if (opts.target === "claude" || opts.target === "both") {
    const r = await installClaude({
      proposal,
      workspace: repoRoot,
      scope: opts.scope,
      force: opts.force,
      installerVersion: opts.installerVersion,
      rootOverride: opts.claudeRoot ?? null,
    });
    results.push(r);
    logResult(r);
  }

  if (opts.target === "codex" || opts.target === "both") {
    const r = await installCodex({
      proposal,
      force: opts.force,
      installerVersion: opts.installerVersion,
      rootOverride: opts.codexRoot ?? null,
    });
    results.push(r);
    logResult(r);
    if (r.status === "installed" || r.status === "updated") {
      log.info("codex: restart the Codex CLI to discover the skill");
    }
  }

  const hadBlock = results.some((r) => r.status === "blocked-conflict" || r.status === "blocked-foreign");
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
      log.warn(`${r.target}: blocked (conflict). ${r.reason ?? ""}`);
      break;
    case "blocked-foreign":
      log.warn(`${r.target}: blocked (foreign file). ${r.reason ?? ""}`);
      break;
  }
}
