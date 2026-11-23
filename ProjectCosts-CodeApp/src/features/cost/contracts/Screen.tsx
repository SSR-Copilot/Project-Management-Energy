/**
 * Contracts screen — composition only.
 *
 * Canvas screen: `Contracts Screen` (Project Costs app), 243 controls · 7,835 lines Power Fx.
 * Every decision on this screen lives in `rules.ts` and is unit-tested; every query lives in
 * `hooks.ts`. This file lays things out and moves local UI state.
 *
 * Structure, matching the canvas containers:
 *   command bar               `cmd_Contracts_CommandBar`
 *   contract cards            `gal_Contracts_List` → `con_Contracts_List_Card`
 *     payment targets table   `gal_Contracts_List_Card_Body_PaymentTargets`
 *   right panel: contract     `con_Contracts_RightPanel_NewEdit` (Dev / Construction)
 *   right panel: rights       `con_Contracts_RightPanel_NewEdit_RightsContract`
 *   right panel: target       `con_Contracts_RightPanel_NewEdit_PaymentTarget`
 *   two delete confirmations  `cmp_OpexCosts_PopUpConfirmation_Delete{Contracts,PaymentTarget}`
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, MessageBar, MessageBarBody, MessageBarTitle, Text, makeStyles, mergeClasses,
} from "@fluentui/react-components";
// The canvas classic scrollbar (10 px), shared with Land Lease and OPEX — the DevCo leaf list uses it too (D124).
import { canvasScrollbar } from "@/features/cost/periods/canvasScrollbar";
// The v9 date picker ships separately from the core package.
import { DatePicker } from "@fluentui/react-datepicker-compat";
import {
  AddRegular, ArrowClockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import {
  Choices,
  type Command,
  CommandBar,
  ConfirmDialog,
  CostField,
  EmptyState,
  FormPanel,
  PanelButtons,
  useCommandBarStyles,
  useCommandRowStyles,
  ExpandChevron,
  LoadingOverlay,
  WriteStatus,
} from "@/components";
/*
 * The CANVAS field kit, not the Fluent one.
 *
 * `CostField` / `Choices` / `PanelButtons` render `.canvas-field` and `.canvas-radio-group`
 * from `src/styles/canvas.css`, which are transcribed from the canvas panels: the red `*`
 * sits BEFORE the label, inputs are 32 px #f4f4f4 with no border, radio groups stack, and the
 * footer is Save (blue, ✓) then Cancel (white, blue border, ✕). CAPEX, OPEX and Land Lease
 * were moved onto it in the parity pass; Contracts was the screen left behind, which is why
 * its panels read "Description *" against the screenshots' "* Description".
 */
import { useSession } from "@/app/SessionContext";
import { palette } from "@/theme/tokens";
import { parseNumber } from "@/domain/numeric";
import { DATE_PICKER_FORMAT, formatCanvasDate } from "@/domain/canvasDate";
import { costWriteStatusLabel, writeCommandsDisabled } from "@/domain/writeGuard";
import { useCostWriteInFlight, useWriteFailureReport } from "@/features/cost/costing/useCostWriteFlight";
import { DataError, RECORD_GONE_TEXT, isRecordGone } from "@/platform/errors";
import { ContractLinksError } from "@/data/contracts";
import { permissionMessage, serverEnforcedProvider } from "@/platform/privileges";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, COMMENT_MAX_LENGTH, MARGIN_TYPE, MSG,
  NOTE_MAX_LENGTH, TOTAL_COSTS_TYPE,
  canSaveContractFromErrors, canSavePaymentTarget, cardShowsClosingCosts, cardTotalLabel,
  contractCardTitle, contractCommands, contractErrors, contractSelectionAfterDelete,
  gatedContractCommands, longAbbreviatedDate,
  PAYMENT_TARGET_DESCRIPTION_MAX_LENGTH,
  canAddPaymentTarget, canChangePaymentTarget, canSaveRightsContract, cardClosingFigure,
  cardContractTotalText, cardMarginFigure, cardRightsTotalText, cardTotalCostsFigure,
  closingTypePatch, commentCounter, contractNameFor, devCoLeafCostByAccount, marginChangePatch,
  marginIsStandard, marginTypeChangePatch, newPeriodDescription, oneDecimalText,
  periodDescriptionLocked, saveErrorText, selectionAfterHeaderClick, selectionAfterTargetClick,
  targetPercentText, usedInContractTooltip, wholeNumberText, inputDecimalText, devCoLeafTotalText,
  costLabel, currencyCode, devCoCostName,
  devCoLeaves, devCoParents, leafSelectable, parentCheckHasChildren, parentCheckState,
  panelTitle, paymentTargetErrors, paymentTargetName, recalculateForm,
  contractTotalFromForm, selectedLeafAccounts, toggleParentAccounts, deleteErrorText,
  CARD_LABEL, confirmDeleteContractDescription, confirmDeletePaymentTargetDescription, rightsTotalLabel,
  NO_FIELDS_TOUCHED, touchFields, visibleFieldError, queriesReady, type TouchedFields,
  patchEditsMargin, shouldSeedMargin, showTotalCostOfContract,
  type AccountNode, type BopContract, type CapexCostRow, type ContractForm,
  type ContractType, type ParentCheckState, type PaymentTarget, type PaymentTargetForm,
} from "./rules";
import {
  useAccountTree, useBopStandardAssumption, useCapexAccounts, useCapexCostRows, useContracts,
  useDeleteContract, useDeletePaymentTarget, useDevCoCapexContracts, useDevCoLinks,
  usePaymentTargets, useProjectExtras, useSaveContract, useSavePaymentTarget,
} from "./hooks";
import { costRowsForAccounts } from "@/data/costRepository";

/** `StartOfWeek.Monday` — Fluent's `DayOfWeek.Monday` (as `components/DateField.tsx`). */
const MONDAY = 1;
/** `dtp_..._ClosingDate` has no `Format`, so it shows the control's default: "Tue, Nov 24, 2026". */
const formatClosingDate = (d: Date | null | undefined) => formatCanvasDate(d, DATE_PICKER_FORMAT, "en-US");

/* ─────────────────────────────────────────────────────────────────── styles */

/*
 * Everything this screen draws lives in the `.canvas-contract-*` and `.canvas-devco-*` rules
 * of `src/styles/canvas.css`, transcribed from the canvas controls named there. Griffel is
 * not used: the card and the DevCo picker are geometry — a 42 px header, a 3 px stripe hard
 * against the left edge, 32 px account rows, a checkbox column 40 px off the right edge — and
 * keeping that beside the rest of the transcribed chrome is what the other cost screens do.
 */

/**
 * The stripe down the left of each card — `rec_Contracts_List_CardHeader_Type.Fill`:
 *
 *   Development    `App.Theme.Colors.Primary`
 *   Construction   `gblAppTheme.palette.neutralQuaternary`
 *   anything else  `gblAppTheme.palette.themeLight`   (Project Rights, and None)
 *
 * `App.Theme` is `PowerAppsTheme` (`App.pa.yaml`), whose primary is Fluent's own #0f6cbd —
 * NOT the VSB #006eb9 the rest of the chrome uses. Sampled off
 * `UI Screenshots/Cost App - Contracts Tab Selected - Expanded Contract.png` at x 231-233,
 * which reads (15, 108, 189). This replaced akzent1/akzent2/akzent4, which were a guess at
 * the same three slots and rendered the Construction stripe teal instead of grey.
 */
const POWER_APPS_THEME_PRIMARY = "#0f6cbd";

const TYPE_COLOUR: Record<number, string> = {
  [CONTRACT_TYPE.Development]: POWER_APPS_THEME_PRIMARY,
  [CONTRACT_TYPE.Construction]: palette.neutralQuaternary,
  [CONTRACT_TYPE.ProjectRights]: palette.themeLight,
  [CONTRACT_TYPE.None]: palette.themeLight,
};


/* ─────────────────────────────────────────────────────────── form defaults */

function emptyContractForm(contractType: ContractType): ContractForm {
  return {
    description: "",
    contractType,
    closingDate: undefined,
    // `rad_..._CostsUntilClosingDate.Default` is 'Closing Date Type'.Plan on both halves.
    costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
    costsUntilClosingPlan: "",
    costsUntilClosingActual: "",
    costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
    costsAfterClosingPlan: "",
    costsAfterClosingActual: "",
    totalCostsType: TOTAL_COSTS_TYPE.Calculated,
    totalCostsCalculated: "",
    totalCostsOverwrite: "",
    margin: false,
    marginType: MARGIN_TYPE.Percentage,
    marginPercentage: "",
    marginFixedValue: "",
    comment: "",
    isMarginStandardAssumption: false,
  };
}

function formFromContract(c: BopContract, locale?: string): ContractForm {
  // Every number opens with the user's decimal separator, as the canvas shows it; the checks and the save read it
  // back in that locale (a stored 7.5 % opened "7.5", which German read as 75) (German number audit, 6 Nov 2026).
  const s = (n: number | undefined) => inputDecimalText(n, locale);
  const rights = c.contractType === CONTRACT_TYPE.ProjectRights;
  return {
    description: c.description ?? "",
    contractType: c.contractType,
    closingDate: c.closingDate,
    // DIVERGENCE (D120 §9): a stored closing type of None (a row this screen never wrote), for BOTH the until- and after-closing halves, opens as Plan.
    // The canvas radio selects nothing for it (`:4529-4545`); here Save would then be blocked, because neither radio
    // is chosen. Contracts saved by either app always carry Plan or Actual.
    costsUntilClosingType:
      c.costsUntilClosingType === CLOSING_DATE_TYPE.None
        ? CLOSING_DATE_TYPE.Plan : c.costsUntilClosingType,
    costsUntilClosingPlan: s(c.costsUntilClosingPlan),
    costsUntilClosingActual: s(c.costsUntilClosingActual),
    costsAfterClosingType:
      c.costsAfterClosingType === CLOSING_DATE_TYPE.None
        ? CLOSING_DATE_TYPE.Plan : c.costsAfterClosingType,
    costsAfterClosingPlan: s(c.costsAfterClosingPlan),
    costsAfterClosingActual: s(c.costsAfterClosingActual),
    totalCostsType: rights
      ? TOTAL_COSTS_TYPE.Overwrite
      : c.totalCostsType === TOTAL_COSTS_TYPE.None
        ? TOTAL_COSTS_TYPE.Calculated : c.totalCostsType,
    totalCostsCalculated: s(c.totalCostsCalculated),
    // The Project Rights panel reads and writes `Total cost of contract [EUR]` (`:3590`, `:3757`).
    totalCostsOverwrite: rights ? s(c.totalCostOfContract) : s(c.totalCostsOverwrite),
    margin: c.margin,
    marginType: c.marginType ?? MARGIN_TYPE.Percentage,
    marginPercentage: s(c.marginPercentage),
    marginFixedValue: s(c.marginFixedValue),
    comment: c.comment ?? "",
    // `locIsStandardAssumtions: If(locSelectedContract.'Is Standard Contract', true, false)` (`:673`) —
    // the flag the margin boxes' blue italic reads on Edit comes from 'Is Standard Contract', not from
    // the stored 'Is Margin Standard Assumption?' (CONTR-055). Canvas parity, recorded in D100: `Is Standard Contract` is
    // written false on every save (`:7415`, `contractPayload`), so after a re-save this flag opens false in BOTH apps even
    // when the margin still equals the standard. Seeding from the stored `isMarginStandardAssumption` instead would be an
    // improvement; not built, product question open.
    isMarginStandardAssumption: marginIsStandard({ isMarginStandardAssumption: c.isStandardContract }),
  };
}

const EMPTY_TARGET_FORM: PaymentTargetForm = {
  description: "", paymentDate: "", totalCostsContract: "", note: "",
};

/* ──────────────────────────────────────────────────────────────── the screen */

type PanelKind = "none" | "contract" | "rights" | "target";

/**
 * One screen instance PER PROJECT (D120 §6). The route element is the same component for every
 * `?projectId=`, and the cost gate does not unmount it while the next project is already cached (browser Back/Forward),
 * so an open panel, a selection and a half-typed form of project A would stay mounted over project B: Save would then
 * write A's input into B, as a NEW contract. Keying by the project id gives each project a fresh state.
 */
export default function ContractsScreen() {
  const { projectId } = useSession();
  return <ContractsScreenBody key={projectId ?? "none"} />;
}

function ContractsScreenBody() {
  const navigate = useNavigate();
  const { project, projectId, projectNotFound, locale } = useSession();

  const contractsQuery = useContracts(projectId);
  const contracts = contractsQuery.data ?? [];
  const targets = usePaymentTargets(projectId, contracts);
  const accountsQuery = useCapexAccounts();
  const devCoContractsQuery = useDevCoCapexContracts(projectId);
  const devCoLinksQuery = useDevCoLinks(projectId, contracts);
  const extras = useProjectExtras(projectId);
  const capexCostRows = useCapexCostRows(projectId);

  const [selectedContractId, setSelectedContractId] = useState<string>();
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [panel, setPanel] = useState<PanelKind>("none");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContractForm>(() => emptyContractForm(CONTRACT_TYPE.Development));
  const [targetForm, setTargetForm] = useState<PaymentTargetForm>(EMPTY_TARGET_FORM);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  /** `ThisItem.IsFolded` on the contract cards — several may stand open at once. */
  const [expanded, setExpanded] = useState<string[]>([]);
  /**
   * `ThisItem.IsFolded` on the DevCo rows. At most ONE, because
   * `btn_…_DevCoCosts_TransparentButton.OnSelect` folds every row before unfolding the one
   * clicked.
   */
  const [expandedAccountId, setExpandedAccountId] = useState<string>();
  /**
   * Which fields of the open panel the user has touched (edited, or visited and left). Validation
   * is computed from the first render, but a field the user has not touched shows no error — see
   * `errorFor` (D61, CA-23). Reset whenever a panel opens.
   */
  const [touched, setTouched] = useState<TouchedFields>(NO_FIELDS_TOUCHED);
  const touch = useCallback(
    (...fields: string[]) => setTouched((t) => touchFields(t, fields)),
    [],
  );
  const [recalculated, setRecalculated] = useState(false);
  const [confirm, setConfirm] = useState<"none" | "contract" | "target">("none");
  /** Which `locContractSpinnerInformationText` the write-status line is showing, or `null` for none. */
  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  const [banner, setBanner] = useState<string>();
  /**
   * The id of a contract whose row was saved but whose DevCo links were not (`ContractLinksError`). The form has no id
   * after a CREATE, so without this the retry would create a second contract. Cleared whenever a panel opens.
   */
  const retryContractId = useRef<string | undefined>(undefined);
  /**
   * D120 §7: the standard assumption has seeded the margin of the panel that is open (cleared in
   * `openNewContract`), and whether a margin field was written since it opened. Together they stop a late or repeated
   * arrival of the assumption from overwriting what the user has on screen (`shouldSeedMargin`).
   */
  const marginSeeded = useRef(false);
  const marginEdited = useRef(false);

  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const contractTargets = selectedContractId
    ? targets.byContract.get(selectedContractId) ?? []
    : [];

  const tree = useAccountTree({
    accounts: accountsQuery.data,
    devCoContracts: devCoContractsQuery.data,
    devCoLinks: devCoLinksQuery.data,
    editingContractId: editing ? selectedContractId : undefined,
    selectedAccountIds,
  });

  /*
   * Both standard assumptions are read as soon as the project's country and technology are known (D120 §7),
   * as the canvas does in `OnVisible` (`:80-89`), so the seed of a new contract's margin is ready at the click and does
   * not arrive later over what the user typed. The panel's own type picks which one seeds.
   */
  const developmentAssumption = useBopStandardAssumption({
    countryId: extras.data?.countryId,
    technology: extras.data?.technology,
    contractType: CONTRACT_TYPE.Development,
  });
  const constructionAssumption = useBopStandardAssumption({
    countryId: extras.data?.countryId,
    technology: extras.data?.technology,
    contractType: CONTRACT_TYPE.Construction,
  });
  const standardAssumption =
    form.contractType === CONTRACT_TYPE.Construction ? constructionAssumption : developmentAssumption;

  const saveContractMutation = useSaveContract(projectId);
  const deleteContractMutation = useDeleteContract(projectId);
  const saveTargetMutation = useSavePaymentTarget(projectId);
  const deleteTargetMutation = useDeletePaymentTarget(projectId);

  /** The first read of the contracts and the CAPEX accounts has not answered yet. */
  const loading = contractsQuery.isLoading || accountsQuery.isLoading;
  /**
   * DIVERGENCE (D120 §4, proposed): the write commands also wait for every read a form or a save depends on.
   * The canvas loaded all of it in `OnVisible` behind its spinner, so a form never saw a half-loaded screen. Here the
   * cost rows, the DevCo contracts, the links and the payment targets load apart from the list; a form opened before
   * they answered calculated zero totals, ticked nothing on Edit, and saved both. `isSuccess` (not "not loading") is
   * what counts: a query that FAILED never becomes ready, and `supportingFailed` says so. A query with no ids to ask
   * about is disabled, so it is ready when there are no contracts.
   */
  const ready = queriesReady({
    contractCount: contracts.length,
    contractsLoaded: contractsQuery.isSuccess,
    accountsLoaded: accountsQuery.isSuccess,
    costRowsLoaded: capexCostRows.isSuccess,
    devCoContractsLoaded: devCoContractsQuery.isSuccess,
    linksLoaded: devCoLinksQuery.isSuccess && !devCoLinksQuery.isPlaceholderData,
    targetsLoaded: targets.isSuccess && !targets.isPlaceholderData,
  });
  /** A read other than the list failed on its first try: Add and Edit stay off, and the screen says why. */
  const supportingFailed = [accountsQuery, devCoContractsQuery, capexCostRows, devCoLinksQuery, targets]
    .some((q) => q.isError && q.data === undefined);
  const busy =
    saveContractMutation.isPending || deleteContractMutation.isPending ||
    saveTargetMutation.isPending || deleteTargetMutation.isPending;
  /** CA-15 — a Cost write of this project still running, from any screen or an earlier visit. */
  const writeInFlight = useCostWriteInFlight(projectId);
  /** CA-15 — the banner while this screen is mounted, the error toast once it has been left. */
  const reportFailure = useWriteFailureReport("Contracts");
  /** `writeCommandsDisabled` (D58): the interaction guard that replaced the spinner overlay. */
  const writesDisabled = writeCommandsDisabled({ loading: loading || !ready.contractForm, writePending: busy, writeInFlight });
  /** The payment-target commands need only the targets (the remaining percentage and the next description). */
  const targetWritesDisabled = writeCommandsDisabled({ loading: loading || !ready.targets, writePending: busy, writeInFlight });

  /**
   * The selection as of the LATEST render, for a delete that settles later (CA-17): the user may
   * have picked another card or target while it ran, and the closure only knows the old one.
   */
  const selectionNow = useRef({ contractId: selectedContractId, targetId: selectedTargetId });
  useEffect(() => {
    selectionNow.current = { contractId: selectedContractId, targetId: selectedTargetId };
  }, [selectedContractId, selectedTargetId]);
  const clearDeletedSelection = (deleted: { contractId?: string; targetId?: string }) => {
    const next = contractSelectionAfterDelete(selectionNow.current, deleted);
    setSelectedContractId(next.contractId);
    setSelectedTargetId(next.targetId);
  };

  /**
   * Seeds a new Development or Construction contract's margin from the standard assumption.
   * `cmd_Contracts_CommandBar.OnSelect` did this and then fired Recalculate immediately.
   *
   * This one genuinely is an effect: the seed arrives from an async query AFTER the panel has
   * opened, and it must not overwrite anything the user has since typed — hence the `editing`
   * and `panel` guards and the functional update. The recalculation is not chained here
   * because `Recalculate` is idempotent and every subsequent field change runs it anyway.
   */
  // oxlint flags this as react(set-state-in-effect). It stays: the seed genuinely arrives
  // from outside React, which is the case the rule exempts. The suppression comment does not
  // take on this rule in oxlint 1.x, so the warning is expected in `npm run lint`.
  useEffect(() => {
    if (!shouldSeedMargin({
      panel, editing, seeded: marginSeeded.current, marginTouched: marginEdited.current,
    })) return;
    const a = standardAssumption.data;
    if (!a) return;
    marginSeeded.current = true;
    /*
     * DIVERGENCE (data source only, D2/D54): the canvas seeds BOTH boxes from the one Fabric column
     * `marginvalue` (`:594-595`) and a NEW contract's type radio defaults to Percentage whatever the
     * assumption's type is (`:5903`, CONTR-052). Dataverse keeps the two values apart, so each box takes
     * its own column and falls back to the other.
     */
    const pct = a.vsb_marginpercentage ?? a.vsb_marginfixedvalue;
    const fixed = a.vsb_marginfixedvalue ?? a.vsb_marginpercentage;
    setForm((f) => ({
      ...f,
      margin: a.vsb_margin === true,
      marginType: MARGIN_TYPE.Percentage,
      marginPercentage: inputDecimalText(pct, locale),
      marginFixedValue: inputDecimalText(fixed, locale),
      isMarginStandardAssumption: true,
    }));
  }, [panel, editing, standardAssumption.data, locale]);

  /* ── recalculation ──────────────────────────────────────────────────── */

  /**
   * `but_Contracts_RightPanel_NewEdit_Buttons_Recalculate.OnSelect`.
   *
   * `recalculateForm` in `rules.ts` is the whole calculation as `form → form`, so a change
   * and its recalculation are ONE state update. The canvas app ended every radio's
   * `OnChange` with `Select(but_..._Recalculate)`, which is the same thing — and doing it in
   * an effect keyed off a "needs recalculating" flag would render twice per interaction.
   *
   * The rows are the project's DevCo CAPEX costs narrowed to the contracts filed under the
   * accounts ticked in THIS panel — `recalculateForm` sums whatever it is handed, so the
   * narrowing is part of the calculation, not a display filter.
   *
   * In the demo build these come from the same cost book the CAPEX screen edits; on the live
   * build they come from `vsb_capexcosts`, filtered to the project's DevCo CAPEX contracts.
   * Either way the Plan figures move when costs change — see `src/data/costRepository.ts`.
   */
  const capexCosts = useMemo<CapexCostRow[]>(
    () => costRowsForAccounts(
      capexCostRows.data ?? [],
      devCoContractsQuery.data ?? [],
      selectedLeafAccounts(tree).map((n) => n.id),
    ),
    [capexCostRows.data, devCoContractsQuery.data, tree],
  );

  /**
   * Recalculate against a selection that has not reached `tree` yet.
   *
   * `capexCosts` above is derived from `tree`, which is derived from `selectedAccountIds` —
   * so a handler that calls `setSelectedAccountIds` and then recalculates would recalculate
   * against the PREVIOUS selection. The canvas has no such problem: `UpdateIf` mutates
   * `colSelectedConratctWithDevCoCosts` and the following `Select(…Recalculate)` reads it
   * back synchronously.
   *
   * Narrowing the rows needs only each node's `id` and `level`, and neither moves when the
   * selection changes, so the current `tree` is enough to classify the ids handed in.
   */
  const recalculateFor = useCallback(
    (nextSelectedIds: readonly string[]) => {
      const wanted = new Set(nextSelectedIds);
      const leafIds = tree.filter((n) => n.level === 3 && wanted.has(n.id)).map((n) => n.id);
      const rows = costRowsForAccounts(
        capexCostRows.data ?? [], devCoContractsQuery.data ?? [], leafIds,
      );
      // A recalculation is the app's doing, not the user's: it touches nothing (D61).
      setForm((f) => recalculateForm(f, rows, locale));
      setRecalculated(true);
    },
    [tree, capexCostRows.data, devCoContractsQuery.data, locale],
  );

  /**
   * The payment-target twin of `updateForm`. Every key of the patch is a field the user typed in,
   * and is also the `field` name of its error, so each one becomes touched.
   */
  const updateTargetForm = useCallback((patch: Partial<PaymentTargetForm>) => {
    touch(...Object.keys(patch));
    setTargetForm((f) => ({ ...f, ...patch }));
  }, [touch]);

  /** `chb_Contracts_RightPanel_NewEdit_CostssRow.OnCheck` / `.OnUncheck`. */
  const toggleLeafAccount = useCallback(
    (id: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...selectedAccountIds, id])]
        : selectedAccountIds.filter((x) => x !== id);
      setSelectedAccountIds(next);
      touch("devCoCosts");
      recalculateFor(next);
    },
    [selectedAccountIds, recalculateFor, touch],
  );

  /** `img_Contracts_DevCoCosts_ParentCheckbox.OnSelect`. */
  const toggleParentAccount = useCallback(
    (parentId: string) => {
      const next = toggleParentAccounts(tree, parentId, selectedAccountIds);
      setSelectedAccountIds(next);
      touch("devCoCosts");
      recalculateFor(next);
    },
    [tree, selectedAccountIds, recalculateFor, touch],
  );

  /**
   * Applies a patch and, for the changes the canvas recalculated on, the recalculation with
   * it — in a single `setForm`.
   *
   * `touches` names the fields the USER changed with this patch; it defaults to every key of the
   * patch, which is right for a field typed into. A patch that also resets other fields (flipping
   * Margin or its type blanks the two margin boxes) or that comes from a radio passes `[]`, so a
   * field the user never visited is not marked touched (D61).
   */
  const updateForm = useCallback(
    (
      patch: Partial<ContractForm>,
      thenRecalculate = false,
      touches: readonly string[] = Object.keys(patch),
    ) => {
      touch(...touches);
      if (patchEditsMargin(patch)) marginEdited.current = true;
      setForm((f) => {
        const next = { ...f, ...patch };
        return thenRecalculate ? recalculateForm(next, capexCosts, locale) : next;
      });
      if (thenRecalculate) setRecalculated(true);
    },
    [capexCosts, locale, touch],
  );

  /**
   * `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2.OnSelect` — the
   * Reload icon beside the Margin legend, `Tooltip: ="Reset to standard assumption."`.
   *
   * It clears the margin controls, re-reads the BoP standard contract for this
   * country/technology/type and puts its margin back, then recalculates. Without it the
   * standard assumption could only be recovered by closing and reopening the panel, which is
   * what the seeding effect above keys off.
   */
  const resetMarginToStandardAssumption = useCallback(() => {
    const a = standardAssumption.data;
    const pct = a?.vsb_marginpercentage ?? a?.vsb_marginfixedvalue;
    const fixed = a?.vsb_marginfixedvalue ?? a?.vsb_marginpercentage;
    updateForm({
      margin: a?.vsb_margin === true,
      // `rad_…_MarginType` after the Reset (`:5887`): a new contract's radio is Percentage; on Edit it
      // follows the assumption's own type.
      marginType: (editing && typeof a?.vsb_margintype === "number"
        ? a.vsb_margintype : MARGIN_TYPE.Percentage) as ContractForm["marginType"],
      marginPercentage: inputDecimalText(pct, locale),
      marginFixedValue: inputDecimalText(fixed, locale),
      isMarginStandardAssumption: Boolean(a),
    }, true, []); // the Reset icon is not a field: it touches nothing
  }, [standardAssumption.data, updateForm, editing, locale]);

  const contractTotal = useMemo(
    () => contractTotalFromForm(form, locale),
    [form, locale],
  );
  const leafCosts = useMemo(
    () => devCoLeafCostByAccount(devCoContractsQuery.data ?? [], capexCostRows.data ?? []),
    [devCoContractsQuery.data, capexCostRows.data],
  );
  const contractDescriptionById = useMemo(
    () => new Map((contractsQuery.data ?? []).map((c) => [c.id, c.description] as const)),
    [contractsQuery.data],
  );

  /** The header's own click and its radio: toggles the contract and clears the payment target (`:1986`). */
  const clickContractHeader = (contractId: string) => {
    const next = selectionAfterHeaderClick(
      { contractId: selectedContractId, targetId: selectedTargetId }, contractId,
    );
    setSelectedContractId(next.contractId);
    setSelectedTargetId(next.targetId);
  };

  /** A payment-target row's click (`:1850`): toggles the target and selects the row's contract. */
  const clickTargetRow = (contractId: string, targetId: string) => {
    const next = selectionAfterTargetClick(
      { contractId: selectedContractId, targetId: selectedTargetId }, contractId, targetId,
    );
    setSelectedContractId(next.contractId);
    setSelectedTargetId(next.targetId);
  };

  /**
   * Leaves the payment-target panel without saving: `pcf_…_PaymentTarget_Buttons_Cancel.OnChange` and
   * the header ✕ clear `locSelectedContractPaymentTarget` (`:3033`, `:2253`).
   */
  const cancelTargetPanel = () => {
    setSelectedTargetId(undefined);
    setPanel("none");
  };

  /* ── command bar ────────────────────────────────────────────────────── */

  const privileges = serverEnforcedProvider.forTable("vsb_bopprojectscontractses");
  const commands = useMemo<Command[]>(() => {
    const icons: Record<string, Command["icon"]> = {
      newDevContarct: "Add",
      newConstructionContarct: "Add",
      newProjecRightsContarct: "Add",
      editContarct: "Edit",
      deleteContarct: "Delete",
    };
    return gatedContractCommands(contractCommands({
      canCreate: privileges.canCreate,
      canWrite: privileges.canWrite,
      canDelete: privileges.canDelete,
      hasSelection: Boolean(selectedContract),
    }), writesDisabled).map((c) => ({ key: c.key, label: c.label, icon: icons[c.key], enabled: c.enabled }));
  }, [privileges, selectedContract, writesDisabled]);

  const openNewContract = (contractType: ContractType, kind: PanelKind) => {
    retryContractId.current = undefined;
    marginSeeded.current = false;
    marginEdited.current = false;
    setEditing(false);
    setSelectedContractId(undefined);
    setSelectedAccountIds([]);
    setForm(emptyContractForm(contractType));
    setExpandedAccountId(undefined);
    setTouched(NO_FIELDS_TOUCHED);
    setRecalculated(false);
    setPanel(kind);
  };

  const openEditContract = () => {
    if (!selectedContract) return;
    retryContractId.current = undefined;
    setEditing(true);
    setForm(formFromContract(selectedContract, locale));
    setSelectedAccountIds(
      (devCoLinksQuery.data ?? [])
        .filter((l) => l.contractId === selectedContract.id)
        .map((l) => l.accountId),
    );
    setExpandedAccountId(undefined);
    setTouched(NO_FIELDS_TOUCHED);
    setRecalculated(false);
    setPanel(
      selectedContract.contractType === CONTRACT_TYPE.ProjectRights ? "rights" : "contract",
    );
  };

  const onCommand = (key: string) => {
    setBanner(undefined);
    switch (key) {
      case "newDevContarct":
        openNewContract(CONTRACT_TYPE.Development, "contract");
        return;
      case "newConstructionContarct":
        openNewContract(CONTRACT_TYPE.Construction, "contract");
        return;
      case "newProjecRightsContarct":
        openNewContract(CONTRACT_TYPE.ProjectRights, "rights");
        return;
      case "editContarct":
        openEditContract();
        return;
      case "deleteContarct":
        setConfirm("contract");
        return;
      default:
        return;
    }
  };

  /* ── saves ──────────────────────────────────────────────────────────── */

  /** The banner text, or (CA-15) the toast's detail once the screen has been left. */
  const handleError = (
    error: unknown,
    action: string,
    kind: "contract" | "paymentTarget" | "contractDelete" | "paymentTargetDelete" = "contract",
  ) => {
    const message = permissionMessage(error, action);
    if (message) { reportFailure(message, setBanner); return; }
    // NEW TEXT (no canvas source): the row was deleted by someone else, so nothing was written (D120 §3).
    if (isRecordGone(error)) { reportFailure(RECORD_GONE_TEXT, setBanner); return; }
    // NEW TEXT: the contract row landed and its DevCo links did not (D120 §1).
    if (error instanceof ContractLinksError) {
      reportFailure(`${MSG.saveErrorContract} ${MSG.savedButLinksFailed}`, setBanner);
      return;
    }
    const detail = error instanceof DataError ? error.message : undefined;
    // A failed delete says "deleted", not "saved" (D120 §8; NEW TEXT, the canvas deletes have no IfError).
    if (kind === "contractDelete" || kind === "paymentTargetDelete") {
      reportFailure(deleteErrorText(kind === "contractDelete" ? "contract" : "paymentTarget", detail), setBanner);
      return;
    }
    // `Notify("Error: BoP Contract [payment target ]could not be saved correctly. ...")` (`:3126`, `:7487`).
    reportFailure(saveErrorText(kind, detail), setBanner);
  };

  const saveContractNow = async () => {
    if (!project || !projectId) return;
    // The contract vanished from the list while Edit was open (another user deleted it, and the list refetched).
    // Saving would send no id and CREATE a duplicate, and skip the link replacement (`isNewContract`). Refuse instead.
    if (editing && !selectedContract) {
      setPanel("none");
      reportFailure(RECORD_GONE_TEXT, setBanner);
      return;
    }
    const leaves = selectedLeafAccounts(tree);
    const num = (raw: string) => parseNumber(raw, locale);
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS.
     *
     * DIVERGENCE FROM CANVAS, requested by the client for every screen. The Contracts canvas is
     * the odd one out: its Save raises only the spinner
     * (`{locContractSpinnerInformationText: "Saving Contract data...",
     * locIsContractVisiblePopUpSpinner: true}`, `ContractsScreenCode.txt:7317`) and closes the
     * panel afterwards, in the same `UpdateContext` that clears the spinner (`:7490`). CAPEX,
     * OPEX and Land Lease all close it up front, and the client asked for that order everywhere,
     * so the panel is dismissed here instead — the spinner is never drawn over the panel.
     * Since D58 the "spinner" is the `WriteStatus` line (no overlay); the order is unchanged.
     */
    setSavingLabel(form.contractType === CONTRACT_TYPE.ProjectRights
      ? MSG.spinnerSavingRightsContract : MSG.spinnerSavingContract);
    setPanel("none");
    const rights = form.contractType === CONTRACT_TYPE.ProjectRights;
    try {
      const saved = await saveContractMutation.mutateAsync({
        write: {
          ...(editing && selectedContract
            ? { id: selectedContract.id }
            : retryContractId.current ? { id: retryContractId.current } : {}),
          projectId,
          owningBusinessUnitId: project.owningBusinessUnitId,
          name: contractNameFor(form.contractType, project.projectIdCode, form.description),
          description: form.description,
          contractType: form.contractType,
          closingDate: form.closingDate as Date,
          costsUntilClosingType: form.costsUntilClosingType,
          costsUntilClosingPlan: num(form.costsUntilClosingPlan),
          costsUntilClosingActual: num(form.costsUntilClosingActual),
          costsAfterClosingType: form.costsAfterClosingType,
          costsAfterClosingPlan: num(form.costsAfterClosingPlan),
          costsAfterClosingActual: num(form.costsAfterClosingActual),
          totalCostsType: form.totalCostsType,
          totalCostsCalculated: num(form.totalCostsCalculated),
          totalCostsOverwrite: num(form.totalCostsOverwrite),
          margin: form.margin,
          marginType: form.marginType,
          marginPercentage: num(form.marginPercentage),
          marginFixedValue: num(form.marginFixedValue),
          // `Value(txt_…_TotalCosts_Contract.Value)` is the `RoundUp` text (`:7400`); a Project Rights
          // contract stores its own typed total (`:3757`).
          totalCostOfContract: rights ? num(form.totalCostsOverwrite) ?? 0 : contractTotal,
          comment: form.comment,
          isMarginStandardAssumption: form.isMarginStandardAssumption,
        },
        accounts: leaves.map((n) => ({ id: n.id, name: devCoCostName(n) })),
        // D120 §2 (N1): a stored link to an account the picker cannot show is never removed by this save.
        visibleAccountIds: tree.filter((n) => n.level === 3).map((n) => n.id),
      });
      /*
       * After the save the canvas leaves the card EXPANDED (`IsFolded: false`, `:7452-7475`, `:3764`) and a
       * Development/Construction contract DESELECTED (`locSelectedContract: Blank()`, `:7496`); an edited
       * Project Rights contract stays selected (`:3789`) (CONTR-079, CONTR-082).
       */
      retryContractId.current = undefined;
      const savedId = saved?.id ?? (editing ? selectedContract?.id : undefined);
      if (savedId) setExpanded((prev) => (prev.includes(savedId) ? prev : [...prev, savedId]));
      if (!rights) {
        setSelectedContractId(undefined);
        setSelectedTargetId(undefined);
      }
    } catch (error) {
      if (error instanceof ContractLinksError) retryContractId.current = error.contractId;
      handleError(error, "save this contract");
      /*
       * DIVERGENCE (D120 §1, proposed): after a failed save the panel OPENS AGAIN with everything the user
       * entered, instead of staying closed with the form lost. The canvas closed the panel and reset every control on
       * failure too (`:7490-7515`, `Select(but_..._Reset)` runs after the `IfError`), so its user retyped it all. Nothing
       * is reopened when the row is gone (a retry could only fail the same way).
       */
      if (!isRecordGone(error)) setPanel(rights ? "rights" : "contract");
    } finally {
      setSavingLabel(null);
    }
  };

  const saveTargetNow = async () => {
    if (!selectedContract || !project) return;
    // Panel first, spinner second — see `saveContractNow`.
    setSavingLabel(MSG.spinnerSavingPaymentTarget);
    setPanel("none");
    setTargetForm(EMPTY_TARGET_FORM);
    try {
      await saveTargetMutation.mutateAsync({
        ...(selectedTargetId ? { id: selectedTargetId } : {}),
        contractId: selectedContract.id,
        owningBusinessUnitId: project.owningBusinessUnitId,
        name: paymentTargetName(selectedContract.description, targetForm.description),
        description: targetForm.description,
        paymentDate: targetForm.paymentDate,
        totalCostsContract: parseNumber(targetForm.totalCostsContract, locale) ?? 0,
        note: targetForm.note,
      });
    } catch (error) {
      handleError(error, "save this payment target", "paymentTarget");
    } finally {
      setSavingLabel(null);
    }
  };

  /* ── empty and loading states ───────────────────────────────────────── */

  // No deep link, or a project the caller cannot read: both are real states the canvas app
  // never had, because it substituted a hard-coded test project instead (A-2). Both send the
  // user to the project list, which is this app's landing screen — one project list, not two.
  if (!projectId) {
    return (
      <EmptyState
        title={MSG.noProjectTitle}
        description={MSG.noProjectDescription}
        action={{ label: MSG.goToProjects, onClick: () => navigate("/projects") }}
      />
    );
  }
  if (projectNotFound) {
    return (
      <EmptyState
        title={MSG.projectNotFoundTitle}
        description={MSG.projectNotFoundDescription}
        action={{ label: MSG.goToProjects, onClick: () => navigate("/projects") }}
      />
    );
  }

  /*
   * While the first read is in flight the canvas screen showed its own
   * `LoadingSpinner: =LoadingSpinner.Data` (`Contracts Screen`), and this app shows an inline
   * "Loading contracts…" spinner in the body (D60, restoring what D58 had removed), with the
   * command bar's write commands greyed out by `writeCommandsDisabled` and no "No contracts
   * yet", because nothing is known yet.
   */
  // A failed read must not look like a project with no contracts (same state as Capex / Opex).
  // D120 §4: only a read with nothing to show replaces the screen. A background refetch that failed (focus,
  // invalidation) keeps the rows it has, and an accounts-only failure is the banner below, not a blank screen.
  if (!loading && contractsQuery.isError && contractsQuery.data === undefined) {
    return (
      <EmptyState
        title={MSG.costDataUnavailableTitle}
        description={MSG.costDataUnavailableDescription}
      />
    );
  }

  const currency = currencyCode(project ?? {});
  const errors = contractErrors(form, tree, locale, editing);
  /** The error to SHOW under a field: only once the user has touched that field (D61, CA-23). */
  const errorFor = (field: string) => visibleFieldError(errors, touched, field);
  /**
   * The error under a read-only Plan box. The canvas label tests the Plan value itself (`:4419`, the
   * corrected shape of D-3) and shows once it is non-blank; nobody types in the box, so it is not gated
   * on "touched" (CONTR-069).
   */
  const planError = (field: string, value: string) =>
    value.trim() === "" ? undefined : errors.find((e) => e.field === field)?.message;

  const targetErrors = paymentTargetErrors({
    form: targetForm,
    projectStart: project?.startDate,
    targets: contractTargets,
    ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
    locale,
  });
  const targetErrorFor = (field: string) => visibleFieldError(targetErrors, touched, field);

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <div className="canvas-contract-screen">
      {supportingFailed ? (
        <MessageBar intent="error" data-testid="contracts-data-unavailable">
          <MessageBarBody>{MSG.supportingDataUnavailable}</MessageBarBody>
        </MessageBar>
      ) : null}
      {banner ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{MSG.failureBannerTitle}</MessageBarTitle>
            {banner}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {/*
        * `cmp_Contracts_PopUpLoading` (`cmp_PopUp_Loading`, `Visible:
        * =locIsContractVisiblePopUpSpinner`, `InformationText: =locContractSpinnerInformationText`):
        * the blocking spinner with the verbatim `MSG.spinner*` text shows for as long as the write
        * runs (D60); `writeCommandsDisabled` also stops a second write.
        */}
      {/* CA-15: a write still running from another screen (or an earlier visit) says so. */}
      <WriteStatus testId="contracts-write-status" label={costWriteStatusLabel({
        ownLabel: busy ? savingLabel ?? MSG.spinnerSavingContract : null,
        ownPending: busy, writeInFlight,
      })} />

      {/* `.canvas-contract-commandbar`: the first icon over the cards' radio column (21 Oct 2026). */}
      <div className="canvas-contract-commandbar">
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel="Contract actions" />
      </div>

      {loading ? (
        // D60: an inline spinner while loading; an empty list then shows nothing, as the canvas.
        <LoadingOverlay mode="inline" label={MSG.loadingContracts} testId="contracts-loading" />
      ) : contracts.length === 0 ? (
        // `gal_Contracts_List` with no rows: the canvas shows an empty area under the command bar, no message.
        null
      ) : (
        /*
         * `gal_Contracts_List` — a gallery of cards, each folded by its own `IsFolded`, so
         * more than one can stand open at a time (the screenshots show exactly that).
         *
         * NOT a Fluent `Accordion`: its header brings its own padding and expand icon, and
         * the canvas card is a 42 px band with a 3 px type stripe hard against the left edge,
         * an 18 px radio at x 10 and the chevron 6 px off the right. Fighting the Accordion's
         * chrome to reach that geometry costs more than the `aria-expanded` button below.
         */
        <div className="canvas-contract-list">
          {contracts.map((contract) => {
            const open = expanded.includes(contract.id);
            return (
              <div
                key={contract.id}
                className="canvas-contract-card"
                data-open={open}
                data-selected={selectedContractId === contract.id}
              >
                <div
                  className="canvas-contract-head"
                  style={{ ["--contract-type" as string]: TYPE_COLOUR[contract.contractType] }}
                >
                  {/* `img_Contracts_List_CardHeaderRadioSelection` — CircleDotBlue / CircleEmpty. */}
                  <input
                    type="radio"
                    name="contract-selection"
                    value={contract.id}
                    checked={selectedContractId === contract.id}
                    aria-label={`Select ${contract.description ?? ""}`}
                    data-testid={`img_Contracts_List_CardHeaderRadioSelection-${contract.id}`}
                    // A click on the radio is the header's click (it toggles); `onChange` alone never
                    // fires for the radio that is already checked.
                    onClick={() => clickContractHeader(contract.id)}
                    onChange={() => undefined}
                  />
                  {/*
                    * `btn_Contracts_List_CardHeader_TransparentButton` covers the band and
                    * TOGGLES the selection — clicking the selected contract clears it. It
                    * does not fold anything.
                    */}
                  <button
                    type="button"
                    className="canvas-contract-title"
                    aria-label="Select contract"
                    data-testid={`btn_Contracts_List_CardHeader_TransparentButton-${contract.id}`}
                    title={contractCardTitle(contract)}
                    onClick={() => clickContractHeader(contract.id)}
                  >
                    {contractCardTitle(contract)}
                  </button>
                  {/*
                    * `ico_…_CardHeader_Down` / `_Up` — one is `Visible: =ThisItem.IsFolded`,
                    * and folding is ALL they do. A real button, not decoration: it is the
                    * only way to open a card.
                    */}
                  <button
                    type="button"
                    className="canvas-contract-chevron"
                    aria-expanded={open}
                    aria-controls={`contract-body-${contract.id}`}
                    aria-label={`${open ? "Collapse" : "Expand"} ${contract.description ?? ""}`}
                    data-testid={`ico_Contracts_List_CardHeader_${open ? "Up" : "Down"}-${contract.id}`}
                    onClick={() => setExpanded((prev) =>
                      prev.includes(contract.id)
                        ? prev.filter((id) => id !== contract.id)
                        : [...prev, contract.id],
                    )}
                  >
                    <ExpandChevron open={open} />
                  </button>
                </div>

                {open ? (
                  <div className="canvas-contract-body" id={`contract-body-${contract.id}`}>
                    <ContractCardBody
                      contract={contract}
                      currency={currency}
                      locale={locale}
                      targets={targets.byContract.get(contract.id) ?? []}
                      selectedTargetId={selectedTargetId}
                      isSelectedContract={selectedContractId === contract.id}
                      writesDisabled={targetWritesDisabled}
                      onSelectTarget={(targetId) => clickTargetRow(contract.id, targetId)}
                      onAddTarget={() => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(undefined);
                        // `txt_…_PaymentTarget_Description.Value` (`:2380`): the newest period's name, numbered on.
                        setTargetForm({
                          ...EMPTY_TARGET_FORM,
                          description: newPeriodDescription(targets.byContract.get(contract.id) ?? []),
                        });
                        setTouched(NO_FIELDS_TOUCHED);
                        setPanel("target");
                      }}
                      onEditTarget={(t) => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(t.id);
                        setTargetForm({
                          description: t.description ?? "",
                          paymentDate: t.paymentDate ?? "",
                          totalCostsContract:
                            inputDecimalText(t.totalCostsContract, locale),
                          note: t.note ?? "",
                        });
                        setTouched(NO_FIELDS_TOUCHED);
                        setPanel("target");
                      }}
                      onDeleteTarget={(t) => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(t.id);
                        setConfirm("target");
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ── the Development / Construction contract panel ───────────────── */}
      <FormPanel centerClose
        /*
         * `con_Contracts_RightPanel_NewEdit_Body.Width: =Min(960, Parent.Width)` (Contracts Screen:3858): 960
         * wide, or the whole screen when that is narrower. It was the default `"wide"` (`min(960px, 50vw)`), so on
         * a window under 1920 px the panel was half the window, and at 800 px or less its two columns stacked
         * (`canvas.css` `@container`) — the canvas kept them side by side (20 Nov 2026).
         */
        width="full"
        // D120 §5: a click on the scrim does not close the panel and drop what was typed. The canvas overlay
        // (`con_Contracts_RightPanel_NewEdit*`, 70% scrim, no `OnSelect`) closes only through its X and Cancel.
        keepOpenOnOutsideClick
        open={panel === "contract"}
        // Canvas classic `Label` captions: 11 pt, the red `*` hanging left of the caption (canvas.css `.contract-canvas-panel`).
        panelClassName="contract-canvas-panel"
        title={panelTitle(editing, form.contractType)}
        onDismiss={() => setPanel("none")}
        /*
         * Save then Cancel, and nothing between them.
         *
         * `but_Contracts_RightPanel_NewEdit_Buttons_Recalculate` is `Visible: =false`
         * (`Contracts Screen.pa.yaml`) — the canvas fires it with `Select(...)` from every
         * radio's, date's, margin field's and DevCo checkbox's `OnChange`, and never shows
         * it. The Recalculate button this footer used to carry was ours, and it left Save
         * unreachable until the user found and pressed it.
         */
        footer={<PanelButtons
          onSave={() => { void saveContractNow(); }}
          onCancel={() => setPanel("none")}
          disabled={!canSaveContractFromErrors({ form, tree, recalculated, locale, errors }) || busy || !ready.contractForm} />}
      >
        <div className="canvas-panel-columns">
          <div className="canvas-panel-column">
            <CostField
              label={MSG.description}
              name="txt_Contracts_RightPanel_NewEdit_Description"
              required
              labelTitle={MSG.description}
              value={form.description}
              error={errorFor("description")}
              // `txt_…_Description.OnChange` sets `locContractDevCoCostsDirty: true` (`:4014`), which Save needs.
              onChange={(v) => { updateForm({ description: v }); setRecalculated(true); }}
              onBlur={() => touch("description")}
            />

            <div className="canvas-field" data-invalid={errorFor("closingDate") ? true : undefined}>
              <span data-required="true" title={MSG.contractClosingDate}>{MSG.contractClosingDate}</span>
              <DatePicker
                aria-label={MSG.contractClosingDate}
                data-testid="dtp_Contracts_RightPanel_NewEdit_ContractClosingDate"
                placeholder={MSG.closingDatePlaceholder}
                // `StartOfWeek: Monday`, `StartDate: gblSelectedProject.'Start Date'` (`:4124`).
                // DIVERGENCE (D120 §9): `project.startDate` is `vsb_projectstartdate ?? vsb_startdate`
                // (`data/project.ts`, a documented fix: `vsb_startdate` is blank on real rows). The canvas passes
                // 'Start Date' only; the payment-date check uses 'Project Start Date' in both apps (`:2545`).
                firstDayOfWeek={MONDAY}
                initialPickerDate={project?.startDate}
                // The canvas DatePicker shows its date as "Tue, Nov 24, 2026" (LongAbbreviated).
            formatDate={formatClosingDate}
            value={form.closingDate ?? null}
                onSelectDate={(date: Date | null | undefined) => updateForm({ closingDate: date ?? undefined }, true)}
              />
              {errorFor("closingDate") ? (
                <span className="canvas-field-error" role="alert">{errorFor("closingDate")}</span>
              ) : null}
            </div>

            <ClosingHalf
              legend={costLabel("Costs Until Closing Date", project ?? {})}
              choiceName="rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate"
              planName="txt_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Plan"
              actualName="txt_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Actual"
              type={form.costsUntilClosingType}
              planValue={form.costsUntilClosingPlan}
              actualValue={form.costsUntilClosingActual}
              actualError={errorFor("costsUntilClosingActual")}
              planError={planError("costsUntilClosingPlan", form.costsUntilClosingPlan)}
              onType={(t) => updateForm(
                closingTypePatch("until", t, editing ? selectedContract : undefined), true, [],
              )}
              onActual={(v) => updateForm({ costsUntilClosingActual: v }, true)}
              onActualBlur={() => touch("costsUntilClosingActual")}
            />

            <ClosingHalf
              legend={costLabel("Costs After Closing Date", project ?? {})}
              choiceName="rad_Contracts_RightPanel_NewEdit_CostsAfterClosingDate"
              planName="txt_Contracts_RightPanel_NewEdit_CostsAfterClosingDate_Plan"
              actualName="txt_Contracts_RightPanel_NewEdit_CostsAfterClosingDate_Actual"
              type={form.costsAfterClosingType}
              planValue={form.costsAfterClosingPlan}
              actualValue={form.costsAfterClosingActual}
              actualError={errorFor("costsAfterClosingActual")}
              planError={planError("costsAfterClosingPlan", form.costsAfterClosingPlan)}
              onType={(t) => updateForm(
                closingTypePatch("after", t, editing ? selectedContract : undefined), true, [],
              )}
              onActual={(v) => updateForm({ costsAfterClosingActual: v }, true)}
              onActualBlur={() => touch("costsAfterClosingActual")}
            />

            <Choices
              label={costLabel("Total Costs", project ?? {})}
              labelTitle={costLabel("Total Costs", project ?? {})}
              name="rad_Contracts_RightPanel_NewEdit_TotalCosts"
              value={form.totalCostsType === TOTAL_COSTS_TYPE.Calculated ? MSG.calculated : MSG.overwrite}
              options={[MSG.calculated, MSG.overwrite]}
              onChange={(v) => updateForm({
                totalCostsType: v === MSG.calculated
                  ? TOTAL_COSTS_TYPE.Calculated : TOTAL_COSTS_TYPE.Overwrite,
              }, true, [])}
            />
            {form.totalCostsType === TOTAL_COSTS_TYPE.Calculated ? (
              // DIVERGENCE (D120 §9): the canvas Calculated box has no `DisplayMode` (`:5320-5352`), so
              // it is editable there and its `OnChange` recalculates; a typed value was overwritten by the next Recalculate
              // anyway. Here it is read-only, because it is what Recalculate writes. (The canvas Plan boxes ARE
              // `DisplayMode.View`, `:4436`.)
              <CostField label={MSG.calculated} labelTitle={MSG.calculated}
                name="txt_Contracts_RightPanel_NewEdit_TotalCosts_Calculated"
                required disabled value={form.totalCostsCalculated} />
            ) : (
              <CostField
                label={MSG.overwrite}
                labelTitle={MSG.overwrite}
                name="txt_Contracts_RightPanel_NewEdit_TotalCosts_Overwrite"
                required
                value={form.totalCostsOverwrite}
                error={errorFor("totalCostsOverwrite")}
                onChange={(v) => updateForm({ totalCostsOverwrite: v }, true)}
                onBlur={() => touch("totalCostsOverwrite")}
              />
            )}

            {/*
              * `rad_Contracts_RightPanel_NewEdit_Margin` is a Yes/No RADIO, not a toggle —
              * `Items: =Choices('Margin (BoP Projects Contracts)')`, `Height: =75` for its
              * two stacked options. The reload beside the legend is
              * `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2`:
              * `Icon: =Icon.Reload`, `Color: =RGBA(0, 120, 212, 1)`, 16 px at `X: =90`,
              * `Tooltip: ="Reset to standard assumption."` — it re-seeds margin from the BoP
              * standard contract for this country and technology, then recalculates.
              */}
            <Choices
              label={MSG.margin}
              labelTitle={MSG.margin}
              name="rad_Contracts_RightPanel_NewEdit_Margin"
              value={form.margin ? MSG.marginYes : MSG.marginNo}
              options={[MSG.marginYes, MSG.marginNo]}
              onChange={(v) => updateForm(
                marginChangePatch(v === MSG.marginYes, editing ? selectedContract : undefined), true, [],
              )}
              action={
                <button
                  type="button"
                  className="canvas-field-reset"
                  title={MSG.resetToStandardAssumption}
                  aria-label={MSG.resetToStandardAssumption}
                  data-testid="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2"
                  disabled={!standardAssumption.data}
                  onClick={resetMarginToStandardAssumption}
                >
                  <ArrowClockwiseRegular />
                </button>
              }
            />
            {form.margin ? (
              <>
                <Choices
                  label=""
                  name="rad_Contracts_RightPanel_NewEdit_MarginType"
                  value={form.marginType === MARGIN_TYPE.Percentage ? MSG.marginTypePercentage : MSG.marginTypeFixedValue}
                  options={[MSG.marginTypePercentage, MSG.marginTypeFixedValue]}
                  onChange={(v) => updateForm(marginTypeChangePatch(
                    v === MSG.marginTypePercentage ? MARGIN_TYPE.Percentage : MARGIN_TYPE.FixedValue,
                  ), true, [])}
                />
                {form.marginType === MARGIN_TYPE.Percentage ? (
                  <CostField
                    label={MSG.marginPercent}
                    labelTitle={MSG.marginPercent}
                    name="txt_Contracts_RightPanel_NewEdit_MarginPercentage"
                    required
                    standard={marginIsStandard(form)}
                    value={form.marginPercentage}
                    error={errorFor("marginPercentage")}
                    onChange={(v) => updateForm(
                      { marginPercentage: v, isMarginStandardAssumption: false }, true,
                      ["marginPercentage"],
                    )}
                    onBlur={() => touch("marginPercentage")}
                  />
                ) : (
                  // `lbl_Contracts_RightPanel_NewEdit_MarginFixedValues` has no `FontWeight` (normal), unlike Margin [%] and the
                  // other captions of this panel, which are Semibold.
                  <div className="canvas-label-regular">
                  <CostField
                    label={costLabel(MSG.marginFixedValue, project ?? {})}
                    labelTitle={costLabel(MSG.marginFixedValue, project ?? {})}
                    name="txt_Contracts_RightPanel_NewEdit_MarginFixedValues"
                    required
                    standard={marginIsStandard(form)}
                    value={form.marginFixedValue}
                    error={errorFor("marginFixedValue")}
                    onChange={(v) => updateForm(
                      { marginFixedValue: v, isMarginStandardAssumption: false }, true,
                      ["marginFixedValue"],
                    )}
                    onBlur={() => touch("marginFixedValue")}
                  />
                  </div>
                )}
              </>
            ) : null}

            {/*
              * `con_Contracts_RightPanel_NewEdit_TotalCosts_Contract.Height: =If(rad_…_MarginType.Selected.Value = Percentage, 80, 0)`
              * (`:6126`): the box is clipped away unless the type radio selects Percentage (`showTotalCostOfContract`). The
              * total is computed and saved either way.
              */}
            {showTotalCostOfContract(form, editing ? selectedContract?.marginType : undefined, editing) ? (
              <CostField
                label={costLabel("Total cost of contract", project ?? {})}
                name="txt_Contracts_RightPanel_NewEdit_TotalCosts_Contract"
                disabled
                labelTitle={costLabel("Total cost of contract", project ?? {})}
                // `Text(RoundUp(…, 0), "###,##0")` (`:6167`).
                value={wholeNumberText(contractTotal, locale)}
              />
            ) : null}
          </div>

          <div className="canvas-panel-column">
            <div className="canvas-field">
              <span data-required="true" title={MSG.devCoCostsFrom}>{MSG.devCoCostsFrom}</span>
              {errorFor("devCoCosts") ? (
                <span className="canvas-field-error" role="alert">{errorFor("devCoCosts")}</span>
              ) : null}
              <DevCoAccountPicker
                tree={tree}
                locale={locale}
                leafCosts={leafCosts}
                contractDescriptionById={contractDescriptionById}
                expandedId={expandedAccountId}
                onExpand={setExpandedAccountId}
                onToggleLeaf={toggleLeafAccount}
                onToggleParent={toggleParentAccount}
              />
            </div>

            {/* `lbl_…_NewEdit_Comment` sits at `Y: =20` in its container: 20 px more space above Comment than between fields;
                `txt_…_Comment` is a canvas multiline TextInput, which cannot be resized by the user. */}
            <div className="canvas-contract-comment">
            <CostField
              label={MSG.comment}
              name="txt_Contracts_RightPanel_NewEdit_Comment"
              counter={commentCounter(form.comment)}
              labelTitle={MSG.comment}
            >
              <textarea
                value={form.comment}
                maxLength={COMMENT_MAX_LENGTH}
                aria-label={MSG.comment}
                // `txt_…_Comment.OnChange` also sets `locContractDevCoCostsDirty: true` (`:7129`).
                onChange={(e) => { updateForm({ comment: e.target.value }); setRecalculated(true); }}
                data-testid="contract-comment"
              />
            </CostField>
            </div>
          </div>
        </div>
      </FormPanel>

      {/* ── the Project Rights contract panel ───────────────────────────── */}
      <FormPanel centerClose
        // D120 §5: a click on the scrim does not close the panel and drop what was typed. The canvas overlay
        // (`con_Contracts_RightPanel_NewEdit*`, 70% scrim, no `OnSelect`) closes only through its X and Cancel.
        keepOpenOnOutsideClick
        open={panel === "rights"}
        // Canvas classic `Label` captions: 11 pt, the red `*` hanging left of the caption (canvas.css `.contract-canvas-panel`);
        // `.contract-rights-panel`: the canvas 78 / 84 / 80-high field containers (17 Nov 2026).
        panelClassName="contract-canvas-panel contract-rights-panel"
        title={panelTitle(editing, CONTRACT_TYPE.ProjectRights)}
        width="narrow"
        onDismiss={() => setPanel("none")}
        footer={<PanelButtons
          onSave={() => { void saveContractNow(); }}
          onCancel={() => setPanel("none")}
          // `canSaveRightsContract` (`:3708`), not `errorFor`: whether Save is allowed must not depend
          // on which errors the user has touched into view (D61).
          disabled={busy || !ready.contractForm || !canSaveRightsContract(form)} />}
      >
        <CostField
          label={MSG.description}
          labelTitle={MSG.description}
          name="txt_Contracts_RightPanel_NewEdit_RightsContract_Content_Description"
          required
          value={form.description}
          error={errorFor("description")}
          onChange={(v) => updateForm({ description: v })}
          onBlur={() => touch("description")}
        />
        <div className="canvas-field" data-invalid={errorFor("closingDate") ? true : undefined}>
          <span data-required="true" title={MSG.contractClosingDate}>{MSG.contractClosingDate}</span>
          <DatePicker
            aria-label={MSG.contractClosingDate}
            data-testid="dtp_Contracts_RightPanel_NewEdit_RightsContract_Content_ClosingDate"
            placeholder={MSG.closingDatePlaceholder}
            // `StartOfWeek: Monday`, `StartDate: gblSelectedProject.'Start Date'` (`:3450`).
            // DIVERGENCE (D120 §9): `project.startDate` is `vsb_projectstartdate ?? vsb_startdate`, see the
            // Development / Construction picker above.
            firstDayOfWeek={MONDAY}
            initialPickerDate={project?.startDate}
            // The canvas DatePicker shows its date as "Tue, Nov 24, 2026" (LongAbbreviated).
            formatDate={formatClosingDate}
            value={form.closingDate ?? null}
            onSelectDate={(date: Date | null | undefined) => {
              touch("closingDate");
              updateForm({ closingDate: date ?? undefined });
            }}
          />
          {errorFor("closingDate") ? (
            <span className="canvas-field-error" role="alert" title={errorFor("closingDate")}>
              {errorFor("closingDate")}
            </span>
          ) : null}
        </div>
        <CostField
          label={rightsTotalLabel(currency)}
          labelTitle={rightsTotalLabel(currency)}
          name="txt_Contracts_RightPanel_NewEdit_RightsContract_Content_TotalCosts"
          required
          value={form.totalCostsOverwrite}
          error={errorFor("totalCostsOverwrite")}
          onChange={(v) => updateForm({
            totalCostsOverwrite: v,
            totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
          }, false, ["totalCostsOverwrite"])}
          onBlur={() => touch("totalCostsOverwrite")}
        />
      </FormPanel>

      {/* ── the payment-target panel ────────────────────────────────────── */}
      <FormPanel centerClose
        // D120 §5: a click on the scrim does not close the panel and drop what was typed. The canvas overlay
        // (`con_Contracts_RightPanel_NewEdit*`, 70% scrim, no `OnSelect`) closes only through its X and Cancel.
        keepOpenOnOutsideClick
        open={panel === "target"}
        // Canvas classic `Label` captions: 11 pt, the red `*` hanging left of the caption (canvas.css `.contract-canvas-panel`);
        // `.contract-target-panel`: the 78-high field containers and the Disabled Description (17 Nov 2026).
        panelClassName="contract-canvas-panel contract-target-panel"
        title={selectedTargetId ? MSG.editPeriod : MSG.addPeriod}
        width="narrow"
        onDismiss={cancelTargetPanel}
        footer={<PanelButtons
          onSave={() => { void saveTargetNow(); }}
          onCancel={cancelTargetPanel}
          // `pcf_…_PaymentTarget_Buttons_Save` is a PowerCAT `ActionButton` with `IconColor: If(Disabled, black, white)`
          // (`:3048-3077`): disabled, a transparent "✓ Save", not Fluent's grey filled button.
          subtleWhenDisabled
          disabled={busy || !ready.targets || !canSavePaymentTarget({
            form: targetForm,
            projectStart: project?.startDate,
            targets: contractTargets,
            ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
            locale,
          })} />}
      >
        <CostField
          label={MSG.description}
          name="txt_Contracts_RightPanel_NewEdit_PaymentTarget_Description"
          required
          labelTitle={MSG.description}
          // `DisplayMode`: Edit only while the contract has no payment target (`:2365`); `MaxLength: =55`.
          disabled={periodDescriptionLocked(contractTargets)}
          maxLength={PAYMENT_TARGET_DESCRIPTION_MAX_LENGTH}
          value={targetForm.description}
          error={targetErrorFor("description")}
          onChange={(v) => updateTargetForm({ description: v })}
          onBlur={() => touch("description")}
        />
        {/*
          `vsb_paymentdate` is an nvarchar column and the canvas control is a TextInput with
          an "MM/YYYY" placeholder — NOT a date picker. Substituting one would change the
          stored format and make existing rows incomparable, so this stays a text field.
        */}
        <CostField
          label={MSG.paymentDate}
          labelTitle={MSG.paymentDate}
          name="txt_Contracts_RightPanel_NewEdit_PaymentTarget_PaymentDate"
          required
          placeholder={MSG.paymentDatePlaceholder}
          value={targetForm.paymentDate}
          error={targetErrorFor("paymentDate")}
          onChange={(v) => updateTargetForm({ paymentDate: v })}
          onBlur={() => touch("paymentDate")}
        />
        <CostField
          label={MSG.totalCostsContractPercent}
          labelTitle={MSG.totalCostsContractPercent}
          name="txt_Contracts_Payment_Targets_RightPanel_TotalCosts"
          required
          value={targetForm.totalCostsContract}
          error={targetErrorFor("totalCostsContract")}
          onChange={(v) => updateTargetForm({ totalCostsContract: v })}
          onBlur={() => touch("totalCostsContract")}
        />
        {/*
          The "N % of this contract is still unallocated" line that used to sit here was ours.
          `con_Contracts_RightPanel_NewEdit_PaymentTarget_Content_ColumnLeft` holds four field
          clusters and nothing else, and the Add Period screenshot shows bare space between
          the percentage and Notes. `remainingPercent` is still what `validateTargetPercent`
          rejects an over-allocation with, so the number still reaches the user — as the
          error the canvas also delivered it in.
        */}
        <CostField
          label={MSG.notes}
          labelTitle={MSG.notes}
          name="txt_Contracts_RightPanel_NewEdit_PaymentTarget_Note"
          counter={`${targetForm.note.length}/${NOTE_MAX_LENGTH}`}
          error={targetErrorFor("note")}
        >
          <textarea
            value={targetForm.note}
            maxLength={NOTE_MAX_LENGTH}
            aria-label={MSG.notes}
            onChange={(e) => updateTargetForm({ note: e.target.value })}
            onBlur={() => touch("note")}
            data-testid="target-note"
          />
        </CostField>
      </FormPanel>

      {/* ── delete confirmations ────────────────────────────────────────── */}
      {/*
        * Both instances pass `IconConfirmButton: ="Delete"`, and neither asks for a red
        * button — `cmp_PopUp_Confirmation`'s Confirm is `FillColor: =themePrimary`. The
        * `destructive` red this screen used was ours.
        */}
      <ConfirmDialog
        open={confirm === "contract"}
        title={MSG.deleteContractTitle}
        description={confirmDeleteContractDescription(selectedContract?.description)}
        confirmText={MSG.delete}
        confirmIcon="delete"
        cancelText={MSG.cancel}
        busy={busy}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          setConfirm("none");
          if (!selectedContract) return;
          const deletedId = selectedContract.id;
          setSavingLabel(MSG.spinnerDeletingContract);
          try {
            await deleteContractMutation.mutateAsync(deletedId);
            // CA-17: a card picked while the delete ran is kept; the deleted one is not.
            clearDeletedSelection({ contractId: deletedId });
          } catch (error) {
            handleError(error, "delete this contract", "contractDelete");
          } finally {
            setSavingLabel(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirm === "target"}
        title={MSG.deletePaymentTargetTitle}
        description={confirmDeletePaymentTargetDescription(
          contractTargets.find((t) => t.id === selectedTargetId)?.description,
        )}
        confirmText={MSG.delete}
        confirmIcon="delete"
        cancelText={MSG.cancel}
        busy={busy}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          setConfirm("none");
          if (!selectedTargetId) return;
          const deletedId = selectedTargetId;
          setSavingLabel(MSG.spinnerDeletingPaymentTarget);
          try {
            await deleteTargetMutation.mutateAsync(deletedId);
            // CA-17: a target picked while the delete ran is kept; the deleted one is not.
            clearDeletedSelection({ targetId: deletedId });
          } catch (error) {
            handleError(error, "delete this payment target", "paymentTargetDelete");
          } finally {
            setSavingLabel(null);
          }
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────── sub-components */

/**
 * One closing-date half: a Plan/Actual radio and whichever field it selects.
 * `con_Contracts_RightPanel_NewEdit_CostsUntilClosingDate` and its After twin.
 *
 * `rad_…_CostsUntilClosingDate.Height: =70` for two options — the canvas Radio stacks them,
 * which `.canvas-radio-group` does too. The horizontal `layout` this used to pass was ours.
 */
function ClosingHalf(props: {
  legend: string;
  /** The canvas radio group's name for THIS half — "Until" and "After" are different controls. */
  choiceName?: string;
  planName?: string;
  actualName?: string;
  type: ContractForm["costsUntilClosingType"];
  planValue: string;
  actualValue: string;
  actualError?: string;
  /** The message under the read-only Plan box (the canvas `…_Plan_ErrorMessage`). */
  planError?: string;
  onType: (t: ContractForm["costsUntilClosingType"]) => void;
  onActual: (v: string) => void;
  /** The Actual box lost focus (the "touched" signal, D61). */
  onActualBlur?: () => void;
}) {
  const isPlan = props.type === CLOSING_DATE_TYPE.Plan;
  return (
    <>
      <Choices
        label={props.legend}
        labelTitle={props.legend}
        name={props.choiceName}
        value={isPlan ? MSG.plan : MSG.actual}
        options={[MSG.plan, MSG.actual]}
        onChange={(v) => props.onType(
          v === MSG.plan ? CLOSING_DATE_TYPE.Plan : CLOSING_DATE_TYPE.Actual,
        )}
      />
      {isPlan ? (
        // The Plan figure is what Recalculate writes, so it is read-only: the canvas Plan box is `DisplayMode.View` too
        // (`:4436`), the same as here. Only the Total Costs "Calculated" box differs (D120 §9).
        <CostField label={MSG.plan} labelTitle={MSG.plan} name={props.planName} required disabled
          value={props.planValue} error={props.planError} />
      ) : (
        <CostField
          label={MSG.actual}
          labelTitle={MSG.actual}
          name={props.actualName}
          required
          value={props.actualValue}
          error={props.actualError}
          onChange={props.onActual}
          onBlur={props.onActualBlur}
        />
      )}
    </>
  );
}

/**
 * `img_Contracts_DevCoCosts_ParentCheckbox` — a checkbox drawn as an SVG because the canvas
 * CheckBox control has no indeterminate state.
 *
 * The control's `Image` formula builds the four glyphs inline; they are transcribed here with
 * its own colour names and 24 × 24 box. `parentCheckState` in `rules.ts` decides which one,
 * and is tested there.
 */
const PARENT_CHECKBOX_COLOUR = {
  primary: "#0078D4",
  white: "#FFFFFF",
  grey: "#605E5C",
  disabledFill: "#C8C6C4",
} as const;

function ParentCheckbox({
  state, hasChildren, label, testId, onToggle,
}: {
  state: ParentCheckState;
  hasChildren: boolean;
  label: string;
  /** `data-testid` — the canvas overlay name plus the parent account's stable id. */
  testId: string;
  onToggle: () => void;
}) {
  const filled = state === "checked" || state === "partial";
  const fill = state === "locked"
    ? PARENT_CHECKBOX_COLOUR.disabledFill
    : filled ? PARENT_CHECKBOX_COLOUR.primary : "none";
  // LOCKED draws its tick only when the row HAS a pool of leaves, just none available.
  const tick = state === "checked" || (state === "locked" && hasChildren);
  return (
    <button
      type="button"
      role="checkbox"
      className="canvas-devco-check"
      aria-checked={state === "partial" ? "mixed" : state === "unchecked" ? false : true}
      aria-label={label}
      data-testid={testId}
      disabled={state === "locked"}
      onClick={onToggle}
    >
      {/* The rendered size comes from `--devco-check` (canvas.css, CA-22); 19.64 = 18 × 24/22 is only
          the fallback for a page without the stylesheet. */}
      <svg width="19.64" height="19.64" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect
          x="1" y="1" width="22" height="22" rx="2" ry="2"
          fill={fill}
          stroke={state === "unchecked" ? PARENT_CHECKBOX_COLOUR.grey : "none"}
          strokeWidth={state === "unchecked" ? 1.5 : 0}
        />
        {tick ? (
          <path
            d="M6 12 L10 16 L18 8" fill="none" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            stroke={PARENT_CHECKBOX_COLOUR.white}
          />
        ) : null}
        {state === "partial" ? (
          <line
            x1="6" y1="12" x2="18" y2="12" strokeWidth="2" strokeLinecap="round"
            stroke={PARENT_CHECKBOX_COLOUR.white}
          />
        ) : null}
      </svg>
    </button>
  );
}

/**
 * The DevCo account picker — `gal_Contracts_RightPanel_NewEdit_DevCoCosts`.
 *
 * TWO levels, not three. The outer gallery's `Items` is `Filter(…, Level = 1)` sorted by
 * `Order`; the inner one is `Filter(…, ParentId = ThisItem.Id, Level = 3)` and is
 * `Visible: =Not(ThisItem.IsFolded)`. Level 2 is in the collection but is never drawn, and
 * `buildAccountTree` files each leaf's `parentId` under its level-1 ancestor to match. The
 * flat, always-open, three-level indented list this used to render was ours.
 *
 * `btn_…_DevCoCosts_TransparentButton.OnSelect` folds EVERY row before unfolding the one
 * clicked, so at most one stands open — hence a single `expandedId`, not a set.
 */
/**
 * `gal_Contracts_RightPanel_NewEdit_Costs`' vertical scrollbar: the canvas classic 10 px bar. Its gutter is
 * reserved (`.canvas-devco-leaves`), so the leaf checkboxes stay under the header's whether the list scrolls
 * or not, as on the canvas (D124).
 */
const useDevcoStyles = makeStyles({ leaves: { ...canvasScrollbar } });

function DevCoAccountPicker({
  tree, locale, leafCosts, contractDescriptionById, expandedId, onExpand, onToggleLeaf, onToggleParent,
}: {
  tree: readonly AccountNode[];
  locale: string | undefined;
  /** Per level-3 account: the sum of the project's monthly DevCo CAPEX costs (`:6464`). */
  leafCosts: ReadonlyMap<string, number>;
  /** `colBoPContracts` description by id — the "Used in contract" tooltip (`:6429`). */
  contractDescriptionById: ReadonlyMap<string, string | undefined>;
  expandedId: string | undefined;
  onExpand: (id: string | undefined) => void;
  onToggleLeaf: (id: string, checked: boolean) => void;
  onToggleParent: (parentId: string) => void;
}) {
  const parents = devCoParents(tree);
  const devco = useDevcoStyles();
  return (
    <div className="canvas-devco" role="group" aria-label={MSG.devCoCostsFrom}>
      {parents.map((parent) => {
        const open = expandedId === parent.id;
        const leaves = devCoLeaves(tree, parent.id);
        return (
          <div key={parent.id} className="canvas-devco-card" data-open={open}>
            <div className="canvas-devco-head">
              <button
                type="button"
                className="canvas-devco-title"
                aria-label="Expand account"
                data-testid={`btn_Contracts_RightPanel_NewEdit_DevCoCosts_TransparentButton-${parent.id}`}
                aria-expanded={open}
                aria-controls={`devco-leaves-${parent.id}`}
                onClick={() => onExpand(open ? undefined : parent.id)}
              >
                {`${parent.number} ${parent.name}`}
              </button>
              <ParentCheckbox
                state={parentCheckState(tree, parent.id)}
                hasChildren={parentCheckHasChildren(tree, parent.id)}
                label={`${parent.number} ${parent.name}`}
                testId={`btn_Contracts_DevCoCosts_ParentCheckbox_Overlay-${parent.id}`}
                onToggle={() => onToggleParent(parent.id)}
              />
              <button
                type="button"
                className="canvas-devco-chevron"
                aria-expanded={open}
                aria-controls={`devco-leaves-${parent.id}`}
                aria-label={`${open ? "Collapse" : "Expand"} ${parent.number} ${parent.name}`}
                data-testid={`ico_Contracts_RightPanel_NewEdit_DevCoCosts_${open ? "Up" : "Down"}-${parent.id}`}
                onClick={() => onExpand(open ? undefined : parent.id)}
              >
                {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
              </button>
            </div>

            {open ? (
              <div className={mergeClasses("canvas-devco-leaves", devco.leaves)} id={`devco-leaves-${parent.id}`}>
                {leaves.map((leaf) => (
                  <div key={leaf.id} className="canvas-devco-row" data-used={leaf.used}>
                    <span className="canvas-devco-name">{`${leaf.number} ${leaf.name}`}</span>
                    {/* `lbl_…_CostssRow_TotalCosts` — `Coalesce(Text(Sum(monthly costs), "###,###,###,##0"), "-")`:
                        "-" with no cost row, "0" when they add up to 0 (D124). */}
                    <span className="canvas-devco-total">
                      {devCoLeafTotalText(leafCosts, leaf.id, locale)}
                    </span>
                    {/*
                      * `chb_…_CostssRow`: `Checked: =Or(ThisItem.Selected, ThisItem.Used)` and
                      * `DisplayMode: =If(And(TotalCost > 0, Not(Used)), Edit, View)`. An
                      * account with no DevCo cost behind it is NOT selectable — this used to
                      * disable only the ones another contract had claimed.
                      */}
                    <input
                      type="checkbox"
                      value={leaf.id}
                      data-testid={`chb_Contracts_RightPanel_NewEdit_CostssRow-${leaf.id}`}
                      checked={leaf.selected || leaf.used}
                      disabled={!leafSelectable(leaf)}
                      aria-label={`${leaf.number} ${leaf.name}${
                        leaf.used ? MSG.usedByAnotherContractSuffix : ""}`}
                      title={leaf.used
                        ? usedInContractTooltip(contractDescriptionById.get(leaf.usedByContractId ?? ""))
                        : undefined}
                      onChange={(e) => onToggleLeaf(leaf.id, e.target.checked)}
                    />
                    {/* `rec_…_CostssRow_Used` (`:6421-6433`): a 20 x 20 Warning-bordered square with a 12 % Warning
                        fill over the checkbox, `Visible: =ThisItem.Used`, carrying the "Used in contract" tooltip. */}
                    {leaf.used ? (
                      <span
                        className="canvas-devco-used"
                        aria-hidden="true"
                        data-testid={`rec_Contracts_RightPanel_NewEdit_CostssRow_Used-${leaf.id}`}
                        title={usedInContractTooltip(contractDescriptionById.get(leaf.usedByContractId ?? ""))}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The body of a contract card: its figures and its payment-target table. */
function ContractCardBody({
  contract, currency, locale, targets, selectedTargetId, isSelectedContract, writesDisabled,
  onSelectTarget, onAddTarget, onEditTarget, onDeleteTarget,
}: {
  contract: BopContract;
  currency: string;
  locale: string | undefined;
  targets: readonly PaymentTarget[];
  selectedTargetId: string | undefined;
  /** This card is the screen's selected contract (`locSelectedContract`): the period bar needs it (`:1415`, `:1423`). */
  isSelectedContract: boolean;
  /** `writeCommandsDisabled` (D58): Add Period, Edit and Delete grey out while a write runs. */
  writesDisabled: boolean;
  onSelectTarget: (id: string) => void;
  onAddTarget: () => void;
  onEditTarget: (t: PaymentTarget) => void;
  onDeleteTarget: (t: PaymentTarget) => void;
}) {
  // The payment-target bar: no button inset, so its `+` sits on the card body's 20 px edge,
  // over the targets table and under "Payment Targets" (21 Oct 2026).
  const commandRow = useCommandRowStyles();
  // `pcf_…_Card_Body_PaymentTargets_CommandBar` is a PowerCAT CommandBar (`Theme: =gblAppThemeJson`, Y:1398):
  // the screen bar's skin, so its icons are the theme blue and #c8c6c4 once disabled (17 Nov 2026).
  const commandSkin = useCommandBarStyles();
  // Every card figure follows its canvas `Text(…, "###,##0")` (CONTR-020/021/022/024): a blank is 0, the
  // figure is whole and grouped; the Plan figure is read ONLY when the type is Plan.
  const untilClosing = cardClosingFigure(
    contract.costsUntilClosingType, contract.costsUntilClosingPlan, contract.costsUntilClosingActual,
  );
  const afterClosing = cardClosingFigure(
    contract.costsAfterClosingType, contract.costsAfterClosingPlan, contract.costsAfterClosingActual,
  );
  const totalCosts = cardTotalCostsFigure(contract);
  const marginUnit = contract.marginType === MARGIN_TYPE.Percentage ? "%" : currency;
  const marginValue = cardMarginFigure(contract);

  /*
   * Canvas lays the card out in four COLUMNS, each up to two fields deep
   * (`con_Contracts_List_Card_Body_Columns_1..4`), which reads left-to-right as:
   *
   *   Costs Until Closing | Closing Date | Costs After Closing | Total Costs
   *   Margin              | Total <Type> |
   *
   * A Project Rights contract hides all of those except the closing date and shows its own
   * total in column 1 instead — see `cardShowsClosingCosts`.
   */
  const selectedTarget = targets.find((t) => t.id === selectedTargetId);
  const canAdd = canAddPaymentTarget({
    selectedContractId: isSelectedContract ? contract.id : undefined,
    cardContractId: contract.id,
    targets,
  });
  const canChange = canChangePaymentTarget({
    selectedContractId: isSelectedContract ? contract.id : undefined,
    cardContractId: contract.id,
    hasSelectedTarget: Boolean(selectedTarget),
  });
  const showsClosingCosts = cardShowsClosingCosts(contract.contractType);
  const closingDateField = (
    <CostField label={MSG.closingDate} name="dtp_Contracts_List_Card_Body_Fields_ClosingDate" disabled
      value={longAbbreviatedDate(contract.closingDate)} />
  );
  // Two DIFFERENT canvas controls, not one with a conditional — see `cardTotalLabel`'s own
  // comment in rules.ts. The aria-label stays the same single `cardTotalLabel` text either way;
  // only the Tosca-facing `data-testid` needs to pick the matching control per contract type.
  const totalField = (
    <CostField label={cardTotalLabel(contract.contractType, currency)}
      name={contract.contractType === CONTRACT_TYPE.ProjectRights
        ? "txt_Contracts_List_Card_Body_Fields_TotalCosts_RC"
        : "txt_Contracts_List_Card_Body_Fields_TotalDevContract"}
      disabled value={contract.contractType === CONTRACT_TYPE.ProjectRights
        ? cardRightsTotalText(contract.totalCostOfContract, locale)
        : cardContractTotalText(contract.totalCostOfContract, locale)} />
  );

  return (
    <>
      {/*
        * `con_Contracts_List_Card_Body_Columns`: a wrapping row of vertical columns, each `Width: =Parent.Width/5`
        * (`LayoutMinWidth: =150`). Column 1 stacks Costs Until Closing over Margin, column 2 Closing Date over Total
        * Development Contract, then Costs After Closing and Total Costs — four columns, filled top to bottom.
        */}
      <div className="canvas-contract-fields">
        {showsClosingCosts ? (
          <>
            <div className="canvas-contract-col canvas-contract-col-first">
              <CostField label={CARD_LABEL.costsUntilClosing(currency)}
                name="txt_Contracts_List_Card_Body_Fields_CostsUntilClosing"
                disabled value={wholeNumberText(untilClosing, locale)} />
              <CostField label={CARD_LABEL.margin(marginUnit)}
                name="txt_Contracts_List_Card_Body_Fields_Margins"
                // `FontColor` / `FontItalic: ThisItem.'Is Margin Standard Assumption?'` (`:925`, rule 20).
                standard={marginIsStandard(contract)}
                disabled value={oneDecimalText(marginValue, locale)} />
            </div>
            <div className="canvas-contract-col">
              {closingDateField}
              {totalField}
            </div>
            <div className="canvas-contract-col">
              <CostField label={CARD_LABEL.costsAfterClosing(currency)}
                name="txt_Contracts_List_Card_Body_Fields_CostsAfterClosing"
                disabled value={wholeNumberText(afterClosing, locale)} />
            </div>
            <div className="canvas-contract-col">
              <CostField label={CARD_LABEL.totalCosts(currency)}
                name="txt_Contracts_List_Card_Body_Fields_TotalCosts"
                disabled value={wholeNumberText(totalCosts, locale)} />
            </div>
          </>
        ) : (
          <>
            <div className="canvas-contract-col canvas-contract-col-first">{totalField}</div>
            <div className="canvas-contract-col">{closingDateField}</div>
          </>
        )}
      </div>

      {/*
        * `lbl_…_Card_Body_PaymentTargets` sits ABOVE its own command bar
        * (`pcf_…_Card_Body_PaymentTargets_CommandBar`) rather than beside it, and the bar —
        * not a per-row icon — is what edits and deletes. Edit/Delete act on
        * `gal_…_PaymentTargets.Selected`, so they stay disabled until a period row is
        * selected.
        */}
      <div className="canvas-contract-targets-head">
        <Text weight="semibold">{MSG.paymentTargets}</Text>
        <div className={mergeClasses("canvas-contract-targets-bar", commandRow.row)}>
          <Button aria-label={MSG.addPeriod} data-testid={`contracts-add-target-${contract.id}`}
            className={mergeClasses(commandRow.command, commandSkin.command, (writesDisabled || !canAdd) && commandSkin.disabled)}
            appearance="transparent" icon={<AddRegular />} disabled={writesDisabled || !canAdd} onClick={onAddTarget}>
            {MSG.addPeriod}
          </Button>
          <Button
            aria-label={MSG.edit}
            data-testid={`contracts-edit-target-${contract.id}`}
            className={mergeClasses(commandRow.command, commandSkin.command, (!canChange || writesDisabled) && commandSkin.disabled)}
            appearance="transparent"
            icon={<EditRegular />}
            disabled={!canChange || writesDisabled}
            onClick={() => { if (selectedTarget) onEditTarget(selectedTarget); }}
          >
            {MSG.edit}
          </Button>
          <Button
            aria-label={MSG.delete}
            data-testid={`contracts-delete-target-${contract.id}`}
            className={mergeClasses(commandRow.command, commandSkin.command, (!canChange || writesDisabled) && commandSkin.disabled)}
            appearance="transparent"
            icon={<DeleteRegular />}
            disabled={!canChange || writesDisabled}
            onClick={() => { if (selectedTarget) onDeleteTarget(selectedTarget); }}
          >
            {MSG.delete}
          </Button>
        </div>
      </div>

      {/*
        * With no periods the canvas shows the command bar and nothing else
        * (`Cost App - Contracts Tab Selected - Expanded Contract.png`); the header row is
        * `Visible: =gal_…_PaymentTargets.AllItemsCount > 0`. A lone "-" under the toolbar was
        * ours, not the canvas'.
        */}
      {targets.length === 0 ? null : (
        <table className="canvas-contract-targets"
          aria-label={`${MSG.paymentTargets} for ${contract.description ?? ""}`}>
          <thead>
            <tr>
              <th aria-label="Selection" />
              <th>{MSG.period}</th>
              <th className="numeric">{MSG.paymentDate}</th>
              <th className="numeric">{MSG.percentOfTotalCosts}</th>
              <th>{MSG.notes}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr
                key={t.id}
                aria-label="Payment target"
                data-testid={`btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton-${t.id}`}
                aria-selected={selectedTargetId === t.id}
                onClick={() => onSelectTarget(t.id)}
              >
                <td>
                  <input
                    type="radio"
                    name={`target-${contract.id}`}
                    value={t.id}
                    checked={selectedTargetId === t.id}
                    aria-label={`Select ${t.description ?? ""}`}
                    data-testid={`img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection-${t.id}`}
                    // The row's own click (it bubbles from the radio) does the toggling (`:1850`).
                    onChange={() => undefined}
                  />
                </td>
                <td>{t.description ?? ""}</td>
                <td className="numeric">{t.paymentDate ?? ""}</td>
                <td className="numeric">{targetPercentText(t.totalCostsContract, locale)}</td>
                <td title={t.note}>{t.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
