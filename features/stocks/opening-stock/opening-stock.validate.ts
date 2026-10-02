/**
 * What the screen refuses before the round trip — `validateBeforeSave()` — and
 * the notice it gives about lines that are not yet postable —
 * `missingIdentityLines()`. Same checks, same order, same words as the Qt
 * screen.
 *
 * Everything about lots, holdings and tracking beyond these is the SERVER's to
 * judge: the pre-post check answers in the engine's own words.
 */
import { isRealDate } from "@/features/sales/quotation/quotation.utils";
import { TRACK } from "./opening-stock.constants";
import { hasItem, isUnparsableDate, tracks } from "./opening-stock.lines";
import type { OpeningStockDraft, OpeningStockLine, OpeningStockViolation } from "./opening-stock.types";

/**
 * Client-side checks only — the ones that can be answered without the server,
 * so an obviously incomplete document does not cost a round trip. Returns the
 * FIRST refusal, as the Qt screen stops at the first warning.
 *
 * "Line N" is the row's place in the grid (1-based), which is what the
 * operator can see — not the line number the save will assign.
 */
export function validateBeforeSave(draft: OpeningStockDraft): OpeningStockViolation | null {
  if (!draft.header.godownId.trim()) {
    return {
      title: "Godown required",
      message: "An opening is inward — it needs the godown the stock opens in.",
      focus: { kind: "godown" },
    };
  }
  if (!isRealDate(draft.header.docDate.trim())) {
    return { title: "Date required", message: "Enter the document date.", focus: { kind: "date" } };
  }
  if (!draft.deviceId.trim()) {
    return {
      title: "No device",
      message:
        "This session has no device id, and the device is what mints the voucher number. " +
        "Log in from a registered device.",
      focus: null,
    };
  }

  let anyLine = false;
  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index];
    if (!hasItem(line)) {
      continue;
    }
    anyLine = true;
    const row = index + 1;

    if (line.qty <= 0 && line.freeQty <= 0) {
      return {
        title: "Quantity required",
        message: `Line ${row} has no quantity.`,
        focus: { kind: "cell", rowKey: line.key, field: "qty" },
      };
    }
    // svi_godown_id is NOT NULL — say which line rather than let the server
    // answer with a constraint name.
    if (!line.godownId.trim()) {
      return {
        title: "Godown missing",
        message: `Line ${row} has no godown. Choose the header godown, or re-pick the item on that line.`,
        focus: { kind: "cell", rowKey: line.key, field: "itemName" },
      };
    }
    // A date that is neither blank nor real would be dropped on the way out,
    // and Post would then refuse a blank the operator can see is filled.
    for (const field of ["mfgDate", "expiryDate"] as const) {
      if (!isUnparsableDate(line[field])) {
        continue;
      }
      return {
        title: "Date not understood",
        message: `Line ${row} has "${line[field].trim()}" where a date belongs. Dates are keyed dd-MM-yyyy — 31-03-2027.`,
        focus: { kind: "cell", rowKey: line.key, field },
      };
    }
    if (!line.uomId.trim() || !line.baseUomId.trim()) {
      return {
        title: "Unit missing",
        message: `Line ${row} has no unit. Re-pick the item — the unit and its conversion factor come with it.`,
        focus: null,
      };
    }
    // An inward posted at cost 0 drags the moving average toward zero, and
    // MANUAL derives nothing — so the cost has to be keyed.
    if (line.costRate <= 0 && draft.header.rateSource === "MANUAL") {
      return {
        title: "Cost required",
        message:
          `Line ${row} has no cost rate. An opening is inward, and a rate source of MANUAL ` +
          "derives nothing — so the cost has to be keyed.",
        focus: { kind: "cell", rowKey: line.key, field: "costPerUnit" },
      };
    }
  }

  if (!anyLine) {
    return { title: "No lines", message: "Add at least one item.", focus: null };
  }
  return null;
}

/**
 * The lines missing something their ITEM is tracked by — one
 * "Line 3  Paracetamol — batch, expiry" per line, empty when the document is
 * postable.
 *
 * It mirrors the four facets the pre-post check refuses on (batch, expiry, MRP,
 * serial) and NOT one more: sale price and supplier are tracked facets too, but
 * the check does not require them, and a warning about something the server
 * accepts is how a warning gets ignored.
 *
 * A NOTICE, never a refusal: a draft is allowed to be incomplete.
 */
export function missingIdentityLines(lines: readonly OpeningStockLine[]): string[] {
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (!hasItem(line)) {
      return;
    }
    const signature = line.trackSignature;
    const missing: string[] = [];
    if (tracks(signature, TRACK.Batch) && !line.batchNo.trim()) missing.push("batch");
    if (tracks(signature, TRACK.Expiry) && !line.expiryDate.trim()) missing.push("expiry");
    if (tracks(signature, TRACK.Mrp) && line.mrp <= 0) missing.push("MRP");
    if (tracks(signature, TRACK.Serial) && !line.serialNo.trim()) missing.push("serial no");
    if (missing.length === 0) {
      return;
    }
    out.push(`Line ${index + 1}  ${line.itemName} — ${missing.join(", ")}`);
  });
  return out;
}

/** Ctrl+Enter, F5 and F6 only mean something on a DRAFT. */
export function notADraftMessage(draft: Pick<OpeningStockDraft, "refno" | "status">): string {
  return `${draft.refno} is ${draft.status} and cannot be saved again.`;
}
