/**
 * User list → Copy (Qt `UserMasterList::copySelected` and
 * `UserAdminEntry::prefillPermissionsFrom`, NexERP 2026-10-30).
 *
 * Copy opens a NEW user entry that starts with another user's rights. The
 * source is read with the same `GET /user-administration/get?usrId=` the edit
 * path uses, and exactly four keys of its `data` are taken: `menus`,
 * `usrEditDate`, `usrEditEntry`, `usrEditRate`. Every other field keeps its
 * New default and the form stays in create mode, so Save goes through
 * `POST /user-administration/create` with no `usrId` and never writes the
 * source.
 *
 * A SUPER ADMIN is VK Softwares' own account, so its rights are never a
 * template for a client's user — refused for every caller, a SUPER ADMIN
 * session included.
 *
 * No React here: the list page and the entry reducer call these.
 */
import { flagKeyOf } from "./columns";
import { type Grant, type Grants, grantsFromPayload, NO_FLAGS } from "./grants";
import type { IdentityForm } from "./identity";
import type { MenuTree, MenuVerb } from "./menuTree";
import type { UserMenuPayload } from "./wire";

/** The popup's title and sentence, word for word as Qt raises them. */
export const COPY_REFUSAL_TITLE = "Cannot copy";
export const SUPER_ADMIN_COPY_REFUSAL = "A SUPER ADMIN's rights cannot be copied. Pick another user.";

/** The list button's tooltip (Qt `btnCopy`). */
export const COPY_ACTION_TOOLTIP = "New user with the selected user's rights (not a SUPER ADMIN)";

/**
 * True when the role is SUPER ADMIN. There is no role id or flag: the signal
 * is the text the server stores, `usr_type` on a grid-62 row and `usrType` in
 * the GET. As Qt's `isSuperAdminRole` does, case, spaces and underscores are
 * ignored, so "super admin", "SUPER_ADMIN" and "SuperAdmin" all count; ADMIN,
 * SUPERVISOR and "" do not. A value that is not text is not a SUPER ADMIN.
 */
export function isSuperAdminRole(usrType: unknown): boolean {
  if (typeof usrType !== "string") return false;
  return usrType.toUpperCase().replace(/[ _]/g, "") === "SUPERADMIN";
}

/** The user being copied, as the list row names it. */
export type CopySource = { usrId: string; loginName: string };

/** The Identity fields a copy carries. */
export type CopiedIdentity = Partial<Pick<IdentityForm, "editDate" | "editEntry" | "editRate">>;

/** What a copy takes from the source's GET, and nothing else. */
export type CopyPrefill = {
  /**
   * The source's menus with their eleven flags. Their `umId`, `umUserId`,
   * favourite, pinned, sort order and audit columns are dropped: a new user's
   * rows take the defaults.
   */
  grants: Grants;
  /** Only the keys the read carried; one it lacks keeps the New default. */
  identity: CopiedIdentity;
};

/** The GET's `data`, as far as a copy reads it. */
export type CopySourceData = {
  usrType?: unknown;
  menus?: readonly UserMenuPayload[] | null;
  usrEditDate?: unknown;
  usrEditEntry?: unknown;
  usrEditRate?: unknown;
};

const COPIED_IDENTITY_KEYS = [
  ["usrEditDate", "editDate"],
  ["usrEditEntry", "editEntry"],
  ["usrEditRate", "editRate"],
] as const;

/**
 * The prefill from the source's GET `data` (Qt's `kCopied`).
 *
 * A row is copied only when its `umVisibility` is true: Qt's tree ticks the
 * menu from that flag, and only ticked menus are saved. The flags are taken as
 * the source holds them; `placeCopiedGrants` then fits them to the tree.
 */
export function copyPrefillFromPayload(data: CopySourceData): CopyPrefill {
  const visible = (data.menus ?? []).filter((row) => row?.umVisibility === true);
  const grants = new Map<number, Grant>();
  for (const [menuId, grant] of grantsFromPayload(visible)) {
    grants.set(menuId, { menuId, flags: { ...grant.flags }, favourite: false, pinned: false, sortOrder: 0 });
  }

  const identity: CopiedIdentity = {};
  for (const [wireKey, formKey] of COPIED_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, wireKey)) identity[formKey] = data[wireKey] === true;
  }
  return { grants, identity };
}

/** The five rights Qt saves only where the menu has the verb. */
const POSTING_VERBS: readonly MenuVerb[] = ["POST", "CANCEL", "AMEND", "OVERRIDE", "RETENDER"];

/**
 * The copied set as Qt's rights tree would save it, once the tree is in:
 *
 * - a menu the tree does not carry is dropped (Qt finds no row to tick);
 * - the six CRUD flags go as copied;
 * - a posting right (Post, Cancel, Amend, Override, Re-tender) on a menu that
 *   lacks the verb is dropped, as Qt's `fieldValue()` drops it.
 *
 * The groups above each menu are ticked afterwards by the reducer, as for any
 * loaded set.
 */
export function placeCopiedGrants(copied: Grants, tree: MenuTree): Grants {
  const placed = new Map<number, Grant>();
  for (const [menuId, grant] of copied) {
    const node = tree.byId.get(menuId);
    if (!node) continue;
    const flags = { ...NO_FLAGS, ...grant.flags };
    for (const verb of POSTING_VERBS) {
      if (!node.verbs.has(verb)) flags[flagKeyOf(verb)] = false;
    }
    placed.set(menuId, { ...grant, flags });
  }
  return placed;
}

/** The heading line under the dialog's title (Qt `setHeadingNote`). */
export function copyHeadingNote(loginName: string, failed: boolean): string {
  return failed
    ? `New user — could not copy the rights of ${loginName}`
    : `New user — rights copied from ${loginName}`;
}
