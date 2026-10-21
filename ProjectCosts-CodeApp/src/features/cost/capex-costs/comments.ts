/**
 * DEVEX/CAPEX comments — stage 2.4.
 *
 * Replaces \`CostLine.comments: string[]\` with the canvas' actual model: a thread on
 * \`vsb_capexcommentses\`, one level of replies, typed (General / payment-date), resolvable, with
 * a client-assigned sequence number the canvas persists into the row's \`Name\`.
 *
 * Ported from the skeleton's \`capex-costs/rules.ts\`. \`vsb_capexcommenttype\`: General 1,
 * Comments to payment date 2 — verified live.
 */
export const COMMENT_TYPE = { general: 1, paymentDate: 2 } as const;

export const COMMENT_MAX_LENGTH = 250;

export interface CapexComment {
  id: string;
  text: string;
  contractId: string | null;
  costId: string | null;
  parentId: string | null;
  rootId: string | null;
  commentType: number;
  resolved: boolean;
  resolvedById: string | null;
  createdOn: string;
  createdByName: string | null;
}

export interface CommentThread {
  root: CapexComment;
  replies: CapexComment[];
  lastActivityOn: string;
  latestText: string;
  resolved: boolean;
  sequenceNumber: number;
  relatedCostId: string | null;
  isGeneral: boolean;
}

/** A draft still being edited — new, or an existing comment reopened for editing. */
export interface CommentDraft {
  id: string;
  text: string;
  isDirty: boolean;
  isModified: boolean;
  /**
   * A "Comments to payment date" draft with no CAPEX cost row chosen.
   *
   * Saving one of these produces a row that can never be seen again — see
   * `paymentDateComplete`.
   */
  missingPaymentDate?: boolean;
  /**
   * Is this row's EDITOR on screen — `ThisItem.IsNew Or ThisItem.IsEdit`?
   *
   * The canvas validity gate is per-card and only fires on an open card:
   *
   *   tgl_Root_IsInvalid.Default = (ThisItem.IsNew Or ThisItem.IsEdit) And
   *                                IsBlank(Trim(txt_Draft_Edit_Comment_Value.Text))
   *   (`CapexScreenCode.txt:9885`, reply twin at `:8804`)
   *
   * A row that was only RESOLVED is `IsModified` but neither `IsNew` nor `IsEdit`, so it can
   * never make Save invalid. Defaults to `true` so a caller that only knows about editors keeps
   * the old meaning.
   */
  isOpen?: boolean;
}

/**
 * `Choices([@Month])` — the month names the Month dropdown and the read-mode `Type` value spell
 * out (`CapexScreenCode.txt:9149-9155`, `:9466-9474`).
 */
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * A payment-date comment MUST carry a cost row, or it is invisible forever.
 *
 * Measured on VSBCloud_Dev: `vsb_capexcomments` row `e2ec8083-12b0-f111-aaac-7ced8d975a55`
 * ("New Test", contract `Gesamt (CAPEX_after_FID) (59018_0_47110101)`, unresolved) has
 * `vsb_commenttype = Comments to payment date` and `vsb_capexcost = null`. It therefore
 * produces NO red dot of any kind, in this app or the canvas one:
 *
 *   - the name dot needs `CommentTypeText = "General Comment"`, and this row is not general;
 *   - a month dot needs `CostYear`/`CostMonthIndex`, which the canvas reads off the linked
 *     cost — with no cost, `IfError(Value(Text(Blank())), -1)` gives -1 and `Switch` on a
 *     blank month falls through to `Blank()`, so no month ever matches.
 *
 * That row is the reported "comment red dot is not being shown". The type is selectable
 * before a Year/Month is, so the gap is reachable from the panel; this predicate closes it.
 */
export const paymentDateComplete = (
  comment: { commentType: number; costId: string | null },
): boolean =>
  comment.commentType !== COMMENT_TYPE.paymentDate || Boolean(comment.costId);

/**
 * The `Type` value, as the choice column's own labels spell it.
 *
 * This is what the EDIT card's dropdown shows — `Items: Choices('Capex Comment Type')`,
 * `ItemDisplayText: ThisItem.Value` (`CapexScreenCode.txt:8985-8986`). The READ card shows more;
 * see `commentTypeValue`.
 */
export const commentTypeLabel = (commentType: number): string =>
  commentType === COMMENT_TYPE.paymentDate ? "Comments to payment date" : "General Comment";

/**
 * The READ-mode `Type` value — `lbl_Read_Type_Value.Text`, `CapexScreenCode.txt:9466-9474`:
 *
 *   =If(
 *       ThisItem.IsGeneralComment,
 *       'Capex Comment Type'.'General Comment',
 *       'Capex Comment Type'.'Comments to payment date'
 *   ) & If(
 *       ThisItem.IsGeneralComment = false,
 *       $" : {Text(ThisItem.RelatedCost.Month)} , {ThisItem.RelatedCost.Year}"
 *   )
 *
 * So a payment-date comment reads `Comments to payment date : January , 2026`. The space BEFORE
 * the colon and the space before the comma are in the canvas literal — they are not a bug in
 * this port, and "tidying" them is a visible divergence from the app the client is comparing
 * against. Transcribed character for character, spaces included.
 *
 * `Text(...)` of the CAPEX cost's `Month` choice is its label (`January`), and `{...Year}` is a
 * whole number interpolated with no format string, so no thousands separator: `2026`, not
 * `2,026`. A payment-date comment whose `RelatedCost` is blank — the live `e2ec8083` row — gives
 * `Comments to payment date :  , ` in the canvas, and does the same here.
 */
export function commentTypeValue(
  commentType: number,
  cost: { year: number; month: number } | null | undefined,
): string {
  const label = commentTypeLabel(commentType);
  if (commentType === COMMENT_TYPE.general) return label;
  const month = cost ? MONTH_NAMES[cost.month - 1] ?? "" : "";
  const year = cost ? String(cost.year) : "";
  return `${label} : ${month} , ${year}`;
}

/**
 * The blue header bar — `Label1.Text`, `CapexScreenCode.txt:8073-8081`:
 *
 *   =With({_text: "Comments : " & locSelectedProjectContract.Name},
 *         If(Len(_text) > 45, Left(_text, 45) & "...", _text))
 *
 * The 45 counts the `"Comments : "` PREFIX, so the contract name gets 34 characters, not 45 and
 * not some separate budget of its own. Truncating the name on its own — which is what this did —
 * cut the title in a different place from the canvas on every long contract name.
 */
export function commentPanelTitle(contractName: string): string {
  const text = `Comments : ${contractName}`;
  return text.length > 45 ? `${text.slice(0, 45)}...` : text;
}

/**
 * The `{Category} / {Account}` line under the header — `Label5.Text`,
 * `CapexScreenCode.txt:8147-8155`: the same `With`/`Left` shape, at 50 characters.
 *
 * The screenshot's `Wind Turbine / Panels / Turbine / PV Supply Agreem...` is exactly 50
 * characters plus the ellipsis, which is how this number was confirmed.
 */
export function commentBreadcrumb(text: string): string {
  return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}

/**
 * The Year dropdown's `Items` — `CapexScreenCode.txt:9097-9105`:
 *
 *   =Sort(Distinct(locAvailebleCapexCosts, vsb_year), Value, SortOrder.Descending)
 *
 * DESCENDING. `locAvailebleCapexCosts` (`:7494-7504`) is every CAPEX Cost row of the selected
 * contract, so the list is the contract's own years, newest first — not the grid's year, and not
 * ascending.
 */
export function commentYearOptions(
  costs: readonly { year: number }[],
): number[] {
  return [...new Set(costs.map((c) => c.year))].sort((a, b) => b - a);
}

/**
 * The Month dropdown's `Items` — `CapexScreenCode.txt:9164-9189`:
 *
 *   Filter(ForAll(Choices([@Month]), {Value: Int(Value), MonthName: Text(Value)}),
 *          Value in Distinct(Filter(locAvailebleCapexCosts, vsb_year = ThisItem.SelectedYear),
 *                            vsb_month))
 *
 * The ENUM is iterated and filtered, so the order is January..December regardless of the order
 * the cost rows come back in, and a month with no cost row for that year is not offered.
 */
export function commentMonthOptions<T extends { year: number; month: number }>(
  costs: readonly T[],
  year: number | null,
): T[] {
  if (year === null) return [];
  return costs
    .filter((c) => c.year === year)
    .sort((a, b) => a.month - b.month);
}

/**
 * `dd.MM.yyyy` — the format in the panel's `Comment #01 [Full Name - 14.09.2026]` heading.
 *
 * Fixed, not locale-derived: the canvas app rendered it with `Text(…, "[$-en-US]dd.MM.yyyy")`
 * so every user sees the same German-style date regardless of browser locale. An unparseable
 * or missing `createdOn` yields `""` rather than "NaN.NaN.NaN".
 */
export function commentDateLabel(createdOn: string): string {
  const date = new Date(createdOn);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/** `Comment #01 [Full Name - dd.MM.yyyy]`, or `Reply [Full Name - dd.MM.yyyy]`. */
export function commentHeading(
  comment: { createdByName: string | null; createdOn: string },
  sequenceNumber: number | null,
): string {
  const who = comment.createdByName ?? "";
  const when = commentDateLabel(comment.createdOn);
  const lead = sequenceNumber === null
    ? "Reply"
    : `Comment #${String(sequenceNumber).padStart(2, "0")}`;
  return `${lead} [${who} - ${when}]`;
}

/** The \`n / 250\` counter — CAPEX comments are 250 characters, not the Contracts panel's 255. */
export function truncateComment(value: string): { text: string; counter: string } {
  const text = value.slice(0, COMMENT_MAX_LENGTH);
  return { text, counter: `${text.length} / ${COMMENT_MAX_LENGTH}` };
}

/**
 * `LastActivityOn` / `LatestText` — the canvas' `colCapexCommentsLatest` flattening, verbatim:
 *
 *   locLatestReply: First(Sort(Filter(comments, 'Parent Comment' = ParentC), 'Created On', Desc))
 *   LastActivityOn: Coalesce(locLatestReply.'Created On', ParentC.'Created On')
 *   LatestText:     Coalesce(locLatestReply.Comment,      ParentC.Comment)
 *
 * (`Comments_PCF_CodeSnippets.txt:50-110`, live at `CapexScreenCode.txt:940-1000`.)
 *
 * The latest REPLY wins over its parent — that is the whole point, and it is what the grid's
 * hover tooltip shows. `First(Sort(..., Descending))` is a MAX, not "the last element", so this
 * takes the max explicitly rather than relying on the caller having sorted the replies.
 */
export function threadLatestActivity(
  root: CapexComment,
  replies: readonly CapexComment[],
): { lastActivityOn: string; latestText: string } {
  let latest: CapexComment | undefined;
  for (const reply of replies) {
    if (!latest || reply.createdOn.localeCompare(latest.createdOn) > 0) latest = reply;
  }
  return {
    lastActivityOn: latest?.createdOn ?? root.createdOn,
    latestText: latest?.text ?? root.text,
  };
}

/**
 * Flattens the flat comment list into threads — a root (no parent) plus its replies, ordered
 * oldest first, with the latest activity date/text bubbled up for the collapsed row.
 */
export function commentThreads(comments: readonly CapexComment[]): CommentThread[] {
  const roots = comments.filter((c) => c.parentId === null);
  const threads = roots.map((root) => {
    const replies = comments
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    return {
      root, replies,
      ...threadLatestActivity(root, replies),
      resolved: root.resolved,
      sequenceNumber: 0,
      relatedCostId: root.costId,
      isGeneral: root.commentType === COMMENT_TYPE.general,
    };
  });
  return renumberThreads(threads);
}

/**
 * Sequence numbers are client-assigned, oldest thread first — and, per the canvas, persisted
 * into the saved row's \`Name\`. Deleting a thread renumbers the survivors, which is why a
 * delete can rewrite \`Name\` on rows nobody touched (SOURCE DEFECT N-4, logged not fixed).
 */
export function renumberThreads(threads: readonly CommentThread[]): CommentThread[] {
  return [...threads]
    .sort((a, b) => a.root.createdOn.localeCompare(b.root.createdOn))
    .map((t, i) => ({ ...t, sequenceNumber: i + 1 }));
}

/** One contract row's red dots and their hover text. `months` / `monthTooltips` are 0-based. */
export interface GridCommentIndicators {
  /** `HasComments` — at least one unresolved General Comment thread. */
  general: boolean;
  /** `CommentTooltip` — `LatestText` of the most recent such thread, `""` when there is none. */
  generalTooltip: string;
  /** `M1HasComments`..`M12HasComments`. */
  months: boolean[];
  /** `M1CommentTooltip`..`M12CommentTooltip`. */
  monthTooltips: string[];
}

const emptyIndicators = (): GridCommentIndicators => ({
  general: false,
  generalTooltip: "",
  months: new Array<boolean>(12).fill(false),
  monthTooltips: new Array<string>(12).fill(""),
});

/**
 * The grid's red dots and their tooltips, per contract — `Comments_PCF_CodeSnippets.txt` Snippet 2
 * in one pass.
 *
 * Three rules from that source, none of them inferrable from the panel alone:
 *
 * 1. Only UNRESOLVED threads produce a dot (`&& !IsResolved` on every filter).
 * 2. A month dot belongs to the month of the linked COST row, and only when that cost is in the
 *    year the grid is currently showing (`CostYear = Value(gblSelectedProjectYear)`) — the PCF's
 *    month columns are always the selected year.
 * 3. The tooltip is the `LatestText` of the MOST RECENT matching thread
 *    (`First(Sort(..., LastActivityOn, SortOrder.Descending)).LatestText`), coalesced to `""`.
 *
 * `ContractId` is `Coalesce(ParentC.Contract, locCost.Contract)` in the source: a payment-date
 * comment is allowed to carry only the cost lookup, and its contract is then resolved through
 * that cost. `costs` is the same `{id, contractId, year, month}` projection the screen already
 * has from the cost book's payments.
 *
 * A payment-date thread whose cost is missing — either never set (`paymentDateComplete`) or not
 * in `costs` — produces NOTHING, which is the canvas' behaviour too and is deliberately NOT
 * "fixed" into a contract-level dot here: the dot would then claim a month the comment has no
 * month for. The cure is at the other end, in the panel, which now refuses to save one.
 */
export function gridCommentIndicators(
  threads: readonly CommentThread[],
  costs: readonly { id: string; contractId: string; year: number; month: number }[],
  year: number,
): Map<string, GridCommentIndicators> {
  const costById = new Map(costs.map((c) => [c.id, c]));
  const out = new Map<string, GridCommentIndicators>();
  // "Most recent wins" per tooltip slot: each slot remembers the LastActivityOn it is holding,
  // which is `Sort(..., LastActivityOn, Descending)` without sorting anything.
  const heldAt = new Map<string, string>();
  const claim = (slot: string, at: string): boolean => {
    const held = heldAt.get(slot);
    if (held !== undefined && held.localeCompare(at) >= 0) return false;
    heldAt.set(slot, at);
    return true;
  };

  for (const t of threads) {
    if (t.resolved) continue;
    const cost = t.relatedCostId ? costById.get(t.relatedCostId) : undefined;
    const contractId = t.root.contractId ?? cost?.contractId ?? null;
    if (!contractId) continue;
    const entry = out.get(contractId) ?? emptyIndicators();
    if (t.isGeneral) {
      entry.general = true;
      if (claim(`${contractId} general`, t.lastActivityOn)) entry.generalTooltip = t.latestText;
    } else if (cost && cost.year === year && cost.month >= 1 && cost.month <= 12) {
      entry.months[cost.month - 1] = true;
      if (claim(`${contractId} ${cost.month}`, t.lastActivityOn)) {
        entry.monthTooltips[cost.month - 1] = t.latestText;
      }
    }
    out.set(contractId, entry);
  }
  return out;
}

/**
 * Per-contract, per-month unresolved-comment flags for the grid's red dots.
 *
 * The dots-only projection of `gridCommentIndicators`, kept because callers that never render a
 * tooltip should not have to know about one.
 */
export function gridCommentFlags(
  threads: readonly CommentThread[],
  costs: readonly { id: string; contractId: string; year: number; month: number }[],
  year: number,
): Map<string, { general: boolean; months: boolean[] }> {
  return new Map(
    [...gridCommentIndicators(threads, costs, year)]
      .map(([id, i]) => [id, { general: i.general, months: i.months }]),
  );
}

/** Resolving a root resolves its replies with it. */
export function resolveThread(
  comments: readonly CapexComment[],
  rootId: string,
  resolverId: string,
): CapexComment[] {
  return comments.map((c) =>
    c.id === rootId || c.parentId === rootId
      ? { ...c, resolved: true, resolvedById: resolverId }
      : c);
}

/** Reopening is symmetric with resolving. */
export function reopenThread(comments: readonly CapexComment[], rootId: string): CapexComment[] {
  return comments.map((c) =>
    c.id === rootId || c.parentId === rootId
      ? { ...c, resolved: false, resolvedById: null }
      : c);
}

/** Deleting a root takes its replies with it, and renumbers what survives. */
export function planDeleteRoot(
  threads: readonly CommentThread[],
  rootId: string,
): { deletedIds: string[]; remaining: CommentThread[] } {
  const target = threads.find((t) => t.root.id === rootId);
  if (!target) return { deletedIds: [], remaining: [...threads] };
  return {
    deletedIds: [target.root.id, ...target.replies.map((r) => r.id)],
    remaining: renumberThreads(threads.filter((t) => t.root.id !== rootId)),
  };
}

/**
 * `Sort by`, `Pin general comments to top`, `Show resolved comments`.
 *
 * `gal_Capex_Comments.Items`, `CapexScreenCode.txt:8283-8316` — a TRIPLE-nested `Sort`, applied
 * innermost first, over `Filter(colCapexComments, IsRoot = true, (ShowResolved.Checked Or
 * Resolved <> Yes))`:
 *
 *   tier 3 (innermost, weakest): 'Created On', Descending when the dropdown reads
 *                                "Date added [Newest]", else Ascending
 *   tier 2:                      If(PinGeneral.Checked And IsGeneralComment = true, 0, 1) Asc
 *   tier 1 (outermost, strongest): If(IsButton, 1, 0) Asc — the Add row pinned to the bottom
 *
 * Read that against `:7440-7464`, which numbers the ROOTS by `'Created On'` Ascending into
 * `SequenceNumber` BEFORE any of this runs. Display order and numbering are therefore independent:
 * with generals pinned, the canvas really does show `#01, #03, #02, #04`. That is not a bug and
 * has now been "fixed" twice by mistake — see `UT-CMT-059`.
 *
 * The Add row is a gallery ITEM here, not a free-floating button, which is the only reason tier 1
 * exists; this function sorts real threads only and the panel renders the Add row after them,
 * which is the same result.
 */
export function sortComments(
  threads: readonly CommentThread[],
  opts: { pinGeneral: boolean; order: "oldest" | "newest"; showResolved: boolean },
): CommentThread[] {
  const visible = opts.showResolved ? threads : threads.filter((t) => !t.resolved);
  return [...visible].sort((a, b) => {
    if (opts.pinGeneral && a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
    const cmp = a.root.createdOn.localeCompare(b.root.createdOn);
    return opts.order === "newest" ? -cmp : cmp;
  });
}

/**
 * The blue info banner inside the edit card of an equal-distributed contract —
 * `lbl_Draft_Edit_Comment_Warning.Text`, `CapexScreenCode.txt:9403`. Verbatim, trailing full stop
 * included.
 */
export const PAYMENT_DATE_NOT_ALLOWED =
  "Payment date comments cannot be added to automatically distributed costs.";

/**
 * An equal-distributed contract has no individual months to attach a payment-date comment to.
 *
 * `drp_Draft_Edit_Type_Value.DisplayMode`, `CapexScreenCode.txt:8978-8983`:
 * `If(Or(locSelectedProjectContract.Distribution = 'Distribution Type'.'Equal Distribution'),
 * DisplayMode.View, DisplayMode.Edit)` — the canvas freezes the WHOLE Type dropdown rather than
 * greying one option, and pairs it with `con_Draft_Edit_Comment_Warning` (`:9362-9406`), a
 * 40px-high `RGBA(225, 236, 244, 1)` strip with an information icon and
 * `PAYMENT_DATE_NOT_ALLOWED`.
 */
export const paymentDateCommentsAllowed = (
  contract: { distribution: "equal" | "individual" } | null,
): boolean => contract?.distribution !== "equal";

/**
 * Save is enabled once something changed, and refused while any OPEN draft is blank — or is a
 * payment-date comment with no month picked (`paymentDateComplete`, the defect behind the missing
 * red dot).
 *
 * `btn_Capex_Comment_Save.DisplayMode`, `CapexScreenCode.txt:9929-9965`:
 *
 *   _hasLiveInvalids   → CountRows(Filter(gal.AllItems, tgl_Root_IsInvalid.Value = true)) > 0
 *   _hasLiveValidChanges → ... tgl_Root_IsDirty.Value = true ...
 *   _hasDeletions      → !IsEmpty(colDeletedComments)
 *   _hasModifiedRecords→ CountRows(Filter(colCapexComments, IsModified = true)) > 0
 *   If(_hasLiveInvalids, Disabled, _hasLiveValidChanges Or _hasDeletions Or _hasModifiedRecords,
 *      Edit, Disabled)
 *
 * `isOpen` is the `(IsNew Or IsEdit)` half of `tgl_Root_IsInvalid` (`:9885`). Without it, a row
 * that was merely RESOLVED could block Save with no editor on screen to explain why — and for a
 * cost-less payment-date comment (live row `e2ec8083`) it did exactly that: resolving it set
 * `missingPaymentDate`, Save went dead, and there was no `Required` message anywhere because the
 * card was in read mode. Only an open card can be invalid.
 */
export function canSaveComments(
  drafts: readonly CommentDraft[],
  deletedIds: readonly string[],
): boolean {
  const invalid = drafts.some((d) =>
    d.isOpen !== false && (!d.text.trim() || d.missingPaymentDate === true));
  if (invalid) return false;
  return drafts.some((d) => d.isDirty || d.isModified) || deletedIds.length > 0;
}

/**
 * Reply / resolve / edit / delete all hide on an already-resolved thread.
 *
 * Every one of the four carries the same `Visible` in the canvas —
 * `Not(ThisItem.Resolved = 'Resolved (Capex Comments)'.Yes)`: reply `CapexScreenCode.txt:9753`,
 * resolve `:9693`, edit `:9640`, delete `:9587` (and the button twins at `:9765`, `:9705`, `:9658`,
 * `:9605`). Their place is taken by the `Resolved` pill (`:9769-9794`) and the `Reset` icon
 * (`:9838`), which are visible on exactly the opposite condition.
 *
 * NOT reproduced, because the data to do it with is not loadable here: the canvas additionally
 * DISABLES (greys, does not hide) edit and delete for anyone who is not the author —
 * `If(ThisItem.'Created By'.'Primary Email' = User().Email, DisplayMode.Edit,
 * DisplayMode.Disabled)` at `:9595-9600` (delete), `:9648-9653` (edit), `:8567-8578` (reply edit,
 * which also requires the parent to be unresolved), and `Or(author, Resolver.Id =
 * User().EntraObjectId)` for Reset at `:9846-9855`. Reply and resolve have no such gate. Matching
 * it needs the author's primary email or systemuser id on the row; `IGetAllOptions` has no
 * `$expand`, and `Session` carries no systemuser id, so there is nothing to compare against.
 */
export const commentEditable = (thread: Pick<CommentThread, "resolved">): boolean =>
  !thread.resolved;

/**
 * `Comment - {n} - {full name}` — the saved `Name`, `CapexScreenCode.txt:10012`:
 *
 *   Name: $"Comment - {_currentComment.SequenceNumber} - {User().FullName}"
 *
 * Two details that are NOT guesses:
 *
 * 1. `User().FullName` is the SAVING user, not the author. Live proof on VSBCloud_Dev:
 *    `vsb_capexcomments` `34d54179-82b1-f111-aaac-7ced8d975a55` has `createdbyname =
 *    "Shakti Singh Rajput"` but `vsb_name = "Comment - 1 - Singh Rajput, Shakti (external)"` —
 *    two different spellings of the same person, because one is the systemuser's full name and
 *    the other is `User().FullName`.
 * 2. A REPLY has no sequence number (`:7435-7439` blanks it on every non-root), and the canvas
 *    interpolates that blank straight into the name: the live replies `d8e6765a…`, `19e0b484…`
 *    and `48eef580…` are all called `Comment -  - <name>`, with two spaces. `null` reproduces
 *    that; passing `0` would have written `Comment - 0 - <name>`, which no canvas row has.
 *
 * SOURCE DEFECT N-4 rides on this: the number is client-assigned by position, so deleting a
 * thread renumbers the survivors and the next save rewrites the stored `Name` of rows nobody
 * touched. Reproduced deliberately.
 */
export const commentName = (sequenceNumber: number | null, fullName: string): string =>
  `Comment - ${sequenceNumber ?? ""} - ${fullName}`;

/**
 * The `{id, contractId, year, month}` projection `gridCommentIndicators` needs, taken straight
 * off the cost book.
 *
 * A payment-date comment links to a COST row, not to its contract, so the year and month its dot
 * belongs to live on that cost — and `Payment.id` IS `vsb_capexcostid`. A payment with no id has
 * never been saved, so no comment can reference it; those are skipped rather than given a
 * synthetic key that could collide with a real one.
 *
 * Structurally typed on purpose: this needs ids and dates only, and keeping `CostLine` out of the
 * signature keeps the comment rules testable without the whole cost model.
 */
export function commentCosts(
  lines: readonly {
    id: string;
    payments: readonly { id?: string; year: number; month: number }[];
  }[] | undefined,
): { id: string; contractId: string; year: number; month: number }[] {
  return (lines ?? []).flatMap((line) =>
    line.payments
      .filter((p): p is typeof p & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, contractId: line.id, year: p.year, month: p.month })),
  );
}
