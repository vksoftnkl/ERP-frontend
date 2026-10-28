import { describe, expect, it } from "vitest";
import { logRow, priceA, priceB, QT_ROWS, slabDel } from "../testing/fixtures";
import {
  checkRange,
  csvFileName,
  csvText,
  CSV_HEADER,
  dayChips,
  filterSummary,
  gapsLabel,
  printedLine,
  printHtml,
  sameSaveOthers,
  stepRange,
  totalsText,
} from "./report";

describe("the range", () => {
  it("swaps From after To, and refuses more than a year", () => {
    expect(checkRange("2026-10-23", "2026-10-01")).toEqual({ ok: true, from: "2026-10-01", to: "2026-10-23", swapped: true });
    expect(checkRange("2025-10-23", "2026-10-24")).toEqual({ ok: true, from: "2025-10-23", to: "2026-10-24", swapped: false });
    expect(checkRange("2025-10-22", "2026-10-24")).toEqual({ ok: false, reason: "too-long" });
    expect(checkRange("", "2026-10-24")).toEqual({ ok: false, reason: "invalid" });
  });

  it("moves the whole range by its own length", () => {
    expect(stepRange("2026-10-23", "2026-10-23", -1)).toEqual({ from: "2026-10-22", to: "2026-10-22" });
    expect(stepRange("2026-10-01", "2026-10-07", 1)).toEqual({ from: "2026-10-08", to: "2026-10-14" });
    expect(stepRange("2026-03-01", "2026-03-01", -1)).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });
});

describe("the title, strip and totals", () => {
  it("reads the gap check", () => {
    expect(gapsLabel({ since: "2026-10-20T09:00:00+05:30", total: 0 })).toEqual({
      text: "Recorded from 20/10/2026 · 0 changes outside the log ✓",
      tone: "ok",
    });
    expect(gapsLabel({ since: null, total: 0 })).toEqual({ text: "Nothing recorded yet", tone: "ok" });
    expect(gapsLabel({ since: "2026-10-20", total: 3 })).toEqual({
      text: "3 price rows changed outside the log",
      tone: "bad",
    });
    expect(gapsLabel({ since: "2026-10-20", total: 1 }).text).toBe("1 price row changed outside the log");
  });

  it("chips the days newest first, at most 14", () => {
    const days = Array.from({ length: 20 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      changes: 1,
      priceChanges: 1,
      slabChanges: 0,
      items: 1,
      users: 1,
      saves: 1,
    }));
    const chips = dayChips(days);
    expect(chips).toHaveLength(14);
    expect(chips[0]).toEqual({ day: "2026-10-20", label: "Tue 20/10/2026", sub: "1 change · 1 item" });
    expect(chips.at(-1)?.day).toBe("2026-10-07");
  });

  it("totals the rows, and says when the range ran past the cap", () => {
    expect(totalsText(QT_ROWS, 6)).toEqual({ text: "6 changes · 3 items · 3 users · 2 devices", cap: "" });
    expect(totalsText([], 0).text).toBe("No price changes in this range");
    expect(totalsText([priceA], 12000).cap).toBe("(first 1 of 12000 — narrow the range)");
  });

  it("counts the other rows of the same save", () => {
    const rows = [priceB, logRow({ ipclId: "z", changeSetId: "s1" }), priceA];
    expect(sameSaveOthers(rows, priceB)).toBe(1);
    expect(sameSaveOthers(rows, priceA)).toBe(0);
  });

  it("summarises the filters for the printout", () => {
    expect(filterSummary({ from: "2026-10-23", to: "2026-10-23" })).toBe("23/10/2026 to 23/10/2026 · every branch");
    expect(
      filterSummary({
        from: "2026-10-01",
        to: "2026-10-23",
        branchName: "Coimbatore",
        itemName: "Samsung H1",
        tableWord: "Prices only",
        sourceWord: "Qty price",
        actionWord: "Deleted",
        userName: "VKPOS",
        search: " sam ",
      }),
    ).toBe("01/10/2026 to 23/10/2026 · Coimbatore · Samsung H1 · Prices only · Qty price · Deleted · by VKPOS · “sam”");
  });
});

describe("export and print", () => {
  it("writes the Qt CSV columns, every cell quoted", () => {
    const csv = csvText([priceA, slabDel]).split("\n");
    expect(csv[0]).toBe(CSV_HEADER.join(","));
    expect(csv[0]).toBe(
      "Date,Time,Item code,Item,Unit,Branch,Applies to,Action,What changed,Changed fields,By,Device,IP,App,Source,Menu,Reason",
    );
    const cells = csv[1].split('","');
    expect(cells[0]).toBe('"23/10/2026');
    expect(cells.slice(2, 8)).toEqual(["SAM-H1", "Samsung H1", "PCS", "All branches", "MRP 150", "Changed"]);
    expect(cells[8]).toBe("Price A 118 → 119  ▲0.8%; MRP 140 → 150  ▲7.1%; below cost");
    expect(cells[9]).toBe("Price A, Price A (w/o tax), Markup A %, MRP");
    expect(cells.slice(10, 16)).toEqual(["VKPOS", "dbg", "192.168.0.103", "DESKTOP", "Change selling", "30"]);
    expect(csvText([logRow({ reason: 'said "ok"' })])).toContain('"said ""ok"""');
    expect(csvFileName("2026-10-01", "2026-10-23")).toBe("price-changes-2026-10-01-2026-10-23.csv");
  });

  it("prints a landscape table with a header row per day", () => {
    const html = printHtml({ rows: QT_ROWS, summary: "22/10/2026 to 23/10/2026 · every branch", printed: "Printed x by VKPOS" });
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("<h2>Price Change Log</h2>");
    expect(html).toContain("22/10/2026 to 23/10/2026 · every branch<br>Printed x by VKPOS");
    expect(html.match(/<tr class="day">/g)).toHaveLength(2);
    expect(html).toContain("<b>Fri 23/10/2026</b>");
    expect(html.match(/<tr><td>/g)).toHaveLength(6);
    expect(printHtml({ rows: [logRow({ reason: "<b>x</b>" })], summary: "", printed: "" })).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(printedLine(new Date(2026, 9, 23, 14, 5), "VKPOS")).toBe("Printed 23/10/2026 02:05 PM by VKPOS");
  });
});

describe("no access", () => {
  it("knows the 403 IPCL_RIGHT_VIEW from any other refusal", async () => {
    const { isNoAccessError } = await import("./errors");
    expect(isNoAccessError({ status: 403, data: { message: "Forbidden" } })).toBe(true);
    expect(isNoAccessError({ status: 400, data: { errors: [{ code: "IPCL_RIGHT_VIEW" }] } })).toBe(true);
    expect(isNoAccessError({ status: 400, data: { errors: [{ code: "IPCL_BAD_RANGE" }] } })).toBe(false);
    expect(isNoAccessError(new Error("network"))).toBe(false);
  });
});
