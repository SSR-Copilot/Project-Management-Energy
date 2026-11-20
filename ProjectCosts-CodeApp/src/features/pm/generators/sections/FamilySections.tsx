/**
 * Project Generators Screen — the six non-WTG family galleries (D143, split out of `Screen.tsx`; the card rows and captions are the
 * screen's former `pvRows` / `inverterRows` / `substructureRows` / `storageRows` / `hydrogenRows` / `substationRows` and their
 * `Gallery` blocks, unchanged). Each section is memoized: it re-renders only when ITS rows, selection, folding or the shared
 * flags change, so a reload of the storage query leaves the PV, inverter and the other galleries alone.
 */
import { memo, useMemo, type ReactNode } from "react";
import { Button, Text, Tooltip } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import {
  HYDROGEN_CARD_LABELS, INVERTER_CARD_LABELS, PV_FIELD_LABELS, STORAGE_CARD_LABELS, SUBSTATION_CARD_LABELS,
  SUBSTRUCTURE_CARD_LABELS, SUBSTRUCTURE_COST_INFO, SUBSTRUCTURE_COST_NOTE, currencyCaption, inverterCardValues, pvCardValues,
  simpleCardValues, substructureCardValues, substructureCostNoteVisible,
  type GeneratorTypeRow, type PermissionFamily, type PlantFamily, type SimpleTypeRow,
} from "../rules";
import { CardTitle, FoldButton, Gallery, type GalleryRow } from "./Gallery";
import { probeRender } from "./renderProbe";
import { SELECT_DOT } from "./state";
import { useStyles } from "./styles";

/** What every family section is given. */
export interface FamilySectionProps {
  rows: readonly SimpleTypeRow[];
  lang: string;
  /** `editable`: the page is not locked. */
  editable: boolean;
  /** `writes.refreshing`. */
  refreshing: boolean;
  /** The selected row's id of THIS family, or null. */
  selectedId: string | null;
  /** The ids of this family's expanded cards (a stable subset of the screen's folding state). */
  expandedIds: ReadonlySet<string>;
  onRowClick: (family: PlantFamily, id: string) => void;
  onFold: (family: PlantFamily, id: string) => void;
  onCancelRequest: (family: PermissionFamily, row: GeneratorTypeRow | SimpleTypeRow) => void;
}

/** One card per row, as the screen's former `familyRows`. */
function familyRows(
  family: Exclude<PlantFamily, "wtg">, p: FamilySectionProps,
  title: (r: SimpleTypeRow) => string, cells: (r: SimpleTypeRow) => ReactNode[], width: number,
): GalleryRow[] {
  return p.rows.map((r) => {
    const open = p.expandedIds.has(r.id);
    return {
      id: r.id,
      selected: p.selectedId === r.id,
      onSelect: () => p.onRowClick(family, r.id),
      fold: <FoldButton family={family} id={r.id} open={open} editable={p.editable} onFold={p.onFold} />,
      open,
      title: <CardTitle family={family} label={title(r)} row={r} refreshing={p.refreshing} onCancelRequest={p.onCancelRequest} />,
      cells: open ? cells(r) : Array.from({ length: width }, () => ""),
    };
  });
}

const PV_COLUMNS = [
  PV_FIELD_LABELS.supplier, PV_FIELD_LABELS.capacity, PV_FIELD_LABELS.degradation1stYear, PV_FIELD_LABELS.degradationRemainingYears,
];

function PvSectionView(p: FamilySectionProps) {
  probeRender("pv");
  const rows = familyRows("pv", p, (r) => r.moduleLabel ?? "", (r) => {
    const v = pvCardValues(r, p.lang);
    return [v.supplier, v.capacity, v.degradation1stYear, v.degradationRemainingYears];
  }, 4);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_PvModule" selectLabel={SELECT_DOT.pv}
      disabled={!p.editable} rows={rows} layout="pv" columns={PV_COLUMNS}
    />
  );
}
export const PvSection = memo(PvSectionView);

function InverterSectionView(p: FamilySectionProps & { iso: string | null | undefined }) {
  probeRender("inverter");
  const rows = familyRows("inverter", p, (r) => r.name ?? "", (r) => {
    const v = inverterCardValues(r, p.lang);
    return [v.inverterType, v.supplier, v.costPerInverter, v.numberOfInverters, v.typeCost, v.nominalPower, v.warranty];
  }, 7);
  const columns = useMemo(() => [
    INVERTER_CARD_LABELS.inverterType, INVERTER_CARD_LABELS.supplier,
    currencyCaption(INVERTER_CARD_LABELS.costPerInverter, p.iso),
    INVERTER_CARD_LABELS.numberOfInverters,
    currencyCaption(INVERTER_CARD_LABELS.totalInverterTypeCost, p.iso),
    INVERTER_CARD_LABELS.nominalPower, INVERTER_CARD_LABELS.warranty,
  ], [p.iso]);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_Invertors" selectLabel={SELECT_DOT.inverter} shadow
      disabled={!p.editable} rows={rows} columns={columns}
    />
  );
}
export const InverterSection = memo(InverterSectionView);

function SubstructureSectionView(p: FamilySectionProps & { iso: string | null | undefined; plantPvCapacity: number | null | undefined }) {
  probeRender("substructure");
  const s = useStyles();
  const rows = familyRows("substructure", p, (r) => r.name ?? "", (r) => {
    const v = substructureCardValues(r, p.lang);
    return [v.supplier, v.types, (
      <span key="cost" className={s.title}>
        {v.cost}
        {substructureCostNoteVisible(p.plantPvCapacity) ? (
          <>
            <Text className={s.note}>{SUBSTRUCTURE_COST_NOTE}</Text>
            <Tooltip relationship="description" content={SUBSTRUCTURE_COST_INFO}>
              <Button
                appearance="transparent" size="small" icon={<InfoRegular />}
                aria-label="info_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureCost"
                data-testid={`info_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureCost-${r.id}`}
              />
            </Tooltip>
          </>
        ) : null}
      </span>
    )];
  }, 3);
  const columns = useMemo(() => [
    SUBSTRUCTURE_CARD_LABELS.supplier, SUBSTRUCTURE_CARD_LABELS.substructureType,
    currencyCaption(SUBSTRUCTURE_CARD_LABELS.substructureCost, p.iso),
  ], [p.iso]);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_Substructure" selectLabel={SELECT_DOT.substructure}
      disabled={!p.editable} rows={rows} columns={columns}
    />
  );
}
export const SubstructureSection = memo(SubstructureSectionView);

const STORAGE_COLUMNS = [STORAGE_CARD_LABELS.powerCapacity, STORAGE_CARD_LABELS.energyCapacity, STORAGE_CARD_LABELS.supplier];

function StorageSectionView(p: FamilySectionProps) {
  probeRender("storage");
  const rows = familyRows("storage", p, (r) => r.name ?? "", (r) => simpleCardValues("storage", r, p.lang), 3);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_Storage_1" selectLabel={SELECT_DOT.storage}
      disabled={!p.editable} rows={rows} layout="simple" columns={STORAGE_COLUMNS}
    />
  );
}
export const StorageSection = memo(StorageSectionView);

const HYDROGEN_COLUMNS = [HYDROGEN_CARD_LABELS.capacity, HYDROGEN_CARD_LABELS.supplier];

function HydrogenSectionView(p: FamilySectionProps) {
  probeRender("hydrogen");
  const rows = familyRows("hydrogen", p, (r) => r.name ?? "", (r) => simpleCardValues("hydrogen", r, p.lang), 2);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_Hydrogen" selectLabel={SELECT_DOT.hydrogen}
      disabled={!p.editable} rows={rows} layout="simple" columns={HYDROGEN_COLUMNS}
    />
  );
}
export const HydrogenSection = memo(HydrogenSectionView);

const SUBSTATION_COLUMNS = [SUBSTATION_CARD_LABELS.capacity, SUBSTATION_CARD_LABELS.supplier];

function SubstationSectionView(p: FamilySectionProps) {
  probeRender("substation");
  const rows = familyRows("substation", p, (r) => r.name ?? "", (r) => simpleCardValues("substation", r, p.lang), 2);
  return (
    <Gallery
      name="gal_Generators_DisplayProject_Body_Form_Substation_2" selectLabel={SELECT_DOT.substation}
      disabled={!p.editable} rows={rows} layout="simple" columns={SUBSTATION_COLUMNS}
    />
  );
}
export const SubstationSection = memo(SubstationSectionView);
