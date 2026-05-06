#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScan } from "./scan.js";
import { renderMarkdown, renderJson } from "./report.js";
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
  return "0.0.0-unknown";
}

const HELP = `skillfit ${VERSION} — composite-proposal curator (dry-run, never installs)

Usage:
  skillfit [scan] [--cwd <path>] [--format md|json] [--output <file>]

Behavior:
  - Scans the workspace for stack signals + rule files.
  - Emits one composite-skill proposal per scan to stdout (or --output file).
  - Never writes skill files. Never edits CLAUDE.md, AGENTS.md, hooks, or config.

Options:
  --cwd <path>       Workspace to scan (default: current dir).
  --format md|json   Output format (default: md).
  --output <path>    Write report to file instead of stdout.
  --version          Print version and exit.
  --help, -h         Show this help.

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
    else if (a === "scan") out.cmd = "scan";
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
