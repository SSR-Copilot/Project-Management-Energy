/**
 * DEVEX/CAPEX comments — Dataverse access for stage 2.4.
 *
 * `vsb_capexcommentses`. There is no year/month column on the comment itself; a payment-date
 * comment points at the CAPEX cost row for that month via `vsb_CapexCost`, which is where
 * `CommentThread.relatedCostId` comes from.
 */
import { Vsb_capexcommentsesService } from "@/generated/services/Vsb_capexcommentsesService";
import { unwrap } from "@/platform/errors";
import { fetchAll } from "./client";
import { ACTIVE, and, lookupIn } from "./odata";
import { chunk } from "./odata";
import { COMMENT_TYPE, commentName, type CapexComment } from "@/features/capex-costs/comments";

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * The comment author's display name.
 *
 * NOT `createdbyname`. The generated model exposes it — the SDK emits a field for every `*name`
 * the entity's metadata lists — but it is a formatted-value ALIAS of the `createdby` lookup, not
 * a queryable attribute, so `$select=createdbyname` is rejected by the Web API. One bad `$select`
 * term fails the WHOLE request, which is why every comment read was returning nothing and no red
 * dot ever rendered on the grid. `_createdby_value` is the real attribute; its label arrives in
 * the standard FormattedValue annotation at no extra cost.
 */
function authorName(source: object): string | null {
  const row = source as Record<string, unknown>;
  const formatted = row[`_createdby_value@OData.Community.Display.V1.FormattedValue`];
  if (typeof formatted === "string" && formatted !== "") return formatted;
  const legacy = row["createdbyname"];
  return typeof legacy === "string" && legacy !== "" ? legacy : null;
}

/**
 * Every comment on a set of contracts, flattened for `commentThreads` to group.
 *
 * This is `colCapexCommentsInSelectedContracts` (`Comments_PCF_CodeSnippets.txt` Snippet 1,
 * live at `CapexScreenCode.txt:920-924`). It serves both callers: the panel asks for one
 * contract, the DEVEX/CAPEX screen asks for every contract in the open category so the grid's
 * red dots can be computed — the canvas loads the whole category in one go for the same reason.
 *
 * DELIBERATE NARROWING vs the canvas. The canvas filter is
 *
 *   Contract in colCapexContractsInSelectedCategory || Cost in colCapexCostsInSelectedContracts
 *
 * and the `Cost in …` half is dropped here. Every writer of this table sets the contract lookup
 * on every row, replies and payment-date comments included — the canvas' own Patch does it
 * unconditionally (`'Capex Contract': locSelectedProjectContract`, `CapexScreenCode.txt:10014`)
 * and so does `saveComment` below — so the second clause selects nothing the first does not.
 * Keeping it would mean one request per 40 COST ids (thousands per project, against ~tens of
 * contract ids), which is the fetch-everything shape this rebuild exists to remove. A row that
 * somehow carries only the cost lookup is still handled downstream: `gridCommentIndicators`
 * resolves its contract through the cost, exactly as the canvas' `Coalesce` does.
 *
 * MEASURED, 2026-09-16, VSBCloud_Dev (`pac org fetch`, `vsb_capexcomments`):
 * `<condition attribute="vsb_capexcontract" operator="null" />` returns ZERO rows out of 27.
 * Not one comment in the org — canvas-written or code-app-written, root or reply, general or
 * payment-date — lacks the contract lookup, so the dropped half would load nothing extra. The
 * one row that IS half-linked is the opposite case: a payment-date comment with a contract and
 * NO cost (see `paymentDateComplete` in `features/capex-costs/comments.ts`), which the `Cost in
 * …` clause would not have rescued either. Restoring it is therefore cost without benefit, and
 * it cannot be done in this file alone: the cost ids live on the cost book, so the screen would
 * have to pass them down through `useCapexComments`.
 */
export async function loadComments(contractIds: readonly string[]): Promise<CapexComment[]> {
  if (contractIds.length === 0) return [];
  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list CAPEX comments",
        (o) => Vsb_capexcommentsesService.getAll(o),
        {
          select: [
            "vsb_capexcommentsid", "vsb_comment", "_vsb_capexcontract_value",
            "_vsb_capexcost_value", "_vsb_parentcomment_value", "_vsb_rootcomment_value",
            "vsb_commenttype", "vsb_resolved", "_vsb_resolvedby_value",
            "createdon", "_createdby_value",
          ],
          filter: and(lookupIn("vsb_capexcontract", ids), ACTIVE),
        },
      ),
    ),
  );
  return batches.flat().map((r) => ({
    id: r.vsb_capexcommentsid,
    text: r.vsb_comment ?? "",
    contractId: r._vsb_capexcontract_value ?? null,
    costId: r._vsb_capexcost_value ?? null,
    parentId: r._vsb_parentcomment_value ?? null,
    rootId: r._vsb_rootcomment_value ?? null,
    commentType: numberOf(r.vsb_commenttype) ?? COMMENT_TYPE.general,
    resolved: r.vsb_resolved === true,
    resolvedById: r._vsb_resolvedby_value ?? null,
    createdOn: r.createdon ?? new Date(0).toISOString(),
    createdByName: authorName(r),
  }));
}

export interface SaveCommentArgs {
  id?: string;
  text: string;
  contractId: string;
  costId?: string;
  parentId?: string;
  rootId?: string;
  commentType: number;
  resolved: boolean;
  resolvedById?: string;
  /** `null` for a reply — the canvas blanks it, and the blank lands in `Name`. */
  sequenceNumber: number | null;
  /** `User().FullName`, i.e. whoever is SAVING — see `commentName`. */
  authorFullName: string;
  owningBusinessUnitId?: string;
}

/**
 * Creates or updates one comment row.
 *
 * The payload is the canvas' single `Patch('Capex Comments', …)` (`CapexScreenCode.txt:9997-10039`),
 * which writes the SAME field set whether the row is new or existing:
 *
 *   Name:            $"Comment - {SequenceNumber} - {User().FullName}"   (:10012)
 *   Comment:         _currentComment.Comment                             (:10013)
 *   'Capex Contract':locSelectedProjectContract                          (:10014) — unconditional
 *   'Comment Type':  If(IsGeneralComment, General Comment, Comments to payment date) (:10015)
 *   Resolved:        _currentComment.Resolved                            (:10020)
 *   'Resolved By':   _currentComment.Resolver                            (:10021)
 *   'Parent Comment':If(IsRoot = false, recRootComment, Blank())         (:10022)
 *   'Capex Cost':    If(IsGeneralComment = false, RelatedCost, Blank())  (:10027)
 *   'Root Comment':  If(IsRoot = false, recRootComment, Blank())         (:10032)
 *
 * All nine are written here. Writing the same set on an update matters for the lookups: switching
 * an existing comment from "Comments to payment date" to "General Comment", or moving it to a
 * different month, only takes effect if the update rewrites `vsb_CapexCost`. Writing the scalar
 * fields alone — which is what this did — left the old cost attached, so the comment kept its dot
 * on the month the user had just moved it off.
 *
 * `vsb_CapexCost` is cleared for a General Comment, and `vsb_ParentComment`/`vsb_RootComment`
 * for a root, mirroring the canvas' `If(…, …, Blank())` on each of the three. `Root Comment` and
 * `Parent Comment` get the SAME record in the canvas (`recRootComment` is looked up from
 * `ParentCommentID`), which is why replies are one level deep and no deeper.
 *
 * DELIBERATE DIVERGENCE, both in the caller's favour:
 *
 *   - the canvas patches EVERY row on every save (`ForAll(Filter(colCapexComments, IsButton <>
 *     true), Patch(…))`, `:9992-9996`) — 27 writes to change one word, each of them rewriting
 *     `Name` with the saving user's name. This writes only the rows that changed.
 *   - the canvas has no create/update split and no `owningbusinessunit`. Omitting the BU never
 *     errors, it just derives it from the CALLER, which quietly hides the row from the project's
 *     own team later. See `capexWrites.ts` and BUGS-FOUND S-5.
 *
 * SOURCE DEFECT: N-4 — `vsb_name` carries the thread's client-assigned sequence number
 * (`commentName`), so deleting a thread renumbers the survivors and the next save rewrites their
 * stored `Name`. Reproduced deliberately; see `docs/01-BUGS-FOUND.md` N-4.
 */
export async function saveComment(args: SaveCommentArgs): Promise<string> {
  const isGeneral = args.commentType === COMMENT_TYPE.general;
  const costId = isGeneral ? undefined : args.costId;
  const scalars = {
    vsb_name: commentName(args.sequenceNumber, args.authorFullName),
    vsb_comment: args.text,
    vsb_commenttype: args.commentType,
    vsb_resolved: args.resolved,
    "vsb_CapexContract@odata.bind": bind("vsb_capexprojectcontracts", args.contractId),
  };
  /**
   * The three lookups the canvas writes conditionally, plus the resolver.
   *
   * `vsb_resolvedby` points at **aaduser**, not systemuser
   * (`vsb_capexcomments_ResolvedBy_aaduser` in customizations.xml), so the value is the resolver's
   * Entra object id. MEASURED 2026-09-16 on VSBCloud_Dev: the resolved rows
   * `209b7556-12b0-f111-aaac-7ced8d15d85e` and `48eef580-12b0-f111-aaac-6045bd98c286` link to
   * `aaduser` `a26645ca-b7b5-4642-80cd-095628456979`, which is byte-for-byte
   * `systemuser.azureactivedirectoryobjectid` for `shakti.singh@vsb.energy`. `aaduserid` IS the
   * Entra object id, so binding `/aadusers(Session.entraObjectId)` resolves to the right row.
   */
  const links: Record<string, string | null> = {
    "vsb_CapexCost@odata.bind": costId ? bind("vsb_capexcosts", costId) : null,
    "vsb_ParentComment@odata.bind": args.parentId
      ? bind("vsb_capexcommentses", args.parentId) : null,
    "vsb_RootComment@odata.bind": args.rootId
      ? bind("vsb_capexcommentses", args.rootId) : null,
    "vsb_ResolvedBy@odata.bind": args.resolvedById
      ? bind("aadusers", args.resolvedById) : null,
  };
  if (args.id) {
    // UPDATE keeps the nulls. They are the whole point: switching an existing comment from
    // "Comments to payment date" to "General Comment", or moving it to a different month, only
    // takes effect if the PATCH rewrites `vsb_CapexCost`, and `@odata.bind: null` is the only
    // disassociation this data layer has — `_vsb_capexcost_value` is the READ form and Dataverse
    // rejects it in a write payload (`docs/CONVENTIONS.md`).
    unwrap(
      await Vsb_capexcommentsesService.update(args.id, { ...scalars, ...links } as never),
      "update CAPEX comment",
    );
    return args.id;
  }
  // CREATE drops them. A brand-new row has nothing to disassociate, and a null `@odata.bind` in
  // a POST body is not a "clear this lookup" instruction — it is a null where OData expects an
  // entity reference. Every other create in this codebase (`capexWrites.ts`, `addCostSheet.ts`,
  // `contracts.ts`, `periodWrites.ts`) omits the key instead; this was the only one that sent
  // `null`, and it sent four of them on every new General Comment.
  const created = unwrap(
    await Vsb_capexcommentsesService.create({
      ...scalars,
      ...Object.fromEntries(Object.entries(links).filter(([, v]) => v !== null)),
      // Every create on a project-scoped table writes the owning business unit explicitly —
      // omitting it never errors, it just derives the BU from the CALLER, which quietly hides
      // the row from the project's own team later. See `capexWrites.ts` and BUGS-FOUND S-5.
      ...(args.owningBusinessUnitId
        ? { "owningbusinessunit@odata.bind": bind("businessunits", args.owningBusinessUnitId) }
        : {}),
    } as never),
    "create CAPEX comment",
  );
  return created.vsb_capexcommentsid;
}

export async function deleteComment(id: string): Promise<void> {
  await Vsb_capexcommentsesService.delete(id);
}
