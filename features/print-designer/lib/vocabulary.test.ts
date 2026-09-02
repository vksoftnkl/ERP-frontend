import { describe, expect, it } from "vitest";
import generated from "@/features/print-designer/lib/vocabulary.generated.json";
import {
  BAND_TYPES,
  BARCODE_SYMBOLOGIES,
  CROSSTAB_OVERFLOWS,
  CROSSTAB_OVERFLOW_LABELS,
  CROSSTAB_SORTS,
  CROSSTAB_SORT_LABELS,
  ELEMENT_KINDS,
  LAYOUT_MODES,
  OUTPUT_MODES,
  PAPER_PRESETS,
  PRINT_ON_VALUES,
  TRANSFORM_NAMES,
  defaultOutputModeForPaper,
  findPaperPreset,
  reconcileVocabulary,
} from "@/features/print-designer/lib/vocabulary";
import type { TemplateSchemaVocabulary } from "@/features/print-designer/types/template-definition";

/**
 * The plan's F7, enforced.
 *
 * `vocabulary.generated.json` is written by `npm run gen:print-vocab` straight
 * from the server's zod schema. If the two disagree, either the server grew a
 * band type the palette cannot offer, or the palette offers one the server will
 * reject on save — both are bugs, and both are silent without this test.
 */
describe("vocabulary parity with the server schema", () => {
  it("agrees on band types", () => {
    expect([...BAND_TYPES].sort()).toEqual([...generated.bandTypes].sort());
  });

  it("agrees on element kinds", () => {
    expect([...ELEMENT_KINDS].sort()).toEqual([...generated.elementKinds].sort());
  });

  it("agrees on layout and output modes", () => {
    expect([...LAYOUT_MODES].sort()).toEqual([...generated.layoutModes].sort());
    expect([...OUTPUT_MODES].sort()).toEqual([...generated.outputModes].sort());
  });

  it("agrees on printOn values and barcode symbologies", () => {
    expect([...PRINT_ON_VALUES].sort()).toEqual([...generated.printOn].sort());
    expect([...BARCODE_SYMBOLOGIES].sort()).toEqual([...generated.barcodeSymbologies].sort());
  });

  it("agrees on the crosstab sort and overflow vocabularies", () => {
    expect([...CROSSTAB_SORTS].sort()).toEqual([...generated.crosstabSorts].sort());
    expect([...CROSSTAB_OVERFLOWS].sort()).toEqual([...generated.crosstabOverflows].sort());
    // Every value needs a label, or the property panel renders a blank option.
    for (const sort of CROSSTAB_SORTS) {
      expect(CROSSTAB_SORT_LABELS[sort]).toBeTruthy();
    }
    for (const overflow of CROSSTAB_OVERFLOWS) {
      expect(CROSSTAB_OVERFLOW_LABELS[overflow]).toBeTruthy();
    }
  });

  it("agrees on the transform list the expression linter enforces", () => {
    // A transform missing here is an expression the designer marks as broken
    // even though the engine would have run it.
    expect([...TRANSFORM_NAMES].sort()).toEqual([...generated.transforms].sort());
  });

  it("agrees on paper codes", () => {
    expect(PAPER_PRESETS.map((preset) => preset.code).sort()).toEqual(
      [...generated.paperCodes].sort(),
    );
  });
});

describe("paper helpers", () => {
  it("finds a preset case-insensitively", () => {
    expect(findPaperPreset("a4")?.widthMm).toBe(210);
    expect(findPaperPreset("nope")).toBeUndefined();
  });

  it("derives the output mode from the paper", () => {
    // Paper and mode are not independent: a thermal roll is not a PDF page and
    // a fanfold form is not an ESC/POS receipt.
    expect(defaultOutputModeForPaper(findPaperPreset("A4")!)).toBe("PDF");
    expect(defaultOutputModeForPaper(findPaperPreset("T80")!)).toBe("ESCPOS");
    expect(defaultOutputModeForPaper(findPaperPreset("DM132")!)).toBe("ESCP_DOTMATRIX");
  });
});

describe("reconcileVocabulary", () => {
  const server = (overrides: Partial<TemplateSchemaVocabulary>): TemplateSchemaVocabulary =>
    ({
      schemaVersion: 1,
      layoutModes: [...LAYOUT_MODES],
      outputModes: [...OUTPUT_MODES],
      bandTypes: [...BAND_TYPES],
      elementKinds: [...ELEMENT_KINDS],
      papers: [...PAPER_PRESETS],
      transforms: [...TRANSFORM_NAMES],
      rootIdentifiers: ["row", "page", "agg", "ctx", "sys", "group"],
      gallery: [],
      ...overrides,
    }) as TemplateSchemaVocabulary;

  it("reports nothing when the two agree", () => {
    expect(reconcileVocabulary(server({}))).toEqual([]);
  });

  it("reports what only the server knows", () => {
    const drift = reconcileVocabulary(
      server({ transforms: [...TRANSFORM_NAMES, "newTransform"] }),
    );
    expect(drift).toEqual([
      { kind: "transforms", serverOnly: ["newTransform"], clientOnly: [] },
    ]);
  });

  it("reports what only this build knows", () => {
    const drift = reconcileVocabulary(server({ bandTypes: [] }));
    expect(drift[0].clientOnly).toEqual([...BAND_TYPES]);
  });
});
