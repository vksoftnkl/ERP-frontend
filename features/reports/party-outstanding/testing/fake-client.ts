/**
 * A `PartyOutstandingClient` over the fixtures, for tests. Every call goes
 * through the real parsers, and every call can be held (`gate`) so a test
 * decides the order responses arrive in.
 */
import type { PartyOutstandingClient } from "../api/party-outstanding";
import {
  parseBillHistory,
  parseBills,
  parseBillWise,
  parseDueCalendar,
  parseExport,
  parseOptions,
  parseParties,
  parseParty,
  parseSummary,
} from "../wire/parse";
import {
  billHistoryFixture,
  billsFixture,
  billWiseFixture,
  dueCalendarFixture,
  exportFixture,
  optionsFixture,
  partiesFixture,
  partyFixture,
  summaryFixture,
  type BillsFixtureOpts,
  type PartiesFixtureOpts,
} from "./fixtures";

type Q = Record<string, string>;

export type Call = { route: string; query: Q; release: () => void; aborted: boolean };

function asQuery(q: object): Q {
  return Object.fromEntries(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

export type FakeOpts = {
  gate?: boolean;
  parties?: PartiesFixtureOpts;
  bills?: BillsFixtureOpts;
  fail?: (route: string, query: Q) => unknown;
};

export function fakeClient(opts: FakeOpts = {}) {
  const calls: Call[] = [];

  function respond<T>(route: string, q: object, make: (q: Q) => T, signal?: AbortSignal): Promise<T> {
    const query = asQuery(q);
    return new Promise<T>((resolve, reject) => {
      const call: Call = {
        route,
        query,
        aborted: false,
        release: () => {
          // Resolves even when aborted: the loader must not trust the abort alone.
          try {
            const failure = opts.fail?.(route, query);
            if (failure) throw failure;
            resolve(make(query));
          } catch (error) {
            reject(error);
          }
        },
      };
      signal?.addEventListener("abort", () => {
        call.aborted = true;
      });
      calls.push(call);
      if (!opts.gate) call.release();
    });
  }

  const client: PartyOutstandingClient = {
    getOptions: (q, s) => respond("options", q, (f) => parseOptions(optionsFixture(f)), s),
    getParties: (q, s) => respond("parties", q, (f) => parseParties(partiesFixture(f, opts.parties)), s),
    getParty: (q, s) => respond("party", q, (f) => parseParty(partyFixture(f)), s),
    getBills: (q, s) => respond("bills", q, (f) => parseBills(billsFixture(f, opts.bills)), s),
    getBillWise: (q, s) => respond("bill-wise", q, (f) => parseBillWise(billWiseFixture(f)), s),
    getBillHistory: (q, s) => respond("bill-history", q, (f) => parseBillHistory(billHistoryFixture(f)), s),
    getSummary: (q, s) => respond("summary", q, (f) => parseSummary(summaryFixture(f)), s),
    getDueCalendar: (q, s) => respond("due-calendar", q, (f) => parseDueCalendar(dueCalendarFixture(f)), s),
    getExport: (q, s) => respond("export", q, (f) => parseExport(exportFixture(f)), s),
  };
  return { client, calls };
}

/** Let every pending promise callback run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
