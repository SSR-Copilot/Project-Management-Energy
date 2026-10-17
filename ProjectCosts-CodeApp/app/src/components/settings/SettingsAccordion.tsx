/**
 * C8 — the multi-open accordion of a settings page (`Accordion multiple collapsible`, controlled).
 *
 *   light (Milestones `Screen.tsx:42-54`, Check List Settings `Screen.tsx:57-68`): header #fdffff,
 *     header button min 42 px, hover #E3E3E322, `size="large"`, chevron at the end. The 1 px
 *     Grayscale20 bottom rule is on the header always (`border="always"`, MS) or on the item only
 *     while folded (`border="folded"`, CL). `itemInsetRight={10}` is CL's item margin.
 *     `panelPadding` goes on the AccordionPanel (MS 10/10/12, CL 20/10/12).
 *   grey (Costs `Screen.tsx:69-76`): the accordion is padded 10 / 20 / 0 / 20 with items 5 px apart;
 *     header Grayscale20, header button min 50 px, padding-left 10; a string title is 16 px
 *     semibold #323130; the panel has no side margin, 10 px bottom padding.
 *
 * The light title's text styling (14.7 px for CL, fontSizeBase300 for MS) stays in the caller's
 * `title` node (open item X22).
 */
import type { ReactNode } from "react";
import {
  Accordion, AccordionHeader, AccordionItem, AccordionPanel, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  item: { backgroundColor: palette.white },
  insetRight10: { marginRight: "10px" },
  folded: { borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20 },
  lightHeader: {
    backgroundColor: "#fdffff",
    "& button": { minHeight: "42px" },
    ":hover": { backgroundColor: "#E3E3E322" },
  },
  headerRule: { borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20 },
  greyRoot: {
    paddingLeft: "20px", paddingRight: "20px", paddingTop: "10px",
    display: "flex", flexDirection: "column", rowGap: "5px",
  },
  greyHeader: {
    backgroundColor: palette.Grayscale20,
    "& button": { minHeight: "50px", paddingLeft: "10px" },
  },
  greyTitle: { fontWeight: tokens.fontWeightSemibold, fontSize: "16px", color: "#323130" },
  greyPanel: { marginLeft: "0", marginRight: "0", paddingBottom: "10px", minWidth: "0" },
});

export interface SettingsAccordionItem { id: string; title: ReactNode; content: ReactNode; testId?: string }

export interface SettingsAccordionProps {
  items: readonly SettingsAccordionItem[];
  openItems: readonly string[];
  /** Called with the toggled item's id. */
  onToggle: (id: string) => void;
  variant: "light" | "grey";
  /** light only: MS "always" (default), CL "folded". */
  border?: "always" | "folded";
  /** light only: CL 10. */
  itemInsetRight?: 0 | 10;
  /** light only: AccordionPanel padding (MS 10/10/12, CL 20/10/12). */
  panelPadding?: { left: number; top: number; bottom: number };
  className?: string;
}

export function SettingsAccordion({
  items, openItems, onToggle, variant, border = "always", itemInsetRight = 0, panelPadding, className,
}: SettingsAccordionProps) {
  const styles = useStyles();
  const light = variant === "light";
  const panelStyle = light && panelPadding
    ? { paddingLeft: `${panelPadding.left}px`, paddingTop: `${panelPadding.top}px`, paddingBottom: `${panelPadding.bottom}px` }
    : undefined;
  return (
    <Accordion
      multiple collapsible
      className={mergeClasses(!light && styles.greyRoot, className)}
      openItems={[...openItems]}
      onToggle={(_, data) => onToggle(String(data.value))}
    >
      {items.map((item) => {
        const open = openItems.includes(item.id);
        return (
          <AccordionItem
            key={item.id} value={item.id} data-testid={item.testId}
            className={mergeClasses(
              styles.item,
              light && itemInsetRight === 10 && styles.insetRight10,
              light && border === "folded" && !open && styles.folded,
            )}
          >
            <AccordionHeader
              expandIconPosition="end"
              {...(light ? { size: "large" as const } : {})}
              className={light
                ? mergeClasses(styles.lightHeader, border === "always" && styles.headerRule)
                : styles.greyHeader}
            >
              {!light && typeof item.title === "string"
                ? <Text className={styles.greyTitle}>{item.title}</Text>
                : item.title}
            </AccordionHeader>
            <AccordionPanel className={light ? undefined : styles.greyPanel} style={panelStyle}>
              {item.content}
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
