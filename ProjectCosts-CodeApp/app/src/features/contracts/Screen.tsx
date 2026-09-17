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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, MessageBar, MessageBarBody, MessageBarTitle, Text,
} from "@fluentui/react-components";
// The v9 date picker ships separately from the core package.
import { DatePicker } from "@fluentui/react-datepicker-compat";
import {
  AddRegular, ArrowClockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import {
  CommandBar, ConfirmDialog, EmptyState, FormPanel, LoadingOverlay, type Command,
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
import { Choices, CostField, PanelButtons } from "../costing/Fields";
import { useSession } from "@/app/SessionContext";
import { palette } from "@/theme/tokens";
import { parseNumber, round } from "@/domain/numeric";
import { DataError } from "@/platform/errors";
import { permissionMessage, serverEnforcedProvider } from "@/platform/privileges";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, COMMENT_MAX_LENGTH, MARGIN_TYPE, MSG,
  NOTE_MAX_LENGTH, TOTAL_COSTS_TYPE,
  canSaveContract, canSavePaymentTarget, cardShowsClosingCosts, cardTotalLabel,
  contractCardTitle, contractCommands, contractErrors, longAbbreviatedDate,
  contractName, costLabel, currencyCode, devCoCostName,
  devCoLeaves, devCoParents, leafSelectable, parentCheckHasChildren, parentCheckState,
  panelTitle, paymentTargetErrors, paymentTargetName, recalculateForm,
  contractTotalFromForm, selectedLeafAccounts, toggleParentAccounts,
  type AccountNode, type BopContract, type CapexCostRow, type ContractForm,
  type ContractType, type ParentCheckState, type PaymentTarget, type PaymentTargetForm,
} from "./rules";
import {
  useAccountTree, useBopStandardAssumption, useCapexAccounts, useCapexCostRows, useContracts,
  useDeleteContract, useDeletePaymentTarget, useDevCoCapexContracts, useDevCoLinks,
  usePaymentTargets, useProjectExtras, useSaveContract, useSavePaymentTarget,
} from "./hooks";
import { costRowsForAccounts } from "@/data/costRepository";

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

function formFromContract(c: BopContract): ContractForm {
  const s = (n: number | undefined) => (n === undefined || n === null ? "" : String(n));
  return {
    description: c.description ?? "",
    contractType: c.contractType,
    closingDate: c.closingDate,
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
    totalCostsType:
      c.totalCostsType === TOTAL_COSTS_TYPE.None
        ? TOTAL_COSTS_TYPE.Calculated : c.totalCostsType,
    totalCostsCalculated: s(c.totalCostsCalculated),
    totalCostsOverwrite: s(c.totalCostsOverwrite),
    margin: c.margin,
    marginType: c.marginType ?? MARGIN_TYPE.Percentage,
    marginPercentage: s(c.marginPercentage),
    marginFixedValue: s(c.marginFixedValue),
    comment: c.comment ?? "",
    isMarginStandardAssumption: c.isMarginStandardAssumption,
  };
}

const EMPTY_TARGET_FORM: PaymentTargetForm = {
  description: "", paymentDate: "", totalCostsContract: "", note: "",
};

/* ──────────────────────────────────────────────────────────────── the screen */

type PanelKind = "none" | "contract" | "rights" | "target";

export default function ContractsScreen() {
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
   * Whether the open panel has been edited yet. Validation is computed from the first
   * render, but a panel the user has not touched shows none of it — see `errorFor`.
   */
  const [panelTouched, setPanelTouched] = useState(false);
  const [recalculated, setRecalculated] = useState(false);
  const [confirm, setConfirm] = useState<"none" | "contract" | "target">("none");
  /** Which `locContractSpinnerInformationText` the overlay is showing, or `null` for none. */
  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  const [banner, setBanner] = useState<string>();

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

  const standardAssumption = useBopStandardAssumption({
    countryId: extras.data?.countryId,
    technology: extras.data?.technology,
    contractType: panel === "contract" ? form.contractType : undefined,
  });

  const saveContractMutation = useSaveContract(projectId);
  const deleteContractMutation = useDeleteContract(projectId);
  const saveTargetMutation = useSavePaymentTarget(projectId);
  const deleteTargetMutation = useDeletePaymentTarget(projectId);

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
    if (panel !== "contract" || editing) return;
    const a = standardAssumption.data;
    if (!a) return;
    setForm((f) => ({
      ...f,
      margin: a.vsb_margin === true,
      marginType: (typeof a.vsb_margintype === "number"
        ? a.vsb_margintype : MARGIN_TYPE.Percentage) as ContractForm["marginType"],
      marginPercentage: a.vsb_marginpercentage === undefined ? "" : String(a.vsb_marginpercentage),
      marginFixedValue: a.vsb_marginfixedvalue === undefined ? "" : String(a.vsb_marginfixedvalue),
      isMarginStandardAssumption: true,
    }));
  }, [panel, editing, standardAssumption.data]);

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
      setPanelTouched(true);
      setForm((f) => recalculateForm(f, rows, locale));
      setRecalculated(true);
    },
    [tree, capexCostRows.data, devCoContractsQuery.data, locale],
  );

  /** The payment-target twin of `updateForm`; `panelTouched` gates that panel's errors too. */
  const updateTargetForm = useCallback((patch: Partial<PaymentTargetForm>) => {
    setPanelTouched(true);
    setTargetForm((f) => ({ ...f, ...patch }));
  }, []);

  /** `chb_Contracts_RightPanel_NewEdit_CostssRow.OnCheck` / `.OnUncheck`. */
  const toggleLeafAccount = useCallback(
    (id: string, checked: boolean) => {
      const next = checked
        ? [...new Set([...selectedAccountIds, id])]
        : selectedAccountIds.filter((x) => x !== id);
      setSelectedAccountIds(next);
      recalculateFor(next);
    },
    [selectedAccountIds, recalculateFor],
  );

  /** `img_Contracts_DevCoCosts_ParentCheckbox.OnSelect`. */
  const toggleParentAccount = useCallback(
    (parentId: string) => {
      const next = toggleParentAccounts(tree, parentId, selectedAccountIds);
      setSelectedAccountIds(next);
      recalculateFor(next);
    },
    [tree, selectedAccountIds, recalculateFor],
  );

  /**
   * Applies a patch and, for the changes the canvas recalculated on, the recalculation with
   * it — in a single `setForm`.
   */
  const updateForm = useCallback(
    (patch: Partial<ContractForm>, thenRecalculate = false) => {
      setPanelTouched(true);
      setForm((f) => {
        const next = { ...f, ...patch };
        return thenRecalculate ? recalculateForm(next, capexCosts, locale) : next;
      });
      if (thenRecalculate) setRecalculated(true);
    },
    [capexCosts, locale],
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
    updateForm({
      margin: a?.vsb_margin === true,
      marginType: (typeof a?.vsb_margintype === "number"
        ? a.vsb_margintype : MARGIN_TYPE.Percentage) as ContractForm["marginType"],
      marginPercentage:
        a?.vsb_marginpercentage === undefined ? "" : String(a.vsb_marginpercentage),
      marginFixedValue:
        a?.vsb_marginfixedvalue === undefined ? "" : String(a.vsb_marginfixedvalue),
      isMarginStandardAssumption: Boolean(a),
    }, true);
  }, [standardAssumption.data, updateForm]);

  const contractTotal = useMemo(
    () => contractTotalFromForm(form, locale),
    [form, locale],
  );

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
    return contractCommands({
      canCreate: privileges.canCreate,
      canWrite: privileges.canWrite,
      canDelete: privileges.canDelete,
      hasSelection: Boolean(selectedContract),
    }).map((c) => ({ key: c.key, label: c.label, icon: icons[c.key], enabled: c.enabled }));
  }, [privileges, selectedContract]);

  const openNewContract = (contractType: ContractType, kind: PanelKind) => {
    setEditing(false);
    setSelectedContractId(undefined);
    setSelectedAccountIds([]);
    setForm(emptyContractForm(contractType));
    setExpandedAccountId(undefined);
    setPanelTouched(false);
    setRecalculated(false);
    setPanel(kind);
  };

  const openEditContract = () => {
    if (!selectedContract) return;
    setEditing(true);
    setForm(formFromContract(selectedContract));
    setSelectedAccountIds(
      (devCoLinksQuery.data ?? [])
        .filter((l) => l.contractId === selectedContract.id)
        .map((l) => l.accountId),
    );
    setExpandedAccountId(undefined);
    setPanelTouched(false);
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

  const handleError = (error: unknown, action: string) => {
    const message = permissionMessage(error, action);
    if (message) { setBanner(message); return; }
    setBanner(
      error instanceof DataError
        ? `Error: BoP Contract could not be saved correctly. ${error.message}`
        : `Error: BoP Contract could not be saved correctly.`,
    );
  };

  const saveContractNow = async () => {
    if (!project || !projectId) return;
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
     */
    setSavingLabel(form.contractType === CONTRACT_TYPE.ProjectRights
      ? MSG.spinnerSavingRightsContract : MSG.spinnerSavingContract);
    setPanel("none");
    try {
      await saveContractMutation.mutateAsync({
        write: {
          ...(editing && selectedContract ? { id: selectedContract.id } : {}),
          projectId,
          owningBusinessUnitId: project.owningBusinessUnitId,
          name: contractName(project.projectIdCode, form.description),
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
          totalCostOfContract: round(contractTotal, 2),
          comment: form.comment,
          isMarginStandardAssumption: form.isMarginStandardAssumption,
        },
        accounts: leaves.map((n) => ({ id: n.id, name: devCoCostName(n) })),
      });
    } catch (error) {
      handleError(error, "save this contract");
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
      handleError(error, "save this payment target");
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
        title="No project selected"
        description="Pick a project from the overview and use Edit Costs to open its costs."
        action={{ label: "Go to Projects", onClick: () => navigate("/projects") }}
      />
    );
  }
  if (projectNotFound) {
    return (
      <EmptyState
        title="That project could not be opened"
        description={
          "It may have been deleted, or it may belong to a business unit your account " +
          "cannot see. Ask your administrator if you believe you should have access."
        }
        action={{ label: "Go to Projects", onClick: () => navigate("/projects") }}
      />
    );
  }

  if (contractsQuery.isLoading || accountsQuery.isLoading) {
    return <LoadingOverlay mode="inline" label="Loading contracts…" />;
  }

  const busy =
    saveContractMutation.isPending || deleteContractMutation.isPending ||
    saveTargetMutation.isPending || deleteTargetMutation.isPending;

  const currency = currencyCode(project ?? {});
  const errors = contractErrors(form, tree, locale);
  const errorFor = (field: string) =>
    (panelTouched ? errors.find((e) => e.field === field)?.message : undefined);
  const targetErrors = paymentTargetErrors({
    form: targetForm,
    projectStart: project?.startDate,
    targets: contractTargets,
    ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
    locale,
  });
  const targetErrorFor = (field: string) =>
    (panelTouched ? targetErrors.find((e) => e.field === field)?.message : undefined);

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <div className="canvas-contract-screen">
      {banner ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Could not complete that</MessageBarTitle>
            {banner}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      <CommandBar commands={commands} onCommand={onCommand} ariaLabel="Contract actions" />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Use Add Development Contract, Add Construction Contract or Add Project Rights Contract to create one."
        />
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
                    checked={selectedContractId === contract.id}
                    aria-label={`Select ${contract.description ?? ""}`}
                    onChange={() => {
                      setSelectedContractId(contract.id);
                      setSelectedTargetId(undefined);
                    }}
                  />
                  {/*
                    * `btn_Contracts_List_CardHeader_TransparentButton` covers the band and
                    * TOGGLES the selection — clicking the selected contract clears it. It
                    * does not fold anything.
                    */}
                  <button
                    type="button"
                    className="canvas-contract-title"
                    onClick={() => setSelectedContractId(
                      selectedContractId === contract.id ? undefined : contract.id,
                    )}
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
                    onClick={() => setExpanded((prev) =>
                      prev.includes(contract.id)
                        ? prev.filter((id) => id !== contract.id)
                        : [...prev, contract.id],
                    )}
                  >
                    {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                  </button>
                </div>

                {open ? (
                  <div className="canvas-contract-body" id={`contract-body-${contract.id}`}>
                    <ContractCardBody
                      contract={contract}
                      currency={currency}
                      targets={targets.byContract.get(contract.id) ?? []}
                      selectedTargetId={selectedTargetId}
                      onSelectTarget={setSelectedTargetId}
                      onAddTarget={() => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(undefined);
                        setTargetForm(EMPTY_TARGET_FORM);
                        setPanelTouched(false);
                        setPanel("target");
                      }}
                      onEditTarget={(t) => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(t.id);
                        setTargetForm({
                          description: t.description ?? "",
                          paymentDate: t.paymentDate ?? "",
                          totalCostsContract:
                            t.totalCostsContract === undefined ? "" : String(t.totalCostsContract),
                          note: t.note ?? "",
                        });
                        setPanelTouched(false);
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
      <FormPanel
        open={panel === "contract"}
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
          disabled={!canSaveContract({ form, tree, recalculated, locale }) || busy} />}
      >
        <div className="canvas-panel-columns">
          <div className="canvas-panel-column">
            <CostField
              label={MSG.description}
              required
              value={form.description}
              error={errorFor("description")}
              onChange={(v) => updateForm({ description: v })}
            />

            <div className="canvas-field" data-invalid={errorFor("closingDate") ? true : undefined}>
              <span data-required="true">{MSG.contractClosingDate}</span>
              <DatePicker
                placeholder={MSG.closingDatePlaceholder}
                value={form.closingDate ?? null}
                onSelectDate={(date: Date | null | undefined) => updateForm({ closingDate: date ?? undefined }, true)}
              />
              {errorFor("closingDate") ? (
                <span className="canvas-field-error" role="alert">{errorFor("closingDate")}</span>
              ) : null}
            </div>

            <ClosingHalf
              legend={costLabel("Costs Until Closing Date", project ?? {})}
              type={form.costsUntilClosingType}
              planValue={form.costsUntilClosingPlan}
              actualValue={form.costsUntilClosingActual}
              actualError={errorFor("costsUntilClosingActual")}
              onType={(t) => updateForm({ costsUntilClosingType: t }, true)}
              onActual={(v) => updateForm({ costsUntilClosingActual: v }, true)}
            />

            <ClosingHalf
              legend={costLabel("Costs After Closing Date", project ?? {})}
              type={form.costsAfterClosingType}
              planValue={form.costsAfterClosingPlan}
              actualValue={form.costsAfterClosingActual}
              actualError={errorFor("costsAfterClosingActual")}
              onType={(t) => updateForm({ costsAfterClosingType: t }, true)}
              onActual={(v) => updateForm({ costsAfterClosingActual: v }, true)}
            />

            <Choices
              label={costLabel("Total Costs", project ?? {})}
              value={form.totalCostsType === TOTAL_COSTS_TYPE.Calculated ? MSG.calculated : MSG.overwrite}
              options={[MSG.calculated, MSG.overwrite]}
              onChange={(v) => updateForm({
                totalCostsType: v === MSG.calculated
                  ? TOTAL_COSTS_TYPE.Calculated : TOTAL_COSTS_TYPE.Overwrite,
              }, true)}
            />
            {form.totalCostsType === TOTAL_COSTS_TYPE.Calculated ? (
              // `txt_…_TotalCosts_Calculated` is what Recalculate writes, so it is read-only.
              <CostField label={MSG.calculated} required disabled value={form.totalCostsCalculated} />
            ) : (
              <CostField
                label={MSG.overwrite}
                required
                value={form.totalCostsOverwrite}
                error={errorFor("totalCostsOverwrite")}
                onChange={(v) => updateForm({ totalCostsOverwrite: v }, true)}
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
              value={form.margin ? "Yes" : "No"}
              options={["Yes", "No"]}
              onChange={(v) => updateForm({
                margin: v === "Yes",
                marginPercentage: "",
                marginFixedValue: "",
                isMarginStandardAssumption: false,
              }, true)}
              action={
                <button
                  type="button"
                  className="canvas-field-reset"
                  title={MSG.resetToStandardAssumption}
                  aria-label={MSG.resetToStandardAssumption}
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
                  value={form.marginType === MARGIN_TYPE.Percentage ? "Percentage" : "Fixed Value"}
                  options={["Percentage", "Fixed Value"]}
                  onChange={(v) => updateForm({
                    marginType: v === "Percentage" ? MARGIN_TYPE.Percentage : MARGIN_TYPE.FixedValue,
                    marginPercentage: "",
                    marginFixedValue: "",
                    isMarginStandardAssumption: false,
                  }, true)}
                />
                {form.marginType === MARGIN_TYPE.Percentage ? (
                  <CostField
                    label={MSG.marginPercent}
                    required
                    value={form.marginPercentage}
                    error={errorFor("marginPercentage")}
                    onChange={(v) => updateForm(
                      { marginPercentage: v, isMarginStandardAssumption: false }, true,
                    )}
                  />
                ) : (
                  <CostField
                    label={costLabel(MSG.marginFixedValue, project ?? {})}
                    required
                    value={form.marginFixedValue}
                    error={errorFor("marginFixedValue")}
                    onChange={(v) => updateForm(
                      { marginFixedValue: v, isMarginStandardAssumption: false }, true,
                    )}
                  />
                )}
              </>
            ) : null}

            <CostField
              label={costLabel("Total cost of contract", project ?? {})}
              disabled
              value={contractTotal.toLocaleString(locale, { maximumFractionDigits: 2 })}
            />
          </div>

          <div className="canvas-panel-column">
            <div className="canvas-field">
              <span data-required="true">{MSG.devCoCostsFrom}</span>
              {errorFor("devCoCosts") ? (
                <span className="canvas-field-error" role="alert">{errorFor("devCoCosts")}</span>
              ) : null}
              <DevCoAccountPicker
                tree={tree}
                locale={locale}
                expandedId={expandedAccountId}
                onExpand={setExpandedAccountId}
                onToggleLeaf={toggleLeafAccount}
                onToggleParent={toggleParentAccount}
              />
            </div>

            <CostField
              label={MSG.comment}
              counter={`${form.comment.length}/${COMMENT_MAX_LENGTH}`}
            >
              <textarea
                value={form.comment}
                maxLength={COMMENT_MAX_LENGTH}
                aria-label={MSG.comment}
                onChange={(e) => updateForm({ comment: e.target.value })}
                data-testid="contract-comment"
              />
            </CostField>
          </div>
        </div>
      </FormPanel>

      {/* ── the Project Rights contract panel ───────────────────────────── */}
      <FormPanel
        open={panel === "rights"}
        title={panelTitle(editing, CONTRACT_TYPE.ProjectRights)}
        width="narrow"
        onDismiss={() => setPanel("none")}
        footer={<PanelButtons
          onSave={() => { void saveContractNow(); }}
          onCancel={() => setPanel("none")}
          disabled={busy || !form.description.trim() || Boolean(errorFor("description"))
            || !form.closingDate
            || !form.totalCostsOverwrite.trim() || Boolean(errorFor("totalCostsOverwrite"))} />}
      >
        <CostField
          label={MSG.description}
          required
          value={form.description}
          error={errorFor("description")}
          onChange={(v) => updateForm({ description: v })}
        />
        <div className="canvas-field">
          <span data-required="true">{MSG.contractClosingDate}</span>
          <DatePicker
            placeholder={MSG.closingDatePlaceholder}
            value={form.closingDate ?? null}
            onSelectDate={(date: Date | null | undefined) => updateForm({ closingDate: date ?? undefined })}
          />
        </div>
        <CostField
          label={`Total Costs Contract [${currency}]`}
          required
          value={form.totalCostsOverwrite}
          error={errorFor("totalCostsOverwrite")}
          onChange={(v) => updateForm({
            totalCostsOverwrite: v,
            totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
          })}
        />
      </FormPanel>

      {/* ── the payment-target panel ────────────────────────────────────── */}
      <FormPanel
        open={panel === "target"}
        title={selectedTargetId ? MSG.editPeriod : MSG.addPeriod}
        width="narrow"
        onDismiss={() => setPanel("none")}
        footer={<PanelButtons
          onSave={() => { void saveTargetNow(); }}
          onCancel={() => setPanel("none")}
          disabled={busy || !canSavePaymentTarget({
            form: targetForm,
            projectStart: project?.startDate,
            targets: contractTargets,
            ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
            locale,
          })} />}
      >
        <CostField
          label={MSG.description}
          required
          value={targetForm.description}
          error={targetErrorFor("description")}
          onChange={(v) => updateTargetForm({ description: v })}
        />
        {/*
          `vsb_paymentdate` is an nvarchar column and the canvas control is a TextInput with
          an "MM/YYYY" placeholder — NOT a date picker. Substituting one would change the
          stored format and make existing rows incomparable, so this stays a text field.
        */}
        <CostField
          label={MSG.paymentDate}
          required
          placeholder={MSG.paymentDatePlaceholder}
          value={targetForm.paymentDate}
          error={targetErrorFor("paymentDate")}
          onChange={(v) => updateTargetForm({ paymentDate: v })}
        />
        <CostField
          label={MSG.totalCostsContractPercent}
          required
          value={targetForm.totalCostsContract}
          error={targetErrorFor("totalCostsContract")}
          onChange={(v) => updateTargetForm({ totalCostsContract: v })}
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
          counter={`${targetForm.note.length}/${NOTE_MAX_LENGTH}`}
          error={targetErrorFor("note")}
        >
          <textarea
            value={targetForm.note}
            maxLength={NOTE_MAX_LENGTH}
            aria-label={MSG.notes}
            onChange={(e) => updateTargetForm({ note: e.target.value })}
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
        title="Delete Contract?"
        description={`Are you sure that you want to permanently delete "${selectedContract?.description ?? ""}" contract?`}
        confirmText={MSG.delete}
        confirmIcon="delete"
        cancelText={MSG.cancel}
        busy={busy}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          setConfirm("none");
          if (!selectedContract) return;
          setSavingLabel(MSG.spinnerDeletingContract);
          try {
            await deleteContractMutation.mutateAsync(selectedContract.id);
            setSelectedContractId(undefined);
            setSelectedTargetId(undefined);
          } catch (error) {
            handleError(error, "delete this contract");
          } finally {
            setSavingLabel(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirm === "target"}
        title="Delete Payment Target?"
        description={`Are you sure that you want to permanently delete "${
          contractTargets.find((t) => t.id === selectedTargetId)?.description ?? ""
        }" payment target?`}
        confirmText={MSG.delete}
        confirmIcon="delete"
        cancelText={MSG.cancel}
        busy={busy}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          setConfirm("none");
          if (!selectedTargetId) return;
          setSavingLabel(MSG.spinnerDeletingPaymentTarget);
          try {
            await deleteTargetMutation.mutateAsync(selectedTargetId);
            setSelectedTargetId(undefined);
          } catch (error) {
            handleError(error, "delete this payment target");
          } finally {
            setSavingLabel(null);
          }
        }}
      />

      {/* The canvas names the operation in the spinner; `savingLabel` carries which one. */}
      {busy ? <LoadingOverlay label={savingLabel ?? MSG.spinnerSavingContract} /> : null}
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
  type: ContractForm["costsUntilClosingType"];
  planValue: string;
  actualValue: string;
  actualError?: string;
  onType: (t: ContractForm["costsUntilClosingType"]) => void;
  onActual: (v: string) => void;
}) {
  const isPlan = props.type === CLOSING_DATE_TYPE.Plan;
  return (
    <>
      <Choices
        label={props.legend}
        value={isPlan ? MSG.plan : MSG.actual}
        options={[MSG.plan, MSG.actual]}
        onChange={(v) => props.onType(
          v === MSG.plan ? CLOSING_DATE_TYPE.Plan : CLOSING_DATE_TYPE.Actual,
        )}
      />
      {isPlan ? (
        // The Plan figure is what Recalculate writes, so it is read-only here — the canvas
        // left it editable and then overwrote whatever was typed on the next Recalculate.
        <CostField label={MSG.plan} required disabled value={props.planValue} />
      ) : (
        <CostField
          label={MSG.actual}
          required
          value={props.actualValue}
          error={props.actualError}
          onChange={props.onActual}
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
  state, hasChildren, label, onToggle,
}: {
  state: ParentCheckState;
  hasChildren: boolean;
  label: string;
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
      disabled={state === "locked"}
      onClick={onToggle}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
function DevCoAccountPicker({
  tree, locale, expandedId, onExpand, onToggleLeaf, onToggleParent,
}: {
  tree: readonly AccountNode[];
  locale: string | undefined;
  expandedId: string | undefined;
  onExpand: (id: string | undefined) => void;
  onToggleLeaf: (id: string, checked: boolean) => void;
  onToggleParent: (parentId: string) => void;
}) {
  const parents = devCoParents(tree);
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
                onToggle={() => onToggleParent(parent.id)}
              />
              <button
                type="button"
                className="canvas-devco-chevron"
                aria-expanded={open}
                aria-controls={`devco-leaves-${parent.id}`}
                aria-label={`${open ? "Collapse" : "Expand"} ${parent.number} ${parent.name}`}
                onClick={() => onExpand(open ? undefined : parent.id)}
              >
                {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
              </button>
            </div>

            {open ? (
              <div className="canvas-devco-leaves" id={`devco-leaves-${parent.id}`}>
                {leaves.map((leaf) => (
                  <div key={leaf.id} className="canvas-devco-row" data-used={leaf.used}>
                    <span className="canvas-devco-name">{`${leaf.number} ${leaf.name}`}</span>
                    {/* `lbl_…_CostssRow_TotalCosts` — `Coalesce(Text(Sum(…)), "-")`. */}
                    <span className="canvas-devco-total">
                      {leaf.totalCost > 0
                        ? leaf.totalCost.toLocaleString(locale, { maximumFractionDigits: 0 })
                        : "-"}
                    </span>
                    {/*
                      * `chb_…_CostssRow`: `Checked: =Or(ThisItem.Selected, ThisItem.Used)` and
                      * `DisplayMode: =If(And(TotalCost > 0, Not(Used)), Edit, View)`. An
                      * account with no DevCo cost behind it is NOT selectable — this used to
                      * disable only the ones another contract had claimed.
                      */}
                    <input
                      type="checkbox"
                      checked={leaf.selected || leaf.used}
                      disabled={!leafSelectable(leaf)}
                      aria-label={`${leaf.number} ${leaf.name}${
                        leaf.used ? " (used by another contract)" : ""}`}
                      title={leaf.used ? "Used by another contract" : undefined}
                      onChange={(e) => onToggleLeaf(leaf.id, e.target.checked)}
                    />
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
  contract, currency, targets, selectedTargetId,
  onSelectTarget, onAddTarget, onEditTarget, onDeleteTarget,
}: {
  contract: BopContract;
  currency: string;
  targets: readonly PaymentTarget[];
  selectedTargetId: string | undefined;
  onSelectTarget: (id: string) => void;
  onAddTarget: () => void;
  onEditTarget: (t: PaymentTarget) => void;
  onDeleteTarget: (t: PaymentTarget) => void;
}) {
  const fmt = (n: number | undefined) =>
    n === undefined || n === null ? "-" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const untilClosing =
    contract.costsUntilClosingType === CLOSING_DATE_TYPE.Actual
      ? contract.costsUntilClosingActual : contract.costsUntilClosingPlan;
  const afterClosing =
    contract.costsAfterClosingType === CLOSING_DATE_TYPE.Actual
      ? contract.costsAfterClosingActual : contract.costsAfterClosingPlan;
  const totalCosts =
    contract.totalCostsType === TOTAL_COSTS_TYPE.Overwrite
      ? contract.totalCostsOverwrite : contract.totalCostsCalculated;
  const marginUnit = contract.marginType === MARGIN_TYPE.Percentage ? "%" : currency;
  const marginValue =
    contract.marginType === MARGIN_TYPE.Percentage
      ? contract.marginPercentage : contract.marginFixedValue;

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
  const showsClosingCosts = cardShowsClosingCosts(contract.contractType);
  const closingDateField = (
    <CostField label={MSG.closingDate} disabled
      value={longAbbreviatedDate(contract.closingDate)} />
  );
  const totalField = (
    <CostField label={cardTotalLabel(contract.contractType, currency)} disabled
      value={fmt(contract.totalCostOfContract)} />
  );

  return (
    <>
      <div className="canvas-contract-fields">
        {showsClosingCosts ? (
          <>
            <CostField label={`Costs Until Closing [${currency}]`} disabled value={fmt(untilClosing)} />
            {closingDateField}
            <CostField label={`Costs After Closing [${currency}]`} disabled value={fmt(afterClosing)} />
            <CostField label={`Total Costs [${currency}]`} disabled value={fmt(totalCosts)} />
            <CostField label={`Margin [${marginUnit}]`} disabled value={fmt(marginValue)} />
            {totalField}
          </>
        ) : (
          <>
            {totalField}
            {closingDateField}
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
        <div className="canvas-contract-targets-bar">
          <Button appearance="transparent" icon={<AddRegular />} onClick={onAddTarget}>
            {MSG.addPeriod}
          </Button>
          <Button
            appearance="transparent"
            icon={<EditRegular />}
            disabled={!selectedTarget}
            onClick={() => { if (selectedTarget) onEditTarget(selectedTarget); }}
          >
            {MSG.edit}
          </Button>
          <Button
            appearance="transparent"
            icon={<DeleteRegular />}
            disabled={!selectedTarget}
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
              <th>{MSG.paymentDate}</th>
              <th className="numeric">{MSG.percentOfTotalCosts}</th>
              <th>{MSG.notes}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr
                key={t.id}
                aria-selected={selectedTargetId === t.id}
                onClick={() => onSelectTarget(t.id)}
              >
                <td>
                  <input
                    type="radio"
                    name={`target-${contract.id}`}
                    checked={selectedTargetId === t.id}
                    aria-label={`Select ${t.description ?? ""}`}
                    onChange={() => onSelectTarget(t.id)}
                  />
                </td>
                <td>{t.description ?? "-"}</td>
                <td>{t.paymentDate ?? "-"}</td>
                <td className="numeric">{fmt(t.totalCostsContract)}</td>
                <td>{t.note ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
