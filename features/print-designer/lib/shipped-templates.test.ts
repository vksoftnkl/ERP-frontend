import { describe, expect, it } from "vitest";
import a4Invoice from "@/features/print-designer/lib/__fixtures__/gst-invoice-a4.json";
import t80Receipt from "@/features/print-designer/lib/__fixtures__/thermal-receipt-t80.json";
import { validateDefinition } from "@/features/print-designer/lib/validate";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { cellOf, columnOverflow, gridMetrics } from "@/features/print-designer/lib/grid";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";

/**
 * The shipped designs, as fixtures.
 *
 * Both are copied verbatim from `GET /reports/templates/:id` against a running
 * server — a GRAPHIC A4 invoice and a GRID thermal receipt, which between them
 * exercise every element kind, two sequential DETAIL bands, group bands matched
 * by dataset, and both coordinate systems.
 *
 * The point of the test is one claim: the designer's client-side rules agree
 * with the server's. A false error here means the problems list would tell a
 * user their working invoice is broken; a missed one means a save that fails
 * with a 400 the designer could have caught.
 */

const a4 = a4Invoice as TemplateDefinition;
const t80 = t80Receipt as TemplateDefinition;

describe("shipped GST A4 invoice", () => {
  it("reports no problems at all", () => {
    expect(validateDefinition(a4)).toEqual([]);
  });

  it("declares two sequential DETAIL bands, which is why band order is not sorted", () => {
    // Rule 46's HSN/rate summary is a second repeating section, not a
    // subreport. Sorting bands by type would hoist the tax group header above
    // the item lines.
    const types = a4.bands.map((band) => band.type);
    expect(types).toEqual([
      "PAGE_HEADER",
      "DETAIL",
      "GROUP_HEADER",
      "DETAIL",
      "SUMMARY",
      "PAGE_FOOTER",
    ]);
    expect(a4.bands.filter((band) => band.type === "DETAIL").map((band) => band.dataset)).toEqual([
      "items",
      "taxes",
    ]);
  });

  it("positions x from the sheet edge, not from the margin", () => {
    const frame = a4.bands[0].elements.find((element) => element.id === "frame");
    expect(frame).toBeDefined();
    const rect = elementRect(frame!);
    // 8mm margins: the frame starts ON the left margin and ends ON the right.
    expect(rect.x).toBe(a4.paper.margins.left);
    expect(rect.x + rect.w).toBeCloseTo(a4.paper.widthMm - a4.paper.margins.right, 5);
  });

  it("keeps every element inside the sheet", () => {
    for (const band of a4.bands) {
      for (const element of band.elements) {
        const rect = elementRect(element);
        expect(rect.x + rect.w).toBeLessThanOrEqual(a4.paper.widthMm + 0.01);
      }
    }
  });
});

describe("shipped 80mm thermal receipt", () => {
  it("reports no problems at all", () => {
    expect(validateDefinition(t80)).toEqual([]);
  });

  it("is a character grid, not a millimetre sheet", () => {
    expect(t80.layoutMode).toBe("GRID");
    expect(t80.paper.heightMm).toBeNull();
    expect(gridMetrics(t80.paper).columns).toBe(48);
  });

  it("fits every element inside the column budget", () => {
    const metrics = gridMetrics(t80.paper);
    for (const band of t80.bands) {
      for (const element of band.elements) {
        if (element.kind === "LINE" || element.kind === "PAGEBREAK") {
          continue;
        }
        expect(columnOverflow(cellOf(element), metrics)).toBe(0);
      }
    }
  });
});
