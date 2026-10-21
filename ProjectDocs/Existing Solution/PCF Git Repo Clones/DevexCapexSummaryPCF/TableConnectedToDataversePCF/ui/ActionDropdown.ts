/**
 * =============================================================================
 * ActionDropdown.ts — three-dot (kebab) context menu for contract rows
 * =============================================================================
 * Presents Edit / Comments / Delete for the contract row whose "..." button
 * was clicked. It performs NO business logic itself: each item simply invokes
 * the callback supplied by index.ts (triggerAction), which raises the matching
 * output trigger so the Canvas App's OnChange performs the real Dataverse
 * operation — keeping this class purely visual.
 *
 * DESIGN DECISIONS:
 *  - ONE shared dropdown instance for the whole grid, repositioned next to
 *    whichever row invoked it. With potentially hundreds of contract rows,
 *    one menu per row would multiply DOM nodes and listeners for an element
 *    that can only ever be open once; _currentRecordId tracks "whose menu is
 *    this right now".
 *  - The element is appended to document.body, NOT the PCF container, so it
 *    escapes the grid's scroll container (overflow clipping) and any
 *    stacking-context/z-index traps — see note in createDropdownMenu().
 *  - Because it lives on document.body, destroy() MUST remove it manually;
 *    the framework only disposes the control's own container.
 * =============================================================================
 */
/**
 * Handles the rendering and events for the context action dropdown menu.
 */
export class ActionDropdown {
    // The single shared menu element (lives on document.body, see header).
    private _dropdownElement: HTMLDivElement;
    // Funnel back to index.ts triggerAction — the only escape hatch for user
    // intent; the dropdown never talks to Dataverse or Canvas directly.
    private _onActionTriggered: (action: "Edit" | "Comment" | "Delete", recordId: string) => void;
    // Record id of the row the menu is currently open FOR. Needed precisely
    // because the menu is shared: the buttons are wired once at construction,
    // so this field is how a click knows which contract it applies to.
    private _currentRecordId = "";
    // The three-dot trigger button the menu is currently open for. Tracked so its
    // blue "active" highlight (pcf-dots-btn-active) can be cleared on close — the menu
    // is shared, so without this the highlight would stick on a stale button.
    private _activeTriggerButton: HTMLElement | null = null;
    // Pre-bound click handler kept so destroy() can pass the SAME reference
    // to removeEventListener — re-binding there would silently fail to detach.
    private _boundWindowClick: (e: MouseEvent) => void;

    /**
     * @param onActionTriggered Callback into the root control; keeping the
     * action wiring injected (instead of importing index.ts) avoids a circular
     * dependency and lets the menu be tested in isolation.
     */
    constructor(onActionTriggered: (action: "Edit" | "Comment" | "Delete", recordId: string) => void) {
        this._onActionTriggered = onActionTriggered;
        this._boundWindowClick = this.handleWindowClick.bind(this);
        this.createDropdownMenu();
        // Close dropdown when clicking outside
        // Registered on window (not the grid container) because the menu sits
        // on document.body — clicks anywhere on the page must dismiss it.
        window.addEventListener("click", this._boundWindowClick);
    }

    /**
     * Builds the menu DOM exactly once. Items are created imperatively (not
     * re-rendered per show) because their contents are static — only the
     * comment badge visibility and the position change per invocation, both
     * handled cheaply in show().
     */
    private createDropdownMenu(): void {
        this._dropdownElement = document.createElement("div");
        this._dropdownElement.className = "pcf-dropdown";

        // 1. Edit Item
        const btnEdit = document.createElement("button");
        btnEdit.className = "pcf-dropdown-item";
        btnEdit.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            Edit
        `;
        btnEdit.onclick = () => {
            this._onActionTriggered("Edit", this._currentRecordId);
            this.closeDropdown();
        };

        // 2. Comments Item
        // Includes the #dropdown-comment-dot red badge (hidden by default):
        // show() toggles it per row so users can see — before opening the
        // dialog — that this contract already has comments worth reading.
        const btnComment = document.createElement("button");
        btnComment.className = "pcf-dropdown-item";
        btnComment.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.5 5.25h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11.5l-4 3.5v-3.5h-3a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5z"/>
                <path d="M7.25 9.25h9.5"/>
                <path d="M7.25 12.75h6.5"/>
            </svg>
            Comments
            <span class="pcf-dot-inline" id="dropdown-comment-dot" style="display: none;"></span>
        `;
        btnComment.onclick = () => {
            this._onActionTriggered("Comment", this._currentRecordId);
            this.closeDropdown();
        };

        // 3. Delete Item
        const btnDelete = document.createElement("button");
        btnDelete.className = "pcf-dropdown-item";
        btnDelete.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            Delete
        `;
        btnDelete.onclick = () => {
            this._onActionTriggered("Delete", this._currentRecordId);
            this.closeDropdown();
        };

        this._dropdownElement.appendChild(btnEdit);
        this._dropdownElement.appendChild(btnComment);
        this._dropdownElement.appendChild(btnDelete);

        // Appending to body is best practice for custom absolute popups so they aren't clipped by 'overflow:hidden'
        // Concretely: the grid scrolls inside an overflow container, so a
        // menu parented inside it would be cut off at the container edge for
        // rows near the bottom/right, and could land under neighbouring
        // Canvas controls due to stacking contexts. Body-level positioning
        // sidesteps both. The trade-off is manual cleanup in destroy().
        document.body.appendChild(this._dropdownElement);
    }

    /**
     * Opens (or repositions) the shared menu for one contract row.
     * Called from the row's "..." button handler in GridRenderer.
     *
     * @param e           Click event of the trigger button — its currentTarget
     *                    rect anchors the menu, so the menu follows whichever
     *                    row was clicked even though the element is shared.
     * @param recordId    Contract the menu now represents; stored so the
     *                    statically-wired item buttons report the right row.
     * @param hasComments Contract-level flag (ContractData.hasComments) that
     *                    decides whether the red badge on "Comments" is shown.
     */
    public show(e: MouseEvent, recordId: string, hasComments: boolean): void {
        const target = e.currentTarget as HTMLElement;

        // Toggle: re-clicking the button that already owns the open menu closes it
        // instead of reopening (the button's onclick stops propagation, so the window
        // light-dismiss never fires for it — this is the sole toggle point).
        if (this._activeTriggerButton === target && this._dropdownElement.classList.contains("open")) {
            this.closeDropdown();
            return;
        }

        this._currentRecordId = recordId;

        const rect = target.getBoundingClientRect();

        // Give the clicked three-dot button the blue "active" highlight while its menu
        // is open; clear it from any previously active button first (shared menu).
        if (this._activeTriggerButton && this._activeTriggerButton !== target) {
            this._activeTriggerButton.classList.remove("pcf-dots-btn-active");
        }
        this._activeTriggerButton = target;
        target.classList.add("pcf-dots-btn-active");
        
        // Show or hide comment dot inside dropdown
        // Toggled on EVERY show() because the menu element is shared between
        // rows — without this, the badge state of the previously opened row
        // would leak onto the next one.
        const dropdownDot = document.getElementById("dropdown-comment-dot");
        if (dropdownDot) {
            dropdownDot.style.display = hasComments ? "block" : "none";
        }

        // Must be marked open BEFORE measuring: while closed the menu is not
        // laid out, so offsetWidth/offsetHeight below would read 0 and the
        // positioning math would be garbage.
        this._dropdownElement.classList.add("open");

        const menuWidth = this._dropdownElement.offsetWidth;
        const menuHeight = this._dropdownElement.offsetHeight;
        const viewportPadding = 8;
        // Horizontal: right-align the menu with the trigger button, but clamp
        // into the viewport so rows near the screen edge don't spawn a
        // half-visible (unclickable) menu.
        const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding));
        const preferredTop = rect.bottom + 4;
        // Vertical: prefer opening below the button; if that would overflow
        // the bottom of the viewport (rows at the end of a long grid), flip
        // above it instead — same pattern native context menus use.
        const top = preferredTop + menuHeight <= window.innerHeight - viewportPadding
            ? preferredTop
            : Math.max(viewportPadding, rect.top - menuHeight - 4);

        this._dropdownElement.style.top = `${top}px`;
        this._dropdownElement.style.left = `${left}px`;
    }

    /**
     * Hides the menu via CSS class only — the element stays in the DOM so the
     * next show() is just a class toggle + reposition, never a rebuild.
     */
    public closeDropdown(): void {
        this._dropdownElement.classList.remove("open");
        // Drop the blue highlight from the trigger button the menu was open for.
        if (this._activeTriggerButton) {
            this._activeTriggerButton.classList.remove("pcf-dots-btn-active");
            this._activeTriggerButton = null;
        }
    }

    /**
     * Window-level "click outside closes the menu" handler. It deliberately
     * does NOT check whether the click landed inside the menu itself: the
     * item buttons close the menu in their own handlers anyway, so closing
     * unconditionally keeps this logic to a single exception (below).
     */
    private handleWindowClick(e: MouseEvent): void {
        // If the click is inside a dropdown trigger button, do nothing (let the button's handler manage it)
        // Otherwise this global handler would close the menu in the same
        // event cycle in which show() just opened it (the button click also
        // bubbles to window), making the menu impossible to open.
        const target = e.target as HTMLElement;
        if (target.closest('.pcf-dots-btn')) {
            return;
        }
        this.closeDropdown();
    }

    /**
     * Called from index.ts destroy(). Both cleanups are mandatory precisely
     * because this class reaches outside the PCF container: the click
     * listener lives on window and the menu element on document.body, so
     * neither is torn down automatically when the framework disposes the
     * control — skipping this leaks DOM nodes/listeners on every screen
     * navigation.
     */
    public destroy(): void {
        window.removeEventListener("click", this._boundWindowClick);
        if (this._dropdownElement && this._dropdownElement.parentNode) {
            this._dropdownElement.parentNode.removeChild(this._dropdownElement);
        }
    }
}
