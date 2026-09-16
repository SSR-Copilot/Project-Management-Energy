/** Section container. Used sparingly — not every block is a card. */
import type { ReactNode } from "react";
import { makeStyles, tokens, mergeClasses } from "@fluentui/react-components";
import { space, radius, media } from "@/theme/tokens";

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.md,
    display: "flex", flexDirection: "column", minWidth: 0,
  },
  head: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.s,
    padding: `${space.m} ${space.l}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: "wrap",
  },
  title: { fontSize: "14px", fontWeight: 600, color: tokens.colorNeutralForeground1 },
  body: {
    padding: space.l, display: "flex", flexDirection: "column", gap: space.m, minWidth: 0,
    [media.belowMd]: { padding: space.m },
  },
  flush: { padding: 0 },
  fill: { flex: 1, minHeight: 0 },
});

export function Card({
  title, actions, children, flush, fill,
}: { title?: string; actions?: ReactNode; children: ReactNode; flush?: boolean; fill?: boolean }) {
  const s = useStyles();
  return (
    <section className={mergeClasses(s.root, fill && s.fill)}>
      {(title || actions) && (
        <div className={s.head}>
          <span className={s.title}>{title}</span>
          {actions}
        </div>
      )}
      <div className={mergeClasses(s.body, flush && s.flush, fill && s.fill)}>{children}</div>
    </section>
  );
}
