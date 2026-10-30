"use client";

/**
 * GRN (menu 196) — the screen's network and commit funnel. Every rule is in
 * `grn.state.ts`; this hook fetches, commits, and keeps unsaved work in screen
 * memory (lib/screen-memory) so a menu trip does not lose it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { toast } from "@/lib/notify";
import { RESTORED_MESSAGE_OPTIONS, restoredMessage, screenMemory, type ScreenScope } from "@/lib/screen-memory";
import { useForgetIfWritingOnUnmount, useRecalledOnce, type ScreenMemoryOption } from "@/lib/use-screen-memory";
import { quotationApi } from "@/store/api/quotationApi";
import { useAppDispatch } from "@/store/hooks";
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import type { PurchaseTransportBand } from "../shared/purchase-parts";
import { num, purchaseRefusalText, text } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseScope } from "../shared/use-purchase-scope";
import {
  useGrnCancelMutation,
  useGrnGetMutation,
  useGrnItemByBarcodeMutation,
  useGrnItemLookupMutation,
  useGrnPendingPoLinesMutation,
  useGrnPostMutation,
  useGrnSaveMutation,
  useGrnValidateMutation,
} from "./grn.api";
import { COL, VALIDATE_DELAY_MS } from "./grn.constants";
import {
  addCharge as addChargeState,
  coolieMasterOf,
  editCharge as editChargeState,
  loadmenChanged,
  removeCharge as removeChargeState,
  setChargePayees as setChargePayeesState,
} from "./grn-charges";
import { applyValidate, clearValidate, refusalsOf } from "./grn-check";
import {
  applyItem,
  applyPendingLines,
  blankLine,
  buildSavePayload,
  createDraft,
  editCell,
  ensureTrailingBlank,
  fillFromPos,
  fromPayload,
  isDraftStatus,
  isEditable,
  isWorthRemembering,
  patchHeader,
  removeLine,
  rowHasItem,
  saveRefusal,
  setDamageReason as setDamageReasonState,
  setExcessAction as setExcessActionState,
  setGodown as setGodownState,
  setLineAllocs as setLineAllocsState,
  setReceivedAt as setReceivedAtState,
  setRules,
  setSignature,
  setSupervisor as setSupervisorState,
  setSupplier as setSupplierState,
  setTextileChoice as setTextileChoiceState,
  setTransport as setTransportState,
  type GrnOverride,
  type GrnRules,
  type HeaderPatch,
} from "./grn.state";
import type { GrnChargeMasterRow, GrnDraft, GrnExcessAction, GrnPayload } from "./grn.types";

export type GrnBusy = "loading" | "saving" | "posting" | "cancelling" | null;

export type GrnFocusTarget =
  | { target: "cell"; key: string; column: number }
  | { target: "supplier" | "godown" | "lines" };
export type GrnFocusRequest = GrnFocusTarget & { seq: number };

function memoryScopeOf(draft: GrnDraft): ScreenScope {
  return { companyId: draft.companyId, branchId: draft.branchId, accYear: draft.accYear };
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** Now, local `yyyy-MM-ddTHH:mm`, on the given (app) date. */
function receivedNow(today: string): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${today}T${two(now.getHours())}:${two(now.getMinutes())}`;
}

/** The body /validate is asked with, as a comparable key ("" = nothing to judge). */
function validateBodyOf(draft: GrnDraft): { key: string; body: ReturnType<typeof buildSavePayload> } | null {
  if (!isEditable(draft) || !draft.supplierId || !draft.godownId) {
    return null;
  }
  const body = buildSavePayload(draft, false);
  if (body.lines.length === 0) {
    return { key: "", body };
  }
  return { key: JSON.stringify(body), body };
}

export type UseGrnDraftOptions = {
  /** The charge master (module P + B): names the server's charges, gives the coolie charge. */
  chargeMasters: readonly GrnChargeMasterRow[];
  memory?: ScreenMemoryOption;
  /** Dropdown GODOWNS — to name the godown of a loaded GRN (the answer carries only its id). */
  godownDropdownId: string;
  /** stock.auto_batch_no and purchase.price_set_at = GRN, as they stand (Qt `setupTextile`). */
  rules: GrnRules;
  /** A GRN just posted (Qt `PurchaseAfterPost::run`: labels / Change Selling). */
  onPosted?: (draft: GrnDraft) => void;
};

/** Qt `PurchaseDocNav::step`'s words. */
const STEP_NOTICES = {
  newHasNoNext: "A new GRN is the newest — nothing comes after it.",
  none: "There is no GRN yet.",
  oldest: "This is the oldest GRN.",
  newest: "This is the newest GRN.",
} as const;

export function useGrnDraft({ memory, godownDropdownId, rules, onPosted, chargeMasters }: UseGrnDraftOptions) {
  const dispatch = useAppDispatch();
  const scope = usePurchaseScope();
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });

  const memoryScope = { companyId: scope.companyId, branchId: scope.branchId, accYear: scope.accYear };
  const recalled = useRecalledOnce<GrnDraft>(memory, memoryScope);
  const resumed = recalled !== null;
  const rulesRef = useRef(rules);
  const onPostedRef = useRef(onPosted);
  const mastersRef = useRef(chargeMasters);
  useLayoutEffect(() => {
    rulesRef.current = rules;
    onPostedRef.current = onPosted;
    mastersRef.current = chargeMasters;
  });
  // A draft remembered before this port lacks the fields added since: blank them in.
  const [draft, setDraft] = useState<GrnDraft>(() =>
    recalled ? upgradeRecalled(recalled, rules) : createDraft(scope, todayIso(), rules, receivedNow(todayIso())),
  );
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<GrnBusy>(null);
  const busyRef = useRef<GrnBusy>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [focusRequest, setFocusRequest] = useState<GrnFocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [saveMutation] = useGrnSaveMutation();
  const [validateMutation] = useGrnValidateMutation();
  const [postMutation] = useGrnPostMutation();
  const [getMutation] = useGrnGetMutation();
  const [cancelMutation] = useGrnCancelMutation();
  const [pendingMutation] = useGrnPendingPoLinesMutation();
  const [barcodeMutation] = useGrnItemByBarcodeMutation();
  const [lookupMutation] = useGrnItemLookupMutation();
  const [adjacentMutation] = useGetTxnAdjacentMutation();

  const setBusyNow = useCallback((next: GrnBusy) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const requestFocus = useCallback((request: GrnFocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  // -------------------------------------------------------------- commit
  // Screen memory is written HERE, in the funnel every change goes through, so
  // an answer that lands after the screen is gone still reaches it.
  const memoryKey = memory?.key ?? "";
  const commit = useCallback(
    (next: GrnDraft) => {
      draftRef.current = next;
      setDraft(next);
      if (!memoryKey) {
        return;
      }
      if (isWorthRemembering(next)) {
        screenMemory.remember(memoryKey, memoryScopeOf(next), next);
      } else {
        screenMemory.forget(memoryKey, memoryScopeOf(next));
      }
    },
    [memoryKey],
  );
  useForgetIfWritingOnUnmount(
    memory,
    () => busyRef.current === "saving" || busyRef.current === "posting" || busyRef.current === "cancelling",
    () => memoryScopeOf(draftRef.current),
  );

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);

  // ------------------------------------------------------------ /validate
  /**
   * Qt `recalcNow` (debounced 350 ms): the server's line values, Check chips,
   * charges, the six totals and the strip, for the draft as it stands. An
   * answer is painted only while the draft still asks the same thing — an edit
   * since sends again.
   */
  const ask = validateBodyOf(draft);
  const askKey = ask?.key ?? null;
  const validateSeq = useRef(0);
  useEffect(() => {
    if (askKey === null) {
      return;
    }
    if (askKey === "") {
      const cleared = clearValidate(draftRef.current);
      if (cleared !== draftRef.current) {
        commit(cleared);
      }
      return;
    }
    const seq = ++validateSeq.current;
    const handle = window.setTimeout(() => {
      const now = validateBodyOf(draftRef.current);
      if (!now || now.key !== askKey) {
        return;
      }
      void (async () => {
        try {
          const answer = await validateMutation(now.body).unwrap();
          const current = validateBodyOf(draftRef.current);
          if (seq !== validateSeq.current || !current || current.key !== askKey) {
            return;
          }
          commit(applyValidate(draftRef.current, answer, mastersRef.current));
        } catch (error) {
          if (seq !== validateSeq.current) {
            return;
          }
          commit({ ...draftRef.current, hint: purchaseRefusalText(error), refusals: refusalsOf(error) });
        }
      })();
    }, VALIDATE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [askKey, commit, validateMutation]);

  // The settings land (or change): onto the draft, never dirtying it.
  const autoBatchNo = rules.autoBatchNo;
  const priceAtGrn = rules.priceAtGrn;
  useEffect(() => {
    const next = setRules(draftRef.current, { autoBatchNo, priceAtGrn });
    if (next !== draftRef.current) {
      commit(next);
    }
  }, [autoBatchNo, commit, priceAtGrn]);

  // ------------------------------------------------- tracking signature
  /**
   * Qt `fetchSignature`: a line that came from a PO or a saved GRN learns its
   * tracking signature (B / R) — F12 and the textile cells follow it. One read
   * per item × unit; a failure leaves it unknown (F12 still opens, plainer).
   */
  const fetchSignatures = useCallback(async () => {
    const current = draftRef.current;
    const wanted = new Map<string, { itemId: string; uomId: string }>();
    for (const line of current.lines) {
      if (rowHasItem(line) && !line.signature) {
        wanted.set(`${line.itemId}|${line.uomId}`, { itemId: line.itemId, uomId: line.uomId });
      }
    }
    await Promise.all(
      [...wanted.values()].map(async ({ itemId, uomId }) => {
        try {
          const found = await lookupMutation({
            companyId: current.companyId,
            branchId: current.branchId,
            itemId,
            ...(uomId ? { uomId } : {}),
            onDate: current.docDate || todayIso(),
            ...(current.godownId ? { godownId: current.godownId } : {}),
          }).unwrap();
          const signature = text(found?.trackSignature);
          if (!signature) {
            return;
          }
          let next = draftRef.current;
          for (const line of next.lines) {
            if (line.itemId === itemId && line.uomId === uomId && !line.signature) {
              next = setSignature(next, line.key, itemId, signature);
            }
          }
          if (next !== draftRef.current) {
            commit(next);
          }
        } catch {
          /* unknown: F12 still opens, without serial / textile columns */
        }
      }),
    );
  }, [commit, lookupMutation]);

  // ------------------------------------------------------- Against PO
  /** Qt `loadPendingPos`: the supplier's confirmed POs with qty still pending. */
  const loadPending = useCallback(
    async (supplierId: string) => {
      const current = draftRef.current;
      if (!supplierId || !isDraftStatus(current)) {
        return;
      }
      setPendingLoading(true);
      try {
        const rows = await pendingMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          supplierId,
        }).unwrap();
        commit(applyPendingLines(draftRef.current, supplierId, rows));
      } catch (error) {
        if (draftRef.current.supplierId === supplierId) {
          commit({ ...draftRef.current, pendingLines: [], pendingFor: supplierId, hint: purchaseRefusalText(error) });
        }
      } finally {
        setPendingLoading(false);
      }
    },
    [commit, pendingMutation],
  );

  /** The godown's name for a loaded GRN: the answer carries its id only. */
  const nameGodown = useCallback(
    async (next: GrnDraft) => {
      if (!next.godownId || next.godownName || !godownDropdownId) {
        return;
      }
      try {
        const page = await dispatch(
          quotationApi.endpoints.runDropdown.initiate(
            { dropdownId: godownDropdownId, limit: 500, params: { ibranch_id: next.branchId } },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        const row = (page?.items ?? []).find((candidate) => text(candidate.gdl_id) === next.godownId);
        const now = draftRef.current;
        if (row && now.godownId === next.godownId && !now.godownName) {
          commit({ ...now, godownName: text(row.gdl_name) });
        }
      } catch {
        /* the id still saves; only the label is missing */
      }
    },
    [commit, dispatch, godownDropdownId],
  );

  /** The server's document onto the screen (Qt `applyLoaded`). */
  const applyPayload = useCallback(
    (payload: GrnPayload, viewMode: "browse" | "entry") => {
      const next = fromPayload(draftRef.current, payload, { viewMode, deviceId: scopeRef.current.deviceId });
      commit(next);
      void nameGodown(next);
      void fetchSignatures();
      if (isDraftStatus(next) && next.supplierId) {
        // A reopened (or just saved) draft can still take lines from a PO; what
        // is pending has changed with this very save.
        void loadPending(next.supplierId);
      }
      return next;
    },
    [commit, fetchSignatures, loadPending, nameGodown],
  );

  // ------------------------------------------------------------ opening
  const load = useCallback(
    async (key: PurchaseDocKey, openForEdit: boolean) => {
      setBusyNow("loading");
      try {
        const payload = await getMutation({ grnId: key.id, accYear: key.accYear || scopeRef.current.accYear }).unwrap();
        applyPayload(payload, openForEdit ? "entry" : "browse");
      } catch (error) {
        toast.apiError(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, getMutation, setBusyNow],
  );

  /** The route reopened on a remembered draft: say so, then refresh its PO choices. */
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (!resumed || resumedOnce.current) {
      return;
    }
    resumedOnce.current = true;
    toast.info(restoredMessage("GRN"), RESTORED_MESSAGE_OPTIONS);
    const current = draftRef.current;
    if (isEditable(current) && current.supplierId) {
      void loadPending(current.supplierId);
    }
    void fetchSignatures();
  }, [fetchSignatures, loadPending, resumed]);

  // ------------------------------------------------------------ the header
  const setSupplier = useCallback(
    (id: string, name: string) => {
      const before = draftRef.current.supplierId;
      commit(setSupplierState(draftRef.current, id, name));
      if (id && id !== before) {
        void loadPending(id);
      }
    },
    [commit, loadPending],
  );
  const setGodown = useCallback(
    (id: string, name: string) => commit(setGodownState(draftRef.current, id, name)),
    [commit],
  );
  const setHeader = useCallback((patch: HeaderPatch) => commit(patchHeader(draftRef.current, patch)), [commit]);
  const setReceivedAt = useCallback((local: string) => commit(setReceivedAtState(draftRef.current, local)), [commit]);
  const setSupervisor = useCallback(
    (id: string, name: string) => commit(setSupervisorState(draftRef.current, id, name)),
    [commit],
  );
  const setTransport = useCallback(
    (band: PurchaseTransportBand | null) => commit(setTransportState(draftRef.current, band)),
    [commit],
  );
  const setLoadmen = useCallback(
    (loadmen: DropdownSelection[]) =>
      commit(loadmenChanged(draftRef.current, loadmen, coolieMasterOf(mastersRef.current))),
    [commit],
  );
  const setOverrideTicked = useCallback(
    (ticked: boolean) => commit({ ...draftRef.current, overrideTicked: ticked }),
    [commit],
  );

  // ------------------------------------------------------------ charges
  const addCharge = useCallback(
    (chgId: string) => {
      const master = mastersRef.current.find((row) => row.chgId === chgId);
      if (!master || !isEditable(draftRef.current)) {
        return;
      }
      commit(addChargeState(draftRef.current, master, coolieMasterOf(mastersRef.current)).draft);
    },
    [commit],
  );
  const editCharge = useCallback(
    (key: string, field: "rate" | "amount", raw: string) => commit(editChargeState(draftRef.current, key, field, raw)),
    [commit],
  );
  const removeCharge = useCallback((key: string) => commit(removeChargeState(draftRef.current, key)), [commit]);
  const setChargePayees = useCallback(
    (key: string, payees: DropdownSelection[]) => commit(setChargePayeesState(draftRef.current, key, payees)),
    [commit],
  );

  /** From PO (Ctrl+L): several POs of the supplier at once (Qt `fillFromPos`). */
  const pickPos = useCallback(
    (poIds: string[]) => {
      const current = draftRef.current;
      if (poIds.length === 0) {
        return;
      }
      const { draft: next, added } = fillFromPos(current, poIds);
      commit(next);
      if (added > 0) {
        void fetchSignatures();
        const first = next.lines.find((line) => line.poItemId && !current.lines.some((old) => old.key === line.key));
        if (first) {
          requestFocus({ target: "cell", key: first.key, column: COL.Recd });
        }
      }
    },
    [commit, fetchSignatures, requestFocus],
  );

  // ------------------------------------------------------------ the lines
  /** Qt `fetchItem`: the item's unit and MRP onto the line, then the cursor to Challan. */
  const pickItem = useCallback(
    async (key: string, item: { itemId: string; itemName: string; unitId?: string; barcode?: string }) => {
      const current = draftRef.current;
      if (!item.itemId || !isEditable(current)) {
        return false;
      }
      try {
        const found = await lookupMutation({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: item.itemId,
          ...(item.unitId ? { uomId: item.unitId } : {}),
          onDate: current.docDate || todayIso(),
          ...(current.godownId ? { godownId: current.godownId } : {}),
        }).unwrap();
        const now = draftRef.current;
        if (!isEditable(now) || !now.lines.some((line) => line.key === key)) {
          return false;
        }
        commit(
          applyItem(now, key, {
            itemId: item.itemId,
            itemName: item.itemName || text(found.itemName),
            uomId: text(found.uomId),
            unitName: text(found.unitName),
            mrp: num(found.mrp),
            signature: text(found.trackSignature),
            ...(item.barcode !== undefined ? { barcode: item.barcode } : {}),
          }),
        );
        requestFocus({ target: "cell", key, column: COL.Challan });
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [commit, lookupMutation, requestFocus],
  );

  /** Qt `resolveBarcode`: a scan → its item (in the unit the barcode is for). */
  const resolveBarcode = useCallback(
    async (key: string, code: string) => {
      const barcode = code.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!barcode || !line || rowHasItem(line) || !isEditable(current)) {
        return false;
      }
      try {
        const found = await barcodeMutation({ barcode, companyId: current.companyId }).unwrap();
        if (!found?.itemId) {
          setHint(`Barcode ${barcode} not found.`);
          return false;
        }
        return await pickItem(key, {
          itemId: found.itemId,
          itemName: text(found.itemName),
          unitId: text(found.unitId),
          barcode,
        });
      } catch (error) {
        if (statusOf(error) === 404) {
          setHint(`Barcode ${barcode} not found.`);
          requestFocus({ target: "cell", key, column: COL.Barcode });
        } else {
          toast.apiError(error);
        }
        return false;
      }
    },
    [barcodeMutation, pickItem, requestFocus, setHint],
  );

  const editLine = useCallback(
    (key: string, column: number, raw: string) => commit(editCell(draftRef.current, key, column, raw)),
    [commit],
  );
  const dropLine = useCallback((key: string) => commit(removeLine(draftRef.current, key)), [commit]);
  const setLineAllocs = useCallback(
    (key: string, rows: PurchaseAllocEntry[]) => commit(setLineAllocsState(draftRef.current, key, rows)),
    [commit],
  );
  const setTextileChoice = useCallback(
    (key: string, field: "sizeId" | "colourId", id: string) =>
      commit(setTextileChoiceState(draftRef.current, key, field, id)),
    [commit],
  );
  const setDamageReason = useCallback(
    (key: string, id: string, name: string) => commit(setDamageReasonState(draftRef.current, key, id, name)),
    [commit],
  );
  const setExcessAction = useCallback(
    (key: string, action: GrnExcessAction) => commit(setExcessActionState(draftRef.current, key, action)),
    [commit],
  );

  // ------------------------------------------------------------ the document
  const showRefusal = useCallback(
    (error: unknown) => {
      // a refused post: its refusals join the warnings on the strip
      const errors = refusalsOf(error);
      commit({
        ...draftRef.current,
        hint: purchaseRefusalText(error),
        ...(errors.length > 0 ? { refusals: errors } : {}),
      });
      toast.apiError(error, { title: "Not saved" });
    },
    [commit],
  );

  /**
   * Qt `saveDocument`. Post on a saved draft nobody has changed posts it as it
   * stands (`/post` — the Post right alone); anything else saves the whole
   * document, posting in the same call when asked.
   */
  const save = useCallback(
    async (post: boolean, override?: GrnOverride) => {
      const current = draftRef.current;
      if (busyRef.current) {
        return;
      }
      const refusal = saveRefusal(current);
      if (refusal) {
        toast.warn(refusal.message, { title: refusal.title });
        if (refusal.focus) {
          requestFocus({ target: refusal.focus });
        }
        return;
      }
      setBusyNow(post ? "posting" : "saving");
      try {
        const payload =
          post && current.grnId && !current.dirty
            ? await postMutation({
                grnId: current.grnId,
                accYear: current.accYear,
                ...(override ? { overrideWarnings: true, overrideReason: override.reason.trim().slice(0, 250) } : {}),
              }).unwrap()
            : await saveMutation(buildSavePayload(current, post, override)).unwrap();
        let next = applyPayload(payload, "entry");
        // Excess, shelf life, prices kept — the server's warnings, on the strip (once).
        const warnings = (payload.warnings ?? []).map((warning) => text(warning.message)).filter(Boolean);
        next = { ...draftRef.current, warnings: payload.warnings ?? [], refusals: payload.refusals ?? [], hint: "" };
        commit(next);
        const said = post
          ? `${next.refno} posted — the stock is in, waiting for the supplier's bill.`
          : `${next.refno} saved as a draft. Nothing has moved yet.`;
        if (warnings.length > 0) {
          toast.warn([said, ...warnings].join("\n"), { title: post ? "Posted" : "Saved" });
        } else {
          toast.success(said, { title: post ? "Posted" : "Saved" });
        }
        if (post && next.status === "POSTED" && next.grnId) {
          onPostedRef.current?.(next);
        }
      } catch (error) {
        showRefusal(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, commit, postMutation, requestFocus, saveMutation, setBusyNow, showRefusal],
  );

  /** Qt `cancelGrn`: a posted GRN that is not billed. */
  const cancel = useCallback(
    async (reason: string) => {
      const current = draftRef.current;
      if (busyRef.current || current.status !== "POSTED" || !current.grnId) {
        return;
      }
      setBusyNow("cancelling");
      try {
        const payload = await cancelMutation({ grnId: current.grnId, accYear: current.accYear, reason }).unwrap();
        const next = applyPayload(payload, "browse");
        toast.success(`${next.refno} cancelled — the stock is out again.`, { title: "Cancelled" });
      } catch (error) {
        commit({ ...draftRef.current, hint: purchaseRefusalText(error) });
        toast.apiError(error);
      } finally {
        setBusyNow(null);
      }
    },
    [applyPayload, cancelMutation, commit, setBusyNow],
  );

  /** Qt `resetScreen`: a new GRN under the session's tenant. */
  const reset = useCallback(() => {
    commit(createDraft(scopeRef.current, todayIso(), rulesRef.current, receivedNow(todayIso())));
    requestFocus({ target: "supplier" });
  }, [commit, requestFocus]);

  /**
   * Previous / Next (Alt+PgUp / Alt+PgDn; Qt `PurchaseDocNav::step`) — `GET
   * /txn/adjacent` docType GRN, then the GRN's own `/get`. Opens to look at;
   * F2 keys a draft. The caller has already asked about unsaved work.
   */
  const step = useCallback(
    async (previous: boolean) => {
      if (busyRef.current) {
        return;
      }
      const current = draftRef.current;
      if (!current.grnId && !previous) {
        setHint(STEP_NOTICES.newHasNoNext);
        return;
      }
      setBusyNow("loading");
      try {
        const answer = await adjacentMutation({
          docType: "GRN",
          companyId: current.companyId,
          branchId: current.branchId,
          accYear: current.accYear,
          ...(current.grnId ? { docId: current.grnId } : {}),
          direction: previous ? "prev" : "next",
        }).unwrap();
        const doc = answer.doc;
        if (!doc) {
          setHint(!current.grnId ? STEP_NOTICES.none : previous ? STEP_NOTICES.oldest : STEP_NOTICES.newest);
          return;
        }
        const payload = await getMutation({ grnId: doc.docId, accYear: doc.accYear || current.accYear }).unwrap();
        if (memoryKey) {
          screenMemory.forget(memoryKey, memoryScopeOf(current));
        }
        applyPayload(payload, "browse");
      } catch (error) {
        setHint(purchaseRefusalText(error));
      } finally {
        setBusyNow(null);
      }
    },
    [adjacentMutation, applyPayload, getMutation, memoryKey, setBusyNow, setHint],
  );

  /** F2 — key a draft that was opened to look at. */
  const beginEdit = useCallback(() => {
    const current = draftRef.current;
    if (!isDraftStatus(current) || current.viewMode === "entry") {
      return;
    }
    commit({ ...current, viewMode: "entry", lines: ensureTrailingBlank(current.lines) });
    if (current.supplierId && current.pendingFor !== current.supplierId) {
      void loadPending(current.supplierId);
    }
  }, [commit, loadPending]);

  /** Leaving on purpose (Close / Show List after "discard"): nothing to bring back. */
  const discard = useCallback(() => {
    if (memoryKey) {
      screenMemory.forget(memoryKey, memoryScopeOf(draftRef.current));
    }
  }, [memoryKey]);

  return {
    draft,
    draftRef,
    busy,
    pendingLoading,
    focusRequest,
    resumed,
    load,
    setSupplier,
    setGodown,
    setHeader,
    setReceivedAt,
    setSupervisor,
    setTransport,
    setLoadmen,
    setOverrideTicked,
    addCharge,
    editCharge,
    removeCharge,
    setChargePayees,
    setHint,
    pickPos,
    pickItem,
    resolveBarcode,
    editLine,
    dropLine,
    setLineAllocs,
    setTextileChoice,
    setDamageReason,
    setExcessAction,
    save,
    cancel,
    reset,
    step,
    beginEdit,
    discard,
    requestFocus,
  };
}

/**
 * A draft remembered by an earlier build lacks the line fields added since
 * (signature, allocs, textile, Sell A–D, excess): fill them in blank so the
 * rules never read `undefined`.
 */
function upgradeRecalled(recalled: GrnDraft, rules: GrnRules): GrnDraft {
  const blank = createDraft(
    { companyId: recalled.companyId, branchId: recalled.branchId, accYear: recalled.accYear, deviceId: recalled.deviceId },
    recalled.docDate || todayIso(),
    rules,
  );
  return {
    ...blank,
    ...recalled,
    autoBatchNo: recalled.autoBatchNo ?? rules.autoBatchNo,
    priceAtGrn: recalled.priceAtGrn ?? rules.priceAtGrn,
    lines: recalled.lines.map((line) => ({
      ...blankLine(),
      ...line,
      allocs: Array.isArray(line.allocs) ? line.allocs : [],
    })),
  };
}
