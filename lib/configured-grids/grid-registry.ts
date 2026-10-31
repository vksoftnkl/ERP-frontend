/**
 * Which row of `fixed.grid_details` — the Grid Master screen's list — backs each
 * list this app renders.
 *
 * Same argument as `lib/ui-tables`, one table over: `grid_id` is a
 * per-deployment surrogate key, so a screen that names one by number is pointing
 * at whatever that database happened to number it. It also had a second problem
 * of its own — Grid Master only ever LISTS the Desktop grids (its own SQL ends
 * `WHERE grid_device_type = 'Desktop'`), so every screen still reading a legacy
 * `web` grid was reading a grid the user cannot see, let alone configure. Widths,
 * visibility, filters and totals set in Grid Master landed on a row nothing read.
 *
 * So a screen names the GRID, and the id is resolved at runtime from the Desktop
 * rows (`useGridId`, or `getGridId` off React). `fallbackId` is only what a
 * screen uses until that list arrives, or if the lookup finds nothing.
 */
/** One row of the Grid Master list, whatever the payload spelled its keys. */
export type GridDirectoryRow = {
  gridId: string;
  gridName: string;
  deviceType: string;
  isActive: boolean;
};
/**
 * The device type every list here reads. Grid Master's own list filters to it
 * server-side; the filter is applied again here so a re-authored grid cannot
 * quietly hand a screen a `web` row that happens to share a name.
 */
export const CONFIGURED_GRID_DEVICE_TYPE = "desktop";
/**
 * Every list, by the `grid_name` it is configured under.
 *
 * `deletedParam` is the name of the token the grid's SQL binds its
 * `*_is_deleted` filter to — what a screen's "Show deleted records" checkbox has
 * to be sent as (`grid_param`). `null` means the grid hardcodes `= false`: there
 * are no deleted rows to ask for, and a screen should not offer the checkbox.
 */
export const CONFIGURED_GRIDS = {
  itemList: { name: "MAIN LIST - ITEMS", fallbackId: "67", deletedParam: "iitem_is_deleted" },
  itemPickerPopup: { name: "POPUP - ITEMS", fallbackId: "71", deletedParam: null },
  itemGroupList: { name: "MAIN LIST - ITEM GROUPS", fallbackId: "48", deletedParam: "iitg_is_deleted" },
  itemBrandList: { name: "MAIN LIST - ITEM BRAND", fallbackId: "49", deletedParam: "ibrand_is_deleted" },
  itemCategoryList: { name: "MAIN LIST - ITEM CATEGORY", fallbackId: "51", deletedParam: "icategory_is_deleted" },
  /**
   * Item Size Master (menu 291) — textile. Also binds a bare `iisz_company_id`
   * (shared sizes + this company's own) that must ALWAYS be sent: unsent, the
   * literal stays in the statement and the whole query fails.
   */
  itemSizeList: { name: "MAIN LIST - ITEM SIZE", fallbackId: "181", deletedParam: "iisz_is_deleted" },
  /** Item Colour Master (menu 292) — textile. Binds `iicl_company_id`, always sent. */
  itemColourList: { name: "MAIN LIST - ITEM COLOUR", fallbackId: "182", deletedParam: "iicl_is_deleted" },
  godownList: { name: "MAIN LIST - GODOWNS", fallbackId: "55", deletedParam: "igdl_is_deleted" },
  stateList: { name: "MAIN LIST - CUSTOMER STATES", fallbackId: "57", deletedParam: "istm_is_deleted" },
  cityList: { name: "MAIN LIST - CUSTOMER CITES", fallbackId: "58", deletedParam: "ictm_is_deleted" },
  areaList: { name: "MAIN LIST - CUSTOMER AREAS", fallbackId: "59", deletedParam: "iarm_is_deleted" },
  customerList: { name: "MAIN LIST - CUSTOMERS", fallbackId: "65", deletedParam: "icus_is_deleted" },
  customerGroupList: { name: "MAIN LIST - CUSTOMER GROUPS", fallbackId: "66", deletedParam: "icgr_is_deleted" },
  supplierList: { name: "MAIN LIST - SUPPLIERS", fallbackId: "63", deletedParam: "isup_is_deleted" },
  supplierGroupList: { name: "MAIN LIST - SUPPLIER GROUPS", fallbackId: "61", deletedParam: "ispg_is_deleted" },
  companyList: { name: "MAIN LIST - COMPANYS", fallbackId: "52", deletedParam: "icomp_is_deleted" },
  branchList: { name: "MAIN LIST - BRANCHES", fallbackId: "56", deletedParam: "ibr_is_deleted" },
  /**
   * Grid 187 (Qt 091bf5b) replaced grid 77 but was authored under the SAME name, so
   * two live Desktop rows answer to it. `newestWins`: of the same-named rows the
   * highest id is the replacement. Only this entry opts in — every other name is
   * unique today, and for them the lowest id stays the tie-break.
   */
  employeeList: { name: "MAIN LIST - EMPLOYEES", fallbackId: "187", deletedParam: "iemp_is_deleted", newestWins: true },
  employeeDepartmentList: { name: "MAIN LIST - EMP DEPARTMENTS", fallbackId: "73", deletedParam: "iedpt_is_deleted" },
  employeeDesignationList: { name: "MAIN LIST - EMP DESIGNATIONS", fallbackId: "75", deletedParam: "ied_is_deleted" },
  accountGroupList: { name: "MAIN LIST - ACCOUNT GROUP", fallbackId: "53", deletedParam: null },
  accountLedgerList: { name: "MAIN LIST - LEDGERS", fallbackId: "54", deletedParam: "iled_is_deleted" },
  /**
   * The Opening Balance screen's ledger picker. Its SQL restricts to the two
   * balance-sheet natures on its own, which is why the screen adds no nature
   * filter of its own — an opening on an income ledger is a category error, and
   * the grid already refuses to offer one.
   */
  ledgerPickerPopup: { name: "POPUP - LEDGERS", fallbackId: "107", deletedParam: null },
  /**
   * The Posting Ledger Map's picker. Its SQL is filtered BY ROLE through a bare
   * `itrl_role` token, which must always be sent — see `store/api/ledgerMapApi.ts`.
   */
  ledgerForRolePopup: { name: "POPUP - LEDGERS FOR ROLE", fallbackId: "105", deletedParam: null },
  userList: { name: "MAIN LIST - COMPUTER USERS", fallbackId: "62", deletedParam: null },
  deviceList: { name: "DESKTOP - DEVICE MASTER LIST", fallbackId: "31", deletedParam: null },
  gridMasterList: { name: "GRID MASTER LIST", fallbackId: "34", deletedParam: null },
  uiTableMasterList: { name: "MAIN LIST - UI TABLES", fallbackId: "38", deletedParam: null },
  dropdownMasterList: { name: "MAIN LIST - DROPDOWN", fallbackId: "43", deletedParam: null },
  tenderList: { name: "MAIN LIST - TENDERS", fallbackId: "85", deletedParam: "itnd_is_deleted" },
  chargeList: { name: "CHARGES MAIN LIST", fallbackId: "81", deletedParam: null },
  /**
   * Also binds a QUOTED `'ifr_branch_id'` token, "" for every branch. Unsent, it
   * stays a literal and the branch test matches no row — the list comes back empty.
   */
  freightChargeList: { name: "MAIN LIST - FREIGHT CHARGES", fallbackId: "74", deletedParam: "ifr_is_deleted" },
  loadingChargeList: { name: "MAIN LIST - LOADING CHARGES", fallbackId: "76", deletedParam: "iilc_is_deleted" },
  gstRateList: { name: "MAIN LIST - GST RATES", fallbackId: "103", deletedParam: null },
  openingStockList: { name: "MAIN LIST - OPENING STOCK", fallbackId: "99", deletedParam: null },
  /** Physical Stock Update (menu 45) — its list. */
  physicalStockList: { name: "MAIN LIST - PHYSICAL STOCK", fallbackId: "101", deletedParam: null },
  /** Stock Adjustment (menu 264) — every kind's list. */
  stockAdjustmentList: { name: "TXN MAIN LIST - STOCK ADJUSTMENT", fallbackId: "122", deletedParam: null },
  /**
   * Godown Transfer (menu 41; Qt NexERP 62d1d87) — same-branch TRANSFER_OUT.
   * Binds QUOTED `'icompany_id'`, `'ibranch_id'`, `'iacc_year'`, `'ifrom_date'`,
   * `'ito_date'`, `'istatus'` — every one sent, "" for no bound.
   */
  godownTransferList: { name: "MAIN LIST - GODOWN TRANSFER", fallbackId: "183", deletedParam: null },
  /** Branch Outward (menu 192) — despatches to another branch. Grid 183's six tokens. */
  branchOutwardList: { name: "MAIN LIST - BRANCH OUTWARD", fallbackId: "184", deletedParam: null },
  /** Branch Inward (menu 193) — this branch's receipts. Grid 183's six tokens. */
  branchInwardList: { name: "MAIN LIST - BRANCH INWARD", fallbackId: "185", deletedParam: null },
  /** Branch Inward — the worklist of despatches in transit to this branch. Binds `'icompany_id'`, `'ibranch_id'`. */
  branchInwardInTransit: { name: "BRANCH INWARD - IN TRANSIT", fallbackId: "186", deletedParam: null },
  /**
   * Stock Reasons (menu 293; Qt 97a8e59) — shared reasons plus the company's own.
   * Binds QUOTED `'icompany_id'` and `'iinactive'`, both always sent.
   */
  stockReasonList: { name: "MAIN LIST - STOCK REASONS", fallbackId: "188", deletedParam: null },
  /**
   * The purchase documents (Qt NexERP 3ce8487..b8f615e; `TxnDocTypes::purchase*`).
   * Every one binds grid 183's six QUOTED tokens.
   */
  purchaseInvoiceList: { name: "MAIN LIST - PURCHASE INVOICE", fallbackId: "189", deletedParam: null },
  purchaseOrderList: { name: "MAIN LIST - PURCHASE ORDER", fallbackId: "190", deletedParam: null },
  grnList: { name: "MAIN LIST - GRN", fallbackId: "191", deletedParam: null },
  purchaseReturnList: { name: "MAIN LIST - PURCHASE RETURN", fallbackId: "192", deletedParam: null },
  shortageReceiptList: { name: "MAIN LIST - SHORTAGE RECEIPT", fallbackId: "193", deletedParam: null },
  /**
   * Agents Master (menu 28; Qt 97a5b48). Binds QUOTED `'icompany_id'` and
   * `'iinactive'`, both always sent.
   */
  purchaseAgentList: { name: "MAIN LIST - PURCHASE AGENTS", fallbackId: "194", deletedParam: null },
  /**
   * Print Templates (menu 62; Qt NexERP print_template_list). Binds six QUOTED
   * tokens — `iptl_company_id`, `iptl_active`, `iptl_purpose_id`, `iptl_state`,
   * `iptl_owned`, `iptl_engine` — ALL always sent ('' = no filter). The grid
   * hardcodes `ptl_is_deleted = false`.
   */
  printTemplateList: { name: "MAIN LIST - PRINT TEMPLATES", fallbackId: "196", deletedParam: null },
  /**
   * Supplier–Item Map (menu 295; Qt 97a5b48). Binds QUOTED `'icompany_id'`,
   * `'isupplier_id'` ('' = all suppliers) and `'iinactive'`, all always sent.
   */
  supplierItemList: { name: "MAIN LIST - SUPPLIER ITEMS", fallbackId: "195", deletedParam: null },
  /**
   * Tracking Presets (menu 249; Qt d27045b) — shared presets plus the company's own, a company
   * row hiding the shared one of the same code. Binds `ispt_company_id` and `ispt_is_deleted`, both always sent.
   */
  stockTrackPresetList: { name: "MAIN LIST - TRACKING PRESETS", fallbackId: "98", deletedParam: "ispt_is_deleted" },
  /** Opening Stock's line supplier picker. */
  supplierPickerPopup: { name: "POPUP - SUPPLIERS", fallbackId: "100", deletedParam: null },
  /** Physical Stock's line reason picker. */
  stockReasonPopup: { name: "POPUP - STOCK REASONS", fallbackId: "102", deletedParam: null },
  /** Change Selling Price's price-level picker. */
  priceLevelPopup: { name: "POPUP - PRICE LEVELS", fallbackId: "78", deletedParam: null },
  quotationList: { name: "TXN MAIN LIST - QUOTATION", fallbackId: "83", deletedParam: null },
  billList: { name: "TXN MAIN LIST - BILLS", fallbackId: "86", deletedParam: null },
  saleOrderList: { name: "TXN MAIN LIST - SALES ORDER", fallbackId: "87", deletedParam: null },
  /** Delivery Challan (menu 182). Binds `icompany_id`, `ibranch_id`, `iacc_year`, `ifrom_date`, `ito_date`, `ifulfil` — all ALWAYS sent. */
  deliveryChallanList: { name: "MAIN LIST - DELIVERY CHALLANS", fallbackId: "116", deletedParam: null },
  /**
   * Receipt Entry (menu 99) — the register behind F8.
   *
   * Its SQL names a bare `iavh_status` token, which the runner substitutes as
   * TEXT rather than binding: a call that omits it leaves the literal word in
   * the statement and the WHOLE query fails, not just the filter. So the screen
   * always sends it, empty string for "every status".
   */
  receiptList: { name: "MAIN LIST - RECEIPTS", fallbackId: "108", deletedParam: null },
  /**
   * Bill-wise Payment (menu 100) — the register behind F8. Grid 108's SQL with
   * the voucher type swapped, so the same six bare tokens, every one always
   * sent (`iavh_status` as "" for every status).
   */
  paymentList: { name: "MAIN LIST - PAYMENTS", fallbackId: "123", deletedParam: null },
  /**
   * Received Cheques (menu 51) — the register. Its SQL names NINE bare tokens
   * (`iapd_company_id` … `isearch`) and every one must be sent, empty string
   * for "no filter", or the whole query fails. The search is `isearch` inside
   * `grid_param`, never the runner's own `search` key.
   */
  receivedChequeList: { name: "MAIN LIST - RECEIVED CHEQUES", fallbackId: "109", deletedParam: null },
  /**
   * Issued Cheques (menu 52) — the register. NINE bare tokens, every one sent,
   * "" for no filter — but spelt `icompany_id` / `ibranch_id` / `iacc_year`,
   * NOT grid 109's `iapd_*`. The search is `isearch` inside `grid_param`.
   */
  issuedChequeList: { name: "MAIN LIST - ISSUED CHEQUES", fallbackId: "121", deletedParam: null },
  /**
   * Cheque Books (menu 263) — the books list, also behind Issued Cheques' tiles.
   * Binds `icompany_id`, `ibank_ledger_id` and `istatus` (ONE status, not a list).
   */
  chequeBookList: { name: "MAIN LIST - CHEQUE BOOKS", fallbackId: "120", deletedParam: null },
  /**
   * The Voucher Register (Contra, menu 104, and the other voucher menus) — the
   * list. Binds `icompany_id`, `ibranch_id`, `iacc_year`, `iuser_id` (the SQL
   * joins the user's menu rights on it; the server does NOT inject it),
   * `itype_code`, `ifrom_date`, `ito_date` — all sent, "" for no bound. There
   * is no status token.
   */
  voucherRegisterList: { name: "TXN MAIN LIST - VOUCHER REGISTER", fallbackId: "117", deletedParam: null },
  /** The Voucher Register's Exceptions — journals and notes that settled a sales / purchase bill by hand. */
  voucherExceptions: { name: "VOUCHER REGISTER - EXCEPTIONS", fallbackId: "118", deletedParam: null },
  /** Sale Bill (§24) — the delivery register, menu 226. Binds `idelivery_status` ('' = pending set). */
  billDeliveryList: { name: "MAIN LIST - BILL DELIVERY", fallbackId: "113", deletedParam: null },
  /** Sale Bill (§24) — the temp-credit follow-up list, menu 257. Binds `istatus` and `ioverdue_only`. */
  tempCreditList: { name: "MAIN LIST - TEMP CREDITS", fallbackId: "114", deletedParam: null },
  /**
   * App Themes (menu 266) — the theme list. Its SQL has no deleted filter: it
   * answers every theme, deleted ones too, and the screen's "Show deleted" box
   * filters them client-side.
   */
  appThemeList: { name: "MAIN LIST - APP THEMES", fallbackId: "125", deletedParam: null },
  /**
   * Temp Credits — Ctrl+H, one credit's whole trail: given, the bill's steps,
   * follow-ups and the money (received, written off, reversed). Binds
   * `iatc_id`, `iacc_year`, `icompany_id`; has no ORDER BY — sort on `th_sort`.
   */
  tempCreditHistory: { name: "POPUP - TEMP CREDIT HISTORY", fallbackId: "132", deletedParam: null },
  /**
   * Any transaction's History — its `txn_status_log` steps (created, posted,
   * amended, cancelled …). Binds `idoc_id`, `iacc_year`, `icompany_id`; has no
   * ORDER BY — sort on `tsl_seq_no`.
   */
  txnHistory: { name: "POPUP - TXN HISTORY", fallbackId: "126", deletedParam: null },
  /** Sale Bill (§22) — Ctrl+F6's picker: this device's bills from today. Binds `idevice_id`. */
  retenderBillPopup: { name: "POPUP - RECENT BILLS FOR RE-TENDER", fallbackId: "115", deletedParam: null },
  /** Receipt Entry — the bank picker on a cheque row. Free text is allowed too. */
  bankPopup: { name: "POPUP - BANKS", fallbackId: "111", deletedParam: null },
  /** Receipt Entry — F7, everything that has ever settled the bill under the cursor. */
  billPaymentHistoryPopup: {
    name: "POPUP - BILL PAYMENT HISTORY",
    fallbackId: "112",
    deletedParam: null,
  },
  /** GST Providers (menu 269) — the provider list. */
  gstProviderList: { name: "MAIN LIST - GST PROVIDERS", fallbackId: "127", deletedParam: "igpv_is_deleted" },
  /** GST Providers — one provider's services. Binds a QUOTED `'igpv_id'`. */
  gstProviderServices: { name: "GST PROVIDER - SERVICES", fallbackId: "128", deletedParam: null },
  /** GST Providers — one service's endpoints. Binds a QUOTED `'igps_id'`. */
  gstProviderEndpoints: { name: "GST PROVIDER - ENDPOINTS", fallbackId: "129", deletedParam: null },
  /** GST Providers — one provider's error map. Binds a QUOTED `'igpv_id'`. */
  gstProviderErrorMap: { name: "GST PROVIDER - ERROR MAP", fallbackId: "130", deletedParam: null },
  /**
   * GST Credentials (menu 270). Reads `gst_company_credential`'s non-secret
   * columns (not `vw_gst_credential`, which hides deleted rows) so Restore can
   * list them.
   */
  gstCredentialList: { name: "MAIN LIST - GST CREDENTIALS", fallbackId: "131", deletedParam: "igcc_is_deleted" },
  /**
   * Till Masters (menu 275). Each list carries every field its form shows, so a
   * row opens straight from it (no /get). Counters and safes bind QUOTED
   * `'icompany_id'` + `'ibranch_id'`; reasons and denominations `'icompany_id'`
   * only (shipped rows have no company). Deleted rows are never listed.
   */
  tillCounterList: { name: "MAIN LIST - TILL COUNTERS", fallbackId: "133", deletedParam: null },
  tillReasonList: { name: "MAIN LIST - TILL REASONS", fallbackId: "134", deletedParam: null },
  tillDenominationList: { name: "MAIN LIST - TILL DENOMINATIONS", fallbackId: "135", deletedParam: null },
  tillSafeList: { name: "MAIN LIST - TILL SAFES", fallbackId: "136", deletedParam: null },
  /** Expense Voucher register (menu 277, Qt NexERP d5c3637). */
  expenseVoucherList: { name: "MAIN LIST - EXPENSE VOUCHERS", fallbackId: "137", deletedParam: null },
  /** Settlement Reconciliation (menu 278): the imports, one import's lines, and the exception views. */
  tenderSettlementList: { name: "MAIN LIST - TENDER SETTLEMENTS", fallbackId: "138", deletedParam: null },
  tenderSettlementLines: { name: "TENDER SETTLEMENT - LINES", fallbackId: "139", deletedParam: null },
  tenderSettlementNotReceived: { name: "TENDER SETTLEMENT - NOT RECEIVED", fallbackId: "140", deletedParam: null },
  tenderSettlementUnexplained: { name: "TENDER SETTLEMENT - UNEXPLAINED", fallbackId: "141", deletedParam: null },
  tenderSettlementDuplicateRefs: { name: "TENDER SETTLEMENT - DUPLICATE REFS", fallbackId: "142", deletedParam: null },
  tenderSettlementSuspense: { name: "TENDER SETTLEMENT - SUSPENSE", fallbackId: "143", deletedParam: null },
  /** Till Sessions (menu 273) and one session's cockpit tabs. */
  tillSessionList: { name: "MAIN LIST - TILL SESSIONS", fallbackId: "144", deletedParam: null },
  tillSessionEvents: { name: "TILL SESSION EVENTS", fallbackId: "145", deletedParam: null },
  tillSessionBills: { name: "TILL SESSION BILLS", fallbackId: "146", deletedParam: null },
  tillSessionMoneyDocs: { name: "TILL SESSION MONEY DOCS", fallbackId: "147", deletedParam: null },
  tillSessionCounts: { name: "TILL SESSION COUNTS", fallbackId: "148", deletedParam: null },
  /** Business Day (menu 274): the days, and one day's sessions. */
  tillBusinessDayList: { name: "MAIN LIST - TILL BUSINESS DAYS", fallbackId: "149", deletedParam: null },
  tillDaySessions: { name: "TILL DAY SESSIONS", fallbackId: "150", deletedParam: null },
  /** Till Approval Setup (menu 276): the rules (WHEN) and the grants (WHO). */
  tillApprovalRules: { name: "TILL APPROVAL RULES", fallbackId: "151", deletedParam: null },
  tillApprovalGrants: { name: "TILL APPROVAL GRANTS", fallbackId: "152", deletedParam: null },
  /**
   * Cash Office (menu 287, notes 118): every remittance of the branch (QUOTED
   * `'icompany_id'`, `'ibranch_id'`, optional `'ifrom_date'` / `'ito_date'` /
   * `'istatus'`), and one safe's book since its last count (+ `'isafe_id'`).
   */
  tillRemittances: { name: "TILL REMITTANCES", fallbackId: "157", deletedParam: null },
  tillSafeBook: { name: "TILL SAFE BOOK", fallbackId: "158", deletedParam: null },
  /**
   * Till Reports (menu 288, notes 133 — Qt 1d3e203): four read-only tabs.
   * Every grid binds QUOTED tokens, so each one is always sent (`""` = all):
   * `'icompany_id'` `'ibranch_id'` `'ifrom_date'` `'ito_date'` `'icounter_id'`
   * `'ioperator_id'`, plus `'inoncash'` (159), `'ievent'` (161–163), `'ihour'`
   * (163), `'iapprover_id'` (164–166), `'isafe_id'` (167); 168 binds only
   * company / branch / `'isafe_id'` / `'iday'`, 169 company / branch / `'irole'`.
   */
  tillRptCashierVariance: { name: "TILL RPT CASHIER VARIANCE", fallbackId: "159", deletedParam: null },
  tillRptCashierSessions: { name: "TILL RPT CASHIER SESSIONS", fallbackId: "160", deletedParam: null },
  tillRptExceptions: { name: "TILL RPT EXCEPTIONS", fallbackId: "161", deletedParam: null },
  tillRptExceptionHours: { name: "TILL RPT EXCEPTION HOURS", fallbackId: "162", deletedParam: null },
  tillRptExceptionEvents: { name: "TILL RPT EXCEPTION EVENTS", fallbackId: "163", deletedParam: null },
  tillRptApprovers: { name: "TILL RPT APPROVERS", fallbackId: "164", deletedParam: null },
  tillRptApproverDecisions: { name: "TILL RPT APPROVER DECISIONS", fallbackId: "165", deletedParam: null },
  tillRptUndecided: { name: "TILL RPT UNDECIDED", fallbackId: "166", deletedParam: null },
  tillRptSafeDays: { name: "TILL RPT SAFE DAYS", fallbackId: "167", deletedParam: null },
  tillRptSafeDayLines: { name: "TILL RPT SAFE DAY LINES", fallbackId: "168", deletedParam: null },
  tillRptPeople: { name: "TILL RPT PEOPLE", fallbackId: "169", deletedParam: null },
  /**
   * Cash Position (menu 289, Qt NexERP 3b5069d, till notes 134): head office's
   * every-store page. 170 one row per branch as at the end of `'iday'` · 171
   * the live sessions (today only) · 172 the day's exceptions · 173 cashiers'
   * month-to-date shortage · 174 the HO reviews of one branch. Every token is
   * QUOTED — always sent: `'icompany_id'` `'ibranch_id'` (`""` = every branch
   * on 170–173; 174 needs one) `'iday'` (yyyy-MM-dd).
   */
  tillCashPosition: { name: "TILL CASH POSITION", fallbackId: "170", deletedParam: null },
  tillCashPositionLive: { name: "TILL CASH POSITION LIVE", fallbackId: "171", deletedParam: null },
  tillCashPositionEvents: { name: "TILL CASH POSITION EVENTS", fallbackId: "172", deletedParam: null },
  tillCashPositionCashiers: { name: "TILL CASH POSITION CASHIERS", fallbackId: "173", deletedParam: null },
  tillCashPositionReviews: { name: "TILL CASH POSITION REVIEWS", fallbackId: "174", deletedParam: null },
  /**
   * Till Reports' three later tabs (Qt NexERP 3b5069d): Cashier performance
   * (175 per cashier · 176 the picked cashier's sessions), Ledger check (177
   * per session, `'idiff'` "1" = only differences · 178 the session's till
   * cash legs) and Tender reconciliation (179 per session × non-cash tender,
   * `'ipending'` "1" = only not settled · 180 that tender's rows). 175–177 and
   * 179 bind the shared report tokens; 178 binds `'icompany_id'` + `'itss_id'`,
   * 180 those + `'itender_type_id'`.
   */
  tillRptCashierPerformance: { name: "TILL RPT CASHIER PERFORMANCE", fallbackId: "175", deletedParam: null },
  tillRptPerformanceSessions: { name: "TILL RPT PERFORMANCE SESSIONS", fallbackId: "176", deletedParam: null },
  tillRptLedgerCheck: { name: "TILL RPT LEDGER CHECK", fallbackId: "177", deletedParam: null },
  tillRptLedgerLegs: { name: "TILL RPT LEDGER LEGS", fallbackId: "178", deletedParam: null },
  tillRptTenderRecon: { name: "TILL RPT TENDER RECON", fallbackId: "179", deletedParam: null },
  tillRptTenderRows: { name: "TILL RPT TENDER ROWS", fallbackId: "180", deletedParam: null },
  /**
   * Expense Voucher (menu 277, Qt NexERP d97cdd4): the Reason and Expense
   * ledger cells' popups. Both bind QUOTED `'icompany_id'` — always sent.
   */
  expenseReasonPopup: { name: "POPUP - EXPENSE REASONS", fallbackId: "155", deletedParam: null },
  expenseLedgerPopup: { name: "POPUP - EXPENSE LEDGERS", fallbackId: "156", deletedParam: null },
  /** Settlement Reconciliation: the tender lines a statement line can be confirmed against. */
  tenderSettlementPickRow: { name: "TENDER SETTLEMENT - PICK ROW", fallbackId: "154", deletedParam: null },
} as const;
export type ConfiguredGridKey = keyof typeof CONFIGURED_GRIDS;
const ID_KEYS = ["grid_id", "gridId", "id"] as const;
const NAME_KEYS = ["grid_name", "gridName", "name"] as const;
const DEVICE_TYPE_KEYS = ["grid_device_type", "gridDeviceType", "deviceType"] as const;
const IS_ACTIVE_KEYS = ["grid_status", "gridStatus", "grid_is_active", "isActive", "status"] as const;
const ROW_ARRAY_KEYS = ["items", "data", "rows", "results", "list"] as const;
const resolvedIds = new Map<ConfiguredGridKey, string>();
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstDefined(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}
function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "f", "0", "no", "n", "inactive"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}
function toDirectoryRow(value: unknown): GridDirectoryRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const gridId = toText(firstDefined(value, ID_KEYS));
  const gridName = toText(firstDefined(value, NAME_KEYS));
  if (!gridId || !gridName) {
    return null;
  }
  return {
    gridId,
    gridName,
    deviceType: toText(firstDefined(value, DEVICE_TYPE_KEYS)),
    // A list that does not report the flag at all is a list of live grids.
    isActive: toBoolean(firstDefined(value, IS_ACTIVE_KEYS), true),
  };
}
/** The rows out of whatever `/configured-grid-sql/run` answered with. */
export function normalizeGridDirectoryPayload(payload: unknown): GridDirectoryRow[] {
  if (Array.isArray(payload)) {
    return payload.map(toDirectoryRow).filter((row): row is GridDirectoryRow => row !== null);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value) || isRecord(value)) {
      const rows = normalizeGridDirectoryPayload(value);
      if (rows.length > 0) {
        return rows;
      }
    }
  }
  return [];
}
function compareCandidates(left: GridDirectoryRow, right: GridDirectoryRow): number {
  // A disabled grid is still a match — it is what Grid Master would show once
  // someone ticks it live again — but a live one always wins.
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1;
  }
  const leftId = Number(left.gridId);
  const rightId = Number(right.gridId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }
  return left.gridId.localeCompare(right.gridId);
}
/** The id of the Desktop grid configured under `name`, or null when there is none. */
export function findGridIdByName(
  name: string,
  rows: readonly GridDirectoryRow[],
): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const candidates = rows.filter((row) => {
    if (row.gridName.toLowerCase() !== wanted) {
      return false;
    }
    // A row with no device type at all is taken at face value: the list it came
    // from is Grid Master's, and that list is Desktop.
    const deviceType = row.deviceType.toLowerCase();
    return deviceType === "" || deviceType === CONFIGURED_GRID_DEVICE_TYPE;
  });
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort(compareCandidates);
  if (!prefersNewest(wanted)) {
    return sorted[0].gridId;
  }
  // Newest wins: the highest id among the rows that are live (a disabled grid
  // still loses to a live one, as everywhere).
  const live = sorted.filter((row) => row.isActive === sorted[0].isActive);
  return live[live.length - 1].gridId;
}
/** Whether a registry entry with this name opted in to "the highest id wins a tie". */
function prefersNewest(wantedLowerName: string): boolean {
  return Object.values(CONFIGURED_GRIDS).some(
    (entry) =>
      "newestWins" in entry && entry.newestWins === true && entry.name.toLowerCase() === wantedLowerName,
  );
}
/**
 * Remembers what Grid Master's list says, so code that cannot hold a React hook
 * can still read an id synchronously. Called on every successful fetch.
 */
export function primeGridDirectory(rows: readonly GridDirectoryRow[]): void {
  for (const key of Object.keys(CONFIGURED_GRIDS) as ConfiguredGridKey[]) {
    const id = findGridIdByName(CONFIGURED_GRIDS[key].name, rows);
    if (id) {
      resolvedIds.set(key, id);
    } else {
      // Gone from Grid Master (renamed, deleted, never seeded here): drop what we
      // knew rather than keep serving an id nothing stands behind.
      resolvedIds.delete(key);
    }
  }
}
/**
 * This list's grid id as best we know it — Grid Master's own answer once the
 * list has been fetched, the registry's fallback until then.
 */
export function getGridId(key: ConfiguredGridKey): string {
  return resolvedIds.get(key) ?? CONFIGURED_GRIDS[key].fallbackId;
}
/** As `getGridId`, reading `rows` first when a caller already holds the list. */
export function resolveGridId(
  key: ConfiguredGridKey,
  rows?: readonly GridDirectoryRow[],
): string {
  if (rows) {
    const id = findGridIdByName(CONFIGURED_GRIDS[key].name, rows);
    if (id) {
      return id;
    }
  }
  return getGridId(key);
}
/** `/configured-grid-sql/run` for this grid, ready for a master screen's `list`. */
export function gridRunEndpoint(gridId: string | number): string {
  return `/configured-grid-sql/run?grid_id=${gridId}`;
}
/**
 * Whether this grid's SQL lets a caller ask for soft-deleted rows. A grid that
 * hardcodes `x_is_deleted = false` cannot, and a screen should leave its "Show
 * deleted records" checkbox out rather than render one that does nothing.
 */
export function gridSupportsDeletedFilter(key: ConfiguredGridKey): boolean {
  return CONFIGURED_GRIDS[key].deletedParam !== null;
}
/**
 * The `grid_param` entry that asks this grid for live or deleted rows — `{}`
 * when it has no such token. `wantdelete` is sent alongside because the legacy
 * `web` grids bound their filter to that name, and an unmatched key is ignored,
 * so one call works against either grid.
 */
export function buildGridDeletedParam(
  key: ConfiguredGridKey,
  wantDeleted: boolean,
): Record<string, boolean> {
  const token = CONFIGURED_GRIDS[key].deletedParam;
  return token ? { wantdelete: wantDeleted, [token]: wantDeleted } : { wantdelete: wantDeleted };
}
export function resetGridDirectoryForTests(): void {
  resolvedIds.clear();
}
