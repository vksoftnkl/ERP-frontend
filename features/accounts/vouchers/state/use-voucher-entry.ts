"use client";

/**
 * The Voucher Register entry screen's state and its jobs — the Qt
 * `VoucherRegisterEntry` with the type fixed: Contra (`Con`), the Receipt
 * Voucher (`RcpV`) and the Payment Voucher (`PmtV`).
 *
 * ── The server works the voucher out ─────────────────────────────────────
 * Every edit restarts a 400 ms timer that sends the typed lines (and, on a
 * bill-wise type, the allocations) to `/vouchers/validate`; the answer —
 * totals, refusals, warnings, the GENERATED legs (an instrument's money leg,
 * a payment's TDS), the advances, the post-dated lines, and the names a
 * reopened draft lacks — is painted only if no later edit has overtaken it
 * (a generation counter drops a stale one). An answer is FRESH while the
 * lines, header and allocations on screen are the ones it was asked about;
 * otherwise the typed sums stand in for it, dimmed. Post asks again, fresh,
 * and shows every refusal and warning before it writes anything.
 *
 * ── Receipt / Payment: many parties, entered party first ─────────────────
 * The parties are on the lines. A new line opens on the party's side while
 * the hand-keyed lines balance, else on the side that balances them; a
 * ledger picked there opens with the difference. A line carrying an
 * instrument balances itself (its money leg is the server's), so it is out
 * of that difference. Once a ledger is picked the line's side follows it.
 *
 * ── Bill-wise, on demand ─────────────────────────────────────────────────
 * Enter on a party line's amount opens the bill-wise popup on the server's
 * party leg (on a payment with TDS, the gross), with the party's open bills
 * read afresh. What it settles is kept per SCREEN line and sent as
 * `allocations[]` under each line's rowNo in that payload; the rest is the
 * server's ADVANCE. `/create` stores the body wholesale, so the allocations
 * are always sent.
 *
 * ── Rights are the TYPE's ────────────────────────────────────────────────
 * `/vouchers/types` returns the caller's rights on the type's own menu, so
 * the verbs are gated on those, and a loaded voucher brings its own.
 *
 * Dialogs are INJECTED (confirm, prompt, the validation list, the bill-wise
 * popup), and anything read after one has answered is read from the ref,
 * never from a value taken before it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "@/lib/notify";
import { useAppDispatch } from "@/store/hooks";
import {
  useCancelVoucherMutation,
  useDeleteVoucherDraftMutation,
  useGetVoucherChequeBooksQuery,
  useGetVoucherInstrumentsQuery,
  useGetVoucherOpenBillsQuery,
  useGetVoucherPartyFactsQuery,
  useGetVoucherTaxRatesQuery,
  useGetVoucherTypesQuery,
  usePostVoucherMutation,
  useSaveVoucherDraftMutation,
  useValidateVoucherMutation,
  vouchersApi,
  type LedgerPickRow,
} from "@/store/api/vouchersApi";
import { chequeError as voucherError } from "@/features/accounts/cheques/api-errors";
import {
  PARTY_KEY,
  billRows,
  billsChip,
  editCardBill,
  billsFromDraft,
  buildAllocations,
  fillOldestFirst,
  picksOf,
  serverAdvanceOf,
  wantsAutoFill,
  type BillRow,
  type LineBills,
} from "../domain/bills";
import { generatedFromDerived, postDatedPaise, readPosted, type GeneratedRow, type PostDatedNote } from "../domain/generated";
import type { LineInstrument } from "../domain/instruments";
import {
  adoptNames,
  amountPaise,
  balancingAmount,
  blankLine,
  buildHeader,
  buildLines,
  draftRowNos,
  formatPaise,
  isBlankLine,
  isSendable,
  linesFromDraft,
  linesTotals,
  newLineSide,
  sideLocked,
  withTrailingLine,
  type HeaderDraft,
  type VoucherLine,
} from "../domain/lines";
import type {
  DrCr,
  GstSummaryRow,
  ValidatePayload,
  VoucherKeys,
  VoucherLocks,
  VoucherPayload,
  VoucherPayloadBody,
  VoucherRefusal,
  VoucherRights,
  VoucherStatus,
  VoucherTypeRules,
  VoucherTypeWithRights,
  VoucherWarning,
} from "../vouchers.types";

const VALIDATE_DELAY_MS = 400;

export type VoucherScope = { companyId: string; branchId: string; accYear: string };

export type VoucherLink = { voucherId: string; accYear: string; refno: string | null };

export type ConfirmAsk = { title: string; message: string; confirmLabel?: string };
export type PromptAsk = { title: string; message: string; placeholder?: string; presets?: readonly string[] };
/** The validation list before a post: resolves to the overrides to send, or null to go back. */
export type ReviewAsk = {
  refusals: VoucherRefusal[];
  warnings: VoucherWarning[];
  canOverride: boolean;
};
/** The bill-wise popup: the line's bills, oldest first, already filled when it should be. */
export type BillwiseAsk = {
  title: string;
  partyName: string;
  /** What the line settles, in paise — the server's party leg (a payment's gross). */
  amount: number;
  /** What was keyed, in paise — differs from `amount` by the TDS. */
  keyed: number;
  /** "Advance (on account)" on DEMAND, else "On account". */
  remainderLabel: string;
  rows: BillRow[];
};
export type BillwiseAnswer = { rows: BillRow[]; handEdited: boolean };

export type UseVoucherEntryOptions = {
  typeCode: string;
  /** The type's own menu; none on the Voucher Register (every type, each with its own rights). */
  menuId?: number;
  scope: VoucherScope;
  appDate: string;
  confirm: (ask: ConfirmAsk) => Promise<boolean>;
  prompt: (ask: PromptAsk) => Promise<string | null>;
  review: (ask: ReviewAsk) => Promise<string[] | null>;
  /** OK is the only way out of it — it always answers. */
  billwise: (ask: BillwiseAsk) => Promise<BillwiseAnswer>;
};

/** A bill a posted voucher settled — the read-only card. */
export type SettledBill = {
  key: string;
  refno: string;
  billType: string;
  date: string;
  paise: number;
  /** On a post-dated cheque's own voucher. */
  postDated: boolean;
};

/** What a posted (or cancelled) voucher shows beyond its typed lines. */
export type PostedRecord = {
  generated: GeneratedRow[];
  postDated: PostDatedNote[];
  settled: SettledBill[];
  /** The bills it raised — an ADVANCE, a SALES / PURCHASE / JOURNAL bill. */
  advances: Array<{
    key: string;
    refno: string;
    billType: string;
    side: DrCr;
    paise: number;
    pendingPaise: number;
    closed: boolean;
  }>;
  tds: string[];
  /** The GST document it wrote, by rate. */
  gst: GstShown | null;
};

/** The GST box: the server's work-out while keying, the stored document once posted. */
export type GstShown = {
  supplyNature: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  rows: Array<Omit<GstSummaryRow, "taxName"> & { taxName: string }>;
  cess: number;
};

type Doc = {
  header: HeaderDraft;
  status: VoucherStatus | "NEW";
  voucherRefno: string | null;
  /** The rules and rights the LOADED voucher came with (a Rev differs). */
  rules: VoucherTypeRules | null;
  rights: VoucherRights | null;
  editable: boolean;
  locks: VoucherLocks | null;
  reversal: VoucherLink | null;
  against: VoucherLink | null;
  cancelReason: string | null;
  /** On a posted voucher, the stored totals. */
  postedTotals: { debit: number; credit: number } | null;
  posted: PostedRecord | null;
};

type Snapshot = { doc: Doc; lines: VoucherLine[]; bills: Record<string, LineBills> };

/** A `/validate` answer, the screen state it was asked about, and how that state was sent. */
type Answered = { answer: ValidatePayload; via: unknown } & Snapshot;

function freshDoc(scope: VoucherScope, typeCode: string, date: string): Doc {
  return {
    header: {
      voucherId: null,
      companyId: scope.companyId,
      branchId: scope.branchId,
      accYear: scope.accYear,
      typeCode,
      date,
      docRefno: "",
      docDate: "",
      remarks: "",
      employeeId: "",
      partyId: "",
      partyName: "",
      posStcd: "",
      reverseCharge: false,
      dueDays: null,
    },
    status: "NEW",
    voucherRefno: null,
    rules: null,
    rights: null,
    editable: true,
    locks: null,
    reversal: null,
    against: null,
    cancelReason: null,
    postedTotals: null,
    posted: null,
  };
}

function keysOfDoc(source: Doc): VoucherKeys | null {
  return source.header.voucherId
    ? {
        companyId: source.header.companyId,
        branchId: source.header.branchId,
        accYear: source.header.accYear,
        voucherId: source.header.voucherId,
      }
    : null;
}

function timeNow(): string {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function dayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}` : iso;
}

const opposite = (side: DrCr): DrCr => (side === "DR" ? "CR" : "DR");

/** A 422's `errors[]` back into refusals, so the same list shows them. */
function refusalsOf(error: unknown): VoucherRefusal[] {
  const data = (error as { data?: { errors?: unknown } }).data;
  if (!data || !Array.isArray(data.errors)) {
    return [];
  }
  return data.errors
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      code: String(entry.code ?? ""),
      message: String(entry.message ?? ""),
      ...(typeof entry.field === "string" ? { field: entry.field } : {}),
      ...(typeof entry.line === "number" ? { line: entry.line } : {}),
    }))
    .filter((entry) => entry.message);
}

/** The read-only extras of a posted voucher. */
function postedGst(payload: VoucherPayload): GstShown | null {
  const doc = payload.gstDoc;
  if (!doc) {
    return null;
  }
  const byRate = new Map<string, GstShown["rows"][number]>();
  for (const line of doc.lines ?? []) {
    const key = line.taxId ?? `rate-${line.ratePerc}`;
    const row = byRate.get(key) ?? {
      taxId: line.taxId ?? "",
      taxName: `GST ${line.ratePerc}%`,
      ratePerc: line.ratePerc,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      lines: [],
    };
    row.taxable += line.taxable;
    row.cgst += line.cgst;
    row.sgst += line.sgst;
    row.igst += line.igst;
    row.cess += line.cess;
    row.lines.push(line.rowNo);
    byRate.set(key, row);
  }
  return {
    supplyNature: doc.supplyNature ?? "",
    placeOfSupply: doc.placeOfSupply ?? "",
    reverseCharge: doc.isReverseCharge,
    rows: [...byRate.values()],
    cess: doc.cess,
  };
}

function postedRecord(payload: VoucherPayload, generated: GeneratedRow[], postDated: PostDatedNote[]): PostedRecord {
  const settled: SettledBill[] = [];
  // A settled pair has a row on the bill this voucher raised too: that half is not "settled".
  const raised = new Set((payload.bills ?? []).map((bill) => bill.ablId));
  const settle = (rows: VoucherPayload["allocations"], onPdc: boolean) => {
    for (const row of rows ?? []) {
      if (row.isReversal || raised.has(row.billId)) {
        continue;
      }
      settled.push({
        key: row.abjId,
        refno: row.billRefno ?? "",
        billType: row.billType ?? "",
        date: (row.adjDate ?? "").slice(0, 10),
        paise: Math.round(row.amount * 100),
        postDated: onPdc,
      });
    }
  };
  settle(payload.allocations, false);
  for (const pdc of payload.pdcVouchers ?? []) {
    settle(pdc.allocations, true);
  }
  return {
    generated,
    postDated,
    settled,
    advances: (payload.bills ?? []).map((bill) => ({
      key: bill.ablId,
      refno: bill.docRefno,
      billType: bill.billType,
      side: bill.side,
      paise: Math.round(bill.billAmount * 100),
      pendingPaise: Math.round(bill.pendingAmount * 100),
      closed: bill.isDeleted,
    })),
    tds: (payload.tds ?? []).map((row) =>
      row.isReversal
        ? `TDS ${row.section} reversed: ${formatPaise(Math.round(row.tax * 100))}`
        : `TDS ${row.section} @ ${row.rate}% on ${formatPaise(Math.round(row.base * 100))} = ${formatPaise(
            Math.round(row.tax * 100),
          )}${row.challanNo ? ` · challan ${row.challanNo}` : ""}`,
    ),
    gst: postedGst(payload),
  };
}

export function useVoucherEntry(options: UseVoucherEntryOptions) {
  const { typeCode, menuId, scope, appDate, confirm, prompt, review, billwise } = options;
  const dispatch = useAppDispatch();

  // ── The type: rules and the caller's rights on its menu ──────────────────
  const typesQuery = useGetVoucherTypesQuery(
    scope.companyId ? { companyId: scope.companyId, ...(menuId !== undefined ? { menuId } : {}) } : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  /** Every type offered here — one on a type's menu, all of them on the register. */
  const types = useMemo(() => typesQuery.data?.data.types ?? [], [typesQuery.data]);
  const type: VoucherTypeWithRights | null = useMemo(
    () => typesQuery.data?.data.types.find((candidate) => candidate.typeCode === typeCode) ?? null,
    [typeCode, typesQuery.data],
  );
  const typesProblem: string | null = typesQuery.isLoading
    ? null
    : typesQuery.error
      ? voucherError(typesQuery.error) || "The voucher types could not be read — the server did not answer."
      : typesQuery.data && !type
        ? typesQuery.data.message?.toLowerCase().includes("no voucher types")
          ? typesQuery.data.message
          : "You have no rights on this voucher type. Ask for them on the rights screen."
        : null;

  // ── The document ──────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<Doc>(() => freshDoc(scope, typeCode, appDate));
  const [lines, setLines] = useState<VoucherLine[]>(() => [blankLine()]);
  const [bills, setBills] = useState<Record<string, LineBills>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");

  const latest = useRef({ doc, lines, bills, dirty });
  useEffect(() => {
    latest.current = { doc, lines, bills, dirty };
  });

  const rules: VoucherTypeRules | null = doc.rules ?? type;
  const rights: VoucherRights | null = doc.rights ?? type?.rights ?? null;
  const isNew = doc.status === "NEW";
  const readOnly = !(isNew || (doc.status === "DRAFT" && doc.editable));
  /** A payment: the parties are debited, the money leaves (Qt `paying()`). */
  const paying = rules?.partySide === "DR";
  const instrumentsOn = Boolean(rules?.instruments);
  /** Many parties on the lines, settled in the bill-wise popup. */
  const billwiseOn = Boolean(rules && rules.partyMode === "MANY" && rules.billwiseMode !== "OFF");
  /** One party on the header (the accounting Sales / Purchase, the notes). */
  const partyOne = rules?.partyMode === "ONE";
  /** …whose bills are set against on the card under the grid. */
  const cardOn = Boolean(partyOne && rules && rules.billwiseMode !== "OFF");
  const raisesBill = rules?.billwiseMode === "RAISE";
  const gstBand = Boolean(rules?.gstRegister);
  const gstInput = rules?.gstSide === "INPUT";
  /** Tax goes on the lines opposite the party. */
  const gstSide: DrCr | null =
    gstBand && (rules?.partySide === "DR" || rules?.partySide === "CR") ? opposite(rules.partySide) : null;
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  });
  const sideOf = useCallback((current: readonly VoucherLine[]) => newLineSide(current, rulesRef.current), []);

  // ── Lookups for instruments ───────────────────────────────────────────────
  const tendersQuery = useGetVoucherInstrumentsQuery(
    instrumentsOn && scope.companyId
      ? { companyId: scope.companyId, branchId: scope.branchId, typeCode }
      : skipToken,
  );
  const tenders = useMemo(() => tendersQuery.data?.tenders ?? [], [tendersQuery.data]);
  const booksQuery = useGetVoucherChequeBooksQuery(
    instrumentsOn && paying && scope.companyId ? { companyId: scope.companyId, branchId: scope.branchId } : skipToken,
  );
  const books = useMemo(() => booksQuery.data?.books ?? [], [booksQuery.data]);
  const refetchBooks = booksQuery.refetch;

  // ── Lookups for a one-party type ──────────────────────────────────────────
  const partyId = doc.header.partyId;
  const factsQuery = useGetVoucherPartyFactsQuery(
    partyOne && partyId && doc.header.date && scope.companyId
      ? { companyId: doc.header.companyId || scope.companyId, partyId, asOn: doc.header.date }
      : skipToken,
  );
  const facts = factsQuery.currentData ?? null;
  const ratesQuery = useGetVoucherTaxRatesQuery(gstBand && scope.companyId ? { companyId: scope.companyId } : skipToken);
  const taxRates = useMemo(() => ratesQuery.data?.rates ?? [], [ratesQuery.data]);
  const cardBillsQuery = useGetVoucherOpenBillsQuery(
    cardOn && partyId && rules && (rules.partySide === "DR" || rules.partySide === "CR")
      ? { companyId: doc.header.companyId || scope.companyId, partyId, side: opposite(rules.partySide) }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const refetchCardBills = cardBillsQuery.refetch;
  /** The raised bill's due days: as typed, else the party's credit days. */
  const dueDays: number | null = doc.header.dueDays ?? (facts ? facts.creditDays : null);

  // ── The live work-out ─────────────────────────────────────────────────────
  const [validate] = useValidateVoucherMutation();
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateProblem, setValidateProblem] = useState<string | null>(null);
  const generation = useRef(0);

  const payloadOf = useCallback(
    (source: Snapshot): { body: VoucherPayloadBody; keyOfRow: Map<number, string> } => {
      const built = buildLines(source.lines, { gstSide });
      return {
        body: {
          header: buildHeader(source.doc.header, { partyOne, gstBand, gstInput }),
          lines: built.lines,
          // `/create` stores the body wholesale: what is not sent is lost.
          ...(billwiseOn || cardOn ? { allocations: buildAllocations(source.bills, built.keyOfRow) } : {}),
          ...(raisesBill && dueDays !== null ? { newBill: { dueDays } } : {}),
        },
        keyOfRow: built.keyOfRow,
      };
    },
    [billwiseOn, cardOn, dueDays, gstBand, gstInput, gstSide, partyOne, raisesBill],
  );

  const sendable = useMemo(() => lines.some(isSendable), [lines]);
  const isFresh = (candidate: Answered | null): candidate is Answered =>
    candidate !== null &&
    candidate.lines === lines &&
    candidate.doc === doc &&
    candidate.bills === bills &&
    candidate.via === payloadOf;

  useEffect(() => {
    if (readOnly || !type) {
      return;
    }
    // Already answered for exactly this state (names just adopted, say).
    if (
      answered &&
      answered.lines === lines &&
      answered.doc === doc &&
      answered.bills === bills &&
      answered.via === payloadOf
    ) {
      return;
    }
    generation.current += 1;
    const mine = generation.current;
    if (!lines.some(isSendable)) {
      // Nothing to work out; what is shown is derived from `sendable` below.
      return;
    }
    const timer = window.setTimeout(() => {
      setValidating(true);
      const asked: Snapshot = { doc, lines, bills };
      const { body, keyOfRow } = payloadOf(asked);
      validate(body)
        .unwrap()
        .then((answer) => {
          if (generation.current !== mine) {
            return;
          }
          // A reopened draft's lines carry ids only; the work-out names them,
          // and says how each instrument came out.
          const named = adoptNames(asked.lines, answer.derived?.legs ?? [], keyOfRow);
          if (named !== asked.lines) {
            setLines(named);
          }
          setAnswered({ answer, doc: asked.doc, lines: named, bills: asked.bills, via: payloadOf });
          setValidateProblem(null);
          setValidating(false);
        })
        .catch((error: unknown) => {
          if (generation.current !== mine) {
            return;
          }
          setValidating(false);
          const status = (error as { status?: unknown }).status;
          setValidateProblem(
            status === 400 || status === 403
              ? voucherError(error)
              : "Figures not refreshed — the server did not answer",
          );
        });
    }, VALIDATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answered, bills, doc, lines, payloadOf, readOnly, type, validate]);

  // With no complete line there is nothing to work out, and nothing worked
  // out is shown — whatever the last answer was.
  const shownAnswer = sendable && answered ? answered.answer : null;
  const fresh = sendable && isFresh(answered) && !validating;
  const shownValidating = sendable && validating;
  const shownProblem = sendable ? validateProblem : null;

  /** rowNo in the current payload → screen line key, and back. */
  const rows = useMemo(() => {
    const { keyOfRow } = buildLines(lines);
    const rowOfKey = new Map<string, number>();
    for (const [rowNo, key] of keyOfRow) {
      rowOfKey.set(key, rowNo);
    }
    const screenNo = new Map(lines.map((line, index) => [line.key, index + 1]));
    return { keyOfRow, rowOfKey, screenNo };
  }, [lines]);

  /** Which screen line a refusal or warning is about. */
  const lineProblems = useMemo(() => {
    const out = new Map<string, string>();
    if (!shownAnswer) {
      return out;
    }
    for (const entry of [...shownAnswer.refusals, ...shownAnswer.warnings]) {
      if (entry.line === undefined) {
        continue;
      }
      const key = rows.keyOfRow.get(entry.line);
      if (key && !out.has(key)) {
        out.set(key, entry.message);
      }
    }
    return out;
  }, [shownAnswer, rows]);

  /** What a party line settles: the server's party leg (a payment's gross), else what was keyed. */
  const settleOf = useCallback(
    (line: VoucherLine, answer: ValidatePayload | null): number => {
      const rowNo = rows.rowOfKey.get(line.key);
      const leg = answer?.derived.legs.find(
        (candidate) => !candidate.generated && candidate.lineRowNo === rowNo && candidate.ledgerId === line.ledgerId,
      );
      return leg ? Math.round(leg.amount * 100) : amountPaise(line.amount);
    },
    [rows],
  );

  /** Per typed line: "net of TDS", the amount's tooltip, and the bill-wise chip. */
  const lineNotes = useMemo(() => {
    const out = new Map<string, { role: string; amountTitle: string; chip: string }>();
    for (const line of lines) {
      if (!isSendable(line)) {
        continue;
      }
      let role = "";
      let amountTitle = "";
      if (fresh && shownAnswer) {
        const keyed = amountPaise(line.amount);
        const leg = settleOf(line, shownAnswer);
        if (leg !== keyed) {
          role = "net of TDS";
          amountTitle = `Keyed ${formatPaise(keyed)} net; the party is ${line.drCr === "DR" ? "debited" : "credited"} ${formatPaise(leg)} with its TDS.`;
        }
      }
      let chip = "";
      if (billwiseOn) {
        const kept = bills[line.key];
        const rowNo = rows.rowOfKey.get(line.key) ?? 0;
        // Only DEMAND keeps the rest as an ADVANCE; on OPTIONAL it stays open (or nowhere).
        const serverAdvance =
          fresh && shownAnswer && rules?.billwiseMode === "DEMAND"
            ? (serverAdvanceOf(shownAnswer.derived.bills, rowNo) ?? 0)
            : null;
        const party = line.flags
          ? line.flags.isParty || line.flags.isBillByBill
          : Boolean(kept?.picks.length) || (serverAdvance ?? 0) > 0;
        if (party) {
          chip = billsChip(
            kept,
            settleOf(line, fresh ? shownAnswer : null),
            serverAdvance,
            rules?.billwiseMode === "DEMAND" ? "adv" : "on a/c",
            formatPaise,
          );
        }
      }
      if (role || amountTitle || chip) {
        out.set(line.key, { role, amountTitle, chip });
      }
    }
    return out;
  }, [bills, billwiseOn, fresh, lines, rows, rules?.billwiseMode, settleOf, shownAnswer]);

  /** The GST box: the server's work-out while keying, the stored document once posted. */
  const gstShown: GstShown | null = useMemo(() => {
    if (readOnly) {
      const posted = doc.posted?.gst ?? null;
      if (!posted) {
        return null;
      }
      // The stored document has no rate names: the rate master has them.
      return {
        ...posted,
        rows: posted.rows.map((row) => ({
          ...row,
          taxName: taxRates.find((rate) => rate.taxId === row.taxId)?.name ?? row.taxName,
        })),
      };
    }
    const gst = shownAnswer?.derived.gst;
    return gst
      ? {
          supplyNature: gst.supplyNature,
          placeOfSupply: gst.placeOfSupply,
          reverseCharge: gst.reverseCharge,
          rows: gst.rows,
          cess: gst.cess,
        }
      : null;
  }, [doc.posted, readOnly, shownAnswer, taxRates]);

  /** The bill the voucher raises, as the server worked it out. */
  const raisedBill = useMemo(
    () => shownAnswer?.derived.bills?.find((bill) => !bill.isAdvance && bill.lineRowNo === 0) ?? null,
    [shownAnswer],
  );

  /** The TDS each party bears — or why none is deducted. */
  const tdsNotes = useMemo(() => {
    if (readOnly) {
      return doc.posted?.tds ?? [];
    }
    return (shownAnswer?.derived.tdsLines ?? []).map((entry) => {
      // A one-party type's deductee is the header's party: no line to name.
      let who = entry.partyName;
      if (entry.lineRowNo !== null && entry.lineRowNo > 0) {
        const key = rows.keyOfRow.get(entry.lineRowNo);
        who = `line ${key ? (rows.screenNo.get(key) ?? entry.lineRowNo) : entry.lineRowNo} · ${entry.partyName}`;
      }
      return entry.deducted
        ? `TDS ${entry.section} @ ${entry.rate}% on ${formatPaise(Math.round(entry.base * 100))} = ${formatPaise(
            Math.round(entry.tax * 100),
          )} (${who})`
        : `TDS ${entry.section} not deducted (${who}): ${entry.reason ?? ""}`.trim();
    });
  }, [doc.posted, readOnly, rows, shownAnswer]);

  /** The server's own legs, under the typed ones. */
  const generated: GeneratedRow[] = useMemo(() => {
    if (readOnly) {
      return doc.posted?.generated ?? [];
    }
    return shownAnswer ? generatedFromDerived(shownAnswer.derived.legs) : [];
  }, [doc.posted, readOnly, shownAnswer]);

  /** "Post-dated, own voucher on dd-MM: party amount (cheque n)". */
  const postDatedNotes = useMemo(() => {
    const notes: PostDatedNote[] = readOnly
      ? (doc.posted?.postDated ?? [])
      : (shownAnswer?.derived.postDated ?? []).map((entry) => {
          const key = rows.keyOfRow.get(entry.lineRowNo);
          return {
            lineNo: key ? (rows.screenNo.get(key) ?? entry.lineRowNo) : entry.lineRowNo,
            partyName: entry.partyName,
            paise: Math.round(entry.amount * 100),
            postsOn: entry.postsOn,
            refNo: entry.refNo ?? "",
            voucherRefno: "",
          };
        });
    return notes.map(
      (entry) =>
        `Post-dated, own voucher on ${dayMonth(entry.postsOn)}${entry.voucherRefno ? ` (${entry.voucherRefno})` : ""}: ${
          entry.partyName
        } ${formatPaise(entry.paise)}${entry.refNo ? ` (cheque ${entry.refNo})` : ""}`,
    );
  }, [doc.posted, readOnly, rows, shownAnswer]);

  // ── Totals: the server's when fresh, the typed ones (dimmed) meanwhile ────
  const localTotals = useMemo(() => linesTotals(lines), [lines]);
  const totals = useMemo(() => {
    if (doc.postedTotals) {
      const debit = Math.round(doc.postedTotals.debit * 100);
      const credit = Math.round(doc.postedTotals.credit * 100);
      const later = (doc.posted?.postDated ?? []).reduce((sum, entry) => sum + entry.paise, 0);
      return { debit, credit, difference: debit - credit, fresh: true, later };
    }
    if (fresh && shownAnswer && !shownProblem) {
      const debit = Math.round(shownAnswer.derived.totals.debit * 100);
      const credit = Math.round(shownAnswer.derived.totals.credit * 100);
      return { debit, credit, difference: debit - credit, fresh: true, later: postDatedPaise(shownAnswer.derived.postDated) };
    }
    return { ...localTotals, fresh: !sendable, later: 0 };
  }, [doc.posted, doc.postedTotals, fresh, localTotals, sendable, shownAnswer, shownProblem]);

  // ── Editing ───────────────────────────────────────────────────────────────
  const touch = useCallback(() => {
    setDirty(true);
    setNote("");
  }, []);

  const setHeader = useCallback(
    (patch: Partial<HeaderDraft>) => {
      if (readOnly) {
        return;
      }
      setDoc((current) => ({ ...current, header: { ...current.header, ...patch } }));
      touch();
    },
    [readOnly, touch],
  );

  const updateLine = useCallback(
    (key: string, change: (line: VoucherLine) => VoucherLine) => {
      if (readOnly) {
        return;
      }
      setLines((current) => withTrailingLine(current.map((line) => (line.key === key ? change(line) : line)), sideOf));
      touch();
    },
    [readOnly, sideOf, touch],
  );

  /** Dr/Cr set by hand — refused once a receipt / payment line has its ledger. */
  const setSide = useCallback(
    (key: string, side: DrCr): string | null => {
      const line = latest.current.lines.find((candidate) => candidate.key === key);
      if (!line || readOnly) {
        return null;
      }
      if (sideLocked(line, rulesRef.current?.nature)) {
        return "On a receipt or payment the side follows the ledger. Remove the line (−) to put another ledger on the other side.";
      }
      updateLine(key, (row) => ({ ...row, drCr: side, sideChosen: true }));
      return null;
    },
    [readOnly, updateLine],
  );

  /**
   * A ledger picked on a line. Another party: the old one's bills go with it.
   * On the side that balances a party-first voucher, it opens with the
   * difference. Returns the line's side, where the cursor goes next.
   */
  const pickLedger = useCallback(
    (key: string, ledger: LedgerPickRow): DrCr | null => {
      const line = latest.current.lines.find((candidate) => candidate.key === key);
      if (!line || readOnly) {
        return null;
      }
      setLines((current) => {
        const next = current.map((row) =>
          row.key === key
            ? {
                ...row,
                ledgerId: ledger.ledId,
                ledgerName: ledger.name,
                groupName: ledger.groupName,
                flags: {
                  isParty: ledger.isParty,
                  isBillByBill: ledger.isBillByBill,
                  isTdsApplicable: ledger.isTdsApplicable,
                },
                // The ledger's own rate, only where the line has none of its own.
                taxId: rulesRef.current?.gstRegister && !row.taxId ? (ledger.defaultTaxId ?? "") : row.taxId,
              }
            : row,
        );
        const amount = balancingAmount(next, key, rulesRef.current);
        return withTrailingLine(
          amount ? next.map((row) => (row.key === key ? { ...row, amount } : row)) : next,
          sideOf,
        );
      });
      if (line.ledgerId !== ledger.ledId) {
        setBills((current) => {
          if (!current[key]) {
            return current;
          }
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
      touch();
      return line.drCr;
    },
    [readOnly, sideOf, touch],
  );

  const setTdsBase = useCallback(
    (key: string, value: boolean | null) => updateLine(key, (line) => ({ ...line, tdsBase: value })),
    [updateLine],
  );

  /**
   * A one-party type's party. Another party: the card's figures go with the
   * old one (its bills are re-read for the new), and the due days follow the
   * new party's credit days unless typed.
   */
  const setParty = useCallback(
    (id: string, name: string) => {
      if (readOnly) {
        return;
      }
      setDoc((current) =>
        current.header.partyId === id
          ? current
          : { ...current, header: { ...current.header, partyId: id, partyName: name } },
      );
      setBills((kept) => {
        if (!kept[PARTY_KEY]) {
          return kept;
        }
        const next = { ...kept };
        delete next[PARTY_KEY];
        return next;
      });
      touch();
    },
    [readOnly, touch],
  );

  /** The card's figure against one bill (index into `cardRows`). */
  const setCardFigure = useCallback(
    (rowsNow: readonly BillRow[], index: number, text: string) => {
      if (readOnly) {
        return;
      }
      const next = editCardBill(rowsNow, index, text);
      setBills((kept) => ({ ...kept, [PARTY_KEY]: { picks: picksOf(next), auto: false } }));
      touch();
    },
    [readOnly, touch],
  );

  /** The ITC class on every typed line at one GST rate (payload rowNos). */
  const setItcForRows = useCallback(
    (rowNos: readonly number[], value: string) => {
      if (readOnly || !value) {
        return;
      }
      const keys = new Set(rowNos.map((rowNo) => rows.keyOfRow.get(rowNo)).filter((key): key is string => Boolean(key)));
      setLines((current) => current.map((line) => (keys.has(line.key) ? { ...line, itcEligibility: value } : line)));
      touch();
    },
    [readOnly, rows, touch],
  );

  /** Why the Instrument cell cannot open on this line — or null when it can. */
  const instrumentBlock = useCallback(
    (key: string): string | null => {
      const current = rulesRef.current;
      const line = latest.current.lines.find((candidate) => candidate.key === key);
      if (!current?.instruments || !line || readOnly) {
        return readOnly ? "This voucher is read-only." : null;
      }
      const who = current.partySide === "DR" ? "supplier" : "customer";
      if (!line.ledgerId) {
        return `Pick the ${who} first.`;
      }
      // The server refuses anything else (VCH_INSTRUMENT_NOT_ALLOWED).
      if ((current.partySide === "DR" || current.partySide === "CR") && line.drCr !== current.partySide) {
        return `An instrument goes on a ${who} line.`;
      }
      if (tenders.length === 0) {
        return tendersQuery.isFetching
          ? "The instrument list is still being read."
          : "The instrument list has not loaded — the server did not answer.";
      }
      return null;
    },
    [readOnly, tenders.length, tendersQuery.isFetching],
  );

  const setInstrument = useCallback(
    (key: string, instrument: LineInstrument | null) => updateLine(key, (line) => ({ ...line, instrument })),
    [updateLine],
  );

  const insertLineAfter = useCallback(
    (key: string | null): string | null => {
      if (readOnly) {
        return null;
      }
      const fresh = blankLine(newLineSide(latest.current.lines, rulesRef.current));
      setLines((current) => {
        const at = key ? current.findIndex((line) => line.key === key) : current.length - 1;
        const next = [...current];
        next.splice(at < 0 ? next.length : at + 1, 0, fresh);
        return withTrailingLine(next, sideOf);
      });
      return fresh.key;
    },
    [readOnly, sideOf],
  );

  const removeLine = useCallback(
    async (key: string) => {
      if (readOnly) {
        return;
      }
      const current = latest.current.lines;
      const index = current.findIndex((line) => line.key === key);
      const line = current[index];
      // The trailing blank line is the place a new line is typed — never removed.
      if (!line || index === current.length - 1) {
        return;
      }
      const blank = !line.ledgerId && !line.amount.trim() && !line.remarks.trim();
      if (!blank) {
        const ok = await confirm({
          title: "Remove Line",
          message: `Remove line ${index + 1}${line.ledgerName ? ` "${line.ledgerName}"` : ""}?`,
          confirmLabel: "Remove",
        });
        if (!ok) {
          return;
        }
      }
      setLines((rows) => withTrailingLine(rows.filter((row) => row.key !== key), sideOf));
      setBills((kept) => {
        if (!kept[key]) {
          return kept;
        }
        const next = { ...kept };
        delete next[key];
        return next;
      });
      touch();
    },
    [confirm, readOnly, sideOf, touch],
  );

  // ── Bill-wise ─────────────────────────────────────────────────────────────
  /** A party line of a bill-wise type — an unknown ledger (a draft's) is tried. */
  const wantsBillwise = useCallback(
    (line: VoucherLine | undefined): line is VoucherLine =>
      Boolean(
        line &&
          billwiseOn &&
          !readOnly &&
          isSendable(line) &&
          (line.flags ? line.flags.isParty || line.flags.isBillByBill : true),
      ),
    [billwiseOn, readOnly],
  );

  const billwiseOpen = useRef(false);
  /**
   * The popup, once the line's bills are in AND the server has answered for
   * the line as it stands (so a payment's gross is known). Resolves true when
   * it was shown; a party with no open bills shows nothing — the whole line
   * is then on account.
   */
  const requestBillwise = useCallback(
    async (key: string): Promise<boolean> => {
      const asked: Snapshot = { ...latest.current };
      const line = asked.lines.find((candidate) => candidate.key === key);
      if (!wantsBillwise(line) || billwiseOpen.current || !rulesRef.current) {
        return false;
      }
      billwiseOpen.current = true;
      try {
        const { body, keyOfRow } = payloadOf(asked);
        const rowNo = [...keyOfRow.entries()].find(([, rowKey]) => rowKey === key)?.[0];
        const [answer, open] = await Promise.all([
          validate(body)
            .unwrap()
            .catch(() => null),
          dispatch(
            vouchersApi.endpoints.getVoucherOpenBills.initiate(
              { companyId: asked.doc.header.companyId, partyId: line.ledgerId, side: opposite(line.drCr) },
              { subscribe: false, forceRefetch: true },
            ),
          ).unwrap(),
        ]);
        const now = latest.current;
        if (answer && now.lines === asked.lines && now.doc === asked.doc && now.bills === asked.bills) {
          generation.current += 1;
          setValidating(false);
          setAnswered({ answer, doc: asked.doc, lines: asked.lines, bills: asked.bills, via: payloadOf });
        }
        const leg = answer?.derived.legs.find(
          (candidate) => !candidate.generated && candidate.lineRowNo === rowNo && candidate.ledgerId === line.ledgerId,
        );
        const amount = leg ? Math.round(leg.amount * 100) : amountPaise(line.amount);
        if (open.bills.length === 0) {
          return false;
        }
        const kept = asked.bills[key];
        const base = billRows(open.bills, kept?.picks ?? []);
        const lineNo = asked.lines.findIndex((candidate) => candidate.key === key) + 1;
        const result = await billwise({
          title: `Bill-wise — line ${lineNo}`,
          partyName: line.ledgerName,
          amount,
          keyed: amountPaise(line.amount),
          remainderLabel: rulesRef.current.billwiseMode === "DEMAND" ? "Advance (on account)" : "On account",
          rows: wantsAutoFill(kept, amount) ? fillOldestFirst(base, amount) : base,
        });
        // The line may have gone, or changed party, while the popup was up.
        if (!latest.current.lines.some((candidate) => candidate.key === key && candidate.ledgerId === line.ledgerId)) {
          return true;
        }
        setBills((current) => ({ ...current, [key]: { picks: picksOf(result.rows), auto: !result.handEdited } }));
        touch();
        return true;
      } catch (error) {
        toast.error(voucherError(error));
        return false;
      } finally {
        billwiseOpen.current = false;
      }
    },
    [billwise, dispatch, payloadOf, touch, validate, wantsBillwise],
  );

  /** The card: the party's open bills on the side its leg settles, with this voucher's figures. */
  const cardRows: BillRow[] = useMemo(
    () => (cardOn && partyId ? billRows(cardBillsQuery.currentData?.bills ?? [], bills[PARTY_KEY]?.picks ?? []) : []),
    [bills, cardBillsQuery.currentData, cardOn, partyId],
  );

  /** "Credit 30 day(s) · TDS 194C 2% (from the party master) · Tamil Nadu · outstanding 1,000.00 Dr" */
  const factsLine: string = !partyOne || !partyId
    ? ""
    : factsQuery.error
      ? voucherError(factsQuery.error)
      : !facts
        ? "reading the party…"
        : [
            `Credit ${facts.creditDays} day${facts.creditDays === 1 ? "" : "s"}`,
            facts.tds?.applicable
              ? `TDS ${facts.tds.section ?? ""} ${facts.tds.rate ?? ""}% (${
                  facts.tds.rateSource === "NO_PAN" ? "no PAN — 206AA" : "from the party master"
                })`
              : "",
            facts.stateName ?? "",
            `outstanding ${formatPaise(Math.round(Math.abs(facts.outstanding.amount) * 100))} ${
              facts.outstanding.side === "CR" ? "Cr" : "Dr"
            }`,
          ]
            .filter(Boolean)
            .join(" · ");

  /** The TDS column: a deducting type — per line on many parties, else when the party is TDS-applicable. */
  const tdsColumn = rules?.tdsMode === "DEDUCT" && (rules.partyMode === "MANY" || Boolean(facts?.tds?.applicable));

  // ── Documents ─────────────────────────────────────────────────────────────
  const resetTo = useCallback(
    (date: string, employeeId = "", party: { id: string; name: string } | null = null) => {
      generation.current += 1;
      const next = freshDoc(scope, typeCode, date);
      next.header.employeeId = employeeId;
      if (party) {
        next.header.partyId = party.id;
        next.header.partyName = party.name;
      }
      setDoc(next);
      setLines([blankLine(newLineSide([], rulesRef.current))]);
      setBills({});
      setAnswered(null);
      setValidateProblem(null);
      setValidating(false);
      setDirty(false);
    },
    [scope, typeCode],
  );

  // The first blank line opens on the type's side once the rules are known
  // (adjusted while rendering, as React has it for state that follows a prop).
  const [sidedFor, setSidedFor] = useState<VoucherTypeRules | null>(null);
  if (rules && rules !== sidedFor) {
    setSidedFor(rules);
    if (!readOnly && lines.length === 1 && isBlankLine(lines[0]) && !lines[0].sideChosen) {
      const side = newLineSide([], rules);
      if (side !== lines[0].drCr) {
        setLines([{ ...lines[0], drCr: side }]);
      }
    }
  }

  const confirmDiscard = useCallback(
    async (title: string) => {
      if (!latest.current.dirty) {
        return true;
      }
      return confirm({
        title,
        message: "Nothing has been posted. Discard what is keyed?",
        confirmLabel: "Discard",
      });
    },
    [confirm],
  );

  const newDocument = useCallback(async () => {
    if (!(await confirmDiscard("New voucher"))) {
      return;
    }
    resetTo(appDate);
    setNote("");
  }, [appDate, confirmDiscard, resetTo]);

  const load = useCallback(
    async (keys: VoucherKeys) => {
      setBusy(true);
      try {
        const payload = await dispatch(
          vouchersApi.endpoints.getVoucher.initiate(keys, { subscribe: false, forceRefetch: true }),
        ).unwrap();
        const header = payload.header;
        const isDraft = header.status === "DRAFT";
        const draftHeader = payload.draft?.header;
        generation.current += 1;

        let nextLines: VoucherLine[];
        let nextBills: Record<string, LineBills> = {};
        let posted: PostedRecord | null = null;
        if (isDraft) {
          nextLines = linesFromDraft(payload.draft);
          const rowNos = draftRowNos(payload.draft);
          nextBills = billsFromDraft(
            payload.draft,
            new Map(nextLines.map((line, index) => [rowNos[index] ?? index + 1, line.key])),
          );
        } else {
          const read = readPosted(payload);
          nextLines = read.lines;
          posted = postedRecord(payload, read.generated, read.postDated);
        }

        setDoc({
          header: {
            voucherId: header.voucherId,
            companyId: header.companyId,
            branchId: header.branchId,
            accYear: header.accYear,
            typeCode: header.typeCode,
            date: (header.date ?? "").slice(0, 10),
            docRefno: header.docRefno ?? "",
            docDate: (header.docDate ?? "").slice(0, 10),
            remarks: header.remarks ?? "",
            // `/get` does not return it; a draft's stored payload does.
            employeeId: draftHeader?.employeeIds?.[0] ?? "",
            partyId: header.partyId ?? draftHeader?.partyId ?? "",
            partyName: header.partyName ?? "",
            posStcd: isDraft ? (draftHeader?.posStcd ?? "") : (payload.gstDoc?.placeOfSupply ?? ""),
            reverseCharge: isDraft ? draftHeader?.reverseCharge === true : payload.gstDoc?.isReverseCharge === true,
            dueDays: isDraft && typeof payload.draft?.newBill?.dueDays === "number" ? payload.draft.newBill.dueDays : null,
          },
          status: header.status,
          voucherRefno: header.voucherRefno,
          rules: payload.rules,
          rights: payload.rights,
          editable: payload.locks?.editable === true,
          locks: payload.locks ?? null,
          reversal: header.reversalVoucherId
            ? { voucherId: header.reversalVoucherId, accYear: header.reversalAccYear ?? header.accYear, refno: header.reversalRefno }
            : null,
          against: header.againstVoucherId
            ? { voucherId: header.againstVoucherId, accYear: header.againstAccYear ?? header.accYear, refno: header.againstRefno }
            : null,
          cancelReason: header.cancelReason,
          postedTotals: isDraft ? null : { debit: header.totalDebit, credit: header.totalCredit },
          posted,
        });
        setLines(
          isDraft && payload.locks?.editable
            ? withTrailingLine(nextLines, (current) => newLineSide(current, payload.rules))
            : nextLines.length
              ? nextLines
              : [blankLine()],
        );
        setBills(nextBills);
        setAnswered(null);
        setValidateProblem(null);
        setDirty(false);
        setNote("");
      } catch (error) {
        toast.error(voucherError(error));
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  // ── Save draft ────────────────────────────────────────────────────────────
  const [saveDraftMutation] = useSaveVoucherDraftMutation();
  const canSaveDraft =
    Boolean(type) &&
    !readOnly &&
    (isNew || doc.status === "DRAFT") &&
    sendable &&
    !(partyOne && !doc.header.partyId) &&
    Boolean(isNew ? rights?.create : rights?.edit);

  const saveDraft = useCallback(async () => {
    if (!canSaveDraft || busy) {
      return;
    }
    const { body } = payloadOf(latest.current);
    setBusy(true);
    try {
      // `/create` never takes overrides.
      const result = await saveDraftMutation({
        header: body.header,
        lines: body.lines,
        ...(body.allocations ? { allocations: body.allocations } : {}),
      }).unwrap();
      setDoc((current) => ({
        ...current,
        header: { ...current.header, voucherId: result.data.voucherId },
        status: "DRAFT",
        editable: true,
      }));
      setDirty(false);
      setNote(`Draft saved ${timeNow()}.`);
    } catch (error) {
      toast.error(voucherError(error));
    } finally {
      setBusy(false);
    }
  }, [busy, canSaveDraft, payloadOf, saveDraftMutation]);

  /** The card's bills moved with the post. */
  const refetchCardBillsSafe = useCallback(async () => {
    if (cardOn && latest.current.doc.header.partyId) {
      try {
        await refetchCardBills();
      } catch {
        // The query may not have started; the next party pick reads them.
      }
    }
  }, [cardOn, refetchCardBills]);

  // ── Save (post) ───────────────────────────────────────────────────────────
  const [postMutation] = usePostVoucherMutation();
  const postBlock: string | null = !type
    ? "Pick a voucher type."
    : readOnly
      ? "This voucher is not open for posting."
      : !rights?.post
        ? `You have no Post right on ${type.typeName}.`
        : isNew && !rights?.create
          ? `You have no Create right on ${type.typeName}.`
          : partyOne && !doc.header.partyId
            ? "Pick the party first."
            : !sendable
              ? "Type at least one line."
              : null;

  const post = useCallback(async () => {
    if (postBlock || busy || !type) {
      return;
    }
    setBusy(true);
    try {
      const asked: Snapshot = { ...latest.current };
      const { body } = payloadOf(asked);
      // Asked fresh: the figures on screen may be a moment old.
      const answer = await validate(body).unwrap();
      generation.current += 1;
      setValidating(false);
      setAnswered({ answer, doc: asked.doc, lines: asked.lines, bills: asked.bills, via: payloadOf });
      let overrides: string[] = [];
      if (answer.refusals.length > 0 || answer.warnings.length > 0) {
        const chosen = await review({
          refusals: answer.refusals,
          warnings: answer.warnings,
          canOverride: Boolean(rights?.override),
        });
        if (chosen === null || answer.refusals.length > 0) {
          return;
        }
        overrides = chosen;
      }
      const result = await postMutation({
        ...payloadOf(latest.current).body,
        ...(overrides.length > 0 ? { overrides } : {}),
      }).unwrap();
      const pdc = result.data.pdcVouchers?.length ?? 0;
      toast.success(
        `Posted ${result.data.header?.voucherRefno ?? ""}${
          pdc > 0 ? ` — and ${pdc} post-dated cheque${pdc === 1 ? "" : "s"} on vouchers of their own` : ""
        }.`,
      );
      // A new voucher, on the same day, by the same hand — the next one is usually keyed at once.
      const posted = latest.current.doc.header;
      resetTo(
        posted.date || appDate,
        posted.employeeId,
        // The next one is usually for the same party, the same day.
        rulesRef.current?.partyMode === "ONE" && posted.partyId ? { id: posted.partyId, name: posted.partyName } : null,
      );
      void refetchCardBillsSafe();
      if (instrumentsOn && paying) {
        // The books' next leaves have moved.
        void refetchBooks();
      }
    } catch (error) {
      const refusals = refusalsOf(error);
      const status = (error as { status?: unknown }).status;
      if ((status === 422 || status === 409) && refusals.length > 0) {
        await review({ refusals, warnings: [], canOverride: false });
      } else {
        toast.error(voucherError(error));
      }
    } finally {
      setBusy(false);
    }
  }, [appDate, busy, instrumentsOn, paying, payloadOf, postBlock, postMutation, refetchBooks, refetchCardBillsSafe, resetTo, review, rights, type, validate]);

  // ── Cancel and delete ─────────────────────────────────────────────────────
  const [cancelMutation] = useCancelVoucherMutation();
  const [deleteMutation] = useDeleteVoucherDraftMutation();

  /** Why Cancel is refused before it is asked — the server says the same. */
  const cancelBlock: string | null =
    doc.status !== "POSTED"
      ? null
      : doc.against
        ? doc.header.typeCode === typeCode
          ? `A post-dated cheque's own voucher goes with its original — open ${doc.against.refno ?? "it"} and cancel that.`
          : "A reversal is not cancelled — it is the cancellation."
        : !rights?.cancel
        ? `You have no Cancel right on ${rules?.typeName ?? "this type"}.`
        : doc.locks?.allocatedElsewhere
          ? "Another voucher has already settled against the bill this one raised — release that allocation first."
          : doc.locks?.chequeMoved
          ? `A cheque of this voucher has left the drawer — settle it in ${
              paying ? "Issued Cheques (menu 52)" : "Received Cheques (menu 51)"
            } first; only a voucher whose cheques are all held can be cancelled.`
          : null;

  const cancel = useCallback(async () => {
    const current = latest.current.doc;
    const keys = keysOfDoc(current);
    if (!keys || current.status !== "POSTED" || cancelBlock) {
      return;
    }
    const name = current.voucherRefno ?? "this voucher";
    const reason = await prompt({
      title: `Cancel ${name}`,
      message: `Why is ${name} being cancelled? It is reversed by a Rev voucher dated the same day; both stay in the register and in every balance.`,
      placeholder: "the reason is kept on the voucher",
      presets:
        rulesRef.current?.partyMode === "NONE"
          ? ["Keyed wrong", "Duplicate", "Amount wrong", "Wrong ledger"]
          : ["Keyed wrong", "Wrong party", "Duplicate", "Amount wrong"],
    });
    if (!reason || !reason.trim()) {
      return;
    }
    setBusy(true);
    try {
      const result = await cancelMutation({ ...keys, reason: reason.trim() }).unwrap();
      const pdc = result.data.pdcVouchersReversed ?? 0;
      toast.success(
        `${result.data.voucherRefno ?? name} cancelled — reversed by ${result.data.reversalRefno ?? "a reversal voucher"}${
          pdc > 0 ? `, with ${pdc} post-dated voucher${pdc === 1 ? "" : "s"}` : ""
        }.`,
      );
      await load(keys);
    } catch (error) {
      toast.error(voucherError(error));
    } finally {
      setBusy(false);
    }
  }, [cancelBlock, cancelMutation, load, prompt]);

  const deleteDraft = useCallback(async () => {
    const current = latest.current.doc;
    const keys = keysOfDoc(current);
    if (!keys || current.status !== "DRAFT" || !rights?.delete) {
      return;
    }
    const ok = await confirm({
      title: "Delete the draft",
      message:
        "A draft has no number, no legs and no bill — the keying is simply thrown away. This cannot be undone.",
      confirmLabel: "Delete draft",
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await deleteMutation(keys).unwrap();
      resetTo(appDate);
      setNote("");
    } catch (error) {
      toast.error(voucherError(error));
    } finally {
      setBusy(false);
    }
  }, [appDate, confirm, deleteMutation, resetTo, rights]);

  // ── Walking ───────────────────────────────────────────────────────────────
  const [navNote, setNavNote] = useState("");
  const walk = useCallback(
    async (direction: "prev" | "next") => {
      if (!(await confirmDiscard(direction === "prev" ? "Previous voucher" : "Next voucher"))) {
        return;
      }
      const current = latest.current.doc;
      if (!current.header.voucherId && direction === "next") {
        return;
      }
      setBusy(true);
      try {
        const answer = await dispatch(
          vouchersApi.endpoints.getAdjacentVoucher.initiate(
            {
              companyId: scope.companyId,
              branchId: scope.branchId,
              accYear: current.header.accYear || scope.accYear,
              ...(current.header.voucherId ? { voucherId: current.header.voucherId } : {}),
              direction,
              typeCode,
            },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        if (!answer.voucher) {
          setNavNote(
            !current.header.voucherId
              ? "The register is empty."
              : direction === "prev"
                ? "This is the oldest voucher."
                : "This is the newest voucher.",
          );
          return;
        }
        setNavNote("");
        const next = answer.voucher;
        await load({
          companyId: next.companyId,
          branchId: next.branchId,
          accYear: next.accYear,
          voucherId: next.voucherId,
        });
      } catch (error) {
        toast.error(voucherError(error));
      } finally {
        setBusy(false);
      }
    },
    [confirmDiscard, dispatch, load, scope, typeCode],
  );

  /** "Open reversal" / "Open original". */
  const openLinked = useCallback(
    async (link: VoucherLink) => {
      if (!(await confirmDiscard("Open a voucher"))) {
        return;
      }
      const current = latest.current.doc;
      await load({
        companyId: current.header.companyId,
        branchId: current.header.branchId,
        accYear: link.accYear,
        voucherId: link.voucherId,
      });
    },
    [confirmDiscard, load],
  );

  return {
    type,
    types,
    typesLoading: typesQuery.isLoading,
    typesProblem,
    rules,
    rights,
    paying,
    instrumentsOn,
    billwiseOn,
    partyOne,
    cardOn,
    raisesBill,
    gstBand,
    gstInput,
    gstSide,
    taxRates,
    facts,
    factsLine,
    dueDays,
    cardRows,
    cardBillsLoading: cardBillsQuery.isFetching,
    raisedBill,
    gstShown,
    tdsColumn,
    keyOfRow: rows.keyOfRow,
    setParty,
    setCardFigure,
    setItcForRows,
    tenders,
    tendersProblem: tendersQuery.error ? voucherError(tendersQuery.error) : null,
    books,
    booksLoading: booksQuery.isFetching,
    doc,
    lines,
    bills,
    dirty,
    busy,
    note,
    navNote,
    readOnly,
    isNew,
    derived: shownAnswer,
    fresh,
    validating: shownValidating,
    validateProblem: shownProblem,
    lineProblems,
    lineNotes,
    tdsNotes,
    generated,
    postDatedNotes,
    totals,
    canSaveDraft,
    postBlock,
    cancelBlock,
    setHeader,
    updateLine,
    setSide,
    pickLedger,
    setTdsBase,
    instrumentBlock,
    setInstrument,
    wantsBillwise,
    requestBillwise,
    insertLineAfter,
    removeLine,
    newDocument,
    confirmDiscard,
    load,
    saveDraft,
    post,
    cancel,
    deleteDraft,
    walk,
    openLinked,
  };
}

export type UseVoucherEntry = ReturnType<typeof useVoucherEntry>;
