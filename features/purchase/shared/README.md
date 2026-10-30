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
| `readMoreColumns(screenKey, fallback)` / `writeMoreColumns(screenKey, shown)` / `toggleMoreColumn(shown, key)` | the "More columns" choice, kept in localStorage per screen |
| `PurchaseSourceChoice` `{kind, id, text, done?}`, `purchaseSourceRows(choices, headings?)`, `DEFAULT_SOURCE_HEADINGS` | source picker list with a heading per kind |

## Views — `components/purchase-parts.tsx`

| component | props |
|---|---|
| `PurchaseSectionHeading` | `title` (THE HEADER …), `hint?` (grey mono), `actions?: ReactNode`, `className?` |
| `PurchaseStatusPill` | `status` (server word), `label?` (override text), `tone?`, `title?`, `className?` |
| `PurchaseCheckChip` | `text`, `tone?: PurchasePillTone`, `title?` — in-cell chip (OK / SHORT 2 / DONE / PART) |
| `PurchaseTotalsStrip` | `cells: {key, caption, value, tone?: "good"\|"warn"\|"bad"\|"muted"\|"info", strong?, title?}[]` — empty value shows "—"; `title` = the cell's tooltip (GRN Provisional value); `info` = Qt's blue (Dues GST held, Return Replace qty due) |
| `PurchaseTotalsPanel` | `rows: {key, caption, value: ReactNode, tone?, strong?, ruleBefore?}[]` — boxed two-column TOTALS |
| `PurchaseWarnStrip` | `warnings?`, `refusals?`, `overrideAllowed`, `overrideTicked`, `onOverrideChange(b)`, `hintAllowed?`, `hintNoRight?`, `noOverride?` — renders nothing when there are no rows; tick enabled only with the right AND a WARN with `needsRight = OVERRIDE` |
| `purchaseOverrideActive(warnings, refusals, allowed, ticked)` | true = send `overrideWarnings: true` (Qt `overrideTicked`) |
| `PurchaseMoreColumns` | `columns: {key, label, disabled?, title?}[]`, `shown: string[]`, `onToggle(key)`, `caption?` |
| `PurchasePickerBox` | `id`, `text`, `disabled?`, `placeholder?`, `title?`, `onPick()`, `onClear?()` — Qt PurchasePickerCombo: a box whose ▾ / click / F4 / Alt+↓ / Space opens a picker, Delete clears; stays in the header Enter walk (`data-quotation-focus`) |
| `purchaseFigureClass(tone)` | the class for a coloured figure in your own grid cell (Pending orange …) |

`use-purchase-scope.ts` also exports `usePurchaseCompanySubtitle()` → "Company · Branch" for the line under the title.

## Dialogs

| component | props |
|---|---|
| `components/purchase-transport-dialog.tsx` `PurchaseTransportDialog` | `open`, `band`, `companyId`, `readOnly?`, `showCrew?` (default true; GRN false), `onClose`, `onApply(band \| null)` — dropdown TRANSPORTERS (55, binds `itrn_company_id`); Enter walks, Ctrl+Enter OK, Esc closes |
| `components/purchase-source-picker.tsx` `PurchaseSourcePicker` | `open`, `choices`, `multi?`, `headings?`, `hint?`, `title?`, `loading?`, `onPick(kind, id)`, `onPickMany(ids)`, `onClose` — the list takes the focus when it mounts (Ctrl+L then Enter picks); Enter / double-click picks; multi: Space ticks |
| `components/purchase-agent-picker.tsx` `PurchaseAgentPicker` | `open`, `companyId`, `onPick({id, name, code, city, commPct})`, `onClose` — grid 194 MAIN LIST - PURCHASE AGENTS (`icompany_id`, `iinactive` always sent) |
| `components/purchase-alloc-dialog.tsx` `PurchaseAllocDialog` | F12 batches / serials (props in `purchase-dialogs.types.ts`). **`embedded`** = Qt's inline panel (GRN, Shortage, Purchase Entry): no window, no OK; `onEdited(rows)` on every edit that adds up, `onProblem(text)`, Esc closes, Ctrl+Del removes a row; key it by the opening (`seq`). Modal without `embedded`. `focusAllocPanel()` puts the cursor back in it |
| `use-purchase-alloc-panel.ts` `usePurchaseAllocPanel()` | the panel's slot on a screen: `{target, open(next, {lineNoOf, editable, noun?}) → hint, close, onProblem}` — F12 again on its line focuses it; another line is refused while the split does not add up (Qt wording) |
| `components/purchase-payee-dialog.tsx` `PurchasePayeeDialog` | who is owed an off-bill charge (dropdown EMPLOYEES BY DESIGNATION, role LOADMAN) — Purchase Entry and GRN |
| `components/purchase-charge-cell.tsx` `PurchaseChargeNumberCell` | a charge row's Rate / Amount cell (both charge grids): local copy while typed, commit on Enter / leave, Esc reverts |

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
| `dropHandoffQuery(route)` | the receiving page takes the query off the URL (History API, no navigation) once it has read it |

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
