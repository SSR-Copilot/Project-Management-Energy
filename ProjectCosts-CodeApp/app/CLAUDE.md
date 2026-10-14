# ProjectCosts-CodeApp/app — quick reference

You're in the real, actively-developed Power Apps code app: React 19 + TypeScript + Vite,
connected to live Dataverse in `VSBCloud_Dev`. For the full picture — which docs in this
workspace to trust, coding conventions, how to port a canvas screen, testing/harness setup,
and known risks/open decisions — read the parent-level files, which are the actual source of
truth and are kept there so every app in this workspace shares one copy:

- `../../CLAUDE.md` — orientation and the four-layer doc map
- `../../.claude/PROJECT-MAP.md`
- `../../.claude/CONVENTIONS.md`
- `../../.claude/MIGRATION-STRATEGY.md`
- `../../.claude/TESTING-AND-HARNESS.md`
- `../../.claude/KNOWN-RISKS-AND-DECISIONS.md`

This file only exists so Claude Code picks up that context when a session is opened directly
in `app/` rather than at the workspace root — it is not a second copy of the rules.

## The five commands you need most

```bash
npm run dev                                    # :3000 — no Power context, no data alone
pac code run --appUrl http://localhost:3000    # :8080 — run alongside dev for real data
npm run typecheck && npx vitest run && npm run build   # before calling anything done
pac auth list                                  # confirm which environment a push will hit
pac code push                                  # deploy dist/ to that environment
```

Also read first, in `ProjectCosts-CodeApp/`: `README.md` (layout, the nine core conventions)
and `docs/` (`00-ANALYSIS.md` through `06-DEMO-COMPLETION-PLAN.md` — the app's own decision
log; cross-check against `../../codeapp-knowledge-base/` if something looks out of date, since
these docs are known to lag the code).
