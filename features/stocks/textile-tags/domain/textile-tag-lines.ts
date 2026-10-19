/**
 * The New tags tab as a pure state machine — the port of what
 * `TextileTagEntry` (Qt NexERP 3b5069d) does to its grid, header and panels,
 * with the widgets left out so the behaviours can be tested without React and
 * the screen can replay a reserve flow on a local copy of the state while the
 * round trips are in flight.
 *
 * Reserve takes the barcodes and nothing else: no stock moves. The tag's lot
 * id is computed by the server from (company, item, barcode), so the Opening
 * (go-live) or the purchase that later carries batch = barcode lands on
 * exactly that lot. List cells (size / colour / fabric / season) are typed; a
 * name the list lacks is added at reserve, after one question. Prices: the
 * Markup rule suggests one from the cost ("auto"); a typed price is the
 * operator's ("typed") and is never overwritten.
 */
import type {
  ApiFieldError,
  ReserveAnswer,
  ReserveBodyDto,
  ReserveLineDto,
  SuggestPriceAnswer,
} from "../textile-tags.types";
import {
  barcodeRun,
  firstBarcodeOf,
  labelsFor,
  LIST_FIELDS,
  listKindOfField,
  num,
  rawOf,
  roundRuleText,
  sizeSetOf,
  type ListKind,
  type TagLine,
  type TagLineField,
} from "./textile-tag-entity";
import {
  emptyLists,
  idOf,
  ingestListRows,
  remember,
  seasonFor,
  seasonNamed,
  type ListRow,
  type TagLists,
} from "./textile-tag-lists";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type TagSource = "OPENING" | "";

export const TAG_SOURCES: readonly { value: TagSource; label: string; title?: string }[] = [
  { value: "OPENING", label: "Opening stock (go-live)" },
  {
    value: "",
    label: "Tags only",
    title: "Reserve tags with no document yet — post the stock later with batch = barcode.",
  },
];

export type TagHeader = {
  source: TagSource;
  supplierId: string;
  supplierName: string;
  /** yyyy-MM-dd. Decides the default season. */
  docDate: string;
  /** The header season (G21): every line takes it. Picked from the list carries the id; typed resolves at reserve. */
  seasonText: string;
  seasonId: string;
  /** The operator chose the season by hand — a new date no longer re-picks the default. */
  seasonPicked: boolean;
};

/** One line of the last reserve, as sent: its payload `lineNo` and the row it came from. */
export type SentLine = { lineNo: number; key: string };

export type TagEntryState = {
  header: TagHeader;
  lines: TagLine[];
  lists: TagLists;
  /** Rows the last refusal named (`lines.<i>`). */
  serverProblemKeys: readonly string[];
  sent: readonly SentLine[];
  /** Learnt from the first reserved barcode. */
  seriesCode: string;
  footNote: string;
  /** The one-line hint under the grid: an edit refusal, a failed quick-add. */
  hint: string;
  reserving: boolean;
};

let lineSequence = 0;

export function newTagLineKey(): string {
  lineSequence += 1;
  return `ttl-${lineSequence}`;
}

export function blankTagLine(key: string = newTagLineKey()): TagLine {
  return {
    key,
    itemName: "",
    brandName: "",
    sizeName: "",
    colourName: "",
    fabricName: "",
    model: "",
    supplierArticle: "",
    cost: "",
    mrp: "",
    priceSrc: "",
    price: "",
    qty: "",
    labels: "",
    barcode: "",
    seasonName: "",
    attrNote: "",
    itemId: "",
    brandId: "",
    sizeId: "",
    colourId: "",
    fabricId: "",
    seasonId: "",
    uomId: "",
    signature: "",
    tagIds: "",
    lotIds: "",
    rule: "",
    state: "",
  };
}

export function createTagEntryState(today: string): TagEntryState {
  return {
    header: {
      source: "OPENING",
      supplierId: "",
      supplierName: "",
      docDate: today,
      seasonText: "",
      seasonId: "",
      seasonPicked: false,
    },
    lines: [blankTagLine()],
    lists: emptyLists(),
    serverProblemKeys: [],
    sent: [],
    seriesCode: "",
    footNote: "",
    hint: "",
    reserving: false,
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function hasItem(line: Pick<TagLine, "itemId">): boolean {
  return line.itemId.trim() !== "";
}

export function isReserved(line: Pick<TagLine, "state">): boolean {
  return line.state === "RESERVED";
}

/** Has an item, not reserved. */
export function isPending(line: Pick<TagLine, "itemId" | "state">): boolean {
  return hasItem(line) && !isReserved(line);
}

/** The spare blank row at the bottom that invites the next line. */
export function isSpare(line: Pick<TagLine, "itemId" | "itemName">): boolean {
  return !hasItem(line) && line.itemName.trim() === "";
}

export function pendingLineCount(state: Pick<TagEntryState, "lines">): number {
  return state.lines.filter(isPending).length;
}

/** Labels the pending lines print. */
export function labelCount(state: Pick<TagEntryState, "lines">): number {
  return state.lines.reduce((total, line) => total + (isPending(line) ? labelsFor(num(line.qty)) : 0), 0);
}

function withTrailingBlank(lines: readonly TagLine[], key?: string): TagLine[] {
  const last = lines[lines.length - 1];
  if (last && isSpare(last)) {
    return [...lines];
  }
  return [...lines, blankTagLine(key)];
}

/** Before the spare last line, so the spare stays last. */
function appendLine(lines: readonly TagLine[], line: TagLine): TagLine[] {
  const last = lines[lines.length - 1];
  if (last && isSpare(last)) {
    return [...lines.slice(0, -1), line, last];
  }
  return [...lines, line];
}

function lineAt(state: TagEntryState, key: string): TagLine | undefined {
  return state.lines.find((line) => line.key === key);
}

function patchLine(lines: readonly TagLine[], key: string, patch: Partial<TagLine>): TagLine[] {
  return lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
}

function without(keys: readonly string[], key: string): string[] {
  return keys.filter((candidate) => candidate !== key);
}

/** `whyNotEditable()` — "" when the cell may be edited, else why it may not. */
export function whyNotEditable(line: TagLine, index: number, field: TagLineField): string {
  if (isReserved(line)) {
    return `Line ${index + 1} is reserved: its tags exist. Change a tag's details from the Register.`;
  }
  if (!hasItem(line) && field !== "itemName") {
    return "Pick the item first.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type SizeGridAdd = {
  /** One fresh row key per size, minted by the caller so it can fire the lookups. */
  keys: string[];
  itemId: string;
  itemName: string;
  brandId: string;
  brandName: string;
  sizeSet: string;
  sizes: { size: string; qty: number }[];
  colour: string;
  fabric: string;
  model: string;
  cost: string;
};

export type TagEntryAction =
  | { type: "headerChanged"; patch: Partial<Pick<TagHeader, "source" | "supplierId" | "supplierName">> }
  | { type: "dateChanged"; docDate: string }
  | { type: "seasonTyped"; text: string }
  | { type: "seasonPicked"; id: string; name: string }
  | { type: "listsLoaded"; kind: ListKind; rows: ListRow[] }
  /** The item popup's pick: the row takes the item; the caller then asks the lookup and the markup. */
  | { type: "itemSet"; key: string; itemId: string; itemName: string; uomId: string }
  | { type: "brandSet"; key: string; brandId: string; brandName: string }
  /** A typed cell, as the delegate would commit it. */
  | { type: "cellTyped"; key: string; field: TagLineField; text: string }
  /** The item lookup's answer — only if the line still shows the item that was asked about. */
  | { type: "lookupAnswered"; key: string; itemId: string; signature: string; uomId: string }
  /** A suggest-price answer's `data`; `itemId` / `cost` guard a stale answer. */
  | { type: "suggestionAnswered"; key: string; data: SuggestPriceAnswer; itemId?: string; cost?: number }
  | { type: "sizeGridAdded"; add: SizeGridAdd }
  | { type: "lineRemoved"; key: string }
  | { type: "linesCleared" }
  | { type: "hintShown"; text: string }
  | { type: "reserveStarted" }
  | { type: "reserveStopped"; hint?: string }
  | { type: "nameResolved"; kind: ListKind; name: string; sizeSet: string; id: string }
  | { type: "reserveSent"; sent: SentLine[] }
  /** The reserve answer's `data` ({ tags: [...] }) onto the lines. */
  | { type: "reserved"; data: ReserveAnswer }
  /** A refusal: 422 `lines.<i>` names the i-th line SENT. */
  | { type: "reserveRefused"; errors: ApiFieldError[] };

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

function refreshDefaultSeason(state: TagEntryState): TagEntryState {
  if (state.header.seasonPicked) {
    return state;
  }
  const def = seasonFor(state.lists, state.header.docDate);
  if (def) {
    return { ...state, header: { ...state.header, seasonText: def.name, seasonId: def.id } };
  }
  const named = seasonNamed(state.lists, state.header.seasonText);
  return { ...state, header: { ...state.header, seasonId: named?.id ?? "" } };
}

function setItem(
  state: TagEntryState,
  key: string,
  itemId: string,
  itemName: string,
  uomId: string,
): TagEntryState {
  const line = lineAt(state, key);
  if (!line || isReserved(line)) {
    return state;
  }
  const patch: Partial<TagLine> = { itemId, itemName, uomId, signature: "" };
  if (line.qty.trim() === "") {
    patch.qty = "1";
    patch.labels = "1";
  }
  return {
    ...state,
    lines: withTrailingBlank(patchLine(state.lines, key, patch)),
    serverProblemKeys: without(state.serverProblemKeys, key),
  };
}

/** `applySuggestion()` — the markup's answer onto a line that is not the operator's to price. */
function applySuggestion(state: TagEntryState, key: string, data: SuggestPriceAnswer): TagEntryState {
  const line = lineAt(state, key);
  if (!line || isReserved(line) || line.priceSrc === "typed") {
    return state;
  }
  const rule = data.rule;
  if (!rule || typeof rule !== "object") {
    return { ...state, lines: patchLine(state.lines, key, { rule: "" }) };
  }
  const sale = rawOf(data.salePrice);
  const mrp = rawOf(data.mrp);
  const patch: Partial<TagLine> = {};
  if (sale) {
    patch.price = sale;
    patch.priceSrc = "auto";
  }
  // A rule that sets MRP fills it only when the operator left it blank.
  if (mrp && line.mrp.trim() === "") {
    patch.mrp = mrp;
  }
  const pct = Math.round(num(String(rule.pct ?? "")));
  patch.rule = `Markup rule: +${pct}% on cost, ${roundRuleText(String(rule.round ?? ""))}`;
  return { ...state, lines: patchLine(state.lines, key, patch) };
}

/** `onGridCellEdited()` — what a typed cell does to its neighbours. */
function cellTyped(state: TagEntryState, key: string, field: TagLineField, text: string): TagEntryState {
  const line = lineAt(state, key);
  if (!line) {
    return state;
  }
  const value = text.trim();
  const patch: Partial<TagLine> = { [field]: value } as Partial<TagLine>;
  switch (field) {
    case "price":
      // A typed price is the operator's: no rule overwrites it again.
      patch.priceSrc = value === "" ? "" : "typed";
      break;
    case "qty":
      patch.labels = String(labelsFor(num(value)));
      break;
    default: {
      const kind = listKindOfField(field);
      if (kind) {
        // The typed name decides; its id is looked up again (or resolved at reserve).
        patch[LIST_FIELDS[kind].id] = idOf(state.lists, kind, value);
      }
    }
  }
  return {
    ...state,
    lines: patchLine(state.lines, key, patch),
    serverProblemKeys: without(state.serverProblemKeys, key),
  };
}

function addSizeGridLines(state: TagEntryState, add: SizeGridAdd): TagEntryState {
  let lines = state.lines;
  add.sizes.forEach(({ size, qty }, index) => {
    const key = add.keys[index] ?? newTagLineKey();
    const line: TagLine = {
      ...blankTagLine(key),
      brandId: add.brandId,
      brandName: add.brandName,
      sizeName: size,
      sizeId: idOf(state.lists, "size", size, add.sizeSet),
      colourName: add.colour.trim(),
      fabricName: add.fabric.trim(),
      colourId: idOf(state.lists, "colour", add.colour),
      fabricId: idOf(state.lists, "fabric", add.fabric),
      model: add.model.trim(),
      cost: add.cost.trim(),
      qty: String(qty),
      labels: String(labelsFor(qty)),
    };
    lines = appendLine(lines, line);
  });
  let next: TagEntryState = { ...state, lines };
  add.sizes.forEach((_size, index) => {
    const key = add.keys[index];
    if (key) {
      next = setItem(next, key, add.itemId, add.itemName, "");
    }
  });
  return { ...next, lines: withTrailingBlank(next.lines) };
}

/** `writeResolvedIds()` — a resolved name's id onto every pending row (and the header) that typed it. */
function writeResolvedIds(
  state: TagEntryState,
  kind: ListKind,
  name: string,
  sizeSet: string,
  id: string,
): TagEntryState {
  const { name: nameField, id: idField } = LIST_FIELDS[kind];
  const wanted = name.trim().toUpperCase();
  const lines = state.lines.map((line) =>
    isPending(line) && line[idField].trim() === "" && line[nameField].trim().toUpperCase() === wanted
      ? { ...line, [idField]: id }
      : line,
  );
  let header = state.header;
  if (kind === "season" && header.seasonId === "" && header.seasonText.trim().toUpperCase() === wanted) {
    header = { ...header, seasonId: id };
  }
  return { ...state, lines, header, lists: remember(state.lists, kind, id, name.trim(), sizeSet) };
}

/** `applyReserved()` — the answer's tags onto the lines they were reserved for. */
function applyReserved(state: TagEntryState, data: ReserveAnswer): TagEntryState {
  type Got = { codes: string[]; tagIds: string[]; lotIds: string[]; labels: number };
  const byLine = new Map<number, Got>();
  for (const tag of Array.isArray(data?.tags) ? data.tags : []) {
    const lineNo = Number(tag.lineNo);
    const got = byLine.get(lineNo) ?? { codes: [], tagIds: [], lotIds: [], labels: 0 };
    got.codes.push(String(tag.barcode ?? ""));
    got.tagIds.push(String(tag.tagId ?? ""));
    got.lotIds.push(String(tag.lotId ?? ""));
    got.labels += labelsFor(num(String(tag.labelQty ?? "")));
    byLine.set(lineNo, got);
  }

  let lines = state.lines;
  let tags = 0;
  const all: string[] = [];
  for (const [lineNo, got] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const key = state.sent.find((sent) => sent.lineNo === lineNo)?.key ?? state.lines[lineNo - 1]?.key;
    if (!key || !lines.some((line) => line.key === key)) {
      continue;
    }
    lines = patchLine(lines, key, {
      barcode: barcodeRun(got.codes),
      tagIds: got.tagIds.join(","),
      lotIds: got.lotIds.join(","),
      labels: String(got.labels),
      state: "RESERVED",
    });
    tags += got.codes.length;
    all.push(...got.codes);
  }

  let seriesCode = state.seriesCode;
  let footNote = state.footNote;
  if (all.length > 0) {
    seriesCode = all[0].slice(0, 2);
    const sorted = [...all].sort();
    footNote =
      `Reserved ${tags} tag(s): ${sorted[0]}` +
      (sorted.length > 1 ? ` – ${sorted[sorted.length - 1]}` : "") +
      (state.header.source === "OPENING"
        ? " · next: post the Opening Stock with batch = barcode for each line"
        : "");
  }
  return { ...state, lines, seriesCode, footNote, sent: [], serverProblemKeys: [] };
}

const LINES_FIELD = /^lines\.(\d+)/;

/**
 * `showServerRefusal()` — 422 names "lines.<index>", the index into the lines
 * SENT, mapped back through the order they were sent in.
 */
export function serverProblemKeysOf(errors: readonly ApiFieldError[], sent: readonly SentLine[]): string[] {
  const ordered = [...sent].sort((a, b) => a.lineNo - b.lineNo);
  const keys = new Set<string>();
  for (const error of errors) {
    const match = LINES_FIELD.exec(String(error?.field ?? ""));
    if (!match) {
      continue;
    }
    const index = Number(match[1]);
    const line = ordered[index];
    if (line) {
      keys.add(line.key);
    }
  }
  return [...keys];
}

export function tagEntryReducer(state: TagEntryState, action: TagEntryAction): TagEntryState {
  switch (action.type) {
    case "headerChanged":
      return { ...state, header: { ...state.header, ...action.patch } };

    case "dateChanged":
      // A new date can mean another season — only when the operator has not
      // picked one by hand.
      return refreshDefaultSeason({ ...state, header: { ...state.header, docDate: action.docDate } });

    case "seasonTyped": {
      const text = action.text;
      const named = seasonNamed(state.lists, text);
      return {
        ...state,
        header: {
          ...state.header,
          seasonText: text,
          seasonId: named?.id ?? "",
          seasonPicked: text.trim() !== "",
        },
      };
    }

    case "seasonPicked":
      return {
        ...state,
        header: { ...state.header, seasonText: action.name, seasonId: action.id, seasonPicked: true },
      };

    case "listsLoaded":
      return refreshDefaultSeason({ ...state, lists: ingestListRows(state.lists, action.kind, action.rows) });

    case "itemSet":
      return setItem(state, action.key, action.itemId, action.itemName, action.uomId);

    case "brandSet": {
      const line = lineAt(state, action.key);
      if (!line || isReserved(line)) {
        return state;
      }
      return { ...state, lines: patchLine(state.lines, action.key, { brandId: action.brandId, brandName: action.brandName }) };
    }

    case "cellTyped":
      return cellTyped(state, action.key, action.field, action.text);

    case "lookupAnswered": {
      const line = lineAt(state, action.key);
      if (!line || line.itemId !== action.itemId) {
        return state;
      }
      const patch: Partial<TagLine> = { signature: action.signature };
      if (line.uomId.trim() === "" && action.uomId) {
        patch.uomId = action.uomId;
      }
      return { ...state, lines: patchLine(state.lines, action.key, patch) };
    }

    case "suggestionAnswered": {
      // Only if the line is still the line that was asked about.
      const line = lineAt(state, action.key);
      if (!line) {
        return state;
      }
      if (action.itemId !== undefined && line.itemId !== action.itemId) {
        return state;
      }
      if (action.cost !== undefined && num(line.cost) !== action.cost) {
        return state;
      }
      return applySuggestion(state, action.key, action.data);
    }

    case "sizeGridAdded":
      return addSizeGridLines(state, action.add);

    case "lineRemoved": {
      const line = lineAt(state, action.key);
      if (!line || !hasItem(line)) {
        return state;
      }
      if (isReserved(line)) {
        return { ...state, hint: "A reserved line keeps its barcodes. Void a tag from the Register." };
      }
      return {
        ...state,
        lines: withTrailingBlank(state.lines.filter((candidate) => candidate.key !== action.key)),
        serverProblemKeys: [],
      };
    }

    case "linesCleared":
      return {
        ...state,
        lines: [blankTagLine()],
        serverProblemKeys: [],
        sent: [],
        footNote: "",
        hint: "",
      };

    case "hintShown":
      return { ...state, hint: action.text };

    case "reserveStarted":
      return { ...state, reserving: true, hint: "" };

    case "reserveStopped":
      return { ...state, reserving: false, hint: action.hint ?? state.hint };

    case "nameResolved":
      return writeResolvedIds(state, action.kind, action.name, action.sizeSet, action.id);

    case "reserveSent":
      return { ...state, sent: action.sent };

    case "reserved":
      return { ...applyReserved(state, action.data), reserving: false };

    case "reserveRefused":
      return {
        ...state,
        reserving: false,
        serverProblemKeys: serverProblemKeysOf(action.errors, state.sent),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export type LineProblem = { key: string; index: number; why: string };

/** `problemRows()` — the pending lines the server would refuse, and why. */
export function problemRows(state: Pick<TagEntryState, "lines" | "serverProblemKeys">): LineProblem[] {
  const problems: LineProblem[] = [];
  state.lines.forEach((line, index) => {
    if (!isPending(line)) {
      return;
    }
    const signature = line.signature.trim();
    const price = num(line.price);
    const mrp = num(line.mrp);
    let why = "";
    if (signature !== "" && signature !== "B") {
      why = `${line.itemName} is not set up for tags — its item group needs the Textile tag tracking (batch only)`;
    } else if (line.price.trim() === "") {
      why = "no price";
    } else if (mrp > 0 && price > mrp) {
      why = "price is above MRP";
    } else if (num(line.qty) <= 0) {
      why = "no quantity";
    } else if (state.serverProblemKeys.includes(line.key)) {
      why = "refused by the server — see the message";
    }
    if (why) {
      problems.push({ key: line.key, index, why });
    }
  });
  return problems;
}

export function problemMessages(problems: readonly LineProblem[]): string[] {
  return problems.map((problem) => `line ${problem.index + 1}: ${problem.why}`);
}

export type ValidationTone = "idle" | "error" | "ok";

/** `refreshValidation()` — the strip under the grid. */
export function validationOf(state: Pick<TagEntryState, "lines" | "serverProblemKeys">): {
  text: string;
  tone: ValidationTone;
  problems: LineProblem[];
} {
  const problems = problemRows(state);
  const lines = pendingLineCount(state);
  if (lines === 0) {
    const anyReserved = state.lines.some(isReserved);
    return {
      text: anyReserved
        ? "✓ Every line is reserved. Add more lines, or Clear for a new batch."
        : "Pick an item on the first line, or fill the size grid.",
      tone: "idle",
      problems,
    };
  }
  if (problems.length > 0) {
    const messages = problemMessages(problems);
    let text = `⚠ ${messages.slice(0, 3).join(" · ")}`;
    if (messages.length > 3) {
      text += ` · and ${messages.length - 3} more`;
    }
    return { text, tone: "error", problems };
  }
  return {
    text: `✓ ${lines} line(s) → ${labelCount(state)} label(s) · ready to reserve`,
    tone: "ok",
    problems,
  };
}

/** Reserve is enabled only when there is something to reserve and nothing in its way. */
export function canReserve(state: TagEntryState, canCreate: boolean): boolean {
  return !state.reserving && pendingLineCount(state) > 0 && problemRows(state).length === 0 && canCreate;
}

export type TagLabel = {
  brand: string;
  /** The cipher of the label cost (G2); "" = none. */
  costCode: string;
  itemName: string;
  model: string;
  size: string;
  colour: string;
  fabric: string;
  note: string;
  /** "" before reserve. */
  barcode: string;
  /** 0 = no MRP printed. */
  mrp: number;
  price: number;
  /** "10/2026" */
  packed: string;
  season: string;
};

export type TagPreview = { index: number; label: TagLabel; labels: number };

/**
 * `refreshPreview()` — the current line's label, or the first line with an
 * item; null when no line has one. `packed` is the month the tag is reserved in.
 */
export function previewOf(state: TagEntryState, activeKey: string | null, packed: string): TagPreview | null {
  const active = activeKey ? state.lines.findIndex((line) => line.key === activeKey) : -1;
  let index = active >= 0 && hasItem(state.lines[active]) ? active : -1;
  if (index < 0) {
    index = state.lines.findIndex(hasItem);
  }
  if (index < 0) {
    return null;
  }
  const line = state.lines[index];
  return {
    index,
    labels: Math.trunc(num(line.labels)),
    label: {
      brand: line.brandName.trim(),
      // The cost code waits for the company setting stock.textile_cost_code (B-1).
      costCode: "",
      itemName: line.itemName.trim(),
      model: line.model.trim(),
      size: line.sizeName.trim(),
      colour: line.colourName.trim(),
      fabric: line.fabricName.trim(),
      note: line.attrNote.trim(),
      barcode: firstBarcodeOf(line.barcode.trim()),
      mrp: num(line.mrp),
      price: num(line.price),
      packed,
      season: line.seasonName.trim() || state.header.seasonText.trim(),
    },
  };
}

/** The size grid's "→ n line(s), m pc(s)." summary and its button text. */
export function sizeGridSummary(quantities: readonly number[]): { lines: number; pieces: number; summary: string; button: string } {
  let lines = 0;
  let pieces = 0;
  for (const qty of quantities) {
    if (qty > 0) {
      lines += 1;
      pieces += qty;
    }
  }
  return {
    lines,
    pieces,
    summary: lines === 0 ? "" : `→ ${lines} line(s), ${pieces} pc(s). Price comes from the Markup rule per line.`,
    button: lines > 0 ? `Add ${lines} line(s)` : "Add lines",
  };
}

export function discardQuestion(pending: number): string {
  return `${pending} line(s) are not reserved yet and will be lost. Continue?`;
}

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

/** `reservePayload()` — what Reserve would send for the lines still to reserve. */
export function reservePayload(
  state: Pick<TagEntryState, "lines" | "header">,
  scope: { companyId: string; branchId: string; deviceId: string },
): ReserveBodyDto {
  const putText = (target: Record<string, unknown>, name: string, value: string) => {
    if (value.trim() !== "") {
      target[name] = value.trim();
    }
  };
  const putNum = (target: Record<string, unknown>, name: string, value: string) => {
    if (value.trim() !== "") {
      target[name] = num(value);
    }
  };

  const lines: ReserveLineDto[] = [];
  state.lines.forEach((line, index) => {
    if (!isPending(line)) {
      return;
    }
    const dto: ReserveLineDto = {
      lineNo: index + 1,
      itemId: line.itemId,
      salePrice: num(line.price),
      qty: num(line.qty),
    };
    const open = dto as unknown as Record<string, unknown>;
    putText(open, "brandId", line.brandId);
    putText(open, "sizeId", line.sizeId);
    putText(open, "colourId", line.colourId);
    putText(open, "fabricId", line.fabricId);
    putText(open, "seasonId", line.seasonId);
    putText(open, "model", line.model);
    putText(open, "supplierArticle", line.supplierArticle);
    putText(open, "attrNote", line.attrNote);
    putNum(open, "mrp", line.mrp);
    putNum(open, "labelCost", line.cost);
    lines.push(dto);
  });

  const body: ReserveBodyDto = {
    companyId: scope.companyId,
    branchId: scope.branchId,
    deviceId: scope.deviceId,
    lines,
  };
  const open = body as unknown as Record<string, unknown>;
  putText(open, "seasonId", state.header.seasonId);
  putText(open, "supplierId", state.header.supplierId);
  return body;
}

/** The rows a payload's lines came from, in the order they are sent. */
export function sentLinesOf(state: Pick<TagEntryState, "lines">): SentLine[] {
  const sent: SentLine[] = [];
  state.lines.forEach((line, index) => {
    if (isPending(line)) {
      sent.push({ lineNo: index + 1, key: line.key });
    }
  });
  return sent;
}

export type ListName = { kind: ListKind; name: string; sizeSet: string };

/** `unresolvedNames()` — every typed list name without an id, once each. */
export function unresolvedNames(state: Pick<TagEntryState, "lines" | "header">): ListName[] {
  const out: ListName[] = [];
  const seen = new Set<string>();
  const add = (kind: ListKind, name: string, sizeSet: string) => {
    const trimmed = name.trim();
    const dedupe = `${kind}|${sizeSet}|${trimmed.toUpperCase()}`;
    if (!trimmed || seen.has(dedupe)) {
      return;
    }
    seen.add(dedupe);
    out.push({ kind, name: trimmed, sizeSet });
  };
  for (const line of state.lines) {
    if (!isPending(line)) {
      continue;
    }
    for (const kind of ["size", "colour", "fabric", "season"] as const) {
      const { name: nameField, id: idField } = LIST_FIELDS[kind];
      if (line[idField].trim() !== "") {
        continue;
      }
      const name = line[nameField];
      add(kind, name, kind === "size" ? sizeSetOf(name) : "");
    }
  }
  if (state.header.seasonId.trim() === "") {
    add("season", state.header.seasonText, "");
  }
  return out;
}

/** The first problem row in grid order, for the refusal to land focus on. */
export function firstServerProblemKey(state: Pick<TagEntryState, "lines" | "serverProblemKeys">): string | null {
  return state.lines.find((line) => state.serverProblemKeys.includes(line.key))?.key ?? null;
}
