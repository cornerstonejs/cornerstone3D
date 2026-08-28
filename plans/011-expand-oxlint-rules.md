# Plan 011: Expand oxlint from 2 rules to the `correctness` category (ratcheted)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- .oxlintrc.json package.json`
> On drift, compare the "Current state" excerpts against the live files; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (rule expansion surfaces existing violations that must be fixed or explicitly allowed)
- **Depends on**: none (010 recommended first so type errors are separable from lint errors)
- **Category**: dx
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

The lint gate runs in CI (`format-check.yml` → `pnpm run lint`) but enforces
exactly two rules, so it passes on nearly any real defect. oxlint's
`correctness` category catches the exact bug classes this audit found by hand
(mismatched listener references, unreachable code, invalid typeof, unsafe
negations). Turning it on — fixing or explicitly waiving what it finds — makes
the existing CI lane earn its keep at near-zero runtime cost (oxlint is fast).

## Current state

- `.oxlintrc.json` (entire file, verified):

```json
{
  "plugins": ["typescript", "import"],
  "ignorePatterns": [
    "utils/**",
    "**/examples/**",
    "packages/dicomImageLoader/src/types/codec*"
  ],
  "rules": {
    "typescript/no-explicit-any": "error",
    "import/no-cycle": "error"
  }
}
```

- Root `package.json:58`: `"lint": "oxlint packages/**/src --quiet"`.
- oxlint version: `1.9.0` (root devDependencies). In oxlint, rule categories
  are enabled via the `categories` config key (e.g. `"categories": {
  "correctness": "error" }`) or CLI flags; check `pnpm exec oxlint --help` for
  the 1.9 syntax before writing config.
- `lint-staged` (root `package.json:175-180`) also runs `oxlint` on staged
  files — it picks up `.oxlintrc.json` automatically, so config changes apply
  to both paths.
- CI: `format-check.yml` runs `pnpm run lint` on every PR.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Lint | `pnpm run lint` | exit 0 |
| Lint verbose (triage) | `pnpm exec oxlint packages/**/src` | violation list with rule names |
| Build (post-fix sanity) | `pnpm run build:esm` | exit 0 |
| Unit tests (post-fix sanity) | `pnpm run test:unit:no-coverage` | all pass |

## Scope

**In scope**:
- `.oxlintrc.json`
- Source files with `correctness` violations — mechanical fixes only (see Step 3's rules of engagement)

**Out of scope** (do NOT touch):
- Enabling `suspicious`/`pedantic`/`style` categories — one category per pass; those are follow-ups.
- The existing two rules and existing ignorePatterns — keep them.
- `format-check.yml` — no workflow change needed; it already runs `pnpm run lint`.
- Any fix that changes behavior (see STOP conditions) — this plan must be a no-op at runtime.

## Git workflow

- Branch: `advisor/011-expand-oxlint-rules`
- Commit style: `chore(lint): enable oxlint correctness category` — one commit for config, separate commits per package for fixes (e.g. `chore(lint): fix correctness violations in core`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Measure the blast radius

Add the category to `.oxlintrc.json`:

```json
  "categories": {
    "correctness": "error"
  },
```

(Confirm the key name against `pnpm exec oxlint --help`; oxlint 1.x supports
`categories` in config.) Then run `pnpm exec oxlint packages/**/src` (WITHOUT
`--quiet`) and save the output. Count violations per rule:
`pnpm exec oxlint packages/**/src 2>&1 | grep -oE 'eslint\([a-z-]+\)|oxc\([a-z-]+\)|[a-z-]+/[a-z-]+' | sort | uniq -c | sort -rn` (adjust the extraction to the actual output format you see).

**Verify**: a per-rule violation count table exists in your notes.

### Step 2: Decide per rule — fix, or allow with a comment

For each rule with violations:
- **≤ ~25 mechanical violations** → fix them (Step 3).
- **Large or judgment-heavy** (would require restructuring code) → set that
  specific rule to `"allow"` in `.oxlintrc.json` under `rules`, with a JSON-
  adjacent note in the plans/README report listing the count (JSON has no
  comments — record the rationale in your final report and the commit message).

The end state must be: `pnpm run lint` exits 0 with the category ON and an
explicit, minimal allow-list.

**Verify**: `.oxlintrc.json` updated; decision table in notes.

### Step 3: Fix the mechanical violations

Rules of engagement:
- Only make fixes whose runtime behavior is provably identical (remove
  unused labels, fix `typeof` typos, delete unreachable code AFTER confirming
  it is genuinely unreachable, correct bad comparison operators ONLY when the
  intent is unambiguous from context).
- If a violation looks like a REAL BUG (the fix would change behavior), do NOT
  fix it silently: set the rule to `allow` if needed to keep lint green, and
  list the site in your report under "probable real bugs found by lint" —
  those become new findings, not drive-by changes.
- Use `pnpm exec oxlint --fix` only for rules documented as auto-fixable, and
  review the diff hunk-by-hunk.

**Verify** after each package's fixes: `pnpm run lint` (should be improving), and at the end: `pnpm run build:esm` → exit 0, `pnpm run test:unit:no-coverage` → all pass.

### Step 4: Confirm CI parity

`pnpm run lint` (the exact CI command) → exit 0.

**Verify**: exit 0.

## Test plan

No new tests. The gates are: lint exits 0 with the category enabled; build and
the unit suites still pass (proves the fixes were behavior-preserving).
`pnpm run test:ci` (karma) additionally if any fix touched
`packages/core/src` or `packages/tools/src` non-trivially.

## Done criteria

- [ ] `.oxlintrc.json` contains `"categories": { "correctness": "error" }` (or the 1.9-equivalent syntax)
- [ ] `pnpm run lint` exits 0
- [ ] Allowed-rule list + per-rule counts + "probable real bugs" list are in the final report
- [ ] `pnpm run build:esm` exits 0 and `pnpm run test:unit:no-coverage` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Total violations exceed ~300 — the triage itself needs operator
  prioritization; deliver the per-rule count table and stop.
- oxlint 1.9.0 does not support category enabling via config — report the
  actual supported syntax options rather than upgrading oxlint (a version bump
  is a separate decision).
- Any single fix requires touching files in `packages/core/src/RenderingEngine/GenericViewport/**` in a non-mechanical way (active migration area — coordinate first).
- A "fix" would change behavior and you cannot allow-list around it.

## Maintenance notes

- Reviewer: the diff should be config + mechanical fixes only; anything that reads like a logic change is out of contract.
- Follow-ups (deferred): `suspicious` category next, then `perf`; consider `no-floating-promises`-equivalent once oxlint supports type-aware rules (needs typed linting — heavier).
- The "probable real bugs" list from Step 3 feeds the next audit round.
