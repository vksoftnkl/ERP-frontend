import { describe, expect, it } from "vitest";
import {
  INITIAL_FORM,
  buildDropdownColumnRequest,
  createBlankForm,
  createColumnDraft,
  cx,
  formatNullableNumber,
  mapDropdownColumnPayloadToRow,
  normalizeAlignment,
  normalizeSortOrder,
  resequenceColumns,
  toNullableNumber,
  toNullablePositiveInteger,
  toNullableString,
  toPositiveInteger,
} from "./dropdown-designer";
import type { DropdownColumnPayload } from "./type";

function payload(overrides: Partial<DropdownColumnPayload> = {}): DropdownColumnPayload {
  return {
    dropdown_columns_id: "11",
    dropdown_columns_dropdown_id: "5",
    dropdown_columns_no: 2,
    dropdown_columns_data_type: "Number",
    dropdown_columns_name: "Code",
    dropdown_columns_alias: "item_code",
    dropdown_columns_width: 80,
    dropdown_columns_visiblity: true,
    dropdown_columns_allignment: "right",
    dropdown_columns_filter: true,
    dropdown_columns_sql_name: "code",
    ...overrides,
  };
}

describe("dropdown designer defaults", () => {
  it("starts a blank form sorted ascending, showing the header, ten items tall", () => {
    expect(createBlankForm()).toEqual({
      dropdownId: "",
      dropdownName: "",
      dropdownDescription: "",
      sortColumn: "",
      sortOrder: "ASC",
      dropdownCompletion: "",
      dropdownSql: "",
      dropdownSqlRegional: "",
      maxVisibleItems: "10",
      showHeader: true,
      dropdownWidth: "",
    });
    expect(createBlankForm()).toEqual(INITIAL_FORM);
    expect(createBlankForm()).not.toBe(createBlankForm());
  });

  it("creates a visible left-aligned text column with no alias", () => {
    expect(createColumnDraft(4)).toMatchObject({
      serialId: null,
      columnNumber: 4,
      columnName: "",
      columnAlias: "",
      sqlName: "",
      dataType: "Text",
      width: "",
      alignment: "Left",
      visible: true,
      filter: false,
    });
  });

  it("gives every draft column its own local id and honours overrides", () => {
    const a = createColumnDraft(1, { columnName: "Name", filter: true });
    expect(a.id).toMatch(/^dropdown-column-/);
    expect(a.id).not.toBe(createColumnDraft(1).id);
    expect(a.columnName).toBe("Name");
    expect(a.filter).toBe(true);
  });
});

describe("dropdown designer normalisers", () => {
  it("reads sort order case-insensitively and in long form", () => {
    expect(normalizeSortOrder("DESC")).toBe("DESC");
    expect(normalizeSortOrder(" Descending ")).toBe("DESC");
    expect(normalizeSortOrder("asc")).toBe("ASC");
  });

  it("falls back to ASC for blank, null or unknown sort order", () => {
    expect(normalizeSortOrder(null)).toBe("ASC");
    expect(normalizeSortOrder(undefined)).toBe("ASC");
    expect(normalizeSortOrder("")).toBe("ASC");
    expect(normalizeSortOrder("up")).toBe("ASC");
  });

  it("reads alignment case-insensitively and falls back to left", () => {
    expect(normalizeAlignment("CENTER")).toBe("Center");
    expect(normalizeAlignment(" Right ")).toBe("Right");
    expect(normalizeAlignment(null)).toBe("Left");
    expect(normalizeAlignment("justify")).toBe("Left");
  });
});

describe("dropdown designer value helpers", () => {
  it("joins only the truthy class tokens", () => {
    expect(cx("a", undefined, false, "b")).toBe("a b");
    expect(cx()).toBe("");
    expect(cx(false, undefined)).toBe("");
  });

  it("turns blank text into null and trims the rest", () => {
    expect(toNullableString("  ")).toBeNull();
    expect(toNullableString(" x ")).toBe("x");
  });

  it("parses numbers and nulls blank or non-numeric text", () => {
    expect(toNullableNumber(" 7.5 ")).toBe(7.5);
    expect(toNullableNumber("0")).toBe(0);
    expect(toNullableNumber("")).toBeNull();
    expect(toNullableNumber("abc")).toBeNull();
  });

  it("accepts only whole numbers above zero as positive integers", () => {
    expect(toPositiveInteger(" 12 ")).toBe(12);
    expect(toPositiveInteger("")).toBeUndefined();
    expect(toPositiveInteger("   ")).toBeUndefined();
    expect(toPositiveInteger("0")).toBeUndefined();
    expect(toPositiveInteger("-3")).toBeUndefined();
    expect(toPositiveInteger("2.5")).toBeUndefined();
    expect(toPositiveInteger("ten")).toBeUndefined();
  });

  it("gives null instead of undefined for an invalid nullable positive integer", () => {
    expect(toNullablePositiveInteger("15")).toBe(15);
    expect(toNullablePositiveInteger("")).toBeNull();
    expect(toNullablePositiveInteger("0")).toBeNull();
    expect(toNullablePositiveInteger("1.5")).toBeNull();
  });

  it("formats a nullable number as text", () => {
    expect(formatNullableNumber(null)).toBe("");
    expect(formatNullableNumber(0)).toBe("0");
    expect(formatNullableNumber(240)).toBe("240");
  });

  it("renumbers columns from 1 without mutating the input", () => {
    const columns = [createColumnDraft(7, { columnName: "A" }), createColumnDraft(3, { columnName: "B" })];
    const result = resequenceColumns(columns);
    expect(result.map((c) => c.columnNumber)).toEqual([1, 2]);
    expect(result.map((c) => c.columnName)).toEqual(["A", "B"]);
    expect(columns[0].columnNumber).toBe(7);
    expect(resequenceColumns([])).toEqual([]);
  });
});

describe("mapping a server dropdown column to an editor row", () => {
  it("copies fields across and formats width as text", () => {
    const row = mapDropdownColumnPayloadToRow(payload());
    expect(row).toMatchObject({
      serialId: "11",
      columnNumber: 2,
      columnName: "Code",
      columnAlias: "item_code",
      sqlName: "code",
      dataType: "Number",
      width: "80",
      alignment: "Right",
      visible: true,
      filter: true,
    });
    expect(row.id).toMatch(/^dropdown-column-/);
  });

  it("turns null alias, sql name, width and alignment into blanks and left", () => {
    const row = mapDropdownColumnPayloadToRow(
      payload({
        dropdown_columns_alias: null,
        dropdown_columns_sql_name: null,
        dropdown_columns_width: null,
        dropdown_columns_allignment: null,
      }),
    );
    expect(row).toMatchObject({ columnAlias: "", sqlName: "", width: "", alignment: "Left" });
  });
});

describe("building a dropdown column save request", () => {
  it("renumbers by row index and trims text", () => {
    const row = createColumnDraft(9, {
      columnName: " Code ",
      columnAlias: " c ",
      sqlName: " code ",
      dataType: " Number ",
      width: " 75 ",
      alignment: "Center",
      visible: false,
      filter: true,
    });
    expect(buildDropdownColumnRequest(row, 0)).toEqual({
      dropdown_columns_no: 1,
      dropdown_columns_data_type: "Number",
      dropdown_columns_name: "Code",
      dropdown_columns_alias: "c",
      dropdown_columns_sql_name: "code",
      dropdown_columns_width: 75,
      dropdown_columns_visiblity: false,
      dropdown_columns_allignment: "Center",
      dropdown_columns_filter: true,
    });
  });

  it("defaults a blank data type to Text and a blank name to its row number", () => {
    const request = buildDropdownColumnRequest(
      createColumnDraft(1, { dataType: "  ", columnName: " " }),
      3,
    );
    expect(request.dropdown_columns_data_type).toBe("Text");
    expect(request.dropdown_columns_name).toBe("Column 4");
  });

  it("sends the serial id only for a saved column", () => {
    expect(
      buildDropdownColumnRequest(createColumnDraft(1, { serialId: "21" }), 0).dropdown_columns_id,
    ).toBe("21");
    expect("dropdown_columns_id" in buildDropdownColumnRequest(createColumnDraft(1), 0)).toBe(
      false,
    );
  });

  it("sends null for blank alias, sql name and unparsable width", () => {
    const request = buildDropdownColumnRequest(createColumnDraft(1, { width: "wide" }), 0);
    expect(request).toMatchObject({
      dropdown_columns_alias: null,
      dropdown_columns_sql_name: null,
      dropdown_columns_width: null,
    });
  });

  it("round-trips a server column back to an equivalent request", () => {
    const request = buildDropdownColumnRequest(mapDropdownColumnPayloadToRow(payload()), 1);
    expect(request).toMatchObject({
      dropdown_columns_id: "11",
      dropdown_columns_no: 2,
      dropdown_columns_data_type: "Number",
      dropdown_columns_name: "Code",
      dropdown_columns_alias: "item_code",
      dropdown_columns_sql_name: "code",
      dropdown_columns_width: 80,
      dropdown_columns_allignment: "Right",
    });
  });
});
