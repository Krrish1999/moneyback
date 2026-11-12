import { CaseCategory } from "@moneyback/shared";
import { ClaimType, type CreateCaseBody, type IntakeExtras } from "../../api/types";
import { parseRupeesToPaise } from "../../lib/money";

export const STATEMENT_MAX_LENGTH = 2000;
/** Rs 10 crore. Above this is almost certainly a typing mistake for a health claim. */
const MAX_CLAIM_PAISE = 10_00_00_000 * 100;

export type IntakeFormValues = {
  insurerName: string;
  claimType: string;
  claimAmount: string;
  rejectionDate: string;
  insurerStatement: string;
};

export type IntakeField = keyof IntakeFormValues;

/** Each value is an i18n key under `intake.errors`. */
export type IntakeErrors = Partial<Record<IntakeField, string>>;

export type IntakeResult =
  | { ok: true; request: CreateCaseBody; extras: IntakeExtras }
  | { ok: false; errors: IntakeErrors };

export const EMPTY_INTAKE: IntakeFormValues = {
  insurerName: "",
  claimType: "",
  claimAmount: "",
  rejectionDate: "",
  insurerStatement: "",
};

/** `today` is YYYY-MM-DD in Asia/Kolkata; passed in so tests are deterministic. */
export function validateIntake(values: IntakeFormValues, today: string): IntakeResult {
  const errors: IntakeErrors = {};

  const insurerName = values.insurerName.trim();
  if (!insurerName) errors.insurerName = "insurerRequired";

  const claimType = ClaimType.safeParse(values.claimType);
  if (!claimType.success) errors.claimType = "claimTypeRequired";

  const paise = parseRupeesToPaise(values.claimAmount);
  if (!values.claimAmount.trim()) errors.claimAmount = "amountRequired";
  else if (paise === null) errors.claimAmount = "amountInvalid";
  else if (paise === 0) errors.claimAmount = "amountTooLow";
  else if (paise > MAX_CLAIM_PAISE) errors.claimAmount = "amountTooHigh";

  const date = values.rejectionDate;
  if (!date) errors.rejectionDate = "dateRequired";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.rejectionDate = "dateInvalid";
  else if (date > today) errors.rejectionDate = "dateFuture";

  const statement = values.insurerStatement.trim();
  if (!statement) errors.insurerStatement = "statementRequired";
  else if (statement.length > STATEMENT_MAX_LENGTH) errors.insurerStatement = "statementTooLong";

  if (Object.keys(errors).length > 0 || !claimType.success || paise === null) return { ok: false, errors };

  return {
    ok: true,
    request: {
      category: CaseCategory.enum.health_insurance,
      insurer: insurerName,
      claimAmountPaise: paise,
    },
    extras: { claimType: claimType.data, rejectionDate: date, insurerStatement: statement },
  };
}
