/**
 * Project General Data Screen — layout and composition.
 *
 * Canvas screen: `Project General Data Screen` (PM app)
 *   311 controls · 7 438 lines of Power Fx · 88 substantive blocks · band XL
 *
 * The project master-data form and the only place a project is created. Rebuilt against
 * the guide's screenshots (p10–p14) of the live canvas app: three stacked sections —
 * `Basic Information`, `Placement`, `Shareholding Entity` — a fixed `RecordFooter`, and
 * eager (not on-blur) field validation. Every layout and copy decision that came from a
 * screenshot rather than the original spec carries a `// GUIDE pNN:` comment.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `pcf_btn_..._Save_2` (rule 40) — the older duplicate save control and its 334-line
 *    `OnChange`. Only `btn_GeneralData_Save_Actual` is ported.
 *  - The two hidden dispatch buttons (`btn_General_CancelActiveDraftGateApprovalForStart-
 *    ClusterChange`, `btn_GeneralData_Save_Actual`) that existed purely so other controls
 *    could `Select()` them. They are functions now: `planSaveCleanup` / `saveGeneralData`.
 *  - `colMapLocation` — the one-row collection a map control bound to. The map here is a
 *    presentational, defensive placeholder (no library in the dependency graph): a pin
 *    renders only for a genuinely valid coordinate pair, never for a blank or malformed one.
 *  - The tab strip's manual show/hide of two absolutely positioned groups: the sections are
 *    always in the document, in guide order.
 *  - The top command bar (Save / Discard / Add / Edit / Delete shareholder buttons) — the
 *    guide shows no such bar. Save/Cancel live only in `RecordFooter`; Add/Edit/Delete
 *    shareholder are inline with the Shareholding Entity table, as the screenshots show.
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState } from "react";
import {
  Input, Dropdown, Option, Field, Text, Badge, Combobox, Avatar, Button, Spinner,
  MessageBar, MessageBarBody, MessageBarTitle, makeStyles, tokens, Divider,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, DismissRegular, InfoRegular, LocationRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, Card, DataGrid, FormPanel, ConfirmDialog, LoadingOverlay, RecordFooter,
  TextFieldWithCount, NumericInput, EmptyState, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { useAppStore } from "@/store/appStore";
import { CHOICE } from "@/data/entities";
import { space, media, palette } from "@/theme/tokens";
import { formatWithSeparators } from "@/domain/numeric";
import { TECHNOLOGY_LABEL } from "@/domain/technology";
import {
  canSave, validationMessages, classifyStartClusterChange, startClusterNo,
  countryOptions, countryDisplayMode, fieldModes, isAreaRequired, isTerrainSizeRequired,
  isMunicipalityRequired, municipalityMode, isAcquisitionRowVisible, isSubTechnologyVisible,
  isSpvLegalStructureRequired, isSpvLegalStructureVisible, shareholdingSum,
  shareholdingSumWarning, shareholdingDescription, remainingPct, isThirdParty,
  shareholderPanelErrors, applyShareholderDraft, planShareholderDelete,
  milestoneChainErrors, canSaveClusterPanel, clusterPanelVisibleFields,
  clearSkippedMilestones, applyGermanMunicipality, onCountryChange, mapMarker,
  coordinateMessage, isCoordinateValid, recordStatusLabel, formatAuditStamp,
  MSG,
  type GeneralDataForm, type ShareholdingEntity, type ShareholderDraft,
  type ClusterPanelDates, type ClusterPanelField, type StartClusterChange,
} from "./rules";
import {
  useGeneralDataRefData, useEntraSearch, useMunicipalitySearch, useSaveGeneralData,
  useProjectGenerators, toForm, toSnapshot,
} from "./hooks";

const useStyles = makeStyles({
  sections: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  fields: {
    display: "grid", gap: space.m,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  status: {
    display: "inline-flex", alignItems: "center", gap: space.xs,
    color: tokens.colorNeutralForeground3, fontSize: "13px",
  },
  statusIcon: { display: "grid", placeItems: "center", color: tokens.colorBrandForeground1 },

  /* Placement: a fields column beside a map column, stacking on narrow screens. */
  placementLayout: {
    display: "grid", gap: space.l,
    gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 300px)",
    alignItems: "start",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  mapPanel: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: space.xs, minHeight: "200px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "dashed", borderRightStyle: "dashed", borderBottomStyle: "dashed", borderLeftStyle: "dashed",
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    textAlign: "center", padding: space.m,
  },
  mapPin: { fontSize: "28px", color: palette.Error },
  mapCoords: { fontSize: "12px", fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3 },
  mapEmpty: { fontSize: "12px", color: tokens.colorNeutralForeground3, maxWidth: "22ch" },

  /* Shareholding Entity */
  shareHead: {
    display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap",
  },
  shareSum: { fontSize: "12px", fontVariantNumeric: "tabular-nums" },
  shareGrid: { minHeight: "180px" },
  rowActions: { display: "flex", justifyContent: "flex-end", gap: space.xs },

  /* People pickers */
  personLabel: {
    fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground1,
    display: "block", marginBottom: space.xxs,
  },
  personStar: { color: tokens.colorPaletteRedForeground1, marginRight: "3px" },
  chip: {
    display: "inline-flex", alignItems: "center", gap: space.xs,
    paddingTop: "4px", paddingRight: "6px", paddingBottom: "4px", paddingLeft: "6px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground2,
    width: "fit-content",
  },
  chipName: { fontSize: "13px" },

  panelFields: { display: "flex", flexDirection: "column", gap: space.m },
});

const CLUSTER_OPTIONS = [
  { value: CHOICE.clusterState.greenfield, label: "Greenfield" },
  { value: CHOICE.clusterState.cluster1, label: "Cluster 1" },
  { value: CHOICE.clusterState.cluster2, label: "Cluster 2" },
  { value: CHOICE.clusterState.cluster3, label: "Cluster 3" },
  { value: CHOICE.clusterState.cluster4, label: "Cluster 4" },
  { value: CHOICE.clusterState.cluster5, label: "Cluster 5" },
  { value: CHOICE.clusterState.cluster6, label: "Cluster 6" },
];

const DEV_TYPE_OPTIONS = [
  { value: CHOICE.developmentType.acquiredProject, label: "Acquired Project" },
  { value: CHOICE.developmentType.ownDevelopment, label: "Own Development" },
];

/**
 * Derived from the option set rather than hand-listed. The literal list this replaces read
 * `["Wind", "PV", "Hybrid", "Storage"]` — but "Storage" is not a member of
 * `CHOICE_PROCESS.technology` (the member is "BESS"), so picking it produced a value that
 * could not be written, and it omitted Hydrogen, Hydro and Substation entirely.
 */
const TECHNOLOGY_OPTIONS = Object.values(TECHNOLOGY_LABEL);
const LEGAL_STRUCTURE_OPTIONS = ["GmbH", "GmbH & Co. KG", "AG", "UG"];

/**
 * GUIDE p14 — the only "Project Type" value the screenshots ever show. There is no CHOICE
 * entry for it in `data/entities.ts` (unlike Technology or Development Type), so the real
 * option set is unverified beyond this one label; kept freeform so an existing record's
 * real value is never hidden just because it is not in this list.
 */
const PROJECT_TYPE_KNOWN = ["Only infrastructure"];

const PANEL_LABELS: Record<ClusterPanelField, string> = {
  startDate: "Project Start Date",
  cluster1: "Cluster 1 — Feasibility studies",
  cluster2: "Cluster 2 — Project development started",
  cluster3: "Cluster 3 — Application submitted",
  cluster4: "Cluster 4 — Legally binding permits",
  fid: "Final Investment Decision",
  cluster5: "Cluster 5 — Construction",
  cluster6: "Cluster 6 — Operations start (COD)",
};

let shareholderKeySeq = 0;
const nextShareholderKey = () => `new-${++shareholderKeySeq}`;

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * GUIDE p12/p14 — a picked person renders as a removable chip (initials avatar + name +
 * dismiss), not as a lingering search box. Shared by Project Manager and Deputy Project
 * Manager; falls back to the search combobox whenever nothing is picked yet.
 */
function PersonField({
  label, required, message, rowId, name, placeholder, hint,
  search, onSearchChange, results, isFetching, onPick, onClear,
}: {
  label: string;
  required?: boolean;
  message?: string | null;
  rowId: string | null;
  name: string | null;
  placeholder: string;
  hint?: string;
  search: string;
  onSearchChange: (v: string) => void;
  results: { rowId: string; displayName: string }[];
  isFetching: boolean;
  onPick: (rowId: string, name: string) => void;
  onClear: () => void;
}) {
  const s = useStyles();

  if (rowId) {
    return (
      <div>
        <span className={s.personLabel}>
          {required && <span className={s.personStar} aria-hidden="true">*</span>}
          {label}
        </span>
        <div className={s.chip}>
          <Avatar name={name ?? undefined} size={24} color="colorful" />
          <Text className={s.chipName}>{name ?? "Selected"}</Text>
          <Button
            appearance="transparent"
            size="small"
            icon={<DismissRegular />}
            aria-label={`Remove ${name ?? label}`}
            onClick={onClear}
          />
        </div>
      </div>
    );
  }

  return (
    <Field
      label={label}
      required={required}
      hint={hint}
      validationState={message ? "error" : "none"}
      validationMessage={message ?? undefined}
    >
      <Combobox
        freeform
        value={search}
        placeholder={placeholder}
        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        onOptionSelect={(_, d) => {
          const person = results.find((p) => p.rowId === d.optionValue);
          if (person) onPick(person.rowId, person.displayName);
        }}
      >
        {isFetching && <Option value="">Searching…</Option>}
        {results.map((p) => (
          <Option key={p.rowId} value={p.rowId} text={p.displayName}>{p.displayName}</Option>
        ))}
      </Combobox>
    </Field>
  );
}

export default function GeneralDataScreen() {
  const s = useStyles();
  const { project, record, canEdit, isLoading } = useProjectContext();
  const user = useAppStore((st) => st.session.user);
  const projectId = project?.projectId;

  const refData = useGeneralDataRefData(projectId);
  const generators = useProjectGenerators(projectId);
  const save = useSaveGeneralData();

  const snapshot = useMemo(() => toSnapshot(record), [record]);
  const persisted = useMemo(() => toForm(record), [record]);

  const [form, setForm] = useState<GeneralDataForm | null>(null);
  const [entities, setEntities] = useState<ShareholdingEntity[] | null>(null);
  const [entitiesDirty, setEntitiesDirty] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [draft, setDraft] = useState<ShareholderDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clusterPanel, setClusterPanel] = useState<{
    kind: Exclude<StartClusterChange, "direct-save">;
    newStartClusterNo: number;
    dates: ClusterPanelDates;
  } | null>(null);
  const [managerSearch, setManagerSearch] = useState("");
  const [deputySearch, setDeputySearch] = useState("");
  const [muniSearch, setMuniSearch] = useState("");

  const live = form ?? persisted;
  const liveEntities = entities ?? refData.shareholders;
  const isDirty = form !== null || entitiesDirty;

  const patch = (p: Partial<GeneralDataForm>) => setForm((f) => ({ ...(f ?? persisted), ...p }));

  /* ------------------------------------------------------------------ derived */
  const country = refData.ref.countries.find((c) => c.id === live.countryId);
  const options = countryOptions(
    refData.ref.countries, user?.editableCountries ?? [], snapshot?.countryName,
  );
  const countryMode = countryDisplayMode({
    approvalState: snapshot?.approvalState ?? null,
    canCreate: canEdit || !projectId,
    countryInScope: !snapshot?.countryName
      || options.some((c) => c.name === snapshot.countryName),
  });
  const modes = fieldModes({
    clusterStateOrder: snapshot?.clusterStateOrder ?? null,
    environmentName: refData.ref.environmentName,
  });

  const ctx = {
    form: live,
    ref: refData.ref,
    project: snapshot,
    entities: liveEntities,
    hasPersistedShareholders: refData.shareholders.length > 0,
  };
  const messages = validationMessages(ctx);
  const saveEnabled = canSave({
    ...ctx,
    perms: { canCreate: canEdit || !projectId, canEdit },
    isDirty,
  });

  const areaRequired = isAreaRequired(
    live.countryId, snapshot?.countryId, refData.ref.countryIdsWithAreas,
  );
  // GUIDE p12/p13: Terrain Size never appears in the walkthrough even with a country
  // selected — render it only when the country actually requires it (rule 23), the same
  // pattern the acquisition row already uses for Development Type.
  const terrainRequired = isTerrainSizeRequired(country?.key, snapshot?.countryKey);
  const muniKind = isMunicipalityRequired(country?.name);
  const muniMode = municipalityMode(country?.name);
  const acquired = isAcquisitionRowVisible(live.developmentType);
  const spvLegalVisible = isSpvLegalStructureVisible(country?.name);

  const areaOptions = useMemo(
    () => refData.areas.filter((a) => a._vsb_country_value === live.countryId),
    [refData.areas, live.countryId],
  );
  const selectedArea = areaOptions.find((a) => a.vsb_countryareaid === live.areaId);

  const managers = useEntraSearch(managerSearch);
  const deputies = useEntraSearch(deputySearch);
  const municipalities = useMunicipalitySearch(muniMode, muniSearch, selectedArea?.vsb_name);

  const lang = refData.ref.language;
  const latMessage = coordinateMessage(live.latitude, "lat", lang);
  const lngMessage = coordinateMessage(live.longitude, "lng", lang);
  const hasPin = isCoordinateValid(live.latitude, "lat", lang) && isCoordinateValid(live.longitude, "lng", lang);
  const marker = mapMarker(live, null, lang);

  const projectTypeOptions = live.projectType && !PROJECT_TYPE_KNOWN.includes(live.projectType)
    ? [...PROJECT_TYPE_KNOWN, live.projectType]
    : PROJECT_TYPE_KNOWN;

  /* ---------------------------------------------------------------- the save */
  const runSave = (override?: { dates: ClusterPanelDates; newStartClusterNo: number }) => {
    const change = classifyStartClusterChange({
      developmentType: live.developmentType,
      previousCluster: snapshot?.startCluster ?? null,
      selectedCluster: live.startCluster,
      project: snapshot,
    });
    const newNo = acquired ? startClusterNo(live.startCluster) : CHOICE.clusterState.greenfield;

    // Rule 26 — anything but 'direct-save' opens the panel first.
    if (!override && change !== "direct-save") {
      setClusterPanel({
        kind: change,
        newStartClusterNo: newNo,
        dates: {
          startDate: snapshot?.projectStartDate ?? null,
          cluster1: snapshot?.feasibilityStudies ?? null,
          cluster2: snapshot?.projectDevelopmentStarted ?? null,
          cluster3: snapshot?.applicationSubmitted ?? null,
          cluster4: snapshot?.legallyBindingPermits ?? null,
          fid: snapshot?.fid ?? null,
          cluster5: snapshot?.construction ?? null,
          cluster6: snapshot?.cod ?? null,
        },
      });
      return;
    }

    save.mutate({
      form: live,
      ref: refData.ref,
      project: snapshot,
      startClusterChanged: startClusterNo(snapshot?.startCluster ?? null) !== newNo,
      newStartClusterNo: newNo,
      trackings: refData.trackings,
      shareholdersDirty: entitiesDirty,
      entities: liveEntities,
      removedShareholderIds: pendingDeletes,
      repriceGenerators: false,
      generators: generators.data ?? [],
      // Rule 29 — the panel's date payload rides along with the project patch.
      ...(override
        ? { clusterMilestonePatch: clearSkippedMilestones(override.dates, override.newStartClusterNo) }
        : {}),
    }, {
      onSuccess: () => {
        setForm(null);
        setEntities(null);
        setEntitiesDirty(false);
        setPendingDeletes([]);
        setClusterPanel(null);
      },
    });
  };

  const resetForm = () => {
    setForm(null);
    setEntities(null);
    setEntitiesDirty(false);
    setPendingDeletes([]);
  };

  const openEditDraft = (row: ShareholdingEntity) => setDraft({
    key: row.key, recordId: row.recordId, entityTypeValue: row.entityTypeValue,
    customName: row.customName, percent: String(row.ownership * 100),
  });

  const entityColumns: Column<ShareholdingEntity>[] = [
    {
      key: "description", header: "Description", width: "minmax(180px, 2fr)",
      value: shareholdingDescription,
    },
    {
      key: "ownership", header: "Ownership", width: "130px", align: "end", numeric: true,
      value: (r) => r.ownership,
      // GUIDE p13: "50.0 %" — one decimal place, not two.
      render: (r) => `${formatWithSeparators(r.ownership * 100, lang, 1)} %`,
    },
    {
      key: "actions", header: "Actions", width: "96px", align: "end",
      render: (r) => (
        <div className={s.rowActions}>
          <Button
            appearance="subtle" size="small" icon={<EditRegular />}
            aria-label={`Edit ${shareholdingDescription(r)}`}
            disabled={!canEdit && Boolean(projectId)}
            onClick={() => openEditDraft(r)}
          />
          <Button
            appearance="subtle" size="small" icon={<DeleteRegular />}
            aria-label={`Delete ${shareholdingDescription(r)}`}
            disabled={!canEdit && Boolean(projectId)}
            onClick={() => setDeleteTarget(r.key)}
          />
        </div>
      ),
    },
  ];

  if (isLoading || refData.isLoading) return <LoadingOverlay mode="inline" label="Loading project…" />;
  if (refData.isError) {
    return (
      <EmptyState
        title="Reference data could not be loaded"
        description="Countries and project states are required before this form can be edited. Retry, or report the problem from Help."
      />
    );
  }

  const sum = shareholdingSum(liveEntities);
  const sumWarning = shareholdingSumWarning(liveEntities);

  // GUIDE p14: the audit stamp needs the real Dataverse "Created By"/"Modified By" user —
  // `_createdby_value` / `_modifiedby_value` are not on `SELECT.projectFull`
  // (`src/data/entities.ts`, outside this feature), so the signed-in user's name stands in
  // until that projection is widened. See the screen-level report for the gap.
  const auditName = user?.displayName ?? null;
  const createdByText = projectId
    ? formatAuditStamp(auditName, asString(record?.["createdon"])) : null;
  const modifiedByText = projectId
    ? formatAuditStamp(auditName, record?.modifiedon ?? null) : null;

  return (
    <>
      <PageHeader
        eyebrow="Project Management"
        // GUIDE p10 vs p14: "New Project" before the first save, the project's own name after.
        title={projectId ? live.projectName : "New Project"}
        description={projectId ? (
          <span className={s.status}>
            <span className={s.statusIcon} aria-hidden="true"><InfoRegular /></span>
            {recordStatusLabel(snapshot?.statecode)}
          </span>
        ) : (
          "The project's master data. This is the only screen that creates a project — "
          + "everything downstream keys off the Project ID assigned here."
        )}
        actions={
          <>
            {snapshot?.projectNumber && <Badge appearance="tint">{snapshot.projectNumber}</Badge>}
            {refData.ref.environmentName === "Budgeting" && (
              <Badge appearance="filled" color="warning">Budgeting</Badge>
            )}
          </>
        }
      />

      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The project could not be saved</MessageBarTitle>
            {save.error instanceof Error ? save.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {save.isSuccess && !isDirty && (
        <MessageBar intent="success">
          <MessageBarBody>
            {save.data.steps.map((line, i) => <div key={i}>{line}</div>)}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={s.sections}>
        {/* ═══════════════════════════════════════════════════ Basic Information */}
        <Card title="Basic Information">
          <div className={s.fields}>
            <TextFieldWithCount
              label="Project ID"
              value={snapshot?.projectNumber ?? ""}
              onChange={() => {}}
              disabled
              showCount={false}
              hint="Assigned by Dataverse on first save."
            />

            <TextFieldWithCount
              label="Project Name"
              required
              value={live.projectName}
              disabled={modes.projectName === "view"}
              onChange={(v) => patch({ projectName: v })}
              message={messages.includes(MSG.projectName) ? MSG.projectName : undefined}
            />

            <TextFieldWithCount
              label="Short Name"
              required
              value={live.shortName}
              onChange={(v) => patch({ shortName: v })}
              message={messages.includes(MSG.shortName) ? MSG.shortName : undefined}
            />

            <TextFieldWithCount
              label="SPV Name"
              value={live.spvName}
              onChange={(v) => patch({ spvName: v })}
            />

            {spvLegalVisible && (
              <Field
                label="SPV Legal Structure"
                required={isSpvLegalStructureRequired(country?.name, live.spvName)}
                validationState={messages.includes(MSG.spvLegalStructure) ? "error" : "none"}
                validationMessage={messages.includes(MSG.spvLegalStructure) ? MSG.spvLegalStructure : undefined}
              >
                <Dropdown
                  value={live.spvLegalStructure ?? ""}
                  selectedOptions={live.spvLegalStructure ? [live.spvLegalStructure] : []}
                  onOptionSelect={(_, d) => patch({ spvLegalStructure: d.optionValue ?? null })}
                >
                  {LEGAL_STRUCTURE_OPTIONS.map((o) => <Option key={o} value={o}>{o}</Option>)}
                </Dropdown>
              </Field>
            )}

            <Field
              label="Technology" required
              validationState={messages.includes(MSG.technology) ? "error" : "none"}
              validationMessage={messages.includes(MSG.technology) ? MSG.technology : undefined}
            >
              <Dropdown
                value={live.technology ?? ""}
                selectedOptions={live.technology ? [live.technology] : []}
                onOptionSelect={(_, d) => patch({ technology: d.optionValue ?? null })}
              >
                {TECHNOLOGY_OPTIONS.map((t) => <Option key={t} value={t}>{t}</Option>)}
              </Dropdown>
            </Field>

            {/* Rule 2 — sub-technology exists only for Hybrid. */}
            {isSubTechnologyVisible(live.technology) && (
              <Field label="Sub-technology" hint="Hybrid projects only">
                <Input value="" disabled placeholder="Configured on the Generator screen" />
              </Field>
            )}

            <Field label="Project Type">
              <Combobox
                freeform
                value={live.projectType ?? ""}
                onOptionSelect={(_, d) => patch({ projectType: d.optionValue ?? null })}
                onInput={(e) => patch({ projectType: (e.target as HTMLInputElement).value || null })}
              >
                {projectTypeOptions.map((t) => <Option key={t} value={t}>{t}</Option>)}
              </Combobox>
            </Field>

            <PersonField
              label="Project Manager"
              required
              placeholder="Select for project manager"
              hint="Searched over Microsoft Entra IDs"
              message={messages.includes(MSG.manager) ? MSG.manager : undefined}
              rowId={live.managerEntraRowId}
              name={live.managerName}
              search={managerSearch}
              onSearchChange={setManagerSearch}
              results={managers.data ?? []}
              isFetching={managers.isFetching}
              onPick={(rowId, name) => { patch({ managerEntraRowId: rowId, managerName: name }); setManagerSearch(""); }}
              onClear={() => patch({ managerEntraRowId: null, managerName: null })}
            />

            <PersonField
              label="Deputy Project Manager"
              placeholder="Select for deputy project manager"
              rowId={live.deputyManagerEntraRowId}
              name={live.deputyManagerName}
              search={deputySearch}
              onSearchChange={setDeputySearch}
              results={deputies.data ?? []}
              isFetching={deputies.isFetching}
              onPick={(rowId, name) => { patch({ deputyManagerEntraRowId: rowId, deputyManagerName: name }); setDeputySearch(""); }}
              onClear={() => patch({ deputyManagerEntraRowId: null, deputyManagerName: null })}
            />

            <Field label="Development Type" required>
              <Dropdown
                value={DEV_TYPE_OPTIONS.find((o) => o.value === live.developmentType)?.label ?? ""}
                selectedOptions={live.developmentType !== null ? [String(live.developmentType)] : []}
                onOptionSelect={(_, d) =>
                  patch({ developmentType: d.optionValue ? Number(d.optionValue) : null })}
              >
                {DEV_TYPE_OPTIONS.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                ))}
              </Dropdown>
            </Field>

            {/* Rules 24 and 25 — the acquisition row exists only for an Acquired Project. */}
            {acquired && (
              <>
                {/* GUIDE q02: the three acquisition fields sit under their own labelled
                    sub-heading inside Basic Information, not loose among the other fields. */}
                <Divider alignContent="start" style={{ gridColumn: "1 / -1" }}>
                  Acquisition Information
                </Divider>

                <Field label="Start Cluster" required>
                  <Dropdown
                    value={CLUSTER_OPTIONS.find((o) => o.value === live.startCluster)?.label ?? ""}
                    selectedOptions={live.startCluster !== null ? [String(live.startCluster)] : []}
                    onOptionSelect={(_, d) =>
                      patch({ startCluster: d.optionValue ? Number(d.optionValue) : null })}
                  >
                    {CLUSTER_OPTIONS.map((o) => (
                      <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                    ))}
                  </Dropdown>
                </Field>

                <Field label="Acquisition Date" required>
                  <Input
                    type="date"
                    value={(live.acquisitionDate ?? "").slice(0, 10)}
                    onChange={(_, d) => patch({ acquisitionDate: d.value || null })}
                  />
                </Field>

                <NumericInput
                  // GUIDE q02: the unit lives inside the label, in square brackets.
                  label="Acquisition Price [EUR]" places={0} min={0} max={1_000_000_000}
                  required showGrouped rangeMessage={MSG.acquisitionPriceShape}
                  language={lang}
                  value={live.acquisitionPrice} onChange={(v) => patch({ acquisitionPrice: v })}
                />
              </>
            )}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════ Placement */}
        <Card title="Placement">
          <div className={s.placementLayout}>
            <div className={s.fields}>
              <Field
                label="Country" required
                validationState={messages.includes(MSG.country) ? "error" : "none"}
                validationMessage={messages.includes(MSG.country) ? MSG.country : undefined}
              >
                <Dropdown
                  disabled={countryMode === "view"}
                  value={country?.name ?? ""}
                  selectedOptions={live.countryId ? [live.countryId] : []}
                  onOptionSelect={(_, d) =>
                    patch({ ...onCountryChange(live), countryId: d.optionValue ?? null })}
                >
                  {options.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Dropdown>
              </Field>

              <Field
                label="Area/State/Province/Voivodeship" required={areaRequired}
                validationState={messages.includes(MSG.area) ? "error" : "none"}
                validationMessage={messages.includes(MSG.area) ? MSG.area : undefined}
              >
                <Dropdown
                  disabled={modes.area === "view" || areaOptions.length === 0}
                  value={selectedArea?.vsb_name ?? ""}
                  selectedOptions={live.areaId ? [live.areaId] : []}
                  onOptionSelect={(_, d) => patch({ areaId: d.optionValue ?? null })}
                >
                  {areaOptions.map((a) => (
                    <Option key={a.vsb_countryareaid} value={a.vsb_countryareaid}>{a.vsb_name}</Option>
                  ))}
                </Dropdown>
              </Field>

              <TextFieldWithCount
                label="District"
                value={live.district}
                onChange={(v) => patch({ district: v })}
              />

              {/* Rule 12 — three municipality modes. */}
              {muniMode === "text" ? (
                <TextFieldWithCount
                  label="Municipality"
                  value={live.municipality}
                  onChange={(v) => patch({ municipality: v })}
                />
              ) : (
                <Field
                  label="Municipality"
                  required
                  hint="Type 3 or more letters to Search"
                  validationState={
                    muniKind === "germany" && messages.includes(MSG.municipalityGermany) ? "error"
                    : muniKind === "france" && messages.includes(MSG.municipalityFrance) ? "error"
                    : "none"
                  }
                >
                  <Combobox
                    freeform
                    value={muniSearch}
                    placeholder={live.municipalityGermany ?? live.municipalityFrance ?? "Type 3 or more letters to Search"}
                    onInput={(e) => setMuniSearch((e.target as HTMLInputElement).value)}
                    onOptionSelect={(_, d) => {
                      const row = (municipalities.data ?? []).find((m) => m.uid === d.optionValue);
                      if (!row) return;
                      // Rule 13 — a German pick also sets the trade-tax rate.
                      patch(muniMode === "germany"
                        ? applyGermanMunicipality(row, lang)
                        : { municipalityFrance: row.municipality });
                    }}
                  >
                    {municipalities.isFetching && <Option value="">Searching…</Option>}
                    {(municipalities.data ?? []).map((m) => (
                      <Option key={m.uid} value={m.uid} text={m.municipality}>{m.municipality}</Option>
                    ))}
                  </Combobox>
                </Field>
              )}

              <NumericInput
                label="Tax Factor" unit="%" places={0} min={0} max={1000}
                rangeMessage={MSG.taxFactorRange} language={lang}
                value={live.taxFactor} onChange={(v) => patch({ taxFactor: v })}
              />

              <Field label="Terrain Utilization">
                <Dropdown
                  selectedOptions={live.utilizationId ? [live.utilizationId] : []}
                  onOptionSelect={(_, d) => patch({ utilizationId: d.optionValue ?? null })}
                >
                  {refData.utilizations.map((u) => (
                    <Option key={u.vsb_customchoicevalueid} value={u.vsb_customchoicevalueid}>
                      {u.vsb_name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              {terrainRequired && (
                <NumericInput
                  label="Terrain size" unit="ha" places={1} min={0.1} max={1000}
                  required rangeMessage={MSG.terrainRange}
                  language={lang}
                  value={live.terrainSize} onChange={(v) => patch({ terrainSize: v })}
                />
              )}

              <Field
                label="Latitude" required
                validationState={latMessage ? "error" : "none"}
                validationMessage={latMessage ?? undefined}
              >
                <Input value={live.latitude} onChange={(_, d) => patch({ latitude: d.value })} />
              </Field>

              <Field
                label="Longitude" required
                validationState={lngMessage ? "error" : "none"}
                validationMessage={lngMessage ?? undefined}
              >
                <Input value={live.longitude} onChange={(_, d) => patch({ longitude: d.value })} />
              </Field>
            </div>

            {/* Presentational and defensive — no coordinates means no pin, never a throw. */}
            <div className={s.mapPanel}>
              {hasPin ? (
                <>
                  <LocationRegular className={s.mapPin} aria-hidden="true" />
                  <Text className={s.mapCoords}>{marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}</Text>
                </>
              ) : (
                <Text className={s.mapEmpty}>Set Latitude and Longitude to place a pin.</Text>
              )}
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════ Shareholding Entity */}
        <Card title="Shareholding Entity">
          <div className={s.shareHead}>
            <Button
              appearance="transparent" icon={<AddRegular />}
              disabled={!canEdit && Boolean(projectId)}
              onClick={() => setDraft({
                key: nextShareholderKey(), entityTypeValue: null, customName: "", percent: "",
              })}
            >
              Add
            </Button>
            <Text className={s.shareSum} style={{ color: sum === 1 ? palette.Success : tokens.colorNeutralForeground3 }}>
              {formatWithSeparators(sum * 100, lang, 1)} % of 100 %
            </Text>
          </div>

          {/* GUIDE p13 — always-on guidance, not a validation error: Save is not blocked by it. */}
          <MessageBar intent="info">
            <MessageBarBody>{MSG.shareholdingSum}</MessageBarBody>
          </MessageBar>

          <div className={s.shareGrid}>
            <DataGrid
              rows={liveEntities}
              columns={entityColumns}
              rowKey={(r) => r.key}
              emptyMessage="No shareholding entity yet. At least one is required to save."
              caption="Entities are edited here and written to Dataverse only when the project is saved."
              footer={pendingDeletes.length > 0 ? (
                <Text size={200}>{pendingDeletes.length} deletion(s) pending save</Text>
              ) : undefined}
            />
          </div>
          {sumWarning && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{sumWarning}</Text>
          )}
        </Card>
      </div>

      {/* ─────────────────────────────────────────── shareholding panel */}
      <FormPanel
        open={draft !== null}
        title={draft?.recordId ? "Edit shareholding entity" : "Add shareholding entity"}
        onClose={() => setDraft(null)}
        onSave={() => {
          if (!draft) return;
          setEntities(applyShareholderDraft(liveEntities, draft, lang));
          setEntitiesDirty(true);
          setDraft(null);
        }}
        errors={draft ? shareholderPanelErrors(draft, liveEntities, lang) : []}
      >
        {draft && (
          <div className={s.panelFields}>
            <Field label="Entity type" required>
              <Dropdown
                selectedOptions={draft.entityTypeValue !== null ? [String(draft.entityTypeValue)] : []}
                onOptionSelect={(_, d) => setDraft({
                  ...draft, entityTypeValue: d.optionValue ? Number(d.optionValue) : null,
                })}
              >
                <Option value={String(CHOICE.shareholderEntityType.thirdParty)}>Third Party</Option>
                <Option value="952850000">VSB Group</Option>
                <Option value="952850001">Co-investor</Option>
              </Dropdown>
            </Field>

            {/* Rule 18 — Custom Name is required and stored only for Third Party. */}
            {isThirdParty(draft.entityTypeValue) && (
              <Field label="Custom name" required>
                <Input
                  value={draft.customName}
                  onChange={(_, d) => setDraft({ ...draft, customName: d.value })}
                />
              </Field>
            )}

            <NumericInput
              label="Ownership" unit="%" places={2}
              min={0.1} max={remainingPct(liveEntities, draft.key)}
              required language={lang}
              value={draft.percent}
              onChange={(v) => setDraft({ ...draft, percent: v })}
            />
            <Text size={200}>
              {/* Rule 17 — a new entity is capped by what is left. */}
              At most {formatWithSeparators(remainingPct(liveEntities, draft.key), lang, 2)} %
              is still unallocated. Stored as a fraction, rounded to four places.
            </Text>
          </div>
        )}
      </FormPanel>

      {/* ─────────────────────────────────── cluster-change milestone panel */}
      <FormPanel
        open={clusterPanel !== null}
        title={clusterPanel?.kind === "panel-downward"
          ? "New milestone dates required"
          : "Milestones will be deleted"}
        onClose={() => setClusterPanel(null)}
        saveLabel="Save and continue"
        onSave={() => clusterPanel && runSave({
          dates: clusterPanel.dates,
          newStartClusterNo: clusterPanel.newStartClusterNo,
        })}
        saveDisabled={!clusterPanel || !canSaveClusterPanel({
          dates: clusterPanel.dates,
          newStartClusterNo: clusterPanel.newStartClusterNo,
          isDownward: clusterPanel.kind === "panel-downward",
        })}
        busy={save.isPending}
      >
        {clusterPanel && (
          <div className={s.panelFields}>
            <MessageBar intent={clusterPanel.kind === "panel-upward" ? "warning" : "info"}>
              <MessageBarBody>
                {clusterPanel.kind === "panel-upward"
                  ? "Moving the start cluster forward deletes the milestone dates before it, together with their standard-assumption flags."
                  : "Moving the start cluster back needs the earlier milestone dates. They must be strictly increasing."}
              </MessageBarBody>
            </MessageBar>

            {clusterPanelVisibleFields(clusterPanel.newStartClusterNo).map((field) => {
              const errors = milestoneChainErrors(clusterPanel.dates, clusterPanel.newStartClusterNo);
              return (
                <Field
                  key={field}
                  label={PANEL_LABELS[field]}
                  required
                  validationState={errors[field] ? "error" : "none"}
                  validationMessage={errors[field]}
                >
                  <Input
                    type="date"
                    value={(clusterPanel.dates[field] ?? "").slice(0, 10)}
                    onChange={(_, d) => setClusterPanel({
                      ...clusterPanel,
                      dates: { ...clusterPanel.dates, [field]: d.value || null },
                    })}
                  />
                </Field>
              );
            })}
          </div>
        )}
      </FormPanel>

      <ConfirmDialog
        open={deleteTarget !== null}
        intent="danger"
        title="Delete this shareholding entity?"
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const res = planShareholderDelete(liveEntities, deleteTarget);
          setEntities(res.entities);
          setEntitiesDirty(true);
          // Rule 19 — the Dataverse delete only happens for a row that already exists.
          setPendingDeletes((d) => [
            ...d, ...res.writes.map((w) => w.id!).filter(Boolean),
          ]);
          setDeleteTarget(null);
        }}
      >
        <Text>
          Ownership no longer needs to total 100 % before saving, but you may want to
          re-allocate this entity's share once it is gone.
        </Text>
      </ConfirmDialog>

      {save.isPending && (
        <LoadingOverlay label="The project is being saved, please wait…" />
      )}
      {(managers.isFetching || deputies.isFetching) && (
        <Spinner size="tiny" aria-label="Searching people" />
      )}

      <RecordFooter
        onSave={() => runSave()}
        onCancel={resetForm}
        saveDisabled={!saveEnabled || save.isPending}
        busy={save.isPending}
        saveDisabledReason={!canEdit && projectId
          ? "You do not have permission to edit this project."
          : !isDirty ? "Nothing has changed yet."
          : messages[0] ?? "Fix the highlighted fields first."}
        createdBy={createdByText}
        modifiedBy={modifiedByText}
      />
    </>
  );
}
