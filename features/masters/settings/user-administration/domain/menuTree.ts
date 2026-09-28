/**
 * The menu tree as the permissions grid sees it — `/menu-masters/get` parsed
 * into rows, with each menu's verbs decided once.
 *
 * No React, no fetch. `parseMenuTree` takes the raw response and everything
 * else works on the `MenuTree` it returns.
 */
import type { MenuTreeNodePayload } from "./wire";

export const MENU_VERBS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "PRINT",
  "EXPORT",
  "POST",
  "CANCEL",
  "AMEND",
  "OVERRIDE",
  "RETENDER",
] as const;

export type MenuVerb = (typeof MENU_VERBS)[number];

/** What a menu row without `menuVerbs` (an older row) is taken to have. */
export const CRUD_VERBS: readonly MenuVerb[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "PRINT",
  "EXPORT",
];

const KNOWN_VERBS: ReadonlySet<string> = new Set(MENU_VERBS);

export type MenuNode = {
  id: number;
  parentId: number | null;
  /** The name as stored — `&1 Sales`, `Profit && Loss`. */
  name: string;
  /** The name to paint — the Qt mnemonic stripped. */
  label: string;
  depth: number;
  /**
   * The verbs this menu has. A cell exists in the grid only for a verb in
   * here: a verb the menu lacks gets no checkbox at all, because an unchecked
   * box says "denied", which is a different statement from "this screen has
   * nothing to post".
   */
  verbs: ReadonlySet<MenuVerb>;
  children: MenuNode[];
};

export type MenuTree = {
  roots: MenuNode[];
  /** Every node, parents before their children, in menu order. */
  rows: MenuNode[];
  byId: ReadonlyMap<number, MenuNode>;
};

export const EMPTY_MENU_TREE: MenuTree = { roots: [], rows: [], byId: new Map() };

/**
 * The verbs of one menu. Unknown words are dropped, case is forgiven, and a
 * missing or empty list means the six CRUD verbs — the shape of every row
 * that predates the column.
 */
export function verbsOf(raw: unknown): Set<MenuVerb> {
  const verbs = new Set<MenuVerb>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== "string") continue;
      const verb = entry.trim().toUpperCase();
      if (KNOWN_VERBS.has(verb)) verbs.add(verb as MenuVerb);
    }
  }
  return verbs.size > 0 ? verbs : new Set(CRUD_VERBS);
}

/**
 * `&1 Sales` → `Sales`, `Profit && Loss` → `Profit & Loss`. The `&` is a Qt
 * mnemonic marker on the desktop menu; here it is noise.
 */
export function menuLabel(name: string): string {
  return name
    .replace(/^&\d+\s*/, "")
    .replace(/&&/g, "\u0000")
    .replace(/&/g, "")
    .replace(/\u0000/g, "&")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The array of roots, wherever the envelope put it. */
function rootPayloads(payload: unknown): MenuTreeNodePayload[] {
  if (Array.isArray(payload)) return payload as MenuTreeNodePayload[];
  if (!isRecord(payload)) return [];
  const data = payload.data;
  if (Array.isArray(data)) return data as MenuTreeNodePayload[];
  if (isRecord(data) && Array.isArray(data.items)) return data.items as MenuTreeNodePayload[];
  if (Array.isArray(payload.items)) return payload.items as MenuTreeNodePayload[];
  return [];
}

function toMenuId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

/** Parses the live response shape. A menu id seen twice keeps its first row. */
export function parseMenuTree(payload: unknown): MenuTree {
  const rows: MenuNode[] = [];
  const byId = new Map<number, MenuNode>();

  const build = (
    raw: MenuTreeNodePayload,
    parentId: number | null,
    depth: number,
  ): MenuNode | null => {
    const id = toMenuId(raw?.menuId);
    if (id === null || byId.has(id)) return null;
    const name = typeof raw.menuName === "string" ? raw.menuName : `#${id}`;
    const node: MenuNode = {
      id,
      parentId,
      name,
      label: menuLabel(name) || name,
      depth,
      verbs: verbsOf(raw.menuVerbs),
      children: [],
    };
    byId.set(id, node);
    rows.push(node);
    for (const child of Array.isArray(raw.children) ? raw.children : []) {
      const built = build(child, id, depth + 1);
      if (built) node.children.push(built);
    }
    return node;
  };

  const roots: MenuNode[] = [];
  for (const raw of rootPayloads(payload)) {
    const built = build(raw, null, 0);
    if (built) roots.push(built);
  }
  return { roots, rows, byId };
}

/** The node and everything under it, parents first. */
export function subtreeIds(node: MenuNode): number[] {
  const ids: number[] = [];
  const walk = (current: MenuNode) => {
    ids.push(current.id);
    current.children.forEach(walk);
  };
  walk(node);
  return ids;
}

/** Every node with children — what "collapse all" folds. */
export function parentIds(tree: MenuTree): number[] {
  return tree.rows.filter((node) => node.children.length > 0).map((node) => node.id);
}

/**
 * The rows the grid paints, in order.
 *
 * With a filter, a row is shown when its own label matches or any descendant's
 * does — so a match is always reachable through its ancestors — and the
 * collapse state is ignored, because a fold that hides a match is a filter
 * that lies. Without one, a collapsed node hides its subtree.
 */
export function visibleRows(
  tree: MenuTree,
  options: { collapsed?: ReadonlySet<number>; filter?: string } = {},
): MenuNode[] {
  const filter = (options.filter ?? "").trim().toLowerCase();
  const collapsed = options.collapsed ?? new Set<number>();
  const out: MenuNode[] = [];

  if (filter) {
    const shown = new Set<number>();
    const mark = (node: MenuNode): boolean => {
      let any = node.label.toLowerCase().includes(filter);
      // Every child is visited: a match deep in a later sibling must be marked.
      for (const child of node.children) if (mark(child)) any = true;
      if (any) shown.add(node.id);
      return any;
    };
    tree.roots.forEach(mark);
    const walk = (node: MenuNode) => {
      if (!shown.has(node.id)) return;
      out.push(node);
      node.children.forEach(walk);
    };
    tree.roots.forEach(walk);
    return out;
  }

  const walk = (node: MenuNode) => {
    out.push(node);
    if (!collapsed.has(node.id)) node.children.forEach(walk);
  };
  tree.roots.forEach(walk);
  return out;
}
