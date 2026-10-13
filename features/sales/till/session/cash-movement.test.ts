import { describe, expect, it } from "vitest";
import { EMPTY_COUNT, toDenominations, withQty } from "../shared/denom";
import type { TillReason } from "../shared/reasons";
import type { TillSessionPayload } from "../shared/wire/types";
import {
  emptyMovementForm,
  isPostKey,
  ledgerTip,
  modeForKey,
  movementBody,
  movementProblem,
  movementStars,
  movementWords,
  needsWitnessPin,
  reasonOptions,
  refVisible,
  summaryAccount,
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
} as unknown as TillSessionPayload;

const KEY = { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss" };

function inputs(form: Partial<MovementForm>, over: Partial<MovementInputs> = {}): MovementInputs {
  return {
    form: { ...emptyMovementForm("DROP", EMPTY_COUNT), ...form },
    session: SESSION,
    reasons: REASONS,
    denominations: DENOMS,
    me: "u-cashier",
    myName: "RAVI K",
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

  it("never lets the cashier take their own pickup", () => {
    expect(movementProblem(inputs({ mode: "PICKUP" }))).toMatch(/^A pickup is two people/);
    expect(movementProblem(inputs({ mode: "PICKUP" }, { me: "u-super" }))).toBe("Pick a reason.");
  });

  it("holds a reason to its note, ref and cap", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 2);
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "capped", count: counted }))).toBe(
      "“Small refund” needs a note.",
    );
    expect(movementProblem(inputs({ mode: "PAID_IN", reasonId: "capped", count: counted, notes: "x" }))).toBe(
      "“Small refund” allows at most 500.00 in one movement.",
    );
    expect(
      movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", count: counted, witnessPin: "4321" }, { me: "u-super" })),
    ).toBe("“Bank deposit” needs a ref no (bill / voucher no).");
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

  it("asks a counted mode to count", () => {
    expect(movementProblem(inputs({ mode: "TOP_UP", witnessPin: "1" }, { me: "u-super" }))).toBe(
      "Count the cash, note by note.",
    );
    expect(movementProblem(inputs({ mode: "TOP_UP" }))).toBe("Count the cash, note by note.");
  });

  it("waits for the witness's PIN after the reason (notes 108)", () => {
    expect(movementProblem(inputs({ mode: "PICKUP", reasonId: "bank" }, { me: "u-super" }))).toBe(
      "RAVI K must type their till PIN.",
    );
    expect(movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", witnessPin: "  " }, { me: "u-super" }))).toBe(
      "RAVI K must type their till PIN.",
    );
    expect(movementProblem(inputs({ mode: "TOP_UP" }, { me: "u-super" }))).toBe("RAVI K must type their till PIN.");
    expect(
      movementProblem(inputs({ mode: "TOP_UP" }, { me: "u-super", session: { ...SESSION, operatorName: null } })),
    ).toBe("The cashier must type their till PIN.");
  });
});

describe("who witnesses with a PIN (notes 108)", () => {
  it("is the cashier on every pickup, and on a top-up someone else brings", () => {
    expect(needsWitnessPin("PICKUP", SESSION, "u-super")).toBe(true);
    expect(needsWitnessPin("TOP_UP", SESSION, "u-super")).toBe(true);
    expect(needsWitnessPin("TOP_UP", SESSION, "u-cashier")).toBe(false);
    expect(needsWitnessPin("DROP", SESSION, "u-super")).toBe(false);
    expect(needsWitnessPin("PAID_IN", SESSION, "u-super")).toBe(false);
  });

  it("asks on a top-up while the session is still being read", () => {
    expect(needsWitnessPin("TOP_UP", null, "u-cashier")).toBe(true);
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

  it("sends the witness PIN, trimmed, only when there is a witness", () => {
    const counted = withQty(EMPTY_COUNT, "d500", 1);
    const pickup = movementBody(
      inputs({ mode: "PICKUP", reasonId: "bank", count: counted, witnessPin: " 4321 " }, { me: "u-super" }),
      KEY,
    );
    expect(pickup.witnessPin).toBe("4321");
    const ownTopUp = movementBody(inputs({ mode: "TOP_UP", count: counted, witnessPin: "9" }), KEY);
    expect("witnessPin" in ownTopUp).toBe(false);
    const theirTopUp = movementBody(inputs({ mode: "TOP_UP", count: counted, witnessPin: "77" }, { me: "u-super" }), KEY);
    expect(theirTopUp.witnessPin).toBe("77");
    const drop = movementBody(inputs({ bagNo: "B", sealNo: "S", amountPaise: 100, witnessPin: "1" }, { me: "u-super" }), KEY);
    expect("witnessPin" in drop).toBe(false);
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
    expect(words.supervisor).toBe("ANU (SUP)");
    expect(words.witness).toBe("RAVI K");
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

  it("names the PIN's owner, or the cashier before the session is read", () => {
    expect(movementWords("PICKUP", SESSION, "x").pinCaption).toBe("RAVI K's PIN *");
    expect(movementWords("PICKUP", SESSION, "x").pinHint).toBe("RAVI K types their own till PIN here — proof they saw it.");
    expect(movementWords("PICKUP", null, "x").pinCaption).toBe("Cashier's PIN *");
    expect(movementWords("PICKUP", null, "x").pinHint).toBe("The cashier types their own till PIN here — proof they saw it.");
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

  it("clears the PIN with every other box on a mode change", () => {
    expect(emptyMovementForm("PICKUP", EMPTY_COUNT).witnessPin).toBe("");
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
