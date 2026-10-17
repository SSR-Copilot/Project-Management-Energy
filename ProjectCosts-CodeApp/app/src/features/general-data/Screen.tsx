/**
 * Project General Data — create and edit a project's core data: Basic Information, Acquisition
 * Details, SPV, Placement and Shareholding Entities.
 *
 * Canvas screen: `Project General Data Screen.pa.yaml` (Project Management app). Composition
 * only — every rule lives in `./rules.ts`, every read/write in `@/data/generalData.ts`. Full,
 * cited analysis: `codeapp-knowledge-base/screens/project-general-data-screen/`.
 *
 * PHASE 1 SCOPE (see the knowledge base's `06-code-app-requirements/01-build-requirements.md`):
 * the fields above. NOT in this screen: the Cluster Change panel (gate-approval cancellation
 * and milestone re-entry — real approval-workflow risk, needs its own build) and an interactive
 * map (Latitude/Longitude are plain numeric fields here, not a map picker). Both are called out
 * in place rather than silently dropped.
 *
 * PHASE 5 NOTE (Municipality comboboxes): The Germany and France municipality comboboxes are
 * structurally in place — the three-branch render and `MunicipalityCombobox` component exist —
 * but `options` is wired to `[]` until the data source (SQL connector migration decision) is
 * confirmed. See `08-code-app-shortcomings-and-fix-plan.md` Step 5.1. Once the data source is
 * decided, wire `germanyMunicipalityOptions` / `franceMunicipalityOptions` to the real hook.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Body1, Button, Card, MessageBar, MessageBarBody, Subtitle2,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, SaveRegular } from "@fluentui/react-icons";
import { DatePicker } from "@fluentui/react-datepicker-compat";
import {
  CommandSlot, ConfirmDialog, EmptyState, FormPanel, LoadingOverlay,
  NumericField, ReadOnlyField, TextField,
} from "@/components";
import { permissionMessage } from "@/platform/privileges";
import { isRecordGone, RECORD_GONE_TEXT } from "@/features/shared/recordGone";
import type { GeneralDataProject, ShareholderEntity } from "@/data/generalData";
import type { PersonOption } from "@/features/project-overview/rules";
import { useSession } from "@/app/SessionContext";
import {
  DEVELOPMENT_TYPE_OPTIONS, FINANCING_OPTIONS, OWNERSHIP_TYPE_OPTIONS, SHAREHOLDER_TYPE_OPTIONS,
  SPV_LEGAL_STRUCTURE_OPTIONS, START_CLUSTER_OPTIONS, SUB_TECHNOLOGY_OPTIONS, TECHNOLOGY_OPTIONS,
} from "./options";
import {
  DEV_TYPE_ACQUIRED, LABELS, MSG, SHAREHOLDER_TYPE_THIRD_PARTY, canEditCoreFields, canEditCountry, canEditGeneralFields, canSave,
  formatNumericField, newShareholder, ownershipTotalIsValid, ownershipTotalPercent,
  parseNumericField, planShareholderChanges, remainingOwnership, requiredMarkersHidden,
  validateProject, validateShareholder, type FieldErrors,
} from "./rules";
import {
  useCountryAreas, useCurrentUser, useGeneralData, useProjectManagerSearch,
  useSaveGeneralData, useTerrainUtilizationChoices,
} from "./hooks";
import {
  MunicipalityCombobox, PersonPickerField, SelectField,
} from "./Fields";

/* ═══════════════════════════════════════════════════════════════════ styles ══ */

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL,
    paddingTop: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXL, paddingRight: tokens.spacingHorizontalXL,
    maxWidth: "1200px",
  },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingVerticalL },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalM,
  },
  shareholderHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  rowActions: { display: "flex", gap: tokens.spacingHorizontalXS },
  footer: { display: "flex", justifyContent: "flex-end", gap: tokens.spacingHorizontalS },
});

/* ═════════════════════════════════════════════════════════════ form state ══ */

interface FormState {
  project: GeneralDataProject;
  shareholders: ShareholderEntity[];
}

/* ═══════════════════════════════════════════════════════════════════ screen ══ */

export default function GeneralDataScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const isNew = projectId === undefined;

  const { session } = useSession();
  const currentUserQuery = useCurrentUser(session?.entraObjectId);

  const dataQuery = useGeneralData(projectId);
  const areasQuery = useCountryAreas(dataQuery.data?.project.countryId ?? null);
  const saveMutation = useSaveGeneralData(projectId);

  const [form, setForm] = useState<FormState | null>(null);
  const [managerQuery, setManagerQuery] = useState("");
  const [deputyQuery, setDeputyQuery] = useState("");
  const managerSearch = useProjectManagerSearch(managerQuery);
  const deputySearch = useProjectManagerSearch(deputyQuery);

  const terrainChoicesQuery = useTerrainUtilizationChoices(form?.project.countryId ?? null);

  const [panelRow, setPanelRow] = useState<{ index: number | null; row: ShareholderEntity } | null>(null);
  const [panelError, setPanelError] = useState<string | undefined>();
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Seed local form state once the project loads (or once, for a new project).
  useEffect(() => {
    if (dataQuery.data && !form) {
      setForm({ project: dataQuery.data.project, shareholders: dataQuery.data.shareholders });
    }
  }, [dataQuery.data, form]);

  const countryName = useMemo(
    () => dataQuery.data?.lookups.countries.find((c) => c.id === form?.project.countryId)?.name,
    [dataQuery.data, form?.project.countryId],
  );

  const isGermany = countryName === "Germany";
  const isFrance = countryName === "France";

  // Country permission filtering: canvas `Filter(Countries, IsBlank(userCountries) OR country in userCountries)`.
  // If `isProjectDataAllCountries` is true, or the user's editable countries haven't loaded yet,
  // show all. Otherwise restrict to the user's allowed countries. Fails open (show all) on errors.
  const allCountries = dataQuery.data?.lookups.countries ?? [];
  const filteredCountries = useMemo(() => {
    const cu = currentUserQuery.data;
    if (!cu || cu.isProjectDataAllCountries || cu.editableCountries.length === 0) return allCountries;
    return allCountries.filter((c) => cu.editableCountries.includes(c.name));
  }, [allCountries, currentUserQuery.data]);

  const editCtx = {
    isNew,
    clusterStateOrder: form?.project.clusterStateOrder ?? null,
    approvalState: form?.project.approvalState ?? null,
    canWrite: true, // optimistic — see `@/platform/privileges`; Dataverse is the real gate.
  };
  const coreEditable = canEditCoreFields(editCtx);
  const generalEditable = canEditGeneralFields(editCtx);
  const countryEditable = canEditCountry(editCtx);
  const hideRequiredMarkers = requiredMarkersHidden(editCtx);

  const fieldErrors: FieldErrors = form
    ? validateProject({ project: form.project, countryAreas: areasQuery.data ?? [], countryName })
    : {};
  const isDirty = Boolean(form) && (
    isNew
    || JSON.stringify(form) !== JSON.stringify({
      project: dataQuery.data?.project, shareholders: dataQuery.data?.shareholders,
    })
  );
  const saveEnabled = form ? canSave({
    project: form.project, shareholders: form.shareholders, fieldErrors,
    isDirty, canWrite: generalEditable,
  }) : false;

  function update(patch: Partial<GeneralDataProject>) {
    setForm((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }

  async function handleSave() {
    if (!form) return;
    setSaveError(undefined);
    const original = dataQuery.data?.shareholders ?? [];
    const { deletedIds } = planShareholderChanges(original, form.shareholders);
    try {
      const result = await saveMutation.mutateAsync({
        project: form.project, shareholders: form.shareholders, deletedShareholderIds: deletedIds,
      });
      if (isNew) navigate(`/projects/${result.projectId}/general`, { replace: true });
    } catch (error) {
      // V-1: a project deleted by someone else (`RecordGoneError`) is said so, not "save failed".
      setSaveError(permissionMessage(error, "save this project")
        ?? (isRecordGone(error) ? RECORD_GONE_TEXT : MSG.saveFailed));
    }
  }

  function handleReset() {
    if (!dataQuery.data) return;
    setForm({ project: dataQuery.data.project, shareholders: dataQuery.data.shareholders });
    setSaveError(undefined);
  }

  /* ─────────────────────────────────────────────────────── shareholder panel */

  function openAddPanel() {
    setPanelError(undefined);
    setPanelRow({ index: null, row: newShareholder() });
  }
  function openEditPanel(index: number) {
    if (!form) return;
    setPanelError(undefined);
    setPanelRow({ index, row: form.shareholders[index]! });
  }
  function savePanelRow() {
    if (!form || !panelRow) return;
    const rows = panelRow.index === null
      ? [...form.shareholders, panelRow.row]
      : form.shareholders.map((r, i) => (i === panelRow.index ? panelRow.row : r));
    const checkIndex = panelRow.index === null ? rows.length - 1 : panelRow.index;
    const errors = validateShareholder(panelRow.row, rows, checkIndex);
    const firstError = errors.shareholderType ?? errors.customName ?? errors.ownership;
    if (firstError) { setPanelError(firstError); return; }
    setForm({ ...form, shareholders: rows });
    setPanelRow(null);
  }
  function confirmDelete() {
    if (!form || deleteIndex === null) return;
    setForm({ ...form, shareholders: form.shareholders.filter((_, i) => i !== deleteIndex) });
    setDeleteIndex(null);
  }

  /* ──────────────────────────────────────────────────────────── render gates */

  if (dataQuery.isLoading) return <LoadingOverlay mode="inline" label="Loading project…" />;
  if (dataQuery.isError) {
    return (
      <EmptyState
        title="This project could not be loaded"
        description={dataQuery.error instanceof Error ? dataQuery.error.message : undefined}
        action={{ label: "Back to Projects", onClick: () => navigate("/projects") }}
      />
    );
  }
  if (!form) return <LoadingOverlay mode="inline" label="Loading project…" />;

  const { project, shareholders } = form;
  const totalPercent = ownershipTotalPercent(shareholders);
  const terrainChoices = terrainChoicesQuery.data ?? [];

  return (
    <div className={styles.page}>
      <CommandSlot>
        <Button
          appearance="primary" icon={<SaveRegular />} disabled={!saveEnabled || saveMutation.isPending}
          onClick={handleSave} aria-label="Save" data-testid="command-save"
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          appearance="transparent" disabled={!isDirty || saveMutation.isPending}
          onClick={handleReset} aria-label="Reset" data-testid="command-reset"
        >
          Reset
        </Button>
      </CommandSlot>

      {saveError ? (
        <MessageBar intent="error"><MessageBarBody>{saveError}</MessageBarBody></MessageBar>
      ) : null}
      {!generalEditable ? (
        <MessageBar intent="warning">
          <MessageBarBody>You do not have permission to edit this project.</MessageBarBody>
        </MessageBar>
      ) : null}

      {/* ─────────────────────────────────────────────────── Basic Information */}
      <Card className={styles.section}>
        <Subtitle2>Basic Information</Subtitle2>
        <div className={styles.grid}>
          <TextField
            label={LABELS.projectName} value={project.projectName}
            onChange={(v) => update({ projectName: v })}
            required={!hideRequiredMarkers} error={fieldErrors.projectName} disabled={!coreEditable}
          />
          <TextField
            label={LABELS.shortName} value={project.shortName}
            onChange={(v) => update({ shortName: v })}
            required={!hideRequiredMarkers} error={fieldErrors.shortName} disabled={!coreEditable}
          />
          {!isNew ? (
            <ReadOnlyField label={LABELS.originalProjectName} value={project.originalProjectName} />
          ) : null}
          <SelectField
            label={LABELS.technology} value={project.technology} options={TECHNOLOGY_OPTIONS}
            onChange={(v) => update({ technology: v })}
            required={!hideRequiredMarkers} error={fieldErrors.technology} disabled={!coreEditable}
          />
          <SelectField
            label={LABELS.subTechnology1} value={project.subTechnology1} options={SUB_TECHNOLOGY_OPTIONS}
            onChange={(v) => update({ subTechnology1: v })} disabled={!coreEditable}
          />
          <SelectField
            label={LABELS.subTechnology2} value={project.subTechnology2} options={SUB_TECHNOLOGY_OPTIONS}
            onChange={(v) => update({ subTechnology2: v })} disabled={!coreEditable}
          />
          <SelectField
            label={LABELS.subTechnology3} value={project.subTechnology3} options={SUB_TECHNOLOGY_OPTIONS}
            onChange={(v) => update({ subTechnology3: v })} disabled={!coreEditable}
          />
          <SelectField
            label={LABELS.developmentType} value={project.developmentType} options={DEVELOPMENT_TYPE_OPTIONS}
            onChange={(v) => {
              // Canvas OnChange: reset Start Cluster, Acquisition Date, Acquisition Price — PGDS:2436.
              update({ developmentType: v, startCluster: null, acquisitionDate: null, acquisitionPrice: null });
            }}
            required={!hideRequiredMarkers} error={fieldErrors.developmentType} disabled={!coreEditable}
          />
          <SelectField
            label={LABELS.startCluster} value={project.startCluster} options={START_CLUSTER_OPTIONS}
            onChange={(v) => update({ startCluster: v })}
            required={!hideRequiredMarkers && project.developmentType === DEV_TYPE_ACQUIRED}
            error={fieldErrors.startCluster} disabled={!coreEditable}
          />
          {!isNew ? (
            // The Cluster Change panel (gate-approval cancellation + milestone re-entry) is
            // deliberately out of scope for this build — see the module doc comment.
            <ReadOnlyField label="Cluster State" value="Change not available on this screen yet" />
          ) : null}
        </div>
      </Card>

      {/* ─────────────────────────────────────────────────── Location & Area */}
      <Card className={styles.section}>
        <Subtitle2>Location</Subtitle2>
        {/* Country/Area are GUID-keyed lookups, not numeric option sets, so they use their own
            simple select bound by id rather than `SelectField`'s numeric-key contract. */}
        <div className={styles.grid}>
          <LookupSelect
            label={LABELS.country}
            valueId={project.countryId}
            options={filteredCountries}
            onChange={(id) => update({ countryId: id, countryAreaId: null })}
            required={!hideRequiredMarkers} error={fieldErrors.country} disabled={!countryEditable}
          />
          <LookupSelect
            label={LABELS.countryArea}
            valueId={project.countryAreaId}
            options={areasQuery.data ?? []}
            onChange={(id) => update({ countryAreaId: id })}
            required={!hideRequiredMarkers && (areasQuery.data ?? []).length > 0}
            error={fieldErrors.countryArea}
            disabled={!coreEditable || (areasQuery.data ?? []).length === 0}
          />
          {/*
            Three-branch municipality render — canvas PGDS:3562–3714:
              • Germany → combobox from colAssumptionsGermanyTaxSQL (auto-populates Tax Factor)
              • France  → combobox from colAssumptionsFranceSQL
              • Others  → free-text TextField
            The combobox data sources are wired to [] until the product-owner decides the
            migration path for the SQL connector collections (see 08-shortcomings Step 5.1).
          */}
          {isGermany ? (
            <MunicipalityCombobox
              label={LABELS.municipality}
              value={project.municipality}
              options={[]}
              onSelect={(name, taxRate) => update({
                municipality: name,
                ...(taxRate !== undefined ? { taxFactor: taxRate } : {}),
              })}
              required={!hideRequiredMarkers}
              error={fieldErrors.municipality}
              disabled={!generalEditable}
            />
          ) : isFrance ? (
            <MunicipalityCombobox
              label={LABELS.municipality}
              value={project.municipality}
              options={[]}
              onSelect={(name) => update({ municipality: name })}
              required={!hideRequiredMarkers}
              error={fieldErrors.municipality}
              disabled={!generalEditable}
            />
          ) : (
            <TextField
              label={LABELS.municipality} value={project.municipality}
              onChange={(v) => update({ municipality: v })}
              error={fieldErrors.municipality} disabled={!generalEditable}
            />
          )}
          <TextField
            label={LABELS.district} value={project.district}
            onChange={(v) => update({ district: v })} disabled={!generalEditable}
          />
        </div>
      </Card>

      {/* ───────────────────────────────────────── People, Dates & Ownership */}
      <Card className={styles.section}>
        <Subtitle2>People, Dates &amp; Ownership</Subtitle2>
        <div className={styles.grid}>
          <PersonPickerField
            label={LABELS.projectManager}
            personId={project.projectManagerId} personName={project.projectManagerName}
            query={managerQuery} onQueryChange={setManagerQuery}
            suggestions={managerSearch.data ?? []}
            onSelect={(p: PersonOption) => update({ projectManagerId: p.id, projectManagerName: p.label })}
            onClear={() => update({ projectManagerId: null, projectManagerName: "" })}
            required={!hideRequiredMarkers} error={fieldErrors.projectManager} disabled={!coreEditable}
          />
          <PersonPickerField
            label={LABELS.deputyProjectManager}
            personId={project.deputyProjectManagerId} personName={project.deputyProjectManagerName}
            query={deputyQuery} onQueryChange={setDeputyQuery}
            suggestions={deputySearch.data ?? []}
            onSelect={(p: PersonOption) => update({ deputyProjectManagerId: p.id, deputyProjectManagerName: p.label })}
            onClear={() => update({ deputyProjectManagerId: null, deputyProjectManagerName: "" })}
            disabled={!generalEditable}
          />
          <DateField
            label={LABELS.projectStartDate} value={project.projectStartDate}
            onChange={(iso) => update({ projectStartDate: iso })} disabled={!generalEditable}
          />
          <SelectField
            label={LABELS.ownershipType} value={project.ownershipType} options={OWNERSHIP_TYPE_OPTIONS}
            onChange={(v) => update({ ownershipType: v })} disabled={!generalEditable}
          />
          <NumericField
            label={LABELS.ownerPercentage} value={formatNumericField(project.ownerPercentage)}
            onChange={(v) => update({ ownerPercentage: parseNumericField(v) })}
            suffix="%" disabled={!generalEditable}
          />
          <NumericField
            label={LABELS.shareOfFarmdown} value={formatNumericField(project.shareOfFarmdown)}
            onChange={(v) => update({ shareOfFarmdown: parseNumericField(v) })}
            suffix="%" disabled={!generalEditable}
          />
          <SelectField
            label={LABELS.financingOptions} value={project.financingOptions} options={FINANCING_OPTIONS}
            onChange={(v) => update({ financingOptions: v })} disabled={!generalEditable}
          />
        </div>
      </Card>

      {/* ───────────────────────────────────────────── Acquisition Details */}
      {project.developmentType === DEV_TYPE_ACQUIRED ? (
        <Card className={styles.section}>
          <Subtitle2>Acquisition Details</Subtitle2>
          <div className={styles.grid}>
            <DateField
              label={LABELS.acquisitionDate} value={project.acquisitionDate}
              onChange={(iso) => update({ acquisitionDate: iso })}
              required={!hideRequiredMarkers} error={fieldErrors.acquisitionDate} disabled={!coreEditable}
            />
            <NumericField
              label={LABELS.acquisitionPrice} value={formatNumericField(project.acquisitionPrice)}
              onChange={(v) => update({ acquisitionPrice: parseNumericField(v) })}
              required={!hideRequiredMarkers} error={fieldErrors.acquisitionPrice} disabled={!coreEditable}
            />
            <NumericField
              label={LABELS.bidPrice} value={formatNumericField(project.bidPrice)}
              onChange={(v) => update({ bidPrice: parseNumericField(v) })} disabled={!coreEditable}
            />
          </div>
        </Card>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────── SPV */}
      <Card className={styles.section}>
        <Subtitle2>SPV</Subtitle2>
        <div className={styles.grid}>
          <TextField
            label={LABELS.spvName} value={project.spvName}
            onChange={(v) => update({ spvName: v })} disabled={!generalEditable}
          />
          {/* SPV Legal Structure: Germany only — canvas `Country.Selected.Key = "25"` (PGDS:3975). */}
          {isGermany ? (
            <SelectField
              label={LABELS.spvLegalStructure} value={project.spvLegalStructure}
              options={SPV_LEGAL_STRUCTURE_OPTIONS}
              onChange={(v) => update({ spvLegalStructure: v })}
              required={Boolean(project.spvName.trim())}
              error={fieldErrors.spvLegalStructure} disabled={!generalEditable}
            />
          ) : null}
          {/* SPV Company Code: only visible once SPV Name has been entered — canvas Visible rule. */}
          {project.spvName.trim() !== "" ? (
            <NumericField
              label={LABELS.spvCompanyCode} value={formatNumericField(project.spvCompanyCode)}
              onChange={(v) => update({ spvCompanyCode: parseNumericField(v) })}
              required
              error={fieldErrors.spvCompanyCode} disabled={!generalEditable}
            />
          ) : null}
        </div>
      </Card>

      {/* ──────────────────────────────────────────────────────────── Placement */}
      <Card className={styles.section}>
        <Subtitle2>Placement</Subtitle2>
        <Body1>
          Stored as coordinates only — the interactive map used on the canvas screen is out of
          scope for this build.
        </Body1>
        <div className={styles.grid}>
          <NumericField
            label={LABELS.latitude} value={formatNumericField(project.latitude)}
            onChange={(v) => update({ latitude: parseNumericField(v) })}
            required={!hideRequiredMarkers} error={fieldErrors.latitude} disabled={!generalEditable}
          />
          <NumericField
            label={LABELS.longitude} value={formatNumericField(project.longitude)}
            onChange={(v) => update({ longitude: parseNumericField(v) })}
            required={!hideRequiredMarkers} error={fieldErrors.longitude} disabled={!generalEditable}
          />
          <NumericField
            label={LABELS.terrainSize} value={formatNumericField(project.terrainSize)}
            onChange={(v) => update({ terrainSize: parseNumericField(v) })}
            required={!hideRequiredMarkers && isGermany}
            error={fieldErrors.terrainSize} disabled={!generalEditable}
          />
          {/* Tax Factor: Germany only — auto-populated from Germany municipality selection (Phase 5),
              then editable. Canvas: PGDS:3638–3652, 3752–3803. */}
          {isGermany ? (
            <NumericField
              label={LABELS.taxFactor} value={formatNumericField(project.taxFactor)}
              onChange={(v) => update({ taxFactor: parseNumericField(v) })}
              error={fieldErrors.taxFactor} disabled={!generalEditable}
            />
          ) : null}
          {/* Terrain Utilization: a lookup to vsb_customchoicevalues scoped by country.
              Canvas: PGDS:3888–3910. Only shown when the country has configured choices. */}
          {terrainChoices.length > 0 ? (
            <LookupSelect
              label={LABELS.terrainUtilization}
              valueId={project.terrainUtilizationId}
              options={terrainChoices.map((c) => ({ id: c.id, name: c.label }))}
              onChange={(id) => update({ terrainUtilizationId: id })}
              disabled={!generalEditable}
            />
          ) : null}
        </div>
      </Card>

      {/* ───────────────────────────────────────────────── Shareholding Entities */}
      <Card className={styles.section}>
        <div className={styles.shareholderHeader}>
          <Subtitle2>Shareholding Entities</Subtitle2>
          {/*
            Add button: disabled when editing is not allowed OR when total ownership has reached
            100% — canvas `Sum(shareholdingEntities, vsb_ownership) >= 1` (PGDS:4533).
          */}
          <Button
            appearance="primary" icon={<AddRegular />}
            disabled={!generalEditable || totalPercent >= 100}
            onClick={openAddPanel} aria-label="Add Shareholding Entity"
          >
            Add
          </Button>
        </div>
        <Body1>
          Total ownership: {totalPercent.toFixed(2)}%
          {!ownershipTotalIsValid(shareholders) ? ` — ${MSG.ownershipMustTotal100}` : ""}
        </Body1>
        {shareholders.length === 0 ? (
          <EmptyState title="No shareholding entities yet" description="Add at least one to save this project." />
        ) : (
          <Table aria-label="Shareholding Entities">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Entity</TableHeaderCell>
                <TableHeaderCell>Custom Name</TableHeaderCell>
                <TableHeaderCell>Ownership %</TableHeaderCell>
                <TableHeaderCell> </TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shareholders.map((row, index) => (
                <TableRow key={row.id ?? `new-${index}`}>
                  <TableCell>
                    {SHAREHOLDER_TYPE_OPTIONS.find((o) => o.value === row.shareholderType)?.label ?? row.name}
                  </TableCell>
                  <TableCell>{row.customName || "—"}</TableCell>
                  <TableCell>{((row.ownership ?? 0) * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        appearance="transparent" icon={<EditRegular />} aria-label="Edit"
                        disabled={!generalEditable} onClick={() => openEditPanel(index)}
                      />
                      <Button
                        appearance="transparent" icon={<DeleteRegular />} aria-label="Delete"
                        disabled={!generalEditable} onClick={() => setDeleteIndex(index)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className={styles.footer}>
        <Button
          appearance="primary" icon={<SaveRegular />} disabled={!saveEnabled || saveMutation.isPending}
          onClick={handleSave}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* ───────────────────────────────────────────────────── shareholder panel */}
      <FormPanel
        open={panelRow !== null}
        title={panelRow?.index === null ? "Add Shareholding Entity" : "Edit Shareholding Entity"}
        onDismiss={() => setPanelRow(null)}
        footer={(
          <>
            <Button appearance="primary" onClick={savePanelRow}>Save</Button>
            <Button appearance="secondary" onClick={() => setPanelRow(null)}>Cancel</Button>
          </>
        )}
      >
        {panelRow ? (
          <div className={styles.grid}>
            {panelError ? (
              <MessageBar intent="error"><MessageBarBody>{panelError}</MessageBarBody></MessageBar>
            ) : null}
            <SelectField
              label="Shareholder Type" value={panelRow.row.shareholderType} options={SHAREHOLDER_TYPE_OPTIONS}
              onChange={(v) => setPanelRow({ ...panelRow, row: { ...panelRow.row, shareholderType: v } })}
              required
            />
            {panelRow.row.shareholderType === SHAREHOLDER_TYPE_THIRD_PARTY ? (
              <TextField
                label={LABELS.customName} value={panelRow.row.customName}
                onChange={(v) => setPanelRow({ ...panelRow, row: { ...panelRow.row, customName: v } })}
                required
              />
            ) : null}
            <NumericField
              label={LABELS.ownership}
              value={panelRow.row.ownership === null ? "" : String(Number((panelRow.row.ownership * 100).toFixed(2)))}
              onChange={(v) => {
                const percent = parseNumericField(v);
                setPanelRow({
                  ...panelRow,
                  row: { ...panelRow.row, ownership: percent === null ? null : percent / 100 },
                });
              }}
              suffix="%" required
            />
            <Body1>
              Remaining available: {(remainingOwnership(
                form.shareholders, panelRow.index ?? form.shareholders.length,
              ) * 100).toFixed(2)}%
            </Body1>
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleteIndex !== null}
        title="Delete Shareholding Entity"
        description="This shareholding entity will be removed once the project is saved."
        confirmText="Delete" destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteIndex(null)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════ GUID-keyed lookup select ══ */

function LookupSelect({
  label, valueId, options, onChange, required, error, disabled,
}: {
  label: string; valueId: string | null; options: readonly { id: string; name: string }[];
  onChange: (id: string | null) => void; required?: boolean; error?: string; disabled?: boolean;
}) {
  return (
    <SelectField
      label={label}
      value={valueId ? options.findIndex((o) => o.id === valueId) : null}
      options={options.map((o, i) => ({ value: i, label: o.name }))}
      onChange={(index) => onChange(index === null ? null : options[index]?.id ?? null)}
      required={required} error={error} disabled={disabled}
    />
  );
}

/* ═════════════════════════════════════════════════════════════ date field ══ */

function isoToDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dateToIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function DateField({
  label, value, onChange, required, error, disabled,
}: {
  label: string; value: string | null; onChange: (iso: string | null) => void;
  required?: boolean; error?: string; disabled?: boolean;
}) {
  return (
    <div className="canvas-field" data-invalid={error ? true : undefined}>
      <span data-required={required}>{label}</span>
      <DatePicker
        value={isoToDate(value)}
        onSelectDate={(date) => onChange(dateToIso(date))}
        disabled={disabled}
        placeholder="Select a date"
      />
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

