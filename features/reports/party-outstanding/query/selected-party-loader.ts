/**
 * The focused party's card and bills: a second, smaller generation (plan §5.2).
 *
 * Moving the focus in the party grid selects a party, which fetches `/party`
 * and `/bills` for it, debounced 150 ms, so holding ↓ through 40 parties does
 * not fire 80 requests. Its generation is nested in the report's: the key is
 * `company#report#party`, so a new Show invalidates it, and a new selection
 * invalidates only it.
 *
 * Card and bills are applied TOGETHER or not at all (`Promise.all` inside one
 * generation check). The previous party's card and bills stay up, dimmed,
 * until the next party's both arrive, so party B's card never sits over party
 * A's bills.
 *
 * No React in here: `useSelectedParty` wraps it, and the race test drives it.
 */
import { Generations } from "@/features/reports/shared/query/generation";
import { isAborted } from "@/features/reports/shared/api/abort";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import type { BillsPayload, PartyCardPayload } from "../wire/types";
import { partyQuery, reportKey, type ReportFilters, type Session } from "./params";

export const SELECT_DEBOUNCE_MS = 150;

export type SelectedState = {
  /** A selection is pending or in flight. */
  loading: boolean;
  /** What the committed card + bills belong to. */
  key: string | null;
  partyId: string | null;
  card: PartyCardPayload | null;
  bills: BillsPayload | null;
  /** The last selection failed; the previous party stays up, dimmed. */
  error: unknown;
};

export const INITIAL_SELECTED: SelectedState = {
  loading: false,
  key: null,
  partyId: null,
  card: null,
  bills: null,
  error: null,
};

export type SelectRequest = {
  session: Session;
  filters: ReportFilters;
  partyId: string | null;
  force?: boolean;
};

export function selectionKey(session: Session, filters: ReportFilters, partyId: string): string {
  return `${session.companyId}#${reportKey(filters)}#${partyId}`;
}

export class SelectedPartyLoader {
  private state: SelectedState = INITIAL_SELECTED;
  private readonly gens = new Generations();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted: string | null = null;
  private last: SelectRequest | null = null;

  constructor(
    private readonly client: PartyOutstandingClient,
    private readonly onChange: (state: SelectedState) => void,
    private readonly debounceMs = SELECT_DEBOUNCE_MS,
  ) {}

  getState(): SelectedState {
    return this.state;
  }

  private set(patch: Partial<SelectedState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  select(request: SelectRequest): void {
    const { session, filters, partyId } = request;
    if (!partyId || !session.companyId) {
      // Nothing focused (a new Show, before its first row is picked): stop
      // asking, but keep the last card and bills up. The screen dims them.
      this.cancel();
      this.wanted = null;
      this.last = null;
      if (this.state.loading || this.state.error) this.set({ loading: false, error: null });
      return;
    }
    const key = selectionKey(session, filters, partyId);
    if (!request.force && (key === this.wanted || (key === this.state.key && !this.state.loading))) return;
    this.last = request;
    this.wanted = key;
    // Abort what is in flight NOW, so a slow answer for the last party can
    // never land after this one was asked for.
    const ticket = this.gens.begin();
    this.cancelTimer();
    this.set({ loading: true, error: null });
    this.timer = setTimeout(() => {
      this.timer = null;
      const query = partyQuery(session, filters, partyId);
      void this.gens.run(
        ticket,
        (signal) => Promise.all([this.client.getParty(query, signal), this.client.getBills(query, signal)]),
        ([card, bills]) => this.set({ loading: false, key, partyId, card, bills, error: null }),
        (error) => {
          if (!isAborted(error, ticket.signal)) this.set({ loading: false, error });
        },
      );
    }, this.debounceMs);
  }

  /** Ask again for the party on screen (Retry, or Show on the same URL). */
  reload(): void {
    if (this.last) this.select({ ...this.last, force: true });
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private cancel(): void {
    this.cancelTimer();
    this.gens.begin();
  }

  dispose(): void {
    this.cancelTimer();
    this.gens.dispose();
  }
}
