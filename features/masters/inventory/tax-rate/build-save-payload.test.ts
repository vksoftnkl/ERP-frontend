import { describe, expect, it } from "vitest";
import { buildLedgerLinePayload, buildTaxRateSavePayload } from "./build-save-payload";
import { TAX_RATE_INITIAL_FORM_VALUES } from "./constants";
import { createEmptyLedgerRow } from "./lines";
import type { TaxRateLedgerRow } from "./types";

function values(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...TAX_RATE_INITIAL_FORM_VALUES, tax_name: "GST 18%", ...overrides };
}

function row(overrides: Partial<TaxRateLedgerRow> = {}): TaxRateLedgerRow {
  return { ...createEmptyLedgerRow(), role: "SALES", ledgerId: "led-1", ...overrides };
}

describe("buildTaxRateSavePayload — the generated splits", () => {
  it("never sends the three GENERATED columns", () => {
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_rate_perc: "18",
        tax_cgst_perc: "9",
        tax_sgst_perc: "9",
        tax_igst_perc: "18",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload).not.toHaveProperty("tax_cgst_perc");
    expect(payload).not.toHaveProperty("tax_sgst_perc");
    expect(payload).not.toHaveProperty("tax_igst_perc");
    // The one figure they are derived from does go.
    expect(payload.tax_rate_perc).toBe(18);
  });

  it("does not send the display-only supersedes name", () => {
    const payload = buildTaxRateSavePayload({
      values: values({ tax_supersedes_name: "GST 12%" }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload).not.toHaveProperty("tax_supersedes_name");
  });
});

describe("buildTaxRateSavePayload — ck_tax_cess_agrees", () => {
  it("zeroes both figures when the basis is NONE", () => {
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_cess_basis: "NONE",
        tax_cess_perc: "12",
        tax_cess_per_unit: "4",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_cess_perc).toBe(0);
    expect(payload.tax_cess_per_unit).toBe(0);
  });

  it("keeps only the figure a PERCENT basis is about", () => {
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_cess_basis: "PERCENT",
        tax_cess_perc: "12",
        tax_cess_per_unit: "4",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_cess_perc).toBe(12);
    expect(payload.tax_cess_per_unit).toBe(0);
  });

  it("keeps only the figure a PER_UNIT basis is about", () => {
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_cess_basis: "PER_UNIT",
        tax_cess_perc: "12",
        tax_cess_per_unit: "4",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_cess_perc).toBe(0);
    expect(payload.tax_cess_per_unit).toBe(4);
  });

  it("keeps both when the basis is BOTH", () => {
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_cess_basis: "BOTH",
        tax_cess_perc: "12",
        tax_cess_per_unit: "4",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_cess_perc).toBe(12);
    expect(payload.tax_cess_per_unit).toBe(4);
  });

  it("applies the same rule to the SECOND, state cess", () => {
    // Zero on all eleven seeded rates today, which is why a port that forgets it
    // looks correct for a year.
    const payload = buildTaxRateSavePayload({
      values: values({
        tax_acess_basis: "PERCENT",
        tax_acess_perc: "1",
        tax_acess_per_unit: "9",
      }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_acess_basis).toBe("PERCENT");
    expect(payload.tax_acess_perc).toBe(1);
    expect(payload.tax_acess_per_unit).toBe(0);
  });
});

describe("buildTaxRateSavePayload — the lines contract", () => {
  it("always sends lines, and an empty grid survives serialisation as []", () => {
    const payload = buildTaxRateSavePayload({
      values: values(),
      lines: [],
      shouldUpdate: true,
      editingItemId: "tax-1",
    });
    expect(payload.lines).toEqual([]);
    // "delete every override" must reach the server as an empty array, not as an
    // absent key ("leave the grid alone").
    const wire = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(wire, "lines")).toBe(true);
    expect(wire.lines).toEqual([]);
  });

  it("sends a blank supply nature as null, and JSON keeps it", () => {
    const payload = buildTaxRateSavePayload({
      values: values(),
      lines: [row({ supplyNature: "" })],
      shouldUpdate: false,
      editingItemId: null,
    });
    const [line] = payload.lines as Array<Record<string, unknown>>;
    expect(line.trl_supply_nature).toBeNull();
    const wire = JSON.parse(JSON.stringify(payload)) as { lines: Array<Record<string, unknown>> };
    expect(Object.prototype.hasOwnProperty.call(wire.lines[0], "trl_supply_nature")).toBe(true);
    expect(wire.lines[0].trl_supply_nature).toBeNull();
  });

  it("sends a narrowed nature as the code", () => {
    const payload = buildTaxRateSavePayload({
      values: values(),
      lines: [row({ supplyNature: "INTER" })],
      shouldUpdate: false,
      editingItemId: null,
    });
    const [line] = payload.lines as Array<Record<string, unknown>>;
    expect(line.trl_supply_nature).toBe("INTER");
  });
});

describe("buildLedgerLinePayload", () => {
  it("omits trl_id on an insert and carries it on an update", () => {
    expect(buildLedgerLinePayload(row())).not.toHaveProperty("trl_id");
    expect(buildLedgerLinePayload(row({ trlId: "trl-9" })).trl_id).toBe("trl-9");
  });

  it("sends the hidden remarks back rather than dropping them", () => {
    // The column is hidden; the value is another client's and not ours to lose.
    expect(buildLedgerLinePayload(row({ remarks: "kept" })).trl_remarks).toBe("kept");
    expect(buildLedgerLinePayload(row({ remarks: "" })).trl_remarks).toBeNull();
  });
});

describe("buildTaxRateSavePayload — identity", () => {
  it("adds tax_id only on an update", () => {
    expect(
      buildTaxRateSavePayload({
        values: values(),
        lines: [],
        shouldUpdate: false,
        editingItemId: "tax-1",
      }),
    ).not.toHaveProperty("tax_id");
    expect(
      buildTaxRateSavePayload({
        values: values(),
        lines: [],
        shouldUpdate: true,
        editingItemId: "tax-1",
      }).tax_id,
    ).toBe("tax-1");
  });

  it("sends a blank code and a blank supersedes as null", () => {
    const payload = buildTaxRateSavePayload({
      values: values({ tax_code: "  ", tax_supersedes_id: "" }),
      lines: [],
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tax_code).toBeNull();
    expect(payload.tax_supersedes_id).toBeNull();
  });
});
