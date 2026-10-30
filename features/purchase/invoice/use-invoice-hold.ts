"use client";

/**
 * Purchase Entry — F9 Hold, F10 Pick held and the 45-second autosave (Qt
 * NexERP 4c09536 / eb55337, `PurchaseHoldSupport`), on the house `/txn-holds`.
 *
 *  F9  Hold      a NEW bill with lines is parked (its save body, verbatim) and
 *                the screen clears.
 *  F10 Pick held a parked one comes back: its lease is taken (`/resume`), its
 *                body is saved as a DRAFT, the hold is closed onto that draft
 *                (`/convert`) and the draft opens — the server rebuilds every
 *                figure.
 *  Autosave      every 45 s while a new bill has lines, one AUTOSAVE row per
 *                device × operator × doc type (the server overwrites it in
 *                place). Opening the screen with one live offers it back. Save,
 *                post, New and a confirmed discard drop it.
 *
 * Bodies and the envelope are `invoice-hold.ts`'s; this drives the requests.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import {
  quotationApi,
  useConvertTxnHoldMutation,
  useDeleteTxnHoldMutation,
  useForceReleaseTxnHoldMutation,
  useReleaseTxnHoldMutation,
  useResumeTxnHoldMutation,
  useSaveTxnHoldMutation,
} from "@/store/api/quotationApi";
import { useAppDispatch } from "@/store/hooks";
import { purchaseRefusalText } from "../shared/purchase.format";
import type { PurchaseDocKey } from "../shared/purchase.types";
import { usePurchaseInvoiceSaveMutation } from "./invoice.api";
import { usePurchaseInvoiceAutosaveListMutation } from "./invoice-header.api";
import {
  holdBody,
  myAutosave,
  PURCHASE_AUTOSAVE_INTERVAL_MS,
  PURCHASE_HOLD_DOC_TYPE,
  PURCHASE_RECOVERY_DELAY_MS,
  recoveryQuestion,
  restoreBody,
  type PurchaseHoldDescriptor,
} from "./invoice-hold";
import type { InvoiceDraft, SavePurchaseInvoiceDto } from "./invoice.types";

export type UseInvoiceHoldOptions = {
  draftRef: MutableRefObject<InvoiceDraft>;
  /** The screen's save body (post = false), as it would be saved now. */
  buildBody: () => SavePurchaseInvoiceDto;
  /** An unsaved NEW bill with at least one item line. */
  isNewWithLines: () => boolean;
  /** The bill's item lines and net payable, for the held list. */
  summary: () => { itemCount: number; netAmount: number };
  /** Clear the screen after a hold. */
  reset: () => void;
  /** Open a saved draft for keying. */
  open: (key: PurchaseDocKey) => Promise<boolean>;
  /** Offer an autosave back once, after the screen opens (false: it reopened remembered work, or a document). */
  offerOnOpen: boolean;
  /** False: no autosave ticks (rights, or a screen still loading). */
  enabled: boolean;
};

type ActiveHold = { txhId: string; accYear: string };

export function useInvoiceHold(options: UseInvoiceHoldOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const dispatch = useAppDispatch();
  const [saveHold] = useSaveTxnHoldMutation();
  const [resumeHold] = useResumeTxnHoldMutation();
  const [releaseHold] = useReleaseTxnHoldMutation();
  const [forceRelease] = useForceReleaseTxnHoldMutation();
  const [convertHold] = useConvertTxnHoldMutation();
  const [deleteHold] = useDeleteTxnHoldMutation();
  const [saveInvoice] = usePurchaseInvoiceSaveMutation();
  const [listAutosaves] = usePurchaseInvoiceAutosaveListMutation();

  const [heldOpen, setHeldOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const autosave = useRef<{ id: string; accYear: string } | null>(null);
  const lastSnapshot = useRef("");
  const activeHold = useRef<ActiveHold | null>(null);

  const descriptor = useCallback((): PurchaseHoldDescriptor => {
    const draft = latest.current.draftRef.current;
    const { itemCount, netAmount } = latest.current.summary();
    return {
      companyId: draft.companyId,
      branchId: draft.branchId,
      accYear: draft.accYear,
      deviceId: draft.deviceId || getUserInfo()?.deviceId || "",
      heldBy: getAuthUserId() ?? "",
      supplierId: draft.supplierId,
      supplierName: draft.supplierName,
      itemCount,
      netAmount,
    };
  }, []);

  const lockArgs = useCallback((txhId: string, accYear: string) => {
    const desc = descriptor();
    return {
      txhId,
      deviceId: desc.deviceId,
      scope: { txhCompanyId: desc.companyId, txhBranchId: desc.branchId, txhAccYear: accYear || desc.accYear },
    };
  }, [descriptor]);

  // ------------------------------------------------------------- autosave
  const dropAutosave = useCallback(() => {
    lastSnapshot.current = "";
    const row = autosave.current;
    autosave.current = null;
    if (row) {
      void deleteHold({ txhId: row.id, txhAccYear: row.accYear })
        .unwrap()
        .catch(() => {
          /* the server sweeps stale autosaves; nothing to tell the operator */
        });
    }
  }, [deleteHold]);

  const autosaveNow = useCallback(async () => {
    const opts = latest.current;
    if (!opts.enabled || !opts.isNewWithLines()) {
      return;
    }
    const desc = descriptor();
    if (!desc.deviceId || !desc.companyId) {
      return;
    }
    const payload = opts.buildBody();
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSnapshot.current) {
      return; // nothing changed, nothing sent
    }
    try {
      const row = await saveHold(holdBody(desc, payload, "AUTOSAVE")).unwrap();
      autosave.current = { id: row.txhId, accYear: row.txhAccYear || desc.accYear };
      lastSnapshot.current = snapshot;
    } catch {
      /* a missed snapshot is retried on the next tick */
    }
  }, [descriptor, saveHold]);

  useEffect(() => {
    if (!options.enabled) {
      return;
    }
    const timer = window.setInterval(() => void autosaveNow(), PURCHASE_AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autosaveNow, options.enabled]);

  // -------------------------------------------------------- back as a draft
  /** The held body becomes a NEW draft, the hold closes onto it, the draft opens. */
  const restore = useCallback(
    async (payload: unknown, hold: ActiveHold | null): Promise<boolean> => {
      const body = restoreBody(payload);
      if (!body) {
        toast.warn("That hold carried no purchase bill.", { title: "Pick held" });
        return false;
      }
      setWorking(true);
      try {
        const saved = await saveInvoice(body).unwrap();
        const header = saved.data.header;
        if (hold) {
          await convertHold({
            ...lockArgs(hold.txhId, hold.accYear),
            conversion: { txhConvertedDocId: header.piId, txhConvertedAccYear: header.piAccYear, txhConvertedRefno: header.piRefno },
          })
            .unwrap()
            .catch(() => {
              /* the draft exists; a hold left LOCKED lapses with its lease */
            });
        }
        activeHold.current = null;
        dropAutosave();
        await latest.current.open({
          id: header.piId,
          companyId: header.piCompanyId,
          branchId: header.piBranchId,
          accYear: header.piAccYear,
          refno: header.piRefno,
          status: header.piStatus,
        });
        toast.info(`${header.piRefno} is back as a draft — the server worked out its figures again.`, { title: "Brought back" });
        return true;
      } catch (error) {
        // The parked work stays parked: lease handed back, snapshot kept.
        if (hold) {
          void releaseHold(lockArgs(hold.txhId, hold.accYear))
            .unwrap()
            .catch(() => undefined);
        }
        autosave.current = null;
        toast.warn(`The parked purchase bill could not become a draft — it stays parked:\n${purchaseRefusalText(error)}`, {
          title: "Not brought back",
        });
        return false;
      } finally {
        setWorking(false);
      }
    },
    [convertHold, dropAutosave, lockArgs, releaseHold, saveInvoice],
  );

  // ------------------------------------------------------------------ F9
  const hold = useCallback(async () => {
    const opts = latest.current;
    if (working) {
      return;
    }
    if (!opts.isNewWithLines()) {
      toast.warn("Only a new purchase bill with lines can be held — a saved draft is already on the list.", { title: "Hold" });
      return;
    }
    const desc = descriptor();
    if (!desc.deviceId) {
      toast.warn("This login has no registered device, so nothing can be parked.", { title: "Hold" });
      return;
    }
    if (!(await confirm({ title: "Hold", message: "Suspend this purchase bill and start the next one?", confirmLabel: "Hold" }))) {
      return;
    }
    setWorking(true);
    try {
      await saveHold(holdBody(desc, opts.buildBody(), "HOLD")).unwrap();
      dropAutosave();
      opts.reset();
      toast.success(`Parked${desc.supplierName ? ` — ${desc.supplierName}` : ""}. F10 brings it back.`, { title: "Held" });
    } catch (error) {
      toast.apiError(error, { title: "Not held" });
    } finally {
      setWorking(false);
    }
  }, [descriptor, dropAutosave, saveHold, working]);

  // ----------------------------------------------------------------- F10
  const pick = useCallback(async () => {
    const opts = latest.current;
    if (working) {
      return;
    }
    if (opts.draftRef.current.dirty && opts.isNewWithLines()) {
      const yes = await confirm({
        title: "Pick held",
        message: "This purchase bill hasn't been saved. Discard it and pick a held one?",
        confirmLabel: "Discard",
      });
      if (!yes) {
        return;
      }
    }
    setHeldOpen(true);
  }, [working]);

  const onPickHeld = useCallback(
    async (txhId: string) => {
      setHeldOpen(false);
      const accYear = latest.current.draftRef.current.accYear;
      try {
        const row = await resumeHold(lockArgs(txhId, accYear)).unwrap();
        const held: ActiveHold = { txhId, accYear: row.txhAccYear || accYear };
        activeHold.current = held;
        let payload: unknown = row.txhPayload;
        if (!payload) {
          const fetched = await dispatch(
            quotationApi.endpoints.getTxnHold.initiate({ txhId, txhAccYear: held.accYear }, { subscribe: false, forceRefetch: true }),
          ).unwrap();
          payload = fetched?.txhPayload;
        }
        await restore(payload, held);
      } catch (error) {
        toast.apiError(error, { title: "Not opened" });
      }
    },
    [dispatch, lockArgs, restore, resumeHold],
  );

  const onTakeOver = useCallback(
    async (row: TxnHoldPayload): Promise<boolean> => {
      try {
        await forceRelease(lockArgs(row.txhId, row.txhAccYear)).unwrap();
        toast.info(`${row.txhHoldNo || "The hold"} was released — it can be opened now.`);
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [forceRelease, lockArgs],
  );

  /** The screen saved / posted: the held work is a document now (Qt `documentSaved`). */
  const documentSaved = useCallback(
    (piId: string, accYear: string, refno: string) => {
      const held = activeHold.current;
      activeHold.current = null;
      if (held) {
        void convertHold({
          ...lockArgs(held.txhId, held.accYear),
          conversion: { txhConvertedDocId: piId, txhConvertedAccYear: accYear, txhConvertedRefno: refno },
        })
          .unwrap()
          .catch(() => undefined);
      }
      dropAutosave();
    },
    [convertHold, dropAutosave, lockArgs],
  );

  // ------------------------------------------- the autosave left behind
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current || !options.offerOnOpen || !options.enabled) {
      return;
    }
    const timer = window.setTimeout(async () => {
      offered.current = true;
      const desc = descriptor();
      if (!desc.companyId || !desc.deviceId || !desc.heldBy || latest.current.draftRef.current.piId) {
        return;
      }
      try {
        const rows = await listAutosaves({
          txhCompanyId: desc.companyId,
          txhBranchId: desc.branchId,
          txhAccYear: desc.accYear,
          txhDocType: PURCHASE_HOLD_DOC_TYPE,
        }).unwrap();
        const row = myAutosave(rows, desc.heldBy, desc.deviceId);
        if (!row || latest.current.draftRef.current.piId || latest.current.draftRef.current.dirty) {
          return;
        }
        const yes = await confirm({ title: "Unsaved purchase bill", message: recoveryQuestion(row), confirmLabel: "Bring it back", cancelLabel: "Throw it away" });
        if (!yes) {
          void deleteHold({ txhId: row.txhId, txhAccYear: row.txhAccYear }).unwrap().catch(() => undefined);
          return;
        }
        autosave.current = { id: row.txhId, accYear: row.txhAccYear };
        let payload: unknown = row.txhPayload;
        if (!payload) {
          const fetched = await dispatch(
            quotationApi.endpoints.getTxnHold.initiate({ txhId: row.txhId, txhAccYear: row.txhAccYear }, { subscribe: false, forceRefetch: true }),
          ).unwrap();
          payload = fetched?.txhPayload;
        }
        await restore(payload, null);
      } catch {
        /* no recovery offered — the screen works as it is */
      }
    }, PURCHASE_RECOVERY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deleteHold, descriptor, dispatch, listAutosaves, options.enabled, options.offerOnOpen, restore]);

  return {
    hold,
    pick,
    heldOpen,
    closeHeld: () => setHeldOpen(false),
    onPickHeld,
    onTakeOver,
    documentSaved,
    dropAutosave,
    working,
  };
}

export type InvoiceHoldApi = ReturnType<typeof useInvoiceHold>;
