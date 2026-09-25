import { describe, expect, it } from "vitest";
import { exportFixture, monthlyFixture } from "../testing/fixtures";
import { parseExport, parseMonthly } from "../wire/parse";
import { toXlsx, VOUCHER_HEADINGS } from "./to-xlsx";
import { columnName, crc32, writeXlsx, type Cell } from "./xlsx-writer";

const data = parseExport(exportFixture());
const monthly = parseMonthly(monthlyFixture());
const book = toXlsx(data, monthly, { branchLabel: "All branches (combined)" });
const sheet = book.sheets[0];

const textOf = (cell: Cell | undefined) => (cell && cell.t === "s" ? cell.v : null);
const rowLabelled = (label: string) => sheet.rows.find((row) => row.some((c) => textOf(c) === label))!;
const col = (name: (typeof VOUCHER_HEADINGS)[number]) => VOUCHER_HEADINGS.indexOf(name);

describe("toXlsx", () => {
  it("names the file after the ledger and the range", () => {
    expect(book.fileName).toBe("Ledger_Sri_Krishna_Traders_2026-08-01_2026-09-25.xlsx");
    expect(book.sheets.map((s) => s.name)).toEqual(["Statement", "Month-wise"]);
  });

  it("carries the Opening, Total and Closing rows from header.period", () => {
    const opening = rowLabelled("Opening balance b/f");
    const total = rowLabelled("Total for the period");
    const closing = rowLabelled("Closing balance c/f");
    expect(opening[col("Balance")]).toMatchObject({ t: "n", v: 185200 });
    expect(textOf(opening[col("Dr/Cr")])).toBe("Dr");
    expect(total[col("Debit")]).toMatchObject({ t: "n", v: Number(data.period.debit.amount) });
    expect(total[col("Credit")]).toMatchObject({ t: "n", v: Number(data.period.credit.amount) });
    expect(closing[col("Balance")]).toMatchObject({ t: "n", v: 176300 });
  });

  it("writes amounts as numeric cells and Dr/Cr as its own column", () => {
    const headingRow = sheet.rows.findIndex((row) => textOf(row[0]) === "Date");
    const first = sheet.rows[headingRow + 2]; // after the opening row
    expect(first[col("Debit")]).toMatchObject({ t: "n", v: 42500, style: "money" });
    expect(first[col("Credit")]).toBeNull(); // zero stays blank
    expect(textOf(first[col("Dr/Cr")])).toBe("Dr");
    expect(first[0]).toMatchObject({ t: "n", style: "date" });
    // Every voucher is there, between the opening and the total.
    const totalAt = sheet.rows.indexOf(rowLabelled("Total for the period"));
    expect(totalAt - (headingRow + 2)).toBe(14);
  });

  it("labels cancelled and reversal rows in the Type column", () => {
    const types = sheet.rows.map((row) => textOf(row[col("Type")]));
    expect(types).toContain("BIL · CANCELLED");
    expect(types).toContain("REVERSAL · BIL");
  });

  it("leaves future months blank in the month-wise sheet", () => {
    const months = book.sheets[1].rows;
    const oct = months.find((row) => textOf(row[0]) === "Oct 2026")!;
    expect(oct.slice(1).every((c) => c === null || c === undefined)).toBe(true);
  });
});

describe("xlsx writer", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("names columns past Z", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("emits a zip with the workbook parts", () => {
    const bytes = writeXlsx(book.sheets);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet2.xml"]) {
      expect(text).toContain(part);
    }
    expect(text).toContain("Sri Krishna Traders");
    expect(text).toContain('formatCode="#,##,##0.00"');
  });
});
