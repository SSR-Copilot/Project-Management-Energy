/** T1 — an off-screen element that stays in the accessibility tree. */
import type { AriaRole, ReactNode } from "react";
import { mergeClasses } from "@fluentui/react-components";
import { useVisuallyHiddenStyles } from "@/theme/visuallyHidden";

export interface VisuallyHiddenProps {
  children?: ReactNode;
  as?: "span" | "div";
  id?: string;
  role?: AriaRole;
  "aria-live"?: "polite" | "assertive" | "off";
  className?: string;
  testId?: string;
}

export function VisuallyHidden({
  children, as = "span", id, role, "aria-live": ariaLive, className, testId,
}: VisuallyHiddenProps) {
  const styles = useVisuallyHiddenStyles();
  const Tag = as;
  return (
    <Tag id={id} role={role} aria-live={ariaLive} className={mergeClasses(styles.root, className)} data-testid={testId}>
      {children}
    </Tag>
  );
}
