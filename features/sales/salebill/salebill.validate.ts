/**
 * Sale Bill Entry — validation. Pure: no React, no API, and **nothing here may
 * be a server round trip** (§14). A save gate that has to ask the network is a
 * save gate that fails when the network does, at the counter, with a customer
 * waiting.
 *
 * The order below is the plan's, and the FIRST failure wins — the operator is
 * sent to one field, not handed a list. Every message names the row number,
 * because "quantity must be greater than zero" on a 40-line bill is not an
 * error message, it is a puzzle.
 *
 * Two of the rules are the bill's own and neither is arithmetic:
 *
 *  - **the negative-stock gate** (§7.2) — a quantity rule. The Qt screen has
 *    three incompatible versions of it; this has one, and it can also answer
 *    "unavailable", which the Qt screen cannot.
 *  - **the order-quantity cap** (§7.3) — likewise. The reducer already refuses
 *    the edit; this is the second gate, at save, for a line that arrived capped
 *    some other way.
 */
import type { DocumentPricing } from "@/domain/pricing";
import { computeTenders } from "@/features/sales/sale-order/tender/arithmetic";
import { settledTenderRows } from "@/features/sales/sale-order/sale-order.payload";
import { accountingYearOf, isRealDate } from "@/features/sales/quotation/quotation.utils";
import type { SaleBillDraft, SaleBillDraftLine, SaleBillViolation } from "./salebill.types";

/**
 * What the SCREEN knows and the draft does not: which controls the deployment
 * actually put on the form, and which operator capabilities are in force.
 */
export type BillValidationContext = {
  /** `usr_skip_mrp` — the operator may bill above MRP. */
  skipMrp?: boolean;
  /**
   * Whether a bill may exceed the order quantity it was raised against. A
   * setting, not a rule this screen invents — port the flag, not the verdict.
   */
  allowBillOverOrderQty?: boolean;
  /**
   * Whether breaching the customer's credit limit BLOCKS the save or merely
   * warns. Likewise a setting (§4.2): the server answers `isCreditCheckEnabled`
   * and this screen reports it.
   */
  enforceCreditLimit?: boolean;
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

/**
 * The negative-stock gate.
 *
 * Three outcomes, and the third is the one the Qt screen cannot express:
 *
 *  - **pass** — the item allows negative stock, or there is enough;
 *  - **fail** — it does not and there is not;
 *  - **unavailable** — the flag and the stock figure could not be established
 *    for this line, so the gate has no opinion. That happens on a loaded or
 *    imported line whose item lookup has not been re-run. Qt hard-codes
 *    `AllowNegative = "Y"` on its own load path and on the order import (gate
 *    silently OFF) and leaves it empty on the quotation import (gate ON against
 *    a month-old stock snapshot) — three behaviours for one rule. None is
 *    ported: saying the gate cannot be judged is honest, and inventing an answer
 *    in either direction is not.
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
 * The rate warning a cell shows while typing — advisory upstream, a GATE here.
 *
 * Below the minimum selling price is refused outright: this is the document that
 * takes the money and a rate under the floor is a loss the counter cannot
 * authorise. Above MRP is refused too, unless the operator carries `skipMrp` —
 * a printed MRP is a legal ceiling, not a suggestion.
 */
function priceViolation(
  draft: SaleBillDraft,
  line: SaleBillDraftLine,
  skipMrp: boolean,
): SaleBillViolation | null {
  if (line.minPrice > 0 && line.rate > 0 && line.rate < line.minPrice) {
    return lineViolation(
      draft,
      line,
      "rate",
      `the rate ${line.rate} is below the minimum selling price ${line.minPrice}.`,
    );
  }
  if (!skipMrp && line.mrp > 0 && line.rate > line.mrp) {
    return lineViolation(draft, line, "rate", `the rate ${line.rate} is above the MRP ${line.mrp}.`);
  }
  return null;
}

/**
 * The whole gate, in the plan's order. `null` means the bill may be saved.
 *
 * A violation carrying `confirm: true` is a question, not a refusal: the caller
 * puts it to the operator and may proceed on a yes.
 */
export function validateSaveInputs(
  draft: SaleBillDraft,
  pricing: DocumentPricing,
  context: BillValidationContext = {},
): SaleBillViolation | null {
  // ---- 1. a customer ------------------------------------------------------
  // `sbCustId` is REQUIRED server-side, unlike the quotation's. A walk-in has to
  // be a master record before they can be billed, so this is not the quotation's
  // "a name will do".
  if (!draft.customer.custId) {
    return { message: "Pick a customer before saving the bill.", field: "sale-bill-customer" };
  }
  if (!draft.customer.name.trim()) {
    return { message: "The customer name cannot be blank.", field: "sale-bill-customer-name" };
  }

  // ---- the document's own identity ---------------------------------------
  if (!isRealDate(draft.header.billDate)) {
    return { message: "The bill date is not a real date.", field: "sale-bill-date" };
  }
  // The accounting year is immutable after create, half the primary key AND the
  // voucher sequence's period key, so a bill dated into another year cannot be
  // filed under this one. Refused rather than silently re-tenanted.
  if (draft.accYear && accountingYearOf(draft.header.billDate) !== draft.accYear) {
    return {
      message: `The bill date falls in ${accountingYearOf(draft.header.billDate)}, but this bill is being raised in ${draft.accYear}.`,
      field: "sale-bill-date",
    };
  }

  // ---- 2. at least one item row -------------------------------------------
  const lines = draft.lines.filter((line) => Boolean(line.itemId));
  if (lines.length === 0) {
    return { message: "Add at least one item before saving the bill.", field: "items" };
  }

  // ---- 3. per row ---------------------------------------------------------
  const skipMrp = context.skipMrp === true;
  const allowOverOrder = context.allowBillOverOrderQty === true;
  for (const line of lines) {
    if (line.billQty <= 0) {
      return lineViolation(draft, line, "billQty", "the quantity must be greater than zero.");
    }
    if (!line.itemUnitId) {
      return lineViolation(draft, line, "itemUnitId", "the unit is not set — re-pick the item.");
    }
    // `sbi_godown_id` is NOT NULL and `@RequiredUuid` on the DTO. The item price
    // lookup fills it, but it can legitimately answer null, and there is no
    // godown picker yet (§18.2) — so this is the difference between a clear
    // refusal here and an opaque 400 from the server after the operator has
    // pressed save on a settled bill.
    if (!line.godownId) {
      return lineViolation(
        draft,
        line,
        "godownId",
        "no godown was resolved for this line — re-pick the item, or the server will refuse the bill.",
      );
    }
    const priced = priceViolation(draft, line, skipMrp);
    if (priced) {
      return priced;
    }
    switch (stockGateOf(line)) {
      case "fail":
        return lineViolation(
          draft,
          line,
          "billQty",
          `only ${line.stockQty ?? 0} in stock and this item does not allow negative stock.`,
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
    // The order cap. The reducer refuses the EDIT; this catches a line that
    // arrived capped some other way — an import, a recovered autosave.
    if (line.orderQtyLocked && !allowOverOrder && line.billQty > line.orderQty) {
      return lineViolation(
        draft,
        line,
        "billQty",
        `only ${line.orderQty} is still pending on the sales order — billing ${line.billQty} would over-bill it.`,
      );
    }
  }

  // ---- 4. bill amount > 0 -------------------------------------------------
  if (pricing.totals.bill <= 0) {
    return { message: "The bill amount must be greater than zero.", field: "items" };
  }

  // ---- 5. term / credit coherence ----------------------------------------
  if (draft.header.billType === "CREDIT") {
    if (draft.header.dueDays <= 0 && !draft.header.dueDate) {
      return {
        message: "A credit bill needs due days or a due date.",
        field: "sale-bill-due-days",
      };
    }
    if (draft.header.dueDate && !isRealDate(draft.header.dueDate)) {
      return { message: "The due date is not a real date.", field: "sale-bill-due-date" };
    }
    if (draft.header.dueDate && draft.header.dueDate < draft.header.billDate) {
      return {
        message: "The due date is before the bill date.",
        field: "sale-bill-due-date",
      };
    }
    if (!draft.customer.debitAllowed) {
      return {
        message: `${draft.customer.name || "This customer"} is not allowed to buy on credit. Put the bill on credit anyway?`,
        field: "sale-bill-type",
        confirm: true,
      };
    }
  }

  // ---- the credit standing (§4.2) ----------------------------------------
  // Two independent limits, either of which can be exceeded, and whether that
  // BLOCKS is a setting rather than a verdict this screen invents. Asked, not
  // refused, unless the deployment says otherwise.
  const credit = draft.partyCredit;
  if (draft.header.billType === "CREDIT" && credit && credit.isCreditCheckEnabled) {
    const breach = credit.isAmtLimitExceeded
      ? `${draft.customer.name || "This customer"} is over their credit limit (${credit.pendingAmount} outstanding against a limit of ${credit.creditAmtLimit}).`
      : credit.isBillLimitExceeded
        ? `${draft.customer.name || "This customer"} has ${credit.pendingBillCount} bills open against a limit of ${credit.creditBillLimit}.`
        : null;
    if (breach) {
      return context.enforceCreditLimit
        ? { message: breach, field: "sale-bill-type" }
        : { message: `${breach} Take the bill anyway?`, field: "sale-bill-type", confirm: true };
    }
  }

  // ---- 6. settlement ------------------------------------------------------
  // A CREDIT bill is exempt: the party debit is what stays open, and demanding
  // cover for it would make the term meaningless.
  if (draft.header.billType !== "CREDIT") {
    const settled = settledAmountOf(draft, pricing);
    // Compared in paise, as integers: `settled >= bill` on IEEE doubles refuses
    // a bill that is covered to the rupee by 1e-13.
    if (Math.round(settled * 100) < Math.round(pricing.totals.bill * 100)) {
      return {
        message: `The bill is ${pricing.totals.bill} and only ${settled} has been settled. Take the rest, adjust a credit, or put the bill on credit terms.`,
        field: "sale-bill-tender",
      };
    }
  }

  // ---- 7. the charge-role gate -------------------------------------------
  // A document that says it carries loading or freight must carry the charge row
  // that prices it. Auto-apply usually satisfies this already (§6), which is why
  // this is a save gate and not a nag.
  const roles = new Set(draft.charges.filter((row) => row.chgId).map((row) => row.role));
  if (draft.header.hasLoad && !roles.has("LOADING")) {
    return {
      message: "This bill is marked for loading but carries no loading charge row.",
      field: "charges",
    };
  }
  if (draft.header.hasFreight && !roles.has("FREIGHT")) {
    return {
      message: "This bill is marked for freight but carries no freight charge row.",
      field: "charges",
    };
  }

  return null;
}

/**
 * What has actually settled the bill: tendered money less its surcharge and any
 * change handed back, plus the credits set off against it.
 *
 * The three rules folded in here, and each is a way to get the screen wrong:
 *
 *  - **surcharge is a charge on the payment instrument**, not on the goods. It
 *    settles no part of the bill, so it nets out — otherwise a card fee makes a
 *    part-paid bill look covered.
 *  - **an adjustment is not a tender**, but it does settle: a credit note the
 *    customer holds is money already taken.
 *  - **a CREDIT tender settles the document and posts no leg** — the party debit
 *    simply stays open. It is inside `tenderAmt` like any other row.
 */
export function settledAmountOf(draft: SaleBillDraft, pricing: DocumentPricing): number {
  const rows = settledTenderRows(draft.tenders);
  const computed = computeTenders(
    rows.map((row) => ({
      key: row.key,
      keyed: row.keyed,
      allowChange: row.allowChange,
      surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
    })),
    pricing.totals.bill,
  );
  return Math.round((computed.totals.settled + totalAdjusted(draft)) * 100) / 100;
}

/** Σ of what this bill takes off the credits the customer holds (§10). */
export function totalAdjusted(draft: SaleBillDraft): number {
  return (
    Math.round(draft.adjustments.reduce((total, row) => total + (row.amount || 0), 0) * 100) / 100
  );
}

/** Σ adjusted out of ADVANCE credits only — `advanceAdjusted()` in the plan. */
export function advanceAdjusted(draft: SaleBillDraft): number {
  return (
    Math.round(
      draft.adjustments
        .filter((row) => row.credit.billType === "ADVANCE")
        .reduce((total, row) => total + (row.amount || 0), 0) * 100,
    ) / 100
  );
}

/** Σ adjusted out of credit notes (sales returns) — `noteAdjusted()`. */
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
 * The adjustment panel's own gate, run before the panel is applied rather than
 * at save: an over-adjusted credit is a mistake to catch while the operator is
 * still looking at the row it is on.
 *
 * The ceiling is the credit's `pendingAmount` as the LIST reported it. The
 * server re-reads it under a row lock at save time — another counter may have
 * spent it since — so this is the courteous check, not the authoritative one.
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
    if (row.amount > row.credit.pendingAmount) {
      return {
        message: `${row.credit.docRefno} has only ${row.credit.pendingAmount} left on it.`,
        field: "adjustments",
      };
    }
  }
  const total = totalAdjusted(draft);
  if (total > billAmount) {
    return {
      message: `Adjusting ${total} against a bill of ${billAmount} would leave the customer owed money. Reduce the adjustment, or raise a refund separately.`,
      field: "adjustments",
    };
  }
  return null;
}
