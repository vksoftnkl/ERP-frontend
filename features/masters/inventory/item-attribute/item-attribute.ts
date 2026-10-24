/**
 * The textile item attributes — Item Size (menu 291) and Item Colour (menu 292),
 * Qt a204dc8 (`inventory/master/sizes`, `inventory/master/colours`), server
 * notes 147 (`src/modules/Inventory/item-size-colour-master`).
 *
 * The two masters are twins: one row of `inventory.item_size_master` /
 * `item_colour_master` each, keyed by column name (`isz_*` / `icl_*`), shared by
 * every company when the company is blank, the company's own otherwise. Size
 * has one field more — the size set. Everything here is pure; the screen is
 * `item-attribute-master.tsx`.
 *
 * Server rules the screen leans on rather than restates:
 *  - `/create` is an upsert: a body carrying the id updates.
 *  - A name already live in the company or shared is 409 `…_NAME_TAKEN`.
 *  - The company is taken on create and IGNORED on update — which is why the
 *    screen locks it once the row exists.
 *  - A size / colour a batch uses is refused on delete (409 `…_IN_USE`): the
 *    operator unticks Active instead, and the refusal says so.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";

export type ItemAttributeKind = "size" | "colour";

export type ItemAttributeSpec = {
  kind: ItemAttributeKind;
  /** `isz` / `icl` — the column prefix. */
  prefix: "isz" | "icl";
  menuId: number;
  gridKey: ConfiguredGridKey;
  endpoints: { getById: string; create: string; delete: string; restore: string };
  /** `audit.audit_screen.screen_name` — what Record History is filed under. */
  auditScreenName: string;
  /** The screen-memory slot an unsaved popup entry waits in (`modalDraftKey`). */
  draftKey: string;
  /** "size" / "colour" — inside sentences. */
  word: string;
  /** "Size" / "Colour" — the name field and the column. */
  Word: string;
  title: string;
  listTitle: string;
  listSubtitle: string;
  entryTitle: string;
  entrySubtitle: string;
  namePlaceholder: string;
  nameRequiredMessage: string;
  /** Size only. */
  hasSizeSet: boolean;
};

export const ITEM_SIZE_SPEC: ItemAttributeSpec = {
  kind: "size",
  prefix: "isz",
  menuId: 291,
  gridKey: "itemSizeList",
  endpoints: {
    getById: "/item-sizes/get",
    create: "/item-sizes/create",
    delete: "/item-sizes/delete",
    restore: "/item-sizes/restore",
  },
  auditScreenName: "Item Size Master",
  draftKey: "item-size",
  word: "size",
  Word: "Size",
  title: "Item Size Masters",
  listTitle: "Item Size List",
  listSubtitle: "Sizes for the purchase line, in report order.",
  entryTitle: "Size Entry",
  entrySubtitle: "Sizes picked on the purchase line.",
  namePlaceholder: "XL, 32, 4-5Y",
  nameRequiredMessage: "Enter the size, e.g. XL or 32.",
  hasSizeSet: true,
};

export const ITEM_COLOUR_SPEC: ItemAttributeSpec = {
  kind: "colour",
  prefix: "icl",
  menuId: 292,
  gridKey: "itemColourList",
  endpoints: {
    getById: "/item-colours/get",
    create: "/item-colours/create",
    delete: "/item-colours/delete",
    restore: "/item-colours/restore",
  },
  auditScreenName: "Item Colour Master",
  draftKey: "item-colour",
  word: "colour",
  Word: "Colour",
  title: "Item Colour Masters",
  listTitle: "Item Colour List",
  listSubtitle: "Colours for the purchase line.",
  entryTitle: "Colour Entry",
  entrySubtitle: "Colours picked on the purchase line.",
  namePlaceholder: "Maroon, Navy, Off-white",
  nameRequiredMessage: "Enter the colour, e.g. Maroon.",
  hasSizeSet: false,
};

/** `isz_size_set` — groups sizes for the size grid later; blank = no set. */
export const SIZE_SET_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "(none)" },
  { value: "ALPHA", label: "Alpha (S, M, L, XL)" },
  { value: "WAIST", label: "Waist (28, 30, 32)" },
  { value: "KIDS", label: "Kids (age)" },
  { value: "FREE", label: "Free size" },
];

/** The DTO's limits (`save-item-size.dto.ts`): name 50, code 20, size set 20; sort an int. */
export const NAME_MAX_LENGTH = 50;
export const CODE_MAX_LENGTH = 20;
export const SORT_MAX = 9999;

/** The form's field names — the column names themselves. */
export function fieldNames(spec: Pick<ItemAttributeSpec, "prefix">) {
  const p = spec.prefix;
  return {
    id: `${p}_id`,
    name: `${p}_name`,
    code: `${p}_code`,
    sizeSet: `${p}_size_set`,
    sort: `${p}_sort`,
    companyId: `${p}_company_id`,
    active: `${p}_is_active`,
    scope: `${p}_scope`,
  } as const;
}

/**
 * The list's lookup keys. Grid 181 / 182 alias every column by its real name,
 * so these are exact — a key the grid does not SELECT renders a blank cell.
 */
export function lookupKeysOf(spec: Pick<ItemAttributeSpec, "prefix">) {
  const f = fieldNames(spec);
  return {
    id: [f.id],
    code: [f.code],
    name: [f.name],
    short: [f.scope],
    alias: [f.code],
    active: [f.active],
    position: [f.sort],
    array: ["items", "data", "rows", "results", "list"],
  } as const;
}

/**
 * Grid 181 / 182's two bare tokens, BOTH always sent: the deleted flag and the
 * company (shared rows + this company's own). Unsent, either one stays a
 * literal in the statement and the whole query fails. `wantdelete` rides along
 * for the shell's own reading of the deleted view.
 */
export function listGridParams(
  spec: Pick<ItemAttributeSpec, "prefix">,
  showDeleted: boolean,
  companyId: string,
): Record<string, string | boolean> {
  const p = `i${spec.prefix}`;
  return {
    wantdelete: showDeleted,
    [`${p}_is_deleted`]: showDeleted ? "true" : "false",
    [`${p}_company_id`]: companyId,
  };
}

/** A blank-form's values. Active ticked, sort 0, every company. */
export function initialValues(spec: Pick<ItemAttributeSpec, "prefix" | "hasSizeSet">): Record<string, string> {
  const f = fieldNames(spec);
  return {
    [f.name]: "",
    [f.code]: "",
    ...(spec.hasSizeSet ? { [f.sizeSet]: "" } : {}),
    [f.sort]: "0",
    [f.companyId]: "",
    [f.active]: "true",
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function booleanText(value: unknown, fallback: boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  const s = text(value).trim().toLowerCase();
  if (s === "true" || s === "t" || s === "1" || s === "yes") return "true";
  if (s === "false" || s === "f" || s === "0" || s === "no") return "false";
  return fallback ? "true" : "false";
}

/** `/get`'s row (column names) into the form. */
export function formValuesFromRow(
  spec: Pick<ItemAttributeSpec, "prefix" | "hasSizeSet">,
  row: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const f = fieldNames(spec);
  const source = row ?? {};
  const sort = Number.parseInt(text(source[f.sort]), 10);
  return {
    [f.name]: text(source[f.name]),
    [f.code]: text(source[f.code]),
    ...(spec.hasSizeSet ? { [f.sizeSet]: text(source[f.sizeSet]) } : {}),
    [f.sort]: Number.isFinite(sort) ? String(sort) : "0",
    [f.companyId]: text(source[f.companyId]),
    [f.active]: booleanText(source[f.active], true),
  };
}

/**
 * The company's NAME for the form's Company box. `/get` carries the id only
 * (notes 147 ask 1); the list holds shared rows plus this company's own, so an
 * own row's company is the session's — the Qt `mapResponse` rule. Blank =
 * shared. Any other id (another company's row, which this list never shows)
 * reads as its id rather than as "every company".
 */
export function companyLabelOf(
  companyId: string,
  session: { companyId: string; companyName: string },
): string {
  const id = companyId.trim();
  if (!id) {
    return "";
  }
  return id === session.companyId && session.companyName ? session.companyName : id;
}

/** The trimmed sort order, held to the spin box's 0..9999; a non-number is 0. */
export function sortValue(raw: string): number {
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, SORT_MAX);
}

/**
 * The save body, column-named, exactly the DTO's keys (it runs under
 * `forbidNonWhitelisted`). Blank code / size set / company travel as null; the
 * name is collapsed to single spaces (Qt `.simplified()`). The company is sent
 * on update too — the server ignores it there, and the box is locked.
 */
export function buildSavePayload(
  spec: Pick<ItemAttributeSpec, "prefix" | "hasSizeSet">,
  values: Record<string, string | undefined>,
  editingId: string | null,
): Record<string, string | number | boolean | null> {
  const f = fieldNames(spec);
  const nullable = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed : null;
  };
  return {
    ...(editingId ? { [f.id]: editingId } : {}),
    [f.name]: (values[f.name] ?? "").replace(/\s+/g, " ").trim(),
    [f.code]: nullable(values[f.code]),
    ...(spec.hasSizeSet ? { [f.sizeSet]: nullable(values[f.sizeSet]) } : {}),
    [f.sort]: sortValue(values[f.sort] ?? "0"),
    [f.companyId]: nullable(values[f.companyId]),
    [f.active]: (values[f.active] ?? "true") === "true",
  };
}
