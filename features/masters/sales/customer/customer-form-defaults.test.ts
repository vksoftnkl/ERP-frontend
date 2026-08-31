import { describe, expect, it } from "vitest";
import {
  EMPTY_CUSTOMER_TEMPLATE_DEFAULTS,
  parseCustomerFormDefaults,
} from "./customer-dropdowns";

// The value verbatim out of `masters.customer_form_defaults` on the dev server, written
// by the POS: typed JSON, ids with a `*Name` companion, no cusCompanyId (the POS takes
// the company from the scope the override sits at), and one array field this form has no
// control for.
const SAVED_VALUE = JSON.stringify({
  cusAllowDiscount: true,
  cusAllowLoyalty: false,
  cusAreaId: "019f1710-505d-78f8-9f58-12d242859217",
  cusAreaName: "MUSIRI",
  cusCollectionDays: [0],
  cusCountry: "India",
  cusCreditAllowed: true,
  cusCreditDays: 35,
  cusGroupId: "019f213b-aa13-745a-aee9-93c7445b407b",
  cusGroupName: "VIP Parties",
  cusGstType: "Unregistered",
  cusPriceLevelId: "1",
  cusPriceLevelName: "WS Price",
  cusStateCode: "33",
  cusStateName: "Tamil Nadu",
});

describe("parseCustomerFormDefaults", () => {
  it("reads the id/label pairs the lazy dropdowns are seeded from", () => {
    const defaults = parseCustomerFormDefaults(SAVED_VALUE);

    expect(defaults.area).toEqual({
      id: "019f1710-505d-78f8-9f58-12d242859217",
      label: "MUSIRI",
    });
    expect(defaults.group).toEqual({
      id: "019f213b-aa13-745a-aee9-93c7445b407b",
      label: "VIP Parties",
    });
    expect(defaults.state).toEqual({ code: "33", name: "Tamil Nadu" });
    // The POS omits the company — it is implied by the layer the override sits at.
    expect(defaults.company).toBeNull();
  });

  it("flattens typed values to the strings the modal holds", () => {
    const { fieldValues } = parseCustomerFormDefaults(SAVED_VALUE);

    expect(fieldValues.cusAllowDiscount).toBe("true");
    expect(fieldValues.cusAllowLoyalty).toBe("false");
    expect(fieldValues.cusCreditDays).toBe("35");
    expect(fieldValues.cusCountry).toBe("India");
    // cusStateCode is a real form field and rides in with the rest; the LABEL keys of
    // the seeded dropdowns must not, or a name would land in the form as a value.
    expect(fieldValues.cusStateCode).toBe("33");
    expect(fieldValues.cusAreaName).toBeUndefined();
    expect(fieldValues.cusGroupName).toBeUndefined();
    // A multi-select: the document holds day numbers, the modal a comma list.
    expect(fieldValues.cusCollectionDays).toBe("0");
  });

  it("upper-cases the GST type the POS stores as a label", () => {
    expect(parseCustomerFormDefaults(SAVED_VALUE).fieldValues.cusGstType).toBe("UNREGISTERED");
  });

  it("coerces a checkbox value the modal could not hold", () => {
    const { fieldValues } = parseCustomerFormDefaults(
      JSON.stringify({ cusCreditAllowed: "yes", cusAllowLoyalty: 0 }),
    );
    expect(fieldValues.cusCreditAllowed).toBe("true");
    expect(fieldValues.cusAllowLoyalty).toBe("false");
  });

  it("applies the country and state fallbacks only where the template is silent", () => {
    const silent = parseCustomerFormDefaults(JSON.stringify({ cusCity: "MUSIRI" }));
    expect(silent.state).toEqual({ code: "33", name: "Tamil Nadu" });
    expect(silent.fieldValues.cusStateCode).toBe("33");
    expect(silent.fieldValues.cusCountry).toBe("India");

    const opinionated = parseCustomerFormDefaults(
      JSON.stringify({ cusStateCode: "29", cusStateName: "Karnataka", cusCountry: "Sri Lanka" }),
    );
    expect(opinionated.state).toEqual({ code: "29", name: "Karnataka" });
    expect(opinionated.fieldValues.cusCountry).toBe("Sri Lanka");
  });

  it("ignores a key this build does not have", () => {
    const { fieldValues } = parseCustomerFormDefaults(
      JSON.stringify({ cusSomethingFromANewerBuild: "x", cusCity: "MUSIRI" }),
    );
    expect(fieldValues.cusCity).toBe("MUSIRI");
  });

  it("falls back to empty defaults for an unset or unusable value", () => {
    expect(parseCustomerFormDefaults(null)).toBe(EMPTY_CUSTOMER_TEMPLATE_DEFAULTS);
    expect(parseCustomerFormDefaults("   ")).toBe(EMPTY_CUSTOMER_TEMPLATE_DEFAULTS);
    expect(parseCustomerFormDefaults("not json")).toBe(EMPTY_CUSTOMER_TEMPLATE_DEFAULTS);
    expect(parseCustomerFormDefaults("[1,2]")).toBe(EMPTY_CUSTOMER_TEMPLATE_DEFAULTS);
  });
});
