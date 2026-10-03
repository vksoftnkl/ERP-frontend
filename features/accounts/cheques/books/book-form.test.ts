import { describe, expect, it } from "vitest";
import type { ChequeBookPayload } from "../issued/issued.types";
import { blankBookForm, bookFigures, bookFormOf, buildBookBody, validateBookForm } from "./book-form";

const SCOPE = { companyId: "co", branchId: "br" };

function aBook(partial: Partial<ChequeBookPayload> = {}): ChequeBookPayload {
  return {
    chequeBookId: "book-1",
    companyId: "co",
    branchId: null,
    bankLedgerId: "bank-1",
    bankName: "SBI Current",
    bookNo: "004",
    leafFrom: "000101",
    leafTo: "000150",
    nextLeaf: "000127",
    left: 24,
    used: 26,
    leafWidth: 6,
    format: "SBI-CTS",
    remarks: null,
    status: "ACTIVE",
    closedOn: null,
    closeReason: null,
    leaves: [],
    ...partial,
  };
}

describe("the cheque-book form", () => {
  it("refuses what the server would, in order", () => {
    expect(validateBookForm(blankBookForm())).toBe("Choose the bank account.");
    const form = { ...blankBookForm({ id: "bank-1", name: "SBI" }), bookNo: "  " };
    expect(validateBookForm(form)).toBe("Enter the book number.");
    expect(validateBookForm({ ...form, bookNo: "004" })).toBe("Enter the first and last leaf.");
    expect(validateBookForm({ ...form, bookNo: "004", leafFrom: "000500", leafTo: "000451" })).toBe(
      "The last leaf is before the first.",
    );
    expect(validateBookForm({ ...form, bookNo: "004", leafFrom: "000451", leafTo: "000500" })).toBeNull();
  });

  it("opens a new book on this branch, its zeros kept by the leaf width", () => {
    const form = {
      ...blankBookForm({ id: "bank-1", name: "SBI" }),
      bookNo: " 004 ",
      leafFrom: "000451",
      leafTo: "500",
    };
    expect(buildBookBody(form, SCOPE)).toEqual({
      companyId: "co",
      branchId: "br",
      bankLedgerId: "bank-1",
      bookNo: "004",
      leafFrom: 451,
      leafTo: 500,
      leafWidth: 6,
      format: null,
      remarks: null,
    });
  });

  it("edits a shared book without pinning it to this branch, and keeps its format", () => {
    const body = buildBookBody({ ...bookFormOf(aBook()), leafTo: "000160" }, SCOPE);
    expect(body).toMatchObject({ chequeBookId: "book-1", branchId: null, format: "SBI-CTS", leafTo: 160 });
    const own = buildBookBody(bookFormOf(aBook({ branchId: "other-branch" })), SCOPE);
    expect(own.branchId).toBe("other-branch");
  });

  it("can keep a new book for every branch", () => {
    const form = {
      ...blankBookForm({ id: "bank-1", name: "SBI" }),
      bookNo: "9",
      leafFrom: "1",
      leafTo: "50",
      everyBranch: true,
    };
    expect(buildBookBody(form, SCOPE).branchId).toBeNull();
  });

  it("says where a book stands", () => {
    expect(bookFigures(aBook())).toBe("ACTIVE · 26 used · 24 left · next 000127");
    expect(
      bookFigures(aBook({ status: "CLOSED", nextLeaf: null, closedOn: "2026-10-01T10:00:00Z", closeReason: "Book lost" })),
    ).toBe("CLOSED · 26 used · 24 left · closed 01-10-2026 — Book lost");
  });
});
