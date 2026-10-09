import { describe, expect, it } from "vitest";
import { exportFixture } from "../testing/fixtures";
import { parseExport } from "../wire/parse";
import type { BillsExportPayload, PartiesExportPayload } from "../wire/types";
import { BILL_HEADINGS, exportFileName, partyHeadings, toXlsx } from "./to-xlsx";

const Q = { asOn: "2026-09-25", side: "RECEIVABLE" };

describe("toXlsx — PARTIES", () => {
  const data = parseExport(exportFixture({ ...Q, shape: "PARTIES" })) as PartiesExportPayload;
  const book = toXlsx(data);
  const rows = book.sheets[0].rows;

  it("opens with printedAs and names the file by side and date", () => {
    expect(rows[0][0]).toEqual({ t: "s", v: data.printedAs, style: "bold" });
    expect(book.fileName).toBe("Outstanding_R_2026-09-25.xlsx");
    expect(exportFileName("PAYABLE", "2026-03-31")).toBe("Outstanding_P_2026-03-31.xlsx");
  });

  it("builds the bucket columns from the response's labels", () => {
    const heading = rows.find((row) => row[0] && "v" in row[0] && row[0].v === "Party");
    expect(heading?.map((c) => (c && "v" in c ? c.v : null))).toEqual(partyHeadings(data.bucketLabels));
    expect(partyHeadings(["Not due", "0–15", "> 15"])).toContain("Not due");
  });

  it("writes amounts as numbers with Dr/Cr in a column of its own", () => {
    const skt = rows.find((row) => row[0] && "v" in row[0] && row[0].v === "Sri Krishna Traders");
    expect(skt?.[7]).toEqual({ t: "n", v: 176300, style: "money" });
    expect(skt?.[8]).toEqual({ t: "s", v: "Dr", style: "text" });
    const anand = rows.find((row) => row[0] && "v" in row[0] && row[0].v === "Anand Supermarket");
    expect(anand?.[7]).toEqual({ t: "n", v: 15000, style: "money" });
    expect(anand?.[8]).toEqual({ t: "s", v: "Cr", style: "text" });
  });

  it("ends with the server's totals row", () => {
    const last = rows[rows.length - 1];
    expect(last[0]).toEqual({ t: "s", v: "Total · 9 parties", style: "bold" });
    expect(last[7]).toEqual({ t: "n", v: 679550, style: "moneyBold" });
    expect(last[8]).toEqual({ t: "s", v: "Dr", style: "text" });
  });
});

describe("toXlsx — BILLS", () => {
  const data = parseExport(exportFixture({ ...Q, shape: "BILLS" })) as BillsExportPayload;
  const rows = toXlsx(data).sheets[0].rows;

  it("lists bills with a real date and a Dr/Cr column", () => {
    const heading = rows.find((row) => row[0] && "v" in row[0] && row[0].v === "Party");
    expect(heading).toHaveLength(BILL_HEADINGS.length);
    const credit = rows.find((row) => row[4] && "v" in row[4] && row[4].v === "crn00014");
    expect(credit?.[2]).toMatchObject({ t: "n", style: "date" });
    expect(credit?.[6]).toBeNull();
    expect(credit?.[10]).toEqual({ t: "s", v: "Cr", style: "text" });
  });

  it("ends with the totals row from the response", () => {
    const last = rows[rows.length - 1];
    expect(last[0]).toMatchObject({ v: expect.stringMatching(/^Total · \d+ bills$/) });
    expect(last[9]).toEqual({ t: "n", v: Number(data.totals.net.amount), style: "moneyBold" });
  });
});
