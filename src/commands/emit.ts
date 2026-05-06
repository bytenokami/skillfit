import path from "node:path";
import { readLock } from "../lock.js";
import { emitClaude } from "../emit/claude.js";
import { synthesize } from "../synthesize.js";
import { log } from "../util/log.js";

export interface EmitOptions {
  repoRoot: string;
}

export async function runEmit(opts: EmitOptions): Promise<{ written: number }> {
  const repoRoot = path.resolve(opts.repoRoot);
  const lock = await readLock(path.join(repoRoot, "skillfit-lock.json"));
  if (!lock) {
    log.error("no skillfit-lock.json. Run `skillfit init` first.");
    return { written: 0 };
  }

  const synth = await synthesize(repoRoot);
  const synthEntry = lock.skills.find((s) => s.id === "repo-rules");
  const synthApproved = synthEntry?.approvedHash === synth.hash;

  const skills: { id: string; body: string }[] = [];
  for (const entry of lock.skills) {
    if (entry.id === "repo-rules") {
      if (synthApproved) skills.push({ id: entry.id, body: synth.body });
      else log.warn("repo-rules pending approval; skipped. Run `skillfit review`.");
      continue;
    }
    skills.push({ id: entry.id, body: placeholder(entry.id) });
  }

  const written = await emitClaude(repoRoot, skills);
  log.ok(`emit: wrote ${written.length} skill file(s) to .claude/skills/`);
  return { written: written.length };
}

function placeholder(id: string): string {
  return `---
name: ${id}
description: Placeholder for ${id} (autoskills registry passthrough TBD).
type: stack
origin: autoskills
---

# ${id}

Placeholder body. Real autoskills registry integration is RC-2 work.
`;
}
