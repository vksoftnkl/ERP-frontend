import { describe, expect, it } from "vitest";
import {
  GSTIN_INVALID_MESSAGE,
  GST_REG_TYPE_OPTIONS,
  buildGstinFieldValidators,
  buildGstinValueChangePatch,
  gstinFieldNames,
  gstinPanMismatchMessage,
  gstinRequiredMessage,
  gstinStateMismatchMessage,
  isValidGstin,
  panOfGstin,
  stateCodeOfGstin,
} from "./gst-registration";
import { gstinCheckCharacter, hasValidGstinChecksum, validateGstin } from "@/utils/validation";

// Checksum-valid: the server spec's Acme GSTIN and a synthetic one.
const ACME = "33ABNPL5414F1ZU";
const SYNTHETIC = "24ABCDE1234F1Z6";

describe("GSTIN format + mod-36 checksum", () => {
  it("accepts GSTINs whose last character is the checksum of the rest", () => {
    expect(isValidGstin(ACME)).toBe(true);
    expect(isValidGstin(SYNTHETIC)).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("29AAACH7409R1ZX")).toBe(true);
  });

  it("refuses a well-formed GSTIN with the wrong check character", () => {
    // Every example GSTIN the old forms used ends in 5; the real check is 6.
    expect(isValidGstin("24ABCDE1234F1Z5")).toBe(false);
    expect(gstinCheckCharacter("24ABCDE1234F1Z")).toBe("6");
    expect(hasValidGstinChecksum("24ABCDE1234F1Z5")).toBe(false);
  });

  it("refuses the wrong shape before even looking at the checksum", () => {
    expect(isValidGstin("")).toBe(false);
    expect(isValidGstin("33ABNPL5414F1Z")).toBe(false);
    expect(isValidGstin("33ABNPL5414F0ZU")).toBe(false); // entity number 0
    expect(isValidGstin("33ABNPL5414F1YU")).toBe(false); // 14th must be Z
    expect(isValidGstin("3AABNPL5414F1ZU")).toBe(false); // state code not digits
  });

  it("normalises case and whitespace", () => {
    expect(isValidGstin("  33abnpl5414f1zu ")).toBe(true);
    expect(stateCodeOfGstin(" 33abnpl5414f1zu")).toBe("33");
    expect(panOfGstin("33abnpl5414f1zu")).toBe("ABNPL5414F");
  });

  it("utils/validation.validateGstin now carries the checksum too", () => {
    expect(validateGstin(SYNTHETIC)).toBeNull();
    expect(validateGstin("24ABCDE1234F1Z5")).toMatch(/checksum/i);
    expect(gstinCheckCharacter("too short")).toBeNull();
  });
});

describe("the four registration types", () => {
  it("lists SEZ, which the shared customer/supplier list does not", () => {
    expect(GST_REG_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "REGULAR",
      "COMPOSITION",
      "UNREGISTERED",
      "SEZ",
    ]);
  });
});

describe("GSTIN field validators (company prefix)", () => {
  const fields = gstinFieldNames("comp");
  const STATE_CODE_BY_NAME: Record<string, string> = { "Tamil Nadu": "33", Gujarat: "24" };
  const validators = buildGstinFieldValidators({
    fields,
    stateCodeOf: (values) => STATE_CODE_BY_NAME[values.compState ?? ""] ?? "",
  });
  const values = (overrides: Record<string, string>): Record<string, string> => ({
    compGstinNo: "",
    compGstRegType: "REGULAR",
    compPanNo: "",
    compState: "",
    ...overrides,
  });

  it("names the fields by prefix", () => {
    expect(fields).toEqual({ gstin: "compGstinNo", regType: "compGstRegType", pan: "compPanNo" });
  });

  it("lets an UNREGISTERED company save without a GSTIN, and nobody else", () => {
    expect(validators.gstin("", values({ compGstRegType: "UNREGISTERED" }))).toBeNull();
    expect(validators.gstin("", values({ compGstRegType: "unregistered" }))).toBeNull();
    expect(validators.gstin("", values({ compGstRegType: "REGULAR" }))).toBe(
      gstinRequiredMessage("REGULAR"),
    );
    expect(gstinRequiredMessage("REGULAR")).toBe(
      "A GSTIN is required for 'Regular' registration. Select 'Unregistered' to save without one.",
    );
    expect(validators.gstin("", values({ compGstRegType: "" }))).toMatch(/GSTIN is required/);
  });

  it("checks format and checksum of whatever is typed, even for UNREGISTERED", () => {
    expect(validators.gstin("24ABCDE1234F1Z5", values({ compGstRegType: "UNREGISTERED" }))).toBe(
      GSTIN_INVALID_MESSAGE,
    );
    expect(validators.gstin("nonsense", values({}))).toBe(GSTIN_INVALID_MESSAGE);
  });

  it("refuses a GSTIN issued in another state than the one picked", () => {
    expect(validators.gstin(ACME, values({ compState: "Gujarat" }))).toBe(
      gstinStateMismatchMessage(ACME, "24"),
    );
    expect(gstinStateMismatchMessage(ACME, "24")).toBe(
      "The GSTIN 33ABNPL5414F1ZU belongs to state code 33, but the State chosen is 24.",
    );
    expect(validators.gstin(ACME, values({ compState: "Tamil Nadu" }))).toBeNull();
    // No state picked yet: the required check on State speaks, not this one.
    expect(validators.gstin(ACME, values({}))).toBeNull();
  });

  it("accepts a blank PAN, the GSTIN's own PAN, and refuses any other", () => {
    expect(validators.pan("", values({ compGstinNo: ACME }))).toBeNull();
    expect(validators.pan("ABNPL5414F", values({ compGstinNo: ACME }))).toBeNull();
    expect(validators.pan("abnpl5414f", values({ compGstinNo: ACME }))).toBeNull();
    expect(validators.pan("ABCDE1234F", values({ compGstinNo: ACME }))).toBe(
      gstinPanMismatchMessage(ACME, "ABCDE1234F"),
    );
    expect(gstinPanMismatchMessage(ACME, "ABCDE1234F")).toBe(
      "The PAN in the GSTIN is ABNPL5414F, but PAN No is ABCDE1234F.",
    );
    // An invalid GSTIN is reported on its own field; the PAN is not compared to it.
    expect(validators.pan("ABCDE1234F", values({ compGstinNo: "24ABCDE1234F1Z5" }))).toBeNull();
  });

  it("upper-cases on change and fills a blank PAN from a valid GSTIN", () => {
    expect(buildGstinValueChangePatch("33abnpl5414f1zu", values({}), fields)).toEqual({
      compGstinNo: ACME,
      compPanNo: "ABNPL5414F",
    });
    expect(validators.valueChangePatch(ACME, values({ compPanNo: "ABCDE1234F" }))).toEqual({});
    expect(validators.valueChangePatch("33ABNPL5414F1Z", values({}))).toEqual({});
    expect(validators.valueChangePatch("", values({}))).toEqual({});
  });
});
