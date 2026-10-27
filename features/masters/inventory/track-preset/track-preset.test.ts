import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  detailRowOf,
  formValuesFromRow,
  initialValues,
  isSharedRow,
  listGridParams,
  noteLines,
  toggleBody,
  usedByOf,
} from "./track-preset";

describe("tracking preset", () => {
  it("sends both grid tokens, always", () => {
    expect(listGridParams(false, "c1")).toEqual({ wantdelete: false, ispt_is_deleted: "false", ispt_company_id: "c1" });
    expect(listGridParams(true, "c1").ispt_is_deleted).toBe("true");
  });

  it("tells a shared preset from the list's Scope or a /get company", () => {
    expect(isSharedRow({ spt_scope: "Shared" })).toBe(true);
    expect(isSharedRow({ spt_scope: "Own" })).toBe(false);
    expect(isSharedRow({ spt_company_id: null })).toBe(true);
    expect(isSharedRow({ spt_company_id: "c1" })).toBe(false);
    expect(isSharedRow(null)).toBe(false);
  });

  it("fills the form from /get, a blank shelf life staying blank", () => {
    const v = formValuesFromRow({
      spt_code: "DAIRY",
      spt_name: "Dairy",
      spt_track_batch: true,
      spt_track_expiry: true,
      spt_issue_strategy: "FEFO",
      spt_shelf_life_days: null,
      spt_near_expiry_days: 7,
      spt_sort_order: 20,
    });
    expect(v.spt_track_batch).toBe("true");
    expect(v.spt_track_mrp).toBe("false");
    expect(v.spt_shelf_life_days).toBe("");
    expect(v.spt_near_expiry_days).toBe("7");
    expect(v.spt_allow_negative).toBe("ALLOW");
  });

  it("derives the valuation and nulls the blanks", () => {
    const plain = buildSavePayload({ ...initialValues(), spt_code: " dairy ", spt_name: "  Fresh   dairy " }, { companyId: "c1", sptId: null });
    expect(plain).toMatchObject({
      companyId: "c1",
      code: "DAIRY",
      name: "Fresh dairy",
      valuationMethod: "WAVG",
      shelfLifeDays: null,
      nearExpiryDays: 30,
      description: null,
      remarks: null,
    });
    expect("sptId" in plain).toBe(false);
    const lots = buildSavePayload({ ...initialValues(), spt_track_batch: "true", spt_shelf_life_days: "180" }, { companyId: "c1", sptId: "p1" });
    expect(lots).toMatchObject({ sptId: "p1", valuationMethod: "LOT_ACTUAL", trackBatch: true, shelfLifeDays: 180 });
  });

  it("explains the rules before Save", () => {
    const lines = noteLines({ ...initialValues(), spt_track_expiry: "true" }, { editingUsed: 0 });
    expect(lines[0]).toMatch(/LOT_ACTUAL/);
    expect(lines).toContain("⚠ Expiry is tracked per batch — tick Batch too.");
    const fefo = noteLines({ ...initialValues(), spt_track_batch: "true", spt_issue_strategy: "FEFO" }, { editingUsed: 3 });
    expect(fefo).toContain("⚠ First-expiry-first-out needs Expiry tracked.");
    expect(fefo[fefo.length - 1]).toMatch(/Used by 3 item/);
    expect(noteLines(initialValues(), { editingUsed: 0 })).toHaveLength(1);
  });

  it("counts users and builds the toggle body", () => {
    expect(usedByOf({ usedByItems: 2, usedByGroups: 1 })).toBe(3);
    expect(toggleBody("c", "p", false)).toEqual({ companyId: "c", sptId: "p" });
    expect(toggleBody("c", "p", true)).toEqual({ companyId: "c", sptId: "p", reactivate: true });
  });

  it("finds the one row whatever the shell hands over", () => {
    const row = { spt_id: "p1", spt_code: "X" };
    expect(detailRowOf([row])).toBe(row);
    expect(detailRowOf({ data: [row] })).toBe(row);
    expect(detailRowOf(row)).toBe(row);
    expect(detailRowOf(null)).toBeNull();
    expect(detailRowOf([])).toBeNull();
  });
});
