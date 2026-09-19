import { describe, expect, it } from "vitest";
import { normalizeGridColumnsPayload } from "./gridColumnsSlice";

/** One row as `/configured-grid-sql/columns` returns it. */
function column(overrides: Record<string, unknown> = {}) {
  return {
    grid_column_id: "019f07d3-a1e0-7d2f-9d64-1d566dec2cff",
    grid_column_number: 2,
    grid_column_name: "State Name",
    grid_column_width: 10,
    grid_column_px: null,
    grid_column_position: 2,
    grid_column_alignment: "Left",
    grid_column_visibility: true,
    grid_column_filter: true,
    grid_column_sql_field_name: "stm_name",
    ...overrides,
  };
}

describe("a configured column's width", () => {
  it("reads the pixels the column was last dragged to", () => {
    const [config] = normalizeGridColumnsPayload({
      data: [column({ grid_column_px: "246px" })],
    });
    expect(config.width).toBe("246px");
  });

  it("takes a bare number in that column as pixels too", () => {
    const [config] = normalizeGridColumnsPayload({ data: [column({ grid_column_px: "246" })] });
    expect(config.width).toBe("246px");
  });

  it("leaves a column nobody has dragged unsized", () => {
    // `grid_column_width` (10 here) is the desktop client's Qt fraction. Sizing
    // from it opened every list at that fraction times a fixed factor — near a
    // width, never on one — so an undragged column now takes the table's own
    // default instead.
    const [config] = normalizeGridColumnsPayload({ data: [column()] });
    expect(config.width).toBeUndefined();
  });

  it("ignores a px value that says nothing", () => {
    for (const px of ["", "   ", "0px", "auto", "-12px"]) {
      const [config] = normalizeGridColumnsPayload({ data: [column({ grid_column_px: px })] });
      expect(config.width, px).toBeUndefined();
    }
  });

  it("never reads the width from the Qt fraction, whatever it says", () => {
    const [config] = normalizeGridColumnsPayload({
      data: [column({ grid_column_width: 42, grid_column_px: null })],
    });
    expect(config.width).toBeUndefined();
  });
});
