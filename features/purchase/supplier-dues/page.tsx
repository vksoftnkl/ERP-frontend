"use client";

/**
 * Supplier Dues (menu 297, under Purchase) — the Qt `SupplierDuesPage`
 * (NexERP src/modules/purchase/dues/supplier_dues_page.cpp, 2026-10-29, to the
 * approved mockup share/purchase/purchase_claims_shortage_ui_mockup.png). What
 * suppliers (and the transporters / insurers of their goods) still owe us:
 *
 *   A. CLAIMS — money expected: return claims and shortages claimed on a
 *      transporter / insurer. Tick one or several (✓ / Space); the Settle panel
 *      says how the party answered (Credit received — their CN or adjust in the
 *      next bill, the rest written off in the same step if asked —, Short-settled
 *      or Rejected with a reason); "What Settle writes" shows the server's
 *      voucher legs live (POST /purchase/supplier-dues/settle dryRun, debounced
 *      350 ms). Cash / bank comes through a Receipt (the link). Undo last takes
 *      the row's last settlement back (a reversing row).
 *   B. SHORTAGES — goods expected: Close row… ends ticked shortages without goods
 *      (POST /purchase/shortages/close, menu 195's rights); Undo close takes the
 *      current row's last close back.
 *
 * `?supplierId=<ledger id>&supplierName=` opens it filtered (the Return's
 * "Supplier dues" button). Keys: Ctrl+Enter Settle, Alt+X Undo last, F5 Refresh,
 * Space tick, Esc Close, F1 the sheet.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { DateInput } from "@/components/design-system/ui";
import { useBusinessContext } from "@/components/layout/business-context";
import { MENU_ROUTES } from "@/components/layout/constants";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import {
  PurchaseCheckChip,
  PurchaseSectionHeading,
  PurchaseStatusPill,
  PurchaseTotalsStrip,
} from "@/features/purchase/shared/components/purchase-parts";
import { money, purchaseRefusalText } from "@/features/purchase/shared/purchase.format";
import { usePurchaseScope } from "@/features/purchase/shared/use-purchase-scope";
import { AskText } from "@/features/sales/salebill/components/ask-text";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useMenuPermissionIndex, usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { buildPartyHandoffHref } from "@/lib/navigation/party-handoff";
import { HOME_ROUTE } from "@/lib/navigation/routes";
import { toast } from "@/lib/notify";
import { FULL_MENU_PERMISSIONS } from "@/lib/permissions/menu-permissions";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { ShortageCloseDialog } from "./components/shortage-close-dialog";
import type { ShortageCloseBody } from "./shortage-close";
import {
  useSupplierDuesCloseShortageMutation,
  useSupplierDuesCloseUndoMutation,
  useSupplierDuesOpenMutation,
  useSupplierDuesSettleMutation,
  useSupplierDuesSettleUndoMutation,
} from "./supplier-dues.api";
import {
  EMPTY_SETTLE_FORM,
  RECEIVED_AS,
  REASON_NEEDED,
  SETTLE_ACTIONS,
  actingRows,
  actionLabel,
  claimRowsFrom,
  duesChip,
  duesHint,
  duesStripCells,
  previewLines,
  previewTotals,
  settleBody,
  settleProblem,
  settleView,
  shortageRowsFrom,
  statusTone,
  statusWords,
  toggleTick,
  untickAll,
  voucherRefs,
  type ClaimRow,
  type PreviewLine,
  type SettleForm,
  type ShortageRow,
} from "./supplier-dues.state";
import type { DuesReceivedAs, DuesSettleAction, DuesTotalsWire } from "./supplier-dues.types";
import styles from "./supplier-dues.module.scss";

export const SUPPLIER_DUES_MENU_ID = 297;
export const SHORTAGE_RECEIPT_MENU_ID = 195;
const RECEIPT_MENU_ID = 99;
const PREVIEW_DEBOUNCE_MS = 350;
const SUPPLIER_DROPDOWN_KEY = "supplier" as const;

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Tick / untick the row (several claims settle in one go)", keyText: "Space" },
  { label: "Row above / below", keyText: "↑ / ↓" },
  { label: "Read the dues again", keyText: "F5" },
  { label: "Close a shortage without goods (CN / claim / write-off)", keyText: "Close row…" },
];
const KEY_SHEET = keySheetRows(
  [
    { action: "post", label: "Settle" },
    { action: "cancelDoc", label: "Undo last" },
    "close",
  ],
  LINE_KEYS,
);

type Picked = { id: string; name: string };
type Preview =
  | { kind: "message"; text: string; tone?: "muted" | "danger" }
  | { kind: "legs"; lines: PreviewLine[]; totals: string };
type Undo = { target: "claim"; row: ClaimRow } | { target: "shortage"; row: ShortageRow };

export default function SupplierDuesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const scope = usePurchaseScope();
  const { activeCompany, activeBranch } = useBusinessContext();
  const { permissions } = usePagePermissions({ menuId: SUPPLIER_DUES_MENU_ID });
  const index = useMenuPermissionIndex();
  // Before the menu is read nothing is denied (usePagePermissions fails open the same way).
  const shortagePerms = index.loaded ? index.byMenuId.get(SHORTAGE_RECEIPT_MENU_ID) : FULL_MENU_PERMISSIONS;
  const mayPost = permissions.canPost;
  const mayUndo = permissions.canCancel;
  const mayClose = Boolean(shortagePerms?.canPost);
  const mayUndoClose = Boolean(shortagePerms?.canCancel);
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);

  const [supplier, setSupplier] = useState<Picked>(() => ({
    id: (params?.get("supplierId") ?? "").trim(),
    name: (params?.get("supplierName") ?? "").trim(),
  }));
  const [showSettled, setShowSettled] = useState(false);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [shortages, setShortages] = useState<ShortageRow[]>([]);
  const [sections, setSections] = useState({ claims: true, shortages: true });
  const [totals, setTotals] = useState<DuesTotalsWire | null>(null);
  const [cashNote, setCashNote] = useState(
    "Cash or bank from the party comes through a Receipt against it — Settle records a credit note or an adjustment only.",
  );
  const [currentClaim, setCurrentClaim] = useState<string | null>(null);
  const [currentShortage, setCurrentShortage] = useState<string | null>(null);
  const [form, setForm] = useState<SettleForm>(EMPTY_SETTLE_FORM);
  const [hint, setHint] = useState<{ text: string; auto: boolean }>({ text: "", auto: true });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);

  const [openMutation] = useSupplierDuesOpenMutation();
  const [settleMutation] = useSupplierDuesSettleMutation();
  const [settleUndoMutation] = useSupplierDuesSettleUndoMutation();
  const [closeMutation] = useSupplierDuesCloseShortageMutation();
  const [closeUndoMutation] = useSupplierDuesCloseUndoMutation();

  const claimsRef = useRef(claims);
  const shortagesRef = useRef(shortages);
  useLayoutEffect(() => {
    claimsRef.current = claims;
    shortagesRef.current = shortages;
  });

  const manualHint = useCallback((text: string) => setHint({ text, auto: false }), []);

  // ------------------------------------------------------------- reading
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    if (!scope.companyId || !scope.branchId) {
      return;
    }
    seq.current += 1;
    const mine = seq.current;
    try {
      const data = await openMutation({
        companyId: scope.companyId,
        branchId: scope.branchId,
        ...(supplier.id ? { supplierId: supplier.id } : {}),
        ...(showSettled ? { all: "true" as const } : {}),
      }).unwrap();
      if (mine !== seq.current) {
        return;
      }
      const nextClaims = claimRowsFrom(data?.claims ?? [], claimsRef.current);
      const nextShort = shortageRowsFrom(data?.shortages ?? [], shortagesRef.current);
      setClaims(nextClaims);
      setShortages(nextShort);
      setCurrentClaim((cur) => (nextClaims.some((r) => r.key === cur) ? cur : (nextClaims[0]?.key ?? null)));
      setCurrentShortage((cur) => (nextShort.some((r) => r.key === cur) ? cur : (nextShort[0]?.key ?? null)));
      setSections({ claims: data?.sections?.claims !== false, shortages: data?.sections?.shortages !== false });
      setTotals(data?.totals ?? null);
      if (data?.cashNote) setCashNote(data.cashNote);
      setHint((h) =>
        !h.text || h.auto
          ? { text: duesHint(nextClaims.length, nextShort.length, supplier.name, Boolean(supplier.id)), auto: true }
          : h,
      );
    } catch (error) {
      if (mine === seq.current) {
        manualHint(purchaseRefusalText(error));
      }
    }
  }, [manualHint, openMutation, scope.branchId, scope.companyId, showSettled, supplier.id, supplier.name]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // ------------------------------------------------------------- the Settle form
  const settleRows = useMemo(() => actingRows(claims, currentClaim), [claims, currentClaim]);
  const view = useMemo(() => settleView(settleRows, form), [form, settleRows]);
  const problem = useMemo(() => settleProblem(settleRows, form), [form, settleRows]);
  const settleReady = problem === "";
  const undoRow = settleRows.length === 1 ? settleRows[0] : claims.find((r) => r.key === currentClaim);
  const canUndo = Boolean(undoRow?.lastSettlementId);
  const closeRows = useMemo(
    () => actingRows(shortages, currentShortage).filter((r) => r.openQty > 0),
    [currentShortage, shortages],
  );
  const currentShortRow = shortages.find((r) => r.key === currentShortage);

  const patchForm = (next: Partial<SettleForm>) => setForm((f) => ({ ...f, ...next }));
  // another claim (tick / current): its own open amount
  const resetAmount = () => setForm((f) => (f.amountTyped ? { ...f, amountTyped: false } : f));

  // ------------------------------------------------------------- What Settle writes (dryRun)
  const previewSeq = useRef(0);
  const previewBodyKey = useMemo(() => {
    if (settleRows.length === 0) return "";
    return JSON.stringify(settleBody(settleRows, form, { deviceId: scope.deviceId, docDate: todayIso(), dryRun: true }));
  }, [form, scope.deviceId, settleRows]);

  /** The last server answer and the body it was asked with. */
  const [answered, setAnswered] = useState<{ key: string; preview: Preview } | null>(null);
  // the preview needs the rows and the amount; the reason is only needed to Settle
  const previewBlocked = settleRows.length === 0 || (problem !== "" && problem !== REASON_NEEDED);

  useEffect(() => {
    previewSeq.current += 1;
    const mine = previewSeq.current;
    if (previewBlocked || !previewBodyKey) {
      return;
    }
    const key = previewBodyKey;
    const timer = window.setTimeout(() => {
      void settleMutation(JSON.parse(key))
        .unwrap()
        .then((answer) => {
          if (mine !== previewSeq.current) return;
          const lines = previewLines(answer.data);
          setAnswered({
            key,
            preview: lines.length
              ? { kind: "legs", lines, totals: previewTotals(answer.data) }
              : { kind: "message", text: "Settle writes nothing for these rows.", tone: "muted" },
          });
          if (answer.data?.cashNote) setCashNote(answer.data.cashNote);
        })
        .catch((error) => {
          if (mine !== previewSeq.current) return;
          setAnswered({ key, preview: { kind: "message", text: purchaseRefusalText(error), tone: "danger" } });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [previewBlocked, previewBodyKey, settleMutation]);

  const preview: Preview =
    settleRows.length === 0
      ? { kind: "message", text: claims.length ? "Tick a claim — what Settle writes shows here." : "No claim is open." }
      : previewBlocked
        ? { kind: "message", text: problem, tone: "muted" }
        : // the last answer stays up until the new one is in (Qt repaints on arrival)
          (answered?.preview ?? { kind: "message", text: "Working out what Settle writes…", tone: "muted" });

  // ------------------------------------------------------------- actions
  const clearSettleForm = useCallback(() => {
    setClaims((rows) => untickAll(rows));
    setForm(EMPTY_SETTLE_FORM);
  }, []);

  const askSettle = useCallback(() => {
    if (problem) {
      manualHint(problem);
      return;
    }
    if (busy || !mayPost) return;
    if (!scope.deviceId) {
      toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", { title: "No device" });
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    setConfirmOpen(true);
  }, [busy, manualHint, mayPost, problem, scope.deviceId]);

  const settle = useCallback(async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const answer = await settleMutation(
        settleBody(settleRows, form, { deviceId: scope.deviceId, docDate: todayIso(), dryRun: false }),
      ).unwrap();
      const refs = voucherRefs(answer.data);
      manualHint(answer.message + (refs.length ? ` — ${refs.join(", ")}` : ""));
      clearSettleForm();
      void refresh();
    } catch (error) {
      manualHint(purchaseRefusalText(error));
      toast.apiError(error, { title: "Not settled" });
    } finally {
      setBusy(false);
    }
  }, [clearSettleForm, form, manualHint, refresh, scope.deviceId, settleMutation, settleRows]);

  const askUndoLast = useCallback(() => {
    if (!undoRow?.lastSettlementId) {
      manualHint("Nothing to undo — this claim has no settlement standing.");
      return;
    }
    if (busy || !mayUndo) return;
    setUndo({ target: "claim", row: undoRow });
  }, [busy, manualHint, mayUndo, undoRow]);

  const askUndoClose = useCallback(() => {
    if (!currentShortRow?.lastCloseId) {
      manualHint("Nothing to undo — this shortage has no close standing.");
      return;
    }
    if (busy || !mayUndoClose) return;
    setUndo({ target: "shortage", row: currentShortRow });
  }, [busy, currentShortRow, manualHint, mayUndoClose]);

  const doUndo = useCallback(
    async (reason: string) => {
      const what = undo;
      setUndo(null);
      if (!what) return;
      setBusy(true);
      try {
        const answer =
          what.target === "claim"
            ? await settleUndoMutation({
                settlementId: what.row.lastSettlementId,
                accYear: what.row.lastAccYear || what.row.accYear,
                reason,
              }).unwrap()
            : await closeUndoMutation({
                closeId: what.row.lastCloseId,
                accYear: what.row.lastAccYear || what.row.accYear,
                reason,
              }).unwrap();
        manualHint(answer.message);
        void refresh();
      } catch (error) {
        manualHint(purchaseRefusalText(error));
        toast.apiError(error, { title: "Not undone" });
      } finally {
        setBusy(false);
      }
    },
    [closeUndoMutation, manualHint, refresh, settleUndoMutation, undo],
  );

  const askClose = useCallback(() => {
    if (closeRows.length === 0) {
      manualHint("Tick the open shortage(s) to close.");
      return;
    }
    if (busy || !mayClose) return;
    if (!scope.deviceId) {
      toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", { title: "No device" });
      return;
    }
    setCloseOpen(true);
  }, [busy, closeRows.length, manualHint, mayClose, scope.deviceId]);

  /** One POST per row, in order; what closed before a refusal stays closed (and is shown). */
  const doClose = useCallback(
    async (common: ShortageCloseBody) => {
      setCloseOpen(false);
      const jobs = closeRows.map((r) => ({ id: r.shortageId, year: r.accYear }));
      setBusy(true);
      let done = 0;
      try {
        for (const job of jobs) {
          await closeMutation({ ...common, shortageId: job.id, accYear: job.year, deviceId: scope.deviceId }).unwrap();
          done += 1;
        }
        manualHint(`${jobs.length} shortage${jobs.length === 1 ? "" : "s"} closed.`);
        setShortages((rows) => untickAll(rows));
      } catch (error) {
        manualHint(purchaseRefusalText(error));
        toast.apiError(error, { title: done === 0 ? "Not closed" : `Closed ${done}, then refused` });
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [closeMutation, closeRows, manualHint, refresh, scope.deviceId],
  );

  /** Cash / bank never posts here: the Receipt (menu 99) takes it, on the claim's party. */
  const openReceipt = useCallback(() => {
    const route = MENU_ROUTES[RECEIPT_MENU_ID]?.href ?? "/accounts/receipt";
    const one = settleRows.length === 1 && settleRows[0].partyId ? settleRows[0] : null;
    if (one) {
      router.push(buildPartyHandoffHref(route, { partyId: one.partyId, partyName: one.partyName }));
    } else if (supplier.id) {
      router.push(buildPartyHandoffHref(route, { partyId: supplier.id, partyName: supplier.name }));
    } else {
      router.push(route);
    }
  }, [router, settleRows, supplier.id, supplier.name]);

  const close = useCallback(() => router.push(HOME_ROUTE), [router]);

  // ------------------------------------------------------------- keys
  const modalOpen = confirmOpen || closeOpen || undo !== null || keysOpen;
  useTxnKeys(
    {
      post: !busy && mayPost && settleReady ? askSettle : null,
      cancelDoc: !busy && mayUndo && canUndo ? askUndoLast : null,
      close: !busy ? close : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !modalOpen },
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F5" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      if (!document.querySelector('[aria-modal="true"]')) void refresh();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  const onSupplier = (id: string, name: string) => {
    setSupplier({ id, name });
    setHint({ text: "", auto: true });
  };

  // ------------------------------------------------------------- the view
  const chip = duesChip(totals);
  const title = supplier.id ? `Supplier dues — ${supplier.name || "the supplier"}` : "Supplier dues — all suppliers";
  const subtitle = [activeCompany?.name, activeBranch?.name].filter(Boolean).join(" · ");
  const settleTitle = mayPost
    ? problem || undefined
    : "Settling needs the Post right on Supplier Dues (menu 297) — ask your admin.";
  const undoTitle = !mayUndo
    ? "Undo needs the Cancel right on Supplier Dues (menu 297)."
    : canUndo
      ? `Take back ${undoRow?.lastAction ?? ""} (a reversing row)`
      : "The current claim has no settlement to undo — Show settled lists the settled ones";

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      <div className={styles.titleBand}>
        <div className={styles.titles}>
          <h1 className={quotationStyles.title}>{title}</h1>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <PurchaseStatusPill status={chip.text} label={chip.text} tone={chip.tone} />
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterSupplier}>
          <DropdownCombo
            id="supplier-dues-supplier"
            label="Supplier"
            dropdownId={supplierDropdownId}
            valueKey="sup_id"
            labelKey="sup_name"
            metaKey="sup_region_name"
            value={supplier.id}
            selectedLabel={supplier.name}
            placeholder="All suppliers"
            onSelect={onSupplier}
          />
        </div>
        <button
          type="button"
          className={quotationStyles.button}
          title="Only this supplier's dues — All suppliers clears it"
          disabled={!supplier.id}
          onClick={() => onSupplier("", "")}
        >
          All suppliers
        </button>
        <label
          className={styles.checkLabel}
          title="Also the claims already settled and the shortages already closed — to see them, or to Undo the last one"
        >
          <input type="checkbox" checked={showSettled} onChange={(event) => setShowSettled(event.target.checked)} />
          Show settled
        </label>
        <button type="button" className={cx(quotationStyles.button, styles.pushRight)} onClick={() => void refresh()}>
          Refresh · F5
        </button>
      </div>

      {sections.claims ? (
        <section className={styles.section}>
          <PurchaseSectionHeading
            title="A. CLAIMS — money expected"
            hint="from Purchase Return rows with outcome Claim, and shortages claimed on a transporter / insurer; settle one at a time or several"
          />
          <ClaimsGrid
            rows={claims}
            currentKey={currentClaim}
            onCurrent={(key) => {
              setCurrentClaim(key);
              resetAmount();
            }}
            onToggle={(key) => {
              setClaims((rows) => toggleTick(rows, key));
              resetAmount();
            }}
          />
          <div className={styles.panels}>
            <div className={styles.panel} data-panel="settle">
              <p className={styles.panelTitle}>{view.title}</p>
              <div className={styles.formGrid}>
                <label className={styles.cap} htmlFor="sdu-action">
                  Action
                </label>
                <select
                  id="sdu-action"
                  className={styles.input}
                  value={form.action}
                  onChange={(event) => patchForm({ action: event.target.value as DuesSettleAction })}
                >
                  {SETTLE_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>

                <span className={styles.cap}>Received as</span>
                <div className={styles.inline3}>
                  <select
                    aria-label="Received as"
                    className={styles.input}
                    disabled={!view.receivedEnabled}
                    title="A credit note, or an adjustment in their next bill. Cash / bank from them comes through a Receipt."
                    value={form.receivedAs}
                    onChange={(event) => patchForm({ receivedAs: event.target.value as DuesReceivedAs })}
                  >
                    {RECEIVED_AS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="CN no"
                    className={styles.input}
                    disabled={!view.cnEnabled}
                    maxLength={60}
                    placeholder="their CN no"
                    autoComplete="off"
                    data-uppercase="off"
                    value={form.cnNo}
                    onChange={(event) => patchForm({ cnNo: event.target.value })}
                  />
                  <DateInput
                    aria-label="CN date"
                    title="Their credit note's date"
                    disabled={!view.cnEnabled}
                    value={form.cnDate}
                    onChange={(value) => patchForm({ cnDate: value })}
                  />
                </div>

                <label className={styles.cap} htmlFor="sdu-amount">
                  Amount
                </label>
                <input
                  id="sdu-amount"
                  className={cx(styles.input, styles.inputNumber)}
                  inputMode="decimal"
                  autoComplete="off"
                  title="What the party allowed on this claim (one row; several rows settle each one whole)"
                  disabled={!view.amountEnabled}
                  placeholder={view.amountPlaceholder}
                  value={view.amountText}
                  onChange={(event) => patchForm({ amount: event.target.value, amountTyped: true })}
                />

                <span className={styles.cap}>{view.balanceCaption}</span>
                <div className={styles.inline2}>
                  <select
                    aria-label={view.balanceCaption}
                    className={styles.input}
                    disabled={!view.balanceEnabled}
                    value={view.balanceValue}
                    onChange={(event) => patchForm({ balance: event.target.value === "WRITE_OFF" ? "WRITE_OFF" : "OPEN" })}
                  >
                    {view.balanceChoices.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Reason"
                    className={styles.input}
                    disabled={!view.reasonEnabled}
                    maxLength={250}
                    placeholder={view.reasonPlaceholder}
                    autoComplete="off"
                    value={form.reason}
                    onChange={(event) => patchForm({ reason: event.target.value })}
                  />
                </div>
              </div>
              <div className={styles.panelButtons}>
                <button
                  type="button"
                  className={quotationStyles.button}
                  title={undoTitle}
                  disabled={busy || !mayUndo || !canUndo}
                  onClick={askUndoLast}
                >
                  {withKey("Undo last", "cancelDoc")}
                </button>
                <button
                  type="button"
                  className={quotationStyles.button}
                  title="Untick the rows and clear the form"
                  onClick={clearSettleForm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
                  title={settleTitle}
                  disabled={busy || !mayPost || !settleReady}
                  onClick={askSettle}
                >
                  {withKey("Settle", "post")}
                </button>
              </div>
            </div>

            <div className={styles.panel} data-panel="preview">
              <p className={styles.panelTitle}>What Settle writes</p>
              {preview.kind === "legs" ? (
                <>
                  <div className={styles.legs} data-preview-legs="">
                    {preview.lines.map((line, i) => (
                      <PreviewLegRow key={i} line={line} />
                    ))}
                  </div>
                  <span className={styles.previewTotals}>{preview.totals}</span>
                </>
              ) : (
                <p
                  className={cx(
                    styles.previewMsg,
                    preview.tone === "muted" && styles.muted,
                    preview.tone === "danger" && styles.toneDanger,
                  )}
                >
                  {preview.text}
                </p>
              )}
              <div className={styles.spacer} />
              <p className={styles.previewNote}>
                Each settlement is its own row; &apos;Open&apos; = value − Σ credited − Σ written off.
              </p>
              <p className={styles.previewNote}>
                Actions: Credit received · Short-settled → write off · Rejected → write off (reason).
              </p>
              <p className={styles.previewNote}>Undo = a reversing settlement row (never delete).</p>
              <div className={styles.cashRow}>
                <span>{cashNote}</span>
                <button
                  type="button"
                  className={styles.link}
                  title="Receipt (menu 99) for the party of the claim — cash or bank they pay comes in there"
                  onClick={openReceipt}
                >
                  Open a Receipt →
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {sections.shortages ? (
        <section className={styles.section}>
          <PurchaseSectionHeading
            title="B. SHORTAGES & REPLACEMENTS — goods expected"
            hint="tick rows; Close row… ends one without goods · what came is received on Shortage Receipt (menu 195)"
          />
          <ShortagesGrid
            rows={shortages}
            currentKey={currentShortage}
            onCurrent={setCurrentShortage}
            onToggle={(key) => setShortages((rows) => toggleTick(rows, key))}
          />
          <PurchaseTotalsStrip cells={duesStripCells(totals)} />
          <div className={styles.sectionButtons}>
            <button
              type="button"
              className={quotationStyles.button}
              title={
                !mayClose
                  ? "Closing a shortage needs the Post right on Shortage Receipt (menu 195)."
                  : "Close the ticked shortage(s) without goods: supplier CN, a claim on the transporter / insurer, or write off"
              }
              disabled={busy || !mayClose || closeRows.length === 0}
              onClick={askClose}
            >
              Close row… (CN / claim / write-off)
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              title="Take back the current shortage row's last close (a reversing row)"
              disabled={busy || !mayUndoClose || !currentShortRow?.lastCloseId}
              onClick={askUndoClose}
            >
              Undo close…
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.foot}>
        <p className={styles.hint} role="status">
          {hint.text}
        </p>
        <button type="button" className={quotationStyles.button} disabled={busy} onClick={close}>
          {withKey("Close", "close")}
        </button>
      </div>

      {confirmOpen ? (
        <ModalShell
          title="Settle"
          isOpen
          narrow
          onClose={() => setConfirmOpen(false)}
          footer={
            <div className={styles.dialogActions}>
              <button type="button" className={quotationStyles.button} onClick={() => setConfirmOpen(false)}>
                No
              </button>
              <button
                type="button"
                className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
                autoFocus
                onClick={() => void settle()}
              >
                Settle
              </button>
            </div>
          }
        >
          <p className={styles.dialogNote}>
            {settleRows.length === 1
              ? `Settle ${settleRows[0].claim} — ${actionLabel(form.action)}?`
              : `Settle ${settleRows.length} claims — ${actionLabel(form.action)}?`}
            {preview.kind === "legs" ? `\n${preview.totals}` : ""}
          </p>
        </ModalShell>
      ) : null}

      <ShortageCloseDialog
        open={closeOpen}
        rows={closeRows.length}
        openQty={closeRows[0]?.openQty ?? 0}
        unit={closeRows[0]?.unit ?? ""}
        onCancel={() => setCloseOpen(false)}
        onAccept={(body) => void doClose(body)}
      />

      <AskText
        isOpen={undo !== null}
        title={undo?.target === "shortage" ? "Undo the last close" : "Undo the last settlement"}
        message={
          undo
            ? `${undo.target === "claim" ? undo.row.claim : undo.row.from}: ${undo.row.lastAction} is taken back with a reversing row. Why?`
            : ""
        }
        placeholder="Type the reason"
        required
        maxLength={250}
        confirmLabel="Undo"
        onCancel={() => setUndo(null)}
        onConfirm={(reason) => void doUndo(reason.trim())}
      />
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
    </div>
  );
}

function PreviewLegRow({ line }: { line: PreviewLine }) {
  return (
    <>
      <span>{line.dr ? `Dr  ${line.dr}` : ""}</span>
      <span>{line.cr ? `Cr  ${line.cr}` : ""}</span>
      <span className={styles.legAmount}>{money(line.amount)}</span>
    </>
  );
}

// ------------------------------------------------------------------ the grids

type GridProps<T> = {
  rows: readonly T[];
  currentKey: string | null;
  onCurrent: (key: string) => void;
  onToggle: (key: string) => void;
};

/** ↑ / ↓ walk the rows, Space ticks; the row element takes the focus. */
function useRowKeys<T extends { key: string }>(rows: readonly T[], onCurrent: (key: string) => void, onToggle: (key: string) => void) {
  return (event: React.KeyboardEvent<HTMLTableRowElement>, key: string) => {
    if (event.key === " " && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      onToggle(key);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const at = rows.findIndex((r) => r.key === key);
      const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        onCurrent(next.key);
        const table = event.currentTarget.closest("tbody");
        window.requestAnimationFrame(() =>
          (table?.querySelector(`[data-row-key="${CSS.escape(next.key)}"]`) as HTMLElement | null)?.focus(),
        );
      }
    }
  };
}

function TickCell({ ticked, onToggle }: { ticked: boolean; onToggle: () => void }) {
  return (
    <td>
      <button
        type="button"
        className={styles.tickCell}
        tabIndex={-1}
        aria-pressed={ticked}
        aria-label={ticked ? "Untick" : "Tick"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <span className={styles.tickBox}>{ticked ? "✓" : ""}</span>
      </button>
    </td>
  );
}

const CLAIM_COLS: readonly { title: string; weight: number; num?: boolean }[] = [
  { title: "", weight: 3 },
  { title: "Claim", weight: 15 },
  { title: "Date", weight: 9 },
  { title: "Age", weight: 5, num: true },
  { title: "Item", weight: 15 },
  { title: "Kind", weight: 11 },
  { title: "Against", weight: 11 },
  { title: "Reason", weight: 11 },
  { title: "Value", weight: 9, num: true },
  { title: "Credited", weight: 9, num: true },
  { title: "Written off", weight: 9, num: true },
  { title: "Open", weight: 9, num: true },
  { title: "Status", weight: 10 },
  { title: "Last action", weight: 18 },
];

function ColGroup({ cols }: { cols: readonly { weight: number }[] }) {
  const sum = cols.reduce((s, c) => s + c.weight, 0);
  return (
    <colgroup>
      {cols.map((c, i) => (
        <col key={i} style={{ width: `${((c.weight / sum) * 100).toFixed(2)}%` }} />
      ))}
    </colgroup>
  );
}

function ClaimsGrid({ rows, currentKey, onCurrent, onToggle }: GridProps<ClaimRow>) {
  const onKey = useRowKeys(rows, onCurrent, onToggle);
  return (
    <div className={styles.gridBox}>
      <table className={styles.grid} data-grid="claims">
        <ColGroup cols={CLAIM_COLS} />
        <thead>
          <tr>
            {CLAIM_COLS.map((c, i) => (
              <th key={i}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className={styles.emptyRow}>
              <td colSpan={CLAIM_COLS.length}>No claim is open.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.key}
                data-row-key={r.key}
                tabIndex={0}
                className={cx(styles.row, r.key === currentKey && styles.rowCurrent)}
                onClick={() => onCurrent(r.key)}
                onFocus={() => r.key !== currentKey && onCurrent(r.key)}
                onKeyDown={(event) => onKey(event, r.key)}
              >
                <TickCell ticked={r.ticked} onToggle={() => onToggle(r.key)} />
                <td title={r.claimTip}>{r.claim}</td>
                <td>{r.date}</td>
                <td className={styles.num}>{r.age}</td>
                <td title={r.itemTip}>{r.item}</td>
                <td>{r.kind}</td>
                <td className={cx(r.againstOther && styles.amber)} title={r.againstTip}>
                  {r.against}
                </td>
                <td title={r.reason}>{r.reason}</td>
                <td className={styles.num}>{money(r.value)}</td>
                <td className={styles.num}>{money(r.credited)}</td>
                <td className={styles.num}>{money(r.writtenOff)}</td>
                <td className={styles.num}>{money(r.open)}</td>
                <td>
                  {r.status ? <PurchaseCheckChip text={statusWords(r.status)} tone={statusTone(r.status)} /> : null}
                </td>
                <td className={cx(r.lastAction === "—" && styles.muted)} title={r.lastActionTip}>
                  {r.lastAction}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const SHORT_COLS: readonly { title: string; weight: number }[] = [
  { title: "", weight: 3 },
  { title: "From", weight: 14 },
  { title: "Date", weight: 8 },
  { title: "Age", weight: 4 },
  { title: "Item", weight: 16 },
  { title: "Why", weight: 10 },
  { title: "Short", weight: 5 },
  { title: "Recd", weight: 5 },
  { title: "Closed", weight: 5 },
  { title: "Open", weight: 5 },
  { title: "Cost", weight: 7 },
  { title: "GST held", weight: 7 },
  { title: "Status", weight: 8 },
  { title: "Outcome", weight: 11 },
  { title: "Last action", weight: 16 },
];

function ShortagesGrid({ rows, currentKey, onCurrent, onToggle }: GridProps<ShortageRow>) {
  const onKey = useRowKeys(rows, onCurrent, onToggle);
  return (
    <div className={styles.gridBox}>
      <table className={styles.grid} data-grid="shortages">
        <ColGroup cols={SHORT_COLS} />
        <thead>
          <tr>
            {SHORT_COLS.map((c, i) => (
              <th key={i}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className={styles.emptyRow}>
              <td colSpan={SHORT_COLS.length}>No shortage is open.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.key}
                data-row-key={r.key}
                tabIndex={0}
                className={cx(styles.row, r.key === currentKey && styles.rowCurrent)}
                onClick={() => onCurrent(r.key)}
                onFocus={() => r.key !== currentKey && onCurrent(r.key)}
                onKeyDown={(event) => onKey(event, r.key)}
              >
                <TickCell ticked={r.ticked} onToggle={() => onToggle(r.key)} />
                <td title={r.fromTip}>{r.from}</td>
                <td>{r.date}</td>
                <td className={styles.num}>{r.age}</td>
                <td title={r.itemTip}>{r.item}</td>
                <td>{r.why}</td>
                <td className={styles.num}>{r.short}</td>
                <td className={styles.num}>{r.recd}</td>
                <td className={styles.num}>{r.closed}</td>
                <td className={styles.num}>{r.open}</td>
                <td className={styles.num} title={r.costTip}>
                  {money(r.cost)}
                </td>
                <td className={cx(styles.num, r.gstHeld === "—" && styles.muted)}>{r.gstHeld}</td>
                <td>
                  {r.status ? <PurchaseCheckChip text={statusWords(r.status)} tone={statusTone(r.status)} /> : null}
                </td>
                <td>
                  <PurchaseCheckChip text={r.outcome} tone={r.replacement ? "success" : "info"} />
                </td>
                <td className={cx(r.lastAction === "—" && styles.muted)} title={r.lastActionTip}>
                  {r.lastAction}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
