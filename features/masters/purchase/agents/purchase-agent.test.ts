import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  formValuesFromRow,
  listGridParams,
  toggleRequestOf,
  validateCommPct,
  validateGstin,
  validatePan,
} from "./purchase-agent";

const ROW = {
  pag_id: "a1",
  pag_code: "AG1",
  pag_name: "Ravi Brokers",
  pag_alias: null,
  pag_mobile1: "98400",
  pag_mobile2: null,
  pag_city: "Salem",
  pag_pan_no: "ABCDE1234F",
  pag_gstin: null,
  pag_default_comm_pct: "2.50",
  pag_remarks: "",
  pag_is_active: true,
};

describe("purchase agents", () => {
  it("always sends both quoted grid tokens", () => {
    expect(listGridParams("c1", false)).toEqual({ icompany_id: "c1", iinactive: "false" });
    expect(listGridParams("c1", true).iinactive).toBe("true");
  });

  it("fills the form from the grid row, a NUMERIC as a plain number", () => {
    const values = formValuesFromRow(ROW);
    expect(values.name).toBe("Ravi Brokers");
    expect(values.defaultCommPct).toBe("2.5");
    expect(values.alias).toBe("");
    expect(values.isActive).toBe("true");
    expect(formValuesFromRow({ ...ROW, pag_is_active: false }).isActive).toBe("false");
  });

  it("sends the company, drops blank text, upper-cases PAN / GSTIN, nulls a blank commission", () => {
    const body = buildSavePayload(
      { name: "  Ravi   Brokers ", code: "", panNo: " abcde1234f ", gstin: "33abcde1234f1z5", defaultCommPct: "", isActive: "true" },
      { companyId: "c1", editingId: null },
    );
    expect(body).toEqual({
      companyId: "c1",
      name: "Ravi Brokers",
      panNo: "ABCDE1234F",
      gstin: "33ABCDE1234F1Z5",
      defaultCommPct: null,
      isActive: true,
    });
    expect(buildSavePayload({ name: "X", defaultCommPct: "3" }, { companyId: "c1", editingId: "a1" })).toMatchObject({
      pagId: "a1",
      defaultCommPct: 3,
    });
  });

  it("checks PAN, GSTIN and commission like the server", () => {
    expect(validatePan("")).toBeNull();
    expect(validatePan("abcde1234f")).toBeNull();
    expect(validatePan("ABC")).toMatch(/10 characters/);
    expect(validateGstin("33ABCDE1234F1Z5")).toBeNull();
    expect(validateGstin("X3ABCDE1234F1Z5")).toMatch(/15 characters/);
    expect(validateCommPct("100")).toBeNull();
    expect(validateCommPct("101")).toMatch(/between 0 and 100/);
  });

  it("toggles the agent and the ledger together", () => {
    expect(toggleRequestOf(ROW)).toMatchObject({
      route: "/purchase/agents/active",
      body: { pagId: "a1", active: false },
      title: "Deactivate",
    });
    expect(toggleRequestOf({ ...ROW, pag_is_active: "false" }).body.active).toBe(true);
  });
});
