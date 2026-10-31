/**
 * Loyalty Status (menu 79) — the wire shapes of `/reports/loyalty-status/*`
 * and `/loyalty/members/*`, as the server's own types file states them
 * (`ERP server/src/modules/reports/loyalty-status/types/loyalty-status.types.ts`
 * and `sales/loyalty/members/loyalty-members.service.ts`), read live on :3011.
 *
 * Points are NUMBERS (the ledger keeps four decimals). Money is a STRING with
 * two decimals, or `null` where the screen shows "—". Dates are `YYYY-MM-DD`.
 */

export const LOYALTY_STATUS_MENU_ID = 79;
export const LOYALTY_STATUS_HREF = "/sales/loyalty-status";

/** A list route answers at most this many rows a page (Qt `kPage`). */
export const LOYALTY_PAGE_LIMIT = 200;
/** The export's cap, and the screen's (Qt `kMaxRows`). */
export const LOYALTY_MAX_ROWS = 20_000;

/** The refusals the report and its actions make (the menu's rights first). */
export const LST_CODE = {
  RIGHT_VIEW: "LST_RIGHT_VIEW",
  RIGHT_EDIT: "LST_RIGHT_EDIT",
  RIGHT_DELETE: "LST_RIGHT_DELETE",
  RIGHT_PRINT: "LST_RIGHT_PRINT",
  RIGHT_EXPORT: "LST_RIGHT_EXPORT",
} as const;

export type MemberStatus = "ACTIVE" | "SUSPENDED" | "CLOSED" | "MERGED";

export type BestGift = {
  lsgId: string;
  itemId: string;
  name: string;
  points: number;
  qty: number;
};

/* ------------------------------------------------------------ members */

export type MemberItem = {
  memberId: string;
  custId: string;
  cardNo: string | null;
  customerName: string | null;
  mobile: string | null;
  lscId: string | null;
  schemeName: string | null;
  status: string;
  earned: number;
  redeemed: number;
  expired: number;
  gift: number;
  adjusted: number;
  balance: number;
  redeemable: number;
  cooling: number;
  lapsed: number;
  value: string | null;
  nextExpiryOn: string | null;
  nextExpiryPoints: number;
  bestGift: BestGift | null;
  eligible: boolean;
  lastActivityOn: string | null;
  enrolledOn: string;
  branchId: string | null;
  branchName: string | null;
};

export type MembersSummary = {
  members: number;
  active: number;
  suspended: number;
  outstanding: number;
  outstandingValue: string;
  earnedInPeriod: number;
  earnedBills: number;
  redeemedInPeriod: number;
  redeemedValue: string;
  giftEligible: number;
  giftsLowOnStock: number;
  expiring30Points: number;
  expiring30Members: number;
};

/** One page of a list route. */
export type ListPage<T, S> = {
  asOn: string;
  items: T[];
  total: number;
  summary: S;
};

/* ---------------------------------------------------------- statement */

export type StatementRow = {
  lldId: string;
  accYear: string;
  txnDate: string;
  txnTime: string | null;
  txnType: string;
  srcDocType: string | null;
  srcDocId: string | null;
  srcAccYear: string | null;
  srcDocRefno: string | null;
  lscId: string | null;
  schemeName: string | null;
  reason: string;
  baseAmount: string;
  points: number;
  runningBalance: number;
  expiresOn: string | null;
  activeFrom: string | null;
  isReversal: boolean;
  reversalOfId: string | null;
  lotId: string | null;
};

export type StatementPayload = {
  memberId: string;
  from: string | null;
  to: string;
  opening: number;
  rows: StatementRow[];
  closing: number;
};

/* -------------------------------------------------------- member card */

export type MemberLot = {
  lotId: string;
  accYear: string;
  txnType: string;
  earnedOn: string;
  srcDocRefno: string | null;
  lscId: string | null;
  points: number;
  used: number;
  left: number;
  expiresOn: string | null;
  activeFrom: string | null;
  state: string;
};

export type MemberCard = {
  memberId: string;
  custId: string;
  customerName: string | null;
  cardNo: string | null;
  mobile: string | null;
  enrolledOn: string;
  lifetimeBillAmt: string;
  lifetimeBillCnt: number;
  lastEarnOn: string | null;
  lastRedeemOn: string | null;
  lastActivityOn: string | null;
  status: string;
  blockReason: string | null;
  lscId: string | null;
  schemeName: string | null;
  branchId: string | null;
  branchName: string | null;
};

export type SchemeRedeemRules = {
  allowPointRedeem: boolean;
  allowGiftRedeem: boolean;
  redeemValuePerPoint: string | null;
  minRedeemPoints: number;
  maxRedeemPoints: number;
  redeemMultiple: number;
  maxRedeemPerc: number;
  activationDays: number;
  pointsValidDays: number;
};

export type MemberPayload = {
  asOn: string;
  card: MemberCard;
  balance: number;
  redeemable: number;
  cooling: number;
  coolingFrom: string | null;
  lapsed: number;
  lots: MemberLot[];
  bestGift: BestGift | null;
  eligible: boolean;
  tenderValue: string | null;
  rules: SchemeRedeemRules | null;
  unlotted: number;
};

/* ----------------------------------------------------------- expiring */

export type ExpiringItem = {
  memberId: string;
  custId: string;
  customerName: string | null;
  cardNo: string | null;
  mobile: string | null;
  lscId: string | null;
  schemeName: string | null;
  status: string;
  expiresOn: string;
  daysLeft: number;
  points: number;
  value: string | null;
  balance: number;
  balanceAfter: number;
  lastActivityOn: string | null;
  branchId: string | null;
  branchName: string | null;
};

export type ExpiringBucket = {
  label: string;
  fromDay: number;
  toDay: number;
  points: number;
  members: number;
};

export type ExpiringSummary = {
  buckets: ExpiringBucket[];
  valueAtRisk: string;
  members: number;
  points: number;
};

export type CalendarWeek = {
  /** Monday. */
  weekStart: string;
  points: number;
  members: number;
};

export type CalendarPayload = {
  asOn: string;
  days: number;
  weeks: CalendarWeek[];
};

/* ------------------------------------------------------------ schemes */

export type SchemeItem = {
  lscId: string;
  schemeName: string;
  schemeCode: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  pointsValidTill: string | null;
  branchId: string | null;
  branchName: string | null;
  month: string | null;
  holders: number | null;
  bills: number;
  opening: number;
  earned: number;
  redeemed: number;
  gift: number;
  expired: number;
  adjusted: number;
  outstanding: number;
  value: string | null;
  usedPct: number | null;
};

export type SchemesSummary = {
  bills: number;
  opening: number;
  earned: number;
  redeemed: number;
  gift: number;
  expired: number;
  adjusted: number;
  outstanding: number;
  value: string;
};

export type SchemesPayload = {
  asOn: string;
  from: string;
  to: string;
  splitBy: string;
  items: SchemeItem[];
  total: number;
  summary: SchemesSummary;
};

export type SchemeMonth = {
  /** `YYYY-MM` */
  month: string;
  earned: number;
  redeemedPlusGift: number;
  expired: number;
  adjusted: number;
  partial: boolean;
};

export type MonthlyPayload = {
  lscId: string;
  schemeName: string;
  from: string;
  to: string;
  months: SchemeMonth[];
};

export type GiftItem = {
  lsgId: string;
  slno: number;
  itemId: string;
  itemName: string;
  itemQty: number;
  points: number;
  repeat: boolean;
  maxQtyPerBill: number | null;
  stockCheck: boolean;
  validFrom: string | null;
  validUpto: string | null;
  isActive: boolean;
  eligibleMembers: number;
  issuedInPeriod: number;
  /** NULL when the gift does not check stock. */
  inStock: string | null;
};

export type GiftsPayload = {
  asOn: string;
  lscId: string;
  schemeName: string;
  from: string;
  to: string;
  gifts: GiftItem[];
};

/* ------------------------------------------------------------- export */

export type ExportTab = "members" | "expiring" | "schemes";
export type ExportFormat = "pdf" | "xlsx";

export type ExportPayload = {
  tab: string;
  format: string;
  asOn: string;
  /** Every filter applied, as one line, built by the server. */
  printedAs: string;
  companyName: string | null;
  branchName: string | null;
  totalRows: number;
  rows: Array<Record<string, unknown>>;
  summary: unknown;
};

/* ------------------------------------------------------------ actions */

export type SettableStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

/** `POST /loyalty/members/status` */
export type MemberStatusBody = {
  companyId: string;
  memberId: string;
  status: SettableStatus;
  reason?: string;
  force?: boolean;
  approvedBy?: string;
};

/** `POST /loyalty/members/adjust` */
export type MemberAdjustBody = {
  companyId: string;
  branchId: string;
  memberId: string;
  points: number;
  reason: string;
  approvedBy: string;
};

export type HistoryStep = {
  seqNo: number;
  event: string;
  fromStatus: string | null;
  toStatus: string;
  changedOn: string;
  changedBy: string;
  changedByName: string | null;
  remarks: string | null;
};

export type HistoryPayload = {
  memberId: string;
  steps: HistoryStep[];
};
