#!/usr/bin/env node
import { runInit } from "./commands/init.js";
import { runReview, dryDriftCheck } from "./commands/review.js";
import { runEmit } from "./commands/emit.js";
import { log } from "./util/log.js";

const VERSION = "0.1.0-rc.1";

const HELP = `skillfit ${VERSION}

Usage:
  skillfit init [--yes]      Detect stack, synthesize repo-rules, write lockfile + .claude/skills
  skillfit review [--yes]    Diff repo-rules synthesis vs last approved; require approval before emit
  skillfit emit              Re-emit currently-approved skills from lockfile
  skillfit check             Exit non-zero if synthesis drifted from approved hash (CI gate)
  skillfit version           Print version
  skillfit help              Show this help

Options:
  --cwd <path>               Run against a specific repo root (default: current dir)
  --yes, -y                  Auto-approve interactive prompts
  --help, -h                 Show this help

Environment:
  SKILLFIT_LOG=silent|error|warn|info|debug   Log level (default: info)
`;

function parseArgs(argv: string[]): { cmd: string | null; yes: boolean; cwd: string; help: boolean } {
  const args = argv.slice(2);
  let cmd: string | null = null;
  let yes = false;
  let cwd = process.cwd();
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--cwd") cwd = args[++i] ?? cwd;
    else if (!cmd && !a?.startsWith("-")) cmd = a ?? null;
  }
  return { cmd, yes, cwd, help };
}

async function main(): Promise<number> {
  const { cmd, yes, cwd, help } = parseArgs(process.argv);

  if (help || !cmd || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  switch (cmd) {
    case "version":
      process.stdout.write(VERSION + "\n");
      return 0;

    case "init": {
      const result = await runInit({ repoRoot: cwd, yes });
      return result.pendingApproval > 0 ? 0 : 0;
    }

    case "review": {
      const result = await runReview({ repoRoot: cwd, yes });
      return result.approved || result.reason === "unchanged" ? 0 : 1;
    }

    case "emit": {
      await runEmit({ repoRoot: cwd });
      return 0;
    }

    case "check": {
      const drift = await dryDriftCheck(cwd);
      if (drift.drifted) {
        log.error(`drift detected: ${drift.details}`);
        return 1;
      }
      log.ok(drift.details);
      return 0;
    }

    default:
      log.error(`unknown command: ${cmd}`);
      process.stdout.write("\n" + HELP);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  },
);
