"use client";

/**
 * The Opening Stock screen's behaviour — `OpeningStockEntry`'s slots, wired to
 * the `stock/opening` routes. The reducer (`opening-stock.state.ts`) owns what
 * a change DOES to the document; this hook owns the round trips, the questions
 * and the messages, in the Qt screen's order and words.
 *
 * ── Save and Post are different things ────────────────────────────────────
 * SAVE writes the document and nothing else — no ledger row, no lot, no
 * balance. POST is the one-way door. Save & Post is ONE request (`/create` with
 * `header.status = 'POSTED'`): the server saves, runs the pre-post check and
 * posts in one transaction, so a refused line saves nothing at all.
 *
 * After any write the screen moves on to the NEXT document, keeping the run's
 * godown, date and rate source (`startNextDocument`) — a filed document is not
 * left on screen to be keyed into twice.
 *
 * The draft is held in state AND in a ref advanced synchronously by `apply()`,
 * so a save fired straight after a cell commits (Ctrl+Enter blurs the cell
 * first) reads the committed value rather than the render before it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { formatCurrency } from "@/domain/pricing";
import {
  focusCell,
  focusFirstCell,
  focusNextStopFrom,
} from "@/features/sales/quotation/components/grid-focus";
import { accountingYearOf, isRealDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import { getUserInfo } from "@/lib/auth/session";
import { confirm } from "@/lib/confirm";
import {
  useCancelOpeningStockVoucherMutation,
  useLazyGetOpeningStockItemByBarcodeQuery,
  useLazyGetOpeningStockItemLookupQuery,
  useLazyGetOpeningStockVoucherQuery,
  useSaveOpeningStockVoucherMutation,
} from "./opening-stock.api";
import {
  LINE_IDENTITY_MAX_LENGTH,
  LINE_REMARKS_MAX_LENGTH,
  OPENING_STOCK_GRID_NAME,
  TRACK,
  type RateSource,
} from "./opening-stock.constants";
import { cancelConsequence, cancelledMessage } from "./opening-stock.list";
import {
  computeTotals,
  hasItem,
  normalizeGridDate,
  parseGridNumber,
  qtyDecimals,
  tracks,
} from "./opening-stock.lines";
import {
  buildPayload,
  describeError,
  fieldErrorsOf,
  lineFromPayload,
  lineProblemsOf,
  statusOfError,
} from "./opening-stock.payload";
import {
  createDraft,
  openingStockReducer,
  splitRefusal,
  type DraftScope,
  type OpeningStockAction,
} from "./opening-stock.state";
import { missingIdentityLines, notADraftMessage, validateBeforeSave } from "./opening-stock.validate";
import { say } from "./components/say";
import { focusCellAfterRender, focusFirstCellOfRow } from "./components/opening-stock-grid";
import type {
  GridRow,
  OpeningStockDocKey,
  OpeningStockDraft,
  OpeningStockLineField,
  OpeningStockViolation,
} from "./opening-stock.types";

/** The DOM ids the hook sends the cursor to. */
export const GODOWN_FIELD_ID = "opening-stock-godown";
export const DATE_FIELD_ID = "opening-stock-date";

export type OpeningStockBusy = "idle" | "loading" | "saving" | "posting" | "cancelling";

export type PickerState =
  | { kind: "item"; rowKey: string; query: string }
  | { kind: "supplier"; rowKey: string; query: string }
  | null;

const NUMERIC_DECIMALS: Partial<Record<OpeningStockLineField, number>> = {
  splitNo: 0,
  mrp: 2,
  salePrice: 2,
  costPerUnit: 6,
  costRateWot: 6,
  landedRate: 6,
  taxPerc: 3,
};

function focusById(id: string): void {
  window.setTimeout(() => {
    const element = document.getElementById(id) as HTMLInputElement | null;
    element?.focus();
    element?.select?.();
  }, 0);
}

/** The session's scope — what a NEW document belongs to. */
function useSessionScope(): DraftScope & { ready: boolean } {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  // `fixed.device_master.dev_id` from the login — svh_device_id is a real FK,
  // so the browser's own local uuid would match no row.
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(
    () => ({ companyId, branchId, accYear, deviceId, ready: Boolean(companyId && branchId) }),
    [accYear, branchId, companyId, deviceId],
  );
}

export type UseOpeningStockDraftOptions = {
  initialDocument?: OpeningStockDocKey;
  /** "entry" opens a loaded DRAFT for edit (still read-only for anything else). */
  initialMode: "entry" | "browse";
  /** Leave the voucher screen — back to the list. */
  onLeave: () => void;
};

export function useOpeningStockDraft({ initialDocument, initialMode, onLeave }: UseOpeningStockDraftOptions) {
  const session = useSessionScope();
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [draft, setDraft] = useState<OpeningStockDraft>(() => createDraft(session, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusyState] = useState<OpeningStockBusy>(initialDocument ? "loading" : "idle");
  const busyRef = useRef<OpeningStockBusy>(busy);
  const [picker, setPicker] = useState<PickerState>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [flagged, setFlagged] = useState<{ rowKey: string; field: string } | null>(null);

  const [loadVoucherQuery] = useLazyGetOpeningStockVoucherQuery();
  const [lookupItemQuery] = useLazyGetOpeningStockItemLookupQuery();
  const [barcodeQuery] = useLazyGetOpeningStockItemByBarcodeQuery();
  const [saveVoucher] = useSaveOpeningStockVoucherMutation();
  const [cancelVoucherMutation] = useCancelOpeningStockVoucherMutation();

  const apply = useCallback((action: OpeningStockAction) => {
    draftRef.current = openingStockReducer(draftRef.current, action);
    setDraft(draftRef.current);
  }, []);

  const setBusy = useCallback((next: OpeningStockBusy) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);

  const sessionScope = useCallback((): DraftScope => {
    const { companyId, branchId, accYear, deviceId } = sessionRef.current;
    return { companyId, branchId, accYear, deviceId };
  }, []);

  /** "That one is filed, here is the next." */
  const startNextDocument = useCallback(() => {
    apply({ type: "startNext", scope: sessionScope(), today: todayIso() });
    setFlagged(null);
    window.setTimeout(() => focusFirstCell(OPENING_STOCK_GRID_NAME, "itemName"), 0);
  }, [apply, sessionScope]);

  // ── Load ──────────────────────────────────────────────────────────────
  const loadVoucher = useCallback(
    async (key: OpeningStockDocKey, openForEdit: boolean) => {
      // The document's OWN scope, from the list row; the session is only the
      // fallback for a key assembled by hand.
      const scope = {
        companyId: key.companyId || sessionRef.current.companyId,
        branchId: key.branchId || sessionRef.current.branchId,
        accYear: key.accYear || sessionRef.current.accYear,
      };
      setBusy("loading");
      try {
        const document = await loadVoucherQuery({ ...scope, svhId: key.svhId }).unwrap();
        if (!document?.header?.svhId) {
          say("warn", "Not found", "That opening stock voucher no longer exists.");
          return;
        }
        apply({ type: "documentLoaded", document, scope, openForEdit });
        setFlagged(null);
      } catch (error) {
        say("error", "", describeError(error, "The opening stock voucher could not be loaded."));
      } finally {
        setBusy("idle");
      }
    },
    [apply, loadVoucherQuery, setBusy],
  );

  // A fresh screen belongs to the session's scope — re-seeded once the
  // business context lands, as long as nothing has been keyed yet.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (initialDocument) {
      if (!loadedRef.current) {
        loadedRef.current = true;
        void loadVoucher(initialDocument, initialMode === "entry");
      }
      return;
    }
    const current = draftRef.current;
    if (current.svhId || current.dirty) {
      return;
    }
    if (
      current.companyId !== session.companyId ||
      current.branchId !== session.branchId ||
      current.accYear !== session.accYear ||
      current.deviceId !== session.deviceId
    ) {
      apply({ type: "reset", scope: sessionScope(), today: todayIso() });
    }
  }, [apply, initialDocument, initialMode, loadVoucher, session, sessionScope]);

  // ── Header ────────────────────────────────────────────────────────────
  const setHeaderField = useCallback(
    (field: "docDate" | "usrRefno" | "remarks", value: string) => {
      apply({ type: "headerSet", field, value });
    },
    [apply],
  );

  const setRateSource = useCallback((value: RateSource) => apply({ type: "rateSourceSet", value }), [apply]);

  const setGodown = useCallback(
    (godownId: string, godownName: string) => {
      apply({ type: "godownSet", godownId, godownName });
    },
    [apply],
  );

  /**
   * The header godown is where every line's own godown is copied from, and a
   * line without one is refused at save — so an item is not picked (or
   * scanned) until it is chosen.
   */
  const requireHeaderGodown = useCallback((): boolean => {
    if (draftRef.current.header.godownId) {
      return true;
    }
    say(
      "warn",
      "Godown first",
      "Choose the godown before keying items — it is where each line's stock opens, and a line without one cannot be saved.",
    );
    focusById(GODOWN_FIELD_ID);
    return false;
  }, []);

  // ── Item lookup ───────────────────────────────────────────────────────
  /**
   * One call fills the row: unit, base unit, factor, tax and the item's
   * tracking signature as at the DOCUMENT's date. No cost, deliberately — a
   * seeded cost would switch the rate source off. A 404 is an answer (a
   * service item, no unit conversion, a unit not the item's) and empties the
   * row so a half-filled line cannot be saved.
   */
  const fetchItemDetail = useCallback(
    async (rowKey: string, itemId: string, unitId: string) => {
      if (!itemId) {
        return;
      }
      const current = draftRef.current;
      const onDate = isRealDate(current.header.docDate) ? current.header.docDate : todayIso();
      try {
        const lookup = await lookupItemQuery({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId,
          ...(unitId ? { uomId: unitId } : {}),
          onDate,
        }).unwrap();
        // A newer pick on the same row wins over this answer.
        const row = draftRef.current.lines.find((line) => line.key === rowKey);
        if (!row || row.itemId !== itemId) {
          return;
        }
        apply({ type: "itemLookupApplied", rowKey, lookup });
        if (lookup.alreadyOpened) {
          // Not a refusal: the engine's rule is per HOLDING, which this cannot
          // see — said while the operator is typing, not at post.
          apply({ type: "auditSet", text: `${lookup.itemName} already has an opening in this branch` });
        }
      } catch (error) {
        const row = draftRef.current.lines.find((line) => line.key === rowKey);
        if (row && row.itemId === itemId) {
          apply({ type: "lineCleared", rowKey });
          focusCellAfterRender(rowKey, "itemName");
        }
        say("error", "", describeError(error, "The item could not be read."));
      }
    },
    [apply, lookupItemQuery],
  );

  // ── Pickers ───────────────────────────────────────────────────────────
  const openItemPicker = useCallback(
    (rowKey: string, typed: string) => {
      if (draftRef.current.mode !== "entry" || draftRef.current.status !== "DRAFT") {
        return;
      }
      if (!requireHeaderGodown()) {
        return;
      }
      setPicker({ kind: "item", rowKey, query: typed });
    },
    [requireHeaderGodown],
  );

  const pickItem = useCallback(
    (row: GridRow) => {
      const target = picker;
      setPicker(null);
      if (!target || target.kind !== "item") {
        return;
      }
      if (!requireHeaderGodown()) {
        return;
      }
      const itemId = String(row.item_id ?? "");
      const unitId = String(row.item_uom_id ?? "");
      if (!itemId) {
        return;
      }
      const itemName = String(row.item_name_en ?? row.item_name ?? "");
      // A duplicate item is NOT a warning here: one line per batch, per MRP,
      // per bucket is the normal shape of an opening.
      apply({ type: "itemPicked", rowKey: target.rowKey, itemId, itemName });
      setFlagged(null);
      // On to the next stop from the Item cell, now that the row has an item
      // and its cells have opened.
      window.requestAnimationFrame(() =>
        window.setTimeout(() => {
          if (!focusNextStopFrom(OPENING_STOCK_GRID_NAME, target.rowKey, "itemName")) {
            focusCell(OPENING_STOCK_GRID_NAME, target.rowKey, "itemName");
          }
        }, 0),
      );
      void fetchItemDetail(target.rowKey, itemId, unitId);
    },
    [apply, fetchItemDetail, picker, requireHeaderGodown],
  );

  const openSupplierPicker = useCallback((rowKey: string, typed: string) => {
    const current = draftRef.current;
    if (current.mode !== "entry" || current.status !== "DRAFT") {
      return;
    }
    const line = current.lines.find((candidate) => candidate.key === rowKey);
    if (!line || !hasItem(line)) {
      return;
    }
    setPicker({ kind: "supplier", rowKey, query: typed });
  }, []);

  /**
   * The supplier picked onto ONE line. Refused on an item not tracked
   * supplier-wise: the engine blanks an untracked facet before it looks the lot
   * up, so the value would be accepted here and silently gone at Post.
   */
  const pickSupplier = useCallback(
    (row: GridRow) => {
      const target = picker;
      setPicker(null);
      if (!target || target.kind !== "supplier") {
        return;
      }
      const line = draftRef.current.lines.find((candidate) => candidate.key === target.rowKey);
      if (!line) {
        return;
      }
      if (!tracks(line.trackSignature, TRACK.Supplier)) {
        say(
          "info",
          "Not tracked by supplier",
          `${line.itemName} is not tracked supplier-wise, so a supplier is not part of what identifies its stock — the engine discards it at Post.`,
        );
        apply({ type: "supplierCleared", rowKey: target.rowKey });
        return;
      }
      apply({
        type: "supplierPicked",
        rowKey: target.rowKey,
        supplierId: String(row.sup_id ?? ""),
        supplierName: String(row.sup_name ?? ""),
      });
      focusCellAfterRender(target.rowKey, "supplierName");
    },
    [apply, picker],
  );

  const closePicker = useCallback(() => setPicker(null), []);

  // ── Barcode ───────────────────────────────────────────────────────────
  /**
   * The scan path: the EAN becomes the row's item and unit, then the SAME
   * lookup the picker uses fills the rest — a scanned line and a picked one
   * cannot drift apart.
   */
  const commitBarcode = useCallback(
    async (rowKey: string, barcode: string) => {
      const code = barcode.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === rowKey);
      if (!code || !line || hasItem(line) || current.mode !== "entry") {
        return;
      }
      // A scan is an item pick, so it answers to the same rule.
      if (!requireHeaderGodown()) {
        apply({ type: "barcodeCleared", rowKey });
        return;
      }
      try {
        const item = await barcodeQuery({ barcode: code, companyId: current.companyId }).unwrap();
        if (!item?.itemId) {
          return;
        }
        apply({ type: "barcodeResolved", rowKey, barcode: code, itemId: item.itemId });
        void fetchItemDetail(rowKey, item.itemId, item.unitId ?? "");
        // Straight to the quantity — the only thing left to key after a scan.
        focusCellAfterRender(rowKey, "qty");
      } catch (error) {
        // No ACTIVE item carries the code: clear it so the next scan lands in
        // an empty cell, and stay where the operator is.
        apply({ type: "barcodeCleared", rowKey });
        focusCellAfterRender(rowKey, "barcode");
        say("error", "", describeError(error, `No item carries the barcode ${code}.`));
      }
    },
    [apply, barcodeQuery, fetchItemDetail, requireHeaderGodown],
  );

  // ── Cells ─────────────────────────────────────────────────────────────
  const setLineField = useCallback(
    (rowKey: string, field: OpeningStockLineField, raw: string) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!line) {
        return;
      }
      setFlagged((current) => (current?.rowKey === rowKey ? null : current));
      switch (field) {
        case "barcode":
          apply({ type: "lineFieldSet", rowKey, field, value: raw });
          // The scan IS the item pick on a row that has none.
          if (!hasItem(line) && raw.trim()) {
            void commitBarcode(rowKey, raw);
          }
          return;
        case "batchNo":
        case "serialNo":
          // `@NullableStringStrict(100)` — held to it here rather than refused at save.
          apply({ type: "lineFieldSet", rowKey, field, value: raw.slice(0, LINE_IDENTITY_MAX_LENGTH) });
          return;
        case "remarks":
          apply({ type: "lineFieldSet", rowKey, field, value: raw.slice(0, LINE_REMARKS_MAX_LENGTH) });
          return;
        case "bucket":
          apply({ type: "lineFieldSet", rowKey, field, value: raw });
          return;
        case "mfgDate":
        case "expiryDate":
          apply({ type: "lineFieldSet", rowKey, field, value: normalizeGridDate(raw) });
          return;
        default: {
          const decimals =
            field === "qty" || field === "freeQty" || field === "weightQty"
              ? qtyDecimals(line)
              : (NUMERIC_DECIMALS[field] ?? 6);
          const value = parseGridNumber(raw, decimals);
          // Refused like the validator refuses it: the cell keeps what it had.
          if (value === null) {
            return;
          }
          apply({ type: "lineFieldSet", rowKey, field, value });
        }
      }
    },
    [apply, commitBarcode],
  );

  // ── Rows ──────────────────────────────────────────────────────────────
  const editableNow = useCallback(
    () => draftRef.current.mode === "entry" && draftRef.current.status === "DRAFT",
    [],
  );

  /** + Line — a blank row ABOVE the current one. */
  const insertLine = useCallback(
    (rowKey: string | null) => {
      if (!editableNow()) {
        return;
      }
      const lines = draftRef.current.lines;
      const anchor = rowKey ?? lines[lines.length - 1]?.key;
      if (!anchor) {
        return;
      }
      const newKey = `osl-new-${Date.now()}`;
      apply({ type: "lineInserted", beforeRowKey: anchor, newKey });
      focusFirstCellOfRow(newKey);
    },
    [apply, editableNow],
  );

  /** - Line — never the trailing blank row, and only once the operator says so. */
  const removeLine = useCallback(
    async (rowKey: string | null) => {
      if (!editableNow() || !rowKey) {
        return;
      }
      const lines = draftRef.current.lines;
      const index = lines.findIndex((line) => line.key === rowKey);
      if (index < 0 || index === lines.length - 1) {
        return;
      }
      const description = lines[index].itemName;
      const confirmed = await confirm({
        title: "Remove line",
        message: `Remove "${description}" from this opening?`,
        confirmLabel: "Remove",
        cancelLabel: "No",
      });
      if (!confirmed) {
        return;
      }
      apply({ type: "lineRemoved", rowKey });
      const next = draftRef.current.lines[Math.min(index, draftRef.current.lines.length - 1)];
      if (next) {
        focusFirstCellOfRow(next.key);
      }
    },
    [apply, editableNow],
  );

  /** Split batch — another allocation of the SAME line, from another batch. */
  const splitLine = useCallback(
    (rowKey: string | null) => {
      if (!editableNow()) {
        return;
      }
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      const refusal = splitRefusal(line);
      if (refusal || !line) {
        say(refusal?.kind ?? "info", refusal?.title ?? "Split batch", refusal?.message ?? "");
        return;
      }
      const newKey = `osl-split-${Date.now()}`;
      apply({ type: "lineSplit", rowKey: line.key, newKey });
      focusCellAfterRender(newKey, "qty");
    },
    [apply, editableNow],
  );

  /**
   * F4 — the unit. Deliberately not a server round trip: changing the unit
   * would have to carry the base quantity with it, so the unit comes with the
   * item and is not switched afterwards.
   */
  const switchUnit = useCallback(() => {
    if (!editableNow()) {
      return;
    }
    say(
      "info",
      "Unit",
      "Pick the unit with the item. Changing it afterwards would have to re-derive the base quantity, and the base quantity is what the document is valued on.",
    );
  }, [editableNow]);

  // ── Save / Post ───────────────────────────────────────────────────────
  const focusViolation = useCallback((violation: OpeningStockViolation) => {
    const focus = violation.focus;
    if (!focus) {
      return;
    }
    if (focus.kind === "godown") {
      focusById(GODOWN_FIELD_ID);
    } else if (focus.kind === "date") {
      focusById(DATE_FIELD_ID);
    } else {
      setFlagged({ rowKey: focus.rowKey, field: focus.field });
      focusCellAfterRender(focus.rowKey, focus.field);
    }
  }, []);

  const saveAndPost = useCallback(async () => {
    const current = draftRef.current;
    // The identity the engine refuses on, caught before the round trip.
    const pending = missingIdentityLines(current.lines);
    if (pending.length) {
      say(
        "warn",
        "This opening cannot be posted",
        `Nothing was saved. These lines still need what their item is tracked by:\n\n${pending.join("\n")}\n\nFix them and post again, or Save Draft to keep the work for later.`,
      );
      return;
    }
    const totals = computeTotals(current.lines);
    const what = current.refno || "this opening";
    const confirmed = await confirm({
      title: `Post ${what}?`,
      message:
        "Posting writes the stock ledger and freezes this document. It cannot be edited afterwards — only cancelled.",
      note: `${totals.lines} lines · qty ${formatCurrency(totals.qty, 3, true)} · value ${formatCurrency(totals.value, 2, true)}`,
      confirmLabel: "Post",
      cancelLabel: "No",
      iconVariant: "replace",
    });
    if (!confirmed) {
      return;
    }
    setBusy("posting");
    apply({ type: "problemsCleared" });
    try {
      const result = await saveVoucher(buildPayload(draftRef.current, { post: true })).unwrap();
      const refno = result.header?.refno ?? "";
      say("success", "Posted", `${refno} posted — ${result.rowsPosted ?? 0} ledger rows written.`);
      // Posting is the end of this document; Cancel is reached through the list.
      startNextDocument();
    } catch (error) {
      // 422 = the pre-post check refused: one entry per bad line, in the
      // engine's own words. The transaction rolled back, so the screen is
      // exactly as the operator left it — the lines are marked where they are.
      const errors = fieldErrorsOf((error as { data?: unknown } | null)?.data);
      if (statusOfError(error) !== 422 || errors.length === 0) {
        say("error", "", describeError(error, "The opening could not be posted."));
        return;
      }
      apply({ type: "problemsApplied", problems: lineProblemsOf(errors) });
      const problems = errors.map((entry) => entry.message ?? "").filter(Boolean);
      say(
        "warn",
        "This opening cannot be posted",
        `Nothing was saved. ${problems.length} of the lines have to be fixed first:\n\n${problems.join("\n")}`,
      );
    } finally {
      setBusy("idle");
    }
  }, [apply, saveVoucher, setBusy, startNextDocument]);

  const saveDraft = useCallback(
    async (postAfterwards: boolean) => {
      if (busyRef.current !== "idle") {
        return;
      }
      const current = draftRef.current;
      if (current.status !== "DRAFT") {
        say("warn", "Not a draft", notADraftMessage(current));
        return;
      }
      const violation = validateBeforeSave(current);
      if (violation) {
        say("warn", violation.title, violation.message);
        focusViolation(violation);
        return;
      }
      if (postAfterwards) {
        await saveAndPost();
        return;
      }
      setBusy("saving");
      try {
        const result = await saveVoucher(buildPayload(current)).unwrap();
        const refno = result.header?.refno ?? "";
        // Read from the server's answer — it owns the lines now.
        const pending = missingIdentityLines((result.lines ?? []).map((line) => lineFromPayload(line)));
        if (pending.length) {
          say(
            "info",
            "Saved",
            `${refno} saved as a draft. No stock has moved.\n\nThese lines still need what their item is tracked by, and Post will refuse the document until they have it:\n\n${pending.join("\n")}`,
          );
        } else {
          say("success", "Saved", `${refno} saved as a draft. No stock has moved.`);
        }
        startNextDocument();
      } catch (error) {
        say("error", "", describeError(error, "The opening could not be saved."));
      } finally {
        setBusy("idle");
      }
    },
    [focusViolation, saveAndPost, saveVoucher, setBusy, startNextDocument],
  );

  // ── Cancel ────────────────────────────────────────────────────────────
  /**
   * Cancel writes reversing rows; it never deletes. A DRAFT can be cancelled
   * too — nothing moved, so nothing is reversed, but the document stays in the
   * list saying why it was abandoned. Only an unsaved screen and an
   * already-cancelled document are refused here.
   */
  const requestCancel = useCallback(() => {
    if (busyRef.current !== "idle") {
      return;
    }
    const current = draftRef.current;
    if (!current.svhId) {
      say(
        "warn",
        "Nothing to cancel",
        "This opening has not been saved yet, so there is no document to cancel. Close it, or start a new one.",
      );
      return;
    }
    if (current.status === "CANCELLED") {
      say("warn", "Already cancelled", `${current.refno} has been cancelled already.`);
      return;
    }
    setReasonOpen(true);
  }, []);

  const closeReason = useCallback(() => setReasonOpen(false), []);

  const acceptCancelReason = useCallback(
    async (reason: string) => {
      setReasonOpen(false);
      const current = draftRef.current;
      const wasPosted = current.status === "POSTED";
      const [message, note] = cancelConsequence(wasPosted).split("\n\n");
      const confirmed = await confirm({
        title: `Cancel ${current.refno}?`,
        message,
        note,
        confirmLabel: "Cancel voucher",
        cancelLabel: "No",
      });
      if (!confirmed) {
        return;
      }
      setBusy("cancelling");
      try {
        const result = await cancelVoucherMutation({
          svhId: current.svhId,
          accYear: current.accYear,
          companyId: current.companyId,
          branchId: current.branchId,
          reason,
        }).unwrap();
        apply({ type: "statusApplied", status: result.header?.status ?? result.status ?? "CANCELLED" });
        say("success", "Cancelled", cancelledMessage(current.refno, wasPosted));
        // The last thing that can happen to this document; it stays in the
        // list, badged.
        startNextDocument();
      } catch (error) {
        // A posted opening whose stock has since been sold is REFUSED (409) —
        // reported as-is: the fix is an adjustment, not a retry.
        say("error", "", describeError(error, "The opening could not be cancelled."));
      } finally {
        setBusy("idle");
      }
    },
    [apply, cancelVoucherMutation, setBusy, startNextDocument],
  );

  // ── Screen ────────────────────────────────────────────────────────────
  /** Edit — F2. Only a DRAFT; a posted document is refused here, before a grid is retyped. */
  const edit = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "DRAFT") {
      say(
        "warn",
        "Posted document",
        `${current.refno} is ${current.status}. A posted document cannot be edited — cancel it and enter a new one, or raise an adjustment.`,
      );
      return;
    }
    apply({ type: "modeSet", mode: "entry" });
  }, [apply]);

  /** New — throw this away and start genuinely blank. */
  const newDocument = useCallback(async () => {
    if (
      draftRef.current.dirty &&
      !(await confirm({
        title: "Discard entry",
        message: "This document has unsaved changes. Start a new one anyway?",
        confirmLabel: "Discard",
        cancelLabel: "No",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    apply({ type: "reset", scope: sessionScope(), today: todayIso() });
    setFlagged(null);
  }, [apply, sessionScope]);

  /** Close — Esc. */
  const close = useCallback(async () => {
    if (
      draftRef.current.dirty &&
      !(await confirm({
        title: "Discard entry",
        message: "This opening has unsaved changes. Close it anyway?",
        confirmLabel: "Discard",
        cancelLabel: "No",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    onLeave();
  }, [onLeave]);

  /** Show List — F8. Opening another document replaces this one, so it asks what Close asks. */
  const showList = useCallback(async () => {
    if (
      draftRef.current.dirty &&
      !(await confirm({
        title: "Open opening stock",
        message: "This opening has unsaved changes. Discard it and open another?",
        confirmLabel: "Discard",
        cancelLabel: "No",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    onLeave();
  }, [onLeave]);

  const totals = useMemo(() => computeTotals(draft.lines), [draft.lines]);

  return {
    draft,
    totals,
    busy,
    flagged,
    picker,
    reasonOpen,
    session,
    setHeaderField,
    setRateSource,
    setGodown,
    openItemPicker,
    pickItem,
    openSupplierPicker,
    pickSupplier,
    closePicker,
    commitBarcode,
    setLineField,
    insertLine,
    removeLine,
    splitLine,
    switchUnit,
    saveDraft,
    requestCancel,
    closeReason,
    acceptCancelReason,
    edit,
    newDocument,
    close,
    showList,
  };
}

export type OpeningStockDraftApi = ReturnType<typeof useOpeningStockDraft>;
