/**
 * The alias map exists to keep an author out of one specific hole: a query that
 * binds `:comp_id`, reported as undeclared, "fixed" by declaring a prompt that
 * nothing can answer. Every case here is one the local templates actually hit.
 */
import { describe, expect, it } from "vitest";

import {
  hasContextDefault,
  isServerOwnedParam,
  suggestContextParam,
} from "./context";

describe("suggestContextParam", () => {
  it("reads the company aliases that broke the sale-invoice design", () => {
    expect(suggestContextParam("comp_id")).toBe("company_id");
    expect(suggestContextParam("company")).toBe("company_id");
  });

  it("reads a per-document id as the document", () => {
    expect(suggestContextParam("quote_id")).toBe("doc_id");
    expect(suggestContextParam("sale_id")).toBe("doc_id");
    expect(suggestContextParam("bill_id")).toBe("doc_id");
    expect(suggestContextParam("sb_id")).toBe("doc_id");
  });

  it("reads the year and the rest of the session", () => {
    expect(suggestContextParam("acc_yr")).toBe("acc_year");
    expect(suggestContextParam("branch")).toBe("branch_id");
    expect(suggestContextParam("counter_id")).toBe("device_id");
  });

  it("is case- and space-insensitive, as the grid trims but does not lower", () => {
    expect(suggestContextParam(" COMP_ID ")).toBe("company_id");
  });

  /*
   * The whole point of the split in the prompts grid: a context name is already
   * right, and a real prompt must stay a real prompt. Suggesting anything for
   * either would send the author to edit a query that is fine.
   */
  it("suggests nothing for a context name or a genuine prompt", () => {
    expect(suggestContextParam("company_id")).toBeUndefined();
    expect(suggestContextParam("doc_id")).toBeUndefined();
    expect(suggestContextParam("from_date")).toBeUndefined();
    expect(suggestContextParam("wantdelete")).toBeUndefined();
    expect(suggestContextParam("search")).toBeUndefined();
  });

  it("leaves the two existing predicates saying what they said", () => {
    expect(hasContextDefault("acc_year")).toBe(true);
    expect(hasContextDefault("comp_id")).toBe(false);
    expect(isServerOwnedParam("company_id")).toBe(true);
    expect(isServerOwnedParam("branch_id")).toBe(false);
  });
});
