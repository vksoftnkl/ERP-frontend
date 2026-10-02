import { describe, expect, it } from "vitest";
import {
  GSTIN_LOOKUP_MESSAGES,
  fetchGstinDetails,
  gstinLookupErrorMessage,
  gstinLookupToValues,
  normalizeGstinLookupPayload,
  prefixedGstinLookupFieldMap,
  type GstinLookupPayload,
} from "./gstin-lookup";

/** What GET /gst/search answers for the server spec's Acme fixture. */
const ACME_RESPONSE = {
  success: true,
  message: "GST details fetched successfully",
  data: {
    gstin: "33ABNPL5414F1ZU",
    legalName: "ACME FOODS PRIVATE LIMITED",
    tradeName: "ACME FOODS",
    status: "Active",
    registrationType: "Regular",
    gstRegType: "REGULAR",
    stateCode: "33",
    panNo: "ABNPL5414F",
    registeredOn: "01/07/2017",
    address: {
      building: "12, Mill Road",
      street: "Main St",
      locality: "Coimbatore",
      city: "Coimbatore",
      district: "Coimbatore",
      state: "Tamil Nadu",
      pin: "641001",
    },
    raw: { lgnm: "ACME FOODS PRIVATE LIMITED" },
  },
};

const STATE_NAME_BY_CODE = { "33": "Tamil Nadu", "24": "Gujarat" };

describe("fetchGstinDetails", () => {
  it("refuses anything but fifteen letters or digits without asking", async () => {
    let asked = 0;
    const result = await fetchGstinDetails(async () => {
      asked += 1;
      return ACME_RESPONSE;
    }, "33ABNPL5414F1Z");
    expect(result).toEqual({ ok: false, message: GSTIN_LOOKUP_MESSAGES.invalid });
    expect(asked).toBe(0);
  });

  it("asks with the upper-cased GSTIN and hands back the normalised record", async () => {
    const queries: Record<string, string>[] = [];
    const result = await fetchGstinDetails(async (query) => {
      queries.push(query);
      return ACME_RESPONSE;
    }, " 33abnpl5414f1zu ");
    expect(queries).toEqual([{ gstin: "33ABNPL5414F1ZU" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.tradeName).toBe("ACME FOODS");
      expect(result.payload.gstRegType).toBe("REGULAR");
      expect(result.payload.address?.pin).toBe("641001");
    }
  });

  it("reads the server's field message out of a 404 / 503 axios error", async () => {
    const error = Object.assign(new Error("Request failed with status code 404"), {
      response: {
        status: 404,
        data: {
          success: false,
          message: "GST details not found",
          errors: [{ field: "gstin", message: "No record" }],
        },
      },
    });
    const result = await fetchGstinDetails(async () => {
      throw error;
    }, "33ABNPL5414F1ZU");
    expect(result).toEqual({ ok: false, message: "No record" });
    expect(gstinLookupErrorMessage({ response: { data: { message: "Only this" } } }, "x")).toBe(
      "Only this",
    );
    expect(gstinLookupErrorMessage(new Error("connect ECONNREFUSED"), "x")).toBe(
      "connect ECONNREFUSED",
    );
    expect(gstinLookupErrorMessage("junk", "fallback")).toBe("fallback");
  });

  it("reports a superseded request and an empty answer in words", async () => {
    expect(await fetchGstinDetails(async () => undefined, "33ABNPL5414F1ZU")).toEqual({
      ok: false,
      message: GSTIN_LOOKUP_MESSAGES.interrupted,
    });
    expect(await fetchGstinDetails(async () => ({ success: true, data: {} }), "33ABNPL5414F1ZU")).toEqual(
      { ok: false, message: GSTIN_LOOKUP_MESSAGES.unavailable },
    );
  });
});

describe("normalizeGstinLookupPayload", () => {
  it("derives state code and PAN from the GSTIN when the record lacks them", () => {
    const payload = normalizeGstinLookupPayload({
      data: { gstin: "33abnpl5414f1zu", legalName: "X", gstRegType: "Sez Unit" },
    });
    expect(payload).toMatchObject({
      gstin: "33ABNPL5414F1ZU",
      stateCode: "33",
      panNo: "ABNPL5414F",
      gstRegType: null,
      address: null,
    });
  });

  it("accepts the bare record and the four registration codes", () => {
    expect(normalizeGstinLookupPayload({ gstin: "33ABNPL5414F1ZU", gstRegType: "SEZ" })?.gstRegType).toBe(
      "SEZ",
    );
    expect(normalizeGstinLookupPayload(null)).toBeNull();
    expect(normalizeGstinLookupPayload({ success: true, data: { status: "Active" } })).toBeNull();
  });
});

describe("gstinLookupToValues", () => {
  const payload = normalizeGstinLookupPayload(ACME_RESPONSE) as GstinLookupPayload;

  it("fills the company form by prefix, state as its NAME", () => {
    expect(
      gstinLookupToValues(payload, prefixedGstinLookupFieldMap("comp", { gstApplicable: "compGstApplicable" }), {
        stateNameByCode: STATE_NAME_BY_CODE,
      }),
    ).toEqual({
      compGstinNo: "33ABNPL5414F1ZU",
      compPanNo: "ABNPL5414F",
      compCountry: "India",
      compGstApplicable: "true",
      compName: "ACME FOODS",
      compLegalName: "ACME FOODS PRIVATE LIMITED",
      compGstRegType: "REGULAR",
      compAddr1: "12, Mill Road",
      compAddr2: "Main St, Coimbatore",
      compAddr3: "Coimbatore, Coimbatore",
      compCity: "Coimbatore",
      compDistrict: "Coimbatore",
      compStateCode: "33",
      compState: "Tamil Nadu",
      compPin: "641001",
    });
  });

  it("prefers the legal name when there is no trade name, and the address state when the code is unknown", () => {
    const values = gstinLookupToValues(
      {
        ...payload,
        tradeName: null,
        stateCode: "99",
        address: { ...payload.address!, city: null, district: "Salem" },
      },
      prefixedGstinLookupFieldMap("br", { legalName: undefined }),
      { stateNameByCode: STATE_NAME_BY_CODE },
    );
    expect(values.brName).toBe("ACME FOODS PRIVATE LIMITED");
    expect(values.brLegalName).toBeUndefined();
    expect(values.brState).toBe("Tamil Nadu");
    expect(values.brStateCode).toBe("99");
    expect(values.brDistrict).toBe("Salem");
    expect(values.brAddr3).toBe("Salem");
    expect(values.brCity).toBeUndefined();
  });

  it("keeps a screen's registration list: SEZ falls back to REGULAR where SEZ is not offered", () => {
    const sez = { ...payload, gstRegType: "SEZ" as const };
    expect(gstinLookupToValues(sez, { regType: "cusGstType" }).cusGstType).toBe("SEZ");
    expect(
      gstinLookupToValues(sez, { regType: "cusGstType" }, {
        allowedRegTypes: ["REGULAR", "COMPOSITION", "UNREGISTERED"],
      }).cusGstType,
    ).toBe("REGULAR");
    expect(
      gstinLookupToValues({ ...payload, gstRegType: null }, { regType: "x" }, { fallbackRegType: null }),
    ).toEqual({});
  });
});
