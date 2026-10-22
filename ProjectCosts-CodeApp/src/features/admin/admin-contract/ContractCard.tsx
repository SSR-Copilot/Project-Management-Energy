/**
 * One contract card (canvas `con_Card_Root`, ACS:837-1814): a header with the title and a
 * chevron that toggles only this card, and, when expanded, Edit / Delete with the disabled
 * "Apply" bar, the two info grids, the DevCo tag groups and the comment. Height is
 * intrinsic — the canvas hand-computed it and clipped long text.
 *
 * Canvas parity: 0 px left inset, blue chevron and `#0078D4`
 * rule, 16 px headings over 15 px semibold values in 30 px rows, the DevCo tags as a header plus a
 * WRAPPING tag container (ACS:1723-1726). The per-card Apply bar is drawn disabled; the "Apply was made by" tracking line stays unrendered.
 */
import {
  Badge, Body1, Button, Subtitle2, Tag, TagGroup, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { CollapsibleCard } from "@/components";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import {
  APPLY_CONTRACT_FILL, APPLY_CONTRACT_INFO, APPLY_LABEL, ApplyBar,
} from "./ApplyBar";
import {
  MARGIN_TYPE_LABEL, commentText, formatClosingRef, isInactive, marginValue, marginValueHeading,
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
  applyBar: { flexGrow: 1, flexShrink: 1, flexBasis: "300px", minWidth: "0" },
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
      testId="contract-card"
      headerClassName={styles.header}
      bodyClassName={styles.body}
      chevronClassName={styles.chevron}
      title={<Subtitle2 as="h3" className={styles.title}>{contract.name}</Subtitle2>}
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
      toggleLabel={`${expanded ? "Collapse" : "Expand"} ${contract.name}`}
    >
      <div className={styles.actions}>
        <Button
          appearance="secondary" className={buttonClass} icon={<EditRegular />}
          aria-label={`Edit ${contract.name}`} data-testid={`contract-edit-${contract.id}`} disabled={!canEdit} onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          appearance="secondary" className={buttonClass} icon={<DeleteRegular />}
          aria-label={`Delete ${contract.name}`} data-testid={`contract-delete-${contract.id}`} disabled={!canDelete} onClick={onDelete}
        >
          Delete
        </Button>
        <ApplyBar
          className={styles.applyBar}
          fill={APPLY_CONTRACT_FILL} label={APPLY_LABEL} accessibleName={`${APPLY_LABEL} ${contract.name}`}
          infoText={APPLY_CONTRACT_INFO} buttonWidth={115} height={50}
          buttonTestId={`contract-apply-${contract.id}`}
        />
      </div>

      <div className={styles.grid1}>
        <div className={styles.field}>
          <Text className={styles.heading}>Description</Text>
          <Text className={styles.value}>{contract.description || "-"}</Text>
        </div>
        <div className={styles.field}>
          <Text className={styles.heading}>Closing Date Reference</Text>
          <Text className={styles.value}>
            {formatClosingRef(contract.closingRef, contract.monthDifference, contract.closingRefText)}
          </Text>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <Text className={styles.heading}>Margin</Text>
          <Text className={styles.value}>{contract.margin ? "Yes" : "No"}</Text>
        </div>
        {contract.margin ? (
          <>
            <div className={styles.field}>
              <Text className={styles.heading}>Margin Type</Text>
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

      <div className={styles.field}>
        <Text className={styles.heading}>DevCo Costs From</Text>
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

      <div className={styles.field}>
        <Text className={styles.heading}>Comments</Text>
        <Text className={styles.value}>{commentText(contract.comment)}</Text>
      </div>
    </CollapsibleCard>
  );
}
