import { describe, expect, it } from "vitest";
import {
  dropdownColumnWidths,
  dropdownIdKey,
  extractDropdownDetail,
  normalizeDropdownConfig,
  visibleDropdownColumns,
} from "./config";
import type { DropdownColumnPayload, DropdownDetailPayload } from "./types";

function column(overrides: Partial<DropdownColumnPayload>): DropdownColumnPayload {
  return {
    dropdown_columns_no: 0,
    dropdown_columns_data_type: "Text",
    dropdown_columns_name: "#",
    dropdown_columns_alias: null,
    dropdown_columns_width: 10,
    dropdown_columns_visiblity: true,
    dropdown_columns_allignment: "Left",
    dropdown_columns_filter: false,
    dropdown_columns_sql_name: null,
    ...overrides,
  };
}

function detail(overrides: Partial<DropdownDetailPayload>): DropdownDetailPayload {
  return {
    dropdown_id: "39",
    dropdown_name: "CUSTOMERS",
    dropdown_completion: null,
    dropdown_sort_column: null,
    dropdown_sort_order: "asc",
    dropdown_max_visible_items: 10,
    dropdown_show_header: false,
    dropdown_width: 0,
    columns: [],
    ...overrides,
  };
}

/** Dropdown 39 (CUSTOMERS), verbatim from `/dropdown-details/get?dropdownId=39`. */
const CUSTOMERS_PAYLOAD: DropdownDetailPayload = {
  dropdown_id: "39",
  dropdown_name: "CUSTOMERS",
  dropdown_sort_order: "asc",
  dropdown_sort_column: "cus_name",
  dropdown_completion: "cus_name",
  dropdown_max_visible_items: 10,
  dropdown_show_header: false,
  dropdown_width: 0,
  columns: [
    column({
      dropdown_columns_no: 0,
      dropdown_columns_name: "#",
      dropdown_columns_width: 10,
      dropdown_columns_visiblity: false,
      dropdown_columns_sql_name: "cus_id",
    }),
    column({
      dropdown_columns_no: 1,
      dropdown_columns_name: "Customer",
      dropdown_columns_width: 100,
      dropdown_columns_visiblity: true,
      dropdown_columns_sql_name: "cus_name",
    }),
  ],
};

/**
 * Dropdown 8 (company), verbatim. Two traps in one payload: the column numbering
 * starts at 1, and columns 3-4 name fields the SQL (`SELECT comp_name, comp_id`)
 * never returns.
 */
const COMPANY_PAYLOAD: DropdownDetailPayload = {
  dropdown_id: "8",
  dropdown_name: "company",
  dropdown_completion: null,
  dropdown_sort_order: null,
  dropdown_max_visible_items: 10,
  dropdown_show_header: true,
  dropdown_width: null,
  columns: [
    column({
      dropdown_columns_no: 1,
      dropdown_columns_name: "company id",
      dropdown_columns_width: 20,
      dropdown_columns_sql_name: "comp_id",
    }),
    column({
      dropdown_columns_no: 2,
      dropdown_columns_name: "company name",
      dropdown_columns_width: 20,
      dropdown_columns_sql_name: "comp_name",
    }),
    column({
      dropdown_columns_no: 3,
      dropdown_columns_name: "company code",
      dropdown_columns_width: 20,
      dropdown_columns_sql_name: null,
    }),
    column({
      dropdown_columns_no: 4,
      dropdown_columns_name: "company short",
      dropdown_columns_width: 20,
      dropdown_columns_sql_name: null,
    }),
  ],
};

describe("extractDropdownDetail", () => {
  it("unwraps the list envelope the config endpoint returns", () => {
    expect(extractDropdownDetail({ data: [CUSTOMERS_PAYLOAD] })?.dropdown_id).toBe("39");
  });

  it("accepts a bare array and a bare object", () => {
    expect(extractDropdownDetail([CUSTOMERS_PAYLOAD])?.dropdown_id).toBe("39");
    expect(extractDropdownDetail(CUSTOMERS_PAYLOAD)?.dropdown_id).toBe("39");
  });

  it("returns null for nothing usable", () => {
    expect(extractDropdownDetail(null)).toBeNull();
    expect(extractDropdownDetail({ data: [] })).toBeNull();
    expect(extractDropdownDetail("nope")).toBeNull();
  });
});

describe("normalizeDropdownConfig", () => {
  it("normalizes the customers dropdown", () => {
    const config = normalizeDropdownConfig({ data: [CUSTOMERS_PAYLOAD] });
    expect(config).not.toBeNull();
    expect(config?.dropdownId).toBe("39");
    expect(config?.completionKey).toBe("cus_name");
    expect(config?.showHeader).toBe(false);
    expect(config?.widthPercent).toBe(0);
    expect(config?.maxVisibleItems).toBe(10);
    expect(config?.columns.map((c) => c.jsonKey)).toEqual(["cus_id", "cus_name"]);
    expect(config?.columns.map((c) => c.visible)).toEqual([false, true]);
  });

  it("reads the misspelled visibility and alignment keys", () => {
    const config = normalizeDropdownConfig(
      detail({
        columns: [
          column({ dropdown_columns_sql_name: "a", dropdown_columns_visiblity: false }),
          column({
            dropdown_columns_no: 1,
            dropdown_columns_sql_name: "b",
            dropdown_columns_allignment: "Right",
            dropdown_columns_filter: true,
          }),
        ],
      }),
    );
    expect(config?.columns[0].visible).toBe(false);
    expect(config?.columns[1].align).toBe("right");
    expect(config?.columns[1].filterable).toBe(true);
  });

  it("prefers the alias for the heading and the sql name for the key", () => {
    const config = normalizeDropdownConfig(
      detail({
        columns: [
          column({
            dropdown_columns_name: "cus name",
            dropdown_columns_alias: "Customer",
            dropdown_columns_sql_name: "cus_name",
          }),
        ],
      }),
    );
    expect(config?.columns[0].heading).toBe("Customer");
    expect(config?.columns[0].jsonKey).toBe("cus_name");
  });

  it("falls back to the column name for both when alias and sql name are absent", () => {
    const config = normalizeDropdownConfig(
      detail({ columns: [column({ dropdown_columns_name: "company code" })] }),
    );
    expect(config?.columns[0].jsonKey).toBe("company code");
    expect(config?.columns[0].heading).toBe("company code");
  });

  it("orders by dropdown_columns_no even when the numbering is 1-based", () => {
    const config = normalizeDropdownConfig(COMPANY_PAYLOAD);
    expect(config?.columns.map((c) => c.jsonKey)).toEqual([
      "comp_id",
      "comp_name",
      "company code",
      "company short",
    ]);
    // The id is the first column by order, not the one numbered 0 (there is none).
    expect(dropdownIdKey(config)).toBe("comp_id");
  });

  it("orders out-of-sequence payloads", () => {
    const config = normalizeDropdownConfig(
      detail({
        columns: [
          column({ dropdown_columns_no: 2, dropdown_columns_sql_name: "third" }),
          column({ dropdown_columns_no: 0, dropdown_columns_sql_name: "first" }),
          column({ dropdown_columns_no: 1, dropdown_columns_sql_name: "second" }),
        ],
      }),
    );
    expect(config?.columns.map((c) => c.jsonKey)).toEqual(["first", "second", "third"]);
  });

  it("normalizes unknown data types and alignments to the defaults", () => {
    const config = normalizeDropdownConfig(
      detail({
        columns: [
          column({
            dropdown_columns_sql_name: "a",
            dropdown_columns_data_type: "Decimal",
            dropdown_columns_allignment: "justify",
          }),
          column({
            dropdown_columns_no: 1,
            dropdown_columns_sql_name: "b",
            dropdown_columns_data_type: "numberts",
            dropdown_columns_allignment: "Centre",
          }),
        ],
      }),
    );
    expect(config?.columns[0].dataType).toBe("Text");
    expect(config?.columns[0].align).toBe("left");
    expect(config?.columns[1].dataType).toBe("NumberTS");
    expect(config?.columns[1].align).toBe("center");
  });

  it("defaults maxVisibleItems to 10 and never below 1", () => {
    expect(normalizeDropdownConfig(detail({ dropdown_max_visible_items: null }))?.maxVisibleItems)
      .toBe(10);
    expect(normalizeDropdownConfig(detail({ dropdown_max_visible_items: 0 }))?.maxVisibleItems)
      .toBe(1);
    expect(normalizeDropdownConfig(detail({ dropdown_max_visible_items: "25" }))?.maxVisibleItems)
      .toBe(25);
  });

  it("survives an empty column list", () => {
    const config = normalizeDropdownConfig(detail({ columns: null }));
    expect(config?.columns).toEqual([]);
    expect(config?.completionKey).toBe("");
    expect(dropdownIdKey(config)).toBe("");
  });

  it("returns null when there is no detail at all", () => {
    expect(normalizeDropdownConfig(undefined)).toBeNull();
  });

  describe("completion key", () => {
    it("resolves a configured completion by sql name", () => {
      expect(normalizeDropdownConfig(CUSTOMERS_PAYLOAD)?.completionKey).toBe("cus_name");
    });

    it("resolves a completion configured as the column's display name", () => {
      const config = normalizeDropdownConfig(
        detail({
          dropdown_completion: "Customer",
          columns: [
            column({ dropdown_columns_sql_name: "cus_id" }),
            column({
              dropdown_columns_no: 1,
              dropdown_columns_name: "Customer",
              dropdown_columns_sql_name: "cus_name",
            }),
          ],
        }),
      );
      expect(config?.completionKey).toBe("cus_name");
    });

    it("falls back to the first visible non-id column when unconfigured", () => {
      // Company (8) is one of the nine dropdowns with no dropdown_completion.
      expect(normalizeDropdownConfig(COMPANY_PAYLOAD)?.completionKey).toBe("comp_name");
    });

    it("falls back when the configured completion names nothing", () => {
      const config = normalizeDropdownConfig(
        detail({
          dropdown_completion: "does_not_exist",
          columns: [
            column({ dropdown_columns_sql_name: "id" }),
            column({ dropdown_columns_no: 1, dropdown_columns_sql_name: "name" }),
          ],
        }),
      );
      expect(config?.completionKey).toBe("name");
    });

    it("uses the id column when it is the only column there is", () => {
      const config = normalizeDropdownConfig(
        detail({ columns: [column({ dropdown_columns_sql_name: "only" })] }),
      );
      expect(config?.completionKey).toBe("only");
    });
  });

  describe("ensureSomethingVisible", () => {
    it("forces the completion column visible when every column is hidden", () => {
      const config = normalizeDropdownConfig(
        detail({
          dropdown_completion: "emp_name",
          columns: [
            column({ dropdown_columns_sql_name: "emp_id", dropdown_columns_visiblity: false }),
            column({
              dropdown_columns_no: 1,
              dropdown_columns_sql_name: "emp_code",
              dropdown_columns_visiblity: false,
            }),
            column({
              dropdown_columns_no: 2,
              dropdown_columns_sql_name: "emp_name",
              dropdown_columns_visiblity: false,
            }),
          ],
        }),
      );
      expect(config?.columns.map((c) => c.visible)).toEqual([false, false, true]);
    });

    it("forces index 1 — not the id at index 0 — when there is no completion", () => {
      const config = normalizeDropdownConfig(
        detail({
          columns: [
            column({ dropdown_columns_sql_name: "id", dropdown_columns_visiblity: false }),
            column({
              dropdown_columns_no: 1,
              dropdown_columns_sql_name: "name",
              dropdown_columns_visiblity: false,
            }),
          ],
        }),
      );
      expect(config?.columns.map((c) => c.visible)).toEqual([false, true]);
    });

    it("forces the only column when the dropdown has just one", () => {
      const config = normalizeDropdownConfig(
        detail({
          columns: [column({ dropdown_columns_sql_name: "id", dropdown_columns_visiblity: false })],
        }),
      );
      expect(config?.columns[0].visible).toBe(true);
    });

    it("leaves a config that already shows something alone", () => {
      const config = normalizeDropdownConfig(CUSTOMERS_PAYLOAD);
      expect(config?.columns.map((c) => c.visible)).toEqual([false, true]);
    });
  });
});

describe("dropdownIdKey", () => {
  it("takes the first column even though it is hidden", () => {
    expect(dropdownIdKey(normalizeDropdownConfig(CUSTOMERS_PAYLOAD))).toBe("cus_id");
  });

  it("is empty for no config", () => {
    expect(dropdownIdKey(null)).toBe("");
  });
});

describe("visibleDropdownColumns", () => {
  const company = normalizeDropdownConfig(COMPANY_PAYLOAD);

  it("keeps every visible column while there are no rows to check against", () => {
    expect(visibleDropdownColumns(company, []).map((c) => c.jsonKey)).toEqual([
      "comp_id",
      "comp_name",
      "company code",
      "company short",
    ]);
  });

  it("drops configured columns the SQL never returns", () => {
    const rows = [{ comp_id: "1", comp_name: "ACME" }];
    expect(visibleDropdownColumns(company, rows).map((c) => c.jsonKey)).toEqual([
      "comp_id",
      "comp_name",
    ]);
  });

  it("keeps a column that is present but null on some rows", () => {
    const rows = [{ comp_id: "1", comp_name: null }];
    expect(visibleDropdownColumns(company, rows).map((c) => c.jsonKey)).toEqual([
      "comp_id",
      "comp_name",
    ]);
  });

  it("keeps the configured set rather than rendering nothing", () => {
    const rows = [{ unrelated: 1 }];
    expect(visibleDropdownColumns(company, rows)).toHaveLength(4);
  });

  it("skips hidden columns", () => {
    const customers = normalizeDropdownConfig(CUSTOMERS_PAYLOAD);
    const rows = [{ cus_id: "1", cus_name: "LINK" }];
    expect(visibleDropdownColumns(customers, rows).map((c) => c.jsonKey)).toEqual(["cus_name"]);
  });
});

describe("dropdownColumnWidths", () => {
  it("normalizes weights that sum to 80", () => {
    const columns = normalizeDropdownConfig(COMPANY_PAYLOAD)!.columns;
    expect(dropdownColumnWidths(columns)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("normalizes weights that sum past 100", () => {
    const columns = normalizeDropdownConfig(
      detail({
        columns: [
          column({ dropdown_columns_sql_name: "a", dropdown_columns_width: 30 }),
          column({
            dropdown_columns_no: 1,
            dropdown_columns_sql_name: "b",
            dropdown_columns_width: 70,
          }),
          column({
            dropdown_columns_no: 2,
            dropdown_columns_sql_name: "c",
            dropdown_columns_width: 10,
          }),
        ],
      }),
    )!.columns;
    const widths = dropdownColumnWidths(columns);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1);
    expect(widths[1]).toBeCloseTo(0.636, 3);
  });

  it("splits evenly when nothing is configured", () => {
    const columns = normalizeDropdownConfig(
      detail({
        columns: [
          column({ dropdown_columns_sql_name: "a", dropdown_columns_width: 0 }),
          column({
            dropdown_columns_no: 1,
            dropdown_columns_sql_name: "b",
            dropdown_columns_width: null,
          }),
        ],
      }),
    )!.columns;
    expect(dropdownColumnWidths(columns)).toEqual([0.5, 0.5]);
  });

  it("is empty for no columns", () => {
    expect(dropdownColumnWidths([])).toEqual([]);
  });
});
