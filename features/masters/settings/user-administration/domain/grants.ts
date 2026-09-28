/**
 * A user's grants: `Map<menuId, Grant>`.
 *
 * A menu's presence in the map is column 0 — "this menu is in the user's set".
 * The eleven flags are the other columns. The map is the WHOLE set, loaded
 * from `/user-administration/get` before any edit is possible, because a save
 * sends it whole: a menu missing from `toMenusPayload()` is revoked (§7.2).
 *
 * Two consequences the functions here protect:
 *
 * - A grant on a menu the tree does not show (a hidden menu, or a verb the
 *   menu no longer has) is data this screen did not decide. It stays in the
 *   map untouched and goes back exactly as it came.
 * - `umIsFavourite` / `umIsPinned` / `umSortOrder` are the user's own, not the
 *   admin's. They go back as loaded; a new row gets the defaults.
 *
 * `toMenusPayload()` is the ONLY function that builds `menus[]`.
 */
import { type MenuNode, type MenuTree, subtreeIds, type MenuVerb } from "./menuTree";
import { flagKeyOf } from "./columns";
import {
  GRANT_FLAG_KEYS,
  type GrantFlagKey,
  type SaveUserMenuDto,
  type UserMenuPayload,
} from "./wire";

export type GrantFlags = Record<GrantFlagKey, boolean>;

export type Grant = {
  menuId: number;
  flags: GrantFlags;
  favourite: boolean;
  pinned: boolean;
  sortOrder: number;
};

export type Grants = ReadonlyMap<number, Grant>;

export const NO_FLAGS: Readonly<GrantFlags> = Object.freeze(
  Object.fromEntries(GRANT_FLAG_KEYS.map((key) => [key, false])) as GrantFlags,
);

export const EMPTY_GRANTS: Grants = new Map();

function toSortOrder(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : 0;
}

/** `menus[]` from the payload → the map. A menu listed twice keeps the last row. */
export function grantsFromPayload(
  menus: readonly UserMenuPayload[] | null | undefined,
): Grants {
  const grants = new Map<number, Grant>();
  for (const row of menus ?? []) {
    const menuId = Number(row?.umMenuId);
    if (!Number.isInteger(menuId) || menuId <= 0) continue;
    const flags = { ...NO_FLAGS };
    for (const key of GRANT_FLAG_KEYS) {
      flags[key] = row[key] === true;
    }
    grants.set(menuId, {
      menuId,
      flags,
      favourite: row.umIsFavourite === true,
      pinned: row.umIsPinned === true,
      sortOrder: toSortOrder(row.umSortOrder),
    });
  }
  return grants;
}

/**
 * A row for a menu that is not in the set yet: every flag off, and the user's
 * own favourite / pinned / sort order carried over from what was loaded, so
 * that an admin who unticks a menu and ticks it again has not reset them.
 */
function newGrant(menuId: number, loaded: Grants): Grant {
  const previous = loaded.get(menuId);
  return {
    menuId,
    flags: { ...NO_FLAGS },
    favourite: previous?.favourite ?? false,
    pinned: previous?.pinned ?? false,
    sortOrder: previous?.sortOrder ?? 0,
  };
}

function withFlags(grant: Grant, patch: Partial<GrantFlags>): Grant {
  return { ...grant, flags: { ...grant.flags, ...patch } };
}

/**
 * Column 0 on one row, cascading to its subtree: ticking a parent ticks its
 * children's column 0 and only column 0 (a child already in the set keeps its
 * flags); unticking removes the whole subtree from the set.
 */
export function tickMenu(
  grants: Grants,
  node: MenuNode,
  ticked: boolean,
  loaded: Grants,
): Grants {
  const next = new Map(grants);
  for (const id of subtreeIds(node)) {
    if (ticked) {
      if (!next.has(id)) next.set(id, newGrant(id, loaded));
    } else {
      next.delete(id);
    }
  }
  return next;
}

/** One cell. Ticking a verb on a menu not yet in the set puts it in the set. */
export function setFlag(
  grants: Grants,
  menuId: number,
  key: GrantFlagKey,
  value: boolean,
  loaded: Grants,
): Grants {
  const next = new Map(grants);
  const current = next.get(menuId) ?? newGrant(menuId, loaded);
  next.set(menuId, withFlags(current, { [key]: value }));
  return next;
}

/**
 * A header click: the verb's column, for every given row that is in the set
 * AND has the verb. A row without the verb has no cell there, so there is
 * nothing to toggle — this is what keeps "All" from granting Re-tender
 * everywhere.
 */
export function setVerbOnRows(
  grants: Grants,
  rows: readonly MenuNode[],
  verb: MenuVerb,
  value: boolean,
): Grants {
  const key = flagKeyOf(verb);
  const next = new Map(grants);
  for (const node of rows) {
    if (!node.verbs.has(verb)) continue;
    const current = next.get(node.id);
    if (!current) continue;
    next.set(node.id, withFlags(current, { [key]: value }));
  }
  return next;
}

/** The header checkbox's state for a verb over the given rows. */
export function verbColumnState(
  grants: Grants,
  rows: readonly MenuNode[],
  verb: MenuVerb,
): "none" | "some" | "all" {
  const key = flagKeyOf(verb);
  let on = 0;
  let cells = 0;
  for (const node of rows) {
    if (!node.verbs.has(verb)) continue;
    const grant = grants.get(node.id);
    if (!grant) continue;
    cells += 1;
    if (grant.flags[key]) on += 1;
  }
  if (cells === 0 || on === 0) return "none";
  return on === cells ? "all" : "some";
}

/**
 * The row's context menu: every verb this menu has, on or off. Puts the menu
 * in the set. A flag for a verb the menu lacks is not touched — it is not
 * painted, and it is not this screen's to decide.
 */
export function setAllVerbsOnMenu(
  grants: Grants,
  node: MenuNode,
  value: boolean,
  loaded: Grants,
): Grants {
  const next = new Map(grants);
  const current = next.get(node.id) ?? newGrant(node.id, loaded);
  const patch: Partial<GrantFlags> = {};
  for (const verb of node.verbs) patch[flagKeyOf(verb)] = value;
  next.set(node.id, withFlags(current, patch));
  return next;
}

/** "All": every row of the tree in the set with every cell it has ticked. */
export function grantEverything(grants: Grants, tree: MenuTree, loaded: Grants): Grants {
  let next: Grants = grants;
  for (const node of tree.rows) next = setAllVerbsOnMenu(next, node, true, loaded);
  return next;
}

/**
 * "None": every row of the tree out of the set. A grant on a menu the tree
 * does not show stays — this screen cannot see it, so it cannot revoke it.
 */
export function grantNothing(grants: Grants, tree: MenuTree): Grants {
  const next = new Map(grants);
  for (const node of tree.rows) next.delete(node.id);
  return next;
}

export type GrantCount = {
  /** Tree rows in the set. */
  ticked: number;
  /** Rows in the tree. */
  total: number;
  /** Grants on menus the tree does not show — kept, sent back unchanged. */
  outsideTree: number;
};

export function countGrants(grants: Grants, tree: MenuTree): GrantCount {
  let ticked = 0;
  for (const node of tree.rows) if (grants.has(node.id)) ticked += 1;
  let outsideTree = 0;
  for (const menuId of grants.keys()) if (!tree.byId.has(menuId)) outsideTree += 1;
  return { ticked, total: tree.rows.length, outsideTree };
}

/**
 * "Copy rights from …": the other user's set becomes this form's set — their
 * menus and flags, this user's own favourite / pinned / sort order.
 */
export function copyGrantsFrom(source: Grants, loaded: Grants): Grants {
  const next = new Map<number, Grant>();
  for (const [menuId, grant] of source) {
    next.set(menuId, { ...newGrant(menuId, loaded), flags: { ...grant.flags } });
  }
  return next;
}

/** True when the two sets grant exactly the same thing. */
export function sameGrants(a: Grants, b: Grants): boolean {
  if (a.size !== b.size) return false;
  for (const [menuId, grant] of a) {
    const other = b.get(menuId);
    if (!other) return false;
    for (const key of GRANT_FLAG_KEYS) if (grant.flags[key] !== other.flags[key]) return false;
    if (
      grant.favourite !== other.favourite ||
      grant.pinned !== other.pinned ||
      grant.sortOrder !== other.sortOrder
    ) {
      return false;
    }
  }
  return true;
}

/**
 * `menus[]` for the save — the ONLY place it is built.
 *
 * Every menu in the set, each with all eleven flags (a flag for a verb the
 * menu lacks goes as stored: false unless it was a stale true), visibility
 * true, and favourite / pinned / sort order as loaded. The server's own words:
 * "existing menus not in this list are soft-deleted".
 */
export function toMenusPayload(grants: Grants): SaveUserMenuDto[] {
  return [...grants.values()]
    .sort((a, b) => a.menuId - b.menuId)
    .map((grant) => ({
      umMenuId: grant.menuId,
      ...Object.fromEntries(GRANT_FLAG_KEYS.map((key) => [key, grant.flags[key] === true])),
      umVisibility: true,
      umIsFavourite: grant.favourite,
      umIsPinned: grant.pinned,
      umSortOrder: grant.sortOrder,
    })) as SaveUserMenuDto[];
}
