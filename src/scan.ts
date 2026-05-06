import path from "node:path";
import { lstatSync } from "node:fs";
import { bootstrap, type BootstrapCandidate, type StackKind } from "./bootstrap.js";
import { synthesize, gatherInputs, type SynthesizeInput } from "./synthesize.js";
import { sha256 } from "./util/hash.js";

export type InputStatus = "present" | "empty" | "unparseable" | "symlink-dup";

export interface InputRecord {
  path: string;
  hash: string;
  status: InputStatus;
}

export interface CandidateRef {
  id: string;
  evidence: string;
  stack: StackKind;
}

export interface CompositeProposal {
  workspace: string;
  scannedAt: string;
  proposedSkillName: string;
  description: string;
  bodyDraft: string;
  inputs: InputRecord[];
  candidates: CandidateRef[];
  stacks: StackKind[];
  noise: { reason: string }[];
}

const MAX_BODY_TOKENS = 1500;
const MAX_DESCRIPTION_TOKENS = 150;
const APPROX_CHARS_PER_TOKEN = 4;

export async function runScan(repoRoot: string): Promise<CompositeProposal> {
  const resolved = path.resolve(repoRoot);
  const repoName = path.basename(resolved);

  const boot = await bootstrap(resolved);
  const rawInputs = await gatherInputs(resolved);
  const inputs = classifyInputs(rawInputs, resolved);

  const synth = await synthesize(resolved);

  const candidates: CandidateRef[] = boot.candidates.map((c: BootstrapCandidate) => ({
    id: c.id,
    evidence: c.reason,
    stack: c.stack,
  }));

  const proposedSkillName = `livly-${repoName.toLowerCase()}`;
  const description = buildDescription(repoName, boot.stacks, inputs, candidates);
  const bodyDraft = buildBodyDraft({
    repoName,
    workspace: resolved,
    stacks: boot.stacks,
    inputs,
    candidates,
    ruleSummary: extractRuleSummary(synth.body),
  });

  const noise: { reason: string }[] = [];
  if (boot.stacks.length === 0 && inputs.length === 0) {
    noise.push({ reason: "no rule files and no recognized stack — composite proposal would be empty" });
  }
  if (capTokens(bodyDraft) >= MAX_BODY_TOKENS) {
    noise.push({ reason: `body draft hit ~${MAX_BODY_TOKENS} token cap; truncated` });
  }

  return {
    workspace: resolved,
    scannedAt: new Date().toISOString(),
    proposedSkillName,
    description,
    bodyDraft,
    inputs,
    candidates,
    stacks: boot.stacks,
    noise,
  };
}

function classifyInputs(rawInputs: SynthesizeInput[], repoRoot: string): InputRecord[] {
  const byHash = new Map<string, number>();
  for (const i of rawInputs) byHash.set(i.hash, (byHash.get(i.hash) ?? 0) + 1);

  const seen = new Set<string>();
  const out: InputRecord[] = [];
  for (const input of rawInputs) {
    let status: InputStatus;
    const trimmed = input.content.trim();
    if (trimmed.length === 0) {
      status = "empty";
    } else if (isSymlink(path.join(repoRoot, input.path)) && (byHash.get(input.hash) ?? 0) > 1 && seen.has(input.hash)) {
      status = "symlink-dup";
    } else if ((byHash.get(input.hash) ?? 0) > 1 && seen.has(input.hash)) {
      status = "symlink-dup";
    } else {
      status = "present";
    }
    seen.add(input.hash);
    out.push({ path: input.path, hash: input.hash, status });
  }
  return out;
}

function isSymlink(fullPath: string): boolean {
  try {
    return lstatSync(fullPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function buildDescription(
  repoName: string,
  stacks: StackKind[],
  inputs: InputRecord[],
  candidates: CandidateRef[],
): string {
  const stackLabel = stacks.length === 0 ? "no recognized stack" : stacks.join(" + ");
  const ruleHint = inputs.length === 0 ? "no rule files" : `rules from ${inputs.filter((i) => i.status === "present").map((i) => i.path).join(", ") || "(none usable)"}`;
  const topCandidates = candidates.slice(0, 5).map((c) => c.id).join(", ");
  const more = candidates.length > 5 ? `, +${candidates.length - 5} more` : "";
  const desc = `Composite proposal for ${repoName} (${stackLabel}). ${ruleHint}. Detected: ${topCandidates || "(no deps)"}${more}. Use this skill for tasks scoped to the ${repoName} repository; load deeper per-library skills on demand.`;
  return capString(desc, MAX_DESCRIPTION_TOKENS);
}

function buildBodyDraft(args: {
  repoName: string;
  workspace: string;
  stacks: StackKind[];
  inputs: InputRecord[];
  candidates: CandidateRef[];
  ruleSummary: string;
}): string {
  const { repoName, stacks, inputs, candidates, ruleSummary } = args;
  const stackLabel = stacks.length === 0 ? "(none)" : stacks.join(", ");

  const inventoryByStack = new Map<StackKind, CandidateRef[]>();
  for (const c of candidates) {
    const list = inventoryByStack.get(c.stack) ?? [];
    list.push(c);
    inventoryByStack.set(c.stack, list);
  }

  const inventoryLines: string[] = [];
  for (const [stack, items] of inventoryByStack) {
    inventoryLines.push(`### ${stack}`);
    for (const c of items) {
      inventoryLines.push(`- \`${c.id}\` — ${c.evidence}`);
    }
  }

  const inputsBlock = inputs.length === 0
    ? "_No rule files found in this repository._"
    : inputs.map((i) => `- \`${i.path}\` (${i.status}, ${i.hash.slice(0, 19)}…)`).join("\n");

  const referencesBlock = candidates.length === 0
    ? "_No deeper skills to reference (no candidates detected)._"
    : candidates.map((c) => `- For tasks involving \`${c.evidence}\`: invoke skill \`${c.id}\``).join("\n");

  const ruleSection = ruleSummary || "_(no rule files; nothing to summarize)_";

  const body = `# livly-${repoName.toLowerCase()}

## Repo identity

- Repository: \`${repoName}\`
- Stacks detected: ${stackLabel}
- Inputs: ${inputs.length} rule file(s)

## Repo rule summary

${ruleSection}

## Stack inventory

${inventoryLines.join("\n") || "_(no candidates)_"}

## Deep-dive references

When a task touches a specific dependency, load the referenced skill on demand. The composite stays thin; deep guidance lives in per-library skills.

${referencesBlock}

## Inputs

${inputsBlock}

---
*Curator output. Not installed. Copy the relevant sections into your skill registry if you choose to install.*`;

  return capString(body, MAX_BODY_TOKENS);
}

function extractRuleSummary(synthBody: string): string {
  const lines = synthBody.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Distilled rules/i.test(l));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  const slice = lines.slice(start + 1, end < 0 ? lines.length : end).join("\n").trim();
  return slice;
}

function capString(s: string, maxTokens: number): string {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 80) + "\n\n…[truncated to ~" + maxTokens + " token cap]";
}

function capTokens(s: string): number {
  return Math.ceil(s.length / APPROX_CHARS_PER_TOKEN);
}
