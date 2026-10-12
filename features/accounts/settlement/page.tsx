"use client";

/**
 * Settlement Reconciliation — menu 278 under Accounts. The React port of the
 * Qt `SettlementReconciliationEntry` (NexERP d5c3637, 2026-10-09; mockups
 * till_settlement_{match,exceptions,import}_ui_mockup.png): card / UPI /
 * wallet money proven by the provider's statement, not counted.
 *
 *   Match         the payouts (grid 138); a payout's lines (GET get) against
 *                 our tender rows — confirm / not this one / pick another row /
 *                 ignore; Run match; Post TSet; Void
 *   Not received  our rows past their date + grace (grid 140) → write off
 *   Unexplained   provider lines no row explains (grid 141) → resolve
 *   Duplicate refs (142) · Suspense (143) — read-only
 *
 * The server (`accountsModule/tenderSettlement`) is the contract and judges
 * every verb on menu 278 — write-off and resolve on OVERRIDE, which stands in
 * for their approvals until the till's phase-3 gate ships.
 *
 * `?asiId=…&accYear=…` opens that payout on arrival (Qt `openPayout`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import { useSettlementClient } from "./api/settlement-api";
import { FormatDialog } from "./components/format-dialog";
import { ImportDialog } from "./components/import-dialog";
import { ListTab } from "./components/list-tab";
import { MatchTab } from "./components/match-tab";
import { NotReceivedTab } from "./components/not-received-tab";
import { PromptDialog, type PromptRequest } from "./components/prompt-dialog";
import { RowPickerDialog, type PickerRequest } from "./components/row-picker-dialog";
import { UnexplainedTab } from "./components/unexplained-tab";
import { addDays, istToday } from "./domain/dates";
import { openDialogCount } from "./domain/dialog-stack";
import { DUPLICATES_HINT, SUSPENSE_HINT, reasonGridParams, reasonOptions } from "./domain/exceptions";
import { FALLBACK_COLUMNS } from "./domain/grid-columns";
import { text } from "./domain/parse";
import {
  OVERRIDE_HINT,
  SCREEN_SUBTITLE,
  SETTLEMENT_HREF,
  SETTLEMENT_TABS,
  TAB_LABELS,
  screenAction,
  type SettlementTab,
} from "./domain/keys";
import type { SettlementRights } from "./domain/types";
import { useNotReceived, useUnexplained } from "./hooks/use-exceptions";
import { useGridColumns, useGridList } from "./hooks/use-grid-list";
import { useMatch } from "./hooks/use-match";
import styles from "./page.module.scss";

/** A popup of the house's or of this screen is up: the keys belong to it. */
function overlayOpen(): boolean {
  return (
    openDialogCount() > 0 ||
    getConfirmations().length > 0 ||
    getMessages().length > 0 ||
    document.querySelector('[aria-modal="true"]') !== null
  );
}

export default function SettlementReconciliationScreen() {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();
  // A new store or year is a new screen: nothing of the last one's payout carries over.
  return (
    <SettlementBody
      key={`${companyId}|${branchId}|${accYear}`}
      companyId={companyId}
      branchId={branchId}
      accYear={accYear}
    />
  );
}

function SettlementBody({ companyId, branchId, accYear }: { companyId: string; branchId: string; accYear: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useSettlementClient();
  const { permissions } = usePagePermissions({ href: SETTLEMENT_HREF });
  const rights: SettlementRights = useMemo(
    () => ({
      canCreate: permissions.canCreate,
      canEdit: permissions.canEdit,
      canPost: permissions.canPost !== false,
      canCancel: permissions.canCancel !== false,
      // The usermenu payload carries `canOverride`, but the client's permission
      // index drops it today: absent reads as allowed and the server answers
      // 403 …_NEEDS_APPROVAL, as in Qt.
      canOverride: (permissions as { canOverride?: boolean }).canOverride !== false,
    }),
    [permissions],
  );
  const scope = useMemo(() => ({ companyId, branchId }), [companyId, branchId]);
  const ready = companyId !== "" && branchId !== "";

  // ── the lists ──────────────────────────────────────────────────────────
  const [today] = useState(istToday);
  const from = addDays(today, -30);
  const payoutParams = useMemo(
    () =>
      ready && accYear
        ? {
            iasi_company_id: companyId,
            iasi_branch_id: branchId,
            iasi_acc_year: accYear,
            iasi_status: "",
            ifrom_date: "",
            ito_date: "",
          }
        : null,
    [accYear, branchId, companyId, ready],
  );
  const notReceivedParams = useMemo(
    () => (ready ? { itd_company_id: companyId, itd_branch_id: branchId, igrace_days: "", itender_id: "" } : null),
    [branchId, companyId, ready],
  );
  const unexplainedParams = useMemo(
    () => (ready ? { iasi_company_id: companyId, iasi_branch_id: branchId } : null),
    [branchId, companyId, ready],
  );
  const duplicateParams = useMemo(
    () => (companyId ? { itd_company_id: companyId, ifrom_date: from, ito_date: today } : null),
    [companyId, from, today],
  );
  const suspenseParams = useMemo(
    () =>
      ready ? { iavh_company_id: companyId, iavh_branch_id: branchId, ifrom_date: from, ito_date: today } : null,
    [branchId, companyId, from, ready, today],
  );
  const reasonParams = useMemo(() => (companyId ? reasonGridParams(companyId) : null), [companyId]);

  const payouts = useGridList(client, "tenderSettlementList", payoutParams);
  const notReceivedList = useGridList(client, "tenderSettlementNotReceived", notReceivedParams);
  const unexplainedList = useGridList(client, "tenderSettlementUnexplained", unexplainedParams);
  const duplicates = useGridList(client, "tenderSettlementDuplicateRefs", duplicateParams);
  const suspense = useGridList(client, "tenderSettlementSuspense", suspenseParams);
  const reasonList = useGridList(client, "tillReasonList", reasonParams);
  const reasons = useMemo(() => reasonOptions(reasonList.rows), [reasonList.rows]);

  const payoutColumns = useGridColumns("tenderSettlementList", FALLBACK_COLUMNS.payouts);
  const notReceivedColumns = useGridColumns("tenderSettlementNotReceived", FALLBACK_COLUMNS.notReceived);
  const unexplainedColumns = useGridColumns("tenderSettlementUnexplained", FALLBACK_COLUMNS.unexplained);
  const duplicateColumns = useGridColumns("tenderSettlementDuplicateRefs", FALLBACK_COLUMNS.duplicates);
  const suspenseColumns = useGridColumns("tenderSettlementSuspense", FALLBACK_COLUMNS.suspense);

  // ── dialogs ────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  // ── the tabs' state ────────────────────────────────────────────────────
  const reloads = useMemo(
    () => ({
      payouts: payouts.reload,
      notReceived: notReceivedList.reload,
      unexplained: unexplainedList.reload,
      suspense: suspense.reload,
    }),
    [notReceivedList.reload, payouts.reload, suspense.reload, unexplainedList.reload],
  );
  const match = useMatch({ client, scope, rights, reloads, ask: setPrompt, pick: setPicker });
  const notReceived = useNotReceived({
    client,
    scope,
    canOverride: rights.canOverride,
    rows: notReceivedList.rows,
    reloadNotReceived: notReceivedList.reload,
    reloadSuspense: suspense.reload,
  });
  const unexplained = useUnexplained({
    client,
    scope,
    canOverride: rights.canOverride,
    rows: unexplainedList.rows,
    pick: setPicker,
    reloadUnexplained: unexplainedList.reload,
    reloadSuspense: suspense.reload,
    reloadPayouts: payouts.reload,
  });

  const [tab, setTab] = useState<SettlementTab>("match");
  // The payouts grid's cursor, by asi_id: the payout last walked to, else the
  // one open (an import or the URL opens one the grid did not pick).
  const [payoutKeyAt, setPayoutKeyAt] = useState("");
  const wantedAsi = payoutKeyAt || match.payout?.asiId || "";
  const payoutCursor = wantedAsi ? payouts.rows.findIndex((row) => text(row, "asi_id") === wantedAsi) : -1;
  const setPayoutCursor = useCallback(
    (index: number) => setPayoutKeyAt(index >= 0 ? text(payouts.rows[index], "asi_id") : ""),
    [payouts.rows],
  );

  const reloadAll = useCallback(() => {
    payouts.reload();
    notReceivedList.reload();
    unexplainedList.reload();
    duplicates.reload();
    suspense.reload();
    match.reopen();
  }, [duplicates, match, notReceivedList, payouts, suspense, unexplainedList]);

  // ── a payout named in the URL ──────────────────────────────────────────
  const askedAsi = searchParams.get("asiId") ?? "";
  const askedYear = searchParams.get("accYear") || accYear;
  const { openPayout } = match;
  const openedFromUrl = useRef("");
  useEffect(() => {
    const key = `${askedAsi}|${askedYear}`;
    if (!ready || !askedAsi || openedFromUrl.current === key) return;
    openedFromUrl.current = key;
    void openPayout(askedAsi, askedYear);
  }, [askedAsi, askedYear, openPayout, ready]);

  // ── keys ───────────────────────────────────────────────────────────────
  const keysRef = useRef({ tab, match, notReceived, unexplained, reloadAll });
  useEffect(() => {
    keysRef.current = { tab, match, notReceived, unexplained, reloadAll };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      const target = event.target instanceof Element ? event.target : null;
      const current = keysRef.current;
      const action = screenAction(event, {
        tab: current.tab,
        inLinesTable: target !== null && target.closest("[data-settlement-lines]") !== null,
      });
      if (!action) return;
      event.preventDefault();
      switch (action) {
        case "refresh":
          current.reloadAll();
          break;
        case "runMatch":
          current.match.runMatch();
          break;
        case "post":
          void current.match.postPayout();
          break;
        case "confirm":
          current.match.confirmLine();
          break;
        case "unlink":
          current.match.unlinkLine();
          break;
        case "writeOff":
          void current.notReceived.writeOff();
          break;
        case "resolve":
          void current.unexplained.resolve();
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const counts: Partial<Record<SettlementTab, { n: number; alert: boolean }>> = {
    notReceived: notReceivedList.loaded ? { n: notReceivedList.rows.length, alert: notReceivedList.rows.length > 0 } : undefined,
    unexplained: unexplainedList.loaded ? { n: unexplainedList.rows.length, alert: unexplainedList.rows.length > 0 } : undefined,
    duplicates: duplicates.loaded ? { n: duplicates.rows.length, alert: false } : undefined,
  };

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Settlement Reconciliation</h1>
          <p className={styles.subtitle}>{SCREEN_SUBTITLE}</p>
        </div>
        {!ready ? <span className={styles.scopeNotice}>Pick a company and a branch in the header.</span> : null}
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Settlement Reconciliation">
        {SETTLEMENT_TABS.map((key) => {
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={cx(styles.tab, tab === key && styles.tabActive)}
              onClick={() => setTab(key)}
            >
              {TAB_LABELS[key]}
              {count ? <span className={cx(styles.tabCount, count.alert && styles.tabCountAlert)}>{count.n}</span> : null}
            </button>
          );
        })}
      </nav>

      <MatchTab
        hidden={tab !== "match"}
        match={match}
        payouts={payouts}
        payoutColumns={payoutColumns}
        payoutCursor={payoutCursor}
        onPayoutCursor={setPayoutCursor}
        onImport={() => setImportOpen(true)}
        onFormat={() => setFormatOpen(true)}
      />
      <NotReceivedTab
        hidden={tab !== "notReceived"}
        state={notReceived}
        list={notReceivedList}
        columns={notReceivedColumns}
        reasons={reasons}
        companyId={companyId}
      />
      <UnexplainedTab
        hidden={tab !== "unexplained"}
        state={unexplained}
        list={unexplainedList}
        columns={unexplainedColumns}
        reasons={reasons}
        companyId={companyId}
      />
      <ListTab
        hidden={tab !== "duplicates"}
        label="Duplicate refs"
        hint={DUPLICATES_HINT}
        list={duplicates}
        columns={duplicateColumns}
        emptyText="No reference repeats in the last 30 days."
      />
      <ListTab
        hidden={tab !== "suspense"}
        label="Suspense"
        hint={SUSPENSE_HINT}
        list={suspense}
        columns={suspenseColumns}
        emptyText="Nothing moved through Tender suspense in the last 30 days."
      />

      <footer className={styles.bar}>
        <span className={styles.keyHints}>{OVERRIDE_HINT}</span>
        <button type="button" className={styles.button} onClick={reloadAll}>
          F5  Refresh
        </button>
        <button type="button" className={styles.button} onClick={() => router.back()}>
          Close
        </button>
      </footer>

      {importOpen ? (
        <ImportDialog
          client={client}
          companyId={companyId}
          branchId={branchId}
          onClose={() => setImportOpen(false)}
          onImported={(first) => {
            setImportOpen(false);
            setTab("match");
            setPayoutKeyAt("");
            payouts.reload();
            if (first) void openPayout(first.asiId, first.accYear);
          }}
        />
      ) : null}
      {formatOpen ? (
        <FormatDialog
          client={client}
          companyId={companyId}
          canEdit={rights.canEdit}
          onClose={() => setFormatOpen(false)}
        />
      ) : null}
      {picker ? <RowPickerDialog client={client} request={picker} onClose={() => setPicker(null)} /> : null}
      {prompt ? <PromptDialog request={prompt} onClose={() => setPrompt(null)} /> : null}
    </div>
  );
}
