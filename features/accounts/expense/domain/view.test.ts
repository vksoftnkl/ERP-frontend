import { describe, expect, it } from "vitest";
import type { ExpenseDraft } from "../expense.types";
import { emptyLine, emptyTender, newDraft } from "./draft";
import { CASH_ID, LEDGER_COURIER, LEDGER_REPAIRS, SCOPE, TAX_18, TENDERS, TODAY, UPI_ID, validateAnswer } from "./fixtures";
import { bodyKeyOf, buildExpenseBody, linesKeyOf } from "./payload";
import {
  DEFAULT_TAX_NOTE,
  autoTenderTotalPaise,
  buildExpenseView,
  itcPaise,
  countedLinePaise,
  countedTenderPaise,
  statusPill,
  unpaidPaise,
  voucherTotalPaise,
  type ExpenseAnswer,
} from "./view";

function draftWith(gst: boolean, tenders: [string, string][] = [[CASH_ID, "300"], [UPI_ID, "1000"]]): ExpenseDraft {
  const base = newDraft(TODAY, CASH_ID);
  return {
    ...base,
    header: { ...base.header, gstBill: gst, invoiceNo: "INV-1", supplierGstin: "33AAACT1234F1Z5" },
    lines: [
      { ...emptyLine(), ledgerId: LEDGER_REPAIRS, amount: "1000", taxId: gst ? TAX_18 : "" },
      { ...emptyLine(), ledgerId: LEDGER_COURIER, amount: "120" },
    ],
    tenders: tenders.map(([id, amount]) => emptyTender(id, amount)),
  };
}

function bodyOf(draft: ExpenseDraft) {
  return buildExpenseBody({ draft, scope: SCOPE, tenders: TENDERS, session: null });
}

function keyOf(draft: ExpenseDraft): string {
  return bodyKeyOf(bodyOf(draft));
}

function linesKey(draft: ExpenseDraft): string {
  return linesKeyOf(bodyOf(draft));
}

/** An answer to exactly this draft. */
function answered(draft: ExpenseDraft, payload = validateAnswer()): ExpenseAnswer {
  return { kind: "validated", bodyKey: keyOf(draft), linesKey: linesKey(draft), payload };
}

function view(draft: ExpenseDraft, answer: ExpenseAnswer | null, overrides: { error?: string; sessionNo?: string } = {}) {
  return buildExpenseView({
    draft,
    answer,
    currentBodyKey: keyOf(draft),
    currentLinesKey: linesKey(draft),
    validateError: overrides.error ?? null,
    session: overrides.sessionNo ? { sessionId: "s", sessionNo: overrides.sessionNo } : null,
    tenders: TENDERS,
  });
}

describe("a new, empty voucher", () => {
  it("says where the cash will come from once there is something to check", () => {
    const v = view(newDraft(TODAY, CASH_ID), null);
    expect(v.moneyFrom).toBe("Where the cash comes from shows once the voucher has a line and a tender.");
    expect(v.balance).toEqual({ text: "0.00", tone: "neutral" });
    expect(v.linesSummary).toBe("");
    expect(v.taxNote).toBe(DEFAULT_TAX_NOTE);
    expect(v.legs.columns).toEqual([]);
    expect(v.legs.balance).toBe("");
    expect(view(newDraft(TODAY, CASH_ID), null, { sessionNo: "C01-261009-01" }).moneyFrom).toBe(
      "Till session C01-261009-01 — cash comes out of this drawer.",
    );
  });
});

describe("the server's answer, fresh", () => {
  const draft = draftWith(true);
  const answer = answered(draft);
  const v = view(draft, answer);

  it("shows each line's tax and total from the server, a zero as blank", () => {
    expect(v.fresh).toBe(true);
    expect(v.linesFresh).toBe(true);
    expect(v.lineCells).toEqual([
      { tax: "180.00", total: "1,180.00" },
      { tax: "", total: "120.00" },
    ]);
    expect(v.tendersSummary).toBe("Tenders  1,300.00");
  });

  it("totals the lines Qt's way, with the input tax credit (d97cdd4)", () => {
    expect(v.linesSummary).toBe("Taxable 1,120.00 · GST 180.00 · ITC 180.00 · Total 1,300.00");
    const plain = draftWith(false);
    expect(view(plain, answered(plain)).linesSummary).toBe("Total 1,300.00");
  });

  it("ITC is the tax of every line whose class is not ineligible", () => {
    const lines = validateAnswer().derived.lines;
    expect(itcPaise(lines)).toBe(18000);
    expect(itcPaise([{ ...lines[0], itcEligibility: "INELIGIBLE" }, lines[1]])).toBe(0);
  });

  it("balances to the paisa", () => {
    expect(v.balance).toEqual({ text: "0.00  balanced", tone: "success" });
  });

  it("names where each tender's money comes from", () => {
    expect(v.tenderAccounts).toEqual(["safe · Main Safe", "UPI clearing"]);
    expect(v.moneyFrom).toBe("Back office — cash comes from the default safe Main Safe.");
  });

  it("splits the tax the way the bill's place of supply says, naming the credit", () => {
    expect(v.taxNote).toBe("Intra-state supply → CGST 90.00 + SGST 90.00. ITC 180.00 goes to Input GST; the rest is cost.");
    const inter = validateAnswer();
    inter.derived.supplyNature = "INTER";
    inter.derived.tax = { cgst: 0, sgst: 0, igst: 180, cess: 0 };
    inter.derived.lines[0] = { ...inter.derived.lines[0], cgst: 0, sgst: 0, igst: 180 };
    expect(view(draft, { ...answer, payload: inter }).taxNote).toBe(
      "Inter-state supply → IGST 180.00. ITC 180.00 goes to Input GST; the rest is cost.",
    );
  });

  it("lays the legs out in three columns and checks Dr = Cr", () => {
    expect(v.legs.columns.map((column) => column.length)).toEqual([2, 2, 2]);
    expect(v.legs.columns[0][0]).toEqual({ side: "Dr", name: "Repairs", amount: "1,000.00" });
    expect(v.legs.columns[2][1]).toEqual({ side: "Cr", name: "UPI clearing", amount: "1,000.00" });
    expect(v.legs.balance).toBe("Dr 1,300.00 = Cr 1,300.00");
    expect(v.legs.balanced).toBe(true);
  });

  it("shows a drawer voucher as the till session's", () => {
    const drawer = validateAnswer();
    drawer.derived.session = { sessionId: "s", accYear: "2026-2027" };
    drawer.derived.safeName = null;
    drawer.derived.tenders[0].moneyFrom = "DRAWER";
    const dv = view(draft, { ...answer, payload: drawer }, { sessionNo: "C01-261009-01" });
    expect(dv.tenderAccounts[0]).toBe("drawer · this session");
    expect(dv.moneyFrom).toBe(
      "Till session C01-261009-01 — cash comes out of this drawer; the voucher carries the session.",
    );
  });

  it("no till: every tender from its own ledger", () => {
    const plain = validateAnswer();
    plain.derived.safeName = null;
    plain.derived.tenders[0].moneyFrom = "LEDGER";
    plain.derived.tenders[0].ledgerName = "Cash in hand";
    const pv = view(draft, { ...answer, payload: plain });
    expect(pv.moneyFrom).toBe("No till here — each tender's money comes from its own ledger.");
    expect(pv.tenderAccounts[0]).toBe("Cash in hand");
  });
});

describe("refusals, warnings and the approval band", () => {
  const draft = draftWith(false, [[CASH_ID, "1000"]]);
  const payload = validateAnswer({
    ok: false,
    refusals: [{ code: "EXPENSE_TOTAL_MISMATCH", message: "The lines come to 1120.00 and the tenders to 1000.00: they must be equal" }],
    warnings: [
      { code: "STATUTORY_40A3", level: "WARN", overridable: false, message: "Cash to one payee above 10,000" },
      { code: "TILL_APPROVAL_REQUIRED", level: "INFO", overridable: false, message: "duplicate of the band" },
    ],
    approval: {
      event: "EXPENSE",
      ruleId: "r",
      mode: "OVER_AMOUNT",
      threshold: 500,
      amount: 1120,
      minRole: "SUPERVISOR",
      channel: "EITHER",
      twoPerson: false,
      blocksTill: false,
      enforced: false,
    },
  });
  const v = view(draft, answered(draft, payload));

  it("lists refusals as CODE — message", () => {
    expect(v.refusals).toEqual([
      "EXPENSE_TOTAL_MISMATCH — The lines come to 1120.00 and the tenders to 1000.00: they must be equal",
    ]);
  });

  it("leaves the approval's own INFO out of the warnings", () => {
    expect(v.warnings).toEqual(["Cash to one payee above 10,000"]);
  });

  it("reports the approval need in Qt's words", () => {
    expect(v.approval).toEqual({
      code: "EXPENSE",
      amount: "1,120.00",
      text: "total 1,120.00 is over 500.00 — needs a SUPERVISOR (EITHER). Posting asks for it: as shipped the voucher posts and the request waits in the approvers' inbox; a company that refuses asks for the approver's PIN first.",
    });
  });

  it("leaves the approval need out of the red list under REFUSE: Post asks for it", () => {
    const refusing = validateAnswer({
      ok: false,
      refusals: [
        { code: "TILL_APPROVAL_REQUIRED", field: "approvalId", message: "An expense of 1120.00 at a till needs an approval" },
        { code: "EXPENSE_TOTAL_MISMATCH", message: "they must be equal" },
      ],
      approval: { ...payload.approval!, enforced: true },
    });
    const shown = view(draft, answered(draft, refusing));
    expect(shown.refusals).toEqual(["EXPENSE_TOTAL_MISMATCH — they must be equal"]);
    expect(shown.approval?.code).toBe("EXPENSE");
  });

  it("a failed check shows the server's error instead", () => {
    expect(view(draft, null, { error: "supplierGstin must be a 15-character GSTIN" }).refusals).toEqual([
      "supplierGstin must be a 15-character GSTIN",
    ]);
  });
});

describe("a stale answer", () => {
  it("without a GST bill: the lines and the balance are summed here, exactly", () => {
    const before = draftWith(false, [[CASH_ID, "1120"]]);
    const answer = answered(before);
    const after = { ...before, lines: [before.lines[0], { ...before.lines[1], amount: "150.50" }] };
    const v = view(after, answer);
    expect(v.fresh).toBe(false);
    expect(v.linesFresh).toBe(false);
    expect(v.lineCells).toEqual([
      { tax: "", total: "1,000.00" },
      { tax: "", total: "150.50" },
    ]);
    expect(v.linesSummary).toBe("Total 1,150.50");
    expect(v.balance).toEqual({ text: "30.50", tone: "danger" });
  });

  it("only the tenders changed: the lines' figures stay current, and so does a tender's account", () => {
    const before = draftWith(true);
    const answer = answered(before);
    const after = { ...before, tenders: [{ ...before.tenders[0], amount: "250" }, before.tenders[1]] };
    const v = view(after, answer);
    expect(v.fresh).toBe(false);
    expect(v.linesFresh).toBe(true);
    expect(v.lineCells[0]).toEqual({ tax: "180.00", total: "1,180.00" });
    expect(v.tenderAccounts).toEqual(["safe · Main Safe", "UPI clearing"]);
    expect(v.balance).toEqual({ text: "50.00", tone: "danger" });
  });

  it("a tender changed to another one falls back to the master's ledger until the next check", () => {
    const before = draftWith(false, [[CASH_ID, "1120"]]);
    const after = { ...before, tenders: [{ ...before.tenders[0], tenderId: UPI_ID }] };
    expect(view(after, answered(before)).tenderAccounts).toEqual(["UPI clearing"]);
  });

  it("with a GST bill: the tax waits for the server", () => {
    const draft = draftWith(true);
    const v = view(draft, null);
    expect(v.lineCells[0]).toEqual({ tax: "…", total: "…" });
    expect(v.balance).toEqual({ text: "…", tone: "pending" });
    expect(v.linesSummary).toBe("Taxable 1,120.00 · GST … · ITC … · Total …");
  });

  it("a loaded voucher's own figures stand until something is typed", () => {
    const draft = { ...draftWith(true), status: "POSTED" as const };
    const answer: ExpenseAnswer = { kind: "saved", bodyKey: "", linesKey: "", payload: validateAnswer() };
    expect(view(draft, answer).fresh).toBe(true);
    expect(view(draft, answer).lineCells[0]).toEqual({ tax: "180.00", total: "1,180.00" });
    expect(view({ ...draft, dirty: true }, answer).fresh).toBe(false);
  });

  it("a saved answer maps its lines by position, not by stored row number", () => {
    const payload = validateAnswer();
    payload.derived.lines[1] = { ...payload.derived.lines[1], rowNo: 5 };
    const draft = { ...draftWith(false), status: "POSTED" as const };
    expect(view(draft, { kind: "saved", bodyKey: "", linesKey: "", payload }).lineCells[1].total).toBe("120.00");
  });
});

describe("figures", () => {
  it("counts only what the server is sent", () => {
    const draft = draftWith(false, [[CASH_ID, "100"], ["gone", "50"], [UPI_ID, "abc"]]);
    expect(countedLinePaise(draft)).toBe(112000);
    expect(countedTenderPaise(draft, TENDERS)).toBe(10000);
  });

  it("a new tender row takes what is still unpaid, never below zero", () => {
    expect(unpaidPaise(130000, 30000)).toBe(100000);
    expect(unpaidPaise(130000, 140000)).toBe(0);
    expect(unpaidPaise(null, 0)).toBe(0);
  });

  it("the voucher total: the server's when fresh, the sum without GST, unknown with it", () => {
    const plain = draftWith(false);
    expect(voucherTotalPaise(plain, null, false)).toBe(112000);
    expect(voucherTotalPaise(draftWith(true), null, false)).toBeNull();
    const answer: ExpenseAnswer = { kind: "validated", bodyKey: "", linesKey: "", payload: validateAnswer() };
    expect(voucherTotalPaise(draftWith(true), answer, true)).toBe(130000);
  });

  it("the first tender follows the server's total while its taxable is the lines', else the lines (Qt balanceAutoTender)", () => {
    const draft = draftWith(true);
    expect(autoTenderTotalPaise(draft, null)).toBe(112000);
    expect(autoTenderTotalPaise(draft, answered(draft))).toBe(130000);
    const edited = { ...draft, lines: [draft.lines[0], { ...draft.lines[1], amount: "200" }] };
    expect(autoTenderTotalPaise(edited, answered(draft))).toBe(120000);
  });

  it("colours the status pill as Qt does", () => {
    expect(statusPill(null)).toEqual({ label: "NEW", tone: "warning" });
    expect(statusPill("DRAFT")).toEqual({ label: "DRAFT", tone: "warning" });
    expect(statusPill("POSTED")).toEqual({ label: "POSTED", tone: "success" });
    expect(statusPill("CANCELLED")).toEqual({ label: "CANCELLED", tone: "danger" });
  });
});
