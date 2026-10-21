/**
 * =============================================================================
 * GridModels.ts — view models for the DevexCapexSummaryPCF grid
 * =============================================================================
 * These interfaces describe the Account -> Subaccount -> Contract hierarchy as
 * the RENDERER needs it, not as Dataverse stores it. The Canvas App flattens
 * its data into the bound datasets (`colFinatCostDataOptimized` ->
 * DevexCapexCostSummary, `colStandardContractOptionsForPCF` ->
 * StandardContractOptions); mapping code rebuilds this tree so the renderer
 * stays free of dataset/column-name knowledge.
 *
 * KEY DATA CONVENTION (worth repeating everywhere): `months[]` holds ONLY the
 * currently selected year's values, while totalCost/plannedCost/actualCost are
 * ALL-YEARS totals computed by the Canvas App. The totals must therefore never
 * be re-derived by summing `months[]` — that would silently drop every other
 * year's costs.
 * =============================================================================
 */

/**
 * Leaf row of the hierarchy: a single contract under a subaccount.
 * Carries everything the renderer needs to draw the row, its 12 month cells,
 * the paid (green) highlighting and the comment red-dot indicators.
 */
export interface ContractData {
    // Dataverse record id; echoed back to Canvas as SelectedRecordId so the
    // OnChange formula can locate the record — the PCF itself never uses it
    // for data access (no Dataverse calls allowed in the control).
    id: string;
    // Owning subaccount's id; needed because rows arrive flattened from
    // Canvas and the tree is reassembled inside the control.
    parentId: string;
    number: string;
    name: string;
    // Secondary display line under the contract name (e.g. "[SPV] Link to
    // Milestone Cluster 1"); also the raw source from which costPaidBy is
    // derived, hence kept verbatim for display fidelity.
    subLabel: string;
    // Normalized payer ("DevCo" / "SPV" / ""). Stored separately from
    // subLabel so the DevCo/SPV screen filter compares a clean value instead
    // of re-parsing free text on every filter pass.
    costPaidBy: string;
    // ALL-YEARS totals supplied by Canvas — NOT the sum of months[] below,
    // which covers only the selected year. Keeping them as inputs (instead of
    // deriving them) is what lets the grid show lifetime figures while
    // displaying a single year's monthly breakdown.
    totalCost: number;
    plannedCost: number;
    actualCost: number;
    // Contract-level comment indicator: drives the red dot on the row and the
    // matching badge inside the action dropdown, telling the user there is
    // something to read BEFORE they open the Comments dialog.
    hasComments: boolean;
    // Hover text for that red dot — a preview so users can triage comments
    // without round-tripping to the Canvas comments screen.
    commentTooltip: string;
    // True = row rendered with the blue "standard contract" styling; standard
    // contracts follow centrally managed terms, and the visual distinction
    // warns users that some per-contract actions behave differently.
    isStandardContract: boolean;
    // Cost distribution mode (e.g. "Equal Distribution", "Cluster-distributed",
    // "Individual Distribution"). Equal/Cluster contracts have their monthly
    // values machine-generated, so the per-month paid/unpaid action is
    // DISABLED for them — marking one generated cell paid would be meaningless.
    distributionType: string;
    // Selected-year monthly values, index 0 = M1 (January) ... index 11 = M12.
    // Always length 12; missing months come through as 0 so the renderer can
    // index blindly without bounds checks.
    months: number[];
    // Per-month paid flags (index-aligned with months[]); a true entry renders
    // the cell green so finance can see at a glance what is already settled.
    monthPaid: boolean[];
    // Per-month comment indicators (index-aligned): red dot on the individual
    // month cell, distinct from the contract-level hasComments above because a
    // remark may apply to one month's figure only.
    monthHasComments: boolean[];
    // Hover previews for the month-cell red dots (index-aligned).
    monthCommentTooltips: string[];
}

/**
 * One entry of the "add standard contract" picker shown on a subaccount row.
 * Sourced from the StandardContractOptions dataset (Canvas collection
 * `colStandardContractOptionsForPCF`). Only id + name are needed because the
 * PCF merely reports the chosen id back (SelectedStandardContractId); Canvas
 * owns the actual creation logic and looks up the full record itself.
 */
export interface StandardContractOption {
    id: string;
    name: string;
}

/**
 * Middle level of the hierarchy: a subaccount grouping contracts under an
 * account. Its cost figures are AGGREGATES delivered ready-made by the Canvas
 * App (same convention as ContractData: months[] = selected year only;
 * totalCost/plannedCost/actualCost = all-years totals, never recomputed here
 * so the PCF and Canvas can never disagree on rollup rules).
 */
export interface SubaccountData {
    id: string;
    // Owning account's id — used to re-attach this node when rebuilding the
    // tree from the flattened dataset rows.
    parentId: string;
    number: string;
    name: string;
    totalCost: number;
    plannedCost: number;
    actualCost: number;
    months: number[];
    // Standard-contract templates offered by THIS subaccount's "add standard
    // contract" action. Attached per subaccount (not global) because which
    // templates apply is a business decision made in Canvas per subaccount.
    standardContractOptions: StandardContractOption[];
    // Child contract rows shown when the subaccount is expanded.
    contracts: ContractData[];
}

/**
 * Top level of the hierarchy and the root of what GridRenderer iterates.
 * No parentId — accounts are roots by definition. Cost fields follow the same
 * convention as the other levels: aggregates are computed by Canvas (the
 * single owner of business rollup rules), months[] is selected-year only.
 */
export interface AccountData {
    id: string;
    number: string;
    name: string;
    totalCost: number;
    plannedCost: number;
    actualCost: number;
    months: number[];
    subaccounts: SubaccountData[];
}

/**
 * One contiguous run of months belonging to the same milestone cluster.
 * Expressed as index + run-length (rather than per-month flags) because the
 * renderer draws each cluster as a single merged/colspanned visual block, and
 * a span is the natural unit for that.
 */
export interface ClusterSpan {
    clusterIndex: number;
    length: number;
}

/**
 * Cluster view of a contract's 12-month row, used for cluster-distributed
 * contracts (see ContractData.distributionType). Both representations are
 * kept: monthClusters[] answers "which cluster is month N in?" during
 * per-cell rendering, while spans[] drives the merged block layout — deriving
 * one from the other on every render would just add work to the hot path.
 */
export interface ClusterTimeline {
    monthClusters: number[];
    spans: ClusterSpan[];
}
