import type { CompositeProposal } from "./scan.js";

export function renderMarkdown(p: CompositeProposal): string {
  const lines: string[] = [];
  lines.push(`# skillfit scan — ${p.workspace}`);
  lines.push("");
  lines.push(`**Scanned:** ${p.scannedAt}`);
  lines.push(`**Stacks:** ${p.stacks.length === 0 ? "_(none)_" : p.stacks.join(", ")}`);
  if (p.noise.length > 0) {
    lines.push("");
    lines.push("**Noise flags:**");
    for (const n of p.noise) lines.push(`- ${n.reason}`);
  }
  lines.push("");
  lines.push("## Proposed composite skill");
  lines.push("");
  lines.push("```yaml");
  lines.push("---");
  lines.push(`name: ${p.proposedSkillName}`);
  lines.push(`description: ${escapeYamlScalar(p.description)}`);
  lines.push(`type: project`);
  lines.push("---");
  lines.push("```");
  lines.push("");
  lines.push("### Body draft");
  lines.push("");
  lines.push(p.bodyDraft);
  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  if (p.inputs.length === 0) {
    lines.push("_No rule files found._");
  } else {
    lines.push("| path | status | sha256 |");
    lines.push("|------|--------|--------|");
    for (const i of p.inputs) {
      lines.push(`| \`${i.path}\` | ${i.status} | ${i.hash.slice(0, 19)}… |`);
    }
  }
  lines.push("");
  lines.push("## Candidate dependency skills");
  lines.push("");
  if (p.candidates.length === 0) {
    lines.push("_No candidates detected._");
  } else {
    lines.push("| id | stack | evidence |");
    lines.push("|----|-------|----------|");
    for (const c of p.candidates) {
      lines.push(`| \`${c.id}\` | ${c.stack} | ${c.evidence} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderJson(p: CompositeProposal): string {
  return JSON.stringify({ version: 1, ...p }, null, 2);
}

function escapeYamlScalar(s: string): string {
  if (/[:#\n]/.test(s)) return JSON.stringify(s);
  return s;
}
