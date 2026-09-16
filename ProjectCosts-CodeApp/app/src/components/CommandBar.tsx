/**
 * Replaces `cat_PowerCAT.CommandBar` (7 instances across the Cost app).
 *
 * The PowerCAT control took an `Items` table of
 * `{ ItemKey, ItemDisplayName, ItemIconName, ItemEnabled }` and raised `OnSelect` with
 * `Self.Selected.ItemKey`. That is exactly this component's contract, minus the JSON theme
 * string the canvas app had to pass it (`Theme: =gblAppThemeJson`) — Fluent inherits the
 * theme from `FluentProvider`.
 *
 * Screenshot r07 shows the rendered form: blue text buttons with a leading icon, and
 * disabled commands greyed out.
 */
import {
  Button, Toolbar, makeStyles, tokens, mergeClasses,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, ArrowSyncRegular, SaveRegular,
  DocumentRegular, MoreHorizontalRegular, PlayRegular, DataBarVerticalRegular,
  GlassesRegular, OpenRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { space } from "@/theme/tokens";

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
    color: tokens.colorBrandForegroundLink,
    fontWeight: tokens.fontWeightRegular,
  },
  disabled: {
    // Fluent already dims a disabled button; this matches the canvas' heavier greying so
    // the two apps read the same side by side.
    color: tokens.colorNeutralForegroundDisabled,
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
