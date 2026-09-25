/**
 * Loads one report at a time, and commits a generation all at once (plan §5).
 *
 * Show fires `/header`, `/monthly` and the first `/vouchers` page (or `/daily`
 * on that tab) in parallel. They form one generation, and their results are
 * committed TOGETHER when the last one settles, so the screen can never show
 * one ledger's panels over another's grid, not even for a frame. Until then
 * the previous report stays on screen (dimmed by the caller), so two ledgers
 * can be compared by eye across a PgDn.
 *
 * A tab switch is a URL change too, so it starts a generation, but it only
 * fetches what the report does not already hold for its key.
 *
 * No React in here: `useStatement` wraps it, and the race test drives it.
 */
import type { LedgerStatementClient } from "../api/ledger-statement";
import { isAborted } from "../api/abort";
import type { DailyPayload, HeaderPayload, MonthlyPayload } from "../wire/types";
import { Generations, type Ticket } from "./generation";
import { firstPages, pagesNeeded, PAGE_SIZE, withPage, type PagesState } from "./pages";
import { rangeQuery, reportKey, scopeQuery, vouchersQuery, type Filters, type Session } from "./params";

export type Part<T> = { key: string; data: T } | null;

export type StatementState = {
  /** A generation is in flight. The committed parts stay on screen meanwhile. */
  loading: boolean;
  /**
   * The committed parts are NOT the URL's report: the last load failed, so
   * the previous report stays on screen (dimmed) beside the error and Retry.
   */
  behind: boolean;
  /** The report (full key) the committed parts belong to. */
  viewKey: string | null;
  header: Part<HeaderPayload>;
  monthly: Part<MonthlyPayload>;
  daily: Part<DailyPayload>;
  pages: PagesState | null;
  /** The first failure of the last generation, raw (see `wire/errors.ts`). */
  error: unknown;
  /** A page that failed to load on scroll. Retry clears it. */
  pageError: unknown;
};

export const INITIAL_STATE: StatementState = {
  loading: false,
  behind: false,
  viewKey: null,
  header: null,
  monthly: null,
  daily: null,
  pages: null,
  error: null,
  pageError: null,
};

export type LoadRequest = { session: Session; filters: Filters; force?: boolean };

function sessionKey(session: Session): string {
  return `${session.companyId}|${session.accYear}`;
}

/** The report's identity, including the session scope it was asked under. */
export function fullKey(session: Session, filters: Filters): string {
  return `${sessionKey(session)}#${reportKey(filters)}`;
}

/** `/monthly` covers the whole year and ignores the dates and the checkboxes. */
function monthlyKey(session: Session, filters: Filters): string {
  return `${sessionKey(session)}#${filters.ledgerId ?? ""}|${filters.branchId ?? "all"}`;
}

export class StatementLoader {
  private state: StatementState = INITIAL_STATE;
  private readonly gens = new Generations();
  private readonly inflightPages = new Set<number>();
  private last: LoadRequest | null = null;

  constructor(
    private readonly client: LedgerStatementClient,
    private readonly onChange: (state: StatementState) => void,
  ) {}

  getState(): StatementState {
    return this.state;
  }

  private set(patch: Partial<StatementState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /** The URL changed (or Show / Retry was pressed with `force`). */
  load(request: LoadRequest): void {
    this.last = request;
    const { session, filters } = request;
    const ticket = this.gens.begin();
    this.inflightPages.clear();

    const ledgerId = filters.ledgerId;
    if (!ledgerId || !session.companyId || !session.accYear) {
      this.set({ ...INITIAL_STATE });
      return;
    }

    const key = fullKey(session, filters);
    const mKey = monthlyKey(session, filters);
    const force = request.force === true;
    const s = this.state;

    const wantHeader = force || s.header?.key !== key;
    const wantMonthly = force || s.monthly?.key !== mKey;
    const wantPages = filters.tab === "vouchers" && (force || s.pages?.key !== key);
    const wantDaily = filters.tab === "daily" && (force || s.daily?.key !== key);

    if (!wantHeader && !wantMonthly && !wantPages && !wantDaily) {
      this.set({ loading: false, behind: false, viewKey: key, error: null });
      return;
    }
    this.set({ loading: true, error: null });

    const header = wantHeader
      ? this.client.getHeader(rangeQuery(session, filters, ledgerId), ticket.signal)
      : null;
    const monthly = wantMonthly
      ? this.client.getMonthly(scopeQuery(session, filters, ledgerId), ticket.signal)
      : null;
    const page = wantPages
      ? this.client.getVouchers(vouchersQuery(session, filters, ledgerId, 1, PAGE_SIZE), ticket.signal)
      : null;
    const daily = wantDaily
      ? this.client.getDaily(rangeQuery(session, filters, ledgerId), ticket.signal)
      : null;

    void Promise.allSettled([header, monthly, page, daily]).then(([h, m, p, d]) => {
      if (!this.gens.isCurrent(ticket)) return;
      const failures = [h, m, p, d].flatMap((result) =>
        result.status === "rejected" && !isAborted(result.reason, ticket.signal) ? [result.reason] : [],
      );
      if (failures.length > 0) {
        // All or nothing: a report is never shown half from one generation and
        // half from another. The previous one stays up, marked as behind.
        this.set({ loading: false, behind: true, error: failures[0] });
        return;
      }
      const patch: Partial<StatementState> = {
        loading: false,
        behind: false,
        viewKey: key,
        error: null,
        pageError: null,
      };
      if (h.status === "fulfilled" && h.value) patch.header = { key, data: h.value };
      if (m.status === "fulfilled" && m.value) patch.monthly = { key: mKey, data: m.value };
      if (p.status === "fulfilled" && p.value) patch.pages = firstPages(key, p.value);
      if (d.status === "fulfilled" && d.value) patch.daily = { key, data: d.value };
      this.set(patch);
    });
  }

  /** Re-run the last request, bypassing what is held (Retry, or Show on the same URL). */
  reload(): void {
    if (this.last) this.load({ ...this.last, force: true });
  }

  /**
   * The grid is showing report rows `first..last`: fetch the pages under them
   * that are not loaded. Placeholders stand in until each arrives.
   */
  ensureRows(first: number, last: number): void {
    const { pages, viewKey, loading } = this.state;
    const ticket = this.gens.ticket();
    const request = this.last;
    if (loading || !pages || !ticket || !request || pages.key !== viewKey || this.state.pageError) return;
    const { session, filters } = request;
    if (!filters.ledgerId || fullKey(session, filters) !== pages.key) return;
    for (const pageNo of pagesNeeded(pages, first, last)) {
      if (this.inflightPages.has(pageNo)) continue;
      this.inflightPages.add(pageNo);
      void this.fetchPage(ticket, session, filters, filters.ledgerId, pages.key, pageNo);
    }
  }

  private async fetchPage(
    ticket: Ticket,
    session: Session,
    filters: Filters,
    ledgerId: string,
    key: string,
    pageNo: number,
  ): Promise<void> {
    await this.gens.run(
      ticket,
      (signal) =>
        this.client.getVouchers(vouchersQuery(session, filters, ledgerId, pageNo, this.state.pages?.pageSize ?? PAGE_SIZE), signal),
      (page) => {
        const current = this.state.pages;
        if (current && current.key === key) this.set({ pages: withPage(current, page) });
      },
      (error) => {
        if (!isAborted(error, ticket.signal)) this.set({ pageError: error });
      },
    );
    this.inflightPages.delete(pageNo);
  }

  /** Clear a failed page so the grid asks again. */
  retryPages(): void {
    this.set({ pageError: null });
  }

  dispose(): void {
    this.gens.dispose();
    this.inflightPages.clear();
  }
}
