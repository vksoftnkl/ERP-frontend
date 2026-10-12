"use client";

/**
 * Expense Voucher — menu 277 (ExpV): an expense paid by one or more tenders.
 * The React port of Qt `ExpenseVoucherEntry` (NexERP d5c3637).
 *
 *   WHAT WAS SPENT   lines: a reason quick-pick fills the expense ledger
 *                    (ledgers under an Expenses group); description; amount —
 *                    the TAXABLE value with a GST bill, then a rate and the
 *                    ITC tick per line.
 *   HOW IT WAS PAID  tenders (cash, bank, UPI; no cheque — that is a
 *                    bill-wise Payment), equal to the lines to the paisa.
 *
 * Everything derived — tax, totals, where each tender's money comes from (this
 * till's drawer, the default safe, the tender's ledger), the legs, the
 * refusals, the 40A(3) / approval warnings — is the server's own answer to
 * `POST /expenses/validate`, asked 400 ms after each edit and shown as is.
 *
 * F5 saves a DRAFT, F10 posts it (create, then post by key): the number is
 * issued at post. A POSTED voucher can be cancelled (a mirror in the Rev
 * series) while its till session still takes money. The approval the EXPENSE
 * rule asks for is reported only — the gate is till phase 3.
 *
 * Layout and wiring only: the lifecycle is `state/use-expense-voucher.ts`,
 * every figure `domain/view.ts`, every body `domain/payload.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { CancelReasonDialog, ConfirmDialog, type ConfirmRequest } from "./components/expense-dialogs";
import { LinesGrid } from "./components/lines-grid";
import { TendersGrid } from "./components/tenders-grid";
import { EXPENSE_ROUTE } from "./constants";
import type { ExpenseKeys, ExpenseScope } from "./expense.types";
import { statusPill, TENDER_NOTE, type Tone } from "./domain/view";
import { useExpenseVoucher } from "./state/use-expense-voucher";
import { useExpenseTillSession } from "./till-session";
import styles from "./expense.module.scss";

/*
 * The keys, as Qt binds them — with two the browser keeps for itself:
 *
 *   F5   Save draft      F10  Post        F2  New      F8  List
 *   Alt+N  + Line        Alt+T  + Tender  Esc Close
 *
 * Qt's Ctrl+N / Ctrl+T are a new browser window and a new tab: Chromium never
 * hands either to the page, so the line and tender keys are Alt+N / Alt+T
 * here (Ctrl+N / Ctrl+T are still honoured where a shell does deliver them).
 * F1 and F5 are always swallowed — the browser's help window and its reload
 * would cost the operator the voucher.
 */
const KEYS_LEGEND =
  "Alt+N line · Alt+T tender · F5 draft · F10 post · F2 new · F8 list · cancel only while the till session still takes money";

const TONE_CLASS: Record<Tone, string | undefined> = {
  success: styles.toneSuccess,
  danger: styles.toneDanger,
  warning: styles.toneWarning,
  neutral: undefined,
  pending: undefined,
};

export type ExpenseScreenProps = {
  /** Set when the voucher is opened by its four keys (the register, or its own URL). */
  initialKeys?: ExpenseKeys;
  /**
   * Back to the register the screen was opened from. Without it the screen was
   * reached by its own URL, and Close walks the browser back.
   */
  onBackToList?: () => void;
};

export default function ExpenseScreen({ initialKeys, onBackToList }: ExpenseScreenProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const { permissions } = usePagePermissions({ href: EXPENSE_ROUTE });
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const session = useExpenseTillSession();
  // One working date for the life of the screen: the client has no session
  // "app date"; the transaction screens all take today's.
  const [today] = useState(() => todayIso());

  const scope: ExpenseScope = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      branchId: activeBranch?.id ?? "",
      accYear: (activeFiscalYear?.name ?? "").trim(),
    }),
    [activeCompany?.id, activeBranch?.id, activeFiscalYear?.name],
  );

  const api = useExpenseVoucher({ scope, initialKeys, today, session, rights });
  const { draft, view, editable, busy } = api;
  const { header } = draft;
  const payeeDropdownId = useDropdownId("paymentPayee");
  const taxDropdownId = useDropdownId("tax");

  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [activeTenderKey, setActiveTenderKey] = useState<string | null>(null);
  const [focusLineKey, setFocusLineKey] = useState<string | null>(null);
  const [focusTenderKey, setFocusTenderKey] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const pill = statusPill(draft.status);
  const gst = header.gstBill;
  const dateLocked = !editable || session !== null;

  // ── the verbs, with the discard question where typing would be lost ─────
  const guardDiscard = useCallback(
    (title: string, confirmLabel: string, then: () => void) => {
      if (draft.dirty && editable) {
        setConfirmRequest({
          title,
          message: "The voucher has unsaved changes. Leave it and lose them?",
          confirmLabel,
          onConfirm: then,
        });
        return;
      }
      then();
    },
    [draft.dirty, editable],
  );

  const startNew = useCallback(() => {
    if (!rights.mayStartNew || busy) {
      return;
    }
    guardDiscard("Start a new voucher?", "New voucher", () => {
      api.startNew();
      setActiveLineKey(null);
      setActiveTenderKey(null);
    });
  }, [api, busy, guardDiscard, rights.mayStartNew]);

  const goList = useCallback(() => {
    guardDiscard("Go to the list?", "Go to the list", () => {
      if (onBackToList) {
        onBackToList();
      } else {
        router.push(EXPENSE_ROUTE);
      }
    });
  }, [guardDiscard, onBackToList, router]);

  const close = useCallback(() => {
    guardDiscard("Close this voucher?", "Close", () => {
      if (onBackToList) {
        onBackToList();
      } else {
        router.back();
      }
    });
  }, [guardDiscard, onBackToList, router]);

  const addLine = useCallback(() => {
    if (!editable) return;
    setFocusLineKey(api.addLine());
  }, [api, editable]);

  const addTender = useCallback(() => {
    if (!editable) return;
    setFocusTenderKey(api.addTender());
  }, [api, editable]);

  const removeLine = useCallback(() => {
    const key = draft.lines.some((line) => line.key === activeLineKey) ? activeLineKey : draft.lines.at(-1)?.key;
    if (key) api.removeLine(key);
  }, [activeLineKey, api, draft.lines]);

  const removeTender = useCallback(() => {
    const key = draft.tenders.some((row) => row.key === activeTenderKey)
      ? activeTenderKey
      : draft.tenders.at(-1)?.key;
    if (key) api.removeTender(key);
  }, [activeTenderKey, api, draft.tenders]);

  // ── the keys ────────────────────────────────────────────────────────────
  const keyTargets = {
    canSave: api.canSave,
    canPost: api.canPost,
    saveDraft: api.saveDraft,
    post: api.post,
    startNew,
    goList,
    close,
    addLine,
    addTender,
    dialogOpen: confirmRequest !== null || cancelOpen,
  };
  const keyTargetsRef = useRef(keyTargets);
  useEffect(() => {
    keyTargetsRef.current = keyTargets;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keyTargetsRef.current;
      if (event.key === "F1" || event.key === "F5") {
        event.preventDefault();
      }
      if (current.dialogOpen) {
        return;
      }
      // By the physical key: Alt+letter types another character on a Mac.
      const letter = event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : "";
      const chord = (event.altKey || event.ctrlKey) && !event.metaKey && !event.shiftKey;
      if (event.key === "F5") {
        if (current.canSave) void current.saveDraft();
        return;
      }
      if (event.key === "F10") {
        event.preventDefault();
        if (current.canPost) void current.post();
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        current.startNew();
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        current.goList();
        return;
      }
      if (chord && letter === "n") {
        event.preventDefault();
        current.addLine();
        return;
      }
      if (chord && letter === "t") {
        event.preventDefault();
        current.addTender();
        return;
      }
      // A popup (a dropdown's list, a picker's search) takes its own Escape
      // and marks it; only an unclaimed Escape closes the voucher.
      if (event.key === "Escape" && !event.defaultPrevented) {
        current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── render ──────────────────────────────────────────────────────────────
  if (api.loadError && draft.keys === null) {
    return (
      <div className={styles.page}>
        <header className={styles.titleBar}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Expense Voucher</h1>
          </div>
        </header>
        <p className={styles.loadError}>{api.loadError}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={goList}>
            F8  List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            Expense Voucher
            {draft.dirty && editable ? <span className={styles.dirtyMark}> *</span> : null}
          </h1>
          <p className={styles.subtitle}>
            an expense paid by tender — replaces the till&apos;s Paid out; works in the back office too
          </p>
        </div>
        <div className={styles.titleRight}>
          {draft.voucherNo ? <span className={styles.docNumber}>{draft.voucherNo}</span> : null}
          <span className={cx(styles.pill, TONE_CLASS[pill.tone])}>{api.loading ? "LOADING" : pill.label}</span>
        </div>
      </header>

      <div className={styles.scroll}>
        <div className={styles.moneyFrom} role="status">
          <span className={styles.moneyDot} aria-hidden="true">
            ●
          </span>
          <span>{api.loading ? "Reading the voucher…" : view.moneyFrom}</span>
        </div>

        {/* ── the header facts ───────────────────────────────────────── */}
        <section className={styles.facts} aria-label="Voucher">
          <div className={styles.field}>
            <span className={styles.cap}>Voucher no</span>
            <span className={cx(styles.factValue, !draft.voucherNo && styles.factValueMuted)}>
              {draft.voucherNo ?? "auto on post"}
            </span>
          </div>
          <label className={styles.field}>
            <span className={styles.cap}>Date</span>
            <input
              type="date"
              className={styles.input}
              value={header.voucherDate}
              disabled={dateLocked}
              title={session ? "At the till the voucher is dated the session's business day." : undefined}
              onChange={(event) => api.setHeader({ voucherDate: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.cap}>Paid to</span>
            <input
              className={styles.input}
              value={header.paidTo}
              maxLength={240}
              disabled={!editable}
              placeholder="who took the money"
              onChange={(event) => api.setHeader({ paidTo: event.target.value })}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.cap}>Party (optional)</span>
            <NexDropdownSingle
              dropdownId={payeeDropdownId}
              className={styles.dropdownField}
              value={header.partyId ? { id: header.partyId, text: header.partyName } : null}
              onChange={(selection) =>
                api.setHeader({ partyId: selection?.id ?? "", partyName: selection?.text ?? "" })
              }
              // Dropdown 60 PAYMENT PAYEES binds `icompany_id` inside a quoted
              // literal: left out, only the shared ledgers match. Always sent.
              params={{ icompany_id: api.docCompanyId }}
              clearOnParamsChange={false}
              disabled={!editable}
              placeholder="— none —"
              aria-label="Party"
            />
          </div>
          <label className={styles.field}>
            <span className={styles.cap}>Notes</span>
            <input
              className={styles.input}
              value={header.notes}
              maxLength={240}
              disabled={!editable}
              onChange={(event) => api.setHeader({ notes: event.target.value })}
            />
          </label>
        </section>

        {/* ── with a GST bill ────────────────────────────────────────── */}
        <section className={cx(styles.gst, !gst && styles.gstOff)} aria-label="GST bill">
          <div className={styles.field}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={gst}
                disabled={!editable}
                onChange={(event) => api.setHeader({ gstBill: event.target.checked })}
              />
              With GST bill
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.cap}>Supplier GSTIN</span>
            <input
              className={styles.input}
              value={header.supplierGstin}
              maxLength={15}
              data-uppercase="off"
              autoComplete="off"
              disabled={!editable || !gst}
              onChange={(event) => api.setHeader({ supplierGstin: event.target.value.toUpperCase() })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.cap}>Invoice no</span>
            <input
              className={styles.input}
              value={header.invoiceNo}
              maxLength={50}
              data-uppercase="off"
              autoComplete="off"
              disabled={!editable || !gst}
              onChange={(event) => api.setHeader({ invoiceNo: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.cap}>Invoice date</span>
            <input
              type="date"
              className={styles.input}
              value={header.invoiceDate}
              disabled={!editable || !gst}
              onChange={(event) => api.setHeader({ invoiceDate: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.cap}>Place of supply</span>
            <input
              className={styles.input}
              value={header.placeOfSupply}
              maxLength={2}
              inputMode="numeric"
              data-uppercase="off"
              autoComplete="off"
              placeholder="from GSTIN"
              disabled={!editable || !gst}
              onChange={(event) => api.setHeader({ placeOfSupply: event.target.value.replace(/\D/g, "") })}
            />
          </label>
          <p className={styles.muted}>input tax claimed through GSTR-2 (as PurA) · the supplier is the Party above</p>
        </section>

        {/* ── WHAT WAS SPENT | HOW IT WAS PAID ───────────────────────── */}
        <div className={styles.mid}>
          <section className={styles.block} aria-label="What was spent">
            <div className={styles.blockHead}>
              <h2 className={styles.formCap}>What was spent</h2>
              <span className={styles.code}>expense lines — a reason quick-pick fills the ledger</span>
            </div>
            <LinesGrid
              lines={draft.lines}
              cells={view.lineCells}
              fresh={view.fresh}
              gstBill={gst}
              editable={editable}
              reasons={api.reasons}
              ledgers={api.ledgers}
              taxDropdownId={taxDropdownId}
              activeKey={activeLineKey}
              focusKey={focusLineKey}
              onActivate={setActiveLineKey}
              onPickReason={api.pickReason}
              onChange={api.setLine}
            />
            <div className={styles.blockFoot}>
              <button type="button" className={cx(styles.button, styles.smallButton)} disabled={!editable} onClick={addLine}>
                + Line  (Alt+N)
              </button>
              <button
                type="button"
                className={cx(styles.button, styles.smallButton)}
                disabled={!editable || draft.lines.length <= 1}
                onClick={removeLine}
              >
                Remove line
              </button>
              <span className={cx(styles.strong, !view.fresh && gst && styles.stale)}>{view.linesSummary}</span>
            </div>
            <p className={styles.muted}>{view.taxNote}</p>
          </section>

          <section className={styles.block} aria-label="How it was paid">
            <div className={styles.blockHead}>
              <h2 className={styles.formCap}>How it was paid</h2>
              <span className={styles.code}>tenders — must equal the lines</span>
            </div>
            <TendersGrid
              rows={draft.tenders}
              accounts={view.tenderAccounts}
              fresh={view.fresh}
              editable={editable}
              options={api.tenderOptions}
              activeKey={activeTenderKey}
              focusKey={focusTenderKey}
              onActivate={setActiveTenderKey}
              onChange={api.setTender}
            />
            <div className={styles.blockFoot}>
              <button type="button" className={cx(styles.button, styles.smallButton)} disabled={!editable} onClick={addTender}>
                + Tender  (Alt+T)
              </button>
              <button
                type="button"
                className={cx(styles.button, styles.smallButton)}
                disabled={!editable || draft.tenders.length <= 1}
                onClick={removeTender}
              >
                Remove tender
              </button>
              <span className={styles.strong}>{view.tendersSummary}</span>
            </div>
            <p className={styles.muted}>{TENDER_NOTE}</p>
          </section>
        </div>

        {/* ── LINES − TENDERS, and what the server noticed ───────────── */}
        <div className={styles.balanceRow}>
          <div
            className={cx(
              styles.balance,
              view.balance.tone === "success" && styles.balanceSuccess,
              view.balance.tone === "danger" && styles.balanceDanger,
            )}
          >
            <span className={styles.cap}>Lines − tenders</span>
            <span className={styles.figure}>{view.balance.text}</span>
          </div>
          {view.warnings.length > 0 ? (
            <div className={cx(styles.notice, !view.fresh && styles.stale)} role="note">
              <span className={cx(styles.pill, styles.toneInfo)}>INFO</span>
              <span>{view.warnings.join("\n")}</span>
            </div>
          ) : (
            <span />
          )}
        </div>

        {view.approval ? (
          <div className={cx(styles.notice, styles.approval, !view.fresh && styles.stale)} role="note">
            <span className={cx(styles.pill, styles.toneWarning)}>APPROVAL</span>
            <span className={styles.code}>{view.approval.code}</span>
            <span className={styles.approvalText}>{view.approval.text}</span>
            <span className={styles.approvalAmount}>{view.approval.amount}</span>
          </div>
        ) : null}

        {view.refusals.length > 0 ? (
          <ul className={cx(styles.refusals, !view.fresh && styles.stale)} role="alert">
            {view.refusals.map((refusal) => (
              <li key={refusal}>{refusal}</li>
            ))}
          </ul>
        ) : null}

        {/* ── POSTS ──────────────────────────────────────────────────── */}
        <section className={styles.block} aria-label="Posts">
          <div className={styles.blockHead}>
            <h2 className={styles.formCap}>Posts</h2>
            <span className={styles.code}>one ExpV voucher — the legs the server would write (validate)</span>
            <span
              className={cx(
                styles.strong,
                view.legs.balanced ? styles.toneTextSuccess : styles.toneTextDanger,
              )}
            >
              {view.legs.balance}
            </span>
          </div>
          <div className={cx(styles.legs, !view.fresh && styles.stale)}>
            {view.legs.columns.length === 0 ? (
              <p className={styles.legsEmpty}>
                {editable ? "The legs show once the server has checked a line and a tender." : "No legs."}
              </p>
            ) : (
              view.legs.columns.map((column, columnIndex) => (
                <div key={columnIndex} className={styles.legColumn}>
                  {column.map((leg, legIndex) => (
                    <div key={legIndex} className={styles.leg}>
                      <span className={styles.legSide}>{leg.side}</span>
                      <span className={styles.legName} title={leg.name}>
                        {leg.name}
                      </span>
                      <span className={styles.legAmount}>{leg.amount}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ── the verbs ──────────────────────────────────────────────────── */}
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.button}
          disabled={!api.canSave}
          title={api.problem ?? undefined}
          onClick={() => void api.saveDraft()}
        >
          F5  Save draft
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!api.canPost}
          title={api.postHint || undefined}
          onClick={() => void api.post()}
        >
          F10  Post
        </button>
        <button type="button" className={styles.button} disabled={!rights.mayStartNew || busy} onClick={startNew}>
          F2  New
        </button>
        {api.showCancel ? (
          <button
            type="button"
            className={styles.dangerButton}
            disabled={!api.canCancel}
            title={rights.mayCancelDocument(true) ? undefined : "You may not cancel an expense voucher (menu 277)"}
            onClick={() => setCancelOpen(true)}
          >
            Cancel voucher…
          </button>
        ) : null}
        <button type="button" className={styles.button} onClick={goList}>
          F8  List
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.button} onClick={close}>
          Close
        </button>
      </div>
      <p className={styles.keys}>{KEYS_LEGEND}</p>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      {cancelOpen ? (
        <CancelReasonDialog
          voucherNo={draft.voucherNo}
          busy={busy}
          onCancel={() => setCancelOpen(false)}
          onConfirm={(reason) => {
            void api.cancelVoucher(reason).then((done) => {
              if (done) setCancelOpen(false);
            });
          }}
        />
      ) : null}
    </div>
  );
}
