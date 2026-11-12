import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEventLike from "./user";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { CONSENT_VERSION } from "@moneyback/shared";
import { ApiProvider } from "../src/api/context";
import { createHttpApi } from "../src/api/http";
import { createMockApi } from "../src/api/mock";
import { ApiError, type MoneyBackApi } from "../src/api/types";
import { createI18n } from "../src/i18n";
import { en } from "../src/i18n/en";
import { routes } from "../src/routes";

function renderAt(path: string, api: MoneyBackApi) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </I18nextProvider>,
  );
  return router;
}

const at = (router: ReturnType<typeof renderAt>) => `${router.state.location.pathname}${router.state.location.search}`;
const UPLOAD = "/cases/demo/upload";

describe("consent gate", () => {
  it("sends a user who has not agreed from upload to the consent page, and shows no upload controls", async () => {
    const router = renderAt(UPLOAD, createMockApi({ consented: false }));
    expect(await screen.findByRole("heading", { name: "Before you add documents" })).toBeInTheDocument();
    expect(at(router)).toBe("/consent?next=%2Fcases%2Fdemo%2Fupload");
    expect(screen.queryByRole("heading", { name: "Add your documents" })).toBeNull();
    expect(screen.getByTestId("consent-draft")).toBeInTheDocument();
  });

  it("does not record consent until the box is ticked", async () => {
    const api = createMockApi({ consented: false });
    const accept = vi.spyOn(api, "acceptConsent");
    renderAt(UPLOAD, api);
    await userEventLike.click(await screen.findByTestId("consent-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please tick the box to give your permission.");
    expect(accept).not.toHaveBeenCalled();
  });

  it("records the current version and then opens upload", async () => {
    const api = createMockApi({ consented: false });
    const accept = vi.spyOn(api, "acceptConsent");
    const router = renderAt(UPLOAD, api);

    await userEventLike.click(await screen.findByRole("checkbox"));
    await userEventLike.click(screen.getByTestId("consent-submit"));

    expect(await screen.findByRole("heading", { name: "Add your documents" })).toBeInTheDocument();
    expect(accept).toHaveBeenCalledWith(CONSENT_VERSION);
    expect(at(router)).toBe(UPLOAD);
    expect((await api.getMe())?.consentVersion).toBe(CONSENT_VERSION);
  });

  it("stays on the consent page when saving fails", async () => {
    const api = createMockApi({ consented: false });
    vi.spyOn(api, "acceptConsent").mockRejectedValue(new ApiError(500, "internal_error"));
    const router = renderAt(UPLOAD, api);
    await userEventLike.click(await screen.findByRole("checkbox"));
    await userEventLike.click(screen.getByTestId("consent-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save your permission.");
    expect(at(router)).toContain("/consent");
  });

  it("asks again when the user agreed only to an older version", async () => {
    const api = createMockApi();
    vi.spyOn(api, "getMe").mockResolvedValue({ id: "u", email: null, consentVersion: "older-version" });
    const router = renderAt(UPLOAD, api);
    await screen.findByRole("heading", { name: "Before you add documents" });
    expect(at(router)).toContain("/consent");
  });

  it("lets a user who already agreed straight through, and away from the consent page", async () => {
    renderAt(UPLOAD, createMockApi());
    expect(await screen.findByRole("heading", { name: "Add your documents" })).toBeInTheDocument();
    const router = renderAt("/consent?next=%2Fcases%2Fdemo", createMockApi());
    await waitFor(() => expect(at(router)).toBe("/cases/demo"));
  });

  it("needs sign-in before consent", async () => {
    const router = renderAt("/consent", createMockApi({ signedIn: false }));
    await screen.findByRole("heading", { name: "Sign in to continue" });
    expect(at(router)).toBe("/sign-in?next=%2Fconsent");
  });

  it("does not ask for consent to start a case or view one", async () => {
    renderAt("/cases/new", createMockApi({ consented: false }));
    expect(await screen.findByTestId("intake-submit")).toBeInTheDocument();
  });
});

describe("privacy page", () => {
  it("is open to a signed-out visitor, without the delete control", async () => {
    renderAt("/privacy", createMockApi({ signedIn: false }));
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy and your data" })).toBeInTheDocument();
    expect(screen.getByText(en.consent.points.processors.body)).toBeInTheDocument();
    expect(screen.queryByTestId("delete-data")).toBeNull();
  });

  it("is linked from the footer of every page", async () => {
    const router = renderAt("/", createMockApi({ signedIn: false }));
    await userEventLike.click(await screen.findByTestId("privacy-link"));
    await waitFor(() => expect(at(router)).toBe("/privacy"));
  });

  it("deletes the data only after a second, explicit confirmation", async () => {
    const api = createMockApi();
    const del = vi.spyOn(api, "deleteAccount");
    const router = renderAt("/privacy", api);

    await userEventLike.click(await screen.findByTestId("delete-data"));
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Delete everything now?");

    await userEventLike.click(screen.getByRole("button", { name: "Cancel" }));
    expect(del).not.toHaveBeenCalled();

    await userEventLike.click(screen.getByTestId("delete-data"));
    await userEventLike.click(screen.getByTestId("delete-data-confirm"));
    await waitFor(() => expect(at(router)).toBe("/"));
    expect(del).toHaveBeenCalledTimes(1);
    expect(await api.getMe()).toBeNull();
    expect(screen.queryByTestId("sign-out")).toBeNull();
  });

  it("says so when deleting fails, and keeps the user signed in", async () => {
    const api = createMockApi();
    vi.spyOn(api, "deleteAccount").mockRejectedValue(new ApiError(500, "internal_error"));
    renderAt("/privacy", api);
    await userEventLike.click(await screen.findByTestId("delete-data"));
    await userEventLike.click(screen.getByTestId("delete-data-confirm"));
    expect(await screen.findByText("We could not delete your data. Please try again.")).toBeInTheDocument();
    expect(screen.getByTestId("sign-out")).toBeInTheDocument();
  });
});

describe("HTTP client: consent and deletion", () => {
  const client = (respond: () => Response) => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => respond());
    return { api: createHttpApi("http://api.test", fetchImpl as typeof fetch), fetchImpl };
  };

  it("posts the consent version", async () => {
    const record = { version: CONSENT_VERSION, acceptedAt: "2026-11-12T10:00:00.000Z" };
    const { api, fetchImpl } = client(() => Response.json(record));
    expect(await api.acceptConsent(CONSENT_VERSION)).toEqual(record);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://api.test/account/consent");
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({ version: CONSENT_VERSION });
  });

  it("sends DELETE /account with the session cookie", async () => {
    const { api, fetchImpl } = client(() => Response.json({ ok: true }));
    await api.deleteAccount();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/account",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("passes on a refusal", async () => {
    const { api } = client(() => Response.json({ error: "consent_version_outdated" }, { status: 409 }));
    await expect(api.acceptConsent("old")).rejects.toMatchObject({ status: 409, message: "consent_version_outdated" });
  });
});
