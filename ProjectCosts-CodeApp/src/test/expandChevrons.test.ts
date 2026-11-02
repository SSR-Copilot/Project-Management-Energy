/**
 * UT-EXPAND — every expand / collapse chevron is the shared one (CONVENTIONS rule 21).
 *
 * Accordion headers and card headers draw `ExpandChevron` from `@/components`: blue (themePrimary) and
 * 1.4x the default size, as the Cost app's Land Lease and OPEX cards. A screen that imports Fluent's
 * `Chevron{Up,Down}` for such a header gets a small grey one and breaks the uniform look, so this
 * test fails on any such import outside the list below.
 *
 * Adding to the list needs a reason: it is for chevrons that are NOT a fold control of a card or
 * accordion (a menu caret, a navigation group, a tree row toggle) or the two reference screens.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/** file (relative to `src`, `/` separators) → why it may import a plain chevron. */
export const PLAIN_CHEVRON_ALLOWED: Readonly<Record<string, string>> = {
  "components/ExpandChevron.tsx": "the shared definition",
  "components/AppHeader.tsx": "the Help menu's drop-down caret",
  "components/CommandBar.tsx": "a command's drop-down caret (menu), not a fold control",
  "components/LeftNav.tsx": "the left rail's group headers (navigation, not a card)",
  "features/admin/admin-contract/DevCoCostForm.tsx": "a tree row toggle inside a form, 24 px, with its own checkbox lane",
  "features/cost/contracts/Screen.tsx": "the DevCo cost tree's row toggle in the contract panel",
  "features/cost/periods/LandLeaseScreen.tsx": "the reference: its 28 px chevron box is tuned to the card header geometry",
  "features/cost/periods/OpexScreen.tsx": "the reference: its 28 px chevron box is tuned to the card header geometry",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "generated" && name !== "node_modules") sourceFiles(path, out);
    } else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) {
      out.push(path);
    }
  }
  return out;
}

/** `Chevron(Up|Down)` icons of every size and fill: `ChevronUpRegular`, `ChevronDown20Filled`, … */
const PLAIN_CHEVRON = /\bChevron(?:Up|Down)\d*(?:Regular|Filled)\b/;

describe("UT-EXPAND — one expand / collapse chevron", () => {
  const files = sourceFiles(SRC).map((f) => ({
    rel: relative(SRC, f).split(sep).join("/"),
    text: readFileSync(f, "utf8"),
  }));

  it("UT-EXPAND-001 no screen draws its own chevron for a card or accordion header", () => {
    const offenders = files
      .filter((f) => PLAIN_CHEVRON.test(f.text) && !(f.rel in PLAIN_CHEVRON_ALLOWED))
      .map((f) => f.rel);
    expect(
      offenders,
      `\nThese files draw a plain Fluent chevron. Use <ExpandChevron open={…} /> from "@/components" (CONVENTIONS rule 21):\n${offenders.join("\n")}\n`,
    ).toEqual([]);
  });

  it("UT-EXPAND-002 every allowed exception still needs its exception", () => {
    const stale = Object.keys(PLAIN_CHEVRON_ALLOWED).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || !PLAIN_CHEVRON.test(file.text);
    });
    expect(stale, `Remove these from PLAIN_CHEVRON_ALLOWED, they no longer import a plain chevron:\n${stale.join("\n")}`).toEqual([]);
  });

  it("UT-EXPAND-003 every exception states its reason", () => {
    expect(Object.values(PLAIN_CHEVRON_ALLOWED).filter((r) => r.trim().length < 10)).toEqual([]);
  });
});
