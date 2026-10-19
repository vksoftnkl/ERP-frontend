/**
 * The size, colour, fabric and season lists the tag screen completes from and
 * resolves names against (G5, G20, G21) — the data half of Qt's
 * `TextileTagLists`. Pure and immutable: the screen keeps one of these in its
 * reducer state and the resolve round trip lives in `../textile-tags.api.ts`.
 *
 * A list cell is TYPED. The name is the operator's; the id is the server's.
 * Each kind is read from its dropdown on the box, and a name the list does
 * not know is added through the lists route — once, after the screen asked
 * (G5: "Colour 'Peacock blue' is not in the list. Add it?").
 *
 * Until the dropdowns are registered (server step B-2, ids in notes 136) a
 * kind's dropdown id is 0: nothing is fetched, `isLoaded()` answers false, and
 * EVERY name is resolved through the save route, whose 409 DUPLICATE carries
 * the existing row. That is the same answer, without the question. Sizes fall
 * back to the plan's seed order (`seedSizes`).
 */
import { LIST_KINDS, seedSizes, sizeSets, type ListKind } from "./textile-tag-entity";

/** Dropdown ids on the box; 0 = not registered yet (see above). */
export const LIST_DROPDOWN_IDS: Readonly<Record<ListKind, number>> = {
  size: 0,
  colour: 0,
  fabric: 0,
  season: 0,
};

export type Season = {
  id: string;
  name: string;
  /** yyyy-MM-dd or "". */
  from: string;
  to: string;
};

export type TagLists = {
  /** kind → key(name, set) → id */
  ids: Readonly<Record<ListKind, Readonly<Record<string, string>>>>;
  /** kind → names, list order */
  names: Readonly<Record<ListKind, readonly string[]>>;
  /** SET → sizes, list order */
  sizesBySet: Readonly<Record<string, readonly string[]>>;
  /** Open seasons only. */
  seasons: readonly Season[];
  loaded: Readonly<Record<ListKind, boolean>>;
};

/** One list row, from a dropdown (snake_case) or the save route (camelCase). */
export type ListRow = Record<string, unknown>;

export function emptyLists(): TagLists {
  return {
    ids: { size: {}, colour: {}, fabric: {}, season: {} },
    names: { size: [], colour: [], fabric: [], season: [] },
    sizesBySet: {},
    seasons: [],
    loaded: { size: false, colour: false, fabric: false, season: false },
  };
}

function key(name: string, sizeSet = ""): string {
  return `${sizeSet.toUpperCase()}|${name.trim().toUpperCase()}`;
}

/** The column prefix of each list table (plan §1.3): isz_ / icl_ / ifb_ / isn_. */
export function listPrefixOf(kind: ListKind): string {
  switch (kind) {
    case "size":
      return "isz";
    case "colour":
      return "icl";
    case "fabric":
      return "ifb";
    default:
      return "isn";
  }
}

function text(row: ListRow, field: string): string {
  const value = row[field];
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/** The same field under either spelling: `isz_name` (SQL) or `iszName` (route). */
export function listRowField(row: ListRow, prefix: string, snake: string, camel: string): string {
  const fromSnake = text(row, `${prefix}_${snake}`);
  return fromSnake || text(row, `${prefix}${camel}`);
}

/** The id out of a list row, whichever spelling it came in — "" when it has none. */
export function listRowId(row: ListRow, kind: ListKind): string {
  const prefixed = listRowField(row, listPrefixOf(kind), "id", "Id");
  return prefixed || text(row, "id");
}

function hasName(names: readonly string[], name: string): boolean {
  const wanted = name.trim().toUpperCase();
  return names.some((candidate) => candidate.toUpperCase() === wanted);
}

export function remember(
  lists: TagLists,
  kind: ListKind,
  id: string,
  name: string,
  sizeSet = "",
): TagLists {
  const trimmed = name.trim();
  const ids = {
    ...lists.ids,
    [kind]: { ...lists.ids[kind], [key(trimmed, kind === "size" ? sizeSet : "")]: id },
  };
  const names = hasName(lists.names[kind], trimmed)
    ? lists.names
    : { ...lists.names, [kind]: [...lists.names[kind], trimmed] };
  let sizesBySet = lists.sizesBySet;
  if (kind === "size" && sizeSet) {
    const set = sizeSet.toUpperCase();
    const current = lists.sizesBySet[set] ?? [];
    if (!hasName(current, trimmed)) {
      sizesBySet = { ...lists.sizesBySet, [set]: [...current, trimmed] };
    }
  }
  return { ...lists, ids, names, sizesBySet };
}

/**
 * A fetched dropdown's rows, remembered as that kind's list. The season
 * dropdown offers OPEN seasons only (plan §11), so every row is one.
 */
export function ingestListRows(lists: TagLists, kind: ListKind, rows: readonly ListRow[]): TagLists {
  const prefix = listPrefixOf(kind);
  let next = lists;
  const seasons: Season[] = [];
  for (const row of rows) {
    const id = listRowField(row, prefix, "id", "Id");
    const name = listRowField(row, prefix, "name", "Name");
    if (!id || !name) {
      continue;
    }
    if (kind === "season") {
      seasons.push({
        id,
        name,
        from: listRowField(row, prefix, "from_date", "FromDate"),
        to: listRowField(row, prefix, "to_date", "ToDate"),
      });
    }
    next = remember(next, kind, id, name, listRowField(row, prefix, "size_set", "SizeSet"));
  }
  return {
    ...next,
    seasons: kind === "season" ? [...next.seasons, ...seasons] : next.seasons,
    loaded: { ...next.loaded, [kind]: true },
  };
}

/** Whether the kind's list is on the box at all, so "unknown" means NEW. */
export function isLoaded(lists: TagLists, kind: ListKind): boolean {
  return lists.loaded[kind];
}

/** The names a list column completes from. Sizes seed from the plan until their list lands. */
export function namesOf(lists: TagLists, kind: ListKind): string[] {
  if (kind === "size" && !isLoaded(lists, kind)) {
    return sizeSets().flatMap((set) => seedSizes(set));
  }
  return [...lists.names[kind]];
}

/** The sizes of a set, in list order — the seed order until the list knows the set. */
export function sizesOf(lists: TagLists, sizeSet: string): string[] {
  const listed = lists.sizesBySet[sizeSet.toUpperCase()];
  return listed && listed.length > 0 ? [...listed] : seedSizes(sizeSet);
}

/** The id a name is known under, "" when the list does not know it. */
export function idOf(lists: TagLists, kind: ListKind, name: string, sizeSet = ""): string {
  const ids = lists.ids[kind];
  if (kind !== "size") {
    return ids[key(name)] ?? "";
  }
  if (sizeSet) {
    return ids[key(name, sizeSet)] ?? "";
  }
  // A typed size with no set: the one set that has it, when only one does.
  let found = "";
  for (const set of sizeSets()) {
    const id = ids[key(name, set)];
    if (!id) {
      continue;
    }
    if (found) {
      return "";
    }
    found = id;
  }
  return found;
}

function isoDay(value: string): string {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** The open season whose dates cover `onDate`, else null (G21 default). */
export function seasonFor(lists: TagLists, onDate: string): Season | null {
  const on = isoDay(onDate);
  if (!on) {
    return null;
  }
  for (const season of lists.seasons) {
    const from = isoDay(season.from);
    const to = isoDay(season.to);
    if ((from || to) && (!from || from <= on) && (!to || on <= to)) {
      return season;
    }
  }
  return null;
}

/** The open season named `name` (case-insensitive), else null. */
export function seasonNamed(lists: TagLists, name: string): Season | null {
  const wanted = name.trim().toUpperCase();
  if (!wanted) {
    return null;
  }
  return lists.seasons.find((season) => season.name.toUpperCase() === wanted) ?? null;
}

export { LIST_KINDS };
