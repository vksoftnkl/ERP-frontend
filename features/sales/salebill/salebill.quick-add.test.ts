/**
 * Sale Bill Entry — Quick-add Customer (§7.7): the Qt dialog's validation
 * order, its GSTIN autofill and the create DTO. Pure.
 */
import { describe, expect, it } from "vitest";
import { gstinCheckCharacter } from "@/utils/validation";
import {
  NO_QUICK_ADD_TEMPLATE,
  QUICK_ADD_PRICE_LEVEL,
  buildQuickAddCustomerDto,
  emptyQuickAddForm,
  gstinLeftPatch,
  openingQuickAddForm,
  quickAddTemplateFrom,
  quickAddViolation,
  type QuickAddForm,
} from "./salebill.quick-add";

/** A GSTIN that passes the format AND the mod-36 checksum. */
function validGstin(stateCode: string): string {
  const firstFourteen = `${stateCode}AAAAA9999A1Z`;
  return `${firstFourteen}${gstinCheckCharacter(firstFourteen)}`;
}

const ready: QuickAddForm = {
  ...emptyQuickAddForm({ code: "33", name: "Tamil Nadu" }),
  name: "ACME TRADERS",
  areaId: "area-1",
  areaName: "TOWN",
  groupId: "group-1",
  groupName: "RETAIL",
};

describe("quickAddViolation", () => {
  it("asks for the name, then the area, the group and the state, in the Qt order", () => {
    expect(quickAddViolation({ ...ready, name: "  ", areaId: "" })?.field).toBe("name");
    expect(quickAddViolation({ ...ready, areaId: "", groupId: "" })?.field).toBe("area");
    expect(quickAddViolation({ ...ready, groupId: "" })?.field).toBe("group");
    expect(quickAddViolation({ ...ready, stateCode: "" })?.field).toBe("state");
    expect(quickAddViolation(ready)).toBeNull();
  });

  it("refuses a state whose name never resolved — cusStateName is required", () => {
    expect(quickAddViolation({ ...ready, stateCode: "29", stateName: "" })?.field).toBe("state");
  });

  it("an unregistered customer carries no GSTIN", () => {
    const violation = quickAddViolation({ ...ready, gstin: validGstin("33") });
    expect(violation?.field).toBe("gstin");
    expect(violation?.message).toMatch(/unregistered/i);
  });

  it("a registered customer needs a valid GSTIN issued in the picked state", () => {
    expect(quickAddViolation({ ...ready, gstType: "REGULAR" })?.message).toMatch(/mandatory for a Regular/);
    expect(quickAddViolation({ ...ready, gstType: "REGULAR", gstin: "33AAAAA9999A1Z" })?.message).toMatch(/not valid/);
    // Right shape, wrong check character.
    const good = validGstin("33");
    const badCheck = `${good.slice(0, 14)}${good[14] === "0" ? "1" : "0"}`;
    expect(quickAddViolation({ ...ready, gstType: "REGULAR", gstin: badCheck })?.message).toMatch(/not valid/);
    expect(quickAddViolation({ ...ready, gstType: "REGULAR", gstin: validGstin("29") })?.message).toMatch(
      /starts with '29' but the state picked is '33'/,
    );
    expect(quickAddViolation({ ...ready, gstType: "REGULAR", gstin: good })).toBeNull();
    expect(quickAddViolation({ ...ready, gstType: "COMPOSITION", gstin: good.toLowerCase() })).toBeNull();
  });
});

describe("gstinLeftPatch", () => {
  it("upper-cases, makes the customer Regular and moves the state to the GSTIN's", () => {
    const gstin = validGstin("29");
    expect(gstinLeftPatch({ ...ready, gstin: ` ${gstin.toLowerCase()} ` })).toEqual({
      gstin,
      gstType: "REGULAR",
      stateCode: "29",
      stateName: "",
    });
  });

  it("keeps Composition, and leaves a state that already agrees", () => {
    expect(gstinLeftPatch({ ...ready, gstType: "COMPOSITION", gstin: validGstin("33") })).toEqual({});
  });

  it("a cleared GSTIN makes the customer Unregistered", () => {
    expect(gstinLeftPatch({ ...ready, gstType: "REGULAR", gstin: "" })).toEqual({ gstType: "UNREGISTERED" });
    expect(gstinLeftPatch(ready)).toEqual({});
  });

  it("leading characters that are no state code leave the state alone", () => {
    expect(gstinLeftPatch({ ...ready, gstin: "ab12" })).toEqual({ gstin: "AB12", gstType: "REGULAR" });
  });
});

describe("buildQuickAddCustomerDto", () => {
  it("sends only what the dialog asks for, with the sales default price level", () => {
    const gstin = validGstin("33");
    expect(
      buildQuickAddCustomerDto(
        { ...ready, name: " ACME TRADERS ", phone: " 98400 ", gstType: "REGULAR", gstin: gstin.toLowerCase() },
        { companyId: "co-1", branchId: "br-1" },
      ),
    ).toEqual({
      cusName: "ACME TRADERS",
      cusPhone1: "98400",
      cusGstNo: gstin,
      cusGstType: "REGULAR",
      cusAreaId: "area-1",
      cusGroupId: "group-1",
      cusStateCode: "33",
      cusStateName: "Tamil Nadu",
      cusPriceLevelId: QUICK_ADD_PRICE_LEVEL,
      cusCompanyId: "co-1",
      cusBranchId: "br-1",
      cusIsActive: true,
    });
  });

  it("a blank phone and GSTIN go over as null", () => {
    const dto = buildQuickAddCustomerDto(ready, { companyId: "co-1", branchId: "br-1" });
    expect(dto.cusPhone1).toBeNull();
    expect(dto.cusGstNo).toBeNull();
    expect(dto.cusGstType).toBe("UNREGISTERED");
  });
});

/** The COMPANY row the dev DB holds — written by the POS, so typed values and label companions. */
const POS_TEMPLATE = JSON.stringify({
  cusGroupId: "grp-vip",
  cusGroupName: "VIP Parties",
  cusCompanyId: "co-template",
  cusCompanyName: "Acme Foods Pvt Ltd",
  cusAreaId: "area-musiri",
  cusAreaName: "MUSIRI",
  cusGstType: "Regular",
  cusPriceLevelId: "2",
  cusPriceLevelName: "Retail",
  cusIsActive: false,
  cusSortOrder: 0,
  cusStateCode: "33",
  cusStateName: "Tamil Nadu",
  cusCountry: "India",
  cusCreditAllowed: false,
  cusCreditDays: 32,
  cusCreditBillLimit: 32,
  cusCreditAmtLimit: 232.5,
  cusDebitGraceDays: 23,
  cusDebitBalance: 3,
  cusDiscPerc: 2.5,
  cusAllowDiscount: true,
  cusAllowLoyalty: true,
  cusAllowPromotion: false,
  cusEnableSms: true,
  cusOverdueSms: true,
  cusOverdueBilling: true,
  cusTcsApplicable: true,
  cusItcollExempted: true,
  cusFreightCharge: true,
  cusLoadingCharge: true,
  cusUnloadingCharge: false,
  cusDistanceKm: 0,
  cusCollectionDays: [0, 3, 5, 3],
  cusRegionCountry: "India",
  cusItcollType: "TCS",
  // Identity fields a template should never carry, and a key no DTO knows.
  cusName: "SOMEBODY",
  cusPhone1: "99999",
  cusGstNo: "33AAAAA9999A1Z5",
  cusSomethingNew: "x",
});

describe("quickAddTemplateFrom (Customer Template)", () => {
  it("fills the dialog's own boxes from the template", () => {
    const template = quickAddTemplateFrom(POS_TEMPLATE);
    expect(template.present).toBe(true);
    expect(template.seeds).toEqual({
      gstType: "REGULAR",
      areaId: "area-musiri",
      areaName: "MUSIRI",
      groupId: "grp-vip",
      groupName: "VIP Parties",
      stateCode: "33",
      stateName: "Tamil Nadu",
    });
    expect(template.priceLevelId).toBe(2);
  });

  it("carries the rest typed as the customer master sends it, and nothing else", () => {
    const { extras } = quickAddTemplateFrom(POS_TEMPLATE);
    expect(extras).toEqual({
      cusCountry: "India",
      cusRegionCountry: "India",
      cusItcollType: "TCS",
      cusCreditBillLimit: 32,
      cusCreditDays: 32,
      cusDebitGraceDays: 23,
      cusSortOrder: 0,
      cusDistanceKm: 0,
      cusCreditAmtLimit: 232.5,
      cusDebitBalance: 3,
      cusDiscPerc: 2.5,
      cusEnableSms: true,
      cusOverdueSms: true,
      cusOverdueBilling: true,
      cusAllowPromotion: false,
      cusAllowLoyalty: true,
      cusAllowDiscount: true,
      cusFreightCharge: true,
      cusLoadingCharge: true,
      cusUnloadingCharge: false,
      cusTcsApplicable: true,
      cusItcollExempted: true,
      // Unticked, but the limits say credit — the master's own rule.
      cusCreditAllowed: true,
      // Weekdays 1-7 only, once each.
      cusCollectionDays: [3, 5],
    });
  });

  it("no template, or an unreadable one, is no template", () => {
    expect(quickAddTemplateFrom(null)).toBe(NO_QUICK_ADD_TEMPLATE);
    expect(quickAddTemplateFrom("{not json")).toBe(NO_QUICK_ADD_TEMPLATE);
  });

  it("drops an area or group stored without its name, and keeps a nameless state for lookup", () => {
    const template = quickAddTemplateFrom(JSON.stringify({ cusAreaId: "a-1", cusGroupId: "g-1", cusStateCode: "29" }));
    expect(template.seeds).toEqual({ stateCode: "29", stateName: "" });
    expect(template.extras).toEqual({});
    expect(template.priceLevelId).toBeNull();
  });

  it("opens on the template, else on the company's state", () => {
    const company = { code: "29", name: "Karnataka" };
    expect(openingQuickAddForm(NO_QUICK_ADD_TEMPLATE, company)).toEqual(emptyQuickAddForm(company));
    const opened = openingQuickAddForm(quickAddTemplateFrom(POS_TEMPLATE), company);
    expect(opened).toMatchObject({ name: "", gstType: "REGULAR", areaName: "MUSIRI", groupName: "VIP Parties", stateCode: "33" });
    const noState = openingQuickAddForm(quickAddTemplateFrom(JSON.stringify({ cusGstType: "Composition" })), company);
    expect(noState).toMatchObject({ gstType: "COMPOSITION", stateCode: "29", stateName: "Karnataka" });
  });

  it("goes into the create under the dialog's own keys, with the bill's scope and its price level", () => {
    const template = quickAddTemplateFrom(POS_TEMPLATE);
    const dto = buildQuickAddCustomerDto(
      { ...openingQuickAddForm(template, { code: "33", name: "Tamil Nadu" }), name: "NEW ONE", gstType: "UNREGISTERED" },
      { companyId: "co-1", branchId: "br-1" },
      template,
    );
    expect(dto).toMatchObject({
      cusName: "NEW ONE",
      cusPhone1: null,
      cusGstNo: null,
      cusGstType: "UNREGISTERED",
      cusAreaId: "area-musiri",
      cusGroupId: "grp-vip",
      cusPriceLevelId: 2,
      cusCompanyId: "co-1",
      cusBranchId: "br-1",
      cusIsActive: true,
      cusCreditDays: 32,
      cusFreightCharge: true,
    });
    expect(dto).not.toHaveProperty("cusSomethingNew");
    expect(dto).not.toHaveProperty("cusAreaName");
  });
});
