import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  formValuesFromSource,
  listGridParams,
  pairNamesOf,
  schemeProblem,
  toggleRequestOf,
  validateNumber,
} from "./supplier-item";

const GET = {
  psi_id: "p1",
  psi_supplier_id: "s1",
  psi_item_id: "i1",
  psi_buy_uom_id: "u1",
  psi_supplier_item_code: "SC-9",
  psi_supplier_barcode: null,
  psi_pack_qty: "12.000000",
  psi_moq: null,
  psi_lead_days: 3,
  psi_scheme_buy_qty: "10.000",
  psi_scheme_free_qty: "1.000",
  psi_is_preferred: true,
  psi_is_active: true,
  sup_name: "Acme",
  item_name: "Soap",
};

describe("supplier–item map", () => {
  it("sends all three quoted grid tokens, '' for every supplier", () => {
    expect(listGridParams("c1", "", false)).toEqual({ icompany_id: "c1", isupplier_id: "", iinactive: "false" });
    expect(listGridParams("c1", " s1 ", true)).toEqual({ icompany_id: "c1", isupplier_id: "s1", iinactive: "true" });
  });

  it("opens on the stored row: numbers as numbers, the scheme kept", () => {
    const values = formValuesFromSource(GET);
    expect(values).toMatchObject({
      supplierId: "s1",
      itemId: "i1",
      buyUomId: "u1",
      packQty: "12",
      moq: "",
      leadDays: "3",
      schemeBuyQty: "10",
      schemeFreeQty: "1",
      isPreferred: "true",
      isActive: "true",
    });
    expect(pairNamesOf(GET)).toEqual({ supplierName: "Acme", itemName: "Soap" });
  });

  it("re-saves exactly what it opened (a scheme left out would clear it)", () => {
    const body = buildSavePayload(formValuesFromSource(GET), "c1");
    expect(body).toEqual({
      companyId: "c1",
      supplierId: "s1",
      itemId: "i1",
      supplierItemCode: "SC-9",
      buyUomId: "u1",
      packQty: 12,
      leadDays: 3,
      schemeBuyQty: 10,
      schemeFreeQty: 1,
      isPreferred: true,
      isActive: true,
    });
    expect(body).not.toHaveProperty("psiId");
    expect(body).not.toHaveProperty("moq");
  });

  it("wants a scheme whole or not at all", () => {
    expect(schemeProblem({ schemeBuyQty: "", schemeFreeQty: "" })).toBeNull();
    expect(schemeProblem({ schemeBuyQty: "10", schemeFreeQty: "1" })).toBeNull();
    expect(schemeProblem({ schemeBuyQty: "10", schemeFreeQty: "" })).toMatch(/both numbers/);
  });

  it("checks the DTO bounds", () => {
    expect(validateNumber("packQty", "0")).toMatch(/more than 0/);
    expect(validateNumber("moq", "0")).toBeNull();
    expect(validateNumber("leadDays", "2.5")).toMatch(/whole number/);
    expect(validateNumber("leadDays", "366")).toMatch(/at most 365/);
    expect(validateNumber("schemeFreeQty", "")).toBeNull();
  });

  it("toggles one row", () => {
    expect(toggleRequestOf(GET)).toMatchObject({
      route: "/purchase/supplier-items/active",
      body: { psiId: "p1", active: false },
    });
  });
});
