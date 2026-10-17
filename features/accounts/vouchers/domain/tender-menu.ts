/**
 * The tender list on the Ledger cell — every line of a Contra, and the money
 * side of a Receipt / Payment Voucher (Qt `openTenderMenu` /
 * `applyMoneyTender`, NexERP 1d3e203; notes 126 §6, notes 130).
 *
 * Since notes 130 `/vouchers/ledger-pick` (grid 119) lists no cash or bank
 * ledger on any side, so the money side of a receipt (Dr) or a payment (Cr)
 * lists nothing at all: the server takes the money there only as the party
 * lines' instruments (a typed Dr Cash In Hand is refused). So that side's
 * Ledger cell opens the tender list, as a Contra's does:
 *
 *  - **A Contra** posts the line to the picked tender's ledger
 *    (`applyContraTender`); its list is the CASH tenders and each bank's BANK
 *    tender that name a ledger.
 *  - **A money line** lists every tender the type takes, and the pick goes on
 *    the open party lines ABOVE it as their instrument (`applyMoneyTender`).
 *    The money line itself is never sent — the server generates the Dr Cash /
 *    Bank leg from the instruments, and it shows under the typed lines — so
 *    once every open line has its instrument the money line goes, and the
 *    blank line at the bottom is back on the party side for the next one.
 */
import type { DrCr, InstrumentTenderRow, VoucherTypeRules } from "../vouchers.types";
import { contraTenders, isContra } from "./contra";
import { emptyInstrument, type LineInstrument } from "./instruments";
import { amountPaise, newLineSide, withTrailingLine, type VoucherLine } from "./lines";

type MoneyRules = Pick<VoucherTypeRules, "instruments" | "partySide">;
type SideRules = Pick<VoucherTypeRules, "partyMode" | "partySide">;

/** The side the TYPED lines mostly sit on — the opposite of the party's (Qt `typedSide()`). */
export function typedSide(partySide: string | null | undefined): DrCr {
  return partySide === "DR" ? "CR" : "DR";
}

/**
 * The money line of a type that takes instruments: a receipt's Dr, a
 * payment's Cr — the typed (non-party) side (Qt `isMoneyRow`).
 */
export function isMoneyRow(
  rules: MoneyRules | null | undefined,
  line: Pick<VoucherLine, "drCr"> | null | undefined,
): boolean {
  if (!rules?.instruments || !line) {
    return false;
  }
  if (rules.partySide !== "DR" && rules.partySide !== "CR") {
    return false;
  }
  return line.drCr === typedSide(rules.partySide);
}

/** The Ledger cell opens the tender list, never the ledger picker. */
export function opensTenderMenu(
  rules: (MoneyRules & Pick<VoucherTypeRules, "typeCode">) | null | undefined,
  line: Pick<VoucherLine, "drCr"> | null | undefined,
): boolean {
  return isContra(rules) || isMoneyRow(rules, line);
}

/**
 * What the list offers, in the server's order: on a Contra its CASH and BANK
 * tenders with a ledger; on a money line every tender the type takes.
 */
export function tenderMenu(tenders: readonly InstrumentTenderRow[], contra: boolean): InstrumentTenderRow[] {
  return contra ? contraTenders(tenders) : [...tenders];
}

/**
 * A line of the list: "Cash  →  Cash in Hand" — or the tender alone where its
 * ledger would mislead: a payment's cheque or bank transfer is drawn on the
 * bank picked in its popup, not on the tender's own ledger.
 */
export function tenderLabel(
  tender: Pick<InstrumentTenderRow, "name" | "ledgerName" | "isCash">,
  how: { contra: boolean; paying: boolean },
): string {
  const showLedger = Boolean(tender.ledgerName) && (how.contra || !how.paying || tender.isCash);
  return showLedger ? `${tender.name}  →  ${tender.ledgerName}` : tender.name;
}

/** The warning when the list is empty. A money line's list is every tender: empty means not loaded. */
export function noTenderMessage(contra: boolean): string {
  return contra
    ? "There is no Cash or Bank tender to pick. Create one in Tender Master."
    : "The tender list has not loaded — the server did not answer.";
}

/**
 * Does the picked tender need the instrument popup on each line? Receiving:
 * a cheque, or a tender that takes a reference (UPI, NEFT). Paying: anything
 * but cash — it is drawn on a bank of ours, picked there.
 */
export function tenderNeedsDetails(
  tender: Pick<InstrumentTenderRow, "isCash" | "isCheque" | "needsRef">,
  paying: boolean,
): boolean {
  return paying ? !tender.isCash : tender.isCheque || tender.needsRef;
}

/** The instrument a tender starts as — what goes straight on, or what the popup opens on. */
export function instrumentOfTender(
  tender: Pick<InstrumentTenderRow, "tenderId" | "name" | "typeName" | "isCheque">,
): LineInstrument {
  return {
    ...emptyInstrument(),
    tenderId: tender.tenderId,
    tenderName: tender.name,
    typeName: tender.typeName,
    isCheque: tender.isCheque,
  };
}

function hasInstrument(line: VoucherLine): boolean {
  return Boolean(line.instrument?.tenderId);
}

/**
 * The party lines ABOVE the money line still waiting on their money: on the
 * party's side, with a ledger, an amount above zero, and no instrument yet.
 */
export function openPartyLines(lines: readonly VoucherLine[], moneyKey: string, partySide: string): string[] {
  const at = lines.findIndex((line) => line.key === moneyKey);
  if (at < 0) {
    return [];
  }
  return lines
    .slice(0, at)
    .filter((line) => line.drCr === partySide && Boolean(line.ledgerId) && amountPaise(line.amount) > 0 && !hasInstrument(line))
    .map((line) => line.key);
}

export type MoneyTenderPick =
  /** No open party line above: said on the cell (Qt `onNotEditable`). */
  | { refused: string }
  | {
      /** The lines after the pick — as they were while `ask` is not empty. */
      lines: VoucherLine[];
      /** The open party lines the tender is for. */
      open: string[];
      /**
       * The lines still to get their instrument through the popup, opened on
       * `start`, one after another (backing out stops; `settleMoneyLine`
       * after). Empty: the tender went straight on and the lines are settled.
       */
      ask: string[];
      start: LineInstrument;
    };

/**
 * The tender picked on a money line, as the instrument of every open party
 * line above it. Cash (and, receiving, any tender with nothing to ask) goes
 * straight on, and the lines are settled; anything else is asked line by
 * line in the instrument popup. null when the money line is not there.
 */
export function applyMoneyTender(
  lines: readonly VoucherLine[],
  moneyKey: string,
  tender: InstrumentTenderRow,
  rules: SideRules,
): MoneyTenderPick | null {
  if (!lines.some((line) => line.key === moneyKey)) {
    return null;
  }
  const paying = rules.partySide === "DR";
  const open = openPartyLines(lines, moneyKey, rules.partySide);
  if (open.length === 0) {
    const who = paying ? "supplier" : "customer";
    return {
      refused: `Type the ${who} and amount first; the tender goes on its line. To change a line's tender, press Ctrl+Q on it.`,
    };
  }
  const start = instrumentOfTender(tender);
  if (tenderNeedsDetails(tender, paying)) {
    return { lines: [...lines], open, ask: open, start };
  }
  const keys = new Set(open);
  const covered = lines.map((line) => (keys.has(line.key) ? { ...line, instrument: { ...start } } : line));
  return { lines: settleMoneyLine(covered, moneyKey, open, rules), open, ask: [], start };
}

/**
 * Once every open line has its instrument, the money line goes and the blank
 * line at the bottom re-sides — back on the party side, for the next one. A
 * line still open keeps the money line for it: the same lines come back.
 */
export function settleMoneyLine(
  lines: readonly VoucherLine[],
  moneyKey: string,
  open: readonly string[],
  rules: SideRules,
): VoucherLine[] {
  const keys = new Set(open);
  const covered = lines.every((line) => !keys.has(line.key) || hasInstrument(line));
  if (!covered || !lines.some((line) => line.key === moneyKey)) {
    return lines as VoucherLine[];
  }
  return withTrailingLine(
    lines.filter((line) => line.key !== moneyKey),
    (current) => newLineSide(current, rules),
  );
}

/**
 * A letter typed on the open list: the next tender after `from` whose name
 * starts with it, round again from the top — -1 when none does.
 */
export function tenderAtLetter(list: readonly Pick<InstrumentTenderRow, "name">[], from: number, letter: string): number {
  const wanted = letter.trim().toLowerCase();
  if (!wanted) {
    return -1;
  }
  for (let step = 1; step <= list.length; step += 1) {
    const index = (from + step + list.length) % list.length;
    if (list[index].name.trim().toLowerCase().startsWith(wanted)) {
      return index;
    }
  }
  return -1;
}

/**
 * Where the list opens: on the tender the letter that opened it names, else
 * on the line's own tender (Qt's active action), else the first.
 */
export function openingTenderIndex(
  list: readonly Pick<InstrumentTenderRow, "tenderId" | "name">[],
  currentTenderId: string,
  seed: string,
): number {
  const byLetter = seed ? tenderAtLetter(list, -1, seed) : -1;
  if (byLetter >= 0) {
    return byLetter;
  }
  const current = currentTenderId ? list.findIndex((tender) => tender.tenderId === currentTenderId) : -1;
  return Math.max(0, current);
}
