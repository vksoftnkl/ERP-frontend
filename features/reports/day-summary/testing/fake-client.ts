/**
 * A `DaySummaryClient` over the fixtures, for tests. Every call goes through
 * the real parsers, and every call can be held (`gate`) so a test decides the
 * order the responses arrive in.
 */
import type { DaySummaryClient } from "../api/day-summary";
import {
  parseCheckDetail,
  parseDaily,
  parseExport,
  parseGroupLedgers,
  parseNoTender,
  parseSummary,
  parseTenderDayBook,
  parseVouchers,
  parseVoucherTypes,
} from "../wire/parse";
import {
  checkDetailFixture,
  dailyFixture,
  exportFixture,
  groupLedgersFixture,
  noTenderFixture,
  summaryFixture,
  tenderDayBookFixture,
  vouchersFixture,
  voucherTypesFixture,
  type FixtureQuery,
} from "./fixtures";

export type Call = { route: string; query: FixtureQuery; release: () => void; aborted: boolean };

function asFixtureQuery(q: object): FixtureQuery {
  return Object.fromEntries(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

export function fakeClient(opts: { gate?: boolean; fail?: (route: string, query: FixtureQuery) => unknown } = {}) {
  const calls: Call[] = [];

  function respond<T>(route: string, q: object, make: (q: FixtureQuery) => T, signal?: AbortSignal): Promise<T> {
    const query = asFixtureQuery(q);
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

  const client: DaySummaryClient = {
    getVoucherTypes: (s) => respond("voucher-types", {}, () => parseVoucherTypes(voucherTypesFixture()), s),
    getSummary: (q, s) => respond("summary", q, (f) => parseSummary(summaryFixture(f)), s),
    getVouchers: (q, s) => respond("vouchers", q, (f) => parseVouchers(vouchersFixture(f), f.draftsOnly === "true"), s),
    getDaily: (q, s) => respond("daily", q, (f) => parseDaily(dailyFixture(f)), s),
    getGroupLedgers: (q, s) =>
      respond("group-ledgers", q, (f) => {
        const raw = groupLedgersFixture(f);
        if (!raw) throw { status: 400, data: { message: { errors: [{ code: "GROUP_UNKNOWN" }] } } };
        return parseGroupLedgers(raw);
      }, s),
    getCheckDetail: (q, s) => respond("checks/detail", q, (f) => parseCheckDetail(checkDetailFixture(f), q.code), s),
    getExport: (q, s) => respond("export", q, (f) => parseExport(exportFixture(f)), s),
    getTenderDayBook: (q, s) => respond("tender", q, (f) => parseTenderDayBook(tenderDayBookFixture(f)), s),
    getNoTender: (q, s) => respond("no-tender", q, (f) => parseNoTender(noTenderFixture(f)), s),
  };
  return { client, calls };
}

/** Let every pending promise callback run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
