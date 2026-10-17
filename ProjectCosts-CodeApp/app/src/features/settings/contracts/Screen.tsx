/**
 * Application Settings — Contracts (BoP standard-assumption contracts). Replaces the canvas
 * `Admin Contract Screen`. Composition only: rules in `./rules.ts`, Dataverse in
 * `@/data/settings/contracts.ts`, query wiring in `./hooks.ts`. Requirements and canvas
 * analysis: `codeapp-knowledge-base/screens/application-settings/contracts/`; what was built and
 * every deviation: `…/contracts/07-build-log.md`.
 *
 * Rendered inside `SettingsGate` (FR-1), so a user without an admin role never gets here and no
 * contract query is issued. Writes are server-enforced (`serverEnforcedProvider`); a 403 shows
 * `permissionMessage`.
 *
 * Shared modules (batch 2b): the Country / Technology picker (`CountryTechnologyPicker` +
 * `useCountryTechnologyUrlSelection`, `?country&tech`, push history), the active-countries read,
 * `useNotify()` toasts, `FormPanel` (`full`) and its `beforeunload` registration.
 * Reusable components (Wave B): `QueryStates` / `useQueryHealth`, `ScopeHeaderBand`,
 * `DisabledReason`, `NoticeBar`, `usePanelState`, `useToggleSet`, `useConfirmDialog`,
 * `useTablePrivileges`, and the three-way close prompt through `FormPanel closePrompt`.
 */
import { useEffect, useMemo, useRef } from "react";
import { Button, makeStyles, mergeClasses } from "@fluentui/react-components";
import { AddFilled } from "@fluentui/react-icons";
import {
  ConfirmDialog, CountryTechnologyPicker, DisabledReason, EmptyState, LoadingOverlay, NoticeBar, QueryStates,
  ScopeHeaderBand, useNotify,
} from "@/components";
import type { CloseReason } from "@/app/navigationGuardContext";
import { useConfirmDialog } from "@/app/useConfirmDialog";
import { useCountryTechnologyUrlSelection } from "@/app/useCountryTechnologySelection";
import { usePanelState } from "@/app/usePanelState";
import { useQueryHealth } from "@/app/useQueryHealth";
import { useToggleSet } from "@/app/useToggleSet";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { useTablePrivileges } from "@/platform/privileges";
import { repairLanguageTag } from "@/domain/locale";
import { RecordGoneError } from "@/platform/errors";
import {
  CONTRACT_COUNTRY_RULE, CONTRACT_DEFAULT, pickerCountries, sameCountryTechnology, type CountryTechnology,
} from "@/domain/countryPicker";
import { CONTRACT_TECHNOLOGIES, technologyOptionLabel } from "@/domain/technology";
import { useActiveCountries } from "@/data/countries";
import { ContractSaveError, ENTITY, OwnershipConflictError, type SaveContractInput } from "@/data/settings/contracts";
import {
  CONTRACT_TYPE, INCOMPLETE_CLOSED_WARNING, breadcrumbText, buildAccountTree,
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
  content: { flexGrow: 1, minWidth: "0", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "10px" },
  addButton: { minWidth: "230px", justifyContent: "flex-start" },
  list: { display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "20px", paddingRight: "20px" },
});

/**
 * The UI language for the `fn_Numeric` separator rule (FR-13). The app has no Power Apps
 * `Language()` equivalent; `navigator.language` is the source the shell uses too (`App.tsx`),
 * repaired by the shared `repairLanguageTag` so a malformed tag cannot break `Intl`.
 */
function uiLanguage(): string {
  return typeof navigator !== "undefined" && navigator.language ? repairLanguageTag(navigator.language) : "en-US";
}

/**
 * This screen's load checks, kept as they were before `useQueryHealth` (build plan R-3):
 * "loading" is `isLoading`, and ANY error is fatal — also over cached data after a failed refetch.
 * Wave C: expressed as the shared H1 options instead of a local query projection.
 */
const AS_CHECKED_BEFORE = { fatalWhen: "any-error", loadingWhen: "isLoading" } as const;

interface PanelState {
  contractType: number;
  /** Fixed at open: a new contract keeps its "New …" title until a save fully succeeds (B-3). */
  isNew: boolean;
  /**
   * The country/technology the panel opened on (B-2). Every save writes THESE, never the live
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
  /** The parent was written but not all DevCo links were (B-3). */
  linksIncomplete?: boolean;
}

export default function ContractsSettingsScreen() {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  const lang = uiLanguage();
  const notify = useNotify();

  const privileges = useTablePrivileges(ENTITY.contracts);

  /* ─────────────────────────────────────────────────────────── selection (FR-2) */
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
  /** The open panel as last rendered — read by the async edit re-seed (P-2). */
  const panelRef = useRef<PanelState | null>(null);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  const deleteDialog = useConfirmDialog<"delete", StandardContract>();
  const deleteTarget = deleteDialog.state?.payload ?? null;

  /* ─────────────────────────────────────────────────────────── panel (FR-8..17) */
  const classes = useMemo(
    () => classifyAccounts(devCoRows ?? [], panel?.contractId),
    [devCoRows, panel?.contractId],
  );
  const linksAvailable = devCoQuery.isSuccess && capexQuery.isSuccess;
  /** B-2: the live URL no longer names the scope the open panel is bound to. */
  const scopeChanged = panel !== null && !sameCountryTechnology(selection, panel.scope);
  // NG-5: only accounts shown in the tree count toward "at least one account"; links to inactive
  // CAPEX accounts stay in the selection (never deleted on save) but do not satisfy the rule.
  const errors = panel ? validateForm(panel.form, lang, undefined, tree.leaves) : {};
  const dirty = panel ? isDirty(panel.form, panel.initial) : false;
  const linksIncomplete = panel?.linksIncomplete === true;
  // A retry after a partial save must be possible even when the form equals its loaded values.
  const saveEnabled = panel && !scopeChanged
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
   * P-2: the panel opens at once on the listed row, blocked by "Loading contract...", and is
   * re-seeded from a fresh read of the row and of the DevCo scope (the canvas `Refresh`,
   * ACS:1057). If EITHER fresh read fails the panel closes with an error toast rather than edit
   * possibly stale data (B-4: `refetch()` resolves on error in TanStack v5, so its `isError` is
   * checked explicitly).
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
   * backdrop, Cancel and — B-2 — `"scope"`: browser back/forward or a URL edit while the panel is
   * open. A clean panel closes at once; "Keep editing" after a scope change restores the panel's
   * own selection. `FormPanel` waits while a save is in flight (its input was already frozen).
   */
  function promptFor(reason: CloseReason) {
    const kind = closePrompt({ dirty, linksIncomplete });
    return kind === "none" ? null : closeDialogText(kind, reason === "scope");
  }

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
      // B-1: accounts another contract now owns leave the selection, so a retry can succeed. The
      // scope was refetched in `onSettled`, so the tree now shows them locked ("Used").
      const conflicts = saveError?.cause instanceof OwnershipConflictError ? saveError.cause.accountIds : [];
      // R3-2: the contract was deleted meanwhile — nothing was written and a retry can only fail
      // again, so the panel closes without an unsaved-changes prompt (the record is gone); the
      // list refetched in `onSettled`, so its card disappears.
      if (saveError?.phase === "parent" && saveError.cause instanceof RecordGoneError) {
        closePanel(false);
        notify.error(message);
        return;
      }
      // D-03: the panel stays open with the input; a created parent is remembered for the retry.
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

  /* ─────────────────────────────────────────────────────────────── delete (FR-18) */
  async function confirmDelete() {
    if (!deleteTarget || !selection) return;
    const scope = selection;
    // The dialog closes first; the work runs under the page overlay and reports by toast.
    await deleteDialog.confirm(async ({ payload: target }) => {
      try {
        const { alreadyDeleted } = await deleteMutation.mutateAsync({ id: target.id, selection: scope });
        expanded.remove(target.id);
        // R3-1: a 404 means another user deleted it first — done, not "may still be in use". The
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
  const addButton = (contractType: number, label: string, full: boolean) => {
    const disabled = !selection || !privileges.canCreate;
    // At the limit the button stays focusable and says why (C4); a disabled one stays disabled.
    const reason = full && !disabled && selection && selectedCountry
      ? limitMessage(contractType, selectedCountry.name, selection.technology)
      : null;
    return (
      <DisabledReason reason={reason}>
        <Button
          appearance="secondary" className={mergeClasses(styles.addButton, brand.brandOutline)} icon={<AddFilled />}
          disabled={disabled} disabledFocusable={!disabled && full}
          aria-label={label}
          onClick={() => { if (!full) openNew(contractType); }}
        >
          {label}
        </Button>
      </DisabledReason>
    );
  };

  /** Same presentation as Costs and Project Gates: the side-column rail with SVG flags at every width. */
  const picker = (
    <CountryTechnologyPicker
      countries={countries}
      technologies={CONTRACT_TECHNOLOGIES}
      value={selection}
      onChange={select}
    />
  );

  const devCoError = devCoQuery.isError ? loadErrorText(devCoQuery.error) : undefined;
  const capexError = capexQuery.isError ? loadErrorText(capexQuery.error) : undefined;

  const body = !selection
    ? <EmptyState title="Select a country and technology" description="Choose a country and technology to see its standard contracts." />
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
          <div className={styles.list}>
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
          actions={(
            <>
              {addButton(CONTRACT_TYPE.Development, "Add Development Contract", limits.developmentFull)}
              {addButton(CONTRACT_TYPE.Construction, "Add Construction Contract", limits.constructionFull)}
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
          // M7: reload / tab close asks first while the panel holds unsaved input or incomplete links.
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete BoP Standard Contract"
        description={deleteTarget ? deleteDescription(deleteTarget.name) : ""}
        confirmText="Confirm"
        confirmIcon="delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={deleteDialog.cancel}
      />

      {deleteMutation.isPending ? <LoadingOverlay mode="blocking" label="Please wait, deleting..." /> : null}
    </div>
  );
}
