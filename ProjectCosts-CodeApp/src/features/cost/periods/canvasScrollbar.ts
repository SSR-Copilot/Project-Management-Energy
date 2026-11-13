/*
 * Shared by the Land Lease and OPEX screens (moved out of `LandLeaseScreen.tsx`, 12 Nov 2026).
 */
/**
 * The canvas' classic scrollbar: a 10 px grey bar on a light track, with an arrow button at
 * each end (the left/right arrows on `con_…_CardBody_1`, and the up/down arrows on the
 * subaccount gallery). Only the `::-webkit-scrollbar` pseudo-elements are set — Chromium
 * ignores all of them once the standard `scrollbar-color` is present, and the arrows go with
 * them.
 */
const arrow = (path: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><path d='${path}' fill='%23505050'/></svg>")`;
export const scrollButton = (path: string, size = 10) => ({
  display: "block", width: `${size}px`, height: `${size}px`,
  backgroundColor: "#f1f1f1", backgroundImage: arrow(path),
  backgroundRepeat: "no-repeat", backgroundPosition: "center",
});
/*
 * The HORIZONTAL bar under each card's rows is the canvas' thicker classic bar (canvas "Other"
 * screenshot, 26 Oct 2026): a 16 px track with 16 px arrow buttons and a 10 px handle inset by
 * 3 px of track above and below. The vertical bars keep the slimmer 10 px look.
 */
export const canvasScrollbar = {
  "::-webkit-scrollbar": { width: "10px", height: "16px" },
  "::-webkit-scrollbar-track": { backgroundColor: "#f1f1f1" },
  "::-webkit-scrollbar-thumb": {
    backgroundColor: "#868686",
    borderTopLeftRadius: "5px", borderTopRightRadius: "5px",
    borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px",
  },
  "::-webkit-scrollbar-thumb:horizontal": {
    borderTopWidth: "3px", borderBottomWidth: "3px", borderLeftWidth: 0, borderRightWidth: 0,
    borderTopStyle: "solid", borderBottomStyle: "solid",
    borderTopColor: "transparent", borderBottomColor: "transparent",
    backgroundClip: "padding-box",
  },
  "::-webkit-scrollbar-button:horizontal:start:decrement": scrollButton("M6 0v8L1 4z", 16),
  "::-webkit-scrollbar-button:horizontal:end:increment": scrollButton("M2 0v8l5-4z", 16),
  "::-webkit-scrollbar-button:vertical:start:decrement": scrollButton("M0 6h8L4 1z"),
  "::-webkit-scrollbar-button:vertical:end:increment": scrollButton("M0 2h8L4 7z"),
  "::-webkit-scrollbar-button:start:increment": { display: "none" },
  "::-webkit-scrollbar-button:end:decrement": { display: "none" },
} as const;
