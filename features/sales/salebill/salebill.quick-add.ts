/**
 * Quick-add Customer (§7.7) — the rules behind the "+" on the quick strip.
 *
 * The counter meets a new customer mid-bill and must not leave the bill to open
 * the customer master. Only what a bill needs — name, phone, GSTIN, area, group,
 * state — goes to `POST /customers/create`, which writes the ledger row in the
 * same call. Everything else stays at the master's defaults.
 *
 * Mirrors the Qt `CustomerQuickAddDialog` (sales/common): the same fields in
 * the same order, the same validation order and words, and the same GSTIN
 * autofill. On top of it, the Customer Template fills the dialog and the rest
 * of the new record the way it fills the customer master's create form (see
 * `quickAddTemplateFrom`). Pure: no React, no network —
 * `salebill.quick-add.test.ts` pins it.
 */
import { applyFormDefaults, EMPTY_FORM_DEFAULTS } from "@/features/masters/shared/apply-form-defaults";
import { CUSTOMER_TEMPLATE_FIELD_SPECS } from "@/features/masters/sales/customer/template/field-specs";
import {
  GSTIN_INVALID_MESSAGE,
  isValidGstin,
  normalizeGstin,
  stateCodeOfGstin,
} from "@/features/masters/shared/gst-registration";

/**
 * The values the customer master's own select stores (it upper-cases what it
 * loads), so a customer made here reopens there on the right option. SEZ /
 * Overseas are deliberately absent: the ledger's registration type refuses
 * them, so offering them would 400 the create.
 */
export const QUICK_ADD_GST_TYPES = [
  { value: "UNREGISTERED", label: "Unregistered" },
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
] as const;
export type QuickAddGstType = (typeof QUICK_ADD_GST_TYPES)[number]["value"];

/**
 * `cusPriceLevelId` is required by the DTO. The Qt dialog sends the session's
 * sales default (`AppSession::salesDefaultPriceLevel`, 1) — not whatever level
 * the operator has this bill on. A Customer Template that names a level wins.
 */
export const QUICK_ADD_PRICE_LEVEL = 1;

function isQuickAddGstType(value: string): value is QuickAddGstType {
  return QUICK_ADD_GST_TYPES.some((row) => row.value === value);
}

export type QuickAddForm = {
  name: string;
  phone: string;
  gstin: string;
  gstType: QuickAddGstType;
  areaId: string;
  areaName: string;
  groupId: string;
  groupName: string;
  stateCode: string;
  stateName: string;
};

export function emptyQuickAddForm(defaultState: { code: string; name: string }): QuickAddForm {
  return {
    name: "",
    phone: "",
    gstin: "",
    gstType: "UNREGISTERED",
    areaId: "",
    areaName: "",
    groupId: "",
    groupName: "",
    stateCode: defaultState.code,
    stateName: defaultState.name,
  };
}

// ---------------------------------------------------------------------------
// Customer Template (`masters.customer_form_defaults`)

/** A value the create DTO takes, as the customer master's save types it. */
export type QuickAddTemplateValue = string | number | boolean | number[];

/**
 * What the Customer Template says about a quick-added customer.
 *
 * The customer master opens its create form on the template, so a customer made
 * there carries the template's price level, credit terms, charges and flags.
 * One made here must come out the same, or the counter's walk-ins are the only
 * customers the template never reached.
 */
export type QuickAddTemplate = {
  /** The dialog's own fields the template fills — only those it names. */
  seeds: Partial<
    Pick<QuickAddForm, "gstType" | "areaId" | "areaName" | "groupId" | "groupName" | "stateCode" | "stateName">
  >;
  /** `cusPriceLevelId`, when the template names one. */
  priceLevelId: number | null;
  /** Every other field it sets, typed for the create DTO. */
  extras: Record<string, QuickAddTemplateValue>;
  /** Whether there is a template at all. */
  present: boolean;
};

export const NO_QUICK_ADD_TEMPLATE: QuickAddTemplate = {
  seeds: {},
  priceLevelId: null,
  extras: {},
  present: false,
};

/*
 * The template fields carried onto the new customer: the customer master's save
 * payload, minus what the dialog asks for itself (name, phone, GSTIN, GST type,
 * area, group, state), what identifies one customer (the template's own
 * exclusion list: codes, PAN, contacts, notes, dates…), the scope (the bill's
 * company and branch win, as in Qt) and `cusIsActive` (a customer being billed
 * is active). A fixed list, not "whatever the document holds": the create runs
 * under `forbidNonWhitelisted`, so one stray key from another client would 400
 * the whole save.
 */
const TEMPLATE_TEXT_FIELDS = [
  "cusTitle",
  "cusAddr1",
  "cusAddr2",
  "cusAddr3",
  "cusCity",
  "cusDistrict",
  "cusCountry",
  "cusLandmark",
  "cusPin",
  "cusRegionName",
  "cusRegionAddr1",
  "cusRegionAddr2",
  "cusRegionAddr3",
  "cusRegionCity",
  "cusRegionDistrict",
  "cusRegionStateName",
  "cusRegionCountry",
  "cusTransportName",
  "cusItcollType",
  "cusDefaultSalesman",
] as const;
const TEMPLATE_INTEGER_FIELDS = [
  "cusCreditBillLimit",
  "cusCreditDays",
  "cusDebitGraceDays",
  "cusSortOrder",
  "cusDistanceKm",
] as const;
const TEMPLATE_NUMBER_FIELDS = ["cusCreditAmtLimit", "cusDebitBalance", "cusDiscPerc"] as const;
const TEMPLATE_BOOLEAN_FIELDS = [
  "cusEnableSms",
  "cusOverdueSms",
  "cusOverdueBilling",
  "cusAllowPromotion",
  "cusAllowLoyalty",
  "cusAllowDiscount",
  "cusFreightCharge",
  "cusLoadingCharge",
  "cusUnloadingCharge",
  "cusTcsApplicable",
  "cusItcollExempted",
] as const;
/** The master derives credit from the limits too (see its save). */
const CREDIT_FIELDS = ["cusCreditAllowed", "cusCreditBillLimit", "cusCreditAmtLimit", "cusCreditDays"] as const;

function nonNegative(text: string | undefined, integer: boolean): number | null {
  if (text === undefined || !text.trim()) {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return integer ? Math.trunc(value) : value;
}

/**
 * Read the template's raw TEXT (`/effective` for this session — the same value
 * the customer master opens on) into the quick add's seeds and extras.
 *
 * A partial template is a partial apply: only the keys it carries come back,
 * and an unreadable one is no template at all. Unlike the master's parser it
 * adds no Tamil Nadu fallback — a template without a state leaves the dialog on
 * the company's own, which is what the Qt quick add starts on.
 */
export function quickAddTemplateFrom(value: string | null | undefined): QuickAddTemplate {
  const applied = applyFormDefaults(value, CUSTOMER_TEMPLATE_FIELD_SPECS);
  if (applied === EMPTY_FORM_DEFAULTS) {
    return NO_QUICK_ADD_TEMPLATE;
  }
  const { values, seeds: picked } = applied;
  const seeds: QuickAddTemplate["seeds"] = {};
  // The POS stores the LABEL ("Unregistered"); the select holds the enum.
  const gstType = (values.cusGstType ?? "").trim().toUpperCase();
  if (isQuickAddGstType(gstType)) {
    seeds.gstType = gstType;
  }
  // A seed whose name is missing falls back to its id; a uuid in the box is
  // worse than an empty one the operator picks, so such a seed is dropped.
  const area = picked.cusAreaId;
  if (area && area.label !== area.id) {
    seeds.areaId = area.id;
    seeds.areaName = area.label;
  }
  const group = picked.cusGroupId;
  if (group && group.label !== group.id) {
    seeds.groupId = group.id;
    seeds.groupName = group.label;
  }
  const state = picked.cusStateCode;
  if (state) {
    // The state's name the dialog can look up from its code.
    seeds.stateCode = state.id.toUpperCase();
    seeds.stateName = state.label === state.id ? "" : state.label;
  }

  const extras: Record<string, QuickAddTemplateValue> = {};
  for (const field of TEMPLATE_TEXT_FIELDS) {
    const text = (values[field] ?? "").trim();
    if (text) {
      extras[field] = text;
    }
  }
  for (const field of TEMPLATE_INTEGER_FIELDS) {
    const number = nonNegative(values[field], true);
    if (number !== null) {
      extras[field] = number;
    }
  }
  for (const field of TEMPLATE_NUMBER_FIELDS) {
    const number = nonNegative(values[field], false);
    if (number !== null) {
      extras[field] = number;
    }
  }
  for (const field of TEMPLATE_BOOLEAN_FIELDS) {
    if (values[field] !== undefined) {
      extras[field] = values[field] === "true";
    }
  }
  if (CREDIT_FIELDS.some((field) => values[field] !== undefined)) {
    extras.cusCreditAllowed =
      values.cusCreditAllowed === "true" ||
      (nonNegative(values.cusCreditBillLimit, true) ?? 0) > 0 ||
      (nonNegative(values.cusCreditAmtLimit, false) ?? 0) > 0 ||
      (nonNegative(values.cusCreditDays, true) ?? 0) > 0;
  }
  if (values.cusCollectionDays !== undefined) {
    // Weekdays 1-7, as the master keeps them.
    const days = values.cusCollectionDays
      .split(",")
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
    extras.cusCollectionDays = Array.from(new Set(days));
  }
  return {
    seeds,
    priceLevelId: nonNegative(values.cusPriceLevelId, true),
    extras,
    present: true,
  };
}

/** The dialog as it opens: blank, on the template's picks, else the company's state. */
export function openingQuickAddForm(
  template: QuickAddTemplate,
  companyState: { code: string; name: string },
): QuickAddForm {
  const form = emptyQuickAddForm(companyState);
  return { ...form, ...template.seeds };
}

/** The field a refusal sends the caret back to. */
export type QuickAddField = "name" | "gstin" | "area" | "group" | "state";

export type QuickAddViolation = {
  field: QuickAddField;
  message: string;
};

/**
 * The first thing the save refuses, or `null`. The GSTIN rule is the customer
 * master's, so a customer made here is one the master would have accepted.
 */
export function quickAddViolation(form: QuickAddForm): QuickAddViolation | null {
  if (!form.name.trim()) {
    return { field: "name", message: "A name is required." };
  }
  if (!form.areaId) {
    return { field: "area", message: "Pick the customer's area — it is also their ledger group." };
  }
  if (!form.groupId) {
    return { field: "group", message: "Pick the customer group." };
  }
  // The name too: `cusStateName` is required, and a code typed in through a
  // GSTIN whose name never resolved would otherwise 400 the create.
  if (!form.stateCode || !form.stateName.trim()) {
    return { field: "state", message: "Pick the customer's state." };
  }
  const gstin = normalizeGstin(form.gstin);
  if (form.gstType === "UNREGISTERED") {
    return gstin
      ? { field: "gstin", message: "An unregistered customer has no GSTIN — clear it, or choose Regular." }
      : null;
  }
  const typeLabel = QUICK_ADD_GST_TYPES.find((row) => row.value === form.gstType)?.label ?? form.gstType;
  if (!gstin) {
    return {
      field: "gstin",
      message: `A GSTIN is mandatory for a ${typeLabel} customer. Choose Unregistered to save without one.`,
    };
  }
  if (!isValidGstin(gstin)) {
    return { field: "gstin", message: GSTIN_INVALID_MESSAGE };
  }
  if (!gstin.startsWith(form.stateCode)) {
    return {
      field: "gstin",
      message: `GSTIN starts with '${stateCodeOfGstin(gstin)}' but the state picked is '${form.stateCode}'.`,
    };
  }
  return null;
}

/**
 * What leaving the GSTIN box writes back (Qt's `onGstinEdited`): the GSTIN
 * upper-cased; none makes the customer Unregistered, one makes an Unregistered
 * customer Regular; and the state moves to the one the GSTIN was issued in,
 * which saves the operator two picks.
 *
 * Only the CODE is known from a GSTIN — the returned `stateName` is blank and
 * the caller resolves it off the state list. Leading characters that are not a
 * state code leave the state alone; the save then refuses the GSTIN itself.
 */
export function gstinLeftPatch(form: QuickAddForm): Partial<QuickAddForm> {
  const gstin = normalizeGstin(form.gstin);
  const patch: Partial<QuickAddForm> = {};
  if (gstin !== form.gstin) {
    patch.gstin = gstin;
  }
  if (!gstin) {
    if (form.gstType !== "UNREGISTERED") {
      patch.gstType = "UNREGISTERED";
    }
    return patch;
  }
  if (form.gstType === "UNREGISTERED") {
    patch.gstType = "REGULAR";
  }
  const stateCode = stateCodeOfGstin(gstin);
  if (/^\d{2}$/.test(stateCode) && stateCode !== form.stateCode) {
    patch.stateCode = stateCode;
    patch.stateName = "";
  }
  return patch;
}

/**
 * `POST /customers/create` — the keys the dialog asks for, over whatever the
 * Customer Template sets; the DTO's other columns default server-side.
 * `cusAreaId`, `cusGroupId`, `cusStateCode` / `cusStateName` and
 * `cusPriceLevelId` are the required ones.
 */
export type QuickAddCustomerDto = Record<string, QuickAddTemplateValue | null> & {
  cusName: string;
  cusPhone1: string | null;
  cusGstNo: string | null;
  cusGstType: QuickAddGstType;
  cusAreaId: string;
  cusGroupId: string;
  cusStateCode: string;
  cusStateName: string;
  cusPriceLevelId: number;
  cusCompanyId: string;
  cusBranchId: string;
  cusIsActive: true;
};

/** The slice of the saved customer the bill needs back. */
export type QuickAddCustomerResult = { cusId?: string | null; cusName?: string | null };

export function buildQuickAddCustomerDto(
  form: QuickAddForm,
  scope: { companyId: string; branchId: string },
  template: QuickAddTemplate = NO_QUICK_ADD_TEMPLATE,
): QuickAddCustomerDto {
  const gstin = normalizeGstin(form.gstin);
  const phone = form.phone.trim();
  return {
    // Under the dialog's own keys, so what the operator typed always wins.
    ...template.extras,
    cusName: form.name.trim(),
    cusPhone1: phone || null,
    cusGstNo: gstin || null,
    cusGstType: form.gstType,
    cusAreaId: form.areaId,
    cusGroupId: form.groupId,
    cusStateCode: form.stateCode,
    cusStateName: form.stateName.trim(),
    cusPriceLevelId: template.priceLevelId ?? QUICK_ADD_PRICE_LEVEL,
    cusCompanyId: scope.companyId,
    cusBranchId: scope.branchId,
    cusIsActive: true,
  };
}
