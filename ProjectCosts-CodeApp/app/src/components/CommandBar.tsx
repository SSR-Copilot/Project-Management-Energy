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
  GlassesRegular, OpenRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { palette, space } from "@/theme/tokens";

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
  | "Play" | "BIDashboard" | "ReadingMode" | "View";

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
};

export interface Command {
  key: string;
  label: string;
  icon?: CommandIcon;
  enabled?: boolean;
}

const useStyles = makeStyles({
  bar: {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.xs,
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
}

export function CommandBar({ commands, onCommand, children, ariaLabel }: CommandBarProps) {
  const styles = useStyles();
  return (
    <Toolbar className={styles.bar} aria-label={ariaLabel}>
      {commands.map((c) => {
        const enabled = c.enabled !== false;
        return (
          <Button
            key={c.key}
            appearance="transparent"
            className={mergeClasses(styles.command, !enabled && styles.disabled)}
            icon={c.icon ? ICONS[c.icon] : undefined}
            disabled={!enabled}
            onClick={() => onCommand(c.key)}
            data-testid={`command-${c.key}`}
          >
            {c.label}
          </Button>
        );
      })}
      {children}
    </Toolbar>
  );
}
