/**
 * Grid Operator Screen — layout and composition only.
 *
 * Canvas screen: `Grid Operator Screen` (PM app)
 *   68 controls · 1 320 lines of Power Fx · 23 substantive blocks · band M
 *
 * Two tabs over one `Grid Operators` row per project. Grid Operator holds Operator,
 * Grid voltage level [kV], Grid expansion required and Grid expansion details; Grid
 * Connection holds Substation construction required, Substation construction and
 * operator, and the four cabling numbers. One Save, one Cancel, no flows.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - the twelve `UpdateIf(colGridOperatorFormValidation, …)` OnChange handlers and the
 *    collection they maintained (see rules.ts)
 *  - `locGridOperatorTabSelected` — the tab is `?tab=operator|connection`
 *  - `cmp_PopUp_Leave_GridOperator_Confirmation` wired twice, from the header logo and
 *    the left nav — one `ConfirmDialog` driven by one dirty check
 *  - the ten `Reset()` calls on OnVisible and on Cancel
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Field, Input, Textarea, Dropdown, Option, Text, Badge, Tab, TabList, MessageBar,
  MessageBarBody, MessageBarTitle, Tooltip, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  SaveRegular, ArrowResetRegular, LockClosedRegular, WarningRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, Card, CommandBar, ConfirmDialog, LoadingOverlay, NumericInput,
  StateChip, EmptyState, StatTiles, type Command,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media, palette, semantic } from "@/theme/tokens";
import {
  TABS, parseTab, pageLock, PAGE_LOCK_TITLE, isPageLocked, canEditField, canSwitchTabs,
  validateForm, invalidFields, tabErrorCount, dirtyFields, isDirty, canSave, canCancel,
  saveDisabledReason, charCounter, CHAR_MAX_LENGTH, YES_NO_UNKNOWN, choiceLabel,
  formatTwoPlaces, formatThreePlaces, LEAVE_CONFIRMATION, SAVE_SUCCESS,
  SAVE_ERROR_PREFIX, MSG,
  type GridOperatorField, type GridOperatorForm, type TabKey,
} from "./rules";
import { useGridOperator, useGridOperatorProject, useSaveGridOperator } from "./hooks";

const useStyles = makeStyles({
  grid: {
    display: "grid", gap: space.l,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  wide: { gridColumn: "1 / -1" },
  counter: {
    fontSize: "11px", color: tokens.colorNeutralForeground3, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  bullet: { display: "flex", gap: space.s, alignItems: "baseline" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  tabs: { marginBottom: space.s },
  errors: {
    display: "flex", flexDirection: "column", gap: "2px",
    color: semantic.errorText, fontSize: "12px",
  },
});

export default function GridOperatorScreen() {
  const s = useStyles();
  const { project: selected, canEdit, isLoading: contextLoading } = useProjectContext();
  const projectId = selected?.projectId;

  const [params, setParams] = useSearchParams();
  const tab: TabKey = parseTab(params.get("tab"));

  const { project, language, isLoading: projectLoading } = useGridOperatorProject(projectId);
  const { record, baseline, isLoading, isError, error, refetch } = useGridOperator(projectId);
  const save = useSaveGridOperator();

  /** `null` means "no local edits yet" — the bound server values are shown. */
  const [draft, setDraft] = useState<GridOperatorForm | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<GridOperatorField>>(new Set());
  const [allowReset, setAllowReset] = useState(true);
  const [pendingLeave, setPendingLeave] = useState<TabKey | null>(null);

  const form = draft ?? baseline;
  const validity = useMemo(
    () => validateForm(form, touched, language),
    [form, touched, language],
  );
  const dirty = dirtyFields(form, baseline);
  const locked = isPageLocked(project);
  const lockEntries = pageLock(project);

  const set = <K extends GridOperatorField>(field: K, value: GridOperatorForm[K]) => {
    setDraft((prev) => ({ ...(prev ?? baseline), [field]: value }));
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  };

  const reset = () => {
    setDraft(null);
    setTouched(new Set());
  };

  const goToTab = (next: TabKey) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const saveState = {
    project, canEdit, form, baseline, touched, language, busy: save.isPending,
  };

  const commands: Command[] = [
    {
      key: "save", label: "Save", icon: <SaveRegular />, primary: true,
      disabled: !canSave(saveState),
      disabledReason: saveDisabledReason(saveState),
      onClick: () => {
        if (!project) return;
        save.mutate(
          { project, record, form, canEdit, language },
          {
            onSuccess: () => {
              // Rule 10 — `locAllowGridOperatorReset: false` and every Dirty flag cleared.
              setDraft(null);
              setTouched(new Set());
              setAllowReset(false);
            },
          },
        );
      },
    },
    {
      key: "cancel", label: "Cancel", icon: <ArrowResetRegular />,
      disabled: !canCancel({ allowReset, form, baseline }),
      disabledReason: !allowReset
        ? "The form has just been saved."
        : "Nothing has changed yet.",
      onClick: reset,
    },
  ];

  /* ─────────────────────────────────────────────────────────── loading / gates */

  if (contextLoading || projectLoading || isLoading) {
    return <LoadingOverlay mode="inline" label="Loading grid operator data…" />;
  }

  if (isError) {
    return (
      <>
        <Header project={project} record={record} />
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Grid operator data could not be loaded</MessageBarTitle>
            {error?.message ?? "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
        <EmptyState
          icon={<WarningRegular fontSize={28} />}
          title="Nothing to show yet"
          description="The Grid Operators query failed. Retry, or reload the screen if the problem persists."
          action={
            <Tooltip withArrow relationship="label" content="Re-run the query">
              <Badge appearance="tint" onClick={refetch} style={{ cursor: "pointer" } as CSSProperties}>
                Retry
              </Badge>
            </Tooltip>
          }
        />
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Header project={project} record={record} />
        <EmptyState
          title="No project loaded"
          description="This screen works on one project at a time. Pick a project from the portfolio to continue."
        />
      </>
    );
  }

  if (locked) {
    return (
      <>
        <Header project={project} record={record} />
        <EmptyState
          icon={<LockClosedRegular fontSize={28} />}
          title={PAGE_LOCK_TITLE}
          description={
            <span className={s.lock}>
              {lockEntries.map((e) => (
                <span key={e.reason} className={s.bullet}>
                  <span>{e.label}</span>
                  <span className={s.hint}>{e.hint}</span>
                </span>
              ))}
            </span>
          }
        />
      </>
    );
  }

  /* ──────────────────────────────────────────────────────────────── the form */

  const fieldDisabled = (field: GridOperatorField) =>
    !canEditField({ project, canEdit }, field);

  const problems = invalidFields(validity)
    .map((fld) => validity[fld].message)
    .filter((m): m is string => Boolean(m));

  return (
    <>
      <Header project={project} record={record} />

      <StatTiles
        stats={[
          {
            label: "Grid operator record",
            value: record ? "Saved" : "Not created",
            accent: record ? palette.Success : palette.Grayscale10,
            note: record ? "one row per project" : "Save creates it",
          },
          {
            label: "Voltage level",
            value: form.voltageLevel || "—",
            unit: form.voltageLevel ? "kV" : undefined,
            note: "Grid connection voltage",
          },
          {
            label: "Expansion required",
            value: choiceLabel(form.expansionRequired),
            note: "Grid expansion",
          },
          {
            label: "Unsaved changes",
            value: String(dirty.length),
            accent: dirty.length ? palette.Warning : palette.Success,
            note: dirty.length ? "fields edited" : "the form matches the server",
          },
        ]}
      />

      <CommandBar commands={commands} />

      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{SAVE_ERROR_PREFIX}</MessageBarTitle>
            {save.error instanceof Error ? save.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {save.isSuccess && dirty.length === 0 && (
        <MessageBar intent="success">
          <MessageBarBody>{SAVE_SUCCESS}</MessageBarBody>
        </MessageBar>
      )}
      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>
            You can read this project but not change it. Every field is read-only.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={s.tabs}>
        <TabList
          selectedValue={tab}
          onTabSelect={(_, d) => {
            const next = d.value as TabKey;
            // Rule 14 — leaving with unsaved data prompts. In the canvas this only fired
            // on the logo and the left nav; a tab switch keeps the draft, so the prompt
            // here is informational, not destructive.
            if (isDirty(form, baseline)) { setPendingLeave(next); return; }
            goToTab(next);
          }}
        >
          {TABS.map((t) => {
            const errors = tabErrorCount(validity, t.key);
            return (
              <Tab
                key={t.key}
                value={t.key}
                disabled={!canSwitchTabs({ project, canEdit }) && t.key !== tab}
              >
                {t.label}
                {errors > 0 && (
                  <Badge appearance="filled" color="danger" size="small" style={{ marginLeft: 6 } as CSSProperties}>
                    {errors}
                  </Badge>
                )}
              </Tab>
            );
          })}
        </TabList>
      </div>

      {tab === "operator" ? (
        <Card title="Grid Operator">
          <div className={s.grid}>
            <div className={s.wide}>
              <Field label="Operator">
                <Textarea
                  resize="vertical"
                  maxLength={CHAR_MAX_LENGTH}
                  disabled={fieldDisabled("operator")}
                  value={form.operator}
                  onChange={(_, d) => set("operator", d.value)}
                />
              </Field>
              <div className={s.counter}>{charCounter(form.operator)}</div>
            </div>

            {/* Rule 6 — the comma guard lives in validateVoltage, so the shared
                NumericInput's own range/shape check is left off and the message comes
                from the rule. */}
            <Field
              label="Grid voltage level (kV)"
              validationState={validity.voltageLevel.message ? "error" : "none"}
              validationMessage={validity.voltageLevel.message}
            >
              <Input
                inputMode="decimal"
                disabled={fieldDisabled("voltageLevel")}
                value={form.voltageLevel}
                onChange={(_, d) => set("voltageLevel", d.value)}
                contentAfter={<span aria-hidden>kV</span>}
              />
            </Field>

            <Field label="Grid expansion required">
              <Dropdown
                disabled={fieldDisabled("expansionRequired")}
                value={choiceLabel(form.expansionRequired)}
                selectedOptions={
                  form.expansionRequired === null ? [] : [String(form.expansionRequired)]
                }
                onOptionSelect={(_, d) =>
                  set("expansionRequired", d.optionValue ? Number(d.optionValue) : null)
                }
              >
                {YES_NO_UNKNOWN.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                ))}
              </Dropdown>
            </Field>

            <div className={s.wide}>
              <Field label="Grid expansion details">
                <Textarea
                  resize="vertical"
                  maxLength={CHAR_MAX_LENGTH}
                  disabled={fieldDisabled("expansionDetails")}
                  value={form.expansionDetails}
                  onChange={(_, d) => set("expansionDetails", d.value)}
                />
              </Field>
              <div className={s.counter}>{charCounter(form.expansionDetails)}</div>
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Grid Connection">
          {/* SOURCE DEFECT (ambiguity 14): none of the six controls below carried a
              DisplayMode property in the canvas, so they stayed editable on a locked or
              Draft project. They are gated on `canEdit` here like every other field —
              see canEditField in rules.ts. */}
          <div className={s.grid}>
            <Field label="Substation construction required">
              <Dropdown
                disabled={fieldDisabled("substationConstructionRequired")}
                value={choiceLabel(form.substationConstructionRequired)}
                selectedOptions={
                  form.substationConstructionRequired === null
                    ? [] : [String(form.substationConstructionRequired)]
                }
                onOptionSelect={(_, d) =>
                  set(
                    "substationConstructionRequired",
                    d.optionValue ? Number(d.optionValue) : null,
                  )
                }
              >
                {YES_NO_UNKNOWN.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                ))}
              </Dropdown>
            </Field>

            <div>
              <Field label="Substation construction and operator">
                <Textarea
                  resize="vertical"
                  maxLength={CHAR_MAX_LENGTH}
                  disabled={fieldDisabled("substationOperator")}
                  value={form.substationOperator}
                  onChange={(_, d) => set("substationOperator", d.value)}
                />
              </Field>
              <div className={s.counter}>{charCounter(form.substationOperator)}</div>
            </div>

            {/* Rules 7–8 — three decimals / 0–99 for lengths, one decimal / 0–999 for
                diameters. The messages come from the rules so the inline text matches
                gblAppResx exactly; NumericInput enforces the same shape as it types. */}
            <NumericInput
              label="Length internal cabeling" unit="km" places={3} min={0} max={99}
              language={language} disabled={fieldDisabled("lengthInternal")}
              rangeMessage={MSG.lengthRange}
              value={form.lengthInternal}
              onChange={(v) => set("lengthInternal", v)}
            />
            <NumericInput
              label="Diameter internal cabeling" unit="mm" places={1} min={0} max={999}
              language={language} disabled={fieldDisabled("diameterInternal")}
              rangeMessage={MSG.diameterRange}
              value={form.diameterInternal}
              onChange={(v) => set("diameterInternal", v)}
            />
            <NumericInput
              label="Length external cabeling" unit="km" places={3} min={0} max={99}
              language={language} disabled={fieldDisabled("lengthExternal")}
              rangeMessage={MSG.lengthRange}
              value={form.lengthExternal}
              onChange={(v) => set("lengthExternal", v)}
            />
            <NumericInput
              label="Diameter external cabeling" unit="mm" places={1} min={0} max={999}
              language={language} disabled={fieldDisabled("diameterExternal")}
              rangeMessage={MSG.diameterRange}
              value={form.diameterExternal}
              onChange={(v) => set("diameterExternal", v)}
            />
          </div>
        </Card>
      )}

      {problems.length > 0 && (
        <Card title="Required before saving">
          <div className={s.errors} role="alert">
            {problems.map((m, i) => <span key={i}>• {m}</span>)}
          </div>
        </Card>
      )}

      {!record && (
        <MessageBar intent="info">
          <MessageBarBody>
            This project has no grid operator record yet. Saving creates one — nothing is
            written until you do.
          </MessageBarBody>
        </MessageBar>
      )}

      <ConfirmDialog
        open={pendingLeave !== null}
        title="Unsaved changes"
        confirmLabel="Switch tab"
        cancelLabel="Stay here"
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          if (pendingLeave) goToTab(pendingLeave);
          setPendingLeave(null);
        }}
      >
        <Text>{LEAVE_CONFIRMATION}</Text>
      </ConfirmDialog>

      {save.isPending && <LoadingOverlay label="Saving grid operator data…" />}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────── the header */

function Header({
  project, record,
}: {
  project: { clusterStateName: string | null; projectNumber: string | null } | null;
  record: { voltageLevel: number | null; lengthInternal: number | null } | null;
}) {
  return (
    <PageHeader
      eyebrow="Project Management"
      title="Grid Operator"
      description="The grid operator, the connection voltage and the cabling this project needs. One record per project, saved in one write."
      actions={
        <>
          {project?.clusterStateName && <StateChip state={project.clusterStateName} />}
          {project?.projectNumber && <Badge appearance="tint">{project.projectNumber}</Badge>}
          {record && (
            <Badge appearance="outline">
              {formatTwoPlaces(record.voltageLevel) || "—"} kV ·{" "}
              {formatThreePlaces(record.lengthInternal) || "—"} km
            </Badge>
          )}
        </>
      }
    />
  );
}
