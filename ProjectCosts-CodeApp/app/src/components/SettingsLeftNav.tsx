/** Left rail for Application Settings — the canvas `LeftAdminNavigationMenu`. */
import { useLocation } from "react-router-dom";
import {
  SETTINGS_NAV_ITEMS, SETTINGS_OPEN_GROUPS, activeSettingsNavKey,
} from "@/app/navigation-settings";
import { SectionRail } from "./SectionRail";

export function SettingsLeftNav() {
  const { pathname } = useLocation();
  return (
    <SectionRail
      items={SETTINGS_NAV_ITEMS}
      activeKey={activeSettingsNavKey(pathname)}
      hrefFor={(item) => item.path ?? "#"}
      ariaLabel="Application settings sections"
      defaultOpenGroups={SETTINGS_OPEN_GROUPS}
    />
  );
}
