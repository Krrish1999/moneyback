import { describe, expect, it } from "vitest";
import { PRICES_PAISE, SUCCESS_FEE_RATE } from "@moneyback/shared";
import { formatRate, formatRupees, parseRupeesToPaise } from "../src/lib/money";

describe("formatRupees", () => {
  it("formats the shared prices as whole rupees", () => {
    expect(formatRupees(PRICES_PAISE.filing)).toBe("₹299");
    expect(formatRupees(PRICES_PAISE.escalation)).toBe("₹499");
  });

  it("keeps paise when there are any", () => {
    expect(formatRupees(12_345)).toBe("₹123.45");
    expect(formatRupees(5)).toBe("₹0.05");
  });

  it("uses Indian digit grouping", () => {
    expect(formatRupees(1_00_000_00)).toBe("₹1,00,000");
    expect(formatRupees(12_34_567_00)).toBe("₹12,34,567");
  });

  it("rejects non-integer or negative paise", () => {
    expect(() => formatRupees(1.5)).toThrow(RangeError);
    expect(() => formatRupees(-100)).toThrow(RangeError);
  });
});

describe("formatRate", () => {
  it("shows the success fee as a percentage", () => {
    expect(formatRate(SUCCESS_FEE_RATE)).toBe("10%");
    expect(formatRate(0.125)).toBe("12.5%");
  });
});

describe("parseRupeesToPaise", () => {
  it.each([
    ["45000", 45_000_00],
    ["45,000", 45_000_00],
    ["₹ 1,20,500.5", 1_20_500_50],
    ["99.99", 9_999],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "-5", "1e5", "12..3"])("rejects %j", (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });
});
