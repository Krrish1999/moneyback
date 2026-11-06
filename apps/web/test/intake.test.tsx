import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEventLike from "./user";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { ApiProvider } from "../src/api/context";
import { createMockApi } from "../src/api/mock";
import { DEV_USER_ID, type MoneyBackApi } from "../src/api/types";
import { CreateCaseInput } from "@moneyback/shared";
import { buildTimeline } from "../src/pages/CasePage";
import { intakeExtrasStore } from "../src/features/intake/extrasStore";
import { createI18n } from "../src/i18n";
import { routes } from "../src/routes";
import { EMPTY_INTAKE, validateIntake, type IntakeFormValues } from "../src/features/intake/validation";

const TODAY = "2026-11-06";
const valid: IntakeFormValues = {
  insurerName: "  Star Health  ",
  claimType: "reimbursement",
  claimAmount: "1,20,000",
  rejectionDate: "2026-10-01",
  insurerStatement: "Pre-existing disease not disclosed.",
};

describe("validateIntake", () => {
  it("returns a clean request for valid input", () => {
    const result = validateIntake(valid, TODAY);
    expect(result).toEqual({
      ok: true,
      request: {
        userId: DEV_USER_ID,
        category: "health_insurance",
        insurer: "Star Health",
        claimAmountPaise: 1_20_000_00,
      },
      extras: {
        claimType: "reimbursement",
        rejectionDate: "2026-10-01",
        insurerStatement: "Pre-existing disease not disclosed.",
      },
    });
    if (result.ok) expect(CreateCaseInput.safeParse(result.request).success).toBe(true);
  });

  it("flags every empty field", () => {
    const result = validateIntake(EMPTY_INTAKE, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      insurerName: "insurerRequired",
      claimType: "claimTypeRequired",
      claimAmount: "amountRequired",
      rejectionDate: "dateRequired",
      insurerStatement: "statementRequired",
    });
  });

  it.each([
    [{ claimAmount: "abc" }, "claimAmount", "amountInvalid"],
    [{ claimAmount: "0" }, "claimAmount", "amountTooLow"],
    [{ claimAmount: "9999999999" }, "claimAmount", "amountTooHigh"],
    [{ rejectionDate: "2026-11-07" }, "rejectionDate", "dateFuture"],
    [{ rejectionDate: "07/10/2026" }, "rejectionDate", "dateInvalid"],
    [{ claimType: "other" }, "claimType", "claimTypeRequired"],
    [{ insurerStatement: "x".repeat(2001) }, "insurerStatement", "statementTooLong"],
  ] as const)("rejects %j", (patch, field, key) => {
    const result = validateIntake({ ...valid, ...patch }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBe(key);
  });

  it("accepts a rejection dated today", () => {
    expect(validateIntake({ ...valid, rejectionDate: TODAY }, TODAY).ok).toBe(true);
  });
});

function renderAt(path: string, api: MoneyBackApi = createMockApi()) {
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

describe("intake form", () => {
  it("shows errors and does not call the API when submitted empty", async () => {
    const api = createMockApi();
    const createCase = vi.spyOn(api, "createCase");
    renderAt("/cases/new", api);

    await userEventLike.click(screen.getByTestId("intake-submit"));

    expect(screen.getByRole("alert")).toHaveTextContent("Please check the fields marked below.");
    expect(screen.getByText("Please enter the name of the insurance company.")).toBeInTheDocument();
    expect(screen.getByLabelText("Insurance company")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Insurance company")).toHaveFocus();
    expect(createCase).not.toHaveBeenCalled();
  });

  it("creates the case and moves to the upload step when valid", async () => {
    const router = renderAt("/cases/new");

    await userEventLike.type(screen.getByLabelText("Insurance company"), "Star Health");
    await userEventLike.click(screen.getByLabelText(/Reimbursement/));
    await userEventLike.type(screen.getByLabelText("Claim amount (₹)"), "45000");
    await userEventLike.type(screen.getByLabelText("Date of rejection"), "2026-01-15");
    await userEventLike.type(screen.getByLabelText("What did the insurer say?"), "Room rent limit exceeded");
    await userEventLike.click(screen.getByTestId("intake-submit"));

    expect(await screen.findByRole("heading", { name: "Add your documents" })).toBeInTheDocument();
    const match = /^\/cases\/([0-9a-f-]{36})\/upload$/.exec(router.state.location.pathname);
    expect(match).not.toBeNull();
    expect(intakeExtrasStore.get(match![1]!)).toEqual({
      claimType: "reimbursement",
      rejectionDate: "2026-01-15",
      insurerStatement: "Room rent limit exceeded",
    });
  });
});

describe("language switch", () => {
  it("switches the whole UI to Hindi", async () => {
    renderAt("/");
    await userEventLike.click(screen.getByTestId("language-switch"));
    expect(await screen.findByTestId("start-case-button")).toHaveTextContent("मुफ़्त केस जाँच शुरू करें");
    expect(document.documentElement.lang).toBe("hi");
  });
});

describe("case timeline", () => {
  const summary = (status: Parameters<typeof buildTimeline>[0]) =>
    buildTimeline(status).map((s) => `${s.status}:${s.state}${s.optional ? "?" : ""}`);

  it("marks earlier steps done and escalation optional while waiting", () => {
    expect(summary("waiting")).toEqual([
      "intake:done", "analysing:done", "draft:done", "sent:done", "waiting:current", "escalated:upcoming?", "outcome:upcoming",
    ]);
  });

  it("shows review only when the case is in review", () => {
    expect(summary("review").slice(0, 3)).toEqual(["intake:done", "analysing:done", "review:current"]);
    expect(summary("draft")).not.toContain("review:done");
  });

  it("ends with the result for finished cases", () => {
    expect(summary("won").at(-1)).toBe("won:current");
    expect(summary("closed")).toEqual(["intake:done", "closed:current"]);
  });

  it("renders the demo case with its deadline", async () => {
    renderAt("/cases/demo");
    const timeline = await screen.findByTestId("case-timeline");
    expect(timeline.querySelector('[aria-current="step"]')).toHaveTextContent("Waiting for a reply");
    expect(screen.getByTestId("next-deadline")).toHaveTextContent(/^By \d{1,2} \w+ \d{4}$/);
  });
});
