import { describe, expect, it } from "vitest";
import {
  PARTY_GST_TYPE_OPTIONS,
  checkPartyGstRules,
  countryForStateChange,
  deleteCheckNotes,
  deleteCheckRefusalEnvelope,
  gstTypeNeedsGstin,
  gstTypeRefusesGstin,
  gstinKindOf,
  normalizePartyGstType,
  parsePartyDeleteCheck,
  parsePartySync,
  partySyncMessage,
  validatePartyGstinFormat,
} from "./party-master-rules";

// Passes the mod-36 check; state 33.
const GSTIN_33 = "33ABNPL5414F1ZU";

describe("GST types (party rules D2)", () => {
  it("offers exactly the server's five codes, words shown", () => {
    expect(PARTY_GST_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "REGULAR",
      "COMPOSITION",
      "SEZ",
      "OVERSEAS",
      "UNREGISTERED",
    ]);
    expect(PARTY_GST_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "Regular",
      "Composition",
      "SEZ",
      "Overseas",
      "Unregistered",
    ]);
  });

  it("reads old spellings as the server does", () => {
    expect(normalizePartyGstType("Regular")).toBe("REGULAR");
    expect(normalizePartyGstType(" sez unit ")).toBe("SEZ");
    expect(normalizePartyGstType("un-registered")).toBe("UNREGISTERED");
    expect(normalizePartyGstType("Overseas")).toBe("OVERSEAS");
    expect(normalizePartyGstType("Goods")).toBe("");
    expect(normalizePartyGstType(null)).toBe("");
  });

  it("knows which types need and which refuse a GST No", () => {
    expect(["REGULAR", "COMPOSITION", "SEZ"].every(gstTypeNeedsGstin)).toBe(true);
    expect(["UNREGISTERED", "OVERSEAS"].every(gstTypeRefusesGstin)).toBe(true);
    expect(gstTypeNeedsGstin("OVERSEAS")).toBe(false);
    expect(gstTypeRefusesGstin("SEZ")).toBe(false);
  });
});

describe("GSTIN shapes (save-customer.dto.ts CUSTOMER_GSTIN_PATTERNS)", () => {
  it("accepts every GSTN registration shape the server accepts", () => {
    expect(gstinKindOf(GSTIN_33)).toBe("NORMAL");
    expect(gstinKindOf("33ABCD12345E1DZ")).toBe("TDS_DEDUCTOR");
    expect(gstinKindOf("0717UNO00157UNA")).toBe("UIN");
    expect(gstinKindOf("9917USA29001OS5")).toBe("OIDAR");
    expect(gstinKindOf("0717USA12345NR1")).toBe("NRTP");
    for (const gstin of ["33ABCD12345E1DZ", "0717UNO00157UNA", "9917USA29001OS5", "0717USA12345NR1"]) {
      expect(validatePartyGstinFormat(gstin)).toBeNull();
    }
  });

  it("refuses junk, and a normal GSTIN whose check character is wrong (Qt TaxValidator)", () => {
    expect(validatePartyGstinFormat("33ABNPL5414F1Z")).toMatch(/not valid/);
    expect(validatePartyGstinFormat("33ABNPL5414F1ZA")).toMatch(/does not match/);
    expect(validatePartyGstinFormat("")).toBeNull();
  });
});

describe("checkPartyGstRules (the server's resolvePartyGstType)", () => {
  const base = { role: "customer" as const, stateCode: "33" };

  it("REGULAR / COMPOSITION / SEZ need a GST No", () => {
    for (const gstType of ["REGULAR", "COMPOSITION", "SEZ"]) {
      expect(checkPartyGstRules({ ...base, gstType, gstin: "" })).toMatchObject({ field: "gstin" });
    }
    expect(checkPartyGstRules({ ...base, gstType: "SEZ", gstin: GSTIN_33 })).toBeNull();
  });

  it("UNREGISTERED / OVERSEAS refuse one", () => {
    expect(checkPartyGstRules({ ...base, gstType: "UNREGISTERED", gstin: GSTIN_33 })?.message).toBe(
      "An Unregistered customer has no GST No. Clear the GST No, or choose Regular.",
    );
    expect(checkPartyGstRules({ ...base, gstType: "UNREGISTERED", gstin: "" })).toBeNull();
  });

  it("OVERSEAS needs state 96 Other Country", () => {
    expect(checkPartyGstRules({ ...base, gstType: "OVERSEAS", gstin: "" })).toMatchObject({ field: "state" });
    expect(checkPartyGstRules({ ...base, gstType: "OVERSEAS", gstin: "", stateCode: "96" })).toBeNull();
  });

  it("a normal GSTIN must start with the state's code; the other shapes are not checked", () => {
    expect(checkPartyGstRules({ ...base, gstType: "REGULAR", gstin: GSTIN_33, stateCode: "29" })?.message).toMatch(
      /from state 33, but the state is 29/,
    );
    expect(
      checkPartyGstRules({ ...base, gstType: "REGULAR", gstin: "0717UNO00157UNA", stateCode: "29" }),
    ).toBeNull();
  });

  it("a blank type is fine without a GST No (stored UNREGISTERED), not with one", () => {
    expect(checkPartyGstRules({ ...base, gstType: "", gstin: "" })).toBeNull();
    expect(checkPartyGstRules({ ...base, gstType: "", gstin: GSTIN_33 })).toMatchObject({ field: "gstType" });
    expect(checkPartyGstRules({ ...base, gstType: "FOO", gstin: "" })).toMatchObject({ field: "gstType" });
  });

  it("speaks of the supplier on the supplier form", () => {
    expect(
      checkPartyGstRules({ role: "supplier", gstType: "COMPOSITION", gstin: "", stateCode: "33" })?.message,
    ).toBe("A Composition supplier must have a GST No. Type the GST No, or choose Unregistered.");
  });
});

/** GET /customers/delete-check, as :3011 answered it on 2026-10-29. */
const REFUSED = {
  success: true,
  message: "Customer delete check",
  data: {
    partyId: "01a176c8-8955-7e24-a9f3-17da368e85c6",
    role: "CUSTOMER",
    otherRoleLive: false,
    ledgerWouldBeDeleted: true,
    canDelete: false,
    refusalCode: "CUSTOMER_HAS_BALANCE",
    balances: [
      {
        companyId: "019c8ea6-19e9-78a8-b15f-749e1cde7292",
        companyName: "Amazon Retail India Private Limited",
        amount: "7500.00",
        drCr: "DR",
      },
    ],
    warnings: { draftDocs: 0, openBills: 1, chequesInHand: 0 },
    refusals: [
      {
        field: "cusId",
        code: "CUSTOMER_HAS_BALANCE",
        message: "The customer's ledger balance is 7500.00 DR in company 019c8ea6-…",
        user: {
          title: "Cannot delete customer",
          line: "This customer still has ₹7,500.00 Dr in Amazon Retail India Private Limited.",
          todo: "Settle it to zero first, then delete.",
        },
      },
    ],
  },
};

describe("delete-check (D1)", () => {
  it("reads the live answer and hands the refusal on in the server's words", () => {
    const check = parsePartyDeleteCheck(REFUSED);
    expect(check).toMatchObject({ canDelete: false, refusalCode: "CUSTOMER_HAS_BALANCE" });
    expect(check?.balances[0]).toMatchObject({ amount: "7500.00", drCr: "DR" });
    const envelope = check ? deleteCheckRefusalEnvelope(check) : null;
    expect(envelope?.status).toBe(409);
    expect(envelope?.data.errors[0]).toMatchObject({
      code: "CUSTOMER_HAS_BALANCE",
      user: { title: "Cannot delete customer" },
    });
  });

  it("lets the delete go with the warnings and the shared-party line", () => {
    const check = parsePartyDeleteCheck({
      data: {
        ...REFUSED.data,
        canDelete: true,
        refusalCode: null,
        otherRoleLive: true,
        ledgerWouldBeDeleted: false,
        balances: [],
        refusals: [],
        warnings: { draftDocs: 2, openBills: 0, chequesInHand: 0 },
      },
    });
    expect(check && deleteCheckRefusalEnvelope(check)).toBeNull();
    expect(check && deleteCheckNotes(check, "customer")).toEqual([
      "It has 2 unposted drafts; they cannot be posted after the delete.",
      "This party is also a supplier: the supplier side keeps the ledger and its balance.",
    ]);
  });

  it("is null for an answer that is not a delete-check", () => {
    expect(parsePartyDeleteCheck({ success: true, data: {} })).toBeNull();
  });
});

describe("partySync (D4)", () => {
  it("lists what changed on the other side, in words", () => {
    const sync = parsePartySync({
      success: true,
      data: {
        cusId: "x",
        partySync: { otherRole: "SUPPLIER", otherRoleUpdated: true, fields: ["supAddr1", "supPhone", "supStateName", "supStateCode"] },
      },
    });
    expect(partySyncMessage(sync)).toBe("Saved. Supplier record updated too: Address 1, Phone, State.");
  });

  it("says nothing when the other row did not change or there is none", () => {
    expect(
      partySyncMessage(parsePartySync({ data: { partySync: { otherRole: "CUSTOMER", otherRoleUpdated: false, fields: [] } } })),
    ).toBeNull();
    expect(partySyncMessage(parsePartySync({ data: { partySync: { otherRole: null, otherRoleUpdated: false, fields: [] } } }))).toBeNull();
    expect(parsePartySync({ data: {} })).toBeNull();
  });
});

describe("Country on State 96 Other Country", () => {
  it("blanks the India default when the state becomes 96", () => {
    expect(countryForStateChange("96", "India")).toBe("");
    expect(countryForStateChange("96", " INDIA ")).toBe("");
  });
  it("keeps a country the operator typed, and leaves other states alone", () => {
    expect(countryForStateChange("96", "Singapore")).toBeUndefined();
    expect(countryForStateChange("96", "")).toBeUndefined();
    expect(countryForStateChange("33", "India")).toBeUndefined();
    expect(countryForStateChange(undefined, "India")).toBeUndefined();
  });
});
