/**
 * Breadcrumb — NEW component. The scope line on the admin master-data screens.
 *
 * The guide shows two separators in use and they are not interchangeable, so the separator
 * is a prop and the call sites keep what the app actually renders:
 *
 *   Project Gates    →  "Project Gates | Germany | Wind"          (pipe)
 *   Costs            →  "Standard Assumptions / Costs / Germany / Wind"   (slash)
 *
 * It is a scope indicator, not navigation: no segment is a link in the canvas app, the rails
 * beside it are what changes the scope. Rendered as an ordered list so a screen reader
 * announces the nesting, with the last segment marked current.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { space } from "@/theme/tokens";

export interface BreadcrumbProps {
  items: string[];
  separator?: "|" | "/";
  ariaLabel?: string;
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: space.s,
    flexWrap: "wrap",
    minWidth: 0,
    margin: 0,
    paddingLeft: 0,
    listStyleType: "none",
    fontSize: "13px",
    color: tokens.colorNeutralForeground2,
  },
  item: { display: "flex", alignItems: "center", gap: space.s, minWidth: 0 },
  current: { color: tokens.colorNeutralForeground1, fontWeight: 600 },
  sep: { color: tokens.colorNeutralForeground4, userSelect: "none" },
});

export function Breadcrumb({ items, separator = "/", ariaLabel = "Scope" }: BreadcrumbProps) {
  const s = useStyles();
  const shown = items.filter((i) => i && i.length > 0);

  return (
    <ol className={s.root} aria-label={ariaLabel}>
      {shown.map((item, i) => {
        const last = i === shown.length - 1;
        return (
          <li key={`${item}-${i}`} className={s.item} aria-current={last ? "page" : undefined}>
            {i > 0 && (
              <span className={s.sep} aria-hidden="true">
                {separator}
              </span>
            )}
            <span className={last ? s.current : undefined}>{item}</span>
          </li>
        );
      })}
    </ol>
  );
}
