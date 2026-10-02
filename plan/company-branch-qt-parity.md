# Company + Branch masters — bring the Next.js screens up to the Qt ones

Written 2026-10-02 from a side-by-side read of:

- **Qt** `~/VKNexERP/NexERP` @ `09f8896` — `src/modules/admin/master/company/{company_entry,company_list,company_dc_purposes_widget}.cpp`,
  `src/modules/admin/master/branch/{branch_entry,branch_list}.cpp`, `src/core/utils/tax_validator.cpp`.
- **Next.js** `~/Dev/erp/ERP client` @ `0ba5c67` (dev) — `features/masters/settings/companies/{module.ts,page.tsx}`,
  `features/masters/settings/branches/page.tsx`.
- **Server** `~/Dev/erp/ERP server` — `src/modules/settings/{companyMaster,branchMaster,gstinLookup,shared}`,
  `plan/notes-72-company-branch.md`, and the dev DB (`fixed.dropdown_details`, `fixed.grid_details`, column defaults).

The Qt forms are the newer spec (built against notes 72). This plan lists what the React screens lack
against them and how to close each gap. Nothing here touches the server.

## 0. Already aligned — no work

| Piece | Both sides use |
|---|---|
| List grids | 52 `MAIN LIST - COMPANYS` (`icomp_is_deleted`), 56 `MAIN LIST - BRANCHES` (`ibr_is_deleted`) — `lib/configured-grids/grid-registry.ts` already names them and `buildGridDeletedParam` sends the right token. |
| Dropdowns | 21 state codes, 22 companies, 25 bank ledgers, 26 godowns, 27 app themes — `lib/configured-dropdowns/dropdown-registry.ts` has them all (`gstStateCode`, `company`, `bankLedger`, `godown`, `appTheme`). |
| Routes | `/company-masters/{get,create,delete,restore}`, `/branch-masters/{get,create,delete,restore}` (restore not yet called from React — §1.12 / §2.11). |
| Show-deleted checkbox, audit history, tabs navigation, lazy server-searched dropdowns | present on both React screens. |
| Company tab layout | Identity (Address, Contact) · Tax and Compliance (e-Invoicing, e-Way) · Preferences (Books) · Regional — same four tabs on both. |

## 1. Company — gaps

| # | Qt | React today | Server | Work |
|---|---|---|---|---|
| 1.1 | **Company Code** text field | not in the form (only in `LOOKUP_KEYS` / payload) | `compCode` NullableString(20) | add `compCode` after `compName` on the Identity tab. |
| 1.2 | GST Reg Type = REGULAR / COMPOSITION / UNREGISTERED / **SEZ**, **required** | `GST_TYPE_OPTIONS` has no SEZ; optional | `IsIn(GST_REG_TYPES)` incl. SEZ; CHECK `ck_comp_gst_reg_type` | add SEZ, make required. `GST_TYPE_OPTIONS` (`utils/constant.ts`) is shared with customer / supplier / customer-template — see decision D6 before changing it globally. |
| 1.3 | Price Fixing **required** | optional | nullable, informational | make required (no default on either side; the user must pick). |
| 1.4 | **Turnover (AATO)** coded select, required, default `LE_5CR` | missing | `compAatoClass` NOT NULL, CHECK 4 values, column default `LE_5CR` | add select on the Tax tab (`LE_1_5CR` Up to 1.5 Cr / `LE_5CR` Up to 5 Cr / `LE_10CR` Up to 10 Cr / `GT_10CR` Above 10 Cr), initial `LE_5CR`, always sent. |
| 1.5 | **TCS Applicable** and **TDS Applicable** as two boxes | one box "TCS/TDS Applicable" bound to `compTcsApplicable`; `compTdsApplicable` never sent | both booleans (notes 72 C1), default false | split into two checkboxes; add `compTdsApplicable` to the boolean field list and payload. |
| 1.6 | **Delivery Challan Purposes**: 7 checkboxes, default SUPPLY·APPROVAL·JOB_WORK·OTHER, "tick at least one" | missing | `compDcPurposes` array ≥ 1 of SUPPLY JOB_WORK APPROVAL EXHIBITION OWN_USE LINE_SALES OTHER; column default = Qt's default set | use the existing `checkbox-group` field type (value is the comma-joined list) under a "Delivery Challan Purposes" subheading on the Tax tab; map get → join, payload → split; `validation.custom` refuses an empty list. |
| 1.7 | **Books**: on create seeds the running Indian FY (1 Apr → 31 Mar, Books = From) and checks From is 1 April, To = From + 1y − 1d, Books inside; on **edit the three dates are disabled**; no lock-date field | four dates editable in both modes, blank by default, no checks | From/To/Books are CREATE-ONLY (ignored on update; GET returns the current year's); lock date is always ignored; 400 on a non-1-April From etc. | compute initial values from today; add the three checks client-side (same messages as Qt); disable the three on edit (§3.4 sentinel); drop `compBooksLockDate` from the form and payload (decision D3 to keep it read-only instead). |
| 1.8 | **GSTIN rules** in `extraValidate`: blank allowed only for UNREGISTERED; format + mod-36 checksum; first two chars must equal the picked State's code; blank PAN filled from chars 3–12, a different PAN refused | `validateGstin` runs unconditionally (**"GSTIN is required."** even for an unregistered company — the server allows blank); no checksum; no state check; no PAN cross-check | 400 on state / PAN mismatch (C7) | one shared validator set (§3.1) wired as `validation.custom(value, values)` on `compGstinNo` and `compPanNo`; add the checksum to `utils/validation.validateGstin`. |
| 1.9 | GSTIN lookup button is a **TODO stub** (React is ahead here) | works, but calls the Next route `app/api/gst/search/route.ts`, which holds the TaxPro ASP id/password as hardcoded fallbacks and parses the provider's raw `lgnm/pradr/dty` keys | **`GET /gst/search?gstin=`** (bearer auth) answers a normalised `{legalName, tradeName, gstRegType, stateCode, panNo, address{building,street,locality,city,district,state,pin}}`; 503 until `GST_LOOKUP_PROVIDER_CODE` is set on dev | switch the company lookup to the server route through `useApi` and map the normalised payload (`gstRegType` already covers all four reg types, replacing `toCompanyGstRegType` which only knows two). Customer / supplier / ledger keep the Next route until Phase 4. |
| 1.10 | Bank = dropdown **25 BANK LEDGERS** (lazy) | eager `/master-lookups … accountLedgers` = **every** ledger, not just the bank group | GET returns `compBankName` | use `useLazyConfiguredDropdown` with key `bankLedger`, seed from `compBankName`. |
| 1.11 | Regional tab has **Regional State** and **Regional Country** text fields | neither field; the payload sends `compRegionState: values.compState` and `compRegionCountry: "India"` — a saved regional state is **overwritten on every save** | plain nullable strings | add the two text fields; send what the user typed. |
| 1.12 | With "Show Only Deleted" on: Edit refused ("restore it first"), Delete turns into **Restore** → `POST /company-masters/restore?compId=` | Edit opens (`/get` serves live rows only → error), Delete sends DELETE (404 on a deleted row) | restore 409 when not deleted; delete 409 for the default company / one with live branches, ledgers or vouchers | `isRowEditDisabled: () => wantDelete` + reason; `onDeleteAction` posts restore when `wantDelete` and returns true; `deleteConfirmMessage` says "Restore …?"; make sure a 409's message reaches the toast. The button caption is hardcoded "Delete" in `crud-master-page.tsx` (lines ~4407, ~4823) → add a `deleteActionLabel` prop (§3.3). |
| 1.13 | Required: Name, GST Reg Type, Price Fixing, State, AATO. City / District / Pin optional; Stylesheet optional | City, District, Pin, Stylesheet required | all nullable except name / state code | relax City, District, Pin; Stylesheet per decision D4. |
| 1.14 | Country editable, default "India" | disabled, hardcoded "India" | MaxLength 60 | make editable with default (minor). |
| 1.15 | Defaults on create: SMS **true**, Negative Stock **false** | SMS false, Negative Stock true | column defaults: `comp_sms_applicable` false | decision D2. |
| 1.16 | — (Qt has no signature field) | `compAuthorizeSignature` is a **textarea** | a data-URL image ≤ 512 KB (PNG/JPEG/GIF/WebP), returned as a data URL | React-only fix, optional: `type: "file"` + `previewImageValueKey`, as `item-brand/page.tsx` does with `stored-photo.ts`. |

## 2. Branch — gaps

| # | Qt | React today | Server | Work |
|---|---|---|---|---|
| 2.1 | **Mailing Name**, **Short Code**, **Branch Type** (required select: HEAD OFFICE / STORE / WAREHOUSE / BRANCH / FACTORY / SERVICE CENTER / DEPOT), **Bill Prefix** | none of the four in the form (all are in the payload, sent as null) | `brMailingName`(150) `brShort`(50) `brType`(30) `brBillPrefix`(20) | add the four; `brType` required. |
| 2.2 | GST Reg Type = coded select, **required** | free text (maxLength 30) — anything but the four codes is a 400 | `IsIn(GST_REG_TYPES)`; CHECK `ck_br_gst_reg_type` | same select as the company. |
| 2.3 | FSSAI License Type = select (Registration / State License / Central License) | free text | string(20) | select. |
| 2.4 | Rounding Mode = NORMAL / ROUND UP / ROUND DOWN / NONE / BANKERS, default **NORMAL**, Rounding Value default **0.50**; both optional | options `"rounding off"` / `"rounding up"`, **required**; value default 0.00 | informational, string(20) | decision D1 on the vocabulary; defaults on create; drop required. |
| 2.5 | Required: Name, Type, Company, GST Reg Type, City, District, State, Pin | Name, Company, State, **Invoice Series Prefix**, **Rounding Mode** | only name / company / state code are server-required | add Type, GST Reg Type, City, District, Pin; drop Invoice Series Prefix, Rounding Mode. |
| 2.6 | GSTIN rules (same four as the company) | only maxLength 15 | 400 on state / PAN mismatch | reuse §3.1 with the `br` prefix. |
| 2.7 | GSTIN lookup button (stub) | none | `GET /gst/search` | reuse §3.2: fill `brName` (trade name), `brStateCode/brState`, `brAddr1-3`, `brCity`, `brDistrict`, `brPin`, `brPanNo`, `brGstRegType`. |
| 2.8 | **Company disabled on edit** ("documents carry its company") | editable | 400 for the default branch or one with documents / stock / users / devices (B4) | `disabledWhen` on edit (§3.4). |
| 2.9 | **Default Godown**: disabled on create ("no godowns yet"); on edit dropdown 26 is filtered with `ibranch_id = <brId>` so only the branch's own godowns show | lazy dropdown 26 with **no** `dropdown_param` → every godown of every branch; an eager full godown list is kept only to resolve the saved name | dropdown 26 binds `ibranch_id`; GET now returns `brDefaultGodownName` | give `useLazyConfiguredDropdown` an optional `params` (§3.5), pass `{ ibranch_id }` on edit, disable the field on create, seed the label from `brDefaultGodownName`, delete the eager godown load. |
| 2.10 | Bank = dropdown 25 (lazy) | eager list of **all** ledgers | GET returns `brBankName` | lazy `bankLedger`, seed from `brBankName`. |
| 2.11 | Deleted rows: Edit refused, Delete → **Restore** (`POST /branch-masters/restore?brId=`) | as 1.12 | restore 409 when the company is deleted ("restore the company first") or a live branch took the name; delete 409 while documents / stock / users / devices exist | as 1.12. |
| 2.12 | Regional tab: **free-text** Regional State / Regional Country (regional-language values) | Region State is a **state select** (English names); Region Country disabled "India" | plain strings | free text like Qt. |
| 2.13 | **3 tabs**: Identity (GST Registration, Address, Contact) · Billing & Preferences (Invoice & Operations, FSSAI, Preferences) · Regional; 2 columns | **6 tabs**: Identity & Reference · Address · Region Address · Billing & Invoice Setup · Compliance & Licenses · Status; 3 columns | — | regroup to Qt's three tabs with subheadings (GSTIN then sits on the first tab, where the lookup fills visibly); decision D5 on columns. |
| 2.14 | Labels: Default Godown, Default Bank, Pin Code, Mobile / Phone, Terms & Conditions | "Default Godown Id", "Bank Id", "Pincode", "Phone", "Terms" | — | rename. |
| 2.15 | — | the page is the older `CrudMasterPage`-inline style | — | move to the company's shape: `features/masters/settings/branches/module.ts` (`defineMasterModule`) + a thin `page.tsx` on `MasterModulePage`, so both screens share §3. |

## 3. Shared pieces (build once, use on both)

1. **`features/masters/shared/gst-registration.ts`** — client mirror of the server's `settings/shared/gst-registration.ts`:
   `GST_REG_TYPE_OPTIONS` (4), `isValidGstin` (format + mod-36 checksum, ported from `tax_validator.cpp`),
   `buildGstinFieldValidators({ prefix, stateCodeByName })` returning the two `validation.custom` functions
   (GSTIN: blank ok only when `<prefix>GstRegType === "UNREGISTERED"`, else format, checksum, state agreement;
   PAN: must equal GSTIN chars 3–12 when both present) and an `onValueChange` that upper-cases and fills a blank PAN.
   Pure; vitest covers it.
2. **`features/masters/shared/gstin-lookup.ts`** — `fetchGstinDetails(getAll, gstin)` → the server's
   `GstinLookupPayload`; `gstinLookupToValues(prefix, payload, stateNameByCode)` → `Record<string,string>` patch
   (name ← tradeName || legalName, legalName, reg type ← `gstRegType`, addr1 ← building, addr2 ← street/locality,
   addr3 ← district/city, city, district, state ← `stateNameByCode[stateCode]`, pin, PAN). Replaces the
   `GST_*_KEYS` constants and `buildCompanyLookupValues` in `companies/module.ts`.
3. **`CrudMasterPage`** — `deleteActionLabel?: string` (defaults to "Delete") used for the row button and the confirm
   button, so the deleted view can say "Restore". Everything else (`isRowEditDisabled`, `rowEditDisabledReason`,
   `onDeleteAction`, `deleteConfirmMessage`) already exists.
4. **Edit-mode sentinel** — the dynamic form's `disabledWhen(values)` sees only form values, not the variant.
   `mapFormValues` sets `values.__editing = source ? "true" : "false"`; fields use
   `disabledWhen: (v) => v.__editing === "true"`. Verify first that unknown keys survive the form's value
   normalisation (if not, add a hidden field).
5. **`useLazyConfiguredDropdown`** — add `params?: Record<string, string>`; when set, send
   `dropdown_param=JSON.stringify(params)` on open and on search (the hook deliberately never sends it today).
   Mark `godown` `paramBound: true` in the registry only if its test suite expects that flag to mean "always sent".
6. **`features/masters/shared/fiscal-year.ts`** — `currentIndianFiscalYear(today)` → `{ from, to }` and
   `validateFiscalYearFields({ from, to, books })` → `{ field, message } | null` with Qt's three messages.

## 4. Phases

| Phase | Scope | Done when |
|---|---|---|
| 1 | §3.1, §3.2, §3.6 as pure modules + vitest; §3.3, §3.4, §3.5 framework touches | `npx vitest run features/masters/shared` green; `tsc` clean. |
| 2 | Company: 1.1–1.8, 1.10–1.13; 1.9 (lookup → server route); 1.14–1.16 per decisions | create a company with a blank FY → saved with the running year; From = 2 April → client message (server would 400); UNREGISTERED with blank GSTIN saves; GSTIN `33…` with State 24 refused; deleted view: Edit blocked, Restore works; bank list shows only bank-group ledgers. |
| 3 | Branch: 2.15 first (module.ts), then 2.1–2.14 | create: godown disabled, company required; edit: company disabled, godown list = that branch's only; GST Reg Type select; 3 tabs. |
| 4 | Clean-up (separate commit): point customer / supplier / account-ledger lookups (`GST_LOOKUP_ENDPOINT` in their constants) at `features/masters/shared/gstin-lookup.ts`, then delete `app/api/gst/search/route.ts` — this removes the hardcoded GSP credentials from the client. | no reference to `/api/gst/search` remains. |
| 5 | Verify against the dev server | manual runs above + `tsc` + full `vitest run`. Known dev data: Acme Foods' PAN doesn't match its GSTIN (a full save is a 400 until fixed); `/gst/search` answers 503 until `GST_LOOKUP_PROVIDER_CODE` is set. |

## 5. Decisions needed before Phase 2

| # | Question | Recommendation |
|---|---|---|
| D1 | Rounding-mode vocabulary: Qt's `NORMAL / ROUND UP / ROUND DOWN / NONE / BANKERS` or React's `rounding off / rounding up`? Both sides write the same informational column. | Qt's (newer, and the defaults NORMAL / 0.50 come with it). Existing rows with the old words show as "no selection" until re-saved. |
| D2 | Create defaults where Qt and the DB disagree: SMS (Qt true, column false), Negative Stock (Qt false, company column default not found; branch column true). | Follow the **column defaults** — a row saved from anywhere else gets those — and change Qt instead if the user wants SMS on. |
| D3 | `compBooksLockDate`: drop it like Qt, or show it read-only on edit (GET returns the current year's `fy_lock_date`)? | drop; it belongs to the fiscal-year screen that notes 72 leaves for later. |
| D4 | Stylesheet required (React) or optional (Qt)? Column is NOT NULL with no default in the DTO's eyes (`compStylesheetId!: number`). | keep **required** in React; raise it with the Qt side. |
| D5 | Branch form columns: 2 (Qt, and the React company) or keep 3? | 2, for one look across the two screens. |
| D6 | Add SEZ to the shared `GST_TYPE_OPTIONS` (also used by customer, supplier, customer-template) or keep a company/branch list? | shared, **after** checking those three masters' server enums accept SEZ; otherwise local. |
| D7 | 1.16 signature as an image upload — in scope now or later? | now, it is a one-field change with an existing pattern. |
