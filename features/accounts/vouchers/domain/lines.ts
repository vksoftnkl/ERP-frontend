/**
 * A voucher's typed lines — what the legs grid edits, and how it becomes the
 * payload.
 *
 * The Qt screen's rules, kept:
 *
 *  - **One blank line is always at the bottom.** Typing on it makes it a line
 *    and a new blank appears; it is never sent and never removed.
 *  - **A line is SENT only when it is complete** — a ledger, and an amount
 *    above zero. A half-keyed line is left out of the payload and the totals
 *    alike (the server would refuse it, and the operator is still typing).
 *  - **The column decides the side.** Typing a figure in Credit makes the line
 *    a credit line; the Dr/Cr cell can flip it too.
 *  - **A new line opens on DR** — except on a many-party Receipt / Payment,
 *    entered party first: a balanced voucher opens the next line on the
 *    party's side, an unbalanced one on the side that balances it, and a
 *    ledger picked there opens with the difference. A line whose instrument
 *    makes its own money leg is out of that difference (it balances itself).
 *  - **On a receipt or payment the side follows the ledger**: once a ledger
 *    is picked the line keeps its side — a figure in the other column goes to
 *    its own column instead.
 *
 * Money is held as the TEXT the operator typed and summed in integer paise:
 * the server rounds half-up to two places and refuses a voucher out by 0.01,
 * so a double's 0.30000000000000004 is not a figure this screen may show.
 */
import type {
  DerivedLeg,
  DrCr,
  StoredDraft,
  VoucherHeaderBody,
  VoucherLegPayload,
  VoucherLineBody,
  VoucherTypeRules,
} from "../vouchers.types";
import { adoptDerivedInstrument, instrumentBody, instrumentFromDraft, type LineInstrument } from "./instruments";

/** What the picker said of the ledger; unknown on a reopened draft. */
export type LedgerFlags = {
  isParty: boolean;
  isBillByBill: boolean;
  isTdsApplicable: boolean;
};

export type VoucherLine = {
  key: string;
  drCr: DrCr;
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  /** As typed — `"25000"`, `"25,000.5"`. Parsed by `amountPaise`. */
  amount: string;
  remarks: string;
  /** null until the picker says (a reopened draft, a posted voucher). */
  flags: LedgerFlags | null;
  /** A payment's TDS base said by hand; null = the ledger's own flag. */
  tdsBase: boolean | null;
  /** A receipt / payment party line's instrument. */
  instrument: LineInstrument | null;
  /** The operator set Dr/Cr by hand: never re-sided. */
  sideChosen: boolean;
  /** A GST-band type: the line's rate ("" = untaxed), HSN/SAC and ITC class. */
  taxId: string;
  hsn: string;
  itcEligibility: string;
};

let lineSequence = 0;

export function blankLine(drCr: DrCr = "DR"): VoucherLine {
  lineSequence += 1;
  return {
    key: `voucher-line-${lineSequence}`,
    drCr,
    ledgerId: "",
    ledgerName: "",
    groupName: "",
    amount: "",
    remarks: "",
    flags: null,
    tdsBase: null,
    instrument: null,
    sideChosen: false,
    taxId: "",
    hsn: "",
    itcEligibility: "",
  };
}

/** `"25,000.50"` → 2500050 paise. Blank → 0. Not a number, or past two places → NaN. */
export function amountPaise(text: string): number {
  const raw = text.trim().replace(/,/g, "");
  if (!raw) {
    return 0;
  }
  if (!/^\d+(\.\d{0,2})?$/.test(raw) && !/^\.\d{1,2}$/.test(raw)) {
    return Number.NaN;
  }
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
}

/** 2500050 → `"25000.50"` — the wire's decimal string. */
export function paiseText(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const value = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/** Indian grouping, two places — for display only. */
export function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function isBlankLine(line: VoucherLine): boolean {
  return !line.ledgerId && !line.amount.trim() && !line.remarks.trim();
}

/** A ledger, and an amount above zero. */
export function isSendable(line: VoucherLine): boolean {
  const paise = amountPaise(line.amount);
  return Boolean(line.ledgerId) && Number.isFinite(paise) && paise > 0;
}

/**
 * Exactly one blank line at the bottom — never more, never none. With a
 * `sideOf`, the blank line follows the balance as amounts are typed above it
 * (unless its side was set by hand).
 */
export function withTrailingLine(
  lines: readonly VoucherLine[],
  sideOf?: (lines: readonly VoucherLine[]) => DrCr,
): VoucherLine[] {
  const out = [...lines];
  while (out.length > 1 && isBlankLine(out[out.length - 1]) && isBlankLine(out[out.length - 2])) {
    out.pop();
  }
  if (out.length === 0 || !isBlankLine(out[out.length - 1])) {
    out.push(blankLine(sideOf ? sideOf(out) : "DR"));
    return out;
  }
  const last = out[out.length - 1];
  if (sideOf && !last.sideChosen) {
    const side = sideOf(out.slice(0, -1));
    if (side !== last.drCr) {
      out[out.length - 1] = { ...last, drCr: side };
    }
  }
  return out;
}

/** The side cash / bank must sit on: a receipt's Dr, a payment's Cr. */
export function moneySideOf(nature: string | null | undefined): DrCr | null {
  return nature === "RECEIPT" ? "DR" : nature === "PAYMENT" ? "CR" : null;
}

/** On a receipt or payment, a line with a ledger keeps its side. */
export function sideLocked(line: VoucherLine, nature: string | null | undefined): boolean {
  return Boolean(line.ledgerId) && moneySideOf(nature) !== null;
}

/** Many parties on a side: entered party first. */
function partyFirst(rules: Pick<VoucherTypeRules, "partyMode" | "partySide"> | null): DrCr | null {
  if (!rules || rules.partyMode !== "MANY") {
    return null;
  }
  return rules.partySide === "DR" || rules.partySide === "CR" ? rules.partySide : null;
}

/**
 * Dr − Cr over the sendable lines that the operator balances by hand: a line
 * carrying an instrument brings its own money leg, so it is left out.
 */
export function handDifference(lines: readonly VoucherLine[]): number {
  return linesTotals(lines.filter((line) => !line.instrument)).difference;
}

/**
 * The side a NEW line opens on. Party first (many parties on a side): see
 * above. Otherwise the side the typed lines mostly sit on — the opposite of a
 * one-party type's party (a sale's income lines are credits), else Dr. Only a
 * default: the Dr/Cr cell stays editable.
 */
export function newLineSide(
  lines: readonly VoucherLine[],
  rules: Pick<VoucherTypeRules, "partyMode" | "partySide"> | null,
): DrCr {
  const party = partyFirst(rules);
  if (!party) {
    return rules?.partySide === "DR" ? "CR" : "DR";
  }
  const difference = handDifference(lines);
  if (difference === 0) {
    return party;
  }
  return difference > 0 ? "CR" : "DR";
}

/**
 * A ledger just picked on the side that balances the voucher opens with the
 * difference (the cash line of a receipt after its customers) — overtyped like
 * any amount. Party-first types only; a line already carrying an amount keeps it.
 */
export function balancingAmount(
  lines: readonly VoucherLine[],
  key: string,
  rules: Pick<VoucherTypeRules, "partyMode" | "partySide"> | null,
): string | null {
  if (!partyFirst(rules)) {
    return null;
  }
  const line = lines.find((candidate) => candidate.key === key);
  if (!line || amountPaise(line.amount) > 0) {
    return null;
  }
  const difference = handDifference(lines.filter((candidate) => candidate.key !== key));
  if ((difference > 0 && line.drCr === "CR") || (difference < 0 && line.drCr === "DR")) {
    return paiseText(Math.abs(difference));
  }
  return null;
}

/**
 * A figure typed in the Debit or Credit column. A figure above zero moves the
 * line to that column's side; clearing the line's own column clears the
 * amount; clearing the OTHER column changes nothing. A LOCKED line never
 * changes side: a figure in its other column is put in its own.
 */
export function typeAmount(line: VoucherLine, column: DrCr, text: string, locked = false): VoucherLine {
  const paise = amountPaise(text);
  if (column === line.drCr || locked) {
    return { ...line, amount: text };
  }
  if (!text.trim() || paise === 0) {
    return line;
  }
  return { ...line, drCr: column, amount: text };
}

export type VoucherTotals = {
  debit: number;
  credit: number;
  /** Debit − credit, in paise. Zero = balanced. */
  difference: number;
};

/**
 * Σ of the SENDABLE lines, in paise. A line with an instrument counts on both
 * sides — its money leg is the server's, for the same amount — so the typed
 * preview of a receipt is not lopsided while the server is asked.
 */
export function linesTotals(lines: readonly VoucherLine[]): VoucherTotals {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!isSendable(line)) {
      continue;
    }
    const paise = amountPaise(line.amount);
    if (line.drCr === "DR" || line.instrument) {
      debit += paise;
    }
    if (line.drCr === "CR" || line.instrument) {
      credit += paise;
    }
  }
  return { debit, credit, difference: debit - credit };
}

export type LinesBody = {
  lines: VoucherLineBody[];
  /** `rowNo` → the screen line's key, to put a refusal on the right row. */
  keyOfRow: Map<number, string>;
};

export type LinesShape = {
  /**
   * A GST-band type: the side its tax goes on (opposite the party). A rate is
   * sent only on a line on that side — the server would ADD tax on a
   * party-side line too, never subtract it.
   */
  gstSide?: DrCr | null;
};

/** The sendable lines, numbered 1… in the order they stand. */
export function buildLines(lines: readonly VoucherLine[], shape: LinesShape = {}): LinesBody {
  const out: VoucherLineBody[] = [];
  const keyOfRow = new Map<number, string>();
  for (const line of lines) {
    if (!isSendable(line)) {
      continue;
    }
    const rowNo = out.length + 1;
    keyOfRow.set(rowNo, line.key);
    out.push({
      rowNo,
      drCr: line.drCr,
      ledgerId: line.ledgerId,
      amount: paiseText(amountPaise(line.amount)),
      ...(line.remarks.trim() ? { remarks: line.remarks.trim() } : {}),
      ...(line.tdsBase !== null ? { tdsBase: line.tdsBase } : {}),
      ...(line.instrument?.tenderId ? { instrument: instrumentBody(line.instrument) } : {}),
      ...(shape.gstSide && line.drCr === shape.gstSide && line.taxId
        ? {
            gst: {
              taxId: line.taxId,
              ...(line.hsn.trim() ? { hsn: line.hsn.trim() } : {}),
              ...(line.itcEligibility ? { itcEligibility: line.itcEligibility } : {}),
            },
          }
        : {}),
    });
  }
  return { lines: out, keyOfRow };
}

export type HeaderDraft = {
  voucherId: string | null;
  companyId: string;
  branchId: string;
  accYear: string;
  typeCode: string;
  date: string;
  docRefno: string;
  docDate: string;
  remarks: string;
  /** Collected by / Paid by — a type with instruments only. */
  employeeId: string;
  /** A one-party type's party. */
  partyId: string;
  partyName: string;
  /** Place of supply the operator CHOSE ("" = the server's default). */
  posStcd: string;
  reverseCharge: boolean;
  /** A raised bill's due days, as typed; null = the party's credit days. */
  dueDays: number | null;
};

/** Which of the header's type-bound fields this type sends. */
export type HeaderShape = {
  partyOne?: boolean;
  gstBand?: boolean;
  /** The INPUT side (a purchase): reverse charge is said, either way. */
  gstInput?: boolean;
};

/** The header, with an optional field sent only when it says something. */
export function buildHeader(header: HeaderDraft, shape: HeaderShape = {}): VoucherHeaderBody {
  return {
    ...(header.voucherId ? { voucherId: header.voucherId } : {}),
    companyId: header.companyId,
    branchId: header.branchId,
    accYear: header.accYear,
    typeCode: header.typeCode,
    date: header.date,
    ...(header.docRefno.trim() ? { docRefno: header.docRefno.trim() } : {}),
    ...(header.docDate ? { docDate: header.docDate } : {}),
    ...(header.remarks.trim() ? { remarks: header.remarks.trim() } : {}),
    ...(header.employeeId ? { employeeIds: [header.employeeId] } : {}),
    ...(shape.partyOne && header.partyId ? { partyId: header.partyId } : {}),
    ...(shape.gstBand && header.posStcd ? { posStcd: header.posStcd } : {}),
    ...(shape.gstBand && shape.gstInput ? { reverseCharge: header.reverseCharge } : {}),
  };
}

/** One typed leg of a POSTED (or cancelled) voucher, read back. */
export function lineFromLeg(leg: VoucherLegPayload, instrument: LineInstrument | null = null): VoucherLine {
  return {
    ...blankLine(leg.drCr),
    ledgerId: leg.ledgerId,
    ledgerName: leg.ledgerName ?? "",
    groupName: leg.groupName ?? "",
    amount: paiseText(Math.round((leg.amount ?? 0) * 100)),
    remarks: leg.remarks ?? "",
    instrument,
  };
}

/** A POSTED (or cancelled) voucher's typed legs, read back. */
export function linesFromLegs(legs: readonly VoucherLegPayload[]): VoucherLine[] {
  return legs
    .filter((leg) => !leg.generated)
    .slice()
    .sort((left, right) => left.rowNo - right.rowNo)
    .map((leg) => lineFromLeg(leg));
}

/**
 * A DRAFT's lines, read back from the payload it was saved with. They carry
 * ids only — the names arrive with the first `/validate` (`adoptNames`).
 */
export function linesFromDraft(draft: StoredDraft | null): VoucherLine[] {
  return (draft?.lines ?? [])
    .slice()
    .sort((left, right) => (left.rowNo ?? 0) - (right.rowNo ?? 0))
    .map((line) => {
      const amount = typeof line.amount === "number" ? paiseText(Math.round(line.amount * 100)) : (line.amount ?? "");
      return {
        ...blankLine(line.drCr === "CR" ? "CR" : "DR"),
        ledgerId: line.ledgerId ?? "",
        ledgerName: "",
        groupName: "",
        amount,
        remarks: line.remarks ?? "",
        tdsBase: typeof line.tdsBase === "boolean" ? line.tdsBase : null,
        instrument: line.instrument?.tenderId ? instrumentFromDraft(line.instrument) : null,
        // Read back as saved: the side is what was keyed.
        sideChosen: true,
        taxId: line.gst?.taxId ?? "",
        hsn: line.gst?.hsn ?? "",
        itcEligibility: line.gst?.itcEligibility ?? "",
      };
    });
}

/** The stored rowNo of each draft line, in the order `linesFromDraft` reads them. */
export function draftRowNos(draft: StoredDraft | null): number[] {
  return (draft?.lines ?? [])
    .map((line) => line.rowNo ?? 0)
    .sort((left, right) => left - right);
}

type AdoptableLeg = Pick<DerivedLeg, "lineRowNo" | "ledgerId" | "ledgerName" | "groupName"> &
  Partial<Pick<DerivedLeg, "generated" | "instrument" | "postDated" | "postsOn">>;

/**
 * What `/validate` says of the typed lines, taken onto them: the names a
 * reopened draft lacks (a name the operator already sees is kept), and the
 * server's answer on each instrument — its names, the leaf it would take,
 * whether it is post-dated. The same array comes back when nothing changed.
 */
export function adoptNames(
  lines: readonly VoucherLine[],
  legs: readonly AdoptableLeg[],
  keyOfRow: ReadonlyMap<number, string>,
): VoucherLine[] {
  const byKey = new Map<string, AdoptableLeg>();
  for (const leg of legs) {
    if (leg.lineRowNo === null || leg.generated) {
      continue;
    }
    const key = keyOfRow.get(leg.lineRowNo);
    if (key) {
      byKey.set(key, leg);
    }
  }
  let changed = false;
  const next = lines.map((line) => {
    const leg = byKey.get(line.key);
    if (!leg || leg.ledgerId !== line.ledgerId) {
      return line;
    }
    let out = line;
    if (!line.ledgerName || !line.groupName) {
      out = {
        ...out,
        ledgerName: line.ledgerName || leg.ledgerName,
        groupName: line.groupName || (leg.groupName ?? ""),
      };
    }
    if (line.instrument && leg.instrument) {
      const adopted = adoptDerivedInstrument(line.instrument, leg.instrument, Boolean(leg.postDated), leg.postsOn ?? null);
      if (adopted !== line.instrument) {
        out = { ...out, instrument: adopted };
      }
    }
    if (out !== line) {
      changed = true;
    }
    return out;
  });
  return changed ? next : (lines as VoucherLine[]);
}
