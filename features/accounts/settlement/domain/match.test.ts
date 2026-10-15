import { describe, expect, it } from "vitest";
import { RAW_LEGS, RAW_PAYOUT } from "./fixtures";
import {
  chipLabels,
  confirmBody,
  firstCursor,
  legRows,
  lineCells,
  lineKey,
  lineStatusTone,
  linesTotalText,
  matchActions,
  ourRowText,
  payoutFacts,
  payoutKey,
  postQuestion,
  rowSide,
  statementSide,
  suggestCaption,
  suggestNote,
  visibleLines,
  voidQuestion,
  voucherNote,
  whyLines,
} from "./match";
import { parseLegs, parsePayout, parsePostedPayout } from "./parse";
import type { Payout, SettlementRights } from "./types";

const payout = parsePayout(RAW_PAYOUT) as Payout;
const lineOf = (id: string) => payout.lines.find((line) => line.aslId === id)!;
const ALL: SettlementRights = { canCreate: true, canEdit: true, canPost: true, canCancel: true, canOverride: true };
const scope = { companyId: "co-1", branchId: "br-1" };

describe("parsePayout", () => {
  it("brings every amount to paise and keeps the rest as sent", () => {
    expect(payout.totalNet).toBe(369860);
    expect(payout.lines).toHaveLength(6);
    expect(lineOf("l1").net).toBe(123672);
    expect(lineOf("l3").amountDiff).toBe(-9000);
    expect(lineOf("l2").tenderRow?.amount).toBe(199900);
    expect(lineOf("l5").tenderRow).toBeNull();
    expect(payout.counts).toEqual({ UNMATCHED: 1, SUGGESTED: 1, MATCHED: 3, IGNORED: 1, RESOLVED: 0 });
    expect(payout.voucherRefno).toBe("");
  });

  it("answers null for something that is not a payout", () => {
    expect(parsePayout({})).toBeNull();
    expect(parsePayout(null)).toBeNull();
  });

  it("reads the post's legs beside the payout", () => {
    const posted = parsePostedPayout({ ...RAW_PAYOUT, status: "POSTED", legs: RAW_LEGS });
    expect(posted?.payout.status).toBe("POSTED");
    expect(posted?.legs.map((leg) => leg.amount)).toEqual([1788932, 47006, 8462, 1644500, 199900]);
  });
});

describe("chips and the lines they show", () => {
  it("labels each chip with its count", () => {
    expect(chipLabels(payout)).toEqual({
      ALL: "All 6",
      MATCHED: "Matched 3",
      SUGGESTED: "Suggested 1",
      UNMATCHED: "Unmatched 1",
      PARTIAL: "Partial 1",
      OTHER: "Ignored 1 · Resolved 0",
    });
    expect(chipLabels(null).ALL).toBe("All 0");
  });

  it("filters by status, by a provider gap, and the ignored / resolved rest", () => {
    const ids = (chip: Parameters<typeof visibleLines>[1]) => visibleLines(payout, chip).map(({ line }) => line.aslId);
    expect(ids("ALL")).toEqual(["l1", "l2", "l3", "l4", "l5", "l6"]);
    expect(ids("MATCHED")).toEqual(["l1", "l3", "l4"]);
    expect(ids("PARTIAL")).toEqual(["l3"]);
    expect(ids("OTHER")).toEqual(["l6"]);
    expect(visibleLines(payout, "UNMATCHED")[0].index).toBe(4);
  });

  it("lands the cursor on the first suggestion, else the first line", () => {
    expect(firstCursor(visibleLines(payout, "ALL"))).toBe(1);
    expect(firstCursor(visibleLines(payout, "MATCHED"))).toBe(0);
    expect(firstCursor([])).toBe(-1);
  });
});

describe("a line, as the table shows it", () => {
  it("reads the line on India's clock with fee and GST together", () => {
    expect(lineCells(lineOf("l1"))).toEqual({
      time: "09:14 AM",
      terminal: "T1",
      kind: "SALE",
      ref: "428110012340",
      auth: "—",
      gross: "1,250.00",
      feeGst: "13.28",
      net: "1,236.72",
      status: "MATCHED",
      rule: "REF",
      ours: "bil01652",
    });
  });

  it("calls a matched line with a gap PARTIAL and names the gap", () => {
    const partial = lineCells(lineOf("l3"));
    expect(partial.status).toBe("PARTIAL");
    expect(partial.auth).toBe("M0X7QE · 5518");
    expect(partial.ours).toBe("bil00628   − 90.00");
    expect(lineStatusTone(lineOf("l3"))).toBe("partial");
    expect(lineStatusTone(lineOf("l2"))).toBe("warning");
    expect(lineStatusTone(lineOf("l5"))).toBe("danger");
    expect(lineStatusTone(lineOf("l6"))).toBe("muted");
  });

  it("shows a resolution instead of a row", () => {
    expect(ourRowText({ ...lineOf("l5"), resolution: "INCOME" })).toBe("resolved: INCOME");
  });

  it("totals the payout from the server's figures", () => {
    expect(linesTotalText(payout)).toBe("Total of the payout:  gross 3,779.00 · fee + GST 80.40 · net 3,698.60");
    expect(linesTotalText(null)).toBe("");
  });
});

describe("the suggestion panel", () => {
  const suggested = lineOf("l2");

  it("puts the line beside our row", () => {
    expect(suggestCaption(suggested)).toBe("Suggested match — confirm or reject");
    expect(suggestCaption(lineOf("l5"))).toBe("Unmatched line — pick our row, or ignore it");
    expect(suggestCaption(lineOf("l1"))).toBe("MATCHED line");
    expect(statementSide(suggested).map((fact) => fact.value)).toEqual([
      "12:18 PM",
      "T2",
      "428111022877",
      "K4P9TA · 2207",
      "1,999.00",
    ]);
    expect(rowSide(suggested.tenderRow)?.map((fact) => fact.value)).toEqual([
      "bil00590 · 12:21 PM",
      "428111028277",
      "K4P9TA · 2207",
      "1,999.00",
    ]);
    expect(rowSide(null)).toBeNull();
  });

  it("says why, and what differs", () => {
    expect(whyLines(suggested)).toEqual([
      { mark: "✓", text: "same tender and amount, close in time — the only candidate on either side" },
      { mark: "!", text: "RRN differs: keyed 428111028277, the line says 428111022877" },
    ]);
    expect(whyLines(lineOf("l3"))).toEqual([
      { mark: "✓", text: "same RRN / UTR as keyed on the bill" },
      { mark: "!", text: "the provider paid 2,010.00 against the row's 2,100.00 — the gap goes to Not received" },
    ]);
    expect(whyLines(lineOf("l5"))).toEqual([]);
    expect(suggestNote(suggested)).toMatch(/^Confirming matches it MANUAL-checked/);
    expect(suggestNote(lineOf("l1"))).toBe("");
  });
});

describe("which verbs are open", () => {
  it("follows the line's status on an open payout", () => {
    const suggested = matchActions(payout, lineOf("l2"), ALL, false);
    expect(suggested).toMatchObject({ runMatch: true, confirm: true, unlink: true, pickRow: true, ignore: true });
    const matched = matchActions(payout, lineOf("l1"), ALL, false);
    expect(matched).toMatchObject({ confirm: false, unlink: true, pickRow: false, ignore: false });
    const ignored = matchActions(payout, lineOf("l6"), ALL, false);
    expect(ignored).toMatchObject({ unlink: true, ignore: false });
    const unmatched = matchActions(payout, lineOf("l5"), ALL, false);
    expect(unmatched).toMatchObject({ confirm: false, unlink: false, pickRow: true, ignore: true });
  });

  it("holds Post while a suggestion waits, and says why", () => {
    const waiting = matchActions(payout, null, ALL, false);
    expect(waiting.post).toBe(false);
    expect(waiting.postTitle).toBe("1 suggestion(s) wait for a person — confirm or reject them first");
    const clear = { ...payout, counts: { ...payout.counts, SUGGESTED: 0 } };
    expect(matchActions(clear, null, ALL, false)).toMatchObject({ post: true, postTitle: "" });
  });

  it("closes the line verbs on a posted payout but leaves Void", () => {
    const posted = { ...payout, status: "POSTED" };
    expect(matchActions(posted, lineOf("l2"), ALL, false)).toMatchObject({
      runMatch: false,
      confirm: false,
      post: false,
      void: true,
    });
    expect(matchActions({ ...payout, status: "VOIDED" }, null, ALL, false).void).toBe(false);
  });

  it("reads the menu's rights and the busy flag", () => {
    const viewOnly: SettlementRights = { ...ALL, canCreate: false, canEdit: false, canPost: false, canCancel: false };
    expect(matchActions(payout, lineOf("l2"), viewOnly, false)).toMatchObject({
      runMatch: false,
      confirm: false,
      void: false,
      importFile: false,
    });
    expect(matchActions(payout, lineOf("l2"), ALL, true)).toMatchObject({ confirm: false, void: false });
    expect(matchActions(null, null, ALL, false)).toMatchObject({ runMatch: false, void: false, importFile: true });
  });
});

describe("the payout's facts and the voucher", () => {
  it("fills the facts strip, or asks for a payout", () => {
    expect(payoutFacts(payout)).toMatchObject({
      payout: "08-10-2026",
      utr: "HDFCN26281004417",
      lines: "6",
      net: "3,698.60",
      bankFile: ["bank: HDFC Current A/c 5021", "file: hdfc_settle_07102026.csv"],
    });
    expect(payoutFacts(null).bankFile[0]).toBe("Pick a payout above — or Import file… to bring in a provider statement.");
  });

  it("lists the legs with a balancing Total", () => {
    const rows = legRows(parseLegs(RAW_LEGS));
    expect(rows[1]).toEqual({ ledger: "Bank charges  (BANK_CHARGES)", dr: "470.06", cr: "" });
    expect(rows[3]).toEqual({ ledger: "Card clearing — HDFC", dr: "", cr: "16,445.00" });
    expect(rows.at(-1)).toEqual({ ledger: "Total", dr: "18,444.00", cr: "18,444.00", total: true });
    expect(legRows([])).toEqual([]);
  });

  it("notes the voucher", () => {
    expect(voucherNote({ ...payout, status: "POSTED", voucherRefno: "tst00014" }, [])).toBe("Posted as tst00014.");
    expect(voucherNote(payout, [])).toMatch(/^The voucher shows here once posted/);
  });

  it("asks before posting and voiding, in Qt's words", () => {
    expect(postQuestion(payout)).toBe(
      "Post the payout of 08-10-2026 (HDFCN26281004417)? One TSet voucher: Dr bank 3,698.60 · fee · GST on fee, " +
        "Cr each matched row's clearing ledger, the rest to Tender suspense. Matched rows become SETTLED " +
        "(PARTIAL when the provider paid another amount).",
    );
    expect(voidQuestion(payout)).toBe("Voiding drops this import; the file may be read again. Why?");
    expect(voidQuestion({ ...payout, status: "POSTED" })).toMatch(/^Voiding reverses the TSet/);
  });
});

describe("request bodies", () => {
  it("keys a payout and a line by the payout's year", () => {
    expect(payoutKey(scope, payout)).toEqual({ companyId: "co-1", branchId: "br-1", accYear: "2026-2027", asiId: "asi-1" });
    expect(lineKey(scope, payout, lineOf("l2"))).toEqual({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2026-2027",
      aslId: "l2",
    });
  });

  it("confirms as it stands, or links a picked row by hand", () => {
    expect(confirmBody(scope, payout, lineOf("l2"))).not.toHaveProperty("tdId");
    expect(confirmBody(scope, payout, lineOf("l5"), { tdId: "td-9", tdAccYear: "2026-2027" })).toEqual({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2026-2027",
      aslId: "l5",
      tdId: "td-9",
      tdAccYear: "2026-2027",
    });
  });
});
