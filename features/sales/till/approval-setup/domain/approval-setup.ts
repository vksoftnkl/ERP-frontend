/**
 * Till approval (menu 271) — the rules of the two approval screens, without React.
 *
 * Ported from the Qt `TillApprovalSetupEntry` (NexERP d5c3637, 2026-10-09) and
 * the split of a449b8c (server notes 111), which made its two tabs two menus:
 *
 *  - Till Approval Rules (276, this folder): WHEN an exception needs a second
 *    person. One matrix, one scope at a time — the company layer or one branch.
 *    Each event shows the rule in force there, resolved as the server's
 *    `TillApprovalService.ruleFor`: branch row > company row > shipped row, the
 *    latest `tar_effective_from` on or before today, active rows only. The form
 *    edits THIS scope's own row.
 *  - Till Approval Authority (285, `../../approval-authority`): WHO may approve
 *    what, where, up to how much — a list of grants with a popup, like the other
 *    till masters. Its own rules live in that folder's domain.
 *
 * What both need — the event list, the level order, rule resolution and the
 * "Who can approve?" / gap check (Qt `till_approval_logic`) — is here. The
 * check is the SCREENS' preview of the rule × authority × PIN gate.
 *
 * Rows are the configured-grid rows as the runner serialises them: snake_case,
 * numerics as strings ("50.00"), ints and booleans as themselves, COALESCEd
 * columns as "" (grid 152's `taa_event_code`, `taa_valid_to`, `taa_remarks`).
 */
import {
  addPaise,
  compareAmount,
  formatMoney,
  normalizeAmount,
  toWhole,
  toWireNumber,
  trimDecimal,
} from "./amount";

export type GridRow = Record<string, unknown>;

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const RESERVED_SECTION = "RESERVED — VOID MODULE";

/** The events of ck_tar_event (after 49), grouped as the Qt mockup groups them. */
export const RULE_SECTIONS: readonly { title: string; events: readonly string[] }[] = [
  { title: "SESSION", events: ["FLOAT_MISMATCH", "SESSION_REOPEN", "FORCE_CLOSE", "SESSION_VOID", "RECOUNT"] },
  { title: "CASH AT CLOSE", events: ["CASH_VARIANCE", "NONCASH_VARIANCE"] },
  {
    title: "MONEY DOCUMENTS & MOVEMENTS",
    events: ["EXPENSE", "CASH_PAYMENT", "PAID_IN", "PICKUP", "TOP_UP", "MOVEMENT_VOID"],
  },
  { title: "AT THE COUNTER", events: ["NO_SALE", "CASH_LIMIT_OVERRIDE", "SUSPEND_LONG", "COUNTER_RELINK"] },
  { title: "DAY & SAFE", events: ["DAY_CLOSE_EXCEPTION", "DAY_REOPEN", "SAFE_VARIANCE", "REMITTANCE"] },
  { title: "NON-CASH (49)", events: ["NONCASH_WRITE_OFF", "SETTLEMENT_RESOLVE"] },
  {
    title: RESERVED_SECTION,
    events: [
      "VOID_BILL",
      "VOID_LINE",
      "PRICE_OVERRIDE",
      "DISCOUNT_OVER",
      "RETURN_NO_RECEIPT",
      "REFUND_CASH",
      "REPRINT",
      "RETENDER",
    ],
  },
];

export function allEvents(withReserved: boolean): string[] {
  return RULE_SECTIONS.filter((section) => withReserved || section.title !== RESERVED_SECTION).flatMap(
    (section) => [...section.events],
  );
}

/** ck_tar_mode. */
export const RULE_MODES = ["NEVER", "ALWAYS", "OVER_AMOUNT", "OVER_COUNT", "OVER_PERCENT"] as const;
/** ck_tar_channel. */
export const RULE_CHANNELS = ["COUNTER", "REMOTE", "EITHER"] as const;
/**
 * ck_tar_role / ck_taa_role, LOWEST FIRST — the server's `TILL_APPROVER_ROLES`.
 * The Qt screen assumed SUPERVISOR < CASH_OFFICE < STORE_MANAGER; the server
 * states STORE_MANAGER < CASH_OFFICE, and the server wins.
 */
export const APPROVER_LEVELS = ["SUPERVISOR", "STORE_MANAGER", "CASH_OFFICE", "AREA_MANAGER", "HO_FINANCE"] as const;

/** Position in `APPROVER_LEVELS`; -1 for anything else (a blank rule ranks below every level). */
export function levelRank(level: string): number {
  return (APPROVER_LEVELS as readonly string[]).indexOf(level);
}

const EVENT_TEXT: Record<string, string> = {
  FLOAT_MISMATCH: "the opening count differs from the float issued",
  CASH_VARIANCE: "the close's cash gap beyond tolerance",
  NONCASH_VARIANCE: "a card / cheque / voucher gap at the close",
  EXPENSE: "an expense paid from the drawer (ExpV)",
  CASH_PAYMENT: "a payment in cash from the drawer",
  PAID_IN: "cash income with no party",
  PICKUP: "a supervisor takes cash out of a drawer",
  TOP_UP: "change brought from the safe into a drawer",
  MOVEMENT_VOID: "voiding a posted drawer movement",
  NO_SALE: "opening the drawer with no sale",
  CASH_LIMIT_OVERRIDE: "billing past the drawer's block limit",
  SUSPEND_LONG: "a break longer than allowed",
  FORCE_CLOSE: "closing another cashier's session",
  SESSION_REOPEN: "reopening a closed session",
  SESSION_VOID: "voiding a session opened in error",
  RECOUNT: "more count attempts than allowed",
  DAY_CLOSE_EXCEPTION: "closing the day with amber items left",
  DAY_REOPEN: "reopening a closed business day",
  SAFE_VARIANCE: "the safe count differs from the safe book",
  REMITTANCE: "cash leaving the safe for the bank",
  COUNTER_RELINK: "moving a counter to another device",
  NONCASH_WRITE_OFF: "writing off a non-cash gap",
  SETTLEMENT_RESOLVE: "resolving a settlement exception",
};

export function describeEvent(event: string): string {
  return EVENT_TEXT[event] ?? "reserved for the void module — no rule ships yet";
}

export const RESERVED_NOTE =
  "Reserved (hidden): VOID_BILL · VOID_LINE · PRICE_OVERRIDE · DISCOUNT_OVER · RETURN_NO_RECEIPT · " +
  "REFUND_CASH · REPRINT · RETENDER — no rule rows until the void module ships.";
export const KEYS_HINT = "Save F5 · edits create or change the row of the scope shown · shipped rows never change";

/** The server caches a grid run for about a second; a re-read straight after a save waits it out. */
export const RELOAD_AFTER_SAVE_MS = 1500;

// ── Row access ──────────────────────────────────────────────────────────────

export function text(row: GridRow | null | undefined, key: string): string {
  const value = row?.[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function flag(row: GridRow | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const lowered = String(value ?? "").trim().toLowerCase();
  return lowered === "true" || lowered === "t" || lowered === "1";
}

/** Set and not blank. */
export function has(row: GridRow | null | undefined, key: string): boolean {
  return text(row, key).trim() !== "";
}

function whole(row: GridRow | null | undefined, key: string): number {
  return toWhole(text(row, key));
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`; anything else as it came. */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** The `YYYY-MM-DD` a value starts with, or null. */
export function isoDate(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/** "Shipped" rows are effective from 2000-01-01: "always". */
function alwaysFrom(from: string): boolean {
  return from === "" || from.startsWith("2000-");
}

// ═══════════════════════════════════════════════════════════════════════════
//  Rules
// ═══════════════════════════════════════════════════════════════════════════

export type RuleLayer = "BRANCH" | "COMPANY" | "SHIPPED";

export function ruleId(rule: GridRow | null | undefined): string {
  return text(rule, "tar_id");
}

export function ruleLayer(rule: GridRow | null | undefined): string {
  return text(rule, "layer");
}

export type RuleLookup = {
  event: string;
  /** "" = the company layer: branch rows never apply. */
  branchId: string;
  companyId: string;
  today: string;
  /** Leave one row out: what is in force once it is removed. */
  excludeId?: string;
};

/** Exactly `TillApprovalService.ruleFor` over the loaded rows. */
export function effectiveRule(rules: readonly GridRow[], lookup: RuleLookup): GridRow | null {
  const candidates = rules.filter((rule) => {
    if (text(rule, "tar_event_code") !== lookup.event || !flag(rule, "tar_is_active")) return false;
    if (lookup.excludeId && ruleId(rule) === lookup.excludeId) return false;
    if (text(rule, "tar_effective_from") > lookup.today) return false;
    const company = text(rule, "tar_company_id");
    const branch = text(rule, "tar_branch_id");
    if (company && company !== lookup.companyId) return false;
    if (branch && branch !== lookup.branchId) return false;
    return true;
  });
  const sorted = [...candidates].sort((a, b) => {
    const branchA = has(a, "tar_branch_id");
    const branchB = has(b, "tar_branch_id");
    if (branchA !== branchB) return branchA ? -1 : 1;
    const companyA = has(a, "tar_company_id");
    const companyB = has(b, "tar_company_id");
    if (companyA !== companyB) return companyA ? -1 : 1;
    const fromA = text(a, "tar_effective_from");
    const fromB = text(b, "tar_effective_from");
    return fromA === fromB ? 0 : fromA > fromB ? -1 : 1;
  });
  return sorted[0] ?? null;
}

/** THIS scope's own row for the event (the latest), or null. "" = the company layer. */
export function scopeRow(
  rules: readonly GridRow[],
  scope: { event: string; companyId: string; scopeBranch: string },
): GridRow | null {
  let best: GridRow | null = null;
  for (const rule of rules) {
    if (
      text(rule, "tar_event_code") !== scope.event ||
      text(rule, "tar_company_id") !== scope.companyId ||
      text(rule, "tar_branch_id") !== scope.scopeBranch
    ) {
      continue;
    }
    if (!best || text(rule, "tar_effective_from") > text(best, "tar_effective_from")) best = rule;
  }
  return best;
}

export type RuleLayers = { branch: GridRow | null; company: GridRow | null; shipped: GridRow | null };

/** The three layers of one event, the latest row of each — "top wins". */
export function ruleLayers(rules: readonly GridRow[], event: string, scopeBranch: string): RuleLayers {
  const layers: RuleLayers = { branch: null, company: null, shipped: null };
  for (const rule of rules) {
    if (text(rule, "tar_event_code") !== event) continue;
    const layer = ruleLayer(rule);
    const slot: keyof RuleLayers | null =
      layer === "BRANCH"
        ? scopeBranch && text(rule, "tar_branch_id") === scopeBranch
          ? "branch"
          : null
        : layer === "COMPANY"
          ? "company"
          : "shipped";
    if (!slot) continue;
    const current = layers[slot];
    if (!current || text(rule, "tar_effective_from") > text(current, "tar_effective_from")) layers[slot] = rule;
  }
  return layers;
}

/** The threshold as the matrix shows it: money, a count, or a percent. */
export function thresholdText(rule: GridRow | null | undefined): string {
  const mode = text(rule, "tar_mode");
  if (mode === "OVER_AMOUNT") return formatMoney(text(rule, "tar_threshold_amount"));
  if (mode === "OVER_COUNT") return String(whole(rule, "tar_threshold_count"));
  if (mode === "OVER_PERCENT") return `${trimDecimal(text(rule, "tar_threshold_percent") || "0")} %`;
  return "";
}

/** "OVER 50.00 · EITHER · SUPERVISOR · exp 30 · from 01-10-2026" */
export function ruleSummary(rule: GridRow | null | undefined): string {
  if (!rule) return "— none —";
  const mode = text(rule, "tar_mode");
  const parts: string[] = [mode.startsWith("OVER_") ? `OVER ${thresholdText(rule)}` : mode];
  if (mode !== "NEVER") parts.push(text(rule, "tar_channel"), text(rule, "tar_min_role"));
  const expire = whole(rule, "tar_expire_minutes");
  if (expire > 0) parts.push(`exp ${expire}`);
  if (flag(rule, "tar_two_person")) parts.push("two-person");
  const from = text(rule, "tar_effective_from");
  if (!alwaysFrom(from)) parts.push(`from ${shortDate(from)}`);
  return parts.join(" · ");
}

export type Tone = "danger" | "warning" | "muted" | "info" | "branch" | "success";

export type MatrixLine =
  | { kind: "section"; title: string }
  | {
      kind: "event";
      event: string;
      mode: string;
      modeTone: Tone;
      threshold: string;
      channel: string;
      minRole: string;
      twoPerson: boolean;
      allowSelf: boolean;
      blocks: boolean;
      expires: string;
      from: string;
      effective: string;
      effectiveTone: Tone;
    };

/** The rules matrix for one scope: a heading per section, a line per event. */
export function ruleMatrix(
  rules: readonly GridRow[],
  options: { companyId: string; scopeBranch: string; today: string; showReserved: boolean },
): MatrixLine[] {
  const lines: MatrixLine[] = [];
  for (const section of RULE_SECTIONS) {
    if (section.title === RESERVED_SECTION && !options.showReserved) continue;
    lines.push({ kind: "section", title: section.title });
    for (const event of section.events) {
      const rule = effectiveRule(rules, {
        event,
        branchId: options.scopeBranch,
        companyId: options.companyId,
        today: options.today,
      });
      const mode = text(rule, "tar_mode");
      const never = !rule || mode === "NEVER";
      const expire = whole(rule, "tar_expire_minutes");
      const from = text(rule, "tar_effective_from");
      const layer = ruleLayer(rule);
      lines.push({
        kind: "event",
        event,
        mode: rule ? mode : "—",
        modeTone: mode === "ALWAYS" ? "danger" : mode.startsWith("OVER") ? "warning" : "muted",
        threshold: thresholdText(rule),
        channel: never ? "" : text(rule, "tar_channel"),
        minRole: never ? "" : text(rule, "tar_min_role"),
        twoPerson: flag(rule, "tar_two_person"),
        allowSelf: flag(rule, "tar_allow_self"),
        blocks: flag(rule, "tar_blocks_till") && !never,
        expires: expire > 0 ? String(expire) : "",
        from: alwaysFrom(from) ? "" : shortDate(from),
        effective: !rule ? "no rule" : layer === "SHIPPED" ? layer : `${layer}  overrides`,
        effectiveTone: layer === "BRANCH" ? "branch" : layer === "COMPANY" ? "info" : "muted",
      });
    }
  }
  return lines;
}

export function rulesSubtitle(count: number): string {
  return (
    "WHEN an exception needs a second person · branch row beats company row beats shipped · " +
    `latest effective-from wins · ${count} rule rows`
  );
}

/** "EDIT · BRANCH ROW" or "NEW · COMPANY ROW  (from the layer in force)". */
export function ruleEditCaption(hasOwnRow: boolean, scopeBranch: string): string {
  const layer = scopeBranch ? "BRANCH" : "COMPANY";
  return hasOwnRow ? `EDIT · ${layer} ROW` : `NEW · ${layer} ROW  (from the layer in force)`;
}

// ── The rule form ───────────────────────────────────────────────────────────

export type RuleForm = {
  mode: string;
  /** The amount, count or percent, as typed — which one is the mode's business. */
  threshold: string;
  channel: string;
  minRole: string;
  expire: string;
  /** `YYYY-MM-DD`. */
  from: string;
  twoPerson: boolean;
  allowSelf: boolean;
  blocksTill: boolean;
};

/**
 * The form from a row: this scope's own row, or — for a new override — the
 * layer in force. A new override starts today (a shipped row is "always").
 */
export function ruleFormFrom(rule: GridRow | null, options: { ownRow: boolean; today: string }): RuleForm {
  const mode = (rule && text(rule, "tar_mode")) || "NEVER";
  const threshold =
    mode === "OVER_COUNT"
      ? String(whole(rule, "tar_threshold_count"))
      : mode === "OVER_PERCENT"
        ? trimDecimal(text(rule, "tar_threshold_percent") || "0")
        : normalizeAmount(text(rule, "tar_threshold_amount")) || "0.00";
  const from = isoDate(text(rule, "tar_effective_from"));
  return {
    mode,
    threshold,
    channel: (rule && text(rule, "tar_channel")) || "COUNTER",
    minRole: (rule && text(rule, "tar_min_role")) || "SUPERVISOR",
    expire: String(whole(rule, "tar_expire_minutes")),
    from: !options.ownRow || !from ? options.today : from,
    twoPerson: flag(rule, "tar_two_person"),
    allowSelf: flag(rule, "tar_allow_self"),
    blocksTill: !rule || flag(rule, "tar_blocks_till"),
  };
}

/** A mode change keeps the figure; a count has no places (Qt's spin box rounds). */
export function withRuleMode(form: RuleForm, mode: string): RuleForm {
  if (mode === form.mode) return form;
  const threshold = mode === "OVER_COUNT" ? String(toWhole(form.threshold)) : form.threshold;
  return { ...form, mode, threshold };
}

export function thresholdCaption(mode: string): string {
  if (mode === "OVER_COUNT") return "Count (per session)";
  if (mode === "OVER_PERCENT") return "Percent";
  return "Threshold";
}

/** How many places the threshold box takes in this mode. */
export function thresholdDecimals(mode: string): number {
  if (mode === "OVER_COUNT") return 0;
  if (mode === "OVER_PERCENT") return 3;
  return 2;
}

export function thresholdEnabled(mode: string): boolean {
  return mode.startsWith("OVER_");
}

/** Channel, level, expiry and the three ticks mean nothing for NEVER. */
export function ruleDetailsEnabled(mode: string): boolean {
  return mode !== "NEVER";
}

/** `POST /till/approval-rules/create` — SaveTillApprovalRuleDto. */
export type RuleBody = {
  tarId?: string;
  tarCompanyId: string;
  tarBranchId: string | null;
  tarEventCode: string;
  tarMode: string;
  tarThresholdAmount: number;
  tarThresholdCount: number;
  tarThresholdPercent: number;
  tarChannel: string;
  tarMinRole: string;
  tarTwoPerson: boolean;
  tarAllowSelf: boolean;
  tarBlocksTill: boolean;
  tarExpireMinutes: number;
  tarEffectiveFrom: string;
  tarIsActive: boolean;
};

function percentNumber(value: string): number {
  const parsed = Number(String(value).trim() || "0");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Only the field of the chosen mode carries the figure; the other two go as 0. */
export function ruleBody(
  form: RuleForm,
  context: { ownId: string | null; companyId: string; scopeBranch: string; event: string },
): RuleBody {
  return {
    ...(context.ownId ? { tarId: context.ownId } : {}),
    tarCompanyId: context.companyId,
    tarBranchId: context.scopeBranch || null,
    tarEventCode: context.event,
    tarMode: form.mode,
    tarThresholdAmount: form.mode === "OVER_AMOUNT" ? toWireNumber(form.threshold) : 0,
    tarThresholdCount: form.mode === "OVER_COUNT" ? toWhole(form.threshold) : 0,
    tarThresholdPercent: form.mode === "OVER_PERCENT" ? percentNumber(form.threshold) : 0,
    tarChannel: form.channel,
    tarMinRole: form.minRole,
    tarTwoPerson: form.twoPerson,
    tarAllowSelf: form.allowSelf,
    tarBlocksTill: form.blocksTill,
    tarExpireMinutes: Math.min(100000, toWhole(form.expire)),
    tarEffectiveFrom: form.from,
    tarIsActive: true,
  };
}

const NO_CONTEXT = { ownId: null, companyId: "", scopeBranch: "", event: "" };

/** Two forms that would post the same rule (`"50"` and `"50.00"` are one threshold). */
export function sameRule(left: RuleForm, right: RuleForm): boolean {
  return JSON.stringify(ruleBody(left, NO_CONTEXT)) === JSON.stringify(ruleBody(right, NO_CONTEXT));
}

/**
 * The sanity line under the form — never a refusal: does any grant at this
 * scope reach the form's level for this event? Probed at a paisa over an
 * amount threshold, at 1.00 otherwise. The company layer is probed at the
 * login's branch.
 */
export function ruleWarning(
  form: RuleForm,
  context: {
    event: string;
    grants: readonly GridRow[];
    companyId: string;
    scopeBranch: string;
    loginBranch: string;
  },
): string {
  if (form.mode === "NEVER" || !context.event) return "";
  const branch = context.scopeBranch || context.loginBranch;
  const probe = form.mode === "OVER_AMOUNT" ? addPaise(form.threshold, 1) : "1.00";
  const anyone = context.grants.some((grant) => {
    if (!flag(grant, "taa_is_active")) return false;
    const company = text(grant, "taa_company_id");
    const grantBranch = text(grant, "taa_branch_id");
    const event = text(grant, "taa_event_code");
    if ((company && company !== context.companyId) || (grantBranch && grantBranch !== branch)) return false;
    if (event && event !== context.event) return false;
    if (levelRank(text(grant, "taa_role")) < levelRank(form.minRole)) return false;
    if (has(grant, "taa_max_amount") && compareAmount(probe, text(grant, "taa_max_amount")) > 0) return false;
    return true;
  });
  if (anyone) return "";
  return (
    `No grant at this scope reaches ${form.minRole} for ${context.event} — nobody could approve it ` +
    "(Till Approval Authority, menu 285). Warning only — saved as typed."
  );
}

export function ruleProblem(state: { event: string; dirty: boolean }): string {
  if (!state.event) return "Pick an event.";
  if (!state.dirty) return "Nothing changed.";
  return "";
}

/** "Remove this branch row for CASH_VARIANCE? Then in force: … (SHIPPED)." */
export function removeRowMessage(scopeBranch: string, event: string, below: GridRow | null): string {
  const what = scopeBranch ? "branch" : "company";
  return `Remove this ${what} row for ${event}? Then in force: ${ruleSummary(below)} (${ruleLayer(below) || "no rule"}).`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Grants — edited on Till Approval Authority (285), read by both screens
// ═══════════════════════════════════════════════════════════════════════════

/** Active, started, and not past its valid-to (Qt `TillApproval::grantLive`). */
export function grantLive(grant: GridRow, today: string): boolean {
  const to = text(grant, "taa_valid_to");
  return flag(grant, "taa_is_active") && text(grant, "taa_valid_from") <= today && (to === "" || to >= today);
}

/**
 * `POST /till/approval-authorities/create` — SaveTillApprovalAuthorityDto. A
 * body with `taaId` changes that grant; without, it is a new one. Remarks are
 * always sent: an absent key keeps the stored text, and a cleared box must clear it.
 */
export type GrantBody = {
  taaId?: string;
  taaUserId: string;
  taaCompanyId: string | null;
  taaBranchId: string | null;
  taaRole: string;
  taaEventCode: string | null;
  taaMaxAmount: number | null;
  taaCanRemote: boolean;
  taaValidFrom: string;
  taaValidTo: string | null;
  taaRemarks: string | null;
  taaIsActive: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
//  Who can approve? — the preview of the gate
// ═══════════════════════════════════════════════════════════════════════════

export type WhoLine = {
  userId: string;
  name: string;
  level: string;
  max: string;
  pin: boolean;
  remote: boolean;
  verdict: string;
  ok: boolean;
};

export type WhoArgs = { companyId: string; branchId: string; event: string; amount: string; today: string };

/** A grant's ceiling compared as money; "no ceiling" beats every figure. */
function ceilingCompare(a: GridRow, b: GridRow): number {
  const aHas = has(a, "taa_max_amount");
  const bHas = has(b, "taa_max_amount");
  if (!aHas || !bHas) return aHas === bHas ? 0 : aHas ? -1 : 1;
  return compareAmount(text(a, "taa_max_amount"), text(b, "taa_max_amount"));
}

/**
 * Who could approve `event` for `amount` at a branch: level ≥ the rule's
 * minimum, within the max, and able to reach the rule's channel (COUNTER = a
 * till PIN, REMOTE = may approve remotely). Each user's best live grant here.
 */
export function whoCanApprove(rules: readonly GridRow[], grants: readonly GridRow[], args: WhoArgs): WhoLine[] {
  const rule = effectiveRule(rules, {
    event: args.event,
    branchId: args.branchId,
    companyId: args.companyId,
    today: args.today,
  });
  const minRole = text(rule, "tar_min_role");
  const channel = text(rule, "tar_channel");
  const users: string[] = [];
  const names = new Map<string, string>();
  const best = new Map<string, GridRow>();
  for (const grant of grants) {
    const userId = text(grant, "taa_user_id");
    if (!names.has(userId)) {
      users.push(userId);
      names.set(userId, text(grant, "approver"));
    }
    if (!grantLive(grant, args.today)) continue;
    const company = text(grant, "taa_company_id");
    const branch = text(grant, "taa_branch_id");
    const event = text(grant, "taa_event_code");
    if ((company && company !== args.companyId) || (branch && branch !== args.branchId)) continue;
    if (event && event !== args.event) continue;
    const current = best.get(userId);
    const rank = levelRank(text(grant, "taa_role"));
    const currentRank = levelRank(text(current, "taa_role"));
    if (!current || rank > currentRank || (rank === currentRank && ceilingCompare(grant, current) > 0)) {
      best.set(userId, grant);
    }
  }
  return users.map((userId) => {
    const grant = best.get(userId) ?? null;
    let verdict: string;
    if (!grant) verdict = "✗ no grant here";
    else if (levelRank(text(grant, "taa_role")) < levelRank(minRole)) verdict = `✗ level below ${minRole}`;
    else if (has(grant, "taa_max_amount") && compareAmount(args.amount, text(grant, "taa_max_amount")) > 0) {
      verdict = `✗ amount over ${formatMoney(text(grant, "taa_max_amount"))}`;
    } else {
      const pin = flag(grant, "pin_set");
      const remote = flag(grant, "taa_can_remote");
      if (channel === "COUNTER" && !pin) verdict = "✗ no till PIN";
      else if (channel === "REMOTE" && !remote) verdict = "✗ may not approve remotely";
      else if (channel === "EITHER" && !pin && !remote) verdict = "✗ no till PIN, not remote";
      else if (channel === "EITHER" && !pin) verdict = "✓ remote only";
      else verdict = has(grant, "taa_branch_id") ? "✓ can approve" : "✓ can approve (all branches)";
    }
    return {
      userId,
      name: names.get(userId) ?? "",
      level: text(grant, "taa_role"),
      max: !grant ? "" : has(grant, "taa_max_amount") ? formatMoney(text(grant, "taa_max_amount")) : "no ceiling",
      pin: flag(grant, "pin_set"),
      remote: flag(grant, "taa_can_remote"),
      verdict,
      ok: verdict.startsWith("✓"),
    };
  });
}

/** The lowest level among the approvers who could approve, or "". */
export function lowestOkLevel(lines: readonly WhoLine[]): string {
  let lowest = "";
  for (const line of lines) {
    if (line.ok && (!lowest || levelRank(line.level) < levelRank(lowest))) lowest = line.level;
  }
  return lowest;
}

/**
 * Does the rule ask for an approval at this amount? The screen's reading:
 * ALWAYS, OVER_COUNT and OVER_PERCENT always might; OVER_AMOUNT above the
 * threshold. (The server's `assess` answers no for COUNT / PERCENT on a money
 * document — those trip per session, not per amount.)
 */
export function approvalNeeded(rule: GridRow | null, amount: string): boolean {
  const mode = text(rule, "tar_mode");
  return (
    mode === "ALWAYS" ||
    mode === "OVER_COUNT" ||
    mode === "OVER_PERCENT" ||
    (mode === "OVER_AMOUNT" && compareAmount(amount, text(rule, "tar_threshold_amount")) > 0)
  );
}

export function ruleInForceText(rule: GridRow | null, args: { event: string; amount: string; lowest: string }): string {
  if (!rule) return `No rule for ${args.event} — nothing to approve.`;
  const money = formatMoney(args.amount);
  const head = `Rule in force: ${args.event} · ${ruleSummary(rule)} (${ruleLayer(rule).toLowerCase()} row) → `;
  if (!approvalNeeded(rule, args.amount)) return `${head}${money} does not need an approval.`;
  return args.lowest
    ? `${head}the lowest level that covers ${money} is ${args.lowest}.`
    : `${head}NOBODY here can approve ${money}.`;
}

/** The gap check: every live event at this branch that nobody could approve at its own threshold. */
export function gapEvents(
  rules: readonly GridRow[],
  grants: readonly GridRow[],
  args: { companyId: string; branchId: string; today: string },
): string[] {
  return allEvents(false).filter((event) => {
    const rule = effectiveRule(rules, { event, branchId: args.branchId, companyId: args.companyId, today: args.today });
    const mode = text(rule, "tar_mode");
    if (!rule || mode === "NEVER") return false;
    const probe = mode === "OVER_AMOUNT" ? addPaise(text(rule, "tar_threshold_amount"), 1) : "1.00";
    return !whoCanApprove(rules, grants, { ...args, event, amount: probe }).some((line) => line.ok);
  });
}

export function gapText(events: readonly string[]): string {
  return (
    `${events.length} event(s) at this branch have nobody who could approve them at the rule's own threshold: ` +
    `${events.join(", ")}. Warning, not refusal.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Errors
// ═══════════════════════════════════════════════════════════════════════════

type FieldError = { message?: unknown };

function messagesOf(body: unknown): { head: string; lines: string[] } {
  if (!body || typeof body !== "object") return { head: typeof body === "string" ? body : "", lines: [] };
  const record = body as { message?: unknown; errors?: unknown };
  // The global filter nests the till body one level down: { statusCode, message: { message, errors } }.
  if (record.message && typeof record.message === "object") return messagesOf(record.message);
  const lines = Array.isArray(record.errors)
    ? (record.errors as FieldError[])
        .map((entry) => (typeof entry?.message === "string" ? entry.message.trim() : ""))
        .filter(Boolean)
    : [];
  const head = Array.isArray(record.message)
    ? record.message.filter((line): line is string => typeof line === "string").join("\n")
    : typeof record.message === "string"
      ? record.message.trim()
      : "";
  return { head, lines };
}

/**
 * The till routes answer `{ success:false, message, errors:[{ field, message, code }] }`
 * (TillExceptionFilter); the field lines are what the operator needs.
 */
export function approvalErrorText(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { data?: unknown; message?: unknown; error?: unknown };
  const { head: dataHead, lines } = messagesOf(record.data);
  const head =
    dataHead ||
    (typeof record.message === "string" && record.message.trim()) ||
    (typeof record.error === "string" && record.error.trim()) ||
    fallback;
  if (lines.length === 0) return head;
  if (lines.length === 1 && (lines[0] === head || lines[0].endsWith(head))) return lines[0];
  return `${head}\n${lines.join("\n")}`;
}
