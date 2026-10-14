/**
 * Till Approval Authority (menu 271 › 285) — the rules of the screen, without React.
 *
 * Ported from the Qt split of NexERP a449b8c (user 2026-10-13: the authority
 * "like other" till masters; server notes 111 gave it menu 285 and its own
 * VIEW · CREATE · EDIT · DELETE · EXPORT rights):
 *
 *  - `TillApprovalAuthorityList` — a `TillMasterList` over grid 152 TILL
 *    APPROVAL GRANTS, one row per grant: WHO may approve which event, where, at
 *    what level, up to how much. "Show inactive" lists ended and switched-off
 *    grants too.
 *  - `TillApprovalGrantEntry` — the popup, filled from the grid row (no `/get`:
 *    the row carries the approver's name and PIN state). The approver is fixed
 *    once the grant exists: a grant for someone else is a new grant.
 *  - A grant is NEVER deleted — old approvals still show who was allowed. Active
 *    off switches it off at once, Active on reopens it; a planned end is Valid To.
 *  - "Copy grants" gives another user the selected approver's open grants;
 *    "Who can approve?" (F7, `TillWhoCanApproveDialog`) previews the gate.
 *
 * What the rules screen (276) shares with this one — the event list, the level
 * order, rule resolution and the who-can-approve check (Qt
 * `till_approval_logic`) — stays in `approval-setup/domain/approval-setup`.
 *
 * Grid 152 rows: dates as `YYYY-MM-DD` (`taa_valid_to` "" when none) plus
 * `*_label` copies as `DD-MM-YYYY`, `taa_max_amount` a numeric string or null,
 * `grant_open` = active and not past valid-to, `grant_status` OFF / FUTURE /
 * ENDED / ACTIVE.
 */
import { normalizeAmount, toPaise, toWireNumber } from "@/features/sales/till/approval-setup/domain/amount";
import {
  allEvents,
  effectiveRule,
  flag,
  gapEvents,
  grantLive,
  has,
  isoDate,
  lowestOkLevel,
  ruleInForceText,
  text,
  whoCanApprove,
  type GrantBody,
  type GridRow,
  type Tone,
  type WhoArgs,
  type WhoLine,
} from "@/features/sales/till/approval-setup/domain/approval-setup";

// ── The screen ──────────────────────────────────────────────────────────────

/** The route; menu rights are resolved from it. */
export const TILL_APPROVAL_AUTHORITY_HREF = "/sales/till/approval-authority";

export const AUTHORITY_TITLE = "Till Approval Authority";
export const AUTHORITY_SUBTITLE =
  "WHO may approve a till exception: which event, where, at what level, up to how much. " +
  "The rules (WHEN) are on Till Approval Rules.";

/** Create-or-update by `taaId` presence. */
export const GRANT_SAVE_ROUTE = "/till/approval-authorities/create";

export const EVERY_COMPANY_LABEL = "(every company — group finance)";
export const EVERY_BRANCH_LABEL = "(every branch)";
export const EVERY_EVENT_LABEL = "(every event)";

export const LIST_KEYS_HINT = "Ctrl+D active on / off · F7 who can approve?";

/** Local calendar date, `YYYY-MM-DD` — what the grid's dates are compared with. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Grid 152's tokens — QUOTED in its SQL, so every one is always sent (one left
 * out stays a literal word). `iinactive` 'true' lists ended and switched-off
 * grants too; 'false' the open ones only. Null until a company is chosen.
 */
export function grantListParams(filter: { companyId: string; showInactive: boolean }): Record<string, string> | null {
  if (!filter.companyId) return null;
  return { icompany_id: filter.companyId, iinactive: filter.showInactive ? "true" : "false" };
}

export function grantListEmptyText(filter: { companyId: string; showInactive: boolean }): string {
  if (!filter.companyId) return "Choose a company in the header first.";
  return filter.showInactive
    ? "No grant here yet — Add gives a user the right to approve."
    : "No open grant — Add gives a user the right to approve, or tick Show inactive.";
}

// ── A grid row ──────────────────────────────────────────────────────────────

export function grantRowId(row: GridRow | null | undefined): string {
  return text(row, "taa_id");
}

/** Active and not past its valid-to — what Active on / off flips (Qt's `activeColumn`). */
export function grantOpen(row: GridRow | null | undefined): boolean {
  return flag(row, "grant_open");
}

/** "Ravi · STORE_MANAGER · CASH_VARIANCE" — a grant named in a question. */
export function grantLabel(row: GridRow): string {
  const event = text(row, "taa_event_code") || EVERY_EVENT_LABEL;
  return [text(row, "approver"), text(row, "taa_role"), event].filter(Boolean).join(" · ");
}

/** Grid columns drawn as a tick rather than the runner's `true` / `false`. */
const TICK_COLUMNS: readonly string[] = ["taa_can_remote", "pin_set"];

/** The grid's columns, drawn from their own field whatever the list shell's heuristics make of them. */
export const GRANT_TEXT_COLUMNS: readonly string[] = [
  "approver",
  "user_role",
  "taa_role",
  "event_label",
  "company_name",
  "branch_name",
  "max_label",
  "taa_can_remote",
  "pin_set",
  "valid_from_label",
  "valid_to_label",
  "taa_remarks",
];

export function grantCellText(key: string, row: GridRow | null | undefined): string {
  if (TICK_COLUMNS.includes(key)) return flag(row, key) ? "✓" : "";
  return text(row, key);
}

export function grantStatusTone(row: GridRow | null | undefined): Tone {
  const status = text(row, "grant_status");
  if (status === "ACTIVE") return "success";
  if (status === "FUTURE") return "info";
  return "muted";
}

/** Under the list, about the highlighted grant. */
export function grantRowHint(row: GridRow | null | undefined): string {
  if (!row) return "";
  const lines: string[] = [];
  const status = text(row, "grant_status");
  if (status === "OFF") lines.push("Switched off — Active on reopens it");
  else if (status === "ENDED") lines.push(`Ended ${text(row, "valid_to_label")} — Active on reopens it with no end date`);
  else if (status === "FUTURE") lines.push(`Starts ${text(row, "valid_from_label")}`);
  else if (has(row, "valid_to_label")) lines.push(`Ends on its own ${text(row, "valid_to_label")}`);
  if (!flag(row, "pin_set")) lines.push(`${text(row, "approver")} has no till PIN — remote approvals only`);
  return lines.join(" · ");
}

// ── Rights ──────────────────────────────────────────────────────────────────

export type Rights = { canCreate: boolean; canEdit: boolean };

/** Active on / off changes a saved grant: EDIT (Qt `btnToggleActive`). */
export function canToggleGrant(row: GridRow | null, rights: Rights): boolean {
  return Boolean(row) && rights.canEdit;
}

/** Copy grants makes new grants: CREATE (Qt `btnCopyGrants`). */
export function canCopyGrants(row: GridRow | null, rights: Rights): boolean {
  return Boolean(row) && rights.canCreate;
}

// ── The stored grant, and Active on / off ───────────────────────────────────

/**
 * The save body of a grid row as stored (Qt `TillApprovalGrantEntry::bodyOf`):
 * blanks as the server's NULLs — no company = every company, no branch =
 * every branch, no event = every event, no max = no ceiling, no valid-to.
 */
export function storedGrantBody(row: GridRow): GrantBody {
  return {
    taaId: grantRowId(row),
    taaUserId: text(row, "taa_user_id"),
    taaCompanyId: text(row, "taa_company_id") || null,
    taaBranchId: text(row, "taa_branch_id") || null,
    taaRole: text(row, "taa_role"),
    taaEventCode: text(row, "taa_event_code") || null,
    taaMaxAmount: has(row, "taa_max_amount") ? toWireNumber(text(row, "taa_max_amount")) : null,
    taaCanRemote: flag(row, "taa_can_remote"),
    taaValidFrom: isoDate(text(row, "taa_valid_from")) ?? text(row, "taa_valid_from"),
    taaValidTo: isoDate(text(row, "taa_valid_to")),
    taaRemarks: text(row, "taa_remarks").trim() || null,
    taaIsActive: flag(row, "taa_is_active"),
  };
}

/**
 * What Active on / off posts (Qt `TillApprovalAuthorityList::toggleBody`): the
 * grant as stored, Active changed. Off takes effect at once and the row stays,
 * with its dates, for old approvals; on reopens it — with no end date when that
 * date has passed, or it would be ended again the moment it is switched on.
 */
export function toggleGrantBody(row: GridRow, active: boolean, today: string): GrantBody {
  const body: GrantBody = { ...storedGrantBody(row), taaIsActive: active };
  const to = isoDate(text(row, "taa_valid_to"));
  if (active && to && to < today) body.taaValidTo = null;
  return body;
}

export type ToggleWords = { title: string; message: string; note: string; done: string };

export function toggleGrantWords(row: GridRow, active: boolean, today: string): ToggleWords {
  const label = grantLabel(row);
  const name = text(row, "approver");
  if (active) {
    const to = isoDate(text(row, "taa_valid_to"));
    return {
      title: "Reactivate",
      message: `Reactivate grant "${label}"?`,
      note: to && to < today ? `Its Valid To (${text(row, "valid_to_label")}) has passed: it reopens with no end date.` : "",
      done: `${name}'s grant reactivated.`,
    };
  }
  return {
    title: "Deactivate",
    message: `Deactivate grant "${label}"? It stays in history and can be reactivated.`,
    note: "It stops counting at once. For a planned end, set Valid To in the grant instead.",
    done: `${name}'s grant deactivated.`,
  };
}

// ── The popup ───────────────────────────────────────────────────────────────

export type GrantForm = {
  /** The approver (dropdown 68); fixed once the grant exists. */
  userId: string;
  userName: string;
  level: string;
  /** "(every company — group finance)" — the server's NULL company. */
  everyCompany: boolean;
  /** "" = every branch of the company. */
  branchId: string;
  branchName: string;
  /** "" = every event. */
  event: string;
  /** "" = no ceiling. */
  max: string;
  remote: boolean;
  /** `YYYY-MM-DD`; required. */
  validFrom: string;
  /** `YYYY-MM-DD`, or "" for none. */
  validTo: string;
  active: boolean;
  remarks: string;
};

export type GrantField = keyof GrantForm;

/**
 * A grid row on the form, or a new grant: this company, every branch, every
 * event, SUPERVISOR, no ceiling, from today, active (Qt's new-grant defaults).
 */
export function grantFormOf(row: GridRow | null, today: string): GrantForm {
  if (!row) {
    return {
      userId: "",
      userName: "",
      level: "SUPERVISOR",
      everyCompany: false,
      branchId: "",
      branchName: "",
      event: "",
      max: "",
      remote: false,
      validFrom: today,
      validTo: "",
      active: true,
      remarks: "",
    };
  }
  const branchId = text(row, "taa_branch_id");
  return {
    userId: text(row, "taa_user_id"),
    userName: text(row, "approver"),
    level: text(row, "taa_role") || "SUPERVISOR",
    everyCompany: !has(row, "taa_company_id"),
    branchId,
    // The grid says "(every branch)" for none: that is the placeholder's job.
    branchName: branchId ? text(row, "branch_name") : "",
    event: text(row, "taa_event_code"),
    max: has(row, "taa_max_amount") ? normalizeAmount(text(row, "taa_max_amount")) : "",
    remote: flag(row, "taa_can_remote"),
    validFrom: isoDate(text(row, "taa_valid_from")) ?? "",
    validTo: isoDate(text(row, "taa_valid_to")) ?? "",
    active: flag(row, "taa_is_active"),
    remarks: text(row, "taa_remarks"),
  };
}

/** A branch narrows a company: "every company" (group finance) has none (Qt `refreshScope`). */
export function withEveryCompany(form: GrantForm, everyCompany: boolean): GrantForm {
  return everyCompany ? { ...form, everyCompany, branchId: "", branchName: "" } : { ...form, everyCompany };
}

/** The events a grant may name: the live ones, and a saved one this list leaves out (the void module's). */
export function grantEventChoices(current: string): string[] {
  const events = allEvents(false);
  return current && !events.includes(current) ? [...events, current] : events;
}

/**
 * The popup's save body (Qt `beforeSubmit`). Every company names no branch —
 * the server refuses a branch without its company.
 */
export function grantFormBody(form: GrantForm, context: { rowId: string | null; companyId: string }): GrantBody {
  const company = form.everyCompany ? null : context.companyId || null;
  return {
    ...(context.rowId ? { taaId: context.rowId } : {}),
    taaUserId: form.userId,
    taaCompanyId: company,
    taaBranchId: company ? form.branchId || null : null,
    taaRole: form.level,
    taaEventCode: form.event || null,
    taaMaxAmount: form.max.trim() ? toWireNumber(form.max) : null,
    taaCanRemote: form.remote,
    taaValidFrom: form.validFrom,
    taaValidTo: form.validTo || null,
    taaRemarks: form.remarks.trim() || null,
    taaIsActive: form.active,
  };
}

const NO_CONTEXT = { rowId: null, companyId: "c" };

/** Two forms that would post the same grant (`"50"` and `"50.00"` are one ceiling). */
export function sameGrantForm(left: GrantForm, right: GrantForm): boolean {
  return JSON.stringify(grantFormBody(left, NO_CONTEXT)) === JSON.stringify(grantFormBody(right, NO_CONTEXT));
}

export type GrantProblem = { field: GrantField; message: string };

/** Why Save refuses, in field order; the caret goes back to the field. */
export function grantFormProblem(form: GrantForm): GrantProblem | null {
  if (!form.userId) return { field: "userId", message: "Pick the user who may approve." };
  if (form.max.trim() && toPaise(form.max) === null) return { field: "max", message: "Max Amount is not an amount." };
  if (!form.validFrom) return { field: "validFrom", message: "Enter the date the grant starts." };
  if (form.validTo && form.validTo < form.validFrom) return { field: "validTo", message: "Valid To is before Valid From." };
  return null;
}

export type GrantHeading = { title: string; subtitle: string; submitLabel: string };

export function grantHeading(row: GridRow | null): GrantHeading {
  return {
    title: row ? `Approval Grant · ${text(row, "approver")}` : "New Approval Grant",
    subtitle: "Who may approve which till exception, where, at what level and up to how much.",
    submitLabel: row ? "Update" : "Save",
  };
}

/** The facts line under a saved grant: can the approver reach the counter, and their user role. */
export function grantFacts(row: GridRow | null): string {
  if (!row) return "";
  const name = text(row, "approver");
  const facts = [
    flag(row, "pin_set")
      ? `${name} has a till PIN — can approve at the counter`
      : `${name} has NO till PIN — can only approve remotely (User Administration, menu 58, sets one)`,
  ];
  const role = text(row, "user_role");
  if (role) facts.push(`user role ${role}`);
  return facts.join("  ·  ");
}

// ── Copy grants ─────────────────────────────────────────────────────────────

export const COPY_NOTE =
  "The user picked gets the same level, scope and ceiling on every open grant, valid from today.";

export function copyTitle(fromName: string): string {
  return `Copy ${fromName}'s open grants`;
}

/** "" when the pick is another user. */
export function copyRefusal(fromUserId: string, to: { id: string } | null): string {
  return !to?.id || to.id === fromUserId ? "Pick another user to give the grants to." : "";
}

/**
 * The source's LIVE grants, re-made for the target from today (Qt
 * `copyGrants`): new grants (no `taaId`), active, the same level, scope,
 * ceiling, remote flag, valid-to and remarks. Read from a fresh, unfiltered
 * grid 152 — the list on screen may be searched.
 */
export function copyGrantBodies(
  rows: readonly GridRow[],
  context: { fromUserId: string; toUserId: string; today: string },
): GrantBody[] {
  return rows
    .filter((row) => text(row, "taa_user_id") === context.fromUserId && grantLive(row, context.today))
    .map((row) => {
      const body: GrantBody = {
        ...storedGrantBody(row),
        taaUserId: context.toUserId,
        taaValidFrom: context.today,
        taaIsActive: true,
      };
      delete body.taaId;
      return body;
    });
}

export function copyConfirmText(count: number, toName: string, fromName: string): string {
  return `Give ${toName} the same ${count} active grant(s) as ${fromName}?`;
}

// ── Who can approve? ────────────────────────────────────────────────────────

/** How Qt's `TillWhoCanApproveDialog` opens: the login's branch, CASH_VARIANCE, 1,000. */
export const WHO_DEFAULT_EVENT = "CASH_VARIANCE";
export const WHO_DEFAULT_AMOUNT = "1000.00";
export const WHO_LOGIN_BRANCH = "this branch (login)";
export const WHO_SUBTITLE =
  "The rule in force at a branch and each approver's verdict — try it before a cashier needs it.";

export type WhoResult = { lines: WhoLine[]; ruleLine: string; gaps: string[] };

/**
 * One check (Qt `runCheck`): each approver's verdict against the rule in force
 * at the branch, the "Rule in force: …" line, and the gap check — the live
 * events there nobody could approve at the rule's own threshold.
 */
export function whoCheck(rules: readonly GridRow[], grants: readonly GridRow[], args: WhoArgs): WhoResult {
  const lines = whoCanApprove(rules, grants, args);
  const rule = effectiveRule(rules, {
    event: args.event,
    branchId: args.branchId,
    companyId: args.companyId,
    today: args.today,
  });
  return {
    lines,
    ruleLine: ruleInForceText(rule, { event: args.event, amount: args.amount, lowest: lowestOkLevel(lines) }),
    gaps: gapEvents(rules, grants, { companyId: args.companyId, branchId: args.branchId, today: args.today }),
  };
}
