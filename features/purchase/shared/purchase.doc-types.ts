/**
 * The purchase documents on the shared transaction list — the Qt
 * `TxnDocTypes::purchaseInvoice()` … `shortageReceipt()`
 * (src/modules/purchase/common/txn_doc_types_purchase.cpp, NexERP 3ce8487..b8f615e).
 *
 * Every list grid (189–193) binds the same six QUOTED tokens as the transfer
 * grids: `'icompany_id'`, `'ibranch_id'`, `'iacc_year'`, `'ifrom_date'`,
 * `'ito_date'`, `'istatus'` — the last three NULLIF-guarded, so "" is no bound.
 *
 * No list deletes: Qt sets no `onDelete` for a purchase document and the server
 * has no delete route. A POSTED one is cancelled (F3), with a reason.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { PurchaseDocType } from "./purchase.types";

/** Raw grid row values, by SQL alias. */
export type PurchaseListRow = Record<string, unknown>;

export type PurchaseCancelAction = {
  /** POST route, WITHOUT `/api/v1`. Body `{ [idKey]: id, accYear, reason }`. */
  endpoint: string;
  idKey: string;
  question: string;
  toolTip: string;
  /** May this row be cancelled at all (before rights)? */
  enabledFor: (row: PurchaseListRow) => boolean;
};

export type PurchaseDocTypeConfig = {
  docType: PurchaseDocType;
  menuId: number;
  /** `/txn/adjacent` + the status trail's doc type. */
  docTypeCode: "PURCHASE_BILL" | "PURCHASE_ORDER" | "GRN" | "PURCHASE_RETURN" | "SHORTAGE_RECEIPT";
  title: string;
  listTitle: string;
  listSubtitle: string;
  /** Lower-case singular, for sentences ("No purchase order in this window."). */
  noun: string;
  gridKey: ConfiguredGridKey;
  /** Grid columns, by SQL alias. */
  fields: {
    id: string;
    company: string;
    branch: string;
    accYear: string;
    ref: string;
    status: string;
    docDate: string;
  };
  /** CrudMasterPage's `name` / `short` / `alias` columns — exact SQL aliases. */
  nameField: string;
  shortField: string;
  aliasField: string;
  searchHint: string;
  /** The Status filter's POSTED word (every purchase document says POSTED). */
  postedLabel: string;
  /** Why a POSTED row opens read-only. */
  postedReason: string;
  /** Why a CANCELLED row opens read-only. */
  cancelledReason: string;
  dateColumns: readonly string[];
  moneyColumns: readonly string[];
  cancel: PurchaseCancelAction;
  /** Screen memory slot (lib/screen-memory). */
  memoryKey: string;
};

function upper(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim().toUpperCase();
}

export const PURCHASE_LIST_DEFAULT_DAYS_BACK = 30;

export const PURCHASE_DOC_TYPES: Readonly<Record<PurchaseDocType, PurchaseDocTypeConfig>> = {
  // Purchase Entry (menu 24) — the supplier's bill.
  invoice: {
    docType: "invoice",
    menuId: 24,
    docTypeCode: "PURCHASE_BILL",
    title: "Purchase Entry",
    listTitle: "Purchase Invoices",
    listSubtitle: "Supplier bills — stock in, supplier credited.",
    noun: "purchase invoice",
    gridKey: "purchaseInvoiceList",
    fields: {
      id: "pi_id",
      company: "pi_company_id",
      branch: "pi_branch_id",
      accYear: "pi_acc_year",
      ref: "pi_refno",
      status: "pi_status",
      docDate: "pi_doc_date",
    },
    nameField: "sup_name",
    shortField: "pi_supplier_inv_no",
    aliasField: "pi_remarks",
    searchHint: "our no, supplier invoice, supplier or remarks",
    postedLabel: "POSTED",
    postedReason: "Posted — stock and books are written. Cancel it to undo.",
    cancelledReason: "Cancelled — its reversal is part of the history.",
    dateColumns: ["pi_doc_date", "pi_supplier_inv_date"],
    moneyColumns: ["pi_taxable_amt", "tax_amt", "pi_net_payable", "pi_short_value"],
    cancel: {
      endpoint: "/purchase/invoices/cancel",
      idKey: "piId",
      question: "Why is this bill being cancelled?",
      toolTip: "Undo a posted bill nothing has paid",
      enabledFor: (row) => upper(row.pi_status) === "POSTED",
    },
    memoryKey: "purchase/purchase-entry",
  },
  // Purchase Order (menu 23).
  order: {
    docType: "order",
    menuId: 23,
    docTypeCode: "PURCHASE_ORDER",
    title: "Purchase Order",
    listTitle: "Purchase Orders",
    listSubtitle: "What we asked the supplier for — received and pending per line.",
    noun: "purchase order",
    gridKey: "purchaseOrderList",
    fields: {
      id: "po_id",
      company: "po_company_id",
      branch: "po_branch_id",
      accYear: "po_acc_year",
      ref: "po_refno",
      status: "po_status",
      docDate: "po_doc_date",
    },
    nameField: "sup_name",
    shortField: "po_closed",
    aliasField: "po_remarks",
    searchHint: "PO no, supplier or remarks",
    postedLabel: "POSTED",
    postedReason: "Confirmed — open it to short-close; cancel only while nothing is received.",
    cancelledReason: "Cancelled — kept for the history.",
    dateColumns: ["po_doc_date", "po_expected_date"],
    moneyColumns: ["po_taxable_amt", "po_tax_amt", "po_net_amt"],
    cancel: {
      endpoint: "/purchase/orders/cancel",
      idKey: "poId",
      question: "Why is this order being cancelled?",
      toolTip: "Cancel an order nothing has been received against",
      enabledFor: (row) => upper(row.po_status) !== "CANCELLED",
    },
    memoryKey: "purchase/purchase-order",
  },
  // GRN (menu 196) — goods in before the bill.
  grn: {
    docType: "grn",
    menuId: 196,
    docTypeCode: "GRN",
    title: "Goods Received Note",
    listTitle: "Goods Received Notes",
    listSubtitle: "Goods in before the bill — stock in at the provisional rate.",
    noun: "GRN",
    gridKey: "grnList",
    fields: {
      id: "grn_id",
      company: "grn_company_id",
      branch: "grn_branch_id",
      accYear: "grn_acc_year",
      ref: "grn_refno",
      status: "grn_status",
      docDate: "grn_doc_date",
    },
    nameField: "sup_name",
    shortField: "grn_challan_no",
    aliasField: "grn_vehicle_no",
    searchHint: "GRN no, supplier, challan or vehicle",
    postedLabel: "POSTED",
    postedReason: "Posted — the stock is in. Cancel it (before it is billed) to undo.",
    cancelledReason: "Cancelled — kept for the history.",
    dateColumns: ["grn_doc_date"],
    moneyColumns: ["grn_provisional_value", "grn_offbill_charges"],
    cancel: {
      endpoint: "/purchase/grns/cancel",
      idKey: "grnId",
      question: "Why is this GRN being cancelled?",
      toolTip: "Undo a posted GRN that is not billed yet",
      enabledFor: (row) => upper(row.grn_status) === "POSTED" && upper(row.grn_billed) === "",
    },
    memoryKey: "purchase/grn",
  },
  // Purchase Return (menu 25) — debit notes, claims, replacements.
  return: {
    docType: "return",
    menuId: 25,
    docTypeCode: "PURCHASE_RETURN",
    title: "Purchase Return",
    listTitle: "Purchase Returns",
    listSubtitle: "Goods back to the supplier — debit notes, claims, replacements.",
    noun: "purchase return",
    gridKey: "purchaseReturnList",
    fields: {
      id: "pr_id",
      company: "pr_company_id",
      branch: "pr_branch_id",
      accYear: "pr_acc_year",
      ref: "pr_refno",
      status: "pr_status",
      docDate: "pr_doc_date",
    },
    nameField: "sup_name",
    shortField: "pr_our_ref",
    aliasField: "pr_supplier_cn_no",
    searchHint: "return no, supplier, bill or credit note",
    postedLabel: "POSTED",
    postedReason: "Posted — the goods are out and the supplier debited. Cancel it to undo.",
    cancelledReason: "Cancelled — kept for the history.",
    dateColumns: ["pr_doc_date"],
    moneyColumns: ["pr_return_value", "pr_claim_value"],
    cancel: {
      endpoint: "/purchase/returns/cancel",
      idKey: "prId",
      question: "Why is this return being cancelled?",
      toolTip: "Undo a return whose debit note is unadjusted and claims unsettled",
      enabledFor: (row) => upper(row.pr_status) !== "CANCELLED",
    },
    memoryKey: "purchase/purchase-return",
  },
  // Shortage Receipt (menu 195) — goods that came short, arriving later.
  shortage: {
    docType: "shortage",
    menuId: 195,
    docTypeCode: "SHORTAGE_RECEIPT",
    title: "Shortage Receipt",
    listTitle: "Shortage Receipts",
    listSubtitle: "Goods that came short, arriving later — and shortages closed without them.",
    noun: "shortage receipt",
    gridKey: "shortageReceiptList",
    fields: {
      id: "psr_id",
      company: "psr_company_id",
      branch: "psr_branch_id",
      accYear: "psr_acc_year",
      ref: "psr_refno",
      status: "psr_status",
      docDate: "psr_doc_date",
    },
    nameField: "sup_name",
    shortField: "psr_challan_no",
    aliasField: "psr_remarks",
    searchHint: "receipt no, supplier or challan",
    postedLabel: "POSTED",
    postedReason: "Posted — the goods are in. Cancel it to open the shortage again.",
    cancelledReason: "Cancelled — kept for the history.",
    dateColumns: ["psr_doc_date"],
    moneyColumns: ["psr_value"],
    cancel: {
      endpoint: "/purchase/shortages/receipt/cancel",
      idKey: "psrId",
      question: "Why is this receipt being cancelled?",
      toolTip: "Undo a shortage receipt — the goods go out, the shortage is open again",
      enabledFor: (row) => upper(row.psr_status) !== "CANCELLED",
    },
    memoryKey: "purchase/shortage-receipt",
  },
};

/** What may be done to a list row, and why not (Qt `postedLocked`). */
export function purchaseRowPolicy(
  config: PurchaseDocTypeConfig,
  status: string,
): { canEdit: boolean; reason: string } {
  const value = status.trim().toUpperCase();
  if (value === "POSTED") {
    return { canEdit: false, reason: config.postedReason };
  }
  if (value === "CANCELLED") {
    return { canEdit: false, reason: config.cancelledReason };
  }
  return { canEdit: true, reason: "" };
}

/** The Status filter's choices; "" = All (sent, so the NULLIF guard sees no bound). */
export function purchaseStatusOptions(config: PurchaseDocTypeConfig): { value: string; label: string }[] {
  return [
    { value: "", label: "All" },
    { value: "DRAFT", label: "DRAFT" },
    { value: config.postedLabel, label: config.postedLabel },
    { value: "CANCELLED", label: "CANCELLED" },
  ];
}
