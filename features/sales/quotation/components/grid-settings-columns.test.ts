import { describe, expect, it } from "vitest";
import { settingsColumnsFromLayout } from "./grid-settings";

describe("settingsColumnsFromLayout", () => {
  it("lists every layout row — hidden ones included — in the layout's order, titled from the layout or the fallback", () => {
    const columns = settingsColumnsFromLayout(
      [
        { uiTblClmId: "c2", uiTblClmNo: "2", uiTblClmName: "", uiTblClmColumnWidth: 5, uiTblClmColumnVisibility: false, uiTblClmColumnFocus: null, uiTblClmColumnPosition: 3, uiTblClmColumnNecessity: true },
        { uiTblClmId: "c1", uiTblClmNo: "1", uiTblClmName: " Item ", uiTblClmColumnWidth: 9, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: true, uiTblClmColumnPosition: 1, uiTblClmColumnNecessity: false },
        { uiTblClmId: "", uiTblClmNo: "7", uiTblClmName: null, uiTblClmColumnWidth: null, uiTblClmColumnVisibility: null, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 2, uiTblClmColumnNecessity: false },
      ],
      { 2: "Qty" },
    );
    expect(columns).toEqual([
      { key: "1", header: "Item", visible: true, focus: true, necessity: false, position: 1, columnId: "c1" },
      { key: "7", header: "Column 7", visible: true, focus: false, necessity: false, position: 2, columnId: null },
      { key: "2", header: "Qty", visible: false, focus: false, necessity: true, position: 3, columnId: "c2" },
    ]);
  });

  it("is empty without a layout", () => {
    expect(settingsColumnsFromLayout(undefined)).toEqual([]);
  });
});
