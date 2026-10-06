/**
 * Collecting a temp credit — the receipt opened FROM the Temp Credits register
 * (menu 257's Receive, F5), the Qt `ReceiptEntry::applyOpenArgs`.
 *
 * There is no separate collection form: a temp credit is the bill's pending
 * amount on the ledger the bill was raised on (usually a walk-in ledger), so it
 * is collected by an ordinary receipt against that one bill. The register
 * hands over who and which bill; the receipt opens on that party, shows only
 * the borrower's temp-credit bills (`/receipts/open-items?mobile=`), and ticks
 * the bill at its balance.
 *
 * The hand-over travels in the URL so the register and the receipt stay two
 * routes, and a link to "collect this one" is something the browser can hold.
 * Pure: no React, no network.
 */
import type { BillRow } from "../receipt.types";

export const RECEIPT_ROUTE = "/accounts/receipt";

/** The marker that says the query is a collection, not stray parameters. */
const COLLECT_FLAG = "collect";

export type TempCreditCollect = {
  /** The ledger the bill was raised on (`acc_bill_balance.abl_party_id`). */
  partyId: string;
  partyName: string;
  /** The borrower's mobile — what the counter knows them by. May be blank. */
  mobile: string;
  /** The bill-balance row to tick (`atc_abl_id`). */
  billId: string;
  /** The bill number, for the messages. */
  ref: string;
  /** The borrower's name, for the notice. */
  name: string;
};

export function buildReceiptCollectHref(args: TempCreditCollect): string {
  const query = new URLSearchParams({
    [COLLECT_FLAG]: "1",
    partyId: args.partyId,
    partyName: args.partyName,
    mobile: args.mobile,
    billId: args.billId,
    ref: args.ref,
    name: args.name,
  });
  return `${RECEIPT_ROUTE}?${query.toString()}`;
}

/** The collection a receipt URL asks for, or null when it asks for none. */
export function parseReceiptCollect(
  params: Pick<URLSearchParams, "get"> | null | undefined,
): TempCreditCollect | null {
  if (!params || params.get(COLLECT_FLAG) !== "1") {
    return null;
  }
  const text = (key: string) => (params.get(key) ?? "").trim();
  const partyId = text("partyId");
  if (!partyId) {
    return null;
  }
  return {
    partyId,
    partyName: text("partyName"),
    mobile: text("mobile"),
    billId: text("billId"),
    ref: text("ref"),
    name: text("name"),
  };
}

/**
 * What the ticked bill receives: everything still pending, less what this
 * receipt already takes off it another way. Typed as the operator's figure,
 * so Auto-allocate works around it.
 */
export function tempCreditReceive(
  bill: Pick<BillRow, "pendingAmount" | "discount" | "writeOff" | "roundOff">,
): number {
  const value = bill.pendingAmount - bill.discount - bill.writeOff - bill.roundOff;
  return Math.max(0, Math.round(value * 100) / 100);
}

/** The title-row notice once the borrower's bills are on screen. */
export function collectNotice(
  mobile: string,
  borrower: string,
  partyName: string,
  billCount: number,
): string | null {
  if (!mobile) {
    return null;
  }
  const party = partyName || "this party";
  if (billCount === 0) {
    return `No open temp credit on ${party} for mobile ${mobile}. Clear the mobile to see every bill.`;
  }
  const who = borrower || "this borrower";
  return (
    `Temp credit · ${borrower || mobile} — showing only ${who}'s temp-credit bills ` +
    `(mobile ${mobile}). Clear the mobile to see every bill of ${party}.`
  );
}
