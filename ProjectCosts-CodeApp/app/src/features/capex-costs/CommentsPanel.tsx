/**
 * DEVEX/CAPEX comments panel - stage 2.4.
 *
 * Replaces the flat string-list panel with the canvas' actual model: threaded, typed
 * (General / payment-date), resolvable, sortable, with a client-side identity for unsaved
 * drafts because a new comment has no Dataverse id until it is saved.
 *
 * The layout is transcribed from the canvas Power Fx itself —
 * `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/CapexScreenCode.txt`,
 * `con_Capex_Comments_Right_Panel` at `:8014` through the Save button at `:10056` — with the
 * screenshots in `Existing Solution/UI Screenshots/Cost App - Comment Panel contract Row - *.png`
 * used only to confirm it. Every control below carries the line number it came from.
 *
 * The shape: a 600 px drawer (`:8041`), a blue 48 px header `Comments : {name}` cut at 45
 * characters (`:8073`), the `{Category} / {Account}` line cut at 50 (`:8147`), a grey
 * `RGBA(243,243,243)` filter block holding `Sort by` + `Pin general comments to top` +
 * `Show resolved comments` (`:8176-8246`), then `gal_Capex_Comments` (`:8276`) — read cards
 * (`:9407`), edit cards (`:8907`), an indented reply gallery (`:8358`) and the `Add Comment`
 * placeholder row pinned last (`:8808`) — with Save / Cancel in a 50 px footer (`:9894`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Checkbox, Dropdown, Field, Option, Text, Textarea, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowReplyRegular, ArrowUndoRegular, CheckmarkCircleRegular, DeleteRegular,
  EditRegular, InfoRegular,
} from "@fluentui/react-icons";
import { FormPanel, LoadingOverlay } from "@/components";
import { PanelButtons } from "../costing/Fields";
import { space } from "@/theme/tokens";
import { useSession } from "@/app/SessionContext";
import { useCapexComments, useCommentWrites } from "../costing/useCostBook";
import type { Payment } from "../costing/model";
import {
  COMMENT_MAX_LENGTH, COMMENT_TYPE, MONTH_NAMES, PAYMENT_DATE_NOT_ALLOWED, canSaveComments,
  commentBreadcrumb, commentEditable, commentHeading, commentMonthOptions, commentPanelTitle,
  commentThreads, commentTypeLabel, commentTypeValue, commentYearOptions,
  paymentDateCommentsAllowed, paymentDateComplete,
  reopenThread, resolveThread, sortComments, truncateComment,
  type CapexComment, type CommentThread,
} from "./comments";

interface Working extends CapexComment { isNew: boolean }

const isTemp = (id: string) => id.startsWith("draft-");

/** One month of this contract that a payment-date comment can be attached to. */
interface CostOption { id: string; year: number; month: number }

const useStyles = makeStyles({
  breadcrumb: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  /*
   * `Container10` — `CapexScreenCode.txt:8176-8188`: the filter block is `RGBA(243, 243, 243, 1)`
   * with square corners, holding `Sort by` (`Text2`, size 14, `RGBA(89,89,89)`, at X 15 / Y 5),
   * `modernDropdown1` (Width 232, `:8215`) and the two checkboxes below it (`:8218-8246`).
   */
  filters: {
    display: "flex", flexDirection: "column", rowGap: space.m,
    marginTop: space.m, marginBottom: space.l,
    paddingTop: space.s, paddingRight: space.m, paddingBottom: space.m, paddingLeft: "15px",
    backgroundColor: "#f3f3f3",
  },
  /* `modernDropdown1.Width = 232` (`:8215`). */
  sortBy: { width: "232px", minWidth: 0 },
  checkboxes: {
    display: "grid", gridTemplateColumns: "240px 215px", columnGap: space.m, minWidth: 0,
  },
  threads: { display: "flex", flexDirection: "column", rowGap: space.l },
  /* `rec_Capec_Comment_Seprator` — a 1 px `RGBA(231, 231, 231, 1)` rule (`:8345-8356`). */
  thread: {
    display: "flex", flexDirection: "column", rowGap: space.m,
    paddingBottom: space.l,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#e7e7e7",
  },
  /*
   * `gal_Capex_Replies` sits at `X: =30` with `Width: =Parent.Width-60` (`:8427-8428`) inside a
   * parent whose own read card starts at X 2, and both label stacks carry `PaddingLeft: =12` —
   * so a reply's text is indented 28 px from its root's.
   */
  reply: { marginLeft: "28px" },
  headRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    columnGap: space.s, minWidth: 0,
  },
  /* `lbl_Read_Header` / `lbl_Read_Header_Reply`: `RGBA(89,89,89,1)`, Lighter, `Size: =14`. */
  headLabel: {
    color: "#595959", fontSize: tokens.fontSizeBase300,
    overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  actions: { display: "flex", alignItems: "center", flexShrink: 0 },
  /* The icons are all `fill='#006EB9'` — `gblAppTheme.palette.themePrimary`. */
  actionButton: { color: tokens.colorBrandForeground1, minWidth: "28px" },
  readCard: { display: "flex", flexDirection: "column", rowGap: space.m },
  readValue: { display: "flex", flexDirection: "column", rowGap: space.xxs },
  /*
   * `lbl_Read_Type_Title` / `lbl_Read_Comment_Title` and their reply twins: `RGBA(89,89,89,1)`,
   * `FontWeight.Lighter`, `Size: =14` — the SAME 14 px as the value below them, not a small
   * caption. Rendering them at 12 px made every card visibly shorter than the canvas'.
   */
  readLabel: { color: "#595959", fontSize: tokens.fontSizeBase300 },
  /* `lbl_Read_Type_Value` / `lbl_Read_Comment_Value`: `RGBA(0,0,0,1)`, Semibold, `Size: =14`. */
  readText: {
    color: "#000000", fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "break-word", whiteSpace: "pre-wrap",
  },
  /*
   * `con_Comment_Draft_Edit` (`:8910-8919`) / `con_Reply_Comment_Draft_Edit` (`:8664-8672`):
   * `BorderColor: =RGBA(125, 125, 125, 1)`, `BorderStyle: =BorderStyle.Dotted`, and a Radius of 8
   * on all four corners. DOTTED, not solid — it is what tells the user at a glance which cards are
   * unsaved. (The canvas' 0.5 px renders as nothing in a browser, so 1 px.)
   */
  card: {
    display: "flex", flexDirection: "column", rowGap: space.m,
    paddingTop: space.m, paddingRight: space.m, paddingBottom: space.m, paddingLeft: space.m,
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "dotted",
    borderRightStyle: "dotted",
    borderBottomStyle: "dotted",
    borderLeftStyle: "dotted",
    borderTopColor: "#7d7d7d",
    borderRightColor: "#7d7d7d",
    borderBottomColor: "#7d7d7d",
    borderLeftColor: "#7d7d7d",
    borderRadius: "8px",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  /*
   * Type alone, or Type + Year + Month on one row for a payment-date comment.
   *
   * FIXED widths, not fractions: the canvas lays these out by hand at
   * `drp_Draft_Edit_Type_Value.Width = 250` (`CapexScreenCode.txt:9011`),
   * `drp_Draft_Edit_Year_Value.Width = 100` (`:9118`) and `drp_Draft_Edit_Month_Value.Width = 100`
   * (`:9258`), spaced 22 px apart (`X: =…+Width+10+12`). So the Type dropdown is 250 px whether or
   * not the date fields are showing — stretching it to the full width when the comment is General,
   * which is what fractional columns did, is visibly not the canvas card.
   */
  /*
   * Fluent's Dropdown carries `min-width: 160px`. A 100 px grid column cannot hold it, so the
   * Year and Month boxes pushed past the card, overlapped each other and gave the whole panel a
   * horizontal scrollbar — the "distorted" comments panel. The floor has to be lifted for the
   * hand-laid canvas widths above to mean anything.
   */
  typeRow: {
    display: "grid", columnGap: "22px", minWidth: 0,
    "& .fui-Dropdown": { minWidth: "unset", width: "100%" },
  },
  typeOnly: { gridTemplateColumns: "250px" },
  typeWithDate: { gridTemplateColumns: "250px 100px 100px" },
  /*
   * `con_Draft_Edit_Comment_Warning` — `CapexScreenCode.txt:9362-9406`. A 40 px strip filled
   * `RGBA(225, 236, 244, 1)` with an information icon and one line of 10 pt text, shown on an
   * equal-distributed contract only.
   */
  warning: {
    display: "flex", alignItems: "center", columnGap: space.s,
    minHeight: "40px",
    paddingTop: space.xs, paddingRight: space.m, paddingBottom: space.xs, paddingLeft: space.m,
    backgroundColor: "#e1ecf4",
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  /*
   * `txt_Read_Comment_Resolved_Tag` — `CapexScreenCode.txt:9769-9794`: a centred pill, fill
   * `RGBA(231, 231, 231, 1)`, 2 px `RGBA(106, 122, 127, 1)` border, fully rounded, 85 x 22,
   * semibold. It replaces the four action icons, it is not a caption next to them.
   */
  resolvedPill: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "85px", height: "22px", flexShrink: 0,
    marginRight: space.xs,
    backgroundColor: "#e7e7e7",
    borderRadius: "20px",
    borderTopWidth: "2px", borderRightWidth: "2px",
    borderBottomWidth: "2px", borderLeftWidth: "2px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "#6a7a7f", borderRightColor: "#6a7a7f",
    borderBottomColor: "#6a7a7f", borderLeftColor: "#6a7a7f",
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
  },
  counterRow: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    columnGap: space.s, marginBottom: space.xxs,
  },
  /* `lbl_Draft_Edit_Comment_Length`: `Align.Right`, `RGBA(89,89,89,1)`, Lighter, `Size: =14`. */
  counter: { color: "#595959", fontSize: tokens.fontSizeBase300 },
  /*
   * `txt_Draft_Edit_Comment_Value.Width = Parent.Width - 40` — the box spans the card, under the
   * whole Type/Year/Month row. Fluent sizes a Textarea to its own content, which left it about a
   * third of the card wide (see `Cost App - Comment Panel contract Row - Comment to payment
   * date.png` for the width it should be).
   */
  commentBox: { width: "100%", maxWidth: "100%" },
  addRow: { marginTop: space.l, display: "flex" },
  addButton: { color: tokens.colorBrandForeground1, paddingLeft: 0 },
});

export interface CommentsPanelProps {
  open: boolean;
  contractId: string | null;
  contractDescription: string;
  breadcrumb: string;
  payments: readonly Payment[];
  distribution: "equal" | "individual";
  onDismiss: () => void;
}

export function CommentsPanel(props: CommentsPanelProps) {
  const { open, contractId, contractDescription, breadcrumb, payments, distribution, onDismiss } = props;
  const styles = useStyles();
  const { session } = useSession();
  const query = useCapexComments(contractId ? [contractId] : []);
  const writes = useCommentWrites();

  const [working, setWorking] = useState<Working[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  /**
   * Comments changed WITHOUT opening an editor — resolve and reopen.
   *
   * The canvas enables Save on `_hasModifiedRecords`, i.e. any `colCapexComments` row with
   * `IsModified = true`, which resolving sets (`CapexScreenCode.txt:9950`). Deriving the draft
   * list from `editingIds` alone meant resolving a thread changed nothing Save could see, so
   * Save stayed disabled and the resolve was silently discarded on dismiss.
   */
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  /**
   * `SelectedYear` — the canvas keeps the year OUTSIDE the cost lookup.
   *
   * `colCapexComments` carries `SelectedYear`, `SelectedMonth` and `RelatedCost` as three separate
   * fields (`CapexScreenCode.txt:7482-7484`): picking a year sets `SelectedYear` and blanks
   * `SelectedMonth` (`:9107-9115`), and only picking a MONTH resolves the CAPEX Cost row and sets
   * `RelatedCost` (`:9229-9252`). A year on its own therefore cannot be represented by `costId`,
   * which is why it lives here instead of being read back off the chosen cost.
   */
  const [yearById, setYearById] = useState<Record<string, number>>({});
  const [pinGeneral, setPinGeneral] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [order, setOrder] = useState<"oldest" | "newest">("oldest");
  /**
   * One flag for the WHOLE commit, not `mutation.isPending`.
   *
   * `commit` awaits a sequence of independent mutations (every delete, then every root, then
   * every reply). `useMutation().isPending` goes false between each pair, so driving the
   * overlay off it made the "Saving comments..." card blink once per row instead of standing
   * still for the save — which is the loader the client reports as wrong.
   */
  const [saving, setSaving] = useState(false);

  /**
   * Seed the editable copy ONCE per opening.
   *
   * Keying the effect on `query.data` alone re-seeded on every background refetch — react-query
   * hands back a new array identity — which threw away whatever the user had typed since.
   */
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { seededFor.current = null; return; }
    if (!query.data || seededFor.current === contractId) return;
    seededFor.current = contractId;
    setWorking(query.data.map((c) => ({ ...c, isNew: false })));
    setDeletedIds([]);
    setEditingIds(new Set());
    setTouchedIds(new Set());
    setYearById({});
  }, [open, contractId, query.data]);

  const threads = useMemo(
    () => sortComments(commentThreads(working), { pinGeneral, order, showResolved }),
    [working, pinGeneral, order, showResolved],
  );

  const originalById = useMemo(
    () => new Map((query.data ?? []).map((c) => [c.id, c])),
    [query.data],
  );

  /*
   * A payment-date comment links to the CAPEX COST row for that month (`vsb_CapexCost`), which
   * is where its year and month come from — the comment itself has neither column. So the
   * Year/Month dropdowns have to resolve to a real `vsb_capexcostid`, and only months that
   * actually have a cost row can be offered. A payment with no `id` has not been saved yet and
   * has nothing to point at.
   */
  const costOptions = useMemo<CostOption[]>(
    () => payments
      .filter((p) => p.id)
      .map((p) => ({ id: p.id as string, year: p.year, month: p.month }))
      .sort((a, b) => a.year - b.year || a.month - b.month),
    [payments],
  );
  const costById = useMemo(
    () => new Map(costOptions.map((c) => [c.id, c])),
    [costOptions],
  );
  /*
   * The canvas freezes the whole Type dropdown on an equal-distributed contract
   * (`drp_Draft_Edit_Type_Value.DisplayMode`, `CapexScreenCode.txt:8978-8983`) and explains why
   * with `con_Draft_Edit_Comment_Warning` (`:9362-9406`).
   */
  const equalDistribution = !paymentDateCommentsAllowed({ distribution });
  // Offering "Comments to payment date" with nothing to attach it to is how a comment ends up
  // with a null `vsb_CapexCost` and no dot forever (`paymentDateComplete`). The canvas has no
  // such check — it offers the type and then shows an empty Year list — so this is the one
  // deliberate addition to the dropdown.
  const canPaymentDate = !equalDistribution && costOptions.length > 0;

  const patch = (id: string, fields: Partial<Working>) =>
    setWorking((w) => w.map((c) => (c.id === id ? { ...c, ...fields } : c)));

  const addComment = () => {
    if (!contractId || !session) return;
    const id = `draft-${crypto.randomUUID()}`;
    setWorking((w) => [...w, {
      id, text: "", contractId, costId: null, parentId: null, rootId: null,
      commentType: COMMENT_TYPE.general, resolved: false, resolvedById: null,
      createdOn: new Date().toISOString(), createdByName: session.fullName ?? "",
      isNew: true,
    }]);
    setEditingIds((s) => new Set(s).add(id));
  };

  const addReply = (root: CommentThread) => {
    if (!contractId || !session) return;
    const id = `draft-${crypto.randomUUID()}`;
    setWorking((w) => [...w, {
      id, text: "", contractId, costId: root.root.costId, parentId: root.root.id,
      rootId: root.root.id, commentType: root.root.commentType, resolved: false,
      resolvedById: null, createdOn: new Date().toISOString(),
      createdByName: session.fullName ?? "", isNew: true,
    }]);
    setEditingIds((s) => new Set(s).add(id));
  };

  const startEdit = (id: string) => setEditingIds((s) => new Set(s).add(id));

  /**
   * Deleting a root takes its replies with it — `img_Read_Comment_Delete.OnSelect`,
   * `CapexScreenCode.txt:9533-9557`: stage `Filter(colCapexComments, id = ThisItem.id Or
   * ParentCommentID = GUID(ThisItem.id))` into `colDeletedComments`, then `RemoveIf` the children
   * and `Remove` the parent locally.
   *
   * REPLIES FIRST in the staged order. The canvas stages them in collection order and hopes; a
   * root deleted before its replies leaves `vsb_parentcomment` pointing at a row that is gone,
   * which is a 400 under a restricted relationship and a silent orphan under a referential one.
   * Children first is correct under either.
   */
  const deleteWorking = (id: string) => {
    const isRoot = working.some((c) => c.id === id && c.parentId === null);
    const ids = isRoot
      ? [...working.filter((c) => c.parentId === id).map((c) => c.id), id]
      : [id];
    setWorking((w) => w.filter((c) => !ids.includes(c.id)));
    setDeletedIds((d) => [...d, ...ids.filter((x) => !isTemp(x))]);
    const forget = (s: Set<string>) => {
      const next = new Set(s); ids.forEach((x) => next.delete(x)); return next;
    };
    setEditingIds(forget);
    setTouchedIds(forget);
  };

  /** Resolving a root resolves its replies, so every one of them becomes savable. */
  const markTouched = (rootId: string) =>
    setTouchedIds((s) => {
      const next = new Set(s);
      for (const c of working) if (c.id === rootId || c.parentId === rootId) next.add(c.id);
      return next;
    });

  /**
   * Resolving CLOSES any editor on the thread.
   *
   * `img_Read_Comment_Check.OnSelect` patches `{Resolved: Yes, IsModified: true, Resolver: …,
   * IsEdit: false, IsNew: false}` (`CapexScreenCode.txt:9683-9689`) — the last two matter, because
   * a resolved row's card is read-only and leaving an editor open on it strands a card the canvas
   * would have closed.
   */
  const closeEditors = (rootId: string) =>
    setEditingIds((s) => {
      const next = new Set(s);
      for (const c of working) if (c.id === rootId || c.parentId === rootId) next.delete(c.id);
      return next;
    });

  const resolve = (rootId: string) => {
    setWorking((w) => resolveThread(w, rootId, session?.entraObjectId ?? "") as Working[]);
    markTouched(rootId);
    closeEditors(rootId);
  };
  const reopen = (rootId: string) => {
    setWorking((w) => reopenThread(w, rootId) as Working[]);
    markTouched(rootId);
  };

  /**
   * Switching type BLANKS the date, as the canvas does.
   *
   * `drp_Draft_Edit_Type_Value.OnChange` patches `{IsGeneralComment: …, IsModified: true,
   * SelectedMonth: Blank(), SelectedYear: Blank(), IsRoot: true}`
   * (`CapexScreenCode.txt:8995-9009`). Auto-selecting the contract's first cost row instead —
   * which is what this did — silently bound the comment to a month the user never picked and
   * never saw, and made `paymentDateComplete` unreachable so the `Required` message could never
   * fire. Now the Year/Month fields open empty and Save stays refused until both are chosen.
   */
  const changeType = (id: string, commentType: number) => {
    patch(id, { commentType, costId: null });
    setYearById((y) => { const next = { ...y }; delete next[id]; return next; });
  };

  /** Picking a year blanks the month — `:9107-9115`, `{SelectedYear: …, SelectedMonth: Blank()}`. */
  const changeYear = (id: string, year: number) => {
    setYearById((y) => ({ ...y, [id]: year }));
    patch(id, { costId: null });
  };

  const selectedYearOf = (c: Working): number | null =>
    yearById[c.id] ?? (c.costId ? costById.get(c.costId)?.year ?? null : null);

  const drafts = [...new Set([...editingIds, ...touchedIds])].map((id) => {
    const c = working.find((x) => x.id === id);
    const original = originalById.get(id);
    return {
      id, text: c?.text ?? "",
      isDirty: c ? c.text !== (original?.text ?? "") : false,
      isModified: c && original
        ? c.resolved !== original.resolved || c.commentType !== original.commentType
          || c.costId !== original.costId
        : Boolean(c?.isNew),
      // Replies inherit their root's type but never its cost editor, so only roots can be
      // incomplete here.
      missingPaymentDate: Boolean(c && c.parentId === null && !paymentDateComplete(c)),
      // `(ThisItem.IsNew Or ThisItem.IsEdit)` — only a card with its editor open can be invalid
      // (`tgl_Root_IsInvalid`, `:9885`). A row that was merely resolved must not deadlock Save.
      isOpen: editingIds.has(id),
    };
  });
  const valid = canSaveComments(drafts, deletedIds);
  const incomplete = new Set(drafts.filter((d) => d.missingPaymentDate).map((d) => d.id));

  const commit = async () => {
    if (!contractId) return;
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS — the same order every other save on
     * this app follows (`CapexScreenCode.txt:17413`, `OpexCostScreenCode.txt:8695`), and the
     * one the client's reference screenshot names outright: "Panel Closes and Spinner is shown".
     * Dismissing after the writes drew the saving spinner on top of the panel it was saving,
     * which on a thread with several changed comments is the whole visible duration of the save.
     */
    setSaving(true);
    onDismiss();
    try {
      for (const id of deletedIds) await writes.remove.mutateAsync(id);

      const idMap = new Map<string, string>();
      /*
       * SOURCE DEFECT: N-4 — the sequence number is persisted into the row's `Name`
       * (`Name: $"Comment - {SequenceNumber} - {User().FullName}"`, `CapexScreenCode.txt:10012`),
       * and it is assigned client-side by position, oldest root first. Deleting a thread
       * therefore renumbers the survivors and the next save rewrites the stored `Name` of
       * comments nobody edited. Reproduced, not fixed — see `docs/01-BUGS-FOUND.md` N-4.
       *
       * The ordering IS load-bearing though: `renumberThreads` numbers by `createdOn`, and the
       * panel's `Comment #01` headers come from it. Numbering by array position instead — which
       * is what this did — gave the saved `Name` a different number from the one on screen.
       */
      const roots = working
        .filter((c) => c.parentId === null && !deletedIds.includes(c.id))
        .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
      for (let i = 0; i < roots.length; i += 1) {
        const c = roots[i] as Working;
        const original = originalById.get(c.id);
        const changed = c.isNew || !original
          || c.text !== original.text || c.resolved !== original.resolved
          || c.commentType !== original.commentType || c.costId !== original.costId;
        if (!changed) { idMap.set(c.id, c.id); continue; }
        const realId = await writes.save.mutateAsync({
          id: c.isNew ? undefined : c.id, text: c.text, contractId,
          costId: c.costId ?? undefined, commentType: c.commentType, resolved: c.resolved,
          resolvedById: c.resolvedById ?? undefined, sequenceNumber: i + 1,
          // `User().FullName` — the canvas stamps whoever is SAVING into `Name`, not the author
          // (`:10012`; see `commentName` for the live row that proves the two differ).
          authorFullName: session?.fullName ?? "",
        });
        idMap.set(c.id, realId);
      }
      const replies = working.filter((c) => c.parentId !== null && !deletedIds.includes(c.id));
      for (const c of replies) {
        const original = originalById.get(c.id);
        const changed = c.isNew || !original || c.text !== original.text
          || c.resolved !== original.resolved;
        if (!changed) continue;
        const parentId = idMap.get(c.parentId as string) ?? (c.parentId as string);
        await writes.save.mutateAsync({
          id: c.isNew ? undefined : c.id, text: c.text, contractId,
          costId: c.costId ?? undefined, parentId, rootId: parentId,
          commentType: c.commentType, resolved: c.resolved,
          resolvedById: c.resolvedById ?? undefined,
          // A reply has NO sequence number (`:7435-7439`), and the canvas writes that blank into
          // `Name`: every live reply is called `Comment -  - <name>`. `0` would have written
          // `Comment - 0 - <name>`, which no canvas row has.
          sequenceNumber: null, authorFullName: session?.fullName ?? "",
        });
      }
      // NOTES 4 of the integration spec: re-fetch so the grid's red dots refresh.
      writes.invalidate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormPanel open={open} width="comments" title={commentPanelTitle(contractDescription)}
        onDismiss={onDismiss}
        footer={<PanelButtons onSave={() => { void commit(); }} onCancel={onDismiss}
          disabled={!valid || saving} />}>
        <Text className={styles.breadcrumb} title={breadcrumb}>
          {commentBreadcrumb(breadcrumb)}
        </Text>

        <div className={styles.filters}>
          <div className={styles.sortBy}>
            <Field label="Sort by">
              <Dropdown value={order === "oldest" ? "Date added [Oldest]" : "Date added [Newest]"}
                selectedOptions={[order]}
                onOptionSelect={(_, d) => setOrder(d.optionValue as "oldest" | "newest")}>
                <Option value="oldest">Date added [Oldest]</Option>
                <Option value="newest">Date added [Newest]</Option>
              </Dropdown>
            </Field>
          </div>
          <div className={styles.checkboxes}>
            <Checkbox label="Pin general comments to top" checked={pinGeneral}
              onChange={(_, d) => setPinGeneral(Boolean(d.checked))} />
            <Checkbox label="Show resolved comments" checked={showResolved}
              onChange={(_, d) => setShowResolved(Boolean(d.checked))} />
          </div>
        </div>

        {query.isLoading ? <LoadingOverlay mode="inline" label="Loading comments..." /> : null}

        <div className={styles.threads}>
          {threads.map((thread) => (
            <div key={thread.root.id} className={styles.thread}>
              {editingIds.has(thread.root.id) ? (
                <DraftCard comment={working.find((c) => c.id === thread.root.id) as Working}
                  sequenceNumber={thread.sequenceNumber} isRoot
                  canPaymentDate={canPaymentDate} equalDistribution={equalDistribution}
                  costOptions={costOptions}
                  selectedYear={selectedYearOf(
                    working.find((c) => c.id === thread.root.id) as Working)}
                  missingPaymentDate={incomplete.has(thread.root.id)}
                  onChangeText={(t) => patch(thread.root.id, { text: t })}
                  onChangeType={(commentType) => changeType(thread.root.id, commentType)}
                  onChangeYear={(year) => changeYear(thread.root.id, year)}
                  onChangeCost={(costId) => patch(thread.root.id, { costId })}
                  onDelete={() => deleteWorking(thread.root.id)} />
              ) : (
                <ReadCard comment={thread.root} sequenceNumber={thread.sequenceNumber}
                  cost={thread.root.costId ? costById.get(thread.root.costId) : undefined}
                  onEdit={() => startEdit(thread.root.id)}
                  onDelete={() => deleteWorking(thread.root.id)}
                  onResolve={() => resolve(thread.root.id)} onReopen={() => reopen(thread.root.id)}
                  onReply={() => addReply(thread)} />
              )}
              {thread.replies.map((reply) => (
                <div key={reply.id} className={styles.reply}>
                  {editingIds.has(reply.id) ? (
                    <DraftCard comment={working.find((c) => c.id === reply.id) as Working}
                      sequenceNumber={0} isRoot={false}
                      canPaymentDate={false} equalDistribution={false} costOptions={[]}
                      selectedYear={null} missingPaymentDate={false}
                      onChangeText={(t) => patch(reply.id, { text: t })}
                      onChangeType={() => {}} onChangeYear={() => {}} onChangeCost={() => {}}
                      onDelete={() => deleteWorking(reply.id)} />
                  ) : (
                    <ReadCard comment={reply} sequenceNumber={null} cost={undefined}
                      onEdit={() => startEdit(reply.id)} onDelete={() => deleteWorking(reply.id)}
                      onResolve={() => {}} onReopen={() => {}} onReply={() => {}} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/*
          * `con_Comment_Add_Button` / `btn_Add_Comment` — `CapexScreenCode.txt:8808-8906`.
          *
          * In the canvas this is not a free-floating button under the list: it is a REAL ITEM of
          * `gal_Capex_Comments`, a `{IsButton: true}` row appended to `colCapexComments` at load
          * (`:7465-7488`) and re-appended after every add (`:8881-8903`), held at the bottom by
          * tier 1 of the gallery sort — `If(IsButton, 1, 0)` Ascending (`:8309-8315`). It is
          * therefore ALWAYS present: there is no `Visible` that hides it, it survives
          * `Show resolved comments` being off because the placeholder's `Resolved` is `No`
          * (`:7478`), and it renders in the empty state too. Rendering it after the mapped threads
          * puts it in exactly that position, so the gallery-item mechanics are not reproduced —
          * only the placement is. It suppresses its own separator (`:8351-8355`,
          * `Or(IsButton <> true, Not(IsBlank(SequenceNumber)))` is false for the placeholder).
          *
          * The canvas has no empty-state text; an empty contract shows this row and nothing else.
          */}
        <div className={styles.addRow}>
          <Button appearance="transparent" className={styles.addButton} icon={<AddRegular />}
            onClick={addComment} disabled={!contractId}>Add Comment</Button>
        </div>
      </FormPanel>
      {/*
        * Rendered OUTSIDE the drawer on purpose. `LoadingOverlay`'s blocking mode is a
        * `position: fixed` scrim centred on the viewport — the "Saving comments..." card in the
        * Saving screenshot sits over the GRID, left of the panel, not inside it. Nested in
        * `DrawerBody` it was laid out in the panel's own scrolling column instead.
        */}
      {saving ? <LoadingOverlay label="Saving comments..." /> : null}
    </>
  );
}

/**
 * One saved comment — `con_Comment_Read_Only`, `CapexScreenCode.txt:9407-9507`.
 *
 * Four stacked labels, all size 14, `App.Theme.Font`, left padding 12:
 *
 *   lbl_Read_Header      `Comment #NN [Full Name - dd.mm.yyyy]` grey RGBA(89,89,89) Lighter (:9437)
 *   lbl_Read_Type_Title  `Type`        same grey, Lighter, +10 px                      (:9451)
 *   lbl_Read_Type_Value  see `commentTypeValue`, black RGBA(0,0,0) Semibold, +2 px     (:9466)
 *   lbl_Read_Comment_Title `Comment`   same grey, Lighter, +10 px                      (:9489)
 *   lbl_Read_Comment_Value `ThisItem.Comment` black Semibold, +2 px                    (:9504)
 *
 * The REPLY card (`con_Reply_Comment_Read_Only`, `:8456-8516`) is the same minus the `Type` pair,
 * with `Reply [Full Name - dd.mm.yyyy]` as its heading (`:8484`) — which is why `Type` is rendered
 * only for a root here.
 */
function ReadCard(props: {
  comment: CapexComment; sequenceNumber: number | null;
  cost: { year: number; month: number } | undefined;
  onEdit: () => void; onDelete: () => void; onResolve: () => void; onReopen: () => void;
  onReply: () => void;
}) {
  const { comment, sequenceNumber, cost, onEdit, onDelete, onResolve, onReopen, onReply } = props;
  const styles = useStyles();
  const isReply = sequenceNumber === null;
  const editable = commentEditable({ resolved: comment.resolved });
  return (
    <div className={styles.readCard}>
      <div className={styles.headRow}>
        <Text className={styles.headLabel}>{commentHeading(comment, sequenceNumber)}</Text>
        {editable ? (
          <div className={styles.actions}>
            {!isReply ? (
              <Button appearance="transparent" size="small" className={styles.actionButton}
                icon={<ArrowReplyRegular />} onClick={onReply} aria-label="Reply" />
            ) : null}
            {!isReply ? (
              <Button appearance="transparent" size="small" className={styles.actionButton}
                icon={<CheckmarkCircleRegular />} onClick={onResolve}
                aria-label="Mark as Resolved" />
            ) : null}
            <Button appearance="transparent" size="small" className={styles.actionButton}
              icon={<EditRegular />} onClick={onEdit} aria-label="Edit" />
            <Button appearance="transparent" size="small" className={styles.actionButton}
              icon={<DeleteRegular />} onClick={onDelete} aria-label="Delete" />
          </div>
        ) : isReply ? null : (
          /*
           * The `Resolved` pill and `Reset` live in `con_Comment_Read_Only` ONLY — the reply card
           * (`:8456-8516`) has no equivalent of either, so a resolved reply shows its heading and
           * its comment and nothing else. Rendering a pill and a dead Reset button on it, which is
           * what this did, invented a control the canvas has not got.
           */
          <div className={styles.actions}>
            <Text className={styles.resolvedPill}>Resolved</Text>
            <Button appearance="transparent" size="small" className={styles.actionButton}
              icon={<ArrowUndoRegular />} onClick={onReopen} aria-label="Reset" />
          </div>
        )}
      </div>
      {!isReply
        ? <ReadValue label="Type" value={commentTypeValue(comment.commentType, cost)} />
        : null}
      <ReadValue label="Comment" value={comment.text} />
    </div>
  );
}

/** The screenshot's read-only pair: a small grey caption over a semibold value. */
function ReadValue({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <div className={styles.readValue}>
      <Text className={styles.readLabel}>{label}</Text>
      <Text className={styles.readText}>{value}</Text>
    </div>
  );
}

/**
 * The edit card — `con_Comment_Draft_Edit` (`CapexScreenCode.txt:8907-8925`) and its reply twin
 * `con_Reply_Comment_Draft_Edit` (`:8660-8675`): a 0.5 px dotted `RGBA(125,125,125,1)` box with
 * 8 px corners, `Visible: Not(IsButton) && (IsNew || IsEdit)`.
 *
 * Contents, in canvas order:
 *   lbl_Draft_Edit_Header      `$"Comment #{Text(SequenceNumber,"00")}"`            (:8939)
 *                              reply: `"Reply to comment"`                          (:8691)
 *   img_Draft_Edit_Delete      the ONLY icon on an open card, top-right             (:9261)
 *   con_Draft_Edit_Comment_Warning  equal-distribution info strip                   (:9362)
 *   lbl/drp Type (250)  lbl/drp Year (100)  lbl/drp Month (100)                     (:8942-9260)
 *   lbl_Draft_Edit_Comment_Title `Comment` + lbl_Draft_Edit_Comment_Length `n / 250`(:9014,:9358)
 *   txt_Draft_Edit_Comment_Value multiline, MaxLength 250, height 60                (:9029)
 *
 * Year and Month are `Visible: And(ThisItem.IsGeneralComment = false)` (`:9066`, `:9117`, `:9134`,
 * `:9254`), and a reply has no Type/Year/Month at all.
 */
function DraftCard(props: {
  comment: Working | undefined; sequenceNumber: number; isRoot: boolean; canPaymentDate: boolean;
  equalDistribution: boolean;
  costOptions: readonly CostOption[]; selectedYear: number | null; missingPaymentDate: boolean;
  onChangeText: (text: string) => void; onChangeType: (type: number) => void;
  onChangeYear: (year: number) => void;
  onChangeCost: (costId: string | null) => void; onDelete: () => void;
}) {
  const {
    comment, sequenceNumber, isRoot, canPaymentDate, equalDistribution, costOptions, selectedYear,
    missingPaymentDate, onChangeText, onChangeType, onChangeYear, onChangeCost, onDelete,
  } = props;
  const styles = useStyles();
  if (!comment) return null;
  const { counter } = truncateComment(comment.text);
  const isPaymentDate = comment.commentType === COMMENT_TYPE.paymentDate;
  const selectedCost = costOptions.find((c) => c.id === comment.costId);
  const years = commentYearOptions(costOptions);
  const monthsInYear = commentMonthOptions(costOptions, selectedYear);
  return (
    <div className={styles.card}>
      <div className={styles.headRow}>
        <Text className={styles.headLabel}>
          {isRoot ? `Comment #${String(sequenceNumber).padStart(2, "0")}` : "Reply to comment"}
        </Text>
        <div className={styles.actions}>
          <Button appearance="transparent" size="small" className={styles.actionButton}
            icon={<DeleteRegular />} onClick={onDelete} aria-label="Delete" />
        </div>
      </div>
      {isRoot && equalDistribution ? (
        <div className={styles.warning} role="note">
          <InfoRegular />
          <Text>{PAYMENT_DATE_NOT_ALLOWED}</Text>
        </div>
      ) : null}
      {isRoot ? (
        <div className={mergeClasses(
          styles.typeRow, isPaymentDate ? styles.typeWithDate : styles.typeOnly,
        )}>
          <Field label="Type">
            {/*
              * `DisplayMode.View` on an equal-distributed contract (`:8978-8983`) — the canvas
              * freezes the whole control rather than greying one option.
              */}
            <Dropdown value={commentTypeLabel(comment.commentType)}
              disabled={equalDistribution}
              selectedOptions={[String(comment.commentType)]}
              onOptionSelect={(_, d) => onChangeType(Number(d.optionValue))}>
              <Option value={String(COMMENT_TYPE.general)}>General Comment</Option>
              <Option value={String(COMMENT_TYPE.paymentDate)} disabled={!canPaymentDate}>
                Comments to payment date
              </Option>
            </Dropdown>
          </Field>
          {isPaymentDate ? (
            <>
              <Field label="Year"
                validationState={missingPaymentDate ? "error" : "none"}
                validationMessage={missingPaymentDate ? "Required" : undefined}>
                <Dropdown value={selectedYear === null ? "" : String(selectedYear)}
                  selectedOptions={selectedYear === null ? [] : [String(selectedYear)]}
                  onOptionSelect={(_, d) => onChangeYear(Number(d.optionValue))}>
                  {years.map((y) => <Option key={y} value={String(y)}>{String(y)}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Month">
                <Dropdown
                  value={selectedCost ? MONTH_NAMES[selectedCost.month - 1] ?? "" : ""}
                  selectedOptions={comment.costId ? [comment.costId] : []}
                  disabled={selectedYear === null}
                  onOptionSelect={(_, d) => onChangeCost(d.optionValue ?? null)}>
                  {monthsInYear.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {MONTH_NAMES[c.month - 1] ?? String(c.month)}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </>
          ) : null}
        </div>
      ) : null}
      <div>
        {/* The counter sits on the label line, right-aligned — `Comment        9 / 250`. */}
        <div className={styles.counterRow}>
          <Text className={styles.readLabel}>Comment</Text>
          <Text className={styles.counter}>{counter}</Text>
        </div>
        <Textarea className={styles.commentBox} value={comment.text} rows={3} aria-label="Comment"
          onChange={(_, d) => onChangeText(d.value)} maxLength={COMMENT_MAX_LENGTH} />
      </div>
    </div>
  );
}
