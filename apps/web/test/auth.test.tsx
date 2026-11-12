import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEventLike from "./user";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { ApiProvider } from "../src/api/context";
import { createHttpApi } from "../src/api/http";
import { createMockApi } from "../src/api/mock";
import { ApiError, type MoneyBackApi } from "../src/api/types";
import { safeNextPath } from "../src/features/auth/RequireAuth";
import { createI18n } from "../src/i18n";
import { routes } from "../src/routes";

// Google's real button lives in an iframe served by Google. In tests a plain button stands in for it.
vi.mock("../src/features/auth/GoogleButton", () => ({
  GoogleButton: ({ onCredential }: { onCredential(credential: string): void }) => (
    <button type="button" onClick={() => onCredential("google-id-token")}>
      Continue with Google
    </button>
  ),
}));
vi.mock("../src/config", () => ({ API_URL: "", GOOGLE_CLIENT_ID: "test-client-id" }));

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

describe("sign-in gate", () => {
  it("lets a signed-out visitor read the home page", async () => {
    renderAt("/", createMockApi({ signedIn: false }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Claim rejected or only partly paid?");
    expect(screen.queryByTestId("sign-out")).toBeNull();
  });

  it("sends a signed-out visitor from a case page to sign-in, then back after signing in", async () => {
    const api = createMockApi({ signedIn: false });
    const signIn = vi.spyOn(api, "signInWithGoogle");
    const router = renderAt("/cases/new", api);

    expect(await screen.findByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
    expect(at(router)).toBe("/sign-in?next=%2Fcases%2Fnew");
    expect(screen.queryByTestId("intake-submit")).toBeNull();

    await userEventLike.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByTestId("intake-submit")).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith("google-id-token");
    expect(at(router)).toBe("/cases/new");
  });

  it("does not show a case to a signed-out visitor", async () => {
    const api = createMockApi({ signedIn: false });
    const getCase = vi.spyOn(api, "getCase");
    const router = renderAt("/cases/demo", api);
    await screen.findByRole("heading", { name: "Sign in to continue" });
    expect(at(router)).toBe("/sign-in?next=%2Fcases%2Fdemo");
    expect(getCase).not.toHaveBeenCalled();
  });

  it("shows a plain message when sign-in fails, and stays signed out", async () => {
    const api = createMockApi({ signedIn: false });
    vi.spyOn(api, "signInWithGoogle").mockRejectedValue(new ApiError(401, "invalid_credential"));
    renderAt("/sign-in", api);
    await userEventLike.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not sign you in. Please try again.");
    expect(screen.queryByTestId("sign-out")).toBeNull();
  });

  it("explains a rate limit", async () => {
    const api = createMockApi({ signedIn: false });
    vi.spyOn(api, "signInWithGoogle").mockRejectedValue(new ApiError(429, "rate_limited"));
    renderAt("/sign-in", api);
    await userEventLike.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
  });

  it("offers a retry when the API cannot be reached, instead of pretending the visitor is signed out", async () => {
    const api = createMockApi();
    const getMe = vi.spyOn(api, "getMe").mockRejectedValueOnce(new ApiError(0, "network_error"));
    renderAt("/cases/new", api);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach MoneyBack.");
    await userEventLike.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("intake-submit")).toBeInTheDocument();
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it("signs out and locks the case pages again", async () => {
    const api = createMockApi();
    const router = renderAt("/cases/new", api);
    await userEventLike.click(await screen.findByTestId("sign-out"));
    await screen.findByRole("heading", { name: "Sign in to continue" });
    expect(at(router)).toBe("/sign-in?next=%2Fcases%2Fnew");
    expect(await api.getMe()).toBeNull();
  });

  it("sends an already signed-in visitor away from the sign-in page", async () => {
    const router = renderAt("/sign-in?next=%2Fcases%2Fdemo", createMockApi());
    await waitFor(() => expect(at(router)).toBe("/cases/demo"));
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/cases/new", "/cases/new"],
    ["/cases/abc?x=1", "/cases/abc?x=1"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("HTTP client", () => {
  const caseRecord = {
    id: "c1",
    userId: "u1",
    category: "health_insurance",
    insurer: "X",
    claimAmountPaise: 100,
    status: "intake",
    verdict: null,
    nextDeadline: null,
    amountRecoveredPaise: 0,
    createdAt: "2026-11-12T10:00:00.000Z",
    updatedAt: "2026-11-12T10:00:00.000Z",
  };
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const client = (respond: (url: string, init: RequestInit) => Response | Promise<Response>) => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => respond(String(url), init ?? {}));
    return { api: createHttpApi("http://api.test/", fetchImpl as typeof fetch), fetchImpl };
  };

  it("sends the session cookie on every call and never caches", async () => {
    const { api, fetchImpl } = client(() => json(caseRecord, 201));
    await api.createCase({ insurer: "X", claimAmountPaise: 100 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/cases",
      expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store" }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({ insurer: "X", claimAmountPaise: 100 });
  });

  it("treats 401 from /auth/me as signed out, and other failures as errors", async () => {
    expect(await client(() => json({ error: "unauthenticated" }, 401)).api.getMe()).toBeNull();
    await expect(client(() => json({ error: "internal_error" }, 500)).api.getMe()).rejects.toMatchObject({ status: 500 });
    await expect(
      client(() => {
        throw new TypeError("offline");
      }).api.getMe(),
    ).rejects.toMatchObject({ status: 0, message: "network_error" });
  });

  it("returns the user after Google sign-in", async () => {
    const user = { id: "u1", email: "a@example.com", consentVersion: null };
    const { api, fetchImpl } = client(() => json(user));
    expect(await api.signInWithGoogle("tok")).toEqual(user);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://api.test/auth/google");
  });

  it("carries the API's error code and status", async () => {
    const { api } = client(() => json({ error: "not_found" }, 404));
    await expect(api.getCase("nope")).rejects.toMatchObject({ name: "ApiError", status: 404, message: "not_found" });
  });

  it("rejects a response that is not a valid case", async () => {
    const { api } = client(() => json({ ...caseRecord, claimAmountPaise: "lots" }));
    await expect(api.getCase("c1")).rejects.toMatchObject({ message: "bad_response" });
  });

  it("escapes the case id in the address", async () => {
    const { api, fetchImpl } = client(() => json(caseRecord));
    await api.getCase("../auth/me");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://api.test/cases/..%2Fauth%2Fme");
  });
});
