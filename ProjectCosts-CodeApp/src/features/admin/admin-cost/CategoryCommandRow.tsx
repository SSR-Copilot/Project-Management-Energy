/**
 * F2 command row (ACS:993-1251, `con_LandLease_Content_Subaccounts_CardBody_Costs_Command_Buttons`):
 * the "Add Contract Type" menu (`cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar`,
 * O&M / Land Lease / Other) or "Add Cost" (`btn_Admin_Cost_DevexCapex_AddCost`, DEVEX/CAPEX).
 *
 * The parent menu item only opens the menu. Each child is disabled when that
 * sub-account already has a contract in the scope (the canvas `ItemEnabled: CountIf(…) = 0`)
 * or when creating is not permitted.
 * The canvas "Apply" strip is not built (D61).
 *
 * The row is repeated per accordion section (canvas `Gallery1`), so each canvas name carries the
 * section key as a suffix (CONVENTIONS rule 16).
 */
import {
  Button, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Toolbar, makeStyles,
} from "@fluentui/react-components";
import { AddFilled, MoreHorizontalRegular } from "@fluentui/react-icons";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import type { MenuItemView } from "./rules";

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
  /** `CostCategoryDef.key` — the suffix of this row's repeated canvas test ids. */
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
    <Toolbar
      className={styles.row}
      aria-label={`${title} actions`}
      data-testid={`con_LandLease_Content_Subaccounts_CardBody_Costs_Command_Buttons-${sectionKey}`}
    >
      {kind === "devex" ? (
        <div className={styles.leadDevex}>
          {/* `btn_Admin_Cost_DevexCapex_AddCost.Text` — "Add Cost", verbatim; no AccessibleLabel. Only on the DEVEX/CAPEX row. */}
          <Button
            appearance="outline"
            className={brand.brandOutline}
            icon={<AddFilled />}
            disabled={!canCreate}
            aria-label="Add Cost"
            data-testid="btn_Admin_Cost_DevexCapex_AddCost"
            onClick={onAddCost}
          >
            Add Cost
          </Button>
        </div>
      ) : (
        <div className={styles.leadContract}>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            {/*
              `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items` root item —
              `ItemDisplayName: "Add Contract Type"`, verbatim. The menu button stays enabled for
              a non-admin (the canvas root is `ItemEnabled: true`); its items are disabled.
            */}
            <MenuButton
              appearance="transparent"
              icon={<MoreHorizontalRegular />}
              aria-label="Add Contract Type"
              data-testid={`cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-${sectionKey}`}
            >
              Add Contract Type
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {menuItems.length === 0 ? (
                // NEW — no canvas equivalent: the canvas menu simply has no children here.
                <MenuItem
                  disabled
                  aria-label="No sub-accounts available"
                  data-testid={`cost-add-contract-${sectionKey}-none`}
                >
                  No sub-accounts available
                </MenuItem>
              ) : null}
              {menuItems.map((item) => (
                // One child per sub-account: `ItemDisplayName` (the sub-account name, or the
                // "TCMA" / "E&CM" relabel) is the visible caption and the name; keyed by `ItemGUID`.
                <MenuItem
                  key={item.id}
                  disabled={item.disabled || !canCreate}
                  aria-label={item.label}
                  data-testid={`cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-${sectionKey}-${item.id}`}
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
    </Toolbar>
  );
}
