/**
 * The screen frame: header, optional left rail, content, footer.
 *
 * **The rail is per-screen, not global.** The Main Project Overview has no left rail — it is
 * a flat, full-width project list (the reference screenshots, and the r02 UI note: "Left rail:
 * None on this screen"). The rail belongs to the five cost screens, which is where the canvas
 * app instanced `cmp_Left_Navigation`. Rendering it on the overview both wastes 200 px of the
 * widest grid in the app and shows cost sections before a project is chosen.
 *
 * The footer version string is `lbl_Contracts_FooterVersion.Text` = `"Version " & gblAppVersion`.
 */
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { useState, type ReactNode } from "react";
import { layout, space } from "@/theme/tokens";
import { AppHeader, type AppHeaderProps } from "./AppHeader";
import { CommandSlotProvider } from "./CommandSlot";
import { LeftNav } from "./LeftNav";

const useStyles = makeStyles({
  shell: {
    display: "flex", flexDirection: "column",
    height: "100vh",
    minHeight: 0,
    // The ground behind the header, rail and content cards.
    backgroundColor: "#ebebeb",
  },
  // `minWidth: 0` is load-bearing: without it this row's flex items keep `min-width: auto`
  // and a wide screen pushes the row past the shell, which is a horizontal page scrollbar.
  body: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },
  content: {
    flex: 1, minWidth: 0, minHeight: 0,
    display: "flex", flexDirection: "column",
    overflow: "auto",
    paddingTop: space.m,
    paddingRight: space.l,
    paddingBottom: space.m,
    paddingLeft: space.l,
    gap: space.m,
  },
  footer: {
    display: "flex", alignItems: "center",
    minHeight: `${layout.footerHeight}px`,
    paddingLeft: space.l, paddingRight: space.l,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  footerText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
});

export interface AppShellProps extends Omit<AppHeaderProps, "commandSlotRef"> {
  children: ReactNode;
  /** The cost screens show the rail; the project overview does not. */
  showRail?: boolean;
}

export function AppShell({ children, showRail = true, ...header }: AppShellProps) {
  const styles = useStyles();
  // A ref callback into state, not a `useRef`: the portal has to re-render once the element
  // exists, and a ref object mutating does not trigger that.
  const [commandSlot, setCommandSlot] = useState<HTMLDivElement | null>(null);

  return (
    <CommandSlotProvider element={commandSlot}>
      <div className={`${styles.shell} canvas-shell ${showRail ? "canvas-cost-shell" : "canvas-overview-shell"}`}>
        <AppHeader {...header} commandSlotRef={setCommandSlot} />
        <div className={styles.body}>
          {showRail ? <LeftNav /> : null}
          <main className={styles.content}>{children}</main>
        </div>
        {showRail ? <footer className={styles.footer}>
          <Text className={styles.footerText}>{`Version ${header.appVersion ?? ""}`}</Text>
        </footer> : null}
      </div>
    </CommandSlotProvider>
  );
}
