/**
 * Cash Office (menu 287, till notes 118) — Qt `TillSafeOffice` (NexERP
 * ec9d92d, restyled c25c5e3) without the widgets: the branch's safe, what it
 * should hold and how it got there, its blind count, its remittance to the
 * bank, and the CIT remittances still on the way.
 *
 *   GET  /till/safes/balance          each safe's figures (null under a blind
 *                                     close for a caller without 287 / 273
 *                                     OVERRIDE) and the CIT remittances in transit
 *   POST /till/safes/count            the blind count; the answer shows what it
 *                                     should have held
 *   POST /till/movements/remit        bank deposit by staff, or a CIT agency
 *   grid 157  TILL REMITTANCES        every remittance of the branch
 *   grid 158  TILL SAFE BOOK          the safe's movements since its last count
 *
 * A count never decides its own gap here (Qt sends no `treatment`): beyond
 * tolerance it waits, and Decide (`safe-decide.ts`) takes it. Confirming a CIT
 * remittance is `remit-confirm.ts`; voiding one is the shared void dialog.
 */
import type { DropdownSelection } from "@/components/design-system/dropdown";
import { dayMonthTime12Of } from "@/lib/time-format";
import type { TillRemitBody, TillSafeCountBody } from "../shared/api/till-session-api";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import { addDaysIso, ddmmyyyy, textOf } from "../shared/format";
import { amountInputPaise, formatMoney, formatSignedMoney, paiseOf, paiseToNumber, toPaise } from "../shared/money";
import type { MovementVoidRequest } from "../shared/movement-void";
import type { GridColumn } from "../sessions/grid-table";
import type {
  GridRow,
  TillCountLine,
  TillRemitConfirmResult,
  TillRemitMode,
  TillRemitResult,
  TillRemittance,
  TillSafeBalance,
  TillSafeCountResult,
  TillSafePendingGap,
  TillSafeState,
} from "../shared/wire/types";

/** The route this screen is governed by (menu 287, under 271 "Till"). */
export const CASH_OFFICE_HREF = "/sales/till/cash-office";

export type CashOfficeScope = { companyId: string; branchId: string };

export type Tone = "green" | "amber" | "red" | "blue" | "grey";

// ─── tabs ────────────────────────────────────────────────────────────────────

/** The left tabs: the safe's book (grid 158) and the branch's remittances (grid 157). */
export type BookTab = "book" | "remits";
/** The right tabs: Count safe, Remit to bank, On the way. */
export type DeskTab = "count" | "remit" | "transit";

/** Qt's open arg `{ tab: "count" | "remit" }`, here `?tab=count|remit`; anything else names no tab. */
export function deskTabOf(param: string | null | undefined): DeskTab | null {
  const tab = (param ?? "").trim().toLowerCase();
  return tab === "count" || tab === "remit" ? tab : null;
}

export function transitTabTitle(count: number): string {
  return count > 0 ? `On the way (${count})` : "On the way";
}

// ─── the safe picked ─────────────────────────────────────────────────────────

/** The safes the picker offers: the balance's, an inactive one left out. */
export function listedSafes(balance: TillSafeBalance | null): TillSafeState[] {
  return (balance?.safes ?? []).filter((safe) => safe.isActive !== false);
}

/** The safe on screen after a read: the one already picked while listed, else the default, else the first. */
export function pickSafeId(safes: readonly TillSafeState[], keepId: string): string {
  if (keepId && safes.some((safe) => safe.safeId === keepId)) return keepId;
  return (safes.find((safe) => safe.isDefault) ?? safes[0])?.safeId ?? "";
}

export function safeById(safes: readonly TillSafeState[], safeId: string): TillSafeState | null {
  return safes.find((safe) => safe.safeId === safeId) ?? null;
}

export function cashOfficeTitle(safe: TillSafeState | null): string {
  return safe ? `Cash Office  ${safe.name}` : "Cash Office";
}

/** `ACME  ·  business date 15-10-2026  ·  VKPOS` — what is known of it. */
export function cashOfficeSub(companyName: string, businessDate: string | null | undefined, userName: string): string {
  return [companyName, businessDate ? `business date ${ddmmyyyy(businessDate)}` : "", userName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("  ·  ");
}

/** The one thing to know first, as on Business Day and the Cockpit. */
export function safePill(safe: TillSafeState | null): { text: string; tone: Tone } | null {
  if (!safe) return null;
  if (safe.overInsured) return { text: "OVER INSURED LIMIT", tone: "red" };
  if (safe.pendingGaps.length > 0) return { text: "DIFFERENCE TO DECIDE", tone: "amber" };
  if (safe.countedToday) return { text: "COUNTED TODAY", tone: "green" };
  return { text: "NOT COUNTED TODAY", tone: "grey" };
}

// ─── the figures ─────────────────────────────────────────────────────────────

/** A figure the caller may not see (blind) arrives as null: a dash. */
export function figureText(value: number | null | undefined): string {
  const paise = toPaise(value);
  return paise === null ? "—" : formatMoney(paise);
}

export function lastCountText(last: TillSafeState["lastCount"]): string {
  if (!last) return "never";
  const parts = [dayMonthTime12Of(last.countedOn), last.countedByName ?? ""];
  if (last.difference !== null && last.difference !== undefined) parts.push(formatSignedMoney(paiseOf(last.difference)));
  return parts.map((part) => part.trim()).filter(Boolean).join(" · ");
}

export function transitText(transit: TillSafeState["inTransit"] | null | undefined): string {
  const count = transit?.count ?? 0;
  return count > 0 ? `${count} · ${figureText(transit?.amount)}` : "none";
}

export type SafeFact = { caption: string; value: string; danger?: boolean };

/** The facts strip, in Qt's order. With no safe every value is a dash. */
export function safeFacts(safe: TillSafeState | null): SafeFact[] {
  const blank = (caption: string): SafeFact => ({ caption, value: "—" });
  if (!safe) {
    return [
      "Opening",
      "In",
      "Out",
      "Should hold now",
      "Insured limit",
      "Account balance",
      "Last count",
      "On the way to bank",
    ].map(blank);
  }
  const insuredPaise = paiseOf(safe.insuredLimit);
  return [
    { caption: "Opening", value: figureText(safe.opening) },
    { caption: "In", value: figureText(safe.in?.total) },
    { caption: "Out", value: figureText(safe.out?.total) },
    { caption: "Should hold now", value: figureText(safe.expected) },
    { caption: "Insured limit", value: insuredPaise > 0 ? formatMoney(insuredPaise) : "none", danger: safe.overInsured },
    { caption: "Account balance", value: figureText(safe.bookBalance) },
    { caption: "Last count", value: lastCountText(safe.lastCount) },
    { caption: "On the way to bank", value: transitText(safe.inTransit) },
  ];
}

/** The muted line under the facts: where the opening came from, blind, a shared ledger, a drift. */
export function factsHint(safe: TillSafeState | null, figuresVisible: boolean): string {
  if (!safe) return "";
  const hint: string[] = [];
  if (safe.openingFrom === "BOOK") hint.push("Not counted yet: the opening is the safe account's balance.");
  else if (safe.openingFrom === "ZERO") {
    hint.push("Not counted yet, and its account is shared with another safe: the opening is 0.");
  }
  if (!figuresVisible) hint.push("Figures are hidden until you count (blind count).");
  if (safe.ledgerShared) hint.push("Another safe uses the same account: the account balance is for both.");
  const drift = toPaise(safe.drift);
  if (figuresVisible && drift !== null && drift !== 0) {
    hint.push(`The account differs from what the safe should hold by ${formatSignedMoney(drift)}.`);
  }
  return hint.join(" ");
}

// ─── the gaps waiting for a decision ─────────────────────────────────────────

function gapLabel(gap: TillSafePendingGap): string {
  if (gap.stage !== "REMIT") return "count";
  return paiseOf(gap.variance) > 0 ? "bank over" : "bank short";
}

/** The amber band's line, or "" when nothing waits. */
export function gapsLine(safe: TillSafeState | null): string {
  const gaps = safe?.pendingGaps ?? [];
  if (gaps.length === 0) return "";
  const parts = gaps.map((gap) => `${gapLabel(gap)} ${formatSignedMoney(paiseOf(gap.variance))}`);
  return `A difference waits for a decision: ${parts.join(" · ")}`;
}

/** The gap Decide takes: the oldest first (the server lists them so); Decide again for the next. */
export function nextGap(safe: TillSafeState | null): TillSafePendingGap | null {
  return safe?.pendingGaps[0] ?? null;
}

export const NO_OVERRIDE_TITLE = "No override right on Cash Office (menu 287)";

export type ButtonState = { enabled: boolean; title: string };

/**
 * Decide (Qt: on data, the server judges). The web reads Cash Office (287)
 * OVERRIDE from the user menu — the same `user_menus` flag the server checks,
 * with no super-admin bypass — so a caller without it is told here.
 */
export function decideButton(safe: TillSafeState | null, options: { busy: boolean; canOverride: boolean }): ButtonState {
  const gaps = safe?.pendingGaps.length ?? 0;
  if (gaps === 0) return { enabled: false, title: "No difference waits for a decision" };
  if (!options.canOverride) return { enabled: false, title: NO_OVERRIDE_TITLE };
  return {
    enabled: !options.busy,
    title: gaps > 1 ? `${gaps} differences wait: the oldest first, then Decide again for the next` : "",
  };
}

// ─── Count safe ──────────────────────────────────────────────────────────────

export const COUNT_HINT =
  "Count every note and coin in the safe. You see what it should hold only after you save the count.";

export const EMPTY_SAFE_QUESTION = "Nothing is counted. Save the safe as empty?";

export type CountForm = {
  /** Dropdown 68 (TILL APPROVER USERS): an optional second person at the desk. */
  witness: DropdownSelection | null;
  witnessPin: string;
  note: string;
};

export const EMPTY_COUNT_FORM: CountForm = { witness: null, witnessPin: "", note: "" };

/** Why the count cannot be saved yet, or "" — the button's tooltip (Qt `countProblem`). */
export function countProblem(safe: TillSafeState | null, denominationCount: number, form: CountForm): string {
  if (!safe) return "No safe to count.";
  if (denominationCount === 0) return "The notes and coins list did not load.";
  if (form.witness?.id && !form.witnessPin) return "The witness types their till PIN.";
  return "";
}

export function countButtonTitle(canCreate: boolean, problem: string): string {
  return canCreate ? problem : "You have no right to count the safe.";
}

/** `CountTillSafeDto`: an empty safe is one line of 0; never a `treatment` (Decide takes the gap). */
export function countBody(
  scope: CashOfficeScope,
  safeId: string,
  lines: readonly TillCountLine[],
  form: CountForm,
): TillSafeCountBody {
  const body: TillSafeCountBody = {
    companyId: scope.companyId,
    branchId: scope.branchId,
    safeId,
    lines: lines.length > 0 ? [...lines] : [{ tenderTypeId: CASH_TENDER_TYPE_ID, enteredAmount: 0 }],
  };
  if (form.witness?.id) {
    body.witnessId = form.witness.id;
    body.witnessPin = form.witnessPin;
  }
  const note = form.note.trim();
  if (note) body.notes = note;
  return body;
}

/** The answer under the count: what it should have held, and what became of the difference. */
export function countResultLine(result: TillSafeCountResult): { text: string; tone: "green" | "amber" } {
  const difference = paiseOf(result.difference);
  let text =
    `Counted ${formatMoney(paiseOf(result.counted))}, should hold ${formatMoney(paiseOf(result.expected))}, ` +
    `difference ${formatSignedMoney(difference)}.`;
  if (result.outcome === "EXACT") text += " Matches.";
  else if (result.outcome === "WITHIN_TOLERANCE") text += " Small difference: booked.";
  else if (result.outcome === "DECIDED") text += " Decided.";
  else if (result.outcome === "SENT_FOR_APPROVAL") text += " Too big: it waits for a decision (Decide, above).";
  return { text, tone: result.outcome === "SENT_FOR_APPROVAL" ? "amber" : "green" };
}

// ─── Remit to bank ───────────────────────────────────────────────────────────

export const REMIT_MODES: readonly { value: TillRemitMode; label: string }[] = [
  { value: "BANK_DEPOSIT", label: "Our staff, at the bank" },
  { value: "CIT", label: "Cash agency (CIT)" },
];

export type RemitForm = {
  /** Dropdown 25 (BANK LEDGERS). */
  bank: DropdownSelection | null;
  mode: TillRemitMode;
  agency: string;
  bag: string;
  seal: string;
  slipNo: string;
  /** yyyy-MM-dd; sent only with a slip no. */
  slipDate: string;
  amountText: string;
  note: string;
  /** Only when the REMITTANCE rule asks (shipped NEVER). */
  pin: string;
};

export function emptyRemitForm(today: string): RemitForm {
  return {
    bank: null,
    mode: "BANK_DEPOSIT",
    agency: "",
    bag: "",
    seal: "",
    slipNo: "",
    slipDate: today,
    amountText: "",
    note: "",
    pin: "",
  };
}

/** After a posted remittance (Qt): the bank, how it went and the slip date stay; the rest is cleared. */
export function clearedRemitForm(form: RemitForm): RemitForm {
  return { ...form, agency: "", bag: "", seal: "", slipNo: "", amountText: "", note: "", pin: "" };
}

/** The amount sent, in paise: the figure typed. */
export function remitAmountPaise(form: RemitForm): number {
  return amountInputPaise(form.amountText);
}

/** Why the remittance cannot be posted yet, or "" — the button's tooltip (Qt `remitProblem`). */
export function remitProblem(form: RemitForm, safe: TillSafeState | null, amountPaise: number): string {
  if (!safe) return "No safe to send from.";
  if (!form.bank?.id) return "Pick the bank.";
  if (amountPaise <= 0) return "Type the amount.";
  if (form.mode === "CIT" && !form.agency.trim()) return "Type the agency name.";
  const expected = toPaise(safe.expected);
  if (expected !== null && amountPaise > expected) return "The safe does not have this much cash.";
  return "";
}

export function remitButtonTitle(canCreate: boolean, problem: string): string {
  return canCreate ? problem : "You have no right to remit.";
}

export function remitHint(mode: TillRemitMode): string {
  return mode === "CIT"
    ? 'The cash goes out of the safe now and waits as "on the way" until the bank statement shows it: then ' +
        "Confirm it on the next tab."
    : "Our staff paid it into the bank: it is in the bank as soon as you post.";
}

/** `RemitTillCashDto`; a blank optional field is left out, and never `lines` (Qt `remitBody`). */
export function remitBody(scope: CashOfficeScope, safeId: string, form: RemitForm, amountPaise: number): TillRemitBody {
  const body: TillRemitBody = {
    companyId: scope.companyId,
    branchId: scope.branchId,
    safeId,
    amount: paiseToNumber(amountPaise),
    bankLedgerId: form.bank?.id ?? "",
    mode: form.mode,
  };
  const optional = (value: string): string | undefined => value.trim() || undefined;
  const agency = form.mode === "CIT" ? optional(form.agency) : undefined;
  if (agency) body.citAgency = agency;
  const bag = optional(form.bag);
  if (bag) body.bagNo = bag;
  const seal = optional(form.seal);
  if (seal) body.sealNo = seal;
  const slip = optional(form.slipNo);
  if (slip) {
    body.slipNo = slip;
    if (/^\d{4}-\d{2}-\d{2}$/.test(form.slipDate)) body.slipDate = form.slipDate;
  }
  const note = optional(form.note);
  if (note) body.notes = note;
  if (form.pin) body.approverPin = form.pin;
  return body;
}

/** The question before it goes (Qt): `Send 1,50,000.00 from Main safe to KVB Current A/c, with CMS?` */
export function remitQuestion(form: RemitForm, safeName: string, amountPaise: number): string {
  const how = form.mode === "CIT" ? `with ${form.agency.trim()}` : "by our staff";
  return `Send ${formatMoney(amountPaise)} from ${safeName} to ${form.bank?.text ?? "the bank"}, ${how}?`;
}

export function remitPostedText(result: TillRemitResult): string {
  const movement = result.movement;
  return `Remittance ${movement?.tcmDocNo ?? ""} posted: ${formatMoney(paiseOf(movement?.tcmAmount))}.`;
}

// ─── On the way (the balance's CIT remittances in transit) ───────────────────

export const TRANSIT_HINT =
  "Cash sent with an agency, not yet seen in the bank statement. Confirm each one when the bank shows it.";

/** `CMS Info Systems · bag C-11920` — what the agency gave. */
export function agencyBagText(remit: Pick<TillRemittance, "citAgency" | "bagNo">): string {
  return [remit.citAgency ?? "", remit.bagNo ? `bag ${remit.bagNo}` : ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export type TransitRow = {
  tcmId: string;
  doc: string;
  date: string;
  safe: string;
  agency: string;
  amount: string;
  days: string;
  remit: TillRemittance;
};

export function transitRows(list: readonly TillRemittance[] | null | undefined): TransitRow[] {
  return (list ?? []).map((remit) => ({
    tcmId: remit.tcmId,
    doc: remit.docNo,
    date: ddmmyyyy(remit.docDate),
    safe: remit.safeName ?? "",
    agency: agencyBagText(remit),
    amount: figureText(remit.amount),
    days: String(remit.ageDays ?? 0),
    remit,
  }));
}

/** The row kept picked across a read while it is still listed; else the first. */
export function pickTransitId(rows: readonly { tcmId: string }[], keepId: string): string {
  if (keepId && rows.some((row) => row.tcmId === keepId)) return keepId;
  return rows[0]?.tcmId ?? "";
}

export function confirmButtonTitle(canCreate: boolean, picked: boolean): string {
  if (!canCreate) return "You have no right to confirm a remittance.";
  return picked ? "" : "Pick a remittance on the way";
}

/** Said after the confirm popup closes — only when a gap waits (Qt). */
export function confirmOutcomeText(result: TillRemitConfirmResult): string {
  if (result.outcome !== "SENT_FOR_APPROVAL") return "";
  const difference = paiseOf(result.difference);
  return (
    `Confirmed. The bank credited ${formatMoney(Math.abs(difference))} ${difference > 0 ? "more" : "less"}: ` +
    "it waits for a decision (Decide, above)."
  );
}

// ─── the grids: 157 remittances, 158 safe book ───────────────────────────────

export const BOOK_HINT = "Every movement in and out of this safe since its last count, newest first.";

/** How far back the Remittances tab reads (Qt: today − 90 → today). */
export const REMIT_LOOKBACK_DAYS = 90;

export const REMIT_STATUS_FILTERS: readonly { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "IN_TRANSIT", label: "On the way" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DEPOSITED", label: "Deposited" },
  { value: "VOIDED", label: "Voided" },
];

/**
 * Grid 157 binds every token QUOTED; an unsent one stays a literal word and
 * the grid returns nothing — so all five always go, `""` for "no filter".
 */
export function remittanceGridParams(scope: CashOfficeScope, today: string, status: string): Record<string, string> {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    ifrom_date: addDaysIso(today, -REMIT_LOOKBACK_DAYS),
    ito_date: today,
    istatus: status,
  };
}

/** Grid 158: one safe's book since its last count. */
export function safeBookGridParams(scope: CashOfficeScope, safeId: string): Record<string, string> {
  return { icompany_id: scope.companyId, ibranch_id: scope.branchId, isafe_id: safeId };
}

/**
 * Rows newest first on a timestamp field. The runner drops the grid SQL's own
 * ORDER BY; a row without a time goes last, the original order breaks ties.
 */
export function newestFirst(rows: readonly GridRow[], key: string): GridRow[] {
  return rows
    .map((row, index) => ({ row, index, at: Date.parse(textOf(row, key)) }))
    .sort((a, b) => {
      const left = Number.isNaN(a.at) ? Number.NEGATIVE_INFINITY : a.at;
      const right = Number.isNaN(b.at) ? Number.NEGATIVE_INFINITY : b.at;
      return left === right ? a.index - b.index : right - left;
    })
    .map((entry) => entry.row);
}

const MONEY_FIELDS = new Set(["rm_amount", "rm_credited", "sb_in", "sb_out"]);

/** A grid cell's text: money as money, the rest as sent. */
export function gridCellText(row: GridRow, field: string): string {
  if (MONEY_FIELDS.has(field)) {
    const paise = toPaise(row[field]);
    return paise === null ? "" : formatMoney(paise);
  }
  return textOf(row, field);
}

/** The Remittances tab's row when it can still be voided: posted, and not yet confirmed by the bank. */
export function voidableRemit(row: GridRow | null | undefined): GridRow | null {
  if (!row) return null;
  return textOf(row, "tcm_status") === "POSTED" && textOf(row, "tcm_remit_status") !== "CONFIRMED" ? row : null;
}

export function voidButton(
  row: GridRow | null | undefined,
  options: { busy: boolean; canOverride: boolean },
): ButtonState {
  const remit = voidableRemit(row);
  if (!remit) return { enabled: false, title: "Pick a remittance not yet confirmed by the bank" };
  if (!options.canOverride) return { enabled: false, title: NO_OVERRIDE_TITLE };
  return { enabled: !options.busy, title: `Void ${textOf(remit, "tcm_doc_no")}: the cash goes back into the safe` };
}

/** What the shared void dialog is opened on for a remittance row. */
export function remitVoidRequest(row: GridRow, scope: CashOfficeScope): MovementVoidRequest {
  return {
    key: {
      companyId: scope.companyId,
      branchId: scope.branchId,
      accYear: textOf(row, "tcm_acc_year"),
      tcmId: textOf(row, "tcm_id"),
    },
    docNo: textOf(row, "tcm_doc_no"),
    kind: "REMIT",
    amount: paiseToNumber(paiseOf(row.rm_amount)),
  };
}

/** Grid 157's visible columns as configured on the dev box, until the grid's own are read. */
export const REMIT_COLUMNS_FALLBACK: readonly GridColumn[] = [
  { field: "rm_date", header: "Date", align: "left" },
  { field: "tcm_doc_no", header: "Doc", align: "left" },
  { field: "rm_safe", header: "Safe", align: "left" },
  { field: "rm_mode", header: "Mode", align: "left" },
  { field: "rm_bank", header: "Bank", align: "left" },
  { field: "rm_bag_seal", header: "Bag / seal", align: "left" },
  { field: "rm_agency", header: "Agency", align: "left" },
  { field: "rm_slip", header: "Slip", align: "left" },
  { field: "rm_amount", header: "Amount", align: "right" },
  { field: "rm_credited", header: "Credited", align: "right" },
  { field: "rm_status", header: "Status", align: "left" },
  { field: "rm_age", header: "Age (days)", align: "right" },
];

/** Grid 158's visible columns as configured on the dev box. */
export const BOOK_COLUMNS_FALLBACK: readonly GridColumn[] = [
  { field: "sb_date", header: "Date", align: "left" },
  { field: "sb_time", header: "Time", align: "left" },
  { field: "sb_kind", header: "Kind", align: "left" },
  { field: "sb_doc", header: "Doc", align: "left" },
  { field: "sb_who", header: "Session · who", align: "left" },
  { field: "sb_in", header: "In", align: "right" },
  { field: "sb_out", header: "Out", align: "right" },
];
