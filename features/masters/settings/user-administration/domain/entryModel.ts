/**
 * The entry dialog's state, as a reducer over plain values, so the rules of
 * §7 can be checked without React:
 *
 * - Save is disabled until the tree AND the user have loaded (§7.2). A save
 *   from a half-loaded form would revoke everything it had not yet seen.
 * - When the tree cannot load at all, the Identity tab is still usable and
 *   the save OMITS `menus` — the server then leaves the rows alone. That is
 *   the one safe way to save without the set.
 * - A 400's `errors[]` land on their fields; anything else is the banner.
 *
 * The React side (`user-entry-dialog.tsx`) only dispatches and renders.
 */
import { grantDiff, type GrantDiff } from "./grantDiff";
import { EMPTY_GRANTS, type Grants, grantsFromPayload, sameGrants } from "./grants";
import {
  EMPTY_IDENTITY,
  factsFromPayload,
  identityFromPayload,
  SERVER_FIELD_TO_FORM,
  sameIdentity,
  type IdentityErrors,
  type IdentityForm,
  type UserFacts,
} from "./identity";
import { EMPTY_MENU_TREE, type MenuTree } from "./menuTree";
import type { ApiFieldError, UserAdminPayload } from "./wire";

export type EntryMode = "create" | "edit";
export type EntryTab = "identity" | "permissions";
export type LoadStatus = "idle" | "loading" | "loaded" | "failed";

export type EntryState = {
  mode: EntryMode;
  usrId: string | null;
  /** Opened to look, not to change: no Save, every control inert. */
  readOnly: boolean;
  tab: EntryTab;
  identity: IdentityForm;
  /** The Identity tab as loaded — the dirty check's baseline. */
  loadedIdentity: IdentityForm;
  facts: UserFacts | null;
  user: { status: LoadStatus; error: string | null };
  tree: { status: LoadStatus; error: string | null; value: MenuTree };
  /** The set as loaded — what every save is diffed against (§7.3). */
  loadedGrants: Grants;
  grants: Grants;
  fieldErrors: IdentityErrors;
  banner: string | null;
  saving: boolean;
};

export type EntryAction =
  | { type: "tree/loading" }
  | { type: "tree/loaded"; tree: MenuTree }
  | { type: "tree/failed"; error: string }
  | { type: "user/loading" }
  | { type: "user/loaded"; payload: UserAdminPayload }
  | { type: "user/failed"; error: string }
  | { type: "identity/changed"; patch: Partial<IdentityForm> }
  | { type: "grants/changed"; grants: Grants }
  | { type: "tab/changed"; tab: EntryTab }
  | { type: "errors/set"; fieldErrors: IdentityErrors; banner: string | null }
  | { type: "errors/cleared" }
  | { type: "save/started" }
  | { type: "save/failed"; fieldErrors: IdentityErrors; banner: string | null }
  | { type: "save/succeeded"; payload: UserAdminPayload };

export function initialEntryState(args: {
  mode: EntryMode;
  usrId: string | null;
  readOnly?: boolean;
}): EntryState {
  const create = args.mode === "create";
  return {
    mode: args.mode,
    usrId: create ? null : args.usrId,
    readOnly: args.readOnly === true,
    tab: "identity",
    identity: EMPTY_IDENTITY,
    loadedIdentity: EMPTY_IDENTITY,
    facts: null,
    // A new user has nothing to fetch: the "user" side of the gate is open.
    user: { status: create ? "loaded" : "idle", error: null },
    tree: { status: "idle", error: null, value: EMPTY_MENU_TREE },
    loadedGrants: EMPTY_GRANTS,
    grants: EMPTY_GRANTS,
    fieldErrors: {},
    banner: null,
    saving: false,
  };
}

export function entryReducer(state: EntryState, action: EntryAction): EntryState {
  switch (action.type) {
    case "tree/loading":
      return { ...state, tree: { ...state.tree, status: "loading", error: null } };
    case "tree/loaded":
      return { ...state, tree: { status: "loaded", error: null, value: action.tree } };
    case "tree/failed":
      return { ...state, tree: { ...state.tree, status: "failed", error: action.error } };
    case "user/loading":
      return { ...state, user: { status: "loading", error: null } };
    case "user/loaded": {
      const identity = identityFromPayload(action.payload);
      const grants = grantsFromPayload(action.payload.menus);
      return {
        ...state,
        usrId: action.payload.usrId,
        identity,
        loadedIdentity: identity,
        facts: factsFromPayload(action.payload),
        user: { status: "loaded", error: null },
        loadedGrants: grants,
        grants,
      };
    }
    case "user/failed":
      return { ...state, user: { status: "failed", error: action.error } };
    case "identity/changed": {
      const patch = { ...action.patch };
      // A branch is only ever a branch of the chosen company (§4): a new
      // company drops the branch picked under the old one.
      if (patch.companyId !== undefined && patch.companyId !== state.identity.companyId) {
        patch.branchId = "";
        patch.branchName = "";
      }
      const fieldErrors = { ...state.fieldErrors };
      for (const key of Object.keys(patch) as (keyof IdentityForm)[]) delete fieldErrors[key];
      return { ...state, identity: { ...state.identity, ...patch }, fieldErrors };
    }
    case "grants/changed":
      return { ...state, grants: action.grants };
    case "tab/changed":
      return { ...state, tab: action.tab };
    case "errors/set":
      return { ...state, fieldErrors: action.fieldErrors, banner: action.banner };
    case "errors/cleared":
      return { ...state, fieldErrors: {}, banner: null };
    case "save/started":
      return { ...state, saving: true, fieldErrors: {}, banner: null };
    case "save/failed":
      return { ...state, saving: false, fieldErrors: action.fieldErrors, banner: action.banner };
    case "save/succeeded": {
      const identity = identityFromPayload(action.payload);
      const grants = grantsFromPayload(action.payload.menus);
      return {
        ...state,
        mode: "edit",
        usrId: action.payload.usrId,
        identity,
        loadedIdentity: identity,
        facts: factsFromPayload(action.payload),
        loadedGrants: grants,
        grants,
        saving: false,
        fieldErrors: {},
        banner: null,
      };
    }
    default:
      return state;
  }
}

// ── selectors ──────────────────────────────────────────────────────────────

/** Both halves of the set have arrived: the tab may be edited and the set may be sent. */
export function permissionsReady(state: EntryState): boolean {
  return state.tree.status === "loaded" && state.user.status === "loaded";
}

/** Why the Permissions tab is read-only right now, or null when it is not. */
export function permissionsHold(state: EntryState): string | null {
  if (state.user.status === "failed") return state.user.error ?? "The user could not be loaded.";
  if (state.tree.status === "failed") {
    return `${state.tree.error ?? "The menu tree could not be loaded."} Saving leaves this user's menu rights exactly as they are.`;
  }
  if (!permissionsReady(state)) return "Loading the menu tree and this user's rights…";
  return null;
}

/**
 * The set to send, or null to omit `menus` and leave the rows alone. Never
 * the map of a form that has not seen the whole set.
 */
export function grantsForSave(state: EntryState): Grants | null {
  return permissionsReady(state) ? state.grants : null;
}

export function currentDiff(state: EntryState): GrantDiff {
  return grantDiff(state.loadedGrants, state.grants);
}

export function isDirty(state: EntryState): boolean {
  if (!sameIdentity(state.identity, state.loadedIdentity)) return true;
  return permissionsReady(state) && !sameGrants(state.loadedGrants, state.grants);
}

/**
 * The gate (§7.2). Closed while either load is in flight, closed for good
 * when the user failed to load (there is nothing to edit), open when the tree
 * failed — the save then carries no `menus`.
 */
export function canSave(state: EntryState): boolean {
  if (state.readOnly || state.saving) return false;
  if (state.user.status !== "loaded") return false;
  if (state.tree.status === "idle" || state.tree.status === "loading") return false;
  return true;
}

/** Why Save is inactive, for the footer's hint. */
export function saveHold(state: EntryState): string | null {
  if (state.readOnly) return "Read-only.";
  if (state.saving) return "Saving…";
  if (state.user.status === "loading" || state.user.status === "idle") return "Loading the user…";
  if (state.user.status === "failed") return state.user.error ?? "The user could not be loaded.";
  if (state.tree.status === "idle" || state.tree.status === "loading") return "Loading the menu tree…";
  return null;
}

/**
 * A 400's `errors[]` → its fields, and the banner for what has no field. The
 * duplicate-login answer arrives this way (`usrLoginName`), so does an invalid
 * menu id (`menus`, which has no field and goes to the banner).
 */
export function splitServerErrors(
  errors: readonly ApiFieldError[] | null | undefined,
  fallback: string,
): { fieldErrors: IdentityErrors; banner: string | null } {
  const fieldErrors: IdentityErrors = {};
  const loose: string[] = [];
  for (const entry of errors ?? []) {
    const message = (entry?.message ?? "").trim();
    if (!message) continue;
    const field = entry?.field ? SERVER_FIELD_TO_FORM[entry.field] : undefined;
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = message;
    } else {
      loose.push(message);
    }
  }
  const banner = loose.length > 0 ? loose.join(" ") : Object.keys(fieldErrors).length > 0 ? null : fallback;
  return { fieldErrors, banner };
}
