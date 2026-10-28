/**
 * Application Settings — Contracts (BoP standard-assumption contracts). Replaces the canvas
 * `Admin Contract Screen` (PM app,
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml`).
 * Composition only: rules in `./rules.ts`, Dataverse in `@/data/adminContract.ts`, query wiring in
 * `./hooks.ts`. Canvas map (each `data-testid` is the canvas control name):
 *
 *   cmp_AdminContraacts_NestedCountryPickerColumn  country rail (`testIdPrefix`)
 *   con_AdminContract_Selected_Country_Technology  scope heading + the two Add buttons
 *   gal_AdminContracts_StandardAssumptions_Updated contract cards (`ContractCard`)
 *   con_AdminContracrt_RightPanel_NewEditContract  the New / Edit panel (`ContractPanel`)
 *   cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1  delete confirmation
 *   cmp_PopUp_Loading_AdminBoPContracts            the "Please wait, …" overlays
 *
 * The app shell gates `/admin/*`. Within the screen `useAdminAccess` (Application Administrator /
 * Controller Own Data) gates every write command: Add, Edit, Delete and Save are disabled for
 * anyone else. Writes are server-enforced (`serverEnforcedProvider`); a 403 shows
 * `permissionMessage`.
 * DIVERGENCE: the canvas screen has no permission signal at all; every command is enabled.
 *
 * Shared modules: the Country / Technology picker (`CountryTechnologyPicker` +
 * `useCountryTechnologyUrlSelection`, `?country&tech`, push history), the active-countries read,
 * `useNotify()` toasts, `FormPanel` (`full`) and its `beforeunload` registration.
 * Reusable components: `QueryStates` / `useQueryHealth`, `ScopeHeaderBand`,
 * `DisabledReason`, `NoticeBar`, `usePanelState`, `useToggleSet`, `useConfirmDialog`,
 * `useTablePrivileges`, and the three-way close prompt through `FormPanel closePrompt`.
 *
 * DIVERGENCE: the success / failure toasts ("Contract saved", "Contract deleted", the
 * `messages.ts` texts), the loading and empty states and the DevCo Retry bar have no canvas
 * equivalent (CONVENTIONS rule 19).
 */
import { useEffect, useMemo, useRef } from "react";
import { Button, makeStyles, mergeClasses } from "@fluentui/react-components";
import { AddFilled } from "@fluentui/react-icons";
import {
  ConfirmDialog, CountryTechnologyPicker, DisabledReason, EmptyState, LoadingOverlay, NoticeBar, QueryStates,
  ScopeHeaderBand, useNotify,
  useQueryHealth, type CloseReason,
} from "@/components";
import { useConfirmDialog } from "@/features/shared/useConfirmDialog";
import { useCountryTechnologyUrlSelection } from "@/features/shared/useCountryTechnologySelection";
import { usePanelState } from "@/features/shared/usePanelState";
import { useToggleSet } from "@/features/shared/useToggleSet";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { useAdminAccess } from "@/app/useCurrentUser";
import { useTablePrivileges } from "@/platform/privileges";
import { repairLanguageTag } from "@/domain/locale";
import { RecordGoneError } from "@/platform/errors";
import {
  CONTRACT_COUNTRY_RULE, CONTRACT_DEFAULT, pickerCountries, sameCountryTechnology, type CountryTechnology,
} from "@/domain/countryPicker";
import { CONTRACT_TECHNOLOGIES, technologyOptionLabel } from "@/domain/technology";
import { useActiveCountries } from "@/data/countries";
import { ContractSaveError, ENTITY, OwnershipConflictError, type SaveContractInput } from "@/data/adminContract";
import {
  CARD_TEXT, CONTRACT_TYPE, INCOMPLETE_CLOSED_WARNING, breadcrumbText, buildAccountTree,
  canSave, classifyAccounts, closeDialogText, closePrompt, currencyOf, deleteDescription, groupDevCoTags, initialForm,
  isDirty, limitFlags, limitMessage, panelTitle, sortContracts, validateForm,
  withoutAccounts,
  type ContractForm, type StandardContract,
} from "./rules";
import {
  useCapexAccounts, useContractDevCo, useDeleteContract, useFetchContract,
  useSaveContract, useStandardContracts,
} from "./hooks";
import { ContractCard } from "./ContractCard";
import { ContractPanel } from "./ContractPanel";
import { DevCoCostForm } from "./DevCoCostForm";
import {
  CONTRACT_ALREADY_DELETED_MESSAGE, deleteErrorMessage, loadErrorText, openErrorMessage, saveErrorMessage,
} from "./messages";

const useStyles = makeStyles({
  root: { display: "flex", gap: "5px", minHeight: "100%", alignItems: "stretch" },
  // The content column owns the screen's single scroll region (keep one scroll
  // container: the content area), so a long contract list cannot drive the row
  // taller than the viewport and drag the stretched picker past the rail.
  content: {
    flexGrow: 1, minWidth: "0", minHeight: "0",
    display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "10px",
    overflowY: "auto",
  },
  addButton: { minWidth: "230px", justifyContent: "flex-start" },
  // Cards touch each other (gallery `TemplatePadding: 0`, ACS:833); `minWidth: 0` keeps long
  // content from widening the column.
  list: { display: "flex", flexDirection: "column", gap: "0", paddingLeft: "20px", paddingRight: "20px", minWidth: "0" },
});

/**
 * The UI language for the `fn_Numeric` separator rule. The app has no Power Apps
 * `Language()` equivalent; `navigator.language` is the source the shell uses too (`App.tsx`),
 * repaired by the shared `repairLanguageTag` so a malformed tag cannot break `Intl`.
 */
function uiLanguage(): string {
  return typeof navigator !== "undefined" && navigator.language ? repairLanguageTag(navigator.language) : "en-US";
}

/**
 * This screen's load checks, kept as they were before `useQueryHealth`:
 * "loading" is `isLoading`, and ANY error is fatal — also over cached data after a failed refetch.
 * Expressed as the shared `useQueryHealth` options instead of a local query projection.
 */
const AS_CHECKED_BEFORE = { fatalWhen: "any-error", loadingWhen: "isLoading" } as const;

interface PanelState {
  contractType: number;
  /** Fixed at open: a new contract keeps its "New …" title until a save fully succeeds. */
  isNew: boolean;
  /**
   * The country/technology the panel opened on. Every save writes THESE, never the live
   * URL selection; if the URL changes while the panel is open, the panel closes or prompts.
   */
  scope: CountryTechnology;
  currency: string;
  /** Set for edit, and after a partial save created the parent (so a retry updates it). */
  contractId?: string;
  initial: ContractForm;
  form: ContractForm;
  /** True while an edit panel waits for the fresh row. */
  refreshing?: boolean;
  /** The parent was written but not all DevCo links were. */
  linksIncomplete?: boolean;
}

export default function ContractsSettingsScreen() {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  const lang = uiLanguage();
  const notify = useNotify();

  const canAdmin = useAdminAccess();
  const tablePrivileges = useTablePrivileges(ENTITY.contracts);
  /** Table privileges narrowed by the admin rule: a non-admin gets no write command. */
  const privileges = {
    canCreate: canAdmin && tablePrivileges.canCreate,
    canWrite: canAdmin && tablePrivileges.canWrite,
    canDelete: canAdmin && tablePrivileges.canDelete,
  };

  /* ─────────────────────────────────────────────────────────── selection */
  const countriesQuery = useActiveCountries();
  const countries = useMemo(
    () => pickerCountries(countriesQuery.data ?? [], CONTRACT_COUNTRY_RULE),
    [countriesQuery.data],
  );
  const { selection, country: selectedCountry, select } = useCountryTechnologyUrlSelection({
    countries, technologies: CONTRACT_TECHNOLOGIES, defaultTo: CONTRACT_DEFAULT, history: "push",
  });
  const currency = currencyOf(selectedCountry?.isoCurrencyCode);

  /* ─────────────────────────────────────────────────────────────────── data */
  const contractsQuery = useStandardContracts(selection);
  const devCoQuery = useContractDevCo(selection);
  const capexQuery = useCapexAccounts();
  const fetchContract = useFetchContract();
  const saveMutation = useSaveContract();
  const deleteMutation = useDeleteContract();

  const countriesHealth = useQueryHealth([countriesQuery], AS_CHECKED_BEFORE);
  // Only the enabled query: without a selection the list query is disabled (and stays pending).
  const contractsHealth = useQueryHealth(selection ? [contractsQuery] : [], AS_CHECKED_BEFORE);

  const contracts = useMemo(() => sortContracts(contractsQuery.data ?? []), [contractsQuery.data]);
  const limits = limitFlags(contracts);
  const tree = useMemo(() => buildAccountTree(capexQuery.data ?? []), [capexQuery.data]);
  const devCoRows = devCoQuery.data;

  /* ───────────────────────────────────────────────────────── local UI state */
  const expanded = useToggleSet<string>();
  const panelState = usePanelState<PanelState>();
  const { panel } = panelState;
  /** The open panel as last rendered — read by the async edit re-seed. */
  const panelRef = useRef<PanelState | null>(null);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  const deleteDialog = useConfirmDialog<"delete", StandardContract>();
  const deleteTarget = deleteDialog.state?.payload ?? null;

  /* ─────────────────────────────────────────────────────────── panel */
  const classes = useMemo(
    () => classifyAccounts(devCoRows ?? [], panel?.contractId),
    [devCoRows, panel?.contractId],
  );
  const linksAvailable = devCoQuery.isSuccess && capexQuery.isSuccess;
  /** The live URL no longer names the scope the open panel is bound to. */
  const scopeChanged = panel !== null && !sameCountryTechnology(selection, panel.scope);
  // Only accounts shown in the tree count toward "at least one account"; links to inactive
  // CAPEX accounts stay in the selection (never deleted on save) but do not satisfy the rule.
  const errors = panel ? validateForm(panel.form, lang, undefined, tree.leaves) : {};
  const dirty = panel ? isDirty(panel.form, panel.initial) : false;
  const linksIncomplete = panel?.linksIncomplete === true;
  // A retry after a partial save must be possible even when the form equals its loaded values.
  const saveEnabled = panel && !scopeChanged && canAdmin
    ? canSave({
      form: panel.form, initial: panel.initial, errors, linksAvailable, forceDirty: linksIncomplete, visible: tree.leaves,
    })
    : false;

  function openPanel(next: PanelState) {
    panelRef.current = next;
    panelState.open(next);
  }

  function openNew(contractType: number) {
    if (!selection) return;
    const form = initialForm(undefined, [], lang);
    openPanel({ contractType, isNew: true, scope: selection, currency, initial: form, form });
  }

  /**
   * `btn_Edit_AdminContracts.OnSelect`: the panel opens at once on the listed row, blocked by
   * "Loading contract...", and is re-seeded from a fresh read of the row and of the DevCo scope
   * (the canvas `Refresh`, ACS:1057). If EITHER fresh read fails the panel closes with an error
   * toast rather than edit possibly stale data (`refetch()` resolves on error in TanStack v5, so
   * its `isError` is checked explicitly).
   */
  function openEdit(contract: StandardContract) {
    if (!selection) return;
    const ownIds = (rows: typeof devCoRows) =>
      (rows ?? []).filter((r) => r.contractId === contract.id).map((r) => r.accountId);
    const form = initialForm(contract, ownIds(devCoRows), lang);
    openPanel({
      contractType: contract.contractType ?? CONTRACT_TYPE.Development, isNew: false,
      scope: selection, currency,
      contractId: contract.id, initial: form, form, refreshing: true,
    });
    void Promise.all([fetchContract(contract.id), devCoQuery.refetch()])
      .then(([fresh, scope]) => {
        if (scope.isError || scope.data === undefined) {
          throw scope.error ?? new Error("The DevCo account links could not be read");
        }
        const freshForm = initialForm(fresh, ownIds(scope.data), lang);
        panelState.patch((prev) => (prev.refreshing && prev.contractId === contract.id
          ? { ...prev, contractType: fresh.contractType ?? prev.contractType, initial: freshForm, form: freshForm, refreshing: false }
          : prev));
      })
      .catch((error: unknown) => {
        notify.error(openErrorMessage(error));
        const current = panelRef.current;
        if (current && current.contractId === contract.id && current.refreshing) panelState.close();
      });
  }

  function closePanel(warnIncomplete: boolean) {
    panelState.close();
    if (warnIncomplete) notify.warning(INCOMPLETE_CLOSED_WARNING);
  }

  /**
   * The three-way close prompt (discard / incomplete links), asked by `FormPanel` for ✕, Escape,
   * backdrop, Cancel and `"scope"`: browser back/forward or a URL edit while the panel is
   * open. A clean panel closes at once; "Keep editing" after a scope change restores the panel's
   * own selection. `FormPanel` waits while a save is in flight (its input was already frozen).
   */
  function promptFor(reason: CloseReason) {
    const kind = closePrompt({ dirty, linksIncomplete });
    return kind === "none" ? null : closeDialogText(kind, reason === "scope");
  }

  /**
   * `ico_AdminContracts_Save.OnChange`: the parent `Patch`, then the released links' `RemoveIf`,
   * then the new links' `Patch` — run by `saveStandardContract` (`@/data/adminContract`).
   * DIVERGENCE: the canvas hides the panel before writing and reports a failure only by toast.
   * Here the panel stays open on a failed save with its input; accounts another contract claimed
   * meanwhile leave the selection (ownership re-check), and a parent created by a partial save is
   * remembered so the retry updates it instead of creating a second contract.
   */
  async function save() {
    if (!panel || !saveEnabled) return;
    const input: SaveContractInput = {
      contractId: panel.contractId,
      contractType: panel.contractType,
      countryId: panel.scope.countryId,
      technology: panel.scope.technology,
      form: panel.form,
      accounts: tree.accounts,
      lang,
    };
    try {
      const { contractId } = await saveMutation.mutateAsync(input);
      panelState.close();
      expanded.add(contractId);
      notify.success("Contract saved");
    } catch (error) {
      const message = saveErrorMessage(error, (id) => tree.accounts.get(id)?.number);
      const saveError = error instanceof ContractSaveError ? error : undefined;
      // Accounts another contract now owns leave the selection, so a retry can succeed. The
      // scope was refetched in `onSettled`, so the tree now shows them locked ("Used").
      const conflicts = saveError?.cause instanceof OwnershipConflictError ? saveError.cause.accountIds : [];
      // The contract was deleted meanwhile — nothing was written and a retry can only fail
      // again, so the panel closes without an unsaved-changes prompt (the record is gone); the
      // list refetched in `onSettled`, so its card disappears.
      if (saveError?.phase === "parent" && saveError.cause instanceof RecordGoneError) {
        closePanel(false);
        notify.error(message);
        return;
      }
      // The panel stays open with the input; a created parent is remembered for the retry.
      panelState.patch((prev) => ({
        ...prev,
        form: conflicts.length > 0 ? withoutAccounts(prev.form, conflicts) : prev.form,
        contractId: prev.contractId ?? saveError?.contractId,
        linksIncomplete: prev.linksIncomplete === true || saveError?.parentSaved === true,
      }));
      panelState.setError(message);
      notify.error(message);
    }
  }

  /* ─────────────────────────────────────────────────────────────── delete */
  /**
   * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm`: `Remove` of the PARENT only —
   * the DevCo costs cascade and the deletion plugin clears the project rows built from it.
   * DIVERGENCE: a 404 (another user deleted it first) is reported as done with a notice; the
   * canvas has no such case. The failure path is the SOURCE DEFECT fix in `messages.ts`.
   */
  async function confirmDelete() {
    if (!deleteTarget || !selection || !privileges.canDelete) return;
    const scope = selection;
    // The dialog closes first; the work runs under the page overlay and reports by toast.
    await deleteDialog.confirm(async ({ payload: target }) => {
      try {
        const { alreadyDeleted } = await deleteMutation.mutateAsync({ id: target.id, selection: scope });
        expanded.remove(target.id);
        // A 404 means another user deleted it first — done, not "may still be in use". The
        // list refetches in `onSettled` either way.
        if (alreadyDeleted) notify.info(CONTRACT_ALREADY_DELETED_MESSAGE);
        else notify.success("Contract deleted");
      } catch (error) {
        notify.error(deleteErrorMessage(error));
      }
    }, { closeFirst: true });
  }

  /* ─────────────────────────────────────────────────────────────── render */
  if (countriesHealth.phase !== "ready") {
    return (
      <QueryStates
        health={countriesHealth}
        loadingLabel="Loading countries…"
        fatal={{ title: "Countries could not be loaded", text: loadErrorText }}
      >
        {() => null}
      </QueryStates>
    );
  }

  const technologyLabel = selection ? breadcrumbText(selectedCountry?.name, selection.technology) : "Contracts";
  /**
   * `btn_AdminContract_Add_Development_Contract` / `btn_AdminContract_Add_Construction_Contract`
   * (`testId`). At the limit the button stays focusable and says why (DIVERGENCE, see
   * `limitMessage`); a disabled one stays disabled.
   */
  const addButton = (contractType: number, label: string, full: boolean, testId: string) => {
    const disabled = !selection || !privileges.canCreate;
    const reason = full && !disabled && selection && selectedCountry
      ? limitMessage(contractType, selectedCountry.name, selection.technology)
      : null;
    return (
      <DisabledReason reason={reason}>
        <Button
          appearance="secondary" className={mergeClasses(styles.addButton, brand.brandOutline)} icon={<AddFilled />}
          disabled={disabled} disabledFocusable={!disabled && full}
          aria-label={label} data-testid={testId}
          onClick={() => { if (!full) openNew(contractType); }}
        >
          {label}
        </Button>
      </DisabledReason>
    );
  };

  /**
   * `cmp_AdminContraacts_NestedCountryPickerColumn`. Same presentation as Costs and Project Gates:
   * the side-column rail with SVG flags at every width. The shared picker composes its control ids
   * from `testIdPrefix`; it has no prop for the component's own inner names (`Button2`,
   * `ButtonCanvas5`, `cbx_CountrySelected`).
   */
  const picker = (
    <CountryTechnologyPicker
      countries={countries}
      technologies={CONTRACT_TECHNOLOGIES}
      value={selection}
      onChange={select}
      testIdPrefix="cmp_AdminContraacts_NestedCountryPickerColumn"
    />
  );

  const devCoError = devCoQuery.isError ? loadErrorText(devCoQuery.error) : undefined;
  const capexError = capexQuery.isError ? loadErrorText(capexQuery.error) : undefined;

  const body = !selection
    // The screen defaults to the first country / first technology (PO, 2026-10-17), so this
    // branch now means only "the picker list is empty" — no configured country is active.
    ? <EmptyState title="No countries available" description="No configured country is available, so there are no standard contracts to show." />
    : (
      <QueryStates
        health={contractsHealth}
        loadingLabel="Loading contracts…"
        fatal={{ title: "Standard contracts could not be loaded", text: loadErrorText }}
        empty={{
          when: contracts.length === 0,
          title: `No standard contracts for ${selectedCountry?.name ?? ""} / ${technologyOptionLabel(selection.technology)}`,
        }}
      >
        {() => (
          <div className={styles.list} data-testid="gal_AdminContracts_StandardAssumptions_Updated">
            {contracts.map((contract) => {
              const own = devCoRows?.filter((r) => r.contractId === contract.id);
              const tagGroups = devCoQuery.isError ? "error" as const
                : own && capexQuery.data ? groupDevCoTags(own, tree.accounts) : undefined;
              return (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  expanded={expanded.has(contract.id)}
                  currency={currency}
                  tagGroups={tagGroups}
                  canEdit={privileges.canWrite}
                  canDelete={privileges.canDelete}
                  onToggle={() => expanded.toggle(contract.id)}
                  onEdit={() => openEdit(contract)}
                  onDelete={() => deleteDialog.ask("delete", contract)}
                />
              );
            })}
          </div>
        )}
      </QueryStates>
    );

  return (
    <div className={styles.root}>
      {picker}

      <div className={styles.content}>

        <ScopeHeaderBand
          title={technologyLabel}
          titleAs="h2"
          ariaLabel="Contracts"
          actionsAlign="start"
          testId="con_AdminContract_Selected_Country_Technology"
          actions={(
            <>
              {addButton(CONTRACT_TYPE.Development, CARD_TEXT.addDevelopment, limits.developmentFull, "btn_AdminContract_Add_Development_Contract")}
              {addButton(CONTRACT_TYPE.Construction, CARD_TEXT.addConstruction, limits.constructionFull, "btn_AdminContract_Add_Construction_Contract")}
            </>
          )}
        />

        {selection && (devCoError || capexError) ? (
          <NoticeBar
            intent="warning"
            inset={20}
            action={{
              label: "Retry",
              ariaLabel: "Retry loading DevCo costs",
              onClick: () => { void devCoQuery.refetch(); void capexQuery.refetch(); },
            }}
          >
            {devCoError ?? capexError}
          </NoticeBar>
        ) : null}

        {body}
      </div>

      {panel ? (
        <ContractPanel
          key={panelState.key}
          open
          title={panelTitle(panel.isNew, panel.contractType)}
          form={panel.form}
          onFormChange={(form) => panelState.patch({ form })}
          errors={errors}
          currency={panel.currency}
          saveEnabled={saveEnabled}
          saving={saveMutation.isPending}
          loading={panel.refreshing === true}
          onSave={() => void save()}
          // Reload / tab close asks first while the panel holds unsaved input or incomplete links.
          dirty={dirty || linksIncomplete}
          closePrompt={promptFor}
          promptRequest={scopeChanged && !saveMutation.isPending ? "scope" : undefined}
          onPromptCancel={(reason) => { if (reason === "scope" && panel) select(panel.scope); }}
          onDismiss={() => closePanel(linksIncomplete)}
          errorText={panelState.error}
          devCoForm={(
            <DevCoCostForm
              roots={tree.roots}
              selected={new Set(panel.form.selectedAccountIds)}
              classes={classes}
              loading={devCoQuery.isLoading || capexQuery.isLoading}
              errorText={devCoError ?? capexError}
              onRetry={() => { void devCoQuery.refetch(); void capexQuery.refetch(); }}
              disabled={saveMutation.isPending || scopeChanged}
              validationMessage={dirty && errors.accounts ? errors.accounts : undefined}
              onChange={(next) => panelState.patch((prev) => ({
                ...prev, form: { ...prev.form, selectedAccountIds: [...next].sort() },
              }))}
            />
          )}
        />
      ) : null}

      {/*
        `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1` (`IconRightButton: "Delete"`).
        DIVERGENCE: `destructive` gives Confirm the danger look; the canvas relied on the label.
        The shared dialog has no props for the popup's canvas control names.
      */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={CARD_TEXT.deleteTitle}
        description={deleteTarget ? deleteDescription(deleteTarget.name) : ""}
        confirmText={CARD_TEXT.deleteConfirm}
        confirmIcon="delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={deleteDialog.cancel}
      />

      {/* `cmp_PopUp_Loading_AdminBoPContracts` while the delete runs. */}
      {deleteMutation.isPending ? <LoadingOverlay mode="blocking" label={CARD_TEXT.deleting} /> : null}
    </div>
  );
}
