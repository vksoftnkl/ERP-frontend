import { describe, expect, it } from "vitest";
import { extractLedgerRecord, prefillFromLedger } from "./party-role-link";

/** GET /account-ledger-masters/get?ledId= for a supplier's ledger. */
const LEDGER = {
  ledId: "019f0000-0000-7000-8000-000000000001",
  ledName: "ACME TRADERS",
  ledShort: "ACME",
  ledGstinNo: "33ABNPL5414F1ZU",
  ledPanNo: "ABNPL5414F",
  ledEcommerceGstin: null,
  ledAddr1: "12, Mill Road",
  ledAddr2: "",
  ledCity: "Coimbatore",
  ledDistrict: "Coimbatore",
  ledPin: "641001",
  ledCountry: "India",
  ledStateCode: "33",
  ledStateName: "Tamil Nadu",
  ledTel: null,
  ledPhone1: "9876543210",
  ledPhone2: "9123456780",
  ledWhatsappNo: "9876543210",
  ledEmail: "accounts@acme.test",
  ledAadharNo: "123412341234",
  ledContactPerson: "Ravi",
  ledCompanyId: "019f0000-0000-7000-8000-0000000000aa",
  ledCompanyName: "NEX DEMO CO",
  ledBranchId: null,
  ledBranchName: null,
  ledRegionName: "அக்மி",
  ledRegionStateName: "தமிழ்நாடு",
  ledGstPartyRegType: "COMPOSITION",
};

describe("prefillFromLedger", () => {
  it("maps the ledger onto the customer form's own field names", () => {
    const { values, labels } = prefillFromLedger(LEDGER, "customer");
    expect(values).toMatchObject({
      cusName: "ACME TRADERS",
      cusShort: "ACME",
      cusGstNo: "33ABNPL5414F1ZU",
      cusPanNo: "ABNPL5414F",
      cusAddr1: "12, Mill Road",
      cusPin: "641001",
      cusStateCode: "33",
      cusPhone1: "9876543210",
      cusPhone2: "9123456780",
      cusEmail: "accounts@acme.test",
      cusAadharNo: "123412341234",
      cusContactPerson: "Ravi",
      cusCompanyId: "019f0000-0000-7000-8000-0000000000aa",
      cusRegionName: "அக்மி",
      cusRegionStateName: "தமிழ்நாடு",
      // The customer select codes it.
      cusGstType: "COMPOSITION",
    });
    expect(labels).toEqual({
      companyName: "NEX DEMO CO",
      branchName: "",
      stateName: "Tamil Nadu",
    });
  });

  it("names the supplier's fields its own way and skips what it has no field for", () => {
    const { values } = prefillFromLedger(LEDGER, "supplier");
    expect(values).toMatchObject({
      supName: "ACME TRADERS",
      supPincode: "641001",
      supPhone: "9876543210",
      supMailId: "accounts@acme.test",
      supStateCode: "33",
      supStateName: "Tamil Nadu",
      // The supplier select holds the Qt words.
      supGstType: "Composition",
    });
    for (const key of Object.keys(values)) {
      expect(key.startsWith("sup")).toBe(true);
    }
    expect(Object.values(values)).not.toContain("9123456780");
    expect(Object.values(values)).not.toContain("123412341234");
    expect(Object.values(values)).not.toContain("Ravi");
  });

  it("leaves blank and null ledger values out so form defaults survive", () => {
    const { values } = prefillFromLedger(LEDGER, "customer");
    expect(values).not.toHaveProperty("cusAddr2");
    expect(values).not.toHaveProperty("cusTel");
    expect(values).not.toHaveProperty("cusBranchId");
    expect(values).not.toHaveProperty("cusEcommerceGstin");
  });

  it("reads an unset registration type off the GSTIN", () => {
    const registered = { ...LEDGER, ledGstPartyRegType: null };
    expect(prefillFromLedger(registered, "customer").values.cusGstType).toBe("REGULAR");
    const unregistered = { ...registered, ledGstinNo: "" };
    expect(prefillFromLedger(unregistered, "supplier").values.supGstType).toBe("Unregistered");
  });
});

describe("extractLedgerRecord", () => {
  it("takes the record out of the response envelope", () => {
    expect(extractLedgerRecord({ success: true, data: LEDGER })).toBe(LEDGER);
    expect(extractLedgerRecord({ data: [LEDGER] })).toBe(LEDGER);
    expect(extractLedgerRecord(LEDGER)).toBe(LEDGER);
    expect(extractLedgerRecord({ success: true, data: null })).toBeNull();
    expect(extractLedgerRecord(null)).toBeNull();
  });
});
