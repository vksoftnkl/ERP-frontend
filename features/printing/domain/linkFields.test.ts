import { describe, expect, it } from "vitest";

import {
  LINK_FIELDS_PATTERN,
  formatLinkFields,
  isValidLinkFields,
  nestingIncoherence,
  parseLinkFields,
} from "./linkFields";

describe("ck_ptd_link_fields_shape, mirrored exactly", () => {
  it("accepts a single pair", () => {
    expect(isValidLinkFields("sbi_id=line_id")).toBe(true);
  });

  it("accepts several comma-separated pairs", () => {
    expect(isValidLinkFields("sb_id=bill_id,sbi_slno=slno")).toBe(true);
  });

  it("accepts digits and underscores after the first letter", () => {
    expect(isValidLinkFields("a1_b=c_2d")).toBe(true);
  });

  it("rejects spaces", () => {
    expect(isValidLinkFields("sb_id = bill_id")).toBe(false);
    expect(isValidLinkFields("sb_id=bill_id, sbi_slno=slno")).toBe(false);
  });

  it("rejects upper case on either side", () => {
    expect(isValidLinkFields("SB_ID=bill_id")).toBe(false);
    expect(isValidLinkFields("sb_id=Bill_Id")).toBe(false);
  });

  it("rejects a bare name with no pairing", () => {
    expect(isValidLinkFields("sb_id")).toBe(false);
  });

  it("rejects a trailing comma", () => {
    expect(isValidLinkFields("sb_id=bill_id,")).toBe(false);
  });

  it("rejects a leading digit or underscore", () => {
    expect(isValidLinkFields("1sb=bill_id")).toBe(false);
    expect(isValidLinkFields("_sb=bill_id")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidLinkFields("")).toBe(false);
  });

  it("rejects more than 200 characters even when the shape is right", () => {
    const pair = "abcdefghij=klmnopqrst"; // 21 chars
    const long = Array.from({ length: 10 }, () => pair).join(","); // 219
    expect(LINK_FIELDS_PATTERN.test(long)).toBe(true);
    expect(isValidLinkFields(long)).toBe(false);
  });
});

describe("parseLinkFields says which pair is wrong", () => {
  it("returns the pairs for a good string", () => {
    expect(parseLinkFields("sb_id=bill_id,sbi_slno=slno")).toEqual({
      ok: true,
      pairs: [
        { parent: "sb_id", child: "bill_id" },
        { parent: "sbi_slno", child: "slno" },
      ],
    });
  });

  it("names the pair index when there is more than one", () => {
    const result = parseLinkFields("sb_id=bill_id,BAD=slno");

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errors: [expect.stringContaining("Pair 2")] });
  });

  it("collects every problem rather than stopping at the first", () => {
    const result = parseLinkFields("BAD=x,y=ALSOBAD");

    expect(result.ok).toBe(false);
    expect("errors" in result && result.errors.length).toBe(2);
  });

  it("still reports the pairs it did understand", () => {
    const result = parseLinkFields("sb_id=bill_id,BAD=slno");

    expect(result.pairs).toEqual([{ parent: "sb_id", child: "bill_id" }]);
  });

  it("explains a trailing comma as a stray comma, not as a bad name", () => {
    const result = parseLinkFields("sb_id=bill_id,");

    expect(result).toMatchObject({ errors: [expect.stringMatching(/comma/i)] });
  });

  it("explains a missing = rather than blaming the column name", () => {
    const result = parseLinkFields("sb_id");

    expect(result).toMatchObject({ errors: [expect.stringMatching(/no "="/)] });
  });

  it("reports spaces once, for the whole string", () => {
    const result = parseLinkFields("sb_id = bill_id");

    expect("errors" in result && result.errors.some((error) => /No spaces/.test(error))).toBe(true);
  });
});

describe("round trip", () => {
  it("formats back to what parsed", () => {
    const value = "sb_id=bill_id,sbi_slno=slno";
    const parsed = parseLinkFields(value);

    expect(formatLinkFields(parsed.pairs)).toBe(value);
  });
});

describe("ptdParentNo and ptdLinkFields are a biconditional", () => {
  it("complains when a parent has no link fields", () => {
    expect(nestingIncoherence({ ptdParentNo: 1, ptdLinkFields: null })).toMatch(/link fields/i);
  });

  it("complains when link fields have no parent", () => {
    expect(nestingIncoherence({ ptdParentNo: null, ptdLinkFields: "a=b" })).toMatch(/parent/i);
  });

  it("accepts both set, and both unset", () => {
    expect(nestingIncoherence({ ptdParentNo: 1, ptdLinkFields: "a=b" })).toBeNull();
    expect(nestingIncoherence({ ptdParentNo: null, ptdLinkFields: null })).toBeNull();
    expect(nestingIncoherence({})).toBeNull();
  });

  it("treats parent 0 as a parent — the MASTER is dataset zero", () => {
    expect(nestingIncoherence({ ptdParentNo: 0, ptdLinkFields: null })).toMatch(/link fields/i);
  });
});
