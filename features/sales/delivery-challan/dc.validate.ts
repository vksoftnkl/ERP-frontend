/**
 * The client's own gates (Qt `validateSaveInputs`) — what needs no server to
 * know. `/delivery-challans/validate` is the authority for everything else.
 * Pure; the first refusal wins, with the field or row to put focus on.
 */
import { formatDate } from "@/lib/date-format";
import { DC_ORDER_CAP_TOLERANCE } from "./dc.constants";
import type { DcDraft } from "./dc.types";

export type DcValidationFocus =
  | { kind: "customer" }
  | { kind: "dcDate" }
  | { kind: "purpose" }
  | { kind: "salesman" }
  | { kind: "cell"; rowKey: string; field: "billQty" | "rate" | "itemName" };

export type DcValidationError = { message: string; focus: DcValidationFocus | null };

export type DcValidateOptions = {
  salesmanMandatory: boolean;
  dcRequiresOrder: boolean;
  freeItemTax: boolean;
  /** The accounting year's bounds, ISO; either missing = unchecked. */
  yearStart?: string | null;
  yearEnd?: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validateDc(draft: DcDraft, options: DcValidateOptions): DcValidationError | null {
  if (draft.mode === "browse" && !draft.amending) {
    return { message: "This challan is read-only.", focus: null };
  }
  if (!draft.customer.custId) {
    return { message: "Select a customer.", focus: { kind: "customer" } };
  }
  const dcDate = draft.header.dcDate;
  if (!ISO.test(dcDate) || Number.isNaN(Date.parse(dcDate))) {
    return { message: "Enter a valid challan date.", focus: { kind: "dcDate" } };
  }
  const { yearStart, yearEnd } = options;
  if (yearStart && yearEnd && ISO.test(yearStart) && ISO.test(yearEnd) && (dcDate < yearStart || dcDate > yearEnd)) {
    return {
      message: `Challan date ${formatDate(dcDate)} is outside the accounting year (${formatDate(yearStart)} – ${formatDate(yearEnd)}).`,
      focus: { kind: "dcDate" },
    };
  }
  if (!draft.header.purpose.trim()) {
    return { message: "Pick the purpose of this challan.", focus: { kind: "purpose" } };
  }
  if (options.salesmanMandatory && !draft.header.salesmanId) {
    return { message: "Select a salesman.", focus: { kind: "salesman" } };
  }
  let hasItem = false;
  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index];
    if (!line.itemId) continue;
    hasItem = true;
    const row = index + 1;
    if (line.billQty <= 0) {
      return { message: "Quantity cannot be zero.", focus: { kind: "cell", rowKey: line.key, field: "billQty" } };
    }
    if (line.orderQty > 0 && line.billQty > line.orderQty + DC_ORDER_CAP_TOLERANCE) {
      return {
        message: `Line ${row} exceeds the order's open quantity (${line.orderQty}).`,
        focus: { kind: "cell", rowKey: line.key, field: "billQty" },
      };
    }
    if (options.dcRequiresOrder && !line.srcLineId) {
      return {
        message: `This company sends goods against an ORDER only (sales.dc_requires_order). Line ${row} has none — draw it with Ctrl+F4.`,
        focus: { kind: "cell", rowKey: line.key, field: "itemName" },
      };
    }
    if (line.rate === 0 && !line.isFree && !options.freeItemTax) {
      return { message: "Rate cannot be zero.", focus: { kind: "cell", rowKey: line.key, field: "rate" } };
    }
  }
  if (!hasItem) {
    return { message: "Add at least one item.", focus: null };
  }
  return null;
}
