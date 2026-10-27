import { describe, expect, it } from "vitest";
import {
  buildGiftUnitScopeKey,
  buildLookupChoices,
  buildOptionLabelMap,
  buildSparklinePath,
  extractItemPriceRows,
  formatDateEntry,
  formatDateForDisplay,
  formatDateRange,
  getBranchId,
  getBranchName,
  getItemPriceItemId,
  getItemPriceUnitId,
  getSchemeBranchLabel,
  getStatusVariant,
  getTypeVariant,
  isActiveItemPriceRow,
  isActiveLookupRow,
  isDefaultBranch,
  isDeletedItemLookupRow,
  isDeletedItemPriceRow,
  isPartyScopeType,
  isTruthyLookupFlag,
  isUuid,
  isValidDateValue,
  normalizeScopeValue,
  parseWeekdayValues,
  readStringField,
  resolveLabel,
  stripEmptyOptions,
  toDateInputValue,
  toNullableString,
  toOptionalInteger,
  toOptionalNumber,
  toSchemeListRow,
  toTimeInputValue,
  withDefaultOption,
  withFallbackOption,
} from "./promotion-loyalty-points.utils";

const opt = (value: string, label = value) => ({ value, label });

describe("option helpers", () => {
  it("drops options whose value is blank", () => {
    expect(stripEmptyOptions([opt(""), opt("  "), opt("a")])).toEqual([opt("a")]);
  });

  it("puts the default option first and removes other blank options", () => {
    const def = opt("", "All Items");
    expect(withDefaultOption([opt(""), opt("a"), opt("b")], def)).toEqual([def, opt("a"), opt("b")]);
  });

  it("maps option values to labels, ignoring blank values", () => {
    const map = buildOptionLabelMap([opt("", "None"), opt("a", "Alpha")]);
    expect([...map.entries()]).toEqual([["a", "Alpha"]]);
  });

  it("returns options untouched when the value is blank or already present", () => {
    const options = [opt("a")];
    expect(withFallbackOption(options, "  ", new Map())).toBe(options);
    expect(withFallbackOption(options, "a", new Map())).toBe(options);
  });

  it("prepends a 'Previous value' option using the label map, else the raw value", () => {
    const options = [opt("a")];
    expect(withFallbackOption(options, " z ", new Map([["z", "Zed"]]))).toEqual([
      opt("z", "Previous value: Zed"),
      opt("a"),
    ]);
    expect(withFallbackOption(options, "z", new Map())[0]).toEqual(opt("z", "Previous value: z"));
  });

  it("keeps a leading blank default option first when adding the fallback", () => {
    const options = [opt("", "All"), opt("a")];
    expect(withFallbackOption(options, "z", new Map()).map((o) => o.value)).toEqual(["", "z", "a"]);
  });

  it("builds lookup choices from a payload using the configured keys and drops blanks", () => {
    const choices = buildLookupChoices(
      { data: [{ item_id: "1", item_name: "Soap" }, { item_id: "", item_name: "Ghost" }] },
      { arrayKeys: ["data"], idKeys: ["item_id"], labelKeys: ["item_name"] },
    );
    expect(choices).toEqual([opt("1", "Soap")]);
  });
});

describe("date helpers", () => {
  it("normalises ISO timestamps and display dates to yyyy-mm-dd", () => {
    expect(toDateInputValue("2024-03-05T10:00:00Z")).toBe("2024-03-05");
    expect(toDateInputValue("05/03/2024")).toBe("2024-03-05");
    expect(toDateInputValue("  2024-03-05 ")).toBe("2024-03-05");
  });

  it("returns an empty string for null, undefined and blank input", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("   ")).toBe("");
  });

  it("keeps the first ten characters of an unparseable or impossible date", () => {
    expect(toDateInputValue("2024-02-30")).toBe("2024-02-30");
    expect(toDateInputValue("31/02/2024")).toBe("31/02/2024");
    expect(toDateInputValue("garbage-text-long")).toBe("garbage-te");
  });

  it("formats time inputs as hh:mm", () => {
    expect(toTimeInputValue("09:30:00")).toBe("09:30");
    expect(toTimeInputValue("")).toBe("");
    expect(toTimeInputValue(null)).toBe("");
  });

  it("formats dates for display as dd/mm/yyyy", () => {
    expect(formatDateForDisplay("2024-03-05")).toBe("05/03/2024");
    expect(formatDateForDisplay("")).toBe("");
    expect(formatDateForDisplay(undefined)).toBe("");
  });

  it("returns the raw text when a display date has no day/month/year parts", () => {
    expect(formatDateForDisplay("abc")).toBe("abc");
  });

  it("validates real calendar dates only", () => {
    expect(isValidDateValue("2024-02-29")).toBe(true);
    expect(isValidDateValue("29/02/2024")).toBe(true);
    expect(isValidDateValue("2023-02-29")).toBe(false);
    expect(isValidDateValue("2024-13-01")).toBe(false);
    expect(isValidDateValue("")).toBe(false);
    expect(isValidDateValue(null)).toBe(false);
    expect(isValidDateValue("nope")).toBe(false);
  });

  it("describes a date range with fallbacks for missing ends", () => {
    expect(formatDateRange("", "")).toBe("No dates");
    expect(formatDateRange("", "2024-01-31")).toBe("2024-01-31");
    expect(formatDateRange("2024-01-01", "")).toBe("2024-01-01");
    expect(formatDateRange("01/01/2024", "2024-01-31T00:00:00Z")).toBe("2024-01-01 to 2024-01-31");
  });

  it("auto-formats typed digits into dd/mm/yyyy", () => {
    expect(formatDateEntry("1")).toBe("1");
    expect(formatDateEntry("12")).toBe("12");
    expect(formatDateEntry("123")).toBe("12/3");
    expect(formatDateEntry("1203")).toBe("12/03");
    expect(formatDateEntry("12032")).toBe("12/03/2");
    expect(formatDateEntry("12032024")).toBe("12/03/2024");
  });

  it("strips non-digits and caps date entry at eight digits", () => {
    expect(formatDateEntry("12/03/2024")).toBe("12/03/2024");
    expect(formatDateEntry("1203202499")).toBe("12/03/2024");
    expect(formatDateEntry("ab")).toBe("");
  });

  it("leaves ISO-style entries (containing a dash) alone", () => {
    expect(formatDateEntry("2024-03-05")).toBe("2024-03-05");
  });
});

describe("string and number parsing", () => {
  it("turns blank strings into null and trims the rest", () => {
    expect(toNullableString("  ")).toBeNull();
    expect(toNullableString("")).toBeNull();
    expect(toNullableString(" hi ")).toBe("hi");
  });

  it("parses optional numbers and rejects blanks and non-numbers", () => {
    expect(toOptionalNumber("")).toBeUndefined();
    expect(toOptionalNumber("  ")).toBeUndefined();
    expect(toOptionalNumber("abc")).toBeUndefined();
    expect(toOptionalNumber("Infinity")).toBeUndefined();
    expect(toOptionalNumber("0")).toBe(0);
    expect(toOptionalNumber(" 12.5 ")).toBe(12.5);
    expect(toOptionalNumber("-3")).toBe(-3);
  });

  it("parses optional integers and rejects blanks and non-numbers", () => {
    expect(toOptionalInteger("")).toBeUndefined();
    expect(toOptionalInteger("abc")).toBeUndefined();
    expect(toOptionalInteger("0")).toBe(0);
    expect(toOptionalInteger(" 42 ")).toBe(42);
  });

  it("splits a weekday list on commas, trimming and dropping empties", () => {
    expect(parseWeekdayValues("MON, TUE,,WED ,")).toEqual(["MON", "TUE", "WED"]);
    expect(parseWeekdayValues("")).toEqual([]);
  });
});

describe("identifier checks", () => {
  it("accepts only party scope types the server knows", () => {
    expect(isPartyScopeType("CUSTOMER")).toBe(true);
    expect(isPartyScopeType("CUSTOMER_GROUP")).toBe(true);
    expect(isPartyScopeType("ALL")).toBe(false);
    expect(isPartyScopeType(null)).toBe(false);
    expect(isPartyScopeType(undefined)).toBe(false);
  });

  it("recognises UUIDs, ignoring case and surrounding spaces", () => {
    expect(isUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isUuid("  123E4567-E89B-42D3-A456-426614174000 ")).toBe(true);
    expect(isUuid("123e4567-e89b-42d3-a456")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("resolves labels from a map with a configurable fallback", () => {
    const map = new Map([["a", "Alpha"]]);
    expect(resolveLabel("a", map)).toBe("Alpha");
    expect(resolveLabel(" a ", map)).toBe("Alpha");
    expect(resolveLabel("b", map)).toBe("b");
    expect(resolveLabel("", map)).toBe("Not set");
    expect(resolveLabel(null, map, "All Branches")).toBe("All Branches");
  });

  it("maps scheme status to a badge variant", () => {
    expect(getStatusVariant("ACTIVE")).toBe("success");
    expect(getStatusVariant("APPROVED")).toBe("info");
    expect(getStatusVariant("CLOSED")).toBe("warning");
    expect(getStatusVariant("CANCELLED")).toBe("danger");
    expect(getStatusVariant("DRAFT")).toBe("neutral");
    expect(getStatusVariant("")).toBe("neutral");
  });

  it("maps scheme type to a badge variant", () => {
    expect(getTypeVariant("BOTH")).toBe("info");
    expect(getTypeVariant("GIFT")).toBe("warning");
    expect(getTypeVariant("REDEEM")).toBe("success");
    expect(getTypeVariant("anything")).toBe("success");
  });
});

describe("lookup flag parsing", () => {
  it("normalises scope values to trimmed lower case strings", () => {
    expect(normalizeScopeValue("  AbC ")).toBe("abc");
    expect(normalizeScopeValue(null)).toBe("");
    expect(normalizeScopeValue(undefined)).toBe("");
    expect(normalizeScopeValue(12)).toBe("12");
  });

  it("treats a missing active flag as active and recognises false-like values", () => {
    expect(isActiveLookupRow(null)).toBe(true);
    expect(isActiveLookupRow("")).toBe(true);
    expect(isActiveLookupRow(true)).toBe(true);
    expect(isActiveLookupRow(false)).toBe(false);
    expect(isActiveLookupRow(0)).toBe(false);
    expect(isActiveLookupRow(1)).toBe(true);
    expect(isActiveLookupRow("false")).toBe(false);
    expect(isActiveLookupRow(" FALSE ")).toBe(false);
    expect(isActiveLookupRow("0")).toBe(false);
    expect(isActiveLookupRow("yes")).toBe(true);
  });

  it("treats a missing truthy flag as false and recognises true-like values", () => {
    expect(isTruthyLookupFlag(null)).toBe(false);
    expect(isTruthyLookupFlag("")).toBe(false);
    expect(isTruthyLookupFlag(true)).toBe(true);
    expect(isTruthyLookupFlag(false)).toBe(false);
    expect(isTruthyLookupFlag(1)).toBe(true);
    expect(isTruthyLookupFlag(0)).toBe(false);
    expect(isTruthyLookupFlag("TRUE")).toBe(true);
    expect(isTruthyLookupFlag("1")).toBe(true);
    expect(isTruthyLookupFlag("yes")).toBe(false);
  });

  it("flags an item lookup row as deleted from any known delete key", () => {
    expect(isDeletedItemLookupRow({ item_is_deleted: true })).toBe(true);
    expect(isDeletedItemLookupRow({ isDeleted: "1" })).toBe(true);
    expect(isDeletedItemLookupRow({ deleted: 1 })).toBe(true);
    expect(isDeletedItemLookupRow({ is_deleted: false, deleted: "0" })).toBe(false);
    expect(isDeletedItemLookupRow({})).toBe(false);
  });
});

describe("item price rows", () => {
  it("builds a gift unit scope key from branch and item", () => {
    expect(buildGiftUnitScopeKey(" i1 ", " b1 ")).toBe("b1::i1");
    expect(buildGiftUnitScopeKey("i1")).toBe("::i1");
  });

  it("extracts price rows from list payloads", () => {
    expect(extractItemPriceRows({ data: [{ ipm_item_id: "i1" }] })).toEqual([{ ipm_item_id: "i1" }]);
    expect(extractItemPriceRows(null)).toEqual([]);
  });

  it("reads the item id from the first non-blank candidate field", () => {
    expect(getItemPriceItemId({ ipm_item_id: " i1 ", item_id: "i2" })).toBe("i1");
    expect(getItemPriceItemId({ ipm_item_id: "  ", itemId: "i3" })).toBe("i3");
    expect(getItemPriceItemId({})).toBe("");
  });

  it("reads the unit id, preferring the conversion unit field", () => {
    expect(getItemPriceUnitId({ ipm_uc_unit_id: "u1", unit_id: "u2" })).toBe("u1");
    expect(getItemPriceUnitId({ ipm_uc_unit_id: null, uom_id: " u9 " })).toBe("u9");
    expect(getItemPriceUnitId({})).toBe("");
  });

  it("treats price rows as active unless an explicit flag says otherwise", () => {
    expect(isActiveItemPriceRow({})).toBe(true);
    expect(isActiveItemPriceRow({ ipm_is_active: false })).toBe(false);
    expect(isActiveItemPriceRow({ ipm_is_active: "", is_active: "0" })).toBe(false);
    expect(isActiveItemPriceRow({ isActive: "true" })).toBe(true);
  });

  it("flags deleted price rows from any delete field", () => {
    expect(isDeletedItemPriceRow({})).toBe(false);
    expect(isDeletedItemPriceRow({ ipm_is_deleted: true })).toBe(true);
    expect(isDeletedItemPriceRow({ isDeleted: "1" })).toBe(true);
    expect(isDeletedItemPriceRow({ is_deleted: 0 })).toBe(false);
  });
});

describe("branch rows", () => {
  it("reads the first non-blank string field from a row", () => {
    expect(readStringField({ a: " ", b: " x " }, ["a", "b"])).toBe("x");
    expect(readStringField({ a: 5 }, ["a"])).toBe("");
  });

  it("reads the branch id and name across server naming styles", () => {
    expect(getBranchId({ brId: "b1", id: "x" })).toBe("b1");
    expect(getBranchId({ branch_id: "b2" })).toBe("b2");
    expect(getBranchId({})).toBe("");
    expect(getBranchName({ br_name: "Main" })).toBe("Main");
    expect(getBranchName({ label: "Lbl" })).toBe("Lbl");
  });

  it("detects the default branch from any default flag", () => {
    expect(isDefaultBranch({ brIsDefault: true })).toBe(true);
    expect(isDefaultBranch({ br_is_default: "1" })).toBe(true);
    expect(isDefaultBranch({ is_default: 0 })).toBe(false);
    expect(isDefaultBranch({})).toBe(false);
  });

  it("labels a scheme's branch from the row name, then the map, then 'All Branches'", () => {
    const map = new Map([["b1", "Main"]]);
    expect(getSchemeBranchLabel({ ls_branch_id: "b1", ls_branch_name: "Row Name" } as never, map)).toBe("Row Name");
    expect(getSchemeBranchLabel({ ls_branch_id: "b1" }, map)).toBe("Main");
    expect(getSchemeBranchLabel({ ls_branch_id: "zz" }, map)).toBe("zz");
    expect(getSchemeBranchLabel({ ls_branch_id: null }, map)).toBe("All Branches");
  });
});

describe("toSchemeListRow", () => {
  it("coerces a server row into the list shape", () => {
    expect(
      toSchemeListRow({
        ls_id: "s1",
        ls_code: "C1",
        ls_name: "Spring",
        ls_type: "BOTH",
        ls_status: "ACTIVE",
        ls_branch_id: "b1",
        ls_start_date: "2024-01-01",
        ls_end_date: "2024-12-31",
        ls_is_active: 1,
        points_count: "3",
        gifts_count: 2,
        parties_count: "x",
      }),
    ).toEqual({
      ls_id: "s1",
      ls_code: "C1",
      ls_name: "Spring",
      ls_type: "BOTH",
      ls_status: "ACTIVE",
      ls_branch_id: "b1",
      ls_start_date: "2024-01-01",
      ls_end_date: "2024-12-31",
      ls_is_active: true,
      points_count: 3,
      gifts_count: 2,
      parties_count: 0,
    });
  });

  it("falls back to blanks, nulls, false and zero for missing fields", () => {
    expect(toSchemeListRow({})).toEqual({
      ls_id: "",
      ls_code: null,
      ls_name: "",
      ls_type: "",
      ls_status: "",
      ls_branch_id: null,
      ls_start_date: "",
      ls_end_date: "",
      ls_is_active: false,
      points_count: 0,
      gifts_count: 0,
      parties_count: 0,
    });
  });
});

describe("buildSparklinePath", () => {
  it("returns an empty path for no values", () => {
    expect(buildSparklinePath([])).toBe("");
  });

  it("scales values into the box with the lowest at the bottom", () => {
    expect(buildSparklinePath([0, 10], 100, 40)).toBe("0.0,36.0 100.0,4.0");
  });

  it("draws a flat line when all values are equal", () => {
    expect(buildSparklinePath([5, 5, 5], 100, 40)).toBe("0.0,36.0 50.0,36.0 100.0,36.0");
  });

  it("places a single value at x=0", () => {
    expect(buildSparklinePath([7], 100, 40)).toBe("0.0,36.0");
  });
});
