import { describe, expect, it } from "vitest";
import {
  buildDropdownConfigQuery,
  buildDropdownRunQuery,
  dropdownParamsKey,
  DROPDOWN_PAGE_SIZE,
} from "./api";

describe("buildDropdownConfigQuery", () => {
  it("sends the camelCase id the list endpoint filters on", () => {
    expect(buildDropdownConfigQuery(" 39 ")).toEqual({ dropdownId: "39" });
  });
});

describe("dropdownParamsKey", () => {
  it("is empty when there is nothing to bind", () => {
    expect(dropdownParamsKey(undefined)).toBe("");
    expect(dropdownParamsKey({})).toBe("");
  });

  it("drops keys with no value rather than binding an empty string", () => {
    // '' lands in the SQL as ''::uuid and fails the run.
    expect(dropdownParamsKey({ iemp_branch_id: "" })).toBe("");
    expect(dropdownParamsKey({ iemp_branch_id: null, other: undefined })).toBe("");
  });

  it("is stable regardless of key order", () => {
    expect(dropdownParamsKey({ b: 2, a: 1 })).toBe(dropdownParamsKey({ a: 1, b: 2 }));
  });
});

describe("buildDropdownRunQuery", () => {
  it("defaults to the first page at the module's page size", () => {
    expect(buildDropdownRunQuery({ dropdownId: "39" })).toEqual({
      dropdown_id: "39",
      page: 1,
      limit: DROPDOWN_PAGE_SIZE,
    });
  });

  it("omits an empty search so the server returns the first page unfiltered", () => {
    expect(buildDropdownRunQuery({ dropdownId: "39", search: "   " })).not.toHaveProperty("search");
  });

  it("trims the search", () => {
    expect(buildDropdownRunQuery({ dropdownId: "39", search: " am " }).search).toBe("am");
  });

  it("serializes bound params", () => {
    const query = buildDropdownRunQuery({
      dropdownId: "38",
      params: { iemp_branch_id: "b-1" },
    });
    expect(query.dropdown_param).toBe('{"iemp_branch_id":"b-1"}');
  });

  it("omits dropdown_param entirely when nothing binds", () => {
    expect(buildDropdownRunQuery({ dropdownId: "38", params: {} })).not.toHaveProperty(
      "dropdown_param",
    );
  });

  it("passes the requested page through", () => {
    expect(buildDropdownRunQuery({ dropdownId: "39", page: 3, limit: 10 })).toMatchObject({
      page: 3,
      limit: 10,
    });
  });
});
