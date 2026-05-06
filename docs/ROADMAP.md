# Roadmap

## v0.1.0-rc.1 (this release)

Shipped in MVP:
- TS/JS probe (regex import counter)
- Bootstrap (built-in detector mirroring autoskills mappings)
- Deterministic synthesis from `CLAUDE.md` / `AGENTS.md` / `agent_rules.md` / `.cursor/rules`
- Lockfile (v1) with `verified | local` origin model
- `init`, `review`, `emit`, `check` commands
- `.claude/skills/` emit only
- Drift gate (CI-callable)

## v0.1.0 (post-RC, internal use)

Close RC-2 boundary items:
- Real autoskills shell-out (when upstream exposes stable JSON contract) OR vendor a pinned autoskills snapshot.
- Pin a concrete autoskills version + CI integration test against it.
- Real skill bodies for autoskills-origin skills (currently placeholders).
- CI workflow on Node 22 + macOS + Linux.
- npm publish.

## v0.2 — LLM-backed synthesis

- Optional Anthropic API call for synthesis. Feature-flagged via `SKILLFIT_LLM_MODEL`.
- Output hashed; cache keyed on `(inputs, model, template)`. Re-running with same inputs + same model + same template = byte-identical output.
- Promote from phase 2 to v0.2 only if real-user data shows deterministic distillation misses important rules in >10% of repos.

## v0.3 — Pain-driven priority

- Local pain signals: `git log --since=30d`, `gh run list --status=failure`, TODO/FIXME density.
- Map pain → curated `skillfit-registry` of pain-skills (separate registry, separate audit pipeline).
- New origin: `verified` from `skillfit-registry` source.
- Hard requirement: registry has its own SHA-256 manifest + PR-review gating before any pain-skill ships.

## v0.4 — Multi-language probe

Order (per EM review):
1. **Python** — `ast` stdlib, larger AI-tooling user base, messier deps.
2. **Go** — `go list ./... -json`.
3. **Rust** — `cargo metadata` + ripgrep on `use`.

Each language adds its own `STACK_TO_SKILL` map and a probe module. Same `verified | local` trust model.

## v0.5 — Multi-target emit

Each target = permanent on-call surface. Adding one is a maintenance commitment, not a feature pickup.

Order:
1. `AGENTS.md` block (markdown injection).
2. `.cursor/rules/*.mdc`.
3. `.github/copilot-instructions.md`.

Single canonical skill schema → per-target transpilers. Lockfile semantics shared across targets.

## v0.6+ (deferred / speculative)

- Conflict resolver across two registries.
- `skillfit suggest` opens a PR with proposed diff.
- `skillfit why <skill>` prints scoring trace.
- Workspace-aware monorepo detection.
- AST-based probe (replace regex).

## Explicitly **not** on the roadmap

- Replacing autoskills. skillfit is an overlay; if autoskills' detection improves, we shrink.
- Building our own model fine-tuned for synthesis. Use Anthropic API.
- A web UI. CLI + lockfile is the entire surface.
