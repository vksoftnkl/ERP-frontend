"use client";

/**
 * Stock Adjustment — the draft and every action that needs the network.
 *
 * The draft is local to the screen (no slice): it lives in state, mirrored in a
 * ref so an answer that lands late reads the draft as it is NOW — the Qt
 * screen's `if (cellText(ItemId) != itemId) return` guard is the line key plus
 * the item id here. Every rule is a pure transition in
 * `stock-adjustment.state.ts`; what a transition asks of the server comes back
 * as `effects`, and `runEffects` does it.
 */
import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { getUserInfo } from "@/lib/auth/session";
import { accountingYearOf, isRealDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  useCancelStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useLazyGetStockAdjustmentQuery,
  useLazyStockAdjustmentItemByBarcodeQuery,
  useLazyStockAdjustmentItemLookupQuery,
  useLazyStockAdjustmentPickStockQuery,
  useLazyValidateStockAdjustmentQuery,
  useSaveStockAdjustmentMutation,
  useStockAdjustmentLedgerRolesQuery,
  useStockAdjustmentPickStockQuery,
  useStockReasonsForKindQuery,
} from "./stock-adjustment.api";
import { COL, saveType, type Kind } from "./stock-adjustment.constants";
import { applySaveResult, buildLines, buildPayload, draftFromPayload } from "./stock-adjustment.payload";
import {
  applyAvailability,
  applyItemDetail,
  applyPickedHolding,
  applyReasons,
  changeGodown,
  changeKind,
  changeRateSource,
  createDraft,
  editCell,
  insertLineBefore,
  isEditable,
  itemDetailFailed,
  nextDocument,
  removeLine,
  rowHasItem,
  startItemLine,
} from "./stock-adjustment.state";
import type {
  AdjustmentDraft,
  DraftEffect,
  DraftScope,
  PickStockRow,
  StockAdjustmentDocKey,
  StockReasonRow,
  Transition,
} from "./stock-adjustment.types";
import {
  apiErrorText,
  checkBeforeSave,
  errorDetailsOf,
  GODOWN_FIRST,
  mapServerRefusal,
  mapValidateRows,
  type SaveRefusal,
} from "./stock-adjustment.validate";
import { notify } from "./components/notify";

export type Busy = "loading" | "saving" | "validating" | "cancelling" | "deleting" | null;

/** Where the view should put the cursor next — a line's cell, or a header field. */
export type FocusTarget = { target: "cell"; key: string; column: number } | { target: "godown" | "date" };
export type FocusRequest = FocusTarget & { seq: number };

/** The session's scope — what a NEW document is raised under. */
function useSessionScope(): DraftScope {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  // The REGISTERED device (fixed.device_master), signed into the token at
  // login — it is what numbers the document. Not the browser's own id.
  const deviceId = getUserInfo()?.deviceId ?? "";
  return useMemo(() => ({ companyId, branchId, accYear, deviceId }), [accYear, branchId, companyId, deviceId]);
}

export function useStockAdjustmentDraft() {
  const scope = useSessionScope();
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const [draft, setDraft] = useState<AdjustmentDraft>(() => createDraft(scope, todayIso()));
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<Busy>(null);
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusSeq = useRef(0);

  const [triggerPickStock] = useLazyStockAdjustmentPickStockQuery();
  const [triggerItemLookup] = useLazyStockAdjustmentItemLookupQuery();
  const [triggerBarcode] = useLazyStockAdjustmentItemByBarcodeQuery();
  const [triggerLoad] = useLazyGetStockAdjustmentQuery();
  const [triggerValidate] = useLazyValidateStockAdjustmentQuery();
  const [saveMutation] = useSaveStockAdjustmentMutation();
  const [cancelMutation] = useCancelStockAdjustmentMutation();
  const [deleteMutation] = useDeleteStockAdjustmentMutation();

  // -------------------------------------------------------------- commit
  const requestFocus = useCallback((request: FocusTarget) => {
    focusSeq.current += 1;
    setFocusRequest({ ...request, seq: focusSeq.current });
  }, []);

  const effectsRef = useRef<(effects: DraftEffect[]) => void>(() => undefined);

  const commit = useCallback((next: AdjustmentDraft, effects: DraftEffect[] = []) => {
    draftRef.current = next;
    setDraft(next);
    if (effects.length > 0) {
      effectsRef.current(effects);
    }
  }, []);

  const apply = useCallback((transition: Transition) => commit(transition.draft, transition.effects), [commit]);

  /** Show a gate's refusal the way the Qt screen does, and send the cursor where it points. */
  const refuse = useCallback(
    (refusal: SaveRefusal) => {
      notify(refusal.level, refusal.title, refusal.message);
      if (refusal.focus === "godown" || refusal.focus === "date") {
        requestFocus({ target: refusal.focus });
      } else if (refusal.focus) {
        requestFocus({ target: "cell", key: refusal.focus.lineKey, column: COL.Qty });
      }
    },
    [requestFocus],
  );

  // ------------------------------------------------------- the reads
  /**
   * refreshAvailability — what the holding (or, lotless, the item in this
   * bucket) has available, and the branch average. A hint: a failure is
   * silent, the server checks at save.
   */
  const refreshAvailability = useCallback(
    async (key: string) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!line?.itemId || !current.godownId) {
        return;
      }
      const itemId = line.itemId;
      try {
        const rows = await triggerPickStock({
          companyId: current.companyId,
          branchId: current.branchId,
          godownId: current.godownId,
          bucket: line.bucket || "SALEABLE",
          itemId,
        }).unwrap();
        commit(applyAvailability(draftRef.current, key, itemId, rows));
      } catch {
        // availability is a hint; the server checks at save
      }
    },
    [commit, triggerPickStock],
  );

  /** fetchItemDetail — the unit, base unit, factor and tracking signature, on the document date. */
  const fetchItemDetail = useCallback(
    async (effect: Extract<DraftEffect, { type: "itemDetail" }>) => {
      const current = draftRef.current;
      const onDate = isRealDate(current.docDate) ? current.docDate : todayIso();
      try {
        const detail = await triggerItemLookup({
          companyId: current.companyId,
          branchId: current.branchId,
          itemId: effect.itemId,
          ...(effect.unitId ? { uomId: effect.unitId } : {}),
          onDate,
        }).unwrap();
        apply(applyItemDetail(draftRef.current, effect.key, effect.itemId, detail, effect.keepUnit));
      } catch (error) {
        commit(itemDetailFailed(draftRef.current, effect.key, effect.itemId));
        notify("warn", "Error", apiErrorText(error));
      }
    },
    [apply, commit, triggerItemLookup],
  );

  /** openPickDialog's gates: a keyable DRAFT, a godown, and a line (the last one when none is named). */
  const openPick = useCallback(
    (key: string | null) => {
      const current = draftRef.current;
      if (!isEditable(current)) {
        return;
      }
      if (!current.godownId) {
        refuse(GODOWN_FIRST);
        return;
      }
      const found = key ? current.lines.find((line) => line.key === key) : undefined;
      const target = found ?? current.lines[current.lines.length - 1];
      if (target) {
        setPickKey(target.key);
      }
    },
    [refuse],
  );

  const runEffects = (effects: DraftEffect[]) => {
    const seen = new Set<string>();
    for (const effect of effects) {
      const tag = `${effect.type}:${effect.key}`;
      if (seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      switch (effect.type) {
        case "availability":
          void refreshAvailability(effect.key);
          break;
        case "itemDetail":
          void fetchItemDetail(effect);
          break;
        case "pick":
          // QTimer::singleShot(0, openPickDialog) — after the row has painted.
          window.setTimeout(() => openPick(effect.key), 0);
          break;
        case "focus":
          requestFocus({ target: "cell", key: effect.key, column: effect.column });
          break;
      }
    }
  };
  useLayoutEffect(() => {
    effectsRef.current = runEffects;
  });

  // ---------------------------------------------------- the kind's reasons
  const { currentData: reasonRows, isFetching: reasonsFetching } = useStockReasonsForKindQuery(
    draft.companyId ? { companyId: draft.companyId, voucherType: saveType(draft.kind) } : skipToken,
  );
  const appliedReasons = useRef<readonly StockReasonRow[] | null>(null);
  useEffect(() => {
    if (!reasonRows) {
      return;
    }
    const current = draftRef.current;
    if (current.reasonsLoaded && appliedReasons.current === reasonRows) {
      return;
    }
    appliedReasons.current = reasonRows;
    commit(applyReasons(current, reasonRows));
  }, [commit, draft.kind, draft.reasonsLoaded, reasonRows]);

  // ------------------------------------------- the accounts card's ledgers
  const { data: roleRows } = useStockAdjustmentLedgerRolesQuery();
  const roleLedgers = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of roleRows ?? []) {
      if (row?.role && row.ledgerName) {
        map[row.role] = row.ledgerName;
      }
    }
    return map;
  }, [roleRows]);

  // ---------------------------------------------- Move stock: panel 12
  const damagedQuery = useStockAdjustmentPickStockQuery(
    draft.kind === "Move" && draft.godownId
      ? {
          companyId: draft.companyId,
          branchId: draft.branchId,
          godownId: draft.godownId,
          bucket: "DAMAGED",
          limit: 500,
        }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const refetchDamaged = damagedQuery.refetch;
  const damagedActive = draft.kind === "Move" && Boolean(draft.godownId);
  const reloadDamaged = useCallback(() => {
    if (damagedActive) {
      void refetchDamaged();
    }
  }, [damagedActive, refetchDamaged]);

  // A blank, untouched document follows the session (company / branch / year
  // switched in the header) — Qt reads the session at every reset.
  useEffect(() => {
    const current = draftRef.current;
    if (current.svhId || current.dirty) {
      return;
    }
    if (
      current.companyId === scope.companyId &&
      current.branchId === scope.branchId &&
      current.accYear === scope.accYear &&
      current.deviceId === scope.deviceId
    ) {
      return;
    }
    commit(createDraft(scope, current.docDate, current.kind));
  }, [commit, scope]);

  // ---------------------------------------------------------- the header
  const setKind = useCallback((kind: Kind) => commit(changeKind(draftRef.current, kind)), [commit]);

  const setGodown = useCallback(
    (godownId: string, godownName: string) => commit(changeGodown(draftRef.current, godownId, godownName)),
    [commit],
  );

  const setRateSource = useCallback(
    (rateSource: string) => apply(changeRateSource(draftRef.current, rateSource)),
    [apply],
  );

  const setHeader = useCallback(
    (field: "docDate" | "usrRefno" | "remarks" | "defaultReasonId", value: string) => {
      commit({ ...draftRef.current, [field]: value, dirty: true });
    },
    [commit],
  );

  const setHint = useCallback((hint: string) => commit({ ...draftRef.current, hint }), [commit]);

  // ------------------------------------------------------------ the lines
  /** applyPickedItem — the item picker's answer, refused without a godown. */
  const pickItem = useCallback(
    (key: string, item: { itemId: string; itemName: string; unitId: string; barcode?: string }) => {
      if (!draftRef.current.godownId) {
        refuse(GODOWN_FIRST);
        return;
      }
      apply(startItemLine(draftRef.current, key, item));
    },
    [apply, refuse],
  );

  /** resolveBarcode — a scan resolves to its item and unit, scoped to this company. */
  const resolveBarcode = useCallback(
    async (key: string, barcode: string): Promise<boolean> => {
      const code = barcode.trim();
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!code || !line || rowHasItem(line)) {
        return false;
      }
      if (!current.godownId) {
        refuse(GODOWN_FIRST);
        return false;
      }
      try {
        const found = await triggerBarcode({ barcode: code, companyId: current.companyId }).unwrap();
        if (!found?.itemId) {
          return false;
        }
        apply(
          startItemLine(draftRef.current, key, {
            itemId: found.itemId,
            itemName: found.itemName ?? "",
            unitId: found.unitId ?? "",
            barcode: code,
          }),
        );
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      }
    },
    [apply, refuse, triggerBarcode],
  );

  const editLine = useCallback(
    (key: string, column: number, raw: string) => apply(editCell(draftRef.current, key, column, raw)),
    [apply],
  );

  const insertLine = useCallback((key: string) => apply(insertLineBefore(draftRef.current, key)), [apply]);

  const deleteLine = useCallback((key: string) => apply(removeLine(draftRef.current, key)), [apply]);

  const closePick = useCallback(() => setPickKey(null), []);

  const applyHolding = useCallback(
    (key: string, holding: PickStockRow) => apply(applyPickedHolding(draftRef.current, key, holding)),
    [apply],
  );

  /**
   * Panel 12's activation: on a Move draft, a row there keys a line that moves
   * that stock back — on the spare row at the bottom.
   */
  const takeDamagedRow = useCallback(
    (holding: PickStockRow) => {
      const current = draftRef.current;
      if (current.kind !== "Move" || !isEditable(current)) {
        return;
      }
      const last = current.lines[current.lines.length - 1];
      if (!last) {
        return;
      }
      apply(applyPickedHolding(current, last.key, holding));
    },
    [apply],
  );

  // ------------------------------------------------------- the document
  const startNextDocument = useCallback(() => {
    const next = nextDocument(draftRef.current, scopeRef.current);
    commit(next);
    requestFocus({ target: "cell", key: next.lines[0].key, column: COL.Description });
  }, [commit, requestFocus]);

  /** New (F7) — a blank document of the same kind; the godown and date start over. */
  const newDocument = useCallback(() => {
    const current = draftRef.current;
    commit(createDraft(scopeRef.current, todayIso(), current.kind));
  }, [commit]);

  /** Edit — open this DRAFT for keying, and read every line's holding again. */
  const beginEdit = useCallback((): boolean => {
    const current = draftRef.current;
    if (current.status !== "DRAFT") {
      notify(
        "warn",
        "Not a draft",
        `${current.refno} is ${current.status}. A posted document cannot be edited — cancel it and key a new one.`,
      );
      return false;
    }
    commit(
      { ...current, mode: "entry" },
      current.lines.filter(rowHasItem).map((line) => ({ type: "availability" as const, key: line.key })),
    );
    return true;
  }, [commit]);

  /** loadVoucher — the key carries its own company / branch / year. */
  const load = useCallback(
    async (key: StockAdjustmentDocKey, openForEdit: boolean): Promise<boolean> => {
      const session = scopeRef.current;
      const docScope: DraftScope = {
        companyId: key.companyId || session.companyId,
        branchId: key.branchId || session.branchId,
        accYear: key.accYear || session.accYear,
        deviceId: session.deviceId,
      };
      setBusy("loading");
      try {
        const payload = await triggerLoad({ ...key, ...docScope }).unwrap();
        if (!payload?.header?.svhId) {
          notify("warn", "Not found", "That adjustment no longer exists.");
          return false;
        }
        const loaded = draftFromPayload(docScope, payload, openForEdit, todayIso());
        appliedReasons.current = null;
        commit(
          loaded,
          loaded.mode === "entry"
            ? loaded.lines.filter(rowHasItem).map((line) => ({ type: "availability" as const, key: line.key }))
            : [],
        );
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [commit, triggerLoad],
  );

  /** saveDocument's gates, shown when one refuses. True = the save may go ahead. */
  const gate = useCallback(
    (post: boolean): boolean => {
      const refusal = checkBeforeSave(draftRef.current, post);
      if (refusal) {
        refuse(refusal);
        return false;
      }
      return true;
    },
    [refuse],
  );

  /**
   * saveDocument — the gates must have passed (and a post been confirmed). A
   * 422 names each refused line as "lines.<n>"; those lines are tinted until
   * they are edited.
   */
  const save = useCallback(
    async (post: boolean, afterDraft?: () => Promise<void>): Promise<boolean> => {
      const current = draftRef.current;
      const { payload, sentKeys } = buildPayload(current, post);
      setBusy("saving");
      try {
        const result = await saveMutation(payload).unwrap();
        const saved = applySaveResult(draftRef.current, result, sentKeys);
        commit(saved);
        if (post) {
          const rows = Number(result.rowsPosted ?? 0);
          notify("info", "Posted", `${saved.refno} posted — ${rows} ledger row(s) written.`);
          startNextDocument();
          reloadDamaged();
          return true;
        }
        if (afterDraft) {
          await afterDraft();
          return true;
        }
        notify(
          "info",
          "Saved",
          `${saved.refno} saved as a draft. No stock has moved — Save (F5) posts it.`,
        );
        return true;
      } catch (error) {
        const problems = mapServerRefusal(errorDetailsOf(error), sentKeys);
        const refused = { ...draftRef.current, serverProblems: problems, sentKeys };
        commit(refused);
        const firstKey = sentKeys.find((key) => problems[key]);
        if (firstKey) {
          requestFocus({ target: "cell", key: firstKey, column: COL.Qty });
        }
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [commit, reloadDamaged, requestFocus, saveMutation, startNextDocument],
  );

  /**
   * validateDocument — the screen's rules, then the server's over the SAVED
   * rows, so a document that is new or changed is saved as a draft first (it
   * moves no stock).
   */
  const validate = useCallback(async () => {
    const current = draftRef.current;
    if (current.status !== "DRAFT") {
      notify("info", "Validate", `${current.refno} is ${current.status} — there is nothing left to check.`);
      return;
    }
    const check = async () => {
      const saved = draftRef.current;
      if (!saved.svhId) {
        return;
      }
      setBusy("validating");
      try {
        const rows = await triggerValidate({
          svhId: saved.svhId,
          companyId: saved.companyId,
          branchId: saved.branchId,
          accYear: saved.accYear,
        }).unwrap();
        const { problems, byKey } = mapValidateRows(rows, saved.sentKeys);
        commit({ ...draftRef.current, serverProblems: byKey });
        if (problems.length === 0) {
          notify("info", "Validate", `All ${rows.length} line(s) are clean. Save (F5) posts it.`);
        } else {
          notify("warn", "Validate", problems.join("\n"));
        }
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
      } finally {
        setBusy(null);
      }
    };
    if (current.dirty || !current.svhId) {
      if (gate(false)) {
        await save(false, check);
      }
      return;
    }
    // sentKeys maps the server's line numbers back to rows.
    const { sentKeys } = buildLines(current);
    commit({ ...current, sentKeys });
    await check();
  }, [commit, gate, save, triggerValidate]);

  /** cancelVoucher (after the reason and the confirmation). */
  const cancelDocument = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      setBusy("cancelling");
      try {
        await cancelMutation({
          svhId: current.svhId,
          accYear: current.accYear,
          companyId: current.companyId,
          branchId: current.branchId,
          reason: reason.trim(),
        }).unwrap();
        notify("info", "Cancelled", `${current.refno} cancelled.`);
        startNextDocument();
        reloadDamaged();
        return true;
      } catch (error) {
        notify("warn", "Error", apiErrorText(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [cancelMutation, reloadDamaged, startNextDocument],
  );

  /** deleteDraft (after the confirmation). */
  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    setBusy("deleting");
    try {
      await deleteMutation({
        svhId: current.svhId,
        accYear: current.accYear,
        companyId: current.companyId,
        branchId: current.branchId,
      }).unwrap();
      notify("info", "Deleted", `${current.refno} deleted.`);
      startNextDocument();
      return true;
    } catch (error) {
      notify("warn", "Error", apiErrorText(error));
      return false;
    } finally {
      setBusy(null);
    }
  }, [deleteMutation, startNextDocument]);

  return {
    draft,
    draftRef,
    busy,
    roleLedgers,
    reasonsFetching,
    damaged: {
      active: damagedActive,
      rows: damagedActive ? damagedQuery.currentData ?? [] : [],
      loading: damagedActive && damagedQuery.isFetching,
    },
    pickKey,
    focusRequest,
    // header
    setKind,
    setGodown,
    setRateSource,
    setHeader,
    setHint,
    // lines
    pickItem,
    resolveBarcode,
    editLine,
    insertLine,
    deleteLine,
    openPick,
    closePick,
    applyHolding,
    takeDamagedRow,
    refuse,
    // document
    gate,
    save,
    validate,
    cancelDocument,
    deleteDraft,
    load,
    newDocument,
    beginEdit,
  };
}

export type StockAdjustmentDraftApi = ReturnType<typeof useStockAdjustmentDraft>;
