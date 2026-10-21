/**
 * The VSB palette expressed as a Fluent v9 theme.
 *
 * `createLightTheme` takes a 16-step brand ramp. The canvas palette gives us nine usable
 * blues, so the ramp is filled by mapping each canvas value onto the Fluent slot whose role
 * matches, and interpolating only where the canvas has no equivalent. The four slots the
 * canvas never defined (`10`, `20`, `30`) are darker than `themeDarker`, so they extend the
 * ramp downwards rather than inventing a new hue.
 *
 * Fluent's brand ramp drives `colorBrandBackground` (slot 80), `colorBrandForegroundLink`
 * (slot 80) and hover/pressed states (70/60), so slot 80 is pinned to `themePrimary` —
 * that is what makes a Fluent primary button the same blue as the canvas one.
 */
import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";
import { palette, fontFamily } from "./tokens";

const vsbBrand: BrandVariants = {
  10: "#000c17",
  20: "#001526",
  30: "#002440",
  40: palette.themeDarker, //  #003f68
  50: "#00497a",
  60: palette.themeDark, //    #00558d
  70: palette.themeDarkAlt, // #0065a8
  80: palette.themePrimary, // #006eb9  ← the VSB blue
  90: palette.themeSecondary, // #177ec2
  100: palette.themeTertiary, // #55a2d6
  110: palette.akzent1, //     #469bd7
  120: palette.themeLight, //  #a4ceea
  130: "#bcdcf0",
  140: palette.themeLighter, //#cde4f4
  150: "#e2eff8",
  160: palette.themeLighterAlt, // #f2f8fc
};

const base: Theme = createLightTheme(vsbBrand);

export const vsbTheme: Theme = {
  ...base,
  fontFamilyBase: fontFamily,
  // The canvas app's neutrals are noticeably cooler and higher-contrast than Fluent's
  // defaults; these four carry most of the visual difference.
  colorNeutralForeground1: palette.neutralPrimary,
  colorNeutralForeground2: palette.neutralSecondary,
  colorNeutralForeground3: palette.neutralTertiary,
  colorNeutralBackground1: palette.white,
  colorNeutralBackground2: palette.Grayscale40,
  colorNeutralBackground3: palette.Grayscale30,
  colorNeutralStroke1: palette.Grayscale20,
  colorNeutralStroke2: palette.neutralLight,
  // Semantic colours the Cost screens use directly.
  colorPaletteRedForeground1: palette.Error,
  colorPaletteGreenForeground1: palette.Success,
  colorPaletteGreenBackground1: palette.SuccessLight,
  colorPaletteDarkOrangeForeground1: palette.Warning,
};
