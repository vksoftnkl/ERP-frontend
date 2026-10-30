/**
 * Purchase Entry (menu 24) — the charges grid's rules, pure (Qt NexERP 88cd3f2:
 * `PurchaseInvoiceEntry::fillChargeRow`, `seedAutoCharges`, `chargesPayload`,
 * `dropOffBillCharges`, the charge half of `paintCalc` and `applyLoaded`).
 *
 * The client prices nothing: Amount, GST and Net are the server's
 * (`/purchase/invoices/validate`) unless the operator TYPED the Amount — then it
 * is sent as the amount and the rate is ignored; typing the Rate hands pricing
 * back to the server.
 */
import { chargeMethodLabel, deductPrefixed, LEDGER_PAYEE, masterOnBill, ON_BILL_PAYEE, payeesDto } from "../shared/purchase-charges";
import { num, qtyText, text } from "../shared/purchase.format";
import type {
  InvoiceChargeRow,
  PurchaseChargeCalc,
  PurchaseChargeDto,
  PurchaseChargeMasterRow,
  PurchaseChargeStored,
} from "./invoice-header.types";

export { LEDGER_PAYEE, ON_BILL_PAYEE, masterOnBill };

/** How a charge is priced, as the Basis column says it (Qt `basisText`). */
/** Callout 14 — "Into cost": Always (off-bill), else Yes / No by the master (Qt fillChargeRow). */
export function intoCostText(row: { onBill: boolean; landingCost?: boolean }): string {
  return !row.onBill ? "Always" : row.landingCost === false ? "No" : "Yes";
}

export function basisText(method: string, onBill: boolean, beforeTax: boolean, type: string): string {
  const out = chargeMethodLabel(method, "invoice") + (onBill ? (beforeTax ? " · before tax" : " · after tax") : " · our cost");
  return deductPrefixed(out, type);
}

/** Two places, no grouping — what an Amount input holds. */
export function amountText(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

/** One charge snapshotted from the master (Qt `fillChargeRow`): name, on-bill, basis, default rate. */
export function chargeFromMaster(master: PurchaseChargeMasterRow, key: string): InvoiceChargeRow {
  const onBill = masterOnBill(master);
  const method = text(master.chgMethod);
  return {
    key,
    chgId: text(master.chgId),
    name: text(master.chgName),
    onBill,
    method,
    basis: basisText(method, onBill, Boolean(master.chgBeforeTax), text(master.chgType)),
    rate: qtyText(num(master.chgDefaultRate)),
    amount: "",
    typed: false,
    payeeIds: [],
    payeeNames: [],
    gst: 0,
    net: 0,
    priced: false,
    landingCost: master.chgLandingCost !== false,
  };
}

/** The charges a fresh bill starts with (Qt `ChargeGridController::autoApplyCharges`, sales rows skipped). */
export function autoApplyCharges(masters: readonly PurchaseChargeMasterRow[]): PurchaseChargeMasterRow[] {
  return masters.filter(
    (master) =>
      Boolean(master.chgAutoApply) &&
      master.chgIsActive !== false &&
      !master.chgIsDeleted &&
      text(master.chgId) !== "" &&
      text(master.chgModule).toUpperCase() !== "S",
  );
}

/** What the Payee cell says. */
export function payeeText(row: InvoiceChargeRow): string {
  if (row.onBill) {
    return ON_BILL_PAYEE;
  }
  return row.payeeNames.length > 0 ? row.payeeNames.join(" · ") : LEDGER_PAYEE;
}

/** A typed number cell → number; blank / junk → 0. */
function cellNumber(raw: string): number {
  return num(raw.replace(/,/g, ""), 0);
}

/** The body's `charges[]` (Qt `chargesPayload`). */
export function chargesPayload(rows: readonly InvoiceChargeRow[]): PurchaseChargeDto[] {
  return rows
    .filter((row) => row.chgId !== "")
    .map((row) => {
      const dto: PurchaseChargeDto = { chgId: row.chgId };
      if (row.typed) {
        dto.amount = cellNumber(row.amount);
      } else {
        dto.rate = cellNumber(row.rate);
      }
      const payees = row.onBill ? undefined : payeesDto(row.payeeIds);
      if (payees) {
        dto.payees = payees;
      }
      return dto;
    });
}

/** The server's figures painted back — the answer's charges come in the order they were sent. */
export function applyChargeCalc(rows: readonly InvoiceChargeRow[], out: readonly PurchaseChargeCalc[] | undefined): InvoiceChargeRow[] {
  const answer = out ?? [];
  let index = 0;
  return rows.map((row) => {
    if (row.chgId === "") {
      return row;
    }
    const calc = answer[index];
    index += 1;
    if (!calc) {
      return row;
    }
    const amount = num(calc.amount);
    const gst = num(calc.cgst) + num(calc.sgst) + num(calc.igst);
    return {
      ...row,
      // A typed amount stays as typed; the rest show what the server priced.
      amount: row.typed ? row.amount : amountText(amount),
      gst,
      net: amount + gst,
      priced: true,
    };
  });
}

/**
 * A stored bill's charges (Qt `applyLoaded`): one detail row per charge, or per
 * payee for an off-bill one — folded back into one grid row. The saved amount
 * is kept as it is (`typed`), so a re-save does not re-price it.
 */
export function foldStoredCharges(stored: readonly PurchaseChargeStored[] | undefined, keyOf: (index: number) => string): InvoiceChargeRow[] {
  const rows: InvoiceChargeRow[] = [];
  let lastId = "";
  let current: InvoiceChargeRow | null = null;
  for (const entry of stored ?? []) {
    const id = text(entry.chgId);
    const onBill = entry.onBill === undefined || entry.onBill === null ? true : Boolean(entry.onBill);
    if (onBill || id !== lastId || current === null) {
      const method = text(entry.method);
      current = {
        key: keyOf(rows.length),
        chgId: id,
        name: text(entry.chgName),
        onBill,
        method,
        basis: basisText(method, onBill, Boolean(entry.beforeTax), text(entry.type)),
        rate: qtyText(num(entry.rate)),
        amount: amountText(0),
        typed: true,
        payeeIds: [],
        payeeNames: [],
        gst: 0,
        net: 0,
        priced: true,
        landingCost: entry.landingCost !== false,
      };
      rows.push(current);
    }
    lastId = id;
    const sum = cellNumber(current.amount) + num(entry.amount);
    const gst = current.gst + num(entry.cgst) + num(entry.sgst) + num(entry.igst);
    current.amount = amountText(sum);
    current.gst = gst;
    current.net = sum + gst;
    const partyId = text(entry.partyId);
    if (!onBill && partyId) {
      current.payeeIds = [...current.payeeIds, partyId];
      current.payeeNames = [...current.payeeNames, text(entry.partyName) || partyId];
    }
  }
  return rows;
}

/** Typing the Rate hands pricing back to the server; typing the Amount makes it the amount sent. */
export function editCharge(row: InvoiceChargeRow, field: "rate" | "amount", raw: string): InvoiceChargeRow {
  const value = raw.replace(/,/g, "").trim();
  if (field === "rate") {
    return row.rate === value && !row.typed ? row : { ...row, rate: value, typed: false };
  }
  const typed = value !== "";
  return row.amount === value && row.typed === typed ? row : { ...row, amount: value, typed };
}

/**
 * Goods from a GRN: our own (off-bill) costs were paid on the GRN — none on the
 * bill (R4, Qt `dropOffBillCharges`). Returns the rows kept and the names dropped.
 */
export function dropOffBill(rows: readonly InvoiceChargeRow[]): { rows: InvoiceChargeRow[]; gone: string[] } {
  const gone = rows.filter((row) => row.chgId !== "" && !row.onBill).map((row) => row.name);
  return gone.length > 0 ? { rows: rows.filter((row) => row.onBill || row.chgId === ""), gone } : { rows: [...rows], gone };
}

/** The sentence Qt puts on the hint after dropping them. */
export function droppedOffBillHint(gone: readonly string[]): string {
  return gone.length > 0 ? `Removed ${gone.join(", ")} — our own costs on GRN goods were paid on the GRN.` : "";
}
