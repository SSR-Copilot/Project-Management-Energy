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
  Button, Toolbar, makeStyles, mergeClasses,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, ArrowSyncRegular, SaveRegular,
  DocumentRegular, MoreHorizontalRegular, PlayRegular, DataBarVerticalRegular,
  GlassesRegular, OpenRegular, TextNumberListLtrRegular, PauseRegular, CheckmarkRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { palette } from "@/theme/tokens";
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
  | "Play" | "BIDashboard" | "ReadingMode" | "View"
  // M13: the Application Settings commands (CAPEX Accounts' `CapexToolbar` icons, same glyphs).
  | "Reorder" | "Activate" | "Deactivate" | "Apply";

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
  /** E3: `false` = not rendered (replaces callers' `.filter`). Default true. */
  visible?: boolean;
  /**
   * E3: a disabled command that says why — focusable, `aria-disabled`, the reason as a tooltip
   * description (C4 `DisabledReason`). Only used while the command is disabled.
   */
  disabledReason?: string;
}

const useStyles = makeStyles({
  /**
   * No explicit `gap`. The canvas `cat_PowerCAT.CommandBar` PCF carries no `Gap`/`Items
   * Padding` property in its own `Items`/`Properties` table (checked against the extracted
   * `.pa.yaml`), and the bundled PCF's own CSS doesn't expose a readable spacing rule either
   * — this control wraps Fluent v8's `CommandBar`, whose own convention is adjacent buttons
   * with no added gap, relying on each button's own internal padding for visual separation,
   * the same way Office's command bars are spaced. An earlier `gap: space.xs` here added 4px
   * on top of that per-button padding with no canvas measurement behind it — removed rather
   * than kept on a guess.
   */
  bar: {
    display: "flex", flexWrap: "wrap", alignItems: "center",
    minHeight: "40px",
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
  /** E3: the Fluent `Toolbar` size. Omitted = Fluent's default, as today. */
  size?: "small" | "medium";
  /** E3: an extra class on the bar (Check List Settings sets `paddingLeft: 0`). */
  className?: string;
}

export function CommandBar({ commands, onCommand, children, ariaLabel, size, className }: CommandBarProps) {
  const styles = useStyles();
  return (
    <Toolbar className={mergeClasses(styles.bar, className)} aria-label={ariaLabel} {...(size ? { size } : {})}>
      {commands.filter((c) => c.visible !== false).map((c) => {
        const enabled = c.enabled !== false;
        const button = (
          <Button
            key={c.key}
            appearance="transparent"
            className={mergeClasses(styles.command, !enabled && styles.disabled)}
            icon={c.icon ? ICONS[c.icon] : undefined}
            disabled={!enabled}
            onClick={() => onCommand(c.key)}
            /*
             * Tosca rule 1 — explicit, not inferred from the text node. The caption is the
             * label (rule 2: from configuration), so this is the same string the user reads
             * and the same one a screen reader announced before. The canvas `ItemKey` stays in
             * `data-testid`, where the canvas control name belongs.
             */
            aria-label={c.label}
            data-testid={`command-${c.key}`}
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
