/**
 * M6 — one contract card (canvas `con_Card_Root`, ACS:837-1814): a header with the title and a
 * chevron that toggles only this card (FR-5), and, when expanded, Edit / Delete, the two info
 * grids, the DevCo tag groups (FR-7) and the comment (FR-6). Height is intrinsic — the canvas
 * hand-computed it and clipped long text.
 *
 * The per-card Apply box and tracking line (M6c/M6d) are NOT rendered: Apply is hard-disabled in
 * the canvas with its sync commented out (D-01, logged as an open product decision).
 */
import {
  Badge, Body1, Body1Strong, Button, Caption1, Subtitle2, Tag, TagGroup, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { CollapsibleCard } from "@/components";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import {
  MARGIN_TYPE_LABEL, commentText, formatClosingRef, isInactive, marginValue, marginValueHeading,
  type StandardContract, type TagGroup as TagGroupData,
} from "./rules";

const useStyles = makeStyles({
  title: { flexGrow: 1, minWidth: "0", overflowWrap: "anywhere", color: "#323130" },
  actions: { display: "flex", flexWrap: "wrap", gap: "10px" },
  cardButton: { minWidth: "115px" },
  grid1: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: "12px" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" },
  heading: { color: "#595959", fontSize: tokens.fontSizeBase300 },
  value: { color: "#323130", overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  tagLine: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" },
  tagRoot: { color: "#595959" },
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
          aria-label={`Edit ${contract.name}`} disabled={!canEdit} onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          appearance="secondary" className={buttonClass} icon={<DeleteRegular />}
          aria-label={`Delete ${contract.name}`} disabled={!canDelete} onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      <div className={styles.grid1}>
        <div className={styles.field}>
          <Caption1 className={styles.heading}>Description</Caption1>
          <Body1Strong className={styles.value}>{contract.description || "-"}</Body1Strong>
        </div>
        <div className={styles.field}>
          <Caption1 className={styles.heading}>Closing Date Reference</Caption1>
          <Body1Strong className={styles.value}>
            {formatClosingRef(contract.closingRef, contract.monthDifference, contract.closingRefText)}
          </Body1Strong>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <Caption1 className={styles.heading}>Margin</Caption1>
          <Body1Strong className={styles.value}>{contract.margin ? "Yes" : "No"}</Body1Strong>
        </div>
        {contract.margin ? (
          <>
            <div className={styles.field}>
              <Caption1 className={styles.heading}>Margin Type</Caption1>
              <Body1Strong className={styles.value}>
                {contract.marginType !== undefined ? MARGIN_TYPE_LABEL[contract.marginType] ?? "-" : "-"}
              </Body1Strong>
            </div>
            <div className={styles.field}>
              <Caption1 className={styles.heading}>{marginValueHeading(contract.marginType, currency)}</Caption1>
              <Body1Strong className={styles.value}>{marginValue(contract)}</Body1Strong>
            </div>
          </>
        ) : null}
      </div>

      <div className={styles.field}>
        <Caption1 className={styles.heading}>DevCo Costs From</Caption1>
        {tagGroups === "error" ? (
          <Body1 className={styles.error}>DevCo cost links could not be loaded.</Body1>
        ) : tagGroups === undefined ? (
          <Body1 className={styles.muted}>Loading…</Body1>
        ) : tagGroups.length === 0 ? null : (
          tagGroups.map((group) => (
            <div key={group.rootId || "other"} className={styles.tagLine}>
              <Body1Strong className={styles.tagRoot}>{group.rootName} :</Body1Strong>
              <TagGroup aria-label={`${group.rootName} accounts`}>
                {group.tags.map((tag) => (
                  <Tag key={tag.id} appearance="filled" shape="circular" size="small">{tag.label}</Tag>
                ))}
              </TagGroup>
            </div>
          ))
        )}
      </div>

      <div className={styles.field}>
        <Caption1 className={styles.heading}>Comments</Caption1>
        <Body1 className={styles.value}>{commentText(contract.comment)}</Body1>
      </div>
    </CollapsibleCard>
  );
}
