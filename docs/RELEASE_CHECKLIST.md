# Release checklist — v0.1.0-rc.1

## RC sign-off criteria

All boxes must be checked before promoting to `v0.1.0`.

### Code quality

- [x] `npm run typecheck` passes (no errors).
- [x] `npm test` passes (12/12).
- [x] `npm run build` produces `dist/cli.js` with executable bit.
- [x] `node dist/cli.js --help` prints usage.

### End-to-end smoke (manual)

Run on a fresh copy of `test/fixtures/sample-repo`:

- [x] `init` writes `skillfit-lock.json` with `react`, `zod`, `repo-rules` skills.
- [x] `init` drops `tailwind` and `vitest` (declared but not imported).
- [x] `init` writes `.claude/skills/react.md` and `.claude/skills/zod.md`.
- [x] `init` does NOT write `.claude/skills/repo-rules.md` (pending approval).
- [x] `check` exits 1 (no approval).
- [x] `review --yes` writes `.claude/skills/repo-rules.md` and stamps `approvedHash`.
- [x] `check` exits 0 (post-approval).
- [x] Editing `CLAUDE.md` flips `check` back to exit 1.

### Documentation

- [x] `README.md` covers install, use, status.
- [x] `docs/PRD.md` defines problem, non-goals, acceptance.
- [x] `docs/ARCHITECTURE.md` covers pipeline, modules, trust model, lockfile schema.
- [x] `docs/RISK_REGISTER.md` captures known risks.
- [x] `docs/ROADMAP.md` lists phase 2+.
- [x] `LICENSE` present (MIT).

### Boundary work explicitly deferred

These are documented integration boundaries the RC does not own. Each has an RC-2 ticket.

- [ ] **autoskills shell-out.** MVP uses a built-in detector mirroring autoskills' top-level mappings (`src/bootstrap.ts`). When autoskills exposes a stable `--dry-run --json` contract, swap implementation. Until then, every autoskills release must be reviewed against `STACK_TO_SKILL` for divergence.
- [ ] **Real skill bodies.** MVP emits placeholder skill bodies for autoskills-origin skills. Real bodies require either bundling the registry into skillfit's tarball (license review needed) or shelling out at install time. Decision pending.
- [ ] **Pinned autoskills version.** `PINNED_AUTOSKILLS_VERSION = "0.x"` is a stub. Pin a concrete version + add an integration test against it once shell-out lands.
- [ ] **Multi-target emit.** `.cursor/rules`, `AGENTS.md`, `.github/copilot-instructions.md` are out of MVP scope. Each is a permanent on-call surface and gets its own RC.

### Ship blockers — pre-tag

- [ ] CI workflow (`.github/workflows/ci.yml`) running typecheck + test on Node 22 + macOS + Linux.
- [ ] `npm publish --dry-run` clean (verify `files` field excludes test fixtures).
- [ ] CHANGELOG.md created with v0.1.0-rc.1 entry.
- [ ] Tagged commit `v0.1.0-rc.1` after final smoke.

### Release procedure

1. `npm version 0.1.0-rc.1` (already set in `package.json`; tag commit manually).
2. `git tag v0.1.0-rc.1 && git push origin v0.1.0-rc.1`.
3. Cut GitHub release with link to `docs/ROADMAP.md` for the path forward.
4. **Do not publish to npm** until autoskills integration boundary closed (see deferred items). RC-1 is internal/preview only.

## Post-RC monitoring (first 7 days)

- Watch for upstream autoskills schema changes; subscribe to releases via `gh repo watch midudev/autoskills`.
- Collect first-user diffs on `repo-rules` synthesis quality. If synthesis quality is low on real `CLAUDE.md` files (>3 unique reports of "wrong rule extracted"), promote LLM-backed synthesis from phase 2 into v0.2.

## Verification log

End-to-end smoke executed 2026-05-06:
- `init` on sample fixture: 4 candidates, 2 dropped, 3 in lock, 2 emitted. Pending repo-rules approval.
- `check` (pre-approval): exit 1.
- `review --yes`: approved, 3rd skill emitted.
- `check` (post-approval): exit 0.
- `CLAUDE.md` edit: `check` → exit 1 (drift).
- All 12 unit tests pass on Node v25.9.0.
