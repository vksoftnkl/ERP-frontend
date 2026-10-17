/**
 * A Contra's money side is a TENDER, never a typed ledger — notes 126 §6 (the
 * user, 2026-10-16), the Qt `openContraTenderMenu` / `applyContraTender`.
 *
 * A Contra moves money between cash and bank, so its Ledger cell opens no
 * ledger list: it offers the CASH tenders and each bank's BANK tender (its
 * NEFT / IMPS one) that name a ledger, shown "tender → ledger", and the line
 * posts to the picked tender's ledger, carrying `tenderId`. The server
 * refuses a Contra line without one (VCH_MONEY_LINE_NO_TENDER) and a
 * `tenderId` on any other type; `/vouchers/ledger-pick` offers no cash or
 * bank ledger at all since notes 130, so the ledger list would be empty here.
 * The list itself — shared with a receipt's / payment's money line — is
 * `domain/tender-menu.ts`.
 */
import type { InstrumentTenderRow, VoucherTypeRules } from "../vouchers.types";
import type { VoucherLine } from "./lines";

export const CONTRA_TYPE_CODE = "Con";

export function isContra(rules: Pick<VoucherTypeRules, "typeCode"> | null | undefined): boolean {
  return rules?.typeCode === CONTRA_TYPE_CODE;
}

/** What a Contra line may be: a tender with a ledger, CASH or BANK — in the server's order. */
export function contraTenders(tenders: readonly InstrumentTenderRow[]): InstrumentTenderRow[] {
  return tenders.filter((tender) => Boolean(tender.ledgerId) && (tender.isCash || tender.typeName === "BANK"));
}

/**
 * The tender picked on a Contra line: its ledger, and its id. The group is
 * the server's to say (the next work-out names it), and a cash or bank
 * ledger is no party, settles no bills and deducts no TDS. A web line always
 * has a side (it opens on one), so there is no blank side to fill as Qt does.
 */
export function applyContraTender(line: VoucherLine, tender: InstrumentTenderRow): VoucherLine {
  return {
    ...line,
    ledgerId: tender.ledgerId,
    ledgerName: tender.ledgerName,
    groupName: "",
    flags: { isParty: false, isBillByBill: false, isTdsApplicable: false },
    tenderId: tender.tenderId,
    tenderName: tender.name,
  };
}

/**
 * What the Ledger cell reads: "Tender · Ledger" on a line with a tender (its
 * name from the line, else from the loaded tenders — a reopened draft has the
 * id only), else the ledger. A ledger whose name is not read yet is "…".
 */
export function ledgerCellText(
  line: Pick<VoucherLine, "ledgerId" | "ledgerName" | "tenderId" | "tenderName">,
  tenders: readonly Pick<InstrumentTenderRow, "tenderId" | "name">[],
): string {
  const ledger = line.ledgerId ? line.ledgerName || "…" : "";
  if (!line.tenderId) {
    return ledger;
  }
  const tender = line.tenderName || tenders.find((candidate) => candidate.tenderId === line.tenderId)?.name || "";
  return tender ? `${tender} · ${ledger}` : ledger;
}
