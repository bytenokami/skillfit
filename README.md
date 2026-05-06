# skillfit

> Composite-skill curator for AI agents. **Dry-run only.** Scans a workspace, prints a proposed per-repo composite-skill definition, never installs.

```bash
npx skillfit                              # scan current dir, print to stdout
npx skillfit --cwd /path/to/repo
npx skillfit --format json
npx skillfit --output report.md           # write single report file
```

## What it does

For one workspace:

1. Detects stack(s): TS/JS, Unity, Go, Python, C#, Ruby, Apps Script, Infra (Jenkins / Docker / Terraform).
2. Scans rule files: `CLAUDE.md`, `AGENTS.md`, `agent_rules.md`, `.cursor/rules`. Classifies each: `present | empty | unparseable | symlink-dup`.
3. Distills a thin composite-skill draft scoped per-repo (`livly-<repo>`):
   - 100–150 token description
   - ≤1500 token body (identity → rule summary → stack inventory → deep-dive references)
   - Candidate dep skill ids with evidence
4. Probes instruction topology: detects whether `AGENTS.md`/`CLAUDE.md` are symlinks resolving to a canonical `agent_rules.md`. Drives `skip` vs `blocked` recs on `local/shared-agent-rules`.
5. Emits recommendations: `skip` / `blocked` / `adapt` actions with rollback notes. Includes a `boundary/generator-jp` blocked rec when the workspace contains `generator-jp/`.
6. Prints to stdout (markdown by default) or `--output <file>`.

## What it never does

- Never installs skills.
- Never writes per-dependency skill files.
- Never edits `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, hooks, or any agent config.
- Never creates a lockfile.

The user decides what to do with the report.

## Install (dev)

```bash
git clone <this-repo>
cd skillfit
npm install
npm run build
npm test
```

## Output shape

Markdown (default):

```markdown
# skillfit scan — /path/to/repo

**Stacks:** unity

## Proposed composite skill
```yaml
---
name: livly-client-uk
description: Composite proposal for client-uk (unity)…
type: project
---
```

### Body draft
[≤1500 token thin router with stack inventory + rule summary + dep pointers]

## Inputs
| path | status | sha256 |
|------|--------|--------|

## Candidate dependency skills
| id | stack | evidence |
|----|-------|----------|
```

JSON (`--format json`):

```json
{
  "version": 1,
  "workspace": "...",
  "scannedAt": "ISO timestamp",
  "proposedSkillName": "livly-...",
  "description": "...",
  "bodyDraft": "...",
  "inputs": [
    { "path": "...", "hash": "sha256:...", "status": "present|empty|unparseable|symlink-dup" }
  ],
  "candidates": [
    { "id": "...", "evidence": "...", "stack": "ts|unity|go|python|csharp|ruby|apps-script|infra" }
  ],
  "stacks": ["..."],
  "noise": [{ "reason": "..." }],
  "instructionTopology": [
    { "path": "agent_rules.md", "kind": "file", "target": "" },
    { "path": "AGENTS.md", "kind": "symlink", "target": "agent_rules.md" }
  ],
  "recommendations": [
    {
      "action": "skip|blocked|adapt",
      "id": "...",
      "target": "...",
      "reason": "...",
      "source": "...",
      "rollback": "..."
    }
  ]
}
```

## Why composite, not per-dep

Per-dep installation = ~150 tokens × N skills loaded into every session-start. For a Unity repo with 19 detected packages that's ~3,000 extra tokens per session before any work happens.

Composite = one ~150-token description visible at session-start; deep per-library guidance loaded only when the agent invokes a specific lib skill.

## Why per-repo, not per-org

Repos with rule files that disagree on conventions (e.g. server-uk's tool-usage rules vs client-uk's) shouldn't share one composite. Per-repo scope prevents false merges.

## Status

`v0.2.0-rc.1` — curator-only release candidate. Not for npm publish until upstream registry contract (autoskills) stabilizes.

## License

MIT
