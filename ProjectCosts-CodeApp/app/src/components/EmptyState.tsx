import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  root: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: space.s, textAlign: "center",
    paddingTop: space.xxl, paddingBottom: space.xxl,
    paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  description: { color: tokens.colorNeutralForeground3, maxWidth: "56ch" },
});

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

/**
 * Used for the states the canvas app did not have.
 *
 * The most important one is "no project selected": the canvas app silently fell back to a
 * hard-coded test-project GUID instead (see `docs/01-BUGS-FOUND.md` A-2), so this state
 * never existed and no copy was ever written for it.
 */
export function EmptyState({ title, description, action, children }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <div className={styles.root} role="status">
      <Text className={styles.title}>{title}</Text>
      {description ? <Text className={styles.description}>{description}</Text> : null}
      {action ? (
        <Button appearance="primary" onClick={action.onClick}>{action.label}</Button>
      ) : null}
      {children}
    </div>
  );
}
