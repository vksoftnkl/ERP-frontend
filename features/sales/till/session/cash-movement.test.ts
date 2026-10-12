import { describe, expect, it } from "vitest";
import { EMPTY_COUNT, toDenominations, withQty } from "../shared/denom";
import type { TillReason } from "../shared/reasons";
import type { TillSessionPayload } from "../shared/wire/types";
import {
  emptyMovementForm,
  movementBody,
  movementProblem,
  movementWords,
  reasonOptions,
  refVisible,
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
  reason({ id: "scrap", name: "Scrap sale", ledgerId: "led-scrap" }),
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
      movementProblem(inputs({ mode: "PICKUP", reasonId: "bank", count: counted }, { me: "u-super" })),
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
    expect(movementProblem(inputs({ mode: "TOP_UP" }, { me: "u-super" }))).toBe("Count the cash, note by note.");
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

  it("names the voucher and who signs", () => {
    const words = movementWords("PICKUP", SESSION, "ANU (SUP)");
    expect(words.title).toBe("Pickup — C01-261009-01 · RAVI K");
    expect(words.voucher).toBe("TDrp");
    expect(words.witness).toBe("RAVI K  (the session's cashier)");
    expect(movementWords("TOP_UP", SESSION, "x").voucher).toBe("TFlt");
    expect(movementWords("PAID_IN", SESSION, "x").safeCaption).toBe("To safe");
    expect(movementWords("TOP_UP", SESSION, "x").safeCaption).toBe("From safe");
  });
});
