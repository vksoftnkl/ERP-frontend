import { describe, expect, it } from "vitest";
import { LIVE_MENU_TREE_PAYLOAD } from "./fixtures";
import {
  CRUD_VERBS,
  menuLabel,
  parentIds,
  parseMenuTree,
  subtreeIds,
  verbsOf,
  visibleRows,
} from "./menuTree";

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });

describe("parseMenuTree", () => {
  // The box has 125 visible, active menus, but 38 of them hang under a hidden
  // parent and the server's tree builder never reaches them — so the live
  // response, and this fixture, carry 87. A grant on one of the 38 is exactly
  // the "outside the tree" case the grants tests cover.
  const LIVE_NODE_COUNT = 87;

  it("parses the live node shape: 7 roots, every node a row, parents first", () => {
    expect(tree.roots.map((root) => root.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tree.rows.length).toBe(LIVE_NODE_COUNT);
    expect(tree.byId.size).toBe(LIVE_NODE_COUNT);
    // Pre-order: a child always follows its parent.
    const seen = new Set<number>();
    for (const node of tree.rows) {
      if (node.parentId !== null) expect(seen.has(node.parentId)).toBe(true);
      seen.add(node.id);
    }
    expect(tree.byId.get(10)?.parentId).toBe(1);
    expect(tree.byId.get(10)?.depth).toBe(1);
  });

  it("accepts a bare array, the {data} envelope and {data:{items}}", () => {
    expect(parseMenuTree(LIVE_MENU_TREE_PAYLOAD).rows.length).toBe(LIVE_NODE_COUNT);
    expect(parseMenuTree({ data: { items: LIVE_MENU_TREE_PAYLOAD } }).rows.length).toBe(LIVE_NODE_COUNT);
    expect(parseMenuTree(null).rows).toEqual([]);
    expect(parseMenuTree({ data: "nope" }).rows).toEqual([]);
  });

  it("keeps the first row of a menu id seen twice", () => {
    const dup = parseMenuTree([
      { menuId: 5, menuName: "First", menuVerbs: ["VIEW"] },
      { menuId: 5, menuName: "Second", menuVerbs: ["VIEW", "POST"] },
    ]);
    expect(dup.rows.length).toBe(1);
    expect(dup.byId.get(5)?.name).toBe("First");
  });

  it("gives a node without menuVerbs the six CRUD verbs", () => {
    const older = parseMenuTree([
      { menuId: 900, menuName: "Old Row" },
      { menuId: 901, menuName: "Null Verbs", menuVerbs: null },
      { menuId: 902, menuName: "Empty Verbs", menuVerbs: [] },
    ]);
    for (const id of [900, 901, 902]) {
      expect([...older.byId.get(id)!.verbs].sort()).toEqual([...CRUD_VERBS].sort());
    }
  });

  it("has RETENDER on menu 12 (Sales Entry) and nowhere else", () => {
    const withRetender = tree.rows.filter((node) => node.verbs.has("RETENDER"));
    expect(withRetender.map((node) => node.id)).toEqual([12]);
    expect(tree.byId.get(12)?.label).toBe("Sales Entry");
  });

  it("reads the two read-only screens as VIEW + PRINT only", () => {
    expect([...tree.byId.get(249)!.verbs].sort()).toEqual(["PRINT", "VIEW"]);
    expect([...tree.byId.get(250)!.verbs].sort()).toEqual(["PRINT", "VIEW"]);
  });
});

describe("verbsOf", () => {
  it("forgives case, drops unknown words, and falls back to CRUD when nothing is left", () => {
    expect([...verbsOf(["view", "Post", "FLY"])].sort()).toEqual(["POST", "VIEW"]);
    expect([...verbsOf(["FLY"])].sort()).toEqual([...CRUD_VERBS].sort());
    expect([...verbsOf("VIEW")].sort()).toEqual([...CRUD_VERBS].sort());
  });
});

describe("menuLabel", () => {
  it("strips the Qt mnemonic and unescapes &&", () => {
    expect(menuLabel("&1 Sales")).toBe("Sales");
    expect(menuLabel("&7 Settings")).toBe("Settings");
    expect(menuLabel("Profit && Loss")).toBe("Profit & Loss");
    expect(menuLabel("&File")).toBe("File");
    expect(menuLabel("Customers")).toBe("Customers");
    expect(tree.byId.get(1)?.label).toBe("Sales");
  });
});

describe("subtreeIds / parentIds", () => {
  it("lists the node and everything under it", () => {
    const sales = tree.byId.get(1)!;
    const ids = subtreeIds(sales);
    expect(ids[0]).toBe(1);
    expect(ids).toContain(10);
    expect(ids).toContain(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(subtreeIds(tree.byId.get(10)!)).toEqual([10]);
  });

  it("names every node that has children", () => {
    const parents = parentIds(tree);
    expect(parents).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7]));
    expect(parents).not.toContain(10);
  });
});

describe("visibleRows", () => {
  it("shows everything, parents before children, when nothing is folded", () => {
    expect(visibleRows(tree).map((node) => node.id)).toEqual(tree.rows.map((node) => node.id));
  });

  it("hides a collapsed node's subtree and nothing else", () => {
    const rows = visibleRows(tree, { collapsed: new Set([1]) });
    expect(rows.map((node) => node.id)).toContain(1);
    expect(rows.map((node) => node.id)).not.toContain(10);
    expect(rows.length).toBe(tree.rows.length - (subtreeIds(tree.byId.get(1)!).length - 1));
  });

  it("narrows by label, keeps the ancestors of a match, and ignores the fold", () => {
    const rows = visibleRows(tree, { collapsed: new Set([1, 2, 3, 4, 5, 6, 7]), filter: "ledger mapping" });
    const ids = rows.map((node) => node.id);
    expect(ids).toContain(250);
    const target = tree.byId.get(250)!;
    let parent = target.parentId;
    while (parent !== null) {
      expect(ids).toContain(parent);
      parent = tree.byId.get(parent)!.parentId;
    }
    expect(ids).not.toContain(10);
    expect(rows.every((node) => node.label.toLowerCase().includes("ledger mapping") || node.children.length > 0)).toBe(true);
  });

  it("matches deep in a later sibling", () => {
    const small = parseMenuTree([
      {
        menuId: 1,
        menuName: "Root",
        children: [
          { menuId: 2, menuName: "First child" },
          { menuId: 3, menuName: "Second", children: [{ menuId: 4, menuName: "Needle" }] },
        ],
      },
    ]);
    expect(visibleRows(small, { filter: "needle" }).map((node) => node.id)).toEqual([1, 3, 4]);
  });
});
