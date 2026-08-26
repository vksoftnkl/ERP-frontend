/**
 * The `/app-setting-values/*` contract, mirrored from the server module
 * (`src/modules/settings/appSettings/types/app-settings-api.types.ts`).
 *
 * Two things about it are easy to assume wrong, and both were verified against
 * the running server rather than read off the DTOs:
 *
 *  - **`value` comes back as RAW TEXT**, whatever `asdDataType` says — the
 *    column is `text` and the resolver hands it over unchanged. The client
 *    casts to draw a control, and casts back to write (`lib/value-text.ts`).
 *  - **`source` is OVERRIDE | DEFAULT**, not the layer. Which layer a value was
 *    set at lives in `override.asvScope`, and the two answer different
 *    questions: `source` says whether anybody has set it, `override.asvScope`
 *    says where — and only the second one decides whether this screen may edit
 *    or reset it.
 */

export type AppSettingScope = "GLOBAL" | "COMPANY" | "BRANCH" | "DEVICE" | "USER";

/** The layers this screen edits. USER is a profile concern; GLOBAL is schema-managed. */
export type EditableScope = Extract<AppSettingScope, "COMPANY" | "BRANCH" | "DEVICE">;

export type AppSettingDataType =
  | "BOOL"
  | "INT"
  | "DECIMAL"
  | "TEXT"
  | "UUID"
  | "DATE"
  | "JSON";

export type AppSettingSource = "OVERRIDE" | "DEFAULT";

/** The override row that won, as `/effective` returns it beside each setting. */
export type AppSettingOverride = {
  asvId: string;
  asvScope: AppSettingScope;
  asvCompanyId: string | null;
  asvBranchId: string | null;
  asvDeviceId: string | null;
  asvUserId: string | null;
  asvValue: string | null;
  asvRemarks: string | null;
  asvSyncDate: string | null;
  asvCreatedOn: string;
  asvCreatedBy: string;
  asvModifiedOn: string | null;
  asvModifiedBy: string | null;
};

/** One catalog row as it stands for one caller: the definition, the winning override, the value. */
export type EffectiveSetting = {
  asdId: string;
  asdKey: string;
  asdModule: string;
  asdGroup: string;
  asdLabel: string;
  asdDescription: string | null;
  asdDataType: AppSettingDataType;
  asdDefaultValue: string | null;
  asdAllowedValues: string[] | null;
  asdMinValue: number | null;
  asdMaxValue: number | null;
  asdMaxScope: AppSettingScope;
  asdSortOrder: number;
  asdNeedsRelogin: boolean;
  source: AppSettingSource;
  value: string | null;
  override: AppSettingOverride | null;
};

/** Who is asking. Every id is optional and additive — a layer with no id never matches. */
export type ResolveScopeQuery = {
  companyId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  userId?: string | null;
};

/**
 * One entry of the `{ data: [...] }` write payload.
 *
 * `asvId` is OPTIONAL and its absence is meaningful: without it the server
 * upserts on the scope target, which is what creating an override at a layer
 * that has none means. See `lib/build-override.ts`.
 */
export type SaveAppSettingValueDto = {
  asvId?: string;
  asvSettingKey: string;
  asvScope: AppSettingScope;
  asvCompanyId: string | null;
  asvBranchId: string | null;
  asvDeviceId: string | null;
  asvUserId: string | null;
  asvValue: string | null;
};

export type AppSettingValuePayload = SaveAppSettingValueDto & {
  asvId: string;
  asvRemarks: string | null;
  asvIsDeleted: boolean;
  asvCreatedOn: string;
  asvCreatedBy: string;
  asvModifiedOn: string | null;
  asvModifiedBy: string | null;
};

export type AppSettingResetResult = {
  asvId: string;
  asvSettingKey: string;
  deleted: true;
};

/** The three ids the scope bar is pointed at. Only the one the scope names is written. */
export type ScopeTarget = {
  companyId: string | null;
  branchId: string | null;
  deviceId: string | null;
};
