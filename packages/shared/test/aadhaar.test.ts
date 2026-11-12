import { describe, expect, it } from "vitest";
import { isAadhaarNumber, maskAadhaar, verhoeffValid } from "../src/aadhaar";

/** Builds a made-up 12-digit number that passes the checksum, from 11 digits. Not a real person's number. */
function withCheckDigit(eleven: string): string {
  for (let d = 0; d <= 9; d++) if (verhoeffValid(eleven + d)) return eleven + d;
  throw new Error("no check digit");
}

const VALID = withCheckDigit("29990000111");
const VALID_2 = withCheckDigit("58880000222");
const grouped = (n: string, sep = " ") => `${n.slice(0, 4)}${sep}${n.slice(4, 8)}${sep}${n.slice(8)}`;
const INVALID = VALID.slice(0, 11) + ((Number(VALID[11]) + 1) % 10);

describe("verhoeffValid", () => {
  it("accepts the textbook example and rejects a changed digit", () => {
    expect(verhoeffValid("2363")).toBe(true);
    expect(verhoeffValid("2364")).toBe(false);
    expect(verhoeffValid("2633")).toBe(false); // swapped neighbours
  });

  it("rejects anything that is not digits", () => {
    expect(verhoeffValid("")).toBe(false);
    expect(verhoeffValid("23a3")).toBe(false);
  });
});

describe("isAadhaarNumber", () => {
  it("accepts a valid number with or without separators", () => {
    expect(isAadhaarNumber(VALID)).toBe(true);
    expect(isAadhaarNumber(grouped(VALID))).toBe(true);
    expect(isAadhaarNumber(grouped(VALID, "-"))).toBe(true);
  });

  it("rejects a wrong checksum, wrong length, or a first digit of 0 or 1", () => {
    expect(isAadhaarNumber(INVALID)).toBe(false);
    expect(isAadhaarNumber(VALID.slice(1))).toBe(false);
    expect(isAadhaarNumber(withCheckDigit("19990000111"))).toBe(false);
  });
});

describe("maskAadhaar", () => {
  it("keeps only the last four digits", () => {
    expect(maskAadhaar(`Aadhaar No: ${grouped(VALID)}.`)).toEqual({
      text: `Aadhaar No: XXXX XXXX ${VALID.slice(8)}.`,
      masked: 1,
    });
  });

  it.each(["", " ", "-", "."])("masks numbers written with separator %j", (sep) => {
    const { text, masked } = maskAadhaar(`id ${grouped(VALID, sep)} end`);
    expect(masked).toBe(1);
    expect(text).toBe(`id XXXX XXXX ${VALID.slice(8)} end`);
  });

  it("masks every number in the text, across lines", () => {
    const { text, masked } = maskAadhaar(`Patient: ${VALID}\nSpouse: ${grouped(VALID_2)}`);
    expect(masked).toBe(2);
    expect(text).not.toContain(VALID.slice(0, 8));
    expect(text).not.toContain(VALID_2.slice(0, 4) + " " + VALID_2.slice(4, 8));
  });

  it("leaves other numbers alone by default", () => {
    const text = [
      `Policy 4${VALID}`, // 13 digits
      `Claim ${VALID}7`, // 13 digits
      `Ref ${INVALID}`, // 12 digits, wrong checksum
      "Phone 9876543210",
      "Amount 125000.00 on 2026-10-01",
      `Mixed ${VALID.slice(0, 4)} ${VALID.slice(4, 8)}-${VALID.slice(8)}`, // inconsistent separators
    ].join("\n");
    expect(maskAadhaar(text)).toEqual({ text, masked: 0 });
  });

  it('masks every possible number in "any" mode, for OCR text', () => {
    const { text, masked } = maskAadhaar(`Ref ${INVALID}, phone 9876543210`, "any");
    expect(masked).toBe(1);
    expect(text).toBe(`Ref XXXX XXXX ${INVALID.slice(8)}, phone 9876543210`);
  });

  it("returns the same text when there is nothing to mask", () => {
    expect(maskAadhaar("No numbers here.")).toEqual({ text: "No numbers here.", masked: 0 });
  });
});
