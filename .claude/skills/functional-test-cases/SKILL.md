---
name: functional-test-cases
description: Write, run and report functional test cases for a VSBCloud code app screen in the Excel template VSBCloud-Functional-Test-Case-Template.xlsx (FT-ACC / FT-BR catalogue, Execution Log, Summary). Use when asked for functional test cases, a test catalogue, a test execution report, QA sign-off evidence, or to fill or update that workbook for any screen of the Project Management or Project Costs apps.
---

# Functional test cases for a screen

The full guide is `ProjectDocs/instructions/FUNCTIONAL-TEST-CASES.md`. Read it first; it holds the
column-by-column contract, the Lookups values, the 23-screen table (template code → canvas YAML →
feature folder → real UT prefixes → route) and the result mapping.

The essentials:

1. **The canvas apps are the source of truth.** Expected results come from the live Power Fx in
   `ProjectDocs/_extracted/msapp/<app>/Src/<Screen>.pa.yaml` (skip commented-out formulas), the
   canvas reference run, and the recorded decisions (`02-OPEN-DECISIONS.md`, `01-BUGS-FOUND.md`,
   file 13). Never from the code app's own source.
2. **The template was written for the mock skeleton.** `security/matrix.json`, `gsec.mjs`,
   `?mockRoles`, `npm run ft`, `AppRoutes.tsx` and `expected-divergences.json` do not exist here.
   Part 2 of the guide gives the replacement for each. Keep every column and every red-cell rule.
3. **IDs:** `FT-BR-<template code>-NNN` (e.g. `FT-BR-CONTR-001`, even though the UT prefix is `CON`),
   `FT-ACC-NNN`, real `UT-…` ids in Pinned By. Never renumber.
4. **Run:** ask the inputs of `ProjectDocs/instructions/E2E-PARITY-PROMPT.md` every time.
   - The project ids are asked for every run and kept in environment variables only.
   - The Canvas app runs first, then the code app (`npm run parity -- --screen <slug>`), then the
     UT pins with Vitest.
   - Manual cases follow column L.
5. **Record:**
   - Test Cases columns Y–AH hold the latest run; add one Execution Log row per case.
   - Map harness classes as follows: new → UNEXPECTED, known → EXPECTED, artefact → MATCH,
     not-captured → NOT-COMPARABLE.
   - Save a new workbook per screen or run (`FT-<CODE>-<date>.xlsx`). Never overwrite the template,
     and keep its formulas.
6. **Never:**
   - put personal data or project GUIDs in the workbook;
   - start a PM approval flow without the `16-PM-FLOWS…` §7 test plan;
   - fix a failing case silently;
   - commit without the user's approval.
