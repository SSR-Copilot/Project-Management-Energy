# VSBCloud canvas → Power Apps code app migration

This workspace migrates two Power Apps **canvas apps** — VSBCloud Project Management and
VSBCloud Project Costs — into Power Apps **code apps**. The real, actively-developed app is
**`ProjectCosts-CodeApp/app/`** — a React 19 + TypeScript + Vite app on the
`@microsoft/power-apps` SDK, connected to the live `VSBCloud_Dev` Dataverse environment. If
you are about to write code, that is almost certainly where it goes; everything else in this
root is reference material feeding that one app.

**Before touching code**, read `.claude/PROJECT-MAP.md` — it explains which of the four
documentation layers in this repo to trust for which question. Getting that wrong is the
single easiest way to waste a session here: two of the four layers describe a **different,
mock-mode-only app** that was never connected to real Dataverse, and their conventions do not
all apply to `ProjectCosts-CodeApp/app/`.

## Quick orientation

- `@.claude/PROJECT-MAP.md` — what every top-level folder is, and which one is ground truth
- `@.claude/CONVENTIONS.md` — the real app's coding rules (OData, privileges, labels, tests)
- `@.claude/MIGRATION-STRATEGY.md` — how a canvas screen becomes a code-app screen here
- `@.claude/TESTING-AND-HARNESS.md` — how to run/extend the test suite, and the gates that exist
  today vs. the gates the reference harness defines
- `@.claude/KNOWN-RISKS-AND-DECISIONS.md` — standing risks, open decisions, and documented
  contradictions between planning docs — read before touching the Cost module's delete/save
  paths especially

## The one-sentence version of each top-level folder

- **`ProjectCosts-CodeApp/`** — the real app (`app/`), its own docs (`docs/`, partially stale —
  see the project map), and the read-only extracted canvas source (`_extracted/`).
- **`Existing Solution/`** — the original canvas apps as zipped Dataverse solution exports, plus
  cloned PCF control source repos. Read-only migration source.
- **`VSBCloud-Code-App-Skeleton/`** — a separate, complete reference implementation of this same
  migration, in **mock mode only**, never connected to real Dataverse. Useful for architecture
  and harness ideas; **not** a drop-in source of truth for `ProjectCosts-CodeApp/app/`.
- **`migration-plans/`** — per-screen build specs written against the skeleton above, not against
  `ProjectCosts-CodeApp/app/`. Same caveat applies.
- **`codeapp-knowledge-base/`** — a code-derived snapshot of `ProjectCosts-CodeApp/app/`'s actual
  current state. The most reliable single source for "what is true right now" — re-verify
  against the code if it's more than a few days old.

## Working agreement

- Run the real app's own gates before calling anything done: `npm run typecheck`, `npx vitest
  run`, `npm run build`, from `ProjectCosts-CodeApp/app/`. See `.claude/TESTING-AND-HARNESS.md`.
- Never silently reword a canvas-sourced string, never silently "fix" a canvas behaviour without
  marking it `SOURCE DEFECT` / `DIVERGENCE` with a `…CanvasParity` twin and a test. See
  `.claude/CONVENTIONS.md` rule 7–8.
- `src/generated/` and `.power/` under `app/` are `pac` output — regenerate, never hand-edit.
- Do not treat anything in `VSBCloud-Code-App-Skeleton/` or `migration-plans/` as already true
  of `ProjectCosts-CodeApp/app/` without checking — they describe a sibling, not this app.
