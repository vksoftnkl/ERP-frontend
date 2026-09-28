/**
 * The eleven permission columns of the grid, their verb, and the tooltip the
 * Qt screen carried for the five transaction rights (kept word for word).
 * Column 0, the menu itself, is not in here: it is never verb-gated.
 */
import type { MenuVerb } from "./menuTree";
import type { GrantFlagKey } from "./wire";

export type PermissionColumn = {
  key: GrantFlagKey;
  verb: MenuVerb;
  label: string;
  tooltip: string | null;
};

export const PERMISSION_COLUMNS: readonly PermissionColumn[] = [
  { key: "umCanView", verb: "VIEW", label: "View", tooltip: null },
  { key: "umCanCreate", verb: "CREATE", label: "Create", tooltip: null },
  { key: "umCanEdit", verb: "EDIT", label: "Edit", tooltip: null },
  { key: "umCanDelete", verb: "DELETE", label: "Delete", tooltip: null },
  { key: "umCanPrint", verb: "PRINT", label: "Print", tooltip: null },
  { key: "umCanExport", verb: "EXPORT", label: "Export", tooltip: null },
  {
    key: "umCanPost",
    verb: "POST",
    label: "Post",
    tooltip: "Post a document — commit stock, ledger and register.",
  },
  {
    key: "umCanCancel",
    verb: "CANCEL",
    label: "Cancel",
    tooltip: "Cancel a POSTED document. It reverses; it never deletes.",
  },
  {
    key: "umCanAmend",
    verb: "AMEND",
    label: "Amend",
    tooltip:
      "Reopen a POSTED document and post a revision. A document already declared to GST " +
      "cannot be amended by anyone — this right does not unlock that.",
  },
  {
    key: "umCanOverride",
    verb: "OVERRIDE",
    label: "Override",
    tooltip:
      "Waive an overridable WARNING at post time (discount cap, credit limit, back-date, " +
      "rate below minimum). Refusals can never be overridden.",
  },
  {
    key: "umCanRetender",
    verb: "RETENDER",
    label: "Re-tender",
    tooltip:
      "Change how a posted bill was PAID, without editing what was sold. Its own right, " +
      "deliberately NOT the same as Amend.",
  },
];

export const COLUMN_BY_VERB: ReadonlyMap<MenuVerb, PermissionColumn> = new Map(
  PERMISSION_COLUMNS.map((column) => [column.verb, column]),
);

export const COLUMN_BY_KEY: ReadonlyMap<GrantFlagKey, PermissionColumn> = new Map(
  PERMISSION_COLUMNS.map((column) => [column.key, column]),
);

export function flagKeyOf(verb: MenuVerb): GrantFlagKey {
  const column = COLUMN_BY_VERB.get(verb);
  if (!column) throw new Error(`No permission column for verb ${verb}`);
  return column.key;
}

export function verbOf(key: GrantFlagKey): MenuVerb {
  const column = COLUMN_BY_KEY.get(key);
  if (!column) throw new Error(`No permission column for flag ${key}`);
  return column.verb;
}
