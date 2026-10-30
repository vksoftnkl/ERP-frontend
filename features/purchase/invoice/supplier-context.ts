/**
 * The supplier chips under Purchase Entry's header (Qt NexERP 8f2a1f4,
 * `PurchaseSupplierChips::paint`): GSTIN, MSME pay-by, the supplier's note,
 * pending POs, outstanding, bills on hold and the server's warnings. Pure — the
 * component paints what this returns.
 */
import { partyGstTypeLabel } from "@/features/masters/shared/party-master-rules";
import { money, num, text } from "../shared/purchase.format";
import type { SupplierContext } from "./invoice-header.types";

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger";

export type SupplierChip = {
  text: string;
  tone: ChipTone;
  /** The tooltip. */
  tip?: string;
};

/** ISO `yyyy-MM-dd…` → `dd/MM/yyyy`; "" when not a date. */
function shortDate(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function titleCase(value: unknown): string {
  const lower = text(value).toLowerCase();
  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

/** "1 bill", "3 bills". */
function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function supplierChips(context: SupplierContext | null | undefined): SupplierChip[] {
  if (!context) {
    return [];
  }
  const chips: SupplierChip[] = [];

  // GST
  const gstin = text(context.gstNo);
  // The word, not the stored code: UNREGISTERED → "Unregistered" (Regular, Composition, SEZ, Overseas).
  const gstType = partyGstTypeLabel(text(context.gstType));
  if (!gstin) {
    chips.push({
      text: gstType ? `${gstType} · no GSTIN` : "Unregistered",
      tone: "warning",
      tip: "No GSTIN on the supplier — no input tax credit on this bill.",
    });
  } else {
    chips.push({ text: gstType ? `GSTIN ${gstin} · ${gstType}` : `GSTIN ${gstin}`, tone: "neutral", tip: text(context.stateName) || undefined });
  }

  // MSME: micro / small manufacturers and service providers are paid within 15 / 45 days of receipt
  const msme = context.msme;
  if (msme) {
    const parts = [`MSME ${titleCase(msme.category)}`];
    if (text(msme.activity)) {
      parts.push(titleCase(msme.activity));
    }
    const payBy = shortDate(msme.payBy);
    if (payBy) {
      parts.push(msme.writtenAgreement ? "written agreement" : "no written agreement");
      parts.push(`pay by ${payBy} (${num(msme.dueDays)} days from receipt)`);
    }
    chips.push({
      text: parts.join(" · "),
      tone: payBy ? "warning" : "neutral",
      tip: text(msme.udyamNo) ? `Udyam ${text(msme.udyamNo)}` : undefined,
    });
  }

  // the supplier's note
  const note = text(context.notes);
  if (note) {
    const one = note.replace(/\s+/g, " ");
    chips.push({ text: `Supplier note: ${one.length > 70 ? `${one.slice(0, 68)}…` : one}`, tone: "info", tip: note });
  }

  // pending POs
  const pos = context.pendingPos ?? [];
  if (pos.length > 0) {
    chips.push({
      text: countOf(pos.length, "pending PO", "pending POs"),
      tone: "success",
      tip: pos.map((po) => `${po.refno} · ${shortDate(po.docDate)} · ${countOf(num(po.lines), "line", "lines")}`).join("\n"),
    });
  }

  // outstanding
  const outstanding = context.outstanding ?? {};
  const balance = num(outstanding.balance);
  const bills = num(outstanding.bills);
  if (bills > 0 || Math.abs(balance) > 0.005) {
    let label = `Outstanding ${money(Math.abs(balance))} ${balance < 0 ? "Dr" : "Cr"}`;
    if (bills > 0) {
      label += ` · ${countOf(bills, "bill", "bills")}`;
    }
    const overdue = num(outstanding.overdueBills);
    if (overdue > 0) {
      label += ` · ${overdue} overdue`;
    }
    chips.push({
      text: label,
      tone: overdue > 0 ? "warning" : "neutral",
      tip: num(outstanding.debits) > 0 ? `Bills ${money(num(outstanding.payable))} less debit notes / advances ${money(num(outstanding.debits))}` : undefined,
    });
  }
  const held = num(outstanding.billsOnHold);
  if (held > 0) {
    chips.push({ text: `${countOf(held, "bill", "bills")} on payment hold`, tone: "warning" });
  }

  // the server's warnings (licence expired, MSME date before the credit days)
  for (const warning of context.warnings ?? []) {
    chips.push({ text: text(warning.message), tone: warning.code === "MSME_DUE_BEFORE_CREDIT" ? "warning" : "danger" });
  }
  return chips;
}

/** The note that pops up when the operator picks the supplier (Qt: userPick + showNotesOnEntry). */
export function noteToShowOnPick(context: SupplierContext | null | undefined): { title: string; message: string } | null {
  const note = text(context?.notes);
  if (!context || !note || !context.showNotesOnEntry) {
    return null;
  }
  return { title: `Note on ${text(context.name) || "the supplier"}`, message: note };
}
