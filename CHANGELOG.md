# Changelog

## v0.3.0-rc.1 — 2026-05-07

Folds in features from the codex Python prototype (`local-skill-curator`)
so skillfit can replace it as canonical.

### Added
- **Recommendations engine** (`src/recommendations.ts`):
  `skip` / `blocked` / `adapt` actions, each with `id`, `target`,
  `reason`, `source`, `rollback`. Output as `proposal.recommendations`.
- **Instruction-topology probe**: detects `agent_rules.md` canonical +
  `AGENTS.md`/`CLAUDE.md` symlinks layout. Outputs as
  `proposal.instructionTopology`. Drives the `skip` (unified) vs
  `blocked` (un-unified) recommendation for `local/shared-agent-rules`.
- **`generator-jp` boundary rec**: emits `blocked` when scanning a
  workspace that contains a `generator-jp/` directory; surfaces the
  CLAUDE.md hard rule against generated agent config there.
- **C# detector**: scans for `*.csproj` / `*.sln` at depth ≤2; emits
  `csharp` stack + candidate.
- **Ruby detector**: `Gemfile` or any `.rb` file → `ruby` stack +
  candidate.
- **Apps Script detector**: `appsscript.json` at depth ≤3 → `apps-script`
  stack + candidate.
- Unity refinements: `unity-anima2d` via `Assets/Anima2D/` directory
  heuristic; `unity-assetbundle-browser` package id mapping.
- Markdown render: new `## Instruction topology` and `## Recommendations`
  tables with explicit "curator never installs" footnote.

### Changed
- `gatherInputs` (synthesize) now prefers real files over symlinks when
  multiple paths share content. Fixes canonical selection on the livly
  pattern (agent_rules.md = canonical, AGENTS.md/CLAUDE.md = symlinks).

### Verified on livly
- `client-uk`: stacks `[unity, csharp]`, 21 candidates, topology shows
  AGENTS.md + CLAUDE.md as files (not symlinks), so `local/shared-agent-rules`
  recs as `blocked`. Stack adapt recs for unity + csharp.
- `server-uk`: stacks `[go, infra]`, topology shows
  `agent_rules.md` canonical + AGENTS/CLAUDE symlinks, so `skip` rec for
  shared-agent-rules. Stack adapt recs for go + infra.
- `gas-uk`: `apps-script` detected (was 0 in v0.2).
- `tools-uk`: now reports both `python` + `ruby` (was just python in v0.2).
- Umbrella `livly/`: `boundary/generator-jp` blocked rec fires.
- 18/18 tests pass. Zero files written across all scans.

### Position vs codex prototype
With these features ported, codex's Python `local-skill-curator` is
obsolete. Skillfit becomes canonical.

## v0.2.0-rc.1 — 2026-05-07

**Breaking pivot.** skillfit becomes a curator (dry-run reporter), not an installer.

### Removed
- `init` / `review` / `emit` / `check` commands.
- `skillfit-lock.json` (no persisted state).
- `.claude/skills/*.md` writes (no skill files generated).
- `src/lock.ts`, `src/emit/claude.ts`, all installer-era command files.

### Added
- `skillfit` (default cmd: `scan`): emits a single per-repo composite-skill proposal to stdout.
- `--format md|json` for human-readable or machine-parseable output.
- `--output <file>` writes one report file (otherwise stdout-only).
- `src/scan.ts` — composite proposal builder with caps (description ≤150 tok, body ≤1500 tok).
- `src/report.ts` — md + json renderers.
- Symlink-dup detection on rule-file inputs (R-014 closed): paths sharing a sha256 collapse to one canonical + flagged duplicates.
- Empty-input handling (R-015 closed): no rule files → `noise` flag + empty body section, no fake "approved" entry.

### Changed
- `synthesize.ts` returns the synthesis structure for in-memory consumption; no file writes.
- Description capped at ~150 tokens (session-start budget).
- Body draft capped at ~1500 tokens (lazy-load budget).

### Why
Two reasons emerged after curator-vs-installer review:
1. Per-dep skill files cost ~150 tok × N at every session-start. For Livly's monorepo (~30 candidate deps across repos), that's >4,500 tok of constant prompt surface for a side-channel concern.
2. Curator philosophy: skillfit detects + reports; user decides what to install. Installation is downstream (autoskills, manual, future tools). Conflating the two locks users into skillfit's opinion.

### Verification
- 14/14 tests pass on Node 22+.
- Smoke run on livly umbrella (8 repos) wrote zero files.
- client-uk: composite proposal `livly-client-uk` with 19 unity candidates, body 5,953 chars (~1,488 tok).
- server-uk: composite proposal `livly-server-uk` with 14 go + 1 docker candidates, 3 inputs (1 present, 2 symlink-dup).

## v0.1.0-rc.1 — 2026-05-06 (superseded)

Initial installer-shaped release candidate. Replaced by curator pivot.
