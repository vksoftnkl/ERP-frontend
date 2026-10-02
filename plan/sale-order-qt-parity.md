# Sale Order Entry — bring the Next.js screen up to the Qt one

Written 2026-10-02 from a field-by-field read of:

- **Qt** `~/VKNexERP/NexERP/src/modules/sales/saleorder/` (`sale_order_entry.{h,ui,cpp}`, 6,200 lines) plus the
  shared pieces it leans on (`sales_item_entity.h`, `sale_bill_tender.cpp`, `charge_grid_controller.cpp`,
  `txn_doc_types_sales.cpp`, `app_session.cpp`).
- **Next.js** `~/Dev/erp/ERP client/features/sales/sale-order/` (25 files, 9,400 lines) and the quotation
  components it reuses.
- **Server** `~/Dev/erp/ERP server/src/modules/sales/sale-order/` (DTOs, README, lifecycle routes).

The React port is complete in shape — header, 96-column grid, charges, advance tender, quotation import,
credit panel, list, print from the lists — and ahead of Qt in several places (barcode lookup, Alt+R row
copy, units dropdown, fulfilment strip, discard guard, 180 tests). What it lacks against Qt falls into six
groups below. Nothing here touches the server.

## 0. Already equal — no work

Header fields and defaults (order/delivery/valid-until/priority/mode/slot/term/price level/salesman/agent/
packed-by/5 option boxes/POS), the 96-column grid and its arithmetic (discount-first vs standard, GST/cess
split, size → CFT, freight/loading per line, min-price/MRP checks), charges grid + role distribution,
totals strip (incl. profit and savings), advance dialog (instrument panel, F1 pay balance, hotkeys, the
gate list), quotation import with the customer lock, copy-as-new, delete, list grid 87, credit panel + the
confirm-not-refuse credit gate, URGENT-needs-remarks, dates ≥ order date, the order list's print.

## 1. Gaps

### G1 — Settings. Qt reads ~20 `app_setting` keys; React reads none (hard-coded constants)

| Key (catalog default) | Qt use | React today |
|---|---|---|
| `sales.default_price_level` (1) | initial price level | constant 1 |
| `sales.disc_alter_base_rate` (false), `sales.round_off_step` (1), `sales.freight_calc_type` (item_basis), `sales.loading_calc_type` (item_basis) | the document's pricing policy on a new order (`soDiscAlterBase/RoundOffStep/FreightCalcType/LoadingCalcType`) | fixed `manual / manual / false / 1` |
| `sales.default_delivery_mode` (STORE_PICKUP) | Delivery Mode default | constant |
| `sales.default_validity_days` (7) | — (Qt hard-codes 30 too) | constant 30 → read the setting, both sides agree afterwards |
| `system.company_state_code` (33) | POS default + local/inter-state test | POS hard-coded "33"; company state fetched separately |
| `system.regional` | regional names on lookups | derived from the user's language |
| `sales.salesman_mandatory` (false) | "Select a salesman." | validation context exists but is never fed |
| `sales.auto_pop_qty` (false) | qty 1 on a fresh line | — |
| `sales.allow_duplicate_item` (true) | off → bump the existing row's qty +1 and park the cursor there; on → confirm "already on row N. Add it again?" | info toast, always allowed |
| `sales.free_item_tax` (false) | rate 0 allowed on a non-free row | "has no rate" always refused |
| `inventory.edit_price` (true) | Rate editable, price-level change/step allowed | only the USER flag `usrEditRate` |
| `inventory.skip_mrp` (false) | skip "Rate cannot exceed MRP." | constant false |
| `inventory.price_level_count` (4) | Ctrl+1..N and the stepping range | constant 4 |
| `sales.tender_type` (all_bills) | F5 route: `all_bills` → tender; `cash_bills` → tender only on Cash; `none` → plain save | F5 always opens the dialog, nothing saves on OK |
| `sales.tender_print_only` (false) | dialog's Save button disabled | — |
| `sales.allow_excess_tender` (false) | "cannot exceed the bill amount" gate | gate exists, flag never passed |
| `sales.auto_post` (true) | new order saved as `CONFIRMED`, else `DRAFT` | always `DRAFT` |
| `sales.allow_customer_change_on_import` (false) | unlocks the customer on an imported order | always locked (`isCustomerLocked` already takes the flag) |
| `sales.clear_delivery_on_clear` (false) | Clear keeps salesman / packed-by unless on | Clear wipes everything |

Build: `features/sales/sale-order/use-sale-order-settings.ts` on `useGetEffectiveSettingsQuery` (the shape
of `features/accounts/receipt/state/use-receipt-settings.ts`), typed `SaleOrderSettings`, defaults = the
catalog defaults above. Thread it through `createOrderDraft` (policy, dates, mode, level, POS), the hook
(validate context, pick/duplicate/qty rules, Ctrl+N count, status on save, lock, clear) and the view (F5
route, tender dialog buttons).

### G2 — Save routes, tender → save, print

| Qt | React today | Work |
|---|---|---|
| Buttons **Save - F5** / **Tender - F5** are mutually exclusive by `sales.tender_type`; **Save & Print - F6** | Tender F5 (records rows only) and Save & Print F6 (the only save) | toolbar + F-keys follow the route; a plain Save exists when the route says no tender |
| Tender dialog OK = **Save** / **Save & Print** → validates, then saves the order at once with the tendered money; `tender_print_only` greys Save | dialog OK stores the rows; the operator must press F6 | dialog gets `onApply(tenders, settlement, print)` with two buttons; the view saves immediately after |
| Save & Print prints through the print-options dialog (purpose SALE_ORDER); **F11 Last Order** reprints the order saved last in this session ("No order has been saved on this screen yet…") | F6 toasts "Printing is not available yet — the server has no print endpoint" — stale: the list and the F8 picker already print through `PrintOptionsDialog` with `/print-render/preview`; F11 LOADS the latest order instead | after a successful save with print, open `PrintOptionsDialog` for the saved document; remember it as `lastSaved`; F11 reprints it, info toast when none |
| `soPayMode` = type of the largest tender line | never sent | add to the payload |
| "Order <refno> saved successfully." | "Order <refno> saved." | wording |

### G3 — Price level behaviours

| Qt | React today | Work |
|---|---|---|
| Changing the header Price Level asks **Apply to Selected / Apply to All** and re-fetches prices for those rows; refused (snaps back) when `inventory.edit_price` is off; only "All" moves the document level | header select changes only the level NEW lines get; existing lines keep theirs | route the header select through the existing `PriceLevelPrompt` + `applyPriceLevel` |
| **Ctrl+`+` / Ctrl+`-`** step the CURRENT ROW's price level one position (clamped to `price_level_count`) and re-fetch | Ctrl+± insert / remove a row | add `onStepPriceLevel` to `ItemGrid`; when a screen supplies it Ctrl+± step the level and **Alt+`+` / Alt+`-`** insert / remove (decision D1); hint line updated |
| Ctrl+1..N with N = `inventory.price_level_count` | fixed 1..4 | from settings |

### G4 — Quick actions (Qt's icon strip)

| Qt | React | Work |
|---|---|---|
| **Disc % All — Alt+D**: "Apply discount % to every item:" 0..100 → every non-free line: clear per-qty / amount, set DiscPerc | — | number prompt + `linesDiscountApplied` reducer |
| **± Price**: "Increase (+) / decrease (−) every rate by %:" −100..100 → Rate × (1 + p/100) on non-free lines | — | number prompt + `linesRateScaled` reducer |
| **Cost — Alt+O**: "<item> · Cost: x · Cost (pre-tax): y" for the current row | — | info toast |

### G5 — Validation and entry rules

| Qt | React today | Work |
|---|---|---|
| Role gate at save: FREIGHT / LOADING / UNLOADING computed on the items (Σ > 0, box ticked, policy not manual) but no charge row with that role → "<Role> of <amt> is calculated on the items, but the charges grid has no <Role> line — the amount would not be billed. Add the <Role> charge, or untick <Role>." | no such check | add to `validateSaveInputs` after the ledger check |
| Credit gate skipped when the customer's `overdue_billing` is true (the master allows billing while overdue) | gate ignores the flag | honour `customer.overdueBilling` |
| Duplicate item → merge or confirm by setting (G1) | toast only | hook `pickItem` |
| Option boxes Freight / Load / Unload / Promo each confirm "Apply <X> on this order?" / "Remove <X> from this order?" (title "Order Option") | silent toggle | confirm modal (decision D4) |
| Term: default Cash; forced to Cash when the customer's `debit_allowed` is false; switched to Credit only when the tender dialog returns credit | customer pick sets CREDIT whenever `debit_allowed`; switching to CASH opens the tender dialog | follow Qt: keep the default, force Cash only when not allowed, no dialog on the Term change |
| Edit (F2) on a CANCELLED order: "A cancelled order can't be edited — raise a new one." | cancelled rows open read-only; Edit is just greyed | message on F2 |

### G6 — Header and list details

| Qt | React today | Work |
|---|---|---|
| Delivery Date defaults to the app date | blank | default today |
| Audit line "created <by> · <on> · modified <by> · <on>" in the title bar | not shown (the GET carries `soCreatedBy/On`, `soModifiedBy/On`) | add to the title meta |
| `soCustPin` sent | never sent | from `cust_pin` |
| Enter walks the header fields (NexDialog Enter-as-Tab) | no header walk on this screen (the quotation has `moveHeaderFocus`) | wrap the four header blocks like the quotation's `header-blocks.tsx:437` |
| List row policy: CANCEL → no edit / delete "Cancelled — raise a new order instead."; CLOSED / COMPLETED → no edit / delete "Fully delivered — this order is closed."; PARTIAL → no delete "Partly delivered — delete is blocked." | Edit disabled on cancelled only; Delete allowed everywhere | `isRowEditDisabled` / `isRowDeleteDisabled` + reasons |
| List delete: "Delete order "<ref>"? This cannot be undone." → "Order "<ref>" deleted." | shell default confirm; success toast already matches | confirm message |

## 2. Not ported, on purpose

- Qt's hidden / stubbed pieces: `grpAdvance` (hidden "until the advance ledger is wired"), `lblStockInfo`
  (sits inside the hidden group), `applySchemePromotion()` (empty), 13 "coming soon" icon buttons, the
  `godownId` lookup param TODO, `tdPartyLedgerId` null. React mirrors the live behaviour, not the stubs.
- Qt's `grpTerms` is hidden off-screen; React shows Terms (Remarks is where URGENT's reason goes, so
  showing it is the better reading of the same rule).
- React features Qt lacks stay: barcode → item lookup, Alt+R, units dropdown, size-entry hook, fulfilment
  strip, discard guard, `beforeunload`, credit-override memory, quotation import stamping `srcLineNo`.
- `soDeviceId`: Qt sends the session device (`fixed.device_master`); React a browser uuid. The DTO calls it a
  real FK. Out of this plan's scope, flagged.
- Server lifecycle routes `/post`, `/cancel`, `/amend` — neither client calls them yet.

## 2b. Status (2026-10-02, same day) — built, uncommitted

All six groups are in, on `dev`, uncommitted:

- G1 — `sale-order.settings.ts` (+ 6 tests), `use-sale-order-settings.ts`; `createOrderDraft` /
  `emptyOrderHeader` take `OrderHeaderDefaults`; the hook seeds policy, POS, price level, delivery mode,
  validity, salesman carry-over, duplicate rule, auto-qty, free-rate, edit-price, skip-MRP, level count,
  tender route, print-only, auto-post status, import lock, clear-delivery from the settings. An untouched
  screen is re-seeded once the settings land.
- G2 — toolbar `saveRoute` (Tender F5 | Save F5); tender dialog `saveOnApply` / `savePrintOnly` with
  Save (F5) / Save & Print (F6) → the view saves on the next render; `PrintOptionsDialog` after Save &
  Print; F11 reprints the last saved order; `soPayMode`; "saved successfully".
- G3 — header Price Level → `PriceLevelPrompt` + reprice (refused when prices are locked, direct when no
  lines); `ItemGrid` gained `priceLevelCount` and `onStepPriceLevel` (Ctrl+± steps, Alt+± rows, on this
  screen only); hint line updated.
- G4 — `NumberPromptModal`; Alt+D (`linesDiscountPercApplied`), ± Price (`linesRateScaled`), Alt+O cost
  toast; three icons on the strip.
- G5 — `chargeRoleGate`; `creditGate` honours `overdueBilling`; `freeItemTax`; duplicate merge / confirm;
  option-box "Order Option" confirm; Term rule (`customerApplied` forces CASH only); F2 on a cancelled order.
- G6 — delivery date = order date; audit line in the title bar (`draft.audit`); `soCustPin` (shared
  `CustomerSnapshot.pin`); header Enter-walk; list row policy (CANCELLED / CLOSED / COMPLETED / PARTIAL) and
  the delete confirm wording.

Tests: `sale-order.parity.test.ts` (14) + settings (6); whole client suite green; `tsc` clean.
Manual checks still to do against the dev server: a tender-route save with an advance; Save & Print opening
the print dialog; the settings actually changing the defaults (set `sales.tender_type` = `none` and watch
F5 become Save).

## 3. Phases

| Phase | Scope | Verify |
|---|---|---|
| 1 | G1: `use-sale-order-settings.ts` + `SaleOrderSettings`; `createOrderDraft` / `clear` / policy / POS / defaults from it; validate context; duplicate / auto-qty / free-rate rules; Ctrl+N count; `soStatus` on new; lock flag; clear-delivery | unit tests on the settings parser and the pure rules; `tsc` |
| 2 | G2: Save (F5) vs Tender (F5) route; dialog Save / Save & Print → immediate save; `PrintOptionsDialog` after save-and-print; F11 reprint; `soPayMode`; wording | payload tests (`soPayMode`, `soStatus`); manual: save with tender |
| 3 | G3: header Price Level → prompt + reprice; Ctrl+± row price-level step (grid prop); Alt+± rows | manual |
| 4 | G4: Disc % All (Alt+D), ± Price, Cost (Alt+O) | reducer tests |
| 5 | G5 + G6: role gate; `overdue_billing`; option-box confirm; Term rules; F2 message; delivery date default; audit line; `soCustPin`; header Enter-walk; list row policy and messages | validate tests; `tsc`; full `vitest run` |

## 4. Decisions (defaults taken unless told otherwise)

| # | Question | Taken |
|---|---|---|
| D1 | Ctrl+± today inserts / removes rows on both sales grids; Qt uses it to step the row's price level and bare `+`/`-` for rows (not possible in a web grid whose cells are inputs). | Order screen: Ctrl+± = price level (Qt), Alt+± = rows. Quotation unchanged. One constant to swap. |
| D2 | F11: Qt reprints the last SAVED order; React loads the latest order. | Qt's meaning. The latest order is one F8 away. |
| D3 | Customer pick: Qt keeps Term as is (forces Cash only when credit is not allowed); React flips to CREDIT for every credit-allowed customer. | Qt's rule. |
| D4 | The four option-box confirms add a click per tick. | Ported as Qt does it; drop if the operators object. |
| D5 | Print after save: Qt and the React lists both go through the print-options dialog (operator picks the design). | Same dialog; no silent default print. |
| D6 | `sales.default_validity_days` is 7 in the catalog; both screens hard-coded 30 until now. | The setting is read, so a new order defaults to 7 days unless the setting is changed (or set to 30 to keep the old behaviour). |
