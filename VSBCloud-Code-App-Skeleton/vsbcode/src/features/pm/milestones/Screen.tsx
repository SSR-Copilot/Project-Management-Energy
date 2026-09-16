/**
 * Project General Milestones Screen — layout and composition.
 *
 * Canvas screen: `Project General Milestones Screen` (PM app)
 *   137 controls · 4 288 lines of Power Fx · 45 substantive blocks · band L
 *
 * GUIDE p15/p16 — the first real screenshots of this screen reshaped this file. It is a
 * plain two-column form, thirteen fields in one fixed order, a `RecordFooter` at the
 * bottom, nothing else chrome-wise: no stat tiles, no card boxing around the date chain.
 * See `rules.ts` for the two things the screenshots actually taught us — the ordering
 * validation copy (verbatim on six of nine messages) and the derived-vs-entered styling
 * rule (`isDerivedMilestone`).
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `con_Milestones_Tip` (`Visible: =false`, its real condition commented out) and
 *    `lbl_..._Share_of_Farmdown_ErrorMessage` (also hard-`false`, but its `Text` still
 *    computed). Both are dead. The farmdown VALIDATION survives in `rules.ts`.
 *  - The four hidden dispatch buttons (`Reset_Validation`, `Recalculate`, `Reset`,
 *    `DateInputs_Reset`) that existed so other controls could `Select()` them.
 *  - `colLogs` and the dialog that rendered it — the re-pricing trace is telemetry.
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState } from "react";
import {
  Button, Field, Input, InfoLabel, Text, Badge, Tooltip, MessageBar, MessageBarBody,
  MessageBarTitle, makeStyles,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular, CalendarArrowRightRegular, LockClosedRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, RecordFooter, Card, ConfirmDialog, LoadingOverlay,
  StateChip, EmptyState,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { useAppStore } from "@/store/appStore";
import { space, media, palette, semantic } from "@/theme/tokens";
import { formatDate } from "@/domain/dates";
import {
  MILESTONE_CHAIN, validateMilestones, invalidMessages, canSaveMilestones, isPageLocked,
  initialForm, operationalLifetime, recalculateMilestone, editMilestone,
  codChangeBlocksSave, validateFarmdown, classifyDerivedMilestones, resetShareOfFarmdown,
  formatAuditStamp,
  type MilestoneKey, type MilestonesForm,
} from "./rules";
import {
  useMilestonesData, useSaveMilestones,
  useMilestoneAssumption, useIndividualVolumeContractCount, useProjectGeneratorsForRepricing,
  usePriceInflation, useDefaultRevenueDraft, computeFidRepricing,
} from "./hooks";

const useStyles = makeStyles({
  // GUIDE p15/p16 — a fixed two-column form, not a fluid card grid.
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: space.xl,
    rowGap: space.m,
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  row: { display: "flex", alignItems: "flex-end", gap: space.xs, minWidth: 0 },
  field: { flex: 1, minWidth: 0 },
  // GUIDE p16 — the derived-value style: italic, theme-primary blue. Applied to the
  // native input's own text, never to the label.
  derivedInput: { color: palette.themePrimary, fontStyle: "italic" },
  lifetimeRow: { display: "flex", gap: space.s },
  errors: {
    display: "flex", flexDirection: "column", gap: "2px",
    color: semantic.errorText, fontSize: "12px",
  },
  side: { display: "flex", flexDirection: "column", gap: space.m },
});

/** The keys with an actual recalculate formula (rule 10/11) — the second icon button. */
const RECALCULABLE: Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate">[] = [
  "FeasibilityStudies", "ProjectDevelopmentStarted", "ApplicationSubmitted",
  "LegallyBindingPermits", "FinalInvestmentDecision", "Construction", "OperationsStartDate",
];

/**
 * GUIDE p15/p16 — the thirteen fields, in the exact order the two-column form renders
 * them. `Project End Date` is deliberately last, after Share of Farmdown and Operational
 * Lifetime, not grouped with the rest of the date chain.
 */
const DATE_FIELD_ORDER: Exclude<MilestoneKey, "ShareOfFarmdown" | "EndDate">[] = [
  "StartDate", "FeasibilityStudies", "ProjectDevelopmentStarted", "ApplicationSubmitted",
  "LegallyBindingPermits", "FinalInvestmentDecision", "Construction", "OperationsStartDate",
  "SalesStartDate", "StartCompleted",
];

export default function MilestonesScreen() {
  const s = useStyles();
  const { project: selected, canEdit, isLoading } = useProjectContext();
  const projectId = selected?.projectId;
  const user = useAppStore((st) => st.session.user);

  const { project, language, isLoading: projectLoading } = useMilestonesData(projectId);
  const save = useSaveMilestones();

  const [form, setForm] = useState<MilestonesForm | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<MilestoneKey[]>([]);
  const [codWarning, setCodWarning] = useState(false);

  const persisted = useMemo(
    () => (project ? initialForm(project) : null),
    [project],
  );
  const live = form ?? persisted;

  const assumption = useMilestoneAssumption(
    project?.countryId ?? null, project?.technology ?? null,
  );
  const individualVolumes = useIndividualVolumeContractCount(projectId);
  const generators = useProjectGeneratorsForRepricing(projectId);
  const inflation = usePriceInflation(live?.dates.FinalInvestmentDecision ?? null);
  const revenueDraft = useDefaultRevenueDraft(
    project, live?.dates ?? project?.dates ?? {
      StartDate: null, FeasibilityStudies: null, ProjectDevelopmentStarted: null,
      ApplicationSubmitted: null, LegallyBindingPermits: null, FinalInvestmentDecision: null,
      Construction: null, OperationsStartDate: null, EndDate: null,
      SalesStartDate: null, StartCompleted: null,
    },
  );

  const locked = isPageLocked(project);

  if (isLoading || projectLoading || !project || !live || !persisted) {
    return <LoadingOverlay mode="inline" label="Loading milestones…" />;
  }

  const validation = validateMilestones(
    live.dates, project.startCluster, live.shareOfFarmdown, language,
  );
  const problems = invalidMessages(validation);
  const lifetime = operationalLifetime(live.dates.OperationsStartDate, live.dates.EndDate);
  const derived = classifyDerivedMilestones(live);

  const saveEnabled = canSaveMilestones({
    perms: { canCreate: canEdit, canEdit },
    project,
    validation,
    dirtyKeys,
    locked,
  });

  const markDirty = (k: MilestoneKey) =>
    setDirtyKeys((d) => (d.includes(k) ? d : [...d, k]));

  const setDate = (k: Exclude<MilestoneKey, "ShareOfFarmdown">, value: string | null) => {
    setForm((prev) => editMilestone(prev ?? persisted, k, value));
    markDirty(k);
  };

  const recalc = (k: Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate">) => {
    setForm((prev) => recalculateMilestone(prev ?? persisted, k, assumption.data ?? null));
    markDirty(k);
  };

  /* ------------------------------------------------------------------- the save */
  const commit = () => {
    // Rule 13 — an FID move re-prices every generator before the patch is built.
    const repricing = computeFidRepricing({
      storedFid: project.dates.FinalInvestmentDecision,
      selectedFid: live.dates.FinalInvestmentDecision,
      generators: generators.data ?? [],
      inflation: inflation.data ?? { current: null, previous: null },
    });

    save.mutate({
      project,
      form: live,
      repricedGenerators: repricing.needsPlantCostRecalculation ? repricing.generators : null,
      revenueDraft,
      language,
    }, {
      onSuccess: () => {
        // Rule 19 — every validation row resets to valid and clean after a good patch.
        setForm(null);
        setDirtyKeys([]);
        setCodWarning(false);
      },
    });
  };

  const attemptSave = () => {
    // Rule 16 — a COD change that would invalidate individual-volume contracts warns
    // instead of saving.
    const blocked = codChangeBlocksSave(
      dirtyKeys.includes("OperationsStartDate"),
      live.dates.OperationsStartDate !== project.dates.OperationsStartDate,
      individualVolumes.data ?? 0,
    );
    if (blocked) { setCodWarning(true); return; }
    commit();
  };

  const cancel = () => { setForm(null); setDirtyKeys([]); };

  // GUIDE p15/p16 — "Modified By" reads a flow account here ("# Azure VSB Cloud Flow
  // Service User"), not a person: this table is written by a Dataverse-triggered flow as
  // often as by a person editing the form. `_createdby_value` / `_modifiedby_value` are
  // not on `SELECT.projectFull` (outside this feature's remit — that's `src/data/`), so,
  // same gap as General Data, the signed-in user's name stands in for whichever wrote it.
  const auditName = user?.displayName ?? null;
  const createdByText = formatAuditStamp(auditName, project.createdOn);
  const modifiedByText = formatAuditStamp(auditName, project.modifiedOn);

  if (locked) {
    return (
      <>
        <PageHeader
          eyebrow="Project Management"
          title="Milestones"
          description="The project's date chain."
        />
        <EmptyState
          icon={<LockClosedRegular fontSize={28} />}
          title="This page is locked"
          description="Milestones need a saved project. Save General Data once — Dataverse assigns the Project ID there — and this screen unlocks."
        />
      </>
    );
  }

  /** One two-column grid cell: a date field, with its recalculate icon where one exists. */
  const dateField = (key: Exclude<MilestoneKey, "ShareOfFarmdown">) => {
    const meta = MILESTONE_CHAIN.find((m) => m.key === key)!;
    const invalid = !validation[key].valid;
    const isDerived = derived[key];
    const canRecalc = (RECALCULABLE as MilestoneKey[]).includes(key);
    return (
      <div key={key} className={s.row}>
        <Field
          className={s.field}
          label={meta.label}
          required={meta.startClusterThreshold === undefined}
          validationState={invalid ? "error" : "none"}
          validationMessage={invalid ? validation[key].text : undefined}
        >
          <Input
            type="date"
            disabled={!canEdit}
            value={(live.dates[key] ?? "").slice(0, 10)}
            onChange={(_, d) => setDate(key, d.value || null)}
            placeholder="Select a date..."
            input={isDerived ? { className: s.derivedInput } : undefined}
          />
        </Field>
        {canRecalc && (
          <Tooltip
            withArrow
            relationship="label"
            content={assumption.data
              ? "Derive from the previous date using the country/technology average duration"
              : "No standard assumption exists for this country and technology"}
          >
            <Button
              icon={<CalendarArrowRightRegular />}
              appearance="subtle"
              disabled={!canEdit || !assumption.data}
              onClick={() =>
                recalc(key as Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate">)}
              aria-label={`Recalculate ${meta.label}`}
            />
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Project Management"
        title="Milestones"
        description="Each date must be later than the one before it."
        actions={
          <>
            {project.clusterStateName && <StateChip state={project.clusterStateName} />}
            <Badge appearance="tint">{project.projectNumber}</Badge>
          </>
        }
      />

      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Milestones could not be saved</MessageBarTitle>
            {save.error instanceof Error ? save.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {save.isSuccess && dirtyKeys.length === 0 && (
        <MessageBar intent="success">
          <MessageBarBody>
            {save.data.steps.map((line, i) => <div key={i}>{line}</div>)}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* GUIDE p15/p16 — one flat two-column grid, thirteen fields, this exact order. */}
      <div className={s.grid}>
        {DATE_FIELD_ORDER.map((key) => dateField(key))}

        {/* Share of Farmdown [%] — GUIDE p15: an info icon on the label and a small reset
            button beside the value, not the "standard assumption" switch this screen used
            to render. */}
        <div className={s.row}>
          <Field
            className={s.field}
            label={<InfoLabel info="The share of the project retained after farmdown.">
              Share of Farmdown [%]
            </InfoLabel>}
            required
            validationState={!validateFarmdown(live.shareOfFarmdown, language) ? "error" : "none"}
            validationMessage={!validateFarmdown(live.shareOfFarmdown, language)
              ? "Two decimals maximum, between 0 and 100." : undefined}
          >
            <Input
              disabled={!canEdit}
              value={live.shareOfFarmdown}
              contentAfter={<span aria-hidden>%</span>}
              onChange={(_, d) => {
                setForm((prev) => ({
                  ...(prev ?? persisted),
                  shareOfFarmdown: d.value,
                  // Editing it by hand clears the standard flag (rule 12's counterpart).
                  isStandardShareOfFarmdown: false,
                }));
                markDirty("ShareOfFarmdown");
              }}
              input={derived.ShareOfFarmdown ? { className: s.derivedInput } : undefined}
            />
          </Field>
          <Tooltip withArrow relationship="label" content="Reset to the 50 % default">
            <Button
              icon={<ArrowClockwiseRegular />}
              appearance="subtle"
              shape="circular"
              disabled={!canEdit}
              onClick={() => {
                setForm((prev) => ({ ...(prev ?? persisted), ...resetShareOfFarmdown() }));
                markDirty("ShareOfFarmdown");
              }}
              aria-label="Reset Share of Farmdown"
            />
          </Tooltip>
        </div>

        {/* Operational Lifetime — GUIDE p15/p16: two boxes side by side, one grid cell,
            rendered "0 years" / "0 months". Rule 14 — derived, never entered. */}
        <div className={s.row}>
          <Field className={s.field} label="Operational Lifetime">
            <div className={s.lifetimeRow}>
              <Input readOnly value={lifetime.yearsText} />
              <Input readOnly value={lifetime.monthsText} />
            </div>
          </Field>
        </div>

        {dateField("EndDate")}
      </div>

      {revenueDraft && (
        <Card title="Default revenue contract">
          <div className={s.side}>
            <MessageBar intent="info">
              <MessageBarBody>
                This project is in {project.clusterStateName} with no revenue rows, so
                saving will seed one contract from the country's standard assumptions.
              </MessageBarBody>
            </MessageBar>
            <Field label="Label"><Input readOnly value={revenueDraft.derived.label} /></Field>
            <Field label="Description">
              <Input readOnly value={revenueDraft.derived.description} />
            </Field>
            <Field label="Contract period">
              <Input
                readOnly
                value={`${formatDate(revenueDraft.derived.contractStart)} → ${formatDate(revenueDraft.derived.contractEnd)}`}
              />
            </Field>
            <Field label="Tariff / price">
              <Input readOnly value={String(revenueDraft.derived.price ?? "—")} />
            </Field>
          </div>
        </Card>
      )}

      {problems.length > 0 && (
        <Card title="Required before saving">
          {/* The InfoButton's Concat over the invalid validation rows, now a real list. */}
          <div className={s.errors} role="alert">
            {problems.map((m, i) => <span key={i}>• {m}</span>)}
          </div>
        </Card>
      )}

      {/* Rule 16 — the individual-volume warning replaces the save. */}
      <ConfirmDialog
        open={codWarning}
        intent="default"
        title="Changing the COD invalidates contract start dates"
        confirmLabel="Save anyway"
        cancelLabel="Keep the current COD"
        busy={save.isPending}
        onCancel={() => setCodWarning(false)}
        onConfirm={commit}
      >
        <Text>
          {individualVolumes.data ?? 0} revenue contract(s) hedge individual volumes and
          take their contract start date from the COD as a standard assumption. Moving the
          COD will leave those contracts inconsistent until they are re-derived on the
          Revenue screen.
        </Text>
      </ConfirmDialog>

      {save.isPending && <LoadingOverlay label="The project is being saved, please wait…" />}

      <RecordFooter
        onSave={attemptSave}
        onCancel={cancel}
        saveDisabled={!saveEnabled || save.isPending}
        busy={save.isPending}
        saveDisabledReason={locked
          ? "General Data must be saved before milestones can be edited."
          : !canEdit ? "You do not have permission to edit this project."
          : dirtyKeys.length === 0 ? "Nothing has changed yet."
          : problems[0] ?? "Fix the highlighted dates first."}
        createdBy={createdByText}
        modifiedBy={modifiedByText}
      />
    </>
  );
}
