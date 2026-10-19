import { describe, expect, it } from "vitest";
import { EMPTY_COUNT, toDenominations, withQty } from "../shared/denom";
import type { TillReason } from "../shared/reasons";
import type { TillSessionPayload, TillSupervisor } from "../shared/wire/types";
import {
  MODE_LINES,
  NO_DROP_SAFE_TIP,
  dropTileTitle,
  emptyMovementForm,
  hasDropSafe,
  isHandOver,
  isPostKey,
  ledgerTip,
  modeForKey,
  movementBody,
  movementPostedText,
  movementPrintQuestion,
  movementProblem,
  movementSlipTarget,
  movementStars,
  movementWords,
  openingMode,
  pickedSupervisor,
  reasonOptions,
  refVisible,
  slipFilename,
  slipLabel,
  summaryAccount,
  supervisorLabel,
  type MovementForm,
  type MovementInputs,
} from "./cash-movement";

const DENOMS = toDenominations([
  { tdnId: "d500", tdnLabel: "₹500", tdnKind: "NOTE", tdnValue: 500 },
  { tdnId: "d100", tdnLabel: "₹100", tdnKind: "NOTE", tdnValue: 100 },
]);

function reason(over: Partial<TillReason>): TillReason {
  return {
    id: "r",
    category: "PAID_IN",
    code: "R",
    name: "Reason",
    ledgerId: "",
    ledgerName: "",
    needsNote: false,
    needsRef: false,
    maxAmountPaise: 0,
    active: true,
    overridden: false,
    ...over,
  };
}

const REASONS = [
  reason({ id: "scrap", name: "Scrap sale", ledgerId: "led-scrap", ledgerName: "Scrap Sales" }),
  reason({ id: "misc", name: "Misc income" }),
  reason({ id: "capped", name: "Small refund", ledgerId: "led", maxAmountPaise: 50000, needsNote: true }),
  reason({ id: "bank", category: "PICKUP", name: "Bank deposit", needsRef: true }),
  reason({ id: "old", category: "PICKUP", name: "Old", active: false }),
];

const SESSION = {
  tssId: "tss",
  tssSessionNo: "C01-261009-01",
  tssStatus: "OPEN",
  tssOperatorId: "u-cashier",
  operatorName: "RAVI K",
  dropSafeName: "DROP SAFE C01",
} as unknown as TillSessionPayload;

/** `/movements/supervisors`: never the session's cashier (the server leaves them out). */
const SUPERVISORS: TillSupervisor[] = [
  { userId: "u-anu", loginName: "anu", fullName: "ANU (SUP)", hasPin: true },
  { userId: "u-babu", loginName: "babu", fullName: null, hasPin: true },
  { userId: "u-chitra", loginName: "chitra", fullName: "CHITRA", hasPin: false },
];

/** A pickup / top-up signed by ANU — what a hand-over needs past the count. */
const SIGNED = { supervisorId: "u-anu", supervisorPin: "4321" };

const KEY = { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss" };

function inputs(form: Partial<MovementForm>, over: Partial<MovementInputs> = {}): MovementInputs {
  return {
    form: { ...emptyMovementForm("DROP", EMPTY_COUNT), ...form },
    session: SESSION,
    reasons: REASONS,
    denominations: DENOMS,
    me: "u-cashier",
    supervisors: SUPERVISORS,
    supervisorError: "",
    ...over,
  };
}

describe("the problems Post waits on", () => {
  it("reads the session first, and only moves cash while it takes money", () => {
    expect(movementProblem(inputs({}, { session: null }))).toBe("Reading the session…");
    expect(movementProblem(inputs({}, { session: { ...SESSION, tssStatus: "COUNTING" } }))).toBe(
      "The session is COUNTING: it no longer moves cash.",
    );
  });

  it("wants a sealed bag for a drop, then its amount", () => {
    expect(movementProblem(inputs({ bagNo: "B1" }))).toBe("A drop is a sealed bag: enter its bag no and seal.");
    expect(movementProblem(inputs({ bagNo: "B1", sealNo: "S1" }))).toBe("Enter the declared amount.");
    expect(movementProblem(inputs({ bagNo: "B1", sealNo: "S1", amountPaise: 500000 }))).toBe("");
  });

  it("is entered at the counter, logged in as the session's cashier, whatever the mode (notes 110)", () => {
    for (const mode of ["DROP", "PAID_IN", "PICKUP", "TOP_UP"] as const) {
      expect(movementProblem(inputs({ mode }, { me: "u-anu" }))).toBe(
        "Cash movements are entered at the counter, logged in as the session's cashier (RAVI K).",
      );
    }
    expect(movementProblem(inputs({}, { me: "u-anu", session: { ...SESSION, operatorName: null } }))).toBe(
      "Cash movements are entered at the counter, logged in as the session's cashier.",
    );
    // The cashier's own pickup is no longer refused: the supervisor signs it.
    expect(movementProblem(inputs({ mode: "PICKUP" }))).toBe("Pick a reason.");
  });

  it("refuses a drop on a counter with no drop safe, before the bag", () => {
    const noSafe = { ...SESSION, dropSafeName: null };
    expect(movementProblem(inputs({}, { session: noSafe }))).toBe(
      "This counter has no drop safe: hand the bag to a supervisor as a Pickup.",
    );
    expect(movementProblem(inputs({}, { session: { ...noSafe, dropSafeName: "  " } }))).toBe(
      "This counter has no drop safe: hand the bag to a supervisor as a Pickup.",
    );
    // A server from before notes 110 sends no dropSafeName: a drop works as it did.
    const { dropSafeName: _absent, ...older } = SESSION;
    void _absent;
    expect(movementProblem(inputs({ bagNo: "B", sealNo: "S", amountPaise: 100 }, { session: older as TillSessionPayload }))).toBe("");
    // Only a drop needs one.
    expect(movementProblem(inputs({ mode: "PICKUP" }, { session: noSafe }))).toBe("Pick a reason.");
  });

  it("holds a reason to its note, ref and cap", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 2);
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "capped", count: counted }))).toBe(
      "“Small refund” needs a note.",
    );
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "capped", count: counted, notes: "x" }))).toBe(
      "“Small refund” allows at most 500.00 in one movement.",
    );
    expect(movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", count: counted, ...SIGNED }))).toBe(
      "“Bank deposit” needs a ref no (bill / voucher no).",
    );
  });

  it("asks for a ledger only when the reason has none", () => {
    const counted = withQty(EMPTY_COUNT, "d100", 1);
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "misc", count: counted }))).toBe(
      "This reason has no ledger: pick the ledger the money comes from.",
    );
    expect(
      movementProblem(inputs({ mode: "PAID_IN", reasonId: "misc", count: counted, ledger: { id: "l", text: "L" } })),
    ).toBe("");
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "scrap", count: counted }))).toBe("");
  });

  it("asks a counted mode to count, before anyone signs", () => {
    expect(movementProblem(inputs({ mode: "TOP_UP", ...SIGNED }))).toBe("Count the cash, note by note.");
    expect(movementProblem(inputs({ mode: "TOP_UP" }))).toBe("Count the cash, note by note.");
  });

  it("waits for the supervisor's signature after the count (notes 110)", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 1);
    const topUp = (patch: Partial<MovementForm>, over: Partial<MovementInputs> = {}) =>
      movementProblem(inputs({ mode: "TOP_UP", count: counted, ...patch }, over));
    expect(topUp({}, { supervisors: null })).toBe("Reading who can sign…");
    expect(topUp({}, { supervisors: [] })).toBe(
      "No one can sign here: a supervisor needs the Till Sessions (273) override right.",
    );
    expect(topUp({}, { supervisors: [], supervisorError: "The supervisor list did not load." })).toBe(
      "The supervisor list did not load.",
    );
    expect(topUp({})).toBe("Pick the supervisor who is here with you.");
    expect(topUp({ supervisorId: "u-gone" })).toBe("Pick the supervisor who is here with you.");
    expect(topUp({ supervisorId: "u-chitra", supervisorPin: "1" })).toBe(
      "CHITRA has no till PIN: set one in User Administration (menu 58).",
    );
    expect(topUp({ supervisorId: "u-anu" })).toBe("ANU (SUP) types their till PIN to sign.");
    expect(topUp({ supervisorId: "u-anu", supervisorPin: "  " })).toBe("ANU (SUP) types their till PIN to sign.");
    expect(topUp({ supervisorId: "u-babu" })).toBe("babu types their till PIN to sign.");
    expect(topUp(SIGNED)).toBe("");
  });

  it("asks a pickup for its reason first, then the signature", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 1);
    expect(movementProblem(inputs({ mode: "PICKUP", count: counted, ...SIGNED }))).toBe("Pick a reason.");
    expect(movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", count: counted, refNo: "DEP-7" }))).toBe(
      "Pick the supervisor who is here with you.",
    );
    expect(movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", count: counted, refNo: "DEP-7", ...SIGNED }))).toBe("");
  });

  it("asks no signature of a drop or a paid-in", () => {
    expect(movementProblem(inputs({ bagNo: "B", sealNo: "S", amountPaise: 100 }, { supervisors: [] }))).toBe("");
    expect(
      movementProblem(inputs({ mode: "PAID_IN", reasonId: "scrap", count: withQty(EMPTY_COUNT, "d100", 1) }, { supervisors: null })),
    ).toBe("");
  });
});

describe("the hand-over's signers (notes 110)", () => {
  it("is a pickup or a top-up", () => {
    expect(isHandOver("PICKUP")).toBe(true);
    expect(isHandOver("TOP_UP")).toBe(true);
    expect(isHandOver("DROP")).toBe(false);
    expect(isHandOver("PAID_IN")).toBe(false);
  });

  it("names a supervisor by full name, else login", () => {
    expect(supervisorLabel(SUPERVISORS[0])).toBe("ANU (SUP)");
    expect(supervisorLabel(SUPERVISORS[1])).toBe("babu");
    expect(supervisorLabel({ ...SUPERVISORS[0], fullName: "  " })).toBe("anu");
  });

  it("finds the supervisor picked only on the list", () => {
    const form = (supervisorId: string) => ({ ...emptyMovementForm("PICKUP", EMPTY_COUNT), supervisorId });
    expect(pickedSupervisor({ form: form("u-babu"), supervisors: SUPERVISORS })?.loginName).toBe("babu");
    expect(pickedSupervisor({ form: form(""), supervisors: SUPERVISORS })).toBeNull();
    expect(pickedSupervisor({ form: form("u-gone"), supervisors: SUPERVISORS })).toBeNull();
    expect(pickedSupervisor({ form: form("u-anu"), supervisors: null })).toBeNull();
  });
});

describe("the drop safe (notes 110 §3)", () => {
  const { dropSafeName: _absent, ...older } = SESSION;
  void _absent;

  it("is the session's dropSafeName; a server without the key, or a session not read, keeps Drop on", () => {
    expect(hasDropSafe(SESSION)).toBe(true);
    expect(hasDropSafe({ ...SESSION, dropSafeName: null })).toBe(false);
    expect(hasDropSafe({ ...SESSION, dropSafeName: "" })).toBe(false);
    expect(hasDropSafe(older as TillSessionPayload)).toBe(true);
    expect(hasDropSafe(null)).toBe(true);
  });

  it("titles the Drop tile with the safe, or why it is off", () => {
    expect(dropTileTitle(SESSION)).toBe("Ctrl+1 · into DROP SAFE C01");
    expect(dropTileTitle({ ...SESSION, dropSafeName: null })).toBe(NO_DROP_SAFE_TIP);
    expect(NO_DROP_SAFE_TIP).toBe(
      "This counter has no drop safe: hand the bag to a supervisor as a Pickup (Till Safes, menu 280, marks a drop safe).",
    );
    expect(dropTileTitle(older as TillSessionPayload)).toBe("Ctrl+1");
    expect(dropTileTitle(null)).toBe("Ctrl+1");
  });

  it("moves a dialog opened on Drop to Pickup when the counter has none", () => {
    const noSafe = { ...SESSION, dropSafeName: null };
    expect(openingMode("DROP", noSafe)).toBe("PICKUP");
    expect(openingMode("DROP", SESSION)).toBe("DROP");
    expect(openingMode("DROP", null)).toBe("DROP");
    expect(openingMode("PAID_IN", noSafe)).toBe("PAID_IN");
    expect(openingMode("TOP_UP", noSafe)).toBe("TOP_UP");
  });
});

describe("the body Post sends", () => {
  it("declares a drop's amount and bag", () => {
    expect(movementBody(inputs({ bagNo: " B1 ", sealNo: "S1", amountPaise: 500050, notes: "" }), KEY)).toEqual({
      ...KEY,
      kind: "DROP",
      amount: 5000.5,
      bagNo: "B1",
      sealNo: "S1",
      notes: null,
    });
  });

  it("counts a paid-in, with its reason, ref, ledger and party", () => {
    const body = movementBody(
      inputs({
        mode: "PAID_IN",
        reasonId: "misc",
        ledger: { id: "led-x", text: "Misc" },
        refNo: "",
        partyName: "Scrap dealer",
        count: withQty(EMPTY_COUNT, "d100", 3),
      }),
      KEY,
    );
    expect(body).toEqual({
      ...KEY,
      kind: "PAID_IN",
      lines: [{ tenderTypeId: 1, denominationId: "d100", qty: 3 }],
      reasonId: "misc",
      refNo: null,
      ledgerId: "led-x",
      partyName: "Scrap dealer",
      notes: null,
    });
  });

  it("signs a hand-over with the supervisor and their PIN, trimmed (notes 110)", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 1);
    expect(movementBody(inputs({ mode: "TOP_UP", count: counted, supervisorId: "u-anu", supervisorPin: " 4321 " }), KEY)).toEqual({
      ...KEY,
      kind: "TOP_UP",
      lines: [{ tenderTypeId: 1, denominationId: "d500", qty: 1 }],
      supervisorId: "u-anu",
      supervisorPin: "4321",
      notes: null,
    });
    const pickup = movementBody(inputs({ mode: "PICKUP", reasonId: "bank", count: counted, ...SIGNED }), KEY);
    expect(pickup).toMatchObject({ kind: "PICKUP", supervisorId: "u-anu", supervisorPin: "4321" });
    // Notes 108's witnessPin is gone: never sent.
    expect("witnessPin" in pickup).toBe(false);
  });

  it("sends no signer on a drop or a paid-in", () => {
    const drop = movementBody(inputs({ bagNo: "B", sealNo: "S", amountPaise: 100, ...SIGNED }), KEY);
    const paidIn = movementBody(inputs({ mode: "PAID_IN", reasonId: "scrap", count: withQty(EMPTY_COUNT, "d100", 1), ...SIGNED }), KEY);
    for (const body of [drop, paidIn]) {
      expect("supervisorId" in body).toBe(false);
      expect("supervisorPin" in body).toBe(false);
      expect("witnessPin" in body).toBe(false);
    }
  });

  it("sends a pickup's ref only when its reason asks for one", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 1);
    expect(movementBody(inputs({ mode: "PICKUP", reasonId: "bank", refNo: "DEP-7", count: counted }), KEY).refNo).toBe("DEP-7");
    const plain = movementBody(inputs({ mode: "TOP_UP", count: counted }), KEY);
    expect("refNo" in plain).toBe(false);
    expect("reasonId" in plain).toBe(false);
    expect("bagNo" in plain).toBe(false);
  });
});

describe("the mode's words and choices", () => {
  it("offers the live reasons of the mode's own category", () => {
    expect(reasonOptions("PICKUP", REASONS).map((r) => r.id)).toEqual(["bank"]);
    expect(reasonOptions("DROP", REASONS)).toEqual([]);
    expect(refVisible(emptyMovementForm("PAID_IN", EMPTY_COUNT), REASONS)).toBe(true);
    expect(refVisible({ ...emptyMovementForm("PICKUP", EMPTY_COUNT), reasonId: "bank" }, REASONS)).toBe(true);
  });

  it("titles the dialog by its mode, with the session under it", () => {
    const words = movementWords("PICKUP", SESSION, "ANU (SUP)");
    expect(words.title).toBe("Cash Movement — Pickup");
    expect(words.sub).toBe("Session C01-261009-01 · RAVI K");
    expect(movementWords("DROP", null, "x").sub).toBe("Reading the session…");
  });

  it("says who gives and who receives: a pickup goes to the supervisor, a top-up comes from one", () => {
    expect(movementWords("PICKUP", SESSION, "ANU (SUP)")).toMatchObject({ givenBy: "RAVI K", receivedBy: "ANU (SUP)" });
    expect(movementWords("TOP_UP", SESSION, "ANU (SUP)")).toMatchObject({ givenBy: "ANU (SUP)", receivedBy: "RAVI K" });
    // "—" until the supervisor is picked.
    expect(movementWords("PICKUP", SESSION, "")).toMatchObject({ givenBy: "RAVI K", receivedBy: "—" });
    expect(movementWords("TOP_UP", SESSION, "")).toMatchObject({ givenBy: "—", receivedBy: "RAVI K" });
  });

  it("explains each mode in the cashier's words (notes 110)", () => {
    expect(movementWords("DROP", SESSION, "").modeNote).toBe(
      "The cashier seals the bag and drops it in the drop safe. The cash office counts it later.",
    );
    expect(movementWords("PICKUP", SESSION, "").modeNote).toBe(
      "You hand cash to the supervisor, here at the counter. Both of you sign.",
    );
    expect(movementWords("TOP_UP", SESSION, "").modeNote).toBe(
      "The supervisor hands you change from the safe, here at the counter. Both of you sign.",
    );
    expect(MODE_LINES.PICKUP).toBe("Cash to a supervisor");
    expect(MODE_LINES.TOP_UP).toBe("Change from the safe");
  });

  it("says which way the cash goes", () => {
    expect(movementWords("DROP", SESSION, "x")).toMatchObject({ flow: "TILL → SAFE", flowTone: "blue" });
    expect(movementWords("PICKUP", SESSION, "x")).toMatchObject({ flow: "TILL → SAFE", flowTone: "blue" });
    expect(movementWords("TOP_UP", SESSION, "x")).toMatchObject({ flow: "SAFE → TILL", flowTone: "green" });
    expect(movementWords("PAID_IN", SESSION, "x")).toMatchObject({ flow: "INTO THE TILL", flowTone: "green" });
  });

  it("captions the summary card for the mode", () => {
    expect(movementWords("DROP", SESSION, "x").totalCaption).toBe("DECLARED IN THE BAG");
    expect(movementWords("PAID_IN", SESSION, "x").totalCaption).toBe("PAID IN");
    expect(movementWords("PICKUP", SESSION, "x").totalCaption).toBe("PICKED UP");
    expect(movementWords("TOP_UP", SESSION, "x").totalCaption).toBe("TOPPED UP");
    expect(movementWords("PAID_IN", SESSION, "x").safeCaption).toBe("Ledger");
    expect(movementWords("DROP", SESSION, "x").safeCaption).toBe("To safe");
    expect(movementWords("TOP_UP", SESSION, "x").safeCaption).toBe("From safe");
  });

  it("shows the paid-in's ledger: the one picked, else the reason's, else —", () => {
    const paidIn = (patch: Partial<MovementForm>) => ({ form: { ...emptyMovementForm("PAID_IN", EMPTY_COUNT), ...patch }, reasons: REASONS });
    expect(summaryAccount(paidIn({ reasonId: "scrap", ledger: { id: "l", text: "Other Income" } }))).toBe("Other Income");
    expect(summaryAccount(paidIn({ reasonId: "scrap" }))).toBe("Scrap Sales");
    expect(summaryAccount(paidIn({ reasonId: "misc" }))).toBe("—");
    expect(summaryAccount({ form: emptyMovementForm("TOP_UP", EMPTY_COUNT), reasons: REASONS })).toBe("Counter's safe");
  });

  it("stars what the mode and the reason demand", () => {
    const stars = (mode: MovementForm["mode"], reasonId = "") =>
      movementStars({ form: { ...emptyMovementForm(mode, EMPTY_COUNT), reasonId }, reasons: REASONS });
    expect(stars("PAID_IN")).toEqual({ ledger: true, ref: false, notes: false, count: true });
    expect(stars("PAID_IN", "scrap").ledger).toBe(false);
    expect(stars("PAID_IN", "misc").ledger).toBe(true);
    expect(stars("PAID_IN", "capped")).toMatchObject({ ledger: false, notes: true });
    expect(stars("PICKUP", "bank")).toEqual({ ledger: false, ref: true, notes: false, count: true });
    expect(stars("DROP").count).toBe(false);
    expect(ledgerTip({ form: { ...emptyMovementForm("PAID_IN", EMPTY_COUNT), reasonId: "scrap" }, reasons: REASONS })).toBe(
      "Blank = the reason's own ledger (Scrap Sales).",
    );
    expect(ledgerTip({ form: { ...emptyMovementForm("PAID_IN", EMPTY_COUNT), reasonId: "misc" }, reasons: REASONS })).toBe("");
  });

  it("clears the supervisor's pick and PIN with every other box on a mode change", () => {
    expect(emptyMovementForm("PICKUP", EMPTY_COUNT)).toMatchObject({ supervisorId: "", supervisorPin: "" });
  });
});

describe("the dialog's keys", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  it("posts on Ctrl+Enter, and still on F10", () => {
    expect(isPostKey(key("Enter", { ctrlKey: true }))).toBe(true);
    expect(isPostKey(key("F10"))).toBe(true);
    expect(isPostKey(key("Enter"))).toBe(false);
    expect(isPostKey(key("Enter", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPostKey(key("F10", { ctrlKey: true }))).toBe(false);
  });

  it("picks the mode on Ctrl+1..4, in the tiles' order", () => {
    expect(modeForKey(key("1", { ctrlKey: true }))).toBe("DROP");
    expect(modeForKey(key("2", { ctrlKey: true }))).toBe("PAID_IN");
    expect(modeForKey(key("3", { ctrlKey: true }))).toBe("PICKUP");
    expect(modeForKey(key("4", { ctrlKey: true }))).toBe("TOP_UP");
    expect(modeForKey(key("5", { ctrlKey: true }))).toBeNull();
    expect(modeForKey(key("1"))).toBeNull();
    expect(modeForKey(key("1", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("the slip after the post (Qt 3b5069d, notes 135)", () => {
  const posted = { tcmId: "m-1", tcmAccYear: "2026-2027", tcmKind: "PICKUP", tcmDocNo: "tpi/00031", tcmAmount: 150, tcmStatus: "POSTED" };
  const key = { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss" };

  it("asks to print the slip both people sign, after saying what posted", () => {
    expect(movementPostedText(posted)).toBe("PICKUP tpi/00031 posted — 150.00.");
    expect(movementPrintQuestion(posted)).toBe("PICKUP tpi/00031 posted — 150.00.\n\nPrint the slip now?");
  });

  it("names the slip as a print document on the session's company, year and branch", () => {
    expect(movementSlipTarget(posted, key)).toEqual({
      docId: "m-1",
      companyId: "co",
      accYear: "2026-2027",
      branchId: "br",
      filename: "slip-tpi-00031",
    });
    expect(slipFilename("tpi00031")).toBe("slip-tpi00031");
    expect(slipFilename("TPI/26/0031")).toBe("slip-TPI-26-0031");
    expect(slipLabel("tpi00031")).toBe("Slip tpi00031");
  });
});
