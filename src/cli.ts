#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScan } from "./scan.js";
import { renderMarkdown, renderJson } from "./report.js";
import { runInstall, type InstallTarget } from "./commands/install.js";
import type { ClaudeScope } from "./install/claude.js";
import { log } from "./util/log.js";

const VERSION = readVersion();

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "package.json"),
    path.resolve(here, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      continue;
    }
  }
  throw new Error(`skillfit: cannot resolve installer version (no package.json at ${candidates.join(" or ")}). Refusing to run without a version — sidecars must record a real installer identity.`);
}

const HELP = `skillfit ${VERSION} — composite-skill curator + opt-in installer

Commands:
  skillfit [scan]                    Scan workspace, emit composite proposal (dry-run, default).
  skillfit install --target T        Install the proposed composite to T (claude|codex|both).

Scan options:
  --cwd <path>       Workspace to scan (default: current dir).
  --format md|json   Output format (default: md).
  --output <path>    Write report to file instead of stdout.

Install options (only valid with the install command):
  --target T         Required. claude | codex | both.
  --scope S          Claude scope: project | user (default: project). Codex always installs to user-scope ~/.agents/skills/.
  --force            Overwrite existing skill if hash differs or no sidecar present.
  --claude-root P    Override Claude install root (default: <cwd>/.claude/skills/ for project scope).
  --codex-root P     Override Codex install root (default: ~/.agents/skills/).

Global options:
  --version          Print version and exit.
  --help, -h         Show this help.

Behavior:
  - 'scan' (default) writes nothing; emits a single composite proposal to stdout/--output.
  - 'install' is opt-in. It writes ONE directory per repo (<root>/<skill-name>/SKILL.md + .skillfit.lock.json).
  - Never edits CLAUDE.md, AGENTS.md, hooks, or any agent config file.
  - Idempotent: re-running install with no proposal change is a no-op (status: unchanged).
  - Conflict-aware: blocks on existing foreign files unless --force.

Environment:
  SKILLFIT_LOG=silent|error|warn|info|debug   Log level (default: info; logs go to stderr).
`;

interface Args {
  cmd: string;
  cwd: string;
  format: "md" | "json";
  output: string | null;
  help: boolean;
  version: boolean;
  target: InstallTarget | null;
  scope: ClaudeScope;
  force: boolean;
  claudeRoot: string | null;
  codexRoot: string | null;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const out: Args = {
    cmd: "scan",
    cwd: process.cwd(),
    format: "md",
    output: null,
    help: false,
    version: false,
    target: null,
    scope: "project",
    force: false,
    claudeRoot: null,
    codexRoot: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--cwd") out.cwd = args[++i] ?? out.cwd;
    else if (a === "--format") {
      const f = args[++i];
      if (f !== "md" && f !== "json") throw new Error(`--format must be md or json, got: ${f}`);
      out.format = f;
    } else if (a === "--output") out.output = args[++i] ?? null;
    else if (a === "--target") {
      const t = args[++i];
      if (t !== "claude" && t !== "codex" && t !== "both") throw new Error(`--target must be claude|codex|both, got: ${t}`);
      out.target = t;
    } else if (a === "--scope") {
      const s = args[++i];
      if (s !== "project" && s !== "user") throw new Error(`--scope must be project|user, got: ${s}`);
      out.scope = s;
    } else if (a === "--force") out.force = true;
    else if (a === "--claude-root") out.claudeRoot = args[++i] ?? null;
    else if (a === "--codex-root") out.codexRoot = args[++i] ?? null;
    else if (a === "scan" || a === "install") out.cmd = a;
    else if (a && !a.startsWith("-")) out.cmd = a;
  }
  return out;
}

async function main(): Promise<number> {
  let parsed: Args;
  try {
    parsed = parseArgs(process.argv);
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.version) {
    process.stdout.write(VERSION + "\n");
    return 0;
  }

  if (parsed.cmd === "install") {
    if (!parsed.target) {
      log.error("install requires --target claude|codex|both");
      return 2;
    }
    const summary = await runInstall({
      cwd: parsed.cwd,
      target: parsed.target,
      scope: parsed.scope,
      force: parsed.force,
      claudeRoot: parsed.claudeRoot,
      codexRoot: parsed.codexRoot,
      installerVersion: VERSION,
    });
    if (parsed.format === "json") {
      process.stdout.write(JSON.stringify({ version: 1, ...summary }, null, 2) + "\n");
    }
    return summary.hadBlock ? 1 : 0;
  }

  if (parsed.cmd !== "scan") {
    log.error(`unknown command: ${parsed.cmd}`);
    process.stdout.write("\n" + HELP);
    return 2;
  }

  const proposal = await runScan(parsed.cwd);
  const rendered = parsed.format === "json" ? renderJson(proposal) : renderMarkdown(proposal);

  if (parsed.output) {
    const target = path.resolve(parsed.output);
    await writeFile(target, rendered.endsWith("\n") ? rendered : rendered + "\n", "utf8");
    log.ok(`wrote ${target}`);
  } else {
    process.stdout.write(rendered);
    if (!rendered.endsWith("\n")) process.stdout.write("\n");
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  },
);
