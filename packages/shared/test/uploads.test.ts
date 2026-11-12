import { describe, expect, it } from "vitest";
import { cleanFileName, DocumentSummary, sniffUploadMimeType } from "../src/uploads";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("sniffUploadMimeType", () => {
  it("recognises PDF, JPEG and PNG by their first bytes", () => {
    expect(sniffUploadMimeType(ascii("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffUploadMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(sniffUploadMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("image/png");
  });

  it.each([
    ["empty", bytes()],
    ["too short", bytes(0xff, 0xd8)],
    ["html", ascii("<html><script>alert(1)</script>")],
    ["zip / docx", bytes(0x50, 0x4b, 0x03, 0x04)],
    ["exe", ascii("MZ\u0090\u0000")],
    ["pdf marker not at the start", ascii(" %PDF-1.7")],
  ])("rejects %s", (_name, value) => {
    expect(sniffUploadMimeType(value)).toBeNull();
  });
});

describe("cleanFileName", () => {
  it.each([
    ["policy.pdf", "policy.pdf"],
    ["  डिस्चार्ज समरी.jpg ", "डिस्चार्ज समरी.jpg"],
    ["C:\\Users\\asha\\Documents\\bill.png", "bill.png"],
    ["../../etc/passwd", "passwd"],
    ["bad\u0000na\nme.pdf", "badname.pdf"],
    ["", "document"],
    ["..", "document"],
    ["folder/", "document"],
  ])("%j → %j", (input, expected) => {
    expect(cleanFileName(input)).toBe(expected);
  });

  it("cuts long names to 120 characters", () => {
    expect(cleanFileName("a".repeat(500))).toHaveLength(120);
  });
});

describe("DocumentSummary", () => {
  it("drops the storage key", () => {
    const parsed = DocumentSummary.parse({
      id: "d1",
      caseId: "c1",
      type: "policy",
      fileName: "policy.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      r2Key: "users/u/secret-key",
      createdAt: "2026-11-12T10:00:00.000Z",
    });
    expect(parsed).not.toHaveProperty("r2Key");
  });
});
