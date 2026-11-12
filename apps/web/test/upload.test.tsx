import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEventLike from "./user";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { MAX_DOCUMENTS_PER_CASE, MAX_UPLOAD_BYTES } from "@moneyback/shared";
import { ApiProvider } from "../src/api/context";
import { createHttpApi } from "../src/api/http";
import { createMockApi } from "../src/api/mock";
import { ApiError, type MoneyBackApi } from "../src/api/types";
import { createI18n } from "../src/i18n";
import { routes } from "../src/routes";

const pdf = (name = "policy.pdf", body = "%PDF-1.7 x") => new File([body], name, { type: "application/pdf" });
const sized = (name: string, size: number, type = "application/pdf") => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

async function openUpload(api: MoneyBackApi = createMockApi()) {
  const created = await api.createCase({ insurer: "X", claimAmountPaise: 100 });
  const router = createMemoryRouter(routes, { initialEntries: [`/cases/${created.id}/upload`] });
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </I18nextProvider>,
  );
  await screen.findByTestId("slot-policy");
  return { api, caseId: created.id };
}

const slot = (doc: string) => within(screen.getByTestId(`slot-${doc}`));

async function pick(doc: string, ...files: File[]) {
  const input = screen.getByTestId(`slot-${doc}`).querySelector("input[type=file]")!;
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

describe("upload page", () => {
  it("states the limits and starts empty", async () => {
    await openUpload();
    expect(screen.getByText("PDF, JPG or PNG. Up to 10 MB for each file.")).toBeInTheDocument();
    expect(screen.getAllByText("No file added yet")).toHaveLength(4);
  });

  it("uploads a picked file to the right kind of document and lists it", async () => {
    const { api, caseId } = await openUpload();
    const upload = vi.spyOn(api, "uploadDocument");
    await pick("rejection_letter", pdf("letter.pdf"));

    expect(await slot("rejection_letter").findByText("letter.pdf")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith(caseId, "rejection_letter", expect.any(File));
    expect(slot("policy").queryByText("letter.pdf")).toBeNull();
    expect((await api.listDocuments(caseId)).map((d) => d.type)).toEqual(["rejection_letter"]);
  });

  it("takes several files in one go", async () => {
    const { api, caseId } = await openUpload();
    await pick("bill", pdf("bill-1.pdf", "%PDF a"), pdf("bill-2.pdf", "%PDF bb"));
    expect(await slot("bill").findByText("bill-2.pdf")).toBeInTheDocument();
    expect(slot("bill").getByText("bill-1.pdf")).toBeInTheDocument();
    expect(await api.listDocuments(caseId)).toHaveLength(2);
  });

  it("shows documents that were uploaded earlier", async () => {
    const api = createMockApi();
    const created = await api.createCase({ insurer: "X", claimAmountPaise: 100 });
    await api.uploadDocument(created.id, "policy", pdf("old-policy.pdf"));
    const router = createMemoryRouter(routes, { initialEntries: [`/cases/${created.id}/upload`] });
    render(
      <I18nextProvider i18n={createI18n("en")}>
        <ApiProvider api={api}>
          <RouterProvider router={router} />
        </ApiProvider>
      </I18nextProvider>,
    );
    expect(await screen.findByText("old-policy.pdf")).toBeInTheDocument();
  });

  it.each([
    ["a file that is too large", sized("huge.pdf", MAX_UPLOAD_BYTES + 1), "huge.pdf is larger than 10 MB. Please choose a smaller file."],
    ["a file of the wrong type", new File(["x"], "notes.docx", { type: "application/msword" }), "notes.docx is not a PDF, JPG or PNG file."],
    ["an empty file", sized("blank.pdf", 0), "blank.pdf is empty."],
  ])("refuses %s on the phone, without calling the API", async (_name, file, message) => {
    const { api } = await openUpload();
    const upload = vi.spyOn(api, "uploadDocument");
    await pick("policy", file);
    expect(slot("policy").getByRole("alert")).toHaveTextContent(message);
    expect(upload).not.toHaveBeenCalled();
  });

  it("still uploads the good files when one in the batch is bad", async () => {
    await openUpload();
    await pick("bill", new File(["x"], "bad.gif", { type: "image/gif" }), pdf("good.pdf"));
    expect(await slot("bill").findByText("good.pdf")).toBeInTheDocument();
    expect(slot("bill").getByRole("alert")).toHaveTextContent("bad.gif is not a PDF, JPG or PNG file.");
  });

  it.each([
    [new ApiError(415, "unsupported_file_type"), "policy.pdf is not a PDF, JPG or PNG file."],
    [new ApiError(413, "file_too_large"), "policy.pdf is larger than 10 MB."],
    [new ApiError(409, "too_many_documents"), "This case already has the most documents it can hold."],
    [new ApiError(0, "network_error"), "We could not upload policy.pdf. Please try again."],
  ])("explains the API's refusal %#", async (error, message) => {
    const { api } = await openUpload();
    vi.spyOn(api, "uploadDocument").mockRejectedValue(error);
    await pick("policy", pdf());
    expect(await slot("policy").findByRole("alert")).toHaveTextContent(message);
    expect(slot("policy").getByText("No file added yet")).toBeInTheDocument();
  });

  it("removes a document", async () => {
    const { api, caseId } = await openUpload();
    await pick("policy", pdf());
    await userEventLike.click(await screen.findByRole("button", { name: "Remove policy.pdf" }));
    await waitFor(() => expect(slot("policy").queryByText("policy.pdf")).toBeNull());
    expect(await api.listDocuments(caseId)).toEqual([]);
  });

  it("keeps the document listed when removing fails", async () => {
    const { api } = await openUpload();
    await pick("policy", pdf());
    vi.spyOn(api, "deleteDocument").mockRejectedValue(new ApiError(409, "case_locked"));
    await userEventLike.click(await screen.findByRole("button", { name: "Remove policy.pdf" }));
    expect(await slot("policy").findByRole("alert")).toHaveTextContent("Documents can no longer be changed for this case.");
    expect(slot("policy").getByText("policy.pdf")).toBeInTheDocument();
  });

  it("shows a file name as plain text, never as HTML", async () => {
    await openUpload();
    await pick("policy", pdf('<img src=x onerror="alert(1)">.pdf'));
    expect(await screen.findByText('<img src=x onerror="alert(1)">.pdf')).toBeInTheDocument();
    expect(screen.getByTestId("slot-policy").querySelector("img")).toBeNull();
  });

  it("offers a retry when the list cannot be loaded", async () => {
    const api = createMockApi();
    const list = vi.spyOn(api, "listDocuments").mockRejectedValueOnce(new ApiError(0, "network_error"));
    const created = await api.createCase({ insurer: "X", claimAmountPaise: 100 });
    const router = createMemoryRouter(routes, { initialEntries: [`/cases/${created.id}/upload`] });
    render(
      <I18nextProvider i18n={createI18n("en")}>
        <ApiProvider api={api}>
          <RouterProvider router={router} />
        </ApiProvider>
      </I18nextProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your documents.");
    await userEventLike.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("slot-policy")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("mock API documents", () => {
  it("follows the same rules as the real API", async () => {
    const api = createMockApi();
    const { id } = await api.createCase({ insurer: "X", claimAmountPaise: 100 });
    const first = await api.uploadDocument(id, "policy", pdf("a.pdf"));
    expect(await api.uploadDocument(id, "bill", pdf("a.pdf"))).toEqual(first); // same file again
    await expect(api.uploadDocument(id, "policy", sized("big.pdf", MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ status: 413 });
    await expect(api.uploadDocument(id, "policy", new File(["x"], "a.gif", { type: "image/gif" }))).rejects.toMatchObject({ status: 415 });
    await expect(api.uploadDocument("missing", "policy", pdf())).rejects.toMatchObject({ status: 404 });
    for (let i = 1; i < MAX_DOCUMENTS_PER_CASE; i++) await api.uploadDocument(id, "bill", pdf(`bill-${i}.pdf`));
    await expect(api.uploadDocument(id, "bill", pdf("one-too-many.pdf"))).rejects.toMatchObject({ message: "too_many_documents" });
  });

  it("refuses uploads without consent", async () => {
    const api = createMockApi({ consented: false });
    const { id } = await api.createCase({ insurer: "X", claimAmountPaise: 100 });
    await expect(api.uploadDocument(id, "policy", pdf())).rejects.toMatchObject({ status: 403, message: "consent_required" });
  });
});

describe("HTTP client: documents", () => {
  const summary = {
    id: "d1",
    caseId: "c1",
    type: "policy",
    fileName: "policy.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    sha256: "a".repeat(64),
    createdAt: "2026-11-12T10:00:00.000Z",
  };
  const client = (respond: () => Response) => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => respond());
    return { api: createHttpApi("http://api.test", fetchImpl as typeof fetch), fetchImpl };
  };

  it("sends the file as the body, with its name in a header and not in the address", async () => {
    const { api, fetchImpl } = client(() => Response.json(summary, { status: 201 }));
    const file = pdf("मेरी पॉलिसी.pdf");
    expect(await api.uploadDocument("c1", "policy", file)).toEqual(summary);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/cases/c1/documents?type=policy");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: file });
    expect(init?.headers).toEqual({ "content-type": "application/pdf", "x-file-name": encodeURIComponent("मेरी पॉलिसी.pdf") });
  });

  it("lists and deletes", async () => {
    const listing = client(() => Response.json([summary]));
    expect(await listing.api.listDocuments("c1")).toEqual([summary]);
    const deleting = client(() => Response.json({ ok: true }));
    await deleting.api.deleteDocument("c1", "d/1");
    expect(deleting.fetchImpl).toHaveBeenCalledWith("http://api.test/cases/c1/documents/d%2F1", expect.objectContaining({ method: "DELETE" }));
  });

  it("rejects a listing that is not valid", async () => {
    const { api } = client(() => Response.json([{ ...summary, sizeBytes: "big" }]));
    await expect(api.listDocuments("c1")).rejects.toMatchObject({ message: "bad_response" });
  });
});
