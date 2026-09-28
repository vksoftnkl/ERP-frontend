/**
 * The save body (§7.1): the Identity fields, whitelisted, plus
 * `menus = toMenusPayload(grants)`.
 *
 * Built from the form and never from the GET payload — the API refuses any
 * key outside `SaveUserAdministrationDto`, and the payload carries a dozen.
 */
import { type Grants, toMenusPayload } from "./grants";
import type { IdentityForm } from "./identity";
import type { SaveUserAdministrationDto } from "./wire";

export type SaveBodyInput = {
  mode: "create" | "edit";
  /** The user being edited; ignored on create. */
  usrId: string | null;
  identity: IdentityForm;
  /**
   * The complete set, or null when the Permissions tab never loaded — then the
   * key is omitted and the server leaves the rows alone. Never `[]` for that:
   * an empty list revokes everything.
   */
  grants: Grants | null;
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildSaveBody({ mode, usrId, identity, grants }: SaveBodyInput): SaveUserAdministrationDto {
  const loginName = identity.loginName.trim();
  const fullName = identity.fullName.trim();
  const companyId = identity.companyId.trim();
  // A branch is only ever a branch of the chosen company.
  const branchId = companyId ? identity.branchId.trim() : "";

  const body: SaveUserAdministrationDto = {
    usrLoginName: loginName,
    // The column is NOT NULL and the header greets the user by it, so a blank
    // display name falls back to the full name, then the login.
    usrDisplayName: identity.displayName.trim() || fullName || loginName,
    usrFullName: nullable(fullName),
    usrMobileNo: nullable(identity.mobileNo),
    usrEmail: nullable(identity.email),
    usrType: identity.userType || null,
    usrCompanyId: companyId || null,
    usrBranchId: branchId || null,
    usrMustChangePassword: identity.mustChangePassword,
    usrDesktopLogin: identity.desktopLogin,
    usrWebLogin: identity.webLogin,
    usrMobileLogin: identity.mobileLogin,
    usrEditDate: identity.editDate,
    usrEditEntry: identity.editEntry,
    usrEditRate: identity.editRate,
    usrIsActive: identity.isActive,
    usrNotes: nullable(identity.notes),
  };

  // Blank means "keep": the key is omitted, never sent as "".
  const password = identity.password.trim();
  if (password) {
    body.usrPassword = password;
  }

  if (mode === "edit" && usrId) {
    body.usrId = usrId;
  }

  if (grants) {
    body.menus = toMenusPayload(grants);
  }

  return body;
}
