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

  it("never sends a company or a counter", () => {
    // The company comes from the session — a caller-supplied one would make the
    // renderer a cross-tenant read. The counter is a `device_master` row, and
    // this client's device id is a localStorage uuid that names none.
    const request = buildDocumentPrintRequest("01a041fa-quote", target) as Record<string, unknown>;
    expect(request).not.toHaveProperty("companyId");
    expect(request).not.toHaveProperty("deviceId");
  });

  it("omits blanks rather than sending them empty", () => {
    // `branchId: ""` reaches the server as a uuid that fails validation; an
    // absent branch simply resolves the ladder one rung wider.
    const request = buildDocumentPrintRequest("01a041fa-quote", {
      ...target,
      branchId: "   ",
      srcDocType: "",
      filename: "",
    });
    expect(request).not.toHaveProperty("branchId");
    expect(request).not.toHaveProperty("srcDocType");
    expect(request).not.toHaveProperty("filename");
  });

  it("trims what it does send", () => {
    expect(
      buildDocumentPrintRequest("01a041fa-quote", { ...target, branchId: " 01a0-branch " }),
    ).toMatchObject({ branchId: "01a0-branch" });
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

  it("refuses a document with no accounting year", () => {
    // The renderer binds :acc_year to reach the right partition; without one it
    // would read the wrong year's rows or none at all.
    expect(() => buildDocumentPrintRequest("01a041fa-quote", { ...target, accYear: " " })).toThrow(
      /accounting year/i,
    );
  });
});
