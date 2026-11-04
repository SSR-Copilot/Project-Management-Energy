/**
 * Replaces `cat_PowerCAT.CommandBar` (7 instances across the Cost app).
 *
 * The PowerCAT control took an `Items` table of
 * `{ ItemKey, ItemDisplayName, ItemIconName, ItemEnabled }` and raised `OnSelect` with
 * `Self.Selected.ItemKey`. That is exactly this component's contract, minus the JSON theme
 * string the canvas app had to pass it (`Theme: =gblAppThemeJson`) — Fluent inherits the
 * theme from `FluentProvider`.
 *
 * The rendered form, sampled off `UI Screenshots/Cost App - Contracts Tab Selected -
 * Expanded Contract.png`, is a BLACK label with a blue leading icon — not a blue button.
 * "Add Development Contract" reads (0, 0, 0) across its glyphs and its `+` reads the VSB
 * blue; the disabled "Edit"/"Delete" read #595959 with a #c8c6c4 icon. An earlier note here
 * claimed blue text, which is what the whole bar had become.
 */
import {
  Button, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Toolbar, makeStyles,
  mergeClasses,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, ArrowSyncRegular, SaveRegular,
  DocumentRegular, MoreHorizontalRegular, PlayRegular,
  GlassesRegular, OpenRegular, TextNumberListLtrRegular,
  ChevronDownRegular, DocumentCheckmarkRegular, DocumentDismissRegular, PauseRegular, CheckmarkRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { palette, space } from "@/theme/tokens";
import { useCommandRowStyles } from "./commandRow";
import { DisabledReason } from "./DisabledReason";

/**
 * The PowerCAT `ItemIconName` values both apps actually use, mapped to their Fluent v9
 * equivalents.
 *
 * These are the names that appear in the canvas `Items` tables, so a command's icon is
 * whatever the canvas asked for rather than a fresh choice: `Play` for Simulate,
 * `BIDashboard` for Dashboard, `ReadingMode` for the View-only degradation of Edit.
 */
export type CommandIcon =
  | "Add" | "Edit" | "Delete" | "Refresh" | "Save" | "Document" | "More"
  | "Play" | "BIDashboard" | "ReadingMode" | "View" | "NumberedList"
  | "ActivateOrders" | "DeactivateOrders"
  // The Application Settings commands (CAPEX Accounts / Default Checklists toolbars).
  | "Reorder" | "Activate" | "Deactivate" | "Apply";

/**
 * MDL2 `BIDashboard` (U+F543, fabric-icons-14 of `@fluentui/font-icons-mdl2`), the exact canvas glyph
 * (`data-icon-name="BIDashboard"`): four outlined bars under a line graph with ringed points. The glyph's
 * own outline on its 2048-unit em, extracted from `fabric-icons-14-5cf58db8.woff` (PO, 4 Nov 2026) —
 * Fluent v9 has only lookalikes (`DataBarVertical*`). 1em square, drawn in the icon slot's colour.
 */
const BI_DASHBOARD_PATH =
  "M512 896H896V2048H512ZM640 1920H768V1024H640ZM1024 1152H1408V2048H1024ZM1152 1920H1280V1280H1152ZM0 1408H384V2048H0ZM128 1920H256V1536H128ZM1536 640H1920V2048H1536ZM1664 1920H1792V768H1664ZM1389 621Q1408 662 1408 704Q1408 744 1393 779Q1378 814 1352 840Q1326 866 1291 881Q1256 896 1216 896Q1176 896 1141 881Q1106 866 1080 840Q1054 814 1039 779Q1024 744 1024 704Q1024 698 1024 692Q1024 686 1025 680L837 586Q811 612 776 626Q741 640 704 640Q662 640 621 621L365 877Q384 918 384 960Q384 1000 369 1035Q354 1070 328 1096Q302 1122 267 1137Q232 1152 192 1152Q152 1152 117 1137Q82 1122 56 1096Q30 1070 15 1035Q0 1000 0 960Q0 920 15 885Q30 850 56 824Q82 798 117 783Q152 768 192 768Q234 768 275 787L531 531Q512 490 512 448Q512 408 527 373Q542 338 568 312Q594 286 629 271Q664 256 704 256Q744 256 779 271Q814 286 840 312Q866 338 881 373Q896 408 896 448Q896 454 896 460Q896 466 895 472L1083 566Q1109 540 1144 526Q1179 512 1216 512Q1258 512 1299 531L1555 275Q1536 234 1536 192Q1536 152 1551 117Q1566 82 1592 56Q1618 30 1653 15Q1688 0 1728 0Q1768 0 1803 15Q1838 30 1864 56Q1890 82 1905 117Q1920 152 1920 192Q1920 232 1905 267Q1890 302 1864 328Q1838 354 1803 369Q1768 384 1728 384Q1686 384 1645 365ZM192 1024Q218 1024 237 1005Q256 986 256 960Q256 934 237 915Q218 896 192 896Q166 896 147 915Q128 934 128 960Q128 986 147 1005Q166 1024 192 1024ZM1728 128Q1702 128 1683 147Q1664 166 1664 192Q1664 218 1683 237Q1702 256 1728 256Q1754 256 1773 237Q1792 218 1792 192Q1792 166 1773 147Q1754 128 1728 128ZM704 512Q730 512 749 493Q768 474 768 448Q768 422 749 403Q730 384 704 384Q678 384 659 403Q640 422 640 448Q640 474 659 493Q678 512 704 512ZM1216 768Q1242 768 1261 749Q1280 730 1280 704Q1280 678 1261 659Q1242 640 1216 640Q1190 640 1171 659Q1152 678 1152 704Q1152 730 1171 749Q1190 768 1216 768Z";
// The 2048 em padded to 80 % of the box (16 px in a 20 px slot), as the canvas command bar draws MDL2 glyphs.
const BIDashboardIcon = () => (
  <svg width="1em" height="1em" viewBox="-256 -256 2560 2560" fill="currentColor" aria-hidden="true"
    data-icon-name="BIDashboard">
    <path d={BI_DASHBOARD_PATH} />
  </svg>
);

const ICONS: Record<CommandIcon, ReactElement> = {
  Add: <AddRegular />,
  Edit: <EditRegular />,
  Delete: <DeleteRegular />,
  Refresh: <ArrowSyncRegular />,
  Save: <SaveRegular />,
  Document: <DocumentRegular />,
  More: <MoreHorizontalRegular />,
  Play: <PlayRegular />,
  // The exact canvas glyph, `data-icon-name="BIDashboard"` (above).
  BIDashboard: <BIDashboardIcon />,
  ReadingMode: <GlassesRegular />,
  View: <OpenRegular />,
  NumberedList: <TextNumberListLtrRegular />,
  // MDL2 `ActivateOrders` / `DeactivateOrders` are a document with a tick / a cross.
  ActivateOrders: <DocumentCheckmarkRegular />,
  DeactivateOrders: <DocumentDismissRegular />,
  Reorder: <TextNumberListLtrRegular />,
  Activate: <PlayRegular />,
  Deactivate: <PauseRegular />,
  Apply: <CheckmarkRegular />,
};

export interface Command {
  key: string;
  label: string;
  icon?: CommandIcon;
  enabled?: boolean;
  /** Why a disabled command is disabled — shown as its tooltip (`title`) while disabled. */
  reason?: string;
  /**
   * PowerCAT `ItemParentKey`: the key of the command this one sits UNDER. A command that has
   * children renders as a drop-down (chevron) listing them, and selecting a child raises
   * `onCommand` with the child's key. The canvas computes it per render (Generators puts BESS
   * under "Add Others" until a BESS row is selected), so pass `undefined` for top level.
   */
  parentKey?: string;
  /** `false` = not rendered (Application Settings screens). Default true. */
  visible?: boolean;
  /**
   * A disabled command that says why in a focusable tooltip (`DisabledReason`), used by the
   * Application Settings screens. Only applies while the command is disabled; top-level only.
   */
  disabledReason?: string;
}

const useStyles = makeStyles({
  bar: {
    display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: space.xs,
    minHeight: "40px",
    // Fluent's Toolbar padding (4 px 8 px) — the horizontal part is what is removed.
    paddingLeft: 0, paddingRight: 0,
  },
  command: {
    // The PowerCAT command bar's text, measured in the Canvas app (computed colour rgb(50, 49, 48), 29 Oct 2026): #323130, not black.
    color: "#323130",
    fontWeight: "400",
    // Only the leading icon carries the brand colour.
    "& .fui-Button__icon": { color: palette.themePrimary },
    /*
     * The PowerCAT command bar is Fluent v8's `CommandBar`; its `CommandBarButton` states, verbatim
     * (`CommandBarButton.styles.ts`) on the VSB palette: hover `neutralLighter` fill + `neutralDark`
     * text + `themeDarkAlt` icon; pressed and menu-open `neutralLight` + `themeDark` icon; an open
     * menu hovered `neutralQuaternaryAlt`; the chevron `neutralPrimary`. Fluent v9's transparent
     * button had no fill on hover at all (user, 3 Nov 2026).
     */
    ":enabled:hover": {
      backgroundColor: palette.neutralLighter, color: palette.neutralDark,
      "& .fui-Button__icon": { color: palette.themeDarkAlt },
      "& .fui-MenuButton__menuIcon": { color: palette.neutralPrimary },
    },
    ":enabled:hover:active": {
      backgroundColor: palette.neutralLight, color: palette.neutralDark,
      "& .fui-Button__icon": { color: palette.themeDark },
    },
    "&[aria-expanded='true']": {
      backgroundColor: palette.neutralLight, color: palette.neutralDark,
      "& .fui-Button__icon": { color: palette.themeDark },
    },
    "&[aria-expanded='true']:hover": { backgroundColor: palette.neutralQuaternaryAlt },
  },
  disabled: {
    // Fluent already dims a disabled button; the canvas greys the label to #595959
    // (`neutralTertiary`) and the icon to #c8c6c4 (`neutralTertiaryAlt`), which is heavier.
    color: palette.neutralTertiary,
    "& .fui-Button__icon": { color: palette.neutralTertiaryAlt },
  },
});

export interface CommandBarProps {
  commands: readonly Command[];
  onCommand: (key: string) => void;
  /** Rendered to the right of the commands — the toggles the Capex screen puts there. */
  children?: React.ReactNode;
  ariaLabel: string;
  /**
   * The `data-testid` stem; each command renders `${testIdPrefix}-${key}`. Defaults to
   * `"command"`. A bar repeated per gallery card passes ``${canvasName}-${row.id}`` so every
   * card's commands stay unique (CONVENTIONS rule 16).
   */
  testIdPrefix?: string;
  /** The Fluent `Toolbar` size (Application Settings). Omitted = Fluent's default. */
  size?: "small" | "medium";
  /** An extra class on the bar (Application Settings). */
  className?: string;
}

export function CommandBar({
  commands, onCommand, children, ariaLabel, testIdPrefix = "command", size, className,
}: CommandBarProps) {
  const styles = useStyles();
  const row = useCommandRowStyles();
  const shown = commands.filter((c) => c.visible !== false);
  const childrenOf = (key: string) => shown.filter((c) => c.parentKey === key);
  return (
    <Toolbar className={mergeClasses(styles.bar, row.row, className)} aria-label={ariaLabel} {...(size ? { size } : {})}>
      {shown.filter((c) => !c.parentKey).map((c) => {
        const enabled = c.enabled !== false;
        const subItems = childrenOf(c.key);
        if (subItems.length > 0) {
          return (
            <Menu key={c.key}>
              <MenuTrigger disableButtonEnhancement>
                <MenuButton
                  appearance="transparent"
                  className={mergeClasses(row.command, styles.command, !enabled && styles.disabled)}
                  icon={c.icon ? ICONS[c.icon] : undefined}
                  menuIcon={<ChevronDownRegular />}
                  disabled={!enabled}
                  title={!enabled && c.reason ? c.reason : undefined}
                  aria-label={c.label}
                  data-testid={`${testIdPrefix}-${c.key}`}
                >
                  {c.label}
                </MenuButton>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {subItems.map((s) => (
                    <MenuItem
                      key={s.key}
                      icon={s.icon ? ICONS[s.icon] : undefined}
                      disabled={s.enabled === false}
                      title={s.enabled === false && s.reason ? s.reason : undefined}
                      onClick={() => onCommand(s.key)}
                      aria-label={s.label}
                      data-testid={`${testIdPrefix}-${s.key}`}
                    >
                      {s.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          );
        }
        const button = (
          <Button
            key={c.key}
            appearance="transparent"
            className={mergeClasses(row.command, styles.command, !enabled && styles.disabled)}
            icon={c.icon ? ICONS[c.icon] : undefined}
            disabled={!enabled}
            title={!enabled && c.reason ? c.reason : undefined}
            onClick={() => onCommand(c.key)}
            /*
             * Tosca rule 1 — explicit, not inferred from the text node. The caption is the
             * label (rule 2: from configuration), so this is the same string the user reads
             * and the same one a screen reader announced before. The canvas `ItemKey` stays in
             * `data-testid`, where the canvas control name belongs.
             */
            aria-label={c.label}
            data-testid={`${testIdPrefix}-${c.key}`}
          >
            {c.label}
          </Button>
        );
        return !enabled && c.disabledReason
          ? <DisabledReason key={c.key} reason={c.disabledReason}>{button}</DisabledReason>
          : button;
      })}
      {children}
    </Toolbar>
  );
}
