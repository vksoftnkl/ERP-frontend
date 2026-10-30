/**
 * Purchase Entry (menu 24) — the header / side wire shapes: charges, the
 * supplier context, payment hold, sister company bills and the held bill
 * (Qt NexERP 88cd3f2, 8f2a1f4, 348957f, 9028830, 4c09536 / eb55337).
 *
 * Every pg NUMERIC arrives as a STRING: read them with `num()`.
 */

type Wire = string | number | null | undefined;

// ---------------------------------------------------------------------------
// Charges (ui_table 62 "PURCHASE INVOICE - CHARGES", server PurchaseChargeDto)
// ---------------------------------------------------------------------------

/** `GET /charges/get?chgModule=P` — module P and B, active rows only. */
/** The purchase charge master row — shared with the GRN (shared/purchase-charges.ts). */
export type { PurchaseChargeMasterRow } from "../shared/purchase-charges";

/** One charge row on screen (Qt `PurchaseChargeCols`). */
export type InvoiceChargeRow = {
  key: string;
  chgId: string;
  name: string;
  onBill: boolean;
  method: string;
  /** The Basis cell as worded ("% of value · before tax", "Per qty · our cost"). */
  basis: string;
  /** As typed. */
  rate: string;
  /** As typed, or the server's last figure. */
  amount: string;
  /** The operator typed the Amount: it is sent as the amount, the rate ignored. */
  typed: boolean;
  /** Off-bill payees: employee (or ledger) ids, in pick order. */
  payeeIds: string[];
  payeeNames: string[];
  /** The server's figures, painted back. */
  gst: number;
  net: number;
  /** Whether the server has priced this row (Amount / GST / Net are its). */
  priced: boolean;
  /** Callout 14 "Into cost": an on-bill charge per its master (chgLandingCost); an off-bill one always. */
  landingCost?: boolean;
};

export type PurchaseChargePayeeDto = { partyId: string; amount?: number };

export type PurchaseChargeDto = {
  chgId: string;
  rate?: number;
  amount?: number;
  payees?: PurchaseChargePayeeDto[];
};

/** One charge of `/validate`'s answer, in the order the charges were sent. */
export type PurchaseChargeCalc = {
  chgId?: string;
  amount?: Wire;
  cgst?: Wire;
  sgst?: Wire;
  igst?: Wire;
  cess?: Wire;
  payees?: { partyId: string; amount?: Wire }[];
};

/** One stored charge row (txn_charge_detail) — one per charge, or per payee off-bill. */
export type PurchaseChargeStored = {
  chgId: string;
  chgName?: string | null;
  onBill?: boolean | null;
  beforeTax?: boolean | null;
  method?: string | null;
  type?: string | null;
  landingCost?: boolean | null;
  taxPct?: Wire;
  rate?: Wire;
  amount?: Wire;
  partyId?: string | null;
  partyName?: string | null;
  cgst?: Wire;
  sgst?: Wire;
  igst?: Wire;
};

// ---------------------------------------------------------------------------
// Supplier context (GET /purchase/lookup/supplier-context)
// ---------------------------------------------------------------------------

export type SupplierContext = {
  supplierId: string;
  name?: string | null;
  gstNo?: string | null;
  gstType?: string | null;
  stateCode?: string | null;
  stateName?: string | null;
  creditDays?: number | null;
  notes?: string | null;
  showNotesOnEntry?: boolean | null;
  isImport?: boolean | null;
  defaultGodownId?: string | null;
  defaultGodownName?: string | null;
  msme?: {
    category?: string | null;
    activity?: string | null;
    udyamNo?: string | null;
    writtenAgreement?: boolean | null;
    agreedDays?: number | null;
    dueDays?: number | null;
    payBy?: string | null;
  } | null;
  pendingPos?: { poId: string; accYear: string; refno: string; docDate: string | null; lines: number }[];
  outstanding?: {
    payable?: Wire;
    debits?: Wire;
    balance?: Wire;
    bills?: number | null;
    overdueBills?: number | null;
    oldestDue?: string | null;
    billsOnHold?: number | null;
  } | null;
  warnings?: { code: string; message: string }[];
};

export type SupplierContextQuery = {
  companyId: string;
  branchId: string;
  supplierId: string;
  onDate?: string;
};

// ---------------------------------------------------------------------------
// Sister company bills (DOC-08: GET /purchase/sister-bills, /lines)
// ---------------------------------------------------------------------------

export type SisterBill = {
  sbId: string;
  accYear: string;
  refno: string;
  billDate: string | null;
  amount: Wire;
  items: number | null;
  sisterCompanyId: string;
  sisterCompanyName: string | null;
  sisterGstin?: string | null;
  /** The sister company as OUR supplier (null = not set up as one). */
  supplierId: string | null;
  supplierName: string | null;
  /** Why it cannot be pulled; null = ready. */
  blocked: string | null;
};

export type SisterBillLine = {
  sisterSaleItemId: string;
  sisterSaleItemAccYear: string;
  saleLineNo?: number | null;
  itemId: string;
  itemName: string | null;
  uomId: string;
  unitName: string | null;
  billedQty: Wire;
  freeQty: Wire;
  rate: Wire;
  gstPct?: Wire;
  mrp?: Wire;
  batchNo: string | null;
  expiryDate: string | null;
};

export type SisterBillPull = { bill: SisterBill; lines: SisterBillLine[] };
