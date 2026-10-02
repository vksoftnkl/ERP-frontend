/**
 * Stock Adjustment — the draft and every rule the Qt screen applies to a line,
 * as pure functions. Nothing here touches the network: a transition that needs
 * the server (an availability read, the item lookup, the pick dialog) says so
 * through its `effects`, and the hook runs them once the new draft is
 * committed. Ported from `StockAdjustmentEntry` — the comments name the Qt
 * function each one stands for.
 *
 * ── The reason is the direction ─────────────────────────────────────────
 * Every line moves under a reason, and the reason says which way: OUT takes,
 * IN brings, BOTH takes the sign typed into Qty. The Dir chip and the sign of
 * Qty are both DERIVED from it, never typed separately, so they cannot
 * disagree with what the server will post.
 *
 * ── Outward lines are the engine's to value ────────────────────────────
 * An outward line is stamped at the branch average whatever is typed, so its
 * Cost cell shows that average and does not open. It names its holding with
 * Pick from stock (F2), or leaves the lot blank and the engine picks by the
 * item's issue strategy (FEFO / FIFO). A move and an expiry write-off MUST
 * pick: the lot is what names the supplier / expiry.
 */
import {
  COL,
  defaultToBucket,
  kindHint,
  RELOT_IN_CODE,
  RELOT_OUT_CODE,
  rateSourceLabel,
  type Kind,
} from "./stock-adjustment.constants";
import {
  cellNumber,
  dateFromWire,
  dateToWire,
  linesText,
  money,
  nearlyZero,
  qtyCell,
} from "./stock-adjustment.format";
import type {
  AdjustmentDraft,
  AdjustmentLine,
  DraftEffect,
  DraftScope,
  PickStockRow,
  Reason,
  StockItemLookup,
  StockReasonRow,
  Transition,
} from "./stock-adjustment.types";

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

let lineSeq = 0;

/** A key no other line on the screen holds. */
export function newLineKey(): string {
  lineSeq += 1;
  return `sal-${lineSeq}`;
}

export function blankLine(key: string = newLineKey()): AdjustmentLine {
  return {
    key,
    id: null,
    barcode: "",
    itemId: "",
    itemCode: "",
    itemName: "",
    batchNo: "",
    mfgDate: "",
    expiryDate: "",
    mrp: null,
    supplierId: "",
    supplierName: "",
    bucket: "",
    toBucket: "",
    available: null,
    qty: "",
    uomId: "",
    uomName: "",
    baseUomId: "",
    toBaseFactor: 1,
    baseQty: null,
    costRate: null,
    value: null,
    reasonId: "",
    reasonName: "",
    remarks: "",
    lotId: "",
    direction: "",
    trackSignature: "",
    salePrice: null,
    serialNo: "",
  };
}

export function rowHasItem(line: AdjustmentLine | undefined | null): boolean {
  return Boolean(line && line.itemId);
}

export function hasLines(draft: AdjustmentDraft): boolean {
  return draft.lines.some(rowHasItem);
}

/** The line's document-unit → base-unit factor, never 0. */
export function lineFactor(line: AdjustmentLine): number {
  return Math.max(0.000001, Number.isFinite(line.toBaseFactor) ? line.toBaseFactor : 0);
}

/** +1 in, −1 out, 0 = a BOTH reason whose sign has not been typed yet. */
export function directionOf(kind: Kind, line: AdjustmentLine): -1 | 0 | 1 {
  if (kind === "Move") {
    return -1;
  }
  if (line.direction === "IN") {
    return 1;
  }
  if (line.direction === "OUT") {
    return -1;
  }
  const qty = cellNumber(line.qty);
  return qty > 0 ? 1 : qty < 0 ? -1 : 0;
}

export function isInward(kind: Kind, line: AdjustmentLine): boolean {
  return kind !== "Move" && directionOf(kind, line) > 0;
}

/** Facets of a tracking signature (16_stock.sql:289): B batch, M MRP, S sale price, E expiry, R serial, P supplier. */
export function tracks(signature: string, facet: string): boolean {
  return signature.includes(facet);
}

/** Every line ends with the spare row that invites the next one. */
export function ensureTrailingBlankRow(lines: AdjustmentLine[]): AdjustmentLine[] {
  if (lines.length === 0 || rowHasItem(lines[lines.length - 1])) {
    return [...lines, blankLine()];
  }
  return lines;
}

/** recalcRow — BaseQty and Value, signed like Qty so the column sums to the net. */
export function recalcLine(line: AdjustmentLine): AdjustmentLine {
  if (!rowHasItem(line)) {
    return line;
  }
  const qty = cellNumber(line.qty);
  // `|| 0` folds −0 (a negative quantity at no cost) into 0.
  return {
    ...line,
    baseQty: qty * lineFactor(line) || 0,
    value: qty * (line.costRate ?? 0) || 0,
  };
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** resetScreenState + applyKind: a blank document, today, the session's scope. */
export function createDraft(scope: DraftScope, docDate: string, kind: Kind = "Adjustment"): AdjustmentDraft {
  return applyKind(
    {
      ...scope,
      kind,
      svhId: "",
      refno: "",
      status: "DRAFT",
      mode: "entry",
      docDate,
      godownId: "",
      godownName: "",
      rateSource: "AVG_COST",
      defaultReasonId: "",
      extraReason: null,
      usrRefno: "",
      remarks: "",
      lines: [blankLine()],
      reasons: [],
      reasonsLoaded: false,
      serverProblems: {},
      sentKeys: [],
      hint: "",
      dirty: false,
    },
    kind,
  );
}

/**
 * startNextDocument — after a post / cancel / delete: a blank document with the
 * RUN carried over — the godown, the date and the type — because the next one
 * is usually more of the same.
 */
export function nextDocument(previous: AdjustmentDraft, scope: DraftScope): AdjustmentDraft {
  const next = createDraft(scope, previous.docDate, previous.kind);
  return { ...next, godownId: previous.godownId, godownName: previous.godownName };
}

/**
 * applyKind — paints the screen for a kind. The rate source values INWARD
 * lines and only a plain adjustment has any that it values: a re-lot and a
 * move carry the OUT's average across and the server forces AVG_COST for them.
 * The kind's reasons are fetched afresh (`reasonsLoaded` false until they land).
 */
export function applyKind(draft: AdjustmentDraft, kind: Kind): AdjustmentDraft {
  return {
    ...draft,
    kind,
    rateSource: kind === "Adjustment" ? draft.rateSource : "AVG_COST",
    reasons: [],
    reasonsLoaded: false,
  };
}

/** clearLines — one blank row, nothing refused, nothing sent. */
export function clearLines(draft: AdjustmentDraft): AdjustmentDraft {
  return { ...draft, lines: [blankLine()], serverProblems: {}, sentKeys: [] };
}

/**
 * requestKind (after the operator agreed) — the kind decides the reasons, the
 * direction and the lot rule of every line, so a sheet keyed as one kind is
 * not the same sheet as another: the lines go.
 */
export function changeKind(draft: AdjustmentDraft, kind: Kind): AdjustmentDraft {
  if (kind === draft.kind) {
    return draft;
  }
  const had = hasLines(draft);
  const cleared = had ? clearLines(draft) : draft;
  return { ...applyKind(cleared, kind), dirty: draft.dirty || had };
}

/** May the operator change the kind? A saved document keeps its kind. */
export function kindSelectable(draft: AdjustmentDraft): boolean {
  return isEditable(draft) && !draft.svhId;
}

/** The entry is open for keying: Entry mode on a DRAFT. */
export function isEditable(draft: AdjustmentDraft): boolean {
  return draft.mode === "entry" && draft.status === "DRAFT";
}

/** The rate source opens only on a plain adjustment that can still be keyed. */
export function rateSourceEditable(draft: AdjustmentDraft): boolean {
  return draft.kind === "Adjustment" && isEditable(draft);
}

/** "ADJ/2026-2027/PC01/00012 · DRAFT · a stock-taking correction: …" — refreshTitle. */
export function titleLine(draft: AdjustmentDraft): string {
  const doc = draft.refno || "New document";
  return `${doc} · ${draft.status} · ${kindHint(draft.kind)}`;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

/**
 * The reasons a kind offers, as GET /stock/reasons answered for its save type.
 * A re-lot is its own Type: its two reasons are offered there and nowhere
 * else, so half a pair cannot be keyed by accident.
 */
export function filterReasonsForKind(rows: readonly StockReasonRow[], kind: Kind): Reason[] {
  const reasons: Reason[] = [];
  for (const row of rows) {
    const reason: Reason = {
      id: row.srmId,
      code: row.code ?? "",
      name: row.name ?? "",
      direction: (row.direction ?? "").toUpperCase(),
      glLedgerName: row.glLedgerName ?? "",
      requireRemarks: Boolean(row.requireRemarks),
    };
    const relotCode = reason.code === RELOT_OUT_CODE || reason.code === RELOT_IN_CODE;
    if (kind === "Relot" && !relotCode) {
      continue;
    }
    if (kind === "Adjustment" && relotCode) {
      continue;
    }
    reasons.push(reason);
  }
  return reasons;
}

/**
 * loadReasons' answer. The default-reason combo keeps its choice when the new
 * list still carries it ("— per line —" otherwise); loaded lines carry reason
 * ids, so now the chips can say BOTH vs OUT.
 */
export function applyReasons(draft: AdjustmentDraft, rows: readonly StockReasonRow[]): AdjustmentDraft {
  const reasons = filterReasonsForKind(rows, draft.kind);
  const keep = reasons.some((reason) => reason.id === draft.defaultReasonId) ? draft.defaultReasonId : "";
  const lines = draft.lines.map((line) => {
    if (!rowHasItem(line)) {
      return line;
    }
    const reason = reasons.find((candidate) => candidate.id === line.reasonId);
    if (
      reason &&
      draft.kind !== "Move" &&
      reason.direction === "BOTH" &&
      directionOf(draft.kind, line) === 0
    ) {
      return { ...line, direction: "BOTH" as const };
    }
    return line;
  });
  return { ...draft, reasons, reasonsLoaded: true, defaultReasonId: keep, extraReason: null, lines };
}

export function reasonById(draft: Pick<AdjustmentDraft, "reasons">, id: string): Reason | null {
  if (!id) {
    return null;
  }
  return draft.reasons.find((reason) => reason.id === id) ?? null;
}

/** The default-reason combo: "— per line —" first, which sends no header reason at all. */
export function defaultReasonOptions(draft: AdjustmentDraft): { value: string; label: string }[] {
  const options = [{ value: "", label: "— per line —" }];
  for (const reason of draft.reasons) {
    options.push({ value: reason.id, label: reason.name });
  }
  if (draft.extraReason && !draft.reasons.some((reason) => reason.id === draft.extraReason?.id)) {
    options.push({ value: draft.extraReason.id, label: draft.extraReason.name });
  }
  return options;
}

/**
 * normaliseQty — the sign follows the reason: OUT is negative, IN positive,
 * BOTH as typed (and the chip follows the typed sign); a move quantity is a
 * plain magnitude.
 */
export function normaliseQty(kind: Kind, reasons: readonly Reason[], line: AdjustmentLine): AdjustmentLine {
  const raw = line.qty.trim();
  if (!raw) {
    return line;
  }
  let qty = cellNumber(raw);
  let direction = line.direction;
  const reason = reasons.find((candidate) => candidate.id === line.reasonId);
  const both = reason?.direction === "BOTH";
  if (kind === "Move") {
    qty = Math.abs(qty);
  } else if (both) {
    direction = qty > 0 ? "IN" : qty < 0 ? "OUT" : "BOTH";
  } else if (line.direction === "OUT") {
    qty = -Math.abs(qty);
  } else if (line.direction === "IN") {
    qty = Math.abs(qty);
  }
  return { ...line, qty: qtyCell(qty), direction };
}

/**
 * applyReasonToRow. Changing sides changes what the line is: an inward line has
 * no lot to take from (its identity is keyed) and an outward one is valued by
 * the engine — so the lot goes and the availability is read again.
 */
export function applyReasonToLine(
  kind: Kind,
  reasons: readonly Reason[],
  line: AdjustmentLine,
  reason: Reason | null,
): { line: AdjustmentLine; refresh: boolean } {
  if (!reason) {
    return {
      line: { ...line, reasonId: "", reasonName: "", direction: kind === "Move" ? "MOVE" : "" },
      refresh: false,
    };
  }
  const wasInward = rowHasItem(line) && isInward(kind, line);
  let next: AdjustmentLine = { ...line, reasonId: reason.id, reasonName: reason.name };

  if (kind === "Move") {
    next.direction = "MOVE";
    const to = defaultToBucket(reason.code);
    if (to && to !== next.bucket) {
      next.toBucket = to;
    }
  } else if (reason.direction === "IN") {
    next.direction = "IN";
  } else if (reason.direction === "OUT") {
    next.direction = "OUT";
  } else {
    // BOTH: the typed sign decides; until one is typed the chip says ±.
    const qty = cellNumber(next.qty);
    next.direction = qty > 0 ? "IN" : qty < 0 ? "OUT" : "BOTH";
  }

  let refresh = false;
  if (rowHasItem(next)) {
    const nowInward = isInward(kind, next);
    if (nowInward && !wasInward) {
      next.lotId = "";
    }
    next = normaliseQty(kind, reasons, next);
    refresh = nowInward !== wasInward;
    next = recalcLine(next);
  }
  return { line: next, refresh };
}

/**
 * syncRelotPair — a RELOT_OUT line keeps its RELOT_IN partner right below it:
 * same item, same base unit, the same quantity coming in, valued at the OUT's
 * average (the server forces AVG_COST). Only the NEW identity is keyed on the
 * partner — that is the whole point of the pair.
 */
export function syncRelotPair(draft: AdjustmentDraft, outKey: string): AdjustmentDraft {
  const index = draft.lines.findIndex((line) => line.key === outKey);
  const out = draft.lines[index];
  if (!out || !rowHasItem(out)) {
    return draft;
  }
  const outReason = reasonById(draft, out.reasonId);
  if (!outReason || outReason.code !== RELOT_OUT_CODE) {
    return draft;
  }
  const inReason = draft.reasons.find((reason) => reason.code === RELOT_IN_CODE);
  if (!inReason) {
    return draft;
  }
  const lines = [...draft.lines];
  const partnerIndex = index + 1;
  const existing = lines[partnerIndex];
  const exists = Boolean(existing) && existing.itemId === out.itemId && existing.reasonId === inReason.id;
  let partner: AdjustmentLine = exists
    ? existing
    : {
        ...blankLine(),
        itemId: out.itemId,
        itemCode: out.itemCode,
        itemName: out.itemName,
        uomId: out.uomId,
        baseUomId: out.baseUomId,
        uomName: out.uomName,
        toBaseFactor: out.toBaseFactor,
        bucket: out.bucket,
        trackSignature: out.trackSignature,
        costRate: out.costRate,
        reasonId: inReason.id,
        reasonName: inReason.name,
        direction: "IN",
      };
  if (!exists) {
    lines.splice(partnerIndex, 0, partner);
  }
  const qty = Math.abs(cellNumber(out.qty));
  partner = { ...partner, qty: qty > 0 ? qtyCell(qty) : "", costRate: out.costRate };
  lines[partnerIndex] = recalcLine(partner);
  return { ...draft, lines };
}

// ---------------------------------------------------------------------------
// The editor's refusals
// ---------------------------------------------------------------------------

/**
 * whyNotEditable — "" when the cell may be edited, otherwise what the operator
 * is told instead of a cell that silently does nothing.
 */
export function whyNotEditable(draft: AdjustmentDraft, line: AdjustmentLine, column: number): string {
  const hasItem = rowHasItem(line);
  if (column === COL.Barcode) {
    return hasItem ? "This line already has its item." : "";
  }
  if (!hasItem) {
    return "Pick the item first — type in the Item cell, scan a barcode, or F2 to pick from stock.";
  }
  const inward = isInward(draft.kind, line);
  const picked = line.lotId.trim() !== "";
  const signature = line.trackSignature;

  switch (column) {
    case COL.Qty:
    case COL.Remarks:
      return "";
    case COL.ReasonName:
      return draft.reasonsLoaded && draft.reasons.length > 0
        ? ""
        : "The reasons for this type are still loading.";
    case COL.BatchNo:
    case COL.ExpiryDate:
    case COL.MfgDate:
    case COL.Mrp: {
      if (!inward) {
        return (
          "An outward line takes its batch from the holding — press Enter on the batch cell or F2 " +
          "to pick it, or leave it blank for the engine to pick."
        );
      }
      const facet = column === COL.BatchNo ? "B" : column === COL.Mrp ? "M" : "E";
      if (!tracks(signature, facet)) {
        const what = column === COL.BatchNo ? "batch" : column === COL.Mrp ? "MRP" : "expiry";
        return `This item is not tracked by ${what}, so it is not part of what identifies its stock.`;
      }
      return "";
    }
    case COL.Bucket:
      if (picked) {
        return "The bucket is the picked holding's — pick another holding (F2) to change it.";
      }
      if (draft.kind === "Move" || draft.kind === "Expiry") {
        return "Pick the lot first (F2) — its bucket comes with it.";
      }
      return "";
    case COL.ToBucket:
      return draft.kind === "Move" ? "" : "Only Move stock has a To bucket.";
    case COL.CostRate:
      if (!inward) {
        return "An outward line is always valued at the branch average.";
      }
      if (draft.kind === "Relot") {
        return "A re-lot carries the OUT line's average into the new lot.";
      }
      if (draft.rateSource !== "MANUAL") {
        return `The rate source (${rateSourceLabel(draft.rateSource)}) values inward lines. Choose MANUAL to key a cost.`;
      }
      return "";
    default:
      return "Worked out by the screen.";
  }
}

// ---------------------------------------------------------------------------
// Transitions — each one a slot of the Qt screen
// ---------------------------------------------------------------------------

function unchanged(draft: AdjustmentDraft): Transition {
  return { draft, effects: [] };
}

function replaceLine(lines: AdjustmentLine[], index: number, line: AdjustmentLine): AdjustmentLine[] {
  const next = [...lines];
  next[index] = line;
  return next;
}

/**
 * startItemLine — a keyed line: the item is known, the lot is not. The unit and
 * tracking come from the item lookup; the availability and average from
 * pick-stock. A move, an expiry write-off and a re-lot are about ONE lot — the
 * item alone is not a line yet, so they go straight to its holdings.
 */
export function startItemLine(
  draft: AdjustmentDraft,
  key: string,
  item: { itemId: string; itemName: string; unitId: string; barcode?: string },
): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (!item.itemId || index < 0) {
    return unchanged(draft);
  }
  const effects: DraftEffect[] = [];
  let line: AdjustmentLine = {
    ...draft.lines[index],
    lotId: "",
    batchNo: "",
    expiryDate: "",
    mfgDate: "",
    mrp: null,
    salePrice: null,
    serialNo: "",
    supplierId: "",
    supplierName: "",
    available: null,
    costRate: null,
    value: null,
    id: null,
    itemId: item.itemId,
    itemName: item.itemName,
    bucket: "SALEABLE",
    toBaseFactor: 1,
    trackSignature: "N",
    ...(item.barcode ? { barcode: item.barcode } : {}),
  };
  // A new line starts under the header's default reason, if one is chosen.
  if (!line.reasonId) {
    const applied = applyReasonToLine(draft.kind, draft.reasons, line, reasonById(draft, draft.defaultReasonId));
    line = applied.line;
    if (applied.refresh) {
      effects.push({ type: "availability", key });
    }
  }
  const lines = ensureTrailingBlankRow(replaceLine(draft.lines, index, line));
  effects.push({ type: "itemDetail", key, itemId: item.itemId, unitId: item.unitId, keepUnit: false });
  if (draft.kind === "Move" || draft.kind === "Expiry" || draft.kind === "Relot") {
    effects.push({ type: "pick", key });
  } else {
    effects.push({ type: "focus", key, column: COL.Qty });
  }
  return { draft: { ...draft, lines, dirty: true }, effects };
}

/**
 * fetchItemDetail's answer — the unit, base unit, factor and tracking
 * signature. keepUnit: a picked holding already set the base unit, so only the
 * signature is taken. The policy is per ITEM, so every row of it — a re-lot's
 * IN partner included — carries the same signature.
 */
export function applyItemDetail(
  draft: AdjustmentDraft,
  key: string,
  itemId: string,
  detail: StockItemLookup,
  keepUnit: boolean,
): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0 || draft.lines[index].itemId !== itemId) {
    return unchanged(draft); // the line was re-picked meanwhile
  }
  let line: AdjustmentLine = { ...draft.lines[index], itemCode: detail.itemCode ?? "" };
  if (!keepUnit) {
    line = {
      ...line,
      uomId: detail.uomId ?? "",
      uomName: detail.unitName ?? "",
      baseUomId: detail.baseUomId ?? "",
      toBaseFactor: detail.toBaseFactor > 0 ? detail.toBaseFactor : 1,
    };
  }
  const signature = (detail.trackSignature ?? "").trim() || "N";
  const lines = draft.lines.map((candidate, at) => {
    if (at === index) {
      return recalcLine({ ...line, trackSignature: signature });
    }
    return candidate.itemId === itemId ? { ...candidate, trackSignature: signature } : candidate;
  });
  return { draft: { ...draft, lines }, effects: [{ type: "availability", key }] };
}

/** fetchItemDetail refused (a service item, a unit that is not the item's): the line is emptied. */
export function itemDetailFailed(draft: AdjustmentDraft, key: string, itemId: string): AdjustmentDraft {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0 || draft.lines[index].itemId !== itemId) {
    return draft;
  }
  return { ...draft, lines: replaceLine(draft.lines, index, blankLine(key)) };
}

/**
 * refreshAvailability's answer — what the holding (or, lotless, the item in
 * this bucket) has available, and the branch average it is valued at, in the
 * LINE's unit. Keyed inward cost under MANUAL is the operator's; everything
 * else shows the average the engine will use.
 */
export function applyAvailability(
  draft: AdjustmentDraft,
  key: string,
  itemId: string,
  holdings: readonly PickStockRow[],
): AdjustmentDraft {
  const index = draft.lines.findIndex((line) => line.key === key);
  const line = draft.lines[index];
  if (!line || line.itemId !== itemId) {
    return draft;
  }
  let available = 0;
  let average = 0;
  for (const holding of holdings) {
    if (line.lotId && holding.lotId !== line.lotId) {
      continue;
    }
    available += Number(holding.availableQty) || 0;
    if (average <= 0) {
      average = Number(holding.avgCostRate) || 0;
    }
  }
  const factor = lineFactor(line);
  let next: AdjustmentLine = { ...line, available: available / factor };
  const manualIn =
    isInward(draft.kind, line) && draft.kind === "Adjustment" && draft.rateSource === "MANUAL";
  if (!manualIn || (line.costRate ?? 0) <= 0) {
    next.costRate = average * factor;
  }
  next = recalcLine(next);
  return { ...draft, lines: replaceLine(draft.lines, index, next) };
}

/**
 * applyPickedHolding — the line names its holding. An INWARD line (a re-lot IN,
 * stock found) takes the holding's IDENTITY — batch, expiry, MRP — but not its
 * lot id: the server resolves an inward lot from the identity fields. A holding
 * is in BASE units; so is the line picked from it.
 */
export function applyPickedHolding(draft: AdjustmentDraft, key: string, holding: PickStockRow): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0 || !holding?.itemId) {
    return unchanged(draft);
  }
  const current = draft.lines[index];
  const newItem = current.itemId !== holding.itemId;
  const inward = rowHasItem(current) && isInward(draft.kind, current) && !newItem;
  const effects: DraftEffect[] = [];

  let line: AdjustmentLine = {
    ...current,
    itemId: holding.itemId,
    itemCode: holding.itemCode ?? "",
    itemName: holding.itemName ?? "",
    lotId: inward ? "" : holding.lotId ?? "",
    batchNo: holding.batchNo ?? "",
    expiryDate: dateFromWire(holding.expiryDate),
    mfgDate: dateFromWire(holding.mfgDate),
    mrp: (holding.mrp ?? 0) > 0 ? holding.mrp : null,
    salePrice: (holding.salePrice ?? 0) > 0 ? holding.salePrice : null,
    serialNo: holding.serialNo ?? "",
    supplierId: holding.supplierId ?? "",
    supplierName: holding.supplierName ?? "",
    bucket: holding.bucket ?? "",
    uomId: holding.baseUomId ?? "",
    baseUomId: holding.baseUomId ?? "",
    uomName: holding.unitName ?? "",
    toBaseFactor: 1,
    available: Number(holding.availableQty) || 0,
    costRate: Number(holding.avgCostRate) || 0,
  };
  if (newItem) {
    line = { ...line, id: null, trackSignature: "N" };
  }

  // The reason: keep the line's, else the header default, else — on a move —
  // the move reason that fits where the stock now sits.
  if (!line.reasonId) {
    let reason = reasonById(draft, draft.defaultReasonId);
    if (!reason && draft.kind === "Move") {
      const want = holding.bucket === "SALEABLE" ? "MOVE_DAMAGED" : "MOVE_SALEABLE";
      reason = draft.reasons.find((candidate) => candidate.code === want) ?? null;
    }
    if (!reason && draft.kind === "Relot") {
      reason = draft.reasons.find((candidate) => candidate.code === RELOT_OUT_CODE) ?? null;
    }
    if (!reason && draft.reasons.length === 1) {
      reason = draft.reasons[0];
    }
    const applied = applyReasonToLine(draft.kind, draft.reasons, line, reason);
    line = applied.line;
    if (applied.refresh) {
      effects.push({ type: "availability", key });
    }
  }
  if (draft.kind === "Move" && line.toBucket === line.bucket) {
    line = { ...line, toBucket: "" };
  }
  if (draft.kind === "Move" && !line.toBucket) {
    line = { ...line, toBucket: holding.bucket === "SALEABLE" ? "DAMAGED" : "SALEABLE" };
  }

  // The signature, for the identity cells an inward partner may need.
  effects.push({
    type: "itemDetail",
    key,
    itemId: holding.itemId,
    unitId: holding.baseUomId ?? "",
    keepUnit: true,
  });

  line = recalcLine(normaliseQty(draft.kind, draft.reasons, line));
  let next: AdjustmentDraft = {
    ...draft,
    lines: ensureTrailingBlankRow(replaceLine(draft.lines, index, line)),
    dirty: true,
  };
  if (draft.kind === "Relot") {
    next = syncRelotPair(next, key);
  }
  effects.push({ type: "focus", key, column: COL.Qty });
  return { draft: next, effects };
}

/**
 * onGridCellEdited — a cell the operator committed. An edited line is no
 * longer the one the server refused.
 */
export function editCell(draft: AdjustmentDraft, key: string, column: number, raw: string): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0) {
    return unchanged(draft);
  }
  const serverProblems = { ...draft.serverProblems };
  delete serverProblems[key];
  let next: AdjustmentDraft = { ...draft, dirty: true, hint: "", serverProblems };
  let line = draft.lines[index];
  const effects: DraftEffect[] = [];
  const text = raw ?? "";

  switch (column) {
    case COL.Qty: {
      line = recalcLine(normaliseQty(draft.kind, draft.reasons, { ...line, qty: text.trim() }));
      next = { ...next, lines: replaceLine(next.lines, index, line) };
      if (draft.kind === "Relot") {
        next = syncRelotPair(next, key);
      }
      break;
    }
    case COL.ReasonName: {
      const applied = applyReasonToLine(draft.kind, draft.reasons, line, reasonById(draft, text));
      next = { ...next, lines: replaceLine(next.lines, index, applied.line) };
      if (applied.refresh) {
        effects.push({ type: "availability", key });
      }
      if (draft.kind === "Relot") {
        next = syncRelotPair(next, key);
      }
      break;
    }
    case COL.Bucket: {
      next = { ...next, lines: replaceLine(next.lines, index, { ...line, bucket: text }) };
      effects.push({ type: "availability", key });
      break;
    }
    case COL.ToBucket: {
      next = { ...next, lines: replaceLine(next.lines, index, { ...line, toBucket: text }) };
      if (text && text === line.bucket) {
        next.hint = `Line ${index + 1} moves stock into the bucket it is already in — pick a different To bucket.`;
      }
      break;
    }
    case COL.CostRate: {
      const cost = text.trim() ? Math.max(0, cellNumber(text)) : null;
      next = { ...next, lines: replaceLine(next.lines, index, recalcLine({ ...line, costRate: cost })) };
      break;
    }
    case COL.ExpiryDate:
    case COL.MfgDate: {
      const shown = text.trim();
      const iso = dateToWire(shown);
      let value = shown;
      if (shown && !iso) {
        next.hint = `Line ${index + 1}: "${shown}" is not a date — key dd-MM-yyyy.`;
      } else if (iso) {
        value = dateFromWire(iso);
      }
      line = column === COL.ExpiryDate ? { ...line, expiryDate: value } : { ...line, mfgDate: value };
      next = { ...next, lines: replaceLine(next.lines, index, line) };
      break;
    }
    case COL.BatchNo:
      next = { ...next, lines: replaceLine(next.lines, index, { ...line, batchNo: text }) };
      break;
    case COL.Mrp: {
      const mrp = text.trim() ? Math.max(0, cellNumber(text)) : null;
      next = { ...next, lines: replaceLine(next.lines, index, { ...line, mrp }) };
      break;
    }
    case COL.Remarks:
      next = { ...next, lines: replaceLine(next.lines, index, { ...line, remarks: text }) };
      break;
    default:
      return unchanged(draft);
  }
  return { draft: next, effects };
}

/** addLineRow — a blank line above the current one ('+' on the Qt grid). */
export function insertLineBefore(draft: AdjustmentDraft, key: string): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0) {
    return unchanged(draft);
  }
  const fresh = blankLine();
  const lines = [...draft.lines];
  lines.splice(index, 0, fresh);
  return {
    draft: { ...draft, lines, dirty: true },
    effects: [{ type: "focus", key: fresh.key, column: COL.Description }],
  };
}

/** removeLineRow (after the operator agreed) — never the trailing blank row. */
export function removeLine(draft: AdjustmentDraft, key: string): Transition {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0 || !rowHasItem(draft.lines[index])) {
    return unchanged(draft);
  }
  const lines = ensureTrailingBlankRow(draft.lines.filter((line) => line.key !== key));
  const focusLine = lines[Math.min(index, lines.length - 1)];
  return {
    draft: { ...draft, lines, serverProblems: {}, dirty: true },
    effects: focusLine ? [{ type: "focus", key: focusLine.key, column: COL.Description }] : [],
  };
}

/**
 * The godown changed (after the operator agreed). One godown per document, and
 * every picked holding belongs to it — so a different godown means different
 * lines.
 */
export function changeGodown(draft: AdjustmentDraft, godownId: string, godownName: string): AdjustmentDraft {
  if (godownId === draft.godownId) {
    return draft;
  }
  const cleared = hasLines(draft) ? clearLines(draft) : draft;
  return { ...cleared, godownId, godownName, dirty: true };
}

/** MANUAL opens the inward Cost cells; any other source derives them. */
export function changeRateSource(draft: AdjustmentDraft, rateSource: string): Transition {
  const effects: DraftEffect[] = draft.lines
    .filter((line) => rowHasItem(line) && isInward(draft.kind, line))
    .map((line) => ({ type: "availability" as const, key: line.key }));
  return { draft: { ...draft, rateSource, dirty: true }, effects };
}

// ---------------------------------------------------------------------------
// What the screen shows, worked out from the lines
// ---------------------------------------------------------------------------

/** The # column is the line number the save will send. */
export function lineNumbers(draft: AdjustmentDraft): Map<string, number> {
  const numbers = new Map<string, number>();
  let count = 0;
  for (const line of draft.lines) {
    if (rowHasItem(line)) {
      count += 1;
      numbers.set(line.key, count);
    }
  }
  return numbers;
}

/** Rows whose reason requires remarks while the header has none — the Remarks cell paints "required". */
export function remarksRequiredKeys(draft: AdjustmentDraft): Set<string> {
  const keys = new Set<string>();
  if (draft.remarks.trim()) {
    return keys;
  }
  for (const line of draft.lines) {
    if (rowHasItem(line) && reasonById(draft, line.reasonId)?.requireRemarks) {
      keys.add(line.key);
    }
  }
  return keys;
}

/**
 * refreshRowHints — the grey note at the end of each row: what the line does to
 * its holding, or what it is still missing.
 */
export function rowHint(draft: AdjustmentDraft, line: AdjustmentLine): string {
  if (!rowHasItem(line)) {
    return "";
  }
  const reason = reasonById(draft, line.reasonId);
  const qty = cellNumber(line.qty);
  const headerRemarks = draft.remarks.trim() !== "";
  if (reason?.requireRemarks && !line.remarks.trim() && !headerRemarks) {
    return "⚠ remarks required";
  }
  if (isInward(draft.kind, line) && line.batchNo.trim()) {
    return `into lot ${line.batchNo.trim()}`;
  }
  if (line.available !== null && !nearlyZero(qty)) {
    return `stock ${qtyCell(line.available)} → ${qtyCell(line.available + qty)}`;
  }
  return "";
}

export type AdjustmentTotals = {
  lineCount: number;
  outLines: number;
  inLines: number;
  outQty: number;
  outValue: number;
  inQty: number;
  inValue: number;
  unit: string;
  outText: string;
  inText: string;
  netText: string;
};

/**
 * recalcTotals — "Out  3 lines · 9 pcs · ₹ 1,212.60". The unit is the lines'
 * own when they share one, else "base units". A move counts what it moves, as
 * an out.
 */
export function computeTotals(draft: AdjustmentDraft): AdjustmentTotals {
  let lineCount = 0;
  let outLines = 0;
  let inLines = 0;
  let outQty = 0;
  let outValue = 0;
  let inQty = 0;
  let inValue = 0;
  const units = new Set<string>();
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    lineCount += 1;
    units.add(line.uomName.trim().toLowerCase());
    const qty = cellNumber(line.qty);
    const base = qty * lineFactor(line);
    const value = qty * (line.costRate ?? 0);
    if (draft.kind === "Move" || base < 0) {
      outLines += 1;
      outQty += Math.abs(base);
      outValue += Math.abs(value);
    } else if (base > 0) {
      inLines += 1;
      inQty += base;
      inValue += value;
    }
  }
  const only = units.size === 1 ? [...units][0] : "";
  const unit = only || "base units";
  const side = (label: string, count: number, qty: number, value: number) =>
    `${label}  ${linesText(count)} · ${qtyCell(qty)} ${unit} · ₹ ${money(value)}`;
  const net = inValue - outValue;
  return {
    lineCount,
    outLines,
    inLines,
    outQty,
    outValue,
    inQty,
    inValue,
    unit,
    outText: side("Out", outLines, outQty, outValue),
    inText: side("In  ", inLines, inQty, inValue),
    netText: `Net  ${net < 0 ? "−" : ""}₹ ${money(Math.abs(net))}  (the voucher header's totals are the NET)`,
  };
}

/** The fallback labels of the three roles the accounts card uses. */
export const ROLE_FALLBACK_LABELS = {
  INVENTORY: "Inventory (Stock-in-Hand)",
  STOCK_SHORTAGE: "Stock Shortage",
  STOCK_EXCESS: "Stock Excess",
} as const;

/**
 * refreshAccountsCard — DR / CR per ledger, netted: the Stock Journal the post
 * will write, worked out from each line's reason (its ledger, else the
 * STOCK_SHORTAGE / STOCK_EXCESS role) against INVENTORY. An ESTIMATE: the
 * voucher is built from the posted ledger values. Null on a re-lot or a move,
 * which post no voucher.
 */
export function accountsCard(draft: AdjustmentDraft, roleLedgers: Readonly<Record<string, string>>): string[] | null {
  if (draft.kind === "Relot" || draft.kind === "Move") {
    return null;
  }
  const inventory = roleLedgers.INVENTORY || ROLE_FALLBACK_LABELS.INVENTORY;
  const shortage = roleLedgers.STOCK_SHORTAGE || ROLE_FALLBACK_LABELS.STOCK_SHORTAGE;
  const excess = roleLedgers.STOCK_EXCESS || ROLE_FALLBACK_LABELS.STOCK_EXCESS;
  const pairs: { dr: string; cr: string; amount: number }[] = [];
  const add = (dr: string, cr: string, amount: number) => {
    const existing = pairs.find((pair) => pair.dr === dr && pair.cr === cr);
    if (existing) {
      existing.amount += amount;
    } else {
      pairs.push({ dr, cr, amount });
    }
  };
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    const value = cellNumber(line.qty) * (line.costRate ?? 0);
    if (nearlyZero(value)) {
      continue;
    }
    const reason = reasonById(draft, line.reasonId);
    const out = value < 0;
    const ledger = reason?.glLedgerName ? reason.glLedgerName : out ? shortage : excess;
    if (out) {
      add(ledger, inventory, -value);
    } else {
      add(inventory, ledger, value);
    }
  }
  if (pairs.length === 0) {
    return ["(nothing to post yet)"];
  }
  let nameWidth = 0;
  let amountWidth = 0;
  for (const pair of pairs) {
    nameWidth = Math.max(nameWidth, pair.dr.length, pair.cr.length);
    amountWidth = Math.max(amountWidth, money(pair.amount).length);
  }
  return pairs.map(
    (pair) =>
      `DR  ${pair.dr.padEnd(nameWidth)} ${money(pair.amount).padStart(amountWidth)}      ` +
      `CR  ${pair.cr.padEnd(nameWidth)} ${money(pair.amount).padStart(amountWidth)}`,
  );
}

/** refreshRelotPanel — the pair balance strip: one sentence per item. Null off a re-lot. */
export function relotBalance(draft: AdjustmentDraft): { lines: string[]; good: boolean } | null {
  if (draft.kind !== "Relot") {
    return null;
  }
  const perItem = new Map<string, { name: string; out: number; in: number; cost: number }>();
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    const pair = perItem.get(line.itemId) ?? { name: "", out: 0, in: 0, cost: 0 };
    pair.name = line.itemName;
    const factor = lineFactor(line);
    const base = cellNumber(line.qty) * factor;
    if (base < 0) {
      pair.out += -base;
      pair.cost = (line.costRate ?? 0) / factor;
    } else {
      pair.in += base;
    }
    perItem.set(line.itemId, pair);
  }
  if (perItem.size === 0) {
    return { lines: ["Pick the wrong lot (F2) — its pair is added below it."], good: false };
  }
  let good = true;
  const lines: string[] = [];
  for (const pair of perItem.values()) {
    const ok = pair.out > 0 && nearlyZero(pair.out - pair.in);
    good = good && ok;
    lines.push(
      ok
        ? `✓ pair balances: ${pair.name}  −${qtyCell(pair.out)} / +${qtyCell(pair.in)} (base units) · value carried at ${money(pair.cost)}`
        : `✗ ${pair.name}: −${qtyCell(pair.out)} out against +${qtyCell(pair.in)} in — the pair must balance`,
    );
  }
  return { lines, good };
}
