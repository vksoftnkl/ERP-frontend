import { describe, expect, it } from "vitest";
import { cashCustomer, expiringRow, scheme } from "../testing/fixtures";
import { exportCols, exportFileName, exportHtml, exportSheet, exportText } from "./export";

const PRINTED_AS =
  "Loyalty Status — Members · Company: Amazon Retail India Private Limited · Branch: All · Scheme: All · " +
  "Status: ACTIVE · Balance > 0 · Earned: lifetime · As on 31-10-2026";

describe("the export's columns (Qt exportCols)", () => {
  it("keeps each tab's grid order and keys", () => {
    expect(exportCols("members").map((c) => c.key)).toEqual([
      "cardNo",
      "customerName",
      "mobile",
      "schemeName",
      "status",
      "earned",
      "redeemed",
      "gift",
      "expired",
      "balance",
      "value",
      "nextExpiryOn",
      "lastActivityOn",
    ]);
    expect(exportCols("expiring").map((c) => c.title)).toEqual([
      "Expires",
      "Days left",
      "Customer",
      "Card no",
      "Mobile",
      "Scheme",
      "Expiring",
      "Value",
      "Balance",
      "After",
    ]);
    expect(exportCols("schemes")).toHaveLength(13);
  });

  it("formats a cell as the print shows it", () => {
    const row = cashCustomer as unknown as Record<string, unknown>;
    const cols = exportCols("members");
    const shown = cols.map((c) => exportText(row, c));
    expect(shown).toEqual(["", "Cash Customer", "", "Loyalty concurrency test", "ACTIVE", "42", "0", "0", "0", "42", "42.00", "22/10/2027", "29/10/2026"]);
    expect(exportText({ value: null }, cols[10])).toBe("");
  });
});

describe("print and Excel", () => {
  it("prints the tab name, the printedAs line in dd/MM/yyyy, the rows and their count, landscape", () => {
    const html = exportHtml({ tabLabel: "Members", printedAs: PRINTED_AS, tab: "members", rows: [cashCustomer as never] });
    expect(html).toContain("@page { size: A4 landscape;");
    expect(html).toContain("<h2>Members</h2>");
    expect(html).toContain("As on 31/10/2026</p>");
    expect(html).toContain(">Cash Customer</td>");
    expect(html).toContain("<p>1 row(s)</p>");
  });

  it("carries no Total row — Qt's exportHtml / saveTabAsCsv write the rows alone", () => {
    const rows = [cashCustomer as never, cashCustomer as never];
    const html = exportHtml({ tabLabel: "Members", printedAs: "", tab: "members", rows });
    expect(html).not.toMatch(/>Total</);
    expect(html.match(/<tr>/g)).toHaveLength(1 + rows.length);
    const sheet = exportSheet({ tabLabel: "Members", printedAs: "", tab: "members", rows });
    // printedAs, the headings, one row per export row — nothing after.
    expect(sheet.rows).toHaveLength(2 + rows.length);
  });

  it("writes the sheet: printedAs, the headings, numbers as numbers, dates as dates", () => {
    const sheet = exportSheet({ tabLabel: "Expiring soon", printedAs: "As on 31-10-2026", tab: "expiring", rows: [expiringRow as never] });
    expect(sheet.rows[0]).toEqual([{ t: "s", v: "As on 31/10/2026" }]);
    expect(sheet.rows[1][0]).toEqual({ t: "s", v: "Expires", style: "bold" });
    const data = sheet.rows[2];
    expect(data[0]).toMatchObject({ t: "n", style: "date" });
    expect(data[1]).toEqual({ t: "n", v: 355, style: "text" });
    expect(data[3]).toBeNull();
    expect(data[7]).toEqual({ t: "n", v: 7, style: "money" });
    const schemes = exportSheet({ tabLabel: "Scheme summary", printedAs: "", tab: "schemes", rows: [scheme as never] });
    expect(schemes.rows[2][12]).toEqual({ t: "n", v: 0, style: "text" });
    expect(exportFileName("schemes", "xlsx")).toBe("loyalty-status-schemes.xlsx");
  });
});
