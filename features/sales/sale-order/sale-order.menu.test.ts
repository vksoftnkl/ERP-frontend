/**
 * Sale Order — navigation wiring. The header menu is SERVER-driven
 * (`fixed.menu_master` via /menu-masters), and hrefs are attached to it by
 * normalized-label match against `DEFAULT_PRIMARY_MENU`. The live tree names
 * the entry "Sales Order" — singular, a direct child of "&1 Sales" (menu 11) —
 * so this test feeds `applyMenuMasterLabels` a payload shaped exactly like the
 * DB and asserts the item comes out clickable. A rename in either place breaks
 * the link silently in the UI; here it breaks a test.
 */
import { describe, expect, it } from "vitest";
import {
  applyMenuMasterLabels,
  DEFAULT_PRIMARY_MENU,
  extractMenuMasterItems,
} from "@/components/layout/constants";
import type { ErpHeaderItem } from "@/components/layout/types";

/** The live rows, as `fixed.menu_master` carries them (2026-08-12). */
const DB_MENU_PAYLOAD = {
  data: [
    {
      menuId: 1,
      menuName: "&1 Sales",
      children: [
        { menuId: 14, menuName: "Quotation" },
        { menuId: 11, menuName: "Sales Order" },
        { menuId: 172, menuName: "SO Management" },
      ],
    },
  ],
};

function findByLabel(items: ErpHeaderItem[], label: string): ErpHeaderItem | null {
  for (const item of items) {
    if (item.label === label) {
      return item;
    }
    const child = item.children ? findByLabel(item.children, label) : null;
    if (child) {
      return child;
    }
  }
  return null;
}

describe("sale order menu wiring", () => {
  it("the DB's 'Sales Order' item resolves to /sales/sale-order", () => {
    const menu = applyMenuMasterLabels(
      DEFAULT_PRIMARY_MENU,
      extractMenuMasterItems(DB_MENU_PAYLOAD),
    );
    const saleOrder = findByLabel(menu, "Sales Order");
    expect(saleOrder).not.toBeNull();
    expect(saleOrder?.href).toBe("/sales/sale-order");
  });

  it("the quotation item still resolves, as a canary for the matching itself", () => {
    const menu = applyMenuMasterLabels(
      DEFAULT_PRIMARY_MENU,
      extractMenuMasterItems(DB_MENU_PAYLOAD),
    );
    expect(findByLabel(menu, "Quotation")?.href).toBe("/sales/quotation");
  });
});
