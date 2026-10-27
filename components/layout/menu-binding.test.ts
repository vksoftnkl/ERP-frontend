/**
 * The header menu's names come only from `fixed.menu_master`; the client adds
 * routes and icons by menu id (`MENU_ROUTES`). These pin the point of that:
 * renaming or moving a menu in the DB changes what the header shows and
 * nothing else.
 */
import { describe, expect, it } from "vitest";
import { buildPrimaryMenu, extractMenuMasterItems } from "@/components/layout/constants";
import type { ErpHeaderItem } from "@/components/layout/types";

function resolve(data: unknown[]): ErpHeaderItem[] {
  return buildPrimaryMenu(extractMenuMasterItems({ data }));
}

function findById(items: ErpHeaderItem[], menuId: number): ErpHeaderItem | null {
  for (const item of items) {
    if (item.menuId === menuId) {
      return item;
    }
    const child = item.children ? findById(item.children, menuId) : null;
    if (child) {
      return child;
    }
  }
  return null;
}

describe("menu binding by id", () => {
  it("a menu renamed in the DB shows the new name and keeps its route", () => {
    const menu = resolve([
      {
        menuId: 5,
        menuName: "&5 Finance",
        children: [{ menuId: 99, menuName: "Customer Receipts" }],
      },
    ]);
    expect(findById(menu, 5)).toMatchObject({ label: "Finance", iconKey: "accounts" });
    expect(findById(menu, 99)).toMatchObject({
      label: "Customer Receipts",
      href: "/accounts/receipt",
    });
  });

  it("a menu moved to another parent keeps its route", () => {
    const menu = resolve([
      { menuId: 7, menuName: "&7 Settings", children: [{ menuId: 18, menuName: "State Master" }] },
    ]);
    expect(findById(menu, 18)?.href).toBe("/master/state-master");
  });

  it("a menu renamed to another screen's name does not take that screen's route", () => {
    // 13 is Sales Return (not built). Named "Contra", it must stay unlinked
    // rather than open menu 104's screen under menu 13's grant.
    const menu = resolve([
      { menuId: 1, menuName: "&1 Sales", children: [{ menuId: 13, menuName: "Contra" }] },
    ]);
    expect(findById(menu, 13)?.label).toBe("Contra");
    expect(findById(menu, 13)?.href).toBeUndefined();
  });

  it("a group that shares a module's name does not borrow its icon", () => {
    const menu = resolve([
      { menuId: 8, menuName: "&8 Transport", children: [{ menuId: 136, menuName: "Reports" }] },
    ]);
    expect(findById(menu, 136)?.iconKey).toBeUndefined();
  });

  it("a DB menu with no route yet still shows, as a plain label", () => {
    const menu = resolve([
      { menuId: 3, menuName: "&3 Inventory", children: [{ menuId: 9001, menuName: "New Screen" }] },
    ]);
    expect(findById(menu, 9001)).toMatchObject({ label: "New Screen" });
    expect(findById(menu, 9001)?.href).toBeUndefined();
  });
});
