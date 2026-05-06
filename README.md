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

1. Detects stack(s): TS/JS, Unity, Go, Python, Infra (Jenkins / Docker / Terraform).
2. Scans rule files: `CLAUDE.md`, `AGENTS.md`, `agent_rules.md`, `.cursor/rules`. Classifies each: `present | empty | unparseable | symlink-dup`.
3. Distills a thin composite-skill draft scoped per-repo (`livly-<repo>`):
   - 100–150 token description
   - ≤1500 token body (identity → rule summary → stack inventory → deep-dive references)
   - Candidate dep skill ids with evidence
4. Prints to stdout (markdown by default) or `--output <file>`.

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
  "proposedSkillName": "livly-...",
  "description": "...",
  "bodyDraft": "...",
  "inputs": [...],
  "candidates": [...],
  "stacks": [...],
  "noise": [...]
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
