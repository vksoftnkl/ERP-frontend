/**
 * Posting Ledger Map (menu 250) — the wire shapes and the one row the screen
 * works on.
 *
 * Mirrors `src/modules/accountsModule/ledgerMap/types/ledger-map-api.types.ts`
 * on the server. Read that file's comments before changing anything here: a row
 * whose mapping half is ALL nulls is not a bad payload, it is the case the
 * screen exists to show.
 */

/** Every `alr_group` the catalogue uses today. Anything else is shown verbatim. */
export type LedgerRoleGroup =
  | "REVENUE"
  | "OUTPUT_TAX"
  | "PURCHASE"
  | "INPUT_TAX"
  | "SHARED"
  | "RECEIPT"
  | "FUTURE";

/** One element of `GET /ledger-map/roles`, exactly as the server sends it. */
export type LedgerMapRolePayload = {
  role: string;
  label: string;
  group: string;
  sortOrder: number;
  expectedLedgerType: string | null;
  expectedDutyHead: string | null;
  expectedGroupNature: string | null;
  roleIsActive: boolean;
  usedBy: string[];
  almId: string | null;
  ledgerId: string | null;
  ledgerName: string | null;
  ledgerIsActive: boolean | null;
  ledgerIsDeleted: boolean | null;
  isActive: boolean | null;
  remarks: string | null;
};

/**
 * `POST /ledger-map/create`.
 *
 * `almCompanyId`, `almBranchId` and `almSupplyNature` are absent on purpose —
 * the server 400s on each of them so that nothing comes to depend on a
 * half-built per-company override.
 */
export type SaveLedgerMapBody = {
  /** Present whenever the role HAS a mapping. Omitting it on a mapped role is a 409. */
  almId?: string;
  role: string;
  ledgerId: string;
  isActive: boolean;
  remarks: string | null;
};

export type LedgerMapDeletePayload = {
  almId: string;
  role: string;
  deleted: true;
};

/** One row of grid 105, "POPUP - LEDGERS FOR ROLE", under its SQL's own names. */
export type RoleLedgerPickerRow = {
  led_id: string;
  led_name: string;
  led_short: string | null;
  acc_group_name: string | null;
  led_ledger_type: string | null;
};

/**
 * One posting role, with the ledger it resolves to — or with nothing.
 *
 * The payload with its nulls folded: an empty string means "none", so the grid
 * and the comparisons never have to tell `null` from `""`. `almId` alone stays
 * nullable, because "this role has no mapping row" is the one absence a save
 * branches on.
 */
export type LedgerMapRow = {
  // ── The catalogue: the server's, never edited here ────────────────────────
  role: string;
  label: string;
  group: string;
  sortOrder: number;
  /** Empty = the server does not check this axis. */
  expectedLedgerType: string;
  expectedDutyHead: string;
  expectedGroupNature: string;
  roleIsActive: boolean;
  usedBy: string[];

  // ── The mapping, which is what this screen writes ─────────────────────────
  almId: string | null;
  /** Empty = unmapped. */
  ledgerId: string;
  ledgerName: string;
  /** Not served by `/roles`; filled by the picker, for the local type check. */
  ledgerType: string;
  ledgerIsActive: boolean;
  ledgerIsDeleted: boolean;
  isActive: boolean;
  remarks: string;
};

/** What the picker hands back. */
export type PickedLedger = {
  ledgerId: string;
  ledgerName: string;
  ledgerType: string;
};

/**
 * The four words of the Status column. The difference between them is the
 * REPAIR, not the severity: a ledger to pick, a row to turn back on, or a
 * different ledger because the one it points at has gone.
 */
export type LedgerMapStatus = "Mapped" | "Not mapped" | "Off" | "Ledger gone";
