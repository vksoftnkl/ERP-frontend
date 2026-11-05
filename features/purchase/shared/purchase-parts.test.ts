import { describe, expect, it } from "vitest";
import {
  purchaseIssueRows,
  purchaseNotesCount,
  purchaseNotesOf,
  purchaseNotesTitle,
  purchaseSourceRows,
  purchaseStatusLabel,
  purchaseStatusTone,
  quickActionTitle,
  toggleMoreColumn,
  transportBandOf,
  transportFormOf,
  transportSummary,
} from "./purchase-parts";

describe("purchaseIssueRows", () => {
  it("orders warnings first, dedupes, strips PUR_ and counts", () => {
    const out = purchaseIssueRows(
      [
        { code: "PUR_SHORT_QTY", level: "WARN", message: "Line 2 short" },
        { code: "PUR_RATE_ABOVE_PO", level: "WARN", message: "Line 3 above PO", needsRight: "OVERRIDE" },
      ],
      [
        { code: "PUR_SERIAL_COUNT", message: "Line 6: 4 valid serials" },
        { code: "PUR_SHORT_QTY", level: "WARN", message: "Line 2 short" },
      ],
    );
    expect(out.rows.map((r) => r.shortCode)).toEqual(["SHORT_QTY", "RATE_ABOVE_PO", "SERIAL_COUNT"]);
    expect(out.rows[2].refuse).toBe(true);
    expect(out.refusals).toBe(1);
    expect(out.overridable).toBe(1);
  });
  it("a REFUSE never counts as overridable", () => {
    expect(purchaseIssueRows([], [{ code: "X", level: "REFUSE", needsRight: "OVERRIDE", message: "m" }]).overridable).toBe(0);
  });
  it("empty input → no rows", () => {
    expect(purchaseIssueRows(null, undefined).rows).toEqual([]);
  });
});

describe("transport band", () => {
  it("round-trips and drops blanks", () => {
    const form = transportFormOf({ lrNo: "88412", transporterName: "KPN Parcel", distanceKm: 120, lrDate: "2026-10-24T00:00:00.000Z", mode: "ROAD" });
    expect(form.lrDate).toBe("2026-10-24");
    expect(form.distanceKm).toBe("120");
    const band = transportBandOf({ ...form, vehicleNo: "tn38ab1234" });
    expect(band).toEqual({
      mode: "ROAD",
      transporterName: "KPN Parcel",
      lrNo: "88412",
      lrDate: "2026-10-24",
      distanceKm: 120,
      vehicleNo: "TN38AB1234",
      driverName: null,
    });
    expect(transportSummary(band)).toBe("LR 88412 · KPN Parcel · 24/10/2026 · Road · 120 km · TN38AB1234");
  });
  it("all blank → null (remove the band)", () => {
    expect(transportBandOf(transportFormOf(null))).toBeNull();
    expect(transportBandOf(transportFormOf(null), false)).toBeNull();
  });
  it("without crew never sends vehicle / driver", () => {
    const band = transportBandOf({ ...transportFormOf(null), lrNo: "1", vehicleNo: "X" }, false);
    expect(band).toEqual({ lrNo: "1" });
  });
});

describe("status pill", () => {
  it("tones", () => {
    expect(purchaseStatusTone("DRAFT")).toBe("warning");
    expect(purchaseStatusTone("POSTED")).toBe("success");
    expect(purchaseStatusTone("PART_RECEIVED")).toBe("info");
    expect(purchaseStatusTone("CANCELLED")).toBe("danger");
    expect(purchaseStatusLabel("PART_RECEIVED")).toBe("PART RECEIVED");
  });
});

describe("more columns / source rows", () => {
  it("toggles", () => {
    expect(toggleMoreColumn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleMoreColumn(["a", "b"], "a")).toEqual(["b"]);
  });
  it("adds a heading per kind", () => {
    const rows = purchaseSourceRows([
      { kind: "GRN", id: "1", text: "GRN 1" },
      { kind: "GRN", id: "2", text: "GRN 2" },
      { kind: "PO", id: "3", text: "PO 3" },
    ]);
    expect(rows.map((r) => r.type)).toEqual(["heading", "choice", "choice", "heading", "choice"]);
  });
});

describe("quickActionTitle", () => {
  it("the tip with its key; while disabled, why not", () => {
    expect(quickActionTitle({ label: "Versions", keyHint: "F4" })).toBe("Versions  (F4)");
    expect(quickActionTitle({ label: "Make GRN", tip: "Make GRN — goods came", keyHint: "Ctrl+G" })).toBe("Make GRN — goods came  (Ctrl+G)");
    expect(quickActionTitle({ label: "Make GRN", tip: "Make GRN — goods came", keyHint: "Ctrl+G", disabled: true, disabledReason: "a posted order makes a GRN" })).toBe(
      "Make GRN — a posted order makes a GRN  (Ctrl+G)",
    );
    expect(quickActionTitle({ label: "Print", disabled: true })).toBe("Print");
  });
});

describe("COM-09 notes (Qt purchase_notes)", () => {
  const warnings = [
    { code: "PUR_RATE_ABOVE_PO", level: "WARN", lineNo: 4, message: "Line 4 Surf Excel 1kg: 118.00 is above the PO", needsRight: "OVERRIDE" },
    { code: "PUR_SHORT_QTY", level: "WARN", field: "lines.1.receivedQty", message: "Line 2: 2 cases short" },
  ];
  const refusals = [{ code: "PUR_NO_GODOWN", message: "Pick the godown." }];

  it("puts the refusals first, reads the line and drops the server's Line N", () => {
    const out = purchaseNotesOf(warnings, refusals);
    expect(out.notes.map((note) => [note.code, note.refuse, note.line, note.text, note.overridable])).toEqual([
      ["PUR_NO_GODOWN", true, null, "Pick the godown.", false],
      ["PUR_RATE_ABOVE_PO", false, 4, "Surf Excel 1kg: 118.00 is above the PO", true],
      ["PUR_SHORT_QTY", false, 2, "2 cases short", false],
    ]);
    expect([out.refusals, out.warnings, out.overridable]).toEqual([1, 2, 1]);
  });

  it("counts for the footer and titles the popup", () => {
    expect(purchaseNotesCount({ refusals: 0, warnings: 2 })).toBe("2 warnings");
    expect(purchaseNotesCount({ refusals: 1, warnings: 1 })).toBe("1 refused · 1 warning");
    expect(purchaseNotesCount({ refusals: 0, warnings: 0 })).toBe("");
    expect(purchaseNotesTitle({ refusals: 0, warnings: 2 }, { verb: "post" })).toBe("Before you post — 2 warnings");
    expect(purchaseNotesTitle({ refusals: 1, warnings: 0 }, { refused: "save" })).toBe("Not saved — 1 refusal");
    expect(purchaseNotesTitle({ refusals: 0, warnings: 1 }, null)).toBe("Validation — 1 warning");
  });
});
