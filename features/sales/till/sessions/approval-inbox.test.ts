/**
 * Qt 425fa80 (notes 124 §5) on Till Sessions: the Waiting for approval
 * button, the inbox's pick across a refresh, and where Open takes each kind.
 */
import { describe, expect, it } from "vitest";
import { inboxRowKey } from "../shared/approval-gate";
import { cockpitHref } from "../shared/format";
import type { TillApprovalInboxItem } from "../shared/wire/types";
import {
  CANCEL_REQUEST_PROMPT,
  SAFE_GAP_TITLE,
  inboxButtonState,
  inboxOpenOf,
  inboxPickedIndex,
} from "./approval-inbox";

const SCOPE = { companyId: "co", branchId: "br" };

const item = (over: Partial<TillApprovalInboxItem> = {}): TillApprovalInboxItem => ({
  kind: "REQUEST",
  action: "approvals/decide",
  event: "EXPENSE",
  accYear: "2026-2027",
  tapId: "tap-1",
  tssId: "tss-1",
  tcmId: null,
  tvrId: null,
  safeId: null,
  sessionNo: "C01-261016-01",
  counterName: "Counter 1",
  safeName: null,
  amount: 1200,
  requiredRole: "SUPERVISOR",
  channel: "EITHER",
  twoPerson: false,
  requestedBy: "u-1",
  requestedByName: "ANU",
  requestedOn: "2026-10-16T10:00:00.000Z",
  expiresOn: null,
  srcDocType: "EXPENSE",
  srcDocId: "v-1",
  srcRefno: "ExpV/12",
  note: "petrol",
  afterClose: false,
  canDecide: true,
  cannotBecause: null,
  ...over,
});

describe("the Waiting for approval button", () => {
  it("counts what waits, primary while anything does", () => {
    expect(inboxButtonState(3)).toEqual({ text: "Waiting for approval (3)", primary: true });
    expect(inboxButtonState(0)).toEqual({ text: "Waiting for approval", primary: false });
  });

  it("stays plain until read, and when the read failed (Qt's -1)", () => {
    expect(inboxButtonState(null)).toEqual({ text: "Waiting for approval", primary: false });
    expect(inboxButtonState(-1)).toEqual({ text: "Waiting for approval", primary: false });
  });
});

describe("the inbox's pick", () => {
  const request = item();
  const gap = item({ kind: "SESSION_VARIANCE", tapId: null, tssId: "tss-2", event: "CASH_VARIANCE" });
  const bag = item({ kind: "RECEIVE_VARIANCE", tapId: null, tssId: "tss-2", tcmId: "m-1", tvrId: "v-9" });

  it("keeps the row picked before a refresh, wherever it moved", () => {
    expect(inboxPickedIndex([request, gap, bag], inboxRowKey(bag))).toBe(2);
    expect(inboxPickedIndex([bag, request], inboxRowKey(bag))).toBe(0);
    // A session's gap and its bag's are two rows, told apart by the bag.
    expect(inboxRowKey(gap)).not.toBe(inboxRowKey(bag));
  });

  it("falls back to the first row, and to none on an empty list", () => {
    expect(inboxPickedIndex([request, gap], null)).toBe(0);
    expect(inboxPickedIndex([request, gap], inboxRowKey(bag))).toBe(0);
    expect(inboxPickedIndex([], inboxRowKey(bag))).toBe(-1);
  });
});

describe("opening a row (Qt openRow)", () => {
  it("decides a request here", () => {
    const request = item();
    expect(inboxOpenOf(request, SCOPE)).toEqual({ kind: "decide", item: request });
  });

  it("sends a safe's count gap to Cash Office", () => {
    expect(inboxOpenOf(item({ kind: "SAFE_VARIANCE", tapId: null, tssId: null, safeName: "MAIN SAFE" }), SCOPE)).toEqual({
      kind: "info",
      title: SAFE_GAP_TITLE,
      text: "A safe's count gap is decided in Cash Office (287): open it, pick MAIN SAFE and use Decide.",
    });
  });

  it("opens a cash gap's session Cockpit on the inbox's company · branch and the row's year", () => {
    for (const kind of ["SESSION_VARIANCE", "RECEIVE_VARIANCE"] as const) {
      const opened = inboxOpenOf(item({ kind, tapId: null, accYear: "2025-2026", tssId: "tss-9" }), SCOPE);
      expect(opened).toEqual({
        kind: "cockpit",
        key: { companyId: "co", branchId: "br", accYear: "2025-2026", tssId: "tss-9" },
      });
      if (opened?.kind === "cockpit") {
        expect(cockpitHref(opened.key)).toBe("/sales/till/sessions/co/br/2025-2026/tss-9");
      }
    }
  });

  it("opens nothing for no row, or a gap with no session", () => {
    expect(inboxOpenOf(null, SCOPE)).toBeNull();
    expect(inboxOpenOf(item({ kind: "SESSION_VARIANCE", tssId: null }), SCOPE)).toBeNull();
  });

  it("asks Qt's question before cancelling one's own request", () => {
    expect(CANCEL_REQUEST_PROMPT).toBe("Why do you no longer need it? (optional)");
  });
});
