import { describe, expect, it } from "vitest";
import {
  applyCompletion,
  applyFormatMask,
  clearFormatMask,
  completionsAt,
  expressionSpans,
  lintTemplateString,
  readFormatMask,
} from "@/features/print-designer/lib/expression";

describe("expressionSpans", () => {
  it("finds every span with its offsets", () => {
    expect(expressionSpans("Qty {{ row.qty }} of {{ row.total }}")).toEqual([
      { start: 4, end: 17, source: "row.qty" },
      { start: 21, end: 36, source: "row.total" },
    ]);
  });

  it("returns nothing for plain text", () => {
    expect(expressionSpans("TAX INVOICE")).toEqual([]);
  });
});

describe("lintTemplateString", () => {
  it("passes a valid expression", () => {
    expect(lintTemplateString("{{ fmt(row.netAmount, '#,##0.00') }}", ["items"])).toEqual([]);
  });

  it("catches unbalanced delimiters", () => {
    const issues = lintTemplateString("{{ row.qty ", []);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("unbalanced");
  });

  it("catches an empty span", () => {
    expect(lintTemplateString("{{ }}", [])[0].message).toBe("empty expression");
  });

  it("rejects an identifier that is not a root or a declared dataset", () => {
    const issues = lintTemplateString("{{ invoice.number }}", []);
    expect(issues[0].message).toContain("unknown identifier 'invoice'");
  });

  it("accepts a declared dataset as a root", () => {
    expect(lintTemplateString("{{ invoice.number }}", ["invoice"])).toEqual([]);
  });

  it("rejects an unknown transform but accepts a known one", () => {
    expect(lintTemplateString("{{ row.qty|frobnicate }}", [])[0].message).toContain(
      "unknown transform 'frobnicate'",
    );
    expect(lintTemplateString("{{ row.qty|round }}", [])).toEqual([]);
  });

  it("does not read a string literal as code", () => {
    // '#,##0.00' contains no identifiers; a naive scanner would flag the mask.
    expect(lintTemplateString("{{ fmt(row.qty, '#,##0.00') }}", [])).toEqual([]);
    expect(lintTemplateString("{{ 'Tax Invoice' }}", [])).toEqual([]);
  });

  it("ignores plain text entirely", () => {
    expect(lintTemplateString("Bill of Supply", [])).toEqual([]);
  });
});

describe("completionsAt", () => {
  const context = {
    roots: ["row", "page", "ctx", "items"],
    fieldsByRoot: {
      row: [{ name: "itemName" }, { name: "itemCode" }, { name: "qty" }],
      ctx: [{ name: "companyName" }],
    },
  };

  it("offers a band's fields after a dot", () => {
    const template = "{{ row.item";
    const items = completionsAt(template, template.length, context);
    expect(items.map((item) => item.label)).toEqual(["itemName", "itemCode"]);
  });

  it("offers transforms after a pipe", () => {
    const template = "{{ row.qty|ro";
    const items = completionsAt(template, template.length, context);
    expect(items.map((item) => item.label)).toEqual(["round"]);
  });

  it("offers roots at the start of a span", () => {
    const template = "{{ p";
    expect(completionsAt(template, template.length, context).map((item) => item.label)).toEqual([
      "page",
    ]);
  });

  it("offers nothing outside a span", () => {
    const template = "{{ row.qty }} plain";
    expect(completionsAt(template, template.length, context)).toEqual([]);
  });

  it("replaces the token under the caret", () => {
    const template = "{{ row.item }}";
    const result = applyCompletion(template, 11, {
      label: "itemName",
      insert: "itemName",
      kind: "field",
    });
    expect(result.text).toBe("{{ row.itemName }}");
    expect(result.caret).toBe(15);
  });
});

describe("format masks", () => {
  it("reads a mask back out of a value expression", () => {
    expect(readFormatMask("{{ fmt(row.netAmount, '#,##0.00') }}")).toEqual({
      fn: "fmt",
      subject: "row.netAmount",
      mask: "#,##0.00",
    });
  });

  it("rewrites an existing mask without touching the subject", () => {
    expect(applyFormatMask("{{ fmt(row.qty, '#,##0.00') }}", "fmt", "#,##0")).toBe(
      "{{ fmt(row.qty, '#,##0') }}",
    );
  });

  it("wraps a bare expression", () => {
    expect(applyFormatMask("{{ row.invDate }}", "date", "dd-MM-yyyy")).toBe(
      "{{ date(row.invDate, 'dd-MM-yyyy') }}",
    );
  });

  it("refuses to rewrite plain text", () => {
    expect(applyFormatMask("TAX INVOICE", "fmt", "#,##0")).toBeNull();
  });

  it("strips a mask back to the bare value", () => {
    expect(clearFormatMask("{{ fmt(row.qty, '#,##0.00') }}")).toBe("{{ row.qty }}");
    expect(clearFormatMask("{{ row.qty }}")).toBeNull();
  });
});
