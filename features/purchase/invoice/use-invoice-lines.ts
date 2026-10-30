"use client";

/**
 * Purchase Entry (menu 24) — the line work Qt NexERP 0fbe19c..e0c56ef added
 * that needs the network, kept beside the draft hook (which calls it):
 *
 * - the session's line rules: Sell A–D when purchase.allow_price_update +
 *   UPDATE_PRICES (`/purchase/invoices/settings`), Size · Colour · Model when
 *   stock.auto_batch_no is on (the effective settings), and the two pick-lists;
 * - the item context (`/purchase/lookup/item-context`, B9), cached per item ×
 *   unit × supplier and forgotten whenever a bill is loaded or written — the
 *   item strip, a new line's rate (ENT-02) and the scheme's Free (ENT-07) all
 *   read it;
 * - an unknown barcode offered as the picked item's EAN (ENT-16);
 * - From GRN (R4) and From PO (DOC-04);
 * - F4 (the line's next unit), F12 (its batches / serials) and the textile picks.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  useRunOpeningStockChoicePageMutation,
  type BatchDetailChoiceRow,
} from "@/features/stocks/opening-stock/opening-stock.api";
import { CHOICE_MAX_PAGES, CHOICE_PAGE_SIZE } from "@/features/stocks/opening-stock/opening-stock.constants";
import type { BatchDetailChoice } from "@/features/stocks/opening-stock/opening-stock.types";
import { useOpeningStockSettings } from "@/features/stocks/opening-stock/use-opening-stock-settings";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { useGetPurchaseSettingsQuery } from "../shared/purchase.api";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import { purchaseRefusalText } from "../shared/purchase.format";
import {
  usePurchaseInvoiceCreateEanMutation,
  usePurchaseInvoiceGrnLinesMutation,
  usePurchaseInvoiceItemContextMutation,
  usePurchaseInvoiceItemLookupMutation,
  usePurchaseInvoicePoLinesMutation,
  usePurchaseInvoiceSwitchUomMutation,
} from "./invoice.api";
import { COL, COLOUR_DROPDOWN_KEY, SIZE_DROPDOWN_KEY, STATUS } from "./invoice.constants";
import {
  grnChoices,
  lineDefaultsFrom,
  linesFromGrn,
  linesFromPo,
  poChoices,
  schemeOf,
  type SourceChoice,
} from "./invoice-lines";
import { isEditable, rowFromGrn, rowFromPo, rowHasItem, type InvoiceAction } from "./invoice.state";
import type { InvoiceDraft, PurchaseGrnLine, PurchaseItemContext, PurchasePoPendingLine } from "./invoice.types";

type FocusRequester = (request: { target: "cell"; key: string; column: number }) => void;

export type InvoiceLineSupportArgs = {
  draft: InvoiceDraft;
  draftRef: MutableRefObject<InvoiceDraft>;
  run: (action: InvoiceAction) => void;
  requestFocus: FocusRequester;
};

export type TextileChoices = { sizes: readonly BatchDetailChoice[]; colours: readonly BatchDetailChoice[] };

const NO_CHOICES: readonly BatchDetailChoice[] = [];

function choiceOf(row: BatchDetailChoiceRow, prefix: "isz" | "icl"): BatchDetailChoice | null {
  const id = String(row[`${prefix}_id`] ?? "").trim();
  const name = String(row[`${prefix}_name`] ?? "").trim();
  return id && name ? { id, name } : null;
}

function lineCount(n: number): string {
  return n === 1 ? "1 line" : `${n} lines`;
}

export function useInvoiceLineSupport({ draft, draftRef, run, requestFocus }: InvoiceLineSupportArgs) {
  const { companyId, branchId } = draft;

  // ------------------------------------------------------- the line rules
  const { data: purchaseSettings } = useGetPurchaseSettingsQuery({ companyId, branchId }, { skip: !companyId || !branchId });
  const { settings: stockSettings } = useOpeningStockSettings(companyId, branchId);
  const priceUpdate = Boolean(purchaseSettings?.allowPriceUpdate && purchaseSettings.priceUpdate === "UPDATE_PRICES");
  const autoBatchNo = Boolean(stockSettings.autoBatchNo);
  useEffect(() => {
    run({ type: "lineSettings", settings: { priceUpdate, autoBatchNo } });
  }, [autoBatchNo, priceUpdate, run]);

  // ----------------------------------------- the Size / Colour pick-lists
  const sizeDropdownId = useDropdownId(SIZE_DROPDOWN_KEY);
  const colourDropdownId = useDropdownId(COLOUR_DROPDOWN_KEY);
  const [runChoicePage] = useRunOpeningStockChoicePageMutation();
  const [choiceState, setChoiceState] = useState<{ key: string; sizes: readonly BatchDetailChoice[]; colours: readonly BatchDetailChoice[] }>({
    key: "",
    sizes: NO_CHOICES,
    colours: NO_CHOICES,
  });
  const choicesKey = autoBatchNo && companyId ? companyId : "";
  useEffect(() => {
    if (!choicesKey) {
      return;
    }
    let active = true;
    // dropdown 70 / 71, page by page (/dropdown-details/run caps a page at 100); silent on a failure (Qt)
    const load = async (dropdownId: string, prefix: "isz" | "icl"): Promise<BatchDetailChoice[]> => {
      const out: BatchDetailChoice[] = [];
      if (!dropdownId) {
        return out;
      }
      for (let page = 1; page <= CHOICE_MAX_PAGES; page += 1) {
        const rows = await runChoicePage({ dropdownId, companyId: choicesKey, page }).unwrap();
        for (const row of rows) {
          const choice = choiceOf(row, prefix);
          if (choice) {
            out.push(choice);
          }
        }
        if (rows.length < CHOICE_PAGE_SIZE) {
          break;
        }
      }
      return out;
    };
    void Promise.all([load(sizeDropdownId, "isz").catch(() => []), load(colourDropdownId, "icl").catch(() => [])]).then(
      ([sizes, colours]) => {
        if (active) {
          setChoiceState({ key: choicesKey, sizes, colours });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [choicesKey, colourDropdownId, runChoicePage, sizeDropdownId]);
  const choices: TextileChoices = useMemo(
    () =>
      choiceState.key === choicesKey && choicesKey
        ? { sizes: choiceState.sizes, colours: choiceState.colours }
        : { sizes: NO_CHOICES, colours: NO_CHOICES },
    [choiceState, choicesKey],
  );

  // ------------------------------------------------------- item context
  const [contextMutation] = usePurchaseInvoiceItemContextMutation();
  const contextCache = useRef(new Map<string, Promise<PurchaseItemContext | null>>());
  /** Bumped whenever the cache is dropped — the item strip asks again. */
  const [contextEpoch, setContextEpoch] = useState(0);
  const contextFor = useCallback(
    (itemId: string, uomId: string): Promise<PurchaseItemContext | null> => {
      const current = draftRef.current;
      const key = `${itemId}|${uomId}|${current.supplierId}`;
      const cached = contextCache.current.get(key);
      if (cached) {
        return cached;
      }
      const asked = contextMutation({
        companyId: current.companyId,
        branchId: current.branchId,
        itemId,
        ...(uomId ? { uomId } : {}),
        ...(current.supplierId ? { supplierId: current.supplierId } : {}),
        onDate: current.docDate || todayIso(),
      })
        .unwrap()
        .then((context) => context ?? null)
        .catch(() => {
          contextCache.current.delete(key);
          return null;
        });
      contextCache.current.set(key, asked);
      return asked;
    },
    [contextMutation, draftRef],
  );

  /** Qt `m_itemStrip->forget()` in `applyLoaded`: a save / post / cancel moves stock and last purchases. */
  const pendingEan = useRef<{ key: string; code: string } | null>(null);
  const forgetContext = useCallback(() => {
    contextCache.current.clear();
    pendingEan.current = null;
    setContextEpoch((epoch) => epoch + 1);
  }, []);

  // ---------------------------------------------------------- ENT-07 scheme
  const applyScheme = useCallback(
    async (key: string) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || rowFromGrn(line) || !current.supplierId || !isEditable(current)) {
        return;
      }
      const supplierId = current.supplierId;
      const context = await contextFor(line.itemId, line.uomId);
      if (!context || draftRef.current.supplierId !== supplierId) {
        return; // no context: no scheme; the supplier changed meanwhile
      }
      run({ type: "schemeFree", key, itemId: line.itemId, scheme: schemeOf(context) });
    },
    [contextFor, draftRef, run],
  );

  // -------------------------------------------------------- ENT-02 defaults
  const applyLineDefaults = useCallback(
    async (key: string) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || line.rate.trim() || rowFromGrn(line) || rowFromPo(line)) {
        return;
      }
      const itemId = line.itemId;
      const context = await contextFor(itemId, line.uomId);
      const now = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!now || now.itemId !== itemId) {
        return;
      }
      const defaults = lineDefaultsFrom(context, now.unitName, draftRef.current.supplierId);
      if (defaults) {
        run({ type: "lineDefaults", key, itemId, ...defaults });
      }
    },
    [contextFor, draftRef, run],
  );

  // ------------------------------------------------------------ ENT-16 EAN
  const [createEanMutation] = usePurchaseInvoiceCreateEanMutation();
  /** A scanned code was not ours: pick its item in the Item cell, then it is offered as the item's barcode. */
  const barcodeNotFound = useCallback(
    (key: string, code: string) => {
      pendingEan.current = { key, code };
      run({
        type: "hint",
        hint: `Barcode ${code} not found — pick the item in the Item cell; it is then offered as that item's new barcode.`,
      });
      requestFocus({ target: "cell", key, column: COL.Item });
    },
    [requestFocus, run],
  );
  const offerNewEan = useCallback(
    async (key: string) => {
      const pending = pendingEan.current;
      if (!pending || pending.key !== key) {
        return;
      }
      pendingEan.current = null;
      const line = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line)) {
        return;
      }
      const yes = await confirm({
        title: "New barcode",
        message: `Save ${pending.code} as a barcode of ${line.itemName || "this item"} (${line.unitName || "its unit"})? The next scan finds it.`,
        confirmLabel: "Save barcode",
      });
      if (!yes) {
        return;
      }
      try {
        await createEanMutation({ itemId: line.itemId, uomId: line.uomId, code: pending.code }).unwrap();
        run({ type: "barcodeSaved", key, code: pending.code });
      } catch (error) {
        run({ type: "hint", hint: `Barcode ${pending.code} not saved: ${purchaseRefusalText(error).split("\n")[0]}` });
      }
    },
    [createEanMutation, draftRef, run],
  );

  /** What follows an item picked on a line (Qt `fetchItem`, not quiet). */
  const afterItemPicked = useCallback(
    (key: string) => {
      void applyLineDefaults(key);
      void applyScheme(key); // fetched now, so typing the qty fills Free at once
      void offerNewEan(key);
    },
    [applyLineDefaults, applyScheme, offerNewEan],
  );

  /** What follows a typed cell (Qt `onCellEdited`). */
  const afterCellEdited = useCallback(
    (key: string, column: number) => {
      if (column === COL.Billed) {
        void applyScheme(key);
      }
    },
    [applyScheme],
  );

  // ------------------------------------------------ From GRN / From PO
  const [grnLinesMutation] = usePurchaseInvoiceGrnLinesMutation();
  const [poLinesMutation] = usePurchaseInvoicePoLinesMutation();
  const [lookupMutation] = usePurchaseInvoiceItemLookupMutation();
  const isDraft = draft.status === STATUS.draft;
  const sourceKey = isDraft && draft.supplierId && companyId ? `${companyId}|${branchId}|${draft.supplierId}|${draft.piId}` : "";
  const [grnState, setGrnState] = useState<{ key: string; lines: PurchaseGrnLine[] }>({ key: "", lines: [] });
  const [poState, setPoState] = useState<{ key: string; lines: PurchasePoPendingLine[] }>({ key: "", lines: [] });
  const [sourceTick, setSourceTick] = useState(0);
  useEffect(() => {
    if (!sourceKey) {
      return;
    }
    const [company, branch, supplierId, piId] = sourceKey.split("|");
    let active = true;
    grnLinesMutation({ companyId: company, branchId: branch, supplierId, ...(piId ? { piId } : {}) })
      .unwrap()
      .then((lines) => {
        if (active) {
          setGrnState({ key: sourceKey, lines });
        }
      })
      .catch((error) => {
        if (active) {
          toast.apiError(error);
        }
      });
    // No PO list: the bill is keyed direct (Qt is silent too).
    poLinesMutation({ companyId: company, branchId: branch, supplierId })
      .unwrap()
      .then((lines) => {
        if (active) {
          setPoState({ key: sourceKey, lines });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [grnLinesMutation, poLinesMutation, sourceKey, sourceTick]);
  const grnLines = useMemo(() => (grnState.key === sourceKey && sourceKey ? grnState.lines : []), [grnState, sourceKey]);
  const poLines = useMemo(() => (poState.key === sourceKey && sourceKey ? poState.lines : []), [poState, sourceKey]);
  const grnOptions: SourceChoice[] = useMemo(() => grnChoices(grnLines), [grnLines]);
  const poOptions: SourceChoice[] = useMemo(() => poChoices(poLines), [poLines]);
  /** Ask the server again (a GRN posted elsewhere meanwhile). */
  const reloadSources = useCallback(() => setSourceTick((tick) => tick + 1), []);

  /** Qt `fillFromGrn` — returns how many lines came in (Purchase Entry then drops its off-bill charges). */
  const fillFromGrn = useCallback(
    (grnId: string): number => {
      const current = draftRef.current;
      if (!grnId || !isEditable(current)) {
        return 0;
      }
      const have = new Set(current.lines.filter(rowFromGrn).map((line) => line.grnItemId));
      const { lines, blocked, returned } = linesFromGrn(grnLines, grnId, have);
      let hint = lines.length
        ? `${lineCount(lines.length)} from the GRN — check Billed and Rate against the supplier's bill.`
        : "Every billable line of that GRN is already on this bill.";
      if (returned.length > 0) {
        hint += `\n${returned.join("; ")}. If the bill charges for it, the line shows REJECTED and Post raises the debit note.`;
      }
      if (blocked.length > 0) {
        hint += `\nNot brought in: ${blocked.join("; ")}`;
      }
      run({ type: "addSourceLines", lines, hint });
      return lines.length;
    },
    [draftRef, grnLines, run],
  );

  /** Qt `fillFromPo` — the PO's pending lines, then each line's unit facts (quietly). */
  const fillFromPo = useCallback(
    (poId: string): number => {
      const current = draftRef.current;
      if (!poId || !isEditable(current)) {
        return 0;
      }
      const have = new Set(current.lines.filter(rowFromPo).map((line) => line.poItemId));
      const lines = linesFromPo(poLines, poId, have);
      run({
        type: "addSourceLines",
        lines,
        hint: lines.length
          ? `${lineCount(lines.length)} from the PO — change Billed / Rate to what the supplier's bill says.`
          : "Every pending line of that PO is already on this bill.",
      });
      const added = new Set(lines.map((line) => line.poItemId));
      const after = draftRef.current;
      for (const line of after.lines) {
        if (!line.poItemId || !added.has(line.poItemId)) {
          continue;
        }
        void lookupMutation({
          companyId: after.companyId,
          branchId: after.branchId,
          itemId: line.itemId,
          uomId: line.uomId,
          onDate: after.docDate || todayIso(),
        })
          .unwrap()
          .then((item) => {
            if (item?.itemId) {
              run({ type: "applyItem", key: line.key, item, source: true });
            }
          })
          .catch(() => undefined);
      }
      return lines.length;
    },
    [draftRef, lookupMutation, poLines, run],
  );

  // ------------------------------------------------------------------ F4
  const [switchUomMutation] = usePurchaseInvoiceSwitchUomMutation();
  const cycleUnit = useCallback(
    async (key: string | null) => {
      const current = draftRef.current;
      const index = current.lines.findIndex((candidate) => candidate.key === key);
      const line = current.lines[index];
      if (!key || !line || !rowHasItem(line) || !isEditable(current)) {
        return;
      }
      const lineNo = index + 1;
      if (rowFromGrn(line)) {
        run({ type: "hint", hint: `Line ${lineNo} came in on a GRN — its unit is the GRN's.` });
        return;
      }
      try {
        const next = await switchUomMutation({ itemId: line.itemId, uomId: line.uomId }).unwrap();
        const nextUom = String(next?.iuc_id ?? "");
        const still = draftRef.current.lines.find((candidate) => candidate.key === key);
        if (!still || still.itemId !== line.itemId || still.uomId !== line.uomId) {
          return;
        }
        if (!nextUom || nextUom === line.uomId) {
          run({ type: "hint", hint: `Line ${lineNo}: the item has one unit.` });
          return;
        }
        const item = await lookupMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: line.itemId,
          uomId: nextUom,
          onDate: current.docDate || todayIso(),
        }).unwrap();
        if (item?.itemId) {
          run({ type: "unitSwitched", key, item });
        }
      } catch (error) {
        toast.apiError(error);
      }
    },
    [draftRef, lookupMutation, run, switchUomMutation],
  );

  // ------------------------------------------------------- F12 and textile
  const setAllocs = useCallback(
    (key: string, rows: readonly PurchaseAllocEntry[]) => run({ type: "setAllocs", key, rows }),
    [run],
  );
  const pickChoice = useCallback(
    (key: string, field: "size" | "colour", choice: BatchDetailChoice) =>
      run({ type: "pickChoice", key, field, id: choice.id, name: choice.name }),
    [run],
  );

  return {
    choices,
    contextFor,
    contextEpoch,
    forgetContext,
    afterItemPicked,
    afterCellEdited,
    barcodeNotFound,
    grnOptions,
    poOptions,
    reloadSources,
    fillFromGrn,
    fillFromPo,
    cycleUnit,
    setAllocs,
    pickChoice,
  };
}

export type InvoiceLineSupport = ReturnType<typeof useInvoiceLineSupport>;
