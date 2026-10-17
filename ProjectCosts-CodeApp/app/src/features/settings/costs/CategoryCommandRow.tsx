/**
 * F2 command row (ACS:993-1251): "Add Contract Type" menu (O&M / Land Lease / Other) or
 * "Add Cost" (DEVEX/CAPEX).
 *
 * The parent menu item only opens the menu (D-MENU-1). Each child is disabled when that
 * sub-account already has a contract in the scope (FR-18) or when creating is not permitted
 * (FR-33). "Apply" is drawn disabled with its info text, as in the canvas (FR-30, `ApplyStrip`).
 */
import {
  Button, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Toolbar, makeStyles,
} from "@fluentui/react-components";
import { AddFilled, MoreHorizontalRegular } from "@fluentui/react-icons";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import type { MenuItemView } from "./rules";
import { ApplyStrip } from "./ApplyStrip";

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", minHeight: "56px", columnGap: "12px", flexWrap: "wrap" },
});

export interface CategoryCommandRowProps {
  title: string;
  /** DEVEX: Add Cost; otherwise the contract menu. */
  kind: "devex" | "contract";
  menuItems?: readonly MenuItemView[];
  canCreate: boolean;
  onAddCost?: () => void;
  onAddContract?: (item: MenuItemView) => void;
}

export function CategoryCommandRow({ title, kind, menuItems = [], canCreate, onAddCost, onAddContract }: CategoryCommandRowProps) {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  return (
    <Toolbar className={styles.row} aria-label={`${title} actions`}>
      {kind === "devex" ? (
        <Button
          appearance="outline"
          className={brand.brandOutline}
          icon={<AddFilled />}
          disabled={!canCreate}
          aria-label="Add Cost"
          onClick={onAddCost}
        >
          Add Cost
        </Button>
      ) : (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton appearance="transparent" icon={<MoreHorizontalRegular />} aria-label={`Add Contract Type (${title})`}>
              Add Contract Type
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {menuItems.length === 0 ? <MenuItem disabled>No sub-accounts available</MenuItem> : null}
              {menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  disabled={item.disabled || !canCreate}
                  aria-label={item.disabled ? `${item.label} (contract already exists)` : item.label}
                  onClick={() => onAddContract?.(item)}
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
      <ApplyStrip scope="section" title={title} />
    </Toolbar>
  );
}
