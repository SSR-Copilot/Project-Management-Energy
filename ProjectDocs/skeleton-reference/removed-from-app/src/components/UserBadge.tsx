/**
 * UserBadge — the "Hi {name}" pill, its avatar, and the account menu behind it.
 *
 * This is `cmp_User_Badge` (PM, 178 loc). The canvas extracted it from `cmp_Header` for one
 * reason, which the build spec states outright: it is needed on the two screens that render
 * no header of their own — App Loading and Project Main.
 *
 * The menu is `pcf_cmpHeader_User_ContextMenu_Info`, reproduced row for row from
 * `cmp_User_Badge.pa.yaml`. The canvas `Items` table is, in order:
 *
 *   1. `Hi {User().FullName}`                              (no icon — the menu's own heading)
 *   2. `Application Settings`      Settings        visible on IsApplicationAdministrator or
 *                                                 IsControllerOwnData; navigates to
 *                                                 'Admin Project Default Checklists Screen'
 *   3. `{gblCurrentUser.Mail}`     Mail            visible when the mail is not blank
 *   4. `{Language}, [{Lang}]`      LocaleLanguage
 *   5. `{CompanyName}`             Home
 *   6. `Concat(EditableCounties, name & "; ")`     AddHome
 *   7. `version {gblAppVersion} ({gblEnvironmentName})`     Info
 *
 * Rows 3-7 are read-only labels; only row 2 has an `OnSelect` branch. Rows 5 and 6 render
 * with a blank label when the underlying value is blank, which is why the reference
 * screenshot shows an icon with no text — reproduced rather than hidden, because that is
 * what the canvas `Items` table does.
 *
 * Stock Fluent parts throughout — a `MenuTrigger` `Button` shaped as a pill, plus an
 * `Avatar` — coloured from the brand token, which the light theme already pins to
 * `palette.themePrimary` (#006eb9). No hardcoded hex.
 */
import {
  makeStyles, tokens, Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Avatar,
  MenuDivider,
} from "@fluentui/react-components";
import {
  PersonRegular, SettingsRegular, MailRegular, LocalLanguageRegular, HomeRegular,
  HomeAddRegular, InfoRegular,
} from "@fluentui/react-icons";
import { space, radius, media } from "@/theme/tokens";
import { greeting } from "@/domain/session";

export interface UserBadgeProps {
  displayName: string | null | undefined;
  mail?: string | null;
  /** `gblCurrentUser.Language, [Lang]` — e.g. "en-US, [en]". */
  languageLabel?: string | null;
  /** `gblCurrentUser.CompanyName`. */
  companyName?: string | null;
  /** `Concat(EditableCounties, name & "; ")` — already joined by the caller. */
  editableCountries?: string | null;
  /** `version {gblAppVersion} ({gblEnvironmentName})`. */
  versionLabel?: string | null;
  /** Supplied only when the caller may reach the admin section. */
  onNavigateAppSettings?: () => void;
  /** Below md, drop the pill and show the avatar alone. */
  compact?: boolean;
}

const useStyles = makeStyles({
  root: { display: "flex", alignItems: "center", flex: "none" },
  pill: {
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    // Room for the avatar to overlap the right edge, as the reference screenshots show.
    paddingLeft: space.l,
    paddingRight: "34px",
    minWidth: "0",
    maxWidth: "260px",
    fontWeight: 600,
    justifyContent: "flex-start",
  },
  pillLabel: {
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
  },
  avatarWrap: {
    // Pulled back over the pill's padding so the two read as one control.
    marginLeft: "-30px",
    display: "flex",
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: "2px",
    pointerEvents: "none",
  },
  hideBelowMd: { [media.belowMd]: { display: "none" } },
});

export function UserBadge({
  displayName, mail, languageLabel, companyName, editableCountries, versionLabel,
  onNavigateAppSettings, compact = false,
}: UserBadgeProps) {
  const s = useStyles();
  const name = displayName ?? "";

  return (
    <div className={s.root}>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          {compact ? (
            <Button appearance="subtle" aria-label={greeting(name)}>
              <Avatar size={32} name={name || "User"} icon={<PersonRegular />} color="colorful" />
            </Button>
          ) : (
            <Button appearance="primary" className={s.pill} aria-label={greeting(name)}>
              <span className={s.pillLabel}>{greeting(name)}</span>
            </Button>
          )}
        </MenuTrigger>

        <MenuPopover>
          <MenuList>
            {/* Row 1 — the canvas repeats the greeting as the menu's own heading. */}
            <MenuItem disabled>{name ? greeting(name) : "Not signed in"}</MenuItem>
            <MenuDivider />

            {/* Row 2 — the only actionable row. */}
            {onNavigateAppSettings && (
              <MenuItem icon={<SettingsRegular />} onClick={onNavigateAppSettings}>
                Application Settings
              </MenuItem>
            )}

            {/* Rows 3-7 — read-only. */}
            {mail && <MenuItem icon={<MailRegular />} disabled>{mail}</MenuItem>}
            {languageLabel && (
              <MenuItem icon={<LocalLanguageRegular />} disabled>{languageLabel}</MenuItem>
            )}
            <MenuItem icon={<HomeRegular />} disabled>{companyName ?? ""}</MenuItem>
            <MenuItem icon={<HomeAddRegular />} disabled>{editableCountries ?? ""}</MenuItem>
            {versionLabel && (
              <MenuItem icon={<InfoRegular />} disabled>{versionLabel}</MenuItem>
            )}
          </MenuList>
        </MenuPopover>
      </Menu>

      {/* Decorative: the pill above is the interactive element, so this is not a second
          tab stop and is hidden from the accessibility tree. */}
      {!compact && (
        <span className={s.avatarWrap} aria-hidden="true">
          <Avatar size={32} name={name || "User"} icon={<PersonRegular />} color="colorful" />
        </span>
      )}
    </div>
  );
}
