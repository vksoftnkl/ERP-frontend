/**
 * Loads one report at a time, and commits a generation all at once (plan §5.1;
 * the ledger-statement rule, its §5).
 *
 * Every URL change is a generation: the previous one's requests are aborted,
 * and nothing is applied whose filters are not the current URL's. Show fires
 * `/parties` page 1 (the tiles live there, so it is fetched on every tab) and
 * whatever the open tab needs: `/bill-wise` page 1, `/summary` or
 * `/due-calendar`. They are committed TOGETHER when the last one settles, so
 * the tiles of one report never sit over another report's grid. Until then the
 * previous report stays on screen (dimmed by the caller).
 *
 * A tab switch or a re-sort is a URL change too, so it starts a generation,
 * but it only fetches what the report does not already hold for its key.
 *
 * Moving the party selection is NOT a generation here: `SelectedPartyLoader`
 * owns that, and the request key below leaves `selected` out.
 *
 * No React in here: `useOutstanding` wraps it, and the race tests drive it.
 */
import { Generations, type Ticket } from "@/features/reports/shared/query/generation";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import type {
  BillTotals,
  BillWiseRow,
  DueCalendarPayload,
  PartyRow,
  PartyTiles,
  PartyTotals,
  ReportHead,
  SummaryPayload,
} from "../wire/types";
import { firstPaged, pagesNeeded, withPage, type PagedState } from "./pages";
import {
  billWiseKey,
  billWiseQuery,
  calendarKey,
  calendarQuery,
  PAGE_SIZE,
  partiesKey,
  partiesQuery,
  reportKey,
  summaryKey,
  summaryQuery,
  type Filters,
  type Session,
} from "./params";

export type Part<T> = { key: string; data: T } | null;

export type PartiesMeta = { head: ReportHead; tiles: PartyTiles; totals: PartyTotals };
export type BillWiseMeta = { head: ReportHead; totals: BillTotals };

export type PartiesList = PagedState<PartyRow, PartiesMeta>;
export type BillWiseList = PagedState<BillWiseRow, BillWiseMeta>;

export type OutstandingState = {
  /** A generation is in flight. The committed parts stay on screen meanwhile. */
  loading: boolean;
  /**
   * The committed parts are NOT the URL's report: the last load failed, so
   * the previous report stays on screen (dimmed) beside the error and Retry.
   */
  behind: boolean;
  /** The report (`sessionKey#reportKey`) the committed parts belong to. */
  viewKey: string | null;
  parties: PartiesList | null;
  billWise: BillWiseList | null;
  summary: Part<SummaryPayload>;
  calendar: Part<DueCalendarPayload>;
  /** The first failure of the last generation, raw (see `wire/errors.ts`). */
  error: unknown;
  /** A page that failed to load on scroll. Retry clears it. */
  pageError: unknown;
};

export const INITIAL_STATE: OutstandingState = {
  loading: false,
  behind: false,
  viewKey: null,
  parties: null,
  billWise: null,
  summary: null,
  calendar: null,
  error: null,
  pageError: null,
};

export type LoadRequest = { session: Session; filters: Filters; force?: boolean };

/** The report's identity, with the company it was asked under. */
export function fullKey(session: Session, filters: Filters): string {
  return `${session.companyId}#${reportKey(filters)}`;
}

/** A part belongs to the report on screen: its key starts with that report's. */
export function partOf(viewKey: string | null, key: string | null | undefined): boolean {
  return Boolean(viewKey && key && key.startsWith(`${viewKey}#`));
}

/**
 * What a load request depends on: the company and every filter but the
 * focused party. Not the session's year or branch: those only seed defaults,
 * which are already in `filters`, so the year arriving late must not re-run
 * the report.
 */
export function loadKey(session: Session, filters: Filters): string {
  return JSON.stringify([session.companyId, { ...filters, selected: null }]);
}

type PagedList = "parties" | "billWise";

export class OutstandingLoader {
  private state: OutstandingState = INITIAL_STATE;
  private readonly gens = new Generations();
  private readonly inflight = new Set<string>();
  private last: LoadRequest | null = null;

  constructor(
    private readonly client: PartyOutstandingClient,
    private readonly onChange: (state: OutstandingState) => void,
  ) {}

  getState(): OutstandingState {
    return this.state;
  }

  private set(patch: Partial<OutstandingState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /** The URL changed (or Show / Retry was pressed with `force`). */
  load(request: LoadRequest): void {
    this.last = request;
    const { session, filters } = request;
    const ticket = this.gens.begin();
    this.inflight.clear();

    if (!session.companyId) {
      this.set({ ...INITIAL_STATE });
      return;
    }

    const view = fullKey(session, filters);
    const pKey = `${view}#${partiesKey(filters)}`;
    const bKey = `${view}#${billWiseKey(filters)}`;
    const sKey = `${view}#${summaryKey(filters)}`;
    const cKey = `${view}#${calendarKey(filters)}`;
    const force = request.force === true;
    const s = this.state;

    const wantParties = force || s.parties?.key !== pKey;
    const wantBillWise = filters.tab === "bills" && (force || s.billWise?.key !== bKey);
    const wantSummary = filters.tab === "summary" && (force || s.summary?.key !== sKey);
    const wantCalendar = filters.tab === "calendar" && (force || s.calendar?.key !== cKey);

    if (!wantParties && !wantBillWise && !wantSummary && !wantCalendar) {
      this.set({ loading: false, behind: false, viewKey: view, error: null });
      return;
    }
    this.set({ loading: true, error: null });

    const parties = wantParties ? this.client.getParties(partiesQuery(session, filters, 1), ticket.signal) : null;
    const billWise = wantBillWise
      ? this.client.getBillWise(billWiseQuery(session, filters, 1), ticket.signal)
      : null;
    const summary = wantSummary ? this.client.getSummary(summaryQuery(session, filters), ticket.signal) : null;
    const calendar = wantCalendar
      ? this.client.getDueCalendar(calendarQuery(session, filters), ticket.signal)
      : null;

    void Promise.allSettled([parties, billWise, summary, calendar]).then(([p, b, sm, c]) => {
      if (!this.gens.isCurrent(ticket)) return;
      const failures = [p, b, sm, c].flatMap((result) =>
        result.status === "rejected" && !isAborted(result.reason, ticket.signal) ? [result.reason] : [],
      );
      if (failures.length > 0) {
        // All or nothing: a report is never shown half from one generation and
        // half from another. The previous one stays up, marked as behind.
        this.set({ loading: false, behind: true, error: failures[0] });
        return;
      }
      const patch: Partial<OutstandingState> = {
        loading: false,
        behind: false,
        viewKey: view,
        error: null,
        pageError: null,
      };
      if (p.status === "fulfilled" && p.value) {
        const { tiles, totals, rows, page, ...head } = p.value;
        patch.parties = firstPaged(pKey, rows, page, { head, tiles, totals });
      }
      if (b.status === "fulfilled" && b.value) {
        const { totals, rows, page, ...head } = b.value;
        patch.billWise = firstPaged(bKey, rows, page, { head, totals });
      }
      if (sm.status === "fulfilled" && sm.value) patch.summary = { key: sKey, data: sm.value };
      if (c.status === "fulfilled" && c.value) patch.calendar = { key: cKey, data: c.value };
      this.set(patch);
    });
  }

  /** Re-run the last request, bypassing what is held (Retry, or Show on the same URL). */
  reload(): void {
    if (this.last) this.load({ ...this.last, force: true });
  }

  /**
   * A grid is showing rows `first..last` of its list: fetch the pages under
   * them that are not loaded. Placeholders stand in until each arrives.
   */
  ensureRows(list: PagedList, first: number, last: number): void {
    const held = this.state[list];
    const ticket = this.gens.ticket();
    const request = this.last;
    if (this.state.loading || !held || !ticket || !request || this.state.pageError) return;
    if (!partOf(this.state.viewKey, held.key)) return;
    for (const pageNo of pagesNeeded(held, first, last)) {
      const id = `${list}:${held.key}:${pageNo}`;
      if (this.inflight.has(id)) continue;
      this.inflight.add(id);
      void this.fetchPage(ticket, request, list, held.key, pageNo).finally(() => this.inflight.delete(id));
    }
  }

  private async fetchPage(ticket: Ticket, request: LoadRequest, list: PagedList, key: string, pageNo: number) {
    const { session, filters } = request;
    const pageSize = this.state[list]?.pageSize ?? PAGE_SIZE;
    if (list === "parties") {
      await this.gens.run(
        ticket,
        (signal) => this.client.getParties(partiesQuery(session, filters, pageNo, pageSize), signal),
        (page) => {
          const current = this.state.parties;
          if (current && current.key === key) this.set({ parties: withPage(current, page.rows, page.page) });
        },
        (error) => this.pageFailed(error, ticket),
      );
    } else {
      await this.gens.run(
        ticket,
        (signal) => this.client.getBillWise(billWiseQuery(session, filters, pageNo, pageSize), signal),
        (page) => {
          const current = this.state.billWise;
          if (current && current.key === key) this.set({ billWise: withPage(current, page.rows, page.page) });
        },
        (error) => this.pageFailed(error, ticket),
      );
    }
  }

  private pageFailed(error: unknown, ticket: Ticket): void {
    if (!isAborted(error, ticket.signal)) this.set({ pageError: error });
  }

  /** Clear a failed page so the grid asks again. */
  retryPages(): void {
    this.set({ pageError: null });
  }

  dispose(): void {
    this.gens.dispose();
    this.inflight.clear();
  }
}
