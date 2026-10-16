/**
 * Close day, Close with exception, Reopen day and the day X / store Z print —
 * the Qt c77f3f1 `TillBusinessDayEntry::refreshButtons / closeDay /
 * closeWithException / reopenDay / printDay` and the `problem()` / `body()` of
 * its two dialogs (`TillDayExceptionDialog`, `TillDayReopenDialog`), as plain
 * functions (notes 117).
 *
 * The close-check decides the close: Close day while nothing is RED
 * (`canClose`), Close with exception while every RED is one an exception may
 * cover (`canCloseWithException`): live sessions — counted in the dialog and
 * force-closed in the same call — and, since Qt bec3f98 (notes 118), the safe
 * not counted, which may be the only one: the dialog then counts nothing. All
 * three verbs are Business Day (274) EDIT.
 */
import type { DocumentPrintTarget } from "@/features/printing/domain/documentPrint";
import { toReasons } from "../../shared/reasons";
import type { TillCountLine } from "../../shared/wire/types";
import { formatMoney } from "./decimal";
import { isRedOnCheck, plural } from "./day-reading";
import {
  checkOfDay,
  compactDate,
  dayKeyOf,
  displayDate,
  text,
  type DayKey,
  type FirstError,
  type GridRow,
  type Scope,
  type Supervisor,
  type TillCloseCheck,
  type TillDay,
} from "./wire";

// ── The buttons ───────────────────────────────────────────────────────────

export type ButtonState = { enabled: boolean; title: string };

export type DayButtons = {
  closeDay: ButtonState;
  closeException: ButtonState;
  reopen: ButtonState;
  print: ButtonState & { label: string };
};

export const NO_EDIT = "Business Day (274) Edit is not granted";

/**
 * Qt `refreshButtons`: Close day / with exception follow the server's
 * close-check of the shown day, Reopen a CLOSED one; Print is the day X while
 * open and the store Z once closed, whenever a day is shown.
 */
export function dayButtons(day: TillDay | null, check: TillCloseCheck | null, canEdit: boolean): DayButtons {
  const status = day?.tbdStatus ?? "";
  const mine = checkOfDay(check, day);
  const canClose = mine?.canClose === true;
  const canException = !canClose && mine?.canCloseWithException === true;
  const open = status === "OPEN";
  const closed = status === "CLOSED";

  let closeTitle: string;
  if (!canEdit) closeTitle = NO_EDIT;
  else if (!open) closeTitle = "Only an open day is closed";
  else if (!mine) closeTitle = "Waiting for the server's close-check";
  else if (canClose) closeTitle = "Close the business day — F10";
  else closeTitle = "Red items block the close: clear them first";

  // Qt's words assume live sessions; with only the safe red they would name
  // drawers that are not there.
  let exceptionTitle: string;
  if (!canEdit) exceptionTitle = NO_EDIT;
  else if (canException && !isRedOnCheck(mine, "SESSIONS_LIVE")) {
    exceptionTitle = "Only the safe count blocks: close over it, a store manager approves";
  } else if (canException) exceptionTitle = "Only live sessions block: count their drawers here and close";
  else exceptionTitle = "Only when every red item is a session still open or the safe not counted";

  let reopenTitle: string;
  if (!canEdit) reopenTitle = NO_EDIT;
  else if (closed) reopenTitle = "Open the closed day again (an area manager's PIN)";
  else reopenTitle = "Only a closed day is reopened";

  return {
    closeDay: { enabled: canEdit && open && canClose, title: closeTitle },
    closeException: { enabled: canEdit && open && canException, title: exceptionTitle },
    reopen: { enabled: canEdit && closed, title: reopenTitle },
    print: {
      enabled: Boolean(day?.tbdId),
      label: closed ? "Print store Z" : "Print day X",
      title: closed ? "The store Z of the closed day" : "A reading of the day so far: not a closing report",
    },
  };
}

// ── The print ─────────────────────────────────────────────────────────────

export type DayPrint = { target: DocumentPrintTarget; label: string };

/**
 * Qt `printDay`: one purpose, TILL_DAY_Z (80 mm), docId = the day — the day X
 * while it is open, the store Z once closed. The day's own company, year and
 * BRANCH travel with it: a day is printed from the office, not the counter.
 */
export function dayPrintOf(day: TillDay, scope: Scope): DayPrint {
  const closed = day.tbdStatus === "CLOSED";
  const key = dayKeyOf(day, scope);
  return {
    target: {
      docId: day.tbdId,
      companyId: key.companyId,
      accYear: key.accYear,
      branchId: key.branchId,
      filename: `${closed ? "store-z" : "day-x"}-${compactDate(day.tbdBusinessDate)}`,
    },
    label: `${closed ? "Store Z" : "Day X"} ${displayDate(day.tbdBusinessDate)}`,
  };
}

// ── Close day ─────────────────────────────────────────────────────────────

/** `CloseTillDayDto`. */
export type CloseDayBody = DayKey & {
  notes?: string;
  exception?: {
    reasonId: string;
    approverId: string;
    approverPin: string;
    counts: { tssId: string; lines: TillCountLine[] }[];
  };
};

/** `ReopenTillDayDto`. */
export type ReopenDayBody = DayKey & { reasonId: string; approverPin: string; notes?: string };

export const CLOSE_CONFIRM_NOTE =
  "No session can open on it afterwards, and bills, re-tenders and money documents dated it are refused. " +
  "The store Z is issued.";

export function closeQuestion(day: TillDay): string {
  return `Close business day ${displayDate(day.tbdBusinessDate)}?`;
}

export function closedText(day: TillDay, zNo: string): string {
  const date = displayDate(day.tbdBusinessDate);
  return zNo ? `Business day ${date} is closed — store Z ${zNo}.` : `Business day ${date} is closed.`;
}

/**
 * Something changed since the check (`TILL_DAY_CLOSE_BLOCKED`, or any 409):
 * after the refusal's popup (plain words, as every refusal — Qt bec3f98), the
 * check is read again.
 */
export function isCloseBlocked(error: FirstError): boolean {
  return error.code === "TILL_DAY_CLOSE_BLOCKED" || error.status === 409;
}

/** A refusal about the approver's PIN: the box is cleared and takes the focus. */
export function isPinRefusal(error: FirstError): boolean {
  return error.code.includes("PIN") || error.field === "approverPin";
}

// ── Reasons and approvers ─────────────────────────────────────────────────

export type DayReasonCategory = "DAY_CLOSE" | "DAY_REOPEN";

/** Grid 134 for one category, active only (`iinactive` blank, as Qt sends it). */
export function dayReasonParams(companyId: string, category: DayReasonCategory): Record<string, string> {
  return { icompany_id: companyId, icategory: category, iinactive: "" };
}

export type ReasonChoice = { id: string; name: string; needsNote: boolean };

export function reasonChoices(rows: readonly GridRow[]): ReasonChoice[] {
  return toReasons(rows).map((reason) => ({
    id: reason.id,
    name: reason.name || reason.code,
    needsNote: reason.needsNote,
  }));
}

export type ApproverChoice = { id: string; label: string };

/**
 * The branch's Till Sessions (273) OVERRIDE holders who may sign for the first
 * live session — the caller left out: the rule wants someone else. Whether
 * they hold a DAY_CLOSE_EXCEPTION grant is the server's call.
 */
export function approverChoices(supervisors: readonly Supervisor[], me: string): ApproverChoice[] {
  const self = me.trim().toLowerCase();
  return supervisors
    .filter((supervisor) => supervisor.userId.toLowerCase() !== self)
    .map((supervisor) => ({
      id: supervisor.userId,
      label: `${supervisor.fullName || supervisor.loginName}${supervisor.hasPin === false ? "  (no till PIN set)" : ""}`,
    }));
}

/** Dropdown 68 TILL APPROVER USERS binds a QUOTED `'icompany_id'`: always sent. */
export function approverDropdownParams(companyId: string): Record<string, string> {
  return { icompany_id: companyId };
}

/**
 * With no live session there is no session to ask the supervisor list for:
 * the company's active users (dropdown 68), the caller left out; whether they
 * hold a DAY_CLOSE_EXCEPTION grant is the server's call. A blank name ('' is
 * not NULL to the dropdown's COALESCE) shows the login.
 */
export function approverUsersOf(rows: readonly GridRow[], me: string): ApproverChoice[] {
  const self = me.trim().toLowerCase();
  const choices: ApproverChoice[] = [];
  for (const row of rows) {
    const id = text(row.usr_id).trim();
    if (!id || id.toLowerCase() === self) continue;
    choices.push({ id, label: text(row.usr_name).trim() || text(row.usr_login_name).trim() });
  }
  return choices;
}

function needsNote(reasons: readonly ReasonChoice[], reasonId: string): boolean {
  return reasons.find((reason) => reason.id === reasonId)?.needsNote === true;
}

// ── Close with exception ──────────────────────────────────────────────────

/** One live session the exception counts and force-closes. */
export type ExceptionPage = { tssId: string; label: string };

/**
 * What the exception dialog is for: `sessions` counts each live drawer and
 * asks the first session's supervisors; `safe` (no live session, notes 118 —
 * the exception covers only SAFE_NOT_COUNTED) shows no count and asks
 * dropdown 68 for the approvers.
 */
export type ExceptionMode = "sessions" | "safe";

export function exceptionModeOf(pages: readonly ExceptionPage[]): ExceptionMode {
  return pages.length > 0 ? "sessions" : "safe";
}

/**
 * The SESSIONS_LIVE item's sessions, named "C01-261014-12 · VKPOS" from the
 * day's list (the id's head when the list does not have it). Empty = nothing
 * an exception could cover.
 */
export function exceptionPages(check: TillCloseCheck | null, rows: readonly GridRow[]): ExceptionPage[] {
  const pages: ExceptionPage[] = [];
  const seen = new Set<string>();
  for (const item of check?.items ?? []) {
    if (item.code !== "SESSIONS_LIVE") continue;
    for (const tssId of item.sessionIds) {
      if (seen.has(tssId)) continue;
      seen.add(tssId);
      const row = rows.find((candidate) => text(candidate.tss_id).trim() === tssId);
      const no = row ? text(row.tss_session_no).trim() : "";
      pages.push({ tssId, label: no ? `${no} · ${text(row?.cashier)}` : tssId.slice(0, 8) });
    }
  }
  return pages;
}

/** Nothing live (notes 118): the exception covers only the safe not counted. */
export const SAFE_ONLY_INTRO =
  "No till is open on this day. The exception closes the day although its safe was not counted. A store " +
  "manager other than you approves it with their till PIN.";

export function exceptionIntro(count: number): string {
  if (count === 0) return SAFE_ONLY_INTRO;
  return (
    `${count === 1 ? "1 session is" : `${count} sessions are`} still open. Count each drawer here: the session is ` +
    'force-closed on your count (reason "Day close") and its cash goes into the safe on it. A count out of ' +
    "tolerance stops the whole close — settle that session from its cockpit instead."
  );
}

export const EXCEPTION_HINT = "The approver is a store manager other than you, typing their own till PIN here.";

export type ExceptionDraft = { reasonId: string; note: string; approverId: string; pin: string };

/** A page with its count, as the dialog posts it. */
export type CountedPage = ExceptionPage & { lines: readonly TillCountLine[] };

/** What stops the post, in Qt's order; "" when nothing does. */
export function exceptionProblem(
  draft: ExceptionDraft,
  reasons: readonly ReasonChoice[],
  pages: readonly CountedPage[],
): string {
  if (!draft.reasonId) return "Pick the reason.";
  if (needsNote(reasons, draft.reasonId) && !draft.note.trim()) return "The reason asks for a note.";
  for (const page of pages) {
    if (page.lines.length === 0) return `Count the drawer of ${page.label}.`;
  }
  if (!draft.approverId) return "Pick the approver.";
  if (!draft.pin) return "The approver types their till PIN.";
  return "";
}

export function exceptionBody(key: DayKey, draft: ExceptionDraft, pages: readonly CountedPage[]): CloseDayBody {
  const note = draft.note.trim();
  return {
    ...key,
    exception: {
      reasonId: draft.reasonId,
      approverId: draft.approverId,
      approverPin: draft.pin,
      counts: pages.map((page) => ({ tssId: page.tssId, lines: [...page.lines] })),
    },
    ...(note ? { notes: note } : {}),
  };
}

/** "C01-… · RAVI K  1,250.00   ·   C02-… · MEENA T  not counted" — shown when there is more than one drawer. */
export function countsDoneLine(pages: readonly (CountedPage & { paise: number })[]): string {
  return pages
    .map((page) => `${page.label}  ${page.lines.length === 0 ? "not counted" : formatMoney(BigInt(page.paise))}`)
    .join("   ·   ");
}

/**
 * The info after the close: the store Z and how many sessions were
 * force-closed — none when nothing was live (Qt bec3f98).
 */
export function exceptionClosedText(zNo: string, forced: number): string {
  if (forced === 0) return zNo ? `The day is closed — store Z ${zNo}.` : "The day is closed.";
  const sessions = `${plural(forced, "session")} force-closed on your count.`;
  return zNo ? `The day is closed — store Z ${zNo}; ${sessions}` : `The day is closed; ${sessions}`;
}

// ── Reopen day ────────────────────────────────────────────────────────────

/** "14-10-2026 · Z 3" — the day as the reopen names it. */
export function dayLabelOf(day: TillDay): string {
  const date = displayDate(day.tbdBusinessDate);
  return day.tbdZNo ? `${date} · Z ${day.tbdZNo}` : date;
}

export function reopenIntro(label: string): string {
  return (
    `Business day ${label} opens again: sessions and money documents may be dated it until it is closed once ` +
    "more. The store Z is kept. You approve it with your own till PIN (an area manager's authority), and you " +
    "cannot be the one who closed it."
  );
}

export type ReopenDraft = { reasonId: string; note: string; pin: string };

export function reopenProblem(draft: ReopenDraft, reasons: readonly ReasonChoice[]): string {
  if (!draft.reasonId) return "Pick the reason.";
  if (needsNote(reasons, draft.reasonId) && !draft.note.trim()) return "The reason asks for a note.";
  if (!draft.pin) return "Type your till PIN.";
  return "";
}

export function reopenBody(key: DayKey, draft: ReopenDraft): ReopenDayBody {
  const note = draft.note.trim();
  return { ...key, reasonId: draft.reasonId, approverPin: draft.pin, ...(note ? { notes: note } : {}) };
}

export function reopenedText(label: string): string {
  return `Business day ${label} is open again.`;
}
