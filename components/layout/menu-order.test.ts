/**
 * The bar shows `/menu-masters/usermenu` in the server's order (`menu_position`,
 * then `menu_id`) and, as Qt's `MenuWindow::buildMenu` does, leaves out every
 * row whose `menu_visiblity` (or `menu_is_active`) is false, with its subtree.
 * Those rows used to be drawn, which pushed Transport and Attendance ahead of
 * Sales and buried Sales Bill under the hidden Sales rows.
 */
import { describe, expect, it } from "vitest";
import {
  buildPrimaryMenu,
  extractMenuMasterItems,
  visibleMenuItems,
} from "@/components/layout/constants";
import type { ErpHeaderItem } from "@/components/layout/types";
import { buildMenuPermissionIndex } from "@/lib/permissions/menu-permissions";

/** One usermenu node as the server sends it: menuPosition is a string. */
function node(
  menuId: number,
  menuName: string,
  menuPosition: string,
  extra: Record<string, unknown> = {},
  children: unknown[] = [],
): Record<string, unknown> {
  return {
    menuId,
    menuName,
    menuPosition,
    menuVisibility: true,
    menuIsActive: true,
    menuSeparator: false,
    permissions: { canCreate: true, canEdit: true, isVisible: true },
    ...extra,
    ...(children.length > 0 ? { children } : {}),
  };
}

// Shaped like the dev DB's Sales menu, already in the server's order.
const PAYLOAD = [
  node(8, "&8 Transport", "8.00", { menuVisibility: false }, [
    node(126, "Tripsheet", "1.00"),
  ]),
  node(1, "&1 Sales", "10.00", {}, [
    node(189, "Optical Prescription", "1.10"),
    node(229, "Sale Entry (Bulk)", "3.10"),
    node(13, "Sales Return", "4.00", { menuVisibility: false }),
    node(12, "Sales Bill", "10.00"),
    node(14, "Quotation", "20.00"),
    node(202, "Agents", "21.10", { menuVisibility: false }, [
      node(203, "Agents Master", "1.00"),
    ]),
    node(11, "Sales Order", "30.00"),
    node(257, "Temp Credits", "50.00", { menuSeparator: true }),
    node(10, "Customers", "60.00", { menuSeparator: true }),
  ]),
  node(6, "&6 Reports", "60.00", {}, [
    node(106, "Audit Logs", "1.00", { menuVisibility: false }),
    node(9002, "Old Report", "2.00", { menuIsActive: false }),
    node(9003, "Shown Report", "3.00"),
  ]),
];

function menu(): ErpHeaderItem[] {
  return buildPrimaryMenu(extractMenuMasterItems({ data: PAYLOAD }));
}

function labels(items: ErpHeaderItem[] | undefined): string[] {
  return (items ?? []).map((item) => item.label);
}

describe("header menu order and visibility", () => {
  it("keeps the server's order at every level and never re-sorts", () => {
    const full = menu();
    expect(labels(full)).toEqual(["Transport", "Sales", "Reports"]);
    // As strings "10.00" < "3.10" and by id 11 < 12 < 13: neither may reorder.
    expect(labels(full[1].children)).toEqual([
      "Optical Prescription",
      "Sale Entry (Bulk)",
      "Sales Return",
      "Sales Bill",
      "Quotation",
      "Agents",
      "Sales Order",
      "Temp Credits",
      "Customers",
    ]);
  });

  it("draws no row whose menuVisibility or menuIsActive is false, nor what hangs off it", () => {
    const shown = visibleMenuItems(menu());
    expect(labels(shown)).toEqual(["Sales", "Reports"]);
    expect(labels(shown[0].children)).toEqual([
      "Optical Prescription",
      "Sale Entry (Bulk)",
      "Sales Bill",
      "Quotation",
      "Sales Order",
      "Temp Credits",
      "Customers",
    ]);
    expect(labels(shown[1].children)).toEqual(["Shown Report"]);
  });

  it("keeps the separator on the row that carries it (drawn after that row)", () => {
    const sales = visibleMenuItems(menu())[0].children ?? [];
    const separated = sales.filter((item) => item.menuSeparator).map((item) => item.label);
    expect(separated).toEqual(["Temp Credits", "Customers"]);
  });

  it("a hidden row keeps its grant, so its route is still governed by it", () => {
    const index = buildMenuPermissionIndex(menu());
    expect(index.byMenuId.get(106)?.canView).toBe(true);
    expect(index.byHref.get("/master/audit-logs")?.canEdit).toBe(true);
  });

  it("a shown parent whose rows are all hidden becomes a plain item", () => {
    const [group] = visibleMenuItems(
      buildPrimaryMenu(
        extractMenuMasterItems({
          data: [node(3, "&3 Inventory", "30.00", {}, [
            node(9004, "Gone", "1.00", { menuVisibility: false }),
          ])],
        }),
      ),
    );
    expect(group.label).toBe("Inventory");
    expect(group.children).toBeUndefined();
  });

  it("does not change the tree it was given", () => {
    const full = menu();
    visibleMenuItems(full);
    expect(full[1].children).toHaveLength(9);
    expect(full[1].children?.[5].children).toHaveLength(1);
  });
});
