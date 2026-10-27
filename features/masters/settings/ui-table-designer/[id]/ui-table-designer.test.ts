import { describe, expect, it } from "vitest";
import {
  buildSaveUiTableRequest,
  buildUiTableColumnRequest,
  clampPosition,
  createBlankForm,
  createColumnDraft,
  createLocalColumnId,
  extractUnknownMessage,
  getUiTableErrorInfo,
  getUiTblId,
  mapUiTableColumnPayloadToRow,
  moveColumn,
  moveColumnToPosition,
  parseColumnNumber,
  parseNullableIntegerInput,
  parseNullableNumberInput,
  resequenceColumns,
  toDisplayString,
  toNullableInteger,
  toNullableTrimmedString,
} from "./ui-table-designer";
import type {
  UiTableApiErrorDetail,
  UiTableColumnPayload,
  UiTableColumnRow,
  UiTableForm,
  UiTablePayload,
} from "./type";

function row(id: string, overrides: Partial<UiTableColumnRow> = {}): UiTableColumnRow {
  return createColumnDraft(1, { id, columnName: id.toUpperCase(), ...overrides });
}

function ids(columns: UiTableColumnRow[]): string[] {
  return columns.map((c) => c.id);
}

const FORM: UiTableForm = {
  uiTblId: "",
  uiTblName: "Quotation",
  uiTblDeviceType: "Desktop",
  uiTblEditable: true,
  uiTblIsActive: true,
};

function payloadColumn(overrides: Partial<UiTableColumnPayload> = {}): UiTableColumnPayload {
  return {
    uiTblClmId: "7",
    uiTblClmNo: "3",
    uiTblClmName: "Qty",
    uiTblClmTableId: "1",
    uiTblClmColumnWidth: 9.6,
    uiTblClmColumnVisibility: false,
    uiTblClmColumnFocus: true,
    uiTblClmColumnPosition: 4,
    uiTblClmColumnNecessity: true,
    uiTblClmNextColumn: 5,
    uiTblClmPreviousColumn: 2,
    uiTblClmIsActive: false,
    uiTblClmIsDeleted: false,
    uiTblClmSyncDate: null,
    uiTblClmCreatedOn: "",
    uiTblClmCreatedBy: null,
    uiTblClmModifiedOn: "",
    uiTblClmModifiedBy: null,
    ...overrides,
  };
}

describe("new column and form defaults", () => {
  it("starts a new column visible, active, 100 wide and positioned at its number", () => {
    const draft = createColumnDraft(4);
    expect(draft).toMatchObject({
      uiTblClmId: null,
      columnNumber: 4,
      columnName: "",
      width: "100",
      visible: true,
      focus: false,
      position: "4",
      necessity: false,
      nextColumn: "",
      previousColumn: "",
      isActive: true,
    });
  });

  it("lets overrides replace the defaults", () => {
    const draft = createColumnDraft(2, { width: "50", visible: false });
    expect(draft.width).toBe("50");
    expect(draft.visible).toBe(false);
    expect(draft.position).toBe("2");
  });

  it("gives every local column a distinct id", () => {
    expect(createLocalColumnId()).not.toBe(createLocalColumnId());
    expect(createColumnDraft(1).id).toMatch(/^ui-column-/);
  });

  it("starts a blank form active, not editable and unnamed", () => {
    expect(createBlankForm()).toEqual({
      uiTblId: "",
      uiTblName: "",
      uiTblDeviceType: "",
      uiTblEditable: false,
      uiTblIsActive: true,
    });
  });
});

describe("column ordering", () => {
  it("renumbers columns 1..n and keeps position in step", () => {
    const out = resequenceColumns([
      row("a", { columnNumber: 9, position: "9" }),
      row("b", { columnNumber: 9, position: "9" }),
    ]);
    expect(out.map((c) => [c.columnNumber, c.position])).toEqual([
      [1, "1"],
      [2, "2"],
    ]);
  });

  it("renumbers an empty list to an empty list", () => {
    expect(resequenceColumns([])).toEqual([]);
  });

  it("clamps a requested position into 1..total", () => {
    expect(clampPosition(0, 5)).toBe(1);
    expect(clampPosition(-3, 5)).toBe(1);
    expect(clampPosition(9, 5)).toBe(5);
    expect(clampPosition(3.9, 5)).toBe(3);
    expect(clampPosition(Number.NaN, 5)).toBe(1);
    expect(clampPosition(Number.POSITIVE_INFINITY, 5)).toBe(1);
    expect(clampPosition(2, 0)).toBe(1);
  });

  it("moves a dragged column before or after the target and renumbers", () => {
    const cols = [row("a"), row("b"), row("c"), row("d")];
    expect(ids(moveColumn(cols, "a", "c", "before"))).toEqual(["b", "a", "c", "d"]);
    expect(ids(moveColumn(cols, "a", "c", "after"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(moveColumn(cols, "d", "b", "before"))).toEqual(["a", "d", "b", "c"]);
    expect(ids(moveColumn(cols, "d", "b", "after"))).toEqual(["a", "b", "d", "c"]);
    expect(moveColumn(cols, "a", "c", "before").map((c) => c.position)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("returns the same list when a drag would change nothing", () => {
    const cols = [row("a"), row("b"), row("c")];
    expect(moveColumn(cols, "a", "a", "before")).toBe(cols);
    expect(moveColumn(cols, "a", "b", "before")).toBe(cols);
    expect(moveColumn(cols, "b", "a", "after")).toBe(cols);
    expect(moveColumn(cols, "x", "a", "before")).toBe(cols);
    expect(moveColumn(cols, "a", "x", "after")).toBe(cols);
  });

  it("does not mutate the input list", () => {
    const cols = [row("a"), row("b"), row("c")];
    moveColumn(cols, "a", "c", "after");
    expect(ids(cols)).toEqual(["a", "b", "c"]);
  });

  it("moves a column to a typed position", () => {
    const cols = [row("a"), row("b"), row("c")];
    expect(ids(moveColumnToPosition(cols, "a", 3))).toEqual(["b", "c", "a"]);
    expect(ids(moveColumnToPosition(cols, "c", 1))).toEqual(["c", "a", "b"]);
  });

  it("clamps a typed position past the end and leaves no-ops untouched", () => {
    const cols = [row("a"), row("b"), row("c")];
    expect(ids(moveColumnToPosition(cols, "a", 99))).toEqual(["b", "c", "a"]);
    expect(moveColumnToPosition(cols, "b", 2)).toBe(cols);
    expect(moveColumnToPosition(cols, "missing", 1)).toBe(cols);
    expect(moveColumnToPosition([], "a", 1)).toEqual([]);
  });
});

describe("small converters", () => {
  it("reads a blank or non-integer string as no integer", () => {
    expect(toNullableInteger("")).toBeNull();
    expect(toNullableInteger("   ")).toBeNull();
    expect(toNullableInteger("2.5")).toBeNull();
    expect(toNullableInteger("abc")).toBeNull();
    expect(toNullableInteger(" 12 ")).toBe(12);
    expect(toNullableInteger("-3")).toBe(-3);
  });

  it("shows null as blank and numbers as text", () => {
    expect(toDisplayString(null)).toBe("");
    expect(toDisplayString(0)).toBe("0");
    expect(toDisplayString(9.6)).toBe("9.6");
  });

  it("falls back unless the column number is a positive integer", () => {
    expect(parseColumnNumber("5", 1)).toBe(5);
    expect(parseColumnNumber("0", 7)).toBe(7);
    expect(parseColumnNumber("-2", 7)).toBe(7);
    expect(parseColumnNumber("1.5", 7)).toBe(7);
    expect(parseColumnNumber("", 7)).toBe(7);
    expect(parseColumnNumber("x", 7)).toBe(7);
  });

  it("trims text and turns blank into null", () => {
    expect(toNullableTrimmedString("  Desktop ")).toBe("Desktop");
    expect(toNullableTrimmedString("   ")).toBeNull();
    expect(toNullableTrimmedString("")).toBeNull();
  });

  it("trims the table id from a server payload", () => {
    expect(getUiTblId({ uiTblId: " 18 " } as UiTablePayload)).toBe("18");
  });
});

describe("number input parsing", () => {
  it("returns null with no error for blank input", () => {
    const errors: UiTableApiErrorDetail[] = [];
    expect(parseNullableNumberInput("f", "  ", errors)).toBeNull();
    expect(parseNullableIntegerInput("f", "", errors)).toBeNull();
    expect(errors).toEqual([]);
  });

  it("parses decimals as numbers and records an error for junk", () => {
    const errors: UiTableApiErrorDetail[] = [];
    expect(parseNullableNumberInput("w", " 9.6 ", errors)).toBe(9.6);
    expect(parseNullableNumberInput("w", "abc", errors)).toBeNull();
    expect(parseNullableNumberInput("w", "Infinity", errors)).toBeNull();
    expect(errors).toEqual([
      { field: "w", message: "w must be a number" },
      { field: "w", message: "w must be a number" },
    ]);
  });

  it("rejects a decimal where an integer is required", () => {
    const errors: UiTableApiErrorDetail[] = [];
    expect(parseNullableIntegerInput("p", "4", errors)).toBe(4);
    expect(parseNullableIntegerInput("p", "4.5", errors)).toBeNull();
    expect(errors).toEqual([{ field: "p", message: "p must be an integer" }]);
  });
});

describe("error messages from the server", () => {
  it("extracts text from strings, numbers, lists and nested objects", () => {
    expect(extractUnknownMessage("  boom ")).toBe("boom");
    expect(extractUnknownMessage(404)).toBe("404");
    expect(extractUnknownMessage(false)).toBe("false");
    expect(extractUnknownMessage(["a", "", "b"])).toBe("a, b");
    expect(extractUnknownMessage({ message: "m", error: "e" })).toBe("m");
    expect(extractUnknownMessage({ message: "", error: "e" })).toBe("e");
    expect(extractUnknownMessage({ detail: { title: "deep" } })).toBe("deep");
  });

  it("gives blank for null, undefined and objects with no known key", () => {
    expect(extractUnknownMessage(null)).toBe("");
    expect(extractUnknownMessage(undefined)).toBe("");
    expect(extractUnknownMessage({ other: "x" })).toBe("");
  });

  it("uses the structured error body when the server sends one", () => {
    const errors = [{ field: "uiTblName", message: "taken" }];
    const error = { response: { data: { success: false, message: "Invalid", errors } } };
    expect(getUiTableErrorInfo(error, "fallback")).toEqual({ message: "Invalid", errors });
  });

  it("falls back to the response text, then the error text, then the fallback", () => {
    expect(getUiTableErrorInfo({ response: { data: { message: "from body" } } }, "fb")).toEqual({
      message: "from body",
      errors: [],
    });
    expect(getUiTableErrorInfo({ response: { data: "plain" } }, "fb").message).toBe("plain");
    expect(getUiTableErrorInfo({ message: "network down" }, "fb").message).toBe("network down");
    expect(getUiTableErrorInfo(null, "Could not save").message).toBe("Could not save");
    expect(getUiTableErrorInfo({ response: {} }, "Could not save")).toEqual({
      message: "Could not save",
      errors: [],
    });
  });

  it("does not treat a success:true body as a structured error", () => {
    const error = { response: { data: { success: true, message: "ok", errors: [] } } };
    expect(getUiTableErrorInfo(error, "fb").message).toBe("ok");
  });
});

describe("server column to editor row", () => {
  it("maps every field to its editable text form", () => {
    const mapped = mapUiTableColumnPayloadToRow(payloadColumn(), 0);
    expect(mapped).toMatchObject({
      uiTblClmId: "7",
      columnNumber: 3,
      columnName: "Qty",
      width: "9.6",
      visible: false,
      focus: true,
      position: "4",
      necessity: true,
      nextColumn: "5",
      previousColumn: "2",
      isActive: false,
    });
    expect(mapped.id).toMatch(/^ui-column-/);
  });

  it("fills blanks and defaults for null server values", () => {
    const mapped = mapUiTableColumnPayloadToRow(
      payloadColumn({
        uiTblClmNo: "",
        uiTblClmName: null,
        uiTblClmColumnWidth: null,
        uiTblClmColumnVisibility: null,
        uiTblClmColumnFocus: null,
        uiTblClmNextColumn: null,
        uiTblClmPreviousColumn: null,
        uiTblClmColumnPosition: null as unknown as number,
      }),
      4,
    );
    expect(mapped).toMatchObject({
      columnNumber: 5,
      columnName: "",
      width: "",
      visible: true,
      focus: false,
      position: "5",
      nextColumn: "",
      previousColumn: "",
    });
  });

  it("keeps a zero width and zero next/previous rather than blanking them", () => {
    const mapped = mapUiTableColumnPayloadToRow(
      payloadColumn({
        uiTblClmColumnWidth: 0,
        uiTblClmNextColumn: 0,
        uiTblClmPreviousColumn: 0,
      }),
      0,
    );
    expect(mapped.width).toBe("0");
    expect(mapped.nextColumn).toBe("0");
    expect(mapped.previousColumn).toBe("0");
  });
});

describe("column save request", () => {
  function build(column: UiTableColumnRow, rowIndex = 0, parent = "") {
    const errors: UiTableApiErrorDetail[] = [];
    const request = buildUiTableColumnRequest(column, rowIndex, parent, errors);
    return { request, errors };
  }

  it("builds a request from a valid row and links it to the parent table", () => {
    const { request, errors } = build(
      row("a", {
        uiTblClmId: "12",
        columnNumber: 2,
        columnName: " Qty ",
        width: "9.6",
        position: "3",
        nextColumn: "4",
        previousColumn: "1",
        focus: true,
        necessity: true,
      }),
      1,
      "18",
    );
    expect(errors).toEqual([]);
    expect(request).toEqual({
      uiTblClmId: "12",
      uiTblClmNo: "2",
      uiTblClmName: "Qty",
      uiTblClmTableId: "18",
      uiTblClmColumnWidth: 9.6,
      uiTblClmColumnVisibility: true,
      uiTblClmColumnFocus: true,
      uiTblClmColumnPosition: 3,
      uiTblClmColumnNecessity: true,
      uiTblClmNextColumn: 4,
      uiTblClmPreviousColumn: 1,
      uiTblClmIsActive: true,
    });
  });

  it("omits the id for a new column and sends null for a blank width, next and previous", () => {
    const { request } = build(row("a", { width: "", nextColumn: "", previousColumn: "" }));
    expect(request).not.toHaveProperty("uiTblClmId");
    expect(request.uiTblClmColumnWidth).toBeNull();
    expect(request.uiTblClmNextColumn).toBeNull();
    expect(request.uiTblClmPreviousColumn).toBeNull();
    expect(request.uiTblClmTableId).toBeNull();
  });

  it("falls back to the row index for a blank position and a zero column number", () => {
    const { request, errors } = build(row("a", { position: "", columnNumber: 0 }), 4);
    expect(request.uiTblClmColumnPosition).toBe(5);
    expect(request.uiTblClmNo).toBe("5");
    expect(errors).toEqual([]);
  });

  it("reports an empty column name with its row-indexed field", () => {
    const { errors } = build(row("a", { columnName: "   " }), 2);
    expect(errors).toEqual([
      { field: "uiTblColumns[2].uiTblClmName", message: "uiTblClmName must not be empty" },
    ]);
  });

  it("reports a column name over 500 characters but accepts exactly 500", () => {
    expect(build(row("a", { columnName: "x".repeat(500) })).errors).toEqual([]);
    expect(build(row("a", { columnName: "x".repeat(501) })).errors).toEqual([
      {
        field: "uiTblColumns[0].uiTblClmName",
        message: "uiTblClmName must be at most 500 characters",
      },
    ]);
  });

  it("reports a non-numeric column id", () => {
    const { errors } = build(row("a", { uiTblClmId: "abc" }));
    expect(errors).toEqual([
      { field: "uiTblColumns[0].uiTblClmId", message: "uiTblClmId must be a numeric string" },
    ]);
  });

  it("reports unparsable width, position, next and previous with exact messages", () => {
    const { errors } = build(
      row("a", { width: "wide", position: "1.5", nextColumn: "x", previousColumn: "2.2" }),
      3,
    );
    expect(errors).toEqual([
      {
        field: "uiTblColumns[3].uiTblClmColumnWidth",
        message: "uiTblColumns[3].uiTblClmColumnWidth must be a number",
      },
      {
        field: "uiTblColumns[3].uiTblClmColumnPosition",
        message: "uiTblColumns[3].uiTblClmColumnPosition must be an integer",
      },
      {
        field: "uiTblColumns[3].uiTblClmNextColumn",
        message: "uiTblColumns[3].uiTblClmNextColumn must be an integer",
      },
      {
        field: "uiTblColumns[3].uiTblClmPreviousColumn",
        message: "uiTblColumns[3].uiTblClmPreviousColumn must be an integer",
      },
    ]);
  });
});

describe("table save request", () => {
  it("builds a replace-all request with trimmed values", () => {
    const { request, errors } = buildSaveUiTableRequest(
      { ...FORM, uiTblId: " 18 ", uiTblName: " Quotation ", uiTblDeviceType: " Desktop " },
      [row("a", { columnName: "Qty" })],
    );
    expect(errors).toEqual([]);
    expect(request).toMatchObject({
      uiTblId: "18",
      uiTblName: "Quotation",
      uiTblDeviceType: "Desktop",
      uiTblEditable: true,
      uiTblIsActive: true,
      replaceColumns: true,
    });
    expect(request?.uiTblColumns).toHaveLength(1);
    expect(request?.uiTblColumns?.[0].uiTblClmTableId).toBe("18");
  });

  it("omits the id for a new table and sends a blank device type as null", () => {
    const { request } = buildSaveUiTableRequest({ ...FORM, uiTblDeviceType: "  " }, []);
    expect(request).not.toHaveProperty("uiTblId");
    expect(request?.uiTblDeviceType).toBeNull();
  });

  it("accepts an empty column list and still asks to replace columns", () => {
    const { request } = buildSaveUiTableRequest(FORM, []);
    expect(request?.uiTblColumns).toEqual([]);
    expect(request?.replaceColumns).toBe(true);
  });

  it("rejects a non-numeric table id", () => {
    const { request, errors } = buildSaveUiTableRequest({ ...FORM, uiTblId: "12a" }, []);
    expect(request).toBeNull();
    expect(errors).toEqual([{ field: "uiTblId", message: "uiTblId must be a numeric string" }]);
  });

  it("rejects an empty table name", () => {
    const { errors } = buildSaveUiTableRequest({ ...FORM, uiTblName: "  " }, []);
    expect(errors).toEqual([{ field: "uiTblName", message: "uiTblName must not be empty" }]);
  });

  it("limits the table name to 500 and the device type to 255 characters", () => {
    expect(buildSaveUiTableRequest({ ...FORM, uiTblName: "n".repeat(500) }, []).errors).toEqual([]);
    expect(
      buildSaveUiTableRequest({ ...FORM, uiTblDeviceType: "d".repeat(255) }, []).errors,
    ).toEqual([]);
    expect(buildSaveUiTableRequest({ ...FORM, uiTblName: "n".repeat(501) }, []).errors).toEqual([
      { field: "uiTblName", message: "uiTblName must be at most 500 characters" },
    ]);
    expect(
      buildSaveUiTableRequest({ ...FORM, uiTblDeviceType: "d".repeat(256) }, []).errors,
    ).toEqual([
      { field: "uiTblDeviceType", message: "uiTblDeviceType must be at most 255 characters" },
    ]);
  });

  it("collects table and column errors together and returns no request", () => {
    const { request, errors } = buildSaveUiTableRequest({ ...FORM, uiTblName: "" }, [
      row("a", { columnName: "" }),
      row("b", { columnName: "ok" }),
      row("c", { columnName: "" }),
    ]);
    expect(request).toBeNull();
    expect(errors.map((e) => e.field)).toEqual([
      "uiTblName",
      "uiTblColumns[0].uiTblClmName",
      "uiTblColumns[2].uiTblClmName",
    ]);
  });

  it("keeps duplicate positions as typed rather than renumbering them", () => {
    const { request } = buildSaveUiTableRequest(FORM, [
      row("a", { position: "2" }),
      row("b", { position: "2" }),
    ]);
    expect(request?.uiTblColumns?.map((c) => c.uiTblClmColumnPosition)).toEqual([2, 2]);
  });
});
