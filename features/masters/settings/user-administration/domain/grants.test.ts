import { describe, expect, it } from "vitest";
import { LIVE_MENU_TREE_PAYLOAD, LIVE_USER_MENUS } from "./fixtures";
import {
  copyGrantsFrom,
  countGrants,
  EMPTY_GRANTS,
  grantEverything,
  grantNothing,
  grantsFromPayload,
  sameGrants,
  setAllVerbsOnMenu,
  setFlag,
  setVerbOnRows,
  tickMenu,
  toMenusPayload,
  verbColumnState,
  withAncestorsTicked,
  type Grant,
  type Grants,
} from "./grants";
import { parseMenuTree, type MenuNode, type MenuVerb } from "./menuTree";
import { GRANT_FLAG_KEYS, type UserMenuPayload } from "./wire";

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });
const loaded = grantsFromPayload(LIVE_USER_MENUS);

/** A grant on a menu the visible tree does not carry (menu 8, "&8 Transport", is hidden). */
const HIDDEN_MENU_ROW: UserMenuPayload = {
  umMenuId: 8,
  umCanView: true,
  umCanPrint: true,
  umIsFavourite: true,
  umIsPinned: true,
  umSortOrder: 3,
};

function withHidden(grants: Grants): Grants {
  return new Map([...grants, ...grantsFromPayload([HIDDEN_MENU_ROW])]);
}

const PAYLOAD_KEYS = [
  "umMenuId",
  ...GRANT_FLAG_KEYS,
  "umVisibility",
  "umIsFavourite",
  "umIsPinned",
  "umSortOrder",
].sort();

describe("grantsFromPayload", () => {
  it("ticks exactly the rows the payload lists", () => {
    expect(loaded.size).toBe(LIVE_USER_MENUS.length);
    for (const row of LIVE_USER_MENUS) {
      const grant = loaded.get(row.umMenuId);
      expect(grant).toBeDefined();
      for (const key of GRANT_FLAG_KEYS) expect(grant!.flags[key]).toBe(row[key] === true);
    }
    expect(loaded.has(8)).toBe(false);
  });

  it("reads favourite, pinned and sort order, defaulting what is missing", () => {
    const grants = grantsFromPayload([
      HIDDEN_MENU_ROW,
      { umMenuId: 10 },
      { umMenuId: 11, umSortOrder: "7" },
      { umMenuId: 0 },
    ]);
    expect(grants.get(8)).toMatchObject({ favourite: true, pinned: true, sortOrder: 3 });
    expect(grants.get(10)).toMatchObject({ favourite: false, pinned: false, sortOrder: 0 });
    expect(grants.get(11)?.sortOrder).toBe(7);
    expect(grants.has(0)).toBe(false);
    expect(grantsFromPayload(null).size).toBe(0);
  });
});

describe("tickMenu", () => {
  it("cascades a parent's column 0 to its children's column 0 only", () => {
    const sales = tree.byId.get(1)!;
    const next = tickMenu(EMPTY_GRANTS, tree, sales, true, EMPTY_GRANTS);
    expect(next.has(1)).toBe(true);
    expect(next.has(10)).toBe(true);
    expect(next.has(12)).toBe(true);
    for (const grant of next.values()) {
      for (const key of GRANT_FLAG_KEYS) expect(grant.flags[key]).toBe(false);
    }
    // Only the subtree.
    expect(next.has(2)).toBe(false);
  });

  it("leaves a child already in the set with its flags intact", () => {
    const start = setFlag(EMPTY_GRANTS, tree, 12, "umCanPost", true, EMPTY_GRANTS);
    const next = tickMenu(start, tree, tree.byId.get(1)!, true, EMPTY_GRANTS);
    expect(next.get(12)?.flags.umCanPost).toBe(true);
  });

  it("unticking removes the whole subtree and nothing outside it", () => {
    const start = withHidden(loaded);
    const next = tickMenu(start, tree, tree.byId.get(1)!, false, loaded);
    expect(next.has(1)).toBe(false);
    expect(next.has(12)).toBe(false);
    expect(next.has(8)).toBe(true);
    expect(next.has(249)).toBe(loaded.has(249));
  });

  it("re-ticking a menu restores the user's own favourite / pinned / sort order", () => {
    const start = withHidden(loaded);
    const hidden: MenuNode = {
      id: 8,
      parentId: null,
      name: "x",
      label: "x",
      depth: 0,
      verbs: new Set<MenuVerb>(),
      hidden: true,
      children: [],
    };
    const unticked = tickMenu(start, tree, hidden, false, start);
    const reticked = tickMenu(unticked, tree, hidden, true, start);
    expect(reticked.get(8)).toMatchObject({ favourite: true, pinned: true, sortOrder: 3 });
    expect(reticked.get(8)?.flags.umCanView).toBe(false);
  });
});

describe("groups follow their children (Qt 6f15977)", () => {
  //  1 Root            6 Other
  //  ├ 2 Group           └ 7 Screen C
  //  │ ├ 3 Screen A1
  //  │ └ 4 Screen A2
  //  └ 5 Screen B
  const small = parseMenuTree([
    {
      menuId: 1,
      menuName: "Root",
      children: [
        {
          menuId: 2,
          menuName: "Group",
          children: [
            { menuId: 3, menuName: "Screen A1" },
            { menuId: 4, menuName: "Screen A2" },
          ],
        },
        { menuId: 5, menuName: "Screen B" },
      ],
    },
    { menuId: 6, menuName: "Other", children: [{ menuId: 7, menuName: "Screen C" }] },
  ]);
  const at = (id: number) => small.byId.get(id)!;
  const ids = (grants: Grants) => [...grants.keys()].sort((a, b) => a - b);
  /** A grant on a menu this tree does not carry. */
  const outside = grantsFromPayload([{ umMenuId: 99, umCanView: true }]);

  it("a right ticked on an unticked row ticks the row and every group above it", () => {
    const next = setFlag(EMPTY_GRANTS, small, 3, "umCanEdit", true, EMPTY_GRANTS);
    expect(ids(next)).toEqual([1, 2, 3]);
    expect(next.get(3)?.flags.umCanEdit).toBe(true);
    // A group comes in as a row only — no right is granted on it.
    for (const id of [1, 2]) {
      for (const key of GRANT_FLAG_KEYS) expect(next.get(id)!.flags[key]).toBe(false);
    }
  });

  it("a right unticked on a row outside the set changes nothing", () => {
    const start = tickMenu(EMPTY_GRANTS, small, at(5), true, EMPTY_GRANTS);
    expect(setFlag(start, small, 3, "umCanEdit", false, EMPTY_GRANTS)).toBe(start);
  });

  it("a ticked row ticks its groups; unticking the last ticked child unticks them, up the chain", () => {
    let grants = tickMenu(EMPTY_GRANTS, small, at(3), true, EMPTY_GRANTS);
    grants = tickMenu(grants, small, at(5), true, EMPTY_GRANTS);
    expect(ids(grants)).toEqual([1, 2, 3, 5]);
    // Group 2 had only 3; Root still has 5.
    grants = tickMenu(grants, small, at(3), false, EMPTY_GRANTS);
    expect(ids(grants)).toEqual([1, 5]);
    // Root's last ticked child goes: so does Root.
    grants = tickMenu(grants, small, at(5), false, EMPTY_GRANTS);
    expect(ids(grants)).toEqual([]);
  });

  it("a group with another ticked child stays ticked", () => {
    let grants = tickMenu(EMPTY_GRANTS, small, at(3), true, EMPTY_GRANTS);
    grants = tickMenu(grants, small, at(4), true, EMPTY_GRANTS);
    grants = tickMenu(grants, small, at(3), false, EMPTY_GRANTS);
    expect(ids(grants)).toEqual([1, 2, 4]);
  });

  it("a group still cascades to all its children, and the groups above it follow", () => {
    const ticked = tickMenu(EMPTY_GRANTS, small, at(2), true, EMPTY_GRANTS);
    expect(ids(ticked)).toEqual([1, 2, 3, 4]);
    const unticked = tickMenu(ticked, small, at(2), false, EMPTY_GRANTS);
    expect(ids(unticked)).toEqual([]);
  });

  it("the row menu's 'all' / 'none' tick the row's groups too", () => {
    expect(ids(setAllVerbsOnMenu(EMPTY_GRANTS, small, at(7), true, EMPTY_GRANTS))).toEqual([6, 7]);
    expect(ids(setAllVerbsOnMenu(EMPTY_GRANTS, small, at(7), false, EMPTY_GRANTS))).toEqual([6, 7]);
  });

  it("a group put back takes the user's own favourite / pinned / sort order", () => {
    const loadedPrefs = grantsFromPayload([{ umMenuId: 2, umIsFavourite: true, umIsPinned: true, umSortOrder: 4 }]);
    const next = setFlag(EMPTY_GRANTS, small, 3, "umCanView", true, loadedPrefs);
    expect(next.get(2)).toMatchObject({ favourite: true, pinned: true, sortOrder: 4 });
  });

  it("never touches a grant outside the tree", () => {
    let grants = tickMenu(outside, small, at(3), true, outside);
    grants = tickMenu(grants, small, at(3), false, outside);
    expect(ids(grants)).toEqual([99]);
    expect(grants.get(99)).toBe(outside.get(99));
  });

  it("on the live tree: a right on Sales Entry ticks Sales", () => {
    const next = setFlag(EMPTY_GRANTS, tree, 12, "umCanPost", true, EMPTY_GRANTS);
    expect(ids(next)).toEqual([1, 12]);
  });
});

describe("withAncestorsTicked (on load)", () => {
  const small = parseMenuTree([
    {
      menuId: 1,
      menuName: "Root",
      children: [{ menuId: 2, menuName: "Group", children: [{ menuId: 3, menuName: "Screen" }] }],
    },
    { menuId: 4, menuName: "Group alone", children: [{ menuId: 5, menuName: "Unticked" }] },
  ]);

  it("puts back every group of a screen granted without them, and leaves the screen's rights", () => {
    const loadedSet = grantsFromPayload([
      { umMenuId: 3, umCanView: true, umCanEdit: true },
      { umMenuId: 1, umIsFavourite: true },
    ]);
    const next = withAncestorsTicked(loadedSet, small, loadedSet);
    expect([...next.keys()].sort()).toEqual([1, 2, 3]);
    expect(next.get(3)).toBe(loadedSet.get(3));
    expect(next.get(1)).toBe(loadedSet.get(1));
    expect(next.get(2)?.flags.umCanView).toBe(false);
  });

  it("only adds: a group granted on its own stays, and a complete set comes back as the same map", () => {
    const groupAlone = grantsFromPayload([{ umMenuId: 4 }]);
    expect(withAncestorsTicked(groupAlone, small, groupAlone)).toBe(groupAlone);
    const complete = grantsFromPayload([{ umMenuId: 1 }, { umMenuId: 2 }, { umMenuId: 3 }]);
    expect(withAncestorsTicked(complete, small, complete)).toBe(complete);
  });

  it("leaves a grant outside the tree alone, and the live fixture user is already whole", () => {
    const hiddenOnly = grantsFromPayload([HIDDEN_MENU_ROW]);
    expect(withAncestorsTicked(hiddenOnly, tree, hiddenOnly)).toBe(hiddenOnly);
    expect(withAncestorsTicked(loaded, tree, loaded)).toBe(loaded);
  });
});

describe("setFlag / setAllVerbsOnMenu / setVerbOnRows", () => {
  it("ticking a verb on a menu not yet in the set puts it in the set", () => {
    const next = setFlag(EMPTY_GRANTS, tree, 10, "umCanEdit", true, EMPTY_GRANTS);
    expect(next.get(10)?.flags.umCanEdit).toBe(true);
    expect(next.get(10)?.flags.umCanView).toBe(false);
  });

  it("a row's 'all verbs' ticks only the verbs the menu has", () => {
    const next = setAllVerbsOnMenu(EMPTY_GRANTS, tree, tree.byId.get(249)!, true, EMPTY_GRANTS);
    const flags = next.get(249)!.flags;
    expect(flags.umCanView).toBe(true);
    expect(flags.umCanPrint).toBe(true);
    expect(flags.umCanCreate).toBe(false);
    expect(flags.umCanRetender).toBe(false);
  });

  it("a row's 'none' keeps the menu in the set and a stale flag untouched", () => {
    const next = setAllVerbsOnMenu(loaded, tree, tree.byId.get(249)!, false, loaded);
    expect(next.has(249)).toBe(true);
    expect(next.get(249)?.flags.umCanView).toBe(false);
    // CREATE is not a verb of 249; the stale true from the box is not this screen's to clear.
    expect(next.get(249)?.flags.umCanCreate).toBe(true);
  });

  it("a header click reaches only rows in the set that have the verb", () => {
    const start = tickMenu(EMPTY_GRANTS, tree, tree.byId.get(1)!, true, EMPTY_GRANTS);
    const next = setVerbOnRows(start, tree.rows, "RETENDER", true);
    const retendered = [...next.values()].filter((grant) => grant.flags.umCanRetender);
    expect(retendered.map((grant) => grant.menuId)).toEqual([12]);
    // Rows outside the set were not pulled in.
    expect(next.size).toBe(start.size);
    expect(verbColumnState(next, tree.rows, "RETENDER")).toBe("all");
    expect(verbColumnState(next, tree.rows, "VIEW")).toBe("none");
    const someView = setFlag(next, tree, 10, "umCanView", true, EMPTY_GRANTS);
    expect(verbColumnState(someView, tree.rows, "VIEW")).toBe("some");
  });
});

describe("grantEverything / grantNothing / countGrants", () => {
  it("All ticks every existing cell in the tree and skips the cells verb gating removed", () => {
    const all = grantEverything(EMPTY_GRANTS, tree, EMPTY_GRANTS);
    expect(all.size).toBe(tree.rows.length);
    const retendered = [...all.values()].filter((grant) => grant.flags.umCanRetender);
    expect(retendered.map((grant) => grant.menuId)).toEqual([12]);
    expect(all.get(249)?.flags.umCanCreate).toBe(false);
    expect(all.get(10)?.flags.umCanPost).toBe(false);
    expect(all.get(12)?.flags.umCanPost).toBe(true);
  });

  it("None removes every tree row and keeps a grant the tree does not show", () => {
    const none = grantNothing(withHidden(loaded), tree);
    expect(none.size).toBe(1);
    expect(none.has(8)).toBe(true);
  });

  it("counts ticked / total and the grants outside the tree", () => {
    expect(countGrants(withHidden(loaded), tree)).toEqual({
      ticked: loaded.size,
      total: tree.rows.length,
      outsideTree: 1,
    });
  });
});

describe("copyGrantsFrom", () => {
  it("takes the other user's menus and flags, and this user's own favourite / pinned / sort order", () => {
    const source = grantEverything(EMPTY_GRANTS, tree, EMPTY_GRANTS);
    const copied = copyGrantsFrom(source, withHidden(loaded));
    expect(copied.size).toBe(source.size);
    expect(copied.get(12)?.flags.umCanRetender).toBe(true);
    expect(copied.has(8)).toBe(false);
    const withHiddenSource = new Map(source);
    withHiddenSource.set(8, { menuId: 8, flags: source.get(10)!.flags, favourite: false, pinned: false, sortOrder: 0 });
    const copied2 = copyGrantsFrom(withHiddenSource, withHidden(loaded));
    expect(copied2.get(8)).toMatchObject({ favourite: true, pinned: true, sortOrder: 3 });
  });
});

describe("toMenusPayload", () => {
  it("lists only the menus in the set, sorted, each with every key of SaveUserMenuDto", () => {
    const payload = toMenusPayload(withHidden(loaded));
    expect(payload.length).toBe(loaded.size + 1);
    expect(payload.map((row) => row.umMenuId)).toEqual(
      [...payload.map((row) => row.umMenuId)].sort((a, b) => a - b),
    );
    for (const row of payload) {
      expect(Object.keys(row).sort()).toEqual(PAYLOAD_KEYS);
      expect(row.umVisibility).toBe(true);
    }
  });

  it("sends favourite / pinned / sort order back as loaded", () => {
    const payload = toMenusPayload(withHidden(loaded));
    const hidden = payload.find((row) => row.umMenuId === 8)!;
    expect(hidden).toMatchObject({ umIsFavourite: true, umIsPinned: true, umSortOrder: 3 });
    const plain = payload.find((row) => row.umMenuId === 10)!;
    expect(plain).toMatchObject({ umIsFavourite: false, umIsPinned: false, umSortOrder: 0 });
  });

  it("a stale grant on a verb the menu lacks survives a round trip unchanged", () => {
    // Menu 249 (VIEW, PRINT) holds CREATE / EDIT / DELETE / EXPORT on the box.
    const edited = setFlag(loaded, tree, 10, "umCanExport", true, loaded);
    const row = toMenusPayload(edited).find((entry) => entry.umMenuId === 249)!;
    expect(row.umCanCreate).toBe(true);
    expect(row.umCanEdit).toBe(true);
    expect(row.umCanDelete).toBe(true);
    expect(row.umCanExport).toBe(true);
    expect(row.umCanPost).toBe(false);
  });

  it("sends a verb the menu lacks as false unless it was a stale true", () => {
    const fresh = setAllVerbsOnMenu(EMPTY_GRANTS, tree, tree.byId.get(250)!, true, EMPTY_GRANTS);
    // Its groups (60, 7) came along with their own rows; 250's is the one asked about.
    const row = toMenusPayload(fresh).find((entry) => entry.umMenuId === 250)!;
    expect(row.umCanView).toBe(true);
    expect(row.umCanPrint).toBe(true);
    expect(row.umCanCreate).toBe(false);
    expect(row.umCanRetender).toBe(false);
  });

  it("round-trips the live payload byte for byte on the flags", () => {
    const payload = toMenusPayload(loaded);
    for (const row of LIVE_USER_MENUS) {
      const sent = payload.find((entry) => entry.umMenuId === row.umMenuId)!;
      for (const key of GRANT_FLAG_KEYS) expect(sent[key]).toBe(row[key] === true);
      expect(sent.umIsFavourite).toBe(row.umIsFavourite === true);
      expect(sent.umIsPinned).toBe(row.umIsPinned === true);
      expect(sent.umSortOrder).toBe(Number(row.umSortOrder ?? 0));
    }
  });
});

describe("sameGrants", () => {
  it("compares the whole set, flags and the user's own columns included", () => {
    expect(sameGrants(loaded, grantsFromPayload(LIVE_USER_MENUS))).toBe(true);
    expect(sameGrants(loaded, setFlag(loaded, tree, 10, "umCanView", !loaded.get(10)!.flags.umCanView, loaded))).toBe(false);
    const pinned = new Map(loaded);
    const grant: Grant = { ...loaded.get(10)!, pinned: true };
    pinned.set(10, grant);
    expect(sameGrants(loaded, pinned)).toBe(false);
    expect(sameGrants(loaded, withHidden(loaded))).toBe(false);
  });
});
