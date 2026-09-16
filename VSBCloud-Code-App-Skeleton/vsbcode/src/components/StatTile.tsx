/** Metric tile. Used where a screen leads with figures (Production, Finance, Capex). */
import type { CSSProperties } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { space, radius, media } from "@/theme/tokens";

const useStyles = makeStyles({
  grid: {
    display: "grid", gap: space.m,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: space.s },
  },
  tile: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: space.l,
    display: "flex", flexDirection: "column", gap: "4px", minWidth: 0,
    [media.belowMd]: { padding: space.m },
  },
  label: {
    fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em",
    color: tokens.colorNeutralForeground3, fontWeight: 600,
  },
  value: {
    fontSize: "26px", fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
    color: tokens.colorNeutralForeground1, overflowWrap: "anywhere",
    [media.belowMd]: { fontSize: "21px" },
  },
  unit: { fontSize: "13px", fontWeight: 500, color: tokens.colorNeutralForeground3, marginLeft: "4px" },
  note: { fontSize: "11px", color: tokens.colorNeutralForeground3 },
});

export interface Stat { label: string; value: string; unit?: string; note?: string; accent?: string }

export function StatTiles({ stats }: { stats: Stat[] }) {
  const s = useStyles();
  return (
    <div className={s.grid}>
      {stats.map((t) => (
        <div key={t.label} className={s.tile}>
          <span className={s.label}>{t.label}</span>
          <span className={s.value} style={(t.accent ? { color: t.accent } : undefined) as CSSProperties | undefined}>
            {t.value}
            {t.unit && <span className={s.unit}>{t.unit}</span>}
          </span>
          {t.note && <span className={s.note}>{t.note}</span>}
        </div>
      ))}
    </div>
  );
}
