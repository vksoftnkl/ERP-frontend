import { describe, expect, it } from "vitest";
import { buildGstinFieldValidators } from "@/features/masters/shared/gst-registration";
import {
  BRANCH_GSTIN_FIELDS,
  BRANCH_INITIAL_FORM_VALUES,
  buildBranchFormFields,
  buildBranchRequestPayload,
  buildStateCodeByName,
  buildStateNameByCode,
  getBranchFieldValue,
  mapBranchFormValues,
  toSnakeCaseKey,
} from "./branches";

const FIELD = {} as never;
const NO_HANDLERS = {
  onSearchOpenChange: () => undefined,
  onSearchQueryChange: () => undefined,
  onValueChange: () => undefined,
} as never;

function formFields(stateCodeOf: (values: Record<string, string>) => string = () => "") {
  return buildBranchFormFields({
    companyOptions: [],
    companyHandlers: NO_HANDLERS,
    stateOptions: [],
    stateHandlers: NO_HANDLERS,
    bankOptions: [],
    bankHandlers: NO_HANDLERS,
    godownOptions: [],
    godownHandlers: NO_HANDLERS,
    onBranchGstinValueChange: () => undefined,
    gstinValidators: buildGstinFieldValidators({ fields: BRANCH_GSTIN_FIELDS, stateCodeOf }),
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

  it("reads a bare array and the known wrapper keys", () => {
    expect(buildStateCodeByName([{ name: "Goa", code: "30" }])).toEqual({ Goa: "30" });
    expect(buildStateCodeByName({ items: [{ name: "Goa", code: "30" }] })).toEqual({ Goa: "30" });
    expect(buildStateNameByCode({ rows: [{ name: "Goa", code: "30" }] })).toEqual({ "30": "Goa" });
  });

  it("skips non-object rows and rows missing a name or a code", () => {
    const messy = [null, 7, ["a"], { name: "", code: "01" }, { name: "Goa" }, { name: "Kerala", code: "32" }];
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

  it("returns empty maps for an unusable payload", () => {
    expect(buildStateCodeByName(null)).toEqual({});
    expect(buildStateNameByCode({})).toEqual({});
  });
});

describe("field key helpers", () => {
  it("turns camelCase names into snake_case", () => {
    expect(toSnakeCaseKey("brRegionAddr1")).toBe("br_region_addr1");
  });

  it("reads the camelCase key first and the snake_case key second", () => {
    expect(getBranchFieldValue({ brName: "A", br_name: "B" }, "brName")).toBe("A");
    expect(getBranchFieldValue({ br_name: "B" }, "brName")).toBe("B");
    expect(getBranchFieldValue({ brName: null }, "brName")).toBeUndefined();
  });
});

describe("branch form fields", () => {
  it("uses the exact required-field messages", () => {
    expect(field("brName").validation?.requiredMessage).toBe("Enter the branch name.");
    expect(field("brType").validation?.requiredMessage).toBe("Choose the branch type.");
    expect(field("brCompId").validation?.requiredMessage).toBe("Choose the company.");
    expect(field("brGstRegType").validation?.requiredMessage).toBe("Choose the GST registration type.");
    expect(field("brCity").validation?.requiredMessage).toBe("Enter the city.");
    expect(field("brDistrict").validation?.requiredMessage).toBe("Enter the district.");
    expect(field("brState").validation?.requiredMessage).toBe("Choose the state.");
    expect(field("brPin").validation?.requiredMessage).toBe("Enter the pin code.");
  });

  it("marks the required set as required", () => {
    for (const name of ["brName", "brType", "brCompId", "brGstRegType", "brCity", "brDistrict", "brState", "brPin"]) {
      expect(field(name).required).toBe(true);
    }
  });

  it("uses the exact length and floor messages", () => {
    expect(field("brName").validation?.minLengthMessage).toBe("Branch Name must be at least 2 characters.");
    expect(field("brName").validation?.maxLengthMessage).toBe("Branch Name must be at most 150 characters.");
    expect(field("brCode").validation?.maxLengthMessage).toBe("Branch Code must be at most 20 characters.");
    expect(field("brPin").validation?.minMessage).toBe("Pin Code must be 0 or greater.");
    expect(field("brRoundingValue").validation?.minMessage).toBe("Rounding Value must be 0 or greater.");
  });

  it("describes the PAN format and length rules", () => {
    const pan = field("brPanNo").validation;
    expect(pan?.minLengthMessage).toBe("PAN No must be exactly 10 characters.");
    expect(pan?.maxLengthMessage).toBe("PAN No must be exactly 10 characters.");
    expect(pan?.patternMessage).toBe("PAN No must match the standard PAN format.");
    const pattern = new RegExp(pan?.pattern as string);
    expect(pattern.test("ABCDE1234F")).toBe(true);
    expect(pattern.test("abcde1234f")).toBe(true);
    expect(pattern.test("1BCDE1234F")).toBe(false);
  });

  it("reads the GSTIN rules under the br prefix", () => {
    const gstin = field("brGstinNo", () => "27").validation?.custom;
    const values = {
      brGstinNo: "24AAACC1206D1ZM",
      brGstRegType: "REGULAR",
      brPanNo: "",
      brState: "Maharashtra",
    };
    expect(gstin?.(values.brGstinNo, values, FIELD)).toContain("state code 24");
    expect(gstin?.("", { ...values, brGstinNo: "" }, FIELD)).toBeTruthy();
    expect(gstin?.("", { ...values, brGstinNo: "", brGstRegType: "UNREGISTERED" }, FIELD)).toBeNull();
  });

  it("locks the company once the branch is saved and the godown until it is", () => {
    expect(field("brCompId").disabledWhen?.({ __editing: "true" })).toBe(true);
    expect(field("brCompId").disabledWhen?.({ __editing: "false" })).toBe(false);
    expect(field("brDefaultGodownId").disabledWhen?.({ __editing: "false" })).toBe(true);
    expect(field("brDefaultGodownId").disabledWhen?.({ __editing: "true" })).toBe(false);
  });

  it("offers the Qt rounding vocabulary", () => {
    const options = field("brRoundingMode").options?.map((option) => option.value);
    expect(options).toEqual(["NORMAL", "ROUND UP", "ROUND DOWN", "NONE", "BANKERS"]);
  });

  it("declares every field once", () => {
    const names = formFields().map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("mapBranchFormValues", () => {
  it("returns the create defaults for a new branch", () => {
    const values = mapBranchFormValues(null, {}, {});
    expect(values.brRoundingMode).toBe("NORMAL");
    expect(values.brRoundingValue).toBe("0.50");
    expect(values.brCountry).toBe("India");
    expect(values.brIsActive).toBe("true");
    expect(values.brIsDefault).toBe("false");
    expect(values.brAllowNegativeStock).toBe("true");
    expect(values.brSmsApplicable).toBe("false");
  });

  it("lets the supplied defaults override the built-in ones", () => {
    const values = mapBranchFormValues(null, { brCountry: "Nepal", brIsActive: "false" }, {});
    expect(values.brCountry).toBe("Nepal");
    expect(values.brIsActive).toBe("false");
  });

  it("shows a saved branch as stored, without filling create defaults into blanks", () => {
    const values = mapBranchFormValues(
      { brName: "Main", brCountry: "", brRoundingMode: null, brRoundingValue: "" },
      {},
      {},
    );
    expect(values.brName).toBe("Main");
    expect(values.brCountry).toBe("");
    expect(values.brRoundingMode).toBe("");
    expect(values.brRoundingValue).toBe("");
  });

  it("reads camelCase and snake_case fields, trimming and stringifying numbers", () => {
    const values = mapBranchFormValues(
      { brName: " Main ", br_city: "Surat", brPin: 395003, br_rounding_value: 0.25, br_comp_id: 4 },
      {},
      {},
    );
    expect(values.brName).toBe("Main");
    expect(values.brCity).toBe("Surat");
    expect(values.brPin).toBe("395003");
    expect(values.brRoundingValue).toBe("0.25");
    expect(values.brCompId).toBe("4");
  });

  it("reads the FSSAI date as a date input value", () => {
    expect(mapBranchFormValues({ brFssaiValidUpto: "2027-03-31T00:00:00.000Z" }, {}, {}).brFssaiValidUpto).toBe(
      "2027-03-31",
    );
    expect(mapBranchFormValues({ brName: "Main" }, {}, {}).brFssaiValidUpto).toBe("");
    expect(mapBranchFormValues(null, { brFssaiValidUpto: "2026-01-01" }, {}).brFssaiValidUpto).toBe("2026-01-01");
  });

  it("reads boolean flags sent as booleans, strings or numbers", () => {
    const values = mapBranchFormValues(
      { brIsDefault: true, brIsActive: "false", brAllowNegativeStock: 0, brSmsApplicable: "yes" },
      {},
      {},
    );
    expect(values.brIsDefault).toBe("true");
    expect(values.brIsActive).toBe("false");
    expect(values.brAllowNegativeStock).toBe("false");
    expect(values.brSmsApplicable).toBe("true");
  });

  it("derives the state name from a saved lower-case state code", () => {
    const values = mapBranchFormValues({ brStateCode: "gb" }, {}, { GB: "Goa" });
    expect(values.brState).toBe("Goa");
    expect(values.brStateCode).toBe("GB");
  });

  it("keeps the saved state name over the code lookup", () => {
    const values = mapBranchFormValues({ brState: "Kerala", brStateCode: "24" }, {}, { "24": "Gujarat" });
    expect(values.brState).toBe("Kerala");
  });

  it("leaves the state blank when the code is unknown", () => {
    const values = mapBranchFormValues({ brStateCode: "99" }, {}, {});
    expect(values.brState).toBe("");
    expect(values.brStateCode).toBe("99");
  });

  it("covers every initial form key", () => {
    const values = mapBranchFormValues(null, {}, {});
    for (const key of Object.keys(BRANCH_INITIAL_FORM_VALUES)) {
      expect(values).toHaveProperty(key);
    }
  });
});

describe("buildBranchRequestPayload", () => {
  const base = {
    brCompId: " 12 ",
    brName: "  Main Branch ",
    brState: " Gujarat ",
    brGstinNo: " 24aaacc1206d1zm ",
    brGstRegType: "regular",
    brPanNo: "aaacc1206d",
    brPin: "395003",
    brRoundingValue: "0.5",
  };

  it("trims, upper-cases and nulls blank text", () => {
    const payload = buildBranchRequestPayload(base, { Gujarat: "24" });
    expect(payload.brCompId).toBe("12");
    expect(payload.brName).toBe("Main Branch");
    expect(payload.brState).toBe("Gujarat");
    expect(payload.brGstinNo).toBe("24AAACC1206D1ZM");
    expect(payload.brGstRegType).toBe("REGULAR");
    expect(payload.brPanNo).toBe("AAACC1206D");
    expect(payload.brCode).toBeNull();
    expect(payload.brPin).toBe(395003);
    expect(payload.brRoundingValue).toBe(0.5);
  });

  it("sends blank numbers and dates as null", () => {
    const payload = buildBranchRequestPayload({}, {});
    expect(payload.brPin).toBeNull();
    expect(payload.brRoundingValue).toBeNull();
    expect(payload.brFssaiValidUpto).toBeNull();
    expect(payload.brGstinNo).toBeNull();
  });

  it("derives the state code from the picked state name", () => {
    expect(buildBranchRequestPayload(base, { Gujarat: "24" }).brStateCode).toBe("24");
  });

  it("falls back to the typed code, upper-cased, when the name is not mapped", () => {
    expect(buildBranchRequestPayload({ ...base, brStateCode: " gb " }, {}).brStateCode).toBe("GB");
    expect(buildBranchRequestPayload(base, {}).brStateCode).toBe("");
  });

  it("defaults the country to India", () => {
    expect(buildBranchRequestPayload({}, {}).brCountry).toBe("India");
    expect(buildBranchRequestPayload({ brCountry: " Nepal " }, {}).brCountry).toBe("Nepal");
  });

  it("reads the flags as booleans", () => {
    const on = buildBranchRequestPayload(
      { brIsDefault: "true", brIsActive: "true", brAllowNegativeStock: "true", brSmsApplicable: "true" },
      {},
    );
    expect(on).toMatchObject({
      brIsDefault: true,
      brIsActive: true,
      brAllowNegativeStock: true,
      brSmsApplicable: true,
    });
    const off = buildBranchRequestPayload(
      { brIsDefault: "false", brIsActive: "false", brAllowNegativeStock: "false" },
      {},
    );
    expect(off).toMatchObject({ brIsDefault: false, brIsActive: false, brAllowNegativeStock: false, brSmsApplicable: false });
  });

  it("carries the POS type through even though the form has no field for it", () => {
    expect(buildBranchRequestPayload({ brPosType: " RETAIL " }, {}).brPosType).toBe("RETAIL");
  });

  it("never sends the id itself", () => {
    expect(buildBranchRequestPayload(base, {})).not.toHaveProperty("brId");
  });
});
