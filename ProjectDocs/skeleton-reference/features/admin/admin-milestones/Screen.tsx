/**
 * Admin Milestones Screen — layout and composition only.
 *
 * Canvas screen: `Admin Milestones Screen` (PM app)
 *   102 controls · 2 259 lines of Power Fx · 43 substantive blocks · band M
 *
 * NOT PROJECT-SCOPED — master data. No `useProjectContext()`; the user comes from the
 * store and every edit is gated on `canEditCountry` for the country being edited. See
 * rules.ts: the canvas had NO permission check of any kind on this screen, and the route
 * guard here is not security either.
 *
 * Apply and Apply All are RENDERED BUT DISABLED, exactly as shipped, with a tooltip
 * explaining that recalculation is not enabled. They point at the typed flow wrapper so
 * the intent is in the code; the wrapper throws because the flow is not in the export.
 *
 * GUIDE p22 — the middle rail here is a FLAT country list (no flags, no expander),
 * deliberately different from the flag tree `CountryRail` renders on Costs (p23/p24) and
 * Project Gates. One country is in view at a time: its heading, its "Edit"/"Apply"
 * checkboxes, and a read-only Technology × cluster grid. The "Edit" checkbox opens the
 * "Edit Milestones for {country}" drawer, which is laid out as the screenshot shows it —
 * two Wind/PV matrices, not one block per technology.
 */
import { Fragment, useMemo, useState } from "react";
import {
  Checkbox, Input, MessageBar, MessageBarBody, Tooltip, makeStyles, tokens,
} from "@fluentui/react-components";
import { ArrowSyncRegular } from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, FormPanel, ConfirmDialog, LoadingOverlay, EmptyState,
  CountryRail, type CountryRailNode, type Column,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { space, media, semantic } from "@/theme/tokens";
import { CHOICE_ADMIN } from "@/data/entities";
import { triggerFabricRecalculationForCountries } from "@/flows/flowClient";
import {
  MSG, DURATION_FIELDS, SUCCESS_RATE_FIELDS, SUMMARY_TABLE_FIELDS, MILESTONE_FIELD_COLUMN,
  sortCountries, pivotByTechnology, buildMilestoneSummaryRows, durationRows, successRateRows,
  validateEdit, upsertEdit, editKey, canSave, saveErrorMessages, canEditScope,
  planSaveMilestones, isRecalculating, applyCommandState, fabricRecalculationArgs,
  milestoneFieldDisplayLabel, editMilestonesTitle,
  type CountryRow, type EditMap, type MilestoneField, type AssumptionRow,
  type MilestoneSummaryRow,
} from "./rules";
import { useMilestoneCountries, useCountryAssumptions, useActiveFabricJobs, useSaveMilestones } from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  layout: {
    display: "flex", flex: 1, minHeight: 0, gap: space.l,
    [media.belowMd]: { flexDirection: "column" },
  },
  rail: {
    width: "220px", flex: "none", borderRadius: "4px", overflow: "hidden",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px",
    borderLeftWidth: "1px", borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid", borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    [media.belowMd]: { width: "auto" },
  },
  content: { display: "flex", flexDirection: "column", gap: space.m, flex: 1, minWidth: 0 },
  applyAllRow: { display: "flex", alignItems: "center" },
  countryHead: { display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap" },
  countryName: { fontSize: "18px", fontWeight: 600 },
  panelBody: { display: "flex", flexDirection: "column", gap: space.l },
  section: { display: "flex", flexDirection: "column", gap: space.s },
  sectionTitle: { fontSize: "13px", fontWeight: 600 },
  matrix: {
    display: "grid", gap: space.s, alignItems: "center",
    gridTemplateColumns: "1fr 90px 90px",
  },
  matrixHeader: { fontSize: "12px", fontWeight: 600, textAlign: "center" },
  matrixLabel: { fontSize: "12.5px" },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});

export default function AdminMilestonesScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);

  const { countries, isLoading } = useMilestoneCountries();
  const ordered = useMemo(() => sortCountries(countries), [countries]);
  const { jobs } = useActiveFabricJobs();

  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [panelCountry, setPanelCountry] = useState<CountryRow | null>(null);
  const [edits, setEdits] = useState<EditMap>(new Map());
  const [applyScope, setApplyScope] = useState<"country" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useSaveMilestones();

  // GUIDE p22 — Germany is the country in view when nothing else has been picked yet; the
  // rail defaults to the first row, exactly like landing on the screen fresh.
  const effectiveCountryId = selectedCountryId ?? ordered[0]?.id ?? null;
  const selectedCountry = ordered.find((c) => c.id === effectiveCountryId) ?? null;

  if (!user) return <LoadingOverlay mode="inline" />;
  if (!canSeeAdminSection(user)) {
    return (
      <EmptyState
        title="Administration is not available to your account"
        description="These screens need the VSB - Application Administrator or VSB - Controller Own Data security role."
      />
    );
  }

  const applyAll = applyCommandState({ kind: "all" });
  const railItems: CountryRailNode[] = ordered.map((c) => ({ key: c.id, label: c.name }));

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        title="Milestones"
        description={
          "Standard milestone durations and success rates per country and technology. "
          + "These feed every project's assumed milestone dates."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <div className={s.layout}>
        <div className={s.rail}>
          <CountryRail
            items={railItems}
            variant="flat"
            selectedKey={effectiveCountryId}
            onSelect={(key) => setSelectedCountryId(key)}
            ariaLabel="Country"
          />
        </div>

        <div className={s.content}>
          <div className={s.applyAllRow}>
            <Tooltip content={applyAll.disabledReason} relationship="label">
              {/* Rule 13 — DISABLED AS SHIPPED, rendered as a checkbox to match the screenshot. */}
              <Checkbox label="Apply All" checked={false} disabled onClick={() => setApplyScope("all")} />
            </Tooltip>
          </div>

          {isLoading ? (
            <LoadingOverlay mode="inline" label="Loading countries…" />
          ) : !selectedCountry ? (
            <EmptyState title="No countries" description="The Countries table is empty." />
          ) : (
            <CountryBlock
              country={selectedCountry}
              canEdit={canEditScope(user, selectedCountry.id)}
              recalculating={isRecalculating(jobs, selectedCountry.id)}
              onEdit={() => { setPanelCountry(selectedCountry); setEdits(new Map()); }}
            />
          )}
        </div>
      </div>

      <MilestonePanel
        country={panelCountry}
        edits={edits}
        busy={save.isPending}
        canEdit={panelCountry ? canEditScope(user, panelCountry.id) : false}
        onChange={setEdits}
        onClose={() => { setPanelCountry(null); setEdits(new Map()); setError(null); }}
        onSave={() => {
          if (!panelCountry) return;
          const plan = planSaveMilestones({
            edits,
            canEdit: canEditScope(user, panelCountry.id),
          });
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          save.mutate({ plan, countryId: panelCountry.id }, {
            onSuccess: () => {
              // Rule 11's leak fixed: the map is cleared on SUCCESS only, so a failed
              // save leaves the entered values intact.
              setPanelCountry(null);
              setEdits(new Map());
            },
            onError: (e: unknown) =>
              setError(e instanceof Error ? e.message : MSG.saveFailed),
          });
        }}
      />

      <ConfirmDialog
        open={applyScope !== null}
        title="Apply standard milestones?"
        intent="danger"
        confirmLabel="Apply"
        onCancel={() => setApplyScope(null)}
        onConfirm={() => {
          // Unreachable from the UI — both Apply controls are disabled, exactly as
          // shipped. Wired anyway so the INTENT is in the code: the wrapper throws
          // because `ForCountriestriggerFabricrecalculationsforProjects` is not in the
          // solution export.
          const args = fabricRecalculationArgs(
            applyScope === "all"
              ? { kind: "all" }
              : { kind: "country", countryId: effectiveCountryId ?? "", countryName: "" },
          );
          void triggerFabricRecalculationForCountries({ countryIds: args.countryNames })
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : MSG.applyDisabled));
          setApplyScope(null);
        }}
      >
        {MSG.applyConfirmation}
      </ConfirmDialog>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── the read-only pivot grid */

function CountryBlock({
  country, canEdit, recalculating, onEdit,
}: { country: CountryRow; canEdit: boolean; recalculating: boolean; onEdit: () => void }) {
  const s = useStyles();
  const { rows, isLoading } = useCountryAssumptions(country.id);
  const pivot = useMemo(() => pivotByTechnology(rows), [rows]);
  const gridRows: MilestoneSummaryRow[] = useMemo(() => buildMilestoneSummaryRows(pivot), [pivot]);

  const columns: Column<MilestoneSummaryRow>[] = [
    { key: "tech", header: "Technology", width: "minmax(160px, 1fr)", value: (r) => r.technologyCell },
    ...SUMMARY_TABLE_FIELDS.map((fieldLabel): Column<MilestoneSummaryRow> => ({
      key: fieldLabel,
      header: fieldLabel,
      width: "110px",
      numeric: true,
      value: (r) => {
        const v = r.values[fieldLabel];
        return v === null || v === undefined ? "—" : String(v);
      },
    })),
  ];

  return (
    <div className={s.section}>
      <div className={s.countryHead}>
        <span className={s.countryName}>{country.name}</span>
        {recalculating && (
          <Tooltip content={MSG.recalculating} relationship="label">
            <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ArrowSyncRegular fontSize={14} /> Recalculating
            </span>
          </Tooltip>
        )}
        <Tooltip content={canEdit ? "Edit this country's milestones" : MSG.outOfScope} relationship="label">
          <Checkbox label="Edit" checked disabled={!canEdit} onClick={onEdit} />
        </Tooltip>
        <Tooltip content={applyCommandState({ kind: "country", countryId: country.id, countryName: country.name }).disabledReason} relationship="label">
          <Checkbox label="Apply" checked={false} disabled />
        </Tooltip>
      </div>

      <DataGrid
        rows={gridRows}
        columns={columns}
        rowKey={(r) => r.key}
        loading={isLoading}
        emptyMessage={MSG.emptyCountry}
        horizontalScroll
        height={Math.min(340, 56 + gridRows.length * 44) || 140}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── the editor */

function MilestonePanel({
  country, edits, busy, canEdit, onChange, onClose, onSave,
}: {
  country: CountryRow | null;
  edits: EditMap;
  busy: boolean;
  canEdit: boolean;
  onChange: (next: EditMap) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const s = useStyles();
  const { rows } = useCountryAssumptions(country?.id ?? null);
  const durations = useMemo(() => durationRows(rows), [rows]);
  const successes = useMemo(() => successRateRows(rows), [rows]);

  if (!country) {
    return <FormPanel open={false} title="" onClose={onClose}><span /></FormPanel>;
  }

  const cellValue = (row: AssumptionRow, field: MilestoneField): string => {
    const pending = edits.get(editKey(row.id, field));
    if (pending) return pending.raw;
    const stored = row.values[MILESTONE_FIELD_COLUMN[field]];
    return stored === null || stored === undefined ? "" : String(stored);
  };

  const setCell = (
    row: AssumptionRow, field: MilestoneField, kind: "duration" | "successRate", raw: string,
  ) => {
    onChange(upsertEdit(edits, {
      rowId: row.id, field, kind, raw, valid: validateEdit(kind, raw),
    }));
  };

  const cellInvalid = (row: AssumptionRow, field: MilestoneField): boolean => {
    const pending = edits.get(editKey(row.id, field));
    return pending !== undefined && !pending.valid;
  };

  // GUIDE p22 — the panel's two matrices are Wind/PV COLUMNS, one row per field. Missing
  // technology rows (a country with no PV data yet, say) render an empty, disabled cell
  // rather than crashing on a lookup miss.
  const windDurationRow = durations.find((r) => r.technology === CHOICE_ADMIN.technology.wind) ?? null;
  const pvDurationRow = durations.find((r) => r.technology === CHOICE_ADMIN.technology.pv) ?? null;
  const windSuccessRow = successes.find((r) => r.technology === CHOICE_ADMIN.technology.wind) ?? null;
  const pvSuccessRow = successes.find((r) => r.technology === CHOICE_ADMIN.technology.pv) ?? null;

  const matrixCell = (
    row: AssumptionRow | null, field: MilestoneField, kind: "duration" | "successRate",
  ) =>
    row ? (
      <Input
        value={cellValue(row, field)}
        disabled={!canEdit}
        inputMode={kind === "duration" ? "numeric" : "decimal"}
        style={{
          borderColor: cellInvalid(row, field) ? semantic.errorText : undefined,
        }}
        onChange={(_, d) => setCell(row, field, kind, d.value)}
      />
    ) : (
      <Input value="" disabled />
    );

  const matrix = (
    fields: readonly MilestoneField[],
    kind: "duration" | "successRate",
    windRow: AssumptionRow | null,
    pvRow: AssumptionRow | null,
  ) => (
    <div className={s.matrix}>
      <span />
      <span className={s.matrixHeader}>Wind</span>
      <span className={s.matrixHeader}>PV</span>
      {fields.map((field) => (
        <Fragment key={field}>
          <span className={s.matrixLabel}>{milestoneFieldDisplayLabel(field)}</span>
          <span>{matrixCell(windRow, field, kind)}</span>
          <span>{matrixCell(pvRow, field, kind)}</span>
        </Fragment>
      ))}
    </div>
  );

  return (
    <FormPanel
      open
      title={editMilestonesTitle(country.name)}
      onClose={onClose}
      onSave={onSave}
      saveDisabled={!canSave(edits) || !canEdit}
      busy={busy}
      errors={saveErrorMessages(edits)}
    >
      <div className={s.panelBody}>
        {durations.length === 0 && (
          <span className={s.note}>{MSG.emptyCountry}</span>
        )}

        {durations.length > 0 && (
          <div className={s.section}>
            <span className={s.sectionTitle}>{MSG.durationsSectionTitle}</span>
            {matrix(DURATION_FIELDS, "duration", windDurationRow, pvDurationRow)}
          </div>
        )}

        {successes.length > 0 && (
          <div className={s.section}>
            <span className={s.sectionTitle}>{MSG.successRateSectionTitle}</span>
            {matrix(SUCCESS_RATE_FIELDS, "successRate", windSuccessRow, pvSuccessRow)}
          </div>
        )}

        <span className={s.note}>
          Each cell validates on its own. The canvas stored the strings “invalid duration”
          and “invalid success rate” INTO the pending-edit collection and showed one message
          for the whole country.
        </span>
      </div>
    </FormPanel>
  );
}
