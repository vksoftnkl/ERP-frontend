/**
 * The legs the SERVER adds — drawn under the typed lines, locked, never sent.
 *
 * On a Receipt / Payment Voucher each instrument line brings its money leg
 * (a receipt's Dr to the tender's ledger, a payment's Cr to our bank), and a
 * payment with TDS brings the TDS Payable credit. While a voucher is keyed
 * they come from `/vouchers/validate`; on a posted one, from `/get` — today's
 * voucher's legs, and each post-dated cheque's own voucher (`pdcVouchers`),
 * whose lines are shown amber with the rest so the voucher reads as keyed.
 *
 * Reading a posted voucher back is the Qt `applyLoaded`: `av_row_no` runs
 * 1..n per voucher, so a post-dated line's own number is taken from its
 * instrument (`instruments[].lineRowNo`), and today's typed lines fill the
 * numbers left, in their order. An instrument is tied to its line by that
 * number and the party — never by the leg's position, which the server's own
 * matching relies on and which misses on a voucher mixing lines with and
 * without one. A one-party type's lines take their GST rate, HSN and ITC
 * back from the GST document (`gstDoc.lines`, by the typed leg's position);
 * its party leg is the one generated leg on the header's party.
 */
import type {
  DerivedLeg,
  DerivedPostDated,
  DrCr,
  VoucherInstrumentPayload,
  VoucherLegPayload,
  VoucherPayload,
} from "../vouchers.types";
import { emptyInstrument, instrumentFromPayload, instrumentSummary, type LineInstrument } from "./instruments";
import { lineFromLeg, type VoucherLine } from "./lines";

export type GeneratedRow = {
  key: string;
  drCr: DrCr;
  ledgerName: string;
  groupName: string;
  paise: number;
  /** The leg's role, else its instrument's type. */
  role: string;
  /** Its own narration · where it came from. */
  narration: string;
  instrument: LineInstrument | null;
  postDated: boolean;
  postsOn: string;
};

function dayMonth(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}-${match[2]}` : "";
}

/** Where a generated leg came from — Qt `DerivedLeg::origin`. */
export function legOrigin(source: string, fromRows: readonly number[], postDated: boolean, postsOn: string | null): string {
  switch (source) {
    case "GST":
    case "RCM":
      return "from the GST band";
    case "TDS":
      return "from the party's TDS section";
    case "PARTY":
      return "balances the voucher";
    case "INSTRUMENT": {
      const from = fromRows.length > 0 ? `from line ${fromRows[0]}` : "";
      return postDated ? `${from} — its own voucher, dated ${dayMonth(postsOn)}`.trim() : from;
    }
    default:
      return "";
  }
}

function narrationOf(remarks: string | null | undefined, origin: string): string {
  const own = (remarks ?? "").trim();
  // The party leg's own remark already says it: "Balances the voucher".
  if (own && origin && own.toLowerCase() === origin.toLowerCase()) {
    return own;
  }
  return [own, origin].filter(Boolean).join(" · ");
}

function instrumentOfDerived(leg: DerivedLeg): LineInstrument | null {
  const ins = leg.instrument;
  if (!ins) {
    return null;
  }
  return {
    ...emptyInstrument(),
    tenderId: ins.tenderId,
    tenderName: ins.tenderName,
    typeName: ins.tenderTypeName,
    isCheque: ins.isCheque,
    refNo: ins.issued && ins.isCheque ? "" : (ins.refNo ?? ""),
    instrumentDate: (ins.instrumentDate ?? "").slice(0, 10),
    bankName: ins.bankName ?? "",
    bankLedgerId: ins.issued ? (ins.bankLedgerId ?? "") : "",
    chequeBookId: ins.chequeBookId ?? "",
    bookNo: ins.bookNo ?? "",
    favouring: ins.favouring ?? "",
    acPayee: ins.acPayee,
    nextLeaf: ins.nextLeaf ?? "",
    isPostDated: Boolean(leg.postDated) || ins.isPostDated,
    postsOn: ((leg.postsOn ?? ins.postsOn) || "").slice(0, 10),
  };
}

/** The generated legs of a `/validate` answer. */
export function generatedFromDerived(legs: readonly DerivedLeg[]): GeneratedRow[] {
  return legs
    .filter((leg) => leg.generated)
    .map((leg) => {
      const instrument = instrumentOfDerived(leg);
      const postDated = Boolean(leg.postDated);
      return {
        key: `derived-${leg.rowNo}`,
        drCr: leg.drCr,
        ledgerName: leg.ledgerName,
        groupName: leg.groupName ?? "",
        paise: Math.round(leg.amount * 100),
        role: leg.role || instrument?.typeName || "",
        narration: narrationOf(leg.remarks, legOrigin(leg.source, leg.fromRows ?? [], postDated, leg.postsOn ?? null)),
        instrument,
        postDated,
        postsOn: (leg.postsOn ?? "").slice(0, 10),
      };
    });
}

/** Σ of the post-dated lines, in paise — "post-dated X later". */
export function postDatedPaise(postDated: readonly DerivedPostDated[] | undefined): number {
  return (postDated ?? []).reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0);
}

export type PostDatedNote = {
  /** The screen line's number. */
  lineNo: number;
  partyName: string;
  paise: number;
  postsOn: string;
  refNo: string;
  voucherRefno: string;
};

export type PostedRead = {
  lines: VoucherLine[];
  generated: GeneratedRow[];
  postDated: PostDatedNote[];
};

/** Where a posted generated leg came from — `/get` keeps no source, so it is read off the role. */
function sourceOfPosted(leg: VoucherLegPayload, instrument: LineInstrument | null, partyId: string | null): string {
  const role = leg.role ?? "";
  if (role === "TDS_PAYABLE") return "TDS";
  if (role.startsWith("RCM_")) return "RCM";
  if (role.startsWith("INPUT_") || role.startsWith("OUTPUT_")) return "GST";
  if (instrument) return "INSTRUMENT";
  if (partyId && leg.ledgerId === partyId) return "PARTY";
  return "";
}

function generatedOfPayload(
  leg: VoucherLegPayload,
  key: string,
  instrument: LineInstrument | null,
  fromLine: number | null,
  postDated: boolean,
  postsOn: string,
  partyId: string | null = null,
): GeneratedRow {
  const source = sourceOfPosted(leg, instrument, partyId);
  return {
    key,
    drCr: leg.drCr,
    ledgerName: leg.ledgerName ?? "",
    groupName: leg.groupName ?? "",
    paise: Math.round((leg.amount ?? 0) * 100),
    role: leg.role || instrument?.typeName || "",
    narration: narrationOf(leg.remarks, legOrigin(source, fromLine ? [fromLine] : [], postDated, postsOn || null)),
    instrument,
    postDated,
    postsOn,
  };
}

/**
 * A POSTED (or cancelled) voucher, read back whole: the typed lines with
 * their instruments, the generated legs, and the post-dated cheques' own
 * vouchers folded in where their lines were keyed.
 */
export function readPosted(payload: VoucherPayload): PostedRead {
  const voucherId = payload.header.voucherId;
  const partyId = payload.header.partyId ?? null;
  const gstByRow = new Map((payload.gstDoc?.lines ?? []).map((line) => [line.rowNo, line]));
  const instruments: VoucherInstrumentPayload[] = (payload.instruments ?? [])
    .slice()
    .sort((left, right) => left.lineRowNo - right.lineRowNo);
  const today = instruments.filter((ins) => !ins.isPostDated && (!ins.voucherId || ins.voucherId === voucherId));

  type Placed = { lineNo: number | null; order: number; line: VoucherLine };
  const placed: Placed[] = [];
  const generated: GeneratedRow[] = [];
  const pdcNotes: Array<{ partyKey: string; note: PostDatedNote }> = [];

  // Today's typed legs, each with the instrument of its party, in line order.
  const typed = (payload.legs ?? [])
    .filter((leg) => !leg.generated)
    .slice()
    .sort((left, right) => left.rowNo - right.rowNo);
  const unmatched = [...today];
  typed.forEach((leg, order) => {
    const at = unmatched.findIndex((ins) => ins.partyId === leg.ledgerId);
    const ins = at >= 0 ? unmatched.splice(at, 1)[0] : null;
    const instrument = ins ? instrumentFromPayload(ins) : leg.instrument ? instrumentFromPayload(leg.instrument) : null;
    const gst = gstByRow.get(leg.rowNo);
    const line = lineFromLeg(leg, instrument);
    placed.push({
      lineNo: ins?.lineRowNo ?? null,
      order,
      line: gst ? { ...line, taxId: gst.taxId ?? "", hsn: gst.hsn ?? "", itcEligibility: gst.itcEligibility ?? "" } : line,
    });
  });
  for (const leg of payload.legs ?? []) {
    if (!leg.generated) {
      continue;
    }
    const ins = leg.instrument ?? null;
    generated.push(
      generatedOfPayload(leg, `leg-${leg.avId}`, ins ? instrumentFromPayload(ins) : null, ins?.lineRowNo ?? null, false, "", partyId),
    );
  }

  // Each post-dated cheque's own voucher: its party line and its legs, amber.
  const byVoucher = new Map(
    instruments.filter((ins) => ins.isPostDated && ins.voucherId).map((ins) => [ins.voucherId as string, ins]),
  );
  for (const pdc of payload.pdcVouchers ?? []) {
    const ins = byVoucher.get(pdc.voucherId) ?? null;
    const postsOn = (pdc.date ?? "").slice(0, 10);
    const instrument: LineInstrument | null = ins
      ? { ...instrumentFromPayload(ins), isPostDated: true, postsOn, voucherRefno: pdc.voucherRefno ?? "" }
      : null;
    const lineNo = ins?.lineRowNo ?? null;
    let partyPaise = 0;
    let partyKey = "";
    for (const leg of pdc.legs ?? []) {
      if (leg.generated) {
        generated.push(generatedOfPayload(leg, `pdc-${leg.avId}`, leg.role ? null : instrument, lineNo, true, postsOn));
        continue;
      }
      // A cancelled voucher's instruments are gone, and with them the
      // generated flag on its money leg: the party's own leg is the line.
      const line = lineFromLeg(leg, instrument);
      if (leg.ledgerId === pdc.partyId) {
        partyPaise += Math.round((leg.amount ?? 0) * 100);
        partyKey ||= line.key;
      }
      placed.push({ lineNo, order: Number.MAX_SAFE_INTEGER, line });
    }
    pdcNotes.push({
      partyKey,
      note: {
        lineNo: 0,
        partyName: pdc.partyName ?? ins?.partyName ?? "",
        // The instrument's amount is the net cheque; without it, the party's leg.
        paise: ins ? Math.round(ins.amount * 100) : partyPaise,
        postsOn,
        refNo: ins?.refNo || ins?.leaf || "",
        voucherRefno: pdc.voucherRefno ?? "",
      },
    });
  }

  // The numbers the post-dated lines held are theirs; today's fill the rest.
  const taken = new Set(placed.filter((entry) => entry.lineNo !== null).map((entry) => entry.lineNo as number));
  let next = 1;
  for (const entry of placed.filter((candidate) => candidate.lineNo === null).sort((a, b) => a.order - b.order)) {
    while (taken.has(next)) {
      next += 1;
    }
    entry.lineNo = next;
    taken.add(next);
  }
  const lines = placed
    .slice()
    .sort((left, right) => (left.lineNo ?? 0) - (right.lineNo ?? 0) || left.order - right.order)
    .map((entry) => entry.line);
  // A post-dated note names its party's line as it now stands on screen.
  const screenNo = new Map(lines.map((line, index) => [line.key, index + 1]));
  return {
    lines,
    generated,
    postDated: pdcNotes.map(({ partyKey, note }) => ({ ...note, lineNo: screenNo.get(partyKey) ?? 0 })),
  };
}

/** The Instrument cell's text on a generated row. */
export function generatedInstrumentText(row: GeneratedRow): string {
  return row.instrument ? instrumentSummary(row.instrument) : "";
}
