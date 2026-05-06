import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createTwoFilesPatch } from "diff";
import { readLock, writeLock, upsertSkill, type Lockfile } from "../lock.js";
import { synthesize } from "../synthesize.js";
import { emitClaude } from "../emit/claude.js";
import { readEmittedSkill } from "../emit/claude.js";
import { log } from "../util/log.js";

export interface ReviewOptions {
  repoRoot: string;
  yes: boolean;
}

export interface ReviewOutcome {
  changed: boolean;
  approved: boolean;
  reason: string;
}

export async function runReview(opts: ReviewOptions): Promise<ReviewOutcome> {
  const repoRoot = path.resolve(opts.repoRoot);
  const lockPath = path.join(repoRoot, "skillfit-lock.json");
  const lock = await readLock(lockPath);
  if (!lock) {
    log.error("no skillfit-lock.json found. Run `skillfit init` first.");
    return { changed: false, approved: false, reason: "no-lock" };
  }

  const current = await synthesize(repoRoot);
  const entry = lock.skills.find((s) => s.id === "repo-rules");
  const previousBody = (await readEmittedSkill(repoRoot, "repo-rules")) ?? "";
  const previousApprovedHash = entry?.approvedHash ?? null;

  if (previousApprovedHash === current.hash) {
    log.ok("repo-rules synthesis is unchanged and already approved.");
    return { changed: false, approved: true, reason: "unchanged" };
  }

  const patch = createTwoFilesPatch(
    "repo-rules.md (approved)",
    "repo-rules.md (proposed)",
    previousBody,
    current.body,
    previousApprovedHash ? `approved ${entry?.approvedAt ?? "?"}` : "no prior approval",
    `proposed ${current.hash.slice(0, 19)}…`,
    { context: 3 },
  );

  stdout.write("\n");
  stdout.write(patch);
  stdout.write("\n");

  const approved = opts.yes ? true : await prompt("Approve and emit this skill? (y/N) ");
  if (!approved) {
    log.warn("approval skipped. Skill not emitted.");
    return { changed: true, approved: false, reason: "user-declined" };
  }

  await emitClaude(repoRoot, [{ id: "repo-rules", body: current.body }]);

  upsertSkill(lock, {
    id: "repo-rules",
    origin: "verified",
    source: "synthesized",
    hash: current.hash,
    inputs: current.inputs,
    model: current.mode === "llm" ? "anthropic" : "deterministic",
    approvedAt: new Date().toISOString(),
    approvedHash: current.hash,
  });
  await writeLock(lock, lockPath);

  log.ok("repo-rules approved and emitted.");
  return { changed: true, approved: true, reason: "approved" };
}

async function prompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function dryDriftCheck(repoRoot: string): Promise<{ drifted: boolean; details: string }> {
  const lock = await readLock(path.join(repoRoot, "skillfit-lock.json"));
  if (!lock) return { drifted: true, details: "no lockfile" };
  const current = await synthesize(repoRoot);
  const entry = lock.skills.find((s) => s.id === "repo-rules");
  if (!entry) return { drifted: true, details: "repo-rules missing from lockfile" };
  if (entry.approvedHash === current.hash) return { drifted: false, details: "synthesis matches approved hash" };
  return { drifted: true, details: `synthesis hash ${current.hash.slice(0, 19)} != approved ${(entry.approvedHash ?? "none").slice(0, 19)}` };
}

export function lockSummary(lock: Lockfile): string {
  return `${lock.skills.length} skill(s), ${lock.dropped.length} dropped, generated ${lock.generatedAt}`;
}
