import { describe, expect, it } from "vitest";
import { COL } from "./branch-inward.constants";
import { resolveColumns } from "./branch-inward.columns";
import { KEY_SHEET } from "./branch-inward.keys";

describe("resolveColumns", () => {
  it("shows the seeded layout in order, without the row number and the unload rate", () => {
    const columns = resolveColumns(undefined, { unloading: false, asKeyed: false });
    expect(columns.map((c) => c.no)).toEqual([COL.Item, COL.Batch, COL.Sent, COL.Received, COL.Remaining, COL.Qty, COL.Bucket, COL.PostNote]);
    expect(columns.reduce((sum, c) => sum + c.widthPct, 0)).toBeCloseTo(100);
  });

  it("ticking Unloading brings the rate column in", () => {
    expect(resolveColumns(undefined, { unloading: true, asKeyed: false }).map((c) => c.no)).toContain(COL.UnloadRate);
  });

  it("a receipt opened as keyed drops the despatch's figures", () => {
    const nos = resolveColumns(undefined, { unloading: true, asKeyed: true }).map((c) => c.no);
    expect(nos).toEqual([COL.Item, COL.Batch, COL.Qty, COL.Bucket, COL.UnloadRate]);
  });

  it("the layout's titles and visibility win", () => {
    const columns = resolveColumns(
      [
        { uiTblClmId: "a", uiTblClmNo: "1", uiTblClmName: "Article", uiTblClmColumnWidth: 30, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 1, uiTblClmColumnNecessity: false },
        { uiTblClmId: "b", uiTblClmNo: "2", uiTblClmName: "Batch", uiTblClmColumnWidth: 10, uiTblClmColumnVisibility: false, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 2, uiTblClmColumnNecessity: false },
      ],
      { unloading: false, asKeyed: false },
    );
    expect(columns[0].header).toBe("Article");
    expect(columns.map((c) => c.no)).not.toContain(COL.Batch);
  });
});

describe("key sheet", () => {
  it("lists the keys the Qt screen binds, and the worklist's own", () => {
    expect(KEY_SHEET.document.map((row) => row.label)).toEqual([
      "New / Clear",
      "Save Draft",
      "Save & Post",
      "Edit",
      "History",
      "List / Open",
      "Close",
    ]);
    expect(KEY_SHEET.lines.map((row) => row.keyText)).toContain("F5");
  });
});
