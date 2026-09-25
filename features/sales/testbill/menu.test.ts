/**
 * Sale Bill — navigation wiring. The header menu is SERVER-driven
 * (`fixed.menu_master` via /menu-masters), and hrefs are attached to it by
 * normalized-label match against `DEFAULT_PRIMARY_MENU`. The live tree names
 * the entry "Sales Entry" — menu 12, a direct child of "&1 Sales", with
 * Ctrl+S — so this test feeds `applyMenuMasterLabels` a payload shaped exactly
 * like the DB and asserts the item comes out clickable.
 *
 * It matters more here than on either sibling. "Sales Entry" is the label the
 * DB has always carried and the local list pointed it at `/dashboard` until this
 * screen existed, so the failure mode is not a dead link — it is a link that
 * silently still goes somewhere plausible. A rename in either place breaks it
 * quietly in the UI; here it breaks a test.
 */
import { describe, expect, it } from "vitest";
import {
  applyMenuMasterLabels,
  DEFAULT_PRIMARY_MENU,
  extractMenuMasterItems,
} from "@/components/layout/constants";
import type { ErpHeaderItem } from "@/components/layout/types";

/** The live rows, as `fixed.menu_master` carries them. */
const DB_MENU_PAYLOAD = {
  data: [
    {
      menuId: 1,
      menuName: "&1 Sales",
      children: [
        { menuId: 14, menuName: "Quotation" },
        { menuId: 11, menuName: "Sales Order" },
        { menuId: 12, menuName: "Sales Entry" },
        { menuId: 13, menuName: "Sales Return" },
        { menuId: 226, menuName: "Bill Delivery Update" },
        { menuId: 257, menuName: "Temp Credits" },
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

function resolved(): ErpHeaderItem[] {
  return applyMenuMasterLabels(DEFAULT_PRIMARY_MENU, extractMenuMasterItems(DB_MENU_PAYLOAD));
}

describe("sale bill menu wiring", () => {
  it("the DB's 'Sales Entry' item resolves to /sales/sale-bill", () => {
    expect(findByLabel(resolved(), "Sales Entry")?.href).toBe("/sales/sale-bill");
  });

  it("does not still point at the dashboard placeholder", () => {
    // What it was before this screen existed. Worth its own assertion because a
    // stale href here is a working link to the wrong page, which nobody reports.
    expect(findByLabel(resolved(), "Sales Entry")?.href).not.toBe("/dashboard");
  });

  it("leaves its siblings alone, as a canary for the matching itself", () => {
    const menu = resolved();
    expect(findByLabel(menu, "Quotation")?.href).toBe("/sales/quotation");
    expect(findByLabel(menu, "Sales Order")?.href).toBe("/sales/sale-order");
  });

  it("the two registers the bill owns resolve to their routes (§24)", () => {
    expect(findByLabel(resolved(), "Bill Delivery Update")?.href).toBe("/sales/bill-delivery");
    expect(findByLabel(resolved(), "Temp Credits")?.href).toBe("/sales/temp-credits");
  });

  it("leaves 'Sales Return' unlinked — that screen is not built", () => {
    // The item is in the DB tree and in the local list, with no href. A link
    // appearing here would mean somebody pointed it at a page by accident.
    const salesReturn = findByLabel(resolved(), "Sales Return");
    expect(salesReturn).not.toBeNull();
    expect(salesReturn?.href).toBeUndefined();
  });
});
