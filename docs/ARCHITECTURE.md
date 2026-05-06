# skillfit architecture

## Pipeline

```
                      ┌──────────────┐
                      │   bootstrap  │  package.json → candidate skill ids
                      └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │     probe    │  ripgrep-equivalent walk; count import sites
                      └──────┬───────┘
                             │  drop unused (sites=0)
                             ▼
                      ┌──────────────┐
                      │  synthesize  │  CLAUDE.md/AGENTS.md → repo-rules.md
                      └──────┬───────┘  hash inputs + output deterministically
                             │
                             ▼
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
         ┌─────────────┐          ┌──────────────┐
         │   review    │          │     emit     │  write .claude/skills/*.md
         │  (gate)     │          └──────┬───────┘
         └──────┬──────┘                 │
                │ approval                │
                ▼                         ▼
                                  ┌──────────────┐
                                  │   lockfile   │  skillfit-lock.json
                                  └──────────────┘
```

## Modules

| Module | Purpose | Pure? |
|---|---|---|
| `src/bootstrap.ts` | Map `package.json` deps → autoskills skill ids. Stub mirrors autoskills mappings; real shell-out is RC-2. | yes |
| `src/probe.ts` | Walk repo, regex-extract `import`/`require` specifiers, count sites + files per package root. Skips `node_modules`, build dirs, files >512 KiB. | yes |
| `src/synthesize.ts` | Read rule files (`CLAUDE.md`, `AGENTS.md`, `agent_rules.md`, `.cursor/rules`). Deterministic distillation: pull headings + bullets, fill template. Hash inputs + output. | yes (deterministic mode) |
| `src/emit/claude.ts` | Write `.claude/skills/<id>.md`. Sanitize ids. | side-effects only |
| `src/lock.ts` | Lockfile r/w + hash-keyed upserts. Versioned (v1). | side-effects only |
| `src/commands/init.ts` | Pipeline orchestrator: bootstrap → probe → drop unused → synthesize → emit non-synthesized + (synthesized if previously approved) → write lock. | orchestration |
| `src/commands/review.ts` | Diff synthesized output vs approved. TTY prompt or `--yes`. On approval: emit + write `approvedHash`. | orchestration |
| `src/commands/emit.ts` | Re-emit currently-approved skills from lockfile. | orchestration |
| `src/cli.ts` | Argv parser + command dispatch. | thin |

## Determinism

All modules except `review` (which is interactive) are deterministic given:
- Repo state (file contents)
- Pinned template version (`v1`)

Same SHA → byte-identical synthesis output → byte-identical hash. CI can rerun `init` and compare lockfile to verify reproducibility.

The synthesizer ships in `deterministic` mode for v0.1.0-rc.1. An LLM-backed mode is reserved for v0.2 and would be feature-flagged via env var with the same hash contract (the LLM output is hashed; non-determinism is bounded by caching against input-hash).

## Trust model

Two origins:

| Origin | Meaning | Hash sources |
|---|---|---|
| `verified` | Pinned content. Either passthrough from autoskills (hash = registry manifest) or synthesized (hash = synthesis output). Synthesized requires `approvedHash === hash` to emit. | autoskills manifest OR `sha256(body)` |
| `local` | User-edited. Tracked for drift only; not pinned. | n/a (tracked outside this MVP) |

The `verified` origin collapses what was four origins in the design doc. Sub-source recorded in `source` field (`autoskills` vs `synthesized` vs `user`). The hash-pin invariant is uniform: `verified` => hash matches.

## Lockfile schema (v1)

```ts
interface Lockfile {
  version: 1;
  generatedAt: string;            // ISO timestamp
  bootstrap: {
    tool: string;                 // "autoskills@<pinned>"
    lockSha: string | null;       // upstream lock hash if available
  };
  skills: {
    id: string;
    origin: "verified" | "local";
    source: "autoskills" | "synthesized" | "user";
    hash: string;                 // sha256:...
    inputs?: string[];            // for synthesized: rule-file hashes + template version
    model?: string;               // "deterministic" | "anthropic" | ...
    approvedAt?: string;
    approvedHash?: string;
  }[];
  dropped: { id: string; reason: string }[];
}
```

## Drift gate semantics

`skillfit check`:
1. Resynthesize from current rule files.
2. Compare synthesis hash to `lock.skills.find(s => s.id === "repo-rules").approvedHash`.
3. Match → exit 0.
4. Mismatch → exit 1 with hash delta.

This makes the gate idempotent: rerunning without changes always passes; any change to `CLAUDE.md` (or any tracked rule file) flips the gate red until human re-approval.

## Failure modes & defaults

Per skillfit's own opinionated stance: prefer hard failure over silent fallback.

| Condition | Behavior |
|---|---|
| `skillfit-lock.json` missing on `check` | Exit 1 with `"no lockfile"` (not exit 0; absence == drift). |
| Rule files missing | Synthesis still runs, body says `"_No source rule files found_"`. Hash stable per-template. |
| Lockfile version mismatch | Throws; user must regenerate. No silent migration. |
| `package.json` missing on `init` | Warn, return empty bootstrap candidate list. Synthesis still runs. |
| Unreadable file in walk | Skipped silently (intentional — common with permission-restricted dirs in monorepos). |

## Performance budget

Sample repo (~5 files): cold init <30 ms in tests. Larger repos bounded by walk + regex per file. Files >512 KiB skipped (regex on big bundles wastes time). Phase 2 AST replaces regex; budget revisited then.

## Security

- No network calls in MVP. Synthesis runs locally. autoskills integration deferred (see RELEASE_CHECKLIST.md).
- All file writes are inside `<repoRoot>/.claude/skills/` and `<repoRoot>/skillfit-lock.json`. No traversal outside repo root.
- Skill ids sanitized with `[^a-zA-Z0-9._-]` → `-` before being used as filenames.
