import {
  createLightTheme, createDarkTheme,
  type BrandVariants, type Theme,
} from "@fluentui/react-components";
import { palette } from "./tokens";

/**
 * Fluent v9 brand ramp generated around the canvas app's themePrimary (#006eb9).
 * Slots 10-160 run darkest to lightest; slot 80 is the primary.
 */
export const vsbBrand: BrandVariants = {
  10: "#001521",
  20: "#001C2E",
  30: "#00293F",
  40: "#003553",
  50: "#003f68",
  60: "#00497A",
  70: "#00558d",
  80: "#0065a8",
  90: "#006eb9",
  100: "#177ec2",
  110: "#2E8CCB",
  120: "#469bd7",
  130: "#55a2d6",
  140: "#7FBBE3",
  150: "#a4ceea",
  160: "#cde4f4",
};

export const vsbLightTheme: Theme = {
  ...createLightTheme(vsbBrand),
  colorNeutralBackground1: palette.white,
  colorNeutralBackground2: palette.Grayscale40,
  colorNeutralBackground3: palette.Grayscale30,
  colorNeutralForeground1: palette.Grayscale00,
  colorNeutralForeground2: palette.neutralSecondary,
  colorNeutralForeground3: palette.Grayscale10,
  colorNeutralStroke1: palette.Grayscale20,
  colorNeutralStroke2: palette.neutralLight,
  colorBrandBackground: palette.themePrimary,
  colorBrandBackgroundHover: palette.themeDarkAlt,
  colorBrandBackgroundPressed: palette.themeDark,
  colorPaletteRedForeground1: palette.Error,
  colorPaletteGreenForeground1: palette.Success,
  colorPaletteYellowForeground1: palette.Warning,
  fontFamilyBase:
    "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
};

const dark = createDarkTheme(vsbBrand);
export const vsbDarkTheme: Theme = {
  ...dark,
  colorBrandForeground1: vsbBrand[120],
  colorBrandForeground2: vsbBrand[130],
  fontFamilyBase: vsbLightTheme.fontFamilyBase,
};
