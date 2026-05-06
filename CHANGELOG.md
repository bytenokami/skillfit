# Changelog

## v0.4.0-rc.2 — 2026-05-07

Principal-engineer review fixes for the install MVP. Five issues — two blocking, three pre-1.0 hardening. All fixed.

### Fixed (blocking)
- **#1 On-disk drift detection** (`src/install/core.ts`). Sidecar now records `bodyHash`; on re-install, the on-disk SKILL.md is re-read and hashed. Mismatch → new `blocked-drift` status, requires `--force`. Closes the silent-stale-skill case where a user (or attacker) hand-edits SKILL.md and skillfit reports `unchanged`.
- **#3 YAML scalar escaping** (`src/install/core.ts`). `description`, `workspace`, `scanned-at`, and any non-trivial `name` now go through unconditional `JSON.stringify` (i.e. double-quoted YAML scalars). Previous regex narrow-quoted only `[:#\n]`, so a repo named `--- weird` or `| pipe` would corrupt frontmatter. New test exercises a fixture with `:` and `---` in the directory name.

### Fixed (hardening)
- **#2 Atomic two-write install** (`src/install/core.ts`). Both files written to `<name>.tmp-<pid>` first, sidecar renamed into place before SKILL.md, with cleanup of any tmp file on error. Crash mid-install no longer leaves an orphan SKILL.md without sidecar (loaders won't see a half-installed skill).
- **#4 Installer version fail-fast** (`src/cli.ts`). Removed the `"0.0.0-unknown"` fallback. `readVersion` now throws if `package.json` cannot be located. Sidecars are guaranteed to record a real installer identity per `installedBy`.
- **#5 Symlink-escape rejection on install root** (`src/install/core.ts`). After `mkdir`, the install root's `realpath` is computed. If no `--*-root` override was passed and the resolved path escapes `os.homedir()`, install throws `SymlinkEscapeError`. Override-mode skips the check by design (user intentionally pointed at an arbitrary path, e.g. `/tmp/...` for tests).

### Added
- New `InstallStatus` values: `blocked-drift`, `blocked-symlink-escape`. CLI surfaces both with `log.warn` and exit code 1.
- 5 new tests (`test/install.test.ts`):
  - `install detects on-disk drift (file edited locally) — issue #1`
  - `install leaves no .tmp- artifacts on success — issue #2`
  - `YAML frontmatter is robust to nasty repo names (issue #3)`
  - `symlink-escape on installRoot is rejected (issue #5)`
  - `sidecar contains bodyHash distinct from proposalHash`

### Verified
- 40/40 tests pass on Node 22+.
- Live: tampering with `/tmp/.../SKILL.md` after install correctly blocks with `! claude: blocked (on-disk drift). ...`, exit 1. `--force` overrides cleanly.
- Sidecar now contains both `proposalHash` (input drift signal) and `bodyHash` (file drift signal).
- `node dist/cli.js --version` prints `0.4.0-rc.2`.

### Architecture concern (still deferred)
Per-target adapters (claude.ts, codex.ts) are 30-line shims duplicating the install pipeline. As targets grow (cursor, aider, etc.) refactor to a data-driven `InstallTarget` registry. Tracked for future RC; not blocking 0.4.

## v0.4.0-rc.1 — 2026-05-07

Adds the opt-in installer. Curator surface unchanged; new `install` command writes one self-contained directory per repo for either Claude Code or Codex CLI. Verified by parallel format-compliance reviewers (claude-code-guide + general-purpose).

### Added
- **`skillfit install --target claude|codex|both`** new command. Runs the same scan pipeline, then writes the resulting composite proposal as a single SKILL.md directory.
- **Claude target (`src/install/claude.ts`)** — writes to `<cwd>/.claude/skills/<name>/SKILL.md` (project scope) or `~/.claude/skills/<name>/SKILL.md` (`--scope user`). Live-watched by Claude Code; no restart needed.
- **Codex target (`src/install/codex.ts`)** — writes to `~/.agents/skills/<name>/SKILL.md` per Codex CLI's user-scope discovery convention. Codex has no project-scope skill discovery; user must restart Codex CLI to pick up.
- **Sidecar lockfile** `<dir>/.skillfit.lock.json` records `proposalHash`, `installedBy`, `installedAt`, `skillName`, `workspace`. Loaders ignore non-`SKILL.md` files in skill dirs (verified live for both Claude and Codex).
- **Idempotency** — re-running install with no proposal change is a no-op (status: `unchanged`).
- **Conflict detection** — install blocks on existing foreign files (no sidecar) or hash mismatch (sidecar present but proposalHash differs). `--force` overrides.
- **Common shape both targets** — frontmatter with `name`, `description`, `metadata.{source,workspace,scanned-at,stacks,candidates}`. Body is the curator's composite body draft (≤1500 tok).

### Changed
- `capString` in `src/scan.ts` now truncates at the nearest newline or sentence boundary instead of mid-character. Verified live: server-uk's body now ends at a complete bullet line + blank line + truncation marker.
- Dropped `type: project` from emitted frontmatter — it's not a documented Claude or Codex frontmatter key, was ignored by both loaders, but added noise. Removed for canonical compliance.

### Tests added (11)
- `install claude writes SKILL.md + sidecar in target dir`
- `install codex writes SKILL.md + sidecar (same shape, different default root)`
- `re-running install with same proposal is unchanged (idempotent)`
- `install blocks on foreign file without --force`
- `install blocks on hash conflict when proposal changes (without --force)`
- `proposalHash is deterministic + sensitive to candidate changes`
- `buildSkillBody YAML frontmatter is well-formed (parseable name + description)`
- `sidecar contains version, hash, name, workspace`
- `default Claude root resolves to .claude/skills/ in workspace (project scope)`
- `default Codex root resolves to ~/.agents/skills/`
- `sidecar filename is .skillfit.lock.json`

### Verified
- 35/35 tests pass on Node 22+.
- MVP install on `livly-server-uk` to tmp dirs for both targets succeeded.
- Idempotent re-run, foreign-file block, force-override, proposal-change block all live-verified.
- Parallel reviewer agents (Claude format spec, Codex format spec): both PASS.
- Claude reviewer flagged: frontmatter and body well-formed; sidecar ignored; ~1500 tok at session-load (right at body cap, intentional).
- Codex reviewer flagged: layout matches `~/.agents/skills/<name>/SKILL.md`; required keys present; sidecar ignored; cross-skill references treated as plain text (acceptable — composite is a router, deep skills loaded on demand).

### Decisions made unilaterally as EM
- Two thin adapters, not a shared "generated artifact" abstraction. Frontmatter+body happen to be format-compatible across Claude and Codex today, but path layout, scope semantics, and discovery model diverge. Two adapters preserve flexibility when the formats inevitably drift.
- Codex installs only to user scope (`~/.agents/skills/`). No project-scope Codex install until OpenAI documents one.
- Sidecar lives inside the skill dir (`<dir>/.skillfit.lock.json`) instead of central registry. Self-contained dirs survive moves; central registry creates state-sync hazards.
- `skillfit install` is gated on `--target`; the curator default (no command) stays dry-run.

## v0.3.0-rc.3 — 2026-05-07

Principal-engineer review fixes — five issues, three blocking.

### Fixed (blocking)
- **`content-dup` status added; `symlink-dup` no longer mislabels real
  duplicate files** (`src/scan.ts`). Verified live on `client-uk` where
  `AGENTS.md` and `CLAUDE.md` are regular files with identical bytes
  and were previously reported as `symlink-dup`. New status taxonomy:
  `present | empty | unparseable | symlink-dup | content-dup`. Status
  no longer contradicts the topology rec.
- **Body-cap noise flag now actually fires** (`src/scan.ts`). Truncation
  signal was computed against the *post-cap* string, so the inequality
  was unreachable. Fix: capture `truncated = capTokens(rawBody) >= cap`
  before `capString`, then push the noise entry. Live runs against
  oversized rule files now carry the warning.
- **`dist/` cleaned + dead `diff` dep dropped** (`package.json`).
  Previous `tsc` invocations did not clean `outDir`, so removed
  `commands/` and `emit/` modules from the curator-pivot lingered in
  the published tarball, dragging the `diff` runtime dependency in
  through `dist/commands/review.js`. Added `prebuild: rm -rf dist`,
  removed `diff` and `@types/diff`. Tarball now contains only
  bootstrap / cli / probe / recommendations / report / scan /
  synthesize + util.

### Fixed (ticketable, also done)
- **Topology vs synthesize rule-file set unified** (`src/synthesize.ts`,
  `src/recommendations.ts`). `CANDIDATE_RULE_FILES` is exported from
  synthesize and consumed by recommendations to derive
  `RULE_FILE_NAMES`. Single source of truth.
- **Topology unification check now root-only** (`src/recommendations.ts`).
  Nested `AGENTS.md` files in subprojects no longer poison the
  unification decision; the check filters topology to
  `path.dirname(t.path) === "."` before voting.
- **Go v2 sub-package classification fixed** (`src/bootstrap.ts`).
  `matchGoStack` now sorts known module prefixes by length
  descending, so `github.com/aws/aws-sdk-go-v2/service/s3` correctly
  hits `go-aws-sdk-v2` instead of `go-aws-sdk-v1`.

### Added tests
- `content-dup distinct from symlink-dup (issue #1)`
- `body cap noise flag fires on oversized rule input (issue #2)`
- `Go v2 sub-package classified as v2, not v1 (issue #5)`
- `nested AGENTS.md does not break root unification check (issue #4)`

### Verified
- 24/24 tests pass.
- `node dist/cli.js --version` prints `0.3.0-rc.3`.
- `dist/` has only live modules; no `commands/` or `emit/` dead dirs.
- `node_modules` has zero non-dev deps.
- client-uk live: AGENTS.md=present, CLAUDE.md=content-dup, recs
  correctly emit `blocked` for `local/shared-agent-rules` (not skip).

### Architecture concern (not addressed in this rc)
The hand-coded `*_STACK` records in `src/bootstrap.ts` will become a
merge-conflict magnet as ecosystems grow. Pull the registry into a
JSON file and share one walker between detectors. Tracked for v0.4.

## v0.3.0-rc.2 — 2026-05-07

Review fixes from the codex review of v0.3.0-rc.1.

### Fixed
- **CLI version drift (blocking).** `src/cli.ts` no longer hardcodes
  the version. Reads from `package.json` at runtime via
  `import.meta.url`-relative resolution. New test `CLI --version
  reports package.json version (no drift)` runs the built CLI and
  asserts the output matches `package.json`. Closes the v0.3.0-rc.1
  ship blocker where `--version` printed `0.2.0-rc.1`.
- **Topology skip false-positive (blocking).** `unifiedTopology` in
  `recommendations.ts` now requires `AGENTS.md` and `CLAUDE.md` to
  actually `realpath` to the canonical `agent_rules.md`, not just
  be symlinks. New test `topology skip rec requires symlinks to
  resolve to canonical agent_rules.md` exercises a fixture where
  the symlinks point to a decoy file. The rec must be `blocked`,
  never `skip`, in that case.
- **Markdown rollback column (polish).** `## Recommendations` table
  in markdown output now includes the `rollback` field so the human
  default surface no longer drops a useful column relative to JSON.
- **README stale (polish).** Stack list extended (csharp, ruby,
  apps-script) and JSON shape updated to include
  `instructionTopology[]` and `recommendations[]`.

### Verified
- 20/20 tests pass.
- `node dist/cli.js --version` prints `0.3.0-rc.2`.
- Recommendations table renders with rollback column in markdown.

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
