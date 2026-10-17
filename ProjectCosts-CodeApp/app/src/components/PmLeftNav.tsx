/**
 * Left rail for Project Management screens: `PM_NAV_ITEMS`, with links that substitute the
 * `:projectId` route param (`pmNavHref`) rather than the Cost rail's `?projectId=` query.
 */
import { useLocation, useParams } from "react-router-dom";
import { PM_NAV_ITEMS, activePmNavKey, pmNavHref } from "@/app/navigation-pm";
import { SectionRail } from "./SectionRail";

export function PmLeftNav() {
  const { pathname } = useLocation();
  const { projectId } = useParams<{ projectId?: string }>();
  return (
    <SectionRail
      items={PM_NAV_ITEMS}
      activeKey={activePmNavKey(pathname)}
      hrefFor={(item) => pmNavHref(item, projectId)}
      ariaLabel="Project sections"
    />
  );
}
