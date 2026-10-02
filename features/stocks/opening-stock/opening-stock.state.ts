/**
 * The Opening Stock draft — one document on screen, and every change the Qt
 * screen makes to it, as a pure reducer.
 *
 * Each action is a Qt slot or method, named after it where it has a name:
 *
 *   reset             resetScreenState()     — btnNew: start genuinely blank
 *   startNext         startNextDocument()    — after a write: the header carries over
 *   godownSet         ddGodown::selected     — + applyHeaderGodownToBlankLines()
 *   itemPicked        applyPickedItem()      — before the lookup answers
 *   itemLookupApplied fetchItemDetail() ok   — unit, factor, tax, signature; recalcRow()
 *   lineCleared       fetchItemDetail() 404  — the half-filled row is emptied
 *   barcodeResolved   resolveBarcode() ok
 *   supplierPicked    applyPickedSupplier()
 *   lineFieldSet      onGridCellEdited()     — the recalc rules per column
 *   lineInserted      addLineRow()           — a blank row ABOVE the current one
 *   lineRemoved       removeLineRow()
 *   lineSplit         splitCurrentLine()
 *   documentLoaded    applyFetchedVoucher()
 *   statusApplied     applyStatus()
 *
 * Invariants kept here rather than by every caller: the grid always ends in one
 * row with no item, and any edit marks the document dirty.
 */
import {
  DEFAULT_RATE_SOURCE,
  TRACK,
  type RateSource,
  type VoucherStatus,
} from "./opening-stock.constants";
import {
  blankLine,
  defaultBucket,
  hasItem,
  lineNumbersOf,
  newLineKey,
  normalizeSignature,
  recalcLine,
  withTrailingBlank,
} from "./opening-stock.lines";
import {
  headerFromPayload,
  lineFromPayload,
  statusOf,
  type LineProblem,
} from "./opening-stock.payload";
import { toNumber } from "@/features/sales/quotation/quotation.utils";
import type {
  OpeningStockDocumentPayload,
  OpeningStockDraft,
  OpeningStockItemLookup,
  OpeningStockLine,
  OpeningStockLineField,
  OpeningStockLineNumberField,
} from "./opening-stock.types";

/** The session's scope — what a NEW document belongs to. */
export type DraftScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};

export type OpeningStockAction =
  | { type: "reset"; scope: DraftScope; today: string }
  | { type: "startNext"; scope: DraftScope; today: string }
  | { type: "headerSet"; field: "docDate" | "usrRefno" | "remarks"; value: string }
  | { type: "rateSourceSet"; value: RateSource }
  | { type: "godownSet"; godownId: string; godownName: string }
  | { type: "itemPicked"; rowKey: string; itemId: string; itemName: string }
  | { type: "itemLookupApplied"; rowKey: string; lookup: OpeningStockItemLookup }
  | { type: "lineCleared"; rowKey: string }
  | { type: "barcodeResolved"; rowKey: string; barcode: string; itemId: string }
  | { type: "barcodeCleared"; rowKey: string }
  | { type: "supplierPicked"; rowKey: string; supplierId: string; supplierName: string }
  | { type: "supplierCleared"; rowKey: string }
  | { type: "lineFieldSet"; rowKey: string; field: OpeningStockLineField; value: string | number }
  | { type: "lineInserted"; beforeRowKey: string; newKey?: string }
  | { type: "lineRemoved"; rowKey: string }
  | { type: "lineSplit"; rowKey: string; newKey?: string }
  | {
      type: "documentLoaded";
      document: OpeningStockDocumentPayload;
      scope: Omit<DraftScope, "deviceId">;
      openForEdit: boolean;
    }
  | { type: "statusApplied"; status: string }
  | { type: "modeSet"; mode: "entry" | "browse" }
  | { type: "auditSet"; text: string }
  | { type: "problemsApplied"; problems: LineProblem[] }
  | { type: "problemsCleared" };

/** A blank screen for the session's scope — `resetScreenState()`. */
export function createDraft(scope: DraftScope, today: string): OpeningStockDraft {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    svhId: "",
    refno: "",
    status: "DRAFT",
    header: {
      docDate: today,
      godownId: "",
      godownName: "",
      rateSource: DEFAULT_RATE_SOURCE,
      usrRefno: "",
      remarks: "",
    },
    lines: [blankLine()],
    mode: "entry",
    dirty: false,
    audit: "",
  };
}

/** lblScope — "{godown} · {year}" once a godown is chosen, the year alone before. */
export function scopeLabelOf(draft: Pick<OpeningStockDraft, "header" | "accYear">): string {
  return draft.header.godownName
    ? `${draft.header.godownName} · ${draft.accYear}`
    : draft.accYear;
}

function mapLine(
  draft: OpeningStockDraft,
  rowKey: string,
  update: (line: OpeningStockLine) => OpeningStockLine,
): OpeningStockLine[] {
  return draft.lines.map((line) => (line.key === rowKey ? update(line) : line));
}

function withLines(
  draft: OpeningStockDraft,
  lines: OpeningStockLine[],
  dirty = true,
): OpeningStockDraft {
  return { ...draft, lines: withTrailingBlank(lines), dirty: dirty || draft.dirty };
}

/** Fills a line's godown from the header's — the copy every pick takes. */
function withHeaderGodown(line: OpeningStockLine, draft: OpeningStockDraft): OpeningStockLine {
  return { ...line, godownId: draft.header.godownId, godownName: draft.header.godownName };
}

const NUMBER_FIELDS = new Set<OpeningStockLineField>([
  "splitNo",
  "qty",
  "freeQty",
  "mrp",
  "salePrice",
  "costPerUnit",
  "taxPerc",
  "costRateWot",
  "landedRate",
  "weightQty",
]);

/**
 * `onGridCellEdited()`. A changed quantity, cost or tax clears the without-tax
 * rate before recalculating — otherwise `recalcLine()` would see the stale
 * figure and treat it as typed. A typed without-tax rate is recalculated from
 * as it stands. Everything else is stored and nothing is derived from it.
 */
export function applyLineEdit(
  line: OpeningStockLine,
  field: OpeningStockLineField,
  value: string | number,
): OpeningStockLine {
  let next: OpeningStockLine;
  if (NUMBER_FIELDS.has(field)) {
    const numeric = typeof value === "number" ? value : toNumber(value);
    next = { ...line, [field as OpeningStockLineNumberField]: numeric };
  } else {
    next = { ...line, [field]: typeof value === "string" ? value : String(value) };
  }
  // The operator is fixing this line; what the server said about it is stale.
  next.problem = "";

  switch (field) {
    case "qty":
    case "freeQty":
    case "costPerUnit":
    case "taxPerc":
      return recalcLine({ ...next, costRateWot: 0 });
    case "costRateWot":
      return recalcLine(next);
    default:
      return next;
  }
}

/**
 * The split's copy — `splitCurrentLine()`. Everything that identifies the ITEM
 * comes across (item, code, unit, base unit, factor, godown, bucket, cost, tax,
 * the tracking signature); everything that identifies the BATCH and the
 * quantity is left blank, because those are the whole reason for the row.
 */
export function splitCopyOf(line: OpeningStockLine, key: string = newLineKey()): OpeningStockLine {
  return {
    ...blankLine(key),
    lineNo: line.lineNo,
    itemId: line.itemId,
    itemCode: line.itemCode,
    itemName: line.itemName,
    barcode: line.barcode,
    uomId: line.uomId,
    unitName: line.unitName,
    baseUomId: line.baseUomId,
    toBaseFactor: line.toBaseFactor,
    godownId: line.godownId,
    godownName: line.godownName,
    bucket: line.bucket,
    costPerUnit: line.costPerUnit,
    costRate: line.costRate,
    costRateWot: line.costRateWot,
    taxPerc: line.taxPerc,
    decimalCount: line.decimalCount,
    trackSignature: line.trackSignature,
    splitNo: Math.max(1, Math.trunc(line.splitNo)) + 1,
  };
}

/**
 * Why a row cannot be split, or null. Only a TRACKED item can be: on an
 * untracked one every row resolves to the same lot, so a second row would be
 * the same holding twice — which is what `ux_svi_line` refuses.
 */
export function splitRefusal(
  line: OpeningStockLine | undefined,
): { kind: "info" | "warn"; title: string; message: string } | null {
  if (!line || !hasItem(line)) {
    return {
      kind: "info",
      title: "Split batch",
      message: "Stand on the line you want to split first.",
    };
  }
  const signature = line.trackSignature.trim();
  if (!signature || signature === TRACK.Nothing) {
    return {
      kind: "warn",
      title: "Nothing to split by",
      message:
        "This item is not tracked, so every row of it is the same holding. " +
        "Splitting it would key the same stock twice.",
    };
  }
  return null;
}

export function openingStockReducer(
  draft: OpeningStockDraft,
  action: OpeningStockAction,
): OpeningStockDraft {
  switch (action.type) {
    case "reset":
      return createDraft(action.scope, action.today);

    case "startNext": {
      // "That one is filed, here is the next": the godown, the date and the
      // rate source describe the RUN, not the document, and carry over.
      const fresh = createDraft(action.scope, action.today);
      return {
        ...fresh,
        header: {
          ...fresh.header,
          godownId: draft.header.godownId,
          godownName: draft.header.godownName,
          docDate: draft.header.docDate || fresh.header.docDate,
          rateSource: draft.header.rateSource,
        },
        dirty: false,
      };
    }

    case "headerSet":
      return { ...draft, header: { ...draft.header, [action.field]: action.value }, dirty: true };

    case "rateSourceSet":
      return { ...draft, header: { ...draft.header, rateSource: action.value }, dirty: true };

    case "godownSet": {
      const header = {
        ...draft.header,
        godownId: action.godownId,
        godownName: action.godownName,
      };
      // Fill in the lines that have no godown of their own; a line the operator
      // pointed somewhere else is left where it is.
      const lines = action.godownId
        ? draft.lines.map((line) =>
            hasItem(line) && !line.godownId
              ? { ...line, godownId: action.godownId, godownName: action.godownName }
              : line,
          )
        : draft.lines;
      return { ...draft, header, lines, dirty: true };
    }

    case "itemPicked": {
      // Seeded to "N" — tracks nothing — so the row is in a defined state
      // before the lookup answers instead of briefly opening every identity
      // cell. A re-pick replaces the item but keeps what was keyed against it.
      const lines = mapLine(draft, action.rowKey, (line) =>
        withHeaderGodown(
          {
            ...line,
            itemId: action.itemId,
            itemName: action.itemName,
            itemCode: "",
            barcode: "",
            splitNo: 1,
            bucket: defaultBucket(),
            trackSignature: TRACK.Nothing,
            problem: "",
          },
          draft,
        ),
      );
      return withLines(draft, lines);
    }

    case "itemLookupApplied": {
      const { lookup } = action;
      const lines = mapLine(draft, action.rowKey, (line) => {
        const factor = toNumber(lookup.toBaseFactor);
        return recalcLine({
          ...line,
          itemId: lookup.itemId || line.itemId,
          itemCode: lookup.itemCode ?? "",
          itemName: lookup.itemName || line.itemName,
          // The symbol actually scanned is what the barcode column keeps; an
          // item picked by name takes the item's own.
          barcode: line.barcode || (lookup.barcode ?? ""),
          // Both iuc_ids — conversion rows, never unit ids.
          uomId: lookup.uomId ?? "",
          unitName: lookup.unitName ?? "",
          baseUomId: lookup.baseUomId ?? "",
          // A factor of 0 would fail ck_svi_to_base_factor; 1 is the honest
          // fallback for an item whose only unit is its base.
          toBaseFactor: factor > 0 ? factor : 1,
          taxPerc: toNumber(lookup.taxPerc),
          // Lot IDENTITY, not a price: sent only when the signature tracks them.
          mrp: toNumber(lookup.mrp),
          salePrice: toNumber(lookup.salePrice),
          trackSignature: normalizeSignature(lookup.trackSignature),
        });
      });
      return withLines(draft, lines);
    }

    case "lineCleared": {
      // The lookup's 404 is an answer; the row is emptied so a half-filled
      // line cannot be saved.
      const lines = mapLine(draft, action.rowKey, (line) => blankLine(line.key));
      return withLines(draft, lines, false);
    }

    case "barcodeResolved": {
      const lines = mapLine(draft, action.rowKey, (line) =>
        withHeaderGodown(
          {
            ...line,
            barcode: action.barcode,
            itemId: action.itemId,
            splitNo: 1,
            bucket: defaultBucket(),
            trackSignature: TRACK.Nothing,
            problem: "",
          },
          draft,
        ),
      );
      return withLines(draft, lines);
    }

    case "barcodeCleared":
      return {
        ...draft,
        lines: mapLine(draft, action.rowKey, (line) => ({ ...line, barcode: "" })),
      };

    case "supplierPicked":
      return withLines(
        draft,
        mapLine(draft, action.rowKey, (line) => ({
          ...line,
          supplierId: action.supplierId,
          supplierName: action.supplierName,
          problem: "",
        })),
      );

    case "supplierCleared":
      return {
        ...draft,
        lines: mapLine(draft, action.rowKey, (line) => ({
          ...line,
          supplierId: "",
          supplierName: "",
        })),
      };

    case "lineFieldSet":
      return withLines(
        draft,
        mapLine(draft, action.rowKey, (line) => applyLineEdit(line, action.field, action.value)),
      );

    case "lineInserted": {
      const index = draft.lines.findIndex((line) => line.key === action.beforeRowKey);
      if (index < 0) {
        return draft;
      }
      const lines = [...draft.lines];
      lines.splice(index, 0, blankLine(action.newKey));
      return withLines(draft, lines);
    }

    case "lineRemoved": {
      const index = draft.lines.findIndex((line) => line.key === action.rowKey);
      // The trailing blank row is not a line.
      if (index < 0 || index === draft.lines.length - 1) {
        return draft;
      }
      return withLines(
        draft,
        draft.lines.filter((line) => line.key !== action.rowKey),
      );
    }

    case "lineSplit": {
      const index = draft.lines.findIndex((line) => line.key === action.rowKey);
      const source = draft.lines[index];
      if (index < 0 || splitRefusal(source)) {
        return draft;
      }
      const lines = [...draft.lines];
      lines.splice(index + 1, 0, splitCopyOf(source, action.newKey));
      return withLines(draft, lines);
    }

    case "documentLoaded": {
      const { header } = action.document;
      const status = statusOf(header.status);
      const lines = (action.document.lines ?? []).map((line) => lineFromPayload(line));
      // A DRAFT may be opened straight into edit; a POSTED or CANCELLED one is
      // read-only whatever was asked for.
      const editable = action.openForEdit && status === "DRAFT";
      return {
        // The document's OWN scope — a voucher raised in another year saves
        // back to the year it belongs to — and its own device.
        companyId: action.scope.companyId,
        branchId: action.scope.branchId,
        accYear: (header.accYear ?? "").trim() || action.scope.accYear,
        deviceId: header.deviceId ?? "",
        svhId: header.svhId ?? "",
        refno: header.refno ?? "",
        status,
        header: headerFromPayload(header),
        lines: withTrailingBlank(lines),
        mode: editable ? "entry" : "browse",
        dirty: false,
        audit: "",
      };
    }

    case "statusApplied": {
      const status: VoucherStatus = statusOf(action.status);
      return { ...draft, status, mode: status === "DRAFT" ? draft.mode : "browse" };
    }

    case "modeSet":
      return { ...draft, mode: action.mode };

    case "auditSet":
      return { ...draft, audit: action.text };

    case "problemsApplied": {
      const numbers = lineNumbersOf(draft.lines);
      const lines = draft.lines.map((line) => {
        const lineNo = numbers.get(line.key);
        const split = Math.max(1, Math.trunc(line.splitNo));
        const matched = action.problems.filter(
          (problem) => problem.lineNo === lineNo && problem.splitNo === split,
        );
        return { ...line, problem: matched.map((problem) => problem.message).join("\n") };
      });
      return { ...draft, lines };
    }

    case "problemsCleared":
      return {
        ...draft,
        lines: draft.lines.map((line) => (line.problem ? { ...line, problem: "" } : line)),
      };

    default:
      return draft;
  }
}
