import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * D164: the app prints to the console ONLY through `platform/consoleGate.ts`, so Production (`vsb_EnvironmentName` = `Prod`) can
 * stay silent. This test reads every source file and fails on a direct `console.…` / `console[…]` call, so a new logger cannot
 * add a way round the gate.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The code of a file without block comments, line comments and the text inside string literals on one line. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""').replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("console gate: no way round it (D164)", () => {
  it("UT-CONGATE-030 no source file calls console.* directly except the gate itself", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel === "platform/consoleGate.ts") continue;
      const code = codeOnly(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (/\bconsole\s*(\.|\[)/.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("UT-CONGATE-031 the gate is the only file that hands a method to the real console", () => {
    const gate = codeOnly(readFileSync(join(SRC, "platform/consoleGate.ts"), "utf8"));
    // `print` is the single place that reaches `console`; everything else in the file only decides whether to call it.
    expect(gate.match(/\bconsole\b/g)?.length).toBe(2);
  });
});
