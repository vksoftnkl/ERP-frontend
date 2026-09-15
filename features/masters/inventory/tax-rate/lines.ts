import { getFirstDefinedValue, toDisplayValue } from "@/app/master/_shared/crud-utils";
import type { TaxRateLedgerRow, TaxRateSupplyNature } from "./types";

/**
 * The Ledgers tab's row model.
 *
 * One row is one `inventory.tax_rate_ledger` record: "for THIS rate, role X
 * posts to ledger Y instead of the chart-wide default". No rows at all is a
 * complete and normal configuration — most rates carry none.
 */

let rowKeySeed = 0;

function nextRowKey(): string {
  rowKeySeed += 1;
  return `trl-${rowKeySeed}`;
}

/** Roles whose `alr_by_supply` is true may narrow the nature (§5.3). */
const BY_SUPPLY_ROLES = new Set([
  "SALES",
  "SALES_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
]);

/**
 * Whether this role may narrow its supply nature.
 *
 * The authority is `alr_by_supply`, which dropdown 52 returns as a column, so a
 * picked role teaches its own row. This set is the fallback for a row loaded from
 * the server before the operator has touched the picker — and the reason the tab
 * still behaves correctly if the role catalogue is unreachable.
 */
export function roleAllowsSupplyNature(role: string): boolean {
  return BY_SUPPLY_ROLES.has(role.trim().toUpperCase());
}

export function normalizeSupplyNature(
  raw: unknown,
): "" | TaxRateSupplyNature {
  const value = toDisplayValue(raw).trim().toUpperCase();
  return value === "INTRA" || value === "INTER" ? value : "";
}

export function createEmptyLedgerRow(): TaxRateLedgerRow {
  return {
    rowKey: nextRowKey(),
    trlId: null,
    role: "",
    roleLabel: "",
    roleBySupply: false,
    supplyNature: "",
    ledgerId: "",
    ledgerName: "",
    remarks: "",
    isActive: true,
  };
}

const LINES_KEYS = ["lines", "taxRateLedgers", "tax_rate_ledgers"] as const;

/**
 * Reads the loaded rate's `lines` into editor rows.
 *
 * Deactivated lines come back from `/tax-rates/get` so the screen can switch them
 * on again; deleted ones do not. Both `trl_role_label` and `trl_ledger_name` are
 * resolved on the read path, so the pickers show a saved row's text without a
 * lookup round-trip.
 */
export function extractLedgerRows(source: unknown): TaxRateLedgerRow[] {
  const record = (source ?? {}) as Record<string, unknown>;
  const raw = getFirstDefinedValue(record, LINES_KEYS);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => {
    const line = (entry ?? {}) as Record<string, unknown>;
    const role = toDisplayValue(
      getFirstDefinedValue(line, ["trl_role", "trlRole"]),
    ).trim().toUpperCase();
    const trlId = toDisplayValue(getFirstDefinedValue(line, ["trl_id", "trlId"])).trim();
    const activeRaw = getFirstDefinedValue(line, ["trl_is_active", "trlIsActive"]);
    return {
      rowKey: nextRowKey(),
      trlId: trlId || null,
      role,
      roleLabel:
        toDisplayValue(getFirstDefinedValue(line, ["trl_role_label", "trlRoleLabel"])) ||
        role,
      roleBySupply: roleAllowsSupplyNature(role),
      supplyNature: normalizeSupplyNature(
        getFirstDefinedValue(line, ["trl_supply_nature", "trlSupplyNature"]),
      ),
      ledgerId: toDisplayValue(
        getFirstDefinedValue(line, ["trl_ledger_id", "trlLedgerId"]),
      ).trim(),
      ledgerName: toDisplayValue(
        getFirstDefinedValue(line, ["trl_ledger_name", "trlLedgerName"]),
      ),
      // Hidden as a column since 2026-09-12, but kept in state and sent back so
      // hiding it cannot drop what another client wrote (§5.1).
      remarks: toDisplayValue(getFirstDefinedValue(line, ["trl_remarks", "trlRemarks"])),
      isActive: activeRaw === undefined || activeRaw === null ? true : activeRaw !== false,
    } satisfies TaxRateLedgerRow;
  });
}
