/**
 * Supplier Dues (menu 297) — the wire shapes of /purchase/supplier-dues/* and
 * /purchase/shortages/close(-undo) (ERP server src/modules/purchase/dues/
 * purchase-supplier-dues.ts, shortage/purchase-shortage.ts). Decimals arrive
 * as strings (pg NUMERIC); read them with `num()`.
 */
type Dec = string | number | null;

/** claims[].lastAction — a return claim's / shortage claim's last settlement standing. */
export type DuesSettlementAction = {
  settlementId: string;
  accYear: string;
  action: string;
  receivedAs?: string | null;
  cnNo?: string | null;
  cnDate?: string | null;
  amount: Dec;
  on?: string | null;
  reason?: string | null;
};

/** One row of `claims[]`: source RETURN (a return row) or SHORTAGE (a shortage claimed on a transporter / insurer). */
export type DuesClaimWire = {
  source: "RETURN" | "SHORTAGE" | string;
  returnItemId: string | null;
  shortageCloseId: string | null;
  accYear: string;
  refno?: string | null;
  claimRef: string;
  docDate: string | null;
  ageDays: number | null;
  lineNo?: number | null;
  srcRefno?: string | null;
  srcDocDate?: string | null;
  srcSupplierInvNo?: string | null;
  itemName: string | null;
  qty?: Dec;
  unitName?: string | null;
  outcome?: string | null;
  kindText: string | null;
  reasonName: string | null;
  claimAgainst: string | null;
  claimPartyId: string | null;
  partyName: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  claimValue: Dec;
  credited: Dec;
  writtenOff: Dec;
  settled?: Dec;
  open: Dec;
  status: string;
  lastSettlementId?: string | null;
  lastAction: DuesSettlementAction | null;
};

/** shortages[].lastAction — the shortage's last close standing. */
export type DuesCloseAction = {
  closeId: string;
  accYear: string;
  kind: string;
  qty: Dec;
  amount?: Dec;
  cnNo?: string | null;
  partyId?: string | null;
  partyName?: string | null;
  reason?: string | null;
  on?: string | null;
};

/** One row of `shortages[]` (= /purchase/shortages/open). */
export type DuesShortageWire = {
  shortageId: string;
  accYear: string;
  supplierId?: string | null;
  supplierName?: string | null;
  itemId?: string | null;
  itemName: string | null;
  unitName: string | null;
  reason: string | null;
  reasonText: string | null;
  srcRefno: string | null;
  srcDocType?: string | null;
  srcDocDate: string | null;
  /** The source bill / GRN / return line; null when not known. */
  srcLineNo?: number | null;
  ageDays: number | null;
  qtyBase: Dec;
  received: Dec;
  closed: Dec;
  openQty: Dec;
  openValue: Dec;
  openGst: Dec;
  costRate: Dec;
  gstPending: boolean | null;
  status: string;
  lastAction: DuesCloseAction | null;
};

export type DuesTotalsWire = {
  openCount: number;
  claims: { rows: number; value: Dec; credited: Dec; writtenOff: Dec; open: Dec };
  shortages: { rows: number; openQtyBase: Dec; openValue: Dec; gstHeld: Dec };
};

export type SupplierDuesWire = {
  claims: DuesClaimWire[];
  shortages: DuesShortageWire[];
  totals: DuesTotalsWire;
  sections?: { claims?: boolean; shortages?: boolean };
  cashNote?: string | null;
};

export type SupplierDuesQuery = { companyId: string; branchId: string; supplierId?: string; all?: "true" };

export type DuesSettleAction = "CREDIT" | "SHORT_SETTLED" | "REJECTED";
export type DuesReceivedAs = "CN" | "ADJUST";

export type DuesSettleRow = { returnItemId?: string; shortageCloseId?: string; accYear: string; amount?: number };

/** POST /purchase/supplier-dues/settle. */
export type DuesSettleBody = {
  rows: DuesSettleRow[];
  deviceId: string;
  action: DuesSettleAction;
  docDate?: string;
  receivedAs?: DuesReceivedAs;
  cnNo?: string;
  cnDate?: string;
  writeOffRest?: boolean;
  writeOffReason?: string;
  reason?: string;
  dryRun: boolean;
};

export type DuesLegWire = {
  drCr: "DR" | "CR" | string;
  role: string | null;
  ledgerId: string | null;
  ledgerName: string | null;
  amount: Dec;
  remarks: string | null;
};

export type DuesSettleStepWire = {
  source: string;
  refno?: string | null;
  action?: string;
  amount?: Dec;
  voucherRefno?: string | null;
  legs: DuesLegWire[];
};

export type DuesSettleAnswer = {
  dryRun: boolean;
  steps: DuesSettleStepWire[];
  totals: { credited: Dec; writtenOff: Dec; gstReavailed: Dec };
  cashNote?: string | null;
};

/** `{ data, message }` — the server's sentence rides along for the hint line. */
export type WithMessage<T> = { data: T; message: string };

export type DuesSettleUndoBody = { settlementId: string; accYear: string; reason: string };
export type ShortageCloseUndoBody = { closeId: string; accYear: string; reason: string };
