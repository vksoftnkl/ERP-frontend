/**
 * The purchase charge rules Purchase Entry (menu 24) and the GRN (menu 196)
 * share — Qt uses one charge master read (`/charges/get?chgModule=P`, module P
 * widens to P + B on the server), one charges layout (ui_table 62,
 * `PurchaseChargeCols`) and one payee dialog for both. Each screen keeps its own
 * row model (the bill prices on-bill charges with GST; the GRN holds only our
 * own off-bill costs, the unloading coolie split per loadman): their rules stay
 * in invoice/invoice-charges.ts and grn/grn-charges.ts and are built on these.
 *
 * Pure: no React, no network.
 */
import { text } from "./purchase.format";

type WireNumber = number | string | null | undefined;

/** One row of `/charges/get` (the purchase charge master). */
export type PurchaseChargeMasterRow = {
  chgId: string;
  chgName: string;
  chgCode?: string | null;
  chgModule?: string | null;
  chgMethod?: string | null;
  chgType?: string | null;
  /** UNLOADING = the coolie the GRN owes the loadmen. */
  chgRole?: string | null;
  chgDefaultRate?: WireNumber;
  chgBeforeTax?: boolean | null;
  /** Absent = on the bill (Qt: `!contains || boolean`). */
  chgOnBill?: boolean | null;
  chgAutoApply?: boolean | null;
  chgLandingCost?: boolean | null;
  chgIsActive?: boolean | null;
  chgIsDeleted?: boolean | null;
  chgLedgerCode?: string | null;
  chgLedgerName?: string | null;
};

export const PURCHASE_CHARGES_ENDPOINT = "/charges/get";
/** Module P widens to P + B on the server. */
export const PURCHASE_CHARGE_MODULE = "P";

/** The Payee cell of a charge the supplier bills (Purchase Entry). */
export const ON_BILL_PAYEE = "(on the supplier's bill)";
/** The Payee cell of an off-bill charge nobody is named for: its own ledger is owed. */
export const LEDGER_PAYEE = "(the charge's ledger)";

/** Absent = on the bill (Qt: `!c.contains("chgOnBill") || boolean`). */
export function masterOnBill(master: Pick<PurchaseChargeMasterRow, "chgOnBill">): boolean {
  return master.chgOnBill === undefined || master.chgOnBill === null ? true : Boolean(master.chgOnBill);
}

/** The charges that are our own cost (off the bill), active, not deleted — all a GRN may carry. */
export function offBillMasters<T extends PurchaseChargeMasterRow>(masters: readonly T[]): T[] {
  return masters.filter((m) => !masterOnBill(m) && m.chgIsActive !== false && m.chgIsDeleted !== true);
}

/**
 * How a charge is priced, in each screen's own wording (Qt keeps two tables):
 * Purchase Entry says "Per qty" / "Per net qty", the GRN "Qty" / "Net qty".
 */
const METHOD_LABEL: Readonly<Record<"invoice" | "grn", Readonly<Record<string, string>>>> = {
  invoice: {
    FIXED: "Fixed",
    PERCENT: "% of value",
    QTY: "Per qty",
    NET_QTY: "Per net qty",
    KG: "Per kg",
    QTL: "Per quintal",
    TON: "Per ton",
  },
  grn: {
    FIXED: "Fixed",
    PERCENT: "% of value",
    QTY: "Qty",
    NET_QTY: "Net qty",
    KG: "Per kg",
    QTL: "Per quintal",
    TON: "Per ton",
  },
};

export function chargeMethodLabel(method: string, wording: "invoice" | "grn"): string {
  return METHOD_LABEL[wording][method.trim().toUpperCase()] ?? method;
}

/** A DEDUCT charge reads "Less: …" (Qt basisText / chargeBasis). */
export function deductPrefixed(label: string, type: string): string {
  return type.trim().toUpperCase() === "DEDUCT" ? `Less: ${label}` : label;
}

/** An off-bill charge's ledger as its Payee cell names it. */
export function ledgerPayee(ledgerName: string): string {
  return ledgerName ? `${ledgerName} (ledger)` : LEDGER_PAYEE;
}

/** The payees of an off-bill charge as `/save` takes them (the server splits the amount equally). */
export function payeesDto(partyIds: readonly string[]): { partyId: string }[] | undefined {
  const ids = partyIds.map((id) => text(id)).filter(Boolean);
  return ids.length > 0 ? ids.map((partyId) => ({ partyId })) : undefined;
}
