import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../util/hash.js";

export interface EmittedSkill {
  id: string;
  filePath: string;
  body: string;
  hash: string;
}

export interface SkillSpec {
  id: string;
  body: string;
}

export const CLAUDE_SKILLS_DIR = path.join(".claude", "skills");

export async function emitClaude(repoRoot: string, skills: SkillSpec[]): Promise<EmittedSkill[]> {
  const dir = path.join(repoRoot, CLAUDE_SKILLS_DIR);
  await mkdir(dir, { recursive: true });

  const out: EmittedSkill[] = [];
  for (const skill of skills) {
    const filename = `${sanitizeId(skill.id)}.md`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, ensureTrailingNewline(skill.body), "utf8");
    out.push({
      id: skill.id,
      filePath: path.relative(repoRoot, filePath),
      body: skill.body,
      hash: sha256(skill.body),
    });
  }
  return out;
}

export async function readEmittedSkill(repoRoot: string, id: string): Promise<string | null> {
  const filePath = path.join(repoRoot, CLAUDE_SKILLS_DIR, `${sanitizeId(id)}.md`);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : s + "\n";
}
