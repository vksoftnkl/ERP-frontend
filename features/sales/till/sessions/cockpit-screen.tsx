"use client";

/**
 * The Session Cockpit (S5) — Qt `TillSessionCockpit`, at the keyed route
 * `/sales/till/sessions/<company>/<branch>/<year>/<id>`: one till session,
 * addressed by the whole key it was written with (the Sessions list's Enter
 * and the Business Day screen both land here).
 *
 * The supervisor's read first (`/sessions/expected`, every expected figure,
 * Till Sessions 273 OVERRIDE); refused (403, or TILL_BLIND_CLOSE to the
 * session's own cashier) it falls back to the blind `/sessions/get`. The four
 * grids under the reconciliation are 146 bills · 147 money documents · 148
 * counts · 145 timeline. What it decides is `cockpit.ts`; Approve opens the
 * approver's decision (`variance-decide-dialog.tsx`) — on a received bag's
 * difference in bag mode — or, on a closed session whose cash waits, Approve
 * Cash (`approve-cash-dialog.tsx`).
 *
 * Qt c77f3f1 (notes 117): Force close… (`force-close-dialog.tsx`), Reopen
 * (`reopen-dialog.tsx`), X read (`x-read-dialog.tsx`, then its 80 mm print),
 * Print Z (purpose TILL_SESSION_Z), and Re-tender on the Bills tab's posted
 * bill (`cockpit-retender.tsx`). Each re-reads the session when it is done.
 *
 * Keys: F5 refresh, Esc close; on the Bills tab ↑ / ↓ pick the bill.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { getAuthUserId } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import { TILL_SESSIONS_HREF, sortRowsBy, textOf } from "../shared/format";
import { reasonGridParams, toReasons, type TillReason } from "../shared/reasons";
import { TonePill, overlayOpen } from "../shared/till-dialog";
import type { GridRow, TillSessionKey, TillSessionPayload, TillVarianceDecision } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { EndShiftDialog } from "../session/end-shift-dialog";
import { approveCashOutcome } from "./approve-cash";
import { ApproveCashDialog, type ApproveCashRequest } from "./approve-cash-dialog";
import {
  BAG_DECIDED_MESSAGE,
  REC_HINT,
  REC_NOTE,
  TENDER_FIGURES,
  approvalBand,
  approveButton,
  cockpitButtons,
  cockpitFacts,
  cockpitHeader,
  cockpitTiles,
  exceptionButtons,
  footNote,
  gridCellText,
  isMine,
  printZLabel,
  retenderButton,
  retenderTargetOf,
  retenderableBill,
  type RetenderTarget,
  sessionPrintTarget,
  shouldFallBackToBlind,
  slipTenders,
  tenderRows,
  xReadLabel,
} from "./cockpit";
import { CockpitRetender } from "./cockpit-retender";
import { forceCloseMessage } from "./force-close";
import { ForceCloseDialog, type SessionDialogRequest } from "./force-close-dialog";
import { FALLBACK_COLUMNS, GridTable } from "./grid-table";
import { EventCell } from "./journal-dialog";
import { reopenMessage } from "./reopen";
import { ReopenDialog } from "./reopen-dialog";
import local from "./sessions.module.scss";
import { SlipCheckDialog } from "./slip-check-dialog";
import { VarianceDecideDialog } from "./variance-decide-dialog";
import { bagDecideRequestOf, decideRequestOf, decidedMessage, type DecideRequest } from "./variance-decide";
import { XReadDialog, type XReadRequest } from "./x-read-dialog";

type DocTab = "bills" | "money" | "counts";

type Grids = { bills: GridRow[]; money: GridRow[]; counts: GridRow[]; events: GridRow[] };

const NO_GRIDS: Grids = { bills: [], money: [], counts: [], events: [] };

export type CockpitScreenProps = { initialKey: TillSessionKey };

export default function CockpitScreen({ initialKey }: CockpitScreenProps) {
  const router = useRouter();
  const client = useTillSessionClient();
  const { companyId, branchId, accYear, tssId } = initialKey;
  const key = useMemo<TillSessionKey>(() => ({ companyId, branchId, accYear, tssId }), [accYear, branchId, companyId, tssId]);
  const me = getAuthUserId() ?? "";

  const [session, setSession] = useState<TillSessionPayload | null>(null);
  const [expectedShown, setExpectedShown] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [grids, setGrids] = useState<Grids>(NO_GRIDS);
  const [gridsLoading, setGridsLoading] = useState(true);
  const [gridsError, setGridsError] = useState("");
  /** Grid 134, every reason: the reconciliation names them, the decide dialog offers its gap's. */
  const [reasons, setReasons] = useState<TillReason[]>([]);
  const reasonNames = useMemo(() => new Map(reasons.map((r) => [r.id, r.name])), [reasons]);
  const [tab, setTab] = useState<DocTab>("bills");
  const tabChosen = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [countOpen, setCountOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [decide, setDecide] = useState<DecideRequest | null>(null);
  const [approveCash, setApproveCash] = useState<ApproveCashRequest | null>(null);
  const [forceClose, setForceClose] = useState<SessionDialogRequest | null>(null);
  const [reopen, setReopen] = useState<SessionDialogRequest | null>(null);
  const [xRead, setXRead] = useState<XReadRequest | null>(null);
  /** The X read is on the wire: the button waits (Qt disables it). */
  const [xReading, setXReading] = useState(false);
  const [printZOpen, setPrintZOpen] = useState(false);
  const [retender, setRetender] = useState<RetenderTarget | null>(null);
  /** The Bills tab's current row (its `tb_id`), kept across a reload while the bill is still listed. */
  const [pickedBillId, setPickedBillId] = useState<string | null>(null);

  /** Bumped by F5 / Refresh and after a dialog: the effect below re-reads everything. */
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The supervisor's read first; the session's own cashier is refused it
      // until the close (TILL_BLIND_CLOSE) — then the blind one.
      try {
        const payload = await client.expected(key);
        if (cancelled) return;
        setSession(payload);
        setExpectedShown(true);
        setLoadError("");
      } catch (error) {
        const refusal = tillErrorOf(error, "The session could not be read.");
        if (shouldFallBackToBlind(refusal.status, refusal.code)) {
          try {
            const payload = await client.get(key);
            if (cancelled) return;
            setSession(payload);
            // /get shows them too when the session's settings allow it.
            setExpectedShown(Boolean(payload.expectedVisible));
            setLoadError("");
          } catch (blindError) {
            if (cancelled) return;
            const text = tillErrorOf(blindError, "The session could not be read.").text;
            setLoadError(text);
            toast.error(text);
          }
        } else if (!cancelled) {
          setLoadError(refusal.text);
          toast.error(refusal.text);
        }
      }
      if (cancelled) return;
      setNow(new Date());
      setGridsLoading(true);
      try {
        const params = { itss_id: key.tssId };
        const [bills, money, counts, events] = await Promise.all([
          client.gridRows("tillSessionBills", params),
          client.gridRows("tillSessionMoneyDocs", params),
          client.gridRows("tillSessionCounts", params),
          client.gridRows("tillSessionEvents", params),
        ]);
        if (cancelled) return;
        setGrids({
          bills: sortRowsBy(bills, "tb_time"),
          money: sortRowsBy(money, "md_time"),
          counts: sortRowsBy(counts, "tct_counted_on"),
          events: sortRowsBy(events, "tev_event_on"),
        });
        setGridsError("");
      } catch (error) {
        if (!cancelled) setGridsError(tillErrorOf(error, "The session's documents could not be read.").text);
      } finally {
        if (!cancelled) setGridsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, key, tick]);

  useEffect(() => {
    let cancelled = false;
    // Every reason, inactive and replaced ones too: a past event still names the reason it used.
    client
      .gridRows("tillReasonList", reasonGridParams(key.companyId, true))
      .then((rows) => {
        if (!cancelled) setReasons(toReasons(rows));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, key.companyId]);

  const tiles = cockpitTiles(session, grids);
  // Open on the first tab with something in it (a session with no bills opens
  // on its money documents, as the mockup does).
  useEffect(() => {
    if (tabChosen.current || !tiles.firstTab) return;
    tabChosen.current = true;
    setTab(tiles.firstTab);
  }, [tiles.firstTab]);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(TILL_SESSIONS_HREF);
  }, [router]);

  const keys = useRef({ load, close });
  useEffect(() => {
    keys.current = { load, close };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F5") {
        event.preventDefault();
        keys.current.load();
      } else if (event.key === "Escape") {
        event.preventDefault();
        keys.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const header = session ? cockpitHeader(session) : null;
  const facts = session ? cockpitFacts(session, now) : null;
  const reconciliation = session ? tenderRows(session, reasonNames, expectedShown) : null;
  const band = session ? approvalBand(session) : null;
  const buttons = cockpitButtons(session);
  const approve = approveButton(session, me);
  const exceptions = exceptionButtons(session, me);
  const mine = isMine(session, me);
  const pickedBill = retenderableBill(pickedBillId ? grids.bills.find((row) => textOf(row, "tb_id") === pickedBillId) : null);
  const retenderState = retenderButton(pickedBill);
  const sessionNo = session?.tssSessionNo ?? "";

  // Approve (Qt `decideVariance`, c77f3f1): the closed session's cash, a
  // received bag's difference, or the session's pending gap.
  const onApprove = () => {
    if (!session) return;
    if (approve.action === "approveCash") setApproveCash({ key, session });
    else if (approve.action === "bag") setDecide(bagDecideRequestOf(session, key));
    else setDecide(decideRequestOf(session, key));
  };

  const decided = (decision: TillVarianceDecision) => {
    const bag = Boolean(decide?.bag);
    setDecide(null);
    load();
    toast.info(bag ? BAG_DECIDED_MESSAGE : decidedMessage(decision));
  };

  // X read (notes 117 §6): the server journals it and answers the figures.
  const takeXRead = async () => {
    if (!session || xReading) return;
    setXReading(true);
    try {
      const report = await client.xReport(key);
      setXRead({ report, target: sessionPrintTarget(key, sessionNo, "x"), label: xReadLabel(sessionNo) });
    } catch (error) {
      toast.error(tillErrorOf(error, "The X read could not be taken.").text);
    } finally {
      setXReading(false);
    }
  };

  /** "…\n\n…" as Qt's info box shows it: the paragraph break kept. */
  const info = (text: string) => toast.info(<span className={local.preLine}>{text}</span>);

  const docGrid =
    tab === "bills"
      ? { grid: "tillSessionBills" as const, rows: grids.bills, columns: FALLBACK_COLUMNS.bills, id: "tb_id", empty: "No bill or return in this session." }
      : tab === "money"
        ? { grid: "tillSessionMoneyDocs" as const, rows: grids.money, columns: FALLBACK_COLUMNS.money, id: "md_id", empty: "No money document in this session." }
        : { grid: "tillSessionCounts" as const, rows: grids.counts, columns: FALLBACK_COLUMNS.counts, id: "tct_id", empty: "No count yet." };

  const tile = (caption: string, value: string | number, warn = false) => (
    <div className={styles.tile}>
      <span className={styles.cap}>{caption}</span>
      <span className={cx(styles.figure, warn && styles.toneAmber)}>{value}</span>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>{header?.title ?? "Till Session"}</h1>
          <p className={styles.subtitle}>{header?.sub ?? (loadError || "Reading the session…")}</p>
        </div>
        {header ? <TonePill tone={header.pillTone}>{header.pill}</TonePill> : null}
      </div>

      <div className={styles.scroll}>
        {facts ? (
          <div className={styles.facts}>
            {(
              [
                ["Opened", facts.opened],
                ["Billing ended", facts.ended],
                ["Duration", facts.duration],
                ["Float", facts.float],
                ["Count", facts.count],
                ["Witness", facts.witness],
                ["Z no", facts.z],
                ["Reopened", facts.reopened],
              ] as const
            ).map(([caption, value]) => (
              <div key={caption} className={styles.fact}>
                <span className={styles.cap}>{caption}</span>
                <span className={styles.val} title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.tiles}>
          {tile("BILLS", tiles.bills)}
          {tile("RETURNS", tiles.returns)}
          {tile("RECEIPTS", tiles.receipts)}
          {tile("NO-SALES", tiles.noSales, tiles.noSales > 0)}
          {tile("PICKUPS", tiles.pickups)}
          {tile("EXPENSES", tiles.expenses)}
          {tile("RE-TENDERS", tiles.retenders)}
          {tile("RECOUNTS", tiles.recounts, tiles.recounts > 0)}
          {tile("NET SALES", tiles.netSales)}
          {tile("VOIDS", tiles.voids)}
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionCap}>TENDER RECONCILIATION</span>
          <span className={styles.code}>{REC_HINT}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Tender</th>
                <th scope="col">Mode</th>
                {TENDER_FIGURES.map(([field, caption]) => (
                  <th key={field} scope="col" className={styles.right}>
                    {caption}
                  </th>
                ))}
                <th scope="col">Reason</th>
                <th scope="col">Treatment</th>
              </tr>
            </thead>
            <tbody>
              {(reconciliation?.rows ?? []).map((row) => (
                <tr key={row.key}>
                  <td>{row.tender}</td>
                  <td>{row.mode}</td>
                  {row.cells.map((cell, index) => (
                    <td
                      key={index}
                      className={cx(
                        styles.right,
                        cell.tone === "red" && styles.toneRed,
                        cell.tone === "green" && styles.toneGreen,
                        cell.tone === "amber" && styles.toneAmber,
                        cell.tone === "muted" && styles.toneMuted,
                      )}
                    >
                      {cell.text}
                    </td>
                  ))}
                  <td>{row.reason}</td>
                  <td>{row.treatment}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td>Total counted tenders</td>
                <td />
                {TENDER_FIGURES.map(([field]) => (
                  <td key={field} className={styles.right}>
                    {field === "variance" ? (reconciliation?.totalVariance.text ?? "") : ""}
                  </td>
                ))}
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{REC_NOTE}</p>

        <div className={styles.docsRow}>
          <div className={styles.docsPane}>
            <div className={styles.tabs} role="tablist">
              {(
                [
                  ["bills", tiles.billsTab],
                  ["money", tiles.moneyTab],
                  ["counts", tiles.countsTab],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={cx(styles.tab, tab === value && styles.tabActive)}
                  onClick={() => {
                    tabChosen.current = true;
                    setTab(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.paneBody}>
              <GridTable
                grid={docGrid.grid}
                rows={docGrid.rows}
                fallbackColumns={docGrid.columns}
                idField={docGrid.id}
                loading={gridsLoading}
                error={gridsError}
                emptyText={docGrid.empty}
                cell={(row, field) => gridCellText(row, field)}
                // The Bills tab picks the bill Re-tender acts on.
                {...(tab === "bills"
                  ? {
                      selectedId: pickedBillId,
                      onSelect: (row: GridRow) => setPickedBillId(textOf(row, "tb_id") || null),
                      label: "Bills and returns — pick a posted bill to re-tender it",
                    }
                  : {})}
              />
            </div>
          </div>
          <div className={styles.docsPane}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionCap}>TIMELINE</span>
              <span className={styles.code}>till_event · Ctrl+H</span>
            </div>
            <div className={styles.paneBody}>
              <GridTable
                grid="tillSessionEvents"
                rows={grids.events}
                fallbackColumns={FALLBACK_COLUMNS.events}
                idField="tev_id"
                loading={gridsLoading}
                error={gridsError}
                emptyText="No event yet."
                cell={(row, field) => <EventCell row={row} field={field} />}
              />
            </div>
          </div>
        </div>

        {band ? (
          <div className={styles.band}>
            <div className={styles.bandRow}>
              <TonePill tone="amber">APPROVAL</TonePill>
              <span className={styles.code}>{band.code}</span>
              <span className={styles.spacer}>{band.text}</span>
              <span className={styles.figure}>{band.amount}</span>
            </div>
            <p className={styles.muted}>{band.note}</p>
          </div>
        ) : null}
      </div>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.primaryButton} disabled={!approve.enabled} title={approve.tip} onClick={onApprove}>
          {approve.label}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!buttons.count}
          title="Count the drawer of a session whose billing has ended, then close it (End Shift)"
          onClick={() => setCountOpen(true)}
        >
          Count / close
        </button>
        {/* No Cash movement here (Qt a449b8c, notes 110): a pickup / top-up is
            signed at the counter by the cashier and the supervisor together. */}
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!buttons.slipCheck}
          title="Tick a card terminal's rows against its paper slips — once billing has ended, when the machine total disagrees"
          onClick={() => setSlipOpen(true)}
        >
          Slip check…
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!retenderState.enabled}
          title={retenderState.tip}
          onClick={() => {
            if (pickedBill) {
              setRetender(retenderTargetOf(pickedBill, key));
            }
          }}
        >
          Re-tender
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={!exceptions.forceClose.enabled}
          title={exceptions.forceClose.tip}
          onClick={() => {
            if (session) setForceClose({ key, session });
          }}
        >
          Force close…
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!exceptions.reopen.enabled}
          title={exceptions.reopen.tip}
          onClick={() => {
            if (session) setReopen({ key, session });
          }}
        >
          Reopen
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!exceptions.printZ.enabled}
          title={exceptions.printZ.tip}
          onClick={() => setPrintZOpen(true)}
        >
          Print Z
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!exceptions.xRead.enabled || xReading}
          title={exceptions.xRead.tip}
          onClick={() => void takeXRead()}
        >
          X read
        </button>
        <span className={styles.spacer} />
        <button type="button" className={styles.secondaryButton} onClick={load}>
          F5  Refresh
        </button>
        <button type="button" className={styles.secondaryButton} onClick={close}>
          Close
        </button>
      </div>
      <p className={styles.muted}>{session ? footNote(expectedShown, mine) : ""}</p>

      <EndShiftDialog
        sessionKey={countOpen ? key : null}
        onClose={() => {
          setCountOpen(false);
          load();
        }}
      />
      <VarianceDecideDialog request={decide} reasons={reasons} onClose={() => setDecide(null)} onDecided={decided} />
      <ApproveCashDialog
        request={approveCash}
        reasons={reasons}
        onClose={() => setApproveCash(null)}
        onApproved={(result) => {
          setApproveCash(null);
          load();
          toast.info(approveCashOutcome(result));
        }}
      />
      <ForceCloseDialog
        request={forceClose}
        reasons={reasons}
        onClose={() => setForceClose(null)}
        onForceClosed={(result) => {
          setForceClose(null);
          load();
          info(forceCloseMessage(result));
        }}
      />
      <ReopenDialog
        request={reopen}
        reasons={reasons}
        onClose={() => setReopen(null)}
        onReopened={(result) => {
          setReopen(null);
          load();
          info(reopenMessage(result));
        }}
      />
      <XReadDialog
        request={xRead}
        onClose={() => {
          setXRead(null);
          load();
        }}
      />
      {printZOpen && session ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintZOpen(false)}
          purposeCode={PURPOSE_CODE.TILL_SESSION_Z}
          documentLabel={printZLabel(sessionNo)}
          targets={[sessionPrintTarget(key, sessionNo, "z")]}
        />
      ) : null}
      <CockpitRetender
        target={retender}
        onClose={() => setRetender(null)}
        onRetendered={() => {
          setRetender(null);
          load();
        }}
      />
      <SlipCheckDialog
        sessionKey={slipOpen ? key : null}
        tenders={slipTenders(session)}
        onClose={() => {
          setSlipOpen(false);
          load();
        }}
      />
    </div>
  );
}
