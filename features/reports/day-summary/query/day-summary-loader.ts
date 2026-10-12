/**
 * Loads the tab on screen, one generation per URL (plan §5).
 *
 * Every URL change starts a generation: the previous one's requests are
 * aborted and their late answers ignored (`shared/query/generation.ts`). The
 * tab NOT on screen is not fetched; a tab switch fetches that tab only if the
 * part held for it is not the current URL's.
 *
 *   Summary  = ONE `/summary` call. The tiles, the three grids, the checks
 *              and the business-day pill are one server snapshot, so they tie
 *              to each other. Never split it per panel (§1 fact 2).
 *   Vouchers = one `/vouchers` call per page of 200, pages on scroll.
 *   Day-wise = one `/daily` call.
 *
 * Until a generation commits, the previous figures stay where they are, and
 * the screen dims them: pressing ◀ five times never shows one day's tiles
 * over another's grids, because there is only one response per tab.
 *
 * No React in here: `useDaySummary` wraps it, and the race test drives it.
 */
import type { DaySummaryClient } from "../api/day-summary";
import { isAborted } from "@/features/reports/shared/api/abort";
import { Generations, type Ticket } from "@/features/reports/shared/query/generation";
import type { DailyPayload, SummaryPayload } from "../wire/types";
import { firstPages, pagesNeeded, PAGE_SIZE, withPage, type PagesState } from "./pages";
import {
  dailyKey,
  dailyQuery,
  isRange,
  summaryKey,
  summaryQuery,
  vouchersKey,
  vouchersQuery,
  type Filters,
  type Session,
} from "./params";

/** A committed part: the key it was asked under, the filters that asked, the data. */
export type Part<T> = { key: string; filters: Filters; data: T };

export type Route = "summary" | "vouchers" | "daily";

export type LoaderState = {
  /** A generation is in flight. The committed parts stay on screen meanwhile. */
  loading: boolean;
  summary: Part<SummaryPayload> | null;
  vouchers: (PagesState & { filters: Filters }) | null;
  daily: Part<DailyPayload> | null;
  /** The last generation's failure, the key it was for and the route that failed. */
  error: { key: string; route: Route; error: unknown } | null;
  /** A page that failed to load on scroll. Retry clears it. */
  pageError: unknown;
};

export const INITIAL_STATE: LoaderState = {
  loading: false,
  summary: null,
  vouchers: null,
  daily: null,
  error: null,
  pageError: null,
};

export type LoadRequest = { session: Session; filters: Filters; force?: boolean };

/** The key the tab on screen needs, or null when it needs nothing (Day-wise on one day). */
export function wantedKey(session: Session, filters: Filters): { route: Route; key: string } | null {
  switch (filters.tab) {
    case "summary":
      return { route: "summary", key: summaryKey(session, filters) };
    case "vouchers":
      return { route: "vouchers", key: vouchersKey(session, filters) };
    case "daily":
      return isRange(filters) ? { route: "daily", key: dailyKey(session, filters) } : null;
  }
}

export class DaySummaryLoader {
  private state: LoaderState = INITIAL_STATE;
  private readonly gens = new Generations();
  private readonly inflightPages = new Set<number>();
  private last: LoadRequest | null = null;

  constructor(
    private readonly client: DaySummaryClient,
    private readonly onChange: (state: LoaderState) => void,
  ) {}

  getState(): LoaderState {
    return this.state;
  }

  private set(patch: Partial<LoaderState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /** The URL changed (or Show / Retry was pressed with `force`). */
  load(request: LoadRequest): void {
    this.last = request;
    const { session, filters } = request;
    const ticket = this.gens.begin();
    this.inflightPages.clear();

    const want = session.companyId && session.accYear ? wantedKey(session, filters) : null;
    if (!want) {
      this.set({ loading: false, error: null });
      return;
    }
    const s = this.state;
    const held =
      want.route === "summary" ? s.summary?.key : want.route === "vouchers" ? s.vouchers?.key : s.daily?.key;
    if (!request.force && held === want.key) {
      this.set({ loading: false, error: null });
      return;
    }
    this.set({ loading: true, error: null });

    const fail = (error: unknown) => {
      if (isAborted(error, ticket.signal)) return;
      this.set({ loading: false, error: { key: want.key, route: want.route, error } });
    };

    switch (want.route) {
      case "summary":
        void this.gens.run(
          ticket,
          (signal) => this.client.getSummary(summaryQuery(session, filters), signal),
          (data) => this.set({ loading: false, summary: { key: want.key, filters, data } }),
          fail,
        );
        break;
      case "vouchers":
        void this.gens.run(
          ticket,
          (signal) => this.client.getVouchers(vouchersQuery(session, filters, 1, PAGE_SIZE), signal),
          (page) => this.set({ loading: false, pageError: null, vouchers: { ...firstPages(want.key, page), filters } }),
          fail,
        );
        break;
      case "daily":
        void this.gens.run(
          ticket,
          (signal) => this.client.getDaily(dailyQuery(session, filters), signal),
          (data) => this.set({ loading: false, daily: { key: want.key, filters, data } }),
          fail,
        );
        break;
    }
  }

  /** Re-run the last request, bypassing what is held (Retry, or Show on the same URL). */
  reload(): void {
    if (this.last) this.load({ ...this.last, force: true });
  }

  /** The list is showing rows `first..last`: fetch the pages under them that are not loaded. */
  ensureRows(first: number, last: number): void {
    const { vouchers, loading, pageError } = this.state;
    const ticket = this.gens.ticket();
    const request = this.last;
    if (loading || pageError || !vouchers || !ticket || !request) return;
    const { session, filters } = request;
    if (filters.tab !== "vouchers" || vouchersKey(session, filters) !== vouchers.key) return;
    for (const pageNo of pagesNeeded(vouchers, first, last)) {
      if (this.inflightPages.has(pageNo)) continue;
      this.inflightPages.add(pageNo);
      void this.fetchPage(ticket, session, filters, vouchers.key, pageNo);
    }
  }

  private async fetchPage(ticket: Ticket, session: Session, filters: Filters, key: string, pageNo: number) {
    await this.gens.run(
      ticket,
      (signal) =>
        this.client.getVouchers(vouchersQuery(session, filters, pageNo, this.state.vouchers?.pageSize ?? PAGE_SIZE), signal),
      (page) => {
        const current = this.state.vouchers;
        if (current && current.key === key) this.set({ vouchers: { ...withPage(current, page), filters: current.filters } });
      },
      (error) => {
        if (!isAborted(error, ticket.signal)) this.set({ pageError: error });
      },
    );
    this.inflightPages.delete(pageNo);
  }

  /** Clear a failed page so the list asks again. */
  retryPages(): void {
    this.set({ pageError: null });
  }

  dispose(): void {
    this.gens.dispose();
    this.inflightPages.clear();
  }
}
