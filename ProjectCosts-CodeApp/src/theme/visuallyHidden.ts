/**
 * T1 — content that screen readers announce but nobody sees (live regions, extra labels).
 *
 * The settings screens and `ReorderList` each defined this block; it is the classic
 * clip pattern: absolute, 1 × 1 px, overflow hidden, `clip: rect(0 0 0 0)`, no wrapping.
 */
import type { CSSProperties } from "react";
import { makeStyles } from "@fluentui/react-components";

/** Inline-style form (for `style={visuallyHidden}`). */
export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

/** Griffel form: `useVisuallyHiddenStyles().root`. */
export const useVisuallyHiddenStyles = makeStyles({
  root: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
});
