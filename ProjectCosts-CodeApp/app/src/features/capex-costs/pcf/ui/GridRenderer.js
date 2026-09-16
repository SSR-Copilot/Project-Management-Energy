import { DatasetParser } from "../services/DatasetParser";
/**
 * Handles the DOM manipulation and layout construction of the main hierarchical grid.
 */
export class GridRenderer {
    // Column min-widths (px), hand-tuned with renderColGroup(). By design the table is
    // allowed to grow BEYOND the Canvas-allocated width and scroll horizontally rather
    // than squeezing columns — shrinking these values causes wrapped numbers and broken
    // tree connector alignment, so change them only with a designer sign-off.
    // Number column also hosts the tree toggles + connector spans, so it needs slack.
    static NUMBER_COLUMN_MIN_WIDTH = 100;
    // Deliberately raised to 300 so contract names get room before the ellipsis kicks in.
    static ACCOUNT_NAME_COLUMN_MIN_WIDTH = 300;
    static TOTAL_COST_COLUMN_MIN_WIDTH = 100;
    // Planned/Actual are slightly wider because their header captions are longer.
    static PLANNED_COST_COLUMN_MIN_WIDTH = 120;
    static ACTUAL_COST_COLUMN_MIN_WIDTH = 120;
    // 65px is the floor at which a 6-digit monthly cost still fits without wrapping.
    static MONTH_COLUMN_MIN_WIDTH = 65;
    // Fixed (not minimum) — the three-dot button never needs to flex.
    static ACTION_COLUMN_WIDTH = 40;
    // Month-column header captions (Bug 13304): three-letter abbreviations, no year.
    // Index 0 = January; the header loop is 1-based so it reads [i - 1]. English/fixed
    // on purpose — the grid's other captions ("Total Costs" etc.) are also fixed English.
    static MONTH_ABBREVIATIONS = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    _container;
    _tableWrapper;
    _table;
    _thead;
    _tbody;
    // Last ShowPlannedCost value, so the ResizeObserver can re-fit columns (which needs
    // the column count) without a fresh context. Set on every render().
    _lastShowPlanned = false;
    // Guards against the ResizeObserver re-entering while render() is mid-flight (setting
    // the wrapper height itself triggers a resize notification).
    _isRendering = false;
    // Re-fits the columns whenever the host resizes the control, so the internal
    // horizontal scrollbar never lingers after a width change (see fitColumnsToScrollViewport).
    _resizeObserver = null;
    // Owned by index.ts and shared by reference so the expand/collapse state survives
    // the full re-render triggered by PCF_RE_RENDER (see toggleCollapse). Inverted
    // semantics (Bug 13472): holds EXPANDED row ids, so empty = all collapsed.
    _expandedRowIds;
    _actionDropdown;
    // The add/month dropdowns and the floating comment tooltip are appended to
    // document.body (not the table) so the scroll container's overflow can't clip
    // them. These references exist purely so render()/destroy() can tear them down;
    // leaking them would leave orphaned popups floating over the Canvas app.
    _addDropdownElement = null;
    // The "Add" menu button the dropdown is currently open for, so its blue "active"
    // highlight can be cleared on close and re-clicks can toggle it shut.
    _activeAddMenuButton = null;
    _boundAddDropdownWindowClick;
    _monthDropdownElement = null;
    // Month cell currently highlighted while its dropdown is open, so the "active"
    // class can be removed on close.
    _activeMonthCell = null;
    _commentTooltipElement = null;
    _boundMonthDropdownWindowClick;
    _onActionTriggered;
    /**
     * @param container        Root div handed over by index.ts (the PCF container).
     * @param expandedRowIds   Shared (by reference) expand-state set owned by index.ts
     *                          (holds EXPANDED ids; empty = everything collapsed).
     * @param actionDropdown   Pre-built three-dot menu component for contract rows.
     * @param onActionTriggered Single callback through which EVERY user action reaches
     *                          index.ts — keeping this the only exit point is what
     *                          guarantees the "no Dataverse calls from the renderer" rule.
     */
    constructor(container, expandedRowIds, actionDropdown, onActionTriggered) {
        this._container = container;
        this._expandedRowIds = expandedRowIds;
        this._actionDropdown = actionDropdown;
        this._onActionTriggered = onActionTriggered;
        this._boundAddDropdownWindowClick = this.handleAddDropdownWindowClick.bind(this);
        this._boundMonthDropdownWindowClick = this.handleMonthDropdownWindowClick.bind(this);
        this.initDOM();
    }
    /**
     * Builds the static DOM skeleton once (wrapper > table > thead/tbody). Only the
     * contents of thead/tbody are rewritten on each render(); keeping the skeleton
     * stable preserves the wrapper's horizontal/vertical scroll position across the
     * frequent Canvas-triggered re-renders.
     */
    initDOM() {
        const mainContainer = document.createElement("div");
        mainContainer.className = "pcf-budget-grid";
        // Table Wrapper for horizontal scrolling
        this._tableWrapper = document.createElement("div");
        this._tableWrapper.className = "pcf-table-scroll";
        this._table = document.createElement("table");
        this._table.className = "pcf-table";
        this._thead = document.createElement("thead");
        this._tbody = document.createElement("tbody");
        this._table.appendChild(this._thead);
        this._table.appendChild(this._tbody);
        this._tableWrapper.appendChild(this._table);
        mainContainer.appendChild(this._tableWrapper);
        this._container.appendChild(mainContainer);
        // Re-fit the columns whenever the host changes the control's size. render() only
        // fits once, against the width at render time; a later Canvas relayout (sidebar
        // toggle, window resize, the vertical scrollbar appearing after async layout)
        // could otherwise leave a stale ~15px horizontal scrollbar. The _isRendering
        // guard avoids re-entrancy from the height we set during render(); the rAF
        // coalesces bursts and defers measurement until layout has settled.
        if (typeof ResizeObserver !== "undefined") {
            this._resizeObserver = new ResizeObserver(() => {
                if (this._isRendering || this._tbody.children.length === 0) {
                    return;
                }
                window.requestAnimationFrame(() => {
                    if (this._isRendering || this._tbody.children.length === 0) {
                        return;
                    }
                    this.fitColumnsToScrollViewport(this._lastShowPlanned);
                });
            });
            this._resizeObserver.observe(this._tableWrapper);
        }
    }
    /**
     * Full re-render entry point, called by index.ts on every updateView and on
     * PCF_RE_RENDER. Flow: tear down floating UI -> loading guard -> parse dataset to
     * tree (fallback to sample data when empty) -> apply UI-only filters
     * (CostPaidByFilter, ShowEmptyAccounts) -> attach standard contract options ->
     * size columns -> headers (cluster timeline + column row) -> body rows
     * (account/subaccount/contract/add) -> grand total + sticky-footer spacer.
     *
     * Grand totals are accumulated over the FILTERED tree (so the footer matches the
     * visible rows) but include collapsed accounts — collapsing hides detail, it must
     * not change totals.
     */
    render(context) {
        // Suppress the ResizeObserver re-fit while we synchronously rebuild and resize
        // the grid; it runs again (via rAF) once this render settles.
        this._isRendering = true;
        // Dropdowns/tooltips live on document.body, so a re-render would otherwise
        // orphan them (their anchor cells are about to be destroyed).
        this.closeMonthDropdown();
        this.closeAddDropdown();
        this.hideCommentTooltip();
        const dataset = context.parameters.DevexCapexCostSummary;
        // Canvas datasets arrive asynchronously; rendering before load completes would
        // briefly flash the sample fallback data, so bail out with a loading message.
        if (dataset.loading) {
            this.renderLoading();
            this._isRendering = false;
            return;
        }
        let accounts = DatasetParser.parseDatasetToTree(dataset);
        const showPlanned = context.parameters.ShowPlannedCost?.raw || false;
        // Remembered for the ResizeObserver's column re-fit (it has no context).
        this._lastShowPlanned = showPlanned;
        // Defaults to true: hiding accounts is the opt-in behaviour.
        const showEmptyAccounts = context.parameters.ShowEmptyAccounts?.raw ?? true;
        const costPaidByFilter = (context.parameters.CostPaidByFilter?.raw || "Show All Cost").toString().trim();
        // StartYear drives which year's M1..M12 Canvas put into the collection; here it
        // is only used for the SetCostPaidUnpaid payload (month headers no longer show
        // the year — Bug 13304).
        const startYear = context.parameters.StartYear?.raw || 2026;
        // Both filters are UI-only: Canvas data is untouched, and subaccount/account
        // totals are recalculated from the rows that remain visible (business rule for
        // the DevCo/SPV filter).
        accounts = this.applyCostPaidByFilter(accounts, costPaidByFilter);
        if (!showEmptyAccounts) {
            accounts = this.removeEmptyAccounts(accounts);
        }
        // Second dataset (colStandardContractOptionsForPCF): per-subaccount list of
        // standard contracts offered by the Add menu. Applied AFTER the filters so the
        // options land on the cloned subaccount objects the filters produced.
        const standardContractOptionsBySubaccount = DatasetParser.parseStandardContractOptionsDataset(context.parameters.StandardContractOptions);
        this.applyStandardContractOptions(accounts, standardContractOptionsBySubaccount);
        // 3 preceding columns (Number, Name, Total Costs) + 2 optional (Planned, Actual)
        const precedingColSpan = 3 + (showPlanned ? 2 : 0);
        // Canvas reports the allocated size; fall back to the live container size when
        // the host returns 0 (e.g. first render in the test harness).
        const availableWidth = Math.floor(context.mode.allocatedWidth || this._container.clientWidth || 0);
        const availableHeight = Math.floor(context.mode.allocatedHeight || this._container.clientHeight || 0);
        this.applyViewportHeight(availableHeight);
        this.renderColGroup(showPlanned, availableWidth);
        this.renderHeaders(context, showPlanned, precedingColSpan);
        this._tbody.innerHTML = "";
        if (accounts.length === 0) {
            this.renderEmptyState(precedingColSpan + 13);
            this._isRendering = false;
            return;
        }
        // Grand totals sum the account-level TotalCost/PlannedCost/ActualCost fields
        // (Canvas-computed all-years values, or filter-recalculated copies) — NOT a sum
        // of M1..M12, which only cover the selected year.
        let grandTotalCost = 0;
        let grandPlannedCost = 0;
        let grandActualCost = 0;
        const grandMonthlyTotals = Array(12).fill(0);
        const totalColSpan = precedingColSpan + 12 + 1;
        // Visual gap rows only make sense between an account that actually showed
        // detail rows and the next account; this flag tracks that across iterations.
        let previousAccountRenderedDetails = false;
        // Iterate Accounts (Level 0)
        accounts.forEach((acc, accountIndex) => {
            if (accountIndex > 0 && previousAccountRenderedDetails) {
                this._tbody.appendChild(this.createGroupGapRow(totalColSpan));
            }
            const isAccCollapsed = !this._expandedRowIds.has(acc.id);
            grandTotalCost += acc.totalCost;
            grandPlannedCost += acc.plannedCost;
            grandActualCost += acc.actualCost;
            acc.months.forEach((val, idx) => {
                grandMonthlyTotals[idx] += val;
            });
            this._tbody.appendChild(this.createAccountRow(acc, isAccCollapsed, showPlanned));
            // Iterate Subaccounts (Level 1) if expanded
            if (!isAccCollapsed) {
                acc.subaccounts.forEach((sub, subIndex) => {
                    const isSubCollapsed = !this._expandedRowIds.has(sub.id);
                    const isLastSubaccount = subIndex === acc.subaccounts.length - 1;
                    this._tbody.appendChild(this.createSubaccountRow(sub, isSubCollapsed, showPlanned, isLastSubaccount, subIndex === 0));
                    // Iterate Contracts (Level 2) and Add Button if expanded
                    // The isLast*/index===0 flags feed the tree connector classes —
                    // they decide between T-branch, L-branch and pass-through lines.
                    // Getting them wrong reintroduces the old "line bleeding into the
                    // neighbouring row" regressions.
                    if (!isSubCollapsed) {
                        sub.contracts.forEach((contract, contractIndex) => {
                            const isLastContract = contractIndex === sub.contracts.length - 1;
                            this._tbody.appendChild(this.createContractRow(contract, showPlanned, isLastSubaccount, contractIndex === 0, isLastContract, startYear));
                        });
                        // Every expanded subaccount ends with an "Add" row, even when it
                        // has no contracts yet — that is the only entry point for adding.
                        this._tbody.appendChild(this.createAddRow(sub, showPlanned, isLastSubaccount));
                    }
                });
            }
            previousAccountRenderedDetails = !isAccCollapsed && acc.subaccounts.length > 0;
        });
        this.renderGrandTotal(grandTotalCost, grandPlannedCost, grandActualCost, grandMonthlyTotals, showPlanned);
        // Re-fit the columns now that all rows are in the DOM: if a vertical scrollbar
        // appeared it has shrunk the wrapper's usable width, and the first
        // renderColGroup (sized off allocatedWidth) would now overflow by the scrollbar
        // width, showing a spurious horizontal scrollbar. See the method JSDoc.
        this.fitColumnsToScrollViewport(showPlanned);
        this.syncGrandTotalSpacer(totalColSpan);
        this._isRendering = false;
    }
    /**
     * Second column-sizing pass, run AFTER the rows exist so the vertical scrollbar's
     * presence is known. renderColGroup's first pass sizes the table to the Canvas
     * allocatedWidth, but once enough rows force a vertical scrollbar that scrollbar
     * eats ~15-17px of the scroll wrapper's inner width — leaving the table wider than
     * the viewport and producing an UNNECESSARY horizontal scrollbar (Bug 13125).
     *
     * Re-running renderColGroup against the wrapper's live clientWidth (which already
     * excludes the vertical scrollbar) makes the table fit exactly. The
     * Math.max(minimumTableWidth, ...) inside renderColGroup still preserves the
     * INTENDED horizontal scroll when the canvas is genuinely too narrow
     * (minimumTableWidth > clientWidth), so this only removes the spurious case.
     *
     * No oscillation risk: shrinking the table never removes the vertical scrollbar
     * (rows still overflow vertically), so clientWidth stays stable on the second pass.
     */
    fitColumnsToScrollViewport(showPlanned) {
        const innerWidth = this._tableWrapper.clientWidth;
        // 0 in the test harness / before first layout — leave the allocatedWidth-based
        // sizing from the first pass untouched.
        if (innerWidth <= 0) {
            return;
        }
        this.renderColGroup(showPlanned, innerWidth);
    }
    /**
     * Pins the scroll wrapper to the exact height Canvas allocated. Without an explicit
     * height the wrapper grows with content, which kills both the sticky header and the
     * sticky grand-total row (position:sticky needs a bounded scroll container).
     * Height 0/unknown (test harness, first paint) clears the constraint instead of
     * collapsing the grid to nothing.
     */
    applyViewportHeight(availableHeight) {
        if (availableHeight > 0) {
            this._tableWrapper.style.height = `${availableHeight}px`;
            this._tableWrapper.style.maxHeight = `${availableHeight}px`;
        }
        else {
            this._tableWrapper.style.height = "";
            this._tableWrapper.style.maxHeight = "";
        }
    }
    /**
     * Keeps the grand-total row visually glued to the BOTTOM of the viewport even when
     * there are too few body rows to fill it: inserts a filler row sized to the leftover
     * space just above the grand total. Must run after the rows are in the DOM because
     * it measures real offsetHeights; fragile if row heights later become dynamic
     * (e.g. wrapping text) since the measurement happens only once per render.
     */
    syncGrandTotalSpacer(totalColSpan) {
        const existingSpacer = this._tbody.querySelector(".pcf-row-footer-spacer");
        if (existingSpacer) {
            existingSpacer.remove();
        }
        const grandRow = this._tbody.querySelector(".pcf-row-grand");
        if (!grandRow) {
            return;
        }
        const wrapperHeight = this._tableWrapper.clientHeight;
        if (wrapperHeight <= 0) {
            return;
        }
        const headerHeight = this._thead.offsetHeight;
        const grandHeight = grandRow.offsetHeight;
        const bodyRows = Array.from(this._tbody.children).filter(row => row !== grandRow);
        const renderedBodyHeight = bodyRows.reduce((total, row) => total + row.offsetHeight, 0);
        const availableBodyHeight = wrapperHeight - headerHeight - grandHeight;
        const spacerHeight = availableBodyHeight - renderedBodyHeight;
        if (spacerHeight <= 0) {
            return;
        }
        const spacerRow = document.createElement("tr");
        spacerRow.className = "pcf-row-footer-spacer";
        const spacerCell = document.createElement("td");
        spacerCell.colSpan = totalColSpan;
        spacerCell.style.height = `${spacerHeight}px`;
        spacerRow.appendChild(spacerCell);
        this._tbody.insertBefore(spacerRow, grandRow);
    }
    /**
     * Attaches each subaccount's standard contract options (from the
     * StandardContractOptions dataset) so showAddDropdown can decide between
     * no item / direct action / submenu. Mutates the (already cloned/filtered)
     * tree in place — safe because the tree is rebuilt every render.
     */
    applyStandardContractOptions(accounts, optionsBySubaccount) {
        if (optionsBySubaccount.size === 0) {
            return;
        }
        accounts.forEach(account => {
            account.subaccounts.forEach(subaccount => {
                subaccount.standardContractOptions = optionsBySubaccount.get(subaccount.id) || [];
            });
        });
    }
    /**
     * UI-only DevCo/SPV filter (CostPaidByFilter input). Contracts that don't match are
     * dropped from the rendered tree and subaccount/account totals are recalculated
     * from the surviving contracts so the visible numbers stay self-consistent — the
     * Canvas collection itself is never modified. Unrecognised filter values fail open
     * (show everything) so a typo in the Canvas dropdown can't blank the grid.
     */
    applyCostPaidByFilter(accounts, filterValue) {
        const normalizedFilter = filterValue.trim().toLowerCase();
        // Accept the historical "Show All Cost" label plus shorter variants Canvas has
        // used over time.
        if (!normalizedFilter || normalizedFilter === "show all cost" || normalizedFilter === "show all" || normalizedFilter === "all") {
            return accounts;
        }
        const expectedCostPaidBy = normalizedFilter.includes("devco")
            ? "devco"
            : normalizedFilter.includes("spv")
                ? "spv"
                : "";
        if (!expectedCostPaidBy) {
            return accounts;
        }
        return accounts.map(account => this.recalculateAccount({
            ...account,
            subaccounts: account.subaccounts.map(subaccount => this.recalculateSubaccount({
                ...subaccount,
                contracts: subaccount.contracts.filter(contract => this.contractMatchesCostPaidBy(contract, expectedCostPaidBy))
            }))
        }));
    }
    /**
     * Matches against BOTH CostPaidBy and SubLabel because older rows only carried the
     * "[SPV]"/"[DEVCO]" tag inside SubLabel; substring matching keeps both data shapes
     * working without a Canvas migration.
     */
    contractMatchesCostPaidBy(contract, expectedCostPaidBy) {
        const source = `${contract.costPaidBy || ""} ${contract.subLabel || ""}`.toLowerCase();
        return source.includes(expectedCostPaidBy);
    }
    /**
     * Implements ShowEmptyAccounts=false: drops subaccounts with no contracts AND no
     * cost anywhere, then drops accounts left with no subaccounts and no own cost.
     * "Empty" deliberately checks all cost fields (hasAnyCost) so an account with
     * all-years totals but nothing in the selected year is still shown.
     */
    removeEmptyAccounts(accounts) {
        return accounts
            .map(account => {
            const subaccounts = account.subaccounts.filter(subaccount => subaccount.contracts.length > 0 || this.hasAnyCost(subaccount));
            if (subaccounts.length === 0) {
                return { ...account, subaccounts };
            }
            return this.recalculateAccount({ ...account, subaccounts });
        })
            .filter(account => account.subaccounts.length > 0 || this.hasAnyCost(account));
    }
    /** "Has any cost" across all-years totals AND the selected-year months — used by
     *  removeEmptyAccounts so rows with off-year costs are never hidden by mistake. */
    hasAnyCost(row) {
        return row.totalCost !== 0
            || row.plannedCost !== 0
            || row.actualCost !== 0
            || row.months.some(monthCost => monthCost !== 0);
    }
    /**
     * Rebuilds an account's totals from its (possibly filtered) subaccounts. ONLY used
     * after UI-side filtering — in the unfiltered path the Canvas-computed all-years
     * totals are displayed untouched. Summing child totalCost fields (not M1..M12)
     * keeps the "never derive all-year totals from months" rule intact.
     */
    recalculateAccount(account) {
        if (account.subaccounts.length === 0) {
            return {
                ...account,
                totalCost: 0,
                plannedCost: 0,
                actualCost: 0,
                months: Array(12).fill(0)
            };
        }
        return {
            ...account,
            totalCost: account.subaccounts.reduce((total, subaccount) => total + subaccount.totalCost, 0),
            plannedCost: account.subaccounts.reduce((total, subaccount) => total + subaccount.plannedCost, 0),
            actualCost: account.subaccounts.reduce((total, subaccount) => total + subaccount.actualCost, 0),
            months: this.sumMonths(account.subaccounts)
        };
    }
    /** Subaccount counterpart of recalculateAccount — totals become the sum of the
     *  visible contracts so the DevCo/SPV filter shows internally consistent numbers. */
    recalculateSubaccount(subaccount) {
        if (subaccount.contracts.length === 0) {
            return {
                ...subaccount,
                totalCost: 0,
                plannedCost: 0,
                actualCost: 0,
                months: Array(12).fill(0)
            };
        }
        return {
            ...subaccount,
            totalCost: subaccount.contracts.reduce((total, contract) => total + contract.totalCost, 0),
            plannedCost: subaccount.contracts.reduce((total, contract) => total + contract.plannedCost, 0),
            actualCost: subaccount.contracts.reduce((total, contract) => total + contract.actualCost, 0),
            months: this.sumMonths(subaccount.contracts)
        };
    }
    /** Element-wise sum of the 12 selected-year month columns (this is fine — months
     *  may be summed into month totals; only all-years totals must not come from here). */
    sumMonths(rows) {
        const totals = Array(12).fill(0);
        rows.forEach(row => {
            row.months.forEach((monthCost, monthIndex) => {
                totals[monthIndex] += monthCost;
            });
        });
        return totals;
    }
    /**
     * FRAGILE: single source of truth for column sizing. Fixed-width leading/trailing
     * columns + 12 EQUAL month columns that absorb any extra space. The table gets an
     * explicit width (and min-width) so that when the columns' minimums exceed the
     * Canvas allocation the wrapper scrolls horizontally instead of letting the browser
     * squeeze columns. The --pcf-month-width CSS variable must match the computed month
     * width — CSS (cluster timeline ticks/pills) positions against it.
     */
    renderColGroup(showPlanned, availableWidth) {
        const existingColGroup = this._table.querySelector("colgroup");
        if (existingColGroup) {
            existingColGroup.remove();
        }
        const widths = [
            GridRenderer.NUMBER_COLUMN_MIN_WIDTH,
            GridRenderer.ACCOUNT_NAME_COLUMN_MIN_WIDTH,
            GridRenderer.TOTAL_COST_COLUMN_MIN_WIDTH
        ];
        if (showPlanned) {
            widths.push(GridRenderer.PLANNED_COST_COLUMN_MIN_WIDTH, GridRenderer.ACTUAL_COST_COLUMN_MIN_WIDTH);
        }
        // Grow-don't-squeeze policy: take whichever is larger, the minimum table width
        // or the Canvas allocation, then split the leftover evenly across the 12 month
        // columns. Math.floor + recomputing tableWidth from the floored month width
        // avoids sub-pixel rounding drift that previously misaligned the cluster
        // timeline ticks against the month column borders.
        const fixedWidth = widths.reduce((total, width) => total + width, 0) + GridRenderer.ACTION_COLUMN_WIDTH;
        const monthMinimumTotal = GridRenderer.MONTH_COLUMN_MIN_WIDTH * 12;
        const minimumTableWidth = fixedWidth + monthMinimumTotal;
        const targetTableWidth = Math.max(minimumTableWidth, availableWidth);
        const monthWidth = Math.floor((targetTableWidth - fixedWidth) / 12);
        const tableWidth = fixedWidth + (monthWidth * 12);
        widths.push(...Array(12).fill(monthWidth), GridRenderer.ACTION_COLUMN_WIDTH);
        const colGroup = document.createElement("colgroup");
        widths.forEach(width => {
            const col = document.createElement("col");
            col.style.width = `${width}px`;
            colGroup.appendChild(col);
        });
        this._table.style.width = `${tableWidth}px`;
        this._table.style.minWidth = `${tableWidth}px`;
        this._table.style.setProperty("--pcf-month-width", `${monthWidth}px`);
        this._table.insertBefore(colGroup, this._thead);
    }
    /**
     * Builds the two sticky header rows:
     *  Row 1 — cluster timeline: pills ("Cluster N") spanning the month columns covered
     *          by each cluster, driven by the Cluster1Date..Cluster6Date inputs via
     *          DatasetParser.calculateClusterTimeline. The timeline deliberately starts
     *          at the FIRST MONTH column, never above Total Costs/Planned/Actual — the
     *          leading th with colspan=precedingColSpan guarantees that offset.
     *  Row 2 — standard column captions, including the per-month three-letter labels
     *          (Jan..Dec, no year — Bug 13304) and the boundary tick classes that draw
     *          the cluster start lines.
     */
    renderHeaders(context, showPlanned, precedingColSpan) {
        this._thead.innerHTML = "";
        // --- Row 1: Cluster Timeline ---
        const timelineRow = document.createElement("tr");
        timelineRow.className = "pcf-timeline-row";
        const leadingTh = document.createElement("th");
        leadingTh.setAttribute("colspan", String(precedingColSpan));
        leadingTh.className = "pcf-timeline-empty";
        timelineRow.appendChild(leadingTh);
        const clusterTimeline = DatasetParser.calculateClusterTimeline(context);
        const clusterSpans = clusterTimeline.spans;
        clusterSpans.forEach(span => {
            const th = document.createElement("th");
            th.setAttribute("colspan", String(span.length));
            th.className = "pcf-timeline-cell";
            // clusterIndex 0 = months before the first cluster: they still need a
            // spanning th (to keep column alignment) but get no pill.
            if (span.clusterIndex > 0) {
                const pillContainer = document.createElement("div");
                pillContainer.className = "pcf-cluster-pill-container";
                const pill = document.createElement("div");
                pill.className = "pcf-cluster-pill";
                pill.innerText = `Cluster ${span.clusterIndex}`;
                pillContainer.appendChild(pill);
                th.appendChild(pillContainer);
            }
            timelineRow.appendChild(th);
        });
        // 1 trailing column for the action dots
        const trailingTh = document.createElement("th");
        trailingTh.setAttribute("colspan", "1");
        trailingTh.className = "pcf-timeline-empty";
        timelineRow.appendChild(trailingTh);
        this._thead.appendChild(timelineRow);
        // --- Row 2: Standard Columns ---
        const colHeaderRow = document.createElement("tr");
        colHeaderRow.className = "pcf-header-row";
        const thNumber = document.createElement("th");
        thNumber.innerText = "Number";
        thNumber.className = "pcf-header-number";
        colHeaderRow.appendChild(thNumber);
        const thName = document.createElement("th");
        thName.innerText = "Account Name";
        thName.className = "pcf-header-name";
        colHeaderRow.appendChild(thName);
        const thTotal = document.createElement("th");
        thTotal.innerText = "Total Costs";
        thTotal.className = "pcf-col-num pcf-col-cost";
        colHeaderRow.appendChild(thTotal);
        if (showPlanned) {
            // Column order: "Total Paid" is shown BEFORE "Total Planned".
            const thActual = document.createElement("th");
            thActual.innerText = "Total Paid";
            thActual.className = "pcf-col-num pcf-col-cost";
            colHeaderRow.appendChild(thActual);
            const thPlanned = document.createElement("th");
            // Bug 13280: PBI 13117 names these columns "Total Planned" / "Total Paid"
            // (not "...Cost" / "...Actual Cost").
            thPlanned.innerText = "Total Planned";
            thPlanned.className = "pcf-col-num pcf-col-cost";
            colHeaderRow.appendChild(thPlanned);
        }
        // A month is a "cluster start" when its cluster index differs from the previous
        // month's — those columns get the vertical boundary tick that visually separates
        // clusters in the header. Month 0 is excluded on purpose: the timeline's own
        // start marker (pcf-col-timeline-start) covers it.
        const monthClusterStarts = new Set();
        for (let monthIndex = 1; monthIndex < clusterTimeline.monthClusters.length; monthIndex++) {
            if (clusterTimeline.monthClusters[monthIndex] !== clusterTimeline.monthClusters[monthIndex - 1]) {
                monthClusterStarts.add(monthIndex);
            }
        }
        // 12 Months
        for (let i = 1; i <= 12; i++) {
            const thM = document.createElement("th");
            // Bug 13304: three-letter month abbreviation, no year (the selected year is
            // already shown in the year picker above the grid).
            thM.innerText = GridRenderer.MONTH_ABBREVIATIONS[i - 1];
            thM.className = "pcf-col-num pcf-col-month-header";
            // i is 1-based for the caption; monthClusterStarts is 0-based, hence i - 1.
            if (monthClusterStarts.has(i - 1)) {
                thM.classList.add("pcf-col-month-cluster-start");
            }
            if (i === 12) {
                thM.classList.add("pcf-col-timeline-end");
            }
            if (i === 1) {
                thM.classList.add("pcf-col-timeline-start");
                // The horizontal timeline line is one absolutely-positioned span
                // anchored in the FIRST month header and stretched across all 12 via
                // CSS (--pcf-month-width). Anchoring it here, not in the Total Costs
                // column, is what keeps the line from starting too far left.
                const timelineTrack = document.createElement("span");
                timelineTrack.className = "pcf-timeline-track";
                thM.appendChild(timelineTrack);
            }
            colHeaderRow.appendChild(thM);
        }
        const thActions = document.createElement("th");
        colHeaderRow.appendChild(thActions);
        this._thead.appendChild(colHeaderRow);
    }
    /**
     * Level-0 row. Accounts are aggregate-only: no tree connector lines (they are the
     * roots), no action menu, and their numeric cells are read-only rollups. The
     * +/− toggle only appears when there are subaccounts; otherwise a spacer keeps the
     * number text aligned with toggled rows (a missing spacer was the cause of the old
     * "half-filled number column" look).
     */
    createAccountRow(acc, isCollapsed, showPlanned) {
        const tr = document.createElement("tr");
        tr.className = "pcf-row-account";
        const tdNumber = document.createElement("td");
        tdNumber.className = "pcf-cell-tree pcf-cell-number pcf-cell-tree-account";
        if (acc.subaccounts.length > 0) {
            const btnToggle = document.createElement("button");
            btnToggle.className = `pcf-toggle${isCollapsed ? "" : " pcf-toggle-expanded"}`;
            btnToggle.innerText = isCollapsed ? "+" : "−";
            btnToggle.onclick = () => this.toggleCollapse(acc.id);
            tdNumber.appendChild(btnToggle);
        }
        else {
            const leafSpacer = document.createElement("span");
            leafSpacer.className = "pcf-leaf-spacer";
            tdNumber.appendChild(leafSpacer);
        }
        const numText = document.createTextNode(acc.number);
        tdNumber.appendChild(numText);
        tr.appendChild(tdNumber);
        const tdName = document.createElement("td");
        tdName.className = "pcf-cell-name pcf-cell-name-account";
        tdName.innerText = acc.name;
        tdName.title = acc.name;
        tr.appendChild(tdName);
        this.appendNumericCell(tr, acc.totalCost, "pcf-cell-total pcf-col-cost");
        if (showPlanned) {
            this.appendNumericCell(tr, acc.actualCost, "pcf-cell-total pcf-col-cost");
            this.appendNumericCell(tr, acc.plannedCost, "pcf-cell-total pcf-col-cost");
        }
        acc.months.forEach(val => this.appendNumericCell(tr, val, "pcf-cell-month"));
        const tdActions = document.createElement("td");
        tdActions.className = "pcf-cell-actions";
        tr.appendChild(tdActions);
        return tr;
    }
    /**
     * Level-1 row. FRAGILE tree connector logic:
     * - isLastSubaccount  => "L" branch (line stops here) vs "T" branch (line continues
     *   down to the next sibling). Wrong choice makes the vertical line either stop
     *   early or run past the last subaccount into the following account block.
     * - connectsFromAccountToggle (true only for the FIRST subaccount) adds
     *   pcf-tree-from-toggle, which shortens the connector's top so it meets the parent
     *   account's toggle button instead of intruding into the parent row above —
     *   removing it reintroduces that past regression.
     */
    createSubaccountRow(sub, isCollapsed, showPlanned, isLastSubaccount, connectsFromAccountToggle) {
        const tr = document.createElement("tr");
        tr.className = "pcf-row-sub";
        const tdNumber = document.createElement("td");
        tdNumber.className = "pcf-cell-tree pcf-cell-number pcf-cell-tree-sub";
        // "-toggle" branch variants align the horizontal stub with this row's own
        // toggle button (subaccounts always have one), unlike the plain contract
        // branches further down.
        const vLine = document.createElement("span");
        const branchClass = isLastSubaccount ? "pcf-tree-l-toggle" : "pcf-tree-t-toggle";
        const toggleConnectorClass = connectsFromAccountToggle ? " pcf-tree-from-toggle" : "";
        vLine.className = `pcf-tree-spacer ${branchClass}${toggleConnectorClass}`;
        tdNumber.appendChild(vLine);
        const btnToggle = document.createElement("button");
        btnToggle.className = `pcf-toggle${isCollapsed ? "" : " pcf-toggle-expanded"}`;
        btnToggle.innerText = isCollapsed ? "+" : "−";
        btnToggle.onclick = () => this.toggleCollapse(sub.id);
        tdNumber.appendChild(btnToggle);
        const numText = document.createTextNode(sub.number);
        tdNumber.appendChild(numText);
        tr.appendChild(tdNumber);
        const tdName = document.createElement("td");
        tdName.className = "pcf-cell-name pcf-cell-name-sub";
        tdName.innerText = sub.name;
        tdName.title = sub.name;
        tr.appendChild(tdName);
        this.appendNumericCell(tr, sub.totalCost, "pcf-cell-total pcf-col-cost");
        if (showPlanned) {
            this.appendNumericCell(tr, sub.actualCost, "pcf-cell-total pcf-col-cost");
            this.appendNumericCell(tr, sub.plannedCost, "pcf-cell-total pcf-col-cost");
        }
        sub.months.forEach(val => this.appendNumericCell(tr, val, "pcf-cell-month"));
        const tdActions = document.createElement("td");
        tdActions.className = "pcf-cell-actions";
        tr.appendChild(tdActions);
        return tr;
    }
    /**
     * Level-2 (leaf) row — the only row type with user actions: three-dot menu
     * (ActionDropdown), clickable month cells (paid/unpaid + comments) and comment
     * indicators.
     *
     * FRAGILE tree connectors — two stacked spans in the number cell:
     * - line1: a plain vertical pass-through drawn ONLY while the parent subaccount is
     *   not the last one (the account-level line must keep running behind this row to
     *   reach later subaccount siblings).
     * - line2: this contract's own branch — "L" for the last contract, "T" otherwise;
     *   pcf-tree-from-toggle on the first contract trims the top so the line meets the
     *   subaccount's toggle rather than poking into the row above (past regression).
     *
     * pcf-row-standard turns the row text blue for IsStandardContract rows.
     */
    createContractRow(contract, showPlanned, isLastSubaccount, connectsFromSubaccountToggle, isLastContract, startYear) {
        const tr = document.createElement("tr");
        tr.className = `pcf-row-contract${contract.isStandardContract ? " pcf-row-standard" : ""}`;
        // BUG 13888: action-menu indicators must represent ANY comment attached to
        // the contract. Keep contract.hasComments unchanged so the name-cell dot and
        // its tooltip continue to represent general contract comments only.
        const hasAnyComments = contract.hasComments
            || contract.monthHasComments?.some(Boolean) === true
            || contract.monthCommentTooltips?.some(tooltip => tooltip.trim().length > 0) === true;
        const tdNumber = document.createElement("td");
        tdNumber.className = "pcf-cell-tree pcf-cell-number pcf-cell-tree-contract";
        // Column 1 of the connector: only draw the account-level vertical line when more
        // subaccounts follow below; for the last subaccount the slot must stay blank or
        // the line "leaks" past the end of the account block.
        const line1 = document.createElement("span");
        line1.className = `pcf-tree-spacer${isLastSubaccount ? "" : " pcf-tree-v"}`;
        tdNumber.appendChild(line1);
        // Column 2: this contract's own T/L branch (see method JSDoc).
        const line2 = document.createElement("span");
        const contractBranchClass = isLastContract ? "pcf-tree-l" : "pcf-tree-t";
        line2.className = `pcf-tree-spacer ${contractBranchClass}${connectsFromSubaccountToggle ? " pcf-tree-from-toggle" : ""}`;
        tdNumber.appendChild(line2);
        // Leaf spacer substitutes for the toggle button contracts don't have, keeping
        // the number column's indentation consistent across all three levels.
        const leafSpacer = document.createElement("span");
        leafSpacer.className = "pcf-leaf-spacer";
        tdNumber.appendChild(leafSpacer);
        tr.appendChild(tdNumber);
        const tdName = document.createElement("td");
        tdName.className = "pcf-cell-name pcf-cell-name-contract";
        tdName.title = contract.name;
        const nameContainer = document.createElement("div");
        nameContainer.className = "pcf-name-block";
        const nameLine = document.createElement("div");
        nameLine.className = "pcf-name-line";
        const mainName = document.createElement("span");
        mainName.className = `pcf-name-main${contract.isStandardContract ? " pcf-contract-standard" : ""}`;
        mainName.innerText = contract.name;
        mainName.title = contract.name;
        nameLine.appendChild(mainName);
        // HasComments => red dot beside the contract name; hover/focus shows the
        // floating tooltip (CommentTooltip text) — see createCommentDot for why this
        // dot uses a body-mounted tooltip instead of the CSS one.
        if (contract.hasComments) {
            nameLine.appendChild(this.createCommentDot("pcf-name-dot", contract.commentTooltip));
        }
        nameContainer.appendChild(nameLine);
        if (contract.subLabel) {
            const subLabelSpan = document.createElement("span");
            subLabelSpan.className = "pcf-name-sub";
            // Extract tags like [SPV], [DEVCO] from subLabel
            // The tag gets its own span (pcf-meta-tag-spv / pcf-meta-tag-devco) so CSS
            // can colour DevCo vs SPV differently; the remainder renders as plain text.
            const tagMatch = contract.subLabel.match(/\[([^\]]+)\]/);
            const tag = tagMatch ? tagMatch[1] : "";
            const description = contract.subLabel.replace(/\[\w+\]/, "").trim();
            if (tag) {
                const tagSpan = document.createElement("span");
                tagSpan.className = `pcf-meta-tag pcf-meta-tag-${tag.toLowerCase()}`;
                tagSpan.innerText = `[${tag}]`;
                subLabelSpan.appendChild(tagSpan);
                if (description) {
                    subLabelSpan.appendChild(document.createTextNode(` ${description}`));
                }
            }
            else {
                subLabelSpan.innerText = contract.subLabel;
            }
            nameContainer.appendChild(subLabelSpan);
        }
        tdName.appendChild(nameContainer);
        tr.appendChild(tdName);
        this.appendNumericCell(tr, contract.totalCost, "pcf-cell-total pcf-col-cost" + (this.isContractFullyPaid(contract) ? " pcf-cell-total-paid" : ""));
        if (showPlanned) {
            this.appendNumericCell(tr, contract.actualCost, "pcf-cell-total pcf-col-cost");
            this.appendNumericCell(tr, contract.plannedCost, "pcf-cell-total pcf-col-cost");
        }
        contract.months.forEach((val, monthIndex) => this.appendContractMonthCell(tr, contract, val, monthIndex, startYear));
        const tdActions = document.createElement("td");
        tdActions.className = "pcf-cell-actions pcf-col-actions";
        const btnActions = document.createElement("button");
        btnActions.className = "pcf-dots-btn";
        btnActions.innerHTML = "&bull;&bull;&bull;";
        // Small badge on the three-dot button is shown for either a general comment
        // or at least one monthly cost-cell comment.
        if (hasAnyComments) {
            const dot = document.createElement("span");
            dot.className = "pcf-dot-badge";
            btnActions.appendChild(dot);
        }
        btnActions.onclick = (e) => {
            e.stopPropagation();
            // Only one popup may be open at a time — close our own dropdowns before
            // delegating to ActionDropdown (which fires Edit/Delete/Comment actions).
            this.closeAddDropdown();
            this.closeMonthDropdown();
            this._actionDropdown.show(e, contract.id, hasAnyComments);
        };
        tdActions.appendChild(btnActions);
        tr.appendChild(tdActions);
        return tr;
    }
    /**
     * The "Add" pseudo-row appended after a subaccount's contracts. FRAGILE connectors:
     * line1 mirrors the contract rows (account line passes through only when more
     * subaccounts follow), but line2 is INTENTIONALLY a bare spacer with no branch
     * class — the subaccount's contract connector must terminate at the last real
     * contract; letting it continue into this Add row was a past regression.
     */
    createAddRow(subaccount, showPlanned, isLastSubaccount) {
        const tr = document.createElement("tr");
        tr.className = "pcf-row-add";
        const tdNumber = document.createElement("td");
        tdNumber.className = "pcf-cell-tree pcf-cell-number pcf-cell-tree-add";
        const line1 = document.createElement("span");
        line1.className = `pcf-tree-spacer${isLastSubaccount ? "" : " pcf-tree-v"}`;
        tdNumber.appendChild(line1);
        // No pcf-tree-v / branch class on purpose — see method JSDoc.
        const line2 = document.createElement("span");
        line2.className = "pcf-tree-spacer";
        tdNumber.appendChild(line2);
        const leafSpacer = document.createElement("span");
        leafSpacer.className = "pcf-leaf-spacer";
        tdNumber.appendChild(leafSpacer);
        tr.appendChild(tdNumber);
        const tdContent = document.createElement("td");
        tdContent.className = "pcf-cell-name pcf-cell-name-add";
        const btnAdd = document.createElement("button");
        btnAdd.className = "pcf-add-btn pcf-add-menu-btn";
        btnAdd.innerHTML = `<span class="pcf-add-menu-dots">&bull;&bull;&bull;</span><span>Add</span>`;
        btnAdd.onclick = (e) => {
            e.stopPropagation();
            this.showAddDropdown(e, subaccount);
        };
        tdContent.appendChild(btnAdd);
        tr.appendChild(tdContent);
        // Pad with empty cells (Total + optional Planned/Actual + 12 months + actions)
        // instead of a colspan so the column borders stay continuous through this row.
        const remainingCols = 1 + (showPlanned ? 2 : 0) + 12 + 1;
        for (let i = 0; i < remainingCols; i++) {
            const tdEmpty = document.createElement("td");
            tr.appendChild(tdEmpty);
        }
        return tr;
    }
    /**
     * Footer row appended LAST into tbody (not tfoot) so syncGrandTotalSpacer can
     * insert its filler row directly before it; CSS makes it sticky at the bottom of
     * the scroll wrapper. Totals were accumulated in render() from the filtered tree.
     */
    renderGrandTotal(grandTotalCost, grandPlannedCost, grandActualCost, grandMonthlyTotals, showPlanned) {
        const trGrand = document.createElement("tr");
        trGrand.className = "pcf-row-grand";
        const tdGrandLabel1 = document.createElement("td");
        tdGrandLabel1.className = "pcf-grand-label";
        tdGrandLabel1.innerText = "Grand Total";
        tdGrandLabel1.setAttribute("colspan", "2");
        trGrand.appendChild(tdGrandLabel1);
        this.appendNumericCell(trGrand, grandTotalCost, "pcf-cell-total pcf-col-cost");
        if (showPlanned) {
            this.appendNumericCell(trGrand, grandActualCost, "pcf-cell-total pcf-col-cost");
            this.appendNumericCell(trGrand, grandPlannedCost, "pcf-cell-total pcf-col-cost");
        }
        grandMonthlyTotals.forEach(val => this.appendNumericCell(trGrand, val, "pcf-cell-month"));
        const tdGrandActions = document.createElement("td");
        tdGrandActions.className = "pcf-cell-actions";
        trGrand.appendChild(tdGrandActions);
        this._tbody.appendChild(trGrand);
    }
    /** Thin visual breathing-space row between two expanded account blocks. */
    createGroupGapRow(colSpan) {
        const tr = document.createElement("tr");
        tr.className = "pcf-row-gap";
        const td = document.createElement("td");
        td.colSpan = colSpan;
        tr.appendChild(td);
        return tr;
    }
    /**
     * Plain (non-interactive) numeric cell used by account/subaccount/grand-total rows.
     * Zero/null/NaN render as a styled "-" dash — business preference: an empty-looking
     * grid is easier to scan than a wall of zeros.
     */
    /**
     * Bug 13453: a CONTRACT row's Total Costs cell turns green when Total Cost
     * equals Total Paid (actualCost) - i.e. the contract is fully paid. Compares
     * the all-years totals (not the selected-year monthPaid flags) so a contract
     * with costs across multiple years only greens when EVERY year is paid.
     * Epsilon absorbs cent-level float noise so exact equality still matches.
     */
    isContractFullyPaid(contract) {
        return contract.totalCost > 0 && Math.abs(contract.totalCost - contract.actualCost) < 0.005;
    }
    appendNumericCell(tr, val, className = "") {
        const td = document.createElement("td");
        td.className = `pcf-col-num ${className}`.trim();
        if (val === null || val === undefined || isNaN(val) || val === 0) {
            td.innerText = "-";
            td.classList.add("pcf-val-dash");
        }
        else {
            td.innerText = this.formatCostValue(val);
        }
        tr.appendChild(td);
    }
    /**
     * Interactive month cell on contract rows. Combines:
     * - MxPaid flag => green (paid) / default (unpaid) background classes; paid cells
     *   also get a native "Paid Cost" hover tooltip (Bug 13284);
     * - MxHasComments / MxCommentTooltip => red dot + CSS data-tooltip;
     * - click / Enter / Space => paid-unpaid dropdown (showMonthActionDropdown).
     * Cells with no cost ("-") are intentionally NOT clickable — there is nothing to
     * mark paid — but they still render a comment dot if Canvas flags one.
     */
    appendContractMonthCell(tr, contract, val, monthIndex, startYear) {
        const td = document.createElement("td");
        td.className = "pcf-col-num pcf-cell-month pcf-contract-month-cell";
        const monthCommentTooltip = contract.monthCommentTooltips?.[monthIndex] || "";
        // Tooltip text alone also counts as "has comments" — guards against Canvas
        // sending MxCommentTooltip without setting the MxHasComments flag.
        const hasMonthComments = contract.monthHasComments?.[monthIndex] || monthCommentTooltip.length > 0;
        if (val === null || val === undefined || isNaN(val) || val === 0) {
            this.setMonthCellContent(td, "-", hasMonthComments, monthCommentTooltip);
            td.classList.add("pcf-val-dash");
            tr.appendChild(td);
            return;
        }
        this.setMonthCellContent(td, this.formatCostValue(val), hasMonthComments, monthCommentTooltip);
        const isPaid = contract.monthPaid?.[monthIndex] || false;
        if (isPaid) {
            td.classList.add("pcf-paid-cell");
            // Bug 13284: hovering a paid (green) cost cell shows a "Paid Cost" tooltip.
            td.title = "Paid Cost";
        }
        else {
            td.classList.add("pcf-unpaid-cell");
        }
        // Keyboard accessibility: the td acts as a button (tab focus + Enter/Space),
        // required because Canvas users may operate the grid without a mouse.
        td.tabIndex = 0;
        td.setAttribute("role", "button");
        td.setAttribute("aria-label", `${this.formatCostValue(val)}. Click to ${isPaid ? "set as unpaid" : "set as paid"}.`);
        td.onclick = (e) => {
            e.stopPropagation();
            this.showMonthActionDropdown(e, contract, monthIndex, startYear, isPaid, td);
        };
        td.onkeydown = (e) => {
            if (e.key !== "Enter" && e.key !== " ") {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this.showMonthActionDropdown(e, contract, monthIndex, startYear, isPaid, td);
        };
        tr.appendChild(td);
    }
    /**
     * Writes a month cell's value + optional comment dot. The value gets its own span
     * (pcf-month-value) so CSS can position the dot relative to the number without
     * disturbing the cell's right-aligned layout.
     */
    setMonthCellContent(td, value, hasComments, commentTooltip) {
        const valueSpan = document.createElement("span");
        valueSpan.className = "pcf-month-value";
        valueSpan.innerText = value;
        td.appendChild(valueSpan);
        if (hasComments) {
            td.appendChild(this.createCommentDot("pcf-month-comment-dot", commentTooltip));
        }
    }
    /**
     * Red comment-indicator dot, in two tooltip flavours:
     * - name-cell dots ("pcf-name-dot") use the JS floating tooltip on document.body
     *   (see inline note below — the name cell clips overflow for its ellipsis);
     * - month-cell dots use the cheaper pure-CSS data-tooltip, which is safe there
     *   because month cells don't clip.
     * The dot swallows clicks so hovering users don't accidentally open the
     * paid/unpaid dropdown of the underlying month cell.
     */
    createCommentDot(className, commentTooltip) {
        const dot = document.createElement("span");
        dot.className = `${className} pcf-comment-dot`;
        const tooltipText = this.formatCommentTooltip(commentTooltip);
        if (tooltipText) {
            dot.setAttribute("aria-label", tooltipText);
            dot.tabIndex = 0;
            if (className === "pcf-name-dot") {
                // The name cell clips overflow for the ellipsis, so a CSS tooltip would be
                // cut off; float this one on document.body like the dropdowns.
                dot.title = "";
                dot.onmouseenter = () => this.showCommentTooltip(dot, tooltipText);
                dot.onmouseleave = () => this.hideCommentTooltip();
                dot.onfocus = () => this.showCommentTooltip(dot, tooltipText);
                dot.onblur = () => this.hideCommentTooltip();
            }
            else {
                dot.setAttribute("data-tooltip", tooltipText);
            }
        }
        dot.onclick = (e) => e.stopPropagation();
        return dot;
    }
    /**
     * Dark floating tooltip for the contract-name comment dot. Mounted on
     * document.body to escape the name cell's overflow clipping; positioned centered
     * above the dot, clamped to the viewport, and FLIPPED BELOW when there is no room
     * above. render() calls hideCommentTooltip so it never outlives its anchor.
     */
    showCommentTooltip(anchor, text) {
        // Only one tooltip at a time — a stale one would never get a mouseleave.
        this.hideCommentTooltip();
        const tooltip = document.createElement("div");
        tooltip.className = "pcf-comment-tooltip-floating";
        tooltip.innerText = text;
        document.body.appendChild(tooltip);
        // Measure AFTER appending (offsetWidth/Height are 0 before layout), then clamp
        // horizontally and flip below the anchor when the space above is insufficient.
        const rect = anchor.getBoundingClientRect();
        const viewportPadding = 8;
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const left = Math.max(viewportPadding, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - viewportPadding));
        const top = rect.top - height - 8 >= viewportPadding
            ? rect.top - height - 8
            : rect.bottom + 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        this._commentTooltipElement = tooltip;
    }
    /** Removes the floating tooltip; called on mouseleave/blur AND on every render()
     *  so a re-render can't strand a tooltip whose anchor no longer exists. */
    hideCommentTooltip() {
        if (this._commentTooltipElement?.parentNode) {
            this._commentTooltipElement.parentNode.removeChild(this._commentTooltipElement);
        }
        this._commentTooltipElement = null;
    }
    /** Normalises tooltip text to always lead with "Comment:" without doubling the
     *  prefix when Canvas already included it in CommentTooltip/MxCommentTooltip. */
    formatCommentTooltip(commentTooltip) {
        const text = (commentTooltip || "").trim();
        if (!text) {
            return "";
        }
        return text.toLowerCase().startsWith("comment:") ? text : `Comment:\n${text}`;
    }
    /** Inline SVG (speech bubble) for the month dropdown's "Comments" item — inlined
     *  rather than an asset so the PCF bundle stays self-contained. */
    getCommentActionIcon() {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4.5 5.25h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11.5l-4 3.5v-3.5h-3a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5z"/>
                <path d="M7.25 9.25h9.5"/>
                <path d="M7.25 12.75h6.5"/>
            </svg>`;
    }
    /** Inline SVG (banknote) for the "Set as paid/unpaid" dropdown item. */
    getPaidActionIcon() {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3.75 7.25h16.5v9.5H3.75z"/>
                <path d="M6.75 7.25a3 3 0 0 1-3 3"/>
                <path d="M20.25 10.25a3 3 0 0 1-3-3"/>
                <path d="M3.75 13.75a3 3 0 0 1 3 3"/>
                <path d="M17.25 16.75a3 3 0 0 1 3-3"/>
                <circle cx="12" cy="12" r="2.35"/>
            </svg>`;
    }
    /**
     * Dropdown for the per-subaccount "Add" button. Item rules (business-agreed):
     * - "Add New Cost" is always present (fires the "Add" action).
     * - Standard contracts, depending on how many options this subaccount has:
     *     >1  => "Add Standard Contract" parent item with a hover submenu, one entry
     *            per option (each fires "AddStandardContract" with that option's id);
     *     ==1 => a single direct item, no submenu (saves a click);
     *     0   => NO standard item at all. An earlier design wanted a disabled item
     *            here instead — intentionally NOT implemented, do not "restore" it.
     * Appended to document.body so the scroll container can't clip it; flips above the
     * button when there is no room below.
     */
    showAddDropdown(e, subaccount) {
        const target = e.currentTarget;
        // Toggle: re-clicking the button that owns the open menu closes it instead of
        // reopening (the button's onclick stops propagation, so the window light-dismiss
        // never fires for it — this is the sole toggle point).
        if (this._addDropdownElement && this._activeAddMenuButton === target) {
            this.closeAddDropdown();
            return;
        }
        // Enforce the single-open-popup rule across all three menu types.
        this.closeAddDropdown();
        this.closeMonthDropdown();
        this._actionDropdown.closeDropdown();
        const rect = target.getBoundingClientRect();
        const standardContracts = subaccount.standardContractOptions;
        const dropdown = document.createElement("div");
        dropdown.className = "pcf-add-dropdown open";
        const addNewCostButton = this.createAddDropdownButton("add", "Add New Cost", false, () => {
            this._onActionTriggered("Add", subaccount.id);
            this.closeAddDropdown();
        });
        dropdown.appendChild(addNewCostButton);
        if (standardContracts.length > 1) {
            const wrapper = document.createElement("div");
            wrapper.className = "pcf-add-dropdown-item-wrap";
            const standardButton = this.createAddDropdownButton("standard", "Add Standard Contract", false);
            standardButton.classList.add("pcf-add-dropdown-parent");
            wrapper.appendChild(standardButton);
            const subMenu = document.createElement("div");
            subMenu.className = "pcf-add-submenu";
            standardContracts.forEach(option => {
                subMenu.appendChild(this.createAddDropdownButton("standard", option.name, false, () => {
                    this._onActionTriggered("AddStandardContract", subaccount.id, option.id);
                    this.closeAddDropdown();
                }));
            });
            wrapper.appendChild(subMenu);
            dropdown.appendChild(wrapper);
        }
        else if (standardContracts.length === 1) {
            const option = standardContracts[0];
            dropdown.appendChild(this.createAddDropdownButton("standard", "Add Standard Contract", false, () => {
                this._onActionTriggered("AddStandardContract", subaccount.id, option.id);
                this.closeAddDropdown();
            }));
        }
        document.body.appendChild(dropdown);
        this._addDropdownElement = dropdown;
        // Blue "active" highlight on the Add button while its menu is open.
        this._activeAddMenuButton = target;
        target.classList.add("pcf-add-menu-btn-active");
        // Position after mounting (sizes are 0 until layout); prefer below the button,
        // flip above when it would overflow the bottom of the viewport.
        const menuWidth = dropdown.offsetWidth;
        const menuHeight = dropdown.offsetHeight;
        const viewportPadding = 8;
        const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding));
        const preferredTop = rect.bottom + 4;
        const top = preferredTop + menuHeight <= window.innerHeight - viewportPadding
            ? preferredTop
            : Math.max(viewportPadding, rect.top - menuHeight - 4);
        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;
        // Window-level listener implements light-dismiss (click anywhere else closes).
        window.addEventListener("click", this._boundAddDropdownWindowClick);
    }
    /**
     * Shared factory for Add-dropdown items. `onClick` is optional because the submenu
     * parent item is hover-only; the `disabled` flag is currently always false but kept
     * for the (shelved) disabled-standard-item design mentioned in showAddDropdown.
     */
    createAddDropdownButton(icon, label, disabled, onClick) {
        const button = document.createElement("button");
        button.className = "pcf-add-dropdown-item";
        button.disabled = disabled;
        button.innerHTML = `<span class="pcf-add-dropdown-icon">${this.getAddDropdownIcon(icon)}</span><span>${label}</span>`;
        if (onClick) {
            button.onclick = (e) => {
                e.stopPropagation();
                onClick();
            };
        }
        return button;
    }
    /** Inline SVGs for the Add dropdown: plus sign vs document-with-$ (standard contract). */
    getAddDropdownIcon(icon) {
        if (icon === "add") {
            return `
                <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M10 3.5a.5.5 0 0 1 .5.5v5.5H16a.5.5 0 0 1 0 1h-5.5V16a.5.5 0 0 1-1 0v-5.5H4a.5.5 0 0 1 0-1h5.5V4a.5.5 0 0 1 .5-.5z"/>
                </svg>`;
        }
        return `
            <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.5 2A1.5 1.5 0 0 0 4 3.5v13A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5V7.25a1.5 1.5 0 0 0-.44-1.06l-3.75-3.75A1.5 1.5 0 0 0 10.75 2h-5zM5 3.5a.5.5 0 0 1 .5-.5H10v3.5A1.5 1.5 0 0 0 11.5 8H15v8.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-13zm6 0L14.5 7h-3a.5.5 0 0 1-.5-.5v-3z"/>
                <path d="M8.25 9.25h3.25a.5.5 0 0 1 0 1H8.25a1.25 1.25 0 0 0 0 2.5h2.5a2.25 2.25 0 0 1 0 4.5H7.5a.5.5 0 0 1 0-1h3.25a1.25 1.25 0 0 0 0-2.5h-2.5a2.25 2.25 0 0 1 0-4.5z"/>
            </svg>`;
    }
    /**
     * Light-dismiss handler for the Add dropdown. Clicks on the Add button itself or
     * inside the menu are ignored so the button's own onclick (which re-opens) and the
     * submenu hover interactions don't fight with this close path.
     */
    handleAddDropdownWindowClick(e) {
        const target = e.target;
        if (target.closest(".pcf-add-menu-btn") || target.closest(".pcf-add-dropdown")) {
            return;
        }
        this.closeAddDropdown();
    }
    /** Tears down the Add dropdown AND its window listener — both must go together or
     *  the stale listener keeps firing on every click for the control's lifetime. */
    closeAddDropdown() {
        window.removeEventListener("click", this._boundAddDropdownWindowClick);
        if (this._addDropdownElement?.parentNode) {
            this._addDropdownElement.parentNode.removeChild(this._addDropdownElement);
        }
        this._addDropdownElement = null;
        // Drop the blue highlight from the Add button the menu was open for.
        if (this._activeAddMenuButton) {
            this._activeAddMenuButton.classList.remove("pcf-add-menu-btn-active");
            this._activeAddMenuButton = null;
        }
    }
    /**
     * Month-cell dropdown ("Set as paid/unpaid" + "Comments").
     * - Cluster/equal-distributed contracts (isEqualDistribution): the paid toggle is
     *   shown but DISABLED with an info icon + tooltip — business rule says such costs
     *   cannot be marked paid per-month because their amounts are derived, not entered.
     *   The disabled item still renders (instead of being hidden) so users learn WHY.
     * - "Comments" appears only when the paid action is enabled and deliberately fires
     *   the SAME "Comment" action as the contract row's three-dot menu — Canvas opens
     *   one shared comment dialog for both entry points.
     * Mounted on document.body for the same clipping reasons as the Add dropdown.
     */
    showMonthActionDropdown(e, contract, monthIndex, startYear, isPaid, td) {
        // Toggle (Bug 13292): clicking the cell that already owns the open dropdown
        // closes it instead of closing-then-reopening. Must run BEFORE closeMonthDropdown
        // (which clears _activeMonthCell), and the window light-dismiss intentionally
        // ignores month-cell clicks so this handler is the sole toggle point.
        if (this._monthDropdownElement && this._activeMonthCell === td) {
            this.closeMonthDropdown();
            return;
        }
        this.closeAddDropdown();
        this.closeMonthDropdown();
        this._actionDropdown.closeDropdown();
        // Highlight the clicked cell while its menu is open; closeMonthDropdown removes it.
        this._activeMonthCell = td;
        td.classList.add("active");
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        const dropdown = document.createElement("div");
        dropdown.className = "pcf-month-dropdown open";
        const isCluster = this.isEqualDistribution(contract.distributionType);
        const targetPaidState = !isPaid;
        if (isCluster) {
            // Finalized requirement (equal distribution by cluster OR by start/end
            // date): month cells offer NO actions - these costs are machine-
            // generated, so they can be neither marked paid nor given payment-date
            // comments. Clicking a cell shows only this message; the "Set as paid"
            // button and the Comments item are intentionally not rendered.
            dropdown.classList.add("pcf-month-dropdown--info");
            const message = document.createElement("div");
            message.className = "pcf-month-dropdown-message";
            message.innerText = "Automatically distributed costs cannot be marked as paid or assigned payment date comments.";
            dropdown.appendChild(message);
        }
        else {
            const actionButton = document.createElement("button");
            actionButton.className = "pcf-dropdown-item pcf-month-dropdown-item";
            actionButton.innerHTML = `
                <span class="pcf-paid-action-icon">${this.getPaidActionIcon()}</span>
                <span>${isPaid ? "Set as unpaid" : "Set as paid"}</span>
            `;
            actionButton.onclick = (ev) => {
                ev.stopPropagation();
                this.closeMonthDropdown();
                // month is converted to 1-based here because Canvas expects
                // SelectedCostMonth as the human month number (1..12).
                this._onActionTriggered("SetCostPaidUnpaid", contract.id, "", {
                    year: startYear,
                    month: monthIndex + 1,
                    paid: targetPaidState
                });
            };
            dropdown.appendChild(actionButton);
            const commentButton = document.createElement("button");
            commentButton.className = "pcf-dropdown-item pcf-month-dropdown-item";
            commentButton.innerHTML = `
                <span class="pcf-paid-action-icon">${this.getCommentActionIcon()}</span>
                <span>Comments</span>
            `;
            commentButton.onclick = (ev) => {
                ev.stopPropagation();
                this.closeMonthDropdown();
                this._onActionTriggered("Comment", contract.id);
            };
            dropdown.appendChild(commentButton);
        }
        document.body.appendChild(dropdown);
        this._monthDropdownElement = dropdown;
        const menuWidth = dropdown.offsetWidth;
        const menuHeight = dropdown.offsetHeight;
        const viewportPadding = 8;
        const left = Math.max(viewportPadding, Math.min(rect.left + rect.width / 2 - menuWidth / 2, window.innerWidth - menuWidth - viewportPadding));
        const preferredTop = rect.bottom + 4;
        const top = preferredTop + menuHeight <= window.innerHeight - viewportPadding
            ? preferredTop
            : Math.max(viewportPadding, rect.top - menuHeight - 4);
        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;
        window.addEventListener("click", this._boundMonthDropdownWindowClick);
    }
    /**
     * Detects cluster/equal-distribution contracts whose months must not be marked
     * paid. DELIBERATELY broad: strips all punctuation/whitespace and substring-matches
     * "equal"/"cluster"/"distributed" because the DistributionType text differs across
     * environments and legacy rows ("Equal Distribution", "Cluster-distributed", ...).
     * Tightening this to exact matches would silently re-enable the paid toggle for
     * some legacy spellings.
     */
    isEqualDistribution(distributionType) {
        const normalized = (distributionType || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return normalized.includes("equal")
            || normalized.includes("cluster")
            || normalized.includes("distributed");
    }
    /**
     * Light-dismiss for the month dropdown. Clicks on month cells are excluded because
     * the cell's own onclick already closes the old menu and opens the new one —
     * closing here as well would cancel that reopen.
     */
    handleMonthDropdownWindowClick(e) {
        const target = e.target;
        if (target.closest(".pcf-month-dropdown") || target.closest(".pcf-contract-month-cell")) {
            return;
        }
        this.closeMonthDropdown();
    }
    /** Tears down the month dropdown, its window listener, and the active-cell
     *  highlight — all three must be cleaned together to avoid stale UI state. */
    closeMonthDropdown() {
        window.removeEventListener("click", this._boundMonthDropdownWindowClick);
        if (this._monthDropdownElement?.parentNode) {
            this._monthDropdownElement.parentNode.removeChild(this._monthDropdownElement);
        }
        this._monthDropdownElement = null;
        if (this._activeMonthCell) {
            this._activeMonthCell.classList.remove("active");
            this._activeMonthCell = null;
        }
    }
    /**
     * Formats costs with the BROWSER's locale, not a hard-coded one, so English users
     * see "1,000" and German users see "1.000" — an explicit requirement for this
     * mixed-locale customer. navigator.languages is preferred (full preference list);
     * single navigator.language is the fallback for older WebViews.
     */
    formatCostValue(value) {
        const browserLocales = navigator.languages && navigator.languages.length > 0
            ? navigator.languages
            : [navigator.language];
        return new Intl.NumberFormat(browserLocales, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3
        }).format(value);
    }
    /**
     * Expand/collapse for account and subaccount rows. Mutates the SHARED collapse set
     * (owned by index.ts) and then asks index.ts to re-render via the PCF_RE_RENDER
     * custom event rather than calling render() directly — the renderer has no access
     * to the latest PCF context, and letting index.ts orchestrate keeps a single render
     * path for both host updates and internal UI state changes.
     */
    toggleCollapse(id) {
        // Set holds EXPANDED ids: present => currently expanded, so collapse it;
        // absent => currently collapsed, so expand it.
        if (this._expandedRowIds.has(id)) {
            this._expandedRowIds.delete(id);
        }
        else {
            this._expandedRowIds.add(id);
        }
        // Dispatching a custom event lets the main class orchestrate the re-render safely
        const event = new CustomEvent("PCF_RE_RENDER");
        this._container.dispatchEvent(event);
    }
    /** Placeholder while the Canvas dataset is still loading; clears the header too so
     *  stale column captions from a previous render don't sit above the message. */
    renderLoading() {
        this._thead.innerHTML = "";
        this._tbody.innerHTML = `
            <tr>
                <td colspan="100%">
                    <div style="text-align:center; padding: 40px; color: #9ca3af; font-style:italic;">
                        Loading project budget...
                    </div>
                </td>
            </tr>
        `;
    }
    /** Shown only when even the test fallback yields nothing (or filters removed
     *  everything) — points the maker at the missing collection binding. */
    renderEmptyState(colSpan) {
        this._tbody.innerHTML = `
            <tr>
                <td colspan="${colSpan}">
                    <div class="pcf-loading-state">
                        <div class="pcf-spinner" role="status" aria-label="Loading data"></div>
                        <div>Loading data…</div>
                    </div>
                </td>
            </tr>
        `;
    }
    /**
     * Called from index.ts destroy(). Critical because the dropdowns live on
     * document.body and their dismiss listeners hang off window — without this they
     * would outlive the control when the user navigates away from the Canvas screen.
     */
    destroy() {
        this.closeAddDropdown();
        this.closeMonthDropdown();
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }
}
