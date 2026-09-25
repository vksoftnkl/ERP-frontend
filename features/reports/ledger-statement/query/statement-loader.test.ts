import { describe, expect, it } from "vitest";
import { COMPANY_ID, FY, LEDGER_OTHERS, LEDGER_SKT } from "../testing/fixtures";
import { fakeClient, flush } from "../testing/fake-client";
import { buildGridModel } from "../grid/grid-model";
import { formatBal } from "../wire/money";
import { isLastPageLoaded, lastRow, rowAt } from "./pages";
import { parseFilters, type Filters, type Session } from "./params";
import { fullKey, StatementLoader, type StatementState } from "./statement-loader";

const session: Session = {
  companyId: COMPANY_ID,
  accYear: FY.accYear,
  yearBegin: FY.begin,
  yearEnd: FY.end,
  branchId: null,
};

function filtersFor(ledgerId: string, extra = ""): Filters {
  return parseFilters(new URLSearchParams(`ledger=${ledgerId}&from=2026-08-01&to=2026-09-25&branch=all${extra}`), {
    fromDate: FY.begin,
    toDate: "2026-09-25",
    branchId: null,
  });
}

describe("one generation at a time (race test)", () => {
  it("PgDn ×4 with responses arriving in reverse order ends on the last ledger everywhere", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const seen: StatementState[] = [];
    const loader = new StatementLoader(client, (s) => seen.push(s));

    const ledgers = [LEDGER_SKT, ...LEDGER_OTHERS]; // ledger 1 … ledger 5
    for (const ledgerId of ledgers) loader.load({ session, filters: filtersFor(ledgerId) });
    expect(calls).toHaveLength(ledgers.length * 3);

    // Oldest last: ledger 5's answers land first, ledger 1's last.
    [...calls].reverse().forEach((call) => call.release());
    await flush();

    const final = loader.getState();
    const target = filtersFor(LEDGER_OTHERS[3]);
    expect(final.loading).toBe(false);
    expect(final.viewKey).toBe(fullKey(session, target));
    expect(final.header?.key).toBe(final.viewKey);
    expect(final.header?.data.ledger.ledgerId).toBe(LEDGER_OTHERS[3]);
    expect(final.pages?.key).toBe(final.viewKey);
    expect(final.monthly?.key).toContain(LEDGER_OTHERS[3]);

    // And never, in any committed state, panels of one ledger over another's grid.
    for (const state of seen) {
      if (state.header && state.pages) expect(state.header.key).toBe(state.pages.key);
    }
    // Every superseded generation was aborted.
    expect(calls.filter((c) => c.aborted)).toHaveLength((ledgers.length - 1) * 3);
  });

  it("a tab switch fetches only what the report does not hold", async () => {
    const { client, calls } = fakeClient();
    const loader = new StatementLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor(LEDGER_SKT) });
    await flush();
    const before = calls.length;
    loader.load({ session, filters: { ...filtersFor(LEDGER_SKT), tab: "daily" } });
    await flush();
    expect(calls.slice(before).map((c) => c.route)).toEqual(["daily"]);
    loader.load({ session, filters: filtersFor(LEDGER_SKT) });
    await flush();
    expect(calls.slice(before + 1)).toHaveLength(0);
  });

  it("keeps the previous report on screen while the next one loads", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const loader = new StatementLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor(LEDGER_SKT) });
    calls.forEach((c) => c.release());
    await flush();
    loader.load({ session, filters: filtersFor(LEDGER_OTHERS[0]) });
    const mid = loader.getState();
    expect(mid.loading).toBe(true);
    expect(mid.header?.data.ledger.ledgerId).toBe(LEDGER_SKT);
  });
});

describe("a failed load", () => {
  it("keeps the previous report on screen, marked behind, until Retry succeeds", async () => {
    let down = false;
    const { client } = fakeClient({ fail: (route) => (down && route === "header" ? { status: 503, data: {} } : null) });
    const loader = new StatementLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor(LEDGER_SKT) });
    await flush();
    down = true;
    loader.load({ session, filters: filtersFor(LEDGER_OTHERS[0]) });
    await flush();
    let state = loader.getState();
    expect(state.behind).toBe(true);
    expect(state.error).toMatchObject({ status: 503 });
    expect(state.header?.data.ledger.ledgerId).toBe(LEDGER_SKT);
    expect(state.pages?.key).toBe(state.header?.key);

    down = false;
    loader.reload();
    await flush();
    state = loader.getState();
    expect(state.behind).toBe(false);
    expect(state.error).toBeNull();
    expect(state.header?.data.ledger.ledgerId).toBe(LEDGER_OTHERS[0]);
  });
});

describe("paging (450 rows)", () => {
  it("jumps to the end without loading the middle, and every balance is the server's", async () => {
    const { client, calls } = fakeClient({ rowCount: 450 });
    const loader = new StatementLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor(LEDGER_SKT) });
    await flush();

    let state = loader.getState();
    expect(state.pages?.totalRows).toBe(450);
    let model = buildGridModel({
      period: state.header!.data.period,
      pages: state.pages,
      expanded: new Set(),
      legsOf: () => undefined,
    });
    // No Total / Closing until the last page is in hand; the foot counts what is missing.
    expect(model.rows.some((r) => r.kind === "total" || r.kind === "closing")).toBe(false);
    expect(model.pendingRows).toBe(250);

    loader.ensureRows(449, 449); // End
    await flush();
    state = loader.getState();
    expect(calls.filter((c) => c.route === "vouchers").map((c) => c.query.page)).toEqual(["1", "3"]);
    expect(state.pages!.pages.has(2)).toBe(false);
    expect(isLastPageLoaded(state.pages!)).toBe(true);

    // The last balance is the header's closing, and it came from the server's row.
    const period = state.header!.data.period;
    expect(formatBal(lastRow(state.pages!)!.balance)).toBe(formatBal(period.closing));

    model = buildGridModel({ period, pages: state.pages, expanded: new Set(), legsOf: () => undefined });
    // The middle is placeholders, not computed rows.
    expect(model.rows.filter((r) => r.kind === "placeholder")).toHaveLength(200);
    // Every voucher row's balance is the very object the server sent (no derivation).
    for (const row of model.rows) {
      if (row.kind === "voucher") expect(row.row.balance).toBe(rowAt(state.pages!, row.index)!.balance);
    }
    const total = model.rows.find((r) => r.kind === "total");
    expect(total).toMatchObject({ debit: period.debit.amount, credit: period.credit.amount });
  });
});
