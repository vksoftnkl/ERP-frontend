/**
 * A `LedgerStatementClient` over the fixtures, for tests. Every call goes
 * through the real parsers, and every call can be held (`gate`) so a test
 * decides the order responses arrive in.
 */
import type { LedgerStatementClient } from "../api/ledger-statement";
import { AbortedError } from "../api/abort";
import {
  parseDaily,
  parseExport,
  parseHeader,
  parseLedgers,
  parseMonthly,
  parseVoucherLegs,
  parseVouchers,
} from "../wire/parse";
import {
  dailyFixture,
  exportFixture,
  headerFixture,
  ledgersFixture,
  monthlyFixture,
  voucherLegsFixture,
  vouchersFixture,
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

export function fakeClient(
  opts: { gate?: boolean; rowCount?: number; fail?: (route: string, query: FixtureQuery) => unknown } = {},
) {
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

  const n = opts.rowCount;
  const client: LedgerStatementClient = {
    searchLedgers: (q, s) => respond("ledgers", q, (f) => parseLedgers(ledgersFixture(f)), s),
    getHeader: (q, s) => respond("header", q, (f) => parseHeader(headerFixture(f, n)), s),
    getVouchers: (q, s) => respond("vouchers", q, (f) => parseVouchers(vouchersFixture(f, n)), s),
    getVoucherLegs: (q, s) =>
      respond("voucher-legs", q, (f) => {
        const raw = voucherLegsFixture(f);
        if (!raw) throw { status: 404, data: { code: "VOUCHER_NOT_FOUND" } };
        return parseVoucherLegs(raw);
      }, s),
    getDaily: (q, s) => respond("daily", q, () => parseDaily(dailyFixture()), s),
    getMonthly: (q, s) => respond("monthly", q, () => parseMonthly(monthlyFixture()), s),
    getExport: (q, s) => respond("export", q, (f) => parseExport(exportFixture(f)), s),
  };
  return { client, calls, AbortedError };
}

/** Let every pending promise callback run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
