/**
 * The till approval gate (server notes 124 §5) without the widgets — Qt
 * `TillApprovalRequestDialog`, `TillApprovalInboxDialog` and
 * `TillApprovalDecideDialog` (425fa80).
 *
 * A company on `till.approval_gate` REFUSE answers a gated action — an
 * expense posted from the drawer (EXPENSE), a cash payment (CASH_PAYMENT), an
 * open whose count differs from the float (FLOAT_MISMATCH) — with 428
 * TILL_APPROVAL_REQUIRED, naming the event, the amount, the level and the
 * document. The screen asks `/till/approvals/request` for it:
 *
 *   approver here    their name + till PIN, decided in that one call;
 *                    APPROVED → the screen retries at once with `approvalId`
 *   send to inbox    PENDING for an approver's own login (Till Sessions →
 *                    Waiting for approval); asking again for the same
 *                    document returns the same request, and once it is
 *                    APPROVED the dialog closes with its id.
 *
 * The inbox (`/till/approvals/pending`) lists every kind the server waits on —
 * a REQUEST (approve / reject here), a session's or a received bag's cash gap
 * (the Session Cockpit's Approve), a safe count's gap (the Cash Office).
 */
import type { DropdownSelection } from "@/components/design-system/dropdown";
import { dateTime12Of, dayMonthTime12Of, clock12Of } from "@/lib/time-format";
import { APPROVER_LEVELS, describeEvent } from "../approval-setup/domain/approval-setup";
import type {
  TillApprovalCancelBody,
  TillApprovalDecideBody,
  TillApprovalRequestBody,
} from "./api/till-session-api";
import type { TillError } from "./errors";
import { formatFigure } from "./money";
import type { TillApprovalInboxItem, TillApprovalInboxPayload, TillApprovalPayload } from "./wire/types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// ─── The 428 ─────────────────────────────────────────────────────────────────

export const APPROVAL_REQUIRED_CODE = "TILL_APPROVAL_REQUIRED";

/** What a 428 TILL_APPROVAL_REQUIRED names (`errors[]` entry of that code). */
export type ApprovalNeed = {
  event: string;
  /** Null when the server left it out: the screen supplies its own figure. */
  amount: number | null;
  requiredRole: string;
  channel: string;
  twoPerson: boolean;
  srcDocType: string;
  srcDocId: string;
};

/** Every `errors[]` entry, wherever the module's filter put the body (flat, or nested under `message`). */
function errorEntries(data: unknown): JsonRecord[] {
  if (!isRecord(data)) return [];
  const nested = isRecord(data.message) ? data.message : null;
  const holder = nested && Array.isArray(nested.errors) ? nested : data;
  return Array.isArray(holder.errors) ? holder.errors.filter(isRecord) : [];
}

/**
 * The 428's TILL_APPROVAL_REQUIRED entry, or null — Qt
 * `TillApprovalRequestDialog::approvalNeeded`. Reads the RTK error (`{ status,
 * data }`) of any module: the till, expense and payment filters all pass the
 * house body through.
 */
export function approvalNeededOf(error: unknown): ApprovalNeed | null {
  if (!isRecord(error)) return null;
  const entry = errorEntries(error.data).find((candidate) => text(candidate.code) === APPROVAL_REQUIRED_CODE);
  if (!entry) return null;
  return {
    event: text(entry.event),
    amount: numberOrNull(entry.amount),
    requiredRole: text(entry.requiredRole),
    channel: text(entry.channel),
    twoPerson: entry.twoPerson === true,
    srcDocType: text(entry.srcDocType),
    srcDocId: text(entry.srcDocId),
  };
}

// ─── Asking (the "Needs approval" dialog) ────────────────────────────────────

/** What the screen asks for: the request body without the dialog's own fields. */
export type ApprovalAsk = Omit<
  TillApprovalRequestBody,
  "note" | "approverId" | "approverPin" | "secondId" | "secondPin" | "reasonId"
>;

/** What the dialog is opened with: the ask, and the 428's level for the caption. */
export type ApprovalRequestState = { ask: ApprovalAsk; requiredRole: string };

/**
 * The ask a screen builds from a 428: the 428's event and amount win, the
 * screen's own figures fill what it left out (Qt does the same per screen).
 */
export function approvalAskOf(
  need: ApprovalNeed,
  fallback: ApprovalAsk,
): ApprovalRequestState {
  return {
    ask: {
      ...fallback,
      event: need.event || fallback.event,
      amount: need.amount ?? fallback.amount,
    },
    requiredRole: need.requiredRole,
  };
}

/** The event in words, or the code itself when it has none ("" → ""). */
export function eventWords(event: string): string {
  if (!event) return "";
  const described = describeEvent(event);
  return described.startsWith("reserved for the void module") ? event : described;
}

function capitalised(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** The dialog's caption: "An expense paid from the drawer (ExpV) of 1,200.00 needs a SUPERVISOR or above …". */
export function approvalNeedsLine(state: ApprovalRequestState): string {
  const what = capitalised(eventWords(state.ask.event)) || "This";
  const role = state.requiredRole || "supervisor";
  return `${what} of ${formatFigure(state.ask.amount)} needs a ${role} or above to approve it. Nothing is lost: the document waits.`;
}

export const SEND_TO_INBOX_TIP =
  "For an approver to decide from their own login (Till Sessions → Waiting for approval). Press again later: once approved, this closes and the document goes on.";

export type ApprovalRequestForm = {
  note: string;
  approver: DropdownSelection | null;
  pin: string;
};

export const EMPTY_APPROVAL_REQUEST: ApprovalRequestForm = { note: "", approver: null, pin: "" };

/** Why "Approve now" cannot go yet, or "" (Qt greys it with this tooltip). */
export function approveHereProblem(form: ApprovalRequestForm): string {
  return form.approver?.id && form.pin ? "" : "Pick the approver standing here and let them type their PIN.";
}

export function approvalRequestBody(
  state: ApprovalRequestState,
  form: ApprovalRequestForm,
  approverHere: boolean,
): TillApprovalRequestBody {
  const note = form.note.trim();
  return {
    ...state.ask,
    ...(note ? { note } : {}),
    ...(approverHere && form.approver?.id ? { approverId: form.approver.id, approverPin: form.pin } : {}),
  };
}

/** What `/approvals/request` answered, for the dialog. */
export type ApprovalAnswer =
  | { kind: "approved"; tapId: string }
  | { kind: "rejected"; text: string }
  | { kind: "pending"; text: string };

export const INBOX_SENT_TEXT =
  "Sent to the approvers' inbox (Till Sessions → Waiting for approval). Close this; when it is approved, do the same again and it goes through.";

export function approvalAnswerOf(payload: TillApprovalPayload | null | undefined): ApprovalAnswer {
  const status = text(payload?.status);
  if (status === "APPROVED" && text(payload?.tapId)) return { kind: "approved", tapId: text(payload?.tapId) };
  if (status === "REJECTED") {
    return {
      kind: "rejected",
      text: `Rejected by ${text(payload?.decidedByName) || "the approver"}: ${text(payload?.decisionNote) || "no note"}`,
    };
  }
  return { kind: "pending", text: INBOX_SENT_TEXT };
}

/** A refusal naming the approver's PIN clears that box and takes the focus. */
export function requestRefusalHitsPin(error: TillError): boolean {
  return error.field === "approverPin";
}

// ─── The inbox ("Waiting for approval") ──────────────────────────────────────

export const INBOX_HINT =
  "Enter opens the row: a request is approved or rejected here; a cash gap opens its Session Cockpit; a safe gap is decided in Cash Office.";

export const INBOX_BUTTON_TIP = "Requests and cash gaps waiting for an approver at this branch";

/** "Waiting for approval (3)" — the Till Sessions toolbar button. */
export function inboxButtonText(count: number): string {
  return count > 0 ? `Waiting for approval (${count})` : "Waiting for approval";
}

export function inboxKindText(item: Pick<TillApprovalInboxItem, "kind" | "afterClose">): string {
  switch (item.kind) {
    case "REQUEST":
      return "Request";
    case "SESSION_VARIANCE":
      return item.afterClose ? "Cash gap (closed till)" : "Cash gap at close";
    case "RECEIVE_VARIANCE":
      return "Cash gap on receipt";
    case "SAFE_VARIANCE":
      return "Safe count gap";
    default:
      return String(item.kind);
  }
}

/** Why the caller cannot decide it, in the words of the till catalogue. */
export function inboxWhyNot(code: string | null | undefined): string {
  switch (code) {
    case "TILL_APPROVER_SELF":
      return "Not you: your own till or request";
    case "TILL_APPROVER_NO_GRANT":
      return "Not you: no approval right for this";
    case "TILL_APPROVER_LIMIT":
      return "Not you: above your limit";
    case "TILL_RIGHT_OVERRIDE":
      return "Not you: needs Till Sessions override";
    case "TILL_APPROVER_REMOTE":
      return "Not you: must be at the counter";
    default:
      return code ? `Not you (${code})` : "Not you";
  }
}

/** The muted line over the list. */
export function inboxHeadText(payload: TillApprovalInboxPayload): string {
  if (payload.items.length === 0) {
    return payload.expired > 0
      ? `Nothing is waiting at this branch · ${payload.expired} expired just now (asked too long ago)`
      : "Nothing is waiting at this branch.";
  }
  const mine = payload.items.filter((item) => item.canDecide).length;
  let head = `${payload.items.length} waiting at this branch · ${mine} you can decide`;
  if (payload.expired > 0) head += ` · ${payload.expired} expired just now (asked too long ago)`;
  return head;
}

/** A row's identity across a refresh (the selection is kept by it). */
export function inboxRowKey(item: TillApprovalInboxItem): string {
  return `${item.kind}|${item.tssId ?? ""}|${item.tapId ?? ""}|${item.tvrId ?? ""}|${item.tcmId ?? ""}`;
}

export type InboxRowText = {
  what: string;
  till: string;
  document: string;
  amount: string;
  /** The amount is hidden: a blind count's gap without 273 OVERRIDE. */
  amountHidden: boolean;
  askedBy: string;
  when: string;
  needs: string;
  you: string;
  canDecide: boolean;
};

export const HIDDEN_AMOUNT_TIP = "A cash gap's amount needs the Till Sessions (273) override right: the count is blind.";

export function inboxRowText(item: TillApprovalInboxItem): InboxRowText {
  const what = eventWords(item.event);
  let till = text(item.sessionNo) || text(item.safeName);
  if (text(item.counterName)) till += `${till ? " · " : ""}${text(item.counterName)}`;
  let needs = text(item.requiredRole);
  if (item.twoPerson) needs += " · two people";
  if (item.expiresOn) needs += ` · until ${clock12Of(item.expiresOn)}`;
  const amountHidden = item.amount === null || item.amount === undefined;
  return {
    what: what ? `${inboxKindText(item)} — ${what}` : inboxKindText(item),
    till,
    document: text(item.srcRefno),
    amount: amountHidden ? "hidden" : formatFigure(item.amount),
    amountHidden,
    askedBy: text(item.requestedByName),
    when: item.requestedOn ? dayMonthTime12Of(item.requestedOn) : "",
    needs,
    you: item.canDecide ? "You can decide" : inboxWhyNot(item.cannotBecause),
    canDecide: item.canDecide,
  };
}

/** Whether "Cancel my request" shows: a REQUEST the caller asked. */
export function canCancelOwnRequest(item: TillApprovalInboxItem | null, userId: string): boolean {
  return Boolean(item && item.kind === "REQUEST" && userId && item.requestedBy === userId);
}

export function approvalCancelBody(
  item: TillApprovalInboxItem,
  scope: { companyId: string; branchId: string },
  note: string,
): TillApprovalCancelBody {
  const trimmed = note.trim();
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: item.accYear,
    tapId: item.tapId ?? "",
    ...(trimmed ? { note: trimmed } : {}),
  };
}

export function safeGapInfo(item: TillApprovalInboxItem): string {
  return `A safe's count gap is decided in Cash Office (287): open it, pick ${text(item.safeName) || "the safe"} and use Decide.`;
}

// ─── Deciding a REQUEST ──────────────────────────────────────────────────────

export type ApprovalDecideForm = {
  decision: "APPROVE" | "REJECT";
  note: string;
  pin: string;
  second: DropdownSelection | null;
  secondPin: string;
};

export const EMPTY_APPROVAL_DECIDE: ApprovalDecideForm = {
  decision: "APPROVE",
  note: "",
  pin: "",
  second: null,
  secondPin: "",
};

/** The decide dialog's facts, as Qt lays them out. */
export function decideFacts(item: TillApprovalInboxItem): { caption: string; value: string; tone?: "amber" }[] {
  let where = text(item.sessionNo);
  if (text(item.counterName)) where += `${where ? " · " : ""}${text(item.counterName)}`;
  let needs = `${text(item.requiredRole)} or above`;
  if (item.twoPerson) needs += " · two people";
  const asked = [text(item.requestedByName), item.requestedOn ? dateTime12Of(item.requestedOn) : ""]
    .filter(Boolean)
    .join(", ");
  return [
    {
      caption: "Amount",
      value: item.amount === null || item.amount === undefined ? "hidden" : formatFigure(item.amount),
      tone: "amber",
    },
    { caption: "Till", value: where || "—" },
    { caption: "Document", value: text(item.srcRefno) || "—" },
    { caption: "Asked by", value: asked || "—" },
    { caption: "Their reason", value: text(item.note) || "—" },
    { caption: "Needs", value: needs },
  ];
}

export function decideTitle(item: TillApprovalInboxItem): string {
  return capitalised(eventWords(item.event)) || "Approve or reject";
}

/** Why Decide cannot go yet, or "" (Qt `problem`). */
export function approvalDecideProblem(item: TillApprovalInboxItem, form: ApprovalDecideForm): string {
  if (!form.note.trim()) return "Type a note: why you approve or reject it.";
  if (form.decision === "APPROVE" && item.twoPerson) {
    if (!form.second?.id) return "This rule needs two people: pick who signs with you.";
    if (!form.secondPin) return "The second person types their till PIN.";
  }
  return "";
}

export function approvalDecideBody(
  item: TillApprovalInboxItem,
  scope: { companyId: string; branchId: string },
  form: ApprovalDecideForm,
): TillApprovalDecideBody {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: item.accYear,
    tapId: item.tapId ?? "",
    decision: form.decision,
    note: form.note.trim(),
    ...(form.pin ? { approverPin: form.pin } : {}),
    ...(form.decision === "APPROVE" && form.second?.id ? { secondId: form.second.id, secondPin: form.secondPin } : {}),
  };
}

/** Which PIN a decide refusal names: it is cleared and takes the focus. */
export function decideRefusalTarget(error: TillError): "second" | "pin" | null {
  if (error.field === "secondPin" || error.field === "secondId") return "second";
  if (error.code.includes("PIN") || error.field === "approverPin") return "pin";
  return null;
}

export function decidedText(decision: "APPROVE" | "REJECT"): string {
  return decision === "APPROVE" ? "Approved. Whoever asked can now finish what they were doing." : "Rejected.";
}

// ─── User Role → approval level (Qt TillApproval::levelForUserRole) ──────────

/**
 * The level a new grant starts at for a user's User Role (`usr_type`, User
 * Admin): the two lists share names (notes 125). "" = no matching level
 * (CASHIER, USER, ADMIN): the popup keeps its own default. MANAGER is the
 * old name of STORE MANAGER.
 */
export function levelForUserRole(usrType: string | null | undefined): string {
  const level = String(usrType ?? "").trim().toUpperCase().replace(/ /g, "_");
  if (level === "MANAGER") return "STORE_MANAGER";
  return (APPROVER_LEVELS as readonly string[]).includes(level) ? level : "";
}
