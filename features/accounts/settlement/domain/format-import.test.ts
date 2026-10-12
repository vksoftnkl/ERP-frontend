import { describe, expect, it } from "vitest";
import { RAW_TEST } from "./fixtures";
import {
  emptyFormatForm,
  formFromFormat,
  formatFromForm,
  formatTestSummary,
  sameFormat,
  savedMapOf,
  settlesText,
  terminalText,
} from "./format-map";
import {
  IMPORT_REFUSES,
  buildMultipart,
  formatStateText,
  importEnabled,
  importFields,
  readRefusedText,
  readSummary,
  testFields,
} from "./import-read";
import { parseFormatPayload, parseFormatTest } from "./parse";

/** The UPI map snap_settle_flow types in. */
const UPI_MAP = {
  version: 1,
  source: "UPI",
  provider: "KVB UPI",
  columns: {
    txnOn: "Txn Date",
    refNo: "UTR",
    gross: "Amount",
    fee: "MDR",
    tax: "GST",
    net: "Net",
    kind: "Type",
    payoutRef: "Payout UTR",
    payoutDate: "Settled On",
  },
  kindMap: { SALE: ["Sale"], REFUND: ["Refund"] },
  dateFormat: "DD/MM/YYYY HH:mm:ss",
  negativeIsRefund: true,
};

describe("the column map form", () => {
  it("round-trips a saved map", () => {
    const form = formFromFormat(parseFormatPayload({ format: UPI_MAP }).format);
    expect(form.columns.gross).toBe("Amount");
    expect(form.columns.vpa).toBe("");
    expect(form.kinds.SALE).toBe("Sale");
    expect(form.kinds.FEE).toBe("");
    expect(sameFormat(formatFromForm(form), parseFormatPayload({ format: UPI_MAP }).format)).toBe(true);
  });

  it("writes what Qt's format() writes: blanks out, words split and trimmed", () => {
    const form = {
      ...emptyFormatForm(),
      provider: "  HDFC  ",
      columns: { ...emptyFormatForm().columns, gross: " Txn Amount ", terminalId: "TID" },
      kinds: { ...emptyFormatForm().kinds, REFUND: "RFND, Void ,, " },
    };
    expect(formatFromForm(form)).toEqual({
      version: 1,
      source: "CARD",
      provider: "HDFC",
      columns: { gross: "Txn Amount", terminalId: "TID" },
      negativeIsRefund: true,
      kindMap: { REFUND: ["RFND", "Void"] },
    });
    const bare = formatFromForm(emptyFormatForm());
    expect(bare).not.toHaveProperty("kindMap");
    expect(bare).not.toHaveProperty("dateFormat");
  });

  it("notices an unsaved edit, whatever the key order", () => {
    const saved = savedMapOf(parseFormatPayload({ format: UPI_MAP }));
    const form = formFromFormat(saved);
    expect(sameFormat(formatFromForm(form), saved)).toBe(true);
    expect(sameFormat(formatFromForm({ ...form, provider: "KVB" }), saved)).toBe(false);
    expect(sameFormat(formatFromForm(form), null)).toBe(false);
    expect(savedMapOf(parseFormatPayload({ format: null }))).toBeNull();
  });

  it("describes the tender", () => {
    const payload = parseFormatPayload({ terminalId: "DASd", upiVpa: "Vktech@kvb.in", settlementLedgerId: "led", settlementDays: 1 });
    expect(terminalText(payload)).toBe("DASd · Vktech@kvb.in");
    expect(terminalText(parseFormatPayload({}))).toBe("— none (one tender for the shop)");
    expect(settlesText(payload)).toBe("the tender's settlement ledger · 1 day(s)");
    expect(settlesText(parseFormatPayload({}))).toMatch(/^⚠ no settlement \(bank\) ledger/);
  });

  it("sums up a test run", () => {
    expect(formatTestSummary(parseFormatTest(RAW_TEST))).toEqual({
      ok: true,
      summary: "✓  3 line(s) read · 0 error(s) · 1 payout(s)",
      problems: [],
    });
    const bad = formatTestSummary(
      parseFormatTest({ lines: [], problems: [{ lineNo: 4, message: 'gross "x" is not an amount' }], payouts: [] }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.problems).toEqual(['line 4: gross "x" is not an amount']);
  });
});

describe("Read file", () => {
  it("adds up what the file says the way the server signs it", () => {
    const summary = readSummary(parseFormatTest(RAW_TEST));
    expect(summary).toMatchObject({
      rows: "3",
      payouts: "1",
      utr: "UTR1",
      date: "2026-10-08",
      gross: "800.00",
      fee: "367.28",
      tax: "66.11",
      net: "366.61",
      readOk: true,
      fileHasDate: true,
    });
    expect(summary.checks).toEqual([
      "✓ every line read with the tender's map: 3 line(s)",
      "✓ payout UTR1 of 2026-10-08: 3 line(s), net 366.61",
      "! 1 FEE line(s) — kept, recognised by the kind map",
      "! 1 REFUND / CHARGEBACK line(s) — taken off the gross",
      IMPORT_REFUSES,
    ]);
  });

  it("says when the sample stops at 200 lines, and when payouts have no date", () => {
    const capped = readSummary(
      parseFormatTest({
        ...RAW_TEST,
        payouts: [
          { payoutRef: null, payoutDate: null, lines: 250, net: 10 },
          { payoutRef: "U2", payoutDate: "2026-10-09", lines: 50, net: 5 },
        ],
      }),
    );
    expect(capped.rows).toBe("300 (first 3 shown)");
    expect(capped.fileHasDate).toBe(false);
    expect(capped.checks).toContain("! 2 payouts in the file — one import each");
    expect(capped.checks).toContain("! gross / fee / GST above are of the first 3 lines; the net is the whole file's");
    expect(capped.checks.at(-1)).toBe("! the file names no payout date — give it below");
  });

  it("refuses an import over a problem or an empty file", () => {
    expect(readSummary(parseFormatTest({ ...RAW_TEST, problems: [{ lineNo: 2, message: "bad" }] })).readOk).toBe(false);
    expect(readSummary(parseFormatTest({ lines: [], problems: [], payouts: [] })).readOk).toBe(false);
    expect(readRefusedText("SETTLEMENT_FORMAT_MISSING", "x")).toBe("✗ this tender has no column map — Statement format… first");
    expect(readRefusedText("SETTLEMENT_NOT_FOUND", "No such tender")).toBe("✗ No such tender");
  });

  it("opens Import only on a clean read with a payout date", () => {
    expect(importEnabled({ busy: false, readOk: true, fileHasDate: true, payoutDateOn: false })).toBe(true);
    expect(importEnabled({ busy: false, readOk: true, fileHasDate: false, payoutDateOn: false })).toBe(false);
    expect(importEnabled({ busy: false, readOk: true, fileHasDate: false, payoutDateOn: true })).toBe(true);
    expect(importEnabled({ busy: true, readOk: true, fileHasDate: true, payoutDateOn: false })).toBe(false);
    expect(importEnabled({ busy: false, readOk: false, fileHasDate: true, payoutDateOn: false })).toBe(false);
  });

  it("names the tender's state", () => {
    expect(formatStateText(null)).toBe("—");
    expect(formatStateText({ settlementLedgerId: "" })).toMatch(/^⚠ no settlement \(bank\) ledger on this tender/);
    expect(formatStateText({ settlementLedgerId: "led" })).toBe("the tender's own column map (Statement format…)");
  });
});

describe("multipart", () => {
  it("sends only the DTO's fields, the optional ones only when given", () => {
    expect(testFields("co", "tnd")).toEqual([
      ["companyId", "co"],
      ["tenderId", "tnd"],
    ]);
    expect(
      importFields({
        companyId: "co",
        tenderId: "tnd",
        branchId: "br",
        payoutRef: "  ",
        payoutDateOn: false,
        payoutDate: "2026-10-08",
        notes: "",
      }),
    ).toEqual([
      ["companyId", "co"],
      ["tenderId", "tnd"],
      ["branchId", "br"],
    ]);
    expect(
      importFields({
        companyId: "co",
        tenderId: "tnd",
        branchId: "br",
        payoutRef: " UTR9 ",
        payoutDateOn: true,
        payoutDate: "2026-10-08",
        notes: " re-issued ",
      }),
    ).toEqual([
      ["companyId", "co"],
      ["tenderId", "tnd"],
      ["branchId", "br"],
      ["payoutRef", "UTR9"],
      ["payoutDate", "2026-10-08"],
      ["notes", "re-issued"],
    ]);
  });

  it("puts the text parts first and the file as the one `file` part, bytes untouched", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x2c, 0x0a, 0xe9]);
    const body = buildMultipart(testFields("co", "tnd"), new Blob([bytes], { type: "text/csv" }), "hdfc.csv");
    expect([...body.keys()]).toEqual(["companyId", "tenderId", "file"]);
    const file = body.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe("hdfc.csv");
    expect(new Uint8Array(await (file as Blob).arrayBuffer())).toEqual(bytes);
  });
});
