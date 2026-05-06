# skillfit PRD

## Problem

Curated skill installers (autoskills) detect stack from `package.json` and ship a fixed skill bundle. Two gaps:

1. **False positives.** Deps in lockfile but not imported → skill installed for unused tech. Pollutes the agent's context.
2. **No repo-local rules.** Each repo has its own conventions in `CLAUDE.md`, `AGENTS.md`, etc. A generic skill can't honor them.

## Users

- Engineers running Claude Code / Cursor / Copilot in monorepos with their own conventions.
- Tech leads who maintain `CLAUDE.md` and want it materialized as a skill the agent reliably follows.
- Teams that want a CI gate for "the agent's instructions match the repo's intent."

## Non-goals (MVP)

- Pain-driven skill selection (git-log + CI failure analysis) — phase 2.
- Multi-language probe (Go, Python, Rust) — phase 2.
- Multi-target emit (Cursor, Copilot, AGENTS.md) — phase 2; MVP emits `.claude/skills/` only.
- LLM-driven synthesis — MVP uses deterministic distillation; LLM mode is feature-flagged for v0.2.
- Real autoskills shell-out — MVP ships a built-in stack detector that mirrors autoskills' mappings; integration boundary documented in RELEASE_CHECKLIST.md.

## User stories

1. **First-time install.** `npx skillfit init` in a TS/JS repo detects React, Zod, Tailwind in `package.json`. Probe shows Tailwind not imported. skillfit drops Tailwind, writes React + Zod skill placeholders, synthesizes a `repo-rules` skill from `CLAUDE.md`, asks for review.
2. **Review.** `npx skillfit review` shows a unified diff of the synthesized skill vs the previously-approved version (or empty on first run). User approves; lockfile records `approvedAt` + `approvedHash`.
3. **CI gate.** `npx skillfit check` runs in CI. If the user edits `CLAUDE.md`, the input hash changes, synthesis output changes, drift is detected. Exit 1 forces a human to re-review.

## Success criteria for RC

- `init` end-to-end on a fixture in <500ms cold.
- `review` produces a readable unified diff and requires explicit approval.
- `check` exit code drives CI correctly: 0 = matched, 1 = drifted.
- All three commands run with no network access (deterministic synthesis path).
- No false-negative drops: skill detection mappings in `bootstrap.ts` match autoskills' top-level mappings (see RELEASE_CHECKLIST.md for the integration test plan).
- 12+ unit tests passing on Node 22+.

## Acceptance test (smoked)

Sample fixture at `test/fixtures/sample-repo`:
- `package.json` with `react`, `zod`, `tailwindcss`, `vitest`.
- `src/app.tsx` imports `react` + `zod` only.
- `CLAUDE.md` with rules.

Expected after `init`:
- `.claude/skills/react.md` written.
- `.claude/skills/zod.md` written.
- `tailwind` and `vitest` in `lock.dropped`.
- `repo-rules` in lock with `approvedHash` unset.
- `check` exit 1.

After `review --yes`:
- `.claude/skills/repo-rules.md` written.
- `repo-rules.approvedHash === repo-rules.hash`.
- `check` exit 0.

After editing `CLAUDE.md`:
- `check` exit 1 with drift message.

All four states verified in `test/init.test.ts` and the smoke run in `RELEASE_CHECKLIST.md`.
