/**
 * CommandBar — NEW. Replaces the `cat_PowerCAT.CommandBar` instances that appear on 19 of
 * the 23 screens. In the canvas apps the command list is an `Items` table where every row
 * carries its own permission/visibility expression; that shape is preserved so the rules
 * stay declarative and testable.
 *
 * Responsive: commands past `maxInline` move into an overflow menu; below md everything
 * except the primary command overflows.
 */
import { useMemo } from "react";
import {
  Toolbar, ToolbarButton, ToolbarDivider, Menu, MenuTrigger, MenuPopover, MenuList,
  MenuItem, makeStyles, tokens, Tooltip,
} from "@fluentui/react-components";
import { MoreHorizontalRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { space, media } from "@/theme/tokens";
import { useBreakpoint } from "./useBreakpoint";

export interface Command {
  key: string;
  label: string;
  icon?: ReactElement;
  onClick: () => void;
  /** Canvas `ItemEnabled` */
  disabled?: boolean;
  /** Canvas `ItemVisible` */
  visible?: boolean;
  primary?: boolean;
  danger?: boolean;
  /** Explains a disabled command — the canvas apps had no such affordance. */
  disabledReason?: string;
  dividerBefore?: boolean;
}

const useStyles = makeStyles({
  bar: {
    display: "flex", alignItems: "center", gap: space.xs,
    padding: `6px ${space.m}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    position: "sticky", top: 0, zIndex: 2,
    overflowX: "auto",
    [media.belowMd]: { padding: `6px ${space.s}` },
  },
  spacer: { flex: 1 },
  danger: { color: tokens.colorPaletteRedForeground1 },
});

export function CommandBar({
  commands, maxInline = 6, trailing,
}: { commands: Command[]; maxInline?: number; trailing?: React.ReactNode }) {
  const s = useStyles();
  const bp = useBreakpoint();
  const shown = useMemo(() => commands.filter((c) => c.visible !== false), [commands]);
  const limit = bp.belowMd ? 1 : bp.belowLg ? 3 : maxInline;
  const inline = shown.slice(0, limit);
  const overflow = shown.slice(limit);

  return (
    <Toolbar className={s.bar} aria-label="Actions">
      {inline.map((c) => {
        const btn = (
          <ToolbarButton
            key={c.key}
            icon={c.icon}
            appearance={c.primary ? "primary" : "subtle"}
            disabled={c.disabled}
            onClick={c.onClick}
            className={c.danger ? s.danger : undefined}
          >
            {c.label}
          </ToolbarButton>
        );
        return c.disabled && c.disabledReason ? (
          <Tooltip key={c.key} content={c.disabledReason} relationship="label" withArrow>
            <span>{btn}</span>
          </Tooltip>
        ) : (
          btn
        );
      })}

      {overflow.length > 0 && (
        <>
          {inline.length > 0 && <ToolbarDivider />}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <ToolbarButton icon={<MoreHorizontalRegular />} aria-label="More actions" />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {overflow.map((c) => (
                  <MenuItem key={c.key} icon={c.icon} disabled={c.disabled} onClick={c.onClick}>
                    {c.label}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </>
      )}

      {trailing && <><span className={s.spacer} />{trailing}</>}
    </Toolbar>
  );
}
