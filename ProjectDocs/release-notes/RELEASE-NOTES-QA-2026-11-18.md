# VSBCloud Code App: QA release notes

**Environment:** QA
**Release date:** 18 Nov 2026
**Solution build:** `1.21.791`

## Highlights

- **Saving is safer on Contracts, Generators and the Cluster Checklist.** A save that fails halfway no longer leaves wrong or duplicate data, and screens no longer let you act before the data they depend on has loaded.
- **Approvals can no longer be skipped by accident** on the Cluster Checklist.
- **Generators deletes are checked and repeated when a request fails temporarily,** and the screen tells you exactly what was and was not removed.
- **Project Overview and General Data open faster.**
- **Cost and Project Management screens look and behave more like the Canvas app,** especially CAPEX, OPEX, Contracts, Finance, Generators and Milestones.
- **Numbers and dates follow the user's language.**
- **The header shows the environment colour** (QA is salmon).
- **Application Insights tells you in the browser console** whether telemetry is being sent or blocked.

## New

- **Environment colour in the header.** The top bar is coloured per environment, so a tester can see at a glance that they are in QA.
- **Application Insights diagnostics.** The browser console now shows which connection string is in use, where telemetry is sent, and why it is off when it is. It also reports batches that were refused and recovers if the first read of the connection string failed.
- **Safer Generators deletes.**
  - A delete that fails for a temporary reason is tried again.
  - A delete is read back before it counts as done.
  - The costs linked to every row of a Generator type are cleaned up with it.
  - If a new Generator type fails halfway, it can be rolled back with a "Retry cleanup" button.
  - A report and a guarded clean-up tool find rows that earlier failed deletes left behind.
- **Faster Generators saving is built and ready.** Parallel and bulk saves exist and will be switched on once they have been verified in a test environment.
- **Faster start-up.** Project Overview and General Data load their first data earlier and in fewer steps, and the JavaScript the browser downloads first is about 18% smaller.

## Improved

**Generators**
- Delete, Deactivate and Delete PV Module wait until the check for linked maintenance costs has answered. Before, a fast click could slip past it.
- If saving a new type fails in its second step, the message now says the type was saved, so it is not added twice.
- The turbine list no longer goes blank while a new set of types loads, and Save waits while data settles.
- A second click on Save, Replace or Delete is ignored while the first is still running.
- Names and labels stop at 100 characters, the limit the database allows.
- A failed background refresh keeps the screen and any open panel, and shows a banner instead of an empty page.
- Looks like the Canvas: light grey row separators, a new record opens unfolded, the Replace panel shows the typed hub height for a Dummy supplier, and the "Apply to all" warning has its orange icon.

**Contracts**
- A save that fails after the contract was written refreshes the list, keeps the saved contract for the retry, and reopens the panel with what you typed.
- Account links save only what changed, and a link to an account the picker cannot show is kept.
- Add and Edit wait until the cost rows, links and payment targets have loaded.
- If another user deleted the contract you are editing, you are told instead of the contract coming back.
- The panels no longer close when you click outside them, and the screen resets when you switch project.
- Layout like the Canvas: the account rows in the panel, the card fields and spacing, blue icons on the Payment Targets bar, and the closing date in the short style.

**Cluster Checklist**
- Complete and In Progress wait until the approval settings have loaded, and a failed read shows a banner.
- Move, Save, Reset and the step bar wait until the gates and first data have loaded, and a loader replaces a misleading "not available for this technology" message.
- A failed refresh keeps the screen and an open panel, and the error page has a working Refresh button.
- Opening a cluster creates its tasks in parallel and reloads only what changed, so it is much quieter and quicker.
- A stale click (for example, on a cluster someone else already moved) is refused with a clear message.
- Keyboard focus follows the date editor, focus outlines are back, and screen readers hear each step's state.

**Cost screens**
- **CAPEX:**
  - A contract entered as percentages reopens in percentages.
  - The distribution options are listed in the Canvas order.
  - Equal Distribution keeps the opening figures until you save.
  - Standard values show in blue italic, and the panel layout matches the Canvas.
- **OPEX (Operation & Maintenance and Other OPEX):** 11 behaviours match the Canvas, for example the panel closes only through the cross or Cancel, no row stays selected after Add, the inflation start year follows the date, empty durations show empty, and device cards refresh on every visit. The card list has the Canvas scrollbar.
- **Land Lease and OPEX periods:** each period starts the day after the previous one ends, the start date cannot be edited after Period 1, and a save repairs later periods that had drifted.
- **Add Cost from Table:** contracts are sorted A to Z, and contracts with no cost records are left off the sheet, so it no longer opens with a "cost item must be assigned" error.

**Project Management screens**
- **Finance:** 12 differences fixed against the Canvas (month and year defaults, Debt Financing as the default financing option, German and French number formats), the Equity, VAT, Decommissioning and DSRA/DSRF panels are laid out as the Canvas, Edit panels keep Save off until something changed, and dropdowns open the Canvas list.
- **Revenues:** Save on the Edit forms stays off until something changed.
- **Project Overview:** a selected project can be deselected, as in the Canvas.
- **Production:** field captions and the info button look like the Canvas.
- **Milestones:** all eleven date boxes show the same short date style, for example "Thu, May 10, 2018". Project Start and Cluster 3 used to show the long form.
- **Dropdowns across PM screens** open a list that looks like the Canvas list, and disabled dropdowns have the Canvas disabled look.

**Numbers and dates in the user's language.** Fifteen places were corrected across CAPEX, OPEX, Land Lease, Production, Revenues, General Data, Settings, Planning and Finance, so decimals, thousands separators and range messages follow the language. The Cluster Checklist dates now do too.

## Fixed

**Data and saving**
- **Contracts saved zero totals** when a form was opened before its cost data had loaded. It now waits.
- **Contracts lost their account links** when Edit was opened too early and saved. Edit now waits for the links.
- **A failed Contracts save left the list stale,** so saving again created a duplicate contract. The list refreshes and the retry updates the same contract.
- **Editing a contract another user had just deleted brought it back** without its business unit. It now says the contract is gone.
- **Generators: a double click on Save could create two types,** or two rows on BESS, Hydrogen and Substation. A second click is now ignored.
- **Generators: Replace PV could delete the old type and then fail** when the label was too long. Long labels are now refused before anything is deleted.
- **Generators: rows could be created without an owning business unit** and so be invisible to colleagues. A project without one now refuses to create rows.
- **Cluster Checklist: a task needing approval could be completed directly** while the approval settings were loading, with no approval sent. It cannot now.
- **Cluster Checklist: a task an admin had deleted could be re-created** by another user's edit. It is now reported as gone.
- **OPEX: Polish costs saved without a currency,** because "Polish Zloty" matched no record. It now uses "Złoty".
- **CAPEX: emptying a month box saved a 0 row.** It now removes the stored month.
- **CAPEX: switching "Cost Paid By" when adding a cost saved without the confirmation.** It now asks.
- **Finance: reopening the screen failed with a duplicate-record error** because a default input was created again. It now checks first.
- **Revenues: a new contract got the wrong price** (60.00 where the Canvas gives 52.00, or 0 for a German FiT PV contract). It now follows the Canvas.
- **Land Lease and OPEX: later periods started on the wrong date** (the last day of the previous period instead of the next day).
- **Add Cost from Table: pasting one row from Excel added two rows** and blanked the cell below (Bug 15333). A pasted row is now one row.

**Messages and display**
- **Generators: a turbine named "00" or "000" was accepted.** It is now refused with the Canvas message.
- **Generators: the PV card caption was cut off** ("[% per a…"). It now shows in full.
- **Generators: a failed delete or rollback could look successful.** Messages now state what was removed and what was not.
- **Cluster Checklist: the progress text said "successfully changed"** while the save was still running. It now says the change is in progress.
- **Cluster Checklist: a failed refresh replaced the whole page** with an error that pointed at a missing Refresh button. The screen stays and Refresh works.
- **Cluster Checklist: the panel close icon said "Home".** It now says "Cancel".
- **Contracts: the Payment Date column was left-aligned** and four-digit numbers lost their separator in Spanish, Italian, Polish and Portuguese.
- **Milestones: Project Start and Cluster 3 showed a different date style** from the other date boxes.
- **Application Insights: the browser requested a second host and raised "unload" warnings,** and a console line claimed delivery that had not happened. All three are fixed.

## Quality

- **Automated tests:** 292 test files with 6,346 tests pass, and the build is clean.
- **Reviews:** Contracts, Generators and the Cluster Checklist were reviewed in depth (functional, non-functional and screen design) and the defects found were fixed.
- **Functional test cases:** 534 cases were written for the changes in this release, in small steps (one rule, one message or one boundary per case). **506 passed** and 28 still need a check on a screen. None failed.
  - How a case passes: every automated test it points at ran and passed in the full test run, and an independent reviewer read each of those tests against the case. 352 of the 506 are fully covered by their tests. 154 are covered in part: the "Actual Result" and "Comments" columns say which step the tests do not check, and that step needs a look on screen.
  - A pass here comes from automated tests with test data. It is not a sign-off in the QA environment.
  - Cases by screen:

    | Screen | Cases | Passed | Of those, covered in part | Still to check on screen |
    |---|---|---|---|---|
    | Contracts | 86 | 85 | 30 | 1 |
    | CAPEX | 41 | 34 | 13 | 7 |
    | OPEX | 43 | 41 | 7 | 2 |
    | Land Lease | 23 | 22 | 6 | 1 |
    | Add Costs from Table | 22 | 20 | 12 | 2 |
    | Generators | 81 | 77 | 17 | 4 |
    | Cluster Checklist | 67 | 65 | 17 | 2 |
    | Milestones | 23 | 23 | 8 | 0 |
    | Finance | 42 | 38 | 8 | 4 |
    | Revenues | 19 | 16 | 4 | 3 |
    | Production | 11 | 10 | 3 | 1 |
    | Project Overview (Project Main) | 15 | 15 | 6 | 0 |
    | General Data | 11 | 10 | 5 | 1 |
    | Planning | 7 | 7 | 2 | 0 |
    | App Loading and Application Insights | 43 | 43 | 16 | 0 |
    | **Total** | **534** | **506** | **154** | **28** |

  - Files: `ProjectDocs/test-cases/Release-2026-11-18/FT-RELEASE-2026-11-18-Run-01.xlsx` (all 534 cases and the run log) and `FT-CONSOLIDATED-Passed-Release-2026-11-18.xlsx` (the 506 passed cases, same layout as the earlier consolidated file).
  - Still to check on screen (mostly look and feel): CAPEX Equal Distribution and panel layout, Finance panel layouts, Production captions, and a few Generators and Revenues layout items.

## Before and after deployment

- **Content Security Policy:** in the Power Platform admin center, open the QA environment, Settings > Product > Privacy + Security > Content security policy > **App** tab, and add `https://westeurope-5.in.applicationinsights.azure.com` to `connect-src`. A value you add replaces the default, so keep the Azure Maps hosts in the same list (`https://atlas.microsoft.com` and `https://*.atlas.microsoft.com`).
- **Environment variables:**
  - Set `vsb_ApplicationInsightsConnectionString` to the QA connection string.
  - Set the six Azure Maps variables (`vsb_AzureMapsAccountName`, `…ResourceGroup`, `…SubscriptionId`, `…PrincipalId`, `…SasTokenHours`, `…SasMaxRatePerSecond`).
  - In the QA configuration file, add `vsb_AssumptionsBoPContracts` (the solution has 34 variables) and correct the connector of `vsb_sharedcommondataserviceforapps_60bf9` to `shared_commondataserviceforapps`.
- **Connections and flows:** connection references are needed for the Project Management flows.