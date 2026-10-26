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
 * ── Replies that land on a LINE (Qt `LineTicket`) ────────────────────────
 * A lookup is asked for one row and answered later; by then the operator may
 * have inserted or removed rows, pressed New, saved, loaded another document
 * or left the screen. A ticket names the line by its row key (which follows
 * inserts and removals, and dies with its row) and the document by a
 * generation bumped on every reset / load / next document. A reply whose row
 * is gone, whose generation moved, or whose row now holds another item is
 * dropped — the older answer must not win over a re-pick or a second scan.
 *
 * The draft is held in state AND in a ref advanced synchronously by `apply()`,
 * so a save fired straight after a cell commits (the shared keys blur the cell
 * first) reads the committed value rather than the render before it.
 *
 * ── Textile: size / colour / model on the line (Qt 74b755c, E4) ───────────
 * When the company numbers its own batches (`stock.auto_batch_no`), a line on
 * an item tracked by batch may leave Batch No blank: the server gives it the
 * next number on save (CBE26-00001) and keeps the line's size, colour and model
 * against that number in `stock.stock_batch_detail`. The sale bill reads them
 * back when the label is scanned. A batch number typed by hand carries none of
 * them, so typing one clears and locks the three cells. The Size and Colour
 * lists (dropdowns 70 / 71) are read once per screen, every page; an item's
 * earlier models once per item; a name not on a list is offered for adding.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { formatCurrency } from "@/domain/pricing";
import { focusCell, focusNextStopFrom } from "@/features/sales/quotation/components/grid-focus";
import { accountingYearOf, isRealDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import { getUserInfo } from "@/lib/auth/session";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { useLazySwitchItemUomQuery } from "@/store/api/quotationApi";
import {
  useCancelOpeningStockVoucherMutation,
  useGetOpeningStockBatchModelsMutation,
  useLazyGetOpeningStockItemByBarcodeQuery,
  useLazyGetOpeningStockItemLookupQuery,
  useLazyGetOpeningStockVoucherQuery,
  useQuickAddOpeningStockChoiceMutation,
  useRunOpeningStockChoicePageMutation,
  useSaveOpeningStockVoucherMutation,
  type BatchDetailChoiceRow,
} from "./opening-stock.api";
import {
  CHOICE_MAX_PAGES,
  CHOICE_PAGE_SIZE,
  COLOUR_DROPDOWN_KEY,
  LINE_IDENTITY_MAX_LENGTH,
  LINE_REMARKS_MAX_LENGTH,
  OPENING_STOCK_GRID_NAME,
  SIZE_DROPDOWN_KEY,
  TRACK,
  type RateSource,
} from "./opening-stock.constants";
import { cancelConsequence, cancelledMessage } from "./opening-stock.list";
import {
  computeTotals,
  hasItem,
  normalizeGridDate,
  normalizeModel,
  parseGridNumber,
  qtyDecimals,
  resolveChoice,
  tracks,
  withBatchNoEdited,
  withFetchedModels,
  withTypedModel,
} from "./opening-stock.lines";
import {
  autoBatchLineIndexes,
  buildPayload,
  describeError,
  fieldErrorsOf,
  givenBatchesText,
  lineFromPayload,
  lineProblemsOf,
  statusOfError,
} from "./opening-stock.payload";
import {
  createDraft,
  isOpeningWorthRemembering,
  openingStockReducer,
  splitRefusal,
  type DraftScope,
  type OpeningStockAction,
} from "./opening-stock.state";
import { missingIdentityLines, notADraftMessage, validateBeforeSave } from "./opening-stock.validate";
import { say, type SayKind } from "./components/say";
import {
  focusCellAfterRender,
  focusEntryCellOfRow,
  focusFirstCellOfRow,
} from "./components/opening-stock-grid";
import type {
  BatchDetailChoice,
  BatchDetailChoices,
  GridRow,
  OpeningStockDocKey,
  OpeningStockDraft,
  OpeningStockLine,
  OpeningStockLineField,
  OpeningStockViolation,
} from "./opening-stock.types";
import { useOpeningStockSettings } from "./use-opening-stock-settings";

/** The DOM ids the hook sends the cursor to. */
export const GODOWN_FIELD_ID = "opening-stock-godown";
export const DATE_FIELD_ID = "opening-stock-date";

export type OpeningStockBusy = "idle" | "loading" | "saving" | "posting" | "cancelling";

export type PickerState =
  | {
      kind: "item";
      rowKey: string;
      query: string;
      /** The cell the list was opened from — where a cancelled list hands the cursor back. */
      origin: "barcode" | "itemName";
    }
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

/** What Qt says when Previous / Next has nowhere to go. */
export const STEP_NOTICES = {
  newHasNoNext: "A new document is the newest — nothing comes after it.",
  none: "There are no openings yet.",
  oldest: "This is the oldest opening.",
  newest: "This is the newest opening.",
} as const;

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

/**
 * The tenant on the header, as this screen resolves it — what the page asks
 * screen memory about. The same three values a new document belongs to, or a
 * remembered one would never be found again.
 */
export function useOpeningStockScope(): ScreenScope {
  const { companyId, branchId, accYear } = useSessionScope();
  return useMemo(() => ({ companyId, branchId, accYear }), [accYear, branchId, companyId]);
}

/** The tenant a document belongs to — its own, not the session's. */
function memoryScopeOf(draft: OpeningStockDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

/** One line's ticket: the row, and the document it was asked for. */
type LineTicket = { rowKey: string; generation: number };

/** The Size / Colour cells, and what each is called inside a sentence. */
type ChoiceField = "sizeName" | "colourName";
const CHOICE_WORD: Record<ChoiceField, "size" | "colour"> = { sizeName: "size", colourName: "colour" };

/** A list row (`isz_*` / `icl_*`) as id + name; null when it names neither. */
function choiceOf(row: BatchDetailChoiceRow, prefix: "isz" | "icl"): BatchDetailChoice | null {
  const id = String(row[`${prefix}_id`] ?? "").trim();
  const name = String(row[`${prefix}_name`] ?? "").trim();
  return id && name ? { id, name } : null;
}

const NO_CHOICES: readonly BatchDetailChoice[] = [];

export type UseOpeningStockDraftOptions = {
  initialDocument?: OpeningStockDocKey;
  /** "entry" opens a loaded DRAFT for edit (still read-only for anything else). */
  initialMode: "entry" | "browse";
  /** Leave the voucher screen — back to the list. */
  onLeave: () => void;
  /** Screen memory (lib/screen-memory): the slot, and whether the page is reopening on it. */
  memory?: ScreenMemoryOption;
};

export function useOpeningStockDraft({
  initialDocument,
  initialMode,
  onLeave,
  memory,
}: UseOpeningStockDraftOptions) {
  const session = useSessionScope();
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // The document the operator left on this screen, when the page is reopening
  // on it (lib/screen-memory). Read once; null for every fresh open. It is dirty
  // by definition, so the re-seed effect below leaves it alone.
  const recalled = useRecalledOnce<OpeningStockDraft>(memory, session);
  const resumed = recalled !== null;
  const [draft, setDraft] = useState<OpeningStockDraft>(() => recalled ?? createDraft(session, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusyState] = useState<OpeningStockBusy>(initialDocument ? "loading" : "idle");
  const busyRef = useRef<OpeningStockBusy>(busy);
  const [picker, setPicker] = useState<PickerState>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [flagged, setFlagged] = useState<{ rowKey: string; field: string } | null>(null);

  const [loadVoucherQuery] = useLazyGetOpeningStockVoucherQuery();
  const [lookupItemQuery] = useLazyGetOpeningStockItemLookupQuery();
  const [barcodeQuery] = useLazyGetOpeningStockItemByBarcodeQuery();
  const [switchUomQuery] = useLazySwitchItemUomQuery();
  const [saveVoucher] = useSaveOpeningStockVoucherMutation();
  const [cancelVoucherMutation] = useCancelOpeningStockVoucherMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();
  const [runChoicePage] = useRunOpeningStockChoicePageMutation();
  const [batchModelsMutation] = useGetOpeningStockBatchModelsMutation();
  const [quickAddMutation] = useQuickAddOpeningStockChoiceMutation();

  // `stock.auto_batch_no` — AppSession `autoBatchNo()`, the session's company
  // and branch. Held in a ref too: a cell commit and a save read it from a
  // callback.
  const { settings } = useOpeningStockSettings(session.companyId, session.branchId);
  const autoBatchNo = settings.autoBatchNo;
  const autoBatchNoRef = useRef(autoBatchNo);
  useLayoutEffect(() => {
    autoBatchNoRef.current = autoBatchNo;
  }, [autoBatchNo]);

  // The Size / Colour lists (dropdowns 70 / 71). In a ref as well: a commit
  // resolves the typed name against them synchronously.
  const sizeDropdownId = useDropdownId(SIZE_DROPDOWN_KEY);
  const colourDropdownId = useDropdownId(COLOUR_DROPDOWN_KEY);
  const [choiceLists, setChoiceLists] = useState<Record<ChoiceField, readonly BatchDetailChoice[]>>({
    sizeName: NO_CHOICES,
    colourName: NO_CHOICES,
  });
  const choiceListsRef = useRef(choiceLists);
  const setChoiceList = useCallback((field: ChoiceField, list: readonly BatchDetailChoice[]) => {
    choiceListsRef.current = { ...choiceListsRef.current, [field]: list };
    setChoiceLists(choiceListsRef.current);
  }, []);

  /** Item id → the Model cell's suggestions (Qt `m_modelsByItem`). */
  const [modelsByItem, setModelsByItem] = useState<Record<string, readonly string[]>>({});
  /** Asked once per item, for the life of the screen. */
  const modelsAskedRef = useRef(new Set<string>());

  /**
   * Bumped whenever the document on screen changes (New, a load, the next
   * document after a write): a lookup still in flight belongs to the old one.
   */
  const generationRef = useRef(0);

  /**
   * False once the screen is gone. A lookup that answers after that still
   * reaches the REMEMBERED document (screen memory, below) — but it no longer
   * says anything or moves a cursor on a screen the operator has left.
   */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const tell = useCallback((kind: SayKind, title: string, text: string) => {
    if (aliveRef.current) {
      say(kind, title, text);
    }
  }, []);

  // Screen memory is written HERE, in the funnel every change goes through,
  // rather than from an effect: an item lookup that answers after the screen is
  // gone still reaches the remembered document. Kept while it is worth bringing
  // back, dropped once it is not — and never written again once discarded.
  const memoryKey = memory?.key ?? "";
  const discarded = useRef(false);
  const apply = useCallback(
    (action: OpeningStockAction) => {
      if (action.type === "reset" || action.type === "startNext" || action.type === "documentLoaded") {
        generationRef.current += 1;
      }
      draftRef.current = openingStockReducer(draftRef.current, action);
      setDraft(draftRef.current);
      const next = draftRef.current;
      if (memoryKey && !discarded.current) {
        if (isOpeningWorthRemembering(next)) {
          screenMemory.remember(memoryKey, memoryScopeOf(next), next);
        } else {
          screenMemory.forget(memoryKey, memoryScopeOf(next));
        }
      }
    },
    [memoryKey],
  );

  const lineTicket = useCallback(
    (rowKey: string): LineTicket => ({ rowKey, generation: generationRef.current }),
    [],
  );

  /** The row a reply may land on — null when the document moved on or the row is gone. */
  const ticketRow = useCallback((ticket: LineTicket): OpeningStockLine | null => {
    if (ticket.generation !== generationRef.current) {
      return null;
    }
    return draftRef.current.lines.find((line) => line.key === ticket.rowKey) ?? null;
  }, []);

  const setBusy = useCallback((next: OpeningStockBusy) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);

  // ── Textile: the lists and the models ─────────────────────────────────
  /**
   * The Size and Colour lists, every page (`/dropdown-details/run` caps a page
   * at 100) — Qt `loadBatchDetailChoices()`, only while the company numbers its
   * own batches. For the DOCUMENT's company: it is the one the server checks a
   * size against. A failed read is silent, as in Qt: the cell then offers no
   * list, and a typed name still goes through the quick-add.
   */
  const choicesCompanyId = draft.companyId;
  useEffect(() => {
    if (!autoBatchNo || !choicesCompanyId) {
      return;
    }
    let active = true;
    const load = async (field: ChoiceField, dropdownId: string, prefix: "isz" | "icl") => {
      if (!dropdownId) {
        return;
      }
      const loaded: BatchDetailChoice[] = [];
      for (let page = 1; page <= CHOICE_MAX_PAGES; page += 1) {
        const rows = await runChoicePage({ dropdownId, companyId: choicesCompanyId, page }).unwrap();
        if (!active) {
          return;
        }
        for (const row of rows) {
          const choice = choiceOf(row, prefix);
          if (choice) {
            loaded.push(choice);
          }
        }
        if (rows.length < CHOICE_PAGE_SIZE) {
          break;
        }
      }
      setChoiceList(field, loaded);
    };
    load("sizeName", sizeDropdownId, "isz").catch(() => undefined);
    load("colourName", colourDropdownId, "icl").catch(() => undefined);
    return () => {
      active = false;
    };
  }, [autoBatchNo, choicesCompanyId, colourDropdownId, runChoicePage, setChoiceList, sizeDropdownId]);

  /**
   * The Model cell's suggestions for one item — Qt `fetchModels()`, asked once
   * per item. Models typed on this screen meanwhile stay in front. Silent on a
   * failure: the cell is free text either way.
   */
  const fetchModels = useCallback(
    async (itemId: string) => {
      if (!autoBatchNoRef.current || !itemId || modelsAskedRef.current.has(itemId)) {
        return;
      }
      modelsAskedRef.current.add(itemId);
      try {
        const fetched = await batchModelsMutation({ companyId: draftRef.current.companyId, itemId }).unwrap();
        setModelsByItem((current) => ({ ...current, [itemId]: withFetchedModels(current[itemId] ?? [], fetched) }));
      } catch {
        // Nothing to say: no suggestions is not an error.
      }
    },
    [batchModelsMutation],
  );

  // Every item on screen gets its models asked for — a picked or scanned one,
  // each line of a loaded document (Qt calls `fetchModels()` from
  // `applyPickedItem()` and `applyLines()`), and all of them at once if the
  // setting answers after the document is already up.
  const itemIdsOnScreen = useMemo(
    () => [...new Set(draft.lines.filter(hasItem).map((line) => line.itemId))].join("\n"),
    [draft.lines],
  );
  useEffect(() => {
    if (!autoBatchNo) {
      return;
    }
    for (const itemId of itemIdsOnScreen.split("\n")) {
      if (itemId) {
        void fetchModels(itemId);
      }
    }
  }, [autoBatchNo, fetchModels, itemIdsOnScreen]);

  // A save / post / cancel still in flight when the screen goes lands after it:
  // the document must not come back to be posted twice. (A refusal that marks
  // its lines afterwards remembers it again: nothing was saved.)
  useForgetIfWritingOnUnmount(
    memory,
    () => busyRef.current === "saving" || busyRef.current === "posting" || busyRef.current === "cancelling",
    () => memoryScopeOf(draftRef.current),
  );

  /** The document came back from screen memory: say so once. */
  const finishResume = useCallback(async () => {
    // One tick first: this runs from the mount effect.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    toast.info(restoredMessage("opening stock"), RESTORED_MESSAGE_OPTIONS);
  }, []);

  /** The operator discarded the document: it must not come back. */
  const forgetRemembered = useCallback(() => {
    if (memoryKey) {
      discarded.current = true;
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey]);

  const sessionScope = useCallback((): DraftScope => {
    const { companyId, branchId, accYear, deviceId } = sessionRef.current;
    return { companyId, branchId, accYear, deviceId };
  }, []);

  /** A DRAFT open for entry — the only state a pick, a scan or a unit switch may change a line in. */
  const editableNow = useCallback(
    () => draftRef.current.mode === "entry" && draftRef.current.status === "DRAFT",
    [],
  );

  /**
   * Where keying starts (`focusEntryStart()`): the godown while there is none,
   * else the first row still without an item — on its Barcode, which is the
   * scan field AND the item search. A read-only document takes no cursor.
   */
  const focusEntryStart = useCallback(() => {
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        const current = draftRef.current;
        if (!aliveRef.current || current.mode !== "entry" || current.status !== "DRAFT") {
          return;
        }
        if (!current.header.godownId) {
          focusById(GODOWN_FIELD_ID);
          return;
        }
        const row = current.lines.find((line) => !hasItem(line)) ?? current.lines[current.lines.length - 1];
        if (row) {
          focusEntryCellOfRow(row.key);
        }
      }, 0),
    );
  }, []);

  /** "That one is filed, here is the next." */
  const startNextDocument = useCallback(() => {
    apply({ type: "startNext", scope: sessionScope(), today: todayIso() });
    setFlagged(null);
    focusEntryStart();
  }, [apply, focusEntryStart, sessionScope]);

  // ── Load ──────────────────────────────────────────────────────────────
  const loadVoucher = useCallback(
    async (key: OpeningStockDocKey, openForEdit: boolean): Promise<boolean> => {
      // The document's OWN scope, from the list row; the session is only the
      // fallback for a key assembled by hand. Taken over only when the
      // document ARRIVES: a load that fails leaves the screen as it was, under
      // its own scope (`documentLoaded` is the only place the scope changes).
      const scope = {
        companyId: key.companyId || sessionRef.current.companyId,
        branchId: key.branchId || sessionRef.current.branchId,
        accYear: key.accYear || sessionRef.current.accYear,
      };
      setBusy("loading");
      try {
        const document = await loadVoucherQuery({ ...scope, svhId: key.svhId }).unwrap();
        if (!document?.header?.svhId) {
          tell("warn", "Not found", "That opening stock voucher no longer exists.");
          return false;
        }
        apply({ type: "documentLoaded", document, scope, openForEdit });
        setFlagged(null);
        return true;
      } catch (error) {
        tell("error", "", describeError(error, "The opening stock voucher could not be loaded."));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [apply, loadVoucherQuery, setBusy, tell],
  );

  // A fresh screen belongs to the session's scope — re-seeded once the
  // business context lands, as long as nothing has been keyed yet.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (initialDocument) {
      if (!loadedRef.current) {
        loadedRef.current = true;
        void loadVoucher(initialDocument, initialMode === "entry").then((loaded) => {
          if (loaded) {
            focusEntryStart();
          }
        });
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
  }, [apply, focusEntryStart, initialDocument, initialMode, loadVoucher, session, sessionScope]);

  // The first show: the cursor goes where keying starts, not wherever the
  // browser left it (Qt `showEvent()`).
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current || initialDocument) {
      return;
    }
    shownRef.current = true;
    focusEntryStart();
  }, [focusEntryStart, initialDocument]);

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
    tell(
      "warn",
      "Godown first",
      "Choose the godown before keying items — it is where each line's stock opens, and a line without one cannot be saved.",
    );
    focusById(GODOWN_FIELD_ID);
    return false;
  }, [tell]);

  // ── Item lookup ───────────────────────────────────────────────────────
  /**
   * One call fills the row: unit, base unit, factor, tax and the item's
   * tracking signature as at the DOCUMENT's date. No cost, deliberately — a
   * seeded cost would switch the rate source off. A 404 is an answer (a
   * service item, no unit conversion, a unit not the item's) and empties the
   * row so a half-filled line cannot be saved.
   *
   * `keepLineValues` — F4's unit switch: the line already has its MRP, sale
   * price and cost, carried across (the reducer); the reply lands only while
   * the line is still on the unit it was switched FROM, and a refused lookup
   * leaves the line exactly as it was.
   */
  const fetchItemDetail = useCallback(
    async (
      rowKey: string,
      itemId: string,
      unitId: string,
      options: { keepLineValues?: boolean; fromUnitId?: string } = {},
    ) => {
      if (!itemId) {
        return;
      }
      const keep = options.keepLineValues === true;
      const ticket = lineTicket(rowKey);
      const current = draftRef.current;
      const row = current.lines.find((line) => line.key === rowKey);
      const onDate = isRealDate(current.header.docDate) ? current.header.docDate : todayIso();
      // Still there, still this document's, still this item — and, for a unit
      // switch, still on the unit it was switched from.
      const landing = (): OpeningStockLine | null => {
        const target = ticketRow(ticket);
        if (!target || target.itemId !== itemId) {
          return null;
        }
        if (keep && target.uomId !== (options.fromUnitId ?? "")) {
          return null;
        }
        return target;
      };
      try {
        const lookup = await lookupItemQuery({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId,
          ...(unitId ? { uomId: unitId } : {}),
          onDate,
          // The line's godown narrows "already opened" to the holding's grain
          // (notes 143 #8). Not the bucket: it is chosen after the pick.
          ...(row?.godownId ? { godownId: row.godownId } : {}),
        }).unwrap();
        if (!landing()) {
          return;
        }
        apply({ type: "itemLookupApplied", rowKey, lookup, keepLineValues: keep });
        if (lookup.alreadyOpened) {
          // Not a refusal: the engine's rule is per HOLDING, which this cannot
          // see — said while the operator is typing, not at post.
          apply({
            type: "noticeSet",
            text: `${lookup.itemName} already has an opening in this godown this year`,
          });
        }
      } catch (error) {
        if (!landing()) {
          return; // the screen, the document or the line has moved on
        }
        if (keep) {
          // A refused unit switch leaves the line as it was.
          tell("error", "", describeError(error, "The unit could not be changed."));
          return;
        }
        apply({ type: "lineCleared", rowKey });
        if (aliveRef.current) {
          focusCellAfterRender(rowKey, "itemName");
        }
        tell("error", "", describeError(error, "The item could not be read."));
      }
    },
    [apply, lineTicket, lookupItemQuery, tell, ticketRow],
  );

  // ── Pickers ───────────────────────────────────────────────────────────
  /**
   * The item list for one row. From the Item cell it can re-pick a line; from
   * the Barcode cell (↓) it is the search for a row with no item yet, and the
   * typed text is its query.
   */
  const openItemPicker = useCallback(
    (rowKey: string, typed: string, origin: "barcode" | "itemName" = "itemName"): boolean => {
      if (!editableNow()) {
        return false;
      }
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!line || (origin === "barcode" && hasItem(line))) {
        return false;
      }
      if (!requireHeaderGodown()) {
        return false;
      }
      setPicker({
        kind: "item",
        rowKey,
        query: origin === "barcode" ? typed.replace(/\s+/g, " ").trim() : typed,
        origin,
      });
      return true;
    },
    [editableNow, requireHeaderGodown],
  );

  /**
   * ↓ in the Barcode cell — the item list, searched for what was typed. The
   * cell has already DROPPED its edit (`dropBufferOnKeys`), so the typed text
   * is never committed and resolved as a code; the pick then clears the cell
   * so the item's own barcode fills it.
   */
  const searchItemsFromBarcode = useCallback(
    (rowKey: string, typed: string) => {
      openItemPicker(rowKey, typed, "barcode");
    },
    [openItemPicker],
  );

  /** On to Qty after a pick — the only thing left to key on the line. */
  const focusQtyOf = useCallback((rowKey: string) => {
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (!aliveRef.current) {
          return;
        }
        if (!focusCell(OPENING_STOCK_GRID_NAME, rowKey, "qty")) {
          // A layout that hides Qty: the next stop after the Item cell.
          if (!focusNextStopFrom(OPENING_STOCK_GRID_NAME, rowKey, "itemName")) {
            focusCell(OPENING_STOCK_GRID_NAME, rowKey, "itemName");
          }
        }
      }, 0),
    );
  }, []);

  const pickItem = useCallback(
    (row: GridRow) => {
      const target = picker;
      setPicker(null);
      if (!target || target.kind !== "item") {
        return;
      }
      // A posted, cancelled or browsed document takes no pick.
      if (!editableNow()) {
        return;
      }
      if (!draftRef.current.lines.some((line) => line.key === target.rowKey)) {
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
      // Grid 71 names it item_name_en; reading item_name left the Item cell
      // blank until the lookup returned.
      const itemName = String(row.item_name_en ?? row.item_name ?? "");
      const unitName = String(row.unit_name ?? "");
      // A duplicate item is NOT a warning here: one line per batch, per MRP,
      // per bucket is the normal shape of an opening.
      apply({ type: "itemPicked", rowKey: target.rowKey, itemId, itemName, unitName });
      setFlagged(null);
      focusQtyOf(target.rowKey);
      void fetchItemDetail(target.rowKey, itemId, unitId);
    },
    [apply, editableNow, fetchItemDetail, focusQtyOf, picker, requireHeaderGodown],
  );

  const openSupplierPicker = useCallback(
    (rowKey: string, typed: string) => {
      if (!editableNow()) {
        return;
      }
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!line || !hasItem(line)) {
        return;
      }
      setPicker({ kind: "supplier", rowKey, query: typed });
    },
    [editableNow],
  );

  /**
   * The supplier picked onto ONE line. Refused on an item not tracked
   * supplier-wise: the engine blanks an untracked facet before it looks the lot
   * up, so the value would be accepted here and silently gone at Post.
   */
  const pickSupplier = useCallback(
    (row: GridRow) => {
      const target = picker;
      setPicker(null);
      if (!target || target.kind !== "supplier" || !editableNow()) {
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
    [apply, editableNow, picker],
  );

  /** A list closed without a pick: the cursor goes back to the cell it was opened from. */
  const closePicker = useCallback(() => {
    const target = picker;
    setPicker(null);
    if (!target) {
      return;
    }
    const field = target.kind === "supplier" ? "supplierName" : target.origin;
    focusCellAfterRender(target.rowKey, field);
  }, [picker]);

  // ── Barcode ───────────────────────────────────────────────────────────
  /** A scan per row still being looked up — a second commit of the same code is the same scan. */
  const pendingScansRef = useRef(new Map<string, string>());

  /**
   * The scan path — Enter in Barcode is the barcode check and nothing else
   * (only ↓ opens the item list). The EAN becomes the row's item and unit,
   * then the SAME lookup the picker uses fills the rest, so a scanned line and
   * a picked one cannot drift apart. The scanned code is KEPT: the item's
   * default barcode only fills a blank cell.
   */
  const commitBarcode = useCallback(
    async (rowKey: string, barcode: string) => {
      const code = barcode.trim();
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!code || !line || hasItem(line) || !editableNow()) {
        return;
      }
      if (pendingScansRef.current.get(rowKey) === code) {
        return;
      }
      // A scan is an item pick, so it answers to the same rule.
      if (!requireHeaderGodown()) {
        apply({ type: "barcodeCleared", rowKey });
        return;
      }
      // Lands only on the same line, still blank, still this document: a second
      // scan into the cell, '+' / '-' around it, New, Save or a load all leave
      // this answer with nowhere to go.
      const ticket = lineTicket(rowKey);
      pendingScansRef.current.set(rowKey, code);
      try {
        const item = await barcodeQuery({ barcode: code, companyId: draftRef.current.companyId }).unwrap();
        const row = ticketRow(ticket);
        if (!row || hasItem(row) || !editableNow() || !item?.itemId) {
          return;
        }
        apply({ type: "barcodeResolved", rowKey, barcode: code, itemId: item.itemId });
        void fetchItemDetail(rowKey, item.itemId, item.unitId ?? "");
        // Straight to the quantity — the only thing left to key after a scan.
        if (aliveRef.current) {
          focusCellAfterRender(rowKey, "qty");
        }
      } catch (error) {
        const row = ticketRow(ticket);
        if (!row) {
          return; // the line, or the document, is gone — nothing to say
        }
        // No ACTIVE item carries the code: clear it (if the cell still holds
        // it) so the next scan lands in an empty cell, and stay where the
        // operator is.
        if (row.barcode.trim() === code) {
          apply({ type: "barcodeCleared", rowKey });
        }
        if (aliveRef.current) {
          focusCellAfterRender(rowKey, "barcode");
        }
        tell("error", "", describeError(error, `No item carries the barcode ${code}.`));
      } finally {
        if (pendingScansRef.current.get(rowKey) === code) {
          pendingScansRef.current.delete(rowKey);
        }
      }
    },
    [apply, barcodeQuery, editableNow, fetchItemDetail, lineTicket, requireHeaderGodown, tell, ticketRow],
  );

  // ── Size / Colour quick-add ───────────────────────────────────────────
  /**
   * A Size / Colour name typed that is not on the list — Qt `quickAddChoice()`:
   * "Add it?", and on Yes the master's own `/create`, the new row landing on
   * the line and on the list for the next line. No clears the cell; a refused
   * create clears it and shows the server's words.
   *
   * Reached through a ticket from a QUEUED call, never from inside the cell's
   * commit (the question is a modal). Asks only while the line still holds that
   * name without an id, and lands the answer only on the same terms: the
   * operator may have picked a row from the list, re-typed the cell, removed
   * the line or moved to another document meanwhile.
   */
  const quickAddChoice = useCallback(
    async (ticket: LineTicket, field: ChoiceField, name: string) => {
      const idField = field === "sizeName" ? "sizeId" : "colourId";
      const stillWaiting = (): boolean => {
        const row = ticketRow(ticket);
        return Boolean(row && row[field].trim() === name && !row[idField]);
      };
      if (!aliveRef.current || !editableNow() || !stillWaiting()) {
        return;
      }
      const word = CHOICE_WORD[field];
      const clearCell = () => {
        if (stillWaiting()) {
          apply({ type: "batchDetailChoiceSet", rowKey: ticket.rowKey, field, id: "", name: "" });
        }
      };
      const yes = await confirm({
        title: word === "size" ? "New size" : "New colour",
        message: `"${name}" is not in the ${word} list. Add it?`,
        confirmLabel: "Add",
        cancelLabel: "No",
      });
      if (!yes) {
        clearCell();
        return;
      }
      const prefix = word === "size" ? "isz" : "icl";
      try {
        const row = await quickAddMutation({ kind: word, name, companyId: draftRef.current.companyId }).unwrap();
        const id = String(row[`${prefix}_id`] ?? "").trim();
        if (!id) {
          return;
        }
        const added: BatchDetailChoice = { id, name: String(row[`${prefix}_name`] ?? "").trim() || name };
        // On the list for the next line, whether or not this one still wants it.
        setChoiceList(field, [...choiceListsRef.current[field], added]);
        if (stillWaiting()) {
          apply({ type: "batchDetailChoiceSet", rowKey: ticket.rowKey, field, id: added.id, name: added.name });
        }
      } catch (error) {
        clearCell();
        tell("error", "", describeError(error, `The ${word} "${name}" could not be added.`));
      }
    },
    [apply, editableNow, quickAddMutation, setChoiceList, tell, ticketRow],
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
          // Keyed only on a row with no item — the cell shuts once one lands, and
          // a commit arriving after that (focus leaving a cell that has just
          // been disabled) must not overwrite the item's own barcode.
          if (hasItem(line)) {
            return;
          }
          // Not a change by itself: the scan marks the document dirty when an
          // item actually lands.
          apply({ type: "barcodeTyped", rowKey, barcode: raw });
          // The scan IS the item pick on a row that has none.
          if (raw.trim()) {
            void commitBarcode(rowKey, raw);
          }
          return;
        case "batchNo": {
          // `@NullableStringStrict(100)` — held to it here rather than refused at save.
          const value = raw.slice(0, LINE_IDENTITY_MAX_LENGTH);
          // Typed, or handed back to the server to number (Qt `onBatchNoEdited()`).
          const autoBatch = autoBatchNoRef.current;
          const { cleared } = withBatchNoEdited(line, value, autoBatch);
          apply({ type: "batchNoSet", rowKey, value, autoBatchNo: autoBatch });
          if (cleared) {
            const lineNo = draftRef.current.lines.findIndex((candidate) => candidate.key === rowKey) + 1;
            // Once the commit is over, as Qt queues it.
            window.setTimeout(
              () =>
                tell(
                  "info",
                  "Batch number typed",
                  `Line ${lineNo}: size, colour and model go only with a batch number the system gives, ` +
                    "so they were cleared. Empty the batch cell to have one given and key them again.",
                ),
              0,
            );
          }
          return;
        }
        case "serialNo":
          // `@NullableStringStrict(100)` — held to it here rather than refused at save.
          apply({ type: "lineFieldSet", rowKey, field, value: raw.slice(0, LINE_IDENTITY_MAX_LENGTH) });
          return;
        case "sizeName":
        case "colourName": {
          // A name equal to a list row's (ignoring case) takes that row; any
          // other keeps the id blank, and the screen offers to add it.
          const choice = resolveChoice(choiceListsRef.current[field], raw);
          apply({ type: "batchDetailChoiceSet", rowKey, field, id: choice.id, name: choice.name });
          if (choice.name && !choice.id) {
            // Queued, like the Qt slot: the offer is a modal, and this runs
            // inside the cell's commit.
            const ticket = lineTicket(rowKey);
            window.setTimeout(() => void quickAddChoice(ticket, field, choice.name), 0);
          }
          return;
        }
        case "model": {
          const model = normalizeModel(raw);
          apply({ type: "lineFieldSet", rowKey, field, value: model });
          // A model typed here is a suggestion for the item's next line too.
          const itemId = line.itemId;
          if (model && itemId) {
            setModelsByItem((current) => {
              const known = current[itemId] ?? [];
              const next = withTypedModel(known, model);
              return next.length === known.length ? current : { ...current, [itemId]: next };
            });
          }
          return;
        }
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
    [apply, commitBarcode, lineTicket, quickAddChoice, tell],
  );

  // ── Rows ──────────────────────────────────────────────────────────────
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

  /** Split batch (Ctrl+D) — another allocation of the SAME line, from another batch. */
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
   * F4 — steps the line to the item's next unit (BOX → PCS → … → BOX), the
   * sales screens' key. `/item-switch-uom` names the next conversion; the line
   * is then re-read through the same lookup a picked item takes, keeping its
   * values: the quantity stays as typed (it is now in the new unit — that is
   * why the unit was switched), MRP and sale price stay, and the cost is
   * carried at the same rate per BASE unit. A one-unit item answers the unit
   * it already has, and nothing happens.
   */
  const switchUnit = useCallback(
    async (rowKey: string | null) => {
      if (!editableNow() || !rowKey) {
        return;
      }
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!line || !hasItem(line) || !line.uomId) {
        return; // a blank row has no unit to switch (nor one still being looked up)
      }
      const itemId = line.itemId;
      const fromUnitId = line.uomId;
      const ticket = lineTicket(rowKey);
      let nextUnitId = "";
      try {
        const next = await switchUomQuery({ item_id: itemId, iuc_id: fromUnitId }).unwrap();
        nextUnitId = String(next?.iuc_id ?? "");
      } catch (error) {
        if (ticketRow(ticket)) {
          tell("error", "", describeError(error, "The unit could not be changed."));
        }
        return;
      }
      // Still the same line, item and unit it was asked for.
      const row = ticketRow(ticket);
      if (!row || !editableNow() || row.itemId !== itemId || row.uomId !== fromUnitId) {
        return;
      }
      if (!nextUnitId || nextUnitId === fromUnitId) {
        return;
      }
      await fetchItemDetail(rowKey, itemId, nextUnitId, { keepLineValues: true, fromUnitId });
    },
    [editableNow, fetchItemDetail, lineTicket, switchUomQuery, tell, ticketRow],
  );

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
    const autoBatch = autoBatchNoRef.current;
    // The identity the engine refuses on, caught before the round trip. With
    // auto batch numbers a blank batch is the server's to fill.
    const pending = missingIdentityLines(current.lines, autoBatch);
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
      const posting = draftRef.current;
      // Which lines the server is to number, read BEFORE it fills them in.
      const autoBatchLines = autoBatchLineIndexes(posting.lines, autoBatch);
      const result = await saveVoucher(buildPayload(posting, { post: true, autoBatchNo: autoBatch })).unwrap();
      const refno = result.header?.refno ?? "";
      // The given numbers are on the reply's lines — said before the screen clears.
      say(
        "success",
        "Posted",
        `${refno} posted — ${result.rowsPosted ?? 0} ledger rows written.${givenBatchesText(autoBatchLines, result.lines)}`,
      );
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
      const autoBatch = autoBatchNoRef.current;
      // Which lines the server is to number, read BEFORE it fills them in.
      const autoBatchLines = autoBatchLineIndexes(current.lines, autoBatch);
      try {
        const result = await saveVoucher(buildPayload(current, { autoBatchNo: autoBatch })).unwrap();
        const refno = result.header?.refno ?? "";
        // Read from the server's answer — it owns the lines now, the batch
        // numbers it gave included.
        const pending = missingIdentityLines(
          (result.lines ?? []).map((line) => lineFromPayload(line)),
          autoBatch,
        );
        const given = givenBatchesText(autoBatchLines, result.lines);
        if (pending.length) {
          say(
            "info",
            "Saved",
            `${refno} saved as a draft. No stock has moved.\n\nThese lines still need what their item is tracked by, and Post will refuse the document until they have it:\n\n${pending.join("\n")}${given}`,
          );
        } else {
          say("success", "Saved", `${refno} saved as a draft. No stock has moved.${given}`);
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
    focusEntryStart();
  }, [apply, focusEntryStart]);

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
    focusEntryStart();
  }, [apply, focusEntryStart, sessionScope]);

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
    // A confirmed discard — unlike a menu trip, it must not be waiting on the next visit.
    forgetRemembered();
    onLeave();
  }, [forgetRemembered, onLeave]);

  /** Show List — Ctrl+O. Opening another document replaces this one, so it asks what Close asks. */
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
    forgetRemembered();
    onLeave();
  }, [forgetRemembered, onLeave]);

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn) — this document's neighbour in the
   * list, through the one server walk every document type shares
   * (`GET /txn/adjacent`): the opening entered just before / after this one in
   * its company, branch and year, in the list's own order. On a new document,
   * Previous opens the newest. A found document opens READ-ONLY (F2 to edit a
   * draft); at either end the notice line says so and the screen stays.
   */
  const stepDocument = useCallback(
    async (previous: boolean) => {
      if (busyRef.current !== "idle") {
        return;
      }
      const current = draftRef.current;
      if (!current.svhId && !previous) {
        apply({ type: "noticeSet", text: STEP_NOTICES.newHasNoNext });
        return;
      }
      if (
        current.dirty &&
        !(await confirm({
          title: "Open another opening",
          message: "This opening has unsaved changes. Discard it and open another?",
          confirmLabel: "Discard",
          cancelLabel: "No",
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      setBusy("loading");
      let found: OpeningStockDocKey | null = null;
      try {
        const answer = await adjacentMutation({
          docType: "OPENING_STOCK",
          companyId: current.companyId,
          branchId: current.branchId,
          accYear: current.accYear,
          ...(current.svhId ? { docId: current.svhId } : {}),
          direction: previous ? "prev" : "next",
        }).unwrap();
        const doc = answer.doc;
        if (!doc) {
          apply({
            type: "noticeSet",
            text: !current.svhId ? STEP_NOTICES.none : previous ? STEP_NOTICES.oldest : STEP_NOTICES.newest,
          });
          return;
        }
        found = {
          svhId: doc.docId,
          companyId: doc.companyId,
          branchId: doc.branchId,
          accYear: doc.accYear,
          refno: doc.refno ?? undefined,
          status: doc.status,
        };
      } catch (error) {
        tell("error", "", describeError(error, "The next opening could not be found."));
        return;
      } finally {
        setBusy("idle");
      }
      if (found) {
        await loadVoucher(found, false);
      }
    },
    [adjacentMutation, apply, loadVoucher, setBusy, tell],
  );

  const totals = useMemo(() => computeTotals(draft.lines), [draft.lines]);

  const batchDetail = useMemo<BatchDetailChoices>(
    () => ({ sizes: choiceLists.sizeName, colours: choiceLists.colourName, modelsByItem }),
    [choiceLists, modelsByItem],
  );

  return {
    draft,
    totals,
    autoBatchNo,
    batchDetail,
    busy,
    flagged,
    picker,
    reasonOpen,
    session,
    setHeaderField,
    setRateSource,
    setGodown,
    openItemPicker,
    searchItemsFromBarcode,
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
    stepDocument,
    focusEntryStart,
    // screen memory
    resumed,
    finishResume,
    forgetRemembered,
  };
}

export type OpeningStockDraftApi = ReturnType<typeof useOpeningStockDraft>;
