import { describe, expect, it } from "vitest";
import { dayMonthTime12Of } from "@/lib/time-format";
import type { GridRow, TillRemittance, TillSafeBalance, TillSafeCountResult, TillSafeState } from "../shared/wire/types";
import {
  cashOfficeSub,
  cashOfficeTitle,
  clearedRemitForm,
  confirmOutcomeText,
  countBody,
  countButtonTitle,
  countProblem,
  countResultLine,
  decideButton,
  deskTabOf,
  emptyRemitForm,
  factsHint,
  figureText,
  gapsLine,
  gridCellText,
  lastCountText,
  listedSafes,
  newestFirst,
  nextGap,
  pickSafeId,
  pickTransitId,
  remitAmountPaise,
  remitBody,
  remitButtonTitle,
  remitHint,
  remitPostedText,
  remitProblem,
  remitQuestion,
  remitVoidRequest,
  remittanceGridParams,
  safeBookGridParams,
  safeFacts,
  safePill,
  transitRows,
  transitTabTitle,
  postedRemitMemo,
  printMemoButton,
  remitMemoFilename,
  remitMemoLabel,
  remitMemoOf,
  remitMemoTarget,
  remitPrintQuestion,
  voidButton,
  voidableRemit,
  type RemitForm,
} from "./cash-office";

// The fake balance of Qt tests/till/snap_safe.cpp (TillSafeBalancePayload).
const SAFE_ID = "01a11f22-4681-7d5a-8c86-0e6954e86927";
const scope = { companyId: "019c8ea6-19e9-78a8-b15f-749e1cde7292", branchId: "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab" };

const remit: TillRemittance = {
  tcmId: "00000000-0000-0000-0000-0000000000a1",
  tcmAccYear: "2026-2027",
  docNo: "crm00012",
  docDate: "2026-10-13",
  safeId: SAFE_ID,
  safeName: "ZT S1 test safe",
  mode: "CIT",
  status: "IN_TRANSIT",
  amount: 150000,
  bankLedgerId: "019ef849-aefe-7e27-8e8f-d4094cf5c254",
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

function safeState(over: Partial<TillSafeState> = {}): TillSafeState {
  return {
    safeId: SAFE_ID,
    code: "ZTS",
    name: "ZT S1 test safe",
    ledgerId: "x",
    ledgerName: "Safe Cash",
    isDefault: true,
    isDropSafe: false,
    isActive: true,
    insuredLimit: 150000,
    overInsured: true,
    ledgerShared: false,
    openingFrom: "COUNT",
    opening: 45000,
    in: { handOvers: 93410, drops: 10000, pickups: 70000, transfersIn: 0, receipts: 0, total: 173410 },
    out: { floatIssues: 9000, topUps: 1000, remittances: 0, transfersOut: 0, payments: 0, total: 10000 },
    exchanges: 0,
    expected: 208410,
    bookBalance: 208410,
    drift: 0,
    lastCount: {
      tctId: "c1",
      tctAccYear: "2026-2027",
      countedOn: "2026-10-14T16:00:00.000Z",
      countedBy: "u",
      countedByName: "SELVI K",
      witnessBy: null,
      counted: 44900,
      expected: 45000,
      difference: -100,
    },
    countedToday: false,
    inTransit: { count: 1, amount: 150000 },
    pendingGaps: [{ tvrId: "g1", tvrAccYear: "2026-2027", stage: "SAFE", variance: -100 }],
    ...over,
  };
}

function balanceOf(safes: TillSafeState[], over: Partial<TillSafeBalance> = {}): TillSafeBalance {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    businessDate: "2026-10-15",
    figuresVisible: true,
    safes,
    inTransit: [remit],
    ...over,
  };
}

function remitForm(over: Partial<RemitForm> = {}): RemitForm {
  return { ...emptyRemitForm("2026-10-15"), ...over };
}

describe("cash office — the open arg and the tabs", () => {
  it("reads ?tab=count|remit as Qt's open arg, nothing else", () => {
    expect(deskTabOf("count")).toBe("count");
    expect(deskTabOf(" REMIT ")).toBe("remit");
    expect(deskTabOf("transit")).toBeNull();
    expect(deskTabOf(null)).toBeNull();
  });

  it("counts the remittances on the way in the tab's title (snap: transit tab counts 1)", () => {
    expect(transitTabTitle(1)).toBe("On the way (1)");
    expect(transitTabTitle(0)).toBe("On the way");
  });
});

describe("cash office — the safe picked", () => {
  it("leaves an inactive safe out of the picker", () => {
    const safes = listedSafes(balanceOf([safeState(), safeState({ safeId: "old", isActive: false })]));
    expect(safes.map((safe) => safe.safeId)).toEqual([SAFE_ID]);
  });

  it("keeps the safe picked while listed, else the default, else the first (snap: safe picked)", () => {
    const a = safeState({ safeId: "a", isDefault: false });
    const b = safeState({ safeId: "b", isDefault: true });
    expect(pickSafeId([a, b], "")).toBe("b");
    expect(pickSafeId([a, b], "a")).toBe("a");
    expect(pickSafeId([a, b], "gone")).toBe("b");
    expect(pickSafeId([a, safeState({ safeId: "c", isDefault: false })], "")).toBe("a");
    expect(pickSafeId([], "a")).toBe("");
  });

  it("titles the screen by the safe, and says whose day it is", () => {
    expect(cashOfficeTitle(safeState())).toBe("Cash Office  ZT S1 test safe");
    expect(cashOfficeTitle(null)).toBe("Cash Office");
    expect(cashOfficeSub("ACME", "2026-10-15", "VKPOS")).toBe("ACME  ·  business date 15/10/2026  ·  VKPOS");
    expect(cashOfficeSub("", null, "VKPOS")).toBe("VKPOS");
  });
});

describe("cash office — the pill", () => {
  it("puts over-insured first, then a gap to decide, then today's count", () => {
    expect(safePill(safeState())).toEqual({ text: "OVER INSURED LIMIT", tone: "red" });
    expect(safePill(safeState({ overInsured: false }))).toEqual({ text: "DIFFERENCE TO DECIDE", tone: "amber" });
    expect(safePill(safeState({ overInsured: false, pendingGaps: [], countedToday: true }))).toEqual({
      text: "COUNTED TODAY",
      tone: "green",
    });
    expect(safePill(safeState({ overInsured: false, pendingGaps: [] }))).toEqual({ text: "NOT COUNTED TODAY", tone: "grey" });
    expect(safePill(null)).toBeNull();
  });
});

describe("cash office — the figures", () => {
  it("shows the money, the insured limit in red when over it, the last count and what is on the way", () => {
    const facts = safeFacts(safeState());
    const value = (caption: string) => facts.find((fact) => fact.caption === caption);
    expect(value("Opening")?.value).toBe("45,000.00");
    expect(value("In")?.value).toBe("1,73,410.00");
    expect(value("Out")?.value).toBe("10,000.00");
    expect(value("Should hold now")?.value).toBe("2,08,410.00");
    expect(value("Insured limit")).toEqual({ caption: "Insured limit", value: "1,50,000.00", danger: true });
    expect(value("Account balance")?.value).toBe("2,08,410.00");
    expect(value("Last count")?.value).toBe(`${dayMonthTime12Of("2026-10-14T16:00:00.000Z")} · SELVI K · −100.00`);
    expect(value("On the way to bank")?.value).toBe("1 · 1,50,000.00");
  });

  it("dashes every figure the caller may not see (blind)", () => {
    const blind = safeState({ opening: null, in: null, out: null, expected: null, bookBalance: null, drift: null });
    const facts = safeFacts(blind);
    for (const caption of ["Opening", "In", "Out", "Should hold now", "Account balance"]) {
      expect(facts.find((fact) => fact.caption === caption)?.value).toBe("—");
    }
    expect(figureText(null)).toBe("—");
    expect(figureText(0)).toBe("0.00");
  });

  it("says none for no insured limit and nothing on the way, never for no count", () => {
    const facts = safeFacts(safeState({ insuredLimit: 0, overInsured: false, lastCount: null, inTransit: { count: 0, amount: 0 } }));
    expect(facts.find((fact) => fact.caption === "Insured limit")?.value).toBe("none");
    expect(facts.find((fact) => fact.caption === "Last count")?.value).toBe("never");
    expect(facts.find((fact) => fact.caption === "On the way to bank")?.value).toBe("none");
    expect(safeFacts(null).every((fact) => fact.value === "—")).toBe(true);
  });

  it("leaves a blind count's difference off the last count", () => {
    const last = { ...safeState().lastCount!, difference: null, countedByName: null };
    expect(lastCountText(last)).toBe(dayMonthTime12Of(last.countedOn));
  });

  it("explains the opening, the blind count, a shared ledger and a drift", () => {
    expect(factsHint(safeState(), true)).toBe("");
    expect(factsHint(safeState({ openingFrom: "BOOK" }), true)).toBe(
      "Not counted yet: the opening is the safe account's balance.",
    );
    expect(factsHint(safeState({ openingFrom: "ZERO" }), true)).toContain("shared with another safe: the opening is 0.");
    expect(factsHint(safeState({ drift: null }), false)).toBe("Figures are hidden until you count (blind count).");
    expect(factsHint(safeState({ ledgerShared: true }), true)).toBe(
      "Another safe uses the same account: the account balance is for both.",
    );
    expect(factsHint(safeState({ drift: -250.5 }), true)).toBe(
      "The account differs from what the safe should hold by −250.50.",
    );
    // A drift is not said while the figures are hidden.
    expect(factsHint(safeState({ drift: 10 }), false)).not.toContain("differs");
  });
});

describe("cash office — the gaps waiting for a decision", () => {
  it("names each gap (live_safe_decide: the decide band shows)", () => {
    expect(gapsLine(safeState())).toBe("A difference waits for a decision: count −100.00");
    const two = safeState({
      pendingGaps: [
        { tvrId: "g1", tvrAccYear: "2026-2027", stage: "SAFE", variance: -100 },
        { tvrId: "g2", tvrAccYear: "2026-2027", stage: "REMIT", variance: -50 },
      ],
    });
    expect(gapsLine(two)).toBe("A difference waits for a decision: count −100.00 · bank short −50.00");
    expect(gapsLine(safeState({ pendingGaps: [] }))).toBe("");
    expect(nextGap(two)?.tvrId).toBe("g1");
  });

  it("enables Decide on a pending gap (snap), unless 287 OVERRIDE is missing or a post is out", () => {
    expect(decideButton(safeState(), { busy: false, canOverride: true }).enabled).toBe(true);
    expect(decideButton(safeState(), { busy: true, canOverride: true }).enabled).toBe(false);
    expect(decideButton(safeState(), { busy: false, canOverride: false })).toEqual({
      enabled: false,
      title: "No override right on Cash Office (menu 287)",
    });
    expect(decideButton(safeState({ pendingGaps: [] }), { busy: false, canOverride: true }).enabled).toBe(false);
  });
});

describe("cash office — count safe", () => {
  const lines = [{ tenderTypeId: 1, denominationId: "d500", qty: 3 }];

  it("is ready with nothing typed (snap: count ok with nothing typed)", () => {
    expect(countProblem(safeState(), 12, { witness: null, witnessPin: "", note: "" })).toBe("");
  });

  it("needs a safe, the denominations, and a witness's PIN once a witness is picked", () => {
    const form = { witness: null, witnessPin: "", note: "" };
    expect(countProblem(null, 12, form)).toBe("No safe to count.");
    expect(countProblem(safeState(), 0, form)).toBe("The notes and coins list did not load.");
    expect(countProblem(safeState(), 12, { ...form, witness: { id: "w1", text: "RAVI" } })).toBe(
      "The witness types their till PIN.",
    );
    expect(countButtonTitle(false, "")).toBe("You have no right to count the safe.");
  });

  it("posts the safe and the lines, the witness and the note when given (snap: count body)", () => {
    const body = countBody(scope, SAFE_ID, lines, { witness: { id: "w1", text: "RAVI" }, witnessPin: "5678", note: "  eod  " });
    expect(body).toEqual({ ...scope, safeId: SAFE_ID, lines, witnessId: "w1", witnessPin: "5678", notes: "eod" });
    expect(body).not.toHaveProperty("treatment");
  });

  it("posts an empty safe as one line of 0", () => {
    const body = countBody(scope, SAFE_ID, [], { witness: null, witnessPin: "", note: "" });
    expect(body.lines).toEqual([{ tenderTypeId: 1, enteredAmount: 0 }]);
    expect(body).not.toHaveProperty("witnessId");
    expect(body).not.toHaveProperty("notes");
  });

  it("answers with what it should have held and the outcome (live_safe: Matches; decide: waits)", () => {
    const result = (over: Partial<TillSafeCountResult>): TillSafeCountResult =>
      ({ counted: 208410, expected: 208410, difference: 0, outcome: "EXACT", ...over }) as TillSafeCountResult;
    expect(countResultLine(result({}))).toEqual({
      text: "Counted 2,08,410.00, should hold 2,08,410.00, difference 0.00. Matches.",
      tone: "green",
    });
    expect(countResultLine(result({ counted: 208400, difference: -10, outcome: "WITHIN_TOLERANCE" })).text).toBe(
      "Counted 2,08,400.00, should hold 2,08,410.00, difference −10.00. Small difference: booked.",
    );
    const waits = countResultLine(result({ counted: 206715, difference: -1695, outcome: "SENT_FOR_APPROVAL" }));
    expect(waits.text).toContain("Too big: it waits for a decision (Decide, above).");
    expect(waits.tone).toBe("amber");
  });
});

describe("cash office — remit to bank", () => {
  const bank = { id: "019ef870-0f5d-7d06-b360-87872ffac349", text: "Test Bank Account" };

  it("needs a bank first (snap: remit needs a bank)", () => {
    expect(remitProblem(remitForm({ amountText: "100" }), safeState(), 10000)).toBe("Pick the bank.");
  });

  it("needs an amount, the agency for CIT, and never more than the safe holds (snap: over balance)", () => {
    const safe = safeState();
    expect(remitProblem(remitForm(), null, 0)).toBe("No safe to send from.");
    expect(remitProblem(remitForm({ bank }), safe, 0)).toBe("Type the amount.");
    expect(remitProblem(remitForm({ bank, mode: "CIT" }), safe, 15000000)).toBe("Type the agency name.");
    const cit = remitForm({ bank, mode: "CIT", agency: "CMS Info Systems", bag: "C-11920" });
    expect(remitProblem(cit, safe, 25000000)).toBe("The safe does not have this much cash.");
    expect(remitProblem(cit, safe, 20841000)).toBe("");
    // Blind: what it holds is the server's to judge (422 TILL_REMIT_OVER_BALANCE).
    expect(remitProblem(cit, safeState({ expected: null }), 25000000)).toBe("");
    expect(remitButtonTitle(false, "")).toBe("You have no right to remit.");
  });

  it("takes the amount typed", () => {
    expect(remitAmountPaise(remitForm({ amountText: "1500.5" }))).toBe(150050);
    expect(remitAmountPaise(remitForm({ amountText: "" }))).toBe(0);
  });

  it("posts a CIT remittance with its agency and amount (snap: remit body)", () => {
    const form = remitForm({ bank, mode: "CIT", agency: " CMS Info Systems ", bag: "C-11920", seal: "", slipNo: "", note: "" });
    expect(remitBody(scope, SAFE_ID, form, 15000000)).toEqual({
      ...scope,
      safeId: SAFE_ID,
      amount: 150000,
      bankLedgerId: bank.id,
      mode: "CIT",
      citAgency: "CMS Info Systems",
      bagNo: "C-11920",
    });
  });

  it("drops the agency off a bank deposit, sends the slip date only with a slip, the PIN only when typed", () => {
    const form = remitForm({ bank, agency: "stale", slipNo: "DS-1", seal: "S9", note: "monday", pin: "1234" });
    const body = remitBody(scope, SAFE_ID, form, 10000);
    expect(body).not.toHaveProperty("citAgency");
    expect(body).toMatchObject({ slipNo: "DS-1", slipDate: "2026-10-15", sealNo: "S9", notes: "monday", approverPin: "1234" });
    expect(remitBody(scope, SAFE_ID, remitForm({ bank }), 10000)).not.toHaveProperty("slipDate");
  });

  it("never sends the notes sent as lines (Qt remitBody)", () => {
    const cit = remitForm({ bank, mode: "CIT", agency: "CMS", bag: "B1", seal: "S1", slipNo: "N1", note: "x", pin: "1" });
    expect(remitBody(scope, SAFE_ID, cit, 100000)).not.toHaveProperty("lines");
  });

  it("asks before it goes, and says what posted (live_safe: remit posted)", () => {
    const cit = remitForm({ bank, mode: "CIT", agency: "LIVE TEST CIT" });
    expect(remitQuestion(cit, "ZT S1 test safe", 10000)).toBe("Send 100.00 from ZT S1 test safe to Test Bank Account, with LIVE TEST CIT?");
    expect(remitQuestion(remitForm({ bank }), "ZT S1 test safe", 10000)).toContain("by our staff?");
    const posted = remitPostedText({
      movement: { tcmId: "m", tcmAccYear: "2026-2027", tcmKind: "REMIT", tcmDocNo: "crm00013", tcmAmount: 100, tcmStatus: "POSTED" },
      tapId: null,
      countId: null,
      safe: safeState(),
    });
    expect(posted).toBe("Remittance crm00013 posted: 100.00.");
  });

  it("keeps the bank, the mode and the slip date after a post; clears the rest", () => {
    const form = remitForm({ bank, mode: "CIT", agency: "A", bag: "B", seal: "S", slipNo: "N", amountText: "5", note: "x", pin: "1" });
    expect(clearedRemitForm(form)).toEqual({ ...remitForm({ bank, mode: "CIT" }) });
  });

  it("says where the cash goes for each mode", () => {
    expect(remitHint("CIT")).toContain('waits as "on the way"');
    expect(remitHint("BANK_DEPOSIT")).toBe("Our staff paid it into the bank: it is in the bank as soon as you post.");
  });
});

describe("cash office — on the way", () => {
  it("lists each remittance in transit with its agency and bag", () => {
    const [row] = transitRows([remit]);
    expect(row).toMatchObject({
      tcmId: remit.tcmId,
      doc: "crm00012",
      date: "13/10/2026",
      safe: "ZT S1 test safe",
      agency: "CMS Info Systems · bag C-11920",
      amount: "1,50,000.00",
      days: "2",
    });
    expect(transitRows(null)).toEqual([]);
  });

  it("keeps the row picked while listed, else the first", () => {
    const rows = [{ tcmId: "a" }, { tcmId: "b" }];
    expect(pickTransitId(rows, "b")).toBe("b");
    expect(pickTransitId(rows, "gone")).toBe("a");
    expect(pickTransitId([], "a")).toBe("");
  });

  it("says a confirmed gap waits, and nothing for a credit within tolerance", () => {
    const answer = { outcome: "SENT_FOR_APPROVAL", difference: -500 } as Parameters<typeof confirmOutcomeText>[0];
    expect(confirmOutcomeText(answer)).toBe("Confirmed. The bank credited 500.00 less: it waits for a decision (Decide, above).");
    expect(confirmOutcomeText({ ...answer, difference: 20 })).toContain("20.00 more");
    expect(confirmOutcomeText({ ...answer, outcome: "WITHIN_TOLERANCE" })).toBe("");
  });
});

describe("cash office — the grids", () => {
  it("sends every quoted token of grid 157, blank for no status", () => {
    expect(remittanceGridParams(scope, "2026-10-15", "")).toEqual({
      icompany_id: scope.companyId,
      ibranch_id: scope.branchId,
      ifrom_date: "2026-07-17",
      ito_date: "2026-10-15",
      istatus: "",
    });
    expect(remittanceGridParams(scope, "2026-10-15", "IN_TRANSIT").istatus).toBe("IN_TRANSIT");
    expect(safeBookGridParams(scope, SAFE_ID)).toEqual({
      icompany_id: scope.companyId,
      ibranch_id: scope.branchId,
      isafe_id: SAFE_ID,
    });
  });

  it("puts the rows newest first, a row without a time last", () => {
    const rows: GridRow[] = [
      { id: "old", at: "2026-10-13T10:00:00Z" },
      { id: "none", at: null },
      { id: "new", at: "2026-10-15T10:00:00Z" },
      { id: "mid", at: "2026-10-14T10:00:00Z" },
    ];
    expect(newestFirst(rows, "at").map((row) => row.id)).toEqual(["new", "mid", "old", "none"]);
  });

  it("shows the money columns as money", () => {
    expect(gridCellText({ rm_amount: "150000.00" }, "rm_amount")).toBe("1,50,000.00");
    expect(gridCellText({ sb_out: null }, "sb_out")).toBe("");
    expect(gridCellText({ rm_status: "IN TRANSIT" }, "rm_status")).toBe("IN TRANSIT");
  });
});

describe("cash office — void remittance", () => {
  const row: GridRow = {
    tcm_id: "m1",
    tcm_acc_year: "2026-2027",
    tcm_doc_no: "crm00012",
    rm_amount: "150000.00",
    tcm_status: "POSTED",
    tcm_remit_status: "IN_TRANSIT",
  };

  it("voids a posted remittance the bank has not confirmed, never a confirmed or voided one", () => {
    expect(voidableRemit(row)).toBe(row);
    expect(voidableRemit({ ...row, tcm_remit_status: "DEPOSITED" })).not.toBeNull();
    expect(voidableRemit({ ...row, tcm_remit_status: "CONFIRMED" })).toBeNull();
    expect(voidableRemit({ ...row, tcm_status: "VOIDED" })).toBeNull();
    expect(voidableRemit(null)).toBeNull();
  });

  it("says why the button is off, and what voiding does", () => {
    expect(voidButton(null, { busy: false, canOverride: true })).toEqual({
      enabled: false,
      title: "Pick a remittance not yet confirmed by the bank",
    });
    expect(voidButton(row, { busy: false, canOverride: false }).title).toBe("No override right on Cash Office (menu 287)");
    expect(voidButton(row, { busy: false, canOverride: true })).toEqual({
      enabled: true,
      title: "Void crm00012: the cash goes back into the safe",
    });
  });

  it("opens the shared void dialog on the row as a REMIT", () => {
    expect(remitVoidRequest(row, scope)).toEqual({
      key: { ...scope, accYear: "2026-2027", tcmId: "m1" },
      docNo: "crm00012",
      kind: "REMIT",
      amount: 150000,
    });
  });
});

describe("cash office — print memo (Qt 3b5069d, notes 135)", () => {
  const row: GridRow = {
    tcm_id: "m1",
    tcm_acc_year: "2026-2027",
    tcm_doc_no: "crm00012",
    rm_amount: "150000.00",
    tcm_status: "POSTED",
    tcm_remit_status: "CONFIRMED",
  };

  it("takes the picked remittance in ANY state — a confirmed one prints with the bank's figures", () => {
    expect(remitMemoOf(row)).toEqual({ tcmId: "m1", accYear: "2026-2027", docNo: "crm00012" });
    expect(remitMemoOf({ ...row, tcm_status: "VOIDED" })).not.toBeNull();
    expect(remitMemoOf({ ...row, tcm_remit_status: "IN_TRANSIT" })).not.toBeNull();
    expect(remitMemoOf(null)).toBeNull();
    expect(remitMemoOf({ tcm_doc_no: "x" })).toBeNull();
  });

  it("says why the button is off, and what it prints", () => {
    expect(printMemoButton(null, true)).toEqual({ enabled: false, title: "Pick a remittance" });
    expect(printMemoButton(remitMemoOf(row), false)).toEqual({ enabled: false, title: "No print right on Cash Office (menu 287)" });
    expect(printMemoButton(remitMemoOf(row), true)).toEqual({ enabled: true, title: "Print the memo of crm00012" });
  });

  it("names the memo as a print document on the screen's company and branch", () => {
    expect(remitMemoTarget({ tcmId: "m1", accYear: "2026-2027", docNo: "crm00012" }, scope)).toEqual({
      docId: "m1",
      companyId: scope.companyId,
      accYear: "2026-2027",
      branchId: scope.branchId,
      filename: "remit-crm00012",
    });
    // No year on the row: left out, so the server binds the company's current one.
    expect(remitMemoTarget({ tcmId: "m1", accYear: "", docNo: "crm00012" }, scope)).not.toHaveProperty("accYear");
    expect(remitMemoFilename("crm00012")).toBe("remit-crm00012");
    expect(remitMemoLabel("crm00012")).toBe("Remittance memo crm00012");
  });

  it("asks to print the memo once the remittance is posted, on the posted movement", () => {
    const result = {
      movement: { tcmId: "m9", tcmAccYear: "2026-2027", tcmKind: "REMIT", tcmDocNo: "crm00013", tcmAmount: 100, tcmStatus: "POSTED" },
      tapId: null,
      countId: null,
      safe: safeState(),
    };
    expect(remitPrintQuestion(result)).toBe(
      "Remittance crm00013 posted: 100.00.\n\nPrint the memo now (bank / agency copy and store copy)?",
    );
    expect(postedRemitMemo(result)).toEqual({ tcmId: "m9", accYear: "2026-2027", docNo: "crm00013" });
    expect(postedRemitMemo({ ...result, movement: { ...result.movement, tcmId: "" } })).toBeNull();
  });
});
