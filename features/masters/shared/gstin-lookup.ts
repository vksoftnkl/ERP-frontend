/**
 * GSTIN lookup through the server (`GET /gst/search?gstin=`, notes 72 C6).
 *
 * The server asks the configured GST provider and answers a normalised
 * record — legal and trade name, registration type as one of the four
 * GST_REG_TYPES, state code, PAN and the principal address — so no screen
 * parses the provider's `lgnm` / `pradr` / `dty` keys any more, and the ASP
 * credentials live on the server, not in a Next route.
 *
 * Two halves, both pure:
 *  - `fetchGstinDetails` runs the request through whatever `useApi` hands it
 *    and turns success, a 404 / 503 and a network failure into one result;
 *  - `gstinLookupToValues` turns the record into a form-values patch for a
 *    screen's own field names (`prefixedGstinLookupFieldMap("comp")` for the
 *    company and branch masters; customer / supplier / ledger name theirs).
 */
import { GST_REG_TYPES, type GstRegType, normalizeGstin, panOfGstin, stateCodeOfGstin } from "./gst-registration";

export const GSTIN_LOOKUP_ENDPOINT = "/gst/search";

/** What the forms wait for before asking: fifteen letters or digits. */
export const GSTIN_LOOKUP_INPUT_PATTERN = /^[0-9A-Z]{15}$/;

export const GSTIN_LOOKUP_MESSAGES = {
  invalid: "GSTIN must be exactly 15 letters or digits.",
  unavailable: "GST details were not available for this GSTIN.",
  failed: "Unable to load GST details for this GSTIN.",
  interrupted: "Unable to load GST details right now. Please try again.",
} as const;

/** The taxpayer's principal place of business. */
export type GstinLookupAddress = {
  building: string | null;
  street: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pin: string | null;
};

/** `GET /gst/search`'s `data`, as the server's GstinLookupPayload. */
export type GstinLookupPayload = {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  /** The provider's status text, e.g. "Active", "Cancelled". */
  status: string | null;
  /** The provider's registration type text, e.g. "Regular". */
  registrationType: string | null;
  /** registrationType as a GST_REG_TYPES value, or null when it is none of them. */
  gstRegType: GstRegType | null;
  stateCode: string;
  panNo: string;
  registeredOn: string | null;
  address: GstinLookupAddress | null;
};

/** `useApi(...).getAll` fits: a GET with a query, resolving to the response body. */
export type GstinLookupRequest = (query: Record<string, string>) => Promise<unknown>;

export type GstinLookupResult =
  | { ok: true; payload: GstinLookupPayload }
  | { ok: false; message: string };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toGstRegType(value: unknown): GstRegType | null {
  const upper = text(value)?.toUpperCase() ?? "";
  return (GST_REG_TYPES as readonly string[]).includes(upper) ? (upper as GstRegType) : null;
}

function normalizeAddress(value: unknown): GstinLookupAddress | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    building: text(value.building),
    street: text(value.street),
    locality: text(value.locality),
    city: text(value.city),
    district: text(value.district),
    state: text(value.state),
    pin: text(value.pin),
  };
}

/**
 * The record out of the response envelope (`{ success, message, data }`), or
 * null when there is no taxpayer in it. Tolerates the bare record too.
 */
export function normalizeGstinLookupPayload(response: unknown): GstinLookupPayload | null {
  if (!isRecord(response)) {
    return null;
  }
  const data = isRecord(response.data) ? response.data : response;
  const gstin = normalizeGstin(text(data.gstin) ?? "");
  const legalName = text(data.legalName);
  const tradeName = text(data.tradeName);
  if (!gstin && !legalName && !tradeName) {
    return null;
  }
  return {
    gstin,
    legalName,
    tradeName,
    status: text(data.status),
    registrationType: text(data.registrationType),
    gstRegType: toGstRegType(data.gstRegType),
    stateCode: text(data.stateCode) ?? (gstin ? stateCodeOfGstin(gstin) : ""),
    panNo: (text(data.panNo) ?? (gstin ? panOfGstin(gstin) : "")).toUpperCase(),
    registeredOn: text(data.registeredOn),
    address: normalizeAddress(data.address),
  };
}

/**
 * The server's words for a failed lookup. An axios error carries the body under
 * `response.data` as `{ message, errors: [{ field, message }] }`; the field
 * message is the specific one ("The GST service has no details for GSTIN …").
 */
export function gstinLookupErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : null;
    const body = response && isRecord(response.data) ? response.data : null;
    if (body) {
      const errors = Array.isArray(body.errors) ? body.errors : [];
      for (const entry of errors) {
        const detail = isRecord(entry) ? text(entry.message) : null;
        if (detail) {
          return detail;
        }
      }
      const message = text(body.message);
      if (message) {
        return message;
      }
    }
    const own = text(error.message);
    if (own && !response) {
      return own;
    }
  }
  return fallback;
}

/** Ask the server for a GSTIN's registered details. Never throws. */
export async function fetchGstinDetails(
  request: GstinLookupRequest,
  gstin: string,
): Promise<GstinLookupResult> {
  const normalized = normalizeGstin(gstin);
  if (!GSTIN_LOOKUP_INPUT_PATTERN.test(normalized)) {
    return { ok: false, message: GSTIN_LOOKUP_MESSAGES.invalid };
  }
  let response: unknown;
  try {
    response = await request({ gstin: normalized });
  } catch (error) {
    return { ok: false, message: gstinLookupErrorMessage(error, GSTIN_LOOKUP_MESSAGES.failed) };
  }
  if (response === undefined) {
    // useApi resolves undefined for a request a newer one superseded.
    return { ok: false, message: GSTIN_LOOKUP_MESSAGES.interrupted };
  }
  const payload = normalizeGstinLookupPayload(response);
  if (!payload) {
    return { ok: false, message: GSTIN_LOOKUP_MESSAGES.unavailable };
  }
  return { ok: true, payload: { ...payload, gstin: payload.gstin || normalized } };
}

// ---------------------------------------------------------------------------
// Record → form values.

export type GstinLookupFieldKey =
  | "name"
  | "legalName"
  | "gstin"
  | "pan"
  | "regType"
  | "addr1"
  | "addr2"
  | "addr3"
  | "city"
  | "district"
  | "stateCode"
  | "stateName"
  | "pin"
  | "country"
  | "gstApplicable";

/** Which form field each piece of the record lands in; leave a key out to skip it. */
export type GstinLookupFieldMap = Partial<Record<GstinLookupFieldKey, string>>;

/**
 * The company / branch masters' field names: `comp` → compName, compLegalName,
 * compGstinNo, compPanNo, compGstRegType, compAddr1-3, compCity, compDistrict,
 * compStateCode, compState (the state NAME field), compPin, compCountry.
 */
export function prefixedGstinLookupFieldMap(
  prefix: string,
  overrides: GstinLookupFieldMap = {},
): GstinLookupFieldMap {
  return {
    name: `${prefix}Name`,
    legalName: `${prefix}LegalName`,
    gstin: `${prefix}GstinNo`,
    pan: `${prefix}PanNo`,
    regType: `${prefix}GstRegType`,
    addr1: `${prefix}Addr1`,
    addr2: `${prefix}Addr2`,
    addr3: `${prefix}Addr3`,
    city: `${prefix}City`,
    district: `${prefix}District`,
    stateCode: `${prefix}StateCode`,
    stateName: `${prefix}State`,
    pin: `${prefix}Pin`,
    country: `${prefix}Country`,
    ...overrides,
  };
}

export type GstinLookupToValuesOptions = {
  /** State code → state name, for a form whose State field holds the name. */
  stateNameByCode?: Record<string, string>;
  /**
   * The registration types the screen's select offers. The record's type is
   * written when it is one of them; otherwise `fallbackRegType` is (the old
   * mappers wrote REGULAR for anything they did not know).
   */
  allowedRegTypes?: readonly string[];
  fallbackRegType?: string | null;
};

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(", ");
}

/**
 * The form-values patch a lookup writes: name ← trade name, else legal name;
 * address line 1 ← building, 2 ← street + locality, 3 ← district + city;
 * district ← district, else city; state name resolved from the state code.
 * Fields the record has nothing for are left untouched, except GSTIN, PAN,
 * country ("India") and GST Applicable ("true"), which the lookup settles.
 */
export function gstinLookupToValues(
  payload: GstinLookupPayload,
  fieldMap: GstinLookupFieldMap,
  options: GstinLookupToValuesOptions = {},
): Record<string, string> {
  const values: Record<string, string> = {};
  const put = (key: GstinLookupFieldKey, value: string | null | undefined, always = false) => {
    const fieldName = fieldMap[key];
    const normalized = value?.trim() ?? "";
    if (!fieldName || (!normalized && !always)) {
      return;
    }
    values[fieldName] = normalized;
  };
  const address = payload.address;
  const city = address?.city ?? null;
  const stateCode = payload.stateCode || stateCodeOfGstin(payload.gstin);
  const stateName = options.stateNameByCode?.[stateCode] || address?.state || null;
  const allowed = options.allowedRegTypes ?? GST_REG_TYPES;
  const regType =
    payload.gstRegType && allowed.includes(payload.gstRegType)
      ? payload.gstRegType
      : options.fallbackRegType === undefined
        ? "REGULAR"
        : options.fallbackRegType;

  put("gstin", payload.gstin, true);
  put("pan", payload.panNo || panOfGstin(payload.gstin), true);
  put("country", "India", true);
  put("gstApplicable", "true", true);
  put("name", payload.tradeName || payload.legalName);
  put("legalName", payload.legalName);
  put("regType", regType);
  put("addr1", address?.building);
  put("addr2", joinParts([address?.street, address?.locality]));
  put("addr3", joinParts([address?.district, city]));
  put("city", city);
  put("district", address?.district || city);
  put("stateCode", stateCode);
  put("stateName", stateName);
  put("pin", address?.pin);
  return values;
}
