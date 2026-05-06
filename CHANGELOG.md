# Changelog

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
