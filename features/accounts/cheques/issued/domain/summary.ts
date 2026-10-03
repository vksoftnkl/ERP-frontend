/**
 * The five tiles — worked out on the CLIENT, because there is no summary route
 * for issued cheques (`/cheques/list` counts received ones only).
 *
 *   NOT PRESENTED        HELD and dated today or earlier — the party can bank it
 *   POST-DATED, OUT      HELD and dated after today
 *   RETURNED UNPAID      BOUNCED — the bills reopened; replace or pay otherwise
 *   BANK BOOK UNCLEARED  not presented + post-dated: what the bank book shows
 *                        paid that the bank statement does not yet
 *   LEAVES FREE          leaves left in the ACTIVE books
 *
 * They are read from grid 121 (HELD,BOUNCED for the scope and the bank filter,
 * page by page) and grid 120 (ACTIVE books). A read that stopped at its page
 * cap says so instead of presenting a partial sum as the whole.
 */
import type { ChequeBookListRow, IssuedChequeRow } from "../issued.types";

export type IssuedTile = { amount: number; count: number };

export type IssuedSummary = {
  notPresented: IssuedTile;
  postDated: IssuedTile;
  returned: IssuedTile;
  uncleared: IssuedTile;
  /** True when the read stopped at its page cap: the figures are a floor. */
  truncated: boolean;
};

function add(tile: IssuedTile, amount: number): IssuedTile {
  return { amount: Math.round((tile.amount + amount) * 100) / 100, count: tile.count + 1 };
}

const ZERO: IssuedTile = { amount: 0, count: 0 };

export function summariseIssued(rows: readonly IssuedChequeRow[], truncated: boolean): IssuedSummary {
  let notPresented = ZERO;
  let postDated = ZERO;
  let returned = ZERO;
  for (const row of rows) {
    const status = String(row.status).toUpperCase();
    if (status === "BOUNCED") {
      returned = add(returned, row.amount);
    } else if (status === "HELD") {
      if (String(row.state).toUpperCase() === "POST-DATED") {
        postDated = add(postDated, row.amount);
      } else {
        notPresented = add(notPresented, row.amount);
      }
    }
  }
  return {
    notPresented,
    postDated,
    returned,
    uncleared: {
      amount: Math.round((notPresented.amount + postDated.amount) * 100) / 100,
      count: notPresented.count + postDated.count,
    },
    truncated,
  };
}

export type LeavesSummary = {
  leaves: number;
  books: number;
  /** "book 004 · next 000124", "3 active books", or "no active book". */
  line: string;
};

export function summariseLeaves(books: readonly ChequeBookListRow[]): LeavesSummary {
  const active = books.filter((book) => String(book.status).toUpperCase() === "ACTIVE");
  const leaves = active.reduce((sum, book) => sum + book.leavesLeft, 0);
  if (active.length === 0) {
    return { leaves: 0, books: 0, line: "no active book" };
  }
  if (active.length === 1) {
    const book = active[0];
    return {
      leaves,
      books: 1,
      line: `book ${book.bookNo}${book.nextLeaf ? ` · next ${book.nextLeaf}` : ""}`,
    };
  }
  return { leaves, books: active.length, line: `${active.length} active books` };
}

export function countLine(count: number): string {
  if (count === 0) {
    return "none";
  }
  return `${count} ${count === 1 ? "cheque" : "cheques"}`;
}
