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
  DocumentRegular, MoreHorizontalRegular, PlayRegular, DataBarVerticalRegular,
  GlassesRegular, OpenRegular, TextNumberListLtrRegular,
  ChevronDownRegular, DocumentCheckmarkRegular, DocumentDismissRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { palette, space } from "@/theme/tokens";
import { useCommandRowStyles } from "./commandRow";

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
  | "ActivateOrders" | "DeactivateOrders";

const ICONS: Record<CommandIcon, ReactElement> = {
  Add: <AddRegular />,
  Edit: <EditRegular />,
  Delete: <DeleteRegular />,
  Refresh: <ArrowSyncRegular />,
  Save: <SaveRegular />,
  Document: <DocumentRegular />,
  More: <MoreHorizontalRegular />,
  Play: <PlayRegular />,
  BIDashboard: <DataBarVerticalRegular />,
  ReadingMode: <GlassesRegular />,
  View: <OpenRegular />,
  NumberedList: <TextNumberListLtrRegular />,
  // MDL2 `ActivateOrders` / `DeactivateOrders` are a document with a tick / a cross.
  ActivateOrders: <DocumentCheckmarkRegular />,
  DeactivateOrders: <DocumentDismissRegular />,
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
}

const useStyles = makeStyles({
  bar: {
    display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: space.xs,
    minHeight: "40px",
    // Fluent's Toolbar padding (4 px 8 px) — the horizontal part is what is removed.
    paddingLeft: 0, paddingRight: 0,
  },
  command: {
    // `palette.neutralPrimary` is #000000 — the canvas label colour, sampled.
    color: palette.neutralPrimary,
    fontWeight: "400",
    // Only the leading icon carries the brand colour.
    "& .fui-Button__icon": { color: palette.themePrimary },
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
}

export function CommandBar({ commands, onCommand, children, ariaLabel, testIdPrefix = "command" }: CommandBarProps) {
  const styles = useStyles();
  const row = useCommandRowStyles();
  const childrenOf = (key: string) => commands.filter((c) => c.parentKey === key);
  return (
    <Toolbar className={mergeClasses(styles.bar, row.row)} aria-label={ariaLabel}>
      {commands.filter((c) => !c.parentKey).map((c) => {
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
        return (
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
      })}
      {children}
    </Toolbar>
  );
}
