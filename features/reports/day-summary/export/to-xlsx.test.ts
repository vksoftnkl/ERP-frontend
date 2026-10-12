import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { writeXlsx } from "@/features/reports/shared/export/xlsx-writer";
import { exportFixture } from "../testing/fixtures";
import { parseExport } from "../wire/parse";
import { summarySheet, toXlsx, VOUCHER_HEADINGS, vouchersSheet } from "./to-xlsx";

const data = () => parseExport(exportFixture({ fromDate: "2026-10-09" }));

describe("the workbook", () => {
  it("writes amounts as numbers with the Indian money format, totals from the server", () => {
    const sheet = summarySheet(data().summary, { clearingAsBank: true });
    const total = sheet.rows.find((row) => row[0]?.t === "s" && row[0].v === "Total");
    expect(total?.[6]).toEqual({ t: "n", v: 495270, style: "moneyBold" });
    const headings = sheet.rows.find((row) => row[0]?.t === "s" && row[0].v === "Type");
    expect(headings?.map((c) => (c?.t === "s" ? c.v : null))).toContain("Bank + clearing in");
  });

  it("puts the tiles, three grids and the checks as sentences on Summary", () => {
    const texts = summarySheet(data().summary, { clearingAsBank: false })
      .rows.flat()
      .flatMap((c) => (c?.t === "s" ? [c.v] : []));
    for (const want of ["Sales", "Cash in hand", "Voucher types", "Cash & bank position", "Group summary", "Checks", "Bank in"]) {
      expect(texts).toContain(want);
    }
    expect(texts).toContain("Dr = Cr — 4,95,270.00 = 4,95,270.00 — every posted voucher balanced");
  });

  it("writes one row per leg on Vouchers, the voucher's columns repeated", () => {
    const d = data();
    const sheet = vouchersSheet(d.vouchers, d.totals);
    expect(sheet.rows[0].map((c) => (c?.t === "s" ? c.v : null))).toEqual(VOUCHER_HEADINGS);
    // 65 vouchers × 2 legs and the headings. The server's /export sends a row
    // count, not an amount total, so there is no Total row (never a client sum).
    expect(sheet.rows).toHaveLength(65 * 2 + 1);
    expect(sheet.rows.some((row) => row[0]?.t === "s" && row[0].v === "Total")).toBe(false);
    const [first, second] = sheet.rows.slice(1, 3);
    expect(first.slice(0, 9)).toEqual(second.slice(0, 9));
    expect(first[10]).toEqual({ t: "s", v: "Dr", style: "text" });
    expect(second[10]).toEqual({ t: "s", v: "Cr", style: "text" });
    const withTotal = vouchersSheet(d.vouchers, { amount: "495270.00" });
    expect(withTotal.rows[withTotal.rows.length - 1][6]).toEqual({ t: "n", v: 495270, style: "moneyBold" });
  });

  it("names the file by the day and builds a real zip", () => {
    const book = toXlsx(data(), { clearingAsBank: true });
    expect(book.fileName).toBe("day-summary_2026-10-09.xlsx");
    const bytes = writeXlsx(book.sheets);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
});

/**
 * No money parse before the sheet boundary (plan §13): outside `export/` and
 * the test scaffolding, nothing in the feature calls `parseFloat`, and only
 * the URL's type id may go through `Number(`.
 */
describe("the one sanctioned parse", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(path);
    }
  };
  walk(root);

  it("finds no parseFloat / Number( on amounts anywhere else", () => {
    const offenders: string[] = [];
    for (const path of files) {
      const rel = relative(root, path);
      if (rel.startsWith("testing/") || rel.startsWith("export/")) continue;
      const source = readFileSync(path, "utf8");
      if (/parseFloat\s*\(/.test(source)) offenders.push(`${rel}: parseFloat`);
      const numberCalls = source.match(/\bNumber\s*\(/g)?.length ?? 0;
      const allowed = rel === "query/params.ts" ? 1 : 0;
      if (numberCalls > allowed) offenders.push(`${rel}: Number( ×${numberCalls}`);
    }
    expect(offenders).toEqual([]);
  });
});
