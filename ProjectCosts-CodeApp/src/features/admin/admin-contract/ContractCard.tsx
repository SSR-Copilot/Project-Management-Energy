/**
 * One contract card (canvas `gal_AdminContracts_StandardAssumptions_Updated` row
 * `con_Card_Root`, ACS:837-1814): a header (`con_Header`) with the title (`lbl_Title`) and a
 * chevron (`ico_Chevron_Expand_Collapse_AdminContracrs`) that toggles only this card, and, when
 * expanded (`con_Body_Expanded`), Edit / Delete (`con_Action_Bar`),
 * the two info grids (`con_Info_Grid1` / `con_Info_Grid2`), the DevCo tag groups
 * (`con_DevCoCost_Section`, `htmlDevCoCostTagList`) and the comment
 * (`con_Footer_Comment_Section`). Every `data-testid` is the canvas name plus the contract id
 * (repeating rows, CONVENTIONS rule 16).
 *
 * Canvas parity: 0 px left inset, blue chevron and `#0078D4` rule, 16 px headings over 15 px
 * semibold values in 30 px rows, the DevCo tags as a header plus a WRAPPING tag container
 * (ACS:1723-1726). The per-card Apply bar is not built (D67).
 *
 * DIVERGENCE: the canvas card has a hand-computed height and clips long text; here the height is
 * intrinsic and long values wrap.
 * DIVERGENCE: `lbl_Description_Value.Text = ThisItem.Description` and
 * `lbl_MarginType_Value.Text = Text(ThisItem.'Margin Type')` render a blank value as empty; here
 * both show "-".
 * DIVERGENCE: `lbl_MarginFixedValuePercentage_Value.Text` is `Value(…)` (the raw number); here it
 * is `marginValue` — locale-formatted with grouping and at most two decimals.
 * DIVERGENCE: an inactive contract shows an "Inactive" badge (no canvas equivalent; the canvas
 * lists inactive rows unmarked).
 * DIVERGENCE: the DevCo section shows "Loading…" / "DevCo cost links could not be loaded." (no
 * canvas text; CONVENTIONS rule 19).
 *
 * Hard-coded colours with no theme token: `#0078D4` (the canvas rule and chevron, not
 * `palette.themePrimary` #006eb9) and `#323130` (the canvas label colour).
 */
import {
  Badge, Body1, Button, Subtitle2, Tag, TagGroup, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { CollapsibleCard } from "@/components";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import {
  CARD_TEXT, MARGIN_LABEL, MARGIN_TYPE_LABEL, commentText, formatClosingRef, isInactive, marginValue, marginValueHeading,
  type StandardContract, type TagGroup as TagGroupData,
} from "./rules";

const CANVAS_BLUE = "#0078D4";

const useStyles = makeStyles({
  title: { flexGrow: 1, minWidth: "0", overflowWrap: "anywhere", color: "#323130" },
  /* Card chrome (ACS:920-1027): no left inset, blue chevron and rule, 3 px / 10 px body padding. */
  header: { paddingLeft: "0", borderBottomColor: CANVAS_BLUE },
  chevron: { color: CANVAS_BLUE, flexShrink: 0 },
  body: { gap: "0", paddingTop: "3px", paddingBottom: "10px", paddingLeft: "0", paddingRight: "10px", minWidth: "0" },
  /* ACS:1080: 60 px action bar, gap 10, 10 px side padding; wraps only when narrow. */
  actions: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px",
    minHeight: "60px", paddingLeft: "10px", paddingRight: "10px", boxSizing: "border-box",
  },
  cardButton: { minWidth: "115px", width: "115px" },
  /* Both grids share one column definition per row and no gaps, so their columns line up. */
  grid1: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", columnGap: "0" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: "0" },
  field: { display: "flex", flexDirection: "column", gap: "0", minWidth: "0" },
  heading: {
    display: "flex", alignItems: "center", minHeight: "30px",
    color: palette.neutralTertiary, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightRegular,
  },
  value: {
    display: "flex", alignItems: "center", minHeight: "30px", minWidth: "0",
    color: "#323130", fontSize: "15px", fontWeight: tokens.fontWeightSemibold,
    overflowWrap: "anywhere", whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  /* DevCo tag block (ACS:1723-1726): header + a wrapping tag container, 12 px between rows. */
  tags: { paddingLeft: "2px", minWidth: "0" },
  tagRow: { display: "flex", alignItems: "baseline", columnGap: "10px", marginBottom: "12px", minWidth: "0" },
  tagRoot: {
    flexShrink: 0, whiteSpace: "nowrap", color: palette.neutralTertiary,
    fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold,
  },
  // Fluent's own `TagGroup` is `inline-flex` with no wrap; the user class merges last and fixes it.
  tagGroup: {
    display: "flex", flexWrap: "wrap", flexGrow: 1, flexShrink: 1, minWidth: "0",
    rowGap: "8px", columnGap: "8px",
  },
  tagPill: {
    backgroundColor: palette.neutralLight, color: "#323130", maxWidth: "100%", minWidth: "0", height: "26px",
  },
  tagText: { fontSize: "13px", fontWeight: tokens.fontWeightSemibold, color: "#323130" },
  muted: { color: tokens.colorNeutralForeground3 },
  error: { color: palette.Error },
});

export interface ContractCardProps {
  contract: StandardContract;
  expanded: boolean;
  currency: string;
  /** `undefined` while the DevCo rows load; `"error"` when they cannot be read. */
  tagGroups: TagGroupData[] | undefined | "error";
  canEdit: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ContractCard({
  contract, expanded, currency, tagGroups, canEdit, canDelete, onToggle, onEdit, onDelete,
}: ContractCardProps) {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  const buttonClass = mergeClasses(styles.cardButton, brand.brandOutline);

  return (
    <CollapsibleCard
      variant="contract"
      id={contract.id}
      idPrefix="contract-card-body-"
      as="article"
      ariaLabel={contract.name}
      testId={`con_Card_Root-${contract.id}`}
      headerClassName={styles.header}
      bodyClassName={styles.body}
      chevronClassName={styles.chevron}
      title={<Subtitle2 as="h3" className={styles.title} data-testid={`lbl_Title-${contract.id}`}>{contract.name}</Subtitle2>}
      trailing={isInactive(contract) ? (
        <Badge
          appearance="tint" color="subtle" size="medium"
          title="Inactive: counts toward the limit of 10, but is not used to seed project contracts"
        >
          Inactive
        </Badge>
      ) : null}
      expanded={expanded}
      onToggle={onToggle}
      // The canvas chevron is an icon with no caption and no AccessibleLabel; the port's name
      // ("Expand <contract>") is kept so each card's toggle stays distinguishable.
      toggleLabel={`${expanded ? "Collapse" : "Expand"} ${contract.name}`}
      toggleTestId={`ico_Chevron_Expand_Collapse_AdminContracrs-${contract.id}`}
    >
      <div className={styles.actions} data-testid={`con_Action_Bar-${contract.id}`}>
        <Button
          appearance="secondary" className={buttonClass} icon={<EditRegular />}
          aria-label={CARD_TEXT.edit} data-testid={`btn_Edit_AdminContracts-${contract.id}`} disabled={!canEdit} onClick={onEdit}
        >
          {CARD_TEXT.edit}
        </Button>
        <Button
          appearance="secondary" className={buttonClass} icon={<DeleteRegular />}
          aria-label={CARD_TEXT.delete} data-testid={`btn_Delete_AdminContracts-${contract.id}`} disabled={!canDelete} onClick={onDelete}
        >
          {CARD_TEXT.delete}
        </Button>
      </div>

      <div className={styles.grid1} data-testid={`con_Info_Grid1-${contract.id}`}>
        <div className={styles.field}>
          <Text className={styles.heading}>{CARD_TEXT.description}</Text>
          <Text className={styles.value}>{contract.description || "-"}</Text>
        </div>
        <div className={styles.field}>
          <Text className={styles.heading}>{CARD_TEXT.closingDateReference}</Text>
          <Text className={styles.value}>
            {formatClosingRef(contract.closingRef, contract.monthDifference, contract.closingRefText)}
          </Text>
        </div>
      </div>

      <div className={styles.grid2} data-testid={`con_Info_Grid2-${contract.id}`}>
        <div className={styles.field}>
          <Text className={styles.heading}>{CARD_TEXT.margin}</Text>
          <Text className={styles.value}>{contract.margin ? MARGIN_LABEL.yes : MARGIN_LABEL.no}</Text>
        </div>
        {contract.margin ? (
          <>
            <div className={styles.field}>
              <Text className={styles.heading}>{CARD_TEXT.marginType}</Text>
              <Text className={styles.value}>
                {contract.marginType !== undefined ? MARGIN_TYPE_LABEL[contract.marginType] ?? "-" : "-"}
              </Text>
            </div>
            <div className={styles.field}>
              <Text className={styles.heading}>{marginValueHeading(contract.marginType, currency)}</Text>
              <Text className={styles.value}>{marginValue(contract)}</Text>
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.field} data-testid={`con_DevCoCost_Section-${contract.id}`}>
        <Text className={styles.heading}>{CARD_TEXT.devCoCostsFrom}</Text>
        <div className={styles.tags}>
          {tagGroups === "error" ? (
            <Body1 className={styles.error}>DevCo cost links could not be loaded.</Body1>
          ) : tagGroups === undefined ? (
            <Body1 className={styles.muted}>Loading…</Body1>
          ) : tagGroups.length === 0 ? null : (
            tagGroups.map((group) => (
              <div key={group.rootId || "other"} className={styles.tagRow}>
                <Text className={styles.tagRoot}>{group.rootName} :</Text>
                <TagGroup className={styles.tagGroup} aria-label={`${group.rootName} accounts`}>
                  {group.tags.map((tag) => (
                    <Tag
                      key={tag.id} appearance="filled" shape="circular" size="small"
                      className={styles.tagPill} primaryText={{ className: styles.tagText }}
                    >
                      {tag.label}
                    </Tag>
                  ))}
                </TagGroup>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.field} data-testid={`con_Footer_Comment_Section-${contract.id}`}>
        <Text className={styles.heading}>{CARD_TEXT.comments}</Text>
        <Text className={styles.value}>{commentText(contract.comment)}</Text>
      </div>
    </CollapsibleCard>
  );
}
