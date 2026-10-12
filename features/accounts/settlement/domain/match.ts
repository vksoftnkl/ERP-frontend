/**
 * The Match tab, as the Qt `SettlementReconciliationEntry` draws it
 * (showPayout / fillLines / showLine / refreshMatchButtons / showLegs): what a
 * chip counts, which lines it shows, how a line reads, why the engine thinks a
 * line is our row, which verbs are open, and the TSet's legs. Every string is
 * the Qt one.
 */
import { istClock, shortDate } from "./dates";
import { formatPaise, isPartialDiff } from "./money";
import type { Leg, Payout, SettlementLine, SettlementRights, TenderRowInfo } from "./types";

// ── chips ─────────────────────────────────────────────────────────────────

export const CHIP_KEYS = ["ALL", "MATCHED", "SUGGESTED", "UNMATCHED", "PARTIAL", "OTHER"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

export function isPartialLine(line: SettlementLine): boolean {
  return isPartialDiff(line.amountDiff);
}

export function chipLabels(payout: Payout | null): Record<ChipKey, string> {
  const n = (status: keyof Payout["counts"]) => payout?.counts[status] ?? 0;
  const lines = payout?.lines ?? [];
  return {
    ALL: `All ${lines.length}`,
    MATCHED: `Matched ${n("MATCHED")}`,
    SUGGESTED: `Suggested ${n("SUGGESTED")}`,
    UNMATCHED: `Unmatched ${n("UNMATCHED")}`,
    PARTIAL: `Partial ${lines.filter(isPartialLine).length}`,
    OTHER: `Ignored ${n("IGNORED")} · Resolved ${n("RESOLVED")}`,
  };
}

export function lineVisible(line: SettlementLine, chip: ChipKey): boolean {
  const status = line.matchStatus;
  if (chip === "ALL") return true;
  if (chip === "PARTIAL") return isPartialLine(line);
  if (chip === "OTHER") return status === "IGNORED" || status === "RESOLVED";
  return status === chip;
}

/** The lines a chip shows, each with its index into the payout's lines. */
export function visibleLines(payout: Payout | null, chip: ChipKey): { line: SettlementLine; index: number }[] {
  return (payout?.lines ?? [])
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => lineVisible(line, chip));
}

/** Where the cursor lands on a fresh list: the first suggestion is where a person is needed. */
export function firstCursor(shown: readonly { line: SettlementLine }[]): number {
  if (shown.length === 0) return -1;
  const at = shown.findIndex(({ line }) => lineStatusText(line) === "SUGGESTED");
  return at >= 0 ? at : 0;
}

// ── one line, as a row of the lines table ─────────────────────────────────

export type Tone = "success" | "partial" | "warning" | "danger" | "muted" | "info" | "";

export function lineStatusText(line: SettlementLine): string {
  return isPartialLine(line) && line.matchStatus === "MATCHED" ? "PARTIAL" : line.matchStatus;
}

export function lineStatusTone(line: SettlementLine): Tone {
  switch (line.matchStatus) {
    case "MATCHED":
      return isPartialLine(line) ? "partial" : "success";
    case "SUGGESTED":
      return "warning";
    case "UNMATCHED":
      return "danger";
    default:
      return "muted";
  }
}

export function kindTone(line: SettlementLine): Tone {
  return line.kind !== "SALE" ? "info" : "";
}

export function terminalText(line: SettlementLine): string {
  return line.terminalId || line.vpa;
}

export function authText(authCode: string, cardLast4: string): string {
  const parts = [authCode, cardLast4].filter((part) => part.trim() !== "");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** "Our row": the bill, the gap when the provider paid another amount, or the resolution. */
export function ourRowText(line: SettlementLine): string {
  if (line.resolution) return `resolved: ${line.resolution}`;
  let ours = line.tenderRow?.docRefno ?? "";
  if (isPartialLine(line)) {
    ours += `   ${line.amountDiff < 0 ? "−" : "+"} ${formatPaise(Math.abs(line.amountDiff))}`;
  }
  return ours;
}

export type LineCells = {
  time: string;
  terminal: string;
  kind: string;
  ref: string;
  auth: string;
  gross: string;
  feeGst: string;
  net: string;
  status: string;
  rule: string;
  ours: string;
};

export function lineCells(line: SettlementLine): LineCells {
  return {
    time: istClock(line.txnOn),
    terminal: terminalText(line),
    kind: line.kind,
    ref: line.refNo,
    auth: authText(line.authCode, line.cardLast4),
    gross: formatPaise(line.gross),
    feeGst: formatPaise(line.fee + line.tax),
    net: formatPaise(line.net),
    status: lineStatusText(line),
    rule: line.matchRule,
    ours: ourRowText(line),
  };
}

/** The server's totals (IGNORED lines left out, refunds signed). */
export function linesTotalText(payout: Payout | null): string {
  if (!payout || payout.lines.length === 0) return "";
  return (
    `Total of the payout:  gross ${formatPaise(payout.totalGross)} · ` +
    `fee + GST ${formatPaise(payout.totalFee + payout.totalTax)} · net ${formatPaise(payout.totalNet)}`
  );
}

// ── the suggestion panel ──────────────────────────────────────────────────

export function suggestCaption(line: SettlementLine): string {
  if (line.matchStatus === "SUGGESTED") return "Suggested match — confirm or reject";
  if (line.matchStatus === "UNMATCHED") return "Unmatched line — pick our row, or ignore it";
  return `${line.matchStatus} line`;
}

export function suggestTone(line: SettlementLine): Tone {
  if (line.matchStatus === "SUGGESTED") return "warning";
  if (line.matchStatus === "UNMATCHED") return "danger";
  return "";
}

export type Fact = { label: string; value: string; strong?: boolean };

export function statementSide(line: SettlementLine): Fact[] {
  return [
    { label: "time", value: istClock(line.txnOn) },
    { label: "terminal", value: line.terminalId || line.vpa },
    { label: "RRN", value: line.refNo, strong: true },
    { label: "auth · last4", value: `${line.authCode} · ${line.cardLast4}` },
    { label: "gross", value: formatPaise(line.gross) },
  ];
}

/** Our tender row's side; null = "— none —". */
export function rowSide(row: TenderRowInfo | null): Fact[] | null {
  if (!row) return null;
  return [
    { label: "bill", value: `${row.docRefno} · ${istClock(row.createdOn)}` },
    { label: "ref keyed", value: row.refNo, strong: true },
    { label: "auth · last4", value: `${row.authCode} · ${row.cardLast4}` },
    { label: "amount", value: formatPaise(row.amount) },
  ];
}

export type WhyLine = { mark: "✓" | "!"; text: string };

/** Why the engine thinks the line is our row. */
export function whyLines(line: SettlementLine): WhyLine[] {
  const row = line.tenderRow;
  const why: WhyLine[] = [];
  switch (line.matchRule) {
    case "REF":
      why.push({ mark: "✓", text: "same RRN / UTR as keyed on the bill" });
      break;
    case "AUTH":
      why.push({ mark: "✓", text: "same approval code + last 4 + amount, within a day" });
      break;
    case "AMOUNT_TIME":
      why.push({ mark: "✓", text: "same tender and amount, close in time — the only candidate on either side" });
      if (row && row.refNo && row.refNo !== line.refNo) {
        why.push({ mark: "!", text: `RRN differs: keyed ${row.refNo}, the line says ${line.refNo}` });
      }
      break;
    case "MANUAL":
      why.push({ mark: "✓", text: "linked by hand" });
      break;
    default:
      break;
  }
  if (isPartialLine(line)) {
    why.push({
      mark: "!",
      text: `the provider paid ${formatPaise(line.gross)} against the row's ${formatPaise(row?.amount ?? 0)} — the gap goes to Not received`,
    });
  }
  return why;
}

export function suggestNote(line: SettlementLine): string {
  return line.matchStatus === "SUGGESTED"
    ? "Confirming matches it MANUAL-checked and corrects nothing on the bill: the keyed ref stays as typed; the line keeps the true RRN."
    : "";
}

// ── which verbs are open ──────────────────────────────────────────────────

export type MatchActions = {
  runMatch: boolean;
  confirm: boolean;
  unlink: boolean;
  pickRow: boolean;
  ignore: boolean;
  post: boolean;
  /** Why Post is shut, when it is a waiting suggestion. */
  postTitle: string;
  void: boolean;
  importFile: boolean;
};

export function isOpenPayout(payout: Payout | null): payout is Payout {
  return payout !== null && payout.status !== "POSTED" && payout.status !== "VOIDED";
}

export function matchActions(
  payout: Payout | null,
  line: SettlementLine | null,
  rights: SettlementRights,
  busy: boolean,
): MatchActions {
  const open = isOpenPayout(payout) && !busy;
  const status = line?.matchStatus ?? "";
  const edit = open && rights.canEdit;
  const suggested = payout?.counts.SUGGESTED ?? 0;
  return {
    runMatch: edit,
    confirm: edit && status === "SUGGESTED",
    // Unlink also undoes an Ignore; Pick row also replaces a suggestion.
    unlink: edit && (status === "SUGGESTED" || status === "MATCHED" || status === "IGNORED"),
    pickRow: edit && (status === "UNMATCHED" || status === "SUGGESTED"),
    ignore: edit && (status === "UNMATCHED" || status === "SUGGESTED"),
    post: open && suggested === 0 && rights.canPost,
    postTitle:
      suggested > 0
        ? `${suggested} suggestion(s) wait for a person — confirm or reject them first`
        : "",
    void: payout !== null && payout.status !== "VOIDED" && !busy && rights.canCancel,
    importFile: rights.canCreate,
  };
}

// ── the payout's facts ────────────────────────────────────────────────────

export type PayoutFacts = {
  payout: string;
  utr: string;
  provider: string;
  lines: string;
  gross: string;
  fee: string;
  gst: string;
  net: string;
  status: string;
  /** Two lines: the bank and the file — or what to do first. */
  bankFile: string[];
};

export function payoutFacts(payout: Payout | null): PayoutFacts {
  if (!payout) {
    return {
      payout: "—",
      utr: "—",
      provider: "—",
      lines: "—",
      gross: "—",
      fee: "—",
      gst: "—",
      net: "—",
      status: "—",
      bankFile: ["Pick a payout above — or Import file… to bring in a provider statement."],
    };
  }
  return {
    payout: shortDate(payout.payoutDate),
    utr: payout.payoutRef,
    provider: payout.provider,
    lines: String(payout.lineCount),
    gross: formatPaise(payout.totalGross),
    fee: formatPaise(payout.totalFee),
    gst: formatPaise(payout.totalTax),
    net: formatPaise(payout.totalNet),
    status: payout.status,
    bankFile: [`bank: ${payout.bankLedgerName}`, `file: ${payout.fileName}`],
  };
}

// ── the voucher ───────────────────────────────────────────────────────────

export type LegRow = { ledger: string; dr: string; cr: string; total?: boolean };

/** The TSet's legs as the Qt table lists them, with a Total row under them. */
export function legRows(legs: readonly Leg[]): LegRow[] {
  if (legs.length === 0) return [];
  let dr = 0;
  let cr = 0;
  const rows: LegRow[] = legs.map((leg) => {
    const isDr = leg.drCr === "DR";
    if (isDr) dr += leg.amount;
    else cr += leg.amount;
    return {
      ledger: leg.ledgerName + (leg.role ? `  (${leg.role})` : ""),
      dr: isDr ? formatPaise(leg.amount) : "",
      cr: isDr ? "" : formatPaise(leg.amount),
    };
  });
  rows.push({ ledger: "Total", dr: formatPaise(dr), cr: formatPaise(cr), total: true });
  return rows;
}

export function voucherNote(payout: Payout | null, legs: readonly Leg[]): string {
  if (payout?.status === "POSTED") return `Posted as ${payout.voucherRefno}.`;
  if (legs.length === 0) return "The voucher shows here once posted — the server writes it, netted per ledger.";
  return "";
}

// ── the questions the verbs ask ───────────────────────────────────────────

export function postQuestion(payout: Payout): string {
  return (
    `Post the payout of ${shortDate(payout.payoutDate)} (${payout.payoutRef})? One TSet voucher: ` +
    `Dr bank ${formatPaise(payout.totalNet)} · fee · GST on fee, Cr each matched row's clearing ledger, ` +
    "the rest to Tender suspense. Matched rows become SETTLED (PARTIAL when the provider paid another amount)."
  );
}

export function voidQuestion(payout: Payout): string {
  return payout.status === "POSTED"
    ? "Voiding reverses the TSet; its rows go back to PENDING and the file may be read again. Why?"
    : "Voiding drops this import; the file may be read again. Why?";
}

export const VOID_SUGGESTIONS = ["Wrong file", "Wrong tender", "Provider re-issued the file"] as const;

export const IGNORE_QUESTION =
  "This line leaves the payout's totals (a fee, a rental, an adjustment no row stands for). Why?";
export const IGNORE_SUGGESTIONS = ["Terminal rental", "Provider fee", "Adjustment"] as const;

// ── the request bodies ────────────────────────────────────────────────────

export type Scope = { companyId: string; branchId: string };

/** The house key of a payout. */
export function payoutKey(scope: Scope, payout: Pick<Payout, "asiId" | "accYear">) {
  return { companyId: scope.companyId, branchId: scope.branchId, accYear: payout.accYear, asiId: payout.asiId };
}

/** One statement line — the payout's year (both tables are partitioned by it). */
export function lineKey(scope: Scope, payout: Pick<Payout, "accYear">, line: Pick<SettlementLine, "aslId">) {
  return { companyId: scope.companyId, branchId: scope.branchId, accYear: payout.accYear, aslId: line.aslId };
}

/** Confirm: as it stands (a SUGGESTED line), or linked by hand to a picked row (MANUAL). */
export function confirmBody(
  scope: Scope,
  payout: Pick<Payout, "accYear">,
  line: Pick<SettlementLine, "aslId">,
  picked?: { tdId: string; tdAccYear: string } | null,
) {
  const key = lineKey(scope, payout, line);
  return picked ? { ...key, tdId: picked.tdId, tdAccYear: picked.tdAccYear } : key;
}
