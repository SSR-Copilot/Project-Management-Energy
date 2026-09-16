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
  Accordion, AccordionHeader, AccordionItem, AccordionPanel,
  Button, Checkbox,
  MessageBar, MessageBarBody, MessageBarTitle,
  Radio, RadioGroup, Switch, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
// The v9 date picker ships separately from the core package.
import { DatePicker } from "@fluentui/react-datepicker-compat";
import { AddRegular, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import {
  CommandBar, ConfirmDialog, EmptyState, FormPanel, LoadingOverlay,
  NumericField, ReadOnlyField, TextAreaField, TextField, type Command,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { palette, space } from "@/theme/tokens";
import { parseNumber, round } from "@/domain/numeric";
import { DataError } from "@/platform/errors";
import { permissionMessage, serverEnforcedProvider } from "@/platform/privileges";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, COMMENT_MAX_LENGTH, MARGIN_TYPE, MSG,
  NOTE_MAX_LENGTH, TOTAL_COSTS_TYPE,
  canSaveContract, canSavePaymentTarget, cardShowsClosingCosts, cardTotalLabel,
  contractCardTitle, contractCommands, contractErrors,
  contractName, costLabel, currencyCode, devCoCostName,
  panelTitle, paymentTargetErrors, paymentTargetName, recalculateForm, remainingPercent,
  contractTotalFromForm, selectedLeafAccounts,
  type BopContract, type CapexCostRow, type ContractForm, type ContractType,
  type PaymentTarget, type PaymentTargetForm,
} from "./rules";
import {
  useAccountTree, useBopStandardAssumption, useCapexAccounts, useCapexCostRows, useContracts,
  useDeleteContract, useDeletePaymentTarget, useDevCoCapexContracts, useDevCoLinks,
  usePaymentTargets, useProjectExtras, useSaveContract, useSavePaymentTarget,
} from "./hooks";
import { costRowsForAccounts } from "@/data/costRepository";

/* ─────────────────────────────────────────────────────────────────── styles */

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  card: {
    // Griffel rejects CSS shorthands, so every side is named explicitly.
    borderTopWidth: "1px", borderRightWidth: "1px",
    borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
  },
  cardTitleRow: { display: "flex", alignItems: "center", gap: space.s, minWidth: 0 },
  typeStripe: { width: "4px", alignSelf: "stretch", borderRadius: "2px" },
  fieldGrid: {
    display: "grid", gap: space.m,
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  },
  panelColumns: {
    display: "grid", gap: space.l,
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
    "@media (max-width: 899px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panelColumn: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  fieldset: {
    display: "flex", flexDirection: "column", gap: space.s,
  },
  legend: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  radioRow: { display: "flex", gap: space.l, flexWrap: "wrap" },
  accountRow: { display: "flex", alignItems: "center", gap: space.s, minWidth: 0 },
  indent1: { paddingLeft: space.l },
  indent2: { paddingLeft: space.xxl },
  usedNote: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  numeric: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  total: { fontWeight: tokens.fontWeightSemibold },
});

/** The coloured stripe on each contract card — `rec_Contracts_List_CardHeader_Type.Fill`. */
const TYPE_COLOUR: Record<number, string> = {
  [CONTRACT_TYPE.Development]: palette.akzent1,
  [CONTRACT_TYPE.Construction]: palette.akzent2,
  [CONTRACT_TYPE.ProjectRights]: palette.akzent4,
  [CONTRACT_TYPE.None]: palette.neutralQuaternary,
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
  const styles = useStyles();
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
    contractType: panel === "contract" && !editing ? form.contractType : undefined,
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

  /* ── the Recalculate button ─────────────────────────────────────────── */

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

  const recalculate = useCallback(() => {
    setForm((f) => recalculateForm(f, capexCosts, locale));
    setRecalculated(true);
  }, [capexCosts, locale]);

  /**
   * Applies a patch and, for the changes the canvas recalculated on, the recalculation with
   * it — in a single `setForm`.
   */
  const updateForm = useCallback(
    (patch: Partial<ContractForm>, thenRecalculate = false) => {
      setForm((f) => {
        const next = { ...f, ...patch };
        return thenRecalculate ? recalculateForm(next, capexCosts, locale) : next;
      });
      if (thenRecalculate) setRecalculated(true);
    },
    [capexCosts, locale],
  );

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
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const targetErrors = paymentTargetErrors({
    form: targetForm,
    projectStart: project?.startDate,
    targets: contractTargets,
    ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
    locale,
  });
  const targetErrorFor = (field: string) =>
    targetErrors.find((e) => e.field === field)?.message;

  /* ── render ─────────────────────────────────────────────────────────── */

  return (
    <div className={styles.page}>
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
        <Accordion multiple collapsible>
          {contracts.map((contract) => (
            <AccordionItem key={contract.id} value={contract.id} className={styles.card}>
              <AccordionHeader
                expandIconPosition="end"
                onClick={() => setSelectedContractId(contract.id)}
              >
                <div className={styles.cardTitleRow}>
                  <span
                    className={styles.typeStripe}
                    style={{ backgroundColor: TYPE_COLOUR[contract.contractType] }}
                    aria-hidden="true"
                  />
                  <Radio
                    checked={selectedContractId === contract.id}
                    aria-label={`Select ${contract.description ?? ""}`}
                    onChange={() => setSelectedContractId(contract.id)}
                  />
                  <Text weight="semibold">{contractCardTitle(contract)}</Text>
                </div>
              </AccordionHeader>
              <AccordionPanel>
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
                    setPanel("target");
                  }}
                  onDeleteTarget={(t) => {
                    setSelectedContractId(contract.id);
                    setSelectedTargetId(t.id);
                    setConfirm("target");
                  }}
                />
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* ── the Development / Construction contract panel ───────────────── */}
      <FormPanel
        open={panel === "contract"}
        title={panelTitle(editing, form.contractType)}
        onDismiss={() => setPanel("none")}
        footer={
          <>
            <Button appearance="secondary" onClick={() => setPanel("none")}>{MSG.cancel}</Button>
            <Button appearance="secondary" onClick={recalculate}>Recalculate</Button>
            <Button
              appearance="primary"
              disabled={!canSaveContract({ form, tree, recalculated, locale }) || busy}
              onClick={saveContractNow}
            >
              {MSG.save}
            </Button>
          </>
        }
      >
        <div className={styles.panelColumns}>
          <div className={styles.panelColumn}>
            <TextField
              label={MSG.description}
              required
              value={form.description}
              error={errorFor("description")}
              onChange={(v) => updateForm({ description: v })}
              testId="contract-description"
            />

            <div className={styles.fieldset}>
              <Text className={styles.legend}>{MSG.contractClosingDate} *</Text>
              <DatePicker
                placeholder={MSG.closingDatePlaceholder}
                value={form.closingDate ?? null}
                onSelectDate={(date: Date | null | undefined) => updateForm({ closingDate: date ?? undefined }, true)}
              />
              {errorFor("closingDate") ? (
                <Text style={{ color: palette.Error }}>{errorFor("closingDate")}</Text>
              ) : null}
            </div>

            <ClosingHalf
              legend={costLabel("Costs Until Closing Date", project ?? {})}
              type={form.costsUntilClosingType}
              planValue={form.costsUntilClosingPlan}
              actualValue={form.costsUntilClosingActual}
              planError={errorFor("costsUntilClosingPlan")}
              actualError={errorFor("costsUntilClosingActual")}
              onType={(t) => updateForm({ costsUntilClosingType: t }, true)}
              onPlan={(v) => updateForm({ costsUntilClosingPlan: v })}
              onActual={(v) => updateForm({ costsUntilClosingActual: v }, true)}
            />

            <ClosingHalf
              legend={costLabel("Costs After Closing Date", project ?? {})}
              type={form.costsAfterClosingType}
              planValue={form.costsAfterClosingPlan}
              actualValue={form.costsAfterClosingActual}
              planError={errorFor("costsAfterClosingPlan")}
              actualError={errorFor("costsAfterClosingActual")}
              onType={(t) => updateForm({ costsAfterClosingType: t }, true)}
              onPlan={(v) => updateForm({ costsAfterClosingPlan: v })}
              onActual={(v) => updateForm({ costsAfterClosingActual: v }, true)}
            />

            <div className={styles.fieldset}>
              <Text className={styles.legend}>{costLabel("Total Costs", project ?? {})}</Text>
              <RadioGroup
                layout="horizontal"
                value={String(form.totalCostsType)}
                onChange={(_, d) =>
                  updateForm({ totalCostsType: Number(d.value) as ContractForm["totalCostsType"] }, true)
                }
              >
                <Radio value={String(TOTAL_COSTS_TYPE.Calculated)} label={MSG.calculated} />
                <Radio value={String(TOTAL_COSTS_TYPE.Overwrite)} label={MSG.overwrite} />
              </RadioGroup>
              {form.totalCostsType === TOTAL_COSTS_TYPE.Calculated ? (
                <NumericField
                  label={MSG.calculated}
                  suffix={currency}
                  required
                  value={form.totalCostsCalculated}
                  error={errorFor("totalCostsCalculated")}
                  onChange={(v) => updateForm({ totalCostsCalculated: v })}
                  testId="total-calculated"
                />
              ) : (
                <NumericField
                  label={MSG.overwrite}
                  suffix={currency}
                  required
                  value={form.totalCostsOverwrite}
                  error={errorFor("totalCostsOverwrite")}
                  onChange={(v) => updateForm({ totalCostsOverwrite: v })}
                  testId="total-overwrite"
                />
              )}
            </div>

            <div className={styles.fieldset}>
              <Text className={styles.legend}>{MSG.margin}</Text>
              <Switch
                checked={form.margin}
                label={form.margin ? "Yes" : "No"}
                onChange={(_, d) =>
                  // rad_..._Margin.OnChange zeroes both margin fields and clears the
                  // standard-assumption flag before recalculating.
                  updateForm({
                    margin: d.checked,
                    marginPercentage: "",
                    marginFixedValue: "",
                    isMarginStandardAssumption: false,
                  }, true)
                }
              />
              {form.margin ? (
                <>
                  <RadioGroup
                    layout="horizontal"
                    value={String(form.marginType)}
                    onChange={(_, d) =>
                      updateForm({
                        marginType: Number(d.value) as ContractForm["marginType"],
                        marginPercentage: "",
                        marginFixedValue: "",
                        isMarginStandardAssumption: false,
                      }, true)
                    }
                  >
                    <Radio value={String(MARGIN_TYPE.Percentage)} label="Percentage" />
                    <Radio value={String(MARGIN_TYPE.FixedValue)} label="Fixed Value" />
                  </RadioGroup>
                  {form.marginType === MARGIN_TYPE.Percentage ? (
                    <NumericField
                      label={MSG.marginPercent}
                      required
                      value={form.marginPercentage}
                      error={errorFor("marginPercentage")}
                      onChange={(v) => updateForm({ marginPercentage: v, isMarginStandardAssumption: false })}
                      testId="margin-percentage"
                    />
                  ) : (
                    <NumericField
                      label="Margin"
                      suffix={currency}
                      required
                      value={form.marginFixedValue}
                      error={errorFor("marginFixedValue")}
                      onChange={(v) => updateForm({ marginFixedValue: v, isMarginStandardAssumption: false })}
                      testId="margin-fixed"
                    />
                  )}
                </>
              ) : null}
            </div>

            <ReadOnlyField
              label={costLabel("Total cost of contract", project ?? {})}
              value={contractTotal.toLocaleString(locale, { maximumFractionDigits: 2 })}
              testId="total-cost-of-contract"
            />
          </div>

          <div className={styles.panelColumn}>
            <div className={styles.fieldset}>
              <Text className={styles.legend}>{MSG.devCoCostsFrom} *</Text>
              {errorFor("devCoCosts") ? (
                <Text style={{ color: palette.Error }}>{errorFor("devCoCosts")}</Text>
              ) : null}
              <DevCoAccountPicker
                tree={tree}
                onToggle={(id, checked) => {
                  setSelectedAccountIds((prev) =>
                    checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
                  );
                  setRecalculated(false);
                }}
              />
            </div>

            <TextAreaField
              label={MSG.comment}
              value={form.comment}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(v) => updateForm({ comment: v })}
              testId="contract-comment"
            />
          </div>
        </div>
      </FormPanel>

      {/* ── the Project Rights contract panel ───────────────────────────── */}
      <FormPanel
        open={panel === "rights"}
        title={panelTitle(editing, CONTRACT_TYPE.ProjectRights)}
        width="narrow"
        onDismiss={() => setPanel("none")}
        footer={
          <>
            <Button appearance="secondary" onClick={() => setPanel("none")}>{MSG.cancel}</Button>
            <Button
              appearance="primary"
              disabled={busy || Boolean(errorFor("description")) || !form.closingDate}
              onClick={saveContractNow}
            >
              {MSG.save}
            </Button>
          </>
        }
      >
        <TextField
          label={MSG.description}
          required
          value={form.description}
          error={errorFor("description")}
          onChange={(v) => updateForm({ description: v })}
          testId="rights-description"
        />
        <div className={styles.fieldset}>
          <Text className={styles.legend}>{MSG.contractClosingDate} *</Text>
          <DatePicker
            placeholder={MSG.closingDatePlaceholder}
            value={form.closingDate ?? null}
            onSelectDate={(date: Date | null | undefined) => updateForm({ closingDate: date ?? undefined })}
          />
        </div>
        <NumericField
          label="Total Costs Contract"
          suffix={currency}
          required
          value={form.totalCostsOverwrite}
          error={errorFor("totalCostsOverwrite")}
          onChange={(v) => updateForm({
            totalCostsOverwrite: v,
            totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
          })}
          testId="rights-total"
        />
      </FormPanel>

      {/* ── the payment-target panel ────────────────────────────────────── */}
      <FormPanel
        open={panel === "target"}
        title={selectedTargetId ? MSG.editPeriod : MSG.addPeriod}
        width="narrow"
        onDismiss={() => setPanel("none")}
        footer={
          <>
            <Button appearance="secondary" onClick={() => setPanel("none")}>{MSG.cancel}</Button>
            <Button
              appearance="primary"
              disabled={busy || !canSavePaymentTarget({
                form: targetForm,
                projectStart: project?.startDate,
                targets: contractTargets,
                ...(selectedTargetId ? { editingTargetId: selectedTargetId } : {}),
                locale,
              })}
              onClick={saveTargetNow}
            >
              {MSG.save}
            </Button>
          </>
        }
      >
        <TextField
          label={MSG.description}
          required
          value={targetForm.description}
          error={targetErrorFor("description")}
          onChange={(v) => setTargetForm((f) => ({ ...f, description: v }))}
          testId="target-description"
        />
        {/*
          `vsb_paymentdate` is an nvarchar column and the canvas control is a TextInput with
          an "MM/YYYY" placeholder — NOT a date picker. Substituting one would change the
          stored format and make existing rows incomparable, so this stays a text field.
        */}
        <TextField
          label={MSG.paymentDate}
          required
          placeholder={MSG.paymentDatePlaceholder}
          value={targetForm.paymentDate}
          error={targetErrorFor("paymentDate")}
          onChange={(v) => setTargetForm((f) => ({ ...f, paymentDate: v }))}
          testId="target-payment-date"
        />
        <NumericField
          label={MSG.totalCostsContractPercent}
          required
          value={targetForm.totalCostsContract}
          error={targetErrorFor("totalCostsContract")}
          onChange={(v) => setTargetForm((f) => ({ ...f, totalCostsContract: v }))}
          testId="target-percent"
        />
        <Text className={styles.usedNote}>
          {`${remainingPercent(contractTargets, selectedTargetId).toLocaleString(locale)} % of this contract is still unallocated.`}
        </Text>
        <TextAreaField
          label={MSG.notes}
          value={targetForm.note}
          maxLength={NOTE_MAX_LENGTH}
          error={targetErrorFor("note")}
          onChange={(v) => setTargetForm((f) => ({ ...f, note: v }))}
          testId="target-note"
        />
      </FormPanel>

      {/* ── delete confirmations ────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirm === "contract"}
        title="Delete Contract?"
        description={`Are you sure that you want to permanently delete "${selectedContract?.description ?? ""}" contract?`}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
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
        confirmText="Delete"
        cancelText="Cancel"
        destructive
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
 */
function ClosingHalf(props: {
  legend: string;
  type: ContractForm["costsUntilClosingType"];
  planValue: string;
  actualValue: string;
  planError?: string;
  actualError?: string;
  onType: (t: ContractForm["costsUntilClosingType"]) => void;
  onPlan: (v: string) => void;
  onActual: (v: string) => void;
}) {
  const styles = useStyles();
  const isPlan = props.type === CLOSING_DATE_TYPE.Plan;
  return (
    <div className={styles.fieldset}>
      <Text className={styles.legend}>{props.legend}</Text>
      <RadioGroup
        layout="horizontal"
        value={String(props.type)}
        onChange={(_, d) => props.onType(Number(d.value) as ContractForm["costsUntilClosingType"])}
      >
        <Radio value={String(CLOSING_DATE_TYPE.Plan)} label={MSG.plan} />
        <Radio value={String(CLOSING_DATE_TYPE.Actual)} label={MSG.actual} />
      </RadioGroup>
      {isPlan ? (
        // The Plan figure is what Recalculate writes, so it is read-only here — the canvas
        // left it editable and then overwrote whatever was typed on the next Recalculate.
        <ReadOnlyField label={MSG.plan} value={props.planValue} />
      ) : (
        <NumericField
          label={MSG.actual}
          required
          value={props.actualValue}
          error={props.actualError}
          onChange={props.onActual}
        />
      )}
    </div>
  );
}

/** The three-level DevCo account tree with its checkboxes. */
function DevCoAccountPicker({
  tree, onToggle,
}: {
  tree: readonly import("./rules").AccountNode[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const styles = useStyles();
  return (
    <div role="group" aria-label={MSG.devCoCostsFrom}>
      {tree.map((node) => (
        <div
          key={node.id}
          className={mergeClasses(
            styles.accountRow,
            node.level === 2 && styles.indent1,
            node.level === 3 && styles.indent2,
          )}
        >
          {node.level === 3 ? (
            <Checkbox
              checked={node.selected}
              disabled={node.used}
              label={`${node.number} ${node.name}`}
              onChange={(_, d) => onToggle(node.id, d.checked === true)}
            />
          ) : (
            <Text weight={node.level === 1 ? "semibold" : "regular"}>
              {`${node.number} ${node.name}`}
            </Text>
          )}
          {node.used ? (
            <Text className={styles.usedNote}>(used by another contract)</Text>
          ) : null}
        </div>
      ))}
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
  const styles = useStyles();
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
    <ReadOnlyField label={MSG.closingDate}
      value={contract.closingDate ? contract.closingDate.toLocaleDateString() : "-"} />
  );
  const totalField = (
    <ReadOnlyField label={cardTotalLabel(contract.contractType, currency)}
      value={fmt(contract.totalCostOfContract)} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.m }}>
      <div className={styles.fieldGrid}>
        {showsClosingCosts ? (
          <>
            <ReadOnlyField label={`Costs Until Closing [${currency}]`} value={fmt(untilClosing)} />
            {closingDateField}
            <ReadOnlyField label={`Costs After Closing [${currency}]`} value={fmt(afterClosing)} />
            <ReadOnlyField label={`Total Costs [${currency}]`} value={fmt(totalCosts)} />
            <ReadOnlyField label={`Margin [${marginUnit}]`} value={fmt(marginValue)} />
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
        * (`pcf_…_Card_Body_PaymentTargets_CommandBar`, `:1388`) rather than beside it, and the
        * bar — not a per-row icon — is what edits and deletes. Edit/Delete act on
        * `gal_…_PaymentTargets.Selected` (`:1446`, `:1453`), so they stay disabled until a
        * period row is selected.
        */}
      <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
        <Text weight="semibold">{MSG.paymentTargets}</Text>
        <div style={{ display: "flex", alignItems: "center" }}>
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

      {targets.length === 0 ? (
        <Text>-</Text>
      ) : (
        <Table size="small" aria-label={`${MSG.paymentTargets} for ${contract.description ?? ""}`}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell />
              <TableHeaderCell>{MSG.period}</TableHeaderCell>
              <TableHeaderCell>{MSG.paymentDate}</TableHeaderCell>
              <TableHeaderCell className={styles.numeric}>
                {MSG.percentOfTotalCosts}
              </TableHeaderCell>
              <TableHeaderCell>{MSG.notes}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((t) => (
              <TableRow
                key={t.id}
                appearance={selectedTargetId === t.id ? "brand" : "none"}
                onClick={() => onSelectTarget(t.id)}
              >
                <TableCell>
                  <Radio
                    checked={selectedTargetId === t.id}
                    aria-label={`Select ${t.description ?? ""}`}
                    onChange={() => onSelectTarget(t.id)}
                  />
                </TableCell>
                <TableCell>{t.description ?? "-"}</TableCell>
                <TableCell>{t.paymentDate ?? "-"}</TableCell>
                <TableCell className={styles.numeric}>{fmt(t.totalCostsContract)}</TableCell>
                <TableCell>{t.note ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
