/**
 * The Identity tab's state (§4): the form, its defaults, what the payload
 * fills it with, and the rules checked before a round trip.
 *
 * Fields the DTO has and this screen leaves unsent (the port plan's Q1):
 * `usrTimezone`, `usrLanguage`, `usrAvatarUrl`. Unsent means untouched — the
 * server writes only the keys it receives, and the table defaults `UTC` / `en`
 * on create. `usrEmployeeId` and the till PIN joined the form 2026-10-08 (Qt).
 */
import type { UserAdminPayload, UserType } from "./wire";

export type IdentityForm = {
  loginName: string;
  /** Blank on edit means "keep" — the key is then omitted from the body. */
  password: string;
  fullName: string;
  mobileNo: string;
  email: string;
  /**
   * A `UserType`, or "" before one is chosen. Typed wider on purpose: a role
   * stored before the list changed (VIEWER, SYSTEM, or MANAGER from a server not
   * yet migrated) is kept as it came, so the form shows it and a save that never
   * touched it sends it back rather than blanking it.
   */
  userType: UserType | string;
  companyId: string;
  /** The label beside the id, for a picker that shows the saved name before it loads. */
  companyName: string;
  branchId: string;
  branchName: string;
  /**
   * The person behind the login. The till recovers a cash shortage from this
   * employee's staff advance ledger, so a cashier needs one.
   */
  employeeId: string;
  employeeName: string;
  /**
   * What an approver types at a counter. The server keeps only a hash and the
   * GET answers `usrPinSet`, so the box starts empty: blank = keep the stored
   * PIN, digits = replace it, `clearPin` = remove it.
   */
  pin: string;
  clearPin: boolean;
  mustChangePassword: boolean;
  desktopLogin: boolean;
  webLogin: boolean;
  mobileLogin: boolean;
  editDate: boolean;
  editEntry: boolean;
  editRate: boolean;
  isActive: boolean;
  notes: string;
};

export const EMPTY_IDENTITY: IdentityForm = {
  loginName: "",
  password: "",
  fullName: "",
  mobileNo: "",
  email: "",
  userType: "USER",
  companyId: "",
  companyName: "",
  branchId: "",
  branchName: "",
  employeeId: "",
  employeeName: "",
  pin: "",
  clearPin: false,
  mustChangePassword: false,
  desktopLogin: true,
  webLogin: true,
  mobileLogin: false,
  editDate: false,
  editEntry: false,
  editRate: false,
  isActive: true,
  notes: "",
};

const USER_TYPE_LABELS: Record<UserType, string> = {
  "SUPER ADMIN": "Super Admin",
  ADMIN: "Admin",
  "HO FINANCE": "HO Finance",
  "AREA MANAGER": "Area Manager",
  "STORE MANAGER": "Store Manager",
  "CASH OFFICE": "Cash Office",
  SUPERVISOR: "Supervisor",
  USER: "User",
  CASHIER: "Cashier",
  VIEWER: "Viewer",
  SYSTEM: "System",
};

export const SUPER_ADMIN: UserType = "SUPER ADMIN";

/**
 * The roles the combo offers (Qt 425fa80, notes 125): the till approval
 * levels' names, lowest first, then ADMIN. VIEWER and SYSTEM are still in the
 * enum but no longer offered.
 */
const OFFERED_USER_TYPES: readonly UserType[] = [
  "CASHIER",
  "USER",
  "SUPERVISOR",
  "STORE MANAGER",
  "CASH OFFICE",
  "AREA MANAGER",
  "HO FINANCE",
  "ADMIN",
];

/** Case and stray spaces forgiven, as `canEditTemplates` reads the session's type. */
export function isSuperAdminType(type: string | null | undefined): boolean {
  return (type ?? "").trim().toUpperCase() === SUPER_ADMIN;
}

export function userTypeLabel(value: string): string {
  return USER_TYPE_LABELS[value as UserType] ?? value;
}

/**
 * The User Role combo. SUPER ADMIN is VK Softwares' own account, never a
 * client's role: it is offered only when the signed-in user is one. The role
 * the user was loaded with is appended when the list no longer carries it, so
 * an old role shows as itself instead of a blank combo.
 */
export function userRoleOptions(
  sessionUserType: string | null | undefined,
  storedUserType: string,
): { value: string; label: string }[] {
  const values: string[] = [...OFFERED_USER_TYPES];
  if (isSuperAdminType(sessionUserType)) values.push(SUPER_ADMIN);
  const stored = storedUserType.trim();
  if (stored && !values.includes(stored)) values.push(stored);
  return values.map((value) => ({ value, label: userTypeLabel(value) }));
}

export const SUPER_ADMIN_LOCK_NOTE = "A SUPER ADMIN user is changed only by a SUPER ADMIN.";

/**
 * Why this user opens read-only, or null. A client's admin may look at a SUPER
 * ADMIN user but never change it: its role is not in their list, so a save
 * would rewrite it — and the server refuses the save anyway (403
 * USER_ROLE_RESERVED).
 */
export function superAdminLock(
  storedUserType: string | null | undefined,
  sessionUserType: string | null | undefined,
): string | null {
  return isSuperAdminType(storedUserType) && !isSuperAdminType(sessionUserType)
    ? SUPER_ADMIN_LOCK_NOTE
    : null;
}

/** The DTO's own lengths. */
export const IDENTITY_LIMITS = {
  loginName: 50,
  /** `usrDisplayName` — not on the screen: the body derives it from the full name, else the login. */
  displayName: 100,
  fullName: 150,
  mobileNo: 20,
  email: 150,
  /** The till PIN: 4 to 6 digits (the DTO's `^(\d{4,6})?$`). */
  pin: 6,
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function identityFromPayload(payload: UserAdminPayload): IdentityForm {
  return {
    loginName: text(payload.usrLoginName),
    password: "",
    fullName: text(payload.usrFullName),
    mobileNo: text(payload.usrMobileNo),
    email: text(payload.usrEmail),
    userType: text(payload.usrType).trim(),
    companyId: text(payload.usrCompanyId),
    companyName: text(payload.usrCompanyName),
    branchId: text(payload.usrBranchId),
    branchName: text(payload.usrBranchName),
    employeeId: text(payload.usrEmployeeId),
    employeeName: text(payload.usrEmployeeName),
    pin: "",
    clearPin: false,
    mustChangePassword: payload.usrMustChangePassword === true,
    desktopLogin: payload.usrDesktopLogin !== false,
    webLogin: payload.usrWebLogin !== false,
    mobileLogin: payload.usrMobileLogin === true,
    editDate: payload.usrEditDate === true,
    editEntry: payload.usrEditEntry === true,
    editRate: payload.usrEditRate === true,
    isActive: payload.usrIsActive !== false,
    notes: text(payload.usrNotes),
  };
}

/**
 * Read-only facts shown on edit and never sent back (§4). The lock has no
 * unlock route yet (§10 UNLOCK), so it is shown, not acted on.
 */
export type UserFacts = {
  isLocked: boolean;
  failedLoginCount: number;
  lockedOn: string | null;
  lastFailedLoginOn: string | null;
  lastLoginOn: string | null;
  passwordChangedOn: string | null;
  createdOn: string | null;
  /** Whether a till PIN is stored — the PIN itself is never returned. */
  pinSet: boolean;
};

export function factsFromPayload(payload: UserAdminPayload): UserFacts {
  return {
    isLocked: payload.usrIsLocked === true,
    failedLoginCount: Number(payload.usrFailedLoginCount) || 0,
    lockedOn: payload.usrLockedOn ?? null,
    lastFailedLoginOn: payload.usrLastFailedLoginOn ?? null,
    lastLoginOn: payload.usrLastLoginOn ?? null,
    passwordChangedOn: payload.usrPasswordChangedOn ?? null,
    createdOn: payload.usrCreatedOn ?? null,
    pinSet: payload.usrPinSet === true,
  };
}

export type IdentityErrors = Partial<Record<keyof IdentityForm, string>>;

/**
 * What the client refuses before the round trip. The server checks the same
 * lengths and the email's shape; a duplicate login name is its answer alone.
 */
export function validateIdentity(form: IdentityForm, mode: "create" | "edit"): IdentityErrors {
  const errors: IdentityErrors = {};
  const loginName = form.loginName.trim();
  if (!loginName) {
    errors.loginName = "Enter a login name.";
  } else if (loginName.length > IDENTITY_LIMITS.loginName) {
    errors.loginName = `Login name must be at most ${IDENTITY_LIMITS.loginName} characters.`;
  }
  if (mode === "create" && !form.password.trim()) {
    errors.password = "Enter a password.";
  }
  if (!form.userType) {
    errors.userType = "Choose a user role.";
  }
  const pin = form.pin.trim();
  if (pin && !/^\d{4,6}$/.test(pin)) {
    errors.pin = "The till PIN is 4 to 6 digits.";
  } else if (pin && form.clearPin) {
    errors.pin = "Either type a new till PIN or clear it, not both.";
  }
  if (form.fullName.trim().length > IDENTITY_LIMITS.fullName) {
    errors.fullName = `Full name must be at most ${IDENTITY_LIMITS.fullName} characters.`;
  }
  if (form.mobileNo.trim().length > IDENTITY_LIMITS.mobileNo) {
    errors.mobileNo = `Mobile must be at most ${IDENTITY_LIMITS.mobileNo} characters.`;
  }
  if (form.email.trim().length > IDENTITY_LIMITS.email) {
    errors.email = `Email must be at most ${IDENTITY_LIMITS.email} characters.`;
  }
  if (form.branchId && !form.companyId) {
    errors.branchId = "A branch needs its company.";
  }
  return errors;
}

export function sameIdentity(a: IdentityForm, b: IdentityForm): boolean {
  return (Object.keys(a) as (keyof IdentityForm)[]).every((key) => a[key] === b[key]);
}

/**
 * The DTO key a 400's `errors[].field` names → the form field it belongs
 * under. Anything else goes to the banner.
 */
export const SERVER_FIELD_TO_FORM: Readonly<Record<string, keyof IdentityForm>> = {
  usrLoginName: "loginName",
  usrPassword: "password",
  // Derived from the full name (else the login), so its refusal belongs there.
  usrDisplayName: "fullName",
  usrFullName: "fullName",
  usrMobileNo: "mobileNo",
  usrEmail: "email",
  usrType: "userType",
  usrCompanyId: "companyId",
  usrBranchId: "branchId",
  usrEmployeeId: "employeeId",
  usrPin: "pin",
  usrMustChangePassword: "mustChangePassword",
  usrDesktopLogin: "desktopLogin",
  usrWebLogin: "webLogin",
  usrMobileLogin: "mobileLogin",
  usrEditDate: "editDate",
  usrEditEntry: "editEntry",
  usrEditRate: "editRate",
  usrIsActive: "isActive",
  usrNotes: "notes",
};
