import { describe, expect, it } from "vitest";
import {
  canCancelRow,
  docKeyOfRow,
  presetLabel,
  presetRange,
  rowHint,
  rowPolicy,
} from "./physical-stock.list";

describe("presetRange — TxnMainView's period presets", () => {
  // 2026-10-02 is a Friday.
  const today = "2026-10-02";

  it("anchors every preset on today", () => {
    expect(presetRange("today", 30, today)).toEqual({ from: today, to: today });
    expect(presetRange("yesterday", 30, today)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(presetRange("thisWeek", 30, today)).toEqual({ from: "2026-09-28", to: today });
    expect(presetRange("thisMonth", 30, today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("thisQuarter", 30, today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("thisYear", 30, today)).toEqual({ from: "2026-01-01", to: today });
  });

  it("'Last 30 days' includes today, so it starts 29 days back", () => {
    expect(presetRange("lastNDays", 30, today)).toEqual({ from: "2026-09-03", to: today });
    expect(presetLabel("lastNDays", 30)).toBe("Last 30 days");
  });

  it("a Sunday's week starts the Monday before it", () => {
    expect(presetRange("thisWeek", 30, "2026-10-04")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("Custom computes nothing", () => {
    expect(presetRange("custom", 30, today)).toBeNull();
  });
});

describe("rowPolicy — physicalStockRowPolicy", () => {
  it("never deletes and never prints", () => {
    const policy = rowPolicy({ svh_status: "DRAFT" });
    expect(policy.canDelete).toBe(false);
    expect(policy.canPrint).toBe(false);
    expect(policy.canEdit).toBe(true);
    expect(policy.reason).toBe("");
  });

  it("a POSTED or CANCELLED sheet does not open for change, and says why", () => {
    expect(rowPolicy({ svh_status: "POSTED" })).toMatchObject({
      canEdit: false,
      reason: "Posted — the variance has moved stock. Cancel it to reverse.",
    });
    expect(rowPolicy({ svh_status: "cancelled" }).canEdit).toBe(false);
    expect(rowHint({ svh_status: "POSTED" })).toBe(
      "Posted — the variance has moved stock. Cancel it to reverse.  Enter opens it read-only.",
    );
  });

  it("warns about a DRAFT holding its godown frozen — without blocking it", () => {
    const policy = rowPolicy({ svh_status: "DRAFT", svh_freeze_stock: true });
    expect(policy.canEdit).toBe(true);
    expect(policy.reason).toMatch(/^Draft with the godown FROZEN/);
    expect(rowHint({ svh_status: "DRAFT", svh_freeze_stock: "t" })).toMatch(/FROZEN/);
  });
});

describe("rows", () => {
  it("Cancel is live on DRAFT and POSTED only", () => {
    expect(canCancelRow({ svh_status: "DRAFT" })).toBe(true);
    expect(canCancelRow({ svh_status: "POSTED" })).toBe(true);
    expect(canCancelRow({ svh_status: "CANCELLED" })).toBe(false);
    expect(canCancelRow(null)).toBe(false);
  });

  it("a row carries its own tenant and year", () => {
    expect(
      docKeyOfRow({
        svh_id: "s",
        svh_company_id: "c",
        svh_branch_id: "b",
        svh_acc_year: "2026-2027",
      }),
    ).toEqual({ svhId: "s", companyId: "c", branchId: "b", accYear: "2026-2027" });
  });
});
