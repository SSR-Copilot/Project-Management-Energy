# VSBCloud Code App: QA release notes

**Environment:** QA
**Changes since:** 30 Oct 2026 (the last QA deployment)
**Source:** `develop` branch(6 Nov 2026)
**Solution build:** `1.21.780` (Export run 5126). 
## Highlights

- **Project Management is now in the code app.** All ten PM screens, plus the navigation shell, are live and connected to Dataverse.
- **Application Settings is fully functional.** All six admin screens read and write live data.
- **Approval flows are connected** for Check List and General Data, with the Request Module Permission and permission-cancellation flows registered.
- **Azure Maps** on the General Data screen.
- **Add Cost from Table saves much faster.**
- **Cost screens follow the Canvas app more closely** after three test runs.

## New

- **Project Management screens and navigation shell:** General Data, Milestones, Generators, Production, Cluster Check List, Team, Planning, Grid Operator, Revenues and Finance. Finance depends on the Fabric SQL sources.
- **Application Settings module:** the six admin screens are complete and working end to end, with their saves, deletes and the full-screen save spinner.
- **PM cloud flows** are called from the code app: Check List, General Data, Request Module Permission and permission cancellation. The two Generators flows are still waiting for a connection change in DEV.
- **Azure Maps on General Data.** The map gets its SAS tokens from a solution flow. It needs the six new `vsb_AzureMaps*` environment variables in QA.
- **Request log:** every Cost and Add Cost from Table call is traced as `[VSB]` lines in the browser console.

## Improved

- **Add Cost from Table Save performance:**
  - contract updates send only the columns that changed;
  - bulk chunking is tuned;
  - the Save timeline is logged;
  - an optional background save and a deep insert for new contracts exist but are switched off.
- **PM save speed and validation:** a warning shows when Save is disabled, the Production pop-up works, and the Checklist waits for its gate.
- **Write spinners and panels:**
  - the spinner is full-screen on Admin and Cost saves, and it now covers open panels;
  - the close icon is centred and shared on every side panel;
  - the Checklist Move to Cluster panel closes when the writes end, including after a failure.
- **Canvas parity:** the changes came from comparing against the Canvas app.
  - Cost screens: CAPEX, Contracts, OPEX and Land Lease.
  - PM screens: Team, Planning, Grid Operator, Cluster Checklist, project list and header.
  - Revenues: the balancing defaults changed.
  - Cost screens: a German number-format audit.

## Fixed

- **Project search:** it now accepts spaces.
- **Finance, Senior Debt:** the Individual repayment schedule no longer disappears, and its months default to 0.
- **Finance, Add Tranche:** the Individual repayment column no longer overlaps the next column.
- **Team screen:** one unreadable directory entry no longer breaks the whole screen.
- **Azure Maps:** the map is no longer 0 px high.
- **Add Cost from Table:** a split bulk save that partly landed now repairs the rows that landed.

## Quality

- **Functional test cases:** 622 passed cases in one reference workbook, `ProjectDocs/test-cases/FT-CONSOLIDATED-Passed-QA-Release-2026-11.xlsx`. It holds only Pass rows from the latest run of each screen.
  - Project Management: 176 (General Data, Milestones, Team, Planning, Grid Operator, Project Main, App Loading).
  - Project Costs: 446 (CAPEX 171, Contracts 91, OPEX 86, Land Lease 98).
- **Last full verify:** 227 test files, 5,445 tests passing.

## Before and after deployment

- **Environment variables:** set the six `vsb_AzureMaps*` variables in QA.
- **Connections and flows:** connection references are needed for the PM flows.
- **Fabric SQL:** the Finance screen needs the Fabric SQL connection and its environment variables.
