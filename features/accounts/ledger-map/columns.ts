/**
 * The role grid's columns: what each one MEANS here, joined to what `ui_tables`
 * 37, "LEDGER MAP - POSTING ROLES", says about order, heading, width,
 * visibility and focus.
 *
 * **This screen sets no widths of its own.** The layout is the single authority
 * on how wide a column is and whether it shows — that is what the right-click
 * "Admin settings" is for, and the desktop screen reads the same Desktop row.
 *
 * The join is the opening balance's, reused: name first, `ui_tbl_clm_no`
 * second, so a column renamed in UI Table Master still finds its meaning.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import {
  resolveOpeningColumns,
  type OpeningColumnMeaning,
  type ResolvedOpeningColumn,
} from "@/features/accounts/opening-balance/columns";

export type RoleColumnKey =
  | "role"
  | "group"
  | "ledger"
  | "needs"
  | "usedby"
  | "status"
  | "remarks";

/**
 * The seven columns this screen draws, in the layout's `ui_tbl_clm_no` order.
 *
 * The five the desktop layout also carries — RoleCode, AlmId, LedgerId,
 * LedgerType, Dirty — are NOT here. They were a Qt artefact: a
 * `QTableWidgetItem` delegate could only read a row's id or flag out of a hidden
 * cell. A React row carries them as fields, so a meaning for them would be a
 * column that renders nothing and can be un-hidden into an empty strip.
 */
export const ROLE_COLUMN_MEANINGS: OpeningColumnMeaning<RoleColumnKey>[] = [
  { key: "role", token: "Role", kind: "text", align: "left" },
  { key: "group", token: "Group", kind: "chip", align: "center" },
  { key: "ledger", token: "Ledger", kind: "lookup", align: "left" },
  { key: "needs", token: "Needs", kind: "text", align: "left" },
  { key: "usedby", token: "Used by", kind: "text", align: "left" },
  { key: "status", token: "Status", kind: "chip", align: "center" },
  { key: "remarks", token: "Remarks", kind: "text", align: "left" },
];

/**
 * A new column goes on the END of the layout, never mid-grid:
 * `fixed.ui_table_columns` is keyed by column NUMBER, so inserting one silently
 * applies every stored width to the column next door.
 */
export const ROLE_COLUMN_NUMBERS: Record<RoleColumnKey, number> = {
  role: 0,
  group: 1,
  ledger: 2,
  needs: 3,
  usedby: 4,
  status: 5,
  remarks: 6,
};

export type ResolvedRoleColumn = ResolvedOpeningColumn<RoleColumnKey>;

export function resolveRoleColumns(rows: UiTableColumnRow[] | undefined): ResolvedRoleColumn[] {
  return resolveOpeningColumns(rows, ROLE_COLUMN_MEANINGS, ROLE_COLUMN_NUMBERS);
}
