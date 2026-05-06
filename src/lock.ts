import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const LOCK_VERSION = 1;
export const LOCK_PATH = "skillfit-lock.json";

export type SkillOrigin = "verified" | "local";
export type SkillSource = "autoskills" | "synthesized" | "user";

export interface SkillEntry {
  id: string;
  origin: SkillOrigin;
  source: SkillSource;
  hash: string;
  inputs?: string[];
  model?: string;
  approvedAt?: string;
  approvedHash?: string;
}

export interface Lockfile {
  version: number;
  generatedAt: string;
  bootstrap: { tool: string; lockSha: string | null };
  skills: SkillEntry[];
  dropped: { id: string; reason: string }[];
}

export async function readLock(path: string = LOCK_PATH): Promise<Lockfile | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Lockfile;
  if (parsed.version !== LOCK_VERSION) {
    throw new Error(`unsupported lockfile version: ${parsed.version} (expected ${LOCK_VERSION})`);
  }
  return parsed;
}

export async function writeLock(lock: Lockfile, path: string = LOCK_PATH): Promise<void> {
  await writeFile(path, JSON.stringify(lock, null, 2) + "\n", "utf8");
}

export function emptyLock(autoskillsVersion: string): Lockfile {
  return {
    version: LOCK_VERSION,
    generatedAt: new Date().toISOString(),
    bootstrap: { tool: `autoskills@${autoskillsVersion}`, lockSha: null },
    skills: [],
    dropped: [],
  };
}

export function findSkill(lock: Lockfile, id: string): SkillEntry | undefined {
  return lock.skills.find((s) => s.id === id);
}

export function upsertSkill(lock: Lockfile, entry: SkillEntry): void {
  const idx = lock.skills.findIndex((s) => s.id === entry.id);
  if (idx >= 0) lock.skills[idx] = entry;
  else lock.skills.push(entry);
}
