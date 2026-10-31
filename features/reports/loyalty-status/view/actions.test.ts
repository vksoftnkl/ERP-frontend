import { describe, expect, it } from "vitest";
import { adjustBody, adjustState, cleanPoints, needsWriteOff, statusBody, statusChoices, statusState } from "./actions";

describe("Suspend… (Qt LoyaltyMemberStatusDialog)", () => {
  it("offers every settable status but the current one", () => {
    expect(statusChoices("ACTIVE")).toEqual(["SUSPENDED", "CLOSED"]);
    expect(statusChoices("SUSPENDED")).toEqual(["ACTIVE", "CLOSED"]);
    expect(statusChoices("MERGED")).toEqual(["SUSPENDED", "ACTIVE", "CLOSED"]);
  });

  it("needs a reason to suspend or close, none to reactivate", () => {
    expect(statusState("SUSPENDED", "", 10)).toEqual({ canApply: false, note: "Type a reason to continue." });
    expect(statusState("SUSPENDED", "card lost", 10)).toEqual({ canApply: true, note: "" });
    expect(statusState("ACTIVE", "", 10)).toEqual({ canApply: true, note: "The wallet earns and redeems again from now." });
    expect(statusState("CLOSED", "", 10)).toEqual({
      canApply: false,
      note: "Closing a wallet that holds points writes them off first.",
    });
    expect(needsWriteOff("CLOSED", 10)).toBe(true);
    expect(needsWriteOff("CLOSED", 0)).toBe(false);
  });

  it("posts the reason only when typed, and force with the approver", () => {
    expect(statusBody({ companyId: "C", memberId: "M", status: "ACTIVE", reason: " ", force: false, userId: "U" })).toEqual({
      companyId: "C",
      memberId: "M",
      status: "ACTIVE",
    });
    expect(statusBody({ companyId: "C", memberId: "M", status: "CLOSED", reason: "left", force: true, userId: "U" })).toEqual({
      companyId: "C",
      memberId: "M",
      status: "CLOSED",
      reason: "left",
      force: true,
      approvedBy: "U",
    });
  });
});

describe("Adjust points… (Qt LoyaltyAdjustDialog)", () => {
  it("takes a signed whole number", () => {
    expect(cleanPoints("+50")).toBe("+50");
    expect(cleanPoints("-5.5x")).toBe("-55");
    expect(cleanPoints("123456789")).toBe("12345678");
  });

  it("refuses zero, a missing reason and a deduction past the redeemable points", () => {
    expect(adjustState("", "", 100, 80)).toEqual({ points: 0, canApply: false, note: "Type the points to add (+) or take off (−)." });
    expect(adjustState("-90", "fix", 100, 80)).toMatchObject({
      canApply: false,
      note: "Only 80 points are redeemable — a larger deduction is refused.",
    });
    expect(adjustState("50", "", 100, 80)).toMatchObject({
      canApply: false,
      note: "Balance after: 150 pts.  Type a reason to continue.",
    });
    expect(adjustState("-80", "fix", 100, 80)).toEqual({ points: -80, canApply: true, note: "Balance after: 20 pts." });
  });

  it("books at the session's branch, else the member's", () => {
    const base = { companyId: "C", memberId: "M", points: 50, reason: " goodwill ", userId: "U" };
    expect(adjustBody({ ...base, sessionBranchId: "B1", memberBranchId: "B2" })).toEqual({
      companyId: "C",
      branchId: "B1",
      memberId: "M",
      points: 50,
      reason: "goodwill",
      approvedBy: "U",
    });
    expect(adjustBody({ ...base, sessionBranchId: null, memberBranchId: "B2" }).branchId).toBe("B2");
  });
});
