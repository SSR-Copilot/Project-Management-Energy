/**
 * The picker's country flag (canvas media `germany-flag-png-large` …, ACS:61-82).
 *
 * The canvas PNGs are not shipped and emoji flags do not render on Windows, so the six picker
 * countries are drawn as small inline SVGs (from `costs/Flag.tsx`). Any other country gets its
 * ISO-2 code badge when one is known, else a neutral tile.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { pickerCountryConfig } from "@/domain/countryPicker";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  badge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: "26px", height: "18px",
    fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold,
    color: palette.themePrimary, backgroundColor: palette.themeLighterAlt,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.themeLighter, borderRightColor: palette.themeLighter,
    borderBottomColor: palette.themeLighter, borderLeftColor: palette.themeLighter,
  },
});

export interface CountryFlagProps {
  /** `vsb_name`; matched to the picker configuration (exact, then case-insensitive). */
  country: string;
  /** `"flag"` draws the SVG (badge for unknown countries); `"code"` always draws the badge. */
  variant?: "flag" | "code";
  /** Badge text for a country outside the configuration. */
  fallbackCode?: string;
}

const W = 24;
const H = 16;

export function CountryFlag({ country, variant = "flag", fallbackCode }: CountryFlagProps) {
  const styles = useStyles();
  const cfg = pickerCountryConfig(country);
  const code = cfg?.iso2 ?? fallbackCode ?? "";

  if (variant === "code" || (!cfg && code)) {
    return <span className={styles.badge} aria-hidden="true" data-testid="country-flag-code">{code}</span>;
  }

  let body;
  const flag = cfg?.flag;
  if (flag?.kind === "h") {
    body = flag.colors.map((c, i) => (
      <rect key={`${c}${i}`} x={0} y={(H / flag.colors.length) * i} width={W} height={H / flag.colors.length} fill={c} />
    ));
  } else if (flag?.kind === "v") {
    body = flag.colors.map((c, i) => (
      <rect key={`${c}${i}`} x={(W / flag.colors.length) * i} y={0} width={W / flag.colors.length} height={H} fill={c} />
    ));
  } else if (flag?.kind === "nordic") {
    body = (
      <>
        <rect x={0} y={0} width={W} height={H} fill={flag.background} />
        <rect x={7} y={0} width={4} height={H} fill={flag.cross} />
        <rect x={0} y={6} width={W} height={4} fill={flag.cross} />
      </>
    );
  } else {
    body = <rect x={0} y={0} width={W} height={H} fill="#E3E3E3" />;
  }
  return (
    <svg
      width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" data-testid="country-flag"
      style={{ boxShadow: "0 0 2px rgba(0,0,0,0.4)", flexShrink: 0 }}
    >
      {body}
    </svg>
  );
}
