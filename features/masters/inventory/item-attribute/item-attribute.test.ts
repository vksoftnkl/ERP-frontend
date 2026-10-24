import { describe, expect, it } from "vitest";
import {
  ITEM_COLOUR_SPEC,
  ITEM_SIZE_SPEC,
  buildSavePayload,
  companyLabelOf,
  formValuesFromRow,
  initialValues,
  listGridParams,
  lookupKeysOf,
  sortValue,
} from "./item-attribute";

const COMPANY = "01a1-acme";

describe("the grid tokens", () => {
  it("always sends both of grid 181's tokens, as text", () => {
    expect(listGridParams(ITEM_SIZE_SPEC, false, COMPANY)).toEqual({
      wantdelete: false,
      iisz_is_deleted: "false",
      iisz_company_id: COMPANY,
    });
    // No company yet is still a value: "" reads as shared-only, a missing token fails the query.
    expect(listGridParams(ITEM_COLOUR_SPEC, true, "")).toEqual({
      wantdelete: true,
      iicl_is_deleted: "true",
      iicl_company_id: "",
    });
  });

  it("reads the grid by its real column names", () => {
    expect(lookupKeysOf(ITEM_COLOUR_SPEC).name).toEqual(["icl_name"]);
    expect(lookupKeysOf(ITEM_SIZE_SPEC).active).toEqual(["isz_is_active"]);
  });
});

describe("the form", () => {
  it("starts active, at sort 0, shared", () => {
    expect(initialValues(ITEM_SIZE_SPEC)).toEqual({
      isz_name: "",
      isz_code: "",
      isz_size_set: "",
      isz_sort: "0",
      isz_company_id: "",
      isz_is_active: "true",
    });
    expect(initialValues(ITEM_COLOUR_SPEC)).not.toHaveProperty("icl_size_set");
  });

  it("loads /get's row", () => {
    expect(
      formValuesFromRow(ITEM_SIZE_SPEC, {
        isz_id: "s1",
        isz_name: "XL",
        isz_code: null,
        isz_size_set: "ALPHA",
        isz_sort: 4,
        isz_company_id: COMPANY,
        isz_is_active: false,
      }),
    ).toEqual({
      isz_name: "XL",
      isz_code: "",
      isz_size_set: "ALPHA",
      isz_sort: "4",
      isz_company_id: COMPANY,
      isz_is_active: "false",
    });
  });

  it("names an own row's company from the session, a shared row as every company", () => {
    const session = { companyId: COMPANY, companyName: "ACME TEXTILES" };
    expect(companyLabelOf(COMPANY, session)).toBe("ACME TEXTILES");
    expect(companyLabelOf("", session)).toBe("");
    expect(companyLabelOf("other", session)).toBe("other");
  });
});

describe("the save body", () => {
  it("sends the DTO's keys only, blanks as null, the id on update", () => {
    expect(
      buildSavePayload(
        ITEM_SIZE_SPEC,
        {
          isz_name: "  extra   large ",
          isz_code: " ",
          isz_size_set: "ALPHA",
          isz_sort: "12",
          isz_company_id: "",
          isz_is_active: "true",
        },
        null,
      ),
    ).toEqual({
      isz_name: "extra large",
      isz_code: null,
      isz_size_set: "ALPHA",
      isz_sort: 12,
      isz_company_id: null,
      isz_is_active: true,
    });
    const update = buildSavePayload(
      ITEM_COLOUR_SPEC,
      { icl_name: "Maroon", icl_code: "MRN", icl_sort: "x", icl_company_id: COMPANY, icl_is_active: "false" },
      "c1",
    );
    expect(update).toEqual({
      icl_id: "c1",
      icl_name: "Maroon",
      icl_code: "MRN",
      icl_sort: 0,
      icl_company_id: COMPANY,
      icl_is_active: false,
    });
    expect(update).not.toHaveProperty("icl_size_set");
  });

  it("holds the sort to the spin box", () => {
    expect(sortValue("-3")).toBe(0);
    expect(sortValue("123456")).toBe(9999);
  });
});
