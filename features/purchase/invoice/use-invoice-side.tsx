"use client";

/**
 * Purchase Entry (menu 24) — everything beside the lines, as one hook the entry
 * view places (Qt NexERP 737e671..e0c56ef):
 *
 *  - 88cd3f2  the charges grid, the auto-apply seed, Payees…;
 *  - 8f2a1f4  the supplier chips (the note pops up when the operator picks);
 *  - 348957f  Payment hold… / Release hold… on a posted bill, POSTED · ON HOLD;
 *  - 9028830  TCS and the e-way bill on the header; Ctrl+F11 Purchase Return
 *             against this bill; Ctrl+F8 Payment for its supplier;
 *  - 4c09536  F9 Hold / F10 Pick held / autosave; Sister company bill;
 *             Ctrl+A attachments (as GRN / Return: in a field being typed
 *             in, Ctrl+A stays that field's select-all, as in Qt);
 *  - 7c809f9  Edit · F2 refusals, Previous / Next (Alt+PgUp / Alt+PgDn),
 *             History · Ctrl+H, Print · Ctrl+P (purpose PURCHASE_INVOICE);
 *  - 6e025ef  labels / Change Selling after a post.
 *
 * The draft is still the one funnel (`api.dispatch`); this hook only adds the
 * requests and dialogs around it.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { useDocumentPrint } from "@/features/printing/hooks/useDocumentPrint";
import { DateInput } from "@/components/design-system/ui";
import { Field } from "@/features/sales/quotation/components/fields";
import { HeldListModal } from "@/features/sales/quotation/components/held-list-modal";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { buildPartyHandoffHref } from "@/lib/navigation/party-handoff";
import { toast } from "@/lib/notify";
import type { TxnKeyRow } from "@/lib/txn-keys";
import { PurchaseAttachDialog } from "../shared/components/purchase-attach-dialog";
import { usePurchaseAfterPost } from "../shared/components/purchase-labels-dialog";
import { buildReturnAgainstBillHref } from "../shared/purchase-handoff";
import { purchaseRefusalText } from "../shared/purchase.format";
import { STATUS } from "./invoice.constants";
import { buildPayload, itemLines } from "./invoice.state";
import { autoApplyCharges } from "./invoice-charges";
import { useGetPurchaseChargeMasterQuery } from "../shared/purchase.api";
import { usePurchaseInvoiceHoldMutation, usePurchaseInvoiceSupplierContextMutation } from "./invoice-header.api";
import type { SisterBillPull, SupplierContext } from "./invoice-header.types";
import { isPurchaseBillHold, PURCHASE_HOLD_DOC_TYPE, PURCHASE_HOLD_KIND } from "./invoice-hold";
import { noteToShowOnPick } from "./supplier-context";
import { billFromOptions, pickBillFrom } from "./invoice-fidelity";
import { useInvoiceHold } from "./use-invoice-hold";
import type { PurchaseInvoiceDraftApi } from "./use-purchase-invoice-draft";
import { isTypingTarget } from "../grn/grn.keys";
import { PurchasePayeeDialog } from "../shared/components/purchase-payee-dialog";
import { InvoiceChargesGrid } from "./components/invoice-charges-grid";
import { SisterBillDialog } from "./components/sister-bill-dialog";
import { SupplierChips } from "./components/supplier-chips";

const IDS = {
  tcs: "purchase-invoice-tcs",
  ewbNo: "purchase-invoice-ewb-no",
  ewbDate: "purchase-invoice-ewb-date",
} as const;

const AMOUNT_PATTERN = /^[\d,]*(\.\d{0,2})?$/;
const DOC_LABEL = "Purchase Invoice";
const NOUN = "purchase invoice";

/** The keys this hook binds itself, for the F1 sheet. */
export const SIDE_KEY_ROWS: readonly TxnKeyRow[] = [
  { label: "Hold this bill", keyText: "F9" },
  { label: "Pick a held bill", keyText: "F10" },
  { label: "Attachments", keyText: "Ctrl+A" },
  { label: "Return goods against this bill", keyText: "Ctrl+F11" },
  { label: "Pay this bill's supplier", keyText: "Ctrl+F8" },
  { label: "Previous document", keyText: "Alt+PgUp" },
  { label: "Next document", keyText: "Alt+PgDn" },
  { label: "History", keyText: "Ctrl+H" },
  { label: "Print", keyText: "Ctrl+P" },
];

/** GET /purchase/lookup/supplier-context for the supplier on the bill; the note pops up on a pick. */
function useSupplierContext(scope: { companyId: string; branchId: string; supplierId: string; docDate: string; refresh: string }) {
  const [fetchContext] = usePurchaseInvoiceSupplierContextMutation();
  /** The answer, with the supplier it is about — another supplier's answer is no answer. */
  const [answer, setAnswer] = useState<{ supplierId: string; context: SupplierContext | null } | null>(null);
  const picked = useRef<string | null>(null);
  const { companyId, branchId, supplierId, docDate, refresh } = scope;

  useEffect(() => {
    if (!supplierId || !companyId || !branchId) {
      return;
    }
    let live = true;
    fetchContext({ companyId, branchId, supplierId, ...(docDate ? { onDate: docDate } : {}) })
      .unwrap()
      .then((context) => {
        if (!live) {
          return;
        }
        setAnswer({ supplierId, context: context ?? null });
        if (picked.current === supplierId) {
          picked.current = null;
          const note = noteToShowOnPick(context);
          if (note) {
            toast.info(note.message, { title: note.title });
          }
        }
      })
      .catch(() => {
        if (live) {
          setAnswer({ supplierId, context: null }); // no chips — the bill can still be keyed
        }
      });
    return () => {
      live = false;
    };
  }, [branchId, companyId, docDate, fetchContext, refresh, supplierId]);

  const markPicked = useCallback((id: string) => {
    picked.current = id;
  }, []);
  return { context: answer && answer.supplierId === supplierId ? answer.context : null, markPicked };
}

export type UseInvoiceSideOptions = {
  api: PurchaseInvoiceDraftApi;
  /** A DRAFT open for keying. */
  editable: boolean;
  /** Ask before throwing away unsaved work. */
  guardDirty: (title: string, message: string, then: () => void) => void;
  /** The screen's own keys are live (no picker / settings overlay of its own open). */
  keysEnabled: boolean;
  /** The screen opened on a stored document or on remembered work — no autosave offered. */
  openedOnWork: boolean;
  /** May start a new bill (the hold's F9 / F10). */
  mayStartNew: boolean;
  /** Classes the view gives the TCS box (right-aligned) and the e-way bill pair. */
  amountClassName?: string;
  ewbClassName?: string;
};

export function useInvoiceSide({
  api,
  editable,
  guardDirty,
  keysEnabled,
  openedOnWork,
  mayStartNew,
  amountClassName,
  ewbClassName,
}: UseInvoiceSideOptions) {
  const { draft, draftRef } = api;
  const router = useRouter();
  const isDraft = draft.status === STATUS.draft;
  const isPosted = draft.status === STATUS.posted;
  const saved = Boolean(draft.piId);
  const charges = useMemo(() => draft.charges ?? [], [draft.charges]);
  const { setHint: say } = api;

  // ------------------------------------------------------------ supplier
  const { context, markPicked } = useSupplierContext({
    companyId: draft.companyId,
    branchId: draft.branchId,
    supplierId: draft.supplierId,
    docDate: draft.docDate,
    // A post / cancel moves the outstanding and the bills on hold.
    refresh: `${draft.piId}:${draft.status}:${draft.paymentHold}`,
  });
  const onSupplierPicked = useCallback(
    (id: string, name: string) => {
      markPicked(id);
      api.setSupplier(id, name);
    },
    [api, markPicked],
  );

  // The supplier's context: its default credit days and Bill from (Qt fillBillFrom / creditDays).
  const billFrom = useMemo(() => billFromOptions(context), [context]);
  useEffect(() => {
    if (!context || !editable) {
      return;
    }
    const days = typeof context.creditDays === "number" ? context.creditDays : null;
    api.dispatch({ type: "supplierDefaults", creditDays: days, billFromGstin: pickBillFrom(billFrom, draftRef.current.ext.billFromGstin) });
  }, [api, billFrom, context, draftRef, editable]);

  // ------------------------------------------------------------- charges
  const { data: masters = [], isLoading: mastersLoading } = useGetPurchaseChargeMasterQuery();
  useEffect(() => {
    // A fresh bill starts with the purchase charges marked auto-apply (Qt seedAutoCharges).
    if (!editable || draft.piId || draft.chargesSeeded || mastersLoading) {
      return;
    }
    api.dispatch({ type: "chargesSeed", masters: autoApplyCharges(masters) });
  }, [api, draft.chargesSeeded, draft.piId, editable, masters, mastersLoading]);

  const [payeeKey, setPayeeKey] = useState<string | null>(null);
  const payeeRow = charges.find((row) => row.key === payeeKey) ?? null;
  const onPayees = useCallback(
    (key: string | null) => {
      if (!editable) {
        return;
      }
      const row = charges.find((candidate) => candidate.key === key);
      if (!row) {
        say("Pick an off-bill charge first — Payees… names who is owed it.");
        return;
      }
      if (row.onBill) {
        say(`${row.name} is on the supplier's bill — the supplier is paid for it.`);
        return;
      }
      setPayeeKey(row.key);
    },
    [charges, editable, say],
  );

  // ---------------------------------------------------------- payment hold
  const [holdMutation, { isLoading: holding }] = usePurchaseInvoiceHoldMutation();
  const [holdAsk, setHoldAsk] = useState(false);
  const toggleHold = useCallback(() => {
    if (draftRef.current.status !== STATUS.posted || !draftRef.current.piId) {
      return;
    }
    setHoldAsk(true);
  }, [draftRef, setHoldAsk]);
  const runHold = useCallback(
    async (reason: string) => {
      setHoldAsk(false);
      const current = draftRef.current;
      const hold = !current.paymentHold;
      try {
        const payload = await holdMutation({ piId: current.piId, accYear: current.accYear, hold, reason: reason.trim() }).unwrap();
        api.applyPayload(payload, "browse");
        toast.success(
          hold
            ? `${current.refno} is on payment hold — Payment refuses it until it is released.`
            : `${current.refno} is released for payment.`,
          { title: hold ? "On hold" : "Released" },
        );
      } catch (error) {
        say(purchaseRefusalText(error));
        toast.apiError(error, { title: hold ? "Not held" : "Not released" });
      }
    },
    [api, draftRef, holdMutation, say, setHoldAsk],
  );
  // Qt applyLoaded: a held bill says why on the hint line.
  const holdNotice = draft.paymentHold && isPosted ? `On payment hold — ${draft.holdReason || "no reason given"}. Payment refuses it until it is released.` : "";
  useEffect(() => {
    if (holdNotice) {
      say(holdNotice);
    }
  }, [holdNotice, say]);

  // ------------------------------------------------------- sister company
  const [sisterOpen, setSisterOpen] = useState(false);
  const onSisterPulled = useCallback(
    (pull: SisterBillPull) => {
      setSisterOpen(false);
      if (!pull.bill.supplierId) {
        toast.warn(
          `${pull.bill.sisterCompanyName || "That company"} is not set up as our supplier — add it as a supplier (GSTIN ${pull.bill.sisterGstin || "—"}) first.`,
          { title: "No supplier" },
        );
        return;
      }
      api.dispatch({ type: "sisterPull", pull });
      // The pulled lines name their items; the lookups bring signature, factor and GST %.
      api.fillNames(api.draftRef.current);
    },
    [api, setSisterOpen],
  );

  // --------------------------------------------------------- attachments
  const [attachOpen, setAttachOpen] = useState(false);

  // ------------------------------------------------------ hold / autosave
  const hold = useInvoiceHold({
    draftRef,
    buildBody: () => buildPayload(draftRef.current, false, todayIso()).body,
    isNewWithLines: () => {
      const current = draftRef.current;
      return !current.piId && current.status === STATUS.draft && itemLines(current).length > 0;
    },
    summary: () => ({ itemCount: itemLines(draftRef.current).length, netAmount: draftRef.current.totals?.netPayable ?? 0 }),
    reset: api.newDocument,
    open: (key) => api.load(key, true),
    offerOnOpen: !openedOnWork,
    enabled: mayStartNew && Boolean(draft.companyId && draft.deviceId),
  });

  // ------------------------------------------------- after a save / post
  const afterPost = usePurchaseAfterPost({ companyId: draft.companyId, branchId: draft.branchId });
  /** Call when `api.save(post)` resolved true. */
  const afterSave = useCallback(
    (post: boolean) => {
      const current = draftRef.current;
      if (!current.piId) {
        return;
      }
      hold.documentSaved(current.piId, current.accYear, current.refno);
      if (post && current.status === STATUS.posted) {
        afterPost.run({ docType: "PURCHASE_BILL", docId: current.piId, accYear: current.accYear, refno: current.refno });
      }
    },
    [afterPost, draftRef, hold],
  );

  // ---------------------------------------------------------- doc nav
  const [adjacent] = useGetTxnAdjacentMutation();
  const [stepping, setStepping] = useState(false);
  const step = useCallback(
    (previous: boolean) => {
      const current = draftRef.current;
      if (!current.piId && !previous) {
        say(`A new ${NOUN} is the newest — nothing comes after it.`);
        return;
      }
      guardDirty("Leave this bill", "This bill has unsaved changes. Discard them?", () => {
        void (async () => {
          setStepping(true);
          try {
            const answer = await adjacent({
              docType: "PURCHASE_BILL",
              companyId: current.companyId,
              branchId: current.branchId,
              accYear: current.accYear,
              ...(current.piId ? { docId: current.piId } : {}),
              direction: previous ? "prev" : "next",
            }).unwrap();
            const doc = answer.doc;
            if (!doc) {
              say(!current.piId ? `There is no ${NOUN} yet.` : previous ? `This is the oldest ${NOUN}.` : `This is the newest ${NOUN}.`);
              return;
            }
            if (current.dirty && !current.piId) {
              hold.dropAutosave();
            }
            api.forgetRemembered();
            await api.load(
              { id: doc.docId, companyId: doc.companyId, branchId: doc.branchId, accYear: doc.accYear, refno: doc.refno ?? "", status: doc.status },
              false,
            );
          } catch (error) {
            say(purchaseRefusalText(error));
          } finally {
            setStepping(false);
          }
        })();
      });
    },
    [adjacent, api, draftRef, guardDirty, hold, say],
  );

  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.piId) {
      say(`Save the ${NOUN} first — a new one has no history yet.`);
      return;
    }
    setHistoryTarget({ docId: current.piId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [draftRef, say, setHistoryTarget]);

  const printer = useDocumentPrint({ companyId: draft.companyId || null, purposeCode: "PURCHASE_INVOICE" });
  const print = useCallback(() => {
    const current = draftRef.current;
    if (!current.piId) {
      say(`Save the ${NOUN} first, then print it.`);
      return;
    }
    void printer.print({ docId: current.piId, companyId: current.companyId, accYear: current.accYear, branchId: current.branchId });
  }, [draftRef, printer, say]);

  /** F2 where Edit is not offered: why (Qt PurchaseDocNav::edit). */
  const explainEdit = useCallback(() => {
    const current = draftRef.current;
    if (!current.piId) {
      say(`A new ${NOUN} — key it and Save Draft (Ctrl+S) or Post.`);
    } else if (current.status === STATUS.draft) {
      say(`${current.refno} is a draft — change it, then Save Draft (Ctrl+S) or Post.`);
    } else if (current.status === STATUS.cancelled) {
      say(`${current.refno} is cancelled — it cannot be changed. Enter a new one (Alt+N).`);
    } else {
      say(`${current.refno} is posted — only a draft can be changed. Cancel it (Alt+X) and enter it again.`);
    }
  }, [draftRef, say]);

  // ------------------------------------------------ sibling screens
  const returnFromBill = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== STATUS.posted || !current.piId) {
      say("Ctrl+F11 returns goods against a posted bill — post or open one first.");
      return;
    }
    router.push(
      buildReturnAgainstBillHref({
        piId: current.piId,
        accYear: current.accYear,
        supplierId: current.supplierId,
        supplierName: current.supplierName,
        refno: current.refno,
      }),
    );
  }, [draftRef, router, say]);

  const payThisBill = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== STATUS.posted || !current.supplierId) {
      say("Ctrl+F8 pays a posted bill — post or open one first.");
      return;
    }
    if (current.paymentHold) {
      toast.warn("This bill is on payment hold — Payment will refuse it until it is released.", { title: "On hold" });
    }
    // The supplier is its own ledger (sup_id = led_id): Payment's party.
    router.push(buildPartyHandoffHref("/accounts/payment", { partyId: current.supplierId, partyName: current.supplierName }));
  }, [draftRef, router, say]);

  // ------------------------------------------------------------ keys
  const sideKeys = useRef({ keysEnabled, hold, editable, returnFromBill, payThisBill, openAttach: () => setAttachOpen(true) });
  useEffect(() => {
    sideKeys.current = { keysEnabled, hold, editable, returnFromBill, payThisBill, openAttach: () => setAttachOpen(true) };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = sideKeys.current;
      if (event.defaultPrevented || !current.keysEnabled || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === "F9" && !ctrl && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void current.hold.hold();
      } else if (event.key === "F10" && !ctrl && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void current.hold.pick();
      } else if (event.key === "F11" && ctrl && !event.altKey) {
        event.preventDefault();
        current.returnFromBill();
      } else if (event.key === "F8" && ctrl && !event.altKey) {
        event.preventDefault();
        current.payThisBill();
      } else if (
        ctrl &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "a" || event.key === "A") &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        if (!event.repeat) {
          current.openAttach();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ------------------------------------------------------------ pieces
  const statusText = isPosted && draft.paymentHold ? "POSTED · ON HOLD" : draft.status;

  /** Supplier TCS — typed in the TOTALS panel (Qt PurchaseTotalsPanel takes m_txtTcs). */
  const tcsInput: ReactNode = (
    <input
      id={IDS.tcs}
      className={cx(quotationStyles.input, amountClassName)}
      value={draft.tcsAmount ?? ""}
      disabled={!editable}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      aria-label="Supplier TCS (if charged)"
      title="The TCS the supplier charged on the bill — added to the net payable."
      data-quotation-focus={IDS.tcs}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (AMOUNT_PATTERN.test(next)) {
          api.setHeader({ tcsAmount: next.replace(/,/g, "") });
        }
      }}
    />
  );

  /** Header row 4: E-way bill "no · date" (two boxes in one cell). */
  const ewbField: ReactNode = (
    <Field label="E-way bill" htmlFor={IDS.ewbNo}>
      <span className={ewbClassName}>
        <input
          id={IDS.ewbNo}
          className={quotationStyles.input}
          value={draft.ewbNo ?? ""}
          disabled={!editable}
          maxLength={15}
          placeholder="e-way bill no"
          autoComplete="off"
          data-quotation-focus={IDS.ewbNo}
          onChange={(event) => api.setHeader({ ewbNo: event.target.value.trim() })}
        />
        <DateInput
          id={IDS.ewbDate}
          value={draft.ewbDate ?? ""}
          disabled={!editable}
          aria-label="E-way bill date"
          onChange={(value) => api.setHeader({ ewbDate: value })}
        />
      </span>
    </Field>
  );

  const chips = draft.supplierId ? <SupplierChips context={context} /> : null;

  const chargesGrid = (
    <InvoiceChargesGrid
      rows={charges}
      editable={editable}
      masters={masters}
      mastersLoading={mastersLoading}
      onAdd={(master) => api.dispatch({ type: "chargeAdd", master })}
      onEdit={(key, field, raw) => api.dispatch({ type: "chargeEdit", key, field, raw })}
      onRemove={(key) => api.dispatch({ type: "chargeRemove", key })}
      onPayees={onPayees}
    />
  );

  const working = holding || stepping || hold.working;
  /** Qt row 1 (after From GRN / PO and Batches / serials, which the view draws): Sister, Attach, Return, Pay, Payment hold. */
  const row1Buttons: ReactNode = (
    <>
      <button
        type="button"
        className={quotationStyles.button}
        disabled={!editable || working}
        title="A sister company's sale bill raised on us becomes this purchase."
        onClick={() => setSisterOpen(true)}
      >
        Sister company bill
      </button>
      <button
        type="button"
        className={quotationStyles.button}
        title="The supplier's bill scan, damage photos — on the saved bill."
        onClick={() => setAttachOpen(true)}
      >
        Attach · Ctrl+A
      </button>
      <button type="button" className={quotationStyles.button} disabled={working} title="Return goods against this posted bill." onClick={returnFromBill}>
        Return from bill · Ctrl+F11
      </button>
      <button type="button" className={quotationStyles.button} disabled={working} title="Pay this bill's supplier (Payment)." onClick={payThisBill}>
        Pay this bill · Ctrl+F8
      </button>
      {isPosted ? (
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working}
          title="Stop this bill being paid (or release it — releasing needs the Override right)"
          onClick={toggleHold}
        >
          {draft.paymentHold ? "Release hold…" : "Payment hold…"}
        </button>
      ) : null}
    </>
  );

  /** Qt row 2's Hold · F9 (between New and Save Draft). F10 picks a held bill (key only, as in Qt). */
  const holdButton: ReactNode = (
    <button
      type="button"
      className={quotationStyles.button}
      disabled={!mayStartNew || !isDraft || saved || working}
      title="Park this unsaved bill and clear the screen (F10 brings a held one back)."
      onClick={() => void hold.hold()}
    >
      Hold · F9
    </button>
  );

  const navButtons: ReactNode = (
    <button type="button" className={quotationStyles.button} disabled={!saved} title="Every status change of this bill." onClick={openHistory}>
      History · Ctrl+H
    </button>
  );

  const dialogs: ReactNode = (
    <>
      <PurchasePayeeDialog
        key={payeeKey ?? "closed"}
        charge={payeeRow ? { name: payeeRow.name, payees: payeeRow.payeeIds.map((id, index) => ({ id, text: payeeRow.payeeNames[index] ?? id })) } : null}
        branchId={draft.branchId}
        onClose={() => setPayeeKey(null)}
        onPick={(payees) => {
          if (payeeKey) {
            api.dispatch({ type: "chargePayees", key: payeeKey, payees });
          }
          setPayeeKey(null);
        }}
      />
      {sisterOpen ? (
        <SisterBillDialog companyId={draft.companyId} branchId={draft.branchId} onClose={() => setSisterOpen(false)} onPulled={onSisterPulled} />
      ) : null}
      {holdAsk ? (
        <ReasonDialog
          title={draft.paymentHold ? `Release ${draft.refno}` : `Payment hold — ${draft.refno}`}
          message={draft.paymentHold ? "Why can it be paid now?" : "Why must this bill not be paid yet?"}
          placeholder="Type the reason"
          onCancel={() => setHoldAsk(false)}
          onConfirm={(reason) => void runHold(reason)}
        />
      ) : null}
      <HeldListModal
        isOpen={hold.heldOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        docType={PURCHASE_HOLD_DOC_TYPE}
        kind={PURCHASE_HOLD_KIND}
        recognises={isPurchaseBillHold}
        title="Held purchase bills"
        onClose={hold.closeHeld}
        onPick={(txhId) => void hold.onPickHeld(txhId)}
        onTakeOver={hold.onTakeOver}
      />
      <PurchaseAttachDialog
        open={attachOpen}
        docType="PURCHASE_BILL"
        docId={draft.piId || null}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        docLabel={draft.refno ? `Purchase ${draft.refno}` : "New purchase bill"}
        onClose={() => setAttachOpen(false)}
      />
      <TxnHistoryDialog target={historyTarget} docLabel={DOC_LABEL} onClose={() => setHistoryTarget(null)} />
      {afterPost.element}
    </>
  );

  /** A dialog of this hook's is up: the screen's own keys stay quiet. */
  const dialogOpen = payeeKey !== null || sisterOpen || holdAsk || hold.heldOpen || attachOpen || historyTarget !== null;

  return {
    statusText,
    chips,
    context,
    billFrom,
    tcsInput,
    ewbField,
    chargesGrid,
    row1Buttons,
    holdButton,
    navButtons,
    dialogs,
    dialogOpen,
    working,
    onSupplierPicked,
    afterSave,
    explainEdit,
    /** For useTxnKeys. */
    keys: {
      previous: () => step(true),
      next: () => step(false),
      history: openHistory,
      print,
    },
    /** New / a confirmed discard: the autosaved work goes too. */
    dropAutosave: hold.dropAutosave,
  };
}
