/**
 * Sale Bill Entry — the client checks before any server call (§17.3). Pure:
 * no React, no API, and **nothing here may be a server round trip**. A save
 * gate that has to ask the network is a save gate that fails when the network
 * does, at the counter, with a customer waiting.
 *
 * These exist only so the operator hears about a zero quantity before a round
 * trip. Every rule that can REFUSE a bill — credit, cash limit, PAN, stock,
 * sources, loyalty, temp credit, amounts — is a `/bills/validate` answer
 * painted in the strip, never a verdict recomputed here (§1).
 *
 * The order below is the plan's, and the FIRST failure wins — the operator is
 * sent to one field, not handed a list. Every line message names the row.
 */
import type { DocumentPricing } from "@/domain/pricing";
import { computeTenders } from "@/features/sales/sale-order/tender/arithmetic";
import { settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import { accountingYearOf, isRealDate } from "@/features/sales/quotation/quotation.utils";
import { creditExhausted } from "@/features/sales/testbill/domain/party";
import type { SaleBillDraft, SaleBillDraftLine, SaleBillViolation } from "@/features/sales/testbill/types";

/**
 * What the SCREEN knows and the draft does not: the settings in force and
 * which verb is asking.
 */
export type BillValidationContext = {
  /** `usr_skip_mrp` — the operator may bill above MRP. */
  skipMrp?: boolean;
  /** `sales.allow_bill_over_order_qty`. */
  allowBillOverOrderQty?: boolean;
  /** `sales.salesman_mandatory` → "Select a salesman." */
  salesmanMandatory?: boolean;
  /** `sales.allow_excess_tender` — skips check 7. */
  allowExcessTender?: boolean;
  /** `sales.free_item_tax` — a zero-rate line is allowed. */
  freeItemTax?: boolean;
  /**
   * The tender dialog is being opened: check 7 is SKIPPED, because re-opening
   * the tender is how a settled-plus-adjusted mismatch gets fixed.
   */
  openingTender?: boolean;
};

/** A one-based row number for the message. Blank rows are not counted. */
function rowNumberOf(draft: SaleBillDraft, lineKey: string): number {
  let seen = 0;
  for (const line of draft.lines) {
    if (!line.itemId) {
      continue;
    }
    seen += 1;
    if (line.key === lineKey) {
      return seen;
    }
  }
  return seen + 1;
}

function lineViolation(
  draft: SaleBillDraft,
  line: SaleBillDraftLine,
  field: string,
  message: string,
): SaleBillViolation {
  const row = rowNumberOf(draft, line.key);
  const name = line.itemName || "this item";
  return { message: `Row ${row} (${name}): ${message}`, field, lineKey: line.key };
}

function paise(value: number): number {
  return Math.round(value * 100);
}

/**
 * The negative-stock gate.
 *
 * Three outcomes, and the third is the one the Qt screen cannot express:
 *
 *  - **pass** — the item allows negative stock, or there is enough;
 *  - **fail** — it does not and there is not;
 *  - **unavailable** — the stock figure could not be established for this line,
 *    so the gate has no opinion. That happens on a loaded or imported line whose
 *    item lookup has not been re-run: such a line carries a current FLAG (the
 *    GET resolves it) but only a snapshot of the stock. Qt hard-codes
 *    `AllowNegative = "Y"` on its own load path and on the order import (gate
 *    silently OFF) and leaves it empty on the quotation import (gate ON against
 *    a month-old stock snapshot) — three behaviours for one rule. None is
 *    ported (§28 Q4).
 */
export type StockGate = "pass" | "fail" | "unavailable";

export function stockGateOf(line: SaleBillDraftLine): StockGate {
  if (!line.itemId || line.billQty <= 0) {
    return "pass";
  }
  if (line.allowNegative) {
    return "pass";
  }
  if (!line.stockGateResolved || line.stockQty === null) {
    return "unavailable";
  }
  // A service line has no stock to draw down, whatever the master's figure says.
  if (line.isService) {
    return "pass";
  }
  return line.billQty <= line.stockQty ? "pass" : "fail";
}

/**
 * The whole gate, in the plan's order (§17.3). `null` means the verb may go on
 * to the server. A violation carrying `confirm: true` is a question, not a
 * refusal: the caller puts it to the operator and may proceed on a yes.
 */
export function validateSaveInputs(
  draft: SaleBillDraft,
  pricing: DocumentPricing,
  context: BillValidationContext = {},
): SaleBillViolation | null {
  // ---- 1. browse ----------------------------------------------------------
  if (draft.mode === "browse") {
    return { message: "This bill is read-only.", field: "sale-bill-customer" };
  }

  // ---- 2. a customer ------------------------------------------------------
  // A name is enough: a walk-in need not be a master record first.
  if (!draft.customer.name.trim()) {
    return { message: "Select a customer.", field: "sale-bill-customer" };
  }

  // ---- 3. the date --------------------------------------------------------
  if (!isRealDate(draft.header.billDate)) {
    return { message: "Enter a valid bill date.", field: "sale-bill-date" };
  }
  // The accounting year is immutable after create, half the primary key AND
  // the voucher sequence's period key, so a bill dated into another year
  // cannot be filed under this one.
  if (draft.accYear && accountingYearOf(draft.header.billDate) !== draft.accYear) {
    const [from, to] = draft.accYear.split("-");
    return {
      message: `Bill date ${draft.header.billDate} is outside the accounting year (${from} – ${to}).`,
      field: "sale-bill-date",
    };
  }

  // ---- 4. the salesman ----------------------------------------------------
  if (context.salesmanMandatory && !draft.header.people.salesmanId) {
    return { message: "Select a salesman.", field: "sale-bill-salesmanId" };
  }

  // ---- 6. the adjust panel ------------------------------------------------
  const adjusted = totalAdjusted(draft);
  const adjustViolation = validateAdjustments(draft, pricing.totals.bill);
  if (adjustViolation) {
    return adjustViolation;
  }
  if (adjusted > 0.005 && pricing.totals.bill <= 0) {
    return {
      message: "There is nothing on this bill for the adjusted credits to settle.",
      field: "adjustments",
    };
  }

  // ---- 7. settled + adjusted vs the bill ----------------------------------
  // Skipped while OPENING the tender: re-opening settlement is how the
  // mismatch gets fixed (user 2026-09-24).
  if (!context.openingTender && !context.allowExcessTender) {
    const rows = settledTenderRows(draft.tenders);
    if (rows.length > 0) {
      const computed = computeTenders(
        rows.map((row) => ({
          key: row.key,
          keyed: row.keyed,
          allowChange: row.allowChange,
          surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
        })),
        Math.max(0, pricing.totals.bill - adjusted),
      );
      const settledPlusAdjusted = computed.totals.settled + adjusted;
      if (paise(settledPlusAdjusted) > paise(pricing.totals.bill)) {
        return {
          message:
            `This bill is settled for ${computed.totals.settled.toFixed(2)} and adjusted by ${adjusted.toFixed(2)}, ` +
            `which is more than its ${pricing.totals.bill.toFixed(2)}.\n\n` +
            "Re-open settlement (F5) so the adjustment comes off what the customer pays.",
          field: "sale-bill-tender",
        };
      }
    }
  }

  // ---- 8. the credit term -------------------------------------------------
  if (draft.header.billType === "CREDIT") {
    if (draft.header.dueDate && !isRealDate(draft.header.dueDate)) {
      return { message: "The due date is not a real date.", field: "sale-bill-due-date" };
    }
    if (draft.header.dueDate && draft.header.dueDate < draft.header.billDate) {
      return { message: "The due date is before the bill date.", field: "sale-bill-due-date" };
    }
    // `party.creditAllowed` overrides the customer-detail flag once loaded
    // (§7.3) — `applyPartyContext` already wrote it onto the snapshot. §28 Q1:
    // "put on credit anyway" is NOT offered; the save check refuses it, as the
    // server would.
    if (!draft.customer.debitAllowed) {
      return {
        message: "This customer is not allowed to buy on credit.",
        field: "sale-bill-type",
      };
    }
    // Exhausted → a CONFIRM, not a block. `/validate` is the authority. The
    // party-context flags decide when loaded (limit 0 = none, check off = no
    // gate); without them there is no figure to judge and nothing is asked.
    if (creditExhausted(draft.party?.credit)) {
      return {
        message: "The customer's credit limit or bill count is exhausted. Bill on credit anyway?",
        field: "sale-bill-type",
        confirm: true,
      };
    }
  }

  // ---- 9. per line --------------------------------------------------------
  const lines = draft.lines.filter((line) => Boolean(line.itemId));
  const skipMrp = context.skipMrp === true;
  const allowOverOrder = context.allowBillOverOrderQty === true;
  for (const line of lines) {
    if (line.billQty <= 0 && line.caseQty <= 0) {
      return lineViolation(draft, line, "billQty", "Quantity cannot be zero.");
    }
    if (line.orderQtyLocked && !allowOverOrder && line.orderQty > 0 && line.billQty > line.orderQty) {
      return lineViolation(
        draft,
        line,
        "billQty",
        `bills ${line.billQty} against an order quantity of ${line.orderQty}.`,
      );
    }
    if (!line.itemUnitId) {
      return lineViolation(draft, line, "itemUnitId", "the unit is not set — re-pick the item.");
    }
    // `sbi_godown_id` is NOT NULL and `@RequiredUuid` on the DTO. The item
    // price lookup fills it, but it can legitimately answer null, and there is
    // no godown picker yet (§18.2).
    if (!line.godownId) {
      return lineViolation(
        draft,
        line,
        "godownId",
        "no godown was resolved for this line — re-pick the item, or the server will refuse the bill.",
      );
    }
    if (!line.isFree && line.rate <= 0 && !context.freeItemTax) {
      return lineViolation(draft, line, "rate", "Rate cannot be zero.");
    }
    if (!line.isFree && line.minPrice > 0 && line.rate > 0 && line.rate < line.minPrice) {
      return lineViolation(draft, line, "rate", "Rate is below the minimum selling price.");
    }
    if (!line.isFree && !skipMrp && line.mrp > 0 && line.rate > line.mrp) {
      return lineViolation(draft, line, "rate", "Rate cannot exceed MRP.");
    }
    switch (stockGateOf(line)) {
      case "fail":
        return lineViolation(
          draft,
          line,
          "billQty",
          `only ${line.stockQty ?? 0} in stock and negative stock is not allowed.`,
        );
      case "unavailable":
        // Not a refusal — a question. The operator may know the stock is there;
        // what they may not do is be told nothing.
        return {
          ...lineViolation(
            draft,
            line,
            "billQty",
            "the stock position could not be established for this line. Re-pick the item to check it, or bill it anyway.",
          ),
          confirm: true,
        };
      default:
        break;
    }
  }

  // ---- 10. something to bill ----------------------------------------------
  if (lines.length === 0) {
    return { message: "Add at least one item.", field: "items" };
  }
  if (pricing.totals.bill <= 0) {
    return { message: "Bill amount must be greater than zero.", field: "items" };
  }

  // ---- 11. every real charge row has a ledger (§12.4) ----------------------
  const badCharge = draft.charges.find((row) => row.chgId && !row.ledgerCode);
  if (badCharge) {
    return {
      message: `Charge "${badCharge.chgName || "?"}" has no posting ledger — fix it in the charge master, or remove the line with CTRL+-.`,
      field: "charges",
    };
  }

  // ---- 12. the role gates (§17.3) ------------------------------------------
  // A document that says it carries loading or freight, priced on the items,
  // must carry the charge row that bills it. Auto-apply usually satisfies this
  // already (§12.2), which is why this is a gate and not a nag.
  const roles = new Set(draft.charges.filter((row) => row.chgId).map((row) => row.role));
  const manual = (calcType: string) => (calcType ?? "").trim().toUpperCase() === "MANUAL";
  const freightOnItems = pricing.lines.reduce((sum, line) => sum + (line.freightAmt || 0), 0);
  const loadingOnItems = pricing.lines.reduce((sum, line) => sum + (line.loadingAmt || 0), 0);
  const roleGate = (role: "FREIGHT" | "LOADING" | "UNLOADING", label: string, source: string): SaleBillViolation => ({
    message:
      `${label} of ${source} is calculated on the items, but the charges grid has no ${label} line — ` +
      `the amount would not be billed. Add the ${label} charge, or untick ${label}.`,
    field: "charges",
  });
  if (draft.header.hasFreight && !manual(draft.policy.freightCalcType) && freightOnItems > 0.005 && !roles.has("FREIGHT")) {
    return roleGate("FREIGHT", "Freight", freightOnItems.toFixed(2));
  }
  if (draft.header.hasLoad && !manual(draft.policy.loadingCalcType) && loadingOnItems > 0.005 && !roles.has("LOADING")) {
    return roleGate("LOADING", "Loading", loadingOnItems.toFixed(2));
  }
  if (draft.header.hasUnload && !manual(draft.policy.loadingCalcType) && loadingOnItems > 0.005 && !roles.has("UNLOADING")) {
    return roleGate("UNLOADING", "Unloading", loadingOnItems.toFixed(2));
  }

  return null;
}

/**
 * What has actually settled the bill: tendered money less its surcharge and any
 * change handed back, plus the credits set off against it.
 *
 *  - **surcharge is a charge on the payment instrument**, not on the goods. It
 *    settles no part of the bill, so it nets out;
 *  - **an adjustment is not a tender**, but it does settle;
 *  - **a CREDIT tender settles the document and posts no leg** — the party debit
 *    simply stays open. It is inside `tenderAmt` like any other row.
 */
export function settledAmountOf(draft: SaleBillDraft, pricing: DocumentPricing): number {
  const rows = settledTenderRows(draft.tenders);
  const adjusted = totalAdjusted(draft);
  const computed = computeTenders(
    rows.map((row) => ({
      key: row.key,
      keyed: row.keyed,
      allowChange: row.allowChange,
      surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
    })),
    Math.max(0, pricing.totals.bill - adjusted),
  );
  return Math.round((computed.totals.settled + adjusted) * 100) / 100;
}

/** Σ of what this bill takes off the credits the customer holds (§14). */
export function totalAdjusted(draft: SaleBillDraft): number {
  return (
    Math.round(draft.adjustments.reduce((total, row) => total + (row.amount || 0), 0) * 100) / 100
  );
}

/** Σ adjusted out of ADVANCE credits only — `sbAdvanceAmt` (§14.5). */
export function advanceAdjusted(draft: SaleBillDraft): number {
  return (
    Math.round(
      draft.adjustments
        .filter((row) => row.credit.billType === "ADVANCE")
        .reduce((total, row) => total + (row.amount || 0), 0) * 100,
    ) / 100
  );
}

/** Σ adjusted out of credit notes (sales returns) — `sbNoteAdjAmt`. */
export function noteAdjusted(draft: SaleBillDraft): number {
  return (
    Math.round(
      draft.adjustments
        .filter((row) => row.credit.billType === "SALES_RETURN")
        .reduce((total, row) => total + (row.amount || 0), 0) * 100,
    ) / 100
  );
}

/**
 * The adjustment panel's own gate (§14.2), run before the panel is applied
 * rather than at save. The ceiling is the credit's `pendingAmount` as the LIST
 * reported it; the server re-reads it under a row lock at save time.
 */
export function validateAdjustments(
  draft: SaleBillDraft,
  billAmount: number,
): SaleBillViolation | null {
  for (const row of draft.adjustments) {
    if (row.amount < 0) {
      return {
        message: `${row.credit.docRefno}: an adjustment cannot be negative.`,
        field: "adjustments",
      };
    }
    if (row.amount > row.credit.pendingAmount + 0.005) {
      return {
        message: `${row.credit.docRefno} has only ${row.credit.pendingAmount.toFixed(2)} left on it.`,
        field: "adjustments",
      };
    }
  }
  const total = totalAdjusted(draft);
  if (paise(total) > paise(billAmount)) {
    return {
      message: `Adjusting ${total.toFixed(2)} against a bill of ${billAmount.toFixed(2)} would leave the customer owed money. Reduce the adjustment, or raise a refund separately.`,
      field: "adjustments",
    };
  }
  return null;
}
