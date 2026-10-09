/**
 * The wire, as the live Swagger states it (2026-09-26).
 *
 *   GET    /user-administration/get?usrId=   → `UserAdminPayload`, menus[] included
 *   POST   /user-administration/create       ← `SaveUserAdministrationDto`
 *   DELETE /user-administration/delete?usrId=
 *   GET    /menu-masters/get?visibleOnly=false → `MenuTreeNodePayload[]`
 *
 * Two things about the save that every module here is built around:
 *
 * - The API runs `forbidNonWhitelisted: true`. A body with any key outside
 *   `SaveUserAdministrationDto` is refused whole, and the GET payload carries
 *   a dozen such keys (`usrIsLocked`, `usrCreatedOn`, …). So a body is built
 *   from the form, never by echoing the payload — see `body.ts`.
 * - `menus` is a FULL REPLACEMENT SET. A menu missing from it is revoked.
 *   Omitting the key leaves the rows alone; sending `[]` revokes every one.
 */

// ── menu tree ──────────────────────────────────────────────────────────────

export type MenuTreeNodePayload = {
  menuId: number;
  menuParentId?: number | null;
  menuName: string;
  menuAlias?: string | null;
  menuVisibility?: boolean;
  menuPosition?: string | null;
  menuSeparator?: boolean;
  menuIsActive?: boolean;
  /** What the screen can DO. Absent on an older row — then the six CRUD verbs. */
  menuVerbs?: readonly string[] | null;
  /** Always null on `/menu-masters/get`; a user's grants come from the user. */
  permissions?: unknown;
  children?: MenuTreeNodePayload[];
};

// ── user ───────────────────────────────────────────────────────────────────

/** The eleven per-menu rights, in column order. */
export const GRANT_FLAG_KEYS = [
  "umCanView",
  "umCanCreate",
  "umCanEdit",
  "umCanDelete",
  "umCanPrint",
  "umCanExport",
  "umCanPost",
  "umCanCancel",
  "umCanAmend",
  "umCanOverride",
  "umCanRetender",
] as const;

export type GrantFlagKey = (typeof GRANT_FLAG_KEYS)[number];

/** One row of `public.user_menus`, as `/user-administration/get` returns it. */
export type UserMenuPayload = {
  umMenuId: number;
  umVisibility?: boolean | null;
  umIsFavourite?: boolean | null;
  umIsPinned?: boolean | null;
  umSortOrder?: number | string | null;
} & Partial<Record<GrantFlagKey, boolean | null>> &
  Record<string, unknown>;

/** `SaveUserMenuDto` — every key it declares, always all of them. */
export type SaveUserMenuDto = Record<GrantFlagKey, boolean> & {
  umMenuId: number;
  umVisibility: boolean;
  umIsFavourite: boolean;
  umIsPinned: boolean;
  umSortOrder: number;
};

export const USER_TYPE_VALUES = [
  "SUPER ADMIN",
  "ADMIN",
  "MANAGER",
  "SUPERVISOR",
  "USER",
  "CASHIER",
  "VIEWER",
  "SYSTEM",
] as const;

/**
 * `UserType` on the wire, shown as "User Role" (notes 96) — a label for who the
 * person is. What they may open is the Permissions tab; what they may approve
 * at a till is Till Approval Setup. The port plan (§10) recorded the DTO as
 * having no enum; the DTO checks this one with `@IsEnum`, so any other value is
 * a 400. SUPERVISOR joined it 2026-10-08.
 */
export type UserType = (typeof USER_TYPE_VALUES)[number];

/** `UserAdminPayloadDto` — what `get` and a successful save answer with. */
export type UserAdminPayload = {
  usrId: string;
  usrCompanyId: string | null;
  usrCompanyName?: string | null;
  usrBranchId: string | null;
  usrBranchName?: string | null;
  usrEmployeeId: string | null;
  usrEmployeeName?: string | null;
  usrLoginName: string;
  usrDisplayName: string;
  usrFullName: string | null;
  usrMobileNo: string | null;
  usrEmail: string | null;
  usrAvatarUrl: string | null;
  usrTimezone: string;
  usrLanguage: string;
  usrMustChangePassword: boolean;
  usrPasswordExpiresOn: string | null;
  usrPasswordChangedOn: string | null;
  /** The till PIN itself never comes back — only whether one is set. */
  usrPinSet?: boolean;
  usrType: UserType | string | null;
  usrEditDate: boolean;
  usrEditEntry: boolean;
  usrEditRate: boolean;
  usrDesktopLogin: boolean;
  usrWebLogin: boolean;
  usrMobileLogin: boolean;
  usrIsActive: boolean;
  usrIsLocked: boolean;
  usrFailedLoginCount: number;
  usrLastFailedLoginOn: string | null;
  usrLockedOn: string | null;
  usrLockedBy: string | null;
  usrLastLoginOn: string | null;
  usrIsDeleted: boolean;
  usrNotes: string | null;
  usrSyncDate: string | null;
  usrCreatedOn: string;
  usrCreatedBy: string | null;
  usrModifiedOn: string | null;
  usrModifiedBy: string | null;
  menus: UserMenuPayload[];
};

/**
 * `SaveUserAdministrationDto`, key for key. `SAVE_USER_KEYS` below is the
 * same list as data, for the test that no body ever carries anything else.
 */
export type SaveUserAdministrationDto = {
  usrId?: string;
  usrCompanyId?: string | null;
  usrBranchId?: string | null;
  usrEmployeeId?: string | null;
  usrLoginName: string;
  usrDisplayName?: string | null;
  usrFullName?: string | null;
  usrMobileNo?: string | null;
  usrEmail?: string | null;
  usrAvatarUrl?: string | null;
  usrTimezone?: string;
  usrLanguage?: string;
  usrPassword?: string;
  /** Absent keeps the stored till PIN, `""` clears it, 4–6 digits replace it. */
  usrPin?: string;
  usrMustChangePassword?: boolean;
  usrType?: UserType | null;
  usrEditDate?: boolean;
  usrEditEntry?: boolean;
  usrEditRate?: boolean;
  usrDesktopLogin?: boolean;
  usrWebLogin?: boolean;
  usrMobileLogin?: boolean;
  usrIsActive?: boolean;
  usrNotes?: string | null;
  menus?: SaveUserMenuDto[];
};

export const SAVE_USER_KEYS: readonly (keyof SaveUserAdministrationDto)[] = [
  "usrId",
  "usrCompanyId",
  "usrBranchId",
  "usrEmployeeId",
  "usrLoginName",
  "usrDisplayName",
  "usrFullName",
  "usrMobileNo",
  "usrEmail",
  "usrAvatarUrl",
  "usrTimezone",
  "usrLanguage",
  "usrPassword",
  "usrPin",
  "usrMustChangePassword",
  "usrType",
  "usrEditDate",
  "usrEditEntry",
  "usrEditRate",
  "usrDesktopLogin",
  "usrWebLogin",
  "usrMobileLogin",
  "usrIsActive",
  "usrNotes",
  "menus",
];

/** `{ field, message }` — one entry of a 400's `errors[]`. */
export type ApiFieldError = { field?: string | null; message?: string | null };
