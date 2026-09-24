/**
 * The one mutable thing on this screen.
 *
 * Three rules carried over from the Qt build, each of which cost something to
 * learn:
 *
 *  - **`billsByParty` survives navigating between parties.** Edit party A,
 *    click party B, save — and A must still be saved. That is the entire reason
 *    the map exists rather than one "current breakup" array.
 *  - **Nothing derived is written back, and no column the server owns is cached
 *    beside it.** Everything repaints from the answer after each save.
 *  - **A bill-wise row's figure is not editable, at the reducer as well as at
 *    the cell.** The cell is disabled AND `SET_AMOUNT` refuses it: the Qt screen
 *    needed both, and the reason survives the port — the figure belongs to
 *    `POST /bills`, which rewrites it in the same transaction.
 */
import { isBlankLedgerRow, partyNet, toPaise } from "../derived";
import type {
  BillRow,
  LedgerRow,
  OpeningBillsPayload,
  OpeningListPayload,
  OpeningSource,
  Scope,
  ShownSide,
  TrialBalance,
} from "../opening-balance.types";
import { EMPTY_TRIAL_BALANCE } from "../derived";
import type { Problem } from "../validate";
import { blankBillRow, blankLedgerRow, parseBillRows, parseLedgerRows } from "../wire/parse";

export type OpeningDraft = {
  scope: Scope;
  /** The model of record, in grid order, always ending in one blank row. */
  rows: LedgerRow[];
  /** Ledgers under a nature-less group: listed, counted by nobody. */
  unclassified: string[];
  /** The server's last word, kept BESIDE ours rather than merged into it. */
  server: TrialBalance;
  /** Every breakup opened this session, whichever party is on screen now. */
  billsByParty: Record<string, BillRow[]>;
  opIdByParty: Record<string, string>;
  /**
   * What `GET /bills` said about the tie WHEN each breakup loaded. `false` can
   * only mean the rows were written around the route, since `POST /bills`
   * rewrites `op_amount` in the same transaction — so it is a warning about the
   * DATA, never the live figure, which is computed from the rows on screen.
   */
  tiedByParty: Record<string, boolean>;
  dirtyParties: string[];
  currentParty: string | null;
  dirty: boolean;
  loaded: boolean;
  /**
   * What the last save attempt refused, kept HERE rather than in a second
   * `useState`: a fresh `/list` answer has to clear them, and a list that
   * outlives the rows it was computed from names ledgers that are no longer on
   * screen.
   */
  problems: Problem[];
};

export function initialDraft(scope: Scope): OpeningDraft {
  return {
    scope,
    rows: [blankLedgerRow()],
    unclassified: [],
    server: EMPTY_TRIAL_BALANCE,
    billsByParty: {},
    opIdByParty: {},
    tiedByParty: {},
    dirtyParties: [],
    currentParty: null,
    dirty: false,
    loaded: false,
    problems: [],
  };
}

/** Refusals the reducer wants the screen to say out loud. */
export type DraftRefusal = { message: string };

export type PickedLedger = {
  ledId: string;
  ledName: string;
  groupName: string;
  groupNature: string;
  isBillWise: boolean;
};

export type DraftAction =
  /** A fresh `/list` answer for the CURRENT scope. Repaints everything. */
  | { type: "LOADED"; payload: OpeningListPayload }
  /** The scope combo moved: every cached breakup is meaningless in the new set. */
  | { type: "SCOPE_CHANGED"; scope: Scope }
  | { type: "SET_AMOUNT"; key: string; amount: number }
  | { type: "SET_SIDE"; key: string; side: ShownSide }
  | { type: "SET_REMARKS"; key: string; remarks: string }
  | { type: "PICK_LEDGER"; key: string; ledger: PickedLedger }
  | { type: "REMOVE_ROW"; key: string }
  | { type: "SELECT_PARTY"; partyId: string | null }
  | { type: "BILLS_LOADED"; partyId: string; payload: OpeningBillsPayload }
  | { type: "SET_BILL_FIELD"; partyId: string; key: string; patch: Partial<BillRow> }
  | { type: "REMOVE_BILL"; partyId: string; key: string }
  /** A save went through: the server's counts are in, everything is clean. */
  | { type: "SAVED"; trialBalance: TrialBalance; savedParties: string[] }
  /** What validation refused, or `[]` once it is satisfied. */
  | { type: "PROBLEMS"; problems: Problem[] };

export type DraftResult = { draft: OpeningDraft; refusal?: DraftRefusal };

/**
 * One blank row always trails the grid, and only one. This is an invariant of
 * the reducer rather than of the grid, so there is no "add row" button and no
 * `length - 1` off-by-one anywhere in the payload builders or the validation.
 */
function withTrailingBlankRow(rows: LedgerRow[]): LedgerRow[] {
  const kept = rows.filter((row) => !isBlankLedgerRow(row));
  return [...kept, blankLedgerRow()];
}

function withTrailingBlankBill(bills: BillRow[]): BillRow[] {
  const last = bills[bills.length - 1];
  const hasBlank = last !== undefined && last.ablId === null && last.docRefno.trim() === "";
  return hasBlank ? bills : [...bills, blankBillRow()];
}

function replaceRow(rows: LedgerRow[], key: string, patch: Partial<LedgerRow>): LedgerRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

/**
 * An edit to a CARRY_FORWARD figure makes it MANUAL, on screen, immediately.
 *
 * The server flips it anyway and reports it under `flippedToManual`, but the
 * operator should see what they have just done to a derived figure BEFORE they
 * save it, not in a count afterwards.
 */
function flipSourceOnEdit(source: OpeningSource | null): OpeningSource | null {
  return source === "CARRY_FORWARD" ? "MANUAL" : source;
}

function addDirtyParty(parties: string[], partyId: string): string[] {
  return parties.includes(partyId) ? parties : [...parties, partyId];
}

/**
 * The ledger row of a bill-wise party, repainted from its bills.
 *
 * The tie is true by construction once saved — `POST /bills` rewrites
 * `op_amount` in the same transaction — so showing anything else while the
 * operator types would be a figure the save then silently corrects.
 */
function mirrorPartyNet(rows: LedgerRow[], partyId: string, bills: BillRow[]): LedgerRow[] {
  const net = partyNet(bills);
  return rows.map((row) =>
    row.ledId === partyId ? { ...row, amount: net.amount, drCr: net.side } : row,
  );
}

export function draftReducer(state: OpeningDraft, action: DraftAction): DraftResult {
  switch (action.type) {
    case "LOADED": {
      const payload = action.payload;
      const rows = parseLedgerRows(payload.rows);
      return {
        draft: {
          ...state,
          rows,
          unclassified: payload.unclassified.map((entry) => entry.ledName),
          server: payload.trialBalance,
          // A reload is the server's answer becoming the truth again. Breakups
          // are refetched from it, so nothing stale rides along.
          billsByParty: {},
          opIdByParty: {},
          tiedByParty: {},
          dirtyParties: [],
          // An open panel stays open across a reload — unless the row it was
          // opened on is no longer in the set, which is what a removal + save
          // leaves behind.
          currentParty: rows.some((row) => row.ledId === state.currentParty)
            ? state.currentParty
            : null,
          dirty: false,
          loaded: true,
          problems: [],
        },
      };
    }

    case "SCOPE_CHANGED": {
      // A company-level set and a branch set share no rows and no bills. Every
      // cached breakup means nothing in the other, so none of it is carried.
      return { draft: { ...initialDraft(action.scope) } };
    }

    case "SET_AMOUNT": {
      const row = state.rows.find((candidate) => candidate.key === action.key);
      if (!row) {
        return { draft: state };
      }
      if (row.isBillWise) {
        return {
          draft: state,
          refusal: {
            message: `"${row.ledName}" is a bill-by-bill party — its opening is the net of its opening bills. Key them in the breakup panel.`,
          },
        };
      }
      if (row.ledId === "") {
        return {
          draft: state,
          refusal: { message: "Pick a ledger on this row first — an amount with no account is not an opening balance." },
        };
      }
      const amount = Number.isFinite(action.amount) ? Math.max(0, action.amount) : 0;
      // A figure needs a side. The prior closing's side is the informed guess;
      // `Dr` — what an asset opens on — is the fallback.
      const side: ShownSide =
        row.drCr !== "" ? row.drCr : row.priorClosingSide !== "" ? row.priorClosingSide : "Dr";
      return {
        draft: {
          ...state,
          rows: replaceRow(state.rows, action.key, {
            amount,
            drCr: toPaise(amount) === 0 ? row.drCr : side,
            source: flipSourceOnEdit(row.source),
          }),
          dirty: true,
        },
      };
    }

    case "SET_SIDE": {
      const row = state.rows.find((candidate) => candidate.key === action.key);
      if (!row || row.ledId === "") {
        return { draft: state };
      }
      if (row.isBillWise) {
        return {
          draft: state,
          refusal: {
            message: `"${row.ledName}" is a bill-by-bill party — its side comes from the net of its bills.`,
          },
        };
      }
      return {
        draft: {
          ...state,
          rows: replaceRow(state.rows, action.key, {
            drCr: action.side,
            source: flipSourceOnEdit(row.source),
          }),
          dirty: true,
        },
      };
    }

    case "SET_REMARKS": {
      const row = state.rows.find((candidate) => candidate.key === action.key);
      if (!row || row.ledId === "") {
        return { draft: state };
      }
      // A remark is a note about the figure, not the figure: it does not flip
      // a CARRY_FORWARD row to MANUAL.
      return {
        draft: {
          ...state,
          rows: replaceRow(state.rows, action.key, { remarks: action.remarks }),
          dirty: true,
        },
      };
    }

    case "PICK_LEDGER": {
      const { ledger } = action;
      const existingIndex = state.rows.findIndex((row) => row.ledId === ledger.ledId);
      if (existingIndex >= 0) {
        // `ux_op_scope` — one opening per ledger per scope per year. Naming the
        // row is the difference between a refusal and a mystery.
        return {
          draft: state,
          refusal: {
            message: `"${ledger.ledName}" is already row ${existingIndex + 1}. A ledger opens once per year.`,
          },
        };
      }
      const rows = withTrailingBlankRow(
        replaceRow(state.rows, action.key, {
          ledId: ledger.ledId,
          ledName: ledger.ledName,
          groupName: ledger.groupName,
          groupNature: ledger.groupNature,
          isBillWise: ledger.isBillWise,
          // Picked by hand, so MANUAL. The server owns the column and will
          // correct this if it disagrees.
          source: "MANUAL",
          drCr: ledger.isBillWise ? "" : "Dr",
        }),
      );
      return {
        draft: {
          ...state,
          rows,
          // A pick is not yet an opening: the row carries no figure. The screen
          // goes dirty when a figure or a bill does.
          currentParty: ledger.isBillWise ? ledger.ledId : state.currentParty,
        },
      };
    }

    case "REMOVE_ROW": {
      const row = state.rows.find((candidate) => candidate.key === action.key);
      if (!row || isBlankLedgerRow(row)) {
        return { draft: state };
      }
      if (row.isBillWise && row.billCount > 0) {
        return {
          draft: state,
          refusal: {
            message: `"${row.ledName}" has ${row.billCount} opening bill(s), which own its figure — the server would keep the row anyway. Open the breakup, remove the bills, save, then remove the row.`,
          },
        };
      }
      const rows = withTrailingBlankRow(state.rows.filter((candidate) => candidate.key !== action.key));
      const closesPanel = state.currentParty === row.ledId;
      const billsByParty = { ...state.billsByParty };
      delete billsByParty[row.ledId];
      return {
        draft: {
          ...state,
          rows,
          billsByParty,
          dirtyParties: state.dirtyParties.filter((partyId) => partyId !== row.ledId),
          currentParty: closesPanel ? null : state.currentParty,
          dirty: true,
        },
      };
    }

    case "SELECT_PARTY": {
      return { draft: { ...state, currentParty: action.partyId } };
    }

    case "BILLS_LOADED": {
      // A late answer for party A fills A's cache entry and nothing else — it
      // cannot paint under B's name, because the panel renders from
      // `billsByParty[currentParty]`. So there is no "is this still current?"
      // check and no discard: the write is harmless and already cached.
      if (state.dirtyParties.includes(action.partyId)) {
        // Unsaved work on this party outranks a refetch of it.
        return { draft: state };
      }
      const bills = parseBillRows(action.payload.bills);
      return {
        draft: {
          ...state,
          billsByParty: { ...state.billsByParty, [action.partyId]: bills },
          opIdByParty: action.payload.opId
            ? { ...state.opIdByParty, [action.partyId]: action.payload.opId }
            : state.opIdByParty,
          tiedByParty: { ...state.tiedByParty, [action.partyId]: action.payload.isTied !== false },
          rows: mirrorPartyNet(state.rows, action.partyId, bills),
        },
      };
    }

    case "SET_BILL_FIELD": {
      const bills = state.billsByParty[action.partyId];
      if (!bills) {
        return { draft: state };
      }
      const next = withTrailingBlankBill(
        bills.map((bill) => (bill.key === action.key ? { ...bill, ...action.patch } : bill)),
      );
      return {
        draft: {
          ...state,
          billsByParty: { ...state.billsByParty, [action.partyId]: next },
          dirtyParties: addDirtyParty(state.dirtyParties, action.partyId),
          rows: mirrorPartyNet(state.rows, action.partyId, next),
          dirty: true,
        },
      };
    }

    case "REMOVE_BILL": {
      const bills = state.billsByParty[action.partyId];
      if (!bills) {
        return { draft: state };
      }
      const bill = bills.find((candidate) => candidate.key === action.key);
      if (!bill) {
        return { draft: state };
      }
      if (bill.isFrozen) {
        return {
          draft: state,
          refusal: {
            message: `"${bill.docRefno}" has been receipted against. Reverse the receipt, or write the balance off — either leaves a trail; deleting the invoice does not.`,
          },
        };
      }
      const next = withTrailingBlankBill(bills.filter((candidate) => candidate.key !== action.key));
      return {
        draft: {
          ...state,
          billsByParty: { ...state.billsByParty, [action.partyId]: next },
          dirtyParties: addDirtyParty(state.dirtyParties, action.partyId),
          rows: mirrorPartyNet(state.rows, action.partyId, next),
          dirty: true,
        },
      };
    }

    case "SAVED": {
      // A party whose `/bills` was REFUSED stays dirty, so the operator can fix
      // it and save again without retyping what already went through — and the
      // screen stays dirty with it, because there IS still unsaved work.
      const stillDirty = state.dirtyParties.filter(
        (partyId) => !action.savedParties.includes(partyId),
      );
      return {
        draft: {
          ...state,
          server: action.trialBalance,
          dirtyParties: stillDirty,
          dirty: stillDirty.length > 0,
        },
      };
    }

    case "PROBLEMS": {
      return { draft: { ...state, problems: action.problems } };
    }

    default:
      return { draft: state };
  }
}
