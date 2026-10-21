/**
 * Admin Cost Screen — composition only (connected 19 Oct 2026, D24).
 *
 * Canvas screen: `Admin Cost Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml`:
 *
 *   cmp_Admin_ProjectGatest_Approvals_Header_1            page title "Costs"
 *   cmp_Admin_Costs_Assumption_NestedCountryPickerColumn  the country rail (Wind / PV)
 *   Label1                                                "Standard Assumptions / Costs / …"
 *   Gallery1 over colAdminCostCategories                  four cards, all folded at first
 *     DEVEX/CAPEX                                         `DevexSection` (grid + cost panel)
 *     Operation & Maintenance / Land Lease / Other OPEX   `OpexSection` (grid + period panel)
 *   cmp_PopUp_Loading_Admin_Cost                          the progress pop-up (`WriteFeedback`)
 *
 * Apply / Apply to All, their info texts and tags are not ported (D20). Every decision lives in
 * `rules.ts`; every query and write in `hooks.ts`.
 */
import { useMemo, useState } from "react";
import { Button, Text, mergeClasses } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import { EmptyState, LoadingOverlay, WriteFeedback } from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import {
  ADMIN_COST_LABELS as L, COST_CATEGORIES, MSG,
  buildCostPicker, costBreadcrumbText, costScopeFor, defaultCostScope, toggleCategoryCard,
  type CostScope,
} from "./rules";
import { useCostAccountChart, useCostCountries, useCostWrites } from "./hooks";
import { useCostStyles } from "./styles";
import { DevexSection } from "./DevexSection";
import { OpexSection } from "./OpexSection";

export default function AdminCostScreen() {
  const s = useCostStyles();
  const canEdit = useAdminAccess();
  const writes = useCostWrites();

  const countriesQ = useCostCountries();
  const chartQ = useCostAccountChart();
  const countries = countriesQ.data;
  const picker = useMemo(() => buildCostPicker(countries), [countries]);
  const [picked, setPicked] = useState<CostScope | null>(null);
  const scope = picked ?? defaultCostScope(countries);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const openCountry = expandedCountry ?? scope.countryId;

  /** `colAdminCostCategories.IsFolded` — every card starts folded. */
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  /** `locSelectedDevexCapexCategory` — the open DEVEX categories; the picker clears it. */
  const [devexOpen, setDevexOpen] = useState<Set<string>>(new Set());
  /** `'IsCollapsed?'` flips on the OPEX contracts, by subaccount. */
  const [collapsed, setCollapsed] = useState<Map<string, boolean>>(new Map());

  const loadError = [countriesQ, chartQ].some((q) => q.error);
  const loading = countriesQ.isLoading || chartQ.isLoading;

  return (
    <div className={s.page}>
      <Text as="h1" className={s.title}>{L.title}</Text>

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="admin-cost" />

      {loadError ? (
        <EmptyState title={MSG.loadFailedTitle} description={MSG.loadFailedDescription} />
      ) : loading ? (
        <LoadingOverlay mode="inline" label={MSG.loading} />
      ) : (
        <div className={s.layout}>
          {/* `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` */}
          <nav className={s.picker} data-testid="cmp_Admin_Costs_Assumption_NestedCountryPickerColumn">
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
                          data-testid={`admin-cost-technology-${country.key}-${child.value}`}
                          onClick={() => {
                            setPicked(costScopeFor(countries.find((c) => c.id === country.key) ?? null, child.value));
                            setDevexOpen(new Set());
                          }}
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
            <Text className={s.breadcrumb} data-testid="Label1">{costBreadcrumbText(scope)}</Text>

            {COST_CATEGORIES.map((row) => {
              const open = openCards.has(row.category);
              return (
                <section key={row.category} className={s.card} aria-label={row.category}>
                  <div className={s.cardHeader}>
                    <Text className={s.cardTitle} data-testid="Label1_2">{row.category}</Text>
                    {open ? (
                      <Button
                        appearance="transparent" icon={<ChevronUpRegular />}
                        aria-label={row.category} aria-expanded
                        data-testid="ico_Generators_DisplayProject_Body_Form_GeneratorType_Up_2"
                        onClick={() => setOpenCards((set) => toggleCategoryCard(set, row.category))}
                      />
                    ) : (
                      <Button
                        appearance="transparent" icon={<ChevronDownRegular />}
                        aria-label={row.category} aria-expanded={false}
                        data-testid="ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_2"
                        onClick={() => setOpenCards((set) => toggleCategoryCard(set, row.category))}
                      />
                    )}
                  </div>
                  {open ? (
                    <div className={s.cardBody}>
                      {row.family === "devex" ? (
                        <DevexSection
                          scope={scope} accounts={chartQ.data} canEdit={canEdit} writes={writes}
                          open={devexOpen} setOpen={setDevexOpen}
                        />
                      ) : (
                        <OpexSection
                          row={row} scope={scope} canEdit={canEdit} writes={writes}
                          collapsed={collapsed} setCollapsed={setCollapsed}
                        />
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
