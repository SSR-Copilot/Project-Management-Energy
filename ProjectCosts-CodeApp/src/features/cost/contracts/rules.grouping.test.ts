/** UT-CONTR-205..207 — card figures group by three in every language (`Text(n, "###,##0")`, D117). */
import { describe, expect, it } from "vitest";
import { localeInfo } from "@/domain/locale";
import { formatOneDecimal, oneDecimalText, wholeNumberText } from "./rules";

describe("Contracts number text", () => {
  it("UT-CONTR-205 a four-digit figure is grouped in es, it, pl and pt-PT, where Intl alone leaves it bare", () => {
    expect(wholeNumberText(1234, "es")).toBe("1.234");
    expect(wholeNumberText(1234, "it")).toBe("1.234");
    // Polish groups with a no-break space: take the language's own character rather than typing it.
    expect(wholeNumberText(1234, "pl")).toBe(`1${localeInfo("pl").groupSeparator}234`);
    expect(wholeNumberText(1234, "en-GB")).toBe("1,234");
    expect(wholeNumberText(1234, "de-DE")).toBe("1.234");
  });

  it("UT-CONTR-206 one-decimal figures group the same way and keep the decimal separator of the language", () => {
    expect(oneDecimalText(1234.5, "es")).toBe("1.234,5");
    expect(formatOneDecimal(1234.5, "en-GB")).toBe("1,234.5");
    expect(formatOneDecimal(100, "de-DE")).toBe("100,0");
  });

  it("UT-CONTR-207 a blank figure is 0 and a negative one keeps its sign", () => {
    expect(wholeNumberText(undefined, "en-GB")).toBe("0");
    expect(wholeNumberText(-1234, "en-GB")).toBe("-1,234");
  });
});
