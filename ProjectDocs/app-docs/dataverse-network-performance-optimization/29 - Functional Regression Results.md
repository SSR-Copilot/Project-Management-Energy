# 29 - Functional Regression Results

> 25 Nov 2026. Automated checks only. No DEV smoke test, no E2E parity run and no manual click-through has been done.

## 1. The gate (`npm run verify`, idle machine)

| Check | Starting baseline (`30afece`) | After the programme |
|---|---|---|
| `check:power` (data sources) | 96 registered, 0 problems | 96 registered, 0 problems |
| Typecheck, lint, control labels (rule 16), canvas identities | pass (existing warnings only) | pass; 0 missing labels; no new lint warnings reported |
| Test files | 432 (431 passed, 1 skipped) | **491 passed**, 1 skipped (492) |
| Tests | 7,512 passed, 15 skipped, 3 todo | **8,273 passed**, 15 skipped, 3 todo (8,291) |
| Build | OK | OK |
| Result | exit 0 | **exit 0** (534 s) |

Added: 59 test files and 761 tests, covering differential (old code as oracle) cases, failure injection for each new guard and retry rule, request-count assertions, and a default-off test for every switch shipped off.

## 2. How the green result was reached (the failures that were found and fixed)

| Run | Result | Cause | Fix |
|---|---|---|---|
| First baseline, machine loaded by five audit agents | failed, 6,976 s | one jsdom timing test and five worker-start timeouts | none needed; the six files passed alone; rule: run `verify` on an idle machine |
| After integrating the first batch of agents | 27 targeted failures | five switches deliberately turned OFF at integration; tests had assumed ON | tests turn the switch on where they exercise the feature; default-assertions updated; default-OFF tests added |
| First full gate on the integrated tree | 1 failure (UT-ADCLEAN-004) | asserted the old fixed 1 s / 2 s retry waits | asserts the new jittered bounds |
| After the QA fixes | 9 targeted failures | three more switches turned OFF | same method |
| After merging the second batch | 4 failures (UT-COSTPOLICY-046, UT-FINPERF-128/129, UT-CAPEXPATCH-003) | the cross-batch retry stacking found by QA (QB-01, QB-02), mocks failing without an HTTP status (a status-less error is retried as a network error by design), a fixture assuming a client-supplied row id | one retry layer per request; mocks carry a status; fixture mints a server id when none is sent |
| Final | **exit 0** | - | - |

Production code was changed in response to two of these (retry stacking, the 404 on a retried delete). Everything else was a test assumption.

## 3. Switches and the old behaviour

Every behavioural change sits behind a switch, and every shipped-OFF switch has a test asserting the default is off and that the old behaviour runs. For `RETRY_POLICY_V2` the new retry functions are compared with the old ones (`legacy*`) in `retry.legacyEquality.test.ts`. Independent QA verified the OFF path of each switch it reviewed (doc 33).

## 4. Not done

- DEV smoke test of any screen (add, edit, delete, reload to confirm persistence): required by `CONVENTIONS.md` before a push to DEV.
- The E2E parity suite (Playwright, Canvas vs Code app): asked before the commit and declined by the owner on 25 Nov 2026. Not run for any of these changes.
- Verification of `[VSB]` console lines in a real run (CONVENTIONS rule 23): the lines are asserted in tests but have not been seen in a browser.
- Probes P-1 to P-5 and the DEV spot checks (doc 27, doc 34 section 15).
