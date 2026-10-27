import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  formValuesFromRow,
  isShared,
  listGridParams,
  toggleRequestOf,
  txnTypesOf,
} from "./stock-reason";

const SHARED = {
  srm_id: "s1",
  srm_code: "DAMAGE",
  srm_name: "Damaged",
  srm_direction: "OUT",
  srm_allowed_txn_types: "ADJUST_MINUS,DAMAGE",
  srm_require_remarks: true,
  srm_gl_ledger_id: "",
  srm_sort_order: 5,
  srm_remarks: "",
  shipped: true,
  srm_is_active: true,
};
const OWN = { ...SHARED, srm_id: "o1", shipped: false, srm_gl_ledger_id: "L1" };

describe("stock reasons", () => {
  it("always sends both quoted grid tokens", () => {
    expect(listGridParams("c1", false)).toEqual({ icompany_id: "c1", iinactive: "false" });
    expect(listGridParams("c1", true).iinactive).toBe("true");
  });

  it("reads the comma list", () => {
    expect(txnTypesOf("A, B,,")).toEqual(["A", "B"]);
    expect(txnTypesOf("")).toEqual([]);
  });

  it("a copy of a shared reason is active and a create", () => {
    const values = formValuesFromRow({ ...SHARED, srm_is_active: false }, true);
    expect(values.isActive).toBe("true");
    const body = buildSavePayload(values, { companyId: "c1", editingId: null });
    expect(body).not.toHaveProperty("srmId");
    expect(body).toMatchObject({ companyId: "c1", code: "DAMAGE", allowedTxnTypes: ["ADJUST_MINUS", "DAMAGE"], glLedgerId: null, remarks: null });
  });

  it("an update carries the id, upper-cases the code, nulls blanks", () => {
    const body = buildSavePayload(
      { ...formValuesFromRow(OWN, false), code: " ab ", name: "  a   b ", remarks: "  ", sortOrder: "99999" },
      { companyId: "c1", editingId: "o1" },
    );
    expect(body).toMatchObject({ srmId: "o1", code: "AB", name: "a b", remarks: null, glLedgerId: "L1", sortOrder: 32000 });
  });

  it("toggle: own row deactivates / reactivates, shared row saves an inactive copy", () => {
    expect(toggleRequestOf(OWN, "c1")).toMatchObject({
      route: "/stock/reasons/deactivate",
      body: { companyId: "c1", srmId: "o1" },
    });
    expect(toggleRequestOf(OWN, "c1").body).not.toHaveProperty("reactivate");
    expect(toggleRequestOf({ ...OWN, srm_is_active: false }, "c1").body).toMatchObject({ reactivate: true });
    const shared = toggleRequestOf(SHARED, "c1");
    expect(isShared(SHARED)).toBe(true);
    expect(shared.route).toBe("/stock/reasons");
    expect(shared.body).toMatchObject({ companyId: "c1", code: "DAMAGE", isActive: false });
    expect(shared.body).not.toHaveProperty("srmId");
  });
});
