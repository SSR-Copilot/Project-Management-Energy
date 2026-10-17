/**
 * `ItemIconName` from the canvas navigation tables (`LeftNavigationMenu`, `LeftAdminNavigationMenu`
 * in `App.pa.yaml`), which name Fabric icons, mapped to their Fluent v9 equivalents.
 */
import {
  BookOpenFilled, CalendarClockRegular, ClockAlarmRegular, DocumentEditRegular,
  DocumentPersonRegular, InfoRegular, MoneyRegular, PeopleSettingsRegular, TableSimpleRegular,
  TaskListLtrRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { NavItem } from "@/app/navigation";

export const NAV_ICONS: Record<NavItem["icon"], ReactElement> = {
  projects: <TableSimpleRegular />,
  // ReadingModeSolid — an open book, and the only FILLED glyph in the Cost rail.
  capex: <BookOpenFilled />,
  opex: <DocumentEditRegular />,      // PageEdit
  document: <DocumentEditRegular />,  // PageEdit
  // TextDocumentShared — a document with a person, not a plain sheet of lines.
  contract: <DocumentPersonRegular />,
  currency: <MoneyRegular />,         // AllCurrency
  info: <InfoRegular />,
  checklist: <TaskListLtrRegular />,  // CheckList
  gates: <ClockAlarmRegular />,       // ReminderGroup
  accounts: <PeopleSettingsRegular />, // AccountManagement
  calendar: <CalendarClockRegular />, // DateTime
};
