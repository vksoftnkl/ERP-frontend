/**
 * Sale Order Entry — save validation. Pure, first violation wins, and each one
 * names something the operator can be sent to.
 *
 * Everything the quotation checks plus the order's own gates (the plan's §8):
 * a real customer record (the DTO requires `soCustId`), delivery/valid-until
 * dates ≥ the order date, URGENT needs remarks, tender-row instrument rules,
 * and the credit gate — which CONFIRMS, never blocks.
 *
 * Deliberately absent: any stock gate. A back-order is legal on an order —
 * stock is reported in the hint bar, never blocked.
 */
import type { DocumentPricing } from "@/domain/pricing";
import { money } from "@/domain/pricing";
import { SESSION_CAPABILITIES } from "@/features/sales/quotation/quotation.constants";
import { accountingYearOf, isRealDate } from "@/features/sales/quotation/quotation.utils";
import type { SaleOrderDraft, SaleOrderViolation } from "./sale-order.types";
import { computeTenders } from "./tender/arithmetic";
import { instrumentSpecOf } from "./tender/instruments";
import { settledTenderRows, toArithRow } from "./sale-order.payload";

export type OrderValidationContext = {
  skipMrp?: boolean;
  /** Some deployments insist an order names its salesman. No wire source yet. */
  salesmanMandatory?: boolean;
};

/**
 * The credit gate (the plan's §7.2): judged on the SAME object the panel
 * rendered. `isCreditCheckEnabled === false` is an answer — no gate. A summary
 * that never arrived is also no gate (a failed lookup blocks nothing). The
 * result asks for confirmation; only a declined confirmation stops the save,
 * and `draft.creditOverride` remembers a granted one for this settle.
 */
export function creditGate(draft: SaleOrderDraft): SaleOrderViolation | null {
  if (draft.creditOverride) {
    return null;
  }
  const credit = draft.partyCredit;
  if (!credit || credit.isCreditCheckEnabled === false) {
    return null;
  }
  if (credit.isAmtLimitExceeded || credit.isBillLimitExceeded) {
    return {
      message: `${credit.partyName ?? "This customer"} is over their credit limit (outstanding ${credit.pendingAmount}, limit ${credit.creditAmtLimit}). Take this order anyway?`,
      field: "credit",
      confirm: true,
    };
  }
  if (credit.overdueAmount > 0) {
    return {
      message: `${credit.partyName ?? "This customer"} has ${credit.overdueAmount} overdue by ${credit.maxOverdueDays} days. Take this order anyway?`,
      field: "credit",
      confirm: true,
    };
  }
  return null;
}

export function validateSaveInputs(
  draft: SaleOrderDraft,
  pricing: DocumentPricing,
  context: OrderValidationContext = {},
): SaleOrderViolation | null {
  if (draft.isDeleted) {
    return {
      message:
        "This order is deleted and cannot be changed. Use Copy as new (Ctrl+F9) to raise a fresh one from it.",
      field: "mode",
    };
  }
  if (draft.mode !== "entry") {
    return { message: "This order is read-only — press Edit to change it.", field: "mode" };
  }
  // Unlike the quotation, `soCustId` is a required uuid: a walk-in with no
  // master record cannot hold a sale order — the advance posting needs a party
  // ledger, and customer and ledger share one primary key.
  if (!draft.customer.custId) {
    return { message: "Pick a customer from the list — an order needs one.", field: "customer" };
  }
  if (!draft.customer.name.trim()) {
    return { message: "Enter the customer name.", field: "customer" };
  }
  if (context.salesmanMandatory && !draft.header.salesmanId) {
    return { message: "Pick the salesman for this order.", field: "salesman" };
  }
  if (!isRealDate(draft.header.orderDate)) {
    return { message: "The order date is not a real calendar date.", field: "orderDate" };
  }
  const derivedAccYear = accountingYearOf(draft.header.orderDate);
  if (draft.accYear && derivedAccYear && derivedAccYear !== draft.accYear) {
    return {
      message: `The order date falls in ${derivedAccYear}, but this document belongs to ${draft.accYear}. Change the date, or switch the accounting year first.`,
      field: "orderDate",
    };
  }
  if (draft.header.deliveryDate) {
    if (!isRealDate(draft.header.deliveryDate)) {
      return { message: "The delivery date is not a real calendar date.", field: "deliveryDate" };
    }
    if (draft.header.deliveryDate < draft.header.orderDate) {
      return {
        message: "The delivery date cannot fall before the order date.",
        field: "deliveryDate",
      };
    }
  }
  if (draft.header.validUntil) {
    if (!isRealDate(draft.header.validUntil)) {
      return { message: "The validity date is not a real calendar date.", field: "validUntil" };
    }
    if (draft.header.validUntil < draft.header.orderDate) {
      return {
        message: "The order cannot expire before the day it was raised.",
        field: "validUntil",
      };
    }
  }
  // An order that jumps the queue must say why.
  if (draft.header.priority === "URGENT" && !draft.terms.remarks.trim()) {
    return {
      message: "An URGENT order needs its reason in Remarks.",
      field: "remarks",
    };
  }

  const skipMrp = context.skipMrp ?? SESSION_CAPABILITIES.skipMrp;
  let populated = 0;
  for (const line of draft.lines) {
    if (!line.itemId) {
      continue;
    }
    populated += 1;
    if (line.billQty === 0 && line.caseQty === 0) {
      return {
        message: `${line.itemName || "This line"} has no quantity.`,
        field: "billQty",
        lineKey: line.key,
      };
    }
    if (line.rate === 0 && !line.isFree) {
      return {
        message: `${line.itemName || "This line"} has no rate. Mark it free if that is intended.`,
        field: "rate",
        lineKey: line.key,
      };
    }
    if (line.minPrice > 0 && line.rate < line.minPrice && !line.isFree) {
      return {
        message: `${line.itemName || "This line"} is below its minimum price of ${line.minPrice}.`,
        field: "rate",
        lineKey: line.key,
      };
    }
    if (!skipMrp && line.mrp > 0 && line.rate > line.mrp) {
      return {
        message: `${line.itemName || "This line"} is above its MRP of ${line.mrp}.`,
        field: "rate",
        lineKey: line.key,
      };
    }
    if (line.deliveryDate && draft.header.orderDate && line.deliveryDate < draft.header.orderDate) {
      return {
        message: `${line.itemName || "This line"}'s delivery date falls before the order date.`,
        field: "deliveryDate",
        lineKey: line.key,
      };
    }
    // NO stock gate here, on purpose: back-orders are the point of the screen.
  }
  if (populated === 0) {
    return { message: "Add at least one item.", field: "items" };
  }
  if (pricing.totals.bill <= 0) {
    return { message: "The order total must be more than zero.", field: "items" };
  }
  for (const row of draft.charges) {
    if (!row.chgId) {
      continue;
    }
    if (!row.ledgerCode) {
      return {
        message: `The charge "${row.chgName || "(unnamed)"}" has no posting ledger and cannot be saved.`,
        field: "charges",
      };
    }
  }

  const tenderViolation = validateTenders(draft, pricing);
  if (tenderViolation) {
    return tenderViolation;
  }

  // Last, because it is the only gate that CONFIRMS rather than refuses: every
  // hard failure above must win over a question.
  return creditGate(draft);
}

/**
 * The advance rows' own rules. The ceiling question does not arise here — this
 * screen's dialog is `purpose="advance"` — but the instrument rules are the
 * server's own 400s said early and by name.
 */
export function validateTenders(
  draft: SaleOrderDraft,
  pricing: DocumentPricing,
): SaleOrderViolation | null {
  const rows = settledTenderRows(draft.tenders);
  if (rows.length === 0) {
    return null;
  }
  for (const row of rows) {
    if (!row.tenderId) {
      return {
        message: `The ${row.tenderName || "tender"} row is not backed by a tender master record and cannot be saved.`,
        field: "tenders",
      };
    }
    const spec = instrumentSpecOf(row.typeCode);
    if (row.typeCode === "CHEQUE") {
      if (!(row.refNo ?? "").trim()) {
        return { message: "The cheque needs its cheque number.", field: "tenders" };
      }
      if (!(row.bankName ?? "").trim()) {
        return { message: "The cheque needs its bank name.", field: "tenders" };
      }
      if (!row.instrumentDate) {
        return { message: "The cheque needs its cheque date.", field: "tenders" };
      }
      if (draft.header.orderDate && row.instrumentDate < draft.header.orderDate) {
        return {
          message: "A cheque cannot be dated before the order — it cannot mature before it arrived.",
          field: "tenders",
        };
      }
    } else if (spec.refRequired || (row.needsRef && spec.refLabel)) {
      if (!(row.refNo ?? "").trim()) {
        return {
          message: `${row.tenderName} needs its ${spec.refLabel ?? "reference"}.`,
          field: "tenders",
        };
      }
    }
  }
  // Advance mode never requires coverage, but money that exceeds the order and
  // cannot be handed back has nowhere to go.
  const computation = computeTenders(rows.map(toArithRow), pricing.totals.bill);
  if (computation.totals.balance > 0.005) {
    return {
      message: `The tenders exceed the order amount by ${money(computation.totals.balance)} and no row can give change. Reduce a row.`,
      field: "tenders",
    };
  }
  return null;
}
