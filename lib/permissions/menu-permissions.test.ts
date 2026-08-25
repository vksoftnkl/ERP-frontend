import { describe, expect, it } from "vitest";
import {
  applyMenuMasterLabels,
  extractMenuMasterItems,
  DEFAULT_PRIMARY_MENU,
} from "@/components/layout/constants";
import type { MenuMasterItem } from "@/components/layout/constants";
import {
  EMPTY_MENU_PERMISSION_INDEX,
  buildMenuPermissionIndex,
  resolveMenuAccess,
  resolveMenuRoute,
} from "./menu-permissions";

/** One `/menu-masters/usermenu` node, with the flags the caller cares about. */
function node(
  menuId: number,
  menuName: string,
  permissions: Partial<Record<string, boolean>> = {},
  children: unknown[] = [],
): unknown {
  return {
    menuId,
    menuName,
    menuVisibility: true,
    menuIsActive: true,
    permissions: {
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canPrint: false,
      canExport: false,
      isVisible: true,
      ...permissions,
    },
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Runs the payload through the same path the header does. */
function indexFrom(payload: unknown[]) {
  const items: MenuMasterItem[] = extractMenuMasterItems({ data: payload });
  return buildMenuPermissionIndex(applyMenuMasterLabels(DEFAULT_PRIMARY_MENU, items));
}

describe("menu permission index", () => {
  it("keys a granted screen by its route and its menu id", () => {
    const index = indexFrom([
      node(1, "&1 Sales", { canCreate: true }, [
        node(10, "Customers", { canCreate: true, canEdit: true, canExport: true }),
      ]),
    ]);
    const customers = index.byHref.get("/master/customer");
    expect(customers).toBeDefined();
    expect(customers?.canCreate).toBe(true);
    expect(customers?.canEdit).toBe(true);
    expect(customers?.canDelete).toBe(false);
    expect(customers?.canExport).toBe(true);
    expect(index.byMenuId.get(10)?.canEdit).toBe(true);
  });

  it("unions the grants of a screen reachable from two menus", () => {
    const index = indexFrom([
      node(1, "&1 Sales", {}, [
        node(11, "Sales Order", { canCreate: true }),
        node(75, "Loyalty Schemes", {}, [node(67, "Loyalty Programs", { canDelete: true })]),
        node(76, "SO Management", {}, [node(77, "Sales Orders", { canDelete: true })]),
      ]),
    ]);
    const order = index.byHref.get("/sales/sale-order");
    expect(order?.canCreate).toBe(true);
    expect(order?.canDelete).toBe(true);
  });

  it("drops a menu the server marks invisible", () => {
    const index = indexFrom([
      node(1, "&1 Sales", {}, [node(10, "Customers", { isVisible: false })]),
    ]);
    expect(index.byHref.has("/master/customer")).toBe(false);
  });
});

describe("route resolution", () => {
  it("prefers the longest matching menu route", () => {
    const routes = ["/master", "/master/item-master"];
    expect(resolveMenuRoute("/master/item-master/42", routes)).toBe("/master/item-master");
  });

  it("ignores a route that only shares a name prefix", () => {
    expect(resolveMenuRoute("/master/item-master-extra", ["/master/item-master"])).toBeNull();
  });
});

describe("access decisions", () => {
  const granted = indexFrom([
    node(1, "&1 Sales", {}, [node(10, "Customers", { canEdit: true })]),
  ]);

  it("grants a screen the user's menu carries", () => {
    const access = resolveMenuAccess("/master/customer", granted);
    expect(access.status).toBe("granted");
    expect(access.permissions.canEdit).toBe(true);
  });

  it("denies a catalogue screen the user's menu omits", () => {
    const access = resolveMenuAccess("/master/state-master", granted);
    expect(access.status).toBe("denied");
    expect(access.permissions.canView).toBe(false);
  });

  it("leaves the designers open — they are reached from a record, not the menu", () => {
    for (const path of [
      "/master/ui-table-designer/23",
      "/master/grid-designer/1",
      "/master/dropdown-designer/20",
    ]) {
      const access = resolveMenuAccess(path, granted);
      expect(access.status).toBe("ungoverned");
      expect(access.permissions.canEdit).toBe(true);
    }
  });

  it("leaves a route no menu governs alone", () => {
    const access = resolveMenuAccess("/home", granted);
    expect(access.status).toBe("ungoverned");
    expect(access.permissions.canCreate).toBe(true);
  });

  it("fails open until the menu has loaded", () => {
    const access = resolveMenuAccess("/master/state-master", EMPTY_MENU_PERMISSION_INDEX);
    expect(access.status).toBe("loading");
    expect(access.permissions.canEdit).toBe(true);
  });

  it("resolves a record sub-route to its list screen's grant", () => {
    const access = resolveMenuAccess("/master/customer/42", granted);
    expect(access.status).toBe("granted");
    expect(access.permissions.canEdit).toBe(true);
  });
});
