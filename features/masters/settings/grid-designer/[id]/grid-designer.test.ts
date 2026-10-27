import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVICE_TYPE,
  INITIAL_FORM,
  buildGridColumnRequest,
  compareGridColumnsByPosition,
  createBlankForm,
  createColumnDraft,
  mapGridColumnPayloadToRow,
  normalizeAlignment,
  normalizeGridDeviceType,
  normalizeSortOrder,
  resequenceColumns,
  resolveColorPickerValue,
  toNullableNumber,
  toNullableString,
} from "./grid-designer";
import type { GridColumnPayload } from "./type";

function payload(overrides: Partial<GridColumnPayload> = {}): GridColumnPayload {
  return {
    grid_column_id: "7",
    grid_id: "3",
    grid_column_number: 2,
    grid_column_name: "Item",
    grid_column_width: 120,
    grid_column_position: 4,
    grid_column_alignment: "right",
    grid_column_visibility: true,
    grid_column_filter: true,
    grid_column_condition: "qty > 0",
    grid_column_condition_color: "#ff0000",
    grid_column_group: true,
    grid_column_total: true,
    grid_column_data_type: "Number",
    grid_column_color: "#00ff00",
    grid_column_notes: "note",
    grid_column_sql_field_name: "item_name",
    grid_column_is_deleted: false,
    ...overrides,
  };
}

describe("grid designer defaults", () => {
  it("starts a blank form as an active desktop grid sorted ascending", () => {
    expect(createBlankForm()).toEqual({
      gridId: "",
      gridName: "",
      gridDescription: "",
      sortColumn: "",
      sortOrder: "Ascending",
      gridSql: "",
      gridStatus: true,
      gridDeviceType: "desktop",
    });
    expect(createBlankForm()).toEqual(INITIAL_FORM);
    expect(DEFAULT_DEVICE_TYPE).toBe("desktop");
  });

  it("hands out a fresh blank form each time", () => {
    expect(createBlankForm()).not.toBe(createBlankForm());
  });

  it("creates a visible left-aligned text column positioned at its number", () => {
    const column = createColumnDraft(3);
    expect(column).toMatchObject({
      gridColumnId: null,
      columnNumber: 3,
      columnName: "",
      sqlFieldName: "",
      width: "",
      position: "3",
      alignment: "Left",
      visible: true,
      filter: false,
      grouping: false,
      total: false,
      dataType: "Text",
    });
  });

  it("gives every draft column its own local id", () => {
    expect(createColumnDraft(1).id).not.toBe(createColumnDraft(1).id);
  });

  it("lets overrides replace draft defaults", () => {
    const column = createColumnDraft(1, { columnName: "Qty", visible: false });
    expect(column.columnName).toBe("Qty");
    expect(column.visible).toBe(false);
  });
});

describe("grid designer normalisers", () => {
  it("reads sort order case-insensitively and short forms", () => {
    expect(normalizeSortOrder("Descending")).toBe("Descending");
    expect(normalizeSortOrder(" DESC ")).toBe("Descending");
    expect(normalizeSortOrder("asc")).toBe("Ascending");
  });

  it("falls back to ascending for blank, null or unknown sort order", () => {
    expect(normalizeSortOrder(null)).toBe("Ascending");
    expect(normalizeSortOrder(undefined)).toBe("Ascending");
    expect(normalizeSortOrder("")).toBe("Ascending");
    expect(normalizeSortOrder("sideways")).toBe("Ascending");
  });

  it("reads alignment case-insensitively", () => {
    expect(normalizeAlignment("CENTER")).toBe("Center");
    expect(normalizeAlignment(" right ")).toBe("Right");
    expect(normalizeAlignment("left")).toBe("Left");
  });

  it("falls back to left alignment for blank or unknown values", () => {
    expect(normalizeAlignment(null)).toBe("Left");
    expect(normalizeAlignment(undefined)).toBe("Left");
    expect(normalizeAlignment("justify")).toBe("Left");
  });

  it("accepts only the three known device types", () => {
    expect(normalizeGridDeviceType("web")).toBe("web");
    expect(normalizeGridDeviceType("mobile")).toBe("mobile");
    expect(normalizeGridDeviceType("desktop")).toBe("desktop");
  });

  it("falls back to desktop for a missing or unrecognised device type", () => {
    expect(normalizeGridDeviceType(null)).toBe("desktop");
    expect(normalizeGridDeviceType(undefined)).toBe("desktop");
    expect(normalizeGridDeviceType("Web")).toBe("desktop");
    expect(normalizeGridDeviceType("tablet")).toBe("desktop");
  });
});

describe("grid designer value helpers", () => {
  it("turns blank or whitespace text into null and trims the rest", () => {
    expect(toNullableString("")).toBeNull();
    expect(toNullableString("   ")).toBeNull();
    expect(toNullableString("  abc ")).toBe("abc");
  });

  it("parses numbers and turns blank or non-numeric text into null", () => {
    expect(toNullableNumber(" 12.5 ")).toBe(12.5);
    expect(toNullableNumber("0")).toBe(0);
    expect(toNullableNumber("")).toBeNull();
    expect(toNullableNumber("   ")).toBeNull();
    expect(toNullableNumber("abc")).toBeNull();
    expect(toNullableNumber("Infinity")).toBeNull();
  });

  it("renumbers columns from 1 in their current order without touching other fields", () => {
    const columns = [
      createColumnDraft(5, { columnName: "A" }),
      createColumnDraft(9, { columnName: "B" }),
    ];
    const result = resequenceColumns(columns);
    expect(result.map((c) => c.columnNumber)).toEqual([1, 2]);
    expect(result.map((c) => c.columnName)).toEqual(["A", "B"]);
    expect(columns[0].columnNumber).toBe(5);
  });

  it("resequences an empty list to an empty list", () => {
    expect(resequenceColumns([])).toEqual([]);
  });

  it("keeps a valid six digit colour as is", () => {
    expect(resolveColorPickerValue("#A1b2C3")).toBe("#A1b2C3");
    expect(resolveColorPickerValue("  #123456 ")).toBe("#123456");
  });

  it("expands a three digit colour to six digits", () => {
    expect(resolveColorPickerValue("#abc")).toBe("#aabbcc");
  });

  it("shows black for blank or malformed colours", () => {
    expect(resolveColorPickerValue("")).toBe("#000000");
    expect(resolveColorPickerValue("red")).toBe("#000000");
    expect(resolveColorPickerValue("#12")).toBe("#000000");
    expect(resolveColorPickerValue("#12345g")).toBe("#000000");
    expect(resolveColorPickerValue("abcdef")).toBe("#000000");
  });
});

describe("grid column ordering", () => {
  const col = (number: number, position: number | null) =>
    payload({ grid_column_number: number, grid_column_position: position });

  it("orders by position first", () => {
    const sorted = [col(1, 3), col(2, 1), col(3, 2)].sort(compareGridColumnsByPosition);
    expect(sorted.map((c) => c.grid_column_number)).toEqual([2, 3, 1]);
  });

  it("uses the column number when a position is missing", () => {
    const sorted = [col(5, null), col(2, null), col(3, 4)].sort(compareGridColumnsByPosition);
    expect(sorted.map((c) => c.grid_column_number)).toEqual([2, 3, 5]);
  });

  it("breaks position ties by column number", () => {
    const sorted = [col(4, 1), col(2, 1), col(3, 1)].sort(compareGridColumnsByPosition);
    expect(sorted.map((c) => c.grid_column_number)).toEqual([2, 3, 4]);
  });

  it("treats a zero position as a real position", () => {
    const sorted = [col(1, 5), col(2, 0)].sort(compareGridColumnsByPosition);
    expect(sorted.map((c) => c.grid_column_number)).toEqual([2, 1]);
  });
});

describe("mapping a server column to an editor row", () => {
  it("copies every field across and formats numbers as text", () => {
    const row = mapGridColumnPayloadToRow(payload());
    expect(row).toMatchObject({
      gridColumnId: "7",
      columnNumber: 2,
      columnName: "Item",
      sqlFieldName: "item_name",
      width: "120",
      position: "4",
      alignment: "Right",
      visible: true,
      filter: true,
      condition: "qty > 0",
      conditionColor: "#ff0000",
      grouping: true,
      total: true,
      dataType: "Number",
      columnColor: "#00ff00",
      notes: "note",
    });
    expect(row.id).toMatch(/^column-/);
  });

  it("turns null server fields into blank text", () => {
    const row = mapGridColumnPayloadToRow(
      payload({
        grid_column_width: null,
        grid_column_position: null,
        grid_column_alignment: null,
        grid_column_condition: null,
        grid_column_condition_color: null,
        grid_column_data_type: null,
        grid_column_color: null,
        grid_column_notes: null,
        grid_column_sql_field_name: null,
      }),
    );
    expect(row).toMatchObject({
      width: "",
      position: "",
      alignment: "Left",
      condition: "",
      conditionColor: "",
      dataType: "",
      columnColor: "",
      notes: "",
      sqlFieldName: "",
    });
  });

  it("keeps a zero width rather than blanking it", () => {
    expect(mapGridColumnPayloadToRow(payload({ grid_column_width: 0 })).width).toBe("0");
  });
});

describe("building a column save request", () => {
  it("renumbers by row index and trims text", () => {
    const row = createColumnDraft(9, {
      columnName: "  Item  ",
      sqlFieldName: " item_name ",
      width: " 90 ",
      position: "3",
      alignment: "Center",
      condition: " x > 1 ",
      conditionColor: " #fff ",
      dataType: " Text ",
      columnColor: " #000 ",
      notes: " hi ",
      grouping: true,
      total: true,
      filter: true,
    });
    expect(buildGridColumnRequest(row, 0)).toEqual({
      grid_column_number: 1,
      grid_column_name: "Item",
      grid_column_width: 90,
      grid_column_position: 3,
      grid_column_alignment: "Center",
      grid_column_visibility: true,
      grid_column_filter: true,
      grid_column_condition: "x > 1",
      grid_column_condition_color: "#fff",
      grid_column_group: true,
      grid_column_total: true,
      grid_column_data_type: "Text",
      grid_column_color: "#000",
      grid_column_notes: "hi",
      grid_column_sql_field_name: "item_name",
    });
  });

  it("names a blank column after its one-based row", () => {
    expect(buildGridColumnRequest(createColumnDraft(1), 2).grid_column_name).toBe("Column 3");
    expect(
      buildGridColumnRequest(createColumnDraft(1, { columnName: "   " }), 0).grid_column_name,
    ).toBe("Column 1");
  });

  it("sends the saved id only for a column that already exists", () => {
    const saved = createColumnDraft(1, { gridColumnId: "42" });
    expect(buildGridColumnRequest(saved, 0).grid_column_id).toBe("42");
    expect("grid_column_id" in buildGridColumnRequest(createColumnDraft(1), 0)).toBe(false);
  });

  it("sends null for blank optional fields and unparsable numbers", () => {
    const request = buildGridColumnRequest(
      createColumnDraft(1, { width: "wide", position: "", dataType: " " }),
      0,
    );
    expect(request).toMatchObject({
      grid_column_width: null,
      grid_column_position: null,
      grid_column_condition: null,
      grid_column_condition_color: null,
      grid_column_data_type: null,
      grid_column_color: null,
      grid_column_notes: null,
      grid_column_sql_field_name: null,
    });
  });

  it("round-trips a server column back to the same request", () => {
    const original = payload();
    const request = buildGridColumnRequest(mapGridColumnPayloadToRow(original), 1);
    expect(request).toMatchObject({
      grid_column_id: "7",
      grid_column_number: 2,
      grid_column_name: "Item",
      grid_column_width: 120,
      grid_column_position: 4,
      grid_column_alignment: "Right",
      grid_column_sql_field_name: "item_name",
    });
  });
});
