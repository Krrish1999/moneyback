import type { CaseStatus, DocumentType } from "@moneyback/shared";

type StatusCopy = { title: string; body: string };
type UploadDoc = Extract<DocumentType, "policy" | "rejection_letter" | "discharge_summary" | "bill">;

/**
 * English strings. `hi.ts` is typed against this object, so a missing Hindi key fails `pnpm typecheck`.
 *
 * PLACEHOLDER COPY: everything under `home.fees`, and the fee wording in general, is placeholder until the
 * founder approves it (CLAUDE.md "founder decides"). Prices themselves come from PRICES_PAISE in @moneyback/shared.
 */
export const en = {
  app: {
    name: "MoneyBack",
    skipToContent: "Skip to main content",
    homeLink: "MoneyBack home",
  },
  language: {
    switchLabel: "हिन्दी",
    switchAria: "Switch language to Hindi",
  },
  footer: {
    disclaimer: "MoneyBack is a complaint-filing assistant, not a law firm.",
  },
  home: {
    pageTitle: "Get your health insurance claim money back",
    eyebrow: "Health insurance claims",
    title: "Claim rejected or only partly paid?",
    intro1:
      "MoneyBack helps you challenge a rejected or partly paid health insurance claim, using your own documents.",
    intro2:
      "We prepare a clear complaint and follow it up with the insurer, Bima Bharosa and the Insurance Ombudsman, keeping track of every deadline for you.",
    cta: "Start a free case check",
    ctaHint: "Takes about 5 minutes. No payment needed to start.",
    // PLACEHOLDER — fee wording needs founder approval.
    fees: {
      title: "How fees work",
      intro: "You pay only at the steps you choose to take.",
      free: "Free",
      check: { title: "Case check", body: "We tell you how strong your case looks." },
      filing: { title: "Filing your complaint", body: "Paid only when you approve the complaint and want it filed." },
      escalation: {
        title: "Escalation",
        body: "Only if the insurer does not fix it and your case has to go to Bima Bharosa or the Ombudsman.",
      },
      success: {
        title: "Success fee",
        body: "Only if you get money back, as a share of the amount you receive. If you get nothing, you pay nothing.",
      },
    },
  },
  intake: {
    pageTitle: "Start a case check",
    title: "Tell us about your claim",
    intro: "A few details are enough to start. You can add documents in the next step.",
    insurerName: { label: "Insurance company", hint: "For example: Star Health, HDFC ERGO, Niva Bupa" },
    claimType: {
      legend: "Type of claim",
      cashless: "Cashless",
      cashlessHint: "The hospital asked the insurer to pay directly.",
      reimbursement: "Reimbursement",
      reimbursementHint: "You paid the hospital and asked the insurer to pay you back.",
    },
    claimAmount: { label: "Claim amount (₹)", hint: "The amount you asked the insurer for, in rupees." },
    rejectionDate: { label: "Date of rejection", hint: "The date on the rejection letter, email or message." },
    insurerStatement: {
      label: "What did the insurer say?",
      hint: "Write it in your own words, in English or Hindi. If the letter gives a reason, copy it here.",
    },
    submit: "Continue",
    submitting: "Saving…",
    errorSummary: "Please check the fields marked below.",
    errors: {
      insurerRequired: "Please enter the name of the insurance company.",
      claimTypeRequired: "Please choose cashless or reimbursement.",
      amountRequired: "Please enter the claim amount.",
      amountInvalid: "Please enter the amount in rupees using numbers only, for example 45000.",
      amountTooLow: "The amount must be more than zero.",
      amountTooHigh: "This amount looks too large. Please check it.",
      dateRequired: "Please enter the date of rejection.",
      dateInvalid: "Please enter a valid date.",
      dateFuture: "The date cannot be in the future.",
      statementRequired: "Please tell us what the insurer said.",
      statementTooLong: "Please keep this under {{max}} characters.",
      saveFailed: "We could not save your case. Please try again.",
    },
  },
  upload: {
    pageTitle: "Add documents",
    title: "Add your documents",
    intro: "Photos or PDFs are both fine. Add what you have now; you can add the rest later.",
    localOnly: "For now, files stay on this phone. Nothing is uploaded yet.",
    addFile: "Add file",
    addMore: "Add another file",
    remove: "Remove",
    removeAria: "Remove {{name}}",
    noFile: "No file added yet",
    continue: "Continue to my case",
    docs: {
      policy: { title: "Policy document", hint: "The policy schedule or the full policy copy." },
      rejection_letter: { title: "Rejection letter", hint: "The letter, email or message from the insurer or TPA." },
      discharge_summary: { title: "Discharge summary", hint: "The summary the hospital gave you when you left." },
      bill: { title: "Hospital bills", hint: "Final bill and receipts. You can add more than one file." },
    } satisfies Record<UploadDoc, { title: string; hint: string }>,
  },
  case: {
    pageTitle: "Your case",
    title: "Your case",
    reference: "Case reference: {{id}}",
    sample: "Sample case with demo data",
    insurer: "Insurance company",
    amount: "Claim amount",
    started: "Started on",
    timelineTitle: "Progress",
    stepDone: "Done",
    stepCurrent: "Now",
    stepUpcoming: "Coming up",
    stepOptional: "Only if needed",
    nextDeadline: "Next deadline",
    deadlineDetail: "By {{date}}",
    noDeadline: "We will show your next deadline here once your documents have been checked.",
    loading: "Opening your case…",
    notFound: "We could not find this case. The link may be wrong, or the case was made in another browser session.",
    loadFailed: "We could not open your case. Please try again.",
    addDocuments: "Add documents",
    outcome: { title: "Result", body: "The final answer from the insurer or the Ombudsman." },
    status: {
      intake: { title: "Details received", body: "We have your claim details." },
      analysing: { title: "Checking your documents", body: "We read your documents and see how strong your case is." },
      review: { title: "Team review", body: "A person from our team is checking your case." },
      draft: { title: "Complaint ready", body: "Read the complaint and approve it before it is filed." },
      sent: { title: "Complaint filed", body: "Your complaint has been sent to the insurer." },
      waiting: {
        title: "Waiting for a reply",
        body: "The insurer has a fixed time to reply. We keep track of it for you.",
      },
      escalated: {
        title: "Taken further",
        body: "Your complaint has been taken to Bima Bharosa or the Insurance Ombudsman.",
      },
      won: { title: "Money received", body: "The insurer has paid." },
      lost: { title: "Not successful", body: "The decision did not go your way this time." },
      closed: { title: "Case closed", body: "This case was closed without filing a complaint." },
    } satisfies Record<CaseStatus, StatusCopy>,
  },
  notFound: {
    pageTitle: "Page not found",
    title: "Page not found",
    body: "The page you are looking for is not here.",
    home: "Go to the home page",
  },
};

export type Messages = typeof en;
