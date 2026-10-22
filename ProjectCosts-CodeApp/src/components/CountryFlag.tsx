/**
 * The picker's country flag (canvas media `germany-flag-png-large` …, ACS:61-82).
 *
 * The canvas PNGs are not shipped and emoji flags do not render on Windows, so the six picker
 * countries are drawn as inline SVGs (from `costs/Flag.tsx`), stretched to the canvas box:
 * 36 x 24, or 40 x 28 for the selected country, 4 px corners, shadow8. Any other country gets
 * its ISO-2 code badge when one is known, else a neutral tile. `compact` keeps the original
 * 24 x 16 flag for the dropdown options.
 */
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { pickerCountryConfig } from "@/domain/countryPicker";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  // Column look (canvas `con_CountryFlagShadow`): 36 x 24, 40 x 28 selected (set on the element
  // as width/height attributes for the SVG and as rules for the badge), 4 px corners,
  // DropShadow.Regular (~Fluent shadow8).
  flag: {
    display: "block", flexShrink: 0, borderRadius: "4px", boxShadow: tokens.shadow8,
  },
  // Compact dropdown options keep the original small flag.
  flagCompact: { display: "block", flexShrink: 0, boxShadow: "0 0 2px rgba(0,0,0,0.4)" },
  badge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    boxSizing: "border-box", width: "36px", height: "24px",
    borderRadius: "4px", boxShadow: tokens.shadow8,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    color: palette.themePrimary, backgroundColor: palette.themeLighterAlt,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.themeLighter, borderRightColor: palette.themeLighter,
    borderBottomColor: palette.themeLighter, borderLeftColor: palette.themeLighter,
  },
  badgeSelected: { width: "40px", height: "28px" },
  badgeCompact: {
    boxSizing: "content-box", width: "26px", height: "18px", borderRadius: "0", boxShadow: "none",
    fontSize: tokens.fontSizeBase100,
  },
});

export interface CountryFlagProps {
  /** `vsb_name`; matched to the picker configuration (exact, then case-insensitive). */
  country: string;
  /** `"flag"` draws the SVG (badge for unknown countries); `"code"` always draws the badge. */
  variant?: "flag" | "code";
  /** Badge text for a country outside the configuration. */
  fallbackCode?: string;
  /** The selected country's larger box: 40 x 28 instead of 36 x 24 (the column picker). */
  selected?: boolean;
  /** The small 24 x 16 flag for dropdown options (the compact picker), not the column box. */
  compact?: boolean;
}

/** SVG drawing coordinates; the element is stretched to its box (`preserveAspectRatio="none"`). */
const W = 24;
const H = 16;

export function CountryFlag({ country, variant = "flag", fallbackCode, selected = false, compact = false }: CountryFlagProps) {
  const styles = useStyles();
  const cfg = pickerCountryConfig(country);
  const code = cfg?.iso2 ?? fallbackCode ?? "";
  const boxW = compact ? 24 : selected ? 40 : 36;
  const boxH = compact ? 16 : selected ? 28 : 24;

  if (variant === "code" || (!cfg && code)) {
    return (
      <span
        className={mergeClasses(styles.badge, selected && styles.badgeSelected, compact && styles.badgeCompact)}
        aria-hidden="true"
        data-testid="country-flag-code"
      >
        {code}
      </span>
    );
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
    body = <rect x={0} y={0} width={W} height={H} fill={palette.Grayscale20} />;
  }
  return (
    <svg
      className={compact ? styles.flagCompact : styles.flag}
      width={boxW} height={boxH} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      aria-hidden="true" data-testid="country-flag"
    >
      {body}
    </svg>
  );
}
