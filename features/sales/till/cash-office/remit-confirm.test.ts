import { describe, expect, it } from "vitest";
import type { TillRemittance } from "../shared/wire/types";
import {
  creditedPaise,
  initialRemitConfirmForm,
  remitConfirmBody,
  remitConfirmFacts,
  remitConfirmHint,
  remitConfirmProblem,
  type RemitConfirmRequest,
} from "./remit-confirm";

// The in-transit row of Qt tests/till/snap_safe.cpp.
const remit: TillRemittance = {
  tcmId: "00000000-0000-0000-0000-0000000000a1",
  tcmAccYear: "2026-2027",
  docNo: "crm00012",
  docDate: "2026-10-13",
  safeId: "s1",
  safeName: "ZT S1 test safe",
  mode: "CIT",
  status: "IN_TRANSIT",
  amount: 150000,
  bankLedgerId: "b1",
  bankName: "Kvb Current A/c",
  bagNo: "C-11920",
  sealNo: "77310",
  citAgency: "CMS Info Systems",
  slipNo: "DS-004118",
  slipDate: "2026-10-13",
  ageDays: 2,
  doneBy: "VKPOS",
  createdOn: "2026-10-13T12:00:00.000Z",
};

const request: RemitConfirmRequest = {
  scope: { companyId: "c", branchId: "b" },
  remit,
  businessDate: "2026-10-15",
};

describe("remit confirm", () => {
  it("starts on today with what was sent", () => {
    const form = initialRemitConfirmForm(remit, "2026-10-15");
    expect(form).toEqual({ bankDate: "2026-10-15", bankRef: "", creditedText: "150000", note: "" });
    expect(creditedPaise(form)).toBe(15000000);
  });

  it("shows the remittance, its agency and bag, and what was sent", () => {
    expect(remitConfirmFacts(remit)).toEqual({
      doc: "crm00012  ·  13-10-2026",
      agency: "CMS Info Systems · bag C-11920",
      sent: "1,50,000.00",
    });
  });

  it("needs the bank reference (snap: confirm needs a bank ref), a real date and what was credited", () => {
    const form = initialRemitConfirmForm(remit, "2026-10-15");
    expect(remitConfirmProblem(form)).toBe("Type the bank reference.");
    expect(remitConfirmProblem({ ...form, bankRef: "UTR 1", bankDate: "" })).toBe("Type the bank date.");
    expect(remitConfirmProblem({ ...form, bankRef: "UTR 1", bankDate: "2026-02-30" })).toBe("Type the bank date.");
    expect(remitConfirmProblem({ ...form, bankRef: "UTR 1", creditedText: " " })).toBe("Type what the bank credited.");
    expect(remitConfirmProblem({ ...form, bankRef: "UTR 1", creditedText: "0" })).toBe("");
  });

  it("posts the remittance's key, the bank's date, reference and credit (snap: confirm body)", () => {
    const form = { ...initialRemitConfirmForm(remit, "2026-10-15"), bankRef: "  LIVE-TEST-UTR-118 " };
    expect(remitConfirmBody(request, form)).toEqual({
      companyId: "c",
      branchId: "b",
      accYear: "2026-2027",
      tcmId: remit.tcmId,
      bankDate: "2026-10-15",
      bankRef: "LIVE-TEST-UTR-118",
      bankAmount: 150000,
    });
    expect(remitConfirmBody(request, { ...form, note: " short by a note " }).notes).toBe("short by a note");
    expect(remitConfirmBody(request, form)).not.toHaveProperty("treatment");
  });

  it("says whether the bank credited what was sent, less or more", () => {
    expect(remitConfirmHint(15000000, 15000000)).toBe("The bank credited what was sent.");
    expect(remitConfirmHint(15000000, 14950000)).toMatch(/^The bank credited 500\.00 less\. A small difference/);
    expect(remitConfirmHint(15000000, 15000100)).toMatch(/^The bank credited 1\.00 more\./);
  });
});
