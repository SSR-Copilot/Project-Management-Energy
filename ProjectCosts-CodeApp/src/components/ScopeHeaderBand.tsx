/**
 * The grey band above a scoped settings page: the breadcrumb title and, optionally, actions.
 *
 * Visual = Contracts `Screen.tsx:56-61`: `rgba(0,0,0,0.1)`, min 50 px, padding 6 px 20 px, column
 * gap 15 px, row gap 8 px, wraps; the title semibold #323130, min 200 px, `marginRight: auto`.
 * Costs gets the same values (its 6 px vertical padding is invisible inside a 50 px band with one
 * line of text). With `actions` the band is `role="toolbar"` named by `ariaLabel` (Contracts).
 * `live` puts `aria-live="polite"` on the title (Costs); `titleAs="h2"` is Contracts.
 */
import type { ReactNode } from "react";
import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  band: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "15px", rowGap: "8px",
    minHeight: "50px", paddingLeft: "20px", paddingRight: "20px", paddingTop: "6px", paddingBottom: "6px",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  // The UA `h2` margins (0.83em) would grow the band past 50 px; a `span` has none, so zeroing
  // them changes nothing for Costs.
  title: {
    // The canvas label (Label@2.5.1, default size) measures 17.33 px wide-text in the Canvas run, not the 14 px Fluent default.
    fontSize: "17.3333px", fontWeight: tokens.fontWeightSemibold, color: "#323130", minWidth: "200px", marginRight: "auto",
    marginTop: "0", marginBottom: "0",
  },
  /** With `actionsAlign="start"` the band must not be squeezed by a column parent when it wraps. */
  bandStart: { flexShrink: 0 },
  /** Canvas ACS:566-611: a fixed 250 px label, the buttons follow it at a 15 px gap. */
  titleStart: { width: "250px", minWidth: "250px", flexShrink: 0, marginRight: "0" },
});

export interface ScopeHeaderBandProps {
  title: string;
  titleAs?: "h2" | "span";
  live?: boolean;
  actions?: ReactNode;
  /**
   * Where the actions sit. `"end"` (default) pushes them to the right edge; `"start"` puts them
   * directly after a fixed 250 px title (Contracts, ACS:566-611).
   */
  actionsAlign?: "end" | "start";
  /** The toolbar's name (used only with `actions`). */
  ariaLabel?: string;
  testId?: string;
}

export function ScopeHeaderBand({
  title, titleAs = "span", live = false, actions, actionsAlign = "end", ariaLabel, testId,
}: ScopeHeaderBandProps) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(styles.band, actionsAlign === "start" && styles.bandStart)}
      {...(actions ? { role: "toolbar", ...(ariaLabel ? { "aria-label": ariaLabel } : {}) } : {})}
      data-testid={testId}
    >
      <Text
        as={titleAs} className={mergeClasses(styles.title, actionsAlign === "start" && styles.titleStart)}
        {...(live ? { "aria-live": "polite" as const } : {})}
      >
        {title}
      </Text>
      {actions}
    </div>
  );
}
