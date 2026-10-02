import { describe, expect, it } from "vitest";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import {
  canCancelRow,
  cancelConsequence,
  cancelledMessage,
  docKeyOfRow,
  listGridParams,
  NO_TENANT_ID,
  periodLabel,
  presetRange,
  rowHint,
  rowPolicy,
} from "./opening-stock.list";
import { DEFAULT_OPENING_STOCK_SETTINGS, parseOpeningStockSettings } from "./opening-stock.settings";

describe("period presets", () => {
  // 2026-10-02 is a Friday.
  const today = "2026-10-02";

  it("compute TxnMainView's ranges", () => {
    expect(presetRange("today", today)).toEqual({ from: today, to: today });
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(presetRange("thisWeek", today)).toEqual({ from: "2026-09-28", to: today });
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("lastNDays", today, 30)).toEqual({ from: "2026-09-03", to: today });
    expect(presetRange("thisQuarter", today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: today });
    expect(presetRange("custom", today)).toBeNull();
  });

  it("name the N-day preset after the descriptor's window", () => {
    expect(periodLabel("lastNDays", 30)).toBe("Last 30 days");
  });
});

describe("grid 99's tokens", () => {
  it("are all sent, every time, with blanks for no filter", () => {
    expect(
      listGridParams({
        companyId: "",
        branchId: "b",
        accYear: "2026-2027",
        fromDate: "",
        toDate: "2026-10-02",
        status: "",
      }),
    ).toEqual({
      isvh_company_id: NO_TENANT_ID,
      isvh_branch_id: "b",
      isvh_acc_year: "2026-2027",
      isvh_from_date: "",
      isvh_to_date: "2026-10-02",
      isvh_status: "",
    });
  });
});

describe("the row policy", () => {
  it("opens only a DRAFT for change, and says why not otherwise", () => {
    expect(rowPolicy({ svh_status: "DRAFT" }).canEdit).toBe(true);
    expect(rowPolicy({ svh_status: "posted" })).toEqual({
      canEdit: false,
      reason: "Posted — stock has moved. Cancel it to reverse.",
    });
    expect(rowHint({ svh_status: "CANCELLED" })).toBe(
      "Cancelled — its reversal is part of the history.  Enter opens it read-only.",
    );
    expect(rowHint({ svh_status: "DRAFT" })).toBe("");
  });

  it("cancels a DRAFT or a POSTED voucher, never one already cancelled", () => {
    expect(canCancelRow({ svh_status: "DRAFT" })).toBe(true);
    expect(canCancelRow({ svh_status: "POSTED" })).toBe(true);
    expect(canCancelRow({ svh_status: "CANCELLED" })).toBe(false);
  });

  it("keys a row by its own tenant, falling back to the session's", () => {
    expect(
      docKeyOfRow(
        { svh_id: "s1", svh_company_id: "c1", svh_branch_id: "", svh_acc_year: "2025-2026 ", svh_refno: "OPN0001", svh_status: "posted" },
        { companyId: "c0", branchId: "b0", accYear: "2026-2027" },
      ),
    ).toEqual({
      svhId: "s1",
      companyId: "c1",
      branchId: "b0",
      accYear: "2025-2026",
      refno: "OPN0001",
      status: "POSTED",
    });
  });

  it("words a cancel by what the document is", () => {
    expect(cancelConsequence(true)).toContain("refused if the stock has since been sold");
    expect(cancelConsequence(false)).toContain("nothing to reverse");
    expect(cancelledMessage("OPN0001", false)).toBe(
      "OPN0001 cancelled. It was a draft, so no stock ever moved and nothing was reversed.",
    );
  });
});

describe("settings", () => {
  function row(key: string, value: string | null): EffectiveSetting {
    return { asdKey: key, value, asdDefaultValue: null } as EffectiveSetting;
  }

  it("opens on the list unless system.txn_entry_first says otherwise", () => {
    expect(parseOpeningStockSettings(undefined)).toEqual(DEFAULT_OPENING_STOCK_SETTINGS);
    expect(parseOpeningStockSettings([row("system.txn_entry_first", "true")]).txnEntryFirst).toBe(true);
    expect(parseOpeningStockSettings([row("system.txn_entry_first", "nonsense")]).txnEntryFirst).toBe(false);
  });
});
