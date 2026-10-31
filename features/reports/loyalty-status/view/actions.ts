/**
 * The two writing actions on the Members tab (menu 79's edit right) — Qt
 * `LoyaltyMemberStatusDialog` / `LoyaltyAdjustDialog` and the bodies
 * `changeStatus()` / `adjustPoints()` post. The approver is the signed-in
 * user; the server judges the rights and refuses with a code.
 */
import { pts } from "./format";
import type { MemberAdjustBody, MemberStatusBody, SettableStatus } from "../wire/types";

const SETTABLE: readonly SettableStatus[] = ["SUSPENDED", "ACTIVE", "CLOSED"];

/** The statuses the wallet can move to — never the one it is in; MERGED is not settable. */
export function statusChoices(current: string): SettableStatus[] {
  return SETTABLE.filter((s) => s !== current);
}

export const REASON_MAX = 250;

export function statusIntro(current: string, balance: number): string {
  return (
    `Now ${current} · balance ${pts(balance)} pts. A suspended wallet keeps its points but ` +
    "cannot earn or redeem until it is reactivated."
  );
}

/** Apply is live once a reason is typed (not needed to reactivate). */
export function statusState(status: SettableStatus, reason: string, balance: number): { canApply: boolean; note: string } {
  const needsReason = status !== "ACTIVE";
  const has = reason.trim() !== "";
  let note = "";
  if (status === "CLOSED" && balance !== 0) note = "Closing a wallet that holds points writes them off first.";
  else if (status === "ACTIVE") note = "The wallet earns and redeems again from now.";
  else if (needsReason && !has) note = "Type a reason to continue.";
  return { canApply: !needsReason || has, note };
}

/** CLOSED with a balance asks once, in words, then forces the write-off. */
export function needsWriteOff(status: SettableStatus, balance: number): boolean {
  return status === "CLOSED" && balance !== 0;
}

export function writeOffQuestion(balance: number): string {
  return (
    `The wallet still holds ${pts(balance)} points. Closing writes them off first — one ` +
    "adjustment per open lot, recorded with you as the approver. Continue?"
  );
}

export function statusBody(input: {
  companyId: string;
  memberId: string;
  status: SettableStatus;
  reason: string;
  force: boolean;
  userId: string;
}): MemberStatusBody {
  const body: MemberStatusBody = { companyId: input.companyId, memberId: input.memberId, status: input.status };
  const reason = input.reason.trim();
  if (reason) body.reason = reason;
  if (input.force) {
    body.force = true;
    body.approvedBy = input.userId;
  }
  return body;
}

/** Qt `QDoubleValidator(-99999999, 99999999, 0)`: an optional sign, then up to eight digits. */
export function cleanPoints(text: string): string {
  const match = /^([+-]?)(\d{0,8})/.exec(text.replace(/[^\d+-]/g, ""));
  return match ? `${match[1]}${match[2]}` : "";
}

export function pointsOf(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function adjustIntro(balance: number, redeemable: number): string {
  return (
    `Balance ${pts(balance)} pts · redeemable ${pts(redeemable)}.  A positive figure opens a lot ` +
    "that never lapses; a negative one is taken from the oldest lots first, up to the redeemable points."
  );
}

/** Adjust is live for a figure ≠ 0, a reason, and a deduction the redeemable points cover. */
export function adjustState(
  pointsText: string,
  reason: string,
  balance: number,
  redeemable: number,
): { points: number; canApply: boolean; note: string } {
  const p = pointsOf(pointsText);
  const overdraw = p < 0 && -p > redeemable;
  const has = reason.trim() !== "";
  let note: string;
  if (p === 0) note = "Type the points to add (+) or take off (−).";
  else if (overdraw) note = `Only ${pts(redeemable)} points are redeemable — a larger deduction is refused.`;
  else note = `Balance after: ${pts(balance + p)} pts.${has ? "" : "  Type a reason to continue."}`;
  return { points: p, canApply: p !== 0 && has && !overdraw, note };
}

/** The branch is the session's, else the member's home branch. */
export function adjustBody(input: {
  companyId: string;
  sessionBranchId: string | null;
  memberBranchId: string | null;
  memberId: string;
  points: number;
  reason: string;
  userId: string;
}): MemberAdjustBody {
  return {
    companyId: input.companyId,
    branchId: input.sessionBranchId || input.memberBranchId || "",
    memberId: input.memberId,
    points: input.points,
    reason: input.reason.trim(),
    approvedBy: input.userId,
  };
}
