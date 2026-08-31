import { describe, expect, it } from "vitest";
import { buildFormDefaults, type FormDefaultsFieldSpec } from "./build-form-defaults";
import { CUSTOMER_TEMPLATE_EXCLUDED } from "@/features/masters/sales/customer/template/excluded";
import { CUSTOMER_TEMPLATE_FIELD_SPECS } from "@/features/masters/sales/customer/template/field-specs";
import { parseCustomerFormDefaults } from "@/features/masters/sales/customer/customer-dropdowns";

const SPECS: FormDefaultsFieldSpec[] = CUSTOMER_TEMPLATE_FIELD_SPECS;
const OPTIONS = { specs: SPECS, excluded: CUSTOMER_TEMPLATE_EXCLUDED };

// A filled Customer Entry form, as the modal holds it: every value a string.
const DRAFT: Record<string, string> = {
  cusName: "Ravi Stores",
  cusShort: "RAVI",
  cusCode: "C001",
  cusGstNo: "33ABCDE1234F1Z5",
  cusPanNo: "ABCDE1234F",
  cusAadharNo: "123456789012",
  cusEcommerceGstin: "",
  cusContactPerson: "Ravi",
  cusTel: "0431-222222",
  cusPhone1: "9000000001",
  cusPhone2: "",
  cusWhatsappNo: "9000000001",
  cusEmail: "ravi@example.com",
  cusNotes: "Pays on time",
  cusBirthDate: "1990-01-01",
  cusMarriageDate: "",
  cusBilledCount: "17",
  cusBilledDate: "2026-08-30",
  cusGeoLocation: "10.8,78.7",
  cusAreaId: "019f1710-505d-78f8-9f58-12d242859217",
  cusGroupId: "019f213b-aa13-745a-aee9-93c7445b407b",
  cusStateCode: "33",
  cusPriceLevelId: "1",
  cusCompanyId: "",
  cusBranchId: "",
  cusCountry: "India",
  cusCity: "MUSIRI",
  cusCreditAllowed: "false",
  cusAllowDiscount: "true",
  cusCreditDays: "0",
  cusCreditAmtLimit: "2500.5",
  cusDiscPerc: "",
  cusCollectionDays: "0,3",
  cusGstType: "UNREGISTERED",
};
const LABELS = {
  cusAreaId: "MUSIRI",
  cusGroupId: "VIP Parties",
  cusStateCode: "Tamil Nadu",
  cusPriceLevelId: "WS Price",
};

function build(values: Record<string, string>, labels = LABELS): Record<string, unknown> {
  return JSON.parse(buildFormDefaults(values, { ...OPTIONS, labels })) as Record<string, unknown>;
}

describe("buildFormDefaults", () => {
  it("drops every identity field", () => {
    const document = build(DRAFT);
    for (const excluded of CUSTOMER_TEMPLATE_EXCLUDED) {
      expect(document, excluded).not.toHaveProperty(excluded);
    }
  });

  it("writes each dropdown id with its display text, and neither without the other", () => {
    const document = build(DRAFT);
    expect(document.cusAreaId).toBe("019f1710-505d-78f8-9f58-12d242859217");
    expect(document.cusAreaName).toBe("MUSIRI");
    expect(document.cusGroupName).toBe("VIP Parties");
    expect(document.cusStateName).toBe("Tamil Nadu");
    expect(document.cusPriceLevelName).toBe("WS Price");
    // Nothing selected: no id, and therefore no dangling label either.
    expect(document).not.toHaveProperty("cusCompanyId");
    expect(document).not.toHaveProperty("cusCompanyName");
  });

  it("drops a label whose id was excluded", () => {
    const document = JSON.parse(
      buildFormDefaults(DRAFT, {
        ...OPTIONS,
        excluded: [...CUSTOMER_TEMPLATE_EXCLUDED, "cusGroupId"],
        labels: LABELS,
      }),
    ) as Record<string, unknown>;
    expect(document).not.toHaveProperty("cusGroupId");
    expect(document).not.toHaveProperty("cusGroupName");
  });

  it("re-derives a label rather than trusting one carried in the draft", () => {
    const seeded = { ...DRAFT, cusAreaName: "AN OLD AREA" };
    expect(build(seeded).cusAreaName).toBe("MUSIRI");
  });

  it("treats empty as NOT SET, and keeps false, 0 and [0]", () => {
    const document = build({
      ...DRAFT,
      cusAddr1: "",
      cusAddr2: "   ",
      cusDiscPerc: "",
      cusCollectionDays: "0",
    });
    expect(document).not.toHaveProperty("cusAddr1");
    expect(document).not.toHaveProperty("cusAddr2");
    expect(document).not.toHaveProperty("cusDiscPerc");
    expect(document.cusCreditAllowed).toBe(false);
    expect(document.cusCreditDays).toBe(0);
    expect(document.cusCollectionDays).toEqual([0]);
  });

  it("stores each field as the type the document uses", () => {
    const document = build(DRAFT);
    expect(document.cusAllowDiscount).toBe(true);
    expect(document.cusCreditAmtLimit).toBe(2500.5);
    expect(document.cusCollectionDays).toEqual([0, 3]);
    // Ids are round-tripped as they stand — "1" is a real price level id.
    expect(document.cusPriceLevelId).toBe("1");
    expect(document.cusCity).toBe("MUSIRI");
  });

  it("is stable: the same draft builds the same bytes twice", () => {
    expect(buildFormDefaults(DRAFT, { ...OPTIONS, labels: LABELS })).toBe(
      buildFormDefaults(DRAFT, { ...OPTIONS, labels: LABELS }),
    );
  });

  // Key ORDER follows the draft's own key order, so the round trip is asserted on
  // the document rather than the bytes — nothing may be added, dropped or retyped.
  it("round-trips through apply and build unchanged", () => {
    const first = buildFormDefaults(DRAFT, { ...OPTIONS, labels: LABELS });
    const applied = parseCustomerFormDefaults(first);
    const redraft: Record<string, string> = {
      ...applied.fieldValues,
      cusAreaId: applied.area?.id ?? "",
      cusGroupId: applied.group?.id ?? "",
      cusStateCode: applied.state?.code ?? "",
    };
    const labels = {
      cusAreaId: applied.area?.label ?? "",
      cusGroupId: applied.group?.label ?? "",
      cusStateCode: applied.state?.name ?? "",
      cusPriceLevelId: "WS Price",
    };
    expect(JSON.parse(buildFormDefaults(redraft, { ...OPTIONS, labels }))).toEqual(
      JSON.parse(first),
    );
  });

  it("is compact JSON", () => {
    expect(buildFormDefaults(DRAFT, OPTIONS)).not.toContain("\n");
  });
});
