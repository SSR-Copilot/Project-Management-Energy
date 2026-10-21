## r02 — Project Management app — Project list (NOT the Cost app)
**Screen:** This is the **Project Management** app (top purple bar reads "Power Apps | Project Management"), not the Project Costs app. No left rail is present on this screen — it is a flat, full-width project list/grid view. A row ("Contr. Endpoint Testproject") is selected via radio button, which is presumably the project later opened in the Cost app screens below.
**Layout:** Top: purple Power Apps bar. App header band: VSB "Cloud" logo/wordmark (left), command buttons (centre-left), "Hi Shakti Singh Rajput" user pill (right). Below that: a filter/search bar row (two rows of filter fields). Below that: a data grid filling the rest of the screen, with a totals caption bottom-left ("Total Rows: 98").
**Left rail:** None on this screen.
**Command bar / actions:** "+ Add Project", "Edit Project", "Edit Costs", "Delete Project" (greyed/disabled — icon and text look faded/lighter than the others), "Simulate", "Dashboard". A red warning-triangle "Help" dropdown sits at the far right before the user pill.
**Fields / inputs:** Filter row 1: "Project" (text box, value "test") with a blue filter-funnel icon button; "Country" (dropdown, value "Germany") with a blue filter-funnel icon button; "Technology" (dropdown, empty) with a grey/disabled filter-funnel icon. Filter row 2: "Project Manager" (search box, placeholder "Search for project manager"); "Area/State/Province" (dropdown, empty) with disabled filter icon; "Capacity" (numeric box, empty) plus "Select operator" dropdown, disabled filter icon; "Status" (dropdown, empty) with disabled filter icon.
**Tables / grids:** Columns left to right: (radio-select), colour stripe, "Project Name ↑" (sorted ascending), "Short Name", "Status", "Project Manager", "Country", "Area/State/Province/Voivodeship", "Technology", "Capacity [MW(p)" (cut off at right edge, horizontal scroll implied). Each row has a thin coloured vertical stripe at its left edge (green/red/blue, varies per row — status colour coding). Visible rows include: "0 Test Lucas" / 0tl / Cluster 3 / Georg, Lucas (external) / Germany / Brandenburg / PV / 33.; "000TestingRRS" / rrs / Cluster 2 / Rohit Revnath Somase / Germany / Hesse / Wind / 5.; "2402 - Test Shakti" / 2402TS / Cluster 1 / Singh Rajput, Shakti (external) / Germany / Baden-Württemberg / Wind / 24.; "AndreasTestProject11234" / ATP / Cluster 2 / Läubli, Andreas (external) / Germany / Brandenburg / Wind / 137.; "Ayushi Test Milestone testing" / test test / Cluster 1 / Singh Rajput, Shakti (external) / Germany / Bavaria / Wind / 0.; "BI Test Germany Project" / BI Test German / Cluster 1 / Mund, Ravindra (external) / Germany / Saxony / PV / 56.; "Contr. Endpoint Testproject" / CET / Cluster 4 / Pilevski, Alexander / Germany / Hesse / Hybrid / 12. — **row is selected (radio checked, blue)**; "Dev Test Cluster Movement" / DTCM / Draft / Mathur, Rounak (external) / Germany / Brandenburg / Wind / 11.; "E2E-Tests-FIX" / E2ETestFix / Cluster 1 / (blank) / Germany / Rhineland-Palatinate / Wind / 0.; "Germany Approval Flow Test" / Test / Cluster 2 / Rohit Revnath Somase / Germany / Brandenburg / Wind / 5.; "Harry's Test" / HarryTest / Draft / (blank) / Germany / Rhineland-Palatinate / PV / 0.; "HV Test #1" / HVT#1 / Draft / Mecheels, Benjamin (aadmin) / Germany / Schleswig-Holstein / Hydrogen / 0. Capacity values are truncated by the viewport edge (only leading digits visible, e.g. "33.", "5.", "24."). Footer caption: "Total Rows: 98".
**Dialogs / panels:** None open.
**Messages:** None (aside from browser-level "vsbazure.sharepoint.com is sharing your screen and audio" banner, which is chrome, not app content).
**States and colours:** Selected row "Contr. Endpoint Testproject" has a filled blue radio button and light-blue row background. "Delete Project" command appears disabled (greyed). Two of the three filter-funnel icons in row 1 are blue/active (Project, Country); the third (Technology) and all of row 2's are grey/disabled-looking, matching their empty field state.
**Text captured verbatim:**
- "Power Apps | Project Management"
- "Cloud" / "Version 1.0.01 (Dev)" (under logo — small print, matches Cost app's version string)
- "+ Add Project", "Edit Project", "Edit Costs", "Delete Project", "Simulate", "Dashboard"
- "Help", "Hi Shakti Singh Rajput"
- "Project", "test", "Country", "Germany", "Technology"
- "Project Manager", "Search for project manager", "Area/State/Province", "Capacity", "Select operator", "Status"
- Column headers: "Project Name ↑", "Short Name", "Status", "Project Manager", "Country", "Area/State/Province/Voivodeship", "Technology", "Capacity [MW(p)"
- "Total Rows: 98"
**Changes vs the previous screenshot:** N/A (first frame).

## r03 — Project Management app — Project list (same as r02, cursor moved)
**Screen:** Identical screen to r02 (Project Management app, project grid, "Contr. Endpoint Testproject" row selected).
**Layout / Left rail / Command bar / Fields / Tables / Dialogs / Messages / States:** All identical to r02 — no data or state changes.
**Text captured verbatim:** Same as r02.
**Changes vs the previous screenshot:** Only the mouse cursor position moved (from near the grid toward the "Project Name" header, around x=233,y=262). No UI state, data, or selection changed.

## r04 — Project Costs app — splash/loading screen
**Screen:** Project Costs app initial load splash (browser tab title changed to a new "Pr..." tab loading `.../projectl...` URL). This is the transition into the **Project Costs** app referenced in the task (distinct app from Project Management). No rail or content yet.
**Layout:** Centered vertically and horizontally: VSB leaf logo icon (blue square, white leaf mark) above the text "VSB / energy for you"; below that, app name "Project Costs" in bold; below that, a thin horizontal loading/progress rule.
**Left rail:** Not rendered yet.
**Command bar / actions:** None yet.
**Fields / inputs:** None.
**Tables / grids:** None.
**Dialogs / panels:** None.
**Messages:** None (only the browser-level screen-share banner, which is chrome).
**States and colours:** Plain white background; VSB blue-on-white branding; thin grey horizontal rule under the title appears to be a progress/loading indicator.
**Text captured verbatim:**
- "VSB"
- "energy for you"
- "Project Costs"
**Changes vs the previous screenshot:** Entirely new context — browser has navigated to a new Power Apps play URL for the Project Costs app; previous Project Management grid is gone, replaced by this splash screen.

## r05 — Project Costs app — loading (header shell appearing)
**Screen:** Project Costs app, one step further into load: the app chrome (purple Power Apps bar + header band) has rendered but the page body is still a spinner. Left rail not yet visible.
**Layout:** Purple "Power Apps" bar at top (app name not yet populated next to it). Below: header band with "Cloud" logo/wordmark at left, "Help" dropdown and a greyed user-avatar placeholder (a plain circle, name not yet loaded) at right, plus a horizontal loading bar element under the header. Body: centered circular spinner.
**Left rail:** Not yet rendered.
**Command bar / actions:** None yet.
**Fields / inputs:** None.
**Tables / grids:** None.
**Dialogs / panels:** None.
**Messages:** None.
**States and colours:** "Version" label visible under the Help area with no value yet populated. User pill is an empty grey circle (avatar not loaded) instead of the blue "Hi <name>" pill seen once loaded.
**Text captured verbatim:**
- "Power Apps"
- "Cloud"
- "Help"
- "Version"
**Changes vs the previous screenshot:** Splash screen (VSB logo + "Project Costs" title) has been replaced by the app's actual header chrome (purple bar, Cloud logo, Help, user-pill placeholder) with a spinner in the body — a later point in the same load sequence.

## r06 — Project Costs app — Capex Costs screen (DEVEX/CAPEX rail, "Wind Turbine / Panels" tab), with inline "Add" context menu open
**Screen:** Project Costs app, **Capex Costs screen**, reached via the **DEVEX/CAPEX** rail item (selected/highlighted). Sub-tab "Wind Turbine / Panels" is the active tab within this screen. A small inline context menu ("+ Add New Cost") is open, anchored under a row's "••• Add" control, for project "Contr. Endpoint Testproject" — the same project selected in r02/r03.
**Layout:** Top: purple Power Apps bar reading "Power Apps | Project Costs". App header band: VSB "Cloud" logo (Version 1.0.01 (Dev) caption underneath), page title "Contr. Endpoint Testproject", "Help" dropdown, blue "Hi Shakti Singh Rajput" user pill. Below header: a horizontal row of sub-tabs. Below tabs: a command/toolbar row. Below that: the year-matrix cost grid filling most of the screen, with a Grand Total row pinned at the very bottom and a horizontal scrollbar under it. Far left: a vertical navigation rail (~125px wide) with a green left-edge accent bar next to the selected top-level item.
**Left rail:** Top: a hamburger/menu icon. Then, in order: "DEVEX/CAPEX" (selected — shown with a blue-filled square icon and a light-blue/white highlighted row with a green vertical accent bar at the far left edge of the whole rail); "OPEX" (parent item, chevron pointing up "⌃" indicating expanded, grey outline icon) with children indented beneath it: "Operation & Maintenance", "Land Lease", "Other OPEX Costs" (each with a small grey document/folder-outline icon); "Contracts" (grey document icon, not indented — a top-level sibling of DEVEX/CAPEX and OPEX).
**Command bar / actions:** Sub-tabs (screen-level, in order): "DEVEX/CAPEX Summary", "Wind Turbine / Panels" (bold text with a blue underline — the active tab), "Development Expenses", "Construction Expenses", "Substation / Grid Connection", "Other CAPEX". Toolbar row beneath tabs: "+ Add Cost from Table" (blue link/button with a plus icon), a toggle switch labelled "Show Empty Accounts" (blue = ON), a toggle switch labelled "Show Total Planned/Paid" (blue = ON), a dropdown "Show All Cost", a left-arrow "‹", a year dropdown "2026", a right-arrow "›". A small grey pill/tooltip reading "Cluster 5" floats above the grid, right-aligned roughly over the Total Costs column.
**Fields / inputs:** No standalone form fields on this screen — all inputs are the toolbar controls above (toggles, dropdowns, year stepper) plus an inline "••• Add" row-level control and its flyout menu item "+ Add New Cost".
**Tables / grids:** Column headers, left to right: "Number", "Account Name", "Total Costs", "Total Paid", "Total Planned", then twelve month columns "Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec" (i.e., a period/month matrix for the selected year, 2026). Row structure (category → account → subaccount hierarchy):
- Row "80000 | Turbine / PV Supply Agreement" (bold, account-level, has a collapse "[-]" expander icon) — Total Costs "-", Total Paid "-", Total Planned "-", all twelve month cells "-".
  - Sub-row "80000_0 | Turbine / PV Supply Agreement" (indented one level, prefixed with an L-shaped connector line and its own "[-]" expander) — Total Costs "-", Total Paid "-", Total Planned "-", all month cells "-".
  - Below the sub-row: an inline "••• Add" control (three-dot icon + "Add" text) is present in every account's expanded area; here it is actively engaged, showing an open flyout menu item "+ Add New Cost" (plus-icon, black text) directly beneath it.
- Row "80001 | Additional WTG / PV Costs" (bold, account-level, has "[+]" expander implying collapsed/no children shown) — Total Costs "3,000", Total Paid "-", Total Planned "3,000", all twelve month cells "-".
- Footer/totals row "Grand Total" (dark grey/near-black background band, spans full width) — Total Costs "3,000", Total Paid "-", Total Planned "3,000", all twelve month cells "-".
Numbers are right-aligned; blank/zero cells are rendered as a single dash "-" rather than "0".
**Dialogs / panels:** No modal dialog; only the small inline flyout menu "+ Add New Cost" anchored to the "••• Add" row control (not a full dialog — a lightweight popover with a white background and border).
**Messages:** None.
**States and colours:** DEVEX/CAPEX rail item shows the selected state: filled/blue icon, light highlighted row background, green accent bar at the leftmost edge of the rail. OPEX rail icon is a plain grey outline, not selected, but expanded (chevron up) to reveal its three children. Toggle switches "Show Empty Accounts" and "Show Total Planned/Paid" are both ON (blue). The "Wind Turbine / Panels" tab is bold with a blue underline to mark it active; other tabs are plain grey text. Grand Total row uses an inverted dark band for emphasis. No italic/blue "calculated value" styling is visibly distinguishable in this frame — all figures shown are either "-" or a plain black "3,000"; Total Planned equalling Total Costs (both 3,000) suggests Total Planned may be a rollup, but no distinct calculated-value styling (italics/blue font) is visible in this screenshot.
**Text captured verbatim:**
- "Power Apps | Project Costs"
- "Cloud", "Version 1.0.01 (Dev)"
- "Contr. Endpoint Testproject"
- "Help", "Hi Shakti Singh Rajput"
- "DEVEX/CAPEX", "OPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs", "Contracts"
- "DEVEX/CAPEX Summary", "Wind Turbine / Panels", "Development Expenses", "Construction Expenses", "Substation / Grid Connection", "Other CAPEX"
- "+ Add Cost from Table", "Show Empty Accounts", "Show Total Planned/Paid", "Show All Cost", "2026"
- "Cluster 5"
- Column headers: "Number", "Account Name", "Total Costs", "Total Paid", "Total Planned", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
- "80000", "Turbine / PV Supply Agreement"
- "80000_0", "Turbine / PV Supply Agreement"
- "Add", "+ Add New Cost"
- "80001", "Additional WTG / PV Costs", "3,000"
- "Grand Total", "3,000"
**Changes vs the previous screenshot:** Entirely new screen — app has fully loaded past the r04/r05 splash and spinner into the Capex Costs data screen, with the left rail, tabs, toolbar and cost grid now rendered, and a row-level "Add New Cost" flyout open.

## r07 — Project Costs app — Contracts screen (loading)
**Screen:** Project Costs app, **Contracts screen**, reached via the **Contracts** rail item (now selected/highlighted). Content grid has not finished loading (spinner shown, no rows). Page title still reads "Contr. Endpoint Testproject" — same project as r06.
**Layout:** Same overall shell as r06 (purple bar, header band, left rail, content area) but no sub-tabs row here — instead a single command-bar row directly under the header, then a large empty content area with a centered spinner. Footer bar at the very bottom of the viewport now shows a version string.
**Left rail:** Same items as r06 — "DEVEX/CAPEX", "OPEX" (expanded, with children "Operation & Maintenance", "Land Lease", "Other OPEX Costs"), "Contracts". Now **"Contracts" is the selected item** (light grey/highlighted row background); "DEVEX/CAPEX" no longer shows the selected highlight or green accent bar.
**Command bar / actions:** "+ Add Development Contract", "+ Add Construction Contract", "+ Add Project Rights Contract" (all blue plus-icon links), then "Edit" (pencil icon) and "Delete" (trash icon) — both **greyed out/disabled** (no row selected, since the grid hasn't loaded/no data yet).
**Fields / inputs:** None visible yet (grid still loading).
**Tables / grids:** Not yet rendered — only a centered circular loading spinner in the content area; no column headers visible in this frame.
**Dialogs / panels:** None.
**Messages:** None beyond the red warning-triangle icon next to "Help" (present here, not present in r06 — see States below).
**States and colours:** A small red/orange warning-triangle icon appears immediately to the left of "Help" in the header (not seen in r06's header, where it was absent) — likely a transient environment/connection warning during navigation. Footer bar (bottom-left of the app) reads "Version 1.0.0.1" — visible only on this screen among the captured frames.
**Text captured verbatim:**
- "Contr. Endpoint Testproject"
- "Help", "Hi Shakti Singh Rajput"
- "DEVEX/CAPEX", "OPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs", "Contracts"
- "+ Add Development Contract", "+ Add Construction Contract", "+ Add Project Rights Contract", "Edit", "Delete"
- "Version 1.0.0.1"
**Changes vs the previous screenshot:** Rail selection moved from "DEVEX/CAPEX" to "Contracts"; the Capex tab row and cost grid are gone, replaced by the Contracts screen's own command bar (three "+ Add ... Contract" actions plus disabled Edit/Delete) and a loading spinner (grid content not yet rendered). A red warning-triangle icon now appears next to Help, and a "Version 1.0.0.1" footer string is now visible at the bottom of the window.

## r08 — Project Costs app — Capex Costs screen (DEVEX/CAPEX, "Wind Turbine / Panels"), with "saving costs" modal
**Screen:** Project Costs app, back on the **Capex Costs screen** (DEVEX/CAPEX rail item selected, "Wind Turbine / Panels" tab active) — same screen/state as r06 — but now with a modal overlay in progress: "Please wait, saving costs..." with a spinner, indicating a save operation triggered by the "Add New Cost" action seen in r06.
**Layout:** Same shell/tabs/toolbar/grid as r06, with a centered modal dialog box overlaying the grid (semi-transparent/white card with a drop shadow, roughly centered over rows "80000"/"80001").
**Left rail:** Same as r06 — "DEVEX/CAPEX" selected (highlighted, green accent bar), "OPEX" expanded with "Operation & Maintenance", "Land Lease", "Other OPEX Costs", and "Contracts" below.
**Command bar / actions:** Same toolbar as r06: "+ Add Cost from Table", "Show Empty Accounts" (blue ON), "Show Total Planned/Paid" (blue ON), "Show All Cost" dropdown, year stepper "‹ 2026 ›". Tabs: "DEVEX/CAPEX Summary", "Wind Turbine / Panels" (active), "Development Expenses", "Construction Expenses", "Substation / Grid Connection", "Other CAPEX".
**Fields / inputs:** None editable while the modal is up (background is present but the "••• Add" flyout from r06 is closed here).
**Tables / grids:** Same columns and rows as r06: "Number", "Account Name", "Total Costs", "Total Paid", "Total Planned", "Jan"–"Dec". Row "80000 | Turbine / PV Supply Agreement" (bold, expanded) with sub-row "80000_0 | Turbine / PV Supply Agreement" (all "-"); a plain "••• Add" control below it (flyout now closed, unlike r06). Row "80001 | Additional WTG / PV Costs": Total Costs "3,000", Total Paid "-", Total Planned "3,000", months all "-". Grand Total row (dark band) at bottom: "3,000" / "-" / "3,000" / months "-". "Cluster 5" pill still floats above the grid near the Total Costs column.
**Dialogs / panels:** A centered modal card, white background with border/shadow, no title bar, containing: a circular loading spinner and the text "Please wait, saving costs..." — no buttons (non-dismissable while saving).
**Messages:** "Please wait, saving costs..." (verbatim, inside the modal).
**States and colours:** Grid behind the modal is dimmed/inactive (greyed overlay context) while the modal blocks interaction. Otherwise same styling as r06 (Grand Total dark band, dashes for empty values, plain black "3,000" figures).
**Text captured verbatim:**
- "Please wait, saving costs..."
- (all other rail/tab/toolbar/grid text identical to r06 — see that entry)
**Changes vs the previous screenshot (r07):** Screen changed back from Contracts (r07) to the Capex/DEVEX Capex "Wind Turbine / Panels" screen; DEVEX/CAPEX is selected again in the rail instead of Contracts. A new "Please wait, saving costs..." modal with spinner is now overlaying the grid, which was not present in r06's otherwise-identical layout — this is the save confirmation following the "+ Add New Cost" action initiated in r06.

## r09 — Not app content: Clipchamp screen-recorder "Recording in progress" UI
**Screen:** This frame is **not** the Project Costs (or any VSB) app. It is the Microsoft Clipchamp screen-recorder's own "Recording in progress" control overlay, captured mid-recording, which produces a visible infinite-mirror/recursive effect (the recorder's own preview window nested inside itself repeatedly) because it is recording its own screen. No Cost app UI content is legible or relevant here beyond fragments of the recorded app faintly visible in the nested thumbnails (too small/blurred to read — `[unreadable]`).
**Layout:** Full browser window showing the Clipchamp "Recording in progress" page: page title "Recording in progress" top-left; a large nested/recursive video preview in the centre; below it, a "Record again" button (left) and a "Review ›" button (right, purple, primary); further below, a toolbar with disabled-looking icons "Camera", "Mic", "Screen", "Script", "Draw", "Effects"; at the very bottom, a disclaimer line and a large purple "Review ›" button.
**Left rail:** Not applicable (not the VSB app).
**Command bar / actions:** "Record again", "Review ›" (appears twice — once inline near the recording control, once as the large bottom-right primary button). Recording control cluster (floating, pill-shaped): record/stop icon, pause "II" icon, elapsed time "9:53" (also "9:54" in the nested copy), and a rotate/restart icon.
**Fields / inputs:** Search box placeholder "Search" in the Clipchamp top bar.
**Tables / grids:** None.
**Dialogs / panels:** None (this is a full-page recorder UI, not a dialog).
**Messages:** Disclaimer text at the bottom: "By recording, you agree to comply with your organization's terms, that you have the necessary permissions from people in your video, and that you will respect the copyright and privacy rights of others." (verbatim, partially repeated in the nested mirror copy).
**States and colours:** Purple/teal Clipchamp branding (distinct from the VSB app's purple Power Apps bar and blue VSB branding — do not confuse the two purples). Toolbar icons ("Camera", "Mic", "Screen", "Script", "Draw", "Effects") appear greyed/disabled.
**Text captured verbatim:**
- "Clipchamp"
- "Search"
- "Recording in progress"
- "Record again"
- "Review"
- "9:53" / "9:54" (elapsed recording time, nested copies)
- "Camera", "Mic", "Screen", "Script", "Draw", "Effects"
- "By recording, you agree to comply with your organization's terms, that you have the necessary permissions from people in your video, and that you will respect the copyright and privacy rights of others."
**Changes vs the previous screenshot:** Entirely unrelated context — this is the screen-recording tool's own UI, not a frame of the VSB Project Costs (or Project Management) app. No design information about the Cost app can be drawn from this frame beyond confirming the recording session was in progress at 16:59 on 03-09-2026.
