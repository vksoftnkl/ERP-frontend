# features/purchase/shared — the purchase screens' shared layer

Owned by the Purchase Invoice / PO port. The other purchase screens (GRN, Return, Supplier Dues,
Shortage) USE these parts; ask before changing one. Web port of Qt `purchase/common/purchase_parts.*` +
`invoice/purchase_invoice_parts.*` (NexERP 2026-10-29 fidelity rebuild, approved mockups
`share/purchase/purchase_*_ui_mockup.png`). Look = design-system tokens (`--ds-*`) only, no one-off colours.

Older layer: `purchase.doc-types.ts`, `components/purchase-list-view.tsx`,
`components/purchase-document-page.tsx`, `use-purchase-scope.ts`, `purchase.format.ts`, F12 / attach /
labels dialogs (`purchase-dialogs.types.ts`), `purchase-handoff.ts`.

## Pure logic — `purchase-parts.ts` (tested in `purchase-parts.test.ts`)

| export | what |
|---|---|
| `PurchaseIssue` | one `warnings[]` / `refusals[]` / 422 `errors[]` row `{code, level, lineNo, field, message, needsRight}` |
| `purchaseIssueRows(warnings, refusals)` | → `{rows, refusals, overridable}`; warnings first, dedupe code+message, no level in refusals = REFUSE, `PUR_` stripped in `shortCode` |
| `PurchaseTransportBand` | `{mode, transporterId, transporterName, transporterGstin, lrNo, lrDate (ISO), distanceKm, remarks, vehicleNo?, driverName?}` — /save: omit = keep, `null` = remove |
| `transportFormOf(band)` / `transportBandOf(form, withCrew=true)` | /get band → form text; form → band (blanks dropped; `null` when empty). `withCrew=false` never sends vehicle/driver (GRN) |
| `transportSummary(band)` | "LR 88412 · KPN Parcel · 24/10/2026 · Road · 120 km · TN38AB1234" |
| `purchaseStatusTone(status)` / `purchaseStatusLabel(status)` | pill tone (`neutral/info/success/warning/danger`) / "PART_RECEIVED" → "PART RECEIVED" |
| `readMoreColumns(screenKey, fallback)` / `writeMoreColumns(screenKey, shown)` / `toggleMoreColumn(shown, key)` | the "More columns" choice, kept in localStorage per screen. **No screen uses it now**: Purchase Entry dropped its chooser (Qt dd59c2c P4 — ui_table 56 decides the columns) |
| `PurchaseSourceChoice` `{kind, id, text, done?}`, `purchaseSourceRows(choices, headings?)`, `DEFAULT_SOURCE_HEADINGS` | source picker list with a heading per kind |

## Views — `components/purchase-parts.tsx`

| component | props |
|---|---|
| `PurchaseSectionHeading` | `title` (THE HEADER …), `hint?` (grey mono), `actions?: ReactNode`, `className?` |
| `PurchaseStatusPill` | `status` (server word), `label?` (override text), `tone?`, `title?`, `className?` |
| `PurchaseCheckChip` | `text`, `tone?: PurchasePillTone`, `title?` — in-cell chip (OK / SHORT 2 / DONE / PART) |
| `PurchaseTotalsStrip` | `cells: {key, caption, value, tone?: "good"\|"warn"\|"bad"\|"muted"\|"info", strong?, title?}[]`, `columns?` — empty value shows "—"; `title` = the cell's tooltip (GRN Provisional value, PO total's make-up); `info` = Qt's blue (Dues GST held, Return Replace qty due). **`columns`** (opt-in, Qt `setGridColumns`, NexERP 721dabe) = n cells to a row, a block (the PO: 3, beside its charges); without it the strip stays ONE row (GRN, Return, Shortage, Dues) |
| `PurchaseTotalsPanel` | `rows: {key, caption, value: ReactNode, tone?, strong?, ruleBefore?}[]` — boxed two-column TOTALS |
| `PurchaseWarnStrip` | `warnings?`, `refusals?`, `overrideAllowed`, `overrideTicked`, `onOverrideChange(b)`, `hintAllowed?`, `hintNoRight?`, `noOverride?` — renders nothing when there are no rows; tick enabled only with the right AND a WARN with `needsRight = OVERRIDE` |
| `purchaseOverrideActive(warnings, refusals, allowed, ticked)` | true = send `overrideWarnings: true` (Qt `overrideTicked`) |
| `components/purchase-dropdown-masters.tsx` `usePurchaseDropdownMasters({supplier, agent, godown})` | **opt-in (2026-11-05, Qt 6b81080 COM-05)**: Alt+C / Alt+A on the Supplier (menu 22), Agent (menu 28) and Godown (menu 39) dropdowns open the real master with its list hidden (the customer bridge's way), the saved record selected in the field; each master's own rights decide. Needs the masters' opt-in props: `SuppliersMasterPage` / `PurchaseAgentMasterPage` got `inlineModalOnly`, `onCrudControllerReady`, `onModalOpenChange`, `onSupplierSaved` / `onAgentSaved` (Godown had them). Purchase Entry registers it |
| `components/purchase-notes.tsx` `PurchaseNotesLine` / `PurchaseNotesPopup` | **opt-in, COM-09** (Qt 6b81080 `purchase_notes`, the Sale Bill's way; Purchase Entry uses it, 2026-11-05). `PurchaseNotesLine` `{warnings, refusals, onView}` = the footer's "2 warnings · View" (nothing when empty). `PurchaseNotesPopup` `{open, warnings, refusals, verb: {key: "post"\|"save", label} \| null, refused?: "post"\|"save", overrideAllowed, noOverride?, onBack, onProceed(tickedCodes)}` — refusals first, REFUSE / WARN pill · code · "line 4 — message"; asked before a verb it offers Back + the verb (Post hidden on a refusal; a draft save — `verb.key = "save"` — still offered, the server keeps the draft); an Override tick per WARN with `needsRight = OVERRIDE` (only with the right); the screen asks the reason when a tick comes back and sends `overrideWarnings` + `overrideReason`. Pure side in `purchase-parts.ts`: `purchaseNotesOf` (line from `lineNo` or `lines.3.x`, the server's "Line N" dropped), `purchaseNotesCount`, `purchaseNotesTitle` |
| `PurchaseMoreColumns` | `columns: {key, label, disabled?, title?}[]`, `shown: string[]`, `onToggle(key)`, `caption?` — unused since Purchase Entry dropped it (Qt dd59c2c P4) |
| `PurchasePickerBox` | `id`, `text`, `disabled?`, `placeholder?`, `title?`, `onPick()`, `onClear?()` — Qt PurchasePickerCombo: a box whose ▾ / click / F4 / Alt+↓ / Space opens a picker, Delete clears; stays in the header Enter walk (`data-quotation-focus`) |
| `purchaseFigureClass(tone)` | the class for a coloured figure in your own grid cell (Pending orange …) |
| `components/purchase-quick-bar.tsx` `PurchaseQuickBar` | **opt-in** (Qt `frameQuick`, NexERP e782e59; Purchase Entry P1): `label` (toolbar name), `groups: PurchaseQuickAction[][]` (a separator between groups), `onRefused?(why)`, `trailing?`, `className?`. An action = `{key, label, icon, onClick, tip?, keyHint?, disabled?, disabledReason?, active?}`. Icon-only; every glyph drawn at ONE size whatever its set (Qt 721dabe); a disabled button stays hoverable and its click hands `quickActionTitle` (pure, `purchase-parts.ts`: "Make GRN — why not  (Ctrl+G)") to `onRefused`; buttons take no focus (Qt NoFocus). Used by the PO (9 buttons, one group) and Purchase Entry (17 buttons, five groups — Qt 7d8c926) |
| `components/purchase-agent-dropdown.tsx` `PurchaseAgentDropdown` | **opt-in**: `id`, `companyId`, `value`, `selectedLabel`, `disabled?`, `label?` ("Agent"), `placeholder?`, `onSelect(id, name)` — the PURCHASE AGENTS dropdown found BY NAME (`lib/configured-dropdowns` key `purchaseAgent`, fallback 74; binds quoted `'icompany_id'`, always sent), columns `pag_id` / `pag_name` / `pag_code`. Type to search; Backspace / Delete on the picked name = `onSelect("", "")`. Renders a label + field pair (`display: contents`), straight into the screen's grid. The PO (Qt e782e59 ddAgent) and Purchase Entry (Qt dd59c2c P3) use it |

`use-purchase-scope.ts` also exports `usePurchaseCompanySubtitle()` → "Company · Branch" for the line under the title.

## Dialogs

| component | props |
|---|---|
| `components/purchase-transport-dialog.tsx` `PurchaseTransportDialog` | `open`, `band`, `companyId`, `readOnly?`, `showCrew?` (default true; GRN false), `onClose`, `onApply(band \| null)` — dropdown TRANSPORTERS (55, binds `itrn_company_id`); Enter walks, Ctrl+Enter OK, Esc closes. **2026-11-05 (Qt 6b81080, every screen that opens it):** Enter on Remarks = OK, Tab from Remarks lands on OK — Clear is out of the walk (mouse only, quiet look), the rows have no vertical gap |
| `components/purchase-source-picker.tsx` `PurchaseSourcePicker` | `open`, `choices`, `multi?`, `headings?`, `hint?`, `title?`, `loading?`, `onPick(kind, id)`, `onPickMany(ids)`, `onClose` — the list takes the focus when it mounts (Ctrl+L then Enter picks); Enter / double-click picks; multi: Space ticks |
| `components/purchase-agent-picker.tsx` `PurchaseAgentPicker` | `open`, `companyId`, `onPick({id, name, code, city, commPct})`, `onClose` — grid 194 MAIN LIST - PURCHASE AGENTS (`icompany_id`, `iinactive` always sent). No screen uses it now (PO and Purchase Entry have `PurchaseAgentDropdown`) |
| `components/purchase-alloc-dialog.tsx` `PurchaseAllocDialog` | F12 batches / serials (props in `purchase-dialogs.types.ts`). **`embedded`** = Qt's inline panel (GRN, Shortage): no window, no OK; `onEdited(rows)` on every edit that adds up, `onProblem(text)`, Esc closes, Ctrl+Del removes a row; key it by the opening (`seq`). Modal without `embedded`. `focusAllocPanel()` puts the cursor back in it. **2026-11-05 (Qt c0dbff1, COM-08 / PE-14):** the modal is Purchase Entry's F12 popup — no sentence over the grid, the Σ ("Σ 52 = 46 received + 2 damaged + 4 free  ✓", serials "3 of 3 serials  ✓") in the footer beside OK / Cancel, Ctrl+Enter = OK (rows off: a message says why), Cancel out of the Tab / Enter walk, Close only when read-only, the focus back to the opener on close. In BOTH modes no date placeholder in a cell (a filled row's blank date reads "—"); the inline panel's Σ moved into its head (where the static hint was), nothing else changed for GRN / Shortage. Pure helpers: `allocSumLine`, `allocValidSerials`, `allocPopupTitle`, `allocOffWarning` (`purchase-alloc.ts`) |
| `use-purchase-alloc-panel.ts` `usePurchaseAllocPanel()` | the panel's slot on a screen: `{target, open(next, {lineNoOf, editable, noun?}) → hint, close, onProblem}` — F12 again on its line focuses it; another line is refused while the split does not add up (Qt wording) |
| `components/purchase-payee-dialog.tsx` `PurchasePayeeDialog` | who is owed an off-bill charge (dropdown EMPLOYEES BY DESIGNATION, role LOADMAN) — Purchase Entry and GRN |
| `components/purchase-charge-cell.tsx` `PurchaseChargeNumberCell` | a charge row's Rate / Amount cell (both charge grids): local copy while typed, commit on Enter / leave, Esc reverts |

## Line math — `purchase-line-math.ts` (tested in `purchase-line-math.test.ts`)

**Opt-in** (Qt `PurchaseLineMath`, NexERP dd59c2c): `r2` (half-up, 2 places), `taxOn(taxable, gstPct, interState)`
(CGST + SGST each rounded, or one IGST), `calcPurchaseLine({qty, rate, discPct?, schPct?, gstPct?, discAmt?, schAmt?,
extraAmt?}, interState)` → `{gross, discAmt, schAmt, taxable, tax, total}` — a typed % wins over its amount, the scheme
comes off the discounted value, the extra disc always. An ESTIMATE of the server's calcPurchase. Purchase Entry uses it
(invoice/invoice-figures.ts, P11); the PO keeps its own copy (order/po-line-math.ts, percentages only).

## Charges — `purchase-charges.ts` (+ `purchase.api.ts` `useGetPurchaseChargeMasterQuery`)

One master read (`/charges/get?chgModule=P`) and the rules both screens share: `PurchaseChargeMasterRow`, `masterOnBill`,
`offBillMasters`, `chargeMethodLabel(method, "invoice" | "grn")` (each screen's own Basis words, as Qt), `deductPrefixed`,
`LEDGER_PAYEE` / `ON_BILL_PAYEE` / `ledgerPayee`, `payeesDto`. Each screen keeps its own row model and grid on top
(invoice/invoice-charges.ts — on-bill + GST; grn/grn-charges.ts — off-bill only, the coolie per loadman).

`purchase.format.ts` also has `shortRef` ("PUR/2026-2027/D14/00012" → "PUR/…/00012"), for Shortage and Supplier Dues.

## Hand-offs — `purchase-handoff.ts` (all of them)

| export | what |
|---|---|
| `buildReturnAgainstBillHref` / `parseReturnAgainstBill` | Purchase Entry Ctrl+F11 → Purchase Return (`?againstBill=`) |
| `buildGrnFromPoHref` / `parseGrnFromPo` (`GRN_ROUTE`) | PO Make GRN · Ctrl+G → GRN (`?fromPo=<poId>&accYear&supplierId&supplierName&refno[&godownId&godownName]`): a new GRN on the supplier + godown, the PO's pending lines in (From PO) |
| `buildReturnAgainstGrnHref` / `parseReturnAgainstGrn` | GRN Reject → Purchase Return against the GRN (`?againstGrn=`) |
| `buildBillFromGrnHref` / `parseBillFromGrn` (`PURCHASE_ENTRY_ROUTE`) | GRN Make bill · Ctrl+B → Purchase Entry (`?fromGrn=`): a new bill on the supplier + godown, the GRN's lines in |
| `buildBillFromPoHref` / `parseBillFromPo` (`PURCHASE_ENTRY_ROUTE`) | PO Make Purchase Invoice (Qt e782e59 `makeInvoice`) → Purchase Entry (`?fromPo=…`, the Make GRN query on the bill's route): a new bill on the supplier + godown, the PO's pending lines in (From PO). Purchase Entry reads it (invoice/page.tsx → entry view `fromPo`, the `fromGrn` path's twin: supplier + godown first, `api.lines.fillFromPo` once the PO is in its From PO list) |
| `dropHandoffQuery(route)` | the receiving page takes the query off the URL (History API, no navigation) once it has read it |
| `buildSupplierLedgerHref(supplierId)` (`LEDGER_STATEMENT_ROUTE`) | **opt-in (2026-11-05, Qt COM-01)**: Ledger Statement on the supplier's ledger (`?ledger=`; the statement's defaults give year start → today, login branch). Purchase Entry's quick Ledger |
| `buildSupplierDuesHref(supplierId, supplierName)` (`SUPPLIER_DUES_ROUTE`) | **opt-in (2026-11-05)**: Supplier dues filtered on the supplier. Purchase Entry's quick Supplier dues |

A receiving page reads the hand-off once (`useState` initialiser), opens its entry view with it unless an unsaved
document of its own is remembered (then that one reopens and a toast says how to repeat the hand-off), and lands on
the list when that entry closes.

## Example

```tsx
<PurchaseSectionHeading title="THE LINES" hint="as printed · batch / serial on the row OR split in F12" />
<PurchaseWarnStrip warnings={calc.warnings} refusals={calc.refusals} overrideAllowed={rights.override}
  overrideTicked={tick} onOverrideChange={setTick} />
<PurchaseTotalsStrip cells={[{ key: "lines", caption: "Lines", value: "5" },
  { key: "total", caption: "PO total (incl. est. charges)", value: money(t.poTotal), strong: true }]} />
```
