import path from "node:path";
import { bootstrap, type BootstrapCandidate } from "../bootstrap.js";
import { probe, type ProbeResult } from "../probe.js";
import { synthesize } from "../synthesize.js";
import { emitClaude } from "../emit/claude.js";
import {
  emptyLock,
  writeLock,
  readLock,
  upsertSkill,
  type Lockfile,
  type SkillEntry,
} from "../lock.js";
import { log } from "../util/log.js";
import { sha256 } from "../util/hash.js";

export interface InitOptions {
  repoRoot: string;
  yes: boolean;
  dryRun?: boolean;
}

export async function runInit(opts: InitOptions): Promise<{ lock: Lockfile; emitted: number; pendingApproval: number; dryRun: boolean }> {
  const repoRoot = path.resolve(opts.repoRoot);
  const dryRun = !!opts.dryRun;
  log.info(`skillfit init at ${repoRoot}${dryRun ? " (dry-run; no files written)" : ""}`);

  const boot = await bootstrap(repoRoot);
  log.ok(`bootstrap: ${boot.candidates.length} candidate skill(s) across stacks: [${boot.stacks.join(", ") || "none"}]`);

  const probeResult = boot.stacks.includes("ts")
    ? await probe(repoRoot)
    : { usage: new Map() } as ProbeResult;
  if (probeResult.usage.size > 0) log.ok(`probe: ${probeResult.usage.size} unique import root(s) detected`);

  const existing = (await readLock(path.join(repoRoot, "skillfit-lock.json"))) ?? emptyLock(boot.autoskillsVersion);
  const lock: Lockfile = {
    ...emptyLock(boot.autoskillsVersion),
    skills: existing.skills,
  };

  const dropped: { id: string; reason: string }[] = [];
  const verifiedSkillIds: BootstrapCandidate[] = [];

  for (const cand of boot.candidates) {
    if (cand.importRoot && !isUsed(probeResult, cand.importRoot)) {
      dropped.push({ id: cand.id, reason: `0 import sites for ${cand.importRoot}` });
      continue;
    }
    const placeholderBody = placeholderFor(cand);
    const entry: SkillEntry = {
      id: cand.id,
      origin: "verified",
      source: "autoskills",
      hash: sha256(placeholderBody),
    };
    upsertSkill(lock, entry);
    verifiedSkillIds.push(cand);
  }

  const synth = await synthesize(repoRoot);
  const synthEntry: SkillEntry = {
    id: "repo-rules",
    origin: "verified",
    source: "synthesized",
    hash: synth.hash,
    inputs: synth.inputs,
    model: synth.mode === "llm" ? "anthropic" : "deterministic",
  };
  const previous = lock.skills.find((s) => s.id === "repo-rules");
  if (previous && previous.approvedHash === synth.hash) {
    synthEntry.approvedAt = previous.approvedAt;
    synthEntry.approvedHash = previous.approvedHash;
  }
  upsertSkill(lock, synthEntry);
  lock.dropped = dropped;

  const skillsToEmit = verifiedSkillIds.map((c) => ({ id: c.id, body: placeholderFor(c) }));
  if (synthEntry.approvedHash === synth.hash) {
    skillsToEmit.push({ id: "repo-rules", body: synth.body });
  }

  const pendingApproval = synthEntry.approvedHash === synth.hash ? 0 : 1;

  if (dryRun) {
    log.info(`would emit ${skillsToEmit.length} skill file(s): ${skillsToEmit.map((s) => s.id).join(", ") || "(none)"}`);
    if (dropped.length > 0) log.info(`would drop ${dropped.length} skill(s): ${dropped.map((d) => d.id).join(", ")}`);
    if (pendingApproval > 0) log.info(`would mark repo-rules pending approval`);
    log.info(`would write lockfile with ${lock.skills.length} skill entr(ies)`);
    return { lock, emitted: 0, pendingApproval, dryRun: true };
  }

  const emitted = await emitClaude(repoRoot, skillsToEmit);
  await writeLock(lock, path.join(repoRoot, "skillfit-lock.json"));

  log.ok(`emitted ${emitted.length} skill(s) to .claude/skills/`);
  if (dropped.length > 0) log.info(`dropped ${dropped.length} unused skill(s): ${dropped.map((d) => d.id).join(", ")}`);
  if (pendingApproval > 0) log.warn(`repo-rules synthesis pending approval. Run: skillfit review`);

  return { lock, emitted: emitted.length, pendingApproval, dryRun: false };
}

function isUsed(p: ProbeResult, dep: string): boolean {
  const u = p.usage.get(dep);
  return !!u && u.sites > 0;
}

function placeholderFor(cand: BootstrapCandidate): string {
  return `---
name: ${cand.id}
description: Placeholder skill for ${cand.id} (${cand.stack}). Reason: ${cand.reason}. Real content from autoskills/skillfit-registry pending RC-2.
type: stack
origin: ${cand.stack === "ts" ? "autoskills" : "skillfit-registry"}
---

# ${cand.id}

Placeholder body. Detected via stack=${cand.stack}, source=${cand.reason}.
`;
}
