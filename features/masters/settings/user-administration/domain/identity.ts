/**
 * The Identity tab's state (§4): the form, its defaults, what the payload
 * fills it with, and the rules checked before a round trip.
 *
 * Fields the DTO has and this screen leaves unsent (the port plan's Q1):
 * `usrTimezone`, `usrLanguage`, `usrAvatarUrl`. Unsent means untouched — the
 * server writes only the keys it receives, and the table defaults `UTC` / `en`
 * on create. `usrEmployeeId` and the till PIN joined the form 2026-10-08 (Qt).
 */
import { USER_TYPE_VALUES, type UserAdminPayload, type UserType } from "./wire";

export type IdentityForm = {
  loginName: string;
  /** Blank on edit means "keep" — the key is then omitted from the body. */
  password: string;
  displayName: string;
  fullName: string;
  mobileNo: string;
  email: string;
  userType: UserType | "";
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
  displayName: "",
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
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  USER: "User",
  CASHIER: "Cashier",
  VIEWER: "Viewer",
  SYSTEM: "System",
};

/**
 * The Qt combo's order (cashier first, the till's people together), then the
 * two roles Qt no longer offers — kept so a user saved with one still shows it.
 */
const USER_TYPE_ORDER: readonly UserType[] = [
  "CASHIER",
  "USER",
  "ADMIN",
  "SUPERVISOR",
  "MANAGER",
  "SUPER ADMIN",
  "VIEWER",
  "SYSTEM",
];

export const USER_TYPE_OPTIONS: readonly { value: UserType; label: string }[] = [
  ...USER_TYPE_ORDER,
  ...USER_TYPE_VALUES.filter((value) => !USER_TYPE_ORDER.includes(value)),
].map((value) => ({ value, label: USER_TYPE_LABELS[value] }));

export function isUserType(value: unknown): value is UserType {
  return typeof value === "string" && (USER_TYPE_VALUES as readonly string[]).includes(value);
}

/** The DTO's own lengths. */
export const IDENTITY_LIMITS = {
  loginName: 50,
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
    displayName: text(payload.usrDisplayName),
    fullName: text(payload.usrFullName),
    mobileNo: text(payload.usrMobileNo),
    email: text(payload.usrEmail),
    userType: isUserType(payload.usrType) ? payload.usrType : "",
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
  if (form.displayName.trim().length > IDENTITY_LIMITS.displayName) {
    errors.displayName = `Display name must be at most ${IDENTITY_LIMITS.displayName} characters.`;
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
  usrDisplayName: "displayName",
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
