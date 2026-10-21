# VSBCloud Project Management — UI Notes, Batch C (q02–q16)

App chrome shared by all screens (when visible): purple Power Apps top bar reading "Power Apps | Project Management" with an (i) info icon, and a `Share ▾` / expand / download / gear / `?` / avatar (initials "SR") icon row at far right — this is Power Apps player chrome, not app UI, and is not repeated per-screenshot below. Several screenshots also show a thin row of small grey dots above the app header (canvas-app screen-position markers from the Power Apps player) and, in several screens, a small red-outlined circle with an "(i)" glyph floating near top-centre of the content area (~x=913,y=160) — likely a validation/notification anchor tied to the player, not a labelled app control. A transient light-blue circular loading spinner appears centred on the page in several captures (q02, q06, q07, q12); treat it as an in-flight loading state, not a persistent UI element.

App's own header (when the left rail is visible, i.e. q03 onward): logo tile "VSB" (white swirl icon on blue) + wordmark "Cloud", with "Version 1.0.0.1 (Dev)" in small grey text underneath. Then a boxed back-arrow (←) button, a vertical teal/green divider bar, project name in bold ("0 Test Lucas"), and under it a status row: small circular icon + "Active" in grey. Far right: "Help ⌄" dropdown, then a pill-shaped blue button "Hi Shakti Singh Rajput" with a round avatar placeholder.

Left rail (when visible), exact order top to bottom, each with an icon: **General, Milestones, Generator, Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing**, with a "Collapse Menu" control fixed at the bottom of the rail. The selected item has a light-grey row background, a teal/blue vertical accent bar at its left edge, and its icon+label rendered in blue/teal (unselected items are plain grey/black icon+label).

---

## q02 — General / Basic Information (zoomed crop)
**Screen:** General tab of the project form, but this capture is cropped tight to the form region — no left rail, no app header/footer, and no page chrome are visible in this shot (they appear starting q03).
**Layout:** Single form area, two-column grid of labelled fields, top to bottom: a "Project ID / Project Name / Short Name" row, an "SPV Name" row, a "Technology / Project Type" row, a "Project Manager / Deputy Project Manager" row, a "Development Type" row, then a divider and an "Acquisition Information" sub-section with a "Start Cluster / Acquisition Date / Acquisition Price [EUR]" row.
**Left rail:** not visible in this crop.
**Command bar / actions:** not visible in this crop.
**Fields / inputs:**
- Project ID — text, read-only-styled grey box, value "20100479"
- Project Name — text input, value "0 Test Lucas", character counter "12/55" top-right of label
- Short Name — text input, value "0tl", counter "3/55"
- SPV Name — text input, empty, counter "0/55"
- * Technology — value "PV" (red asterisk = required)
- Project Type — dropdown, value "Only infrastructure", chevron; a light-blue circular loading spinner is overlaid on/near this control
- * Project Manager — lookup input, placeholder "Select for project manager" (required)
- Deputy Project Manager — lookup input, placeholder "Select for deputy project manager"
- * Development Type — dropdown, value "Acquired Project" shown in dim/grey text (looks disabled), chevron
- * Start Cluster — dropdown, value "Cluster 3" in dim/grey text (looks disabled), chevron
- * Acquisition Date — date field, value "Monday, April 27, 2026", calendar icon
- * Acquisition Price [EUR] — numeric input, value "2,000"
**Tables / grids:** none.
**Dialogs / panels:** none.
**Messages:** none.
**States and colours:** Project ID / Development Type / Start Cluster render in a visually "greyed" tone suggesting read-only or disabled; all other inputs are plain black text on light-grey field backgrounds (this app's default input styling, not necessarily disabled). No blue/italic calculated values on this screen.
**Text captured verbatim:**
- Project ID, Project Name, Short Name, SPV Name, Technology, Project Type, Project Manager, Deputy Project Manager, Development Type, Acquisition Information, Start Cluster, Acquisition Date, "Acquisition Price [EUR]"
- 20100479, "0 Test Lucas", 12/55, 0tl, 3/55, 0/55, PV, "Only infrastructure", "Select for project manager", "Select for deputy project manager", "Acquired Project", Cluster 3, "Monday, April 27, 2026", 2,000
**Changes vs the previous screenshot:** n/a (first in batch).

---

## q03 — General screen, full chrome, validation error
**Screen:** Full app, General tab selected in the left rail, form editable, a validation error showing under Project Manager.
**Layout:** App header at top; left rail; main panel titled "General" with a bold sub-heading "Basic Information" and the same field grid as q02; a footer command bar at the bottom of the visible viewport.
**Left rail:** General, Milestones, Generator, Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing — "General" selected (blue/teal, left accent bar). "Collapse Menu" pinned at bottom.
**Command bar / actions:** Footer (partially cut at bottom of frame): "✕ Cancel" (enabled) and "✓ Save" (appears disabled/greyed), with an (i) icon and "Required fields" note beside them.
**Fields / inputs:** Same set/values as q02 (Project ID 20100479, Project Name "0 Test Lucas" 12/55, Short Name "0tl" 3/55, SPV Name empty 0/55, * Technology "PV", Project Type "Only infrastructure" with loading spinner over it, * Project Manager empty with red error text **"The project manager cannot be blank."** directly under the field, Deputy Project Manager empty, * Development Type "Acquired Project" (dim), Acquisition Information: * Start Cluster "Cluster 3" (dim), * Acquisition Date "Monday, April 27, 2026", * Acquisition Price [EUR] "2,000"). New in this view: **SPV Legal Structure** dropdown, empty, no asterisk, positioned to the right of SPV Name (not present/visible in the q02 crop).
**Tables / grids:** none.
**Dialogs / panels:** none.
**Messages:** Inline field validation: **"The project manager cannot be blank."** (red text, under Project Manager input).
**States and colours:** Save button greyed/disabled while the required Project Manager field is blank. Error text in red.
**Text captured verbatim:**
- General, Basic Information, Project ID, Project Name, Short Name, SPV Name, SPV Legal Structure, Technology, Project Type, Project Manager, Deputy Project Manager, Development Type, "The project manager cannot be blank.", Acquisition Information, Start Cluster, Acquisition Date, "Acquisition Price [EUR]"
- Cancel, Save, "Required fields"
- Footer (partial): "Created By:", "Lucas Georg", "21.05.2025 17:50", "Modified By:", "# Azure VSB Cloud Flow Service User", "25.06.2026 18:57"
**Changes vs the previous screenshot:** Full chrome (header, left rail, footer) now visible; SPV Legal Structure field revealed; validation message now shown under Project Manager.

---

## q04 — General screen, Project Manager selected
**Screen:** Same General tab; a user has just been picked for Project Manager.
**Layout:** Identical to q03.
**Left rail:** Same as q03, General selected.
**Command bar / actions:** Footer Cancel/Save present (cut at bottom, same as q03); the earlier validation message is gone.
**Fields / inputs:** Same field set as q03, with:
- * Project Manager — now shows a selected-person chip: round red avatar with initials "GL", label **"Georg, Lucas (external)"**, and an "✕" remove control.
- Deputy Project Manager — still empty, placeholder "Select for deputy project manager".
- All other fields unchanged from q03 (Project ID 20100479, Project Name "0 Test Lucas", Short Name "0tl", SPV Name empty, SPV Legal Structure empty, * Technology "PV", Project Type "Only infrastructure" — spinner no longer overlapping it, * Development Type "Acquired Project" dim, * Start Cluster "Cluster 3" dim, * Acquisition Date "Monday, April 27, 2026", * Acquisition Price [EUR] "2,000").
**Tables / grids:** none.
**Dialogs / panels:** none.
**Messages:** none (validation error cleared).
**States and colours:** The person chip uses a red circular avatar badge with white initials "GL"; "(external)" appended to the name suggests an external/guest directory user, styled the same weight as the name (not obviously greyed).
**Text captured verbatim:**
- "Georg, Lucas (external)", GL
- (all other labels identical to q03 list)
**Changes vs the previous screenshot:** Project Manager field now populated with a person chip; the red "cannot be blank" validation text is gone; loading spinner over Project Type is gone.

---

## q05 — Placement (location/site)
**Screen:** Still under the "General" left-rail item / page-heading "General", but the form body now shows a different sub-section: "Placement", plus "Shareholding Entity" below it. Mouse cursor is hovering the "Milestones" rail item (its label renders blue) but that screen has not been navigated to yet — content shown is still the Placement section.
**Layout:** Sub-heading "Placement" with a 3-column-ish field grid on the left (~55% width) and an embedded map panel on the right (~45% width, roughly square, aligned with the field grid). Below that, a full-width "Shareholding Entity" sub-section with an info banner and a data table.
**Left rail:** General still shows selected styling (blue/teal accent), but "Milestones" label is rendered blue because the pointer is hovering it.
**Command bar / actions:** Footer Cancel/Save presumably present below the fold (not visible in this crop).
**Fields / inputs:**
- * Country — value "Germany"
- * Area/State/Province/Voivodeship — value "Brandenburg"
- District — text input, value "f", counter "1/55"
- * Municipality — dropdown, value "Werben"
- Tax Factor [%] — numeric, value "320"
- Terrain Utilization — dropdown, value "Field"
- * Latitude — value "47.843584"
- * Longitude — value "12.956153"
**Tables / grids:** Shareholding Entity table — columns **Description | Ownership | Actions**. One row: "VSB Holding GmbH" | "100.0 %" | pencil (edit) and trash (delete) icons in blue. Above the table: "+ Add" link (blue) and an info banner (light-blue background, (i) icon): **"Shareholding entity ownership sum must be 100%"**.
**Dialogs / panels:** Embedded interactive map (TomTom), pin labelled "0 Test Lucas" over a location near Sillersdorf/Freilassing (visible place labels: Sillersdorf, Untereichet, Obereichet, Salzbur[g], Gessenhart, Amun[...], Perach, Freilassing, road label "B304", "Adelstetten"). Map control stack on the right edge: locate/pin icon, "+", "–", and a compass/reset icon. Attribution "©2026 TomTom" bottom-right of map.
**Messages:** Info banner "Shareholding entity ownership sum must be 100%" (informational, not necessarily an error — light blue, not red).
**States and colours:** No fields appear in blue/italic (calculated) styling here. Latitude/Longitude are marked required (red asterisk) even though they're presumably set by the map pin.
**Text captured verbatim:**
- Placement, Country, "Area/State/Province/Voivodeship", District, 1/55, Municipality, "Tax Factor [%]", Terrain Utilization, Latitude, Longitude
- Germany, Brandenburg, f, Werben, 320, Field, 47.843584, 12.956153
- Shareholding Entity, Add, "Shareholding entity ownership sum must be 100%", Description, Ownership, Actions, "VSB Holding GmbH", "100.0 %"
- "0 Test Lucas" (map pin label), "©2026 TomTom"
**Changes vs the previous screenshot:** Different sub-section of the General area (Placement + Shareholding Entity, replacing Basic Information/Acquisition Information); map panel introduced; cursor now hovering "Milestones" in the rail.

---

## q06 — Milestones
**Screen:** Milestones tab, left rail now shows Milestones as the selected item.
**Layout:** No sub-heading text visible at top of the visible crop (page appears to start directly with fields, possibly scrolled). Two-column field grid of date/number pickers, top to bottom, with a full-width "Operational Lifetime" row near the bottom pairing a duration display with "Project End Date".
**Left rail:** General, **Milestones** (selected — blue/teal, accent bar), Generator, Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing.
**Command bar / actions:** Footer at bottom of frame (partially cut): "Created By: Lucas Georg 5/21/2025 17:50" and "Modified By: # Azure VSB Cloud Flow Service User 6/25/2026 18:57" (note: slash date format here vs dotted format on the General footer in q03/q04), with "✓ Save" / "✕ Cancel" at bottom-right, both appearing enabled (not greyed).
**Fields / inputs (each date field has a calendar-icon button and a second circular "reset to default" icon button beside it):**
- * Cluster 3: Permitting — "Saturday, May 1, 2027"
- * Cluster 4: Pre-Construction — "Tue, May 1, 2029"
- * Final Investment Decision — "Thu, May 24, 2029"
- * Cluster 5: Construction — "Sun, Jun 24, 2029"
- * Cluster 6: Operation — "Tue, Jun 24, 2031" (partly obscured by the transient loading spinner)
- * Sales Start Date — "Tue, May 1, 2029"
- * Sales Completion Date — "Thu, May 24, 2029" (label partly obscured by spinner)
- * Share of Farmdown [%] — "50.0", with an (i) info icon next to the label and a circular reset icon in the field
- Operational Lifetime — two read-only-looking boxes: "30 years" and "0 months" (no asterisk)
- * Project End Date — "Fri, Jun 24, 2061"
**Tables / grids:** none.
**Dialogs / panels:** none.
**Messages:** none.
**States and colours:** All date values render as plain black text (not blue/italic) even though each has a "reset to calculated default" icon, implying these are user-editable overrides of a system-computed schedule rather than pure derived/read-only fields. Operational Lifetime fields look disabled/read-only (dim styling, no asterisk).
**Text captured verbatim:**
- "Cluster 3: Permitting", "Cluster 4: Pre-Construction", "Final Investment Decision", "Cluster 5: Construction", "Cluster 6: Operation", "Sales Start Date", "Sales Completion Date", "Share of Farmdown [%]", "Operational Lifetime", "Project End Date"
- Saturday, May 1, 2027 / Tue, May 1, 2029 / Thu, May 24, 2029 / Sun, Jun 24, 2029 / Tue, Jun 24, 2031 / Tue, May 1, 2029 / Thu, May 24, 2029 / 50.0 / 30 years / 0 months / Fri, Jun 24, 2061
- Created By, Modified By, Save, Cancel
**Changes vs the previous screenshot:** Navigated from General/Placement to the Milestones tab; entirely different field set (schedule dates instead of location); footer date format differs from the General tab's footer.

---

## q07 — Generator configuration (list, collapsed)
**Screen:** Generator tab selected; one generator type exists and is shown collapsed; a transient loading spinner is overlaid centre-page.
**Layout:** Command bar row at top of the content area; below it a "Total Capacity [MW(p)]" summary field; below that a single collapsible generator-type row.
**Left rail:** General, Milestones, **Generator** (selected), Production, Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing.
**Command bar / actions:** "+ Add WTG Type", "+ Add PV Module Type", "+ Add Others ⌄" (dropdown-style button with chevron) — all rendered in blue/teal, left-aligned in the content header.
**Fields / inputs:**
- Total Capacity [MW(p)] — summary field, read-only grey box, value "13.6" (right-aligned)
**Tables / grids:** Single generator-type row (list, not a classic table): radio selector (filled/blue) + label "N163-6.8", right-aligned chip **"Active"** (green outline) and a collapse chevron (pointing down = collapsed).
**Dialogs / panels:** none open.
**Messages:** none.
**States and colours:** "Active" status rendered as a green-outlined pill/chip. Total Capacity value right-aligned in a grey read-only-styled box.
**Text captured verbatim:**
- Add WTG Type, Add PV Module Type, Add Others, "Total Capacity [MW(p)]", 13.6, N163-6.8, Active
**Changes vs the previous screenshot:** Entirely new tab (Generator) and page; new command bar pattern (Add WTG Type / Add PV Module Type / Add Others).

---

## q08 — Generator list, row selected, hover tooltip
**Screen:** Same Generator screen; the "N163-6.8" row is now selected (radio filled) which reveals two more command-bar actions; a hover tooltip is showing over the row.
**Layout:** Same as q07, row still visually collapsed but with a summary tooltip on hover.
**Left rail:** Same as q07, Generator selected.
**Command bar / actions:** "+ Add WTG Type", "+ Add PV Module Type", "+ Add Others ⌄", then **"🗑 Delete Generator Type"** (black/enabled) and **"📄 Deactivate"** (rendered in a lighter/greyer tone than Delete, suggesting it is disabled or de-emphasized).
**Fields / inputs:** Total Capacity [MW(p)] = 13.6 (unchanged).
**Tables / grids:** Row "N163-6.8", Active chip, chevron — a tooltip box appears attached below the row reading: **"Nordex | N163-6.8 MW | 118m Hub Height | 200m Total Height |"**
**Dialogs / panels:** none (tooltip only, not a dialog).
**Messages:** Tooltip text as above (verbatim, including the trailing "|").
**States and colours:** "Deactivate" text visibly lighter/greyer than "Delete Generator Type", implying a disabled state while the type is Active.
**Text captured verbatim:**
- Add WTG Type, Add PV Module Type, Add Others, "Delete Generator Type", Deactivate, "Total Capacity [MW(p)]", 13.6, N163-6.8, Active
- "Nordex | N163-6.8 MW | 118m Hub Height | 200m Total Height |"
**Changes vs the previous screenshot:** Row is now selected, adding "Delete Generator Type"/"Deactivate" to the command bar; a hover tooltip is now visible summarizing supplier/model/hub-height/total-height.

---

## q09 — Generator / WTG type detail (expanded)
**Screen:** Same Generator screen; the "N163-6.8" row is now expanded showing full detail fields and its child generator list.
**Layout:** Command bar; Total Capacity summary; expanded row header ("N163-6.8", Active chip, chevron now pointing up); "+ Add Generator" link; a field grid of 7 detail fields; below that a small table of individual generator units.
**Left rail:** Same, Generator selected.
**Command bar / actions:** Add WTG Type, Add PV Module Type, Add Others ⌄, Delete Generator Type, Deactivate (same as q08).
**Fields / inputs (detail block for the WTG type "N163-6.8"):**
- Supplier — "Nordex"
- Total Height [m] — "199.5"
- Number of Generators — "2"
- Hub Height [m] — "118"
- Rotor Diameter [m] — "163"
- Height Limitation [m] — empty
- Generators Capacity [MW] — "13.6"
- "+ Add Generator" — link/button (blue), sits above the field grid, left-aligned under the row header
**Tables / grids:** Individual generator units table — columns **(row label) | Total Height | Effective Generator Capacity [MW] | (actions)**. Rows:
  - WTG 0tl_1 | 199.5 | 6.8 | pencil (edit), trash (delete)
  - WTG 0tl_2 | 199.5 | 6.8 | pencil (edit), trash (delete)
**Dialogs / panels:** none.
**Messages:** none.
**States and colours:** No blue/italic values noted here; all shown as plain black text in grey field boxes.
**Text captured verbatim:**
- Add Generator, Supplier, "Total Height [m]", "Number of Generators", "Hub Height [m]", "Rotor Diameter [m]", "Height Limitation [m]", "Generators Capacity [MW]"
- Nordex, 199.5, 2, 118, 163, 13.6
- "Total Height", "Effective Generator Capacity [MW]", WTG 0tl_1, WTG 0tl_2, 199.5, 6.8
**Changes vs the previous screenshot:** Row expanded (chevron flips to point up); detail field grid and generator-unit table now visible; tooltip no longer shown.

---

## q10 — Save confirmation banner ("generator type was successfully saved")
**Screen:** Same Generator screen, immediately after a save action; a second generator type ("Dummy-General Electric 3-5") now also exists, selected/expanded, while "N163-6.8" is deselected but still shown expanded above it.
**Layout:** A full-width green success banner sits above the app header/content (it overlaps/covers part of the header row). Below it, the same command bar, Total Capacity summary (now larger), then two generator-type blocks stacked: "N163-6.8" (deselected radio, still expanded showing its detail fields and 2-row generator table) followed by "Dummy-General Electric 3-5" (selected radio, expanded, its own "+ Add Generator" and detail-field row just starting to render at the bottom edge).
**Left rail:** Same, Generator selected (partially obscured by the success banner at the very top).
**Command bar / actions:** Add WTG Type, Add PV Module Type, Add Others ⌄, Delete Generator Type, Deactivate.
**Fields / inputs:**
- Total Capacity [MW(p)] — now **"33.6"** (up from 13.6)
- N163-6.8 block: same detail fields/values as q09 (Supplier Nordex, Total Height 199.5, Number of Generators 2, Hub Height 118, Rotor Diameter 163, Height Limitation empty, Generators Capacity 13.6), same 2-row unit table (WTG 0tl_1, WTG 0tl_2, both 199.5 / 6.8)
- Dummy-General Electric 3-5 block: row header shows "Dummy-General Electric 3-5", Active chip, radio selected (filled), chevron up; "+ Add Generator" link; field labels "Supplier", "Total Height [m]", "Number of Generators" visible starting to render at the bottom of the frame (values cut off below the fold).
**Tables / grids:** As above; the second type's unit table is not yet visible in this frame (cut off).
**Dialogs / panels:** none.
**Messages:** Success banner, green background, check icon, text: **"Generator type was successfully saved for current project!"** with a dismiss "✕" at the far right.
**States and colours:** Success banner uses green background/icon. "Active" chip green-outlined on both generator-type rows.
**Text captured verbatim:**
- "Generator type was successfully saved for current project!"
- "Total Capacity [MW(p)]", 33.6, N163-6.8, Active, "Dummy-General Electric 3-5", Active
- Add Generator, Supplier, "Total Height [m]", "Number of Generators"
**Changes vs the previous screenshot:** Green success toast/banner appeared; Total Capacity jumped from 13.6 to 33.6; a second generator type "Dummy-General Electric 3-5" now exists and is the currently-selected/expanded row (N163-6.8 remains expanded but deselected).

---

## q11 — Add a PV Module Type (right-side panel)
**Screen:** Generator tab in the background (dimmed/greyed out), with a right-side slide-over panel "Add PV Module Type" open on top.
**Layout:** Panel occupies roughly the right ~28% of the viewport, full height, blue title bar with "✕" close at top-right; form fields stacked vertically below the title; Save/Cancel buttons anchored at the bottom (partially cut off in this frame).
**Left rail:** Not interactable (background dimmed); same items as before.
**Command bar / actions (background, dimmed):** Add WTG Type, Add PV Module Type, Add Others ⌄ still visible dimmed at the top of the background content.
**Fields / inputs (panel — "Add PV Module Type"):**
- * Module Label — text input, empty (required)
- * Total Module Type Capacity [MWp] — numeric input, empty (required)
- * Supplier — dropdown, placeholder "Find supplier" (required)
- Degradation 1st Year [% per annum] — numeric input, empty (not required)
- Degradation Remaining Years [% per annum] — numeric input, empty (not required)
**Tables / grids (background, dimmed, for context):** Generator list now shows Total Capacity 33.6; a WTG 0tl_2 row (199.5 / 6.8) visible near the top; "Dummy-General Electric 3-5" block expanded below with Supplier "Dummy General Electric", Hub Height [m] "150", and a 4-row unit table: WTG 0tl_3, WTG 0tl_4, WTG 0tl_5, WTG 0tl_6 — each "150.0" / "5.0", each with pencil/trash icons.
**Dialogs / panels:** Panel title **"Add PV Module Type"**; footer buttons (cut at bottom edge): "✓ Save" (blue, filled) and "✕ Cancel" (outline).
**Messages:** none.
**States and colours:** Required-field labels carry a red asterisk (Module Label, Total Module Type Capacity, Supplier); the two Degradation fields have no asterisk. No values entered yet, so no calculated/italic styling to observe.
**Text captured verbatim:**
- "Add PV Module Type", "Module Label", "Total Module Type Capacity [MWp]", Supplier, "Find supplier", "Degradation 1st Year [% per annum]", "Degradation Remaining Years [% per annum]"
- (background) Add WTG Type, Add PV Module Type, Add Others, "Total Capacity [MW(p)]", 33.6, WTG 0tl_2, 199.5, 6.8, "Dummy-General Electric 3-5", Add Generator, Supplier, "Dummy General Electric", "Total Height [m]", "Number of Generators", "Hub Height [m]", 150, "Rotor Diameter [m]", "Height Limitation [m]", "Total Height", "Effective Generator Capacity [MW]", WTG 0tl_3, WTG 0tl_4, WTG 0tl_5, WTG 0tl_6, 150.0, 5.0
**Changes vs the previous screenshot:** New right-side panel opened ("Add PV Module Type"); background now shows the fully expanded "Dummy-General Electric 3-5" type with 4 generator units (0tl_3–0tl_6) instead of the earlier partial view.

---

## q12 — Production: WTG summary + record list (collapsed)
**Screen:** Production tab selected; one production record exists, shown collapsed; transient loading spinner overlaid centre-page.
**Layout:** Command bar row; a 2-row × 3-column summary field grid (project-level yield aggregates); a single collapsible production-record row below.
**Left rail:** General, Milestones, Generator, **Production** (selected), Cluster Check List, Project Team, Planning, Grid Operator, Revenue, Financing.
**Command bar / actions:** "+ Add Production WTG", "+ Add Production PV" — both blue/teal.
**Fields / inputs (summary, read-only-styled grey boxes, right-aligned values):**
- Gross Yield [MWh] — "1,000"
- Wind Speed at Hub Height [m/s] — "2.0"
- Irradiation [kWh/kWp] — empty
- Net Yield p50 [MWh] — "850"
- Net Yield p75 [MWh] — "793"
- Net Yield p90 [MWh] — "741"
**Tables / grids:** Single record row: radio (unselected/hollow) + label "Production - WTG Desc 500", chips **"Internal"** (grey/outline) and **"Active"** (green outline), collapse chevron (down).
**Dialogs / panels:** none.
**Messages:** none.
**States and colours:** Two distinct chip styles: neutral grey "Internal" chip vs green "Active" status chip — these appear to be two independent classifications (visibility/type vs lifecycle status), not one field.
**Text captured verbatim:**
- Add Production WTG, Add Production PV, "Gross Yield [MWh]", "Wind Speed at Hub Height [m/s]", "Irradiation [kWh/kWp]", "Net Yield p50 [MWh]", "Net Yield p75 [MWh]", "Net Yield p90 [MWh]"
- 1,000, 2.0, 850, 793, 741, "Production - WTG Desc 500", Internal, Active
**Changes vs the previous screenshot:** New tab (Production); entirely new field/record set; PV Module panel from q11 closed.

---

## q13 — Production record selected (contextual actions)
**Screen:** Same Production screen; the "Production - WTG Desc 500" row is now selected, revealing row-contextual command-bar actions.
**Layout:** Identical to q12 otherwise.
**Left rail:** Same, Production selected.
**Command bar / actions:** "+ Add Production WTG", "+ Add Production PV", then **"✏ Edit"**, **"🗑 Delete"**, **"🚫 Deactivate Production"** — all appear enabled/black (no visible greying).
**Fields / inputs:** Same summary values as q12 (Gross Yield 1,000; Wind Speed at Hub Height 2.0; Irradiation empty; Net Yield p50/p75/p90 = 850/793/741).
**Tables / grids:** Row "Production - WTG Desc 500", radio now filled/selected, chips "Internal" and "Active" still shown, chevron unchanged (row remains visually collapsed — no inline expansion shown here; the next action taken opens a slide-over panel instead, see q14).
**Dialogs / panels:** none open yet.
**Messages:** none.
**States and colours:** Selecting a record reveals exactly 3 contextual actions (Edit, Delete, Deactivate Production) versus the Generator screen's 2 (Delete Generator Type, Deactivate) — different action set/wording per module.
**Text captured verbatim:**
- Add Production WTG, Add Production PV, Edit, Delete, "Deactivate Production"
**Changes vs the previous screenshot:** Row selection state changed (radio filled); command bar gained "Edit / Delete / Deactivate Production".

---

## q14 — Add Production WTG panel (yield/losses inputs)
**Screen:** Production tab in background (dimmed); right-side slide-over panel "Add Production WTG" open (opened via the "Add Production WTG" command, not "Edit" — title says "Add", not "Edit").
**Layout:** Wide right-side panel, blue title bar "Add Production WTG" with "✕" close, scrollable form body.
**Left rail:** background, dimmed, unchanged item list.
**Command bar / actions (background, dimmed):** Add Production WTG, Add Production PV visible dimmed.
**Fields / inputs (panel, top to bottom; top edge cut off mid-control):**
- (cut off) "⚪ Whole plant" — radio option, partially visible at very top, selection state unclear from crop
- * Gross Yield [MWh] — numeric input, empty
- Radio group: "⚫ Input losses" (selected) / "⚪ Input Net Yield p50" (unselected)
- * Total Losses [%] — "15.0"
- Net Yield p50 [MWh] — empty, no asterisk
- Radio group: "Input Uncertainty" (appears selected, cursor hovering it) / "⚪ Input Net Yield p75/p90" (unselected)
- * Uncertainty [%] — "10.0"
- Net Yield p75 [MWh] — empty, no asterisk
- Net Yield p90 [MWh] — empty, no asterisk
- Toggle: **"Consider Seasonality"** — OFF (grey, knob left)
**Tables / grids:** none yet.
**Dialogs / panels:** Panel title "Add Production WTG"; Save/Cancel footer not visible in this frame (below the fold).
**Messages:** none.
**States and colours:** Total Losses (15.0) and Uncertainty (10.0) are pre-filled plain black values (defaults), not blue/italic. The two radio-group pairs let the user choose input method (losses vs. direct p50; uncertainty vs. direct p75/p90) — the non-chosen path's target fields (Net Yield p50/p75/p90) sit empty/greyed, implying they get computed once the other path is chosen/saved.
**Text captured verbatim:**
- "Add Production WTG", "Whole plant", "Gross Yield [MWh]", "Input losses", "Input Net Yield p50", "Total Losses [%]", "Net Yield p50 [MWh]", "Input Uncertainty", "Input Net Yield p75/p90", "Uncertainty [%]", "Net Yield p75 [MWh]", "Net Yield p90 [MWh]", "Consider Seasonality"
- 15.0, 10.0
**Changes vs the previous screenshot:** New panel opened ("Add Production WTG") replacing q13's plain list view; multiple new radio-toggle inputs revealed.

---

## q15 — Add Production WTG panel + Seasonality section revealed
**Screen:** Same "Add Production WTG" panel, now widened to also show a second, adjoining "Seasonality" panel/column to its right (revealed after switching "Consider Seasonality" on); the left form column has scrolled slightly.
**Layout:** Two side-by-side panels under one "Add Production WTG" title bar: left = the loss/uncertainty form (same fields as q14, scrolled), right = a new "Seasonality" panel with a monthly list.
**Left rail:** background, dimmed, unchanged.
**Command bar / actions:** background dimmed, unchanged.
**Fields / inputs (left column — same as q14):** Input losses (selected) / Input Net Yield p50; * Total Losses [%] = "15.0"; Net Yield p50 [MWh] empty; Input Uncertainty (selected) / Input Net Yield p75/p90; * Uncertainty [%] = "10.0"; Net Yield p75 [MWh] empty; Net Yield p90 [MWh] empty; toggle **"Consider Seasonality" = ON** (blue, knob right); toggle **"Consider Negative Prices" = OFF** (grey, knob left), visible just below Consider Seasonality.
**Tables / grids (right column — "Seasonality"):** Header "Seasonality" with a circular refresh/reset icon top-right. List of months, each row showing the month name and a "Distribution [%]" value:
- April — 7.0
- May — 7.0
- June — 6.0
- July — 6.0
- August — 6.0 (a text cursor "|" is visible after this value, indicating it's an active/editable input)
- September — 7.0
- October — (cut off at bottom of frame)
All Distribution [%] values render in **blue, italic** text — system-calculated defaults.
**Dialogs / panels:** Panel title still "Add Production WTG"; Save/Cancel footer still off-screen at the very bottom.
**Messages:** none.
**States and colours:** Distribution [%] values are blue/italic (calculated), distinguishing them from the plain black Total Losses/Uncertainty values on the left. Consider Seasonality toggle now ON (blue).
**Text captured verbatim:**
- (left, repeat of q14 labels) Input losses, Input Net Yield p50, "Total Losses [%]", "Net Yield p50 [MWh]", Input Uncertainty, "Input Net Yield p75/p90", "Uncertainty [%]", "Net Yield p75 [MWh]", "Net Yield p90 [MWh]", "Consider Seasonality", "Consider Negative Prices"
- (right) Seasonality, "Distribution [%]", April, May, June, July, August, September, October, 7.0, 7.0, 6.0, 6.0, 6.0, 7.0
**Changes vs the previous screenshot:** "Consider Seasonality" toggled ON, revealing the new "Seasonality" monthly-distribution panel to the right with blue/italic calculated values; "Consider Negative Prices" toggle now visible (still OFF).

---

## q16 — Add Production WTG panel + Seasonality + Negative Prices revealed
**Screen:** Same panel further widened/scrolled: now shows three adjoining columns — the loss/uncertainty form, "Seasonality" (scrolled further down), and a new "Negative Prices" panel (revealed after switching "Consider Negative Prices" on).
**Layout:** Three-column layout under the "Add Production WTG" title bar.
**Left rail:** background, dimmed, unchanged.
**Command bar / actions:** background dimmed, unchanged.
**Fields / inputs (left column, unchanged from q15):** Input losses (selected), * Total Losses [%] = 15.0, Net Yield p50 [MWh] empty; Input Uncertainty (selected), * Uncertainty [%] = 10.0, Net Yield p75/p90 [MWh] empty; toggle "Consider Seasonality" = ON (blue); toggle **"Consider Negative Prices" = ON** (blue, changed from OFF in q15).
**Tables / grids:**
- Middle column "Seasonality" (scrolled to later months), each with "Distribution [%]" in blue italic: June 6.0, July 6.0, August 6.0, September 7.0, October 9.0, November 10.0, December 11.0. Followed by a summary row **"Total Sum [%]" = 100** (plain black/bold, not italic — a computed total display).
- Right column **"Negative Prices"** header, no separate reset icon shown in this crop at the column header (per-row reset icons instead). Rows are by year, each with a "Reduction [%]" label, a blue-italic value, and its own small circular reset icon:
  - 2031 — 5.1
  - 2032 — 4.4
  - 2033 — 3.7
  - 2034 — 3.0
  - 2035 — 2.3
  - 2036 — 0.0
  - 2037 — 0.0 (list continues below the cut-off edge)
**Dialogs / panels:** Panel title "Add Production WTG"; Save/Cancel footer still off-screen at bottom.
**Messages:** none.
**States and colours:** Both "Distribution [%]" (Seasonality) and "Reduction [%]" (Negative Prices) values are blue/italic (system-calculated defaults, user-overridable) with reset icons; "Total Sum [%]" is a plain black bold read-only computed total. "Consider Negative Prices" toggle now blue/ON.
**Text captured verbatim:**
- Seasonality, "Distribution [%]", June, July, August, September, October, November, December, 6.0, 6.0, 6.0, 7.0, 9.0, 10.0, 11.0, "Total Sum [%]", 100
- "Negative Prices", "Reduction [%]", 2031, 2032, 2033, 2034, 2035, 2036, 2037, 5.1, 4.4, 3.7, 3.0, 2.3, 0.0, 0.0
- Consider Seasonality, Consider Negative Prices
**Changes vs the previous screenshot:** "Consider Negative Prices" toggled ON, revealing a third "Negative Prices" panel (per-year Reduction [%], blue/italic, individually resettable); Seasonality list scrolled to show October/November/December plus the "Total Sum [%] = 100" summary row.
