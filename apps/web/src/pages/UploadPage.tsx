import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { DocumentType, MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES, UploadMimeType, type DocumentSummary } from "@moneyback/shared";
import { useApi } from "../api/context";
import { ApiError } from "../api/types";
import { PageHeading, PrimaryButton, PrimaryLink } from "../components/ui";

/** The documents asked for in v1, in the order a user usually has them to hand. */
const UPLOAD_DOCS = [
  DocumentType.enum.policy,
  DocumentType.enum.rejection_letter,
  DocumentType.enum.discharge_summary,
  DocumentType.enum.bill,
] as const;
type UploadDoc = (typeof UPLOAD_DOCS)[number];

const ACCEPT = UPLOAD_MIME_TYPES.join(",");
const MAX_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

type ErrorKey = "tooLarge" | "wrongType" | "empty" | "tooMany" | "locked" | "uploadFailed" | "removeFailed";
type Problem = { key: ErrorKey; name: string };

/** Checks done on the phone first, so a wrong file is refused before any data is used. The API checks again. */
function localProblem(file: File): ErrorKey | null {
  if (!UploadMimeType.safeParse(file.type).success) return "wrongType";
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
}

function uploadProblem(err: unknown): ErrorKey {
  if (err instanceof ApiError) {
    if (err.status === 413) return "tooLarge";
    if (err.status === 415) return "wrongType";
    if (err.message === "empty_file") return "empty";
    if (err.message === "too_many_documents") return "tooMany";
    if (err.message === "case_finished") return "locked";
  }
  return "uploadFailed";
}

/**
 * Documents are sent to the API, which stores them in R2. File names and contents are untrusted:
 * names are shown as plain text only, and nothing from a file is ever run or rendered as HTML.
 */
export function UploadPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { id = "" } = useParams();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Per slot: the file being uploaded now, and the last problem. */
  const [busy, setBusy] = useState<Partial<Record<UploadDoc, string>>>({});
  const [problems, setProblems] = useState<Partial<Record<UploadDoc, Problem>>>({});

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    api.listDocuments(id).then(
      (list) => {
        if (!cancelled) setDocuments(list);
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, id, attempt]);

  const setProblem = (doc: UploadDoc, problem: Problem | undefined) => setProblems((p) => ({ ...p, [doc]: problem }));

  const add = useCallback(
    async (doc: UploadDoc, picked: File[]) => {
      setProblem(doc, undefined);
      for (const file of picked) {
        const local = localProblem(file);
        if (local) {
          setProblem(doc, { key: local, name: file.name });
          continue;
        }
        setBusy((b) => ({ ...b, [doc]: file.name }));
        try {
          const stored = await api.uploadDocument(id, doc, file);
          setDocuments((list) => (list?.some((d) => d.id === stored.id) ? list : [...(list ?? []), stored]));
        } catch (err) {
          setProblem(doc, { key: uploadProblem(err), name: file.name });
        }
      }
      setBusy((b) => ({ ...b, [doc]: undefined }));
    },
    [api, id],
  );

  const remove = useCallback(
    async (doc: UploadDoc, target: DocumentSummary) => {
      setProblem(doc, undefined);
      try {
        await api.deleteDocument(id, target.id);
        setDocuments((list) => list?.filter((d) => d.id !== target.id) ?? null);
      } catch (err) {
        const locked = err instanceof ApiError && err.message === "case_locked";
        setProblem(doc, { key: locked ? "locked" : "removeFailed", name: target.fileName });
      }
    },
    [api, id],
  );

  return (
    <>
      <title>{`${t("upload.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("upload.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("upload.intro")}</p>
      <p className="mt-3 rounded-lg bg-brand-soft px-4 py-3 text-base text-ink">{t("upload.limits", { maxMb: MAX_MB })}</p>

      {loadFailed ? (
        <div role="alert" className="mt-6 space-y-4">
          <p className="text-base text-ink">{t("upload.errors.loadFailed")}</p>
          <PrimaryButton type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t("auth.retry")}
          </PrimaryButton>
        </div>
      ) : documents === null ? (
        <p role="status" className="mt-6 text-base text-muted">
          {t("upload.loading")}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {UPLOAD_DOCS.map((doc) => {
            const inputId = `file-${doc}`;
            const list = documents.filter((d) => d.type === doc);
            const uploading = busy[doc];
            const problem = problems[doc];
            return (
              <li key={doc} data-testid={`slot-${doc}`} className="rounded-xl border border-line bg-card p-4">
                <h2 className="text-base font-semibold text-ink">{t(`upload.docs.${doc}.title`)}</h2>
                <p id={`${inputId}-hint`} className="text-base text-muted">
                  {t(`upload.docs.${doc}.hint`)}
                </p>

                {list.length === 0 ? (
                  <p className="mt-2 text-base text-muted italic">{t("upload.noFile")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {list.map((stored) => (
                      <li key={stored.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
                        <span className="min-w-0 truncate text-base text-ink">{stored.fileName}</span>
                        <button
                          type="button"
                          onClick={() => void remove(doc, stored)}
                          aria-label={t("upload.removeAria", { name: stored.fileName })}
                          className="min-h-11 shrink-0 rounded-md px-3 text-base font-medium text-danger underline"
                        >
                          {t("upload.remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {uploading && (
                  <p role="status" className="mt-2 text-base text-muted">
                    {t("upload.uploading", { name: uploading })}
                  </p>
                )}
                {problem && (
                  <p role="alert" className="mt-2 text-base font-medium text-danger">
                    {t(`upload.errors.${problem.key}`, { name: problem.name, maxMb: MAX_MB })}
                  </p>
                )}

                <label
                  htmlFor={inputId}
                  className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-brand px-4 text-base font-semibold text-brand hover:bg-brand-soft has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                >
                  {list.length > 0 ? t("upload.addMore") : t("upload.addFile")}
                  <input
                    id={inputId}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    disabled={Boolean(uploading)}
                    aria-describedby={`${inputId}-hint`}
                    className="sr-only"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (picked.length > 0) void add(doc, picked);
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <PrimaryLink to={`/cases/${encodeURIComponent(id)}`} className="mt-8">
        {t("upload.continue")}
      </PrimaryLink>
    </>
  );
}
