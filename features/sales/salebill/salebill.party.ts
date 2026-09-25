/**
 * Sale Bill Entry — the party, as `/bills/party-context` answers it (§7.3),
 * and what the screen says about it (§7.4, §7.5). Pure: no React, no fetch.
 *
 * One call on a customer pick gives the credit standing, the cash taken today
 * (269ST), the open advances and credit notes, the loyalty membership, the
 * ship-to sites, the open temp credits and the counts of open sources. It is
 * keyed by the customer it was asked FOR, so a reply that lands after the
 * operator has moved on is dropped rather than painted against the wrong party.
 *
 * Nothing here is a verdict: `credit.mode` only repeats what `/validate` will
 * do, and the one-time popup is a heads-up, not a gate. A failure never blocks
 * billing.
 */
import type {
  CreditLimitMode,
  PartyContext,
  PartyCreditFacts,
  PartyFacts,
  PartyLoyalty,
  PartyOpenCredit,
  PartyShipTo,
  PartyTempCredit,
} from "./salebill.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The lenient number read every wire figure goes through (§4.3). */
export function toDecimal(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true" || lowered === "1" || lowered === "yes" || lowered === "y") {
      return true;
    }
    if (lowered === "false" || lowered === "0" || lowered === "no" || lowered === "n") {
      return false;
    }
  }
  return fallback;
}

/** Date-only or full ISO → `yyyy-mm-dd`, or null. */
function dateOnly(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : null;
}

function creditMode(value: unknown): CreditLimitMode {
  const raw = (text(value) ?? "").toUpperCase();
  if (raw === "OFF" || raw === "WARN" || raw === "REFUSE") {
    return raw;
  }
  // The server's `credit_limit_mode` catalogue is WARN | REFUSE; an unknown
  // value is read as the stricter one so the panel never reassures wrongly.
  return raw === "" ? "OFF" : "REFUSE";
}

function openCredit(raw: unknown): PartyOpenCredit | null {
  if (!isRecord(raw)) {
    return null;
  }
  const ablId = text(raw.ablId);
  if (!ablId) {
    return null;
  }
  return {
    ablId,
    ablAccYear: text(raw.ablAccYear) ?? "",
    refno: text(raw.refno),
    pending: toDecimal(raw.pending),
    date: dateOnly(raw.date),
  };
}

function loyaltyOf(raw: unknown): PartyLoyalty | null {
  if (!isRecord(raw)) {
    return null;
  }
  const memberId = text(raw.memberId);
  if (!memberId) {
    return null;
  }
  return {
    memberId,
    cardNo: text(raw.cardNo),
    balance: toDecimal(raw.balance),
    redeemable: toDecimal(raw.redeemable),
    rate: toDecimal(raw.rate),
    minPoints: toDecimal(raw.minPoints),
    maxPoints: toDecimal(raw.maxPoints),
    maxRedeemAmount: toDecimal(raw.maxRedeemAmount),
    multiple: toDecimal(raw.multiple, 1) || 1,
    schemeId: text(raw.schemeId),
    // Default TRUE: the scheme allows redemption unless it says otherwise.
    allowPointRedeem: bool(raw.allowPointRedeem, true),
  };
}

function shipToOf(raw: unknown): PartyShipTo | null {
  if (!isRecord(raw)) {
    return null;
  }
  const saaId = text(raw.saaId);
  if (!saaId) {
    return null;
  }
  return {
    saaId,
    name: text(raw.name),
    addr: text(raw.addr),
    place: text(raw.place),
    pin: text(raw.pin),
    stcd: text(raw.stcd),
    gstin: text(raw.gstin),
    phone: text(raw.phone),
    distanceKm: raw.distanceKm === null || raw.distanceKm === undefined ? null : toDecimal(raw.distanceKm),
    isDefault: bool(raw.isDefault),
  };
}

function tempCreditOf(raw: unknown): PartyTempCredit | null {
  if (!isRecord(raw)) {
    return null;
  }
  const atcId = text(raw.atcId);
  if (!atcId) {
    return null;
  }
  return {
    atcId,
    billRefno: text(raw.billRefno),
    name: text(raw.name) ?? "",
    mobile: text(raw.mobile) ?? "",
    balance: toDecimal(raw.balance),
    dueDate: dateOnly(raw.dueDate),
  };
}

function partyOf(raw: unknown, partyId: string): PartyFacts {
  const value = isRecord(raw) ? raw : {};
  return {
    ledId: text(value.ledId) ?? partyId,
    name: text(value.name),
    gstType: text(value.gstType),
    gstin: text(value.gstin),
    stateCode: text(value.stateCode),
    isWalkIn: bool(value.isWalkIn),
    panNo: text(value.panNo),
    panVerifiedOn: dateOnly(value.panVerifiedOn),
    form60On: dateOnly(value.form60On),
    creditAllowed: bool(value.creditAllowed),
    defaultPriceLevel:
      value.defaultPriceLevel === null || value.defaultPriceLevel === undefined
        ? null
        : toDecimal(value.defaultPriceLevel),
    addr: text(value.addr),
    place: text(value.place),
    pin: text(value.pin),
    phone: text(value.phone),
    areaId: text(value.areaId),
    areaName: text(value.areaName),
    distanceKm: value.distanceKm === null || value.distanceKm === undefined ? null : toDecimal(value.distanceKm),
    salesmanId: text(value.salesmanId),
    salesmanName: text(value.salesmanName),
    freightCharge: bool(value.freightCharge),
    loadingCharge: bool(value.loadingCharge),
    unloadingCharge: bool(value.unloadingCharge),
    allowDiscount: bool(value.allowDiscount, true),
    allowPromotion: bool(value.allowPromotion),
    allowLoyalty: bool(value.allowLoyalty),
  };
}

function creditOf(raw: unknown): PartyCreditFacts {
  const value = isRecord(raw) ? raw : {};
  return {
    limitAmount: toDecimal(value.limitAmount),
    limitBills: toDecimal(value.limitBills),
    creditDays: toDecimal(value.creditDays),
    used: toDecimal(value.used),
    openBills: toDecimal(value.openBills),
    oldestOpenDays: toDecimal(value.oldestOpenDays),
    amtExceeded: bool(value.amtExceeded),
    billExceeded: bool(value.billExceeded),
    daysExceeded: bool(value.daysExceeded),
    mode: creditMode(value.mode),
  };
}

/**
 * The reply, read leniently: every number through `toDecimal`, every date
 * sliced, every list tolerant of a row it cannot name. `partyId` and
 * `billDate` are what the call was made WITH — the stale guard keys on them.
 */
export function parsePartyContext(raw: unknown, partyId: string, billDate: string): PartyContext {
  const body = isRecord(raw) ? raw : {};
  const holder = isRecord(body.data) ? body.data : body;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const sources = isRecord(holder.openSources) ? holder.openSources : {};
  return {
    partyId,
    billDate,
    party: partyOf(holder.party, partyId),
    credit: creditOf(holder.credit),
    cashToday: toDecimal(holder.cashToday),
    advances: list(holder.advances).map(openCredit).filter((row): row is PartyOpenCredit => row !== null),
    creditNotes: list(holder.creditNotes)
      .map(openCredit)
      .filter((row): row is PartyOpenCredit => row !== null),
    loyalty: loyaltyOf(holder.loyalty),
    shipTo: list(holder.shipTo).map(shipToOf).filter((row): row is PartyShipTo => row !== null),
    tempCredits: list(holder.tempCredits)
      .map(tempCreditOf)
      .filter((row): row is PartyTempCredit => row !== null),
    openSources: { dc: toDecimal(sources.dc), orders: toDecimal(sources.orders) },
  };
}

// ---------------------------------------------------------------------------
// The credit panel (§7.4)
// ---------------------------------------------------------------------------

export type CreditPanelRow = {
  label: "Pending" | "Overdue" | "Limit" | "Avail";
  value: string;
  /** Red only while the check is on, and only where the plan says so. */
  alert: boolean;
  tooltip: string | null;
};

function amount(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The four read-only rows. `limit 0 = no limit`, `mode OFF` = the check is
 * disabled. Available = `limitAmount − used` when a limit is set, else "—".
 * There is no overdue AMOUNT — the endpoint ages only the oldest open bill.
 */
export function creditPanelRows(credit: PartyCreditFacts): CreditPanelRow[] {
  const checkOn = credit.mode !== "OFF";
  const hasAmountLimit = credit.limitAmount > 0;
  const hasBillLimit = credit.limitBills > 0;
  const pendingAlert = checkOn && credit.daysExceeded;
  const availAlert = checkOn && (credit.amtExceeded || credit.billExceeded);

  const limitText = hasAmountLimit
    ? `${amount(credit.limitAmount)}${hasBillLimit ? ` (${plural(credit.limitBills, "bill", "bills")})` : ""}`
    : hasBillLimit
      ? plural(credit.limitBills, "bill", "bills")
      : "no limit";

  let availText = "—";
  if (hasAmountLimit) {
    availText = amount(Math.max(0, credit.limitAmount - credit.used));
    if (hasBillLimit) {
      availText += ` · ${plural(Math.max(0, credit.limitBills - credit.openBills), "bill", "bills")}`;
    }
  } else if (hasBillLimit) {
    availText = plural(Math.max(0, credit.limitBills - credit.openBills), "bill", "bills");
  }

  return [
    {
      label: "Pending",
      value: `${amount(credit.used)} (${credit.openBills})`,
      alert: pendingAlert,
      tooltip: pendingAlert
        ? `Overdue — oldest open bill ${credit.oldestOpenDays} day(s), terms ${credit.creditDays} day(s)`
        : null,
    },
    {
      label: "Overdue",
      value: credit.creditDays > 0 ? `${plural(credit.creditDays, "credit day", "credit days")}` : "no credit days",
      alert: false,
      tooltip: null,
    },
    { label: "Limit", value: limitText, alert: false, tooltip: null },
    {
      label: "Avail",
      value: availText,
      alert: availAlert,
      tooltip: availAlert
        ? credit.amtExceeded
          ? "Over the credit limit"
          : "Over the open-bill limit"
        : null,
    },
  ];
}

/**
 * The one popup per operator pick (§7.4): only when the check REFUSES, the
 * party may buy on credit, and one of the exceeded flags is set. Loads and
 * seeds never ask for it. Returns the sentence, or null.
 */
export function creditAlertMessage(context: PartyContext): string | null {
  const { credit, party } = context;
  if (credit.mode !== "REFUSE" || !party.creditAllowed) {
    return null;
  }
  const reasons: string[] = [];
  if (credit.amtExceeded) {
    reasons.push("over the credit limit");
  }
  if (credit.billExceeded) {
    reasons.push("over the open-bill limit");
  }
  if (credit.daysExceeded) {
    reasons.push(`overdue (oldest bill ${credit.oldestOpenDays} day(s))`);
  }
  if (reasons.length === 0) {
    return null;
  }
  const name = party.name ?? "This customer";
  return `${name} is ${reasons.join(", ")} — a credit bill will be refused. Bill it as cash, or collect first.`;
}

/**
 * "Exhausted", for the save-time credit confirm (§17.3 step 8): the
 * party-context flags when loaded (limit 0 = none, check off = no gate).
 */
export function creditExhausted(credit: PartyCreditFacts | null | undefined): boolean {
  if (!credit || credit.mode === "OFF") {
    return false;
  }
  return credit.amtExceeded || credit.billExceeded;
}

// ---------------------------------------------------------------------------
// The facts line (§7.5)
// ---------------------------------------------------------------------------

export type FactsCell = {
  key: "gst" | "identity" | "advances" | "creditNotes" | "cashToday" | "tempCredit";
  text: string;
  /** green = good, amber = attention, grey = empty. */
  tone: "green" | "amber" | "grey";
  tooltip: string | null;
};

function ddMMyyyy(iso: string | null): string {
  if (!iso || iso.length < 10) {
    return "";
  }
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/**
 * `GST <type|—> · <gstin> · <stcd> · intra|inter` · PAN / Form 60 · the four
 * money cells. Always shown, because of 269ST and TCS; grey when empty. Clear
 * resets them — the Qt screen once left the last customer's advances showing.
 */
export function factsLine(
  context: PartyContext | null,
  fallback: { gstType: string | null; gstin: string | null; stateCode: string | null },
  isLocal: boolean,
): FactsCell[] {
  const gstType = context?.party.gstType ?? fallback.gstType ?? "—";
  const gstin = context?.party.gstin ?? fallback.gstin ?? "";
  const stcd = context?.party.stateCode ?? fallback.stateCode ?? "";
  const gstParts = [`GST ${gstType || "—"}`, gstin, stcd, isLocal ? "intra" : "inter"].filter(Boolean);
  const cells: FactsCell[] = [
    { key: "gst", text: gstParts.join(" · "), tone: "grey", tooltip: null },
  ];

  if (context?.party.panNo) {
    cells.push({
      key: "identity",
      text: `PAN ${context.party.panNo}${context.party.panVerifiedOn ? " ✓" : ""}`,
      tone: "green",
      tooltip: context.party.panVerifiedOn ? `Verified ${ddMMyyyy(context.party.panVerifiedOn)}` : null,
    });
  } else if (context?.party.form60On) {
    cells.push({
      key: "identity",
      text: `Form 60 · ${ddMMyyyy(context.party.form60On)}`,
      tone: "green",
      tooltip: null,
    });
  } else {
    cells.push({ key: "identity", text: "PAN / Form 60: none", tone: "amber", tooltip: null });
  }

  const advances = context?.advances ?? [];
  const advanceTotal = advances.reduce((sum, row) => sum + row.pending, 0);
  cells.push({
    key: "advances",
    text: `Advances ${advanceTotal > 0 ? `${amount(advanceTotal)} (${advances.length})` : "—"}`,
    tone: advanceTotal > 0 ? "green" : "grey",
    tooltip: null,
  });

  const notes = context?.creditNotes ?? [];
  const noteTotal = notes.reduce((sum, row) => sum + row.pending, 0);
  cells.push({
    key: "creditNotes",
    text: `Credit notes ${noteTotal > 0 ? `${amount(noteTotal)} (${notes.length})` : "—"}`,
    tone: noteTotal > 0 ? "green" : "grey",
    tooltip: "Credit notes open — F4 sets them off",
  });

  const cash = context?.cashToday ?? 0;
  cells.push({
    key: "cashToday",
    text: `Cash today ${cash > 0 ? amount(cash) : "—"}`,
    tone: cash > 0 ? "amber" : "grey",
    tooltip: "Cash taken from this party today (269ST)",
  });

  const temp = context?.tempCredits ?? [];
  const tempTotal = temp.reduce((sum, row) => sum + row.balance, 0);
  cells.push({
    key: "tempCredit",
    text: `Temp credit ${tempTotal > 0 ? `${amount(tempTotal)} (${temp.length})` : "—"}`,
    tone: tempTotal > 0 ? "amber" : "grey",
    tooltip: null,
  });
  return cells;
}

// ---------------------------------------------------------------------------
// Term and due days (§7.2, §7.6)
// ---------------------------------------------------------------------------

/**
 * Whether the party's own term must be forced onto the bill: when the branch
 * does not allow a term change, or the bill has no source document. An
 * imported bill keeps its source's term only while the change is allowed.
 */
export function termForcedToParty(allowTermChange: boolean, hasSourceDocument: boolean): boolean {
  return !allowTermChange || !hasSourceDocument;
}

/** The party's own term. */
export function partyTerm(creditAllowed: boolean): "CASH" | "CREDIT" {
  return creditAllowed ? "CREDIT" : "CASH";
}

/**
 * The due days a CREDIT bill opens on: the party's credit days, clamped to
 * the field's own range (0–3650). A bill-date move keeps the typed days.
 */
export function clampDueDays(days: number): number {
  if (!Number.isFinite(days) || days < 0) {
    return 0;
  }
  return Math.min(3650, Math.trunc(days));
}
