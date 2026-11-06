import { useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { DocumentType } from "@moneyback/shared";
import { PageHeading, PrimaryLink } from "../components/ui";

/** The documents asked for in v1, in the order a user usually has them to hand. */
const UPLOAD_DOCS = [
  DocumentType.enum.policy,
  DocumentType.enum.rejection_letter,
  DocumentType.enum.discharge_summary,
  DocumentType.enum.bill,
] as const;
type UploadDoc = (typeof UPLOAD_DOCS)[number];

const ACCEPT = "application/pdf,image/*";

/**
 * UI only (W1-07): files are kept in memory and never leave the device. Real upload uses
 * R2 signed URLs from B-02. Treat file contents as untrusted when that lands.
 */
export function UploadPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [files, setFiles] = useState<Record<UploadDoc, File[]>>({
    policy: [],
    rejection_letter: [],
    discharge_summary: [],
    bill: [],
  });

  const add = (doc: UploadDoc, list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setFiles((f) => ({ ...f, [doc]: doc === "bill" ? [...f[doc], ...picked] : picked.slice(0, 1) }));
  };
  const remove = (doc: UploadDoc, index: number) =>
    setFiles((f) => ({ ...f, [doc]: f[doc].filter((_, i) => i !== index) }));

  return (
    <>
      <title>{`${t("upload.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("upload.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("upload.intro")}</p>
      <p className="mt-3 rounded-lg bg-brand-soft px-4 py-3 text-base text-ink">{t("upload.localOnly")}</p>

      <ul className="mt-6 space-y-4">
        {UPLOAD_DOCS.map((doc) => {
          const inputId = `file-${doc}`;
          const list = files[doc];
          const multiple = doc === "bill";
          return (
            <li key={doc} className="rounded-xl border border-line bg-card p-4">
              <h2 className="text-base font-semibold text-ink">{t(`upload.docs.${doc}.title`)}</h2>
              <p id={`${inputId}-hint`} className="text-base text-muted">
                {t(`upload.docs.${doc}.hint`)}
              </p>

              {list.length === 0 ? (
                <p className="mt-2 text-base text-muted italic">{t("upload.noFile")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {list.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-base text-ink">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => remove(doc, index)}
                        aria-label={t("upload.removeAria", { name: file.name })}
                        className="min-h-11 shrink-0 rounded-md px-3 text-base font-medium text-danger underline"
                      >
                        {t("upload.remove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label
                htmlFor={inputId}
                className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-brand px-4 text-base font-semibold text-brand hover:bg-brand-soft has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                {list.length > 0 && multiple ? t("upload.addMore") : t("upload.addFile")}
                <input
                  id={inputId}
                  type="file"
                  accept={ACCEPT}
                  multiple={multiple}
                  aria-describedby={`${inputId}-hint`}
                  className="sr-only"
                  onChange={(e) => {
                    add(doc, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>

      <PrimaryLink to={`/cases/${encodeURIComponent(id)}`} className="mt-8">
        {t("upload.continue")}
      </PrimaryLink>
    </>
  );
}
