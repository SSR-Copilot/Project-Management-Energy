/**
 * =============================================================================
 * DevexCapexSummaryPCF — PCF control entry point (namespace DEV.Controls)
 * =============================================================================
 *
 * Hosted on the Canvas App DEVEX/CAPEX cost screen. The Canvas App binds:
 *   - collection `colFinatCostDataOptimized` (typo in the name is intentional,
 *     do not "fix" it)            -> dataset `DevexCapexCostSummary`
 *   - collection `colStandardContractOptionsForPCF`
 *                                 -> dataset `StandardContractOptions`
 *
 * ARCHITECTURE / DIVISION OF RESPONSIBILITY (important — do not violate):
 *   - This PCF is a *pure presentation* component. It renders the
 *     Account -> Subaccount -> Contract hierarchy and reports user intent back
 *     to the Canvas App. It must NEVER call Dataverse (no WebApi usage); all
 *     Dataverse operations and business rules live in the Canvas App's
 *     OnChange formula. This keeps business logic maker-editable and avoids
 *     duplicating security/validation rules inside compiled control code.
 *   - User actions are communicated via OUTPUT TRIGGER BOOLEANS
 *     (EditTriggered, CommentTriggered, DeleteTriggered, AddTriggered,
 *     AddStandardContractTriggered, SetCostPaidUnpaidTriggered) plus the
 *     selected-ID outputs (SelectedRecordId, SelectedStandardContractId,
 *     SelectedCostContractId, SelectedCostYear, SelectedCostMonth,
 *     SelectedCostPaid). Canvas OnChange inspects which boolean is true and
 *     acts accordingly — so exactly ONE trigger may be true per action (see
 *     triggerAction) and triggers must be reset after being read (see
 *     getOutputs) or Canvas would miss repeated identical actions.
 *
 * LIFECYCLE OVERVIEW:
 *   init       -> wires child components (ActionDropdown, GridRenderer) and
 *                 the PCF_RE_RENDER window event used for internal re-renders.
 *   updateView -> called by the framework on any input change; delegates all
 *                 drawing to GridRenderer.
 *   getOutputs -> called by the framework after notifyOutputChanged(); returns
 *                 the trigger/selection outputs, then RESETS them.
 *   destroy    -> tears down child components and the window event listener.
 * =============================================================================
 */
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { ActionDropdown } from "./ui/ActionDropdown";
import { GridRenderer } from "./ui/GridRenderer";

/**
 * Closed union of every user action the grid can raise. Each member maps 1:1
 * to one output trigger boolean in the manifest; keeping it a union (rather
 * than free-form strings) means adding a new action forces a compile-time
 * review of triggerAction/getOutputs so no trigger is forgotten.
 */
type GridAction = "Edit" | "Comment" | "Delete" | "Add" | "AddStandardContract" | "SetCostPaidUnpaid";

/**
 * Extra context that only the "SetCostPaidUnpaid" action needs. Bundled into
 * one optional payload (instead of three optional params) so the other five
 * actions don't have to thread year/month/paid noise through their call sites.
 * Canvas needs year+month to locate the exact cost cell record, and `paid` is
 * the DESIRED new state (the PCF reports intent; Canvas performs the update).
 */
interface CostPaidActionPayload {
    year: number;
    month: number;
    paid: boolean;
}

/**
 * DevexCapexSummaryPCF
 * 
 * Main entry point for the PCF Control.
 * Acts as the orchestrator between the Power Apps framework and our custom UI components.
 *
 * Deliberately thin: it owns framework plumbing (lifecycle, outputs, the
 * notifyOutputChanged contract) and nothing visual, so UI churn in
 * GridRenderer/ActionDropdown never risks breaking the Canvas contract.
 */
export class DevexCapexSummaryPCF implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _context: ComponentFramework.Context<IInputs>;
    private _notifyOutputChanged: () => void;

    // Component dependencies
    private _actionDropdown: ActionDropdown;
    private _gridRenderer: GridRenderer;

    /**
     * Output trigger booleans + selection outputs (mirror of IOutputs).
     * These are transient "pulse" values, not persistent state: triggerAction
     * sets exactly one boolean true, getOutputs hands the snapshot to Canvas
     * and immediately resets everything to defaults. They exist as fields only
     * because the framework reads outputs asynchronously (notifyOutputChanged
     * now, getOutputs later), so the action must be parked somewhere between
     * those two calls.
     */
    // Output Trigger Action Properties
    private _editTriggered = false;
    private _commentTriggered = false;
    private _deleteTriggered = false;
    private _addTriggered = false;
    private _addStandardContractTriggered = false;
    private _setCostPaidUnpaidTriggered = false;
    private _selectedRecordId = "";
    private _selectedStandardContractId = "";
    private _selectedCostContractId = "";
    private _selectedCostYear = 0;
    private _selectedCostMonth = 0;
    private _selectedCostPaid = false;

    /**
     * UI state owned HERE (not in GridRenderer) on purpose: every updateView
     * triggers a full re-render, so expand/collapse state must outlive each
     * render pass. The Set is passed by reference into GridRenderer, which
     * mutates it; keeping ownership at the root means the state also survives
     * if GridRenderer were ever re-created.
     */
    // Global state. Inverted semantics (Bug 13472): this set tracks EXPANDED
    // rows, so an empty set = everything collapsed - the required default on
    // screen entry / tab change. Cleared whenever CollapseResetKey changes.
    private _expandedRowIds: Set<string> = new Set<string>();
    // Last CollapseResetKey seen; when Canvas changes it (tab switch / screen
    // OnVisible) the expand state is wiped so the grid re-collapses.
    private _lastResetKey = "";
    // Bound once in the constructor so removeEventListener in destroy() gets
    // the SAME function reference — an inline arrow in addEventListener could
    // never be unregistered and would leak across control re-loads.
    private _onReRenderEvent: EventListener;

    /**
     * Handler body for the PCF_RE_RENDER custom window event. GridRenderer
     * dispatches this event when a user expands/collapses a row: the renderer
     * cannot safely rebuild the DOM from inside its own click handler (it
     * would be destroying the very elements whose event is still bubbling),
     * so it asks the root control to perform the re-render instead.
     */
    constructor() {
        // Store bound reference for event listener to properly add/remove it
        this._onReRenderEvent = () => {
            // Guard: the event can theoretically fire before init/updateView
            // have run (or after destroy) — rendering then would crash on
            // undefined members, so silently skip until the control is ready.
            if (this._context && this._gridRenderer) {
                this._gridRenderer.render(this._context);
            }
        };
    }

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._context = context;
        this._notifyOutputChanged = notifyOutputChanged;

        context.mode.trackContainerResize(true);

        // Initialize child components following Separation of Concerns
        // Both UI components receive triggerAction as their callback so EVERY
        // user action — whether it originates from the row dropdown
        // (Edit/Comment/Delete) or from the grid itself (Add buttons, paid
        // toggles) — funnels through one choke point. That single funnel is
        // what guarantees the "exactly one trigger boolean true" contract
        // Canvas OnChange relies on; .bind(this) preserves the control's
        // `this` when the callback fires from deep inside DOM handlers.
        this._actionDropdown = new ActionDropdown(this.triggerAction.bind(this));

        this._gridRenderer = new GridRenderer(
            container,
            this._expandedRowIds,
            this._actionDropdown,
            this.triggerAction.bind(this)
        );

        // Listen for internal re-render requests from UI components (like toggle collapse)
        // A custom window event is used (instead of GridRenderer calling
        // render() on itself) so the re-render happens outside the click
        // handler's call stack — see the constructor note on _onReRenderEvent.
        window.addEventListener("PCF_RE_RENDER", this._onReRenderEvent);
    }

    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     */
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this._context = context;

        // Bug 13472: collapse all rows whenever Canvas signals a tab switch or
        // screen re-entry via CollapseResetKey. Clearing the expanded set leaves
        // every account/subaccount collapsed. A plain data refresh (paid toggle,
        // filter change) keeps the same key, so the user's expansions survive.
        const resetKey = context.parameters.CollapseResetKey?.raw ?? "";
        if (resetKey !== this._lastResetKey) {
            this._expandedRowIds.clear();
            this._lastResetKey = resetKey;
        }

        // A canvas-app PCF dataset delivers only the FIRST page by default, so a
        // large bound collection is truncated and the tail rows go missing (e.g.
        // the last account never renders until the row count shrinks). Pull every
        // remaining page: loadNextPage() re-fires updateView with the accumulated
        // records, so the grid fills in progressively until no page is left.
        const summaryDataset = context.parameters.DevexCapexCostSummary;
        if (summaryDataset && !summaryDataset.loading && summaryDataset.paging.hasNextPage) {
            summaryDataset.paging.loadNextPage();
        }
        const optionsDataset = context.parameters.StandardContractOptions;
        if (optionsDataset && !optionsDataset.loading && optionsDataset.paging.hasNextPage) {
            optionsDataset.paging.loadNextPage();
        }

        // Delegate rendering to the GridRenderer
        this._gridRenderer.render(this._context);
    }

    /**
     * Centralized action handler to process outputs triggered by UI components.
     *
     * This is the ONLY place output state may be written. Every assignment
     * below uses `action === "..."` comparisons (rather than setting just the
     * matching flag) so each call atomically sets exactly one trigger true AND
     * clears the other five — Canvas OnChange branches on "which boolean is
     * true", and two simultaneous trues would fire two business operations.
     * Unrelated selection outputs are likewise overwritten (not left over from
     * the previous action) so Canvas never reads stale IDs.
     * @param action The specific action triggered
     * @param recordId The associated record ID for the action
     */
    private triggerAction(action: GridAction, recordId: string, standardContractId = "", costPaidPayload?: CostPaidActionPayload): void {
        this._editTriggered = action === "Edit";
        this._commentTriggered = action === "Comment";
        this._deleteTriggered = action === "Delete";
        this._addTriggered = action === "Add";
        this._addStandardContractTriggered = action === "AddStandardContract";
        this._setCostPaidUnpaidTriggered = action === "SetCostPaidUnpaid";
        this._selectedRecordId = recordId;
        this._selectedStandardContractId = standardContractId;
        // SelectedCostContractId is a dedicated output for the paid/unpaid
        // flow only: Canvas reads it (instead of SelectedRecordId) so its
        // cost-cell formula can't accidentally act on an ID left behind by an
        // Edit/Delete action; for all other actions it is deliberately blank.
        this._selectedCostContractId = action === "SetCostPaidUnpaid" ? recordId : "";
        this._selectedCostYear = costPaidPayload?.year || 0;
        this._selectedCostMonth = costPaidPayload?.month || 0;
        this._selectedCostPaid = costPaidPayload?.paid || false;

        // Notify host of state change
        // This is what makes the framework call getOutputs() and, in turn,
        // fire the Canvas App's OnChange — without it the action would sit
        // unread in the private fields forever.
        this._notifyOutputChanged();
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     *
     * TRIGGER RESET PATTERN (do not remove): after snapshotting the outputs,
     * every trigger/selection field is reset to its default. Canvas OnChange
     * only fires when an output VALUE CHANGES — if EditTriggered stayed true,
     * a second Edit click on the same row would produce true -> true (no
     * change) and Canvas would silently ignore the user's action. Resetting
     * here guarantees each action yields a fresh false -> true transition.
     * The side effect (Canvas also sees a true -> false "reset" change) is
     * expected; the Canvas formula treats the all-false state as a no-op.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        const outputs = {
            EditTriggered: this._editTriggered,
            CommentTriggered: this._commentTriggered,
            DeleteTriggered: this._deleteTriggered,
            AddTriggered: this._addTriggered,
            AddStandardContractTriggered: this._addStandardContractTriggered,
            SetCostPaidUnpaidTriggered: this._setCostPaidUnpaidTriggered,
            SelectedRecordId: this._selectedRecordId,
            SelectedStandardContractId: this._selectedStandardContractId,
            SelectedCostContractId: this._selectedCostContractId,
            SelectedCostYear: this._selectedCostYear,
            SelectedCostMonth: this._selectedCostMonth,
            SelectedCostPaid: this._selectedCostPaid
        };

        // Reset AFTER capturing the snapshot above: the framework gets the
        // "pulsed" values while the internal state returns to idle, arming
        // the control for the next action (see JSDoc — Canvas change
        // detection depends on this).
        this._editTriggered = false;
        this._commentTriggered = false;
        this._deleteTriggered = false;
        this._addTriggered = false;
        this._addStandardContractTriggered = false;
        this._setCostPaidUnpaidTriggered = false;
        this._selectedRecordId = "";
        this._selectedStandardContractId = "";
        this._selectedCostContractId = "";
        this._selectedCostYear = 0;
        this._selectedCostMonth = 0;
        this._selectedCostPaid = false;

        return outputs;
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        // Delegate cleanup to child components
        if (this._actionDropdown) {
            this._actionDropdown.destroy();
        }
        if (this._gridRenderer) {
            this._gridRenderer.destroy();
        }
        // Must be removed explicitly: the listener lives on the global window
        // (not on the control's container), so the framework cannot clean it
        // up for us — leaving it would leak this control instance and cause
        // ghost re-renders after navigation back to the screen.
        window.removeEventListener("PCF_RE_RENDER", this._onReRenderEvent);
    }
}
