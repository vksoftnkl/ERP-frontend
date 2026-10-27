import { describe, expect, it } from "vitest";
import { buildGstinFieldValidators } from "@/features/masters/shared/gst-registration";
import {
  COMPANY_GSTIN_FIELDS,
  COMPANY_INITIAL_FORM_VALUES,
  SIGNATURE_PREVIEW_FIELD,
  buildCompanyFormFields,
  buildCompanyRequestPayload,
  buildStateCodeByName,
  buildStateNameByCode,
  fiscalYearFieldValidator,
  getCompanyFieldValue,
  mapCompanyFormValues,
  toSnakeCaseKey,
} from "./companies";

const FIELD = {} as never;
const NO_HANDLERS = {
  onSearchOpenChange: () => undefined,
  onSearchQueryChange: () => undefined,
  onValueChange: () => undefined,
} as never;

function formFields(stateCodeOf: (values: Record<string, string>) => string = () => "") {
  return buildCompanyFormFields({
    bankOptions: [],
    bankHandlers: NO_HANDLERS,
    stateOptions: [],
    stateHandlers: NO_HANDLERS,
    appThemeOptions: [],
    appThemeHandlers: NO_HANDLERS,
    onCompanyGstinValueChange: () => undefined,
    gstinValidators: buildGstinFieldValidators({ fields: COMPANY_GSTIN_FIELDS, stateCodeOf }),
  });
}

function field(name: string, stateCodeOf?: (values: Record<string, string>) => string) {
  const found = formFields(stateCodeOf).find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`no field ${name}`);
  }
  return found;
}

describe("state lookup maps", () => {
  const payload = {
    data: [
      { stateName: "Gujarat", id: "24" },
      { state_name: "Kerala", state_code: "32" },
      { name: "Goa", code: "gb" },
    ],
  };

  it("maps state names to upper-cased codes", () => {
    expect(buildStateCodeByName(payload)).toEqual({ Gujarat: "24", Kerala: "32", Goa: "GB" });
  });

  it("maps codes back to state names", () => {
    expect(buildStateNameByCode(payload)).toEqual({ "24": "Gujarat", "32": "Kerala", GB: "Goa" });
  });

  it("reads a bare array and any of the known wrapper keys", () => {
    expect(buildStateCodeByName([{ name: "Goa", code: "30" }])).toEqual({ Goa: "30" });
    expect(buildStateCodeByName({ states: [{ name: "Goa", code: "30" }] })).toEqual({ Goa: "30" });
    expect(buildStateNameByCode({ stateCodes: [{ name: "Goa", code: "30" }] })).toEqual({ "30": "Goa" });
  });

  it("skips non-object rows and rows missing a name or a code", () => {
    const messy = [null, "x", ["a"], { name: "", code: "01" }, { name: "Goa" }, { name: "Kerala", code: "32" }];
    expect(buildStateCodeByName(messy)).toEqual({ Kerala: "32" });
    expect(buildStateNameByCode(messy)).toEqual({ "32": "Kerala" });
  });

  it("keeps the first row when a name or a code repeats", () => {
    const dupes = [
      { name: "Goa", code: "30" },
      { name: "Goa", code: "99" },
      { name: "Other", code: "30" },
    ];
    expect(buildStateCodeByName(dupes)).toEqual({ Goa: "30", Other: "30" });
    expect(buildStateNameByCode(dupes)).toEqual({ "30": "Goa", "99": "Goa" });
  });

  it("returns empty maps for an empty or unusable payload", () => {
    expect(buildStateCodeByName(null)).toEqual({});
    expect(buildStateNameByCode(undefined)).toEqual({});
    expect(buildStateCodeByName({ data: "nope" })).toEqual({});
  });

  it("accepts numeric codes from the server", () => {
    expect(buildStateCodeByName([{ name: "Gujarat", id: 24 }])).toEqual({ Gujarat: "24" });
  });
});

describe("field key helpers", () => {
  it("turns camelCase names into snake_case", () => {
    expect(toSnakeCaseKey("compGstinNo")).toBe("comp_gstin_no");
    expect(toSnakeCaseKey("name")).toBe("name");
  });

  it("reads the camelCase key first and the snake_case key second", () => {
    expect(getCompanyFieldValue({ compName: "A", comp_name: "B" }, "compName")).toBe("A");
    expect(getCompanyFieldValue({ comp_name: "B" }, "compName")).toBe("B");
    expect(getCompanyFieldValue({ compName: "", comp_name: "B" }, "compName")).toBe("B");
    expect(getCompanyFieldValue({}, "compName")).toBeUndefined();
  });
});

describe("fiscal year field validator", () => {
  const create = { __editing: "false" };

  it("reports a failure only on the field it belongs to", () => {
    const values = {
      ...create,
      compFinYearFrom: "2025-05-01",
      compFinYearTo: "2026-03-31",
      compBooksBeginFrom: "2025-05-01",
    };
    expect(fiscalYearFieldValidator("from")("", values)).toBe("Financial Year From must be 1 April.");
    expect(fiscalYearFieldValidator("to")("", values)).toBeNull();
    expect(fiscalYearFieldValidator("books")("", values)).toBeNull();
  });

  it("accepts a consistent financial year", () => {
    const values = {
      ...create,
      compFinYearFrom: "2025-04-01",
      compFinYearTo: "2026-03-31",
      compBooksBeginFrom: "2025-04-01",
    };
    for (const key of ["from", "to", "books"] as const) {
      expect(fiscalYearFieldValidator(key)("", values)).toBeNull();
    }
  });

  it("flags books that begin outside the year", () => {
    const values = {
      ...create,
      compFinYearFrom: "2025-04-01",
      compFinYearTo: "2026-03-31",
      compBooksBeginFrom: "2027-01-01",
    };
    expect(fiscalYearFieldValidator("books")("", values)).toBe(
      "Books Begin From must fall inside the financial year.",
    );
  });

  it("is skipped on edit, where the three dates are read-only", () => {
    const values = {
      __editing: "true",
      compFinYearFrom: "2025-05-01",
      compFinYearTo: "",
      compBooksBeginFrom: "",
    };
    expect(fiscalYearFieldValidator("from")("", values)).toBeNull();
  });
});

describe("company form fields", () => {
  it("is wired to the three fiscal year validators and read-only on edit", () => {
    for (const name of ["compFinYearFrom", "compFinYearTo", "compBooksBeginFrom"]) {
      const entry = field(name);
      expect(entry.disabledWhen?.({ __editing: "true" })).toBe(true);
      expect(entry.disabledWhen?.({ __editing: "false" })).toBe(false);
    }
    const values = {
      __editing: "false",
      compFinYearFrom: "2025-04-02",
      compFinYearTo: "2026-03-31",
      compBooksBeginFrom: "2025-04-02",
    };
    expect(field("compFinYearFrom").validation?.custom?.("", values, FIELD)).toBe(
      "Financial Year From must be 1 April.",
    );
  });

  it("requires at least one delivery-challan purpose", () => {
    const custom = field("compDcPurposes").validation?.custom;
    expect(custom?.("", {}, FIELD)).toBe("Tick at least one delivery-challan purpose.");
    expect(custom?.("   ", {}, FIELD)).toBe("Tick at least one delivery-challan purpose.");
    expect(custom?.("SUPPLY", {}, FIELD)).toBeNull();
  });

  it("uses the exact required-field messages", () => {
    expect(field("compName").validation?.requiredMessage).toBe("Enter the company name.");
    expect(field("compGstRegType").validation?.requiredMessage).toBe("Choose registration type.");
    expect(field("compPriceFixing").validation?.requiredMessage).toBe("Choose price fixing.");
    expect(field("compState").validation?.requiredMessage).toBe("Choose state name.");
    expect(field("compAatoClass").validation?.requiredMessage).toBe("Choose the turnover band.");
    expect(field("compStylesheetId").validation?.requiredMessage).toBe("Stylesheet is required.");
  });

  it("describes the PAN format and length rules", () => {
    const pan = field("compPanNo").validation;
    expect(pan?.minLength).toBe(10);
    expect(pan?.maxLength).toBe(10);
    expect(pan?.minLengthMessage).toBe("PAN No must be exactly 10 characters.");
    expect(pan?.patternMessage).toBe("PAN No must match the standard PAN format.");
    const pattern = new RegExp(pan?.pattern as string);
    expect(pattern.test("ABCDE1234F")).toBe(true);
    expect(pattern.test("abcde1234f")).toBe(true);
    expect(pattern.test("ABCD12345F")).toBe(false);
    expect(pattern.test("ABCDE1234")).toBe(false);
  });

  it("cross-checks the GSTIN against the picked state and the typed PAN", () => {
    const gstin = field("compGstinNo", () => "27").validation?.custom;
    const pan = field("compPanNo").validation?.custom;
    const values = {
      compGstinNo: "24AAACC1206D1ZM",
      compGstRegType: "REGULAR",
      compPanNo: "ZZZZZ9999Z",
      compState: "Maharashtra",
    };
    expect(gstin?.(values.compGstinNo, values, FIELD)).toContain("state code 24");
    expect(pan?.(values.compPanNo, values, FIELD)).toBeTruthy();
    expect(
      field("compGstinNo", () => "24").validation?.custom?.("", { ...values, compGstinNo: "" }, FIELD),
    ).toBeTruthy();
  });

  it("keeps the numeric floor messages", () => {
    expect(field("compPin").validation?.minMessage).toBe("Pin Code must be 0 or greater.");
    expect(field("compEwayInterLimit").validation?.minMessage).toBe(
      "Other State Limit must be 0 or greater.",
    );
    expect(field("compEwayIntraLimit").validation?.minMessage).toBe(
      "Own State Limit must be 0 or greater.",
    );
  });

  it("keeps the length limit messages", () => {
    expect(field("compName").validation?.minLengthMessage).toBe(
      "Company Name must be at least 2 characters.",
    );
    expect(field("compCode").validation?.maxLengthMessage).toBe(
      "Company Code must be at most 20 characters.",
    );
    expect(field("compCurrencyCode").validation?.maxLength).toBe(3);
  });

  it("declares every field once", () => {
    const names = formFields().map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("mapCompanyFormValues", () => {
  it("returns the create defaults for a new company", () => {
    const values = mapCompanyFormValues(null, {}, {});
    expect(values.compAatoClass).toBe("LE_5CR");
    expect(values.compDcPurposes).toBe("SUPPLY,APPROVAL,JOB_WORK,OTHER");
    expect(values.compCountry).toBe("India");
    expect(values.compCurrencyCode).toBe("INR");
    expect(values.compLocaleCode).toBe("en-IN");
    expect(values.compGstApplicable).toBe("true");
    expect(values.compTcsApplicable).toBe("false");
    expect(values.compNegStkApl).toBe("true");
    expect(values.compIsActive).toBe("true");
    expect(values.compDefault).toBe("false");
    expect(values.compAuthorizeSignature).toBe("");
    expect(values[SIGNATURE_PREVIEW_FIELD]).toBe("");
  });

  it("lets the supplied defaults override the built-in ones", () => {
    const values = mapCompanyFormValues(null, { compFinYearFrom: "2025-04-01", compGstApplicable: "false" }, {});
    expect(values.compFinYearFrom).toBe("2025-04-01");
    expect(values.compGstApplicable).toBe("false");
  });

  it("reads camelCase and snake_case server fields, numbers and blanks", () => {
    const values = mapCompanyFormValues(
      {
        compName: "  Acme Traders ",
        comp_gstin_no: "24AAACC1206D1ZM",
        compPin: 380001,
        compEwayInterLimit: "50000.5",
        compMail: null,
        compStylesheetId: 7,
        compFinYearFrom: "2025-04-01T00:00:00.000Z",
        comp_books_begin_from: "2025-04-01",
      },
      {},
      {},
    );
    expect(values.compName).toBe("Acme Traders");
    expect(values.compGstinNo).toBe("24AAACC1206D1ZM");
    expect(values.compPin).toBe("380001");
    expect(values.compEwayInterLimit).toBe("50000.5");
    expect(values.compMail).toBe("");
    expect(values.compStylesheetId).toBe("7");
    expect(values.compFinYearFrom).toBe("2025-04-01");
    expect(values.compBooksBeginFrom).toBe("2025-04-01");
  });

  it("reads boolean flags sent as booleans, strings or numbers", () => {
    const values = mapCompanyFormValues(
      {
        compGstApplicable: false,
        compTcsApplicable: "true",
        compTdsApplicable: "YES",
        compSmsApplicable: 1,
        compIsActive: "0",
      },
      {},
      {},
    );
    expect(values.compGstApplicable).toBe("false");
    expect(values.compTcsApplicable).toBe("true");
    expect(values.compTdsApplicable).toBe("true");
    expect(values.compSmsApplicable).toBe("true");
    expect(values.compIsActive).toBe("false");
  });

  it("falls back to the default when a flag is missing", () => {
    const values = mapCompanyFormValues({ compName: "X" }, {}, {});
    expect(values.compGstApplicable).toBe("true");
    expect(values.compTcsApplicable).toBe("false");
  });

  it("joins the delivery-challan purposes into a comma list", () => {
    expect(
      mapCompanyFormValues({ compDcPurposes: ["SUPPLY", " OWN_USE ", "", 5] }, {}, {}).compDcPurposes,
    ).toBe("SUPPLY,OWN_USE");
  });

  it("names the stored signature and hands its data URL to the preview", () => {
    const stored = mapCompanyFormValues({ compAuthorizeSignature: "data:image/png;base64,AAAA" }, {}, {});
    expect(stored.compAuthorizeSignature).not.toBe("");
    expect(stored[SIGNATURE_PREVIEW_FIELD]).toBe("data:image/png;base64,AAAA");
    const none = mapCompanyFormValues({ compAuthorizeSignature: null }, {}, {});
    expect(none.compAuthorizeSignature).toBe("");
    expect(none[SIGNATURE_PREVIEW_FIELD]).toBe("");
  });

  it("derives the state name from a saved lower-case state code", () => {
    const values = mapCompanyFormValues({ compStateCode: "24" }, {}, { "24": "Gujarat" });
    expect(values.compState).toBe("Gujarat");
    expect(values.compStateCode).toBe("24");
    expect(mapCompanyFormValues({ comp_state_code: "gb" }, {}, { GB: "Goa" }).compState).toBe("Goa");
  });

  it("keeps the saved state name over the code lookup", () => {
    const values = mapCompanyFormValues(
      { compState: "Kerala", compStateCode: "24" },
      {},
      { "24": "Gujarat" },
    );
    expect(values.compState).toBe("Kerala");
  });

  it("leaves the state blank when the code is unknown", () => {
    const values = mapCompanyFormValues({ compStateCode: "99" }, {}, {});
    expect(values.compState).toBe("");
    expect(values.compStateCode).toBe("99");
  });

  it("covers every initial form key", () => {
    const values = mapCompanyFormValues(null, {}, {});
    for (const key of Object.keys(COMPANY_INITIAL_FORM_VALUES)) {
      expect(values).toHaveProperty(key);
    }
  });
});

describe("buildCompanyRequestPayload", () => {
  const base = {
    compName: "  Acme  ",
    compState: " Gujarat ",
    compGstinNo: " 24aaacc1206d1zm ",
    compGstRegType: "regular",
    compPanNo: "aaacc1206d",
    compAatoClass: "le_10cr",
    compDcPurposes: "supply, own_use,supply,",
    compPin: "380001.7",
    compStylesheetId: "3",
    compFinYearFrom: "2025-04-01",
    compFinYearTo: "2026-03-31",
    compBooksBeginFrom: "2025-04-01",
  };

  it("trims, upper-cases and nulls blank text", () => {
    const payload = buildCompanyRequestPayload(base, false, { Gujarat: "24" });
    expect(payload.compName).toBe("Acme");
    expect(payload.compGstinNo).toBe("24AAACC1206D1ZM");
    expect(payload.compGstRegType).toBe("REGULAR");
    expect(payload.compPanNo).toBe("AAACC1206D");
    expect(payload.compTanNo).toBeNull();
    expect(payload.compCode).toBeNull();
    expect(payload.compState).toBe("Gujarat");
    expect(payload.compPin).toBe(380001);
    expect(payload.compStylesheetId).toBe(3);
  });

  it("derives the state code from the picked state name", () => {
    expect(buildCompanyRequestPayload(base, false, { Gujarat: "24" }).compStateCode).toBe("24");
  });

  it("falls back to the typed code, upper-cased, when the name is not mapped", () => {
    const payload = buildCompanyRequestPayload({ ...base, compStateCode: " gb " }, false, {});
    expect(payload.compStateCode).toBe("GB");
    expect(buildCompanyRequestPayload(base, false, {}).compStateCode).toBe("");
  });

  it("upper-cases and de-duplicates the delivery-challan purposes", () => {
    expect(buildCompanyRequestPayload(base, false, {}).compDcPurposes).toEqual(["SUPPLY", "OWN_USE"]);
    expect(buildCompanyRequestPayload({}, false, {}).compDcPurposes).toEqual([]);
  });

  it("defaults the turnover band, country, currency and locale", () => {
    const payload = buildCompanyRequestPayload({}, false, {});
    expect(payload.compAatoClass).toBe("LE_5CR");
    expect(payload.compCountry).toBe("India");
    expect(payload.compCurrencyCode).toBe("INR");
    expect(payload.compLocaleCode).toBe("en-IN");
    expect(buildCompanyRequestPayload(base, false, {}).compAatoClass).toBe("LE_10CR");
  });

  it("sends the first fiscal year on create only", () => {
    const create = buildCompanyRequestPayload(base, false, {});
    expect(create.compFinYearFrom).toBe("2025-04-01");
    expect(create.compFinYearTo).toBe("2026-03-31");
    expect(create.compBooksBeginFrom).toBe("2025-04-01");
    const update = buildCompanyRequestPayload(base, true, {});
    expect(update).not.toHaveProperty("compFinYearFrom");
    expect(update).not.toHaveProperty("compFinYearTo");
    expect(update).not.toHaveProperty("compBooksBeginFrom");
  });

  it("sends a blank fiscal year date as null", () => {
    expect(buildCompanyRequestPayload({}, false, {}).compFinYearFrom).toBeNull();
  });

  it("never sends the signature or the id itself", () => {
    const payload = buildCompanyRequestPayload(base, true, {});
    expect(payload).not.toHaveProperty("compAuthorizeSignature");
    expect(payload).not.toHaveProperty("compId");
  });

  it("reads the flags as booleans with their form defaults", () => {
    const payload = buildCompanyRequestPayload(
      { compGstApplicable: "true", compNegStkApl: "true", compIsActive: "true" },
      false,
      {},
    );
    expect(payload.compGstApplicable).toBe(true);
    expect(payload.compTcsApplicable).toBe(false);
    expect(payload.compNegStkApl).toBe(true);
    expect(payload.compIsActive).toBe(true);
    expect(payload.compDefault).toBe(false);
  });

  describe("e-way and e-invoice", () => {
    const ewayOn = {
      compEwayApplicable: "true",
      compEwayDate: "2025-04-01",
      compEwayInterLimit: "50000",
      compEwayIntraApl: "true",
      compEwayIntraLimit: "100000",
    };

    it("sends the e-way details when e-way is on", () => {
      const payload = buildCompanyRequestPayload(ewayOn, false, {});
      expect(payload.compEwayApplicable).toBe(true);
      expect(payload.compEwayDate).toBe("2025-04-01");
      expect(payload.compEwayInterLimit).toBe(50000);
      expect(payload.compEwayIntraApl).toBe(true);
      expect(payload.compEwayIntraLimit).toBe(100000);
    });

    it("blanks every e-way detail when e-way is off, whatever was typed", () => {
      const payload = buildCompanyRequestPayload({ ...ewayOn, compEwayApplicable: "false" }, false, {});
      expect(payload.compEwayApplicable).toBe(false);
      expect(payload.compEwayDate).toBeNull();
      expect(payload.compEwayInterLimit).toBeNull();
      expect(payload.compEwayIntraApl).toBe(false);
      expect(payload.compEwayIntraLimit).toBe(0);
    });

    it("zeroes the own-state limit when own-state is not ticked", () => {
      const payload = buildCompanyRequestPayload({ ...ewayOn, compEwayIntraApl: "false" }, false, {});
      expect(payload.compEwayIntraApl).toBe(false);
      expect(payload.compEwayIntraLimit).toBe(0);
    });

    it("falls back to zero for a negative or unreadable own-state limit", () => {
      expect(buildCompanyRequestPayload({ ...ewayOn, compEwayIntraLimit: "-5" }, false, {}).compEwayIntraLimit).toBe(0);
      expect(buildCompanyRequestPayload({ ...ewayOn, compEwayIntraLimit: "abc" }, false, {}).compEwayIntraLimit).toBe(0);
    });

    it("keeps the e-invoice date and e-way flag only when e-invoicing is on", () => {
      const on = buildCompanyRequestPayload(
        { compEinvoiceApplicable: "true", compEinvoiceDate: "2025-04-01", compEinvoiceInclEway: "true" },
        false,
        {},
      );
      expect(on.compEinvoiceApplicable).toBe(true);
      expect(on.compEinvoiceDate).toBe("2025-04-01");
      expect(on.compEinvoiceInclEway).toBe(true);
      const off = buildCompanyRequestPayload(
        { compEinvoiceApplicable: "false", compEinvoiceDate: "2025-04-01", compEinvoiceInclEway: "true" },
        false,
        {},
      );
      expect(off.compEinvoiceDate).toBeNull();
      expect(off.compEinvoiceInclEway).toBe(false);
    });
  });
});
