/**
 * C9 — the grey band above a scoped settings page: the breadcrumb title and, optionally, actions.
 *
 * Visual = Contracts `Screen.tsx:56-61`: `rgba(0,0,0,0.1)`, min 50 px, padding 6 px 20 px, column
 * gap 15 px, row gap 8 px, wraps; the title semibold #323130, min 200 px, `marginRight: auto`.
 * Costs gets the same values (its 6 px vertical padding is invisible inside a 50 px band with one
 * line of text). With `actions` the band is `role="toolbar"` named by `ariaLabel` (Contracts).
 * `live` puts `aria-live="polite"` on the title (Costs); `titleAs="h2"` is Contracts.
 */
import type { ReactNode } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  band: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "15px", rowGap: "8px",
    minHeight: "50px", paddingLeft: "20px", paddingRight: "20px", paddingTop: "6px", paddingBottom: "6px",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  title: { fontWeight: tokens.fontWeightSemibold, color: "#323130", minWidth: "200px", marginRight: "auto" },
});

export interface ScopeHeaderBandProps {
  title: string;
  titleAs?: "h2" | "span";
  live?: boolean;
  actions?: ReactNode;
  /** The toolbar's name (used only with `actions`). */
  ariaLabel?: string;
  testId?: string;
}

export function ScopeHeaderBand({ title, titleAs = "span", live = false, actions, ariaLabel, testId }: ScopeHeaderBandProps) {
  const styles = useStyles();
  return (
    <div
      className={styles.band}
      {...(actions ? { role: "toolbar", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) } : {})}
      data-testid={testId}
    >
      <Text as={titleAs} className={styles.title} {...(live ? { "aria-live": "polite" as const } : {})}>{title}</Text>
      {actions}
    </div>
  );
}
