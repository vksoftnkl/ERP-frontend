import { describe, expect, it } from "vitest";

import {
  buildDocumentPrintRequest,
  findPurposeByCode,
  PURPOSE_CODE,
  purposeNotConfigured,
} from "./documentPrint";
import type { PrintPurposeRef } from "@/features/printing/types/printing";

const purposes: PrintPurposeRef[] = [
  { ppoId: "01a041fa-invoice", ppoCode: "SALE_INVOICE", ppoName: "Tax Invoice" },
  { ppoId: "01a041fa-quote", ppoCode: "SALE_QUOTATION", ppoName: "Quotation" },
  { ppoId: "01a041fa-nameless", ppoCode: null, ppoName: "Something local" },
];

const target = { docId: "01a0-doc", accYear: "2026-2027" };

describe("findPurposeByCode", () => {
  it("finds the row a screen names by code", () => {
    expect(findPurposeByCode(purposes, PURPOSE_CODE.SALE_QUOTATION)?.ppoId).toBe("01a041fa-quote");
  });

  it("matches case-insensitively", () => {
    // `ppo_code` is seeded through `lower()` comparisons, so an install whose
    // rows were entered by hand may not match the constant's casing exactly.
    expect(findPurposeByCode(purposes, "sale_quotation")?.ppoId).toBe("01a041fa-quote");
  });

  it("is null rather than throwing when the catalogue has no such purpose", () => {
    // Dropdown 47 is configuration: an unprovisioned environment answers empty,
    // and that is a deployment fact for the operator, not an exception.
    expect(findPurposeByCode(purposes, "KITCHEN_ORDER_TICKET")).toBeNull();
    expect(findPurposeByCode(undefined, PURPOSE_CODE.SALE_QUOTATION)).toBeNull();
    expect(findPurposeByCode(purposes, "   ")).toBeNull();
  });

  it("does not match a row that carries no code", () => {
    expect(findPurposeByCode(purposes, "")).toBeNull();
  });

  it("names the code an operator has to go and configure", () => {
    expect(purposeNotConfigured("SALE_QUOTATION")).toContain("SALE_QUOTATION");
  });
});

describe("buildDocumentPrintRequest", () => {
  it("carries the purpose, the document and its accounting year", () => {
    expect(buildDocumentPrintRequest("01a041fa-quote", target)).toEqual({
      purposeId: "01a041fa-quote",
      docId: "01a0-doc",
      accYear: "2026-2027",
    });
  });

  it("never sends a company, a branch or a counter", () => {
    // All three come from the access token. A caller-supplied company would make
    // the renderer a cross-tenant read; a caller-supplied branch or counter
    // would be a screen picking which rung of the assignment ladder it wins on.
    const request = buildDocumentPrintRequest("01a041fa-quote", target) as Record<string, unknown>;
    expect(request).not.toHaveProperty("companyId");
    expect(request).not.toHaveProperty("branchId");
    expect(request).not.toHaveProperty("deviceId");
  });

  it("omits blanks rather than sending them empty", () => {
    // `accYear: ""` fails the server's shape check; an absent one means "the
    // year this session is working in", which the server binds itself.
    const request = buildDocumentPrintRequest("01a041fa-quote", {
      ...target,
      accYear: "   ",
      srcDocType: "",
      filename: "",
    });
    expect(request).not.toHaveProperty("accYear");
    expect(request).not.toHaveProperty("srcDocType");
    expect(request).not.toHaveProperty("filename");
  });

  it("trims what it does send", () => {
    expect(
      buildDocumentPrintRequest("01a041fa-quote", { ...target, accYear: " 2026-2027 " }),
    ).toMatchObject({ accYear: "2026-2027" });
  });

  it("omits isReprint unless it is true", () => {
    // The server default is a PRINT row. Saying `false` out loud gains nothing
    // and this subsystem has a history of booleans read the wrong way round.
    expect(buildDocumentPrintRequest("01a041fa-quote", { ...target, isReprint: false })).not
      .toHaveProperty("isReprint");
    expect(
      buildDocumentPrintRequest("01a041fa-quote", { ...target, isReprint: true }),
    ).toMatchObject({ isReprint: true });
  });

  it("omits a copy count of zero, which is not an override", () => {
    expect(buildDocumentPrintRequest("01a041fa-quote", { ...target, copies: 0 })).not.toHaveProperty(
      "copies",
    );
    expect(buildDocumentPrintRequest("01a041fa-quote", { ...target, copies: 2 })).toMatchObject({
      copies: 2,
    });
  });

  it("omits an empty params object", () => {
    expect(buildDocumentPrintRequest("01a041fa-quote", { ...target, params: {} })).not.toHaveProperty(
      "params",
    );
  });

  it("refuses a document that has not been saved", () => {
    expect(() => buildDocumentPrintRequest("01a041fa-quote", { ...target, docId: "" })).toThrow(
      /no saved document/i,
    );
  });

  it("prints without an accounting year, leaving the server to bind the current one", () => {
    // It used to refuse. The renderer binds the company's own fy_is_current when
    // the body names no year, so a screen printing what it just saved has
    // nothing to say — only a reprint of an older document names its own.
    expect(buildDocumentPrintRequest("01a041fa-quote", { docId: "01a0-doc" })).toEqual({
      purposeId: "01a041fa-quote",
      docId: "01a0-doc",
    });
  });
});
