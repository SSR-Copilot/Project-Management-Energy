/** The Admin Cost screen's styles, shared by `Screen.tsx`, `DevexSection.tsx` and `OpexSection.tsx`. */
import { makeStyles, tokens } from "@fluentui/react-components";
import { palette, space, media } from "@/theme/tokens";

export const useCostStyles = makeStyles({
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
  breadcrumb: { fontSize: "16px", fontWeight: tokens.fontWeightSemibold },
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
    display: "flex", flexDirection: "column", rowGap: space.s,
    paddingLeft: space.m, paddingRight: space.m, paddingBottom: space.m, paddingTop: space.s,
    borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: palette.neutralQuaternaryAlt,
  },
  commandRow: { display: "flex", alignItems: "center", columnGap: space.s, flexWrap: "wrap" },
  /**
   * The OPEX / Land Lease card's "Add Contract Type" command bar: its icon sits over the costs
   * table's first column (Fluent's 8 px cell padding), with `useCommandRowStyles` taking the
   * button's own inset away (PO, 21 Oct 2026).
   */
  opexCommandRow: { paddingLeft: space.s },
  outlineButton: {
    color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
  },
  tableWrap: { overflowX: "auto", maxWidth: "100%" },
  opexTable: { minWidth: "1500px" },
  devexTable: { minWidth: "1100px" },
  headerCell: { fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap" },
  headRow: { fontWeight: tokens.fontWeightSemibold },
  cell: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "260px" },
  actions: { display: "flex", alignItems: "center", columnGap: space.xxs },
  panelBody: { display: "flex", flexDirection: "column", rowGap: space.m },
  pair: { display: "flex", columnGap: space.s },
  hint: { color: palette.Warning, fontSize: tokens.fontSizeBase200 },
  error: { color: palette.akzent5, fontSize: tokens.fontSizeBase200 },
});
