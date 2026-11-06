import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CaseStatus, type CaseRecord } from "@moneyback/shared";
import { useApi } from "../api/context";
import { ApiError } from "../api/types";
import { DEMO_CASE_ID } from "../api/mock";
import { PageHeading, SecondaryLink } from "../components/ui";
import { formatCalendarDate, formatDisplayDate } from "../lib/dates";
import { formatRupees } from "../lib/money";

type LoadState = { kind: "loading" } | { kind: "ready"; data: CaseRecord } | { kind: "error"; notFound: boolean };

export function CasePage() {
  const { t } = useTranslation();
  const api = useApi();
  const { id = "" } = useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    api.getCase(id).then(
      (data) => active && setState({ kind: "ready", data }),
      (error: unknown) =>
        active && setState({ kind: "error", notFound: error instanceof ApiError && error.status === 404 }),
    );
    return () => {
      active = false;
    };
  }, [api, id]);

  return (
    <>
      <title>{`${t("case.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("case.title")}</PageHeading>
      {state.kind === "loading" && (
        <p role="status" className="mt-4 text-base text-muted">
          {t("case.loading")}
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="mt-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-base text-danger">
          {state.notFound ? t("case.notFound") : t("case.loadFailed")}
        </p>
      )}
      {state.kind === "ready" && <CaseDetails data={state.data} />}
    </>
  );
}

function CaseDetails({ data }: { data: CaseRecord }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (
    <>
      <p className="mt-1 text-base break-all text-muted">{t("case.reference", { id: data.id })}</p>
      {data.id === DEMO_CASE_ID && (
        <p className="mt-2 inline-block rounded-full bg-brand-soft px-3 py-1 text-base text-ink">{t("case.sample")}</p>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-4">
        <div>
          <dt className="text-base text-muted">{t("case.insurer")}</dt>
          <dd className="text-base font-semibold text-ink">{data.insurer}</dd>
        </div>
        <div>
          <dt className="text-base text-muted">{t("case.amount")}</dt>
          <dd className="text-base font-semibold tabular-nums text-ink">{formatRupees(data.claimAmountPaise)}</dd>
        </div>
        <div>
          <dt className="text-base text-muted">{t("case.started")}</dt>
          <dd className="text-base font-semibold text-ink">{formatDisplayDate(data.createdAt, lang)}</dd>
        </div>
      </dl>

      <section aria-labelledby="deadline-title" className="mt-4 rounded-xl border-l-4 border-brand bg-brand-soft p-4">
        <h2 id="deadline-title" className="text-base font-semibold text-ink">
          {t("case.nextDeadline")}
        </h2>
        <p className="mt-1 text-base text-ink" data-testid="next-deadline">
          {data.nextDeadline
            ? t("case.deadlineDetail", { date: formatCalendarDate(data.nextDeadline, lang) })
            : t("case.noDeadline")}
        </p>
      </section>

      <section aria-labelledby="timeline-title" className="mt-8">
        <h2 id="timeline-title" className="text-xl font-semibold text-ink">
          {t("case.timelineTitle")}
        </h2>
        <Timeline status={data.status} />
      </section>

      {(data.status === "intake" || data.status === "analysing") && (
        <SecondaryLink to={`/cases/${encodeURIComponent(data.id)}/upload`} className="mt-8">
          {t("case.addDocuments")}
        </SecondaryLink>
      )}
    </>
  );
}

const S = CaseStatus.enum;
/** The usual path of a case (D-003). `review` appears only when a case is in it. */
const MAIN_PATH: readonly CaseStatus[] = [S.intake, S.analysing, S.draft, S.sent, S.waiting, S.escalated];
const REVIEW_PATH: readonly CaseStatus[] = [S.intake, S.analysing, S.review, S.draft, S.sent, S.waiting, S.escalated];

export type TimelineStep = {
  status: CaseStatus | "outcome";
  state: "done" | "current" | "upcoming";
  optional: boolean;
};

/**
 * Steps from the current status alone (CaseRecord has no history yet). Earlier steps on the usual path are
 * shown as done; escalation is marked optional while it is still ahead.
 */
export function buildTimeline(status: CaseStatus): TimelineStep[] {
  const step = (s: TimelineStep["status"], state: TimelineStep["state"], optional = false): TimelineStep => ({
    status: s,
    state,
    optional,
  });
  if (status === S.closed) return [step(S.intake, "done"), step(S.closed, "current")];
  if (status === S.won || status === S.lost) {
    return [...MAIN_PATH.filter((s) => s !== S.escalated).map((s) => step(s, "done")), step(status, "current")];
  }
  const path = status === S.review ? REVIEW_PATH : MAIN_PATH;
  const at = path.indexOf(status);
  return [
    ...path.map((s, i) => step(s, i < at ? "done" : i === at ? "current" : "upcoming", s === S.escalated && i > at)),
    step("outcome", "upcoming"),
  ];
}

function Timeline({ status }: { status: CaseStatus }) {
  const { t } = useTranslation();
  const steps = buildTimeline(status);
  return (
    <ol data-testid="case-timeline" className="mt-4">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const copyKey = step.status === "outcome" ? "case.outcome" : `case.status.${step.status}`;
        const dot =
          step.state === "done"
            ? "bg-brand border-brand"
            : step.state === "current"
              ? "bg-card border-brand ring-4 ring-brand-soft"
              : "bg-card border-line";
        return (
          <li
            key={step.status}
            aria-current={step.state === "current" ? "step" : undefined}
            data-status={step.status}
            data-state={step.state}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${step.state === "done" ? "bg-brand" : "bg-line"}`}
              />
            )}
            <span aria-hidden="true" className={`relative mt-1 size-6 shrink-0 rounded-full border-2 ${dot}`}>
              {step.state === "done" && (
                <svg viewBox="0 0 24 24" className="size-full p-0.5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M6 12l4 4 8-8" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <p className="text-base">
                <span className={`font-semibold ${step.state === "upcoming" ? "text-muted" : "text-ink"}`}>
                  {t(`${copyKey}.title`)}
                </span>
                <span className="sr-only">
                  {" — "}
                  {step.state === "done"
                    ? t("case.stepDone")
                    : step.state === "current"
                      ? t("case.stepCurrent")
                      : t("case.stepUpcoming")}
                </span>
                {step.state === "current" && (
                  <span aria-hidden="true" className="ml-2 rounded-full bg-brand px-2 py-0.5 text-base text-white">
                    {t("case.stepCurrent")}
                  </span>
                )}
              </p>
              {step.state === "current" && <p className="text-base text-muted">{t(`${copyKey}.body`)}</p>}
              {step.optional && <p className="text-base text-muted">{t("case.stepOptional")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
