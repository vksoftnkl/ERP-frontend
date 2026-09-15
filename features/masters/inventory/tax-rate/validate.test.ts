import { describe, expect, it } from "vitest";
import { createEmptyLedgerRow, extractLedgerRows, roleAllowsSupplyNature } from "./lines";
import type { TaxRateLedgerRow } from "./types";
import { getLedgerRowsValidationError } from "./validate";

function row(overrides: Partial<TaxRateLedgerRow> = {}): TaxRateLedgerRow {
  return {
    ...createEmptyLedgerRow(),
    role: "OUTPUT_CGST",
    roleLabel: "Output CGST",
    roleBySupply: false,
    ledgerId: "led-1",
    ...overrides,
  };
}

describe("getLedgerRowsValidationError", () => {
  it("accepts no rows at all — the normal, complete configuration", () => {
    expect(getLedgerRowsValidationError([])).toBeNull();
  });

  it("wants a role", () => {
    const error = getLedgerRowsValidationError([row({ role: "" })]);
    expect(error?.field).toBe("role");
    expect(error?.message).toContain("Row 1");
  });

  it("wants a ledger, and says what deleting the row means instead", () => {
    const error = getLedgerRowsValidationError([row({ ledgerId: "" })]);
    expect(error?.field).toBe("ledger");
    expect(error?.message).toContain("posting ledger map");
  });

  it("rejects a duplicate (role, nature)", () => {
    const error = getLedgerRowsValidationError([
      row({ role: "SALES", roleBySupply: true, supplyNature: "INTRA" }),
      row({ role: "SALES", roleBySupply: true, supplyNature: "INTRA" }),
    ]);
    expect(error?.message).toContain("Row 2 repeats row 1");
  });

  it("rejects two rows that both leave the nature blank", () => {
    // The case NULLS NOT DISTINCT makes illegal, and the one a naive dedupe that
    // skips empty values misses.
    const error = getLedgerRowsValidationError([
      row({ role: "SALES", roleBySupply: true, supplyNature: "" }),
      row({ role: "SALES", roleBySupply: true, supplyNature: "" }),
    ]);
    expect(error?.message).toContain("Row 2 repeats row 1");
  });

  it("allows one role to answer each nature separately", () => {
    expect(
      getLedgerRowsValidationError([
        row({ role: "SALES", roleBySupply: true, supplyNature: "INTRA", ledgerId: "a" }),
        row({ role: "SALES", roleBySupply: true, supplyNature: "INTER", ledgerId: "b" }),
      ]),
    ).toBeNull();
  });

  it("allows the same nature under different roles", () => {
    expect(
      getLedgerRowsValidationError([
        row({ role: "SALES", roleBySupply: true, supplyNature: "INTRA", ledgerId: "a" }),
        row({ role: "PURCHASE", roleBySupply: true, supplyNature: "INTRA", ledgerId: "b" }),
      ]),
    ).toBeNull();
  });

  it("refuses a nature on a role that already implies one", () => {
    const error = getLedgerRowsValidationError([
      row({ role: "OUTPUT_CGST", roleBySupply: false, supplyNature: "INTRA" }),
    ]);
    expect(error?.field).toBe("supplyNature");
    expect(error?.message).toContain("Output CGST");
  });

  it("reports the first bad row, numbered as the operator sees it", () => {
    const error = getLedgerRowsValidationError([
      row({ role: "SALES", roleBySupply: true, ledgerId: "a" }),
      row({ role: "PURCHASE", roleBySupply: true, ledgerId: "" }),
    ]);
    expect(error?.message).toContain("Row 2");
  });
});

describe("roleAllowsSupplyNature", () => {
  it("is true only for the four trading roles", () => {
    expect(roleAllowsSupplyNature("SALES")).toBe(true);
    expect(roleAllowsSupplyNature("SALES_RETURN")).toBe(true);
    expect(roleAllowsSupplyNature("PURCHASE")).toBe(true);
    expect(roleAllowsSupplyNature("PURCHASE_RETURN")).toBe(true);
    expect(roleAllowsSupplyNature("OUTPUT_CGST")).toBe(false);
    expect(roleAllowsSupplyNature("INPUT_IGST")).toBe(false);
  });
});

describe("extractLedgerRows", () => {
  it("reads a rate with no lines as no rows, and does not invent one", () => {
    expect(extractLedgerRows({ lines: [] })).toEqual([]);
    expect(extractLedgerRows({})).toEqual([]);
    expect(extractLedgerRows(null)).toEqual([]);
  });

  it("round-trips a loaded line, labels and all", () => {
    const [loaded] = extractLedgerRows({
      lines: [
        {
          trl_id: "trl-1",
          trl_role: "sales",
          trl_role_label: "Sales",
          trl_supply_nature: "INTER",
          trl_ledger_id: "led-7",
          trl_ledger_name: "Interstate Sales",
          trl_remarks: "note",
          trl_is_active: false,
        },
      ],
    });
    expect(loaded.trlId).toBe("trl-1");
    expect(loaded.role).toBe("SALES");
    expect(loaded.roleLabel).toBe("Sales");
    expect(loaded.roleBySupply).toBe(true);
    expect(loaded.supplyNature).toBe("INTER");
    expect(loaded.ledgerName).toBe("Interstate Sales");
    expect(loaded.remarks).toBe("note");
    // A deactivated line comes back so the screen can switch it on again.
    expect(loaded.isActive).toBe(false);
  });

  it("reads a null supply nature as the blank 'both natures' choice", () => {
    const [loaded] = extractLedgerRows({
      lines: [{ trl_role: "SALES", trl_ledger_id: "led-1", trl_supply_nature: null }],
    });
    expect(loaded.supplyNature).toBe("");
  });

  it("gives every row a distinct key, including two identical ones", () => {
    const rows = extractLedgerRows({
      lines: [
        { trl_role: "SALES", trl_ledger_id: "led-1" },
        { trl_role: "SALES", trl_ledger_id: "led-1" },
      ],
    });
    expect(rows[0].rowKey).not.toBe(rows[1].rowKey);
  });
});
