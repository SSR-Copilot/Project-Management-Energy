# VSBCloud Project Management — UI Notes, Batch D (q18–q26)

Common app chrome on every screen (not repeated per section unless it changes):
- Purple Power Apps host bar: "Power Apps | Project Management" (with info icon), and on the right: Share ⌄, a pentagon icon, a download icon, a gear icon, "?", and a user avatar circle "SR".
- App header (white bar): VSB "Cloud" logo (blue leaf icon) with "Version 1.0.0.1 (Dev)" caption underneath; a back-arrow button in a box; vertical divider; record title "0 Test Lucas" in bold with a status line below it showing a small circle icon + "Active"; far right: a red warning-triangle "Help ⌄" and a blue pill button "Hi Shakti Singh Rajput" with an avatar.
- Left rail (exact order every screen): General, Milestones, Generator, Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing. Each item has a small icon left of the label. At the bottom of the rail: "Collapse Menu" with a collapse icon.
- Footer command area on edit/detail forms: "✓ Save" (blue outline) and "✕ Cancel" (grey outline), bottom-right of the page or of an open side panel.

---

## q18 — Cluster Check List
**Screen:** Cluster Check List (rail item "Cluster Check List" highlighted, light-grey background, bold text). No dialog open; a tooltip/popover is showing over the Cluster 2 stage node (hover state), not a modal.
**Layout:** Top: header row as described above. Below header: a horizontal cluster-stage tracker (stepper) spanning the page width. Below that: a command-button row (View Cluster 3 Request History / Abandon / Inactivate-Place on-hold). Below that: "Draft Checklist" section title and a data table.
**Left rail:** As common list above; "Cluster Check List" is selected (bold, light background, dark left accent bar).
**Command bar / actions:** "⚡ View Cluster 3 Request History" (blue filled button), "⊖ Abandon" (outlined button, appears greyed/disabled — cursor hovering on it), "🔒 Inactivate/Place On-hold" (outlined button).
**Fields / inputs:** None as standalone fields on this view (table-only); stage tracker acts as a status control.
**Tables / grids:** "Draft Checklist" table columns, left to right: "Gate Relevance", "Holding Description", "Country Description", "Completion Date", "Status". Two rows visible:
  - Yes | DE Wind Draft Task 1 | Lorem Ipsum | (pencil edit icon) | "In Progress" chip | (partially cut off second status column "Co...")
  - No | DE Wind Draft Task 2 | Lorem Ipsum | (pencil edit icon) | "In Progress" chip | "Co..." (cut off)
  Note: table extends off the right edge of the visible frame — a further column beginning "Co..." (likely "Completed"/"Comment") is cut off by the frame edge.
**Dialogs / panels:** A small popover/tooltip anchored to the Cluster 2 stepper node, titled with two fields:
  - "Approvers:" shakti.singh@vsb.energy
  - "Notifications:" flow.serviceuser.vsbcloud@vsb.energy
**Messages:** None (toast/banner) — only the approvers/notifications popover text above.
**States and colours:** Stepper nodes: "Draft" and "Cluster 1 Feasibility Studies" are solid green with a white checkmark, each labeled "Completed" underneath; a green circular mail/envelope icon sits between completed stages (transition/notification marker); the "Cluster 2 Pre-Permitting" node is a green circle with a cursor/pointer icon (hover target, not yet checked) — mouse cursor visible on it; "Cluster 3 Permitting" node is pale green, labeled "In Progress"; "Cluster 4 Pre-Construction", "Cluster 5 Construction", "Cluster 6 Operation" nodes are grey/unfilled (not started). Small envelope icons appear at several transition points between stage boxes.
**Text captured verbatim:**
- "Draft" / "Completed"
- "Cluster 1 Feasibility Studies" / "Completed"
- "Cluster 2 Pre-Permitting" (visible under popover)
- "Cluster 3 Permitting" / "In Progress"
- "Cluster 4 Pre-Construction"
- "Cluster 5 Construction"
- "Cluster 6 Operation"
- "Approvers:"
- "shakti.singh@vsb.energy"
- "Notifications:"
- "flow.serviceuser.vsbcloud@vsb.energy"
- "View Cluster 3 Request History"
- "Abandon"
- "Inactivate/ Place On-hold"
- "Draft Checklist"
- "Gate Relevance", "Holding Description", "Country Description", "Completion Date", "Status"
- "Yes", "No"
- "DE Wind Draft Task 1", "DE Wind Draft Task 2"
- "Lorem Ipsum" (x2)
- "In Progress" (x2, status chips)
**Changes vs the previous screenshot:** N/A (first in this batch).

---

## q19 — Cluster Check List
**Screen:** Cluster Check List (same as q18), rail selection unchanged. No dialog/popover open now.
**Layout:** Identical layout to q18: stage tracker, command row, "Draft Checklist" table.
**Left rail:** Same as q18, "Cluster Check List" selected.
**Command bar / actions:** Same three buttons as q18 — "⚡ View Cluster 3 Request History", "⊖ Abandon", "🔒 Inactivate/ Place On-hold" — cursor now hovering over "Abandon" (shown with a light-blue hover highlight box around it).
**Fields / inputs:** None.
**Tables / grids:** Same "Draft Checklist" table, same two rows as q18 (Gate Relevance / Holding Description / Country Description / Completion Date / Status): Yes–DE Wind Draft Task 1–Lorem Ipsum–[edit icon]–In Progress; No–DE Wind Draft Task 2–Lorem Ipsum–[edit icon]–In Progress. Right edge still cut off with a "Co..." column visible.
**Dialogs / panels:** None open.
**Messages:** None.
**States and colours:** Stepper now shows "Cluster 2 Pre-Permitting" fully solid green with white checkmark, labeled "Completed" (advanced from the hover state in q18). "Cluster 3 Permitting" remains pale green / "In Progress". Later clusters (4,5,6) remain grey/unfilled. Green envelope icons between completed stage pairs.
**Text captured verbatim:**
- "Draft" / "Completed"
- "Cluster 1 Feasibility Studies" / "Completed"
- "Cluster 2 Pre-Permitting" / "Completed"
- "Cluster 3 Permitting" / "In Progress"
- "Cluster 4 Pre-Construction"
- "Cluster 5 Construction"
- "Cluster 6 Operation"
- "View Cluster 3 Request History", "Abandon", "Inactivate/ Place On-hold"
- "Draft Checklist"
- "Gate Relevance", "Holding Description", "Country Description", "Completion Date", "Status"
- "Yes", "No", "DE Wind Draft Task 1", "DE Wind Draft Task 2", "Lorem Ipsum", "In Progress"
**Changes vs the previous screenshot:** The approvers/notifications popover from q18 is gone. "Cluster 2 Pre-Permitting" node changed from an interactive hover circle to a fully completed (green check, "Completed" label) stage. Cursor moved to hover over the "Abandon" button, which now shows a light hover-highlight state.

---

## q20 — Cluster Check List (Cluster Movement / Request History dialog)
**Screen:** Cluster Check List, with a large modal dialog open on top: "Cluster Movement to Cluster 3" (this is the "View Cluster 3 Request History" action from q18/q19 — NOT a map; no map is present anywhere in this batch).
**Layout:** Modal covers most of the page from just below the header bar to the bottom, left-aligned starting roughly 1/4 across the screen (revealing a sliver of the underlying Cluster Check List page on the left). Modal has a blue title bar, a "History" section header with a refresh icon, then two stacked comment blocks each followed by a small data table, and a footer with Cancel (partially visible at bottom edge, cut off).
**Left rail:** Same rail visible in the sliver on the left (Cluster Check List still selected, though obscured by modal).
**Command bar / actions:** Underlying page's "⚡ View Cluster 3 Req..." button visible (partially, being covered) — this modal is what that button opens. Modal footer shows a "✕ Cancel" button at the very bottom-right edge (cut off by frame).
**Fields / inputs:** None editable; all read-only history rows.
**Tables / grids:** Two separate mini-tables under two comment entries, columns identical for both: "Gate Relevance", "Description", "Cluster", "State", "Modified By", "Modified On".
  Table 1 (under Comment: "Done", dated "Tue, May. 12, 2026 00:21", by "# Azure VSB Cloud Flow Service ..."):
  - Yes | DE Wind Draft Task 1 | Draft | None | (blank) | (blank)
  - No | DE Wind Draft Task 2 | Draft | None | (blank) | (blank)
  - No | DE Wind Draft Task 3 | Draft | None | (blank) | (blank)
  Table 2 (under Comment: "Approval requested - Test", dated "Wed, May. 21, 2025 17:54", by "Lucas Georg"):
  - Yes | DE Wind Draft Task 1 | Draft | None | (blank) | (blank)
  - No | DE Wind Draft Task 2 | Draft | None | (blank) | (blank)
**Dialogs / panels:** Modal title: "Cluster Movement to Cluster 3". Section label: "History" with a circular refresh/reload icon at the far right of that row. Two "Comment:" entries, each with comment text, a right-aligned timestamp, and (for the first) an author/system name; each followed by its table.
**Messages:** Comment text values: "Done" and "Approval requested - Test" — these read as workflow/audit log entries, not toast notifications.
**States and colours:** All history table values are plain black text (no italic/blue derived-value styling observed); "State" column shows "None" for every row (plain, not colored).
**Text captured verbatim:**
- "Cluster Movement to Cluster 3"
- "History"
- "Comment:" / "Done"
- "Tue, May. 12, 2026 00:21"
- "# Azure VSB Cloud Flow Service ..." (truncated with ellipsis)
- "Gate Relevance", "Description", "Cluster", "State", "Modified By", "Modified On"
- "Yes", "No", "DE Wind Draft Task 1", "DE Wind Draft Task 2", "DE Wind Draft Task 3", "Draft", "None"
- "Comment:" / "Approval requested - Test"
- "Wed, May. 21, 2025 17:54"
- "Lucas Georg"
- "Cancel" (cut off at bottom edge)
**Changes vs the previous screenshot:** The "Cluster Movement to Cluster 3" modal has opened (triggered by "View Cluster 3 Request History"), covering the checklist table with a two-entry audit history and its own mini-tables.

---

## q21 — Project Team
**Screen:** Project Team (rail item "Project Team" highlighted). No dialog open.
**Layout:** Header, then a command-button row directly under the header, then a flat table of team members filling the rest of the page (no tabs, no stage tracker).
**Left rail:** Full common list; "Project Team" selected (bold, light-grey background, dark accent bar on its left edge).
**Command bar / actions:** "+ Add Member" (appears active/focused, cursor hovering on it, shown with a light hover box), "✎ Edit" (greyed out/disabled — no row selected), "🗑 Delete" (greyed out/disabled).
**Fields / inputs:** A small unlabeled radio/selection circle appears to the left of the "Properties" row (row-select control), unselected (hollow circle).
**Tables / grids:** Columns: "Description", "Display Name", "Comment" (Comment column header shown but no values). Two rows:
  - Project Manager | Georg, Lucas (external) | (blank)
  - Properties | Shakti Singh | (blank) — this row has the selection radio circle to its left
**Dialogs / panels:** None open.
**Messages:** None.
**States and colours:** No italic/blue derived values observed. "Add Member" shows a light-blue hover/press highlight around the icon+label consistent with cursor position.
**Text captured verbatim:**
- "Add Member", "Edit", "Delete"
- "Description", "Display Name", "Comment"
- "Project Manager", "Georg, Lucas (external)"
- "Properties", "Shakti Singh"
**Changes vs the previous screenshot:** Entirely different screen/rail selection — moved from Cluster Check List to Project Team; the Cluster Movement modal is closed.

---

## q22 — Planning (General tab)
**Screen:** Planning (rail item "Planning" highlighted). Sub-tab "General" selected within Planning. A dropdown for "Legal Planning Basis" is open (expanded options list), not a modal dialog.
**Layout:** Header, then a 3-tab strip ("General" | "Repowering" | "Aquisition Status") directly under header, then a two-column field layout: left column "Cooperation", right column "Legal Planning Basis" (dropdown open) and beneath it "Planning Basis Details" (text area with character counter). Below the two columns: a "Height limitation WTG" toggle, then a "New Permit / Edit / Delete" command row, then an empty "Permit" table with columns Permit / Permit Submitted / Permit Approved. Footer: Save/Cancel buttons.
**Left rail:** Full common list; "Planning" selected (bold, light background, left accent bar).
**Command bar / actions:** Tabs: "General" (active, underlined), "Repowering", "Aquisition Status". Row-level buttons: "+ New Permit", "✎ Edit" (greyed/disabled), "🗑 Delete" (greyed/disabled). Page footer: "✓ Save" (blue), "✕ Cancel" (outline) at bottom-right.
**Fields / inputs:**
  - "Cooperation" — dropdown, empty/unselected, no red asterisk shown (not required).
  - "Legal Planning Basis" — dropdown, currently open, showing options: "Outer Area Building Privelage" [sic, as displayed], "Regional plan", "Zoning Master plan" (highlighted blue = hovered/focused option), "Construction plan", "Unavailable". No value yet selected in the closed field.
  - "Planning Basis Details" — text area, empty, character counter "0/55" shown top-right of the field.
  - "Height limitation WTG" — toggle switch, in the OFF position (grey).
**Tables / grids:** "Permit" table, columns: "Permit", "Permit Submitted", "Permit Approved". No rows (empty state).
**Dialogs / panels:** None (dropdown list is inline, not a panel).
**Messages:** None.
**States and colours:** Dropdown option "Zoning Master plan" shown highlighted with a solid blue background and white text (hover/focus state) among an otherwise white list with black text. No red-asterisk required markers visible on "Cooperation" or "Legal Planning Basis" in this frame.
**Text captured verbatim:**
- "General", "Repowering", "Aquisition Status"
- "Cooperation"
- "Legal Planning Basis"
- "Outer Area Building Privelage"
- "Regional plan"
- "Zoning Master plan"
- "Construction plan"
- "Unavailable"
- "Planning Basis Details"
- "0/55"
- "Height limitation WTG"
- "New Permit", "Edit", "Delete"
- "Permit", "Permit Submitted", "Permit Approved"
- "Save", "Cancel"
**Changes vs the previous screenshot:** Screen changed from Project Team to Planning entirely; new tab strip, new field layout, and a dropdown is open.

---

## q23 — Planning (General tab) with "New Permit" panel open
**Screen:** Planning, General tab (same underlying page as q22, now with "Legal Planning Basis" dropdown closed), with a right-side slide-in panel open: "New Permit".
**Layout:** Same Planning page in the background (now showing all 4 fields since the dropdown is closed: Cooperation, Legal Planning Basis, Planning Basis Category, Permit Procedure, Planning Basis Details) dimmed/greyed under an overlay; a right-hand panel roughly the right third of the screen holds the "New Permit" form.
**Left rail:** Same; "Planning" selected.
**Command bar / actions:** Panel footer: "Save" (blue) and "✕ Cancel" (outline), bottom-right of panel.
**Fields / inputs (New Permit panel):**
  - "* Name" — text input, empty, required (red asterisk).
  - "* Submission Date" — required (red asterisk); two radio options "Plan" / "Actual" (neither selected), then a date field placeholder "Select a date..." with a calendar icon and a refresh/cycle icon to its right.
  - "* Approval Date" — required (red asterisk); same pattern: "Plan" / "Actual" radios (neither selected), date field placeholder (calendar icon), empty.
  Background page fields now visible (labels only, values empty/unselected): "Cooperation" dropdown, "Legal Planning Basis" dropdown, "Planning Basis Category" dropdown, "Permit Procedure" dropdown, "Planning Basis Details" text area (0/55).
**Tables / grids:** Background "Permit" table still visible (empty), columns Permit / Permit Submitted / Permit Approved.
**Dialogs / panels:** Right-side panel titled "New Permit" (blue title bar with ✕ close button), containing Name, Submission Date (Plan/Actual + date), Approval Date (Plan/Actual + date) as above.
**Messages:** None.
**States and colours:** No italic/blue derived values. Required fields marked with red asterisk: Name, Submission Date, Approval Date. Radio buttons for Plan/Actual are unselected (hollow) on both date fields.
**Text captured verbatim:**
- "New Permit"
- "Name"
- "Submission Date"
- "Plan", "Actual"
- "Approval Date"
- "Plan", "Actual"
- "Save", "Cancel"
- (background) "General", "Repowering", "Aquisition Status"
- (background) "Cooperation", "Legal Planning Basis", "Planning Basis Category", "Permit Procedure", "Planning Basis Details"
- (background) "Height limitation WTG"
- (background) "New Permit", "Edit", "Delete"
- (background) "Permit", "Permit Submitted", "Permit Approved"
**Changes vs the previous screenshot:** The "Legal Planning Basis" dropdown closed, revealing two more fields underneath it ("Planning Basis Category", "Permit Procedure") that were hidden by the open dropdown in q22. A new "New Permit" right-side panel has opened (triggered by "+ New Permit").

---

## q24 — Planning (Repowering tab)
**Screen:** Planning, now on the "Repowering" sub-tab (tab strip: General | Repowering | Aquisition Status — "Repowering" now bold/underlined/active). "New Permit" panel from q23 is closed. A "Repowering" dropdown is open.
**Layout:** Header, tab strip, then a single field "Repowering" with its dropdown expanded showing 3 options. Rest of page is blank/empty. Footer Save/Cancel at bottom-right.
**Left rail:** Same; "Planning" selected.
**Command bar / actions:** Tabs "General", "Repowering" (active), "Aquisition Status". Footer: "✓ Save" (blue), "✕ Cancel" (outline).
**Fields / inputs:** "Repowering" — dropdown, open, options: "Yes", "No", "Unknown". No option currently highlighted/selected (all plain white/black, no blue highlight visible). No red asterisk visible on this field label.
**Tables / grids:** None on this tab.
**Dialogs / panels:** None (New Permit panel is closed).
**Messages:** None.
**States and colours:** Plain dropdown list, no derived/italic values.
**Text captured verbatim:**
- "General", "Repowering", "Aquisition Status"
- "Repowering"
- "Yes", "No", "Unknown"
- "Save", "Cancel"
**Changes vs the previous screenshot:** Switched from "General" sub-tab to "Repowering" sub-tab; "New Permit" panel closed; new single-field "Repowering" dropdown shown, open.

---

## q25 — Revenue (Contracted Revenue tab) with "Add Revenue Contract" panel open
**Screen:** Revenue (rail item "Revenue" highlighted, bold). Page sub-tabs: "Contracted Revenue" (active/underlined) | "Balancing Price". A right-side panel "Add Revenue Contract" is open.
**Layout:** Background page: section title "Revenue", tab strip, "+ Add Contract" button, then presumably an empty contract list (obscured by panel). Right panel spans roughly 55% of the screen width, two-column form layout with a blue title bar.
**Left rail:** Full common list; "Revenue" selected (bold, light background, accent bar).
**Command bar / actions:** Background: "+ Add Contract" button (this opened the panel). Panel footer (bottom-right, partially cut by frame): "✓ Save" (blue outline), "✕ Cancel" (outline).
**Fields / inputs (Add Revenue Contract panel), left column:**
  - "* Type" — dropdown, empty, required.
  - "* Description" — text input, empty, required.
  - "* Currency" — dropdown, value "Euro" shown in grey/placeholder-style text, required.
  - "* Contract Start Date" — date field, placeholder "Select a date...", calendar icon + refresh icon, required.
  - "* Contract Duration" — two side-by-side dropdowns (value unit + number, both empty), required.
  - "Contract End Date" — date field, empty, calendar icon, NOT marked required (no asterisk).
  - "* Tariff / Price [EUR/MWh]" — text input, empty, required.
  Right column:
  - "* Inflation Profile" — toggle, ON (blue/filled).
  - "* Country Inflation Profile" — toggle, ON (blue/filled).
  - "* Inflation Start Year" — text input, placeholder "YYYY", required.
  - "Country Inflation Profile" — read-only-looking text field showing "Germany" in grey placeholder-style text (appears disabled/derived), not marked required.
  - "Consider Negative Prices" — toggle, ON (blue/filled), with a small circular refresh icon to its right; not marked required.
  - "* Provide Hedge Volume in" — required; two radio options: "Hedged Volume [%]" (selected, filled blue radio) and "Fixed Volume p.a. [MWh]" (unselected).
  - "* Hedged Volume [%]" — text input, empty, required.
**Tables / grids:** None visible in this frame (background Contracted Revenue list is fully covered by the panel).
**Dialogs / panels:** Right panel titled "Add Revenue Contract" (blue header bar, ✕ close icon top-right).
**Messages:** None.
**States and colours:** "Currency" field shows "Euro" and the second "Country Inflation Profile" field shows "Germany" both rendered in light-grey text distinct from normal black input text — these read as default/placeholder or system-populated values rather than typed black text (greyed, possibly disabled/derived). Toggles for Inflation Profile, Country Inflation Profile, and Consider Negative Prices are all ON (blue). Radio "Hedged Volume [%]" is selected (solid blue dot).
**Text captured verbatim:**
- "Revenue"
- "Contracted Revenue", "Balancing Price"
- "Add Contract"
- "Add Revenue Contract"
- "Type"
- "Description"
- "Currency" / "Euro"
- "Contract Start Date" / "Select a date..."
- "Contract Duration"
- "Contract End Date"
- "Tariff / Price [EUR/MWh]"
- "Inflation Profile"
- "Country Inflation Profile" (toggle label)
- "Inflation Start Year" / "YYYY"
- "Country Inflation Profile" / "Germany" (read-only field, same label repeated)
- "Consider Negative Prices"
- "Provide Hedge Volume in"
- "Hedged Volume [%]"
- "Fixed Volume p.a. [MWh]"
- "Hedged Volume [%]" (input label, repeated)
- "Save", "Cancel"
**Changes vs the previous screenshot:** Completely different screen — Planning → Revenue. New "Add Revenue Contract" panel open with extensive fields, toggles and radios not seen in the Planning screens.

---

## q26 — Financing with "Edit Tranche" panel open
**Screen:** Financing (rail item "Financing" highlighted, bold). Background page shows Financing detail sections. A right-side panel "Edit Tranche" is open (panel is scrollable — a scrollbar is visible on its right edge, and content continues below the visible frame, e.g. "Bank Margin - Construction Phase [%]" label cut off at the very bottom).
**Layout:** Background (partly visible left of panel, ~50% width): "Financing Options" radio group (All Equity / Debt Financing), "Edit Equity" link, "Free Equity [EUR]" field, "VAT-Financing" section (Edit Tranche / Deactivate Tranche links, Base Rate, Bank Margin [%]), "Senior Debt" section (Add Tranche / Edit Tranche / Deactivate Tranche / Delete links, a "Credit Agreement" radio option and a "Standard Assumptions" radio option), then "Debt Service Reserve Account / Facility" and "Decommissioning Costs" section headers at the bottom (content cut off). Right panel "Edit Tranche" is two-column, longer than the viewport (scrolls).
**Left rail:** Full common list; "Financing" selected (bold, light background, accent bar).
**Command bar / actions:** Background: "✎ Edit Equity", "✎ Edit Tranche" / "🗑 Deactivate Tranche" (VAT-Financing), "+ Add Tranche" / "✎ Edit Tranche" / "🗑 Deactivate Tranche" / "🗑 Delete" (Senior Debt). Panel footer (bottom, partially cut off): "✓ Save", "✕ Cancel".
**Fields / inputs (background):**
  - "Financing Options" — radio: "All Equity" (unselected), "Debt Financing" (selected, filled).
  - "Free Equity [EUR]" — text input, value "0".
  - VAT-Financing: "Base Rate" = "Euribor 3M" (plain text, not clearly a derived/blue value), "Bank Margin [%]" = "1.5".
  - Senior Debt radio group: "Credit Agreement - *Deutsche Anlagen Leasing (DAL)* - 20 / 3 / 20" (selected, filled radio) vs "Standard Assumptions" (unselected).
**Fields / inputs (Edit Tranche panel), left column:**
  - "* Status" — radio group, options "Standard Assumption" (greyed/disabled-looking, hollow), "Term Sheet" (greyed/disabled-looking, hollow), "Credit Agreement" (selected, filled, darker dot) — top two options appear disabled (light grey text) vs the selected one in black.
  - "* Bank" — dropdown, value "Deutsche Anlagen Leasing (DAL)".
  - "KfW-Tranche" — toggle, ON (blue).
  - "* KfW-Tranche" — dropdown (date-format style value), "20 / 3 / 20".
  - "* Financial Close" — date field, value "Mon, Sep 24, 2029", with calendar icon and a refresh/cycle icon.
  - "* Tenor [Years after COD]" — two side-by-side dropdowns: "20 years" and "0 month".
  - "* Drawdown" — radio: "Equity First" (selected, filled), "Pro Rata" (unselected).
  - "DSCR" section label; "* Contracted" — text input, empty.
  Right column:
  - "* Upfront Fee" — radio: "Percentage of Debt" (selected, filled), "Fixed" (unselected).
  - "* Upfront fee [%]" — text input, value "1.0".
  - "* Commitment Fee" — radio: "Percentage of Margin" (selected, filled), "Percentage" (unselected).
  - "* Commitment Fee [%]" — text input, value "30.0".
  - "Commitment Fee Free Period" — two dropdowns: "1 year", "0 month" (not marked required, no asterisk).
  - "Interest Rate" section label.
  - "* Base Rate" — radio: "Euribor 1M" (unselected), "Euribor 3M" (unselected), "Euribor 6M" (unselected) — none appear selected/filled in this frame.
  - "* Swap Rate [%]" — text input, value "2.5".
  - "* Bank Margin - Construction Phase [%]" — label visible at very bottom edge, field cut off/not visible.
**Tables / grids:** None (this screen is form/panel based, no grid visible in frame).
**Dialogs / panels:** Right panel titled "Edit Tranche" (blue header bar, ✕ close icon), scrollable, contents as above.
**Messages:** None.
**States and colours:** In the Status radio group, "Standard Assumption" and "Term Sheet" render in light grey (disabled-looking) while "Credit Agreement" is black/selected — suggests those two options are not applicable/disabled for this tranche type. Senior Debt "Credit Agreement" label text includes an inline bolded/asterisked sub-value "*Deutsche Anlagen Leasing (DAL)* - 20 / 3 / 20" (asterisks appear to be literal characters around the bank name in the label, not markdown). No blue/italic derived-value styling clearly distinguished from normal black text elsewhere in this frame.
**Text captured verbatim:**
- "Financing Options"
- "All Equity", "Debt Financing"
- "Edit Equity"
- "Free Equity [EUR]"
- "VAT-Financing"
- "Edit Tranche", "Deactivate Tranche"
- "Base Rate" / "Euribor 3M"
- "Bank Margin [%]" / "1.5"
- "Senior Debt"
- "Add Tranche", "Edit Tranche", "Deactivate Tranche", "Delete"
- "Credit Agreement - *Deutsche Anlagen Leasing (DAL)* - 20 / 3 / 20"
- "Standard Assumptions"
- "Debt Service Reserve Account / Facility"
- "Decommissioning Costs"
- "Edit Tranche" (panel title)
- "Status"
- "Standard Assumption", "Term Sheet", "Credit Agreement"
- "Bank" / "Deutsche Anlagen Leasing (DAL)"
- "KfW-Tranche" (toggle label)
- "KfW-Tranche" / "20 / 3 / 20" (dropdown, repeated label)
- "Financial Close" / "Mon, Sep 24, 2029"
- "Tenor [Years after COD]" / "20 years" / "0 month"
- "Drawdown"
- "Equity First", "Pro Rata"
- "DSCR"
- "Contracted"
- "Upfront Fee"
- "Percentage of Debt", "Fixed"
- "Upfront fee [%]" / "1.0"
- "Commitment Fee"
- "Percentage of Margin", "Percentage"
- "Commitment Fee [%]" / "30.0"
- "Commitment Fee Free Period" / "1 year" / "0 month"
- "Interest Rate"
- "Base Rate"
- "Euribor 1M", "Euribor 3M", "Euribor 6M"
- "Swap Rate [%]" / "2.5"
- "Bank Margin - Construction Phase [%]" (cut off)
- "Save", "Cancel" (implied by panel pattern, partially visible)
**Changes vs the previous screenshot:** Completely different screen — Revenue → Financing. New "Edit Tranche" panel is a much longer, two-column, scrollable form with financing-specific fields (Status, Bank, KfW-Tranche, Financial Close, Tenor, Drawdown, DSCR, Upfront Fee, Commitment Fee, Interest Rate) not seen elsewhere in this batch.
