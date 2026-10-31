"use client";

/**
 * Loyalty Status — Sales › Loyalty › Loyalty Status (menu 79). Qt
 * `LoyaltyStatusEntry` (sales/report/loyalty_status/loyalty_status_entry.*).
 *
 * A report over the customer loyalty wallets, three tabs, on the routes of
 * `/reports/loyalty-status/*`:
 *
 *   Members         who holds what — …/members (+ its summary tiles). The
 *                   current member fills the bottom: …/statement on the left —
 *                   each earning row also showing what is LEFT of its lot
 *                   (…/member lots[]) — and the member card on the right.
 *   Expiring soon   open lots lapsing in N days — …/expiring + …/calendar.
 *   Scheme summary  per scheme — …/schemes; the current scheme fills the
 *                   month-wise chart (…/monthly) and its gifts (…/gifts).
 *
 * Filters live in an F8 popup per tab; the tab shows them as one summary line
 * beside Filter F8 / Show F5. Every figure is the server's: tiles and Total
 * rows come from each route's `summary`, over the whole filtered set.
 *
 * Two actions write (menu 79's edit right): Suspend… and Adjust points…, with
 * the signed-in user as the approver. Print / PDF / Excel take …/export (data
 * only) and render it here, with the server's `printedAs` line as the header.
 *
 * Not here, as in Qt: SMS (decided later), the drill from a statement line
 * into its source bill.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { writeXlsx, XLSX_MIME } from "@/features/reports/shared/export/xlsx-writer";
import { sendToPrinter } from "@/features/printing/print-delivery";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { todayIsoDate } from "@/lib/date-format";
import { toast } from "@/lib/notify";
import { keySheetRows } from "@/lib/txn-keys";
import {
  useAdjustLoyaltyMemberPointsMutation,
  useGetLoyaltyCalendarMutation,
  useGetLoyaltyExpiringMutation,
  useGetLoyaltyExportMutation,
  useGetLoyaltyGiftsMutation,
  useGetLoyaltyMemberHistoryMutation,
  useGetLoyaltyMemberMutation,
  useGetLoyaltyMembersMutation,
  useGetLoyaltyMonthlyMutation,
  useGetLoyaltySchemesMutation,
  useGetLoyaltyStatementMutation,
  useSetLoyaltyMemberStatusMutation,
} from "./api/loyalty-status-api";
import { AdjustPointsDialog, MemberHistoryDialog, MemberStatusDialog } from "./components/action-dialogs";
import { BarChart } from "./components/bar-chart";
import { DateBox, FilterDialogs, type FilterDialogState } from "./components/filter-dialogs";
import { MemberCardPanel } from "./components/member-card";
import { ReportGrid } from "./components/report-grid";
import { Tiles } from "./components/tiles";
import styles from "./page.module.scss";
import {
  calendarQuery,
  defaultFilters,
  defaultStatement,
  expiringQuery,
  exportQuery,
  filterSummary,
  keepScheme,
  memberQuery,
  membersQuery,
  schemeChoicesOf,
  schemeChoicesQuery,
  schemeDetailQuery,
  schemesQuery,
  statementQuery,
  subtitleOf,
  TABS,
  type AllFilters,
  type ExpiringFilters,
  type MembersFilters,
  type SchemeChoice,
  type SchemesFilters,
  type StatementFilters,
  type Tab,
} from "./query/params";
import { useOneShot, usePagedList } from "./query/use-loaders";
import { adjustBody, statusBody } from "./view/actions";
import { NO_ACCESS_MESSAGE, isNoAccessError } from "./view/errors";
import {
  calendarBars,
  EXPIRING_COLUMNS,
  expiringCells,
  expiringNote,
  expiringTiles,
  expiringTotals,
  rowsOfWeek,
} from "./view/expiring";
import { exportFileName, exportHtml, exportSheet } from "./view/export";
import { num, txt } from "./view/format";
import { memberCells, memberColumns, membersNote, memberTiles, memberToKeep, memberTotals } from "./view/members";
import {
  GIFT_COLUMNS,
  giftCells,
  giftsNote,
  MONTHLY_SERIES,
  monthlyBars,
  monthlyTotals,
  SCHEME_COLUMNS,
  schemeCells,
  schemeRowName,
  schemesNote,
  schemeTotals,
} from "./view/schemes";
import {
  cardView,
  emptyCard,
  STATEMENT_COLUMNS,
  statementLines,
  statementNote,
  statementTitle,
  statementTotals,
  type StatementLine,
} from "./view/statement";
import {
  LOYALTY_STATUS_HREF,
  type ExpiringItem,
  type ExportFormat,
  type GiftItem,
  type HistoryStep,
  type MemberItem,
  type SchemeItem,
} from "./wire/types";

const HINTS =
  "F5 show  ·  F8 filters  ·  Enter drill down  ·  Ctrl+J adjust  ·  Ctrl+H history  ·  Ctrl+P print  ·  F1 keys";

const KEY_SHEET = keySheetRows(
  ["print", "find", "history", "close"],
  [
    { label: "Show — load the tab again", keyText: "F5" },
    { label: "Filters of this tab", keyText: "F8" },
    { label: "Adjust points (Members)", keyText: "Ctrl+J" },
    { label: "Drill down (expiring row, gift)", keyText: "Enter" },
    { label: "Next / previous tab (tab strip focused)", keyText: "← →" },
  ],
);

const LOADING = "Loading…";

const memberKey = (row: MemberItem) => row.memberId;
const expiringKey = (row: ExpiringItem, i: number) => `${row.memberId}|${row.expiresOn}|${i}`;
const schemeKey = (row: SchemeItem, i: number) => `${row.lscId}|${row.branchId ?? ""}|${row.month ?? ""}|${i}`;
const giftKey = (row: GiftItem, i: number) => `${row.lsgId}|${i}`;
const lineKey = (row: StatementLine) => row.key;
const lineCells = (row: StatementLine) => row.cells;

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Selection = { id: string | null; nonce: number };
type ActionDialog =
  | { kind: "status" }
  | { kind: "adjust" }
  | { kind: "history"; name: string; steps: HistoryStep[] }
  | null;

export default function LoyaltyStatusScreen() {
  const router = useRouter();
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const companyName = activeCompany?.name ?? "";
  const permissions = usePagePermissions({ href: LOYALTY_STATUS_HREF });
  const { canPrint, canExport, canEdit } = permissions.permissions;

  const [today] = useState(() => todayIsoDate());
  const [tab, setTab] = useState<Tab>("members");
  const [filters, setFilters] = useState<AllFilters>(() => defaultFilters(today));
  const [statementFilters, setStatementFilters] = useState<StatementFilters>(() => defaultStatement(today));
  const [choices, setChoices] = useState<SchemeChoice[]>([{ value: "", label: "All schemes" }]);
  const [denied, setDenied] = useState(false);
  const loaded = useRef<Record<Tab, boolean>>({ members: false, expiring: false, schemes: false });
  const latest = useRef({ filters, companyId, tab });
  useEffect(() => {
    latest.current = { filters, companyId, tab };
  });

  /** Qt `showError`: no-access becomes the screen's state; the rest a message in plain words. */
  const onError = useCallback((error: unknown) => {
    if (isNoAccessError(error)) {
      setDenied(true);
      return;
    }
    toast.apiError(error, { fallback: "Loyalty Status could not be read." });
  }, []);

  /* ---- the routes */
  const [getMembers] = useGetLoyaltyMembersMutation();
  const [getMember] = useGetLoyaltyMemberMutation();
  const [getStatement] = useGetLoyaltyStatementMutation();
  const [getExpiring] = useGetLoyaltyExpiringMutation();
  const [getCalendar] = useGetLoyaltyCalendarMutation();
  const [getSchemes] = useGetLoyaltySchemesMutation();
  const [getSchemeChoices] = useGetLoyaltySchemesMutation();
  const [getMonthly] = useGetLoyaltyMonthlyMutation();
  const [getGifts] = useGetLoyaltyGiftsMutation();
  const [getExport] = useGetLoyaltyExportMutation();
  const [getHistory] = useGetLoyaltyMemberHistoryMutation();
  const [postStatus] = useSetLoyaltyMemberStatusMutation();
  const [postAdjust] = useAdjustLoyaltyMemberPointsMutation();

  const members = usePagedList(getMembers, onError);
  const member = useOneShot(getMember, onError);
  const statement = useOneShot(getStatement, onError);
  const expiring = usePagedList(getExpiring, onError);
  const calendar = useOneShot(getCalendar, onError);
  const schemes = useOneShot(getSchemes, onError);
  const monthly = useOneShot(getMonthly, onError);
  const gifts = useOneShot(getGifts, onError);
  const membersLoad = members.load;
  const expiringLoad = expiring.load;
  const calendarLoad = calendar.load;
  const schemesLoad = schemes.load;

  /* ---- loads (Qt loadMembers / loadExpiring / loadSchemes) */
  const loadMembers = useCallback(
    (f: MembersFilters) => {
      const company = latest.current.companyId;
      if (!company) return;
      loaded.current.members = true;
      membersLoad(membersQuery(company, f));
    },
    [membersLoad],
  );
  const loadExpiring = useCallback(
    (f: ExpiringFilters) => {
      const company = latest.current.companyId;
      if (!company) return;
      loaded.current.expiring = true;
      expiringLoad(expiringQuery(company, f));
      calendarLoad(calendarQuery(company, f));
    },
    [calendarLoad, expiringLoad],
  );
  const loadSchemes = useCallback(
    (f: SchemesFilters) => {
      const company = latest.current.companyId;
      if (!company) return;
      loaded.current.schemes = true;
      schemesLoad(schemesQuery(company, f));
    },
    [schemesLoad],
  );
  const loadTab = useCallback(
    (which: Tab, all: AllFilters) => {
      if (which === "expiring") loadExpiring(all.expiring);
      else if (which === "schemes") loadSchemes(all.schemes);
      else loadMembers(all.members);
    },
    [loadExpiring, loadMembers, loadSchemes],
  );
  const loadCurrentTab = useCallback(() => {
    loadTab(latest.current.tab, latest.current.filters);
  }, [loadTab]);

  /* ---- the first load and the scheme pickers, per company */
  useEffect(() => {
    if (!companyId) return;
    loaded.current = { members: false, expiring: false, schemes: false };
    loadTab(latest.current.tab, latest.current.filters);
    const request = getSchemeChoices(schemeChoicesQuery(companyId, today));
    let live = true;
    request
      .unwrap()
      .then((data) => {
        if (!live) return;
        const next = schemeChoicesOf(data?.items ?? []);
        setChoices(next);
        // A picked scheme that has gone from the list falls back to "All" (Qt findData → 0).
        setFilters((f) => ({
          members: { ...f.members, lscId: keepScheme(f.members.lscId, next) },
          expiring: { ...f.expiring, lscId: keepScheme(f.expiring.lscId, next) },
          schemes: { ...f.schemes, lscId: keepScheme(f.schemes.lscId, next) },
        }));
      })
      .catch((error: unknown) => {
        if (live) onError(error);
      });
    return () => {
      live = false;
      request.abort();
    };
  }, [companyId, getSchemeChoices, loadTab, onError, today]);

  /* ---- tabs: each loads the first time it is shown, then on F5 */
  const switchTab = useCallback(
    (next: Tab) => {
      setTab(next);
      latest.current = { ...latest.current, tab: next };
      if (!loaded.current[next]) loadTab(next, latest.current.filters);
    },
    [loadTab],
  );
  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    switchTab(next);
    window.setTimeout(() => document.getElementById(`ls-tab-${next}`)?.focus(), 0);
  };

  /* ================================================================ Members */

  const [memberSel, setMemberSel] = useState<Selection>({ id: null, nonce: 0 });
  // A load keeps the member under the cursor if it is still listed, else the
  // first row — and the card reloads: its figures may have moved.
  const [seenMembers, setSeenMembers] = useState(members.state.version);
  if (seenMembers !== members.state.version) {
    setSeenMembers(members.state.version);
    const keep = memberToKeep(members.state.items, memberSel.id);
    setMemberSel((s) => ({ id: keep, nonce: s.nonce + 1 }));
  }
  const currentMember = useMemo(
    () => (memberSel.id ? (members.state.items.find((m) => m.memberId === memberSel.id) ?? null) : null),
    [memberSel.id, members.state.items],
  );

  const memberLoad = member.load;
  const memberClear = member.clear;
  useEffect(() => {
    if (!companyId || !memberSel.id) {
      memberClear();
      return;
    }
    memberLoad(memberQuery(companyId, memberSel.id));
  }, [companyId, memberClear, memberLoad, memberSel.id, memberSel.nonce]);

  const statementLoad = statement.load;
  const statementClear = statement.clear;
  useEffect(() => {
    if (!companyId || !memberSel.id) {
      statementClear();
      return;
    }
    statementLoad(statementQuery(companyId, memberSel.id, statementFilters));
  }, [companyId, memberSel.id, memberSel.nonce, statementClear, statementFilters, statementLoad]);

  const memberData = member.state.data;
  const statementData = statement.state.data;
  // The card and the Left column speak for the member on the cursor only.
  const shownMember = memberData && memberData.card?.memberId === memberSel.id ? memberData : null;
  const shownStatement = statementData && statementData.memberId === memberSel.id ? statementData : null;
  const lines = useMemo(
    () => statementLines(shownStatement, statementFilters, shownMember),
    [shownMember, shownStatement, statementFilters],
  );

  const membersEmpty = members.state.loaded && members.state.items.length === 0;
  const card = shownMember
    ? cardView(shownMember)
    : emptyCard(membersEmpty ? "No member to show." : "Pick a member to see the points statement.");

  /* ============================================================== Expiring */

  const [weekPick, setWeekPick] = useState<number>(-1);
  const [seenExpiring, setSeenExpiring] = useState(expiring.state.version);
  if (seenExpiring !== expiring.state.version) {
    setSeenExpiring(expiring.state.version);
    setWeekPick(-1);
  }
  const weeks = useMemo(() => calendar.state.data?.weeks ?? [], [calendar.state.data]);
  const weekStart = weekPick >= 0 && weekPick < weeks.length ? txt(weeks[weekPick].weekStart) : null;
  const expiringRows = useMemo(() => rowsOfWeek(expiring.state.items, weekStart), [expiring.state.items, weekStart]);
  const [expiringSel, setExpiringSel] = useState<string | null>(null);
  const [lineSel, setLineSel] = useState<string | null>(null);
  const [giftSel, setGiftSel] = useState<string | null>(null);

  const openExpiringMember = useCallback(
    (row: ExpiringItem) => {
      // Enter on an expiring row → that member on the Members tab (Find = the
      // name, as Qt). The cursor is put on the row's own member BY ID before
      // the list loads, so the load keeps it (`memberToKeep`) — a name match
      // alone would land on whichever "…Customer" sorts first.
      const next: AllFilters = {
        ...latest.current.filters,
        members: { ...latest.current.filters.members, find: txt(row.customerName) },
      };
      setFilters(next);
      latest.current = { ...latest.current, filters: next, tab: "members" };
      setMemberSel((s) => (s.id === row.memberId ? s : { id: row.memberId, nonce: s.nonce }));
      setTab("members");
      loadMembers(next.members);
    },
    [loadMembers],
  );

  /* =============================================================== Schemes */

  const schemeItems = useMemo(() => schemes.state.data?.items ?? [], [schemes.state.data]);
  const [schemeRow, setSchemeRow] = useState<string | null>(null);
  const [shownScheme, setShownScheme] = useState<{ lscId: string; name: string; nonce: number } | null>(null);
  const [seenSchemes, setSeenSchemes] = useState(schemes.state.version);
  if (seenSchemes !== schemes.state.version) {
    setSeenSchemes(schemes.state.version);
    const first = schemeItems[0];
    if (first) {
      setSchemeRow(schemeKey(first, 0));
      setShownScheme((s) => ({
        lscId: first.lscId,
        name: schemeRowName(first, filters.schemes.splitBy),
        nonce: (s?.nonce ?? 0) + 1,
      }));
    } else {
      setSchemeRow(null);
      setShownScheme(null);
    }
  }
  const pickScheme = useCallback(
    (row: SchemeItem, index: number) => {
      setSchemeRow(schemeKey(row, index));
      // Rows of one scheme (a branch / month split) share its chart and gifts.
      setShownScheme((s) =>
        s && s.lscId === row.lscId
          ? s
          : { lscId: row.lscId, name: schemeRowName(row, latest.current.filters.schemes.splitBy), nonce: (s?.nonce ?? 0) + 1 },
      );
    },
    [],
  );

  const monthlyLoad = monthly.load;
  const monthlyClear = monthly.clear;
  const giftsLoad = gifts.load;
  const giftsClear = gifts.clear;
  const shownLscId = shownScheme?.lscId ?? null;
  const shownNonce = shownScheme?.nonce ?? 0;
  useEffect(() => {
    if (!companyId || !shownLscId) {
      monthlyClear();
      giftsClear();
      return;
    }
    const q = schemeDetailQuery(companyId, latest.current.filters.schemes, shownLscId);
    monthlyLoad(q);
    giftsLoad(q);
  }, [companyId, giftsClear, giftsLoad, monthlyClear, monthlyLoad, shownLscId, shownNonce]);

  const openGiftMembers = useCallback(() => {
    // Enter on a gift → the Members tab, that scheme, eligible only.
    if (!shownScheme) return;
    const current = latest.current.filters;
    const lscId = choices.some((c) => c.value === shownScheme.lscId) ? shownScheme.lscId : current.members.lscId;
    const next: AllFilters = { ...current, members: { ...current.members, lscId, eligibleOnly: true } };
    setFilters(next);
    latest.current = { ...latest.current, filters: next, tab: "members" };
    setTab("members");
    loadMembers(next.members);
  }, [choices, loadMembers, shownScheme]);

  /* =============================================================== Filters */

  const [filterOpen, setFilterOpen] = useState<FilterDialogState>(null);
  const openFilters = useCallback((focusFind = false) => {
    setFilterOpen({ tab: latest.current.tab, focusFind: focusFind && latest.current.tab !== "schemes" });
  }, []);
  const applyFilters = useCallback(
    <K extends Tab>(which: K, next: AllFilters[K]) => {
      const all = { ...latest.current.filters, [which]: next } as AllFilters;
      setFilters(all);
      latest.current = { ...latest.current, filters: all };
      setFilterOpen(null);
      loadTab(which, all);
    },
    [loadTab],
  );

  /* =============================================================== Actions */

  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [posting, setPosting] = useState(false);
  const haveMember = Boolean(shownMember && memberSel.id);
  const memberStatus = txt(shownMember?.card?.status);
  const canSuspend = haveMember && canEdit;
  const canAdjust = haveMember && canEdit && memberStatus === "ACTIVE";

  const openStatus = useCallback(() => {
    if (canSuspend) setDialog({ kind: "status" });
  }, [canSuspend]);
  const openAdjust = useCallback(() => {
    if (canAdjust && latest.current.tab === "members") setDialog({ kind: "adjust" });
  }, [canAdjust]);
  const closeDialog = useCallback(() => setDialog(null), []);

  const applyStatus = useCallback(
    async (input: { status: "ACTIVE" | "SUSPENDED" | "CLOSED"; reason: string; force: boolean }) => {
      if (!memberSel.id || posting) return;
      setPosting(true);
      try {
        await postStatus(
          statusBody({
            companyId,
            memberId: memberSel.id,
            status: input.status,
            reason: input.reason,
            force: input.force,
            userId: getAuthUserId() ?? "",
          }),
        ).unwrap();
        setDialog(null);
        loadMembers(latest.current.filters.members);
      } catch (error) {
        toast.apiError(error, { fallback: "The member's status could not be changed." });
      } finally {
        setPosting(false);
      }
    },
    [companyId, loadMembers, memberSel.id, postStatus, posting],
  );

  const memberBranchId = shownMember?.card?.branchId ?? null;
  const sessionBranchId = activeBranch?.id ?? null;
  const applyAdjust = useCallback(
    async (input: { points: number; reason: string }) => {
      if (!memberSel.id || posting) return;
      setPosting(true);
      try {
        await postAdjust(
          adjustBody({
            companyId,
            sessionBranchId,
            memberBranchId,
            memberId: memberSel.id,
            points: input.points,
            reason: input.reason,
            userId: getAuthUserId() ?? "",
          }),
        ).unwrap();
        setDialog(null);
        loadMembers(latest.current.filters.members);
      } catch (error) {
        toast.apiError(error, { fallback: "The points could not be adjusted." });
      } finally {
        setPosting(false);
      }
    },
    [companyId, loadMembers, memberBranchId, memberSel.id, postAdjust, posting, sessionBranchId],
  );

  // Ctrl+H — the member's status trail.
  const showHistory = useCallback(() => {
    const id = memberSel.id;
    if (!id || !companyId) return;
    const name = txt(currentMember?.customerName);
    getHistory({ companyId, memberId: id })
      .unwrap()
      .then((data) => setDialog({ kind: "history", name, steps: data?.steps ?? [] }))
      .catch((error: unknown) => toast.apiError(error, { fallback: "The member's history could not be read." }));
  }, [companyId, currentMember?.customerName, getHistory, memberSel.id]);

  /* ======================================================= Print / PDF / Excel */

  const [exporting, setExporting] = useState(false);
  const fetchExport = useCallback(
    async (format: ExportFormat) => {
      const { tab: which, filters: all, companyId: company } = latest.current;
      const data = await getExport(exportQuery(which, company, all, format)).unwrap();
      return { which, label: TABS.find((t) => t.id === which)?.label ?? "", data };
    },
    [getExport],
  );
  const printTab = useCallback(
    async (asPdf: boolean) => {
      if (!canPrint) {
        toast.warning("You do not have print rights on Loyalty Status.", { title: asPdf ? "PDF" : "Print" });
        return;
      }
      if (exporting || !latest.current.companyId) return;
      setExporting(true);
      try {
        const { which, label, data } = await fetchExport("pdf");
        const html = exportHtml({ tabLabel: label, printedAs: txt(data?.printedAs), tab: which, rows: data?.rows ?? [] });
        // A hidden frame prints the rows alone — never window.print() of the live page.
        // PDF: the same page, saved through the print dialog's "Save as PDF".
        sendToPrinter(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })));
      } catch (error) {
        toast.apiError(error, { fallback: "The tab could not be printed." });
      } finally {
        setExporting(false);
      }
    },
    [canPrint, exporting, fetchExport],
  );
  const saveExcel = useCallback(async () => {
    if (!canExport || exporting || !latest.current.companyId) return;
    setExporting(true);
    try {
      const { which, label, data } = await fetchExport("xlsx");
      const rows = data?.rows ?? [];
      const fileName = exportFileName(which, "xlsx");
      download(writeXlsx([exportSheet({ tabLabel: label, printedAs: txt(data?.printedAs), tab: which, rows })]), fileName);
      toast.success(`${rows.length} row(s) saved to ${fileName}`, { title: "Saved" });
    } catch (error) {
      toast.apiError(error, { fallback: "The tab could not be exported." });
    } finally {
      setExporting(false);
    }
  }, [canExport, exporting, fetchExport]);

  /* ================================================================== Keys */

  const closeScreen = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/home");
  }, [router]);
  const [keysOpen, setKeysOpen] = useState(false);

  useTxnKeys(
    {
      // Always bound, so Ctrl+P never falls through to the browser printing the screen.
      print: () => void printTab(false),
      find: () => openFilters(true),
      history: showHistory,
      close: closeScreen,
    },
    { onHelp: () => setKeysOpen(true) },
  );
  const keys = useRef({ loadCurrentTab, openFilters, openAdjust });
  useEffect(() => {
    keys.current = { loadCurrentTab, openFilters, openAdjust };
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      const k = keys.current;
      const plainKey = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      if (event.key === "F5" && plainKey) {
        // Never the browser's reload.
        event.preventDefault();
        if (!event.repeat) k.loadCurrentTab();
      } else if (event.key === "F8" && plainKey) {
        event.preventDefault();
        if (!event.repeat) k.openFilters(false);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "j" || event.code === "KeyJ")
      ) {
        // Never the browser's downloads page.
        event.preventDefault();
        if (!event.repeat) k.openAdjust();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ================================================================ Render */

  if (permissions.isDenied || denied) {
    return <div className={styles.denied}>{NO_ACCESS_MESSAGE}</div>;
  }

  const subtitle = subtitleOf(tab, filters, companyName || "No company", today);
  const summaryLine = filterSummary(tab, filters, choices);

  const filterBar = (
    <div className={styles.filterBar} data-testid={`ls-filter-bar-${tab}`}>
      <span className={styles.filterCap}>Filters</span>
      <span className={styles.filterSummary} title={summaryLine}>
        {summaryLine}
      </span>
      <button
        type="button"
        className={styles.button}
        tabIndex={-1}
        title="F8 — change the filters of this tab"
        onClick={() => openFilters(false)}
      >
        Filter<span className={styles.key}>F8</span>
      </button>
      <button
        type="button"
        className={styles.primaryButton}
        tabIndex={-1}
        title="F5 — load again with the filters in force"
        onClick={loadCurrentTab}
      >
        Show<span className={styles.key}>F5</span>
      </button>
    </div>
  );

  const memberName = txt(currentMember?.customerName);
  const memberCard = txt(currentMember?.cardNo);

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Loyalty Status</h1>
          <p className={styles.subtitle} data-testid="ls-subtitle">
            {subtitle}
          </p>
        </div>
        <span className={styles.pill}>Statistical only — no GL until redeemed</span>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Views" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`ls-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className={cx(styles.tab, tab === t.id && styles.tabActive)}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!companyId ? (
        <div className={styles.emptyState}>Choose a company in the header first.</div>
      ) : tab === "members" ? (
        <div className={styles.tabBody} role="tabpanel" aria-label="Members">
          {filterBar}
          <Tiles tiles={memberTiles(members.state.summary, filters.members)} label="Member figures" />
          <div className={styles.splitMembers}>
            <section className={styles.section}>
              <div className={styles.heading}>MEMBERS</div>
              <ReportGrid
                columns={memberColumns(filters.members.earned)}
                rows={members.state.items}
                rowKey={memberKey}
                cellsOf={(row) => memberCells(row, today)}
                totals={memberTotals(members.state.items, members.state.summary, members.state.total)}
                selectedKey={memberSel.id}
                onSelect={(row) => setMemberSel((s) => (s.id === row.memberId ? s : { id: row.memberId, nonce: s.nonce }))}
                // The note under the grid says it (Qt lblMembersNote) — once.
                emptyText=""
                ariaLabel="Members"
                stale={members.state.loading && members.state.items.length > 0}
                testId="ls-members-grid"
              />
              <div className={styles.note}>
                {members.state.loading ? LOADING : members.state.loaded ? membersNote(members.state.items.length, filters.members) : ""}
              </div>
            </section>
            <div className={styles.bottomMembers}>
              <section className={styles.panel} aria-label="Points statement">
                <div className={styles.heading}>{memberSel.id ? statementTitle(memberName, memberCard) : "POINTS STATEMENT"}</div>
                <div className={styles.statementDates}>
                  <label htmlFor="ls-st-from">From</label>
                  <DateBox
                    id="ls-st-from"
                    label="Statement from"
                    value={statementFilters.from}
                    onCommit={(from) => setStatementFilters((s) => ({ ...s, from }))}
                  />
                  <label htmlFor="ls-st-to">To</label>
                  <DateBox
                    id="ls-st-to"
                    label="Statement to"
                    value={statementFilters.to}
                    onCommit={(to) => setStatementFilters((s) => ({ ...s, to }))}
                  />
                  <label className={styles.check} htmlFor="ls-st-reversals">
                    <input
                      id="ls-st-reversals"
                      type="checkbox"
                      checked={statementFilters.showReversals}
                      onChange={(e) => setStatementFilters((s) => ({ ...s, showReversals: e.target.checked }))}
                    />
                    Show reversals
                  </label>
                </div>
                <ReportGrid
                  columns={STATEMENT_COLUMNS}
                  rows={memberSel.id ? lines : []}
                  rowKey={lineKey}
                  cellsOf={lineCells}
                  selectedKey={lineSel}
                  onSelect={(row) => setLineSel(row.key)}
                  totals={shownStatement ? statementTotals(shownStatement, shownMember) : null}
                  emptyText={statement.state.loading ? LOADING : ""}
                  ariaLabel="Points statement"
                  stale={statement.state.loading && lines.length > 0}
                  testId="ls-statement-grid"
                />
                <div className={styles.note}>{statementNote(shownStatement)}</div>
              </section>
              <MemberCardPanel view={card} />
            </div>
          </div>
        </div>
      ) : tab === "expiring" ? (
        <div className={styles.tabBody} role="tabpanel" aria-label="Expiring soon">
          {filterBar}
          <Tiles tiles={expiringTiles(expiring.state.summary)} label="Expiring figures" />
          <div className={styles.splitExpiring}>
            <section className={styles.section}>
              <div className={styles.heading}>EXPIRING LOTS</div>
              <ReportGrid
                columns={EXPIRING_COLUMNS}
                rows={expiringRows}
                rowKey={expiringKey}
                cellsOf={expiringCells}
                totals={
                  expiring.state.loaded
                    ? expiringTotals(expiring.state.items.length, expiring.state.summary, expiring.state.total)
                    : null
                }
                selectedKey={expiringSel}
                onSelect={(row, i) => setExpiringSel(expiringKey(row, i))}
                onEnter={openExpiringMember}
                // The note under the grid says it (Qt lblExpNote) — once.
                emptyText=""
                ariaLabel="Expiring lots"
                stale={expiring.state.loading && expiring.state.items.length > 0}
                testId="ls-expiring-grid"
              />
              <div className={styles.note}>
                {expiring.state.loading ? LOADING : expiring.state.loaded ? expiringNote(expiring.state.items.length, weekStart) : ""}
              </div>
            </section>
            <section className={styles.panel} aria-label="Expiry calendar">
              <div className={styles.heading}>
                EXPIRY CALENDAR
                <span className={styles.headingHint}>next 90 days, by week  ·  click a bar to show that week</span>
              </div>
              <BarChart
                bars={calendarBars(weeks, today, filters.expiring.withinDays, weekPick)}
                showValues
                onBarClick={(i) => setWeekPick((w) => (w === i ? -1 : i))}
                ariaLabel="Points expiring per week"
              />
            </section>
          </div>
        </div>
      ) : (
        <div className={styles.tabBody} role="tabpanel" aria-label="Scheme summary">
          {filterBar}
          <div className={styles.splitSchemes}>
            <section className={styles.section}>
              <div className={styles.heading}>SCHEMES</div>
              <ReportGrid
                columns={SCHEME_COLUMNS}
                rows={schemeItems}
                rowKey={schemeKey}
                cellsOf={(row) => schemeCells(row, filters.schemes.splitBy)}
                totals={schemes.state.data ? schemeTotals(schemes.state.data.summary) : null}
                selectedKey={schemeRow}
                onSelect={pickScheme}
                // The note under the grid says it (Qt lblSchNote) — once.
                emptyText=""
                ariaLabel="Schemes"
                stale={schemes.state.loading && schemeItems.length > 0}
                testId="ls-schemes-grid"
              />
              <div className={styles.note}>
                {schemes.state.loading ? LOADING : schemes.state.data ? schemesNote(schemeItems.length) : ""}
              </div>
            </section>
            <div className={styles.bottomSchemes}>
              <section className={styles.panel} aria-label="Month-wise">
                <div className={styles.heading}>{shownScheme ? `MONTH-WISE — ${shownScheme.name}` : "MONTH-WISE"}</div>
                <BarChart
                  bars={shownScheme ? monthlyBars(monthly.state.data?.months ?? []) : []}
                  legend={MONTHLY_SERIES.map((s) => ({ name: s.name, tone: s.tone }))}
                  ariaLabel="Points by month"
                />
                <div className={styles.monthlyTotals}>
                  {shownScheme && monthly.state.data ? monthlyTotals(monthly.state.data.months ?? []) : ""}
                </div>
              </section>
              <section className={styles.panel} aria-label="Gifts">
                <div className={styles.heading}>{shownScheme ? `GIFTS — ${shownScheme.name}` : "GIFTS"}</div>
                <ReportGrid
                  columns={GIFT_COLUMNS}
                  rows={shownScheme ? (gifts.state.data?.gifts ?? []) : []}
                  rowKey={giftKey}
                  cellsOf={giftCells}
                  selectedKey={giftSel}
                  onSelect={(row, i) => setGiftSel(giftKey(row, i))}
                  onEnter={openGiftMembers}
                  emptyText={gifts.state.loading ? LOADING : ""}
                  ariaLabel="Gifts"
                  testId="ls-gifts-grid"
                />
                <div className={styles.note}>
                  {shownScheme && gifts.state.data ? giftsNote((gifts.state.data.gifts ?? []).length) : ""}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.footerHints}>{HINTS}</span>
        <div className={styles.footerActions}>
          <button type="button" className={styles.button} tabIndex={-1} onClick={closeScreen}>
            Close
          </button>
          {tab === "members" ? (
            <>
              <button
                type="button"
                className={styles.button}
                tabIndex={-1}
                disabled={!canSuspend}
                title="Suspend, reactivate or close the current member's wallet"
                onClick={openStatus}
              >
                Suspend…
              </button>
              <button
                type="button"
                className={styles.button}
                tabIndex={-1}
                disabled={!canAdjust}
                title="Ctrl+J — add or take off points on the current member, recorded with you as the approver"
                onClick={openAdjust}
              >
                Adjust points…
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.button}
            tabIndex={-1}
            disabled={!canExport || exporting}
            title={canExport ? "Save the current tab as an Excel workbook" : "You do not have export rights"}
            onClick={() => void saveExcel()}
          >
            Excel
          </button>
          <button
            type="button"
            className={styles.button}
            tabIndex={-1}
            disabled={!canPrint || exporting}
            title={canPrint ? "Save the current tab as a PDF (the print dialog's Save as PDF)" : "You do not have print rights"}
            onClick={() => void printTab(true)}
          >
            PDF
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            tabIndex={-1}
            disabled={!canPrint || exporting}
            title={canPrint ? "Print the current tab, with the applied filters in the header" : "You do not have print rights"}
            onClick={() => void printTab(false)}
          >
            Print<span className={styles.key}>Ctrl+P</span>
          </button>
        </div>
      </footer>

      <FilterDialogs
        open={filterOpen}
        companyId={companyId}
        choices={choices}
        today={today}
        members={filters.members}
        expiring={filters.expiring}
        schemes={filters.schemes}
        onApplyMembers={(f) => applyFilters("members", f)}
        onApplyExpiring={(f) => applyFilters("expiring", f)}
        onApplySchemes={(f) => applyFilters("schemes", f)}
        onCancel={() => setFilterOpen(null)}
      />
      {dialog?.kind === "status" && shownMember ? (
        <MemberStatusDialog
          customer={txt(shownMember.card?.customerName)}
          current={memberStatus}
          balance={num(shownMember.balance)}
          busy={posting}
          onCancel={closeDialog}
          onApply={(input) => void applyStatus(input)}
        />
      ) : null}
      {dialog?.kind === "adjust" && shownMember ? (
        <AdjustPointsDialog
          customer={txt(shownMember.card?.customerName)}
          balance={num(shownMember.balance)}
          redeemable={num(shownMember.redeemable)}
          approverName={getUserInfo()?.userName ?? ""}
          busy={posting}
          onCancel={closeDialog}
          onApply={(input) => void applyAdjust(input)}
        />
      ) : null}
      {dialog?.kind === "history" ? <MemberHistoryDialog name={dialog.name} steps={dialog.steps} onClose={closeDialog} /> : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
    </div>
  );
}
