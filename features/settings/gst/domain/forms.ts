/**
 * Every GST form, as field lists — the Qt `GstParts::serviceForm` …
 * `accountForm`, `GstCredentialEntry::buildConfig` and the provider header.
 *
 * Defaults for a NEW row are the table's own column defaults (POST, severity
 * ERROR, token 360 min, refresh 15 min). The Qt combos started on their first
 * item instead — GET and INFO — which is not what the server would have
 * stored for an omitted field.
 */
import {
  coded,
  GST_ACTIONS,
  GST_AUTH_SCHEMES,
  GST_ENVIRONMENTS,
  GST_FIELD_DATA_TYPES,
  GST_FIELD_DIRECTIONS,
  GST_FIELD_TRANSFORMS,
  GST_HTTP_METHODS,
  GST_OUR_ERROR_CODES,
  GST_PAYLOAD_ENCRYPTIONS,
  GST_RECOVERY_ACTIONS,
  GST_SERVICES,
  GST_SEVERITIES,
  GST_TREAT_AS,
} from "../gst.constants";
import type { PartField } from "./part-form";

export type PartFormSpec = {
  title: string;
  subtitle: string;
  idKey: string;
  parentKey: string;
  createUrl: string;
  deleteUrl: string;
  /** Rows with a /get are re-read on open; the rest are filled from the row in hand. */
  getUrl?: string;
  fields: readonly PartField[];
  /** Panel width, in the dialog's own units. */
  width: number;
};

// ── the provider header (/gst/providers/create) ─────────────────────────────

export const PROVIDER_FIELDS: readonly PartField[] = [
  {
    kind: "text",
    key: "gpvCode",
    label: "Code",
    required: "Enter the provider's code.",
    upper: true,
    maxLength: 20,
    placeholder: "CHARTERED",
  },
  { kind: "text", key: "gpvName", label: "Name", required: "Enter the provider's name.", maxLength: 150 },
  { kind: "text", key: "gpvPortalUrl", label: "Portal URL", nullable: true, maxLength: 500, placeholder: "https://" },
  // A new provider starts switched OFF (Qt): no GST call goes out through a
  // provider until someone turns it on (notes 88).
  { kind: "check", key: "gpvIsActive", label: "Active", defaultValue: false },
  { kind: "int", key: "gpvTimeoutMs", label: "Timeout (ms)", min: 1000, max: 600000, blank: "omit", defaultValue: "45000" },
  { kind: "int", key: "gpvMaxRetries", label: "Max retries", min: 0, max: 10, blank: "omit", defaultValue: "2" },
  {
    kind: "int",
    key: "gpvRateLimitPerMin",
    label: "Rate limit / min",
    min: 1,
    max: 32767,
    blank: "null",
    placeholder: "(none)",
  },
  { kind: "text", key: "gpvSupportEmail", label: "Support e-mail", nullable: true, maxLength: 120 },
  { kind: "text", key: "gpvSupportPhone", label: "Support phone", nullable: true, maxLength: 20 },
  { kind: "text", key: "gpvRemarks", label: "Remarks", nullable: true, maxLength: 500 },
];

// ── the five child rows ─────────────────────────────────────────────────────

export const SERVICE_FORM: PartFormSpec = {
  title: "Provider Service",
  subtitle: "One service × environment: where it lives and how it signs in.",
  idKey: "gpsId",
  parentKey: "gpsGpvId",
  createUrl: "/gst/provider-services/create",
  deleteUrl: "/gst/provider-services/delete",
  width: 46,
  fields: [
    { kind: "select", key: "gpsService", label: "Service", options: coded(GST_SERVICES), required: "Choose the service." },
    {
      kind: "select",
      key: "gpsEnvironment",
      label: "Environment",
      options: coded(GST_ENVIRONMENTS),
      required: "Choose the environment.",
    },
    {
      kind: "text",
      key: "gpsBaseUrl",
      label: "Base URL",
      required: "Enter the base URL.",
      placeholder: "https://einvapi.example.com",
      full: true,
    },
    {
      kind: "lines",
      key: "gpsFallbackUrls",
      label: "Fallback URLs (one per line)",
      shape: "array",
      full: true,
    },
    {
      kind: "select",
      key: "gpsAuthScheme",
      label: "Auth scheme",
      options: coded(GST_AUTH_SCHEMES),
      required: "Choose how this service signs in.",
    },
    {
      kind: "select",
      key: "gpsPayloadEncryption",
      label: "Payload encryption",
      options: coded(GST_PAYLOAD_ENCRYPTIONS),
      defaultValue: "NONE",
    },
    { kind: "int", key: "gpsTokenTtlMinutes", label: "Token life (min)", min: 1, max: 1440, blank: "omit", defaultValue: "360" },
    {
      kind: "int",
      key: "gpsRefreshMarginMinutes",
      label: "Refresh before expiry (min)",
      min: 0,
      max: 1440,
      blank: "omit",
      defaultValue: "15",
    },
    {
      kind: "int",
      key: "gpsTimeoutMs",
      label: "Timeout (ms)",
      min: 1000,
      max: 600000,
      blank: "null",
      placeholder: "blank = provider's",
    },
    { kind: "int", key: "gpsMaxRetries", label: "Max retries", min: 0, max: 10, blank: "null", placeholder: "blank = provider's" },
    { kind: "text", key: "gpsRemarks", label: "Remarks", nullable: true, maxLength: 500, full: true },
    { kind: "check", key: "gpsIsActive", label: "Active", defaultValue: true },
  ],
};

export const ENDPOINT_FORM: PartFormSpec = {
  title: "Service Endpoint",
  subtitle: "One action: the route, its headers, and how its reply is read.",
  idKey: "gpeId",
  parentKey: "gpeGpsId",
  createUrl: "/gst/provider-endpoints/create",
  deleteUrl: "/gst/provider-endpoints/delete",
  getUrl: "/gst/provider-endpoints/get",
  width: 54,
  fields: [
    { kind: "heading", key: "route", label: "Route" },
    { kind: "select", key: "gpeAction", label: "Action", options: coded(GST_ACTIONS), required: "Choose the action." },
    { kind: "select", key: "gpeHttpMethod", label: "Method", options: coded(GST_HTTP_METHODS), defaultValue: "POST" },
    {
      kind: "text",
      key: "gpePathTemplate",
      label: "Path",
      required: "Enter the path; it starts with /.",
      placeholder: "/eicore/v1.03/Invoice",
    },
    { kind: "text", key: "gpeQueryTemplate", label: "Query", nullable: true, placeholder: "?action=GENEWAYBILL" },
    { kind: "text", key: "gpeContentType", label: "Content type", maxLength: 60, defaultValue: "application/json" },
    { kind: "text", key: "gpeRequestWrapper", label: "Request wrapper", nullable: true, maxLength: 30 },
    {
      kind: "lines",
      key: "gpeHeaders",
      label: "Headers (Name: value, one per line)",
      shape: "object",
      placeholder: "Gstin: {gstin}",
      full: true,
    },
    { kind: "heading", key: "reply", label: "Reading the reply", note: "JSON paths start with $" },
    { kind: "text", key: "gpeResponseRootPath", label: "Root path", nullable: true },
    { kind: "text", key: "gpeSuccessPath", label: "Success path", nullable: true, placeholder: "$.Status" },
    { kind: "text", key: "gpeSuccessValue", label: "Success value", nullable: true, maxLength: 20 },
    { kind: "text", key: "gpeErrorCodePath", label: "Error code path", nullable: true },
    { kind: "text", key: "gpeErrorMessagePath", label: "Error message path", nullable: true },
    {
      kind: "lines",
      key: "gpeRedactPaths",
      label: "Redact in the log (one path per line)",
      shape: "array",
      placeholder: "$.Password",
    },
    { kind: "heading", key: "limits", label: "Limits" },
    {
      kind: "int",
      key: "gpeTimeoutMs",
      label: "Timeout (ms)",
      min: 1000,
      max: 600000,
      blank: "null",
      placeholder: "blank = service's",
    },
    { kind: "int", key: "gpeMaxRetries", label: "Max retries", min: 0, max: 10, blank: "null", placeholder: "blank = service's" },
    { kind: "check", key: "gpeIsIdempotent", label: "Safe to retry (idempotent)", defaultValue: false },
    { kind: "check", key: "gpeIsActive", label: "Active", defaultValue: true },
    { kind: "text", key: "gpeRemarks", label: "Remarks", nullable: true, maxLength: 500, full: true },
    { kind: "heading", key: "maps", label: "Field map" },
    { kind: "custom", key: "fieldMaps", label: "", full: true },
  ],
};

export const FIELD_MAP_FORM: PartFormSpec = {
  title: "Field Map",
  subtitle: "One field: where it sits in their JSON and where it lands in ours.",
  idKey: "gfmId",
  parentKey: "gfmGpeId",
  createUrl: "/gst/provider-field-maps/create",
  deleteUrl: "/gst/provider-field-maps/delete",
  width: 44,
  fields: [
    {
      kind: "select",
      key: "gfmDirection",
      label: "Direction",
      options: coded(GST_FIELD_DIRECTIONS),
      required: "Choose the direction.",
    },
    { kind: "text", key: "gfmOurField", label: "Our field", required: "Enter our field name.", maxLength: 60 },
    {
      kind: "text",
      key: "gfmTheirPath",
      label: "Their path",
      required: "Enter the JSON path; it starts with $.",
      placeholder: "$.ewayBillNo",
    },
    { kind: "text", key: "gfmTargetColumn", label: "Target column", nullable: true, maxLength: 64, placeholder: "gdw_no" },
    { kind: "select", key: "gfmDataType", label: "Data type", options: coded(GST_FIELD_DATA_TYPES), defaultValue: "TEXT" },
    { kind: "select", key: "gfmTransform", label: "Transform", options: coded(GST_FIELD_TRANSFORMS), defaultValue: "NONE" },
    { kind: "text", key: "gfmFormatMask", label: "Format mask", nullable: true, maxLength: 40 },
    { kind: "text", key: "gfmDefaultValue", label: "Default value", nullable: true },
    { kind: "int", key: "gfmSortOrder", label: "Order", min: -32768, max: 32767, blank: 0, defaultValue: "0" },
    { kind: "check", key: "gfmIsRequired", label: "Required", defaultValue: false },
  ],
};

export const ERROR_MAP_FORM: PartFormSpec = {
  title: "Error Map",
  subtitle: "Their error code, our meaning, and what to do about it.",
  idKey: "gemId",
  parentKey: "gemGpvId",
  createUrl: "/gst/provider-error-maps/create",
  deleteUrl: "/gst/provider-error-maps/delete",
  width: 46,
  fields: [
    {
      kind: "select",
      key: "gemService",
      label: "Service",
      options: coded(GST_SERVICES, "(all services)"),
      allIsNull: true,
    },
    { kind: "text", key: "gemTheirCode", label: "Their code", required: "Enter the provider's error code.", maxLength: 50 },
    {
      kind: "select",
      key: "gemOurCode",
      label: "Our code",
      options: coded(GST_OUR_ERROR_CODES),
      required: "Choose what it means to us.",
    },
    { kind: "select", key: "gemTreatAs", label: "Treat as", options: coded(GST_TREAT_AS), defaultValue: "ERROR" },
    { kind: "text", key: "gemMessage", label: "Message shown to the operator", nullable: true, maxLength: 500, full: true },
    {
      kind: "select",
      key: "gemRecoveryAction",
      label: "Recovery",
      options: coded(GST_RECOVERY_ACTIONS),
      defaultValue: "NONE",
    },
    { kind: "select", key: "gemSeverity", label: "Severity", options: coded(GST_SEVERITIES), defaultValue: "ERROR" },
    { kind: "text", key: "gemExtractPath", label: "Extract path (for treat-as SUCCESS)", nullable: true },
    { kind: "text", key: "gemCanonicalField", label: "Canonical field", nullable: true, maxLength: 60 },
    { kind: "check", key: "gemIsRetryable", label: "Retry", defaultValue: false },
    { kind: "int", key: "gemRetryAfterSeconds", label: "Retry after (s)", min: 0, max: 86400, blank: "null" },
    { kind: "check", key: "gemShouldReauth", label: "Sign in again first", defaultValue: false },
  ],
};

export const ACCOUNT_FORM: PartFormSpec = {
  title: "Provider Account",
  subtitle: "The GSP's own login for this installation. Secrets are write-only.",
  idKey: "gpaId",
  parentKey: "gpaGpvId",
  createUrl: "/gst/provider-accounts/create",
  deleteUrl: "/gst/provider-accounts/delete",
  getUrl: "/gst/provider-accounts/get",
  width: 44,
  fields: [
    {
      kind: "select",
      key: "gpaEnvironment",
      label: "Environment",
      options: coded(GST_ENVIRONMENTS),
      required: "Choose the environment.",
    },
    {
      kind: "select",
      key: "gpaService",
      label: "Service",
      options: coded(GST_SERVICES, "(every service)"),
      allIsNull: true,
    },
    {
      kind: "text",
      key: "gpaAccountRef",
      label: "Account ref (aspid)",
      required: "Enter the account reference.",
      maxLength: 100,
      full: true,
    },
    { kind: "heading", key: "secrets", label: "Secrets", note: "an empty box keeps what is stored" },
    { kind: "secret", key: "clientId", label: "Client ID", hasFlag: "hasClientId", clearable: true },
    {
      kind: "secret",
      key: "clientSecret",
      label: "Client secret / password",
      hasFlag: "hasClientSecret",
      clearable: true,
    },
    { kind: "secret", key: "apiKey", label: "API key", hasFlag: "hasApiKey", clearable: true },
    { kind: "heading", key: "validity", label: "Validity" },
    { kind: "date", key: "gpaValidFrom", label: "Valid from", nullable: true },
    { kind: "date", key: "gpaValidUpto", label: "Valid upto", nullable: true },
    { kind: "text", key: "gpaRemarks", label: "Remarks", nullable: true, maxLength: 500, full: true },
    { kind: "check", key: "gpaIsActive", label: "Active", defaultValue: true },
  ],
};

// ── the company credential (/gst/company-credentials/create) ────────────────

export const CREDENTIAL_FIELDS: readonly PartField[] = [
  { kind: "lookup", key: "gccCompanyId", label: "Company", textKey: "compName", required: "Choose the company." },
  { kind: "lookup", key: "gccBranchId", label: "Branch", textKey: "brName", nullable: true },
  { kind: "lookup", key: "gccGpvId", label: "Provider", textKey: "gpvName", required: "Choose the provider." },
  {
    kind: "select",
    key: "gccService",
    label: "Service",
    options: coded(GST_SERVICES, "(all services)"),
    allIsNull: true,
  },
  {
    kind: "select",
    key: "gccEnvironment",
    label: "Environment",
    options: coded(GST_ENVIRONMENTS),
    required: "Choose the environment.",
    defaultValue: "SANDBOX",
  },
  { kind: "int", key: "gccPriority", label: "Priority", min: 1, max: 9, blank: 1, defaultValue: "1" },
  { kind: "check", key: "gccIsActive", label: "Active", defaultValue: true },
  { kind: "text", key: "gccLoginId", label: "User name", required: "Enter the portal user name.", maxLength: 200 },
  {
    kind: "secret",
    key: "password",
    label: "Password",
    hasFlag: "hasPassword",
    clearable: false,
    requiredWhenUnset: "Enter the portal password.",
  },
  { kind: "secret", key: "clientId", label: "Client ID", hasFlag: "hasClientId", clearable: true },
  { kind: "secret", key: "clientSecret", label: "Secret", hasFlag: "hasClientSecret", clearable: true },
  { kind: "secret", key: "appKey", label: "App key", hasFlag: "hasAppKey", clearable: true },
  { kind: "text", key: "gccPublicKeyRef", label: "Public key ref", nullable: true, maxLength: 100 },
  { kind: "date", key: "gccValidFrom", label: "Valid from", required: "Enter the date the login is valid from." },
  { kind: "date", key: "gccValidUpto", label: "Valid upto", nullable: true },
  { kind: "lines", key: "gccWhitelistedIps", label: "Whitelisted IPs", shape: "array" },
  { kind: "text", key: "gccRemarks", label: "Remarks", nullable: true, maxLength: 500 },
];
