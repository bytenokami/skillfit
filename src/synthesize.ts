import { readFile } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./util/hash.js";
import { log } from "./util/log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_VERSION = "v1";
const TEMPLATE_PATH = path.resolve(__dirname, "..", "templates", "repo-rules.skill.tmpl.md");

const CANDIDATE_RULE_FILES = ["CLAUDE.md", "AGENTS.md", ".cursor/rules", "agent_rules.md"];

export interface SynthesizeInput {
  path: string;
  content: string;
  hash: string;
}

export interface SynthesizeOutput {
  body: string;
  hash: string;
  inputs: string[];
  templateVersion: string;
  mode: "llm" | "deterministic";
}

export async function gatherInputs(repoRoot: string): Promise<SynthesizeInput[]> {
  const out: SynthesizeInput[] = [];
  for (const rel of CANDIDATE_RULE_FILES) {
    const full = path.join(repoRoot, rel);
    if (!existsSync(full)) continue;
    try {
      const content = await readFile(full, "utf8");
      out.push({ path: rel, content, hash: sha256(content) });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => {
    const aSym = isSymlink(path.join(repoRoot, a.path));
    const bSym = isSymlink(path.join(repoRoot, b.path));
    if (aSym !== bSym) return aSym ? 1 : -1;
    return a.path.localeCompare(b.path);
  });
}

function isSymlink(fullPath: string): boolean {
  try {
    return lstatSync(fullPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function deterministicDistill(inputs: SynthesizeInput[]): string {
  if (inputs.length === 0) {
    return "_No source rule files found in this repository._";
  }
  const seenHashes = new Map<string, string[]>();
  const canonicalOrder: SynthesizeInput[] = [];
  for (const input of inputs) {
    const aliases = seenHashes.get(input.hash);
    if (aliases) {
      aliases.push(input.path);
      continue;
    }
    seenHashes.set(input.hash, []);
    canonicalOrder.push(input);
  }
  const sections: string[] = [];
  for (const input of canonicalOrder) {
    const headings = extractHeadingsAndBullets(input.content);
    const aliases = seenHashes.get(input.hash) ?? [];
    const aliasNote = aliases.length > 0
      ? `\n\n_Same content also referenced via: ${aliases.map((a) => `\`${a}\``).join(", ")} (symlink-dup)._`
      : "";
    const body = headings.length ? headings.join("\n") : "_(no headings or bulleted rules detected)_";
    sections.push(`### From \`${input.path}\`\n\n${body}${aliasNote}`);
  }
  return sections.join("\n\n");
}

function extractHeadingsAndBullets(md: string): string[] {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{2,4}\s+/.test(line)) {
      out.push(line.replace(/^#+/, "###").trim());
    } else if (/^\s*[-*]\s+/.test(line) && line.trim().length < 240) {
      out.push(line.trim());
    }
  }
  return out;
}

async function loadTemplate(): Promise<string> {
  return readFile(TEMPLATE_PATH, "utf8");
}

function fillTemplate(tmpl: string, sources: SynthesizeInput[], rules: string): string {
  const sourceList = sources.length === 0
    ? "_(none)_"
    : sources.map((s) => `- \`${s.path}\` (${s.hash.slice(0, 19)}…)`).join("\n");
  const sourcesInline = sources.length === 0 ? "no source files" : sources.map((s) => s.path).join(", ");
  return tmpl
    .replace("{{SOURCES}}", sourcesInline)
    .replace("{{SOURCE_LIST}}", sourceList)
    .replace("{{RULES}}", rules);
}

export async function synthesize(repoRoot: string): Promise<SynthesizeOutput> {
  const inputs = await gatherInputs(repoRoot);
  const tmpl = await loadTemplate();

  const distilled = deterministicDistill(inputs);
  const body = fillTemplate(tmpl, inputs, distilled);

  const inputDigest = sha256(
    JSON.stringify({
      template: TEMPLATE_VERSION,
      inputs: inputs.map((i) => ({ path: i.path, hash: i.hash })),
    }),
  );

  log.debug(`synthesize: ${inputs.length} input(s), template=${TEMPLATE_VERSION}, inputDigest=${inputDigest.slice(0, 19)}…`);

  return {
    body,
    hash: sha256(body),
    inputs: inputs.map((i) => `${i.path}@${i.hash}`).concat([`template@${TEMPLATE_VERSION}`]),
    templateVersion: TEMPLATE_VERSION,
    mode: "deterministic",
  };
}
