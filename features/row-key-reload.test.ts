/**
 * Row keys across a page reload.
 *
 * The key counters below restart at 0 on every page load, and a draft that was
 * remembered, held or auto-saved carries the keys the OLD page minted. If the
 * new page hands out the same key to a new row, an edit addressed to one row
 * changes both. So each generator's key must differ from the one the same call
 * produced on a page loaded earlier, even with the counter back at the same
 * value. A "reload" here is: reset the module registry, move the clock on, and
 * import the generator again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type KeyMaker = () => Promise<() => string>;

const GENERATORS: Array<[string, KeyMaker]> = [
  [
    "stock adjustment line",
    async () => (await import("@/features/stocks/stock-adjustment/stock-adjustment.state")).newLineKey,
  ],
  [
    "opening stock line",
    async () => (await import("@/features/stocks/opening-stock/opening-stock.lines")).newLineKey,
  ],
  [
    "selling price row",
    async () => (await import("@/features/stocks/selling-price/selling-price.state")).nextRowKey,
  ],
  [
    "purchase order charge",
    async () => (await import("@/features/purchase/order/po-fidelity")).nextChargeKey,
  ],
  [
    "receipt / payment parsed row",
    async () => {
      const { nextRowKey } = await import("@/features/accounts/receipt/payload/parse");
      return () => nextRowKey("line");
    },
  ],
  [
    "opening balance row",
    async () => {
      const { nextRowKey } = await import("@/features/accounts/opening-balance/wire/parse");
      return () => nextRowKey("led");
    },
  ],
  [
    "voucher line",
    async () => {
      const { blankLine } = await import("@/features/accounts/vouchers/domain/lines");
      return () => blankLine().key;
    },
  ],
  [
    "expense line",
    async () => {
      const { emptyLine } = await import("@/features/accounts/expense/domain/draft");
      return () => emptyLine().key;
    },
  ],
  [
    "receipt tender row",
    async () => {
      const { tenderRowFrom } = await import("@/features/accounts/receipt/domain/tenders");
      return () => tenderRowFrom({ tndId: "t1", tndTypeId: "1", tndName: "Cash" } as never).key;
    },
  ],
  [
    "payment tender row",
    async () => {
      const { paymentTenderRowFrom } = await import("@/features/accounts/payment/domain/tenders");
      return () => paymentTenderRowFrom({ tndId: "t1", tndTypeId: "1", tndName: "Cash" } as never).key;
    },
  ],
  [
    "item qty price local id",
    async () => (await import("@/features/masters/inventory/item-qty-price/item-qty-price.utils")).createLocalId,
  ],
  [
    "ledger bank account row",
    async () => {
      const { createEmptyBankAccountRow } = await import("@/features/masters/accounts/account-ledger/bank-accounts");
      return () => createEmptyBankAccountRow().rowKey;
    },
  ],
];

describe("a key minted after a reload is not one a stored draft can carry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(GENERATORS)("%s", async (_name, load) => {
    const now = vi.spyOn(Date, "now");

    // The page that stored the draft.
    now.mockReturnValue(1_700_000_000_000);
    vi.resetModules();
    const stored = (await load())();

    // The page loaded afterwards: its counter is back at the start.
    now.mockReturnValue(1_700_000_005_000);
    vi.resetModules();
    const next = (await load())();

    expect(next).not.toBe(stored);
  });
});
