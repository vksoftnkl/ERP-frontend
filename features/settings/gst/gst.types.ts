/**
 * The `/gst/*` wire shapes (server `src/modules/gst/types/gst-config.types.ts`,
 * notes 79 R1–R9). Secrets never come back: a `has*` flag and `keyVersion`
 * stand in for each one.
 */

type GstAuditStamp = {
  createdOn: string;
  createdBy: string;
  modifiedOn: string | null;
  modifiedBy: string | null;
};

export type GstProviderServicePayload = GstAuditStamp & {
  gpsId: string;
  gpsGpvId: string;
  gpsService: string;
  gpsEnvironment: string;
  gpsBaseUrl: string;
  gpsFallbackUrls: string[];
  gpsAuthScheme: string;
  gpsTokenTtlMinutes: number;
  gpsRefreshMarginMinutes: number;
  gpsPayloadEncryption: string;
  gpsTimeoutMs: number | null;
  gpsMaxRetries: number | null;
  gpsRemarks: string | null;
  gpsIsActive: boolean;
  gpsIsDeleted: boolean;
  endpointCount: number;
};

export type GstProviderAccountPayload = GstAuditStamp & {
  gpaId: string;
  gpaGpvId: string;
  gpvCode: string;
  gpaEnvironment: string;
  gpaService: string | null;
  gpaAccountRef: string | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasApiKey: boolean;
  keyVersion: number;
  gpaValidFrom: string | null;
  gpaValidUpto: string | null;
  gpaCreditBalance: number | null;
  gpaBalanceCheckedOn: string | null;
  gpaLastVerifiedOn: string | null;
  gpaRemarks: string | null;
  gpaIsActive: boolean;
  gpaIsDeleted: boolean;
};

export type GstProviderPayload = GstAuditStamp & {
  gpvId: string;
  gpvCode: string;
  gpvName: string;
  gpvPortalUrl: string | null;
  gpvSupportEmail: string | null;
  gpvSupportPhone: string | null;
  gpvTimeoutMs: number;
  gpvMaxRetries: number;
  gpvRateLimitPerMin: number | null;
  gpvRemarks: string | null;
  gpvIsActive: boolean;
  gpvIsDeleted: boolean;
  services: GstProviderServicePayload[];
  accounts: GstProviderAccountPayload[];
  endpointCount: number;
  errorMapCount: number;
  credentialCount: number;
};

export type GstProviderFieldMapPayload = GstAuditStamp & {
  gfmId: string;
  gfmGpeId: string;
  gfmDirection: string;
  gfmOurField: string;
  gfmTheirPath: string;
  gfmDataType: string;
  gfmTransform: string;
  gfmFormatMask: string | null;
  gfmIsRequired: boolean;
  gfmDefaultValue: string | null;
  gfmTargetColumn: string | null;
  gfmSortOrder: number;
  gfmIsDeleted: boolean;
};

export type GstProviderEndpointPayload = GstAuditStamp & {
  gpeId: string;
  gpeGpsId: string;
  gpvId: string;
  gpsService: string;
  gpsEnvironment: string;
  gpeAction: string;
  gpeHttpMethod: string;
  gpePathTemplate: string;
  gpeQueryTemplate: string | null;
  gpeContentType: string;
  gpeHeaders: Record<string, unknown> | null;
  gpeRequestWrapper: string | null;
  gpeRedactPaths: unknown[] | null;
  gpeResponseRootPath: string | null;
  gpeSuccessPath: string | null;
  gpeSuccessValue: string | null;
  gpeErrorCodePath: string | null;
  gpeErrorMessagePath: string | null;
  gpeTimeoutMs: number | null;
  gpeMaxRetries: number | null;
  gpeIsIdempotent: boolean;
  gpeRemarks: string | null;
  gpeIsActive: boolean;
  gpeIsDeleted: boolean;
  /** On /get (and the save's answer) only. */
  fieldMaps?: GstProviderFieldMapPayload[];
};

export type GstCompanyCredentialPayload = GstAuditStamp & {
  gccId: string;
  gccCompanyId: string;
  compName: string;
  gccBranchId: string | null;
  brName: string | null;
  /** COALESCE(branch GSTIN, company GSTIN): resolved, never stored or sent. */
  gstin: string | null;
  gccGpvId: string;
  gpvCode: string;
  gpvName: string;
  gccService: string | null;
  gccEnvironment: string;
  gccPriority: number;
  isPrimary: boolean;
  gccLoginId: string;
  hasPassword: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasAppKey: boolean;
  keyVersion: number;
  gccPublicKeyRef: string | null;
  gccWhitelistedIps: string[];
  gccValidFrom: string | null;
  gccValidUpto: string | null;
  isExpired: boolean;
  gccPasswordChangedOn: string | null;
  gccLastVerifiedOn: string | null;
  gccLastErrorMessage: string | null;
  gccRemarks: string | null;
  gccIsActive: boolean;
  gccIsDeleted: boolean;
};

/** R8 — a refusal BY the portal is `ok: false`, not an HTTP error. */
export type GstCredentialVerifyResult = {
  ok: boolean;
  message: string;
  errorCode?: string;
  tokenValidUntil?: string;
  creditBalance?: number | null;
};

/** R9 — read from gst_auth_session and the credential; no portal call. */
export type GstCredentialStatus = {
  gccId: string;
  hasLiveToken: boolean;
  tokenExpiresOn: string | null;
  issuedOn: string | null;
  leaseFree: boolean;
  lastVerifiedOn: string | null;
  lastErrorMessage: string | null;
  creditBalance: number | null;
};

/** Grid 128 — GST PROVIDER - SERVICES. */
export type GstServiceGridRow = {
  gps_id: string;
  gps_service: string;
  gps_environment: string;
  gps_base_url: string;
  gps_auth_scheme: string;
  gps_token_ttl_minutes: number | string | null;
  gps_payload_encryption: string;
  endpoint_count: number | string;
  gps_is_active: boolean | string;
};

/** Grid 129 — GST PROVIDER - ENDPOINTS. */
export type GstEndpointGridRow = {
  gpe_id: string;
  gpe_action: string;
  gpe_http_method: string;
  gpe_path_template: string;
  gpe_query_template: string | null;
  gpe_is_idempotent: boolean | string;
  field_map_count: number | string;
  gpe_timeout_ms: number | string | null;
  gpe_is_active: boolean | string;
};

/**
 * Grid 130 — GST PROVIDER - ERROR MAP. Carries only part of the row: severity,
 * extract path, canonical field and retry-after are NOT in it, and there is no
 * /get route — see `ERROR_MAP_FORM` for how an edit keeps them.
 */
export type GstErrorMapGridRow = {
  gem_id: string;
  /** "(all)" for a NULL service. */
  gem_service: string;
  gem_their_code: string;
  gem_our_code: string;
  gem_treat_as: string;
  gem_is_retryable: boolean | string;
  gem_should_reauth: boolean | string;
  gem_recovery_action: string;
  gem_message: string | null;
};

export type GstGridRow = Record<string, unknown>;
