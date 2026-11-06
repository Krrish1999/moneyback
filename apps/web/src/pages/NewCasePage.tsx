import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useApi } from "../api/context";
import { ClaimType } from "../api/types";
import { PageHeading, PrimaryButton } from "../components/ui";
import {
  EMPTY_INTAKE,
  STATEMENT_MAX_LENGTH,
  validateIntake,
  type IntakeErrors,
  type IntakeField,
  type IntakeFormValues,
} from "../features/intake/validation";
import { intakeExtrasStore } from "../features/intake/extrasStore";
import { todayInIndia } from "../lib/dates";

const FIELD_ORDER: IntakeField[] = ["insurerName", "claimType", "claimAmount", "rejectionDate", "insurerStatement"];

const inputClass =
  "mt-1 block w-full rounded-lg border bg-card px-3 py-3 text-base text-ink placeholder:text-muted aria-[invalid=true]:border-danger border-line";

export function NewCasePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<IntakeFormValues>(EMPTY_INTAKE);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const set = (field: IntakeField) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveFailed(false);
    const result = validateIntake(values, todayInIndia());
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await api.createCase(result.request);
      intakeExtrasStore.set(created.id, result.extras);
      await navigate(`/cases/${created.id}/upload`);
    } catch {
      setSaveFailed(true);
      setSubmitting(false);
    }
  }

  const err = (field: IntakeField) =>
    errors[field] ? t(`intake.errors.${errors[field]}`, { max: STATEMENT_MAX_LENGTH }) : undefined;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <title>{`${t("intake.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("intake.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("intake.intro")}</p>

      {(hasErrors || saveFailed) && (
        <div role="alert" className="mt-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-base text-danger">
          {saveFailed ? t("intake.errors.saveFailed") : t("intake.errorSummary")}
        </div>
      )}

      <form ref={formRef} noValidate onSubmit={onSubmit} className="mt-6 space-y-6">
        <TextField
          name="insurerName"
          label={t("intake.insurerName.label")}
          hint={t("intake.insurerName.hint")}
          error={err("insurerName")}
          value={values.insurerName}
          onChange={set("insurerName")}
          autoComplete="organization"
        />

        <fieldset aria-describedby={errors.claimType ? "claimType-error" : undefined}>
          <legend className="text-base font-semibold text-ink">{t("intake.claimType.legend")}</legend>
          <FieldError id="claimType-error">{err("claimType")}</FieldError>
          <div className="mt-2 space-y-3">
            {ClaimType.options.map((option, index) => (
              <label
                key={option}
                className="flex cursor-pointer gap-3 rounded-lg border border-line bg-card p-3 has-checked:border-brand has-checked:bg-brand-soft"
              >
                <input
                  type="radio"
                  name="claimType"
                  value={option}
                  checked={values.claimType === option}
                  onChange={(e) => set("claimType")(e.target.value)}
                  aria-invalid={index === 0 && errors.claimType ? true : undefined}
                  className="mt-1 size-5 shrink-0 accent-brand"
                />
                <span>
                  <span className="block text-base font-semibold text-ink">{t(`intake.claimType.${option}`)}</span>
                  <span className="block text-base text-muted">{t(`intake.claimType.${option}Hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <TextField
          name="claimAmount"
          label={t("intake.claimAmount.label")}
          hint={t("intake.claimAmount.hint")}
          error={err("claimAmount")}
          value={values.claimAmount}
          onChange={set("claimAmount")}
          inputMode="decimal"
          autoComplete="off"
        />

        <TextField
          name="rejectionDate"
          type="date"
          label={t("intake.rejectionDate.label")}
          hint={t("intake.rejectionDate.hint")}
          error={err("rejectionDate")}
          value={values.rejectionDate}
          onChange={set("rejectionDate")}
          max={todayInIndia()}
        />

        <TextField
          name="insurerStatement"
          multiline
          label={t("intake.insurerStatement.label")}
          hint={t("intake.insurerStatement.hint")}
          error={err("insurerStatement")}
          value={values.insurerStatement}
          onChange={set("insurerStatement")}
          maxLength={STATEMENT_MAX_LENGTH}
        />

        <PrimaryButton type="submit" data-testid="intake-submit" disabled={submitting}>
          {submitting ? t("intake.submitting") : t("intake.submit")}
        </PrimaryButton>
      </form>
    </>
  );
}

type TextFieldProps = {
  name: IntakeField;
  label: string;
  hint: string;
  error: string | undefined;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  multiline?: boolean;
  inputMode?: "decimal";
  autoComplete?: string;
  max?: string;
  maxLength?: number;
};

function TextField({ name, label, hint, error, value, onChange, type = "text", multiline, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const shared = {
    id,
    name,
    value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${errorId} ${hintId}` : hintId,
    className: inputClass,
  };
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold text-ink">
        {label}
      </label>
      <p id={hintId} className="text-base text-muted">
        {hint}
      </p>
      <FieldError id={errorId}>{error}</FieldError>
      {multiline ? (
        <textarea {...shared} rows={5} maxLength={rest.maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type={type} {...rest} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-base font-medium text-danger">
      {children}
    </p>
  );
}
