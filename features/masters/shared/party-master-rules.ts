/**
 * Party master rules (Shared/Prathap/party/plan-party-master-rules.md §3.2,
 * §4, §6; answers in decisions-party-master-rules-2026-10-29.md), the rules the
 * Customer (menu 10) and Supplier (menu 22) masters share.
 *
 * The client mirror of the server's `common/party/party-gst-type.ts`,
 * `common/party/party-balance.service.ts` (delete-check) and
 * `common/party/party-sync.service.ts` (`data.partySync`), and of the
 * customer DTO's `CUSTOMER_GSTIN_PATTERNS`. Pure: no React, no network.
 * `party-master-rules.test.ts` pins the rules.
 */
import { hasValidGstinChecksum } from "@/utils/validation";

export type PartyRole = "customer" | "supplier";

// ---------------------------------------------------------------------------
// D2: the five GST types.

/** The codes both masters save (sup_gst_type / cus_gst_type). */
export const PARTY_GST_TYPES = ["REGULAR", "COMPOSITION", "SEZ", "OVERSEAS", "UNREGISTERED"] as const;
export type PartyGstType = (typeof PARTY_GST_TYPES)[number];

/** Words shown, codes saved (plan §5: Regular / Composition / SEZ / Overseas / Unregistered). */
export const PARTY_GST_TYPE_OPTIONS: { value: PartyGstType; label: string }[] = [
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "SEZ", label: "SEZ" },
  { value: "OVERSEAS", label: "Overseas" },
  { value: "UNREGISTERED", label: "Unregistered" },
];

/** fixed.state_codes '96' Other Country: an overseas party's state (Q6). */
export const OVERSEAS_STATE_CODE = "96";

/** The country a new party form starts with (Qt `supCountry` default). */
export const HOME_COUNTRY = "India";

/**
 * The Country to write when State changes, or undefined to leave it alone.
 * Picking 96 "Other Country" while Country still says the home default blanks
 * it, so an overseas party is not saved as "India"; anything the operator
 * typed is kept. (Web-only: the Qt form leaves Country as it is.)
 */
export function countryForStateChange(
  stateCode: string | null | undefined,
  country: string | null | undefined,
): string | undefined {
  if ((stateCode ?? "").trim() !== OVERSEAS_STATE_CODE) {
    return undefined;
  }
  return (country ?? "").trim().toUpperCase() === HOME_COUNTRY.toUpperCase() ? "" : undefined;
}

const GSTIN_TYPES: ReadonlySet<PartyGstType> = new Set(["REGULAR", "COMPOSITION", "SEZ"]);

/**
 * Old spellings ("Regular", "SEZ Unit", "un registered" …) as the server reads
 * them: upper-cased, spaces / '_' / '-' removed. `""` = blank or not one of the five.
 */
const LEGACY_KEYS: Readonly<Record<string, PartyGstType>> = {
  REGULAR: "REGULAR",
  COMPOSITION: "COMPOSITION",
  SEZ: "SEZ",
  SEZUNIT: "SEZ",
  OVERSEAS: "OVERSEAS",
  UNREGISTERED: "UNREGISTERED",
};

export function normalizePartyGstType(raw: string | null | undefined): PartyGstType | "" {
  if (typeof raw !== "string") {
    return "";
  }
  const key = raw.trim().toUpperCase().replace(/[\s_-]+/g, "");
  return LEGACY_KEYS[key] ?? "";
}

export function partyGstTypeLabel(type: string): string {
  const code = normalizePartyGstType(type);
  return PARTY_GST_TYPE_OPTIONS.find((option) => option.value === code)?.label ?? type.trim();
}

/** REGULAR / COMPOSITION / SEZ must carry a GST No. */
export function gstTypeNeedsGstin(type: string): boolean {
  const code = normalizePartyGstType(type);
  return code !== "" && GSTIN_TYPES.has(code);
}

/** UNREGISTERED / OVERSEAS must not carry one (Q5). */
export function gstTypeRefusesGstin(type: string): boolean {
  const code = normalizePartyGstType(type);
  return code === "UNREGISTERED" || code === "OVERSEAS";
}

// ---------------------------------------------------------------------------
// GSTIN shapes: every GSTN registration the server accepts (save-customer.dto.ts).

export const GSTIN_KIND_PATTERNS = {
  NORMAL: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  TDS_DEDUCTOR: /^[0-9]{2}[A-Z]{4}[0-9]{5}[A-Z][1-9A-Z]D[0-9A-Z]$/,
  UIN: /^[0-9]{4}[A-Z]{3}[0-9]{5}[UO]N[0-9A-Z]$/,
  OIDAR: /^99[0-9]{2}[A-Z]{3}[0-9]{5}OS[0-9A-Z]$/,
  NRTP: /^[0-9]{4}[A-Z]{3}[0-9]{5}NR[0-9A-Z]$/,
} as const;
export type GstinKind = keyof typeof GSTIN_KIND_PATTERNS;

export function gstinKindOf(raw: string): GstinKind | null {
  const gstin = raw.trim().toUpperCase();
  for (const kind of Object.keys(GSTIN_KIND_PATTERNS) as GstinKind[]) {
    if (GSTIN_KIND_PATTERNS[kind].test(gstin)) {
      return kind;
    }
  }
  return null;
}

export const PARTY_GSTIN_INVALID_MESSAGE =
  "The GST No is not valid. It must be a 15-character GSTIN (e.g. 33AAAAA0000A1Z5), TDS, UIN, OIDAR or NRTP number.";
export const PARTY_GSTIN_CHECKSUM_MESSAGE =
  "The GST No's last character does not match (a typing mistake?). Check the GST No.";

/**
 * The GST No's own shape. Any GSTN shape passes; a NORMAL one also passes the
 * mod-36 check character, as the Qt TaxValidator does (the server's DTO keeps
 * no checksum test and leaves that to the clients).
 */
export function validatePartyGstinFormat(raw: string): string | null {
  const gstin = raw.trim().toUpperCase();
  if (!gstin) {
    return null;
  }
  const kind = gstinKindOf(gstin);
  if (!kind) {
    return PARTY_GSTIN_INVALID_MESSAGE;
  }
  if (kind === "NORMAL" && !hasValidGstinChecksum(gstin)) {
    return PARTY_GSTIN_CHECKSUM_MESSAGE;
  }
  return null;
}

/** The customer DTO's PAN: 5 letters, 4 digits, 1 letter. */
export const PARTY_PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// ---------------------------------------------------------------------------
// The type / GST No / state rule, in the server's words (Error_Messages.json).

export type PartyGstRuleInput = {
  role: PartyRole;
  gstType: string;
  gstin: string;
  /** The picked state's 2-digit code; "" while none is picked (skips the state checks). */
  stateCode: string;
};

/** Which field the refusal belongs to, and its sentence. */
export type PartyGstRuleRefusal = { field: "gstType" | "gstin" | "state"; message: string };

/**
 * The server's resolvePartyGstType, client side: what a save of these values
 * would be refused for, or null. A blank type with no GST No passes (the
 * server stores UNREGISTERED); the screens' own "required" covers the select.
 */
export function checkPartyGstRules(input: PartyGstRuleInput): PartyGstRuleRefusal | null {
  const word = input.role;
  const gstin = input.gstin.trim().toUpperCase();
  const rawType = input.gstType.trim();
  const type = normalizePartyGstType(rawType);
  if (rawType && !type) {
    return {
      field: "gstType",
      message: "GST type must be Regular, Composition, SEZ, Overseas or Unregistered. Pick one from the list.",
    };
  }
  if (!type) {
    return gstin
      ? { field: "gstType", message: `This ${word} has a GST No but no GST type. Pick the GST type.` }
      : null;
  }
  const label = partyGstTypeLabel(type);
  if (GSTIN_TYPES.has(type) && !gstin) {
    return {
      field: "gstin",
      message: `A ${label} ${word} must have a GST No. Type the GST No, or choose Unregistered.`,
    };
  }
  if (!GSTIN_TYPES.has(type) && gstin) {
    return {
      field: "gstin",
      message: `An ${label} ${word} has no GST No. Clear the GST No, or choose Regular.`,
    };
  }
  const stateCode = input.stateCode.trim().toUpperCase();
  if (type === "OVERSEAS" && stateCode && stateCode !== OVERSEAS_STATE_CODE) {
    return {
      field: "state",
      message: `An overseas ${word}'s state must be "Other Country". Choose Other Country as the state.`,
    };
  }
  if (gstin) {
    const format = validatePartyGstinFormat(gstin);
    if (format) {
      return { field: "gstin", message: format };
    }
    // Only a NORMAL number starts with its state (TDS / UIN / OIDAR / NRTP are not checked).
    if (stateCode && gstinKindOf(gstin) === "NORMAL" && gstin.slice(0, 2) !== stateCode) {
      return {
        field: "gstin",
        message:
          `This GST No is from state ${gstin.slice(0, 2)}, but the state is ${stateCode}. ` +
          "Correct the GST No or the state.",
      };
    }
  }
  return null;
}

/** The message for one field (the GST No box, the state box …), or null. */
export function partyGstRuleMessageFor(
  field: PartyGstRuleRefusal["field"],
  input: PartyGstRuleInput,
): string | null {
  const refusal = checkPartyGstRules(input);
  return refusal && refusal.field === field ? refusal.message : null;
}

// ---------------------------------------------------------------------------
// D1: GET /customers/delete-check · /suppliers/delete-check.

export type PartyUserWording = { title: string; line: string; todo: string };

export type PartyDeleteCheck = {
  partyId: string;
  role: "CUSTOMER" | "SUPPLIER";
  otherRoleLive: boolean;
  ledgerWouldBeDeleted: boolean;
  canDelete: boolean;
  refusalCode: string | null;
  balances: { companyId: string; companyName: string | null; amount: string; drCr: "DR" | "CR" }[];
  warnings: { draftDocs: number; openBills: number; chequesInHand: number };
  refusals: { field: string; code: string; message: string; user: PartyUserWording | null }[];
};

export const PARTY_DELETE_CHECK_ENDPOINT: Record<PartyRole, { url: string; idParam: string }> = {
  customer: { url: "/customers/delete-check", idParam: "cusId" },
  supplier: { url: "/suppliers/delete-check", idParam: "supId" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function wording(value: unknown): PartyUserWording | null {
  if (!isRecord(value) || !text(value.line)) {
    return null;
  }
  return { title: text(value.title), line: text(value.line), todo: text(value.todo) };
}

/** The `{ success, data }` envelope or its data; null when it is not a delete-check. */
export function parsePartyDeleteCheck(raw: unknown): PartyDeleteCheck | null {
  const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
  if (!isRecord(data) || typeof data.canDelete !== "boolean") {
    return null;
  }
  const warnings = isRecord(data.warnings) ? data.warnings : {};
  return {
    partyId: text(data.partyId),
    role: data.role === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER",
    otherRoleLive: data.otherRoleLive === true,
    ledgerWouldBeDeleted: data.ledgerWouldBeDeleted === true,
    canDelete: data.canDelete,
    refusalCode: text(data.refusalCode) || null,
    balances: (Array.isArray(data.balances) ? data.balances : []).filter(isRecord).map((row) => ({
      companyId: text(row.companyId),
      companyName: text(row.companyName) || null,
      amount: text(row.amount) || String(row.amount ?? ""),
      drCr: row.drCr === "CR" ? "CR" : "DR",
    })),
    warnings: {
      draftDocs: count(warnings.draftDocs),
      openBills: count(warnings.openBills),
      chequesInHand: count(warnings.chequesInHand),
    },
    refusals: (Array.isArray(data.refusals) ? data.refusals : []).filter(isRecord).map((row) => ({
      field: text(row.field),
      code: text(row.code),
      message: text(row.message),
      user: wording(row.user),
    })),
  };
}

/**
 * Why the delete is refused, in the server's own words (the first refusal's
 * `user` block), for `toast.apiError`'s envelope shape. Null when it may go.
 */
export function deleteCheckRefusalEnvelope(
  check: PartyDeleteCheck,
): { status: number; data: { success: false; message: string; errors: unknown[] } } | null {
  if (check.canDelete) {
    return null;
  }
  const errors = check.refusals.length
    ? check.refusals.map((refusal) => ({
        field: refusal.field,
        code: refusal.code,
        message: refusal.message,
        ...(refusal.user ? { user: refusal.user } : {}),
      }))
    : [{ field: "", code: check.refusalCode ?? "", message: "This party cannot be deleted now." }];
  // The server's own sentence goes in the grey support line, as a DELETE refusal would.
  const sentence = check.refusals[0]?.message || "Cannot delete";
  return { status: 409, data: { success: false, message: sentence, errors } };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The lines the confirm adds (plan §5): unposted drafts, open bills, and on a
 * shared party that the other role keeps the ledger.
 */
export function deleteCheckNotes(check: PartyDeleteCheck, role: PartyRole): string[] {
  const notes: string[] = [];
  const { draftDocs, openBills, chequesInHand } = check.warnings;
  if (draftDocs > 0) {
    notes.push(`It has ${plural(draftDocs, "unposted draft", "unposted drafts")}; they cannot be posted after the delete.`);
  }
  if (openBills > 0) {
    notes.push(`It has ${plural(openBills, "open bill", "open bills")}; they cannot be settled after the delete.`);
  }
  if (chequesInHand > 0) {
    notes.push(`It has ${plural(chequesInHand, "cheque", "cheques")} not cleared yet.`);
  }
  if (check.otherRoleLive) {
    const other = role === "customer" ? "supplier" : "customer";
    notes.push(`This party is also a ${other}: the ${other} side keeps the ledger and its balance.`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// D4: the other role on the same ledger, and `data.partySync`.

/** The info line on a saved form whose party is also the other role (plan §5). */
export function partyAlsoNote(role: PartyRole): string {
  return role === "customer"
    ? "This party is also a supplier. Name, address, phones, GST No, PAN and GST type also change on the supplier."
    : "This party is also a customer. Name, address, phones, GST No, PAN and GST type also change on the customer.";
}

export type PartySync = {
  otherRole: "SUPPLIER" | "CUSTOMER" | null;
  otherRoleUpdated: boolean;
  /** The other role's own keys that changed, e.g. ["supAddr1", "supPhone"]. */
  fields: string[];
};

/** `data.partySync` off a save response (the envelope or its data); null when absent. */
export function parsePartySync(response: unknown): PartySync | null {
  const data = isRecord(response) && isRecord(response.data) ? response.data : response;
  const sync = isRecord(data) ? data.partySync : null;
  if (!isRecord(sync)) {
    return null;
  }
  return {
    otherRole: sync.otherRole === "SUPPLIER" || sync.otherRole === "CUSTOMER" ? sync.otherRole : null,
    otherRoleUpdated: sync.otherRoleUpdated === true,
    fields: (Array.isArray(sync.fields) ? sync.fields : []).filter(
      (field): field is string => typeof field === "string" && field.length > 0,
    ),
  };
}

/** The synced keys (party-detail.map.ts), both roles, as a person reads them. */
const PARTY_FIELD_LABELS: Readonly<Record<string, string>> = {
  cusName: "Name",
  supName: "Name",
  cusShort: "Short Name",
  supShort: "Short Name",
  cusAddr1: "Address 1",
  supAddr1: "Address 1",
  cusAddr2: "Address 2",
  supAddr2: "Address 2",
  cusAddr3: "Address 3",
  supAddr3: "Address 3",
  cusCity: "City",
  supCity: "City",
  cusDistrict: "District",
  supDistrict: "District",
  cusCountry: "Country",
  supCountry: "Country",
  cusStateName: "State",
  supStateName: "State",
  cusStateCode: "State code",
  supStateCode: "State code",
  cusPin: "PIN",
  supPincode: "PIN",
  cusTel: "Tel",
  supTel: "Tel",
  cusPhone1: "Phone",
  supPhone: "Phone",
  cusPhone2: "Phone 2",
  cusWhatsappNo: "WhatsApp",
  supWhatsappNo: "WhatsApp",
  cusEmail: "Email",
  supMailId: "Email",
  cusContactPerson: "Contact Person",
  cusAadharNo: "Aadhaar",
  cusGstNo: "GST No",
  supGstNo: "GST No",
  cusPanNo: "PAN",
  supPanNo: "PAN",
  cusEcommerceGstin: "e-Commerce GSTIN",
  cusGstType: "GST Type",
  supGstType: "GST Type",
  cusRegionName: "Regional Name",
  supRegionName: "Regional Name",
  cusRegionAddr1: "Regional Address 1",
  supRegionAddr1: "Regional Address 1",
  cusRegionAddr2: "Regional Address 2",
  supRegionAddr2: "Regional Address 2",
  cusRegionAddr3: "Regional Address 3",
  supRegionAddr3: "Regional Address 3",
  cusRegionCity: "Regional City",
  supRegionCity: "Regional City",
  cusRegionDistrict: "Regional District",
  supRegionDistrict: "Regional District",
  cusRegionStateName: "Regional State",
  supRegionStateName: "Regional State",
  cusRegionCountry: "Regional Country",
  supRegionCountry: "Regional Country",
  cusCompanyId: "Company",
  supCompanyId: "Company",
  cusBranchId: "Branch",
  supBranchId: "Branch",
};

export function partyFieldLabel(key: string): string {
  return PARTY_FIELD_LABELS[key] ?? key;
}

/**
 * The after-save line when the other role's row changed (plan §5: "Saved.
 * Supplier record updated too."), with what changed there. Null when nothing
 * changed on the other side.
 */
export function partySyncMessage(sync: PartySync | null): string | null {
  if (!sync || !sync.otherRoleUpdated || !sync.otherRole) {
    return null;
  }
  const other = sync.otherRole === "SUPPLIER" ? "Supplier" : "Customer";
  const labels: string[] = [];
  for (const field of sync.fields) {
    const label = partyFieldLabel(field);
    // State name and code are one change to a person.
    const shown = label === "State code" ? "State" : label;
    if (!labels.includes(shown)) {
      labels.push(shown);
    }
  }
  return labels.length
    ? `Saved. ${other} record updated too: ${labels.join(", ")}.`
    : `Saved. ${other} record updated too.`;
}
