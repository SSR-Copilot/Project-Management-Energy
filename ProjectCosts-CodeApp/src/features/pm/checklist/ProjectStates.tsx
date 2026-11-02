/**
 * The cluster movement process — `cmp_Project_States` (the stepper) and the action row under it
 * (`con_Checklist_DisplayProject_Body_Content_Buttons`), split out of `Screen.tsx` (PO screenshot
 * parity, 20 Oct 2026, D29).
 *
 * Presentation only: every value arrives through props, already decided by `rules.ts` in the
 * screen. Nothing here fetches, writes or branches on data beyond picking a style for a value the
 * screen passed in.
 *
 * Colours are `gblAppColors.ApprovalClusterStates` (`App.pa.yaml`), built from the PM app's
 * `gblAppTheme.palette` with the 8-digit hex alphas: NotStarted `Grayscale20` + "90",
 * InProgress `Success` + "60", Completed `Success`, Rejected `Warning` + "20", RequestCanceled
 * `Warning` + "10", Inactive `Warning`.
 */
import type { ReactElement } from "react";
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  ArrowLeftRegular, ArrowResetRegular, CheckmarkRegular, ClockAlarmRegular, DismissRegular, FlashRegular,
  InfoRegular, LockClosedRegular, MailRegular, PeopleRegular, SubtractCircleRegular,
} from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";
import { ARIA, EXCLUDED, UI, type TerminalKind } from "./rules";

/* ─────────────────────────────────────────────────────────────── colours */

/** `gblAppColors.ApprovalClusterStates.*` — the 8-digit hex alphas, transcribed. */
const STATE_FILL = {
  notStarted: "rgba(227, 227, 227, 0.565)",
  inProgress: "rgba(60, 152, 86, 0.376)",
  completed: palette.Success,
  rejected: "rgba(238, 148, 12, 0.125)",
  canceled: "rgba(238, 148, 12, 0.063)",
  inactive: palette.Warning,
} as const;
/** `cmp_CheckList_Project_States.LineColor` = `ColorValue("#6C6C6C50")`. */
const LINE_COLOR = "rgba(108, 108, 108, 0.31)";
/** `gblAppColors.Label.Color` = `palette.black`. */
const LABEL_COLOR = palette.black;
/** The PM app's `palette.Grayscale40` is #FFFFFF (`ButtonSelectedBg`); the Cost palette's is #FAFAFA. */
const PM_GRAYSCALE40 = palette.white;

const edges = (color: string) => ({
  borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
  borderTopStyle: "solid" as const, borderRightStyle: "solid" as const, borderBottomStyle: "solid" as const, borderLeftStyle: "solid" as const,
  borderTopColor: color, borderRightColor: color, borderBottomColor: color, borderLeftColor: color,
});
const radius = (r: string) => ({ borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: r, borderBottomRightRadius: r });

const useStyles = makeStyles({
  // `cmp_CheckList_Project_States`: 104 high, `Parent.Width - 8`. `con_Project_States` is
  // `Parent.Width - 32` when the refresh button shows; `btn_Refresh` is 24 x 24 at X = W - 29, Y = 12.
  wrap: { display: "flex", alignItems: "flex-start", gap: "8px", width: "calc(100% - 8px)", flex: "none", boxSizing: "border-box" },
  stepper: {
    // 104 high; it grows instead of clipping when a narrow card wraps its title to a third line.
    display: "flex", alignItems: "stretch", flex: "1 1 auto", minWidth: 0, minHeight: "104px", boxSizing: "border-box",
    paddingTop: "7px", paddingBottom: "5px", overflowX: "auto",
  },
  // `but_Project_States_CheckList_Refresh`: `Icon: ="ArrowReset"`, IconOnly, 24 high. The canvas draws it as a plain blue
  // glyph with no box (27 Oct 2026: it was a boxed `ArrowSync`, the developers-only `btn_Refresh` icon).
  refresh: {
    flex: "none", marginTop: "12px", marginRight: "5px", minWidth: "24px", width: "24px", height: "24px", paddingLeft: 0, paddingRight: 0,
    color: palette.themePrimary, fontSize: "20px",
  },
  // `con_State_Card`: radius 2; selected = Fill ButtonSelectedBg, a 1 px `gblAppColors.BorderColor`
  // (Grayscale30) border and `DropShadow.Light`.
  card: {
    display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start",
    position: "relative", flex: "1 1 0", minWidth: "120px", paddingTop: 0, paddingBottom: "4px", paddingLeft: 0, paddingRight: 0,
    ...edges("transparent"), ...radius("2px"), fontWeight: tokens.fontWeightRegular, backgroundColor: "transparent",
    ":hover": { backgroundColor: "transparent" },
  },
  cardSelected: {
    backgroundColor: PM_GRAYSCALE40, ...edges(palette.Grayscale30), boxShadow: tokens.shadow4,
    ":hover": { backgroundColor: PM_GRAYSCALE40 },
  },
  cardSkipped: { opacity: 0.55 },
  // `con_State_Card_Button` (the top half): rec_First (10 x 2) · but_State (24 high, radius 4) ·
  // rec_Last (10 x 2) · the gate (32) and its 10 px line.
  track: { display: "flex", alignItems: "center", height: "36px", flex: "none" },
  line: { flex: "0 0 10px", height: "2px", backgroundColor: LINE_COLOR },
  lineHidden: { visibility: "hidden" },
  bar: {
    display: "flex", alignItems: "center", justifyContent: "center", flex: "1 1 auto", minWidth: 0,
    height: "24px", color: "#ffffff", ...radius("4px"), backgroundColor: STATE_FILL.notStarted,
  },
  // `circ_State_Card_Gate_Approval` (30, the state fill) under `but_State_Card_Gate_Approval`
  // (32, IconOnly): Transparent once Completed, so the filled circle shows; Secondary otherwise —
  // a white rounded box over it.
  gate: {
    display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px", width: "30px", height: "30px",
    boxSizing: "border-box",
    // The modern IconOnly `but_State_Card_Gate_Approval` draws its glyph at 20 px (27 Oct 2026: it was 16 px, a small faint icon).
    fontSize: "20px",
  },
  gatePassed: { ...radius("50%"), backgroundColor: STATE_FILL.completed, color: STATE_FILL.notStarted },
  // `but_State_Card_Gate_Approval` is 32 wide (the 30 px circle behind it is hidden by its white fill).
  gatePending: {
    ...radius("4px"), ...edges(tokens.colorNeutralStroke1), backgroundColor: palette.white, color: LABEL_COLOR,
    flex: "0 0 32px", width: "32px", height: "32px",
  },
  gateInProgress: { color: STATE_FILL.inProgress },
  // `con_State_Card_Data`: the title (Bold, ExtraSmall 9 pt, RGBA(50, 49, 48, 1)) over the state.
  title: {
    display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: "14px", paddingRight: "14px",
    fontSize: "12px", fontWeight: tokens.fontWeightBold, color: "rgb(50, 49, 48)", lineHeight: "16px",
    // `lbl_State_Card_Data_Title` is 2/3 of a fixed 60 px block and `lbl_State_Card_Data_SubTitle` sits at a fixed Y
    // under it, so the state text is on one line across the cards whether the name takes one line or two.
    minHeight: "32px",
  },
  state: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "12px", minHeight: "16px", color: LABEL_COLOR },
  // `btn_clockAlarm_Icon`: 32 wide at `X: =con_State_Card_Gate.X`, `Y: =40` (under the gate), `RGBA(125, 125, 125)`, outline.
  // The gate sits 10 px (its line) from the card's right edge and is 30 / 32 wide, so a 32 wide clock starts at its left edge.
  clock: {
    position: "absolute", top: "40px", right: "8px", width: "32px", height: "32px", display: "flex",
    alignItems: "center", justifyContent: "center", color: "rgb(125, 125, 125)", fontSize: "20px", pointerEvents: "none",
  },
  preLine: { whiteSpace: "pre-line" },

  // `con_Checklist_DisplayProject_Body_Content_Buttons`: horizontal, LayoutGap 10, 86 high,
  // PaddingLeft 12, PaddingTop 8, `LayoutOverflowX: Scroll`. Every button is 32 high.
  actions: {
    display: "flex", alignItems: "flex-start", gap: "10px", minHeight: "86px", flex: "none", boxSizing: "border-box",
    paddingLeft: "12px", paddingTop: "8px", overflowX: "auto",
  },
  // PowerCAT `Icon` ActionButtons. Outlined = FillColor white, BorderColor / FontColor / IconColor
  // themePrimary; primary (NextCluster) = FillColor themePrimary, FontColor white.
  action: {
    height: "32px", flexShrink: 0, whiteSpace: "nowrap", fontWeight: tokens.fontWeightRegular, ...radius("2px"),
    paddingLeft: "10px", paddingRight: "10px",
  },
  outlined: {
    backgroundColor: palette.white, color: palette.themePrimary, ...edges(palette.themePrimary),
    "& .fui-Button__icon": { color: palette.themePrimary },
    // `HoverFillColor: =hoverButton`, `HoverFontColor: =themePrimary`.
    ":hover": { backgroundColor: palette.hoverButton, color: palette.themePrimary, ...edges(palette.themePrimary) },
  },
  /** The terminal button of the project's own terminal state: FillColor themePrimary, white text. */
  outlinedActive: {
    backgroundColor: palette.themePrimary, color: palette.white,
    "& .fui-Button__icon": { color: palette.white },
  },
  primary: {
    backgroundColor: palette.themePrimary, color: palette.white, ...edges(palette.themePrimary),
    ":hover": { backgroundColor: palette.themeDarkAlt, color: palette.white },
  },
  // The transcribed widths: CancelApproval 250, Return 220, Next 260, Abandon 120, Inactive 200
  // (100 while it reads "Activate").
  // `FontSize: =16` on CancelApproval, Return_1 and NextCluster (Abandoned and Inactive set none, so they keep the default).
  text16: { fontSize: "16px" },
  w250: { minWidth: "250px" },
  w220: { minWidth: "220px" },
  w260: { minWidth: "260px" },
  w120: { minWidth: "120px" },
  w200: { minWidth: "200px" },
  w100: { minWidth: "100px" },
  // `con_…_Buttons_Info`: 120 x 32; the 24 px InfoButton then "Info" in Warning, ExtraExtraSmall (8 pt).
  info: { display: "inline-flex", alignItems: "center", width: "120px", height: "32px", flexShrink: 0, color: palette.Warning, fontSize: "10.67px" },
  infoButton: { color: palette.Warning },
});

/* ─────────────────────────────────────────────────────────────── stepper */

/** The card's state as `stepStateLabel` gives it; blank is Not Started. */
type StateLabel = string;

const BAR_FILL: Record<string, keyof typeof STATE_FILL> = {
  "In Progress": "inProgress", Completed: "completed", Rejected: "rejected", Canceled: "canceled",
  Abandoned: "inactive", "Inactive/ On-hold": "inactive",
};

export interface ProjectStateStep {
  id: string;
  name: string;
  /** `lbl_State_Card_Data_Title.Text` — `stepDescriptionLines`. */
  lines: string[];
  /** `lbl_State_Card_Data_SubTitle.Text` — `stepStateLabel`. */
  stateLabel: StateLabel;
  selected: boolean;
  skipped: boolean;
  /** `con_State_Card_Gate` — null when hidden (`stepGateVisible`). */
  gate: {
    icon: "Mail" | "People";
    /** `circ_State_Card_Gate_Approval.Fill` reads the card's raw state progress (no first-card default). */
    progressLabel: StateLabel;
    tooltip: string | null;
  } | null;
  /** `btn_clockAlarm_Icon.Visible` — `stepClockVisible`. */
  clock: boolean;
}

export interface ProjectStatesProps {
  steps: ProjectStateStep[];
  onSelect: (id: string) => void;
  /**
   * The refresh button at the top right (`but_Project_States_CheckList_Refresh`'s action); null
   * hides it (its canvas container is Wind / PV only).
   */
  refresh: { onClick: () => void; disabled: boolean } | null;
}

/** The `Char(13)` tooltips, one line per piece. */
const lines = (text: string | null): string => (text ?? "").replace(/\r/g, "\n");

export function ProjectStates({ steps, onSelect, refresh }: ProjectStatesProps) {
  const s = useStyles();
  return (
    <div className={s.wrap}>
      <div className={s.stepper} data-testid="cmp_CheckList_Project_States">
        {steps.map((step, index) => {
          const fill = BAR_FILL[step.stateLabel];
          const gateFill = step.gate ? BAR_FILL[step.gate.progressLabel] : undefined;
          const passed = gateFill === "completed";
          return (
            <Button
              key={step.id}
              appearance="transparent"
              className={mergeClasses(s.card, step.selected && s.cardSelected, step.skipped && s.cardSkipped)}
              aria-label={step.name}
              data-testid={`cmp_CheckList_Project_States-${step.id}`}
              aria-pressed={step.selected}
              title={step.name}
              onClick={() => onSelect(step.id)}
            >
              <span className={s.track}>
                <span className={mergeClasses(s.line, index === 0 && s.lineHidden)} />
                <span className={s.bar} style={fill ? { backgroundColor: STATE_FILL[fill] } : undefined}>
                  {step.stateLabel === "Completed" ? <CheckmarkRegular aria-hidden /> : null}
                </span>
                <span className={mergeClasses(s.line, index === steps.length - 1 && s.lineHidden)} />
                {step.gate ? (
                  <>
                    <span
                      title={lines(step.gate.tooltip)}
                      className={mergeClasses(s.gate, s.preLine, passed ? s.gatePassed : s.gatePending, gateFill === "inProgress" && s.gateInProgress)}
                    >
                      {step.gate.icon === "Mail" ? <MailRegular aria-hidden /> : <PeopleRegular aria-hidden />}
                    </span>
                    <span className={s.line} />
                  </>
                ) : null}
              </span>
              <span className={s.title}>
                {step.lines.map((l) => <span key={l}>{l}</span>)}
              </span>
              <span className={s.state}>
                <span>{step.stateLabel}</span>
              </span>
              {step.clock ? <span className={s.clock} aria-hidden="true"><ClockAlarmRegular /></span> : null}
            </Button>
          );
        })}
      </div>
      {/*
        * The canvas shows `cmp_Project_States.btn_Refresh` (ArrowSync, 24 x 24) here, to developers
        * only (`RefreshButtonVisibility`, not ported, D29). The visible refresh of this app is
        * `but_Project_States_CheckList_Refresh` (canvas Width 0), shown in that place.
        */}
      {refresh ? (
        <Tooltip content={UI.refresh} relationship="description" withArrow>
          <Button appearance="transparent" size="small" className={s.refresh} icon={<ArrowResetRegular />}
            aria-label="RefreshProjectStates" data-testid="but_Project_States_CheckList_Refresh"
            disabled={refresh.disabled} onClick={refresh.onClick} />
        </Tooltip>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── actions */

export interface TerminalAction {
  kind: TerminalKind;
  label: string;
  /** The project already sits in this terminal state (the button reads "Activate"). */
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

export interface ClusterActionsProps {
  /** `pcf_…_Buttons_CancelApproval` — shown disabled (an approval flow, D29). */
  cancelApprovalVisible: boolean;
  reset: { caption: string; disabled: boolean; onClick: () => void } | null;
  next: {
    caption: string;
    tooltip: string;
    icon: "TriggerApproval" | "CheckMark";
    disabled: boolean;
    onClick: () => void;
  } | null;
  /** `con_…_Buttons_Info` — its InfoButton content, or null when hidden. */
  info: string | null;
  terminals: TerminalAction[];
}

export function ClusterActions({ cancelApprovalVisible, reset, next, info, terminals }: ClusterActionsProps) {
  const s = useStyles();
  const terminalIcon = (t: TerminalAction): ReactElement =>
    t.kind === "abandon" ? <SubtractCircleRegular /> : <LockClosedRegular />;
  return (
    <div className={s.actions}>
      {cancelApprovalVisible ? (
        <Button appearance="secondary" className={mergeClasses(s.action, s.outlined, s.text16, s.w250)} icon={<DismissRegular />}
          disabled title={EXCLUDED.cancelGateApproval} aria-label={UI.cancelApprovalRequest}
          data-testid="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval">
          {UI.cancelApprovalRequest}
        </Button>
      ) : null}
      {reset ? (
        <Button appearance="secondary" className={mergeClasses(s.action, s.outlined, s.text16, s.w220)} icon={<ArrowLeftRegular />}
          disabled={reset.disabled} aria-label={ARIA.returnToPrevious}
          data-testid="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1" onClick={reset.onClick}>
          {reset.caption}
        </Button>
      ) : null}
      {next ? (
        <Tooltip content={next.tooltip} relationship="description" withArrow>
          <Button appearance="primary" className={mergeClasses(s.action, s.text16, !next.disabled && s.primary, s.w260)}
            disabled={next.disabled} aria-label={ARIA.nextCluster}
            // `IconName`: "TriggerApproval" (a lightning bolt) for an active gate, "CheckMark" otherwise.
            icon={next.icon === "TriggerApproval" ? <FlashRegular /> : <CheckmarkRegular />}
            data-testid="pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster" onClick={next.onClick}>
            {next.caption}
          </Button>
        </Tooltip>
      ) : null}
      {info !== null ? (
        <span className={s.info} data-testid="con_Checklist_DisplayProject_Body_Content_Buttons_Info">
          <Tooltip content={info} relationship="label" withArrow>
            <Button appearance="transparent" size="small" className={s.infoButton} icon={<InfoRegular />}
              aria-label={info} data-testid="but_Checklist_DisplayProject_Body_Content_Buttons_Info" />
          </Tooltip>
          <span>{UI.info}</span>
        </span>
      ) : null}
      {terminals.map((t) => (
        <Button key={t.kind} appearance="secondary"
          aria-label={t.kind === "abandon" ? ARIA.abandon : ARIA.inactive}
          data-testid={t.kind === "abandon" ? ARIA.abandon : ARIA.inactive}
          className={mergeClasses(s.action, s.outlined, t.kind === "abandon" ? s.w120 : t.active ? s.w100 : s.w200, t.active && s.outlinedActive)}
          aria-pressed={t.active} icon={terminalIcon(t)} disabled={t.disabled} onClick={t.onClick}>
          {t.label}
        </Button>
      ))}
    </div>
  );
}
