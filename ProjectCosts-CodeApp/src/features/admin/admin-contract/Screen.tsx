/**
 * Admin Contract Screen — composition only (connected 19 Oct 2026, D23).
 *
 * Canvas screen: `Admin Contract Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml`:
 *
 *   cmp_Admin_Contracts_Header                    page title "Contracts"
 *   cmp_AdminContraacts_NestedCountryPickerColumn country rail (Wind / PV / BESS)
 *   con_AdminContract_Selected_Country_Technology scope heading + the two Add buttons
 *   gal_AdminContracts_StandardAssumptions_Updated contract cards (fold independently)
 *   con_AdminContracrt_RightPanel_NewEditContract the New / Edit panel
 *     left: fields                                Description, Closing Date Reference, Month
 *                                                 Difference, Margin, Comment
 *     right: DevCo Cost Form                      level-1 headers (accordion, tri-state) and
 *                                                 their level-3 accounts
 *   cmp_PopUp_Loading_AdminBoPContracts           the progress pop-up (`WriteFeedback`)
 *   cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1  delete confirmation
 *
 * Apply / Apply to All and their tracking labels are not ported (D20). The hidden
 * `btn_Add_Edit_AdminContracts_Reset` = rebuilding the panel form on open; the hidden
 * `btnGeneralPurposeReset` = the query invalidation after a write.
 *
 * Every decision lives in `rules.ts`; every query and write in `hooks.ts`.
 */
import { useMemo, useState } from "react";
import {
  Button, Checkbox, Dropdown, Input, Option, Text, Textarea, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ChevronDownRegular, ChevronUpRegular, DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import {
  Choices, ConfirmDialog, CostField, EmptyState, FormPanel, LoadingOverlay, PanelButtons,
  WriteFeedback,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import { palette, space, media } from "@/theme/tokens";
import {
  CLOSING_DATE_REFERENCE_OPTIONS, CONTRACT_SCREEN_TEXT as T, CONTRACT_TYPE_VALUE, MARGIN_OPTIONS,
  MARGIN_TYPE_OPTIONS, MSG,
  buildContractAccountTree, buildContractPicker, canSaveContract, cardMarginHeading,
  cardMarginText, cardMarginValue, cardShowsMarginDetails, changeMargin, changeMarginType,
  classifyAccounts, closingDateLabelVisible, contractCapReached, contractTypeLabel,
  defaultContractScope, devCoFormGroups, emptyContractForm, groupCostsForCard, leafChecked,
  marginCurrency, marginFixedValueError, marginPercentageError, monthDifferenceErrorVisible,
  nextExpandedId, openCardAfterSave, optionLabel, parentToggleEnabled, parentTriState,
  planDeleteContract, planSaveContract, scopeFor, selectedAccountCount, sortContracts,
  toContractForm, toggleAccount, toggleCard, toggleParent,
  type AccountSelection, type BopContract, type BopContractType, type ContractForm,
  type ContractScope, type TriState,
} from "./rules";
import {
  useBopContracts, useContractAccountTree, useContractCountries, useContractWrites, useDevCoCosts,
} from "./hooks";

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", rowGap: space.m, minWidth: 0,
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontSize: "20px", lineHeight: "28px", fontWeight: tokens.fontWeightSemibold },
  layout: {
    display: "flex", columnGap: space.l, rowGap: space.l, minWidth: 0,
    [media.belowMd]: { flexDirection: "column" },
  },
  picker: {
    width: "220px", flexShrink: 0, display: "flex", flexDirection: "column",
    borderRightWidth: "1px", borderRightStyle: "solid", borderRightColor: palette.neutralLight,
    [media.belowMd]: { width: "auto", borderRightWidth: "0px" },
  },
  pickerCountry: { justifyContent: "flex-start", fontWeight: tokens.fontWeightSemibold },
  pickerTech: { paddingLeft: space.xl },
  pickerSelected: { backgroundColor: palette.neutralLight },
  content: { display: "flex", flexDirection: "column", rowGap: space.m, flexGrow: 1, minWidth: 0 },
  scopeBar: { display: "flex", alignItems: "center", columnGap: space.m, rowGap: space.s, flexWrap: "wrap" },
  scopeHeading: { fontSize: "16px", fontWeight: tokens.fontWeightSemibold },
  addButton: {
    color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
  },
  cards: { display: "flex", flexDirection: "column", rowGap: space.s },
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
    paddingLeft: space.m, paddingRight: space.s,
  },
  cardTitle: { flexGrow: 1, minWidth: 0, fontWeight: tokens.fontWeightSemibold },
  cardBody: {
    display: "flex", flexDirection: "column", rowGap: space.m,
    paddingLeft: space.m, paddingRight: space.m, paddingBottom: space.m, paddingTop: space.s,
    borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: palette.neutralQuaternaryAlt,
  },
  actions: { display: "flex", alignItems: "center", columnGap: space.s, flexWrap: "wrap" },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: space.l, rowGap: space.s,
    [media.belowSm]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  heading: { color: palette.neutralTertiary, fontSize: tokens.fontSizeBase200 },
  value: { display: "block" },
  group: { display: "flex", alignItems: "baseline", columnGap: "10px", marginBottom: "12px", flexWrap: "wrap" },
  groupHeading: { fontSize: "14px", fontWeight: tokens.fontWeightSemibold, color: palette.neutralTertiary },
  tags: { display: "flex", flexWrap: "wrap", columnGap: space.s, rowGap: space.s },
  tag: {
    paddingTop: "4px", paddingBottom: "4px", paddingLeft: "12px", paddingRight: "12px",
    fontSize: "13px", fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap",
    borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
    borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px",
    backgroundColor: "#EDEBE9", color: "#323130",
  },
  panelColumns: {
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: space.xl, rowGap: space.l,
    [media.belowMd]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panelColumn: { display: "flex", flexDirection: "column", rowGap: space.l, minWidth: 0 },
  monthRow: { display: "flex", columnGap: space.s },
  sign: { width: "100px", minWidth: "0px" },
  devCoCard: {
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.neutralLight,
    borderLeftWidth: "4px", borderLeftStyle: "solid", borderLeftColor: "transparent",
  },
  devCoCardSelected: { borderLeftColor: palette.akzent1 },
  devCoHeader: { display: "flex", alignItems: "center", columnGap: space.xs },
  devCoRows: { display: "flex", flexDirection: "column", paddingLeft: space.xl },
  usedRow: { color: palette.Warning },
});

type Panel = {
  contractType: number | null;
  existing: BopContract | null;
  before: Map<string, AccountSelection>;
};

/** `img_Parent_TriState_Checkbox.Image` — the four canvas SVGs. */
function TriStateIcon({ state }: { state: TriState }) {
  const tick = <path d="M6 12 L10 16 L18 8" stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {state === "LOCKED" ? <><rect x="1" y="1" width="22" height="22" rx="2" ry="2" fill="#C8C6C4" />{tick}</> : null}
      {state === "UNCHECKED" ? <rect x="1" y="1" width="22" height="22" rx="2" ry="2" fill="none" stroke="#605E5C" strokeWidth="1.5" /> : null}
      {state === "CHECKED" ? <><rect x="1" y="1" width="22" height="22" rx="2" ry="2" fill="#0078D4" />{tick}</> : null}
      {state === "PARTIAL" ? (
        <>
          <rect x="1" y="1" width="22" height="22" rx="2" ry="2" fill="#0078D4" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

/** The canvas delete has no error text; the failure detail is shown as is. */
const plainError = (detail: string): string => detail;

export default function AdminContractScreen() {
  const s = useStyles();
  const canEdit = useAdminAccess();
  const writes = useContractWrites();

  const countriesQ = useContractCountries();
  const accountsQ = useContractAccountTree();
  const countries = countriesQ.data;
  const picker = useMemo(() => buildContractPicker(countries), [countries]);
  const [picked, setPicked] = useState<ContractScope | null>(null);
  const scope = picked ?? defaultContractScope(countries);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const openCountry = expandedCountry ?? scope.countryId;

  const contractsQ = useBopContracts(scope);
  const contracts = useMemo(() => sortContracts(contractsQ.data), [contractsQ.data]);
  const contractIds = useMemo(() => contracts.map((c) => c.id), [contracts]);
  const costsQ = useDevCoCosts(contractIds);
  const costs = costsQ.data;

  const tree = useMemo(() => buildContractAccountTree(accountsQ.data), [accountsQ.data]);
  const groups = useMemo(() => devCoFormGroups(tree), [tree]);
  const accountNames = useMemo(() => new Map(accountsQ.data.map((a) => [a.id, a.name])), [accountsQ.data]);
  const accountName = (id: string | null) => (id ? accountNames.get(id) ?? "" : "");

  const loadError = [countriesQ, accountsQ, contractsQ, costsQ].some((q) => q.error);
  const loading = countriesQ.isLoading || accountsQ.isLoading;
  const scopeChosen = scope.countryId !== null && scope.technology !== null;

  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState<ContractForm>(emptyContractForm());
  const [after, setAfter] = useState<Map<string, AccountSelection>>(new Map());
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BopContract | null>(null);

  const openPanel = (contractType: number | null, existing: BopContract | null) => {
    const before = classifyAccounts(tree, costs, existing?.id ?? null);
    writes.clear();
    setPanel({ contractType, existing, before });
    setForm(toContractForm(existing));
    setAfter(before);
    setExpandedNode(null);
  };
  const closePanel = () => setPanel(null);

  const addEnabled = (type: BopContractType) =>
    canEdit && scopeChosen && !contractsQ.isLoading && !contractCapReached(contracts, scope, type);

  const isEdit = panel?.existing != null;
  const selectedCount = selectedAccountCount(after);
  const update = (patch: Partial<ContractForm>) => setForm((f) => ({ ...f, ...patch, dirty: true }));
  const markChanged = () => setForm((f) => ({ ...f, dirty: true }));

  const isPct = form.marginType === CHOICE_ADMIN.contractMarginType.percentage;
  const isFixed = form.marginType === CHOICE_ADMIN.contractMarginType.fixedValue;
  const monthError = monthDifferenceErrorVisible(form.months) ? MSG.monthDifference : undefined;
  const pctError = marginPercentageError(form.marginPercentage) ?? undefined;
  const fixedError = marginFixedValueError(form.marginFixedValue) ?? undefined;
  const panelCurrency = marginCurrency(scope.countryName);

  const save = async () => {
    if (!panel) return;
    const plan = planSaveContract({
      form, contractType: panel.contractType, scope, existing: panel.existing,
      before: panel.before, after, tree, canEdit,
    });
    const existingId = panel.existing?.id ?? null;
    closePanel();
    const created = await writes.run({ progress: MSG.saving, plan });
    const savedId = existingId ?? created?.[0] ?? null;
    if (created && savedId) setOpenCards((open) => openCardAfterSave(open, savedId));
  };

  const confirmDelete = async () => {
    const contract = toDelete;
    setToDelete(null);
    if (!contract) return;
    await writes.run({
      progress: MSG.deleting, errorText: plainError,
      plan: planDeleteContract({ contract, canEdit }),
    });
  };

  return (
    <div className={s.page}>
      <Text as="h1" className={s.title}>{T.title}</Text>

      <WriteFeedback
        progress={writes.progress} error={writes.error} success={writes.success}
        testIdPrefix="admin-contract"
      />

      {loadError ? (
        <EmptyState title={MSG.loadFailedTitle} description={MSG.loadFailedDescription} />
      ) : loading ? (
        <LoadingOverlay mode="inline" label={MSG.loading} />
      ) : (
        <div className={s.layout}>
          {/* `cmp_AdminContraacts_NestedCountryPickerColumn` — countries, each nesting Wind / PV / BESS. */}
          <nav className={s.picker} data-testid="cmp_AdminContraacts_NestedCountryPickerColumn">
            {picker.countries.map((country) => {
              const open = openCountry === country.key;
              const childs = picker.nestings.find((n) => n.country === country.name)?.childs ?? [];
              return (
                <div key={country.key}>
                  <Button
                    appearance="transparent"
                    className={s.pickerCountry}
                    icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    iconPosition="after"
                    aria-label={country.name}
                    aria-expanded={open}
                    data-testid={`cbx_CountrySelected-${country.key}`}
                    onClick={() => setExpandedCountry(open ? "" : country.key)}
                  >
                    {country.name}
                  </Button>
                  {open ? childs.map((child) => {
                    const selected = scope.countryId === country.key && scope.technology === child.value;
                    return (
                      <div key={child.value} className={s.pickerTech}>
                        <Button
                          appearance="transparent"
                          className={mergeClasses(selected && s.pickerSelected)}
                          aria-label={child.value}
                          aria-pressed={selected}
                          data-testid={`admin-contract-technology-${country.key}-${child.value}`}
                          onClick={() => setPicked(scopeFor(
                            countries.find((c) => c.id === country.key) ?? null, child.value,
                          ))}
                        >
                          {child.value}
                        </Button>
                      </div>
                    );
                  }) : null}
                </div>
              );
            })}
          </nav>

          <div className={s.content}>
            {/* `con_AdminContract_Selected_Country_Technology` — heading and the two Add buttons. */}
            <div className={s.scopeBar}>
              {scopeChosen ? (
                <Text className={s.scopeHeading} data-testid="lbl_AdminContract_Selected_Country_Technology">
                  {T.scopeHeading(scope.countryName ?? "", scope.technology ?? "")}
                </Text>
              ) : null}
              <Button
                appearance="outline" className={s.addButton} icon={<AddRegular />}
                aria-label={T.addDevelopment}
                data-testid="btn_AdminContract_Add_Development_Contract"
                disabled={!addEnabled("development")}
                onClick={() => openPanel(CONTRACT_TYPE_VALUE.development, null)}
              >
                {T.addDevelopment}
              </Button>
              <Button
                appearance="outline" className={s.addButton} icon={<AddRegular />}
                aria-label={T.addConstruction}
                data-testid="btn_AdminContract_Add_Construction_Contract"
                disabled={!addEnabled("construction")}
                onClick={() => openPanel(CONTRACT_TYPE_VALUE.construction, null)}
              >
                {T.addConstruction}
              </Button>
            </div>

            {contractsQ.isLoading ? <LoadingOverlay mode="inline" label={MSG.loading} /> : null}

            <div className={s.cards} data-testid="gal_AdminContracts_StandardAssumptions_Updated">
              {contracts.map((c) => {
                const open = openCards.has(c.id);
                const name = c.name ?? "";
                const showMargin = cardShowsMarginDetails(c);
                return (
                  <section key={c.id} className={s.card} data-testid="con_Card_Root">
                    <div className={s.cardHeader}>
                      <Text className={s.cardTitle} data-testid="lbl_Title">{name}</Text>
                      <Button
                        appearance="transparent"
                        icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                        aria-label={name}
                        aria-expanded={open}
                        data-testid="ico_Chevron_Expand_Collapse_AdminContracrs"
                        onClick={() => setOpenCards((set) => toggleCard(set, c.id))}
                      />
                    </div>
                    {open ? (
                      <div className={s.cardBody}>
                        <div className={s.actions}>
                          <Button appearance="outline" icon={<EditRegular />} aria-label={T.edit}
                            data-testid="btn_Edit_AdminContracts" disabled={!canEdit}
                            onClick={() => openPanel(c.contractType, c)}>{T.edit}</Button>
                          <Button appearance="outline" icon={<DeleteRegular />} aria-label={T.delete}
                            data-testid="btn_Delete_AdminContracts" disabled={!canEdit}
                            onClick={() => setToDelete(c)}>{T.delete}</Button>
                        </div>
                        <div className={s.grid} data-testid="con_Info_Grid1">
                          <div>
                            <Text className={s.heading}>{T.description}</Text>
                            <Text className={s.value}>{c.description ?? ""}</Text>
                          </div>
                          <div>
                            <Text className={s.heading}>{T.closingDateReference}</Text>
                            <Text className={s.value}>
                              {T.closingDateValue(
                                optionLabel(CLOSING_DATE_REFERENCE_OPTIONS, c.closingDateReference),
                                c.monthDifference ?? 0,
                              )}
                            </Text>
                          </div>
                          <div />
                        </div>
                        <div className={s.grid} data-testid="con_Info_Grid2">
                          <div>
                            <Text className={s.heading}>{T.margin}</Text>
                            <Text className={s.value}>{cardMarginText(c)}</Text>
                          </div>
                          {showMargin ? (
                            <div>
                              <Text className={s.heading}>{T.marginType}</Text>
                              <Text className={s.value}>{optionLabel(MARGIN_TYPE_OPTIONS, c.marginType)}</Text>
                            </div>
                          ) : null}
                          {showMargin ? (
                            <div>
                              <Text className={s.heading}>{cardMarginHeading(c, scope.isoCurrencyCode)}</Text>
                              <Text className={s.value}>{cardMarginValue(c)}</Text>
                            </div>
                          ) : null}
                        </div>
                        <div data-testid="con_DevCoCost_Section">
                          <Text className={s.heading}>{T.devCoCostsFrom}</Text>
                          {groupCostsForCard(costs, c.id, accountName).map((group) => (
                            <div key={group.rootAccountName} className={s.group}>
                              <span className={s.groupHeading}>{T.devCoGroupHeading(group.rootAccountName)}</span>
                              <div className={s.tags}>
                                {group.subaccounts.map((sub) => (
                                  <span key={sub.id} className={s.tag}>{sub.label}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div data-testid="con_Footer_Comment_Section">
                          <Text className={s.heading}>{T.comments}</Text>
                          <Text className={s.value}>{c.comment ? c.comment : T.blankComment}</Text>
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* `con_AdminContracrt_RightPanel_NewEditContract` */}
      <FormPanel
        open={panel !== null}
        title={panel ? T.panelTitle(isEdit, contractTypeLabel(panel.contractType)) : ""}
        width="wide"
        onDismiss={closePanel}
        closeTestId="ico_Add_Edit_AdminContracts_Close"
        footer={
          <PanelButtons
            onSave={() => { void save(); }}
            onCancel={closePanel}
            disabled={!canSaveContract(form, { selectedCount, isEdit, canEdit })}
            saveTestId="ico_AdminContracts_Save"
            cancelTestId="ico_AdminContracts_Cancel"
          />
        }
      >
        <div className={s.panelColumns}>
          <div className={s.panelColumn}>
            <CostField label={T.description} required>
              <Input
                aria-label={T.description}
                data-testid="txt_Add_Edit_AdminContracts_Description"
                value={form.description}
                maxLength={T.descriptionMax}
                onChange={(_, d) => update({ description: d.value })}
              />
            </CostField>
            <Choices
              label={T.closingDateReference}
              name="rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate"
              required
              value={optionLabel(CLOSING_DATE_REFERENCE_OPTIONS, form.closingDateReference)}
              options={CLOSING_DATE_REFERENCE_OPTIONS.map((o) => o.label)}
              onChange={(label) => update({
                closingDateReference: CLOSING_DATE_REFERENCE_OPTIONS.find((o) => o.label === label)?.value ?? null,
              })}
            />
            {closingDateLabelVisible(isEdit, form.closingDateReference) ? (
              <span className="canvas-field-error" role="alert">{MSG.closingDateEmpty}</span>
            ) : null}
            <CostField label={T.monthDifference} required error={monthError}>
              <span className={s.monthRow}>
                <Dropdown
                  className={s.sign}
                  aria-label={T.monthDifference}
                  data-testid="drp_Add_Edit_AdminContracts_MonthDifference_AddSub"
                  value={form.monthSign === "−" ? "-" : "+"}
                  selectedOptions={[form.monthSign === "−" ? "-" : "+"]}
                  onOptionSelect={(_, d) => update({ monthSign: d.optionValue === "-" ? "−" : "+" })}
                >
                  {T.monthSigns.map((sign) => <Option key={sign} value={sign}>{sign}</Option>)}
                </Dropdown>
                <Input
                  aria-label={T.monthDifference}
                  data-testid="txt_Add_Edit_AdminContracts_MonthDifference_Month"
                  value={form.months}
                  onChange={(_, d) => update({ months: d.value })}
                />
              </span>
            </CostField>
            <Choices
              label={T.margin}
              name="rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin"
              required
              value={form.margin ? MARGIN_OPTIONS.yes : MARGIN_OPTIONS.no}
              options={[MARGIN_OPTIONS.yes, MARGIN_OPTIONS.no]}
              onChange={(v) => setForm((f) => changeMargin(f, v === MARGIN_OPTIONS.yes))}
            />
            {form.margin ? (
              <Choices
                label=""
                name="rad_AddEdit_AdminContracts_RightPanel_MarginType"
                value={optionLabel(MARGIN_TYPE_OPTIONS, form.marginType)}
                options={MARGIN_TYPE_OPTIONS.map((o) => o.label)}
                onChange={(label) => setForm((f) => changeMarginType(
                  f, MARGIN_TYPE_OPTIONS.find((o) => o.label === label)?.value ?? null,
                ))}
              />
            ) : null}
            {form.margin && isPct ? (
              <CostField label={T.marginPercentage} required error={pctError}>
                <Input
                  aria-label={T.marginPercentage}
                  data-testid="txt_Add_Edit_AdminContracts_MarginPercentage"
                  value={form.marginPercentage}
                  maxLength={T.marginMax}
                  onChange={(_, d) => update({ marginPercentage: d.value })}
                />
              </CostField>
            ) : null}
            {form.margin && isFixed ? (
              <CostField label={T.marginFixedValue(panelCurrency)} required error={fixedError}>
                <Input
                  aria-label={T.marginFixedValue(panelCurrency)}
                  data-testid="txt_Add_Edit_AdminContracts_MarginFixedValue"
                  value={form.marginFixedValue}
                  maxLength={T.marginMax}
                  onChange={(_, d) => update({ marginFixedValue: d.value })}
                />
              </CostField>
            ) : null}
            <CostField label={T.comment} counter={`${form.comment.trim().length}/${T.commentMax}`}>
              <Textarea
                aria-label={T.comment}
                data-testid="txt_Add_Edit_AdminContracts_Comments"
                value={form.comment}
                maxLength={T.commentMax}
                onChange={(_, d) => update({ comment: d.value })}
              />
            </CostField>
          </div>

          <div className={s.panelColumn}>
            <div className="canvas-field">
              <span data-required="true">{T.devCoCostForm}</span>
            </div>
            <div data-testid="gal_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm">
              {groups.map(({ category, leaves }) => {
                const children = leaves
                  .map((l) => after.get(l.id))
                  .filter((x): x is AccountSelection => x !== undefined);
                const state = parentTriState(children);
                const open = expandedNode === category.id;
                const label = `${category.number} ${category.name}`;
                const triStateOn = state === "CHECKED" ? "true" : state === "PARTIAL" ? "mixed" : "false";
                return (
                  <div key={category.id} className={mergeClasses(s.devCoCard, open && s.devCoCardSelected)}>
                    <div className={s.devCoHeader}>
                      <Button
                        appearance="transparent"
                        role="checkbox"
                        aria-checked={triStateOn}
                        aria-label={label}
                        data-testid="img_Parent_TriState_Checkbox"
                        icon={<TriStateIcon state={state} />}
                        disabled={!parentToggleEnabled(children)}
                        onClick={() => {
                          const next = new Map(after);
                          for (const c of toggleParent(children)) next.set(c.accountId, c);
                          setAfter(next);
                          markChanged();
                        }}
                      />
                      <Button
                        appearance="transparent"
                        icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                        iconPosition="after"
                        aria-label={label}
                        aria-expanded={open}
                        data-testid={`btn_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Transparent-${category.id}`}
                        onClick={() => setExpandedNode(nextExpandedId(expandedNode, category.id))}
                      >
                        {label}
                      </Button>
                    </div>
                    {open ? (
                      <div className={s.devCoRows}>
                        {leaves.map((leaf) => {
                          const sel = after.get(leaf.id);
                          const leafLabel = `${leaf.number} ${leaf.name}`;
                          return (
                            <Checkbox
                              key={leaf.id}
                              className={mergeClasses(sel?.used && s.usedRow)}
                              label={leafLabel}
                              aria-label={leafLabel}
                              data-testid="chb_Contracts_RightPanel_NewEdit_CostssRow"
                              value={leaf.id}
                              checked={leafChecked(sel)}
                              disabled={sel === undefined || sel.used}
                              onChange={() => {
                                setAfter(toggleAccount(after, leaf.id));
                                markChanged();
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={toDelete !== null}
        title={T.deleteTitle}
        description={T.deleteDescription(toDelete?.name ?? "")}
        confirmText={T.confirm}
        cancelText={T.cancel}
        confirmIcon="delete"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
