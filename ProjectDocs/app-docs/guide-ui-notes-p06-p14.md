# VSBCloud Project Management — UI Notes (Screenshots p06–p14)

---

## p06 — Project list, filtered state
**Screen:** Main "Project Management" list/grid screen (landing screen after login).

**Layout (top to bottom):**
- App header bar (full width, white background, ~50px tall): VSB Cloud logo/wordmark (left), command-bar buttons (center-left), "Help" dropdown and user badge "Hi Shakti Singh Rajput" (right, blue pill).
- Filter panel (white, ~110px tall, below header): two rows of labeled filter controls, 3 columns per row.
- Data table (grid) taking most of the remaining vertical space, horizontally scrollable (visible horizontal scrollbar at bottom of grid).
- Footer/paging bar (thin strip at very bottom of the grid area, above OS taskbar).

**Header bar contents (app's own header, left to right):**
- "VSB" square logo mark (blue/white) + "Cloud" wordmark, with small grey subtext "Version 1.0.0.1 (Dev)" underneath.
- Command bar: "+ Add Project" (blue "+" icon, active/black text), "Edit Project" (pencil icon, greyed/disabled), "Edit Costs" (greyed/disabled), "Delete Project" (trash icon, greyed/disabled), "Simulate" (play icon, greyed/disabled), "Dashboard" (chart icon, greyed/disabled).
- "Help" with a chevron-down (dropdown).
- Blue rounded pill: "Hi Shakti Singh Rajput" + round grey user-avatar circle to its right.

**Filters / inputs (2 rows x 3 columns):**
Row 1:
- "Project" — text input, placeholder "Search for Project Name, Short Name and ID", small funnel/filter icon to the right of the box.
- "Country" — combobox (empty), chevron-down, filter icon to the right.
- "Technology" — combobox (empty), chevron-down, filter icon to the right.

Row 2:
- "Project Manager" — text input, placeholder "Search for project manager".
- "Area/State/Province" — combobox (empty), chevron-down, filter icon to the right.
- "Capacity" — numeric-style input paired with an operator dropdown "Select operator", filter icon to the right.
- "Status" — combobox (empty), chevron-down, filter icon to the right.

(Note: row 2 effectively has 4 controls: Project Manager, Area/State/Province, Capacity+operator, Status — laid out across the row.)

**Table columns (left to right), each with sort/alignment:**
1. (unlabeled) — radio-button selection column (leftmost, narrow)
2. "Project Name" — left aligned, has an up-arrow sort indicator (▲) next to header text, currently sorted ascending.
3. "Short Name" — left aligned.
4. "Status" — left aligned.
5. "Project Manager" — left aligned.
6. "Country" — left aligned.
7. "Area/State/Province/Voivodeship" — left aligned.
8. "Technology" — left aligned.
9. "Capacity [MW(p)" (column header text cut off at right edge, grid continues off-screen to the right — horizontal scroll needed to see rest of column name / more columns).

**Row anatomy:**
- Each row starts with a round radio-button selector (unselected, empty circle) in the leftmost cell.
- A short vertical colour stripe sits immediately to the left of the Project Name text inside the cell — stripe colour varies per row (seen: dark red/maroon on "0 Test Lucas" row 3, "000TestingRRS", "11111"; olive/dark-yellow on most other rows e.g. "0 0 0 0", "0 Test Lucas" row1, "00 0 LG", "00 LG", "00 PO Wind", "0000000", "0000LG", "0123456", "123 Lucas"). Stripe appears to encode something per-project (status/cluster colour) — exact meaning not shown on this screen.
- Row banding: alternating row background — light blue (#cfe2f3-ish) and off-white/cream, alternating every row (zebra striping), independent of the colour stripe.
- Text is small, dark grey/black, single line per cell, truncated with no wrap.

**Footer / paging (verbatim):**
- "Total Rows: 1127"
- Pagination controls: "«" (first/prev, greyed) "‹" (prev, greyed) "Page: 1 from 6" "→" (blue circular next-page button, active)

**States and colours:**
- Command bar buttons: "Add Project" is the only enabled (black-text, blue "+" icon) action; all others (Edit Project, Edit Costs, Delete Project, Simulate, Dashboard) are greyed out/disabled — consistent with no row being selected (all radio buttons empty).
- Row stripe colours (maroon/dark-red vs olive/dark-yellow) likely correspond to a status or category not currently visible in view (Status column values all read "Cluster 1/2/3/4" for these rows, not an obvious colour-to-status mapping evident from visible data).
- Zebra striping alternates light-blue / cream per row for readability.

**Text captured verbatim:**
- "Power Apps | Project Management" (browser tab bar label, top window title area)
- "VSB" "Cloud" "Version 1.0.0.1 (Dev)"
- "+ Add Project", "Edit Project", "Edit Costs", "Delete Project", "Simulate", "Dashboard"
- "Help"
- "Hi Shakti Singh Rajput"
- "Project", "Search for Project Name, Short Name and ID"
- "Country"
- "Technology"
- "Project Manager", "Search for project manager"
- "Area/State/Province"
- "Capacity", "Select operator"
- "Status"
- Column headers: "Project Name", "Short Name", "Status", "Project Manager", "Country", "Area/State/Province/Voivodeship", "Technology", "Capacity [MW(p)"
- Row data (Project Name / Short Name / Status / Project Manager / Country / Area / Technology / Capacity): 
  - "0 0 0 0" / "S00" / "Cluster 1" / "Georg, Lucas (external)" / "Italy" / "Puglia" / "Wind" / "136."
  - "0 Test Lucas" / "0tl" / "Cluster 3" / "Georg, Lucas (external)" / "Germany" / "Brandenburg" / "PV" / "13."
  - "0 Test Lucas" / "000" / "Cluster 1" / "Singh Rajput, Shakti (external)" / "Italy" / "Valle d'Aosta" / "Wind" / "559."
  - "00 0 LG" / "LG0" / "Cluster 2" / "Georg, Lucas (external)" / "Italy" / (blank) / "Wind" / "47.1"
  - "00 LG" / "0LG" / "Cluster 1" / "Georg, Lucas (external)" / "Germany" / "Bavaria" / "Wind" / "290."
  - "00 PO Wind" / "0PW" / "Cluster 1" / "Georg, Lucas (external)" / "Poland" / "Łódzkie Voivodeship" / "Wind" / "14."
  - "0000000" / "0lg" / "Cluster 2" / "Georg, Lucas (external)" / "Germany" / "Rhineland-Palatinate" / "Wind" / "0."
  - "0000LG" / "0LG" / "Cluster 2" / "Georg, Lucas (external)" / "Germany" / "Brandenburg" / "Wind" / "178."
  - "000TestingRRS" / "rrs" / "Cluster 2" / "Rohit Revnath Somase" / "Germany" / "Hesse" / "Wind" / "5."
  - "0123456" / "123" / "Cluster 4" / "Georg, Lucas (external)" / "Germany" / "Baden-Württemberg" / "Wind" / "6."
  - "11111" / "111" / "Cluster 3" / "Georg, Lucas (external)" / "Germany" / "Brandenburg" / "Wind" / "14."
  - "123 Lucas" / "123" / "Cluster 2" / "Georg, Lucas (external)" / "Germany" / "Brandenburg" / "Wind" / "13."
- "Total Rows: 1127"
- "Page: 1 from 6"
- Taskbar clock: "10:45" "03-09-2026"

**Changes vs the previous screenshot:** N/A (first screenshot in this set).

---

## p07 — Project Manager filter, typeahead suggestions open
**Screen:** Same Project list screen as p06.

**Layout:** Identical to p06 — header, filter panel, grid, footer. Only difference is an open typeahead/autocomplete dropdown under the "Project Manager" filter field.

**Command bar / actions:** Same as p06 (Add Project enabled; Edit Project, Edit Costs, Delete Project, Simulate, Dashboard greyed/disabled).

**Filters / inputs:**
- "Project Manager" text field now contains typed text "Shakti Singh" (partially highlighted/selected — "Shakti" appears selected/highlighted blue, "Singh" not).
- Field is focused (blue outline border box around the whole input).
- Below it, a floating suggestion panel titled "Suggested People" with two entries:
  - Avatar chip "SS" (blue circle) — "Shakti Singh" / "shakti.singh@xebia.com"
  - Avatar chip "SS" (purple circle) — "Singh Rajput, Shakti ..." / "shakti.singh@vsb.energy"
- All other filters (Project, Country, Technology, Area/State/Province, Capacity, Status) remain empty, same as p06.

**Table columns:** Same as p06 (Project Name ▲, Short Name, Status, Project Manager, Country, Area/State/Province/Voivodeship, Technology, Capacity [MW(p]) — grid data unchanged/unfiltered still (same 12 visible rows as p06), since filter not yet applied.

**Row anatomy:** Identical to p06 (radio selector, colour stripe, zebra striping).

**Footer / paging:** "Total Rows: 1127", "Page: 1 from 6", same paging controls.

**States and colours:** Project Manager input shows an active focus ring (blue border). Suggested People list items appear as standard list rows with circular initials avatars (blue and purple) and two-line text (name / email).

**Text captured verbatim:**
- "Shakti Singh" / "Suggested People"
- "Shakti Singh" — "shakti.singh@xebia.com"
- "Singh Rajput, Shakti ..." — "shakti.singh@vsb.energy"
- All other header/filter/grid/footer text identical to p06.
- Taskbar clock: "10:45" "03-09-2026"

**Changes vs the previous screenshot:** User has clicked into "Project Manager" filter and typed "Shakti Singh"; a "Suggested People" typeahead panel appeared below the field with two matching person chips. Grid/filter results not yet changed. Browser tab area shows a page loading icon (spinner) had appeared in p07/p08 tab region compared to static icon in p06 — minor.

---

## p08 — Project Manager filter cleared / reset
**Screen:** Same Project list screen.

**Layout:** Identical structure to p06/p07.

**Command bar / actions:** Same as p06/p07 — only "+ Add Project" enabled; rest disabled.

**Filters / inputs:**
- "Project Manager" field is now empty again (placeholder "Search for project manager" visible, cursor/caret shown inside box, box still has focus outline).
- No suggestion dropdown showing.
- All other filters empty, identical to p06.

**Table columns:** Same as before, grid contents identical to p06/p07 (same 12 rows, same order — filter was not actually applied to the data, only typed and then cleared).

**Row anatomy:** Identical to p06.

**Footer / paging:** "Total Rows: 1127", "Page: 1 from 6" — unchanged, confirming no filter was applied to the underlying data.

**States and colours:** Same as p06; Project Manager field shows focus outline (blue border) with blinking caret, but empty.

**Text captured verbatim:** Identical to p06 (all filter labels, column headers, grid rows, footer text). Taskbar clock: "10:46" "03-09-2026".

**Changes vs the previous screenshot:** Project Manager filter text ("Shakti Singh") was cleared back to empty/placeholder state; time advanced to 10:46. Row data/table unchanged throughout p06-p08 — this appears to be a UI-only interaction demo (typing then clearing a filter) without actually submitting/applying it.

---

## p09 — Project list, idle state (transition point)
**Screen:** Same Project list screen; loading spinner visible in browser tab (page refreshing/transitioning).

**Layout:** Identical to p06/p08.

**Command bar / actions:** Same as before — only "+ Add Project" enabled.

**Filters / inputs:** All filters empty (Project, Country, Technology, Project Manager, Area/State/Province, Capacity/operator, Status) — identical to p06 baseline state. Mouse cursor visible hovering over the grid body (over "00 LG" row area), no row selected (radio buttons still all empty).

**Table columns:** Same 9 visible columns, same sort indicator on "Project Name ▲".

**Row anatomy:** Same 12 rows, same data, same colour stripes and zebra striping as p06.

**Footer / paging:** "Total Rows: 1127", "Page: 1 from 6" — unchanged.

**States and colours:** Identical to p06 baseline; no hover-highlight style change visibly rendered on the row under the cursor (or too subtle to distinguish from zebra shading).

**Text captured verbatim:** Identical text content to p06. Browser tab shows a loading spinner icon (page in transition to next screen). Taskbar clock: "10:46" "03-09-2026".

**Changes vs the previous screenshot:** Essentially a reset to the baseline unfiltered list view (matches p06 exactly), with the browser tab showing a loading spinner — indicating the app is about to navigate away (to the New Project form seen in p10). No visible selection made before navigating.

---

## p10 — New Project form, opened (General section, empty/validation-armed)
**Screen:** "New Project" detail/edit screen, opened via "+ Add Project". Left rail navigation + right-side form panel layout replaces the list screen entirely.

**Layout (top to bottom, left to right):**
- Top header bar (~85px): back-arrow icon button (blue outlined square) + "New Project" title (left), centered small info/alert icon (circle with "i", red outline) roughly centered top, "Help ˅" and user badge "Hi Shakti Singh Rajput" (right). VSB Cloud logo block (logo mark + "Cloud" + "Version 1.0.0.1 (Dev)") below/left of back arrow, same as list screen's branding block.
- Left rail (~140px wide, full height below header, white/light-grey background): vertical list of section links with icons.
- Main content panel (right of rail, white background): section title "General" (bold) at top, then form fields grouped under sub-headers ("Basic Information", "Placement" visible), with a small embedded map widget on the right side of the "Placement" group.
- Bottom bar (full width, thin, above content flush with footer): "Cancel" button (left, blue outline, X icon) + "Save" button (greyed/disabled) + "Required fields" note with warning icon (red circle-i) + "Created By: .." / "Modified By: .." labels (bottom right, greyed placeholders).

**Left rail items (icons + labels, top to bottom):**
- "General" (highlighted/selected — light blue background bar, folder-like icon, blue accent left edge, chevron ">" visible)
- "Milestones" (flag icon)
- "Generator" (bolt/lightning icon)
- "Production" (icon, factory-like)
- "Cluster Check List" (list icon)
- "Project Team" (people icon)
- "Planning" (list/calendar icon)
- "Grid Operator" (person icon)
- "Revenue" (dollar/coin icon)
- "Financing" (bank icon)
- Bottom of rail: "Collapse Menu" button (icon + text, bottom-left corner)

**Form fields visible — "Basic Information" group:**
- "Project ID" — text input, disabled/greyed (read-only, blank).
- "Project Name" * (required, red asterisk) — text input, focused (blue border), counter "0/55" top-right of field, currently empty with cursor in it; below field a red validation message "Project name should h[ave at least 3 letters]" (text cut off/wrapped) and a floating suggestion "test" appearing below (autocomplete/history suggestion).
- "Short Name" * (required) — text input, counter "0/55", red validation text below: "Project short name should have at least 3 letters."
- "SPV Name" — text input, counter "0/55", not required, empty.
- "Technology" * (required) — combobox, empty, chevron-down, red validation text below: "The Technology cannot be blank."
- "Project Type" — combobox, empty, chevron-down, not required, no error shown.
- "Project Manager" * (required) — typeahead/people-picker input, placeholder "Select for project manager", red validation text below: "The project manager cannot be blank."
- "Deputy Project Manager" — typeahead/people-picker input, placeholder "Select for deputy project manager", not required.
- "Development Type" * (required) — combobox, default value selected "Own Development", chevron-down.

**Form fields visible — "Placement" group (partially visible, cut off at bottom):**
- "Country" * (required) — combobox, empty, chevron-down, red validation text below: "Country cannot be blank."
- "Area/State/Province/Voivodeship" — combobox, empty, chevron-down (partially cut off).
- "District" — text input, counter "0/55", empty (label partially visible).
- Small interactive map widget top-right of Placement group showing street map labeled area names "COLONY", "AMBABARI(?)", "CHAND BIHARI NAGAR", "KAMAL APARTMENT 1" with a "+/-" zoom control and a pin/crosshair icon (top-right of map) — map has no marker placed yet.
- Below (cut off at bottom edge): "Municipality" and "Terrain Utilization" labels barely visible (row is clipped by viewport).

**Table columns:** N/A (form screen, no grid).

**Row anatomy:** N/A.

**Footer / paging:**
- "Cancel" button (blue outline, X icon, enabled).
- "Save" button (greyed, disabled — because required fields incomplete).
- "Required fields" text with red circular "i" icon (help/legend note, likely explains the red-asterisk convention).
- "Created By: .." and "Modified By: .." (bottom-right corner, dimmed/placeholder — blank because record not yet created).

**States and colours:**
- Required fields marked with a red asterisk "*" before the label.
- Validation error messages appear in red text directly beneath each invalid required field, appearing immediately/eagerly (before Save is even attempted) once field was touched or the form was opened with client-side validation pre-armed.
- "Project Name" field shows an autocomplete suggestion dropdown ("test") beneath it while red validation text also shows simultaneously — suggests both browser/native autocomplete and app validation are active together.
- Save button disabled (grey) until required fields are valid.
- Selected left-rail item ("General") has a light-blue highlight band and blue left border accent, chevron indicator.
- Central header alert icon (red circle-i) near top — possibly a page-level "has errors" indicator.

**Text captured verbatim:**
- "New Project"
- "General"
- "Basic Information"
- "Project ID"
- "Project Name" "0/55" "Project name should h[unreadable/cut off]" "test" (suggestion)
- "Short Name" "0/55" "Project short name should have at least 3 letters."
- "SPV Name" "0/55"
- "Technology" "The Technology cannot be blank."
- "Project Type"
- "Project Manager" "Select for project manager" "The project manager cannot be blank."
- "Deputy Project Manager" "Select for deputy project manager"
- "Development Type" "Own Development"
- "Placement"
- "Country" "Country cannot be blank."
- "Area/State/Province/Voivodeship"
- "District" "0/55"
- Map labels: "COLONY", "CHAND BIHARI NAGAR", "KAMAL APARTMENT 1", (partially) "AMBABARI"
- "Cancel"
- "Save"
- "Required fields"
- "Created By: .." "Modified By: .."
- Left rail: "General", "Milestones", "Generator", "Production", "Cluster Check List", "Project Team", "Planning", "Grid Operator", "Revenue", "Financing", "Collapse Menu"
- "Help" "Hi Shakti Singh Rajput"
- Taskbar clock: "10:46" "03-09-2026"

**Changes vs the previous screenshot:** Full screen change — navigated from the Project list grid (p09) to a brand-new "New Project" record-creation screen with a left section rail and a form layout, triggered by "+ Add Project". This is a new view/screen type not seen in p06-p09.

---

## p11 — New Project, General section — Project Name and Short Name filled
**Screen:** Same "New Project" form screen as p10 (General section active).

**Layout:** Identical to p10 (header, left rail, form content, bottom bar).

**Command bar / actions:** "Cancel" (enabled, blue outline) and "Save" (still greyed/disabled — other required fields like Technology, Project Manager, Country still blank) at bottom. "Required fields" legend still shown.

**Filters / inputs / form fields — changes from p10:**
- "Project ID" — still blank/disabled.
- "Project Name" — now filled with "test0309", counter shows "8/55", no error message, no autocomplete dropdown showing, field no longer focused (border not blue).
- "Short Name" — now filled with "T0309", counter "5/55", no error shown.
- "SPV Name" — still empty, "0/55".
- "Technology", "Project Type", "Project Manager", "Deputy Project Manager", "Development Type" — same as p10 (all still blank/default, same validation states presumably still armed for Technology/Project Manager, though those fields are off-screen focus in this specific crop — visible: "Technology" combobox still empty, "Project Manager" still empty, "Development Type" = "Own Development").
- "Placement" group / Country — same as p10 (empty, error "Country cannot be blank." visible), map widget same static view (no pin yet).

**Table columns:** N/A.

**Row anatomy:** N/A.

**Footer / paging:** Same "Cancel" / "Save" (disabled) / "Required fields" / "Created By: .." / "Modified By: .." as p10.

**States and colours:** Save remains disabled (grey) since Technology, Project Manager, Country, District/Placement fields are still incomplete. Filled fields (Project Name, Short Name) show no error styling once valid content entered.

**Text captured verbatim:**
- "Project Name" = "test0309" (8/55)
- "Short Name" = "T0309" (5/55)
- All other labels identical to p10: "Project ID", "SPV Name" (0/55), "Technology", "Project Type", "Project Manager", "Deputy Project Manager", "Development Type" = "Own Development", "Placement", "Country" (error: "Country cannot be blank."), map area labels same as p10.
- "Cancel", "Save", "Required fields", "Created By: ..", "Modified By: .."
- Taskbar clock: "10:47" "03-09-2026"

**Changes vs the previous screenshot:** User typed "test0309" into Project Name and "T0309" into Short Name (Short Name appears auto-derived/uppercased from Project Name, or independently typed) — both fields now valid (no red error text), counters updated (8/55 and 5/55). Time advanced from 10:46 to 10:47.

---

## p12 — New Project, General section — Technology, Project Manager set; Area dropdown open; Map centered on Jaipur
**Screen:** Same "New Project" form, scrolled down slightly (Basic Information header/Project ID/Project Name/Short Name/SPV Name rows scrolled out of view at top; visible now starts at "Technology").

**Layout:** Same left rail + form panel structure; content area has scrolled down within the form (the top "General"/"Basic Information" heading area is cut off above the visible crop, only field rows from "Technology" downward are shown), map widget now larger/more visible on the right.

**Command bar / actions:** "Cancel" / "Save" (still disabled) / "Required fields" at bottom — same as before.

**Filters / inputs — changes:**
- "Technology" — now set to "Wind" (previously empty/error).
- "Project Manager" — now set, showing a chip/tag: blue circle avatar "SS" + "Shakti Singh" with an "×" remove button, inside the picker field (field has blue focus/selected border).
- "Development Type" — "Own Development" (unchanged).
- "Placement" group: "Country" = "Germany" (now filled, dropdown visible below it, open) — the open combobox (under "Area/State/Province/Voivodeship" presumably) lists German federal states:
  - "Baden-Württemberg", "Bavaria", "Brandenburg", "Hesse", "Lower Saxony", "Mecklenburg-Western Pomerania", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
  - Below the dropdown (partially obscured): validation text "Area/State/Province cannot be blank."
- "Municipality" — text input, placeholder "Type 3 or more letters to Searc[h]" (autocomplete-style, minimum-characters search box), appears below the open dropdown.
- "Tax Factor [%]" — text input, empty.
- "Terrain Utilization" — combobox, empty.
- "Latitude" * (required) — text input, empty, red error: "Expected decimal degrees field format number ###.######."
- "Longitude" * (required) — text input, empty, same red error format message.
- Map widget: now shows a real map centered on "Jaipur" with a blue location pin/marker placed, street/road labels visible ("Nemi Sagar Colony", "Lakshmi Nagar", "Ajmer Road", "Moti Nagar", "Sodala", "Vidyut Nagar B" etc.), zoom controls (+/-) and a locate/crosshair icon top-right of map.

**Table columns:** N/A.

**Row anatomy:** N/A.

**Footer / paging:** Unchanged — "Cancel", "Save" (disabled), "Required fields", "Created By: ..", "Modified By: ..".

**States and colours:** Project Manager field shows a selected-person "chip" (blue avatar badge "SS" + name + remove "×"), field border highlighted blue (focused/active). Country field now valid (filled "Germany", no error). Area/State combobox is open showing the German-states list as an active dropdown overlay on top of the form (floating white panel with list, current mouse hover on "Thuringia" per cursor position). Latitude/Longitude both still show red validation errors (required, format-specific).

**Text captured verbatim:**
- "Technology" = "Wind"
- "Project Manager" chip: "SS" avatar, "Shakti Singh", "×"
- "Development Type" = "Own Development"
- "Placement"
- "Country" = "Germany"
- Dropdown list: "Baden-Württemberg", "Bavaria", "Brandenburg", "Hesse", "Lower Saxony", "Mecklenburg-Western Pomerania", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
- "Area/State/Province cannot be blank." (validation text, partially covered by dropdown)
- "Municipality", "Type 3 or more letters to Searc[h]"
- "Tax Factor [%]"
- "Terrain Utilization"
- "Latitude" "Expected decimal degrees field format number ###.######."
- "Longitude" "Expected decimal degrees field format number ###.######."
- Map: "Jaipur", "Nemi Sagar Colony", "Lakshmi Nagar", "Ajmer Road", "Moti Nagar", "Sodala", "Vidyut Nagar B"
- "Cancel", "Save", "Required fields", "Created By: ..", "Modified By: .."
- Taskbar clock: "10:47" "03-09-2026"

**Changes vs the previous screenshot:** Form scrolled down; Technology set to "Wind"; Project Manager set to "Shakti Singh" (shown as removable chip); Country set to "Germany"; Area/State/Province/Voivodeship dropdown opened showing the list of German states; Latitude/Longitude fields now visible with format-validation errors; map now shows an actual location (Jaipur) with a pin, versus the static unpinned map view in p10/p11.

---

## p13 — New Project, Placement section — Area, Municipality, Tax Factor, Lat/Long filled
**Screen:** Same "New Project" form, scrolled to show full "Placement" group (Country through Longitude) plus a new "Shareholding Entity" group below it.

**Layout:** Left rail + form panel; visible content now: "Placement" header, its full field grid, then a "Shareholding Entity" sub-section with its own mini-table, all above the fixed bottom bar.

**Command bar / actions:** "Cancel" (enabled) / "Save" (still greyed/disabled) / "Required fields" — same bottom bar.

**Filters / inputs — Placement group (all fields now visible together):**
- "Country" * = "Germany" (combobox, filled)
- "Area/State/Province/Voivodeship" * = "Saxony-Anhalt" (combobox, filled)
- "District" — text input, counter "0/55", empty
- "Municipality" * = "Ausleben" (combobox/typeahead, filled)
- "Tax Factor [%]" = "400" (text input, filled)
- "Terrain Utilization" — combobox, empty, chevron-down
- "Latitude" * = "26.919774" (filled, right-aligned numeric-looking text, no error now)
- "Longitude" * = "75.771319" (filled, right-aligned, no error now)
- Map: same Jaipur map view with blue pin, zoom controls, "©2026 TomTom" attribution visible bottom-right of map, compass/orientation icon added at bottom of zoom control stack.

**New section — "Shareholding Entity":**
- "+ Add" button (blue text/icon, top-left of section)
- Info banner beside it: circular "i" icon + text "Shareholding entity ownership sum must be 100%" (light grey/blue banner background)
- Mini-table with headers: "Description" (left), "Ownership" (right-aligned), "Actions" (right-aligned)
- One row: "Green Yield One (IPP2)" | "50.0 %" | action icons: pencil (edit, blue) and trash can (delete, blue/teal)

**Table columns:** (for the Shareholding Entity sub-table) "Description", "Ownership", "Actions" — Description left-aligned, Ownership right-aligned (percentage), Actions right-aligned icon buttons.

**Row anatomy (Shareholding Entity table):** Single row, no zebra striping visible (only one row present), text row with two trailing icon-buttons (edit pencil, delete trash) in the Actions column, both blue/teal colored icons.

**Footer / paging:** Same "Cancel" / "Save" (disabled) / "Required fields" / "Created By: .." / "Modified By: .." — Save still disabled, likely because ownership sum (only 50%) is not yet 100% or other fields remain incomplete.

**States and colours:** All Placement fields now show no red validation errors (valid). Shareholding Entity banner is an informational (not error) style — light background, "i" icon, blue/grey text — flagging the 100%-sum business rule as guidance rather than a blocking error at this point (existing row is only 50%).

**Text captured verbatim:**
- "Placement"
- "Country" = "Germany"
- "Area/State/Province/Voivodeship" = "Saxony-Anhalt"
- "District" "0/55"
- "Municipality" = "Ausleben"
- "Tax Factor [%]" = "400"
- "Terrain Utilization"
- "Latitude" = "26.919774"
- "Longitude" = "75.771319"
- Map: "Jaipur" + surrounding street labels (as p12) + "©2026 TomTom"
- "Shareholding Entity"
- "+ Add"
- "Shareholding entity ownership sum must be 100%"
- Table headers: "Description", "Ownership", "Actions"
- Row: "Green Yield One (IPP2)", "50.0 %"
- "Cancel", "Save", "Required fields", "Created By: ..", "Modified By: .."
- Taskbar clock: "10:48" "03-09-2026"

**Changes vs the previous screenshot:** Form scrolled further down (Technology/Project Manager rows now off-screen above); Area/State/Province set to "Saxony-Anhalt"; Municipality filled "Ausleben"; Tax Factor filled "400"; Latitude/Longitude filled with valid values (26.919774 / 75.771319) and their red errors cleared; a new "Shareholding Entity" section appeared below Placement with one pre-existing/added row ("Green Yield One (IPP2)", 50.0%) — not present/visible in earlier screenshots.

---

## p14 — Project saved, record view (test0309, Active) — General section, top of form
**Screen:** Project detail screen for the newly created project, now in "view/edit existing record" mode (no longer "New Project" — header shows the actual project name and status). Scrolled back to the top of the General section.

**Layout:** Same left-rail + form-panel structure as p10-p13, but header title area now differs (see below), and Created By/Modified By in the bottom-right are now populated with real values instead of placeholders.

**Header bar (top):**
- Back arrow (blue outline box) + vertical divider "|" + title "test0309" (bold, black) + below/right of it a small status line: circular info icon + "Active" (grey text) — this replaces the plain "New Project" title from p10-p13.
- Centered red circular "i" alert icon still present (top center).
- "Help ˅" and "Hi Shakti Singh Rajput" badge — unchanged, top right.

**Left rail:** Same items as before: "General" (currently selected/highlighted, cursor hovering on it), "Milestones", "Generator", "Production", "Cluster Check List", "Project Team", "Planning", "Grid Operator", "Revenue", "Financing", "Collapse Menu" at bottom. Note: the icon next to "General" appears as a lightning-bolt/flash icon here (differs slightly from the folder-like icon seen at this position in p10 — likely a state icon for "currently open/active" section rather than a different icon set).

**Form fields — "Basic Information" (now populated and mostly read-only/greyed for system fields):**
- "Project ID" = "10007418" (filled, grey/disabled styling — system-generated ID)
- "Project Name" = "test0309" (8/55)
- "Short Name" = "T0309" (5/55)
- "SPV Name" — empty (0/55)
- "SPV Legal Structure" — NEW field visible here (not present in p10-p13's Basic Information layout at this position) — combobox, empty
- "Technology" = "Wind"
- "Project Type" = "Only infrastructure" (now filled — was empty in earlier screenshots)
- "Project Manager" = chip "SS" "Shakti Singh" ×
- "Deputy Project Manager" — empty, placeholder "Select for deputy project manager"
- "Development Type" = "Own Development"

**Placement (top of, partially visible at bottom of crop):**
- "Country" = "Germany"
- "Area/State/Province/Voivodeship" = "Saxony-Anhalt"
- "District" — empty, 0/55
- Map thumbnail visible top-right, small crop showing "COLONY", "CHAND BIHARI NAGAR", "KAMAL APARTMENT 1" labels (map appears reset to a default/unset-looking view here rather than the Jaipur-pinned view — possibly just a smaller crop cutting off the pin, or the widget re-rendered).
- Bottom row partially cut off: "Municipality" / "Tax Factor [%]" labels barely visible at very bottom edge.

**Table columns:** N/A (form view). "Shareholding Entity" sub-table not visible in this scroll position (scrolled back to top).

**Footer / paging / bottom bar:**
- "Cancel" (enabled, blue outline)
- "Save" (still greyed/disabled — no pending edits)
- "Required fields" note with icon
- "Created By: Shakti Singh Rajput   03.09.2026 10:49" (now populated, was ".." placeholder before)
- "Modified By: Shakti Singh Rajput   03.09.2026 10:49" (now populated)

**States and colours:** Project ID field shown disabled/read-only (grey background) confirming it's system-assigned on save. All previously-required fields now show filled values with no red error text. Header status shows "Active" next to an info icon, in the same visual weight/position as a subtitle under the record title. Save button still disabled since there are no unsaved changes at this point (matches the "record just loaded" state).

**Text captured verbatim:**
- "test0309"
- "Active"
- "General" (left rail, selected)
- "Project ID" = "10007418"
- "Project Name" = "test0309" (8/55)
- "Short Name" = "T0309" (5/55)
- "SPV Name" (0/55)
- "SPV Legal Structure"
- "Technology" = "Wind"
- "Project Type" = "Only infrastructure"
- "Project Manager" = "Shakti Singh" (chip, "SS" avatar)
- "Deputy Project Manager" = "Select for deputy project manager"
- "Development Type" = "Own Development"
- "Placement"
- "Country" = "Germany"
- "Area/State/Province/Voivodeship" = "Saxony-Anhalt"
- "District" (0/55)
- "Cancel", "Save", "Required fields"
- "Created By: Shakti Singh Rajput 03.09.2026 10:49"
- "Modified By: Shakti Singh Rajput 03.09.2026 10:49"
- Taskbar clock: "10:49" "03-09-2026"

**Changes vs the previous screenshot:** The project was saved — screen transitioned from "New Project" (unsaved, id-less, Created By/Modified By blank) to the persisted record view: header title changed from "New Project" to "test0309" with an "Active" status subtitle; "Project ID" auto-populated to "10007418"; "Project Type" now shows "Only infrastructure" (was set at some point between p13 and p14, not directly observed); a new field "SPV Legal Structure" appears in the Basic Information group that was not visible in the p10-p13 crops; "Created By" / "Modified By" now show the real user name and a timestamp "03.09.2026 10:49"; form auto-scrolled back to the top of the General section.
