import {
  DEFAULT_PRIMARY_MENU,
} from "@/components/layout/constants";
import type { ErpHeaderItem, ErpMenuPermissionFlags } from "@/components/layout/types";

/**
 * What the signed-in user may do on one screen. `canView` is the right to open
 * the route at all; the rest gate the toolbar. These come from
 * `/menu-masters/usermenu` — the same rows User Administration writes.
 */
export type MenuPermissions = ErpMenuPermissionFlags & {
  canView: boolean;
};

export const FULL_MENU_PERMISSIONS: MenuPermissions = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canPrint: true,
  canExport: true,
  isVisible: true,
};

export const NO_MENU_PERMISSIONS: MenuPermissions = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canPrint: false,
  canExport: false,
  isVisible: false,
};

export type MenuPermissionIndex = {
  byHref: Map<string, MenuPermissions>;
  byMenuId: Map<number, MenuPermissions>;
  /** True once a non-empty user menu has been read; nothing is denied before. */
  loaded: boolean;
};

export const EMPTY_MENU_PERMISSION_INDEX: MenuPermissionIndex = {
  byHref: new Map(),
  byMenuId: new Map(),
  loaded: false,
};

function toPermissions(flags: ErpMenuPermissionFlags | undefined): MenuPermissions {
  if (!flags) {
    // The menu reached the user, so it is viewable; without a permissions block
    // the server has told us nothing about the action rights, so grant none.
    return { ...NO_MENU_PERMISSIONS, canView: true, isVisible: true };
  }
  return { ...flags, canView: flags.isVisible !== false };
}

/** Union of two grants — the same screen can hang off more than one menu. */
function mergePermissions(a: MenuPermissions, b: MenuPermissions): MenuPermissions {
  return {
    canView: a.canView || b.canView,
    canCreate: a.canCreate || b.canCreate,
    canEdit: a.canEdit || b.canEdit,
    canDelete: a.canDelete || b.canDelete,
    canPrint: a.canPrint || b.canPrint,
    canExport: a.canExport || b.canExport,
    isVisible: a.isVisible || b.isVisible,
  };
}

export function normalizeRoutePath(path: string): string {
  const withoutQuery = path.split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed.toLowerCase() : "/";
}

/** Flattens the permission-carrying user menu into href/menuId lookups. */
export function buildMenuPermissionIndex(items: ErpHeaderItem[]): MenuPermissionIndex {
  const byHref = new Map<string, MenuPermissions>();
  const byMenuId = new Map<number, MenuPermissions>();
  const visit = (nodes: ErpHeaderItem[]) => {
    for (const node of nodes) {
      const permissions = toPermissions(node.permissions);
      if (typeof node.menuId === "number") {
        const existing = byMenuId.get(node.menuId);
        byMenuId.set(
          node.menuId,
          existing ? mergePermissions(existing, permissions) : permissions,
        );
      }
      if (node.href) {
        const key = normalizeRoutePath(node.href);
        const existing = byHref.get(key);
        byHref.set(key, existing ? mergePermissions(existing, permissions) : permissions);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };
  visit(items);
  return { byHref, byMenuId, loaded: byHref.size > 0 || byMenuId.size > 0 };
}

/**
 * Routes that stay open regardless of the menu.
 *
 * The designers are reached from the record they are editing (a grid, a
 * dropdown, a UI table), not from the menu, and the person configuring a screen
 * is not necessarily granted the menu that screen belongs to. They are listed
 * in `DEFAULT_PRIMARY_MENU` for navigation only, so without this exemption the
 * gate below would refuse them.
 */
const EXEMPT_ROUTES: readonly string[] = [
  "/master/grid-designer",
  "/master/dropdown-designer",
  "/master/ui-table-designer",
];

function isExemptRoute(pathname: string): boolean {
  const target = normalizeRoutePath(pathname);
  return EXEMPT_ROUTES.some(
    (route) => target === route || target.startsWith(`${route}/`),
  );
}

/**
 * Every route the static menu catalogue knows about. A route in here is
 * "governed": if the user's menu does not carry it, they were not granted it.
 * A route absent from the catalogue (a designer screen, `/home`) has no menu
 * row to be granted through, so permissions never block it.
 */
function collectGovernedRoutes(items: ErpHeaderItem[], into: Set<string>): Set<string> {
  for (const item of items) {
    if (item.href) {
      into.add(normalizeRoutePath(item.href));
    }
    if (item.children?.length) {
      collectGovernedRoutes(item.children, into);
    }
  }
  return into;
}

export const GOVERNED_ROUTES: ReadonlySet<string> = collectGovernedRoutes(
  DEFAULT_PRIMARY_MENU,
  new Set<string>(),
);

/**
 * Maps a pathname onto the menu route that owns it. Exact match first, then the
 * longest registered prefix, so `/master/item-master/42` still resolves to the
 * Item Master menu.
 */
export function resolveMenuRoute(
  pathname: string,
  routes: Iterable<string>,
): string | null {
  const target = normalizeRoutePath(pathname);
  let best: string | null = null;
  for (const route of routes) {
    if (route === "/" || route.length === 0) {
      continue;
    }
    if (target === route || target.startsWith(`${route}/`)) {
      if (!best || route.length > best.length) {
        best = route;
      }
    }
  }
  return best;
}

export type MenuAccessStatus = "loading" | "ungoverned" | "granted" | "denied";

export type MenuAccessResult = {
  status: MenuAccessStatus;
  permissions: MenuPermissions;
  /** The menu route the page resolved to, when one exists. */
  route: string | null;
};

/**
 * Resolves one route against the user's menu. Nothing is denied while the menu
 * is still loading, and a route the catalogue does not govern stays open.
 */
export function resolveMenuAccess(
  pathname: string,
  index: MenuPermissionIndex,
): MenuAccessResult {
  const governedRoute = isExemptRoute(pathname)
    ? null
    : resolveMenuRoute(pathname, GOVERNED_ROUTES);
  if (!governedRoute) {
    return { status: "ungoverned", permissions: FULL_MENU_PERMISSIONS, route: null };
  }
  if (!index.loaded) {
    return { status: "loading", permissions: FULL_MENU_PERMISSIONS, route: governedRoute };
  }
  const grantedRoute = resolveMenuRoute(pathname, index.byHref.keys());
  const permissions = grantedRoute ? index.byHref.get(grantedRoute) : undefined;
  if (!permissions || !permissions.canView) {
    return { status: "denied", permissions: NO_MENU_PERMISSIONS, route: governedRoute };
  }
  return { status: "granted", permissions, route: grantedRoute ?? governedRoute };
}
