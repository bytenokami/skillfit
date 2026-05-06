# skillfit

> Code-grounded overlay on [autoskills](https://github.com/midudev/autoskills). Detect actual stack usage, synthesize repo-local rules, ship as Claude skills with a human-in-loop approval gate.

```bash
npx skillfit init       # detect, synthesize, write lockfile + .claude/skills
npx skillfit review     # diff synthesis vs approved; require approval
npx skillfit check      # CI gate: exit 1 if synthesis drifted
```

## What it does that autoskills doesn't

| Concern | autoskills | skillfit |
|---|---|---|
| Stack detection | `package.json` deps | + AST/import probe (drops zero-use deps) |
| Repo-local rules | none | synthesizes from `CLAUDE.md` / `AGENTS.md` |
| Human-in-loop | none | `skillfit review` with diff before emit |
| CI drift gate | none | `skillfit check` non-zero on drift |
| Determinism | yes | yes (deterministic synthesis path) |
| Audited supply chain | yes (registry + SHA-256) | inherits passthrough; own registry phase 2 |

## Status

`v0.1.0-rc.1` — release candidate. MVP scope only. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's not yet shipped.

## Install (dev)

```bash
git clone <this-repo>
cd skillfit
npm install
npm run build
npm test
```

## Use

In any TS/JS project:

```bash
node /path/to/skillfit/dist/cli.js init --cwd .
node /path/to/skillfit/dist/cli.js review --cwd .
node /path/to/skillfit/dist/cli.js check --cwd .
```

Outputs:
- `.claude/skills/*.md` — skill files
- `skillfit-lock.json` — lockfile with hashes + approval state

## Trust model

Two origins only:
- **`verified`** — hash-pinned. Sources: `autoskills` (passthrough hash) or `synthesized` (input-hash + output-hash + explicit approval).
- **`local`** — user-edited, drift-tracked.

Synthesized skills require explicit approval via `skillfit review` before emit. The `approvedHash` in the lockfile blocks future writes until re-approved.

## Why human-in-loop on synthesis

Synthesis takes repo-local rules (`CLAUDE.md`, etc.) and materializes them as a skill the agent will follow. Subtle errors in distillation = subtle errors in agent behavior. Input-hash caching alone makes bad output sticky. The `review` step is load-bearing.

## Docs

- [`docs/PRD.md`](docs/PRD.md) — product requirements
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design
- [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) — RC sign-off
- [`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md) — known risks + mitigations
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phase 2+

## License

MIT
