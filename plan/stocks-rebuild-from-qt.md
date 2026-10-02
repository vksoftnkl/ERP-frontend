# Stocks — rebuild `features/stocks` from the Qt `inventory/stock` module

2026-10-02. The ask: do not compare; remove the old React stock files and create new ones from the Qt
screens, in `features/stocks`.

## The four screens

| Screen | Qt folder | Menu id | List grid | Line ui-table | React folder | Route |
|---|---|---|---|---|---|---|
| Opening Stock | `opening/` | 44 | 99 | 27 `OPENING STOCK - LINES` | `features/stocks/opening-stock` | `/stock/opening-stock` |
| Physical Stock Update | `physical/` | 45 | 101 | 28 `PHYSICAL STOCK - LINES` | `features/stocks/physical-stock` | `/stock/physical-stock` |
| Stock Adjustment (six kinds) | `adjustment/` | 264 | 122 | 41 `STOCK ADJUSTMENT - ITEM` | `features/stocks/stock-adjustment` | `/stock/stock-adjustment` (new) |
| Change Selling Price (Ctrl+G) | `sellingprice/` | 30 | — | 44 `CHANGE SELLING PRICE - ROWS` | `features/stocks/selling-price` | `/stock/change-selling-price` (new) |

## Done before the screens were built

- **Removed** (`git rm`, recoverable from HEAD): `features/stocks/**` (27 files, 17k lines — the old
  opening and physical screens and `_shared`), `store/slices/{openingStock,physicalStock}Slice.ts`,
  `store/sagas/{openingStock,physicalStock}.saga.ts`, `store/api/{openingStock,physicalStock}Api.ts`, and
  their wiring in `store/store.ts`, `store/sagas/rootSaga.ts`, `store/api/index.ts`.
- **Moved out first:** `StockLookupOption` → `store/api/lookupsApi.ts`; `formatAccountingYear` →
  `features/sales/quotation/quotation.utils.ts` (self-contained, same April–March rule).
- **Registries:** grids `physicalStockList` 101, `stockAdjustmentList` 122, `supplierPickerPopup` 100,
  `stockReasonPopup` 102, `priceLevelPopup` 78; ui-tables `stockAdjustmentLines` 41, `sellingPriceRows` 44;
  dropdowns `stockReason` 50, `stockTrackPreset` 49.
- **Menu:** "Change Selling" → `/stock/change-selling-price` (Inventory), "Stock Adjustment" →
  `/stock/stock-adjustment` (Stock); route shells for all four under `app/stock/`.

## Build

One builder per screen, each confined to its own folder, its own RTK endpoints file
(`baseApi.injectEndpoints`) and local draft state (no new Redux slices), in the Sale Order house style.
Each reports what it ported, what it could not, and its tsc / vitest results — summarised below when done.

## Results

### Opening Stock — done (tsc clean, 77 tests)

`features/stocks/opening-stock/`: page (list ↔ entry, `system.txn_entry_first`), list on grid 99 (period
presets, status filter, DRAFT-only edit, F3 = Cancel Voucher with reason), header (date, godown 26, rate
source, ref, remarks), grid on ui-table 27 by column number (tracking-signature-gated identity cells, bucket
combo, item picker 71 + `item-lookup`, supplier picker 100, barcode scan, split batch, Qt `recalcRow` maths),
Qt's `validateBeforeSave` order and words, Save Draft (F5) / Save & Post (F6 → `/create` status POSTED; 422
problems marked on lines), Edit (F2), Cancel, New, permissions.
Not ported: CSV import and reconcile (Qt has no screen for them), standalone `/validate` `/post` (Qt does not
call them), F4 unit (stub in Qt — info message only), print (Qt has none), per-item qty decimals (lookup does
not return them — 3 places).
Decisions: device id from the login (`getUserInfo().deviceId`, FK to `fixed.device_master`), not the browser
uuid; list Cancel uses the shell's Delete slot relabelled (confirm first, then reason); F8 / Esc return to the
list; a scanned barcode is kept (Qt overwrites it against its own comment); bare +/− on number/picker cells,
Ctrl+± anywhere. Not run in a browser yet.

### Physical Stock Update — done (tsc clean, 80 tests, eslint clean)

`features/stocks/physical-stock/`: page (list ↔ entry, `system.txn_entry_first` read at USER scope; F8 list
as a picker over the mounted sheet), list on grid 101 (six `isvh_*` params, period presets, status filter,
Qt's row policy incl. "godown FROZEN", F3 Cancel with reason — no delete), header (sheet no, count date,
godown 26, reason 50, rate source, ref, remarks, freeze window now → now+3h, blind count), grid on ui-table
28 (only Counted Qty / Remarks editable, item 71 and reason 102 pickers, a picked or scanned item adds all its
holdings from a per-godown count-sheet cache, Qt `recalcRow` difference/value, shortage/overage tint),
totals, Load Sheet (F9), Save Draft (counted lines only, "N of M holdings not counted"), Save & Post
(`/validate` problems listed, confirm, post), Cancel, Edit, permissions.
Not ported: variance view (Qt has no screen), count-sheet filters (Qt passes none; the API call accepts them).
Decisions (Qt deviations, all deliberate): the count sheet is paged to the END (Qt took only the server's
default 200 holdings, against its own intent); freeze times sent with a timezone offset (server README);
duplicates detected by lot + bucket (Qt's lot-only check skipped a lot in two buckets); pickers only on the
blank row and never on a read-only sheet; re-picking the same godown keeps the sheet; one Enter commits and
moves (Qt needs two); device id from the login.

### Stock Adjustment — done (tsc clean, 79 tests)

`features/stocks/stock-adjustment/`: all six kinds (kind change on a sheet with lines asks then clears; rate
source locked to AVG_COST except plain Adjustment; per-kind title, note, columns, cards; Re-lot balance strip;
Move's damaged panel), header (doc no, date, godown 26, default reason, rate source, ref, remarks; godown change
asks then clears), reasons from `/stock/reasons` by save type deciding direction and qty sign, grid on
ui-table 41 by column number with Qt's per-kind visibility and `whyNotEditable` refusals, item search on grid
71 → `/stock/opening/item-lookup` → availability from pick-stock, the stock pick dialog (buckets, supplier
grouping, expired-only filter, BLOCK warning), accounts estimate from reason ledger / ledger-map roles, Qt's
`clientProblems` and save gates, Save (F5 → status POSTED), Save draft, Validate, Cancel with reason, Delete
draft, Edit, New (F7), list on grid 122 (seven tokens, type and status filters, row policy, F3 Cancel), settings
`system.txn_entry_first` and `stock.expiry_writeoff_grace_days`.
Not ported: reason-master maintenance routes (a separate screen), Save & Print (disabled in Qt too), column
drag/resize.
Decisions: F8 returns to the list; add/remove line are Alt+= / Alt+− (Qty must accept a typed "-"); the expiry
pick cut-off adds the grace days (what the server accepts); the "takes N but holding has M" check waits until
the holding is known (Qt treats unknown as 0); client problems judged on DRAFT only; barcode resolved from the
item search on Enter; list Delete only on DRAFT rows; re-picking an item also clears the old lot's sale price
and serial.

### Change Selling Price — done (tsc clean, 127 tests, eslint clean)

`features/stocks/selling-price/`: header with This branch / All branches switch (HQ only) and the changed-rows
chip, filter strip + "Filter items" dialog (search, seven dropdowns, active only; paged 1000 at a time up to
20,000), grid on ui-table 44 by column number (qtPercent widths, price-level band, Src chips, changed / red /
amber tints, change chip), every cell edit and recompute ported from Qt and checked against the server's
`recomputeLevel`, item picker scoped to company/branch, barcode on the blank line, a re-added item becomes a new
bucket row, the three cards, F12 bucket list, validation strip (red disables Save), Save of changed rows with
the below-cost confirm / no-stock note / 422 marking, F5 / Ctrl+Enter / F7 / F8 / F12, `inventory.below_cost_price`.
Not ported: a bulk apply-% dialog (Qt has none). Differences: column visibility follows ui-table 44, where
Barcode, Cost B.Tax and Base Rate A were hidden by hand on 2026-10-01 (Qt forces them visible) — barcode
scanning needs Barcode turned back on in Grid settings; Shift+Enter instead of Backspace to go back; margin may
differ from the server in the 6th decimal (display only). Additions: "Save column widths" after a drag (pixel
widths only); grids over 300 rows draw only the visible window.

## Verification (all four together)

- `tsc --noEmit`: 0 errors, whole client.
- `vitest run`: 176 files, 2,982 tests passed (39 skipped, as before); the four screens add 363 tests.
- `eslint features/stocks app/stock`: 0 errors, 13 warnings (setState-in-effect / memoization, the same kinds the
  sales screens carry).
- No RTK endpoint name collides (34 new endpoints).
- The dev server on :3001 compiles all four routes (HTTP 200, no build errors).
- **Not yet done:** a logged-in run of each screen against the dev server — none of the builders had
  credentials, so no server call has been made from the new screens.
