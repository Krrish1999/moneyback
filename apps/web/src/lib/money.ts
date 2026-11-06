/**
 * Money helpers. Money is always integer paise (CLAUDE.md); these only format or parse for display/input.
 * Integer maths only — no floating point on money.
 */

const GROUPING = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 29900 → "₹299", 12345 → "₹123.45", 1_00_000_00 → "₹1,00,000". Indian digit grouping. */
export function formatRupees(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new RangeError(`formatRupees expects non-negative integer paise, got ${paise}`);
  }
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  const whole = `₹${GROUPING.format(rupees)}`;
  return rest === 0 ? whole : `${whole}.${String(rest).padStart(2, "0")}`;
}

/** 0.1 → "10%" */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * Parses what a user types in a rupee field ("45000", "45,000", "1,20,500.50") into integer paise.
 * Returns null when it is not a plain amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[\s,₹]/g, "");
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return rupees * 100 + fraction;
}
