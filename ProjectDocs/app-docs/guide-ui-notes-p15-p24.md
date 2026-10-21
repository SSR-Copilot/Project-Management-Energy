# VSBCloud Project Management — UI Notes (Batch B, p15–p24)

---

## p15 — Milestones, project and cluster dates
**Screen:** Project screen "Milestones" tab, inside project **test0309** (status "Active"). Project-level screen, not admin.
**Layout:** Top: app header bar (VSB Cloud logo/version left, back arrow, project name "test0309" + status "Active" subtitle, "Help" dropdown and user chip "Hi Shakti Singh Rajput" right). Below header: left rail (~150px) with project nav icons/labels; main content area (2-column form) to the right, with a footer strip at the very bottom (Created By / Modified By / Required fields / Save / Cancel).
**Left rail items (in order):** General, Milestones (selected — blue highlight/bar), Generator, Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing. "Milestones" row has a light-blue background indicating current selection.
**Command bar / actions:** Footer bar: "Save" (with check icon) and "Cancel" (with X icon) buttons, right-aligned. "Required fields" label with info icon, left of Save/Cancel.
**Fields / inputs:** Two-column layout of date pickers, each with a red-asterisk-required label:
- Project Start = "Thursday, September 10, 2026" (filled)
- Cluster 1: Feasibility Studies = "Select a date..." (empty, calendar picker open showing Sep 2026 with 3rd highlighted, plus a month/year sub-picker showing "2026" and month grid Jan–Dec)
- Cluster 4: Pre-Construction = "Select a date..." with helper text "The date needs to be later than Cluster 3 date."
- Final Investment Decision = "Select a date..." (label partly obscured by calendar popup), helper text ends "...eeds to be later than Cluster 4 date."
- Cluster 5: Construction = "...date..." helper text "...eeds to be later than Final Investment Decision da..." (truncated by popup)
- Cluster 6: Operation = "...date..." helper text "...eeds to be later than Cluster 5 date." (truncated)
- Sales Completion Date = "...sales completion date..." helper text "The date needs to be later than sales starts date."
- Share of Farmdown [%] (with info "i" icon) = "50.0" (italic blue text, editable), with a small circular refresh/reset icon to its right
- Operational Lifetime = two side-by-side boxes: "0 years" / "0 months"
- Project End Date = "Select a date..." helper text "The date needs to be later than Cluster 6 date."
Each date field has a calendar-icon button; several also have an extra icon button beside it (looks like a "copy/apply date" icon, blue outlined square) next to fields lower on the page.
**Tables / grids:** None on this screen.
**Dialogs / panels:** An inline date picker popup is open under "Cluster 1: Feasibility Studies" — a two-panel calendar: left panel "September 2026" with Mo–Su columns, dates 31(prev)...1-30...1-4(next), "3" circled/highlighted in blue (today, per taskbar clock "03-09-2026"); "Go to today" link at bottom. Right panel "2026" with a Jan–Dec month grid.
**States and colours:** Filled/valid fields show plain (near-black) text; empty required fields show grey placeholder "Select a date..." with red validation helper text beneath in red. Selected calendar date (3) has a solid blue circle. Selected left-rail item has light blue background band.
**Text captured verbatim:**
- "Power Apps | Project Management"
- "VSB Cloud" "Version 1.0.0.1 (Dev)"
- "test0309" "Active"
- "Help" "Hi Shakti Singh Rajput"
- Left rail: "General", "Milestones", "Generator", "Production", "Cluster Check List", "Project Team", "Planning", "Grid Operator", "Revenue", "Financing"
- "Collapse Menu"
- "Project Start", "Cluster 1: Feasibility Studies", "Cluster 4: Pre-Construction", "Final Investment Decision", "Cluster 5: Construction", "Cluster 6: Operation", "Sales Completion Date", "Share of Farmdown [%]", "Operational Lifetime", "Project End Date"
- "Thursday, September 10, 2026"
- "Select a date..."
- "The date needs to be later than Cluster 3 date."
- "The date needs to be later than sales starts date."
- "50.0"
- "0 years" / "0 months"
- "September 2026", "Mo Tu We Th Fr Sa Su", "Go to today", "2026", "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec"
- "Created By: Shakti Singh Rajput  9/3/2026 10:49"
- "Modified By: # Azure VSB Cloud Flow Service User  9/3/2026 10:49"
- "Required fields", "Save", "Cancel"
**Changes vs the previous screenshot:** (first in this batch — no prior reference)

---

## p16 — Project information, populated fields
**Screen:** Same project screen ("Milestones" tab) for project **test0309**, "Active". Project-level screen.
**Layout:** Identical structure to p15 — header, left rail, two-column date form, footer.
**Left rail items:** Same list/order as p15; "Milestones" still selected (blue highlight).
**Command bar / actions:** Footer: "Required fields" / "Save" / "Cancel" — same as p15.
**Fields / inputs:** All milestone dates are now populated (auto-calculated, shown in italic blue text = system-computed / editable-derived value; "Project Start" and "Cluster 1" remain in plain black = manually entered):
- Project Start = "Thursday, September 10, 2026" (black, unchanged)
- Cluster 1: Feasibility Studies = "Fri, Sep 18, 2026" (black)
- Cluster 2: Pre-Permitting = "Fri, Feb 18, 2028" (italic blue) — new field now visible (was hidden under calendar popup in p15)
- Cluster 3: Permitting = "Saturday, August 25, 2029" (black)
- Cluster 4: Pre-Construction = "Wed, Feb 18, 2032" (italic blue)
- Final Investment Decision = "Wed, Aug 18, 2032" (italic blue)
- Cluster 5: Construction = "Thu, Aug 18, 2033" (italic blue)
- Cluster 6: Operation = "Fri, Aug 18, 2034" (italic blue)
- Sales Start Date = "Wed, Feb 18, 2032" (italic blue) — cursor/hover shown on its adjacent icon button
- Sales Completion Date = "Fri, Feb 18, 2033" (italic blue)
- Share of Farmdown [%] = "50.0" (italic blue, unchanged)
- Operational Lifetime = "0 years" / "0 months" (unchanged, still 0)
- Project End Date = "Select a date..." (still empty) — helper text still "The date needs to be later than Cluster 6 date."
Each populated date field (except Project Start, Cluster 1, Cluster 3) has TWO icon buttons to the right: a calendar icon and a second blue icon (looks like "copy value forward" / apply icon).
**Tables / grids:** None.
**Dialogs / panels:** None open (calendar popup closed vs p15).
**States and colours:** Italic blue text = system-suggested/derived date values (editable but auto-populated by cascading rule from Project Start + cluster durations). Plain black text = user-entered/fixed anchor dates (Project Start, Cluster 1, Cluster 3). Red asterisks on all required field labels. Red helper text remains only under "Project End Date" (still unfilled/invalid).
**Text captured verbatim (new/changed labels only; rest as p15):**
- "Cluster 2: Pre-Permitting", "Cluster 3: Permitting", "Sales Start Date"
- "Fri, Sep 18, 2026"; "Fri, Feb 18, 2028"; "Saturday, August 25, 2029"; "Wed, Feb 18, 2032"; "Wed, Aug 18, 2032"; "Thu, Aug 18, 2033"; "Fri, Aug 18, 2034"; "Fri, Feb 18, 2033"
**Changes vs the previous screenshot:** Calendar/month popup from p15 is closed. All cluster/FID/sales dates that were blank or hidden in p15 are now filled with auto-calculated (italic blue) values. "Cluster 2" and "Cluster 3" rows, hidden behind the p15 popup, are now visible. "Project End Date" remains the only unfilled field with a validation error.

---

## p17 — Checklist Settings, project gate configuration
**Screen:** Admin/global area (not inside a specific project) — page title "Checklist settings". This is a different application region: header now shows only "Cloud" logo + back arrow (no project name/status), no "test0309" chip.
**Layout:** Header row (logo, back arrow, page title "Checklist settings", Help, user chip). Below: left rail (admin nav, grouped under two section headers) + main content = a horizontal country/technology tab strip followed by a vertical accordion list of gate-transition rows. No footer bar (no Save/Cancel visible — this is a read list, not a form).
**Left rail items (grouped, in order):**
- Group "Project Gate" (collapsible, chevron-up/expanded): "Check List Settings" (selected, blue highlight), "Project Gates", "CAPEX Accounts"
- Group "Standard Assumptions" (collapsible, expanded): "Milestones", "Costs", "Contracts"
**Command bar / actions:** None (no button row); tab strip serves as filter.
**Fields / inputs:** None (list/accordion view only).
**Tables / grids:** Not a table; an accordion list of named checklist stages, each row with a label (left) and a down-chevron (right) to expand:
- "Draft to Cluster 1"
- "Cluster 1 to Cluster 2"
- "Cluster 2 to Cluster 3"
- "Cluster 3 to Cluster 4"
- "Cluster 4 to Cluster 5"
- "Cluster 5 to Cluster 6"
- "Criteria After Cluster 6 Entry"
Above the list, a horizontal tab strip of country+technology combinations: "Croatia PV" (selected/underlined, bold), "Croatia Wind", "Finland PV", "Finland Wind", "France PV", "France Wind", "Germany PV", "Germany Wind", "Greece PV", "Greece Wind", "Italy PV", "Italy Wind", "Poland PV", "..." (overflow/more).
**Dialogs / panels:** None open.
**States and colours:** Selected tab "Croatia PV" is bold black with a blue underline; other tabs are grey/muted text. Selected left-rail item "Check List Settings" has light-blue background bar.
**Text captured verbatim:**
- "Checklist settings"
- Tabs: "Croatia PV", "Croatia Wind", "Finland PV", "Finland Wind", "France PV", "France Wind", "Germany PV", "Germany Wind", "Greece PV", "Greece Wind", "Italy PV", "Italy Wind", "Poland PV", "…"
- List rows: "Draft to Cluster 1", "Cluster 1 to Cluster 2", "Cluster 2 to Cluster 3", "Cluster 3 to Cluster 4", "Cluster 4 to Cluster 5", "Cluster 5 to Cluster 6", "Criteria After Cluster 6 Entry"
- Left rail: "Project Gate", "Check List Settings", "Project Gates", "CAPEX Accounts", "Standard Assumptions", "Milestones", "Costs", "Contracts"
**Changes vs the previous screenshot:** Entirely different screen — moved from a project-scoped form (Milestones, p15/p16) to a global admin area with its own nav rail structure (two grouped sections replacing the flat project rail). No "test0309" project chip in header here.

---

## p18 — Project Gates, gate/checklist view
**Screen:** Admin area, page title "Project Gates" — same admin nav rail family as p17 but now on "Project Gates" item.
**Layout:** Header (title "Project Gates"). Left rail (admin nav, same two groups as p17, collapsed chevrons now down/pointing right — "Project Gate" group shown collapsed with just a small chevron, "Standard Assumptions" similarly). A second, narrower middle rail lists countries with flag icons and expand "+" controls. Main content (right, wide) = breadcrumb "Project Gates | Germany | Wind" then a data table.
**Left rail items:** "Project Gate" (group, collapsed marker "⌃"), "Check List Settings", "Project Gates" (selected, blue highlight), "CAPEX Accounts"; "Standard Assumptions" (group), "Milestones", "Costs", "Contracts".
**Middle country rail:** Germany (flag, expanded — shows "Wind" as parent context via breadcrumb, expand icon is "−" indicating expanded), France (+), Poland (+), Italy (+), Finland (+), Croatia (+) — each with national flag icon, collapsed (+) except Germany.
**Command bar / actions:** No top action buttons visible in this row (table itself has per-row actions).
**Fields / inputs:** None (table view).
**Tables / grids:** Breadcrumb: "Project Gates | Germany | Wind". Table columns (left to right): Description, Portfolio Manager, Contributors, Approvers, Notifications, Status, Action(s — column header partly cut off at right edge "Action|"). Rows are grouped by gate stage with a header row (bold, "−" expand icon) followed by task sub-rows:
- Header row "Draft to Cluster 1" (Portfolio Manager "-", Contributors "-", Approvers "-", Notifications "Shakti Singh (shakti.singh@xebia.com)", Status "Active" green chip)
  - Sub-row "DE Wind Draft Task 2" — Status "Inactive" grey chip
  - "+ Add Task" link
- Header row "Cluster 1 to Cluster 2" — Notifications: "Singh Rajput, Shakti (external) (shakti.singh@xebia.com)"; "Mathur, Rounak (external) (rounak.mathur@vsb.energy)"; "Azure VSB Cloud Flow Service Us... (flow.serviceuser.vsbcloud@vsb...)"
  - Sub-row "Crazy Monkey 2" — Approvers "Alexander Pilevski (alexander.pilevski@vsb.energy)"; Notifications "# Azure VSB Cloud Flow Service ... (flow.serviceuser.vsbcloud@vsb...)" and "Alexander Pilevski (alexander.pilevski@vsb.energy)"; Status "Active" green
  - Sub-row "First project layout created" — Approvers "Alexander Pilevski (alexander.pilevski@vsb.energy)"; Notifications "Lucas Georg (lucas.georg@vsb.energy)" and "# Azure VSB Cloud Flow Service ... (flow.serviceuser.vsbcloud@vsb...)" and "Alexander Pilevski (alexander.pilevski@vsb.energy)"; Status "Active"
  - Sub-row "Competitor analysis conducted" — Approvers "Lucas Georg (lucas.georg@vsb.energy)"; Notifications "Lucas Georg (lucas.georg@vsb.energy)"; Status "Active"
  - Sub-row "First contact made with the municipality" — Approvers "Lucas Georg (lucas.georg@vsb.energy)"; Notifications "Lucas Georg (lucas.georg@vsb.energy)"; Status "Active"
  - "+ Add Task" link (below, partially cut at bottom edge)
Each row has a pencil (edit) icon under "Action" column (right edge, partly clipped).
**Dialogs / panels:** None open on this screenshot.
**States and colours:** Status chips: green pill = "Active"; grey pill = "Inactive". Approvers/Contributors/Portfolio Manager show "-" when unset. Country rail: cursor/hover shown near Germany flag.
**Text captured verbatim:**
- "Project Gates | Germany | Wind"
- Column headers: "Description", "Portfolio Manager", "Contributors", "Approvers", "Notifications", "Status", "Action" (partially clipped)
- "Draft to Cluster 1", "DE Wind Draft Task 2", "+ Add Task"
- "Cluster 1 to Cluster 2", "Crazy Monkey 2", "First project layout created", "Competitor analysis conducted", "First contact made with the municipality"
- "Active", "Inactive"
- Names/emails as listed above
**Changes vs the previous screenshot:** New screen ("Project Gates" selected in left rail vs "Check List Settings" in p17). New middle country rail appears (not present in p17). Table replaces the accordion list; shows actual assigned people/approvers/notification recipients and Active/Inactive status per gate and task.

---

## p19 — Project Gate, approvers configuration (Edit Approvers panel)
**Screen:** Same "Project Gates" admin screen as p18, Germany | Wind, with a right-side slide-in panel "Edit Approvers" open (triggered by the pencil/edit icon on "Draft to Cluster 1" row).
**Layout:** Background (dimmed/greyed) shows the same table as p18. Middle country rail now shows Germany expanded with "Wind" and "PV" sub-items visible (flag list). A modal/panel slides in from the right (~30% width, blue title bar) titled "Edit Approvers" with an "X" close icon at top right.
**Left rail items:** Same as p18 (background, dimmed).
**Middle rail (now expanded):** Germany (flag) > "Wind" (visible sub-item), "PV" (visible sub-item); France (+), Poland (+), Italy (+), Finland (+), Croatia (+).
**Command bar / actions:** Panel footer buttons: "Save" (blue, check icon) and "Cancel" (outline, X icon), bottom right of panel.
**Fields / inputs (in "Edit Approvers" panel):**
- "Gate" — dropdown, value "Draft to Cluster 1" (greyed/disabled-looking)
- Toggle "Gate active" — off/grey (toggle switch, disabled-looking, unchecked)
- "Approval Mode" — radio button group: "Formal Approval", "Local Approval", "Only Notifications" (selected — blue filled radio)
- "Notifications" (required, red asterisk) — multi-select tag input, currently containing one tag "Shakti Singh" (blue rounded chip with "SS" avatar and "x" remove icon) plus placeholder text "Select Notifications"
- Button "Reset Gate" (blue) with helper caption to its right: "Remove all cluster gate participants and deactivate the gate approval."
**Tables / grids:** None inside panel (background table from p18, dimmed/inactive).
**Dialogs / panels:** The panel itself — Title "Edit Approvers", close "X" top right, section header "Gate", section header "Approval Mode", section header "Notifications".
**States and colours:** "Only Notifications" radio is selected (solid blue dot). "Gate active" toggle appears off (grey). "Notifications" chip is blue with white "SS" circular avatar initials. "Reset Gate" button is solid blue.
**Text captured verbatim:**
- "Edit Approvers"
- "Gate", "Draft to Cluster 1"
- "Gate active"
- "Approval Mode", "Formal Approval", "Local Approval", "Only Notifications"
- "Notifications", "Shakti Singh", "Select Notifications"
- "Reset Gate", "Remove all cluster gate participants and deactivate the gate approval."
- "Save", "Cancel"
**Changes vs the previous screenshot:** "Edit Approvers" right panel newly opened (was closed in p18). Middle country rail: Germany's "Wind"/"PV" children now visible (were collapsed under just the breadcrumb in p18). Rest of background table unchanged content-wise but dimmed/inactive.

---

## p20 — Project Gates, updated configuration (panel closed, table with edit/delete actions visible)
**Screen:** Same "Project Gates" admin screen, Germany | Wind — "Edit Approvers" panel now closed; full table visible including the previously-clipped "Action" column.
**Layout:** Same as p18 layout (header, left rail, middle country rail, main table) but now the full width table is shown (no dimming), and the "Action" column with both edit (pencil) AND delete (trash) icons is fully visible for each row (previously clipped at the right edge in p18).
**Left rail items:** Same as p18/p19 — "CAPEX Accounts" now shown with hover/cursor near it (mouse hovering, not yet selected — "Project Gates" still highlighted/selected).
**Middle rail:** Germany expanded showing "Wind", "PV"; France (+), Poland (+), Italy (+), Finland (+), Croatia (+).
**Command bar / actions:** None above table; per-row action icons only.
**Fields / inputs:** None.
**Tables / grids:** Same breadcrumb "...ates | Germany | Wind" (clipped left) and same columns as p18: Description, Portfolio Manager, Contributors, Approvers, Notifications, Status, Action. Now every row shows BOTH a pencil (edit) and a trash-can (delete) icon under Action — e.g. "Draft to Cluster 1" row: Notifications "Shakti Singh (shakti.singh@xebia.com)", Status "Active", icons edit+delete visible; "DE Wind Draft Task 2" sub-row: Status "Inactive", icons edit+delete; "Cluster 1 to Cluster 2" group similarly with edit+delete; task rows "Crazy Monkey 2", "First project layout created", "Competitor analysis conducted", "First contact made with the municipality" all show edit+delete icon pairs, all "Active".
**Dialogs / panels:** None open.
**States and colours:** Same green "Active" / grey "Inactive" chips as p18.
**Text captured verbatim:** Same row/column text as p18 (see above) — delete (trash) icons now visible next to each pencil icon in the Action column.
**Changes vs the previous screenshot:** "Edit Approvers" panel from p19 is closed. The Action column, previously cut off at the screen edge in p18, is now fully visible showing an edit AND a delete icon per row (confirms each row supports both edit and delete). Mouse cursor is hovering over "CAPEX Accounts" in the left rail (about to navigate there).

---

## p21 — CAPEX Accounts, account categories
**Screen:** Admin area, page title "CAPEX Accounts" — left rail now on "CAPEX Accounts" (selected, blue highlight).
**Layout:** Header (title "CAPEX Accounts"). Left rail (same admin groups as before). Main content: a horizontal tab strip of CAPEX categories, a toolbar row (Reorder / New / Edit / Deactivate), and a flat list of account rows (radio-select + name + status chip + expand chevron).
**Left rail items:** "Project Gate" group: "Check List Settings", "Project Gates", "CAPEX Accounts" (selected, highlighted). "Standard Assumptions" group: "Milestones", "Costs", "Contracts".
**Command bar / actions:** Toolbar directly above the list: "Reorder" (icon), "+ New", "Edit" (pencil icon), "Deactivate" (icon) — all appear enabled (dark text/icons).
**Fields / inputs:** None (list view).
**Tables / grids:** Not a grid — a simple selectable list under the active tab "Wind Turbine / Panels":
- Radio-selected row "80000 - Turbine / PV Supply Agreement" — Status "Active" (green chip), chevron-down (expanded indicator) at right
- "80001 - Additional WTG / PV Costs" — "Active" (green), chevron
- "80003 - Cost and Other Utilities (In-active)" — Status "Inactive" (grey chip), chevron
Tab strip above: "Wind Turbine / Panels" (selected, bold/underlined), "Development Expenses", "Construction Expenses", "Overleveraging", "Substation / Grid Connection", "Other CAPEX".
**Dialogs / panels:** None open.
**States and colours:** Selected tab bold+underlined blue; others grey. Selected row (80000) has a filled blue radio button; other rows have empty/outline radio buttons. Green "Active" pill vs grey "Inactive" pill status chips (note: row 80003's label text itself also literally contains "(In-active)" in addition to its status chip reading "Inactive").
**Text captured verbatim:**
- "CAPEX Accounts"
- Tabs: "Wind Turbine / Panels", "Development Expenses", "Construction Expenses", "Overleveraging", "Substation / Grid Connection", "Other CAPEX"
- Toolbar: "Reorder", "New", "Edit", "Deactivate"
- "80000 - Turbine / PV Supply Agreement", "Active"
- "80001 - Additional WTG / PV Costs", "Active"
- "80003 - Cost and Other Utilities (In-active)", "Inactive"
**Changes vs the previous screenshot:** New screen — navigated from "Project Gates" to "CAPEX Accounts" (left rail selection moved). Layout pattern changes from the two-panel gate/table view to a tab-strip + toolbar + flat radio list.

---

## p22 — Edit Milestones, cluster durations and success rates (right panel)
**Screen:** Admin area, page title "Milestones" (under "Standard Assumptions" group), with a right-side panel "Edit Milestones for Germany" open.
**Layout:** Background: left rail + a middle "country" list (flat list of country names, no flags/icons here, unlike p18-20's flag rail) + main content showing "Apply All" checkbox row, "Germany" heading, "Edit"/"Apply" checkboxes, and a data table (Technology rows × Cluster columns). A right slide-in panel ("Edit Milestones for Germany") overlays roughly the right 35% of the screen, scrollable (scrollbar visible), with a blue title bar.
**Left rail items:** "Project Gate" group: "Check List Settings", "Project Gates", "CAPEX Accounts". "Standard Assumptions" group: "Milestones" (selected, highlighted), "Costs", "Contracts".
**Middle list (background, dimmed):** Country names as plain rows (no flags): Germany, France, Spain, Italy, Poland, Finland, Greece, Croatia, Romania.
**Command bar / actions:** Background: "Apply All" (checkbox, greyed/disabled look) top of content; row "Edit" / "Apply" checkboxes under "Germany" heading (Edit checkbox appears checked/blue, Apply unchecked). Panel footer: "Save" (blue) and "Cancel" (outline) buttons bottom-right of panel.
**Fields / inputs (panel "Edit Milestones for Germany"):** Organized under section header "Cluster Durations [months]" with two value columns "Wind" and "PV", one row per cluster — each cell is an editable numeric text box (grey background, dark text):
- Cluster 1: Wind 17, PV 6
- Cluster 2: Wind 18, PV 12
- Cluster 3: Wind 30, PV 8
- Cluster 4: Wind 6, PV 6
- Final Investment Decision: Wind 12, PV 6
- Cluster 5: Wind 12, PV 12
- Operational Lifetime: Wind "3..." PV "3..." (truncated, value cut off by box width)
- Sales Start: Wind 0, PV 0
- Sales End: Wind 6, PV 6
Second section header "Cluster Probabilities - Success Rate [-]", columns "Wind"/"PV" again:
- Cluster 1: Wind 0.2, PV 0.3
- Cluster 2: Wind "0..." PV "0..." (truncated)
- Cluster 3: Wind "0..." PV 0.8 (partially visible, panel cut off at bottom of screenshot)
**Tables / grids (background, dimmed, "Technology" table for Germany):** Columns: Technology, Cluster 1, Cluster 2, Cluster 3, Cluster 4, FID, Cluster 5, Operatio[n] (rightmost column clipped by panel overlay). Row groups by Technology, two sub-rows each ("Duration [months]" and "Success Rate [-]"):
- "Wind": Duration row = 17, 18, 30, 6, 12, 12, [clipped]; Success Rate row = 0.2, 0.71, 0.85, 0.95, 1, 1, [clipped]
- "PV": Duration row = 6, 12, 8, 6, 6, 12, [clipped]; Success Rate row = 0.3, 0.74, 0.8, 0.95, 1, 1, [clipped]
**Dialogs / panels:** "Edit Milestones for Germany" — title bar blue with white text, "X" close icon top-right; content sections "Cluster Durations [months]" and "Cluster Probabilities - Success Rate [-]" as detailed above; scrollable (vertical scrollbar visible on right edge of panel).
**States and colours:** Numeric input boxes appear grey-filled (editable text boxes) throughout the panel. Background "Apply All" checkbox and "Edit"/"Apply" row checkboxes are small square checkboxes; "Edit" looks checked (blue check), "Apply" unchecked.
**Text captured verbatim:**
- "Edit Milestones for Germany"
- "Cluster Durations [months]", "Wind", "PV"
- "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Final Investment Decision", "Cluster 5", "Operational Lifetime", "Sales Start", "Sales End"
- "Cluster Probabilities - Success Rate [-]"
- "Apply All", "Germany", "Edit", "Apply"
- Table headers: "Technology", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "FID", "Cluster 5", "Operatio[n]"
- Row labels: "Wind", "PV"; sub-labels "Duration [months]", "Success Rate [-]"
- "Save", "Cancel"
- Country list: "Germany", "France", "Spain", "Italy", "Poland", "Finland", "Greece", "Croatia", "Romania"
**Changes vs the previous screenshot:** New screen ("Milestones" under "Standard Assumptions" selected). Middle rail changes shape entirely — flat country name list (no flags) instead of the flag+expand rail used for Project Gates/CAPEX. New right-side "Edit Milestones for Germany" panel is open, distinct in structure/fields from the "Edit Approvers" panel seen in p19 (numeric duration/rate grid vs. approval-mode radios).

---

## p23 — Standard Assumptions / Costs configuration
**Screen:** Admin area, page title "Costs" (under "Standard Assumptions" group, item "Costs" selected/highlighted).
**Layout:** Header (title "Costs"). Left rail (same groups). Middle rail: flag+country list (Germany expanded, flags visible again — same style as p18-20). Main content: breadcrumb "Standard Assumptions / Costs / Germany / Wind", an info/apply banner, an "Apply was made by" note, an "Add Cost"/"Apply" action row, and an expandable Category/Account cost table, followed by collapsed summary sections.
**Left rail items:** "Project Gate" group: "Check List Settings", "Project Gates", "CAPEX Accounts". "Standard Assumptions" group: "Milestones", "Costs" (selected, highlighted), "Contracts".
**Middle rail:** Germany (flag, expanded/selected), France (+), Poland (+), Italy (+), Finland (+), Croatia (+).
**Command bar / actions:** "Apply to All" button (greyed/disabled) with info icon and caption "Apply standard cost to relevant projects, this will override existing standard assumption cost." Below: info banner "02.09.2025 Apply was made by # Azure VSB Cloud Flow Service User". Action row: "+ Add Cost" (blue, enabled), "Apply" (greyed/disabled) with the same override caption repeated beside it.
**Fields / inputs:** None editable inline (table is read display); "Add Cost" presumably opens a form (not shown).
**Tables / grids:** Breadcrumb "Standard Assumptions / Costs / Germany / Wind". Table columns: Category / Account, Sub-Account, Description, Cost.
- Expandable group "Wind Turbine / Panels" (expanded, "−" icon):
  - Row: "Turbine / PV Supply Agreement" | "Turbine / PV Supply Agreement - 80000_0" | "Same Ind Contract" | "10,000 EUR"
  - Row: "Turbine / PV Supply Agreement" | "Turbine / PV Supply Agreement - 80000_0" | "same Ind Contract Extra Cl" | "10,000 EUR"
- Collapsed group "Development Expenses" ("+")
- Collapsed group "Other CAPEX" ("+")
- Horizontal scrollbar shown under the table (more columns off-screen to the right)
Below the CAPEX table, three collapsed summary sections (each a full-width row with a down-chevron): "Operation & Maintenance", "Land Lease", "Other OPEX Costs".
**Dialogs / panels:** None open.
**States and colours:** "Apply to All" and "Apply" buttons appear greyed/disabled (light grey text/border) vs. "+ Add Cost" which is blue/enabled. Info banner has a light blue background with an "i" icon.
**Text captured verbatim:**
- "Costs"
- "Standard Assumptions / Costs / Germany / Wind"
- "Apply to All"
- "Apply standard cost to relevant projects, this will override existing standard assumption cost."
- "02.09.2025 Apply was made by # Azure VSB Cloud Flow Service User"
- "+ Add Cost", "Apply"
- Table headers: "Category / Account", "Sub-Account", "Description", "Cost"
- "Wind Turbine / Panels", "Turbine / PV Supply Agreement", "Turbine / PV Supply Agreement - 80000_0", "Same Ind Contract", "same Ind Contract Extra Cl", "10,000 EUR" (×2)
- "Development Expenses", "Other CAPEX"
- "Operation & Maintenance", "Land Lease", "Other OPEX Costs"
**Changes vs the previous screenshot:** New screen ("Costs" selected instead of "Milestones"). Middle rail reverts to the flag+country style (as in p18-20) rather than the flat list used on the Milestones screen (p22). No side panel open here (unlike p19/p22).

---

## p24 — Final configuration screen / end state
**Screen:** Same admin area; header title still reads "Costs", breadcrumb still reads "Standard Assumptions / Costs / Germany / Wind" — BUT the left rail now shows "Contracts" as the selected/highlighted item instead of "Costs". This mismatch (page chrome/breadcrumb not yet updated to "Contracts") appears to be the actual on-screen state at this step, not a misread — flagging verbatim as observed.
**Layout:** Same as p23: header, left rail, middle flag/country rail (Germany expanded), main content with breadcrumb, banner, action row, expandable table, and collapsed summary sections — but the cost table's group header row now differs (see below) and the "Wind Turbine / Panels" group is collapsed rather than expanded.
**Left rail items:** "Project Gate" group: "Check List Settings", "Project Gates", "CAPEX Accounts". "Standard Assumptions" group: "Milestones", "Costs", "Contracts" (selected — blue highlight, mouse cursor shown resting on it).
**Middle rail:** Germany (flag, expanded), France (+), Poland (+), Italy (+), Finland (+), Croatia (+) — identical to p23.
**Command bar / actions:** Same "Apply to All" (greyed) with caption, banner "02.09.2025 Apply was made by # Azure VSB Cloud Flow Service User", and action row "+ Add Cost" (blue) / "Apply" (greyed) with caption — identical wording to p23.
**Fields / inputs:** None editable inline.
**Tables / grids:** Breadcrumb: "Standard Assumptions / Costs / Germany / Wind" (unchanged text, even though "Contracts" is the selected nav item). A new section header row above the table: "DEVEX/CAPEX" (bold, with an up-chevron, i.e. expanded/collapsible section wrapping the whole cost table). Table columns: Category / Account, Sub-Account, Description, Cost (same headers as p23). All three groups now collapsed ("+"): "Wind Turbine / Panels", "Development Expenses", "Other CAPEX" — no cost rows visible (contrast with p23 where "Wind Turbine / Panels" was expanded showing 2 rows). Same horizontal scrollbar below table. Same three collapsed summary sections below: "Operation & Maintenance", "Land Lease", "Other OPEX Costs".
**Dialogs / panels:** None open.
**States and colours:** Same disabled/enabled button styling as p23. "Contracts" left-rail item has the blue selection highlight band (same visual treatment "Milestones"/"Costs" had when selected in earlier screens).
**Text captured verbatim:**
- "Costs" (page title, unchanged)
- "Standard Assumptions / Costs / Germany / Wind" (breadcrumb, unchanged)
- "DEVEX/CAPEX" (new section header, not present in p23)
- "Apply to All", "Apply standard cost to relevant projects, this will override existing standard assumption cost."
- "02.09.2025 Apply was made by # Azure VSB Cloud Flow Service User"
- "+ Add Cost", "Apply"
- Table headers: "Category / Account", "Sub-Account", "Description", "Cost"
- "Wind Turbine / Panels", "Development Expenses", "Other CAPEX"
- "Operation & Maintenance", "Land Lease", "Other OPEX Costs"
**Changes vs the previous screenshot:** Left-rail selection moved from "Costs" to "Contracts", but the page header title and breadcrumb still display "Costs" / ".../Costs/..." — i.e., the visible content did not (yet) switch to a distinct "Contracts" view; it looks like the same Costs table view with a new collapsible "DEVEX/CAPEX" wrapper header added and all groups collapsed. This is the last screenshot in the batch (end state / final configuration screen per the step list) — worth flagging to the rebuild team as a possible transitional/loading state rather than a distinct "Contracts" screen design.
