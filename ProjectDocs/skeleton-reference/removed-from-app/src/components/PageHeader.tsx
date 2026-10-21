/** Screen title block. Consistent across all 23 screens. */
import type { ReactNode } from "react";
import { makeStyles, tokens, Text } from "@fluentui/react-components";
import { space, media } from "@/theme/tokens";

const useStyles = makeStyles({
  root: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: space.m, flexWrap: "wrap", minWidth: 0,
  },
  left: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
  eyebrow: {
    fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase",
    color: tokens.colorBrandForeground1, fontWeight: 600,
  },
  title: {
    fontSize: "24px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-.01em",
    color: tokens.colorNeutralForeground1, textWrap: "balance",
    [media.belowMd]: { fontSize: "19px" },
  },
  sub: { color: tokens.colorNeutralForeground3, fontSize: "13px", maxWidth: "68ch" },
  actions: { display: "flex", gap: space.s, alignItems: "center", flexWrap: "wrap" },
});

export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  const s = useStyles();
  return (
    <header className={s.root}>
      <div className={s.left}>
        {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
        <h1 className={s.title}>{title}</h1>
        {description && <Text className={s.sub}>{description}</Text>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
