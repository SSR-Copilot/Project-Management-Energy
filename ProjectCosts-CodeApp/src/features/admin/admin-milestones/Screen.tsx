/**
 * Admin Milestones Screen — composition only (connected 19 Oct 2026, D21).
 *
 * Canvas screen: `Admin Milestones Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml`.
 *
 * Structure, matching the canvas containers:
 *   heading                  `cmp_Admin_Milestones_Header` (Project.Name)
 *   country accordion        `gal_CountriesMilestonesStandardAssumptions`
 *     card header            `con_Header_MilestonesStandardAssumptions_AdminScreen`
 *     card command bar       `cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar` — Edit
 *     summary header + rows  `con_Header_MilestonesStandardAssumptionsDetails_AdminScreen`,
 *                            `gal_MilestonesStandardAssumptions_AdminScreen`
 *   right panel              `con_Admin_MilestoneAssumtion_Form` — durations and success rates
 *
 * NOT PORTED (D20): `CommandBar1` (Apply All), the per-country Apply item, both Apply
 * confirmations and the `Icon3_1` recalculating badge.
 *
 * Every decision lives in `rules.ts`; every query and write in `hooks.ts`. The hidden
 * `but_…_Reset` button's job (reset the editor on Close / Cancel / Save) is `closePanel`.
 */
import { useMemo, useState } from "react";
import {
  Button, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import {
  CommandBar, EmptyState, FormPanel, LoadingOverlay, PanelButtons, WriteFeedback,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { palette, space } from "@/theme/tokens";
import {
  DURATION_FIELDS, INPUT_MAX_LENGTH, MILESTONE_SCREEN_TEXT as T, MSG, SUCCESS_RATE_FIELDS,
  canSave, durationRows, editKey, editMilestonesTitle, initialInputValue, invalidEdits,
  milestoneFieldDisplayLabel, milestoneInputTestId, pivotByTechnology, planSaveMilestones,
  savingText, sortCountries, successRateRows, summaryCellText, technologyDisplayName, upsertEdit,
  validateEdit,
  type AssumptionRow, type CountryRow, type EditMap, type MilestoneField,
} from "./rules";
import { useCountryAssumptions, useMilestoneCountries, useMilestoneWrites } from "./hooks";

const useStyles = makeStyles({
  /**
   * The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct
   * 2026); `CommandBar` has no inset of its own. Over the "Technology" column caption: Fluent's 8 px
   * header-cell padding.
   */
  commandBar: { paddingLeft: space.s },
  page: {
    display: "flex", flexDirection: "column", rowGap: space.m, minWidth: 0,
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontSize: "20px", lineHeight: "28px", fontWeight: tokens.fontWeightSemibold },
  gallery: { display: "flex", flexDirection: "column", rowGap: space.s },
  card: {
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.neutralQuaternaryAlt, borderRightColor: palette.neutralQuaternaryAlt,
    borderBottomColor: palette.neutralQuaternaryAlt, borderLeftColor: palette.neutralQuaternaryAlt,
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px",
    borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
    backgroundColor: palette.white,
  },
  cardHeader: {
    display: "flex", alignItems: "center", columnGap: space.s, minHeight: "42px",
    paddingLeft: space.s, paddingRight: space.s,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.neutralQuaternaryAlt,
  },
  cardTitle: {
    flexGrow: 1, minWidth: 0, overflowX: "hidden", textOverflow: "ellipsis",
    whiteSpace: "nowrap", fontWeight: tokens.fontWeightSemibold,
  },
  cardBody: {
    display: "flex", flexDirection: "column", rowGap: space.xs,
    paddingLeft: space.s, paddingRight: space.s, paddingBottom: space.s,
  },
  tableWrap: { overflowX: "auto" },
  num: { textAlign: "center", whiteSpace: "pre-line" },
  subLabels: { whiteSpace: "pre-line" },
  panelBody: { display: "flex", flexDirection: "column", rowGap: space.l },
  subHeader: { fontWeight: tokens.fontWeightSemibold },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  cellInput: { width: "90px", minWidth: "0px" },
});

/** `Language()` is the player's language — the browser's here. */
const playerLanguage = (): string => (typeof navigator !== "undefined" && navigator.language) || "en-US";

export default function AdminMilestonesScreen() {
  const s = useStyles();
  const countriesQ = useMilestoneCountries();
  const writes = useMilestoneWrites();
  const canEdit = useAdminAccess();
  const connected = countriesQ.connected;
  const countries = useMemo(() => sortCountries(countriesQ.data), [countriesQ.data]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [panelCountry, setPanelCountry] = useState<CountryRow | null>(null);
  const [edits, setEdits] = useState<EditMap>(new Map());

  /** Close / Cancel / Save — the hidden Reset button: clear the edits and close. */
  const closePanel = () => { setPanelCountry(null); setEdits(new Map()); };

  const save = () => {
    if (!panelCountry) return;
    const country = panelCountry, journal = edits;
    closePanel();
    void writes.run({
      progress: savingText(country.name),
      success: MSG.saved,
      plan: planSaveMilestones({ edits: journal, canEdit, language: playerLanguage() }),
    });
  };

  return (
    <div className={s.page}>
      <Text as="h1" className={s.title}>{T.title}</Text>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="milestones" />

      {countriesQ.error ? (
        <EmptyState title={MSG.loadFailedTitle} description={MSG.loadFailedDescription} />
      ) : countriesQ.isLoading ? (
        <LoadingOverlay mode="inline" label="Loading..." />
      ) : (
        <div className={s.gallery} data-testid="gal_CountriesMilestonesStandardAssumptions">
          {countries.map((country) => (
            <CountryCard
              key={country.id}
              country={country}
              canEdit={connected && canEdit}
              open={expanded.has(country.id)}
              onToggle={() => setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(country.id)) next.delete(country.id); else next.add(country.id);
                return next;
              })}
              onEdit={() => { setPanelCountry(country); setEdits(new Map()); }}
            />
          ))}
        </div>
      )}

      <MilestonePanel
        country={panelCountry}
        edits={edits}
        canEdit={connected && canEdit}
        onChange={setEdits}
        onSave={save}
        onClose={closePanel}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────── one country card */

function CountryCard({
  country, canEdit, open, onToggle, onEdit,
}: {
  country: CountryRow; canEdit: boolean; open: boolean; onToggle: () => void; onEdit: () => void;
}) {
  const s = useStyles();
  const rowsQ = useCountryAssumptions(open ? country.id : null);
  const pivot = useMemo(() => pivotByTechnology(rowsQ.data), [rowsQ.data]);

  return (
    <section className={s.card} data-testid="con_Main_MilestonesStandardAssumptions">
      <div className={s.cardHeader}>
        <Text className={s.cardTitle} data-testid="lbl_ClusterName_MilestonesStandardAssumptions_AdminScreen">
          {country.name}
        </Text>
        <Button
          appearance="transparent"
          icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
          aria-label={country.name}
          aria-expanded={open}
          data-testid={open
            ? "ico_Up_MilestonesStandardAssumptions_AdminScreen"
            : "ico_Down_MilestonesStandardAssumptions_AdminScreen"}
          onClick={onToggle}
        />
      </div>
      {open ? (
        <div className={s.cardBody}>
          <div className={s.commandBar}>
            <CommandBar
              ariaLabel={country.name}
              commands={[{ key: "editCountryMilestoneAssumtions", label: T.edit, icon: "Edit", enabled: canEdit }]}
              onCommand={(key) => { if (canEdit && key === "editCountryMilestoneAssumtions") onEdit(); }}
            />
          </div>
          <div className={s.tableWrap}>
            <Table size="small" aria-label={country.name} data-testid="gal_MilestonesStandardAssumptions_AdminScreen">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{T.technology}</TableHeaderCell>
                  <TableHeaderCell />
                  {T.summaryHeaders.map((h) => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pivot.map((t) => (
                  <TableRow key={String(t.technology)}>
                    <TableCell>{technologyDisplayName(t.technology)}</TableCell>
                    <TableCell className={s.subLabels}>{`${T.subLabelDuration}\n${T.subLabelSuccessRate}`}</TableCell>
                    {DURATION_FIELDS.map((field) => {
                      const [first, second] = summaryCellText(t.entries.find((x) => x.label === field));
                      return <TableCell key={field} className={s.num}>{`${first}\n${second}`}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── the editor */

function MilestonePanel({
  country, edits, canEdit, onChange, onSave, onClose,
}: {
  country: CountryRow | null; edits: EditMap; canEdit: boolean;
  onChange: (next: EditMap) => void; onSave: () => void; onClose: () => void;
}) {
  const s = useStyles();
  const rowsQ = useCountryAssumptions(country?.id ?? null);
  const durations = useMemo(() => durationRows(rowsQ.data), [rowsQ.data]);
  const successes = useMemo(() => successRateRows(rowsQ.data), [rowsQ.data]);
  const invalid = invalidEdits(edits);
  const language = playerLanguage();

  const value = (row: AssumptionRow, field: MilestoneField, kind: "duration" | "successRate"): string =>
    edits.get(editKey(row.id, field))?.raw ?? initialInputValue(row, field, kind);

  const matrix = (fields: readonly MilestoneField[], rows: AssumptionRow[], kind: "duration" | "successRate") => (
    <Table
      size="small"
      aria-label={kind === "duration" ? MSG.durationsSectionTitle : MSG.successRateSectionTitle}
      data-testid={kind === "duration"
        ? "gal_Admin_MilestoneAssumption_Form_Fields_Durations_MilestoneInputs"
        : "gal_Admin_MilestoneAssumption_Form_Fields_SuccessRates_MilestoneInputs"}
    >
      <TableHeader>
        <TableRow>
          <TableHeaderCell />
          {rows.map((r) => <TableHeaderCell key={r.id}>{technologyDisplayName(r.technology)}</TableHeaderCell>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((field) => {
          const label = milestoneFieldDisplayLabel(field);
          return (
            <TableRow key={field}>
              <TableCell>{label}</TableCell>
              {rows.map((r) => {
                const v = value(r, field, kind);
                // The canvas border turns red for an invalid value, also for a blank initial one.
                const bad = !validateEdit(kind, v, language);
                return (
                  <TableCell key={r.id}>
                    <Input
                      className={s.cellInput}
                      aria-label={label}
                      aria-invalid={bad}
                      data-testid={milestoneInputTestId(kind, field)}
                      value={v}
                      maxLength={INPUT_MAX_LENGTH}
                      disabled={!canEdit}
                      style={bad ? { borderColor: palette.Error } : undefined}
                      onChange={(_, d) => onChange(upsertEdit(edits, {
                        rowId: r.id, field, kind, raw: d.value, valid: validateEdit(kind, d.value, language),
                      }))}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <FormPanel
      open={country !== null}
      title={country ? editMilestonesTitle(country.name) : ""}
      width="wide"
      onDismiss={onClose}
      footer={<PanelButtons onSave={onSave} onCancel={onClose} disabled={!canEdit || !canSave(edits)}
        saveTestId="pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save"
        cancelTestId="pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel" />}
    >
      <div className={s.panelBody}>
        <Text className={s.subHeader}>{MSG.durationsSectionTitle}</Text>
        {matrix(DURATION_FIELDS, durations, "duration")}
        {invalid.some((e) => e.kind === "duration") ? (
          <Text className={s.error} role="alert" data-testid="lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage">
            {MSG.invalidDuration}
          </Text>
        ) : null}

        <Text className={s.subHeader}>{MSG.successRateSectionTitle}</Text>
        {matrix(SUCCESS_RATE_FIELDS, successes, "successRate")}
        {invalid.some((e) => e.kind === "successRate") ? (
          <Text className={s.error} role="alert" data-testid="lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage">
            {MSG.invalidSuccessRate}
          </Text>
        ) : null}
      </div>
    </FormPanel>
  );
}
