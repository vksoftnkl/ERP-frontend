import { describe, expect, it } from "vitest";
import {
  purchaseIssueRows,
  purchaseSourceRows,
  purchaseStatusLabel,
  purchaseStatusTone,
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
