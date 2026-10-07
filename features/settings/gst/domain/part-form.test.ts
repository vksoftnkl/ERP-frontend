import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FORM,
  CREDENTIAL_FIELDS,
  ENDPOINT_FORM,
  ERROR_MAP_FORM,
  PROVIDER_FIELDS,
  SERVICE_FORM,
} from "./forms";
import { formatStamp, gstErrorCode, gstErrorText, gstFirstErrorMessage } from "./format";
import {
  buildPartBody,
  camelRow,
  emptyPartState,
  fillPartState,
  linesToObject,
  secretBadge,
  setPartValue,
  setSecretText,
  toggleSecretClear,
  validatePart,
} from "./part-form";

describe("new rows", () => {
  it("start on the table's own defaults, not the first combo item", () => {
    const endpoint = emptyPartState(ENDPOINT_FORM.fields);
    expect(endpoint.values.gpeHttpMethod).toBe("POST");
    expect(endpoint.values.gpeContentType).toBe("application/json");
    expect(endpoint.values.gpeIsActive).toBe(true);
    const errorMap = emptyPartState(ERROR_MAP_FORM.fields);
    expect(errorMap.values.gemSeverity).toBe("ERROR");
    expect(errorMap.values.gemService).toBe("");
  });

  it("start a provider switched off", () => {
    const provider = emptyPartState(PROVIDER_FIELDS);
    expect(provider.values.gpvIsActive).toBe(false);
    expect(provider.values.gpvTimeoutMs).toBe("45000");
  });

  it("send no id, and stamp the parent", () => {
    const state = setPartValue(emptyPartState(SERVICE_FORM.fields), "gpsBaseUrl", " https://h.example ");
    const body = buildPartBody(SERVICE_FORM.fields, state, {
      idKey: "gpsId",
      parentKey: "gpsGpvId",
      parentId: "P1",
    });
    expect(body.gpsId).toBeUndefined();
    expect(body.gpsGpvId).toBe("P1");
    expect(body.gpsBaseUrl).toBe("https://h.example");
    expect(body.gpsFallbackUrls).toEqual([]);
    // Blank "provider's" overrides go out as null; blank defaults-from-table are left off.
    expect(body.gpsTimeoutMs).toBeNull();
    expect(body.gpsTokenTtlMinutes).toBe(360);
    expect(body.gpsRemarks).toBeNull();
  });
});

describe("bodies", () => {
  it("edits arrays one per line and objects as Name: value", () => {
    const state = fillPartState(ENDPOINT_FORM.fields, {
      gpeId: "E1",
      gpeAction: "AUTH",
      gpePathTemplate: "/auth",
      gpeHeaders: { Gstin: "{gstin}", client_id: "{clientId}" },
      gpeRedactPaths: ["$.Password", "$.AppKey"],
    });
    expect(state.values.gpeHeaders).toBe("Gstin: {gstin}\nclient_id: {clientId}");
    expect(state.values.gpeRedactPaths).toBe("$.Password\n$.AppKey");
    const body = buildPartBody(ENDPOINT_FORM.fields, state, { idKey: "gpeId", id: "E1" });
    expect(body.gpeHeaders).toEqual({ Gstin: "{gstin}", client_id: "{clientId}" });
    expect(body.gpeRedactPaths).toEqual(["$.Password", "$.AppKey"]);
    expect(body.gpeId).toBe("E1");
    expect(body.fieldMaps).toBeUndefined();
  });

  it("reads a header line on its FIRST colon and drops nameless lines", () => {
    expect(linesToObject("Url: https://x:8080/a\n: orphan\n\nX:1")).toEqual({
      Url: "https://x:8080/a",
      X: "1",
    });
    expect(linesToObject("  ")).toBeNull();
  });

  it("sends an (all …) choice as null", () => {
    const state = emptyPartState(ACCOUNT_FORM.fields);
    const body = buildPartBody(ACCOUNT_FORM.fields, state, { idKey: "gpaId" });
    expect(body.gpaService).toBeNull();
  });

  it("upper-cases the provider code", () => {
    const state = setPartValue(emptyPartState(PROVIDER_FIELDS), "gpvCode", " chartered ");
    expect(buildPartBody(PROVIDER_FIELDS, state, { idKey: "gpvId" }).gpvCode).toBe("CHARTERED");
  });
});

describe("a partial (grid) row", () => {
  // Grid 130 carries no severity, extract path, canonical field or retry-after.
  const gridRow = camelRow({
    gem_id: "M1",
    gem_service: "",
    gem_their_code: "2150",
    gem_our_code: "DUPLICATE_IRN",
    gem_treat_as: "SUCCESS",
    gem_is_retryable: false,
    gem_should_reauth: "false",
    gem_recovery_action: "NONE",
    gem_message: "Already generated",
  });

  it("keeps what the grid did not carry off the body", () => {
    const state = fillPartState(ERROR_MAP_FORM.fields, gridRow, { partial: true });
    expect(state.unknown.sort()).toEqual(
      ["gemCanonicalField", "gemExtractPath", "gemRetryAfterSeconds", "gemSeverity"].sort(),
    );
    const body = buildPartBody(ERROR_MAP_FORM.fields, state, { idKey: "gemId", id: "M1" });
    expect(body).not.toHaveProperty("gemSeverity");
    expect(body).not.toHaveProperty("gemExtractPath");
    expect(body.gemService).toBeNull();
    expect(body.gemTheirCode).toBe("2150");
    expect(body.gemShouldReauth).toBe(false);
  });

  it("sends an unknown field once the operator sets it", () => {
    const state = setPartValue(
      fillPartState(ERROR_MAP_FORM.fields, gridRow, { partial: true }),
      "gemSeverity",
      "WARN",
    );
    expect(buildPartBody(ERROR_MAP_FORM.fields, state, { idKey: "gemId", id: "M1" }).gemSeverity).toBe("WARN");
  });
});

describe("secrets", () => {
  const credentialRow = {
    gccId: "C1",
    gccCompanyId: "CO",
    compName: "Acme",
    gccGpvId: "P1",
    gpvName: "Chartered",
    gccBranchId: null,
    gccService: null,
    gccEnvironment: "SANDBOX",
    gccPriority: 1,
    gccLoginId: "acme_api",
    hasPassword: true,
    hasClientId: true,
    hasClientSecret: false,
    hasAppKey: false,
    keyVersion: 2,
    gccWhitelistedIps: ["192.168.0.106"],
    gccValidFrom: "2026-04-01",
    gccValidUpto: null,
    gccIsActive: true,
  };

  it("never send a stored value: an empty box is absent", () => {
    const state = fillPartState(CREDENTIAL_FIELDS, credentialRow);
    const body = buildPartBody(CREDENTIAL_FIELDS, state, { idKey: "gccId", id: "C1" });
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("clientId");
    expect(body).not.toHaveProperty("clear");
    expect(body.gccBranchId).toBeNull();
    expect(body.gccService).toBeNull();
    expect(body.gccWhitelistedIps).toEqual(["192.168.0.106"]);
    expect(state.labels.gccCompanyId).toBe("Acme");
  });

  it("send typed text untrimmed, and × as clear[] — where the server allows it", () => {
    let state = fillPartState(CREDENTIAL_FIELDS, credentialRow);
    state = setSecretText(state, "password", "s3cret ");
    state = toggleSecretClear(state, "clientId");
    const body = buildPartBody(CREDENTIAL_FIELDS, state, { idKey: "gccId", id: "C1" });
    expect(body.password).toBe("s3cret ");
    expect(body.clear).toEqual(["clientId"]);
  });

  it("treat typing and clearing as opposites", () => {
    let state = fillPartState(CREDENTIAL_FIELDS, credentialRow);
    state = toggleSecretClear(state, "clientId");
    state = setSecretText(state, "clientId", "new-id");
    expect(state.secrets.clientId).toMatchObject({ text: "new-id", clear: false });
    state = toggleSecretClear(state, "clientId");
    expect(state.secrets.clientId).toMatchObject({ text: "", clear: true });
  });

  it("paint the pill from the flag and the key version", () => {
    expect(secretBadge({ text: "", clear: false, stored: true }, 2)).toEqual({ label: "set · key v2", tone: "green" });
    expect(secretBadge({ text: "", clear: false, stored: false }, 2)).toEqual({ label: "not set", tone: "grey" });
    expect(secretBadge({ text: "x", clear: false, stored: true }, 2).label).toBe("will replace");
    expect(secretBadge({ text: "x", clear: false, stored: false }, 2).label).toBe("will be set");
    expect(secretBadge({ text: "", clear: true, stored: true }, 2)).toEqual({ label: "will be removed", tone: "red" });
  });

  it("ask for the password only while none is stored", () => {
    const fresh = setPartValue(
      setPartValue(
        setPartValue(setPartValue(emptyPartState(CREDENTIAL_FIELDS), "gccCompanyId", "CO"), "gccGpvId", "P1"),
        "gccLoginId",
        "u",
      ),
      "gccValidFrom",
      "2026-04-01",
    );
    expect(validatePart(CREDENTIAL_FIELDS, fresh)).toEqual({
      key: "password",
      message: "Enter the portal password.",
    });
    expect(validatePart(CREDENTIAL_FIELDS, fillPartState(CREDENTIAL_FIELDS, credentialRow))).toBeNull();
  });
});

describe("validation", () => {
  it("names the first required field, in field order", () => {
    expect(validatePart(PROVIDER_FIELDS, emptyPartState(PROVIDER_FIELDS))?.key).toBe("gpvCode");
  });

  it("checks whole-number ranges", () => {
    const state = setPartValue(
      setPartValue(setPartValue(emptyPartState(PROVIDER_FIELDS), "gpvCode", "X"), "gpvName", "X"),
      "gpvMaxRetries",
      "11",
    );
    expect(validatePart(PROVIDER_FIELDS, state)?.message).toBe("Max retries must be a whole number from 0 to 10.");
  });
});

describe("refusals", () => {
  const error = {
    status: 503,
    message: "GST provider CHARTERED is inactive",
    data: {
      success: false,
      message: "GST is switched off",
      errors: [{ field: "gpvId", message: "GST provider CHARTERED is inactive", code: "GST_SWITCHED_OFF" }],
    },
  };

  it("joins the title and the reason, and reads the code", () => {
    expect(gstErrorText(error, "x")).toBe("GST is switched off. GST provider CHARTERED is inactive");
    expect(gstErrorCode(error)).toBe("GST_SWITCHED_OFF");
    expect(gstFirstErrorMessage(error)).toBe("GST provider CHARTERED is inactive");
    expect(gstErrorText(null, "fallback")).toBe("fallback");
  });

  it("formats a stamp or says nothing", () => {
    expect(formatStamp(null)).toBe("—");
    expect(formatStamp("not a date")).toBe("—");
    expect(formatStamp("2026-10-02T11:42:00")).toBe("02-10-2026 11:42");
  });
});
