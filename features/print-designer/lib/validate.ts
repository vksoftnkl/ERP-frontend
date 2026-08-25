/**
 * The problems list.
 *
 * A mirror of the server's `templateDefinitionSchema.superRefine` invariants,
 * run continuously in the designer. The point is not to replace server
 * validation — that still runs on every save and is authoritative — but to move
 * the failure from "Save returned 400 with a JSON path" to "the top bar shows
 * 2 problems, click one to select the element".
 *
 * Anything the server would REJECT is an `error`. Anything it accepts but a
 * printer will make a mess of (an element below an autoGrow band's base height,
 * a zero-height band) is a `warning`, and warnings never block a save.
 */

import type {
  Band,
  TemplateDefinition,
} from "@/features/print-designer/types/template-definition";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { lintTemplateString } from "@/features/print-designer/lib/expression";
import {
  GROUPED_BANDS,
  ROW_BANDS,
  SINGLETON_BANDS,
} from "@/features/print-designer/lib/vocabulary";

export type ProblemSeverity = "error" | "warning";

/** How far an element may hang below its band before it is worth saying so. */
export const BAND_OVERHANG_TOLERANCE_MM = 1;

export type Problem = {
  severity: ProblemSeverity;
  message: string;
  /** Where clicking the problem should take the selection. */
  bandIndex?: number;
  elementId?: string;
  /** Set when the problem is about the paper rather than any band. */
  scope?: "paper" | "datasets";
};

/** Every expression-bearing string on a band and its elements, with a label. */
function expressionFields(band: Band): Array<{ label: string; value: string | undefined; elementId?: string }> {
  const fields: Array<{ label: string; value: string | undefined; elementId?: string }> = [
    { label: "band visibility", value: band.visible },
    { label: "band groupBy", value: band.groupBy },
  ];

  for (const element of band.elements) {
    fields.push({ label: `${element.id} visibility`, value: element.visible, elementId: element.id });
    if (element.kind === "TEXT" || element.kind === "FIELD" || element.kind === "BARCODE" || element.kind === "QRCODE") {
      fields.push({ label: `${element.id} value`, value: element.value, elementId: element.id });
    }
    if (element.kind === "IMAGE") {
      fields.push({ label: `${element.id} source`, value: element.source, elementId: element.id });
    }
    if (element.kind === "PAGEBREAK") {
      fields.push({ label: `${element.id} condition`, value: element.when, elementId: element.id });
    }
    if (element.kind === "FIELD" && element.aggregate?.over) {
      fields.push({ label: `${element.id} aggregate`, value: element.aggregate.over, elementId: element.id });
    }
  }

  return fields;
}

export function validateDefinition(definition: TemplateDefinition): Problem[] {
  const problems: Problem[] = [];
  const { paper, bands, datasets } = definition;

  // ── Paper ────────────────────────────────────────────────────────────
  const printableWidth = paper.widthMm - paper.margins.left - paper.margins.right;
  if (printableWidth <= 0) {
    problems.push({
      severity: "error",
      scope: "paper",
      message: "Horizontal margins leave no printable width.",
    });
  }
  if (definition.layoutMode === "GRID" && paper.columns === undefined) {
    problems.push({
      severity: "error",
      scope: "paper",
      message: "A GRID template needs a character column count on the paper.",
    });
  }

  // ── Datasets ─────────────────────────────────────────────────────────
  const datasetNames = new Set<string>();
  const cardinalityByName = new Map<string, "one" | "many">();
  for (const dataset of datasets) {
    if (datasetNames.has(dataset.name)) {
      problems.push({
        severity: "error",
        scope: "datasets",
        message: `Duplicate dataset name '${dataset.name}'.`,
      });
    }
    datasetNames.add(dataset.name);
    cardinalityByName.set(dataset.name, dataset.cardinality);
  }

  // ── Bands ────────────────────────────────────────────────────────────
  const seenElementIds = new Map<string, number>();

  for (const [bandIndex, band] of bands.entries()) {
    if (band.dataset !== undefined && !datasetNames.has(band.dataset)) {
      problems.push({
        severity: "error",
        bandIndex,
        message: `${band.type} references unknown dataset '${band.dataset}'.`,
      });
    }

    if (ROW_BANDS.includes(band.type) && band.dataset === undefined) {
      problems.push({
        severity: "error",
        bandIndex,
        message: `${band.type} repeats per row and needs a dataset.`,
      });
    }

    if (band.dataset && cardinalityByName.get(band.dataset) === "one") {
      problems.push({
        severity: "error",
        bandIndex,
        message: `${band.type} repeats over '${band.dataset}', which is declared as a single record.`,
      });
    }

    if (GROUPED_BANDS.includes(band.type) && !band.groupBy) {
      problems.push({
        severity: "error",
        bandIndex,
        message: `${band.type} needs a groupBy expression.`,
      });
    }

    const heightIsZero =
      definition.layoutMode === "GRID" ? (band.heightRows ?? 0) === 0 : band.heightMm === 0;
    if (heightIsZero && band.elements.length > 0) {
      problems.push({
        severity: "warning",
        bandIndex,
        message: `${band.type} has zero height but ${band.elements.length} element(s); nothing will print.`,
      });
    }

    for (const element of band.elements) {
      const firstBand = seenElementIds.get(element.id);
      if (firstBand !== undefined) {
        problems.push({
          severity: "error",
          bandIndex,
          elementId: element.id,
          message: `Duplicate element id '${element.id}' (also in band ${firstBand + 1}).`,
        });
      } else {
        seenElementIds.set(element.id, bandIndex);
      }

      if (definition.layoutMode === "GRID") {
        if (element.kind !== "LINE" && element.kind !== "PAGEBREAK") {
          if (element.col === undefined || element.row === undefined) {
            problems.push({
              severity: "error",
              bandIndex,
              elementId: element.id,
              message: `'${element.id}' needs a column and row in GRID layout.`,
            });
          }
          if (
            paper.columns !== undefined &&
            element.col !== undefined &&
            element.cols !== undefined &&
            element.col + element.cols > paper.columns
          ) {
            problems.push({
              severity: "error",
              bandIndex,
              elementId: element.id,
              message: `'${element.id}' runs past column ${paper.columns}.`,
            });
          }
        }
      } else {
        const rect = elementRect(element);
        if (rect.x + rect.w > paper.widthMm + 0.01) {
          problems.push({
            severity: "error",
            bandIndex,
            elementId: element.id,
            message: `'${element.id}' extends to ${(rect.x + rect.w).toFixed(1)}mm, past the ${paper.widthMm}mm page width.`,
          });
        }
        // `x` is page-relative, so the right margin sits at
        // widthMm - margins.right — NOT at the printable width. Getting this
        // wrong flags every shipped invoice's frame, which is drawn exactly to
        // the margin line.
        const rightMarginMm = paper.widthMm - paper.margins.right;
        if (rect.x + rect.w > rightMarginMm + 0.01 && rect.x + rect.w <= paper.widthMm + 0.01) {
          problems.push({
            severity: "warning",
            bandIndex,
            elementId: element.id,
            message: `'${element.id}' crosses the right margin.`,
          });
        }
        if (rect.x < paper.margins.left - 0.01) {
          problems.push({
            severity: "warning",
            bandIndex,
            elementId: element.id,
            message: `'${element.id}' starts left of the ${paper.margins.left}mm margin.`,
          });
        }
        // An element below the band's base height only prints if the band grows,
        // which only autoGrow bands do.
        //
        // The tolerance is 1mm, not a rounding epsilon. A text element's `h` is
        // its box, not its ink: the shipped GST invoice's tax header sits at
        // y=6.4 with h=3.5 in a 9mm band and prints perfectly. Warning at 0.9mm
        // of overhang produced eight warnings on a template that is correct,
        // and eight warnings nobody can act on is how a problems list gets
        // ignored.
        if (!band.autoGrow && rect.y + rect.h > band.heightMm + BAND_OVERHANG_TOLERANCE_MM) {
          problems.push({
            severity: "warning",
            bandIndex,
            elementId: element.id,
            message: `'${element.id}' extends below the ${band.heightMm}mm band; enable autoGrow or raise the height.`,
          });
        }
      }

      if (element.kind === "FIELD" && element.aggregate) {
        if (
          element.aggregate.dataset !== undefined &&
          !datasetNames.has(element.aggregate.dataset)
        ) {
          problems.push({
            severity: "error",
            bandIndex,
            elementId: element.id,
            message: `Aggregate on '${element.id}' references unknown dataset '${element.aggregate.dataset}'.`,
          });
        }
        if (element.aggregate.scope === "GROUP" && !GROUPED_BANDS.includes(band.type)) {
          problems.push({
            severity: "error",
            bandIndex,
            elementId: element.id,
            message: `GROUP-scoped aggregates only work inside a group header or footer.`,
          });
        }
      }

      const requiresValue =
        element.kind === "TEXT" ||
        element.kind === "FIELD" ||
        element.kind === "BARCODE" ||
        element.kind === "QRCODE";
      if (requiresValue && !element.value.trim()) {
        problems.push({
          severity: "error",
          bandIndex,
          elementId: element.id,
          message: `'${element.id}' has no value.`,
        });
      }
      if (element.kind === "IMAGE" && !element.source.trim()) {
        problems.push({
          severity: "error",
          bandIndex,
          elementId: element.id,
          message: `'${element.id}' has no image source.`,
        });
      }
    }

    // ── Expressions ────────────────────────────────────────────────────
    const names = [...datasetNames];
    for (const field of expressionFields(band)) {
      for (const issue of lintTemplateString(field.value, names)) {
        problems.push({
          severity: issue.severity,
          bandIndex,
          elementId: field.elementId,
          message: `${field.label}: ${issue.message}`,
        });
      }
    }
  }

  // ── Singleton bands ──────────────────────────────────────────────────
  for (const bandType of SINGLETON_BANDS) {
    const indexes = bands.reduce<number[]>((accumulator, band, index) => {
      if (band.type === bandType) {
        accumulator.push(index);
      }
      return accumulator;
    }, []);
    if (indexes.length > 1) {
      problems.push({
        severity: "error",
        bandIndex: indexes[1],
        message: `${bandType} may appear at most once (found ${indexes.length}).`,
      });
    }
  }

  if (!bands.length) {
    problems.push({ severity: "error", message: "A template needs at least one band." });
  }

  return problems;
}

export const countBySeverity = (problems: readonly Problem[]) => ({
  errors: problems.filter((problem) => problem.severity === "error").length,
  warnings: problems.filter((problem) => problem.severity === "warning").length,
});
