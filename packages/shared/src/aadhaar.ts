/**
 * Aadhaar-number masking. Hospital papers and KYC pages often carry the patient's Aadhaar number.
 * We never need it, so text is masked before it is stored, logged or sent to the model.
 * Masked form keeps the last four digits, the same as UIDAI's own "masked Aadhaar": `XXXX XXXX 1234`.
 */

// Verhoeff checksum tables (the check Aadhaar numbers use).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** True when a string of digits (check digit last) passes the Verhoeff checksum. */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    c = D[c]![P[i % 8]![digit]!]!;
  }
  return c === 0;
}

/** True for 12 digits that start with 2–9 and pass the checksum. Spaces and hyphens are ignored. */
export function isAadhaarNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValid(digits);
}

/**
 * 12 digits starting 2–9, written together or in groups of four with one consistent separator
 * (space, hyphen, dot or none), and not part of a longer run of digits.
 */
const CANDIDATE = /(?<!\d)([2-9]\d{3})([ .-]?)(\d{4})\2(\d{4})(?!\d)/g;

export type AadhaarMaskMode =
  /** Mask only numbers that pass the Aadhaar checksum. Leaves other 12-digit numbers (policy, claim ids) alone. */
  | "checksum"
  /** Mask every 12-digit number that could be an Aadhaar number. For text from OCR, where a misread digit breaks the checksum. */
  | "any";

export type AadhaarMaskResult = { text: string; masked: number };

/** Replaces Aadhaar numbers in `text` with `XXXX XXXX 1234`. Returns the new text and how many were masked. */
export function maskAadhaar(text: string, mode: AadhaarMaskMode = "checksum"): AadhaarMaskResult {
  let masked = 0;
  const out = text.replace(CANDIDATE, (match: string, a: string, _sep: string, b: string, c: string) => {
    if (mode === "checksum" && !verhoeffValid(a + b + c)) return match;
    masked += 1;
    return `XXXX XXXX ${c}`;
  });
  return { text: out, masked };
}
