/**
 * F2 command row (ACS:993-1251): "Add Contract Type" menu (O&M / Land Lease / Other) or
 * "Add Cost" (DEVEX/CAPEX).
 *
 * The parent menu item only opens the menu. Each child is disabled when that
 * sub-account already has a contract in the scope or when creating is not permitted.
 * "Apply" is drawn disabled with its info text, as in the canvas (`ApplyStrip`).
 */
import {
  Button, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Toolbar, makeStyles,
} from "@fluentui/react-components";
import { AddFilled, MoreHorizontalRegular } from "@fluentui/react-icons";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import type { MenuItemView } from "./rules";
import { ApplyStrip } from "./ApplyStrip";

/*
 * The canvas row is 70 px high with the tinted Apply band 45 px high at Y = 10
 * (ACS:796-817), starting right after the command: X = 180 for the "Add Contract Type" bar
 * (ACS:1154, `If(Not(DEVEX/CAPEX), 180, 140)`) and X = 140 for the 120 px "Add Cost" button
 * placed at X = 5 (ACS:1250). The band runs to the right edge of the section.
 */
const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", columnGap: "0", flexWrap: "wrap", paddingTop: "10px", paddingBottom: "15px" },
  leadContract: { flex: "0 0 auto", boxSizing: "border-box", width: "180px" },
  leadDevex: { flex: "0 0 auto", boxSizing: "border-box", width: "140px", paddingLeft: "5px" },
});

export interface CategoryCommandRowProps {
  title: string;
  /** `CostCategoryDef.key` — the stem of this row's test ids. */
  sectionKey: string;
  /** DEVEX: Add Cost; otherwise the contract menu. */
  kind: "devex" | "contract";
  menuItems?: readonly MenuItemView[];
  canCreate: boolean;
  onAddCost?: () => void;
  onAddContract?: (item: MenuItemView) => void;
}

export function CategoryCommandRow({ title, sectionKey, kind, menuItems = [], canCreate, onAddCost, onAddContract }: CategoryCommandRowProps) {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  return (
    <Toolbar className={styles.row} aria-label={`${title} actions`}>
      {kind === "devex" ? (
        <div className={styles.leadDevex}>
          <Button
            appearance="outline"
            className={brand.brandOutline}
            icon={<AddFilled />}
            disabled={!canCreate}
            aria-label="Add Cost"
            data-testid="cost-devex-add"
            onClick={onAddCost}
          >
            Add Cost
          </Button>
        </div>
      ) : (
        <div className={styles.leadContract}>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton
              appearance="transparent"
              icon={<MoreHorizontalRegular />}
              aria-label={`Add Contract Type (${title})`}
              data-testid={`cost-add-contract-${sectionKey}`}
            >
              Add Contract Type
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {menuItems.length === 0 ? (
                <MenuItem
                  disabled
                  aria-label="No sub-accounts available"
                  data-testid={`cost-add-contract-${sectionKey}-none`}
                >
                  No sub-accounts available
                </MenuItem>
              ) : null}
              {menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  disabled={item.disabled || !canCreate}
                  aria-label={item.disabled ? `${item.label} (contract already exists)` : item.label}
                  data-testid={`cost-add-contract-${sectionKey}-${item.id}`}
                  onClick={() => onAddContract?.(item)}
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        </div>
      )}
      <ApplyStrip scope="section" title={title} sectionKey={sectionKey} />
    </Toolbar>
  );
}
