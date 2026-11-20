/**
 * Project Generators Screen — the WTG type gallery (D143, split out of `Screen.tsx`; the rows are the screen's former `wtgRows`
 * verbatim). Memoized: it re-renders only when the WTG data, the selection / folding of WTG cards, the page of a card or the
 * enabled state change, not when another family's query lands.
 *
 * An expanded card with a long turbine list carries `content-visibility: auto` (`cardLongList` in `styles.ts`, item 8a), so it
 * paints only near the viewport, with no windowing code: focus, keyboard navigation and the `data-testid` queries are unchanged.
 */
import { memo } from "react";
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip, mergeClasses } from "@fluentui/react-components";
import {
  ArrowLeftRegular, ArrowPreviousRegular, ArrowRightRegular, DeleteRegular, EditRegular, InfoRegular,
} from "@fluentui/react-icons";
import { CommandBar } from "@/components";
import {
  GENERATORS_PAGE_SIZE, PAGER_TOOLTIPS, TURBINE_TABLE_LABELS, TYPE_DETAIL_FIELD_LABELS, WTG_CARD_LABELS,
  canAddGenerator, fmtCapacity, fmtHeight, generatorsTotalRowsText, overHeightLimit, pageCount, pagerVisible, paginationText,
  statusLabel, wtgCardValues,
  type CatalogModel, type GeneratorTypeRow, type PermissionFamily, type PlantFamily, type ProjectPlanning, type SimpleTypeRow,
  type TurbineRow,
} from "../rules";
import { Gallery, CardTitle, FoldButton, type GalleryRow } from "./Gallery";
import { isLongTurbineList } from "./longList";
import { probeRender } from "./renderProbe";
import { SELECT_DOT, isActive } from "./state";
import { useStyles } from "./styles";

/** The 2 x 4 detail grid's captions (the canvas order, row by row). */
const WTG_COLUMNS: readonly (string | null)[] = [
  TYPE_DETAIL_FIELD_LABELS.supplier, TYPE_DETAIL_FIELD_LABELS.totalHeight,
  TYPE_DETAIL_FIELD_LABELS.numberOfGenerators, null,
  TYPE_DETAIL_FIELD_LABELS.hubHeight, TYPE_DETAIL_FIELD_LABELS.rotorDiameter,
  TYPE_DETAIL_FIELD_LABELS.heightLimitation, TYPE_DETAIL_FIELD_LABELS.generatorsCapacity,
];

export interface WtgSectionProps {
  types: readonly GeneratorTypeRow[];
  turbinesByType: ReadonlyMap<string, TurbineRow[]>;
  models: ReadonlyMap<string, CatalogModel>;
  planning: ProjectPlanning | null;
  lang: string;
  /** `editable`: the page is not locked. */
  editable: boolean;
  /** The screen's `actionsOpen`: writes and panels may start. */
  actionsOpen: boolean;
  /** `writes.refreshing`. */
  refreshing: boolean;
  /** The selected WTG type's id, or null. */
  selectedId: string | null;
  /** The ids of the WTG cards that are expanded (a stable subset of the screen's folding state). */
  expandedIds: ReadonlySet<string>;
  /** The page shown per type (1-based); a missing id is page 1. */
  pages: Readonly<Record<string, number>>;
  onPage: (typeId: string, page: number) => void;
  onRowClick: (family: PlantFamily, id: string) => void;
  onFold: (family: PlantFamily, id: string) => void;
  onCancelRequest: (family: PermissionFamily, row: GeneratorTypeRow | SimpleTypeRow) => void;
  /** Add Generator (turbine null) or the edit icon of a row. */
  onOpenTurbine: (type: GeneratorTypeRow, turbine: TurbineRow | null) => void;
  /** The delete icon of a turbine row. */
  onDeleteTurbine: (type: GeneratorTypeRow, turbine: TurbineRow) => void;
}

function WtgSectionView({
  types, turbinesByType, models, planning, lang, editable, actionsOpen, refreshing, selectedId, expandedIds, pages, onPage,
  onRowClick, onFold, onCancelRequest, onOpenTurbine, onDeleteTurbine,
}: WtgSectionProps) {
  probeRender("wtg");
  const s = useStyles();
  const modelOf = (t: GeneratorTypeRow): CatalogModel | null => (t.generatorId ? models.get(t.generatorId) ?? null : null);
  const wtgRows: GalleryRow[] = types.map((type) => {
    const model = modelOf(type);
    const label = model?.turbineType ?? type.generatorDisplayName ?? type.name ?? "";
    const rows = turbinesByType.get(type.id) ?? [];
    const isOpen = expandedIds.has(type.id);
    // F9 / GR-5: the pager counts the LOADED turbines, not the stored `Number of Generators` (DIVERGENCE: D121 §8).
    const pageTotal = pageCount(rows.length, GENERATORS_PAGE_SIZE);
    const page = Math.min(pages[type.id] ?? 1, Math.max(pageTotal, 1));
    const pageRows = rows.slice((page - 1) * GENERATORS_PAGE_SIZE, page * GENERATORS_PAGE_SIZE);
    const addEnabled = canAddGenerator(rows.length, type.status);
    const setPage = (p: number) => onPage(type.id, p);
    const v = wtgCardValues({ model, type, firstTurbine: rows[0] ?? null, planning, lang });
    return {
      id: type.id,
      selected: selectedId === type.id,
      onSelect: () => onRowClick("wtg", type.id),
      fold: <FoldButton family="wtg" id={type.id} open={isOpen} editable={editable} onFold={onFold} />,
      open: isOpen,
      longList: isOpen && isLongTurbineList(pageRows.length),
      title: (
        <Tooltip relationship="description" withArrow content={model?.displayName ?? ""}>
          <span data-testid="txt_Generators_DisplayProject_Body_Form_GeneratorType">
            <CardTitle family="wtg" label={label} row={type} refreshing={refreshing} onCancelRequest={onCancelRequest} extra={(
              rows.some((r) => overHeightLimit(planning, r.totalHeight))
                ? <span className={mergeClasses(s.chip, s.heightTag, isActive(type.status) && s.heightTagActive)}>{WTG_CARD_LABELS.heightLimitationTag}</span>
                : null
            )} trailing={(
              <span className={mergeClasses(s.chip, s.chipStatus, isActive(type.status) && s.chipActive)} data-testid="lbl_Generator_GeneratorStatus">{statusLabel(type.status)}</span>
            )} />
          </span>
        </Tooltip>
      ),
      // The canvas card's 2 × 4 grid, row by row: Supplier · Total Height · Number of Generators ·
      // (empty) / Hub Height · Rotor Diameter · Height Limitation · Generators Capacity.
      cells: isOpen
        ? [v.supplier, v.totalHeight, v.numberOfGenerators, null, v.hubHeight, v.rotorDiameter, v.heightLimitation, v.generatorsCapacity]
        : ["", "", "", null, "", "", "", ""],
      // `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar` sits at the
      // TOP-LEFT of the expanded card, above the details (canvas / live screen).
      before: !isOpen ? undefined : (
        <div className={s.cardCommandBar}>
          <CommandBar
            ariaLabel={WTG_CARD_LABELS.addGeneratorBarLabel}
            commands={[{
              key: "addGenerator", label: WTG_CARD_LABELS.addGenerator, icon: "Add",
              enabled: actionsOpen && addEnabled,
            }]}
            onCommand={() => onOpenTurbine(type, null)}
          />
        </div>
      ),
      expanded: !isOpen ? undefined : (
        <div className={s.expanded}>
          {!addEnabled ? (
            <span className={s.title}>
              <Text className={s.warning}>{WTG_CARD_LABELS.addGeneratorWarning}</Text>
              <Tooltip relationship="description" content={WTG_CARD_LABELS.addGeneratorWarning}>
                <Button
                  appearance="transparent" size="small" icon={<InfoRegular />}
                  aria-label="ibut_GeneralData_DisplayProject_Body_Checklist"
                  data-testid={`ibut_GeneralData_DisplayProject_Body_Checklist-${type.id}`}
                />
              </Tooltip>
            </span>
          ) : null}
          {pagerVisible(rows.length) ? (
            <div className={s.pager}>
              <span className={s.pagerTotalRows}>{generatorsTotalRowsText(rows.length)}</span>
              {/* MDL2 `Previous` / `Back` / `Forward` → Fluent ArrowPrevious / ArrowLeft / ArrowRight, as on the Project list. */}
              <Button
                appearance="primary" className={s.pagerButton} icon={<ArrowPreviousRegular />} title={PAGER_TOOLTIPS.first}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_FirstPage"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_FirstPage-${type.id}`}
                disabled={page <= 1} onClick={() => setPage(1)}
              />
              <Button
                appearance="primary" className={s.pagerButton} icon={<ArrowLeftRegular />} title={PAGER_TOOLTIPS.previous}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageLeft"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageLeft-${type.id}`}
                disabled={page <= 1} onClick={() => setPage(page - 1)}
              />
              <span className={s.pagerPage}>{paginationText(page, pageTotal)}</span>
              <Button
                appearance="primary" className={s.pagerButton} icon={<ArrowRightRegular />} title={PAGER_TOOLTIPS.next}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageRight"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageRight-${type.id}`}
                disabled={page >= pageTotal} onClick={() => setPage(page + 1)}
              />
            </div>
          ) : null}
          <div
            className={s.turbineScroll}
            // The canvas box: `min(rows, PageSize) * 35 + 50`.
            style={{ maxHeight: `${Math.min(pageRows.length, GENERATORS_PAGE_SIZE) * 35 + 50}px` }}
            data-testid={`generators-turbine-scroll-${type.id}`}
          >
          <Table
            size="small" aria-label={WTG_CARD_LABELS.turbineGrid} className={s.turbineTable}
            data-testid="pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList"
          >
            <TableHeader>
              <TableRow className={s.turbineHeadRow}>
                {/* As the canvas (28 Oct 2026): the name and the icon columns have no header
                    (`ColDisplayName: ""`); the PO's "Generator Name" / "Actions" captions are withdrawn. */}
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColName)}>{WTG_CARD_LABELS.turbineNameColumn}</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColHeight)}>{TURBINE_TABLE_LABELS.totalHeight}</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColCapacity)}>{TURBINE_TABLE_LABELS.effectiveCapacity}</TableHeaderCell>
                <TableHeaderCell className={s.turbineColIcon} aria-label={WTG_CARD_LABELS.editIconColumn} />
                <TableHeaderCell className={s.turbineColIcon} aria-label={WTG_CARD_LABELS.deleteIconColumn} />
                <TableHeaderCell className={s.turbineColIcon} aria-label={WTG_CARD_LABELS.infoIconColumn} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((t) => (
                <TableRow key={t.id} className={s.turbineRow}>
                  <TableCell>{t.name ?? ""}</TableCell>
                  <TableCell>{fmtHeight(t.totalHeight, lang)}</TableCell>
                  <TableCell>{fmtCapacity(t.effectiveCapacity, lang)}</TableCell>
                  <TableCell>
                    <Button
                      appearance="subtle" size="small" icon={<EditRegular />}
                      aria-label={WTG_CARD_LABELS.editIconColumn}
                      data-testid={`generators-turbine-edit-${t.id}`}
                      disabled={!actionsOpen || !isActive(type.status)}
                      onClick={() => onOpenTurbine(type, t)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      appearance="subtle" size="small" icon={<DeleteRegular />}
                      aria-label={WTG_CARD_LABELS.deleteIconColumn}
                      data-testid={`generators-turbine-delete-${t.id}`}
                      disabled={!actionsOpen || !isActive(type.status)}
                      onClick={() => onDeleteTurbine(type, t)}
                    />
                  </TableCell>
                  <TableCell>
                    {/* `InformationIcon` column: `icon:Info` when Total Height > the planning height limitation
                        (Y:2163-2171), `ColHideWhenBlank` otherwise; after the Delete column (Y:2382). */}
                    {overHeightLimit(planning, t.totalHeight)
                      ? <InfoRegular aria-hidden="true" className={s.turbineInfo} data-testid={`generators-turbine-info-${t.id}`} />
                      : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      ),
    };
  });

  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_GeneratorTypes" selectLabel={SELECT_DOT.wtg} shadow
      disabled={!editable} rows={wtgRows} rowFlow columns={WTG_COLUMNS}
    />
  );
}

export const WtgSection = memo(WtgSectionView);
