import { describe, expect, it } from "vitest";
import {
  COPY_ACTION_TOOLTIP,
  COPY_REFUSAL_TITLE,
  copyHeadingNote,
  copyPrefillFromPayload,
  isSuperAdminRole,
  placeCopiedGrants,
  SUPER_ADMIN_COPY_REFUSAL,
} from "./copyUser";
import { LIVE_MENU_TREE_PAYLOAD, liveUserPayload } from "./fixtures";
import { NO_FLAGS } from "./grants";
import { parseMenuTree } from "./menuTree";
import { GRANT_FLAG_KEYS, type UserMenuPayload } from "./wire";

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });

function row(menuId: number, patch: Partial<UserMenuPayload> = {}): UserMenuPayload {
  return {
    umMenuId: menuId,
    ...Object.fromEntries(GRANT_FLAG_KEYS.map((key) => [key, false])),
    umVisibility: true,
    umIsFavourite: false,
    umIsPinned: false,
    umSortOrder: 0,
    ...patch,
  } as UserMenuPayload;
}

describe("isSuperAdminRole (Qt UserAdminEntry::isSuperAdminRole)", () => {
  it.each(["SUPER ADMIN", "super admin", "SUPER_ADMIN", "SuperAdmin", "superadmin", " SUPER  ADMIN ", "Super_Admin"])(
    "%j is a SUPER ADMIN",
    (value) => expect(isSuperAdminRole(value)).toBe(true),
  );

  it.each(["ADMIN", "SUPERVISOR", "", "SUPER", "HO FINANCE", "SUPER-ADMIN", "SUPER ADMINISTRATOR"])(
    "%j is not",
    (value) => expect(isSuperAdminRole(value)).toBe(false),
  );

  it("a value that is not text is not a SUPER ADMIN", () => {
    expect(isSuperAdminRole(null)).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
    expect(isSuperAdminRole(1)).toBe(false);
    expect(isSuperAdminRole(true)).toBe(false);
  });

  it("the words match Qt", () => {
    expect(COPY_REFUSAL_TITLE).toBe("Cannot copy");
    expect(SUPER_ADMIN_COPY_REFUSAL).toBe("A SUPER ADMIN's rights cannot be copied. Pick another user.");
    expect(COPY_ACTION_TOOLTIP).toBe("New user with the selected user's rights (not a SUPER ADMIN)");
    expect(copyHeadingNote("VKPOS", false)).toBe("New user — rights copied from VKPOS");
    expect(copyHeadingNote("VKPOS", true)).toBe("New user — could not copy the rights of VKPOS");
  });
});

describe("copyPrefillFromPayload — exactly menus + Allow Edit Date / Entry / Rate", () => {
  it("takes the three Allow Edit flags and no other Identity field", () => {
    const prefill = copyPrefillFromPayload(
      liveUserPayload({ usrEditDate: true, usrEditEntry: false, usrEditRate: true }),
    );
    expect(prefill.identity).toEqual({ editDate: true, editEntry: false, editRate: true });
  });

  it("an Allow Edit key the read lacks keeps the New default (not set)", () => {
    const prefill = copyPrefillFromPayload({ menus: [], usrEditEntry: true });
    expect(prefill.identity).toEqual({ editEntry: true });
  });

  it("a null flag reads false, as Qt's toBool does", () => {
    expect(copyPrefillFromPayload({ usrEditDate: null }).identity).toEqual({ editDate: false });
  });

  it("copies all eleven flags of each menu and drops umId, umUserId, favourite, pinned, sort order", () => {
    const source = row(11, {
      umCanView: true,
      umCanCreate: true,
      umCanEdit: false,
      umCanDelete: true,
      umCanPrint: true,
      umCanExport: false,
      umCanPost: true,
      umCanCancel: true,
      umCanAmend: false,
      umCanOverride: true,
      umCanRetender: false,
      umIsFavourite: true,
      umIsPinned: true,
      umSortOrder: 7,
      umId: "019e0000-0000-7000-8000-00000000aaaa",
      umUserId: "019e0000-0000-7000-8000-00000000bbbb",
      umCreatedOn: "2026-10-01T00:00:00.000Z",
      umCreatedBy: "019e0000-0000-7000-8000-00000000cccc",
    });
    const { grants } = copyPrefillFromPayload({ menus: [source] });
    expect([...grants.keys()]).toEqual([11]);
    const grant = grants.get(11)!;
    expect(grant).toEqual({
      menuId: 11,
      flags: {
        umCanView: true,
        umCanCreate: true,
        umCanEdit: false,
        umCanDelete: true,
        umCanPrint: true,
        umCanExport: false,
        umCanPost: true,
        umCanCancel: true,
        umCanAmend: false,
        umCanOverride: true,
        umCanRetender: false,
      },
      favourite: false,
      pinned: false,
      sortOrder: 0,
    });
    expect(JSON.stringify(grant)).not.toMatch(/umId|umUserId|umCreated|aaaa|bbbb|cccc/);
  });

  it("copies a menu only when umVisibility is true (Qt ticks the row from it)", () => {
    const { grants } = copyPrefillFromPayload({
      menus: [
        row(10, { umCanView: true }),
        row(18, { umCanView: true, umVisibility: false }),
        row(19, { umCanView: true, umVisibility: undefined }),
        row(20, { umCanView: true, umVisibility: null }),
      ],
    });
    expect([...grants.keys()]).toEqual([10]);
  });

  it("no menus, or a null list, copies none", () => {
    expect(copyPrefillFromPayload({}).grants.size).toBe(0);
    expect(copyPrefillFromPayload({ menus: null }).grants.size).toBe(0);
  });

  it("a whole live payload: one grant per visible row, nothing of the identity but the three", () => {
    const payload = liveUserPayload();
    const prefill = copyPrefillFromPayload(payload);
    expect(prefill.grants.size).toBe(payload.menus.filter((m) => m.umVisibility === true).length);
    expect(Object.keys(prefill.identity).sort()).toEqual(["editDate", "editEntry", "editRate"]);
  });
});

describe("placeCopiedGrants — the set as Qt's rights tree saves it", () => {
  it("drops a menu the tree does not carry", () => {
    const { grants } = copyPrefillFromPayload({ menus: [row(10, { umCanView: true }), row(99999, { umCanView: true })] });
    expect([...placeCopiedGrants(grants, tree).keys()]).toEqual([10]);
  });

  it("keeps a posting right where the menu has the verb, drops it where it does not", () => {
    // 11 Sales Order: POST/CANCEL/AMEND/OVERRIDE, no RETENDER. 10 Customers: CRUD only.
    expect(tree.byId.get(11)?.verbs.has("POST")).toBe(true);
    expect(tree.byId.get(11)?.verbs.has("RETENDER")).toBe(false);
    expect(tree.byId.get(10)?.verbs.has("POST")).toBe(false);
    const all = Object.fromEntries(GRANT_FLAG_KEYS.map((key) => [key, true]));
    const { grants } = copyPrefillFromPayload({ menus: [row(11, all), row(10, all)] });
    const placed = placeCopiedGrants(grants, tree);
    expect(placed.get(11)!.flags).toEqual({ ...Object.fromEntries(GRANT_FLAG_KEYS.map((k) => [k, true])), umCanRetender: false });
    expect(placed.get(10)!.flags).toEqual({
      ...NO_FLAGS,
      umCanView: true,
      umCanCreate: true,
      umCanEdit: true,
      umCanDelete: true,
      umCanPrint: true,
      umCanExport: true,
    });
  });

  it("keeps a stale CRUD flag as copied (Qt sends the six CRUD flags as ticked)", () => {
    // 249 Stock Track Policy has VIEW and PRINT only.
    expect([...(tree.byId.get(249)?.verbs ?? [])].sort()).toEqual(["PRINT", "VIEW"]);
    const { grants } = copyPrefillFromPayload({ menus: [row(249, { umCanView: true, umCanCreate: true })] });
    expect(placeCopiedGrants(grants, tree).get(249)!.flags.umCanCreate).toBe(true);
  });

  it("does not change the map it is given", () => {
    const { grants } = copyPrefillFromPayload({ menus: [row(10, { umCanPost: true })] });
    placeCopiedGrants(grants, tree);
    expect(grants.get(10)!.flags.umCanPost).toBe(true);
  });
});
