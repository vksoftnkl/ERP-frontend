"use client";

/**
 * Cash Office (menu 287, Sales › Till, till notes 118) — Qt `TillSafeOffice`
 * (NexERP ec9d92d, restyled c25c5e3; mockup till_cash_office_ui_mockup.png,
 * whose "Drop bags" tab is gone: hand-overs and drops are approved on the
 * Session Cockpit, notes 114).
 *
 * The branch's safe: what it should hold and how it got there (blind — every
 * figure a dash — under till.blind_close for a caller without 287 / 273
 * OVERRIDE), its book since the last count (grid 158), the branch's
 * remittances (grid 157) with Void remittance…, and the desk: Count safe
 * (blind; the answer shows what it should have held), Remit to bank (bank
 * deposit by staff, or a CIT agency — then on the way until the bank confirms
 * it) and On the way, whose Confirm with bank… is `remit-confirm-dialog.tsx`.
 * A gap waiting for a decision raises the amber band; Decide… is
 * `safe-decide-dialog.tsx` (two-person as shipped).
 *
 * Rights (server-judged): 287 VIEW opens it, CREATE counts, remits and
 * confirms, OVERRIDE decides and voids. Qt has no override flag and keeps
 * Decide on data; the web reads 287 OVERRIDE from the user menu — the same
 * `user_menus` flag the server checks — and says so on the button.
 *
 * The business context (company · branch) is the header's; the screen is
 * keyed by it, so a header change starts it afresh. Qt's open arg
 * `{ tab: "count" | "remit" }` is `?tab=count|remit` here (Business Day's links).
 *
 * Keys (Qt): F5 Refresh · F10 Save count / Post remittance (the desk tab
 * showing) · Enter walks the fields · Esc closes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { confirm } from "@/lib/confirm";
import { useDataRefresh, type DataRefreshReason } from "@/lib/data-freshness";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, countLines, countedPaise, type DenomCountValue } from "../shared/denom";
import { textOf, todayIso } from "../shared/format";
import { movementVoidMessage, type MovementVoidRequest } from "../shared/movement-void";
import { MovementVoidDialog } from "../shared/movement-void-dialog";
import { TonePill, overlayOpen } from "../shared/till-dialog";
import type { GridRow, TillMovementFull, TillRemitConfirmResult } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { RemittancesPanel, SafeBookPanel } from "./book-panels";
import {
  CASH_OFFICE_HREF,
  EMPTY_COUNT_FORM,
  EMPTY_SAFE_QUESTION,
  cashOfficeSub,
  cashOfficeTitle,
  clearedRemitForm,
  confirmButtonTitle,
  confirmOutcomeText,
  countBody,
  countButtonTitle,
  countProblem,
  countResultLine,
  decideButton,
  deskTabOf,
  emptyRemitForm,
  factsHint,
  gapsLine,
  nextGap,
  pickTransitId,
  remitAmountPaise,
  remitBody,
  remitButtonTitle,
  remitPostedText,
  remitProblem,
  remitQuestion,
  remitVoidRequest,
  safeFacts,
  safePill,
  transitRows,
  transitTabTitle,
  voidButton,
  voidableRemit,
  type BookTab,
  type CountForm,
  type DeskTab,
  type RemitForm,
} from "./cash-office";
import { CountPanel, RemitPanel, TransitPanel } from "./desk-panels";
import type { RemitConfirmRequest } from "./remit-confirm";
import { RemitConfirmDialog } from "./remit-confirm-dialog";
import type { SafeDecideRequest } from "./safe-decide";
import { SafeDecideDialog } from "./safe-decide-dialog";
import { useCashOffice } from "./use-cash-office";
import local from "./cash-office.module.scss";

/** Coming back to the tab re-reads the safe, quietly (the browser's signals only, as Business Day). */
const REVALIDATE_ON: DataRefreshReason[] = ["focus", "visible", "reconnect", "manual"];

/** The header's company and branch; the screen proper is keyed by them. */
export default function CashOfficePage() {
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  if (!companyId || !branchId) {
    return (
      <div className={styles.page}>
        <header className={styles.titleBar}>
          <h1 className={styles.title}>Cash Office</h1>
        </header>
        <p className={local.notice}>A safe belongs to a branch — choose a company and a branch in the header first.</p>
      </div>
    );
  }
  return (
    <CashOfficeScreen
      key={`${companyId}|${branchId}`}
      companyId={companyId}
      branchId={branchId}
      companyName={activeCompany?.name ?? ""}
    />
  );
}

type Dialog =
  | { kind: "confirm"; request: RemitConfirmRequest }
  | { kind: "decide"; request: SafeDecideRequest }
  | { kind: "void"; request: MovementVoidRequest }
  | null;

type CashOfficeScreenProps = { companyId: string; branchId: string; companyName: string };

function CashOfficeScreen({ companyId, branchId, companyName }: CashOfficeScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useTillSessionClient();
  const { permissions } = usePagePermissions({ href: CASH_OFFICE_HREF });
  const canCreate = permissions.canCreate;
  // Absent reads as allowed (an ungoverned route grants everything): the server judges.
  const canOverride = permissions.canOverride !== false;
  const [userName] = useState(() => getUserInfo()?.userName ?? "");
  const scope = useMemo(() => ({ companyId, branchId }), [companyId, branchId]);

  const model = useCashOffice(scope);
  const { balance, balanceLoading, balanceError, safes, safe, safeId, setSafeId, reasons, denominations, denomsLoading } =
    model;
  const { remits, book, remitStatus, setRemitStatus, reload, revalidate } = model;
  const figuresVisible = Boolean(balance?.figuresVisible);

  // ── Tabs: `?tab=count|remit` picks the desk tab (also on a later link to it) ──
  const tabParam = searchParams?.get("tab") ?? null;
  const [deskTab, setDeskTab] = useState<DeskTab>(() => deskTabOf(tabParam) ?? "count");
  const [shownTabParam, setShownTabParam] = useState(tabParam);
  if (shownTabParam !== tabParam) {
    setShownTabParam(tabParam);
    const asked = deskTabOf(tabParam);
    if (asked) setDeskTab(asked);
  }
  const [bookTab, setBookTab] = useState<BookTab>("book");

  // ── The desk's forms ───────────────────────────────────────────────────
  const [count, setCount] = useState<DenomCountValue>(EMPTY_COUNT);
  const [countForm, setCountForm] = useState<CountForm>(EMPTY_COUNT_FORM);
  const [countResult, setCountResult] = useState<{ text: string; tone: "green" | "amber" } | null>(null);
  const [remitForm, setRemitForm] = useState<RemitForm>(() => emptyRemitForm(todayIso()));
  const [pickedTransitId, setPickedTransitId] = useState("");
  const [pickedRemitId, setPickedRemitId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  /** Two F10s inside one render must not post twice. */
  const inFlight = useRef(false);

  const patchCountForm = useCallback((patch: Partial<CountForm>) => setCountForm((current) => ({ ...current, ...patch })), []);
  const patchRemitForm = useCallback((patch: Partial<RemitForm>) => setRemitForm((current) => ({ ...current, ...patch })), []);

  // ── What the screen says ───────────────────────────────────────────────
  const title = cashOfficeTitle(safe);
  const sub = cashOfficeSub(companyName, balance?.businessDate, userName);
  const pill = safePill(safe);
  const facts = safeFacts(safe);
  const hint = factsHint(safe, figuresVisible);
  const gaps = gapsLine(safe);
  const decide = decideButton(safe, { busy, canOverride });

  const counted = countedPaise(denominations, count);
  const countIssue = countProblem(safe, denominations.length, countForm);
  const countButton = { enabled: !busy && canCreate && !countIssue, title: countButtonTitle(canCreate, countIssue) };

  const remitAmount = remitAmountPaise(remitForm);
  const remitIssue = remitProblem(remitForm, safe, remitAmount);
  const remitButton = { enabled: !busy && canCreate && !remitIssue, title: remitButtonTitle(canCreate, remitIssue) };

  const transit = useMemo(() => transitRows(balance?.inTransit), [balance]);
  const transitId = pickTransitId(transit, pickedTransitId);
  const pickedTransit = transit.find((row) => row.tcmId === transitId) ?? null;
  const confirmButton = {
    enabled: !busy && canCreate && pickedTransit !== null,
    title: confirmButtonTitle(canCreate, pickedTransit !== null),
  };

  const pickedRemitRow = pickedRemitId ? (remits.rows.find((row) => textOf(row, "tcm_id") === pickedRemitId) ?? null) : null;
  const voidState = voidButton(pickedRemitRow, { busy, canOverride });

  // ── Verbs ──────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  /** Save count (Qt `submitCount`): blind; the answer is the line under it, and the safe is read again. */
  const submitCount = async () => {
    if (!safe || !countButton.enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      if (counted <= 0 && !(await confirm({ title: "Count safe", message: EMPTY_SAFE_QUESTION, confirmLabel: "Save as empty" }))) {
        return;
      }
      setBusy(true);
      const result = await client.safeCount(countBody(scope, safe.safeId, countLines(denominations, count), countForm));
      setCountResult(countResultLine(result));
      setCount(EMPTY_COUNT);
      setCountForm(EMPTY_COUNT_FORM);
      reload();
    } catch (error) {
      toast.apiError(error, { fallback: "The safe count could not be saved." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  /** Post remittance (Qt `submitRemit`), after the question. */
  const submitRemit = async () => {
    if (!safe || !remitButton.enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const yes = await confirm({
        title: "Remit to bank",
        message: remitQuestion(remitForm, safe.name, remitAmount),
        confirmLabel: "Post remittance",
      });
      if (!yes) return;
      setBusy(true);
      const result = await client.remit(remitBody(scope, safe.safeId, remitForm, remitAmount));
      toast.success(remitPostedText(result), { title: "Remit to bank", autoClose: false });
      setRemitForm(clearedRemitForm);
      reload();
    } catch (error) {
      toast.apiError(error, { fallback: "The remittance could not be posted." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const openConfirm = () => {
    if (!confirmButton.enabled || !pickedTransit) return;
    setDialog({
      kind: "confirm",
      request: { scope, remit: pickedTransit.remit, businessDate: balance?.businessDate ?? "" },
    });
  };

  const confirmed = (result: TillRemitConfirmResult) => {
    setDialog(null);
    const text = confirmOutcomeText(result);
    if (text) toast.info(text, { title: "Confirm with bank" });
    reload();
  };

  const openDecide = () => {
    const gap = nextGap(safe);
    if (!decide.enabled || !safe || !gap) return;
    setDialog({ kind: "decide", request: { scope, gap, safeName: safe.name } });
  };

  const decided = () => {
    setDialog(null);
    reload();
  };

  const openVoid = () => {
    const row = voidableRemit(pickedRemitRow);
    if (!voidState.enabled || !row) return;
    setDialog({ kind: "void", request: remitVoidRequest(row, scope) });
  };

  const voided = (result: TillMovementFull) => {
    setDialog(null);
    reload();
    toast.success(movementVoidMessage(result), { title: "Void remittance", autoClose: false });
  };

  const pickSafe = (id: string) => {
    setSafeId(id);
    // The answer under the count was another safe's.
    setCountResult(null);
  };

  useDataRefresh(revalidate, { reasons: REVALIDATE_ON });

  // ── Keys: F5 refresh · F10 the desk tab's post · Esc close ─────────────
  const keysRef = useRef<{ reload: () => void; close: () => void; f10: () => void }>({ reload, close, f10: () => undefined });
  useLayoutEffect(() => {
    keysRef.current = {
      reload,
      close,
      f10: () => {
        if (deskTab === "count") void submitCount();
        else if (deskTab === "remit") void submitRemit();
      },
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F5") {
        // Never the browser's reload.
        event.preventDefault();
        keysRef.current.reload();
      } else if (event.key === "F10") {
        // Never the browser's menu bar.
        event.preventDefault();
        keysRef.current.f10();
      } else if (event.key === "Escape") {
        event.preventDefault();
        keysRef.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={cx(styles.page, local.page)}>
      <header className={styles.titleBar}>
        <div className={local.titleBlock}>
          <h1 className={cx(styles.title, local.title)}>{title}</h1>
          <p className={styles.subtitle}>
            {sub}
            {balanceLoading ? " · reading…" : ""}
          </p>
        </div>
        <div className={local.headRight}>
          <label className={local.safePick}>
            <span className={styles.muted}>Safe</span>
            <select
              className={cx(styles.select, local.safeSelect)}
              aria-label="Safe"
              value={safeId}
              disabled={safes.length <= 1}
              onChange={(event) => pickSafe(event.target.value)}
            >
              {safes.length === 0 ? <option value="">{balanceLoading ? "Reading…" : "No safe at this branch"}</option> : null}
              {safes.map((option) => (
                <option key={option.safeId} value={option.safeId}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          {pill ? <TonePill tone={pill.tone}>{pill.text}</TonePill> : null}
        </div>
      </header>

      <div className={styles.scroll}>
        <div className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.caption} className={styles.fact}>
              <span className={styles.cap}>{fact.caption}</span>
              <span className={cx(styles.val, fact.danger && local.factDanger)} title={fact.value}>
                {fact.value}
              </span>
            </div>
          ))}
        </div>
        {hint ? <p className={styles.muted}>{hint}</p> : null}

        {gaps ? (
          <div className={styles.band}>
            <div className={styles.bandRow}>
              <TonePill tone="amber">DECIDE</TonePill>
              <span className={styles.strong}>{gaps}</span>
              <span className={styles.spacer} />
              <button type="button" className={local.warnButton} disabled={!decide.enabled} title={decide.title} onClick={openDecide}>
                Decide…
              </button>
            </div>
          </div>
        ) : null}

        <div className={local.body}>
          <section className={local.pane} aria-label="Safe book and remittances">
            <div className={styles.tabs} role="tablist">
              {(
                [
                  ["book", "Safe book"],
                  ["remits", "Remittances"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={bookTab === value}
                  className={cx(styles.tab, bookTab === value && styles.tabActive)}
                  onClick={() => setBookTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {bookTab === "book" ? (
              <SafeBookPanel book={book} hasSafe={safe !== null} />
            ) : (
              <RemittancesPanel
                remits={remits}
                status={remitStatus}
                onStatus={setRemitStatus}
                pickedId={pickedRemitId}
                onPick={(row: GridRow) => setPickedRemitId(textOf(row, "tcm_id") || null)}
                voidButton={voidState}
                onVoid={openVoid}
              />
            )}
          </section>

          <section className={local.pane} aria-label="Count, remit, on the way">
            <div className={styles.tabs} role="tablist">
              {(
                [
                  ["count", "Count safe"],
                  ["remit", "Remit to bank"],
                  ["transit", transitTabTitle(transit.length)],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={deskTab === value}
                  className={cx(styles.tab, deskTab === value && styles.tabActive)}
                  onClick={() => setDeskTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {deskTab === "count" ? (
              <CountPanel
                companyId={companyId}
                denominations={denominations}
                denomsLoading={denomsLoading}
                count={count}
                onCount={setCount}
                countedPaise={counted}
                form={countForm}
                onForm={patchCountForm}
                result={countResult}
                button={countButton}
                busy={busy}
                onSave={() => void submitCount()}
              />
            ) : null}
            {deskTab === "remit" ? (
              <RemitPanel
                form={remitForm}
                onForm={patchRemitForm}
                button={remitButton}
                busy={busy}
                onPost={() => void submitRemit()}
              />
            ) : null}
            {deskTab === "transit" ? (
              <TransitPanel
                rows={transit}
                pickedId={transitId}
                onPick={setPickedTransitId}
                onConfirm={openConfirm}
                button={confirmButton}
              />
            ) : null}
          </section>
        </div>
      </div>

      <footer className={local.foot}>
        <div className={local.footError}>
          {balanceError ? (
            <p className={cx(styles.warn, styles.warnDanger)}>
              <RefusalText refusal={balanceError} />
            </p>
          ) : null}
        </div>
        <button type="button" className={styles.secondaryButton} onClick={reload}>
          Refresh - F5
        </button>
        <button type="button" className={styles.secondaryButton} onClick={close}>
          Esc  Close
        </button>
      </footer>

      <RemitConfirmDialog
        request={dialog?.kind === "confirm" ? dialog.request : null}
        onClose={() => setDialog(null)}
        onConfirmed={confirmed}
      />
      <SafeDecideDialog
        request={dialog?.kind === "decide" ? dialog.request : null}
        reasons={reasons}
        onClose={() => setDialog(null)}
        onDecided={decided}
      />
      <MovementVoidDialog
        request={dialog?.kind === "void" ? dialog.request : null}
        reasons={reasons}
        onClose={() => setDialog(null)}
        onVoided={voided}
      />
    </div>
  );
}
