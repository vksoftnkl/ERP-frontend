import { describe, expect, it } from "vitest";

import { MINUS } from "./decimal";
import { SESSION_COLUMNS_FALLBACK, cellOf, resolveColumns, statusTone, type ConfiguredColumn } from "./columns";

function configured(overrides: Partial<ConfiguredColumn> & { sqlFieldName: string }): ConfiguredColumn {
  return {
    key: overrides.sqlFieldName,
    accessorKey: overrides.sqlFieldName,
    header: overrides.sqlFieldName,
    visible: true,
    order: 1,
    ...overrides,
  };
}

describe("resolveColumns", () => {
  it("follows the grid's config: visible only, by position, keys never", () => {
    const columns = resolveColumns(
      [
        configured({ sqlFieldName: "tss_id", header: "#", visible: true, order: 1 }),
        configured({ sqlFieldName: "cashier", header: "Cashier", order: 3 }),
        configured({ sqlFieldName: "tss_session_no", header: "Session", order: 2 }),
        configured({ sqlFieldName: "bills", header: "Bills", order: 4, align: "right", width: "80px" }),
        configured({ sqlFieldName: "counter_code", header: "Counter", order: 5, visible: false }),
      ],
      SESSION_COLUMNS_FALLBACK,
    );
    expect(columns).toEqual([
      { field: "tss_session_no", header: "Session", align: "left", width: undefined },
      { field: "cashier", header: "Cashier", align: "left", width: undefined },
      { field: "bills", header: "Bills", align: "right", width: "80px" },
    ]);
  });

  it("falls back when the config is missing or empty", () => {
    expect(resolveColumns(undefined, SESSION_COLUMNS_FALLBACK)).toBe(SESSION_COLUMNS_FALLBACK);
    expect(resolveColumns([], SESSION_COLUMNS_FALLBACK)).toBe(SESSION_COLUMNS_FALLBACK);
  });

  it("takes the fallback's side for a column the config leaves unaligned", () => {
    const [column] = resolveColumns(
      [configured({ sqlFieldName: "cash_variance", header: "Variance" })],
      SESSION_COLUMNS_FALLBACK,
    );
    expect(column.align).toBe("right");
  });
});

describe("cellOf", () => {
  it("formats money and signs a variance", () => {
    expect(cellOf("bd_net_sales", { bd_net_sales: "412880.00" })).toEqual({
      kind: "text",
      text: "4,12,880.00",
      tone: "",
    });
    expect(cellOf("cash_variance", { cash_variance: "-1250.00" })).toEqual({
      kind: "text",
      text: `${MINUS}1,250.00`,
      tone: "danger",
    });
    expect(cellOf("cash_variance", { cash_variance: "0.00" })).toEqual({ kind: "text", text: "0.00", tone: "" });
    expect(cellOf("cash_variance", { cash_variance: null })).toEqual({ kind: "text", text: "", tone: "" });
  });

  it("pills a status and a treatment", () => {
    expect(cellOf("status_text", { status_text: "PENDING APPROVAL" })).toEqual({
      kind: "pill",
      text: "PENDING APPROVAL",
      tone: "warning",
    });
    expect(cellOf("tbd_status", { tbd_status: "CLOSED" })).toEqual({ kind: "pill", text: "CLOSED", tone: "success" });
    expect(cellOf("treatment", { treatment: "SUSPENSE" }).tone).toBe("warning");
    expect(cellOf("treatment", { treatment: "" })).toEqual({ kind: "text", text: "", tone: "" });
  });

  it("shows anything else as it came", () => {
    expect(cellOf("bills", { bills: "188" })).toEqual({ kind: "text", text: "188", tone: "" });
    expect(cellOf("closed_at", {})).toEqual({ kind: "text", text: "", tone: "" });
  });

  it("tones the statuses", () => {
    expect(statusTone("OPEN")).toBe("info");
    expect(statusTone("pending_approval")).toBe("warning");
    expect(statusTone("VOIDED")).toBe("muted");
    expect(statusTone("SOMETHING NEW")).toBe("");
  });
});
