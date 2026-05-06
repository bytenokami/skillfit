# Risk register

Severity scale: **P0** = ship blocker, **P1** = address before v0.1.0, **P2** = phase 2.

| ID | Severity | Risk | Mitigation | Owner | Status |
|----|---------|------|-----------|-------|--------|
| R-001 | P1 | autoskills upstream churn breaks our skill-id mappings silently. | Pin autoskills version. CI integration test against pinned version. Document fork-and-vendor escape hatch. | maintainer | open (deferred to RC-2; tracked in RELEASE_CHECKLIST.md) |
| R-002 | P0 | Synthesis output is plausible-but-wrong on messy `CLAUDE.md`. Input-hash cache makes bad output sticky. | `skillfit review` requires explicit approval before emit. `approvedHash` blocks future writes until re-approval. | shipped | mitigated |
| R-003 | P1 | Multi-target emit (Cursor, Copilot, AGENTS.md) drift = permanent on-call surface. Each new target = lifetime support cost. | Defer to phase 2. MVP emits `.claude/skills/` only. New targets gated on a maintenance commitment review. | shipped | mitigated by scope cut |
| R-004 | P1 | LLM cost/non-determinism if synthesis ever upgrades from deterministic mode. | Cache synthesis output by input-hash. LLM mode is feature-flagged. Default ships off. | shipped | mitigated |
| R-005 | P2 | Skill-id collisions between autoskills and skillfit's own pain-skill registry (phase 2). | Topic taxonomy + pin escape hatch. Conflict resolver in phase 2. | future | deferred |
| R-006 | P2 | Probe regex misses non-static imports (e.g., `await import(name)`, dynamic `require(varName)`). False-negative drops. | Phase 2: replace regex with AST. MVP regex-only is documented. | future | deferred |
| R-007 | P0 | Lockfile version mismatch silently corrupts. | Throw on unknown version; force regeneration. No silent migration. | shipped | mitigated |
| R-008 | P1 | Path traversal via skill id when writing files. | `sanitizeId` strips everything except `[a-zA-Z0-9._-]` before filename use. | shipped | mitigated |
| R-009 | P2 | Symlink loops in `walk` could hang scan. | `readdir` `withFileTypes` follows by default; `MAX_FILE_BYTES` caps per-file but not depth. Phase 2: depth cap + symlink detection. | future | deferred |
| R-010 | P2 | `package.json` workspaces: monorepo-rooted scan misses workspace deps. | Phase 2: detect workspaces, scan each. MVP scans top-level package + walks all source. Acceptable miss for v0.1. | future | deferred |
| R-011 | P1 | License clarity for synthesized skills (output partially derived from user's `CLAUDE.md`). | MIT covers skillfit's code + template. Synthesized output inherits the user's repo license. Documented in synthesized skill frontmatter (`origin: synthesized`) and template footer. | shipped | mitigated |
| R-012 | P0 | First-run UX: synthesized skill is gated by approval but `init` exits 0. User may miss the warning. | `init` emits a `! repo-rules synthesis pending approval` warning to stderr. CI surfaces this via `check` failure. Manual user catches via terminal output. | shipped | mitigated |
| R-013 | P2 | Skillfit's own "skillfit-registry" for pain-skills (phase 2) needs same audit discipline as autoskills, or trust collapses. | Build the registry in a separate repo with PR-review gating, SHA-256 manifest, and an external auditor before any pain-skill ships. | future | deferred (hard requirement before phase 2 lands) |
