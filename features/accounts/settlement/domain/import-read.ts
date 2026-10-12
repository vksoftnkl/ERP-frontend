/**
 * The Import dialog's "Read file" (Qt SettlementImportDialog::read): the file
 * goes through the tender's saved map by format/test — nothing is written —
 * and this turns the answer into WHAT THE FILE SAYS and the CHECKS. Only a
 * clean read opens "Import and match".
 */
import { formatPaise } from "./money";
import type { FormatTestResult } from "./types";

export type ReadSummary = {
  rows: string;
  payouts: string;
  utr: string;
  date: string;
  gross: string;
  fee: string;
  tax: string;
  net: string;
  checks: string[];
  readOk: boolean;
  /** Every payout in the file names its date; else the dialog asks for one. */
  fileHasDate: boolean;
};

export const IMPORT_REFUSES =
  "The import itself refuses: the same file again, a terminal of another store, a tender with no settlement ledger.";

export function readSummary(result: FormatTestResult): ReadSummary {
  // The server's signedTotals: a REFUND / CHARGEBACK takes its gross OFF; fee
  // and tax always add. lines[] stops at 200 — the payouts carry the whole
  // file's count and net.
  let gross = 0;
  let fee = 0;
  let tax = 0;
  let fees = 0;
  let refunds = 0;
  for (const line of result.lines) {
    const out = line.kind === "REFUND" || line.kind === "CHARGEBACK";
    gross += out ? -line.gross : line.gross;
    fee += line.fee;
    tax += line.tax;
    if (line.kind === "FEE") fees += 1;
    if (out) refunds += 1;
  }
  let rowCount = 0;
  let net = 0;
  for (const payout of result.payouts) {
    rowCount += payout.lines;
    net += payout.net;
  }
  const capped = rowCount > result.lines.length;
  const checks: string[] = [`✓ every line read with the tender's map: ${result.lines.length} line(s)`];
  for (const payout of result.payouts) {
    checks.push(
      `✓ payout ${payout.payoutRef} of ${payout.payoutDate}: ${payout.lines} line(s), net ${formatPaise(payout.net)}`,
    );
  }
  if (result.payouts.length > 1) checks.push(`! ${result.payouts.length} payouts in the file — one import each`);
  if (fees > 0) checks.push(`! ${fees} FEE line(s) — kept, recognised by the kind map`);
  if (refunds > 0) checks.push(`! ${refunds} REFUND / CHARGEBACK line(s) — taken off the gross`);
  if (capped) {
    checks.push(`! gross / fee / GST above are of the first ${result.lines.length} lines; the net is the whole file's`);
  }
  for (const problem of result.problems) checks.push(`✗ line ${problem.lineNo}: ${problem.message}`);
  checks.push(IMPORT_REFUSES);
  const fileHasDate = result.payouts.every((payout) => payout.payoutDate.trim() !== "");
  if (!fileHasDate) {
    // The import refuses a payout with no date (FILE_INVALID): name it here.
    checks.push("! the file names no payout date — give it below");
  }
  const first = result.payouts[0];
  return {
    rows: capped ? `${rowCount} (first ${result.lines.length} shown)` : String(rowCount),
    payouts: String(result.payouts.length),
    utr: first?.payoutRef ?? "",
    date: first?.payoutDate ?? "",
    gross: formatPaise(gross),
    fee: formatPaise(fee),
    tax: formatPaise(tax),
    net: formatPaise(net),
    checks,
    readOk: result.problems.length === 0 && result.lines.length > 0,
    fileHasDate,
  };
}

/** A refused read, in the CHECKS box. */
export function readRefusedText(code: string, message: string): string {
  return code === "SETTLEMENT_FORMAT_MISSING"
    ? "✗ this tender has no column map — Statement format… first"
    : `✗ ${message}`;
}

export function formatStateText(tender: { settlementLedgerId: string } | null): string {
  if (!tender) return "—";
  return tender.settlementLedgerId
    ? "the tender's own column map (Statement format…)"
    : "⚠ no settlement (bank) ledger on this tender — the import will refuse it";
}

export function importEnabled(state: {
  busy: boolean;
  readOk: boolean;
  fileHasDate: boolean;
  payoutDateOn: boolean;
}): boolean {
  return !state.busy && state.readOk && (state.fileHasDate || state.payoutDateOn);
}

export type FormFields = [name: string, value: string][];

/** format/test's text parts — the import dialog's read and the format dialog's test. */
export function testFields(companyId: string, tenderId: string): FormFields {
  return [
    ["companyId", companyId],
    ["tenderId", tenderId],
  ];
}

/** import's text parts, in Qt's order; the optional ones only when given. */
export function importFields(input: {
  companyId: string;
  tenderId: string;
  branchId: string;
  payoutRef: string;
  payoutDateOn: boolean;
  payoutDate: string;
  notes: string;
}): FormFields {
  const fields: FormFields = [...testFields(input.companyId, input.tenderId), ["branchId", input.branchId]];
  if (input.payoutRef.trim()) fields.push(["payoutRef", input.payoutRef.trim()]);
  if (input.payoutDateOn && input.payoutDate) fields.push(["payoutDate", input.payoutDate]);
  if (input.notes.trim()) fields.push(["notes", input.notes.trim()]);
  return fields;
}

/** The multipart body: the text parts, then the one file part, `file`. */
export function buildMultipart(fields: FormFields, file: Blob, fileName: string): FormData {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  form.append("file", file, fileName);
  return form;
}

/** Qt opens *.csv / *.txt; the server reads CSV only (10 MB at most). */
export const STATEMENT_FILE_ACCEPT = ".csv,.txt,text/csv,text/plain";
export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
