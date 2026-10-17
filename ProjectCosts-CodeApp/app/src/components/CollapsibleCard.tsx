/**
 * C11 — a card with a header row (title, trailing pill / badge, chevron) and a body that renders
 * only while expanded. Two canvas looks, kept exactly:
 *
 *   account  (CAPEX Accounts `AccountCard.tsx:20-55`, CA:687-747): header min 42 px, padding 10 / 6,
 *            column gap 8, fill #fdffff, Grayscale20 bottom rule only when collapsed; body padding
 *            10 / 10 / 10 / 30, row gap 5, Grayscale20 bottom rule. Chevron themePrimary.
 *   contract (Contracts `ContractCard.tsx:21-28`): white, header min 50 px, padding 16 / 10, gap 8,
 *            1 px themePrimary bottom rule; body 10 / 16 / 14 / 16, gap 12.
 *
 * The chevron is a Button with `aria-expanded` and `aria-controls` = the body id. CAPEX passes its
 * select button (with `aria-pressed`) as the `title`; Contracts a `Subtitle2 as="h3"`.
 */
import type { ReactNode } from "react";
import { Button, makeStyles, mergeClasses } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  card: { backgroundColor: palette.white, display: "flex", flexDirection: "column" },
  accountHeader: {
    position: "relative",
    display: "flex", alignItems: "center", columnGap: "8px",
    minHeight: "42px", paddingLeft: "10px", paddingRight: "6px",
    backgroundColor: "#fdffff",
  },
  accountDivider: { borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20 },
  accountBody: {
    display: "flex", flexDirection: "column", rowGap: "5px",
    paddingTop: "10px", paddingBottom: "10px", paddingLeft: "30px", paddingRight: "10px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
  },
  accountChevron: { color: palette.themePrimary, flexShrink: 0 },
  contractHeader: {
    display: "flex", alignItems: "center", gap: "8px",
    minHeight: "50px", paddingLeft: "16px", paddingRight: "10px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.themePrimary,
  },
  contractBody: {
    display: "flex", flexDirection: "column", gap: "12px",
    paddingTop: "10px", paddingBottom: "14px", paddingLeft: "16px", paddingRight: "16px",
  },
});

export interface CollapsibleCardProps {
  /** Body id = `${idPrefix}${id}`. */
  id: string;
  /** Default `"card-body-"`; Contracts keeps `"contract-card-body-"`, CAPEX `"capex-account-body-"`. */
  idPrefix?: string;
  variant: "account" | "contract";
  title: ReactNode;
  /** Pill or badge between the title and the chevron. */
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Chevron aria-label. */
  toggleLabel: string;
  as?: "article" | "div";
  ariaLabel?: string;
  testId?: string;
  /** Body content, rendered only when expanded. */
  children?: ReactNode;
}

export function CollapsibleCard({
  id, idPrefix = "card-body-", variant, title, trailing, expanded, onToggle, toggleLabel,
  as = "div", ariaLabel, testId, children,
}: CollapsibleCardProps) {
  const styles = useStyles();
  const bodyId = `${idPrefix}${id}`;
  const Tag = as;
  const account = variant === "account";
  return (
    <Tag className={styles.card} {...(ariaLabel ? { "aria-label": ariaLabel } : {})} data-testid={testId}>
      <div className={account
        ? mergeClasses(styles.accountHeader, !expanded && styles.accountDivider)
        : styles.contractHeader}
      >
        {title}
        {trailing}
        <Button
          appearance="transparent"
          className={account ? styles.accountChevron : undefined}
          icon={expanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={toggleLabel}
        />
      </div>
      {expanded ? (
        <div id={bodyId} className={account ? styles.accountBody : styles.contractBody}>{children}</div>
      ) : null}
    </Tag>
  );
}
