import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CandidateRef } from "./scan.js";
import type { StackKind } from "./bootstrap.js";

export type Action = "skip" | "blocked" | "adapt";

export interface Recommendation {
  action: Action;
  id: string;
  target: string;
  reason: string;
  source: string;
  rollback: string;
}

export interface InstructionFile {
  path: string;
  kind: "file" | "symlink";
  target: string;
}

const RULE_FILE_NAMES = new Set(["AGENTS.md", "CLAUDE.md", "agent_rules.md"]);

export async function detectInstructionTopology(repoRoot: string): Promise<InstructionFile[]> {
  const out: InstructionFile[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 2) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (entry.name === "node_modules" || entry.name === "vendor") continue;
      const full = path.join(dir, entry.name);
      if ((entry.isFile() || entry.isSymbolicLink()) && RULE_FILE_NAMES.has(entry.name)) {
        const rel = path.relative(repoRoot, full);
        let stat: import("node:fs").Stats;
        try {
          stat = lstatSync(full);
        } catch {
          continue;
        }
        if (stat.isSymbolicLink()) {
          let target = "";
          try {
            target = readlinkSync(full);
          } catch {
            target = "";
          }
          out.push({ path: rel, kind: "symlink", target });
        } else {
          out.push({ path: rel, kind: "file", target: "" });
        }
      } else if (entry.isDirectory()) {
        await walk(full, depth + 1);
      }
    }
  }
  await walk(repoRoot, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const STACK_TECH_NOTES: Partial<Record<StackKind, { id: string; reason: string; rollback: string }>> = {
  ts: {
    id: "stack/typescript-or-js",
    reason: "TypeScript / JavaScript dependencies present; generic language guidance must be reconciled with repo-specific checks.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  unity: {
    id: "stack/unity",
    reason: "Unity project markers are present; generic Unity advice must respect the repo's asset/meta-file rules and local build flow.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  go: {
    id: "stack/go",
    reason: "Go modules present; server behavior still needs repo-local verification before installing language guidance.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  python: {
    id: "stack/python",
    reason: "Python sources present; pin to the local dedicated Python environment policy before adopting generic Python skills.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  csharp: {
    id: "stack/csharp",
    reason: "C# project files present; generic .NET advice must be adapted for Unity-generated or repo-local projects.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  ruby: {
    id: "stack/ruby",
    reason: "Ruby sources present; any automation skill needs repo-local command verification.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  "apps-script": {
    id: "stack/apps-script",
    reason: "Google Apps Script markers present; deployment/auth behavior needs local repo rules.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
  infra: {
    id: "stack/infra",
    reason: "Infra files present (Jenkinsfile / Dockerfile / Terraform); deployment automation must be approval-gated.",
    rollback: "Remove the installed skill or omit it from any explicit apply batch.",
  },
};

export function buildRecommendations(args: {
  repoRoot: string;
  candidates: CandidateRef[];
  topology: InstructionFile[];
  stacks: StackKind[];
}): Recommendation[] {
  const recs: Recommendation[] = [];

  const hasShared = args.topology.some((t) => t.path === "agent_rules.md");
  const agentsLink = args.topology.find((t) => t.path === "AGENTS.md");
  const claudeLink = args.topology.find((t) => t.path === "CLAUDE.md");
  const unifiedTopology = hasShared
    && agentsLink?.kind === "symlink"
    && claudeLink?.kind === "symlink";

  if (unifiedTopology) {
    recs.push({
      action: "skip",
      id: "local/shared-agent-rules",
      target: "agent_rules.md",
      reason: "Shared instruction model is already in place: agent_rules.md is canonical with AGENTS.md and CLAUDE.md as symlinks. The curator does not duplicate it.",
      source: "instruction-topology probe",
      rollback: "No rollback needed — this recommendation writes nothing.",
    });
  } else if (args.topology.length > 0) {
    recs.push({
      action: "blocked",
      id: "local/shared-agent-rules",
      target: "agent_rules.md",
      reason: "Instruction topology is not unified (canonical agent_rules.md plus AGENTS.md / CLAUDE.md symlinks). Resolve ownership before any skill that writes to agent rules.",
      source: "instruction-topology probe",
      rollback: "Leave existing rule files untouched and prepare a separate instruction-topology plan.",
    });
  }

  if (existsSync(path.join(args.repoRoot, "generator-jp"))) {
    recs.push({
      action: "blocked",
      id: "boundary/generator-jp",
      target: "generator-jp/",
      reason: "generator-jp is reference material; generated agent config must not be added there per project rules.",
      source: "workspace boundary",
      rollback: "No rollback needed — this recommendation writes nothing.",
    });
  }

  for (const stack of args.stacks) {
    const note = STACK_TECH_NOTES[stack];
    if (!note) continue;
    recs.push({
      action: "adapt",
      id: note.id,
      target: stack,
      reason: note.reason,
      source: `stack-detector:${stack}`,
      rollback: note.rollback,
    });
  }

  return recs;
}
