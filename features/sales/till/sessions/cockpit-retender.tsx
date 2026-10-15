"use client";

/**
 * Re-tender from the Session Cockpit — Qt c77f3f1 `retenderBill`: the sale
 * bill's own Ctrl+F6 dialog (`SaleBillRetender`) opened on the bill picked on
 * the Bills tab, keyed by the bill's id and the cockpit's company / branch /
 * year. Who may, and into which session, is the server's call (the post
 * answers 403 / its notes).
 *
 * The dialog is the Testbill screen's own (`@/features/sales/testbill/retender/
 * retender-dialog.tsx`) and the body its own builder (`buildRetenderBody`),
 * fed exactly as the bill screen feeds them for a bill that is NOT the one on
 * its screen (`use-bill-draft.ts#submitRetender`): the bill's `/tender-context`,
 * the tender master, and a scope-only stand-in draft — the bill's company,
 * branch, year and date, no customer (`tdPartyLedgerId` null; Qt's own
 * re-tender sends none either). Nothing here edits the testbill modules.
 */
import { useEffect, useRef, useState } from "react";
import { getAuthSessionId, getAuthUserId, getOrCreateClientDeviceId, getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { useAppDispatch } from "@/store/hooks";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { saleBillApi, useRetenderBillMutation, type TenderContext } from "@/features/sales/testbill/api/bills";
import { errorMessageOf } from "@/features/sales/testbill/domain/notes";
import { RetenderDialog } from "@/features/sales/testbill/retender/retender-dialog";
import { buildRetenderBody, type VoidPick } from "@/features/sales/testbill/retender/retender-payload";
import { createBillDraft } from "@/features/sales/testbill/state/factories";
import type { BillTenderRow } from "@/features/sales/testbill/types";
import { getTillSessionId } from "../shared/session-store";
import type { RetenderTarget } from "./cockpit";

/** Who keys the re-tender — as the bill screen names its actor (`useSaveActor`). */
function saveActor(): SaveActor {
  return {
    userId: getAuthUserId() ?? "",
    userName: getUserInfo()?.userName ?? null,
    sessionId: getTillSessionId() ?? getAuthSessionId(),
    deviceId: getOrCreateClientDeviceId(),
    deviceMasterId: getUserInfo()?.deviceId ?? null,
    deviceType: getUserInfo()?.deviceType ?? null,
  };
}

export type CockpitRetenderProps = {
  target: RetenderTarget | null;
  onClose: () => void;
  /** The server took it: the cockpit re-reads. */
  onRetendered: () => void;
};

export function CockpitRetender({ target, onClose, onRetendered }: CockpitRetenderProps) {
  return target ? (
    <RetenderBody key={target.key.sbId} target={target} onClose={onClose} onRetendered={onRetendered} />
  ) : null;
}

function RetenderBody({ target, onClose, onRetendered }: CockpitRetenderProps & { target: RetenderTarget }) {
  const dispatch = useAppDispatch();
  const { data: masters = [], isLoading: mastersLoading } = useGetTenderMastersQuery();
  const [retenderMutation] = useRetenderBillMutation();
  const [context, setContext] = useState<TenderContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [actor] = useState(saveActor);
  /** The cockpit's close, as of the last render (the read below runs once per bill). */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    let cancelled = false;
    // Not the lazy hook: a lazy trigger fired from a mount effect resolves
    // undefined and never fetches. `subscribe: false` holds nothing once read.
    dispatch(saleBillApi.endpoints.getTenderContext.initiate(target.key, { subscribe: false, forceRefetch: true }))
      .unwrap()
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(errorMessageOf(error));
        closeRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, target.key]);

  const refno = context?.sbBillRefno ?? target.refno;
  const billDate = context?.sbBillDate ? context.sbBillDate.slice(0, 10) : "";
  // The dialog seeds its "what really happened" rows from the masters when it
  // mounts on the context: hold the context back until the masters are in.
  const ready = context !== null && !mastersLoading;

  const submit = async (voids: VoidPick[], replacements: BillTenderRow[], remark: string) => {
    if (!context || busy) return;
    // The builder wants the bill's OWN scope and date: a scope-only stand-in.
    const scopeDraft = createBillDraft({
      companyId: target.key.sbCompanyId,
      branchId: target.key.sbBranchId,
      accYear: target.key.sbAccYear,
      companyStateCode: "",
      billDate,
    });
    setBusy(true);
    try {
      await retenderMutation(
        buildRetenderBody(target.key, context, voids, replacements, remark, scopeDraft, actor),
      ).unwrap();
      toast.success(`Bill ${refno} re-tendered.`.replace("  ", " "));
      onRetendered();
    } catch (error) {
      toast.error(errorMessageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RetenderDialog
      // Mounted afresh once ready: its rows are seeded from the masters and the
      // bill's date on mount (its own key is the bill's refno, which may be null).
      key={ready ? "ready" : "loading"}
      isOpen
      context={ready ? context : null}
      loading={!ready}
      masters={masters}
      billDate={billDate}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
      onSubmit={(voids, replacements, remark) => submit(voids, replacements, remark)}
    />
  );
}
