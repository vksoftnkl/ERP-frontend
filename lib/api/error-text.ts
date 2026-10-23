   /**
 * A server refusal in SHORT, simple words — the web side of Qt NexERP's
 * `ApiErrorText` (ec9d92d, 2026-10-15).
 *
 * Many counter users do not read formal English, and the server's sentences
 * are written for developers ("Session X is PENDING_APPROVAL: it takes no
 * money"). So a refusal with a known `code` gets a 2–4 word title, one line of
 * what happened and one "Do:" step.
 *
 * Notes 120: the server words its own errors now — a `user` block
 * `{ title, line, todo }` on each `errors[]` entry, read from
 * `fixed.error_message`, the same words for Qt, React and mobile. That block
 * wins. The table below is the fallback for a server that does not send one
 * yet (Qt's table, from till-error-wording.md REV 2 and
 * counter-error-wording.md REV 1); it goes once notes 120 is live everywhere.
 *
 * The server's own text is never dropped: `detail` carries status · code ·
 * field and the sentence, shown small and grey under the plain words, so a
 * user's screenshot still says exactly what happened.
 *
 * Framework-free: `@/lib/notify` raises the popup from it, and the till
 * dialogs render the same reading inline (`components/feedback/refusal-text`).
 */

export type PlainWords = {
  /** "Cannot take payment" */
  title: string;
  /** "Your till is waiting for supervisor OK." */
  line: string;
  /** "Call supervisor." */
  todo: string;
};

export type ApiRefusal = {
  /** HTTP status; null when the server never answered (or the thrown value was not a request's). */
  status: number | null;
  /** No answer at all: why. Null for an answered request and for a non-request throw. */
  network: "offline" | "timeout" | "parse" | null;
  /** The first `errors[].code` — `TILL_COUNTER_BUSY` … — or "". */
  code: string;
  field: string;
  /** The server's own sentence: the body's message, else the first error's, else the request's. */
  sentence: string;
  /** The plain words for this refusal, or null when its code has none yet. */
  plain: PlainWords | null;
  /** The grey head line: "409 · TILL_SESSION_NOT_OPEN · sbSessionId" (may be ""). */
  head: string;
  /**
   * The other `errors[]` sentences, one line each ("• field — message"), the
   * sentence itself and repeats left out: what Qt's `error.message` lists
   * under the headline. A body "Validation failed" says nothing without them.
   */
  reasons: string[];
  /** The grey block: the head line and, under it, the sentence once. */
  detail: string;
};

type Row = readonly [title: string, line: string, todo: string];
type JsonRecord = Record<string, unknown>;

// till-error-wording.md REV 2, in its order (TILL_SESSION_NOT_OPEN is by status, below).
const ROWS: Record<string, Row> = {
  // 1 · Billing counter
  TILL_SESSION_REQUIRED: ["Cannot take payment", "Till is not open.", "Open Till first."],
  TILL_SESSION_CLOSED: ["Cannot take payment", "Your till is closed.", "Open a new till."],
  TILL_SESSION_DAY_ENDED: ["Cannot take payment", "Your till is from yesterday.", "End Shift, then open a new till."],
  TILL_SESSION_WRONG_DEVICE: ["Cannot take payment", "Your till is open on another PC.", "Bill on that PC."],
  TILL_SESSION_NOT_YOURS: ["Cannot take payment", "This till is another cashier's.", "Log in as yourself."],
  TILL_SESSION_CLOSED_USE_RETURN: ["Cannot change bill", "This bill's till is closed.", "Make a Sale Return."],
  TILL_CASH_BLOCKED: ["Too much cash", "Drawer is over the cash limit.", "Drop cash in safe, or call supervisor."],
  TILL_HOLDS_OPEN: ["Cannot end shift", "You have held bills.", "Finish or cancel them first."],
  TILL_DEVICE_UNSYNCED: ["Cannot end shift", "Some bills are not sent yet.", "Check network, try again."],
  TILL_CASH_LEDGER_DIRECT: ["Cannot save", "Till cash goes only through the till.", "Use Cash Movement."],
  SALES_DAY_CLOSED: ["Day closed", "Today is closed for billing.", "Call manager."],
  // 2 · Opening the till
  TILL_OPERATOR_BUSY: ["Cannot open till", "Your old till is not finished.", "Finish it, or call supervisor."],
  TILL_COUNTER_BUSY: ["Cannot open till", "This counter is in use.", "Use another counter, or call supervisor."],
  TILL_COUNTER_NOT_YOURS: ["Cannot open till", "This counter is not for this PC.", "Pick another counter."],
  TILL_NO_FREE_COUNTER: ["Cannot open till", "No counter is free.", "Call manager."],
  TILL_COUNTER_INACTIVE: ["Cannot open till", "This counter is switched off.", "Call manager."],
  TILL_COUNTER_NOT_FOUND: ["Cannot open till", "Wrong counter for this branch.", "Pick another counter."],
  TILL_DEVICE_UNKNOWN: ["Cannot open till", "This PC is not set up as a till.", "Call manager."],
  TILL_DEVICE_BLOCKED: ["Cannot open till", "This PC is blocked.", "Call manager."],
  TILL_DEVICE_REQUIRED: ["Cannot open till", "This PC is not set up as a till.", "Call manager."],
  TILL_DAY_NOT_OPEN: ["Cannot open till", "Today is not opened yet.", "Call manager."],
  TILL_DAY_CLOSING: ["Cannot open till", "Today is being closed.", "Call manager."],
  TILL_FLOAT_INVALID: ["Wrong amount", "Opening cash amount is wrong.", "Check the amount."],
  // 3 · Counting / End Shift
  TILL_NOT_COUNTED: ["Count first", "Drawer is not counted.", "Count the drawer."],
  TILL_COUNT_INVALID: ["Wrong count", "Something in the count is wrong.", "Check the count."],
  TILL_RECOUNT_LIMIT: ["Cannot count again", "Too many counts.", "Call supervisor."],
  TILL_APPROVAL_REQUIRED: ["Cash short or extra", "Cash does not match.", "Call supervisor."],
  TILL_BLIND_CLOSE: ["Not allowed", "Cashier cannot see this before closing.", "Just count the cash."],
  // 4 · Cash movement
  TILL_MOVEMENT_INVALID: ["Cannot save", "Something in this entry is wrong.", "Check the entry."],
  TILL_MOVEMENT_AT_COUNTER: ["Not allowed here", "Do this at the cashier's counter.", "Go to the counter."],
  TILL_SUPERVISOR_SELF: ["Need another person", "Supervisor and cashier must be different.", "Pick another supervisor."],
  TILL_SUPERVISOR_RIGHT: ["Not allowed", "This supervisor has no right for this.", "Pick another supervisor."],
  TILL_SUPERVISOR_NO_PIN: ["No PIN", "This supervisor has no PIN.", "Pick another supervisor."],
  TILL_SUPERVISOR_PIN_REQUIRED: ["Enter PIN", "Supervisor PIN is empty.", "Supervisor types PIN."],
  TILL_SUPERVISOR_PIN: ["Wrong PIN", "Supervisor PIN is wrong.", "Type again."],
  TILL_WITNESS_PIN_REQUIRED: ["Enter PIN", "Witness PIN is empty.", "Witness types PIN."],
  TILL_WITNESS_PIN: ["Wrong PIN", "Witness PIN is wrong.", "Type again."],
  TILL_WITNESS_NO_PIN: ["No PIN", "This witness has no PIN.", "Pick another witness."],
  TILL_NO_DROP_SAFE: ["No safe here", "This counter has no drop safe.", "Give the cash to supervisor (Pickup)."],
  TILL_SAFE_MISSING: ["No safe", "This branch has no safe set up.", "Call manager."],
  TILL_MOVEMENT_NOT_FOUND: ["Not found", "This entry is not there now.", "Refresh and try again."],
  TILL_MOVEMENT_NOT_VOIDABLE: ["Cannot cancel", "This entry cannot be cancelled.", "Make a new entry to correct it."],
  TILL_MOVEMENT_SESSION_CLOSED: ["Cannot cancel", "That till is already counted.", "Make a new entry in today's till."],
  TILL_REASON_INVALID: ["Reason needed", "Reason is missing or not complete.", "Pick a reason and fill it."],
  // 5 · Supervisor screens
  TILL_APPROVER_SELF: ["Need another person", "You cannot OK your own till.", "Ask another supervisor."],
  TILL_APPROVER_NO_GRANT: ["Not allowed", "You have no right to OK this.", "Ask another supervisor."],
  TILL_APPROVER_LIMIT: ["Amount too big", "This is above your limit.", "Ask a senior."],
  TILL_APPROVER_PIN: ["Wrong PIN", "PIN is empty or wrong.", "Type again."],
  TILL_RECEIVER_SELF: ["Need another person", "You were this till's cashier.", "Ask another supervisor."],
  TILL_RECEIVER_NO_PIN: ["No PIN", "You have no PIN.", "Call manager."],
  TILL_RECEIVER_PIN_REQUIRED: ["Enter PIN", "Your PIN is empty.", "Type your PIN."],
  TILL_RECEIVER_PIN: ["Wrong PIN", "Your PIN is wrong.", "Type again."],
  TILL_RECEIPT_NOT_AWAITING: ["Already done", "Someone already did this.", "Refresh."],
  TILL_VARIANCE_NOT_PENDING: ["Already done", "Someone already did this.", "Refresh."],
  TILL_CASH_ALREADY_APPROVED: ["Already done", "Cash is already in the safe.", "Nothing to do."],
  TILL_SESSION_NOT_FOUND: ["Not found", "This till is not there.", "Refresh."],
  TILL_REOPEN_BLOCKED: ["Cannot reopen", "This till cannot be opened again.", "Correct it in today's till."],
  // 6 · Manager: business day
  TILL_DAY_CLOSE_BLOCKED: ["Cannot close day", "Some work is not finished.", "Finish the red items first."],
  TILL_FORCE_COUNT_REQUIRED: ["Count first", "A till is still open.", "Count that till's cash."],
  TILL_DAY_CLOSED: ["Day closed", "This day is already closed.", "Reopen the day first."],
  TILL_DAY_NOT_CLOSED: ["Not closed", "This day is still open.", "Refresh."],
  TILL_DAY_LATER_CLOSED: ["Cannot reopen", "A later day is closed.", "Call head office."],
  // 7 · Setup problems
  TILL_LEDGER_UNMAPPED: ["Setup missing", "An account is not set up.", "Call manager."],
  TILL_YEAR_NOT_SET_UP: ["Setup missing", "This year is not set up.", "Call manager."],
  TILL_MASTER_IN_USE: ["In use", "This is used by a till now.", "Close that till first."],
  TILL_EVENT_INVALID: ["Something went wrong", "This PC sent a wrong request.", "Send a photo of this to support."],
  // 8 · Safe and bank remittance (notes 118)
  TILL_SAFE_CHANGED: ["Count again", "Safe cash changed while you counted.", "Count the safe again."],
  TILL_REMIT_OVER_BALANCE: ["Amount too big", "Safe does not have this much cash.", "Send less, or count the safe first."],
  TILL_REMIT_NOT_IN_TRANSIT: ["Already done", "This cash is not on the way any more.", "Refresh."],
  TILL_APPROVER_SECOND: ["Need second person", "This needs two people's PIN.", "Another person types their PIN."],

  // counter-error-wording.md REV 1 (notes 119 codes).
  INTERNAL_ERROR: ["Server problem", "The server had a problem.", "Try again. If it repeats, send a photo to support."],
  // 1 · Held bills — every other HOLD_ code is the app's mistake (APP_ROW)
  HOLD_NOT_FOUND: ["Not found", "This held bill is not there now.", "Refresh the held bills list."],
  HOLD_LOCKED_ELSEWHERE: ["Open on another PC", "This held bill is open on another PC.", "Finish it there, or wait a few minutes."],
  HOLD_NOT_RESUMABLE: ["Cannot open", "This held bill is already billed or cancelled.", "Refresh the held bills list."],
  HOLD_CLOSED: ["Already done", "This held bill is already billed or cancelled.", "Refresh the held bills list."],
  HOLD_NOT_LEASED_HERE: ["Open on another PC", "This held bill is open on another PC.", "Finish it there."],
  HOLD_DUPLICATE: ["Try again", "Two counters saved at the same time.", "Save again."],
  HOLD_NO_DUPLICATE: ["Try again", "Two counters saved at the same time.", "Save again."],
  HOLD_SLNO_DUPLICATE: ["Try again", "Two counters saved at the same time.", "Save again."],
  HOLD_DEVICE_BLOCKED: ["Cannot hold", "This PC is blocked.", "Call manager."],
  HOLD_DEVICE_NOT_FOUND: ["Cannot hold", "This PC is not set up as a till.", "Call manager."],
  HOLD_DEVICE_REQUIRED: ["Cannot hold", "This PC is not set up as a till.", "Call manager."],
  HOLD_SESSION_NOT_FOUND: ["Cannot hold", "Your till is not open.", "Open Till first."],
  HOLD_AMOUNT_NEGATIVE: ["Wrong amount", "An amount is below zero.", "Check the amounts."],
  // 2 · Payment lines — every other TENDER_LINE_ code is the app's mistake
  TENDER_LINE_CHANGE_EXCEEDS_RECEIVED: ["Wrong change", "Change is more than the cash received.", "Check the cash received."],
  TENDER_LINE_TOTAL_MISMATCH: ["Amounts don't match", "Payments do not add up to the bill.", "Check the payment amounts."],
  TENDER_LINE_CARD_LAST4_INVALID: ["Card number", "Card last 4 digits are wrong.", "Type the last 4 digits again."],
  TENDER_LINE_INSTRUMENT_DATE_REQUIRED: ["Date needed", "Cheque or card date is missing.", "Fill in the date."],
  TENDER_LINE_REFERENCE_INVALID: ["Reference needed", "Payment reference is missing or wrong.", "Fill in the reference number."],
  TENDER_REF_REQUIRED: ["Reference needed", "Payment reference is missing or wrong.", "Fill in the reference number."],
  TENDER_REF_DUPLICATE: ["Already used", "This payment reference is already used.", "Check the reference number."],
  TENDER_LINE_TENDER_NOT_FOUND: ["Setup missing", "Something is not set up.", "Call manager."],
  TENDER_LINE_TENDER_TYPE_NOT_FOUND: ["Setup missing", "Something is not set up.", "Call manager."],
  TENDER_LINE_LEDGER_NOT_FOUND: ["Setup missing", "Something is not set up.", "Call manager."],
  // 3 · Form checks — every other VALIDATION_ code is the app's mistake
  VALIDATION_IS_NOT_EMPTY: ["Fill it in", "Something needed is empty.", "Fill in all the needed boxes."],
  VALIDATION_MIN: ["Wrong amount", "An amount is too small.", "Check the amounts."],
  VALIDATION_IS_POSITIVE: ["Wrong amount", "An amount is too small.", "Check the amounts."],
  VALIDATION_MAX: ["Too long", "A value is too big or too long.", "Make it shorter or smaller."],
  VALIDATION_MAX_LENGTH: ["Too long", "A value is too big or too long.", "Make it shorter or smaller."],
};

/**
 * counter-error-wording.md [APP]: a code that means the app sent a wrong
 * request, not that the user did — every HOLD_ / TENDER_ / VALIDATION_ code
 * without its own row above.
 */
const APP_ROW: Row = ["Something went wrong", "The app sent a wrong request.", "Send a photo of this to support."];
const APP_PREFIXES = ["HOLD_", "TENDER_LINE_", "TENDER_REF_", "VALIDATION_"];

/** TILL_SESSION_NOT_OPEN at the billing counter, by the session's status. */
const NOT_OPEN_BY_STATUS: Record<string, Row> = {
  PENDING_APPROVAL: ["Cannot take payment", "Your till is waiting for supervisor OK.", "Call supervisor."],
  COUNTING: ["Cannot take payment", "Your till is being counted.", "Finish End Shift, then open a new till."],
  SUSPENDED: ["Cannot take payment", "Your till is paused.", "Resume it in Open Till."],
  CLOSED: ["Cannot take payment", "Your till is closed.", "Open a new till."],
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function wordsOf(row: Row): PlainWords {
  return { title: row[0], line: row[1], todo: row[2] };
}

/**
 * The `{ message, errors }` body, wherever the filter put it: flat (the module
 * filters, TillExceptionFilter) or one level down (`AllExceptionsFilter`:
 * `{ statusCode, message: { message, errors } }`).
 */
function bodyOf(data: unknown): { message: string; errors: JsonRecord[] } {
  if (!isRecord(data)) return { message: text(data), errors: [] };
  const nested = isRecord(data.message) ? data.message : null;
  const holder = nested && Array.isArray(nested.errors) ? nested : data;
  const errors = Array.isArray(holder.errors) ? holder.errors.filter(isRecord) : [];
  // A raw class-validator 400 sends `message` as an array of sentences.
  const listed = Array.isArray(holder.message) ? holder.message.map(text).filter(Boolean).join(", ") : "";
  const message = text(holder.message) || listed || text(nested?.message) || text(data.error);
  return { message, errors };
}

/** The plain words for the first error, or null when its code has none. */
function plainOf(first: JsonRecord, sentence: string): PlainWords | null {
  // Notes 120: the server's own words win.
  const user = isRecord(first.user) ? first.user : null;
  if (user && text(user.line)) {
    return { title: text(user.title), line: text(user.line), todo: text(user.todo) };
  }
  const code = text(first.code);
  if (!code) return null;

  if (code === "TILL_SESSION_NOT_OPEN") {
    // On the Cockpit and the other supervisor screens the session is named by
    // tssId; anywhere else it is the cashier's own till.
    if (text(first.field) === "tssId") {
      return { title: "Not now", line: "This till is not in the right state.", todo: "Refresh." };
    }
    let status = text(first.status);
    // Older answers carry the status only in the sentence.
    if (!status) status = Object.keys(NOT_OPEN_BY_STATUS).find((key) => sentence.includes(key)) ?? "";
    const row = NOT_OPEN_BY_STATUS[status];
    return row ? wordsOf(row) : { title: "Cannot take payment", line: "Your till is not open.", todo: "Call supervisor." };
  }

  const row = ROWS[code];
  if (row) return wordsOf(row);
  if (APP_PREFIXES.some((prefix) => code.startsWith(prefix))) return wordsOf(APP_ROW);
  // A code with no wording yet (most SALES_ / voucher refusals today): no plain
  // words. The caller shows the server's own sentence under a plain title —
  // "Something went wrong" would hide a real reason ("already posted", "no
  // right to post") the user can act on.
  return null;
}

function networkOf(message: string): ApiRefusal["network"] {
  if (/timeout|timed out|aborterror/i.test(message)) return "timeout";
  if (/syntaxerror|json|pars/i.test(message)) return "parse";
  return "offline";
}

/**
 * Read a refusal out of whatever a request threw: the RTK error this app's
 * base query returns (`{ status, data, message }`), a raw `fetchBaseQuery`
 * error (`{ status: "FETCH_ERROR", error }`), an `Error`, or a string.
 */
export function apiRefusalOf(error: unknown, fallback = "Something went wrong."): ApiRefusal {
  if (!isRecord(error)) {
    const sentence = (error instanceof Error ? error.message.trim() : text(error)) || fallback;
    return { status: null, network: null, code: "", field: "", sentence, plain: null, head: "", detail: sentence, reasons: [] };
  }
  const status = typeof error.status === "number" ? error.status : null;
  const { message: bodyMessage, errors } = bodyOf(error.data);
  const first = errors[0] ?? {};
  const requestMessage = text(error.message) || text(error.error);
  const sentence = bodyMessage || text(first.message) || requestMessage || fallback;
  // A request that never got an answer: the base query leaves `status`
  // undefined (`FETCH_ERROR`, `TIMEOUT_ERROR`, `PARSING_ERROR`); a raw RTK
  // error names it in `status`.
  const asked = "status" in error || "data" in error || typeof error.error === "string";
  const network: ApiRefusal["network"] =
    status !== null || !asked
      ? null
      : error.status === "TIMEOUT_ERROR"
        ? "timeout"
        : error.status === "PARSING_ERROR"
          ? "parse"
          : networkOf(requestMessage);
  const code = text(first.code);
  const field = text(first.field);
  const head = [status !== null ? String(status) : "", code, field].filter(Boolean).join(" · ");
  const detail = !head ? sentence : sentence ? `${head}\n${sentence}` : head;
  // Qt handleReply: "Validation failed" stays the headline, every error's own
  // sentence is listed under it; the till's refusals repeat the headline as
  // their one error, which is said once.
  const said = new Set([sentence]);
  const reasons: string[] = [];
  for (const entry of errors) {
    const message = text(entry.message);
    if (!message || said.has(message)) continue;
    said.add(message);
    const at = text(entry.field);
    reasons.push(at ? `• ${at} — ${message}` : message);
  }
  return { status, network, code, field, sentence, plain: plainOf(first, sentence), head, detail, reasons };
}

/** What a message popup shows for a refusal (Qt `ApiClient::handleError`). */
export type RefusalMessage = {
  kind: "warn" | "error";
  title: string;
  /** Line breaks separate the plain line, "Do: …" and the kept line. */
  body: string;
  /** Small and grey under the body, for support (may be ""). */
  detail: string;
};

/**
 * The popup for a refusal. `kept` is the screen's "Bill not lost." line: a
 * refusal saved nothing, the work is still on the screen (Qt's `nexKeptLine`).
 * `refusedTitle` titles an unworded 400/409/422 when the call was not a save —
 * "Cannot delete" from a list's delete (Qt `handleError`'s third argument,
 * 4ae6575); default "Cannot save".
 */
export function refusalMessage(
  refusal: ApiRefusal,
  kept?: string | null,
  refusedTitle?: string | null,
): RefusalMessage {
  const keptLine = kept?.trim() ?? "";
  const join = (...lines: string[]) => lines.filter(Boolean).join("\n");

  // A refusal with wording: short plain words, the server's text grey under them.
  if (refusal.plain) {
    const { title, line, todo } = refusal.plain;
    return {
      kind: "warn",
      title: title || "Cannot continue",
      body: join(line, todo ? `Do: ${todo}` : "", keptLine),
      detail: refusal.detail,
    };
  }

  // No answer from the server: plain words, the technical reason in grey.
  if (refusal.network) {
    const [title, line, todo] =
      refusal.network === "timeout"
        ? ["No answer", "Server did not answer.", "Try again."]
        : refusal.network === "parse"
          ? ["Server problem", "Wrong answer from server.", "Send a photo of this to support."]
          : ["No connection", "Cannot reach the server.", "Check network, try again."];
    return { kind: "warn", title, body: join(line, `Do: ${todo}`), detail: refusal.sentence };
  }

  // No wording yet: the server's text stays the message, but the title is
  // never "409" or "Bad Request"; the status moves to the grey line.
  const status = refusal.status;
  const title =
    status === 403
      ? "Not allowed"
      : status === 404
        ? "Not found"
        : status === 400 || status === 409 || status === 422
          ? refusedTitle?.trim() || "Cannot save"
          : status !== null && status >= 500
            ? "Server problem"
            : "Cannot continue";
  const refused = status !== null && status >= 400 && status < 500;
  return {
    kind: status !== null && status >= 500 ? "error" : "warn",
    title,
    body: join(refusal.sentence || "Something went wrong.", ...refusal.reasons, refused ? keptLine : ""),
    // The sentence is already the message: the grey line is status · code · field.
    detail: refusal.head,
  };
}
