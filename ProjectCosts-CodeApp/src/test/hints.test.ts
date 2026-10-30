/**
 * UT-HINTS-001 — the copy-pasted Save hint stays out.
 *
 * Twelve canvas Save buttons carry the hover text "Filter projects details list view.", pasted from the
 * Project Overview's filter icon. It is wrong on a Save button, so the code app says "Save" there
 * (`HINTS.save`, D64). The text is only right on the Overview's filter icons.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const WRONG = "Filter projects details list view";
/** Where the text belongs: the Overview's filter icons. */
const ALLOWED = ["features/pm/project-main/"];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "generated" && name !== "node_modules") files(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("UT-HINTS-001 no Save button says 'Filter projects details list view.'", () => {
  it("UT-HINTS-001 the text appears only where the canvas filter icons are", () => {
    const offenders = files(SRC)
      .map((f) => ({
        rel: relative(SRC, f).split(sep).join("/"),
        // A comment may name the text (it explains the divergence); a string literal may not.
        text: readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
      }))
      .filter((f) => new RegExp(`["'\`]${WRONG}`).test(f.text) && !ALLOWED.some((a) => f.rel.startsWith(a)))
      .map((f) => f.rel);
    expect(offenders, `\nA Save button must say "Save" (HINTS.save), not the pasted filter hint:\n${offenders.join("\n")}\n`).toEqual([]);
  });
});
