import { describe, expect, it } from "vitest";
import { movementVoidBody, movementVoidInfo, movementVoidMessage, movementVoidProblem, voidNoteNeeded, voidReasons } from "./movement-void";
import type { TillReason } from "./reasons";

const reason = (over: Partial<TillReason>): TillReason => ({
  id: "r1",
  category: "MOVEMENT_VOID",
  code: "WRONG",
  name: "Wrong entry",
  ledgerId: "",
  ledgerName: "",
  needsNote: false,
  needsRef: false,
  maxAmountPaise: 0,
  active: true,
  overridden: false,
  ...over,
});

const request = {
  key: { companyId: "c", branchId: "b", accYear: "2026-2027", tcmId: "m1" },
  docNo: "TDrp/12",
  kind: "DROP",
  amount: 500,
};

describe("movement void", () => {
  it("offers only the live MOVEMENT_VOID reasons", () => {
    const reasons = [
      reason({ id: "a" }),
      reason({ id: "b", category: "PICKUP" }),
      reason({ id: "c", active: false }),
      reason({ id: "d", overridden: true }),
    ];
    expect(voidReasons(reasons).map((r) => r.id)).toEqual(["a"]);
  });

  it("asks for a reason, then a note when the reason needs one", () => {
    const reasons = [reason({ id: "n", needsNote: true })];
    expect(movementVoidProblem({ reasonId: "", note: "" }, false)).toBe("Pick the reason.");
    expect(voidNoteNeeded(reasons, "n")).toBe(true);
    expect(movementVoidProblem({ reasonId: "n", note: "  " }, true)).toBe("This reason needs a note.");
    expect(movementVoidProblem({ reasonId: "n", note: "typo" }, true)).toBe("");
  });

  it("sends the key, the reason and a trimmed note only when there is one", () => {
    expect(movementVoidBody(request, { reasonId: "r1", note: "" })).toEqual({ ...request.key, reasonId: "r1" });
    expect(movementVoidBody(request, { reasonId: "r1", note: " typo " })).toEqual({ ...request.key, reasonId: "r1", notes: "typo" });
  });

  it("words a remittance's void apart from a drawer movement's", () => {
    expect(movementVoidInfo("REMIT")).toMatch(/back into the safe/);
    expect(movementVoidInfo("PICKUP")).toMatch(/where it came from/);
    expect(movementVoidMessage({ tcmId: "m1", tcmAccYear: "", tcmKind: "REMIT", tcmDocNo: "CRem/3", tcmAmount: 1, tcmStatus: "VOIDED" })).toBe(
      "REMIT CRem/3 voided",
    );
  });
});
