import { describe, expect, it } from "vitest";
import {
  createStarterDefinition,
  suggestDatasetName,
} from "@/features/print-designer/lib/defaults";
import { PAPER_PRESETS, findPaperPreset } from "@/features/print-designer/lib/vocabulary";
import { validateDefinition } from "@/features/print-designer/lib/validate";
import type { ProviderDescriptor } from "@/features/print-designer/types/template-definition";

const provider = (
  token: string,
  cardinality: "one" | "many",
  docTypes: string[] = [],
): ProviderDescriptor => ({
  token,
  label: token,
  cardinality,
  docTypes,
  fields: [{ name: "name", type: "string", label: "Name" }],
});

/** The catalogue as the server returns it: sorted by token. */
const SALE_INVOICE_PROVIDERS: ProviderDescriptor[] = [
  provider("branch.profile", "one"),
  provider("company.profile", "one"),
  provider("sales.invoice.batchDetail", "many", ["SALE_INVOICE"]),
  provider("sales.invoice.header", "one", ["SALE_INVOICE"]),
  provider("sales.invoice.lines", "many", ["SALE_INVOICE"]),
  provider("sales.invoice.taxSummary", "many", ["SALE_INVOICE"]),
];

const starter = (docType = "SALE_INVOICE", paper = "A5") =>
  createStarterDefinition({
    preset: findPaperPreset(paper) ?? PAPER_PRESETS[0],
    docType,
    templateName: "Delivery Note",
    providers: SALE_INVOICE_PROVIDERS,
  });

describe("suggestDatasetName", () => {
  it("skips a generic tail for the segment that carries the meaning", () => {
    // `invoice.billNo` is the point of the exercise; `header.billNo` is not.
    expect(suggestDatasetName("sales.invoice.header", new Set())).toBe("invoice");
    expect(suggestDatasetName("company.profile", new Set())).toBe("company");
    expect(suggestDatasetName("sales.invoice.lines", new Set())).toBe("lines");
  });

  it("dedupes against names already taken", () => {
    expect(suggestDatasetName("company.profile", new Set(["company"]))).toBe("company2");
  });
});

describe("createStarterDefinition", () => {
  it("produces a template with no problems at all", () => {
    // The whole point: a new template must never open on an error the user did
    // not cause and cannot obviously clear.
    expect(validateDefinition(starter())).toEqual([]);
  });

  it("binds only what a starter needs, not every provider on offer", () => {
    // Every declared dataset is resolved on every print, so binding all six
    // would charge the customer four queries per invoice for unused data.
    expect(starter().datasets.map((dataset) => dataset.provider)).toEqual([
      "company.profile",
      "sales.invoice.header",
      "sales.invoice.lines",
    ]);
  });

  it("repeats the DETAIL band over the line items, not the batch splits", () => {
    // The catalogue is token-sorted, so "first many provider" would pick
    // sales.invoice.batchDetail.
    const definition = starter();
    const detail = definition.bands.find((band) => band.type === "DETAIL");
    expect(detail?.dataset).toBe("lines");
  });

  it("puts something valid on the page", () => {
    const definition = starter();
    const header = definition.bands.find((band) => band.type === "PAGE_HEADER");
    const footer = definition.bands.find((band) => band.type === "PAGE_FOOTER");
    expect(header?.elements[0]).toMatchObject({ kind: "TEXT", value: "{{ company.name }}" });
    expect(footer?.elements[0]).toMatchObject({
      value: "Page {{ page.number }} of {{ page.total }}",
    });
  });

  it("omits the DETAIL band when nothing repeats, rather than leaving it invalid", () => {
    const definition = createStarterDefinition({
      preset: findPaperPreset("A4")!,
      docType: "NOTHING_MATCHES",
      templateName: "Blank",
      providers: SALE_INVOICE_PROVIDERS,
    });
    expect(definition.bands.some((band) => band.type === "DETAIL")).toBe(false);
    expect(validateDefinition(definition)).toEqual([]);
  });

  it("uses character cells on a GRID paper", () => {
    const definition = starter("SALE_INVOICE", "T80");
    expect(definition.layoutMode).toBe("GRID");
    const title = definition.bands[0].elements[0];
    expect(title).toMatchObject({ col: 0, row: 0, cols: 48 });
    expect(validateDefinition(definition)).toEqual([]);
  });
});
