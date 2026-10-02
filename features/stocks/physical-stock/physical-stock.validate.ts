/**
 * The checks a save can answer without the server (validateBeforeSave), so an
 * obviously incomplete sheet does not cost a round trip. Same order, same
 * words as the Qt screen. Pure.
 */
import { parseLocalDateTime } from "./physical-stock.format";
import { buildLines } from "./physical-stock.payload";
import type { PhysicalStockDraft } from "./physical-stock.types";

/** Which header control the refusal sends the operator back to. */
export type SaveRefusalFocus = "godown" | "docDate" | "freezeTo";

export type SaveRefusal = {
  title: string;
  message: string;
  focus?: SaveRefusalFocus;
};

function isRealDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateBeforeSave(draft: PhysicalStockDraft): SaveRefusal | null {
  if (!draft.godownId) {
    return {
      title: "Godown required",
      message: "A count is of one godown's holdings.",
      focus: "godown",
    };
  }
  if (!isRealDate(draft.docDate)) {
    return { title: "Date required", message: "Enter the count date.", focus: "docDate" };
  }
  if (!draft.deviceId) {
    return {
      title: "No device",
      message:
        "This session has no device id, and the device is what mints the sheet number. " +
        "Log in from a registered device.",
    };
  }
  if (draft.freezeStock) {
    const from = parseLocalDateTime(draft.freezeFrom);
    const to = parseLocalDateTime(draft.freezeTo);
    if (!from || !to || to.getTime() <= from.getTime()) {
      return {
        title: "Freeze window",
        message:
          "The freeze has to end after it starts — it is a wall-clock window, and an empty " +
          "one freezes nothing.",
        focus: "freezeTo",
      };
    }
  }
  if (buildLines(draft.lines).length === 0) {
    // There is always one blank row, so more than one row means holdings are
    // on screen and simply have not been counted.
    return draft.lines.length > 1
      ? {
          title: "Nothing counted yet",
          message:
            "Not one holding has a counted quantity, so there is nothing to save. Enter what " +
            "was found — 0 is a valid answer and records an empty shelf; leaving it blank " +
            "means nobody has looked yet.",
        }
      : {
          title: "No lines",
          message: "Add the holdings to count — pick an item or scan a barcode.",
        };
  }
  return null;
}
