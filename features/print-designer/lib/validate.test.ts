import { describe, expect, it } from "vitest";
import { validateDefinition } from "@/features/print-designer/lib/validate";
import type {
  Band,
  ReportElement,
  TemplateDefinition,
} from "@/features/print-designer/types/template-definition";

const text = (id: string, overrides: Partial<ReportElement> = {}): ReportElement =>
  ({
    kind: "TEXT",
    id,
    x: 0,
    y: 0,
    w: 20,
    h: 5,
    z: 0,
    value: id,
    align: "left",
    vAlign: "top",
    wrap: false,
    ellipsis: false,
    blankWhenZero: false,
    ...overrides,
  }) as ReportElement;

const band = (overrides: Partial<Band> = {}): Band => ({
  type: "PAGE_HEADER",
  heightMm: 30,
  groupLevel: 0,
  printOn: "ALL_PAGES",
  autoGrow: false,
  keepTogether: false,
  keepWithNext: false,
  keepWithLastDetail: false,
  spacingRows: 0,
  elements: [],
  ...overrides,
});

const definition = (overrides: Partial<TemplateDefinition> = {}): TemplateDefinition => ({
  schemaVersion: 1,
  layoutMode: "GRAPHIC",
  paper: {
    code: "A4",
    widthMm: 210,
    heightMm: 297,
    orientation: "PORTRAIT",
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
  },
  datasets: [{ name: "items", provider: "sales.invoice.lines", cardinality: "many" }],
  bands: [band()],
  ...overrides,
});

const messages = (input: TemplateDefinition) =>
  validateDefinition(input).map((problem) => problem.message);

describe("validateDefinition", () => {
  it("passes a well-formed template", () => {
    expect(validateDefinition(definition({ bands: [band({ elements: [text("t", { x: 10 })] })] }))).toEqual(
      [],
    );
  });

  it("warns when an element starts inside the left margin", () => {
    // `x` is page-relative, so x=0 is the sheet edge — outside the printable
    // area of a 10mm margin, where most printers cannot put ink.
    const problems = validateDefinition(
      definition({ bands: [band({ elements: [text("edge", { x: 0 })] })] }),
    );
    expect(problems).toEqual([
      {
        severity: "warning",
        bandIndex: 0,
        elementId: "edge",
        message: "'edge' starts left of the 10mm margin.",
      },
    ]);
  });

  it("catches a duplicate element id across bands", () => {
    const problems = validateDefinition(
      definition({
        bands: [
          band({ elements: [text("total")] }),
          band({ type: "SUMMARY", elements: [text("total")] }),
        ],
      }),
    ).filter((problem) => problem.severity === "error");
    expect(problems[0]).toMatchObject({
      severity: "error",
      elementId: "total",
      bandIndex: 1,
    });
  });

  it("requires a dataset on a repeating band", () => {
    expect(messages(definition({ bands: [band({ type: "DETAIL" })] }))).toContain(
      "DETAIL repeats per row and needs a dataset.",
    );
  });

  it("refuses a single-record dataset on a repeating band", () => {
    const problems = messages(
      definition({
        datasets: [{ name: "invoice", provider: "sales.invoice.header", cardinality: "one" }],
        bands: [band({ type: "DETAIL", dataset: "invoice" })],
      }),
    );
    expect(problems).toContain(
      "DETAIL repeats over 'invoice', which is declared as a single record.",
    );
  });

  it("requires groupBy on a group band", () => {
    expect(
      messages(definition({ bands: [band({ type: "GROUP_HEADER", dataset: "items" })] })),
    ).toContain("GROUP_HEADER needs a groupBy expression.");
  });

  it("catches an element past the page width", () => {
    const problems = validateDefinition(
      definition({ bands: [band({ elements: [text("wide", { x: 200, w: 30 })] })] }),
    );
    expect(problems[0]).toMatchObject({ severity: "error", elementId: "wide" });
    expect(problems[0].message).toContain("past the 210mm page width");
  });

  it("warns rather than errors when an element only crosses the right margin", () => {
    // The right margin is at widthMm - margins.right = 200mm, not at the
    // printable width; a frame drawn exactly to 200 must stay silent.
    expect(
      validateDefinition(
        definition({ bands: [band({ elements: [text("frame", { x: 10, w: 190 })] })] }),
      ),
    ).toEqual([]);

    const problems = validateDefinition(
      definition({ bands: [band({ elements: [text("edge", { x: 185, w: 20 })] })] }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warning");
    expect(problems[0].message).toContain("crosses the right margin");
  });

  it("warns when an element sits below a fixed band, but not an autoGrow one", () => {
    const below = text("low", { x: 10, y: 40 });
    expect(
      validateDefinition(definition({ bands: [band({ heightMm: 20, elements: [below] })] })),
    ).toHaveLength(1);
    expect(
      validateDefinition(
        definition({ bands: [band({ heightMm: 20, autoGrow: true, elements: [below] })] }),
      ),
    ).toEqual([]);
  });

  it("tolerates a sub-millimetre overhang, which is box padding rather than ink", () => {
    expect(
      validateDefinition(
        definition({
          bands: [band({ heightMm: 9, elements: [text("hdr", { x: 10, y: 6.4, h: 3.5 })] })],
        }),
      ),
    ).toEqual([]);
  });

  it("rejects a second singleton band", () => {
    expect(messages(definition({ bands: [band(), band()] }))).toContain(
      "PAGE_HEADER may appear at most once (found 2).",
    );
  });

  it("surfaces an expression problem against the element that owns it", () => {
    const problems = validateDefinition(
      definition({
        bands: [band({ elements: [text("v", { x: 10, value: "{{ invoice.no }}" })] })],
      }),
    );
    expect(problems[0]).toMatchObject({ elementId: "v", severity: "error" });
    expect(problems[0].message).toContain("unknown identifier 'invoice'");
  });

  it("requires columns and cell coordinates in GRID mode", () => {
    const problems = messages(
      definition({
        layoutMode: "GRID",
        paper: {
          code: "T80",
          widthMm: 80,
          heightMm: null,
          orientation: "PORTRAIT",
          margins: { top: 2, right: 2, bottom: 2, left: 2 },
        },
        bands: [band({ elements: [text("g")] })],
      }),
    );
    expect(problems).toContain("A GRID template needs a character column count on the paper.");
    expect(problems).toContain("'g' needs a column and row in GRID layout.");
  });

  it("catches a GRID element running past the last column", () => {
    expect(
      messages(
        definition({
          layoutMode: "GRID",
          paper: {
            code: "T80",
            widthMm: 80,
            heightMm: null,
            orientation: "PORTRAIT",
            margins: { top: 2, right: 2, bottom: 2, left: 2 },
            columns: 48,
          },
          bands: [band({ elements: [text("g", { col: 40, row: 0, cols: 20 })] })],
        }),
      ),
    ).toContain("'g' runs past column 48.");
  });

  it("rejects margins that leave no printable width", () => {
    expect(
      messages(
        definition({
          paper: {
            code: "A4",
            widthMm: 210,
            heightMm: 297,
            orientation: "PORTRAIT",
            margins: { top: 10, right: 120, bottom: 10, left: 120 },
          },
        }),
      ),
    ).toContain("Horizontal margins leave no printable width.");
  });
});

describe("crosstab rules", () => {
  const crosstab = (overrides: Record<string, unknown> = {}): ReportElement =>
    ({
      kind: "CROSSTAB",
      id: "ct",
      x: 10,
      y: 0,
      z: 0,
      w: 120,
      h: 30,
      dataset: "items",
      rowBy: "{{ row.itemName }}",
      columnBy: "{{ row.hsnCode }}",
      measure: "{{ row.netAmount }}",
      fn: "sum",
      format: "#,##0.00",
      blankWhenZero: true,
      corner: "",
      rowHeaderWidthMm: 40,
      columnWidthMm: 0,
      headerHeightMm: 6,
      rowHeightMm: 5,
      showRowTotals: true,
      showColumnTotals: true,
      totalsLabel: "Total",
      rowSort: "LABEL_ASC",
      columnSort: "FIRST_SEEN",
      maxColumns: 12,
      overflow: "FOLD",
      overflowLabel: "Other",
      gridLines: true,
      repeatHeader: true,
      ...overrides,
    }) as unknown as ReportElement;

  const messages = (element: ReportElement, bandOverrides: Partial<Band> = {}): string[] =>
    validateDefinition(
      definition({ bands: [band({ type: "SUMMARY", ...bandOverrides, elements: [element] })] }),
    ).map((problem) => problem.message);

  it("accepts a fully configured crosstab in a summary band", () => {
    expect(messages(crosstab())).toEqual([]);
  });

  it("refuses one with no dataset, and one naming a dataset that does not exist", () => {
    expect(messages(crosstab({ dataset: "" }))).toContain("'ct' has no dataset to pivot.");
    expect(messages(crosstab({ dataset: "nope" }))).toContain(
      "'ct' pivots unknown dataset 'nope'.",
    );
  });

  it("refuses a DETAIL band, where it would print in full once per row", () => {
    expect(messages(crosstab(), { type: "DETAIL", dataset: "items" }).join(" ")).toMatch(
      /once per row/,
    );
  });

  it("refuses a group band, where it would print in full once per group", () => {
    // A crosstab reads its whole dataset with no group filter, so the same
    // table would appear under every group heading.
    expect(
      messages(crosstab(), {
        type: "GROUP_FOOTER",
        dataset: "items",
        groupBy: "{{ row.hsnCode }}",
      }).join(" "),
    ).toMatch(/once per group/);
  });

  it("refuses page furniture, which redraws on every page", () => {
    expect(messages(crosstab(), { type: "PAGE_FOOTER" }).join(" ")).toMatch(/on every page/);
  });

  it("refuses a row-label column that leaves no width for the data", () => {
    expect(messages(crosstab({ w: 40, rowHeaderWidthMm: 40 })).join(" ")).toMatch(
      /leaves no width/,
    );
  });

  it("refuses an empty row, column or measure expression", () => {
    expect(messages(crosstab({ rowBy: "  " }))).toContain("'ct' has no row expression.");
    expect(messages(crosstab({ columnBy: "" }))).toContain("'ct' has no column expression.");
    expect(messages(crosstab({ measure: "" }))).toContain("'ct' has no measure expression.");
  });

  it("warns when a fixed column width leaves room for no data column", () => {
    expect(
      messages(crosstab({ w: 60, rowHeaderWidthMm: 40, columnWidthMm: 15 })).join(" "),
    ).toMatch(/fits no data column/);
  });

  it("does not warn that it overhangs a band it will grow", () => {
    // The engine sizes the band from the row count, so the placeholder box
    // sticking out below a 10mm band is not something the user can act on.
    const problems = messages(crosstab({ y: 8, h: 40 }), { heightMm: 10, autoGrow: false });
    expect(problems.join(" ")).not.toMatch(/extends below/);
  });

  it("lints the expressions it carries", () => {
    expect(messages(crosstab({ measure: "{{ ghost.total }}" })).join(" ")).toMatch(/measure/);
  });

  it("refuses a crosstab on a character-grid template", () => {
    const problems = validateDefinition(
      definition({
        layoutMode: "GRID",
        paper: {
          code: "T80",
          widthMm: 80,
          heightMm: null,
          orientation: "PORTRAIT",
          margins: { top: 2, right: 2, bottom: 2, left: 2 },
          columns: 48,
        },
        bands: [
          band({
            type: "SUMMARY",
            elements: [crosstab({ col: 0, row: 0, cols: 40 })],
          }),
        ],
      }),
    ).map((problem) => problem.message);
    expect(problems.join(" ")).toMatch(/graphic-mode element/);
  });
});
