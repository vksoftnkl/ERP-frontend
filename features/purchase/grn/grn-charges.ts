/**
 * GRN (menu 196) — the off-bill CHARGES panel, pure (Qt `GrnEntry`
 * setupChargesGrid / addCharge / setChargePayees / ensureCoolieRow /
 * fillServerCharges / chargesPayload, NexERP 2026-10-29 rebuild, D13).
 *
 * Only our own costs sit here (unloading coolie, own-lorry freight): a charge
 * that is on the supplier's bill belongs on the Purchase Entry. While the
 * operator has not touched the charges the server's set stands — it puts in the
 * company's UNLOADING coolie for the loadmen and splits it per head; once
 * touched, the screen sends its whole set (and `payCoolie: false` when the
 * coolie row was taken out). The client prices nothing: Amount is the server's
 * unless it was TYPED (then it is sent as the amount).
 */
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import {
  chargeMethodLabel,
  deductPrefixed,
  LEDGER_PAYEE,
  ledgerPayee,
  masterOnBill,
  offBillMasters,
  payeesDto,
} from "../shared/purchase-charges";
import { money, num, qtyText, text } from "../shared/purchase.format";
import type { GrnChargeDto, GrnChargeMasterRow, GrnChargeRow, GrnChargeWire, GrnDraft } from "./grn.types";

export { LEDGER_PAYEE, masterOnBill, offBillMasters };

/** Qt `chargeBasis`: "Qty", "Fixed", "Less: Per kg". */
export function chargeBasis(method: string, type: string): string {
  return deductPrefixed(chargeMethodLabel(method, "grn"), type);
}

let chargeSeq = 0;
export function nextChargeKey(): string {
  chargeSeq += 1;
  return `grn-charge-${Date.now().toString(36)}-${chargeSeq}`;
}


/**
 * Qt `loadCoolieCharge`: the charge the server puts in for the loadmen — off
 * the bill, role UNLOADING, active; module P before B; the lowest code.
 */
export function coolieMasterOf(masters: readonly GrnChargeMasterRow[]): GrnChargeMasterRow | null {
  const candidates = offBillMasters(masters).filter((m) => text(m.chgRole).toUpperCase() === "UNLOADING");
  for (const chgModule of ["P", "B"]) {
    const inModule = candidates.filter((m) => text(m.chgModule).toUpperCase() === chgModule);
    if (inModule.length > 0) {
      return [...inModule].sort((a, b) => text(a.chgCode).localeCompare(text(b.chgCode)))[0];
    }
  }
  // A list that does not say the module: the first UNLOADING by code.
  return candidates.length > 0 ? [...candidates].sort((a, b) => text(a.chgCode).localeCompare(text(b.chgCode)))[0] : null;
}

/** Qt `fillChargeRow`: name, method, basis, the default rate, the ledger payee. */
export function chargeFromMaster(master: GrnChargeMasterRow, key = nextChargeKey()): GrnChargeRow {
  const method = text(master.chgMethod).toUpperCase();
  const rate = num(master.chgDefaultRate);
  return {
    key,
    chgId: text(master.chgId),
    name: text(master.chgName),
    method,
    type: text(master.chgType).toUpperCase(),
    role: text(master.chgRole).toUpperCase(),
    // A FIXED charge's rate is its amount: held (and sent), not shown (Qt `cols.display`).
    rate: qtyText(rate),
    amount: "",
    typed: false,
    payeeIds: [],
    payeeNames: [],
    payeeText: "",
    ledgerName: text(master.chgLedgerName),
  };
}

/** The Payee cell (Qt): the server's split once priced, else the names, else the ledger. */
export function payeeCell(row: GrnChargeRow): string {
  if (row.payeeText) {
    return row.payeeText;
  }
  if (row.payeeNames.length > 0) {
    return row.payeeNames.join(" · ");
  }
  return ledgerPayee(row.ledgerName);
}

export function isUnloading(row: Pick<GrnChargeRow, "role">): boolean {
  return row.role === "UNLOADING";
}

export function hasUnloadingRow(rows: readonly GrnChargeRow[]): boolean {
  return rows.some(isUnloading);
}

/** Qt `chargesPayload`: a typed amount is sent as the amount; else the rate (a FIXED charge with no rate sends neither). */
export function chargesPayload(rows: readonly GrnChargeRow[]): GrnChargeDto[] {
  return rows
    .filter((row) => row.chgId)
    .map((row) => {
      const dto: GrnChargeDto = { chgId: row.chgId };
      if (row.typed) {
        dto.amount = Math.abs(num(row.amount));
      } else if (row.method !== "FIXED" || row.rate.trim() !== "") {
        dto.rate = num(row.rate);
      }
      const payees = payeesDto(row.payeeIds);
      if (payees) {
        dto.payees = payees;
      }
      return dto;
    });
}

/** "Ravi 321.00 · Kumar 321.00" — the payees as the server split the amount. */
function splitText(payees: GrnChargeWire["payees"], names: readonly string[]): string {
  return payees
    .map((payee, index) => {
      const who = names[index] || text(payee.partyName) || `payee ${index + 1}`;
      return `${who} ${money(num(payee.amount))}`;
    })
    .join(" · ");
}

/**
 * Qt `fillServerCharges`. While untouched: the server's set replaces the rows
 * (the unloading row's payees are the loadmen picked in the header — the
 * server names their staff ledgers). Touched: only the amounts and the payee
 * split, row by row in order.
 */
export function foldServerCharges(
  rows: readonly GrnChargeRow[],
  wire: readonly GrnChargeWire[],
  opts: { touched: boolean; loadmen: readonly DropdownSelection[]; masters: readonly GrnChargeMasterRow[] },
): GrnChargeRow[] {
  const loadIds = opts.loadmen.map((man) => man.id);
  const loadNames = opts.loadmen.map((man) => man.text);
  if (!opts.touched) {
    const coolie = coolieMasterOf(opts.masters);
    return wire.map((charge) => {
      const master = opts.masters.find((m) => m.chgId === charge.chgId);
      const base: GrnChargeRow = master
        ? chargeFromMaster(master)
        : {
            key: nextChargeKey(),
            chgId: charge.chgId,
            name: text(charge.chgName),
            method: text(charge.method).toUpperCase(),
            type: text(charge.type).toUpperCase(),
            role: text(charge.role).toUpperCase(),
            rate: "",
            amount: "",
            typed: false,
            payeeIds: [],
            payeeNames: [],
            payeeText: "",
            ledgerName: "",
          };
      const role = text(charge.role).toUpperCase() || base.role || (coolie && coolie.chgId === charge.chgId ? "UNLOADING" : "");
      const payees = charge.payees ?? [];
      const names = payees.map((payee) => text(payee.partyName));
      const unloading = role === "UNLOADING";
      const loadmen = payees.length > 0 && payees.length === loadIds.length && (names.join("") === "" || unloading);
      const shownNames = loadmen ? loadNames : names;
      return {
        ...base,
        name: text(charge.chgName) || base.name,
        role,
        rate: charge.rate !== undefined && charge.rate !== null ? qtyText(num(charge.rate)) : base.rate,
        amount: num(charge.amount).toFixed(2),
        payeeIds: loadmen ? [...loadIds] : payees.map((payee) => payee.partyId),
        payeeNames: [...shownNames],
        payeeText: payees.length > 0 ? splitText(payees, shownNames) : "",
      };
    });
  }
  let k = 0;
  return rows.map((row) => {
    if (!row.chgId || k >= wire.length) {
      return row;
    }
    const charge = wire[k];
    k += 1;
    const payees = charge.payees ?? [];
    return {
      ...row,
      amount: row.typed ? row.amount : num(charge.amount).toFixed(2),
      payeeText: payees.length > 0 ? splitText(payees, row.payeeNames) : row.payeeText,
    };
  });
}

// ---------------------------------------------------------------------------
// Changing the charges on the draft
// ---------------------------------------------------------------------------

/** A refusal for a charge that may not sit on a GRN ("" = it may). */
export function chargeRefusal(master: GrnChargeMasterRow): string {
  return masterOnBill(master)
    ? `${text(master.chgName)} is on the supplier's bill — it goes on the Purchase Entry, not the GRN (only our own costs here).`
    : "";
}

/**
 * Qt `ensureCoolieRow`: the operator's own set (charges touched) still owes the
 * loadmen their coolie — the row the server would have put in goes in first,
 * unless the operator took it out.
 */
export function ensureCoolieRow(draft: GrnDraft, coolie: GrnChargeMasterRow | null): GrnDraft {
  if (!coolie || !draft.chargesTouched || draft.coolieDropped || draft.loadmen.length === 0 || hasUnloadingRow(draft.charges)) {
    return draft;
  }
  const row: GrnChargeRow = {
    ...chargeFromMaster(coolie),
    role: "UNLOADING",
    payeeIds: draft.loadmen.map((man) => man.id),
    payeeNames: draft.loadmen.map((man) => man.text),
  };
  return { ...draft, charges: [row, ...draft.charges] };
}

/** Qt `addCharge`: the master's row; the unloading coolie is owed to the loadmen picked in the header. */
export function addCharge(
  draft: GrnDraft,
  master: GrnChargeMasterRow,
  coolie: GrnChargeMasterRow | null,
): { draft: GrnDraft; refusal: string } {
  const refusal = chargeRefusal(master);
  if (refusal) {
    return { draft: { ...draft, hint: refusal }, refusal };
  }
  let row = chargeFromMaster(master);
  if (isUnloading(row) && draft.loadmen.length > 0) {
    row = { ...row, payeeIds: draft.loadmen.map((man) => man.id), payeeNames: draft.loadmen.map((man) => man.text) };
  }
  const next: GrnDraft = { ...draft, charges: [...draft.charges, row], chargesTouched: true, dirty: true, hint: "" };
  return { draft: ensureCoolieRow(next, coolie), refusal: "" };
}

/** Rate or Amount typed. A typed Amount wins (sent as the amount); typing the Rate hands it back to the server. */
export function editCharge(draft: GrnDraft, key: string, field: "rate" | "amount", raw: string): GrnDraft {
  const value = raw.trim();
  return {
    ...draft,
    charges: draft.charges.map((row) => {
      if (row.key !== key) {
        return row;
      }
      if (field === "amount") {
        return { ...row, amount: value, typed: value !== "" };
      }
      if (row.method === "FIXED") {
        return row;
      }
      return { ...row, rate: value, typed: false };
    }),
    chargesTouched: true,
    dirty: true,
  };
}

/** − on a charge row. Taking out the unloading coolie remembers it (payCoolie: false). */
export function removeCharge(draft: GrnDraft, key: string): GrnDraft {
  const row = draft.charges.find((candidate) => candidate.key === key);
  if (!row) {
    return draft;
  }
  return {
    ...draft,
    charges: draft.charges.filter((candidate) => candidate.key !== key),
    chargesTouched: true,
    coolieDropped: draft.coolieDropped || isUnloading(row),
    dirty: true,
  };
}

/** The payee dialog's OK (Qt `setChargePayees`). */
export function setChargePayees(draft: GrnDraft, key: string, payees: readonly DropdownSelection[]): GrnDraft {
  return {
    ...draft,
    charges: draft.charges.map((row) =>
      row.key === key
        ? { ...row, payeeIds: payees.map((p) => p.id), payeeNames: payees.map((p) => p.text), payeeText: "" }
        : row,
    ),
    chargesTouched: true,
    dirty: true,
  };
}

/**
 * The loadmen changed (Qt ddLoadmen selectionChanged): in the operator's own
 * set the unloading row follows them; the coolie row comes back if it is due.
 */
export function loadmenChanged(draft: GrnDraft, loadmen: DropdownSelection[], coolie: GrnChargeMasterRow | null): GrnDraft {
  let next: GrnDraft = { ...draft, loadmen, dirty: true };
  if (next.chargesTouched) {
    next = {
      ...next,
      charges: next.charges.map((row) =>
        isUnloading(row)
          ? { ...row, payeeIds: loadmen.map((m) => m.id), payeeNames: loadmen.map((m) => m.text), payeeText: "" }
          : row,
      ),
    };
  }
  return ensureCoolieRow(next, coolie);
}
