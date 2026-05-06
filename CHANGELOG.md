# Changelog

## v0.1.0-rc.1 — 2026-05-06

Initial release candidate. MVP scope.

### Added
- `init` command: bootstrap → probe → drop unused → synthesize → emit + lock.
- `review` command: unified-diff approval gate for synthesized `repo-rules` skill.
- `emit` command: re-emit currently-approved skills from lockfile.
- `check` command: CI gate; exit 1 on synthesis drift.
- TS/JS regex-based import probe (`src/probe.ts`).
- Built-in stack detector mirroring autoskills' top-level mappings (`src/bootstrap.ts`).
- Deterministic synthesis from `CLAUDE.md`/`AGENTS.md`/`agent_rules.md`/`.cursor/rules`.
- Lockfile schema v1 with `verified | local` origin model.
- `.claude/skills/` emit target.
- 12 unit + integration tests.

### Known limitations
- autoskills shell-out is stubbed; built-in detector ships as the integration boundary. See `docs/RELEASE_CHECKLIST.md`.
- autoskills-origin skills emit placeholder bodies; real registry passthrough is RC-2 work.
- LLM-backed synthesis not yet shipped (v0.2).
- Pain-driven selection not yet shipped (v0.3).
- Multi-language probe not yet shipped (v0.4).
- Multi-target emit (Cursor, Copilot, AGENTS.md) not yet shipped (v0.5).

### Not for npm publish
RC-1 is internal/preview only. Public npm publish gated on RC-2 (real autoskills integration).
