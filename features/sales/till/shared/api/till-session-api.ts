/**
 * The till session's routes — `/till/sessions/*`, `/till/movements/*`,
 * `/till/denominations/list` — the safe's (`/till/safes/*`, remit, notes 118),
 * the approval gate's (`/till/approvals/*`, notes 124 §5)
 * and the configured grids the till screens read (134, 144–148, 157, 158),
 * one typed function each.
 *
 * The requests ride `baseApi` for the bearer token and its refresh-on-401.
 * Both endpoints are MUTATIONS: a read is a mutation that sends a GET (the
 * Ledger Statement's finding — a query endpoint hands a second request for a
 * pending key the first one's promise, so an aborted read starves the next),
 * and every call is its own request with nothing cached. The screens own
 * their state, and a session's state is exactly what must not be served
 * stale (the server marks every till GET `@CacheTTL(0)` for the same reason).
 *
 * Every function returns the envelope's `data`. A refusal throws the RTK error
 * (`{ status, data }`); `../errors.ts#tillErrorOf` reads it.
 *
 * The two `…Quiet` reads are the exception: QUERY endpoints dispatched
 * `initiate(arg, { subscribe: false, forceRefetch: true })`, like the live-cash
 * reads. They are for a timer (Open Till re-checks a session waiting for its
 * approver every 15 s): every fulfilled MUTATION is announced as a data change
 * by the store's `announceMutations`, so a polled GET-as-mutation would make
 * this tab's `useDataRefresh` subscribers re-read on every tick. Nothing aborts
 * them, so the pending-key dedupe only ever shares one honest answer.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import type {
  GridRow,
  TillApprovalInboxPayload,
  TillApprovalPayload,
  TillCashApprovalResult,
  TillChangeResult,
  TillCountLine,
  TillCountResult,
  TillDenominationRow,
  TillForceCloseResult,
  TillMovementDetail,
  TillMovementFull,
  TillOpenCheck,
  TillRemitConfirmResult,
  TillRemitMode,
  TillRemitResult,
  TillReviewCreateResult,
  TillReviewListPayload,
  TillReviewOutcome,
  TillSafeBalance,
  TillSafeCountResult,
  TillSafeDecisionResult,
  TillSafeGapTreatment,
  TillSessionKey,
  TillSessionPayload,
  TillSessionReopenResult,
  TillSlipCheckPayload,
  TillSlipCheckResult,
  TillSupervisor,
  TillApprovableTreatment,
  TillVarianceDecision,
  TillVarianceDecisionResult,
  TillXReport,
} from "../wire/types";

type Params = Record<string, string | number | boolean | undefined>;

export const tillSessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    tillSessionScreenRead: builder.mutation<unknown, { url: string; params: Params }>({
      query: ({ url, params }) => ({ url, method: "GET", params }),
    }),
    tillSessionScreenWrite: builder.mutation<unknown, { url: string; body: Record<string, unknown> }>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
    }),
    tillSessionQuietRead: builder.query<unknown, { url: string; params: Params }>({
      query: ({ url, params }) => ({ url, params }),
      keepUnusedDataFor: 0,
    }),
  }),
});

/** A fresh read every time, held by nothing once it has answered. */
const QUIET_READ = { subscribe: false, forceRefetch: true } as const;

const GRID_RUN = "/configured-grid-sql/run";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit: 2,000 documents in one shift is already absurd. */
const GRID_MAX_PAGES = 20;

function dataOf<T>(raw: unknown): T {
  return (raw as { data?: T } | null)?.data as T;
}

async function read<T>(dispatch: AppDispatch, url: string, params: Params): Promise<T> {
  const request = dispatch(tillSessionApi.endpoints.tillSessionScreenRead.initiate({ url, params }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

async function write<T>(dispatch: AppDispatch, url: string, body: Record<string, unknown>): Promise<T> {
  const request = dispatch(tillSessionApi.endpoints.tillSessionScreenWrite.initiate({ url, body }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

async function quietRead<T>(dispatch: AppDispatch, url: string, params: Params): Promise<T> {
  return dataOf<T>(
    await dispatch(tillSessionApi.endpoints.tillSessionQuietRead.initiate({ url, params }, QUIET_READ)).unwrap(),
  );
}

function inboxOf(data: TillApprovalInboxPayload | null | undefined): TillApprovalInboxPayload {
  return { items: Array.isArray(data?.items) ? data.items : [], expired: Number(data?.expired ?? 0) || 0 };
}

function keyParams(key: TillSessionKey): Params {
  return { companyId: key.companyId, branchId: key.branchId, accYear: key.accYear, tssId: key.tssId };
}

export type TillOpenBody = {
  companyId: string;
  branchId: string;
  counterId?: string;
  floatMode: "ISSUED" | "CARRIED";
  floatIssued?: number;
  prevSessionId?: string;
  lines: TillCountLine[];
  reasonId?: string;
  notes?: string;
  /**
   * Notes 124 §5: an APPROVED FLOAT_MISMATCH request for this counter, after
   * the open answered 428 TILL_APPROVAL_REQUIRED (till.approval_gate REFUSE).
   */
  approvalId?: string;
};

export type TillCountBody = TillSessionKey & { lines: TillCountLine[] };

export type TillCloseBody = TillSessionKey & { floatLeft: number | null };

export type TillSlipCheckBody = TillSessionKey & {
  tenderId: string;
  ticked: number;
  noSlip: string[];
  amountDiffers: string[];
  slipsWithoutRow: { amount: number; authCode: string | null; cardLast4: string | null }[];
  notes: string | null;
};

export type TillMovementBody = TillSessionKey & {
  kind: "DROP" | "PAID_IN" | "PICKUP" | "TOP_UP";
  amount?: number;
  lines?: TillCountLine[];
  reasonId?: string;
  refNo?: string | null;
  ledgerId?: string;
  partyName?: string | null;
  bagNo?: string | null;
  sealNo?: string | null;
  /**
   * Notes 110 — PICKUP / TOP_UP only: the supervisor standing at the counter
   * (one of `supervisors()`), who signs with their own till PIN after the
   * count. The cashier signs by being logged in. (Notes 108's `witnessPin` is
   * no longer read by the server.)
   */
  supervisorId?: string;
  supervisorPin?: string;
  notes: string | null;
};

/** `DecideTillVarianceDto`: on a PENDING_APPROVAL session, by an approver who is not its cashier. */
export type TillDecideVarianceBody = TillSessionKey & {
  decision: TillVarianceDecision;
  /** APPROVE only. */
  treatment?: TillApprovableTreatment | null;
  /** APPROVE only: a till_reason of category VARIANCE (cash gap) or NONCASH (slip gap). */
  reasonId?: string | null;
  /** Required (trimmed, ≤ 500). */
  note: string;
  /** The approver's till PIN — required on a COUNTER channel rule; on EITHER it stands in for remote authority. */
  approverPin?: string | null;
  /**
   * Notes 113: decide a received bag's RECEIVE-stage difference instead — the
   * variance's `tvrMovementId`; APPROVE only (the receiver's count stands).
   */
  tcmId?: string;
};

/**
 * `ApproveTillCashDto` (notes 114, 273 OVERRIDE): a CLOSED session's hand-over
 * and drops into the safe. `receivedAmount` left out = exactly what was handed
 * over; `treatment` + `reasonId` decide a gap beyond tolerance now, left out it
 * waits for another approver.
 */
export type TillApproveCashBody = TillSessionKey & {
  approverPin?: string;
  receivedAmount?: number;
  treatment?: TillApprovableTreatment;
  reasonId?: string;
  notes?: string;
};

/** `ForceCloseTillSessionDto` (notes 117): the supervisor's count closes a session whose cashier has gone. */
export type TillForceCloseBody = TillSessionKey & {
  /** A FORCE_CLOSE reason. */
  reasonId: string;
  approverPin: string;
  lines: TillCountLine[];
  floatLeft?: number | null;
  notes?: string;
};

/** `ReopenTillSessionDto` (notes 117): a CLOSED session back to COUNTING. */
export type TillReopenBody = TillSessionKey & {
  /** A REOPEN reason. */
  reasonId: string;
  approverPin: string;
  notes?: string;
};

/**
 * `TillChangeDto` (273 OVERRIDE): change carried between two live counters — a
 * PICKUP on `fromTssId` and a TOP_UP on `toTssId`, both through the counters'
 * safe. The giving cashier always signs (`fromWitnessPin`); the taking one too
 * (`toWitnessPin`) unless the caller is that cashier. A PICKUP reason.
 */
export type TillChangeBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  fromTssId: string;
  toTssId: string;
  lines: TillCountLine[];
  reasonId: string;
  fromWitnessPin?: string | null;
  toWitnessPin?: string | null;
  notes?: string | null;
};

/**
 * `VoidTillMovementDto`: a hand-posted movement (273 OVERRIDE) or a remittance
 * (287 OVERRIDE) voided — its voucher mirrored, the row VOIDED. A MOVEMENT_VOID reason.
 */
export type TillVoidMovementBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  tcmId: string;
  reasonId: string;
  notes?: string | null;
};

/** `CountTillSafeDto` (287 CREATE): a blind count of the safe, an optional witness with their till PIN. */
export type TillSafeCountBody = {
  companyId: string;
  branchId: string;
  safeId: string;
  lines: TillCountLine[];
  notes?: string | null;
  witnessId?: string | null;
  witnessPin?: string | null;
  /** Deciding the gap in the same step (287 OVERRIDE) — the web screen, like Qt, never sends it. */
  treatment?: TillSafeGapTreatment | null;
  reasonId?: string | null;
  approverPin?: string | null;
};

/** `DecideTillSafeVarianceDto` (287 OVERRIDE): a PENDING safe gap, two-person as shipped. */
export type TillSafeDecideBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  tvrId: string;
  treatment: TillSafeGapTreatment;
  /** A VARIANCE reason. */
  reasonId: string;
  approverPin?: string | null;
  secondId?: string | null;
  secondPin?: string | null;
  notes?: string | null;
};

/** `RemitTillCashDto` (287 CREATE): cash from the safe to the bank. */
export type TillRemitBody = {
  companyId: string;
  branchId: string;
  safeId: string;
  amount: number;
  bankLedgerId: string;
  mode: TillRemitMode;
  bagNo?: string | null;
  sealNo?: string | null;
  citAgency?: string | null;
  slipNo?: string | null;
  /** yyyy-MM-dd. */
  slipDate?: string | null;
  /** The notes sent (optional); must make `amount`. */
  lines?: TillCountLine[] | null;
  notes?: string | null;
  approverId?: string | null;
  approverPin?: string | null;
};

/** `ConfirmTillRemitDto` (287 CREATE): a CIT remittance against the bank statement. */
export type TillRemitConfirmBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  tcmId: string;
  /** yyyy-MM-dd. */
  bankDate: string;
  bankRef: string;
  /** Left out = what was sent. */
  bankAmount?: number | null;
  notes?: string | null;
};

/**
 * `RequestTillApprovalDto` (notes 124 §5, 272 VIEW or 273 VIEW): what a 428
 * TILL_APPROVAL_REQUIRED named, asked for. `approverId` + `approverPin` = the
 * approver standing at the counter decides it in this call; left out it waits
 * PENDING in the inbox (asking again for the same document returns it).
 */
export type TillApprovalRequestBody = {
  companyId: string;
  branchId: string;
  event: string;
  amount: number;
  sessionId?: string | null;
  accYear?: string | null;
  srcDocType?: string | null;
  srcDocId?: string | null;
  srcRefno?: string | null;
  reasonId?: string | null;
  note?: string | null;
  approverId?: string | null;
  approverPin?: string | null;
  secondId?: string | null;
  secondPin?: string | null;
};

/** `DecideTillApprovalDto` (273 OVERRIDE): the caller is the approver. */
export type TillApprovalDecideBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  tapId: string;
  decision: "APPROVE" | "REJECT";
  /** Required (trimmed, ≤ 500). */
  note: string;
  approverPin?: string | null;
  /** APPROVE under a two-person rule. */
  secondId?: string | null;
  secondPin?: string | null;
};

/** `CancelTillApprovalDto`: whoever asked (anyone else needs 273 OVERRIDE). */
export type TillApprovalCancelBody = {
  companyId: string;
  branchId: string;
  accYear: string;
  tapId: string;
  note?: string | null;
};

/**
 * `CreateTillReviewDto` (notes 134 §2.1, Cash Position 289 CREATE): head
 * office's verdict on a business day or a till session of the branch. Exactly
 * one of `dayId` / `sessionId`; `note` unless OK; the journal only on
 * WRITTEN_OFF / SUSPENSE_CLEARED. Never edited: a later one supersedes it.
 */
export type TillReviewCreateBody = {
  companyId: string;
  branchId: string;
  /** The year of the day / session reviewed. */
  accYear: string;
  dayId?: string | null;
  sessionId?: string | null;
  outcome: TillReviewOutcome;
  note?: string | null;
  refVoucherId?: string | null;
  refVoucherAccYear?: string | null;
};

export type TillSessionClient = {
  openCheck: (scope: { companyId: string; branchId: string; counterId?: string }) => Promise<TillOpenCheck>;
  /** `openCheck` for a timer: a query, so it is not announced as a data change (see the header). */
  openCheckQuiet: (scope: { companyId: string; branchId: string; counterId?: string }) => Promise<TillOpenCheck>;
  open: (body: TillOpenBody) => Promise<TillSessionPayload>;
  get: (key: TillSessionKey) => Promise<TillSessionPayload>;
  /** `get` for a timer: a query, so it is not announced as a data change (see the header). */
  getQuiet: (key: TillSessionKey) => Promise<TillSessionPayload>;
  /** 273 OVERRIDE: every expected figure; refused to the session's own cashier until it closes. */
  expected: (key: TillSessionKey) => Promise<TillSessionPayload>;
  resume: (key: TillSessionKey) => Promise<TillSessionPayload>;
  suspend: (key: TillSessionKey) => Promise<TillSessionPayload>;
  endBilling: (key: TillSessionKey) => Promise<TillSessionPayload>;
  count: (body: TillCountBody) => Promise<TillCountResult>;
  close: (body: TillCloseBody) => Promise<TillSessionPayload>;
  /** Notes 105 A: APPROVE the PENDING variances with a treatment, or send the session back for a RECOUNT. */
  decideVariance: (body: TillDecideVarianceBody) => Promise<TillVarianceDecisionResult>;
  /** Notes 114 (273 OVERRIDE, never its cashier unless single-operator): a closed session's cash into the safe. */
  approveCash: (body: TillApproveCashBody) => Promise<TillCashApprovalResult>;
  /** Notes 117 (273 OVERRIDE + the FORCE_CLOSE rule): OPEN / SUSPENDED / COUNTING closed on the supervisor's count. */
  forceClose: (body: TillForceCloseBody) => Promise<TillForceCloseResult>;
  /** Notes 117 (273 OVERRIDE + the SESSION_REOPEN rule): a CLOSED session back to COUNTING, the Z kept. */
  reopen: (body: TillReopenBody) => Promise<TillSessionReopenResult>;
  /** Notes 117: a journalled X read of a live session — refused to its own cashier (blind close). */
  xReport: (key: TillSessionKey) => Promise<TillXReport>;
  slipCheckRows: (key: TillSessionKey, tenderId: string) => Promise<TillSlipCheckPayload>;
  slipCheckRecord: (body: TillSlipCheckBody) => Promise<TillSlipCheckResult>;
  createMovement: (body: TillMovementBody) => Promise<TillMovementDetail>;
  /** Notes 110: who may sign a pickup / top-up on the session — 273 OVERRIDE, active, never its cashier. */
  supervisors: (key: TillSessionKey) => Promise<TillSupervisor[]>;
  /** A supervisor's change between two live counters (273 OVERRIDE). */
  movementChange: (body: TillChangeBody) => Promise<TillChangeResult>;
  /** A supervisor's void of a hand-posted movement (273 OVERRIDE) or a remittance (287 OVERRIDE). */
  movementVoid: (body: TillVoidMovementBody) => Promise<TillMovementFull>;
  /** Notes 118 — the branch's safes and the CIT remittances in transit (287 / 273 VIEW). */
  safeBalance: (scope: { companyId: string; branchId: string; safeId?: string }) => Promise<TillSafeBalance>;
  safeCount: (body: TillSafeCountBody) => Promise<TillSafeCountResult>;
  safeDecideVariance: (body: TillSafeDecideBody) => Promise<TillSafeDecisionResult>;
  remit: (body: TillRemitBody) => Promise<TillRemitResult>;
  remitConfirm: (body: TillRemitConfirmBody) => Promise<TillRemitConfirmResult>;
  denominations: (companyId: string) => Promise<TillDenominationRow[]>;
  /** Notes 124 §5 — ask for an approval (decided here with the approver's PIN, or left PENDING). */
  approvalRequest: (body: TillApprovalRequestBody) => Promise<TillApprovalPayload>;
  /** The approvers' inbox at a branch (273 VIEW). */
  approvalPending: (scope: { companyId: string; branchId: string }) => Promise<TillApprovalInboxPayload>;
  /** `approvalPending` for a caption count: a query, so it is not announced as a data change. */
  approvalPendingQuiet: (scope: { companyId: string; branchId: string }) => Promise<TillApprovalInboxPayload>;
  approvalDecide: (body: TillApprovalDecideBody) => Promise<TillApprovalPayload>;
  approvalCancel: (body: TillApprovalCancelBody) => Promise<TillApprovalPayload>;
  /** Notes 134 — head office's review of a day or a session (289 CREATE). */
  reviewCreate: (body: TillReviewCreateBody) => Promise<TillReviewCreateResult>;
  /** A branch's reviews, newest first — every one, or one day's / one session's (289 VIEW). */
  reviewList: (scope: { companyId: string; branchId: string; dayId?: string; sessionId?: string }) => Promise<TillReviewListPayload>;
  /** Every row of a configured grid, every page of it. */
  gridRows: (grid: ConfiguredGridKey, params: Record<string, string>) => Promise<GridRow[]>;
};

export function createTillSessionClient(dispatch: AppDispatch): TillSessionClient {
  return {
    openCheck: ({ companyId, branchId, counterId }) =>
      read(dispatch, "/till/sessions/open-check", { companyId, branchId, ...(counterId ? { counterId } : {}) }),
    openCheckQuiet: ({ companyId, branchId, counterId }) =>
      quietRead(dispatch, "/till/sessions/open-check", { companyId, branchId, ...(counterId ? { counterId } : {}) }),
    open: (body) => write(dispatch, "/till/sessions/open", body),
    get: (key) => read(dispatch, "/till/sessions/get", keyParams(key)),
    getQuiet: (key) => quietRead(dispatch, "/till/sessions/get", keyParams(key)),
    expected: (key) => read(dispatch, "/till/sessions/expected", keyParams(key)),
    resume: (key) => write(dispatch, "/till/sessions/resume", { ...key }),
    suspend: (key) => write(dispatch, "/till/sessions/suspend", { ...key }),
    // This client keeps nothing offline yet (Qt sends the same 0).
    endBilling: (key) => write(dispatch, "/till/sessions/end-billing", { ...key, outboxCount: 0 }),
    count: (body) => write(dispatch, "/till/sessions/count", body),
    close: (body) => write(dispatch, "/till/sessions/close", body),
    decideVariance: (body) => write(dispatch, "/till/sessions/decide-variance", body),
    approveCash: (body) => write(dispatch, "/till/sessions/approve-cash", body),
    forceClose: (body) => write(dispatch, "/till/sessions/force-close", body),
    reopen: (body) => write(dispatch, "/till/sessions/reopen", body),
    xReport: (key) => write(dispatch, "/till/sessions/x-report", { ...key }),
    slipCheckRows: (key, tenderId) => read(dispatch, "/till/sessions/slip-check", { ...keyParams(key), tenderId }),
    slipCheckRecord: (body) => write(dispatch, "/till/sessions/slip-check", body),
    createMovement: (body) => write(dispatch, "/till/movements/create", body),
    supervisors: async (key) => {
      const data = await read<TillSupervisor[] | null>(dispatch, "/till/movements/supervisors", keyParams(key));
      return Array.isArray(data) ? data : [];
    },
    movementChange: (body) => write(dispatch, "/till/movements/change", body),
    movementVoid: (body) => write(dispatch, "/till/movements/void", body),
    safeBalance: ({ companyId, branchId, safeId }) =>
      read(dispatch, "/till/safes/balance", { companyId, branchId, ...(safeId ? { safeId } : {}) }),
    safeCount: (body) => write(dispatch, "/till/safes/count", body),
    safeDecideVariance: (body) => write(dispatch, "/till/safes/decide-variance", body),
    remit: (body) => write(dispatch, "/till/movements/remit", body),
    remitConfirm: (body) => write(dispatch, "/till/movements/remit-confirm", body),
    denominations: async (companyId) => {
      const data = await read<TillDenominationRow[] | { items?: TillDenominationRow[] }>(
        dispatch,
        "/till/denominations/list",
        { companyId },
      );
      if (Array.isArray(data)) return data;
      return Array.isArray(data?.items) ? data.items : [];
    },
    approvalRequest: (body) => write(dispatch, "/till/approvals/request", body),
    approvalPending: async ({ companyId, branchId }) =>
      inboxOf(await read<TillApprovalInboxPayload | null>(dispatch, "/till/approvals/pending", { companyId, branchId })),
    approvalPendingQuiet: async ({ companyId, branchId }) =>
      inboxOf(await quietRead<TillApprovalInboxPayload | null>(dispatch, "/till/approvals/pending", { companyId, branchId })),
    approvalDecide: (body) => write(dispatch, "/till/approvals/decide", body),
    approvalCancel: (body) => write(dispatch, "/till/approvals/cancel", body),
    reviewCreate: (body) => write(dispatch, "/till/reviews/create", body),
    reviewList: async ({ companyId, branchId, dayId, sessionId }) => {
      const data = await read<TillReviewListPayload | null>(dispatch, "/till/reviews/list", {
        companyId,
        branchId,
        ...(dayId ? { dayId } : {}),
        ...(sessionId ? { sessionId } : {}),
      });
      return { reviews: Array.isArray(data?.reviews) ? data.reviews : [] };
    },
    gridRows: async (grid, params) => {
      const rows: GridRow[] = [];
      for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
        const data = await read<{ items?: GridRow[]; meta?: { total?: number | string } }>(dispatch, GRID_RUN, {
          grid_id: getGridId(grid),
          page,
          limit: GRID_PAGE_LIMIT,
          grid_param: JSON.stringify(params),
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        rows.push(...items);
        const total = Number(data?.meta?.total ?? rows.length);
        if (items.length < GRID_PAGE_LIMIT || rows.length >= total) break;
      }
      return rows;
    },
  };
}

export function useTillSessionClient(): TillSessionClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createTillSessionClient(dispatch), [dispatch]);
}
