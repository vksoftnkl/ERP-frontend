/**
 * Designer selectors.
 *
 * Memoised where the result is derived (problems list, band order, dataset
 * lookups) so that a pointermove which only changes `interaction.dragDelta`
 * does not re-run validation for 200 elements — the plan's F3.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import type {
  Band,
  ProviderDescriptor,
  ReportElement,
} from "@/features/print-designer/types/template-definition";
import { elementRect, unionRect, type Rect } from "@/features/print-designer/lib/geometry";
import { validateDefinition, countBySeverity } from "@/features/print-designer/lib/validate";
import { canRedo, canUndo, redoLabel, undoLabel } from "@/features/print-designer/store/history";

export const selectDesigner = (state: RootState) => state.printDesigner;

export const selectDefinition = (state: RootState) => state.printDesigner.definition;
export const selectMeta = (state: RootState) => state.printDesigner.meta;
export const selectView = (state: RootState) => state.printDesigner.view;
export const selectSelection = (state: RootState) => state.printDesigner.selection;
export const selectInteraction = (state: RootState) => state.printDesigner.interaction;
export const selectDatasetCatalogue = (state: RootState) => state.printDesigner.datasets;
export const selectVocabulary = (state: RootState) => state.printDesigner.vocabulary;
export const selectDirty = (state: RootState) => state.printDesigner.dirty;
export const selectTemplateId = (state: RootState) => state.printDesigner.templateId;
export const selectStatus = (state: RootState) => state.printDesigner.status;
export const selectLastSavedAt = (state: RootState) => state.printDesigner.lastSavedAt;

export const selectBands = (state: RootState) => state.printDesigner.definition.bands;
export const selectPaper = (state: RootState) => state.printDesigner.definition.paper;
export const selectLayoutMode = (state: RootState) => state.printDesigner.definition.layoutMode;
export const selectDatasetBindings = (state: RootState) =>
  state.printDesigner.definition.datasets;

const selectHistory = (state: RootState) => state.printDesigner.history;

export const selectHistoryState = createSelector([selectHistory], (history) => ({
  canUndo: canUndo(history),
  canRedo: canRedo(history),
  undoLabel: undoLabel(history),
  redoLabel: redoLabel(history),
  depth: history.past.length,
}));

/**
 * The width a band draws across: the whole sheet, because element `x` is
 * page-relative (see lib/geometry.ts, bandContentSize).
 */
export const selectBandWidthMm = createSelector([selectPaper], (paper) => paper.widthMm);

/** The printable area between the margins — a guide, not a coordinate origin. */
export const selectPrintableWidthMm = createSelector([selectPaper], (paper) =>
  Math.max(0, paper.widthMm - paper.margins.left - paper.margins.right),
);

/**
 * Bands paired with their array index, in the order the engine emits them —
 * which is DECLARATION order, not a fixed band-type order.
 *
 * This is load-bearing, and the obvious alternative is wrong. Sorting by band
 * type looks tidier until you meet the shipped GST A4 invoice: it declares
 * PAGE_HEADER, DETAIL(items), GROUP_HEADER(taxes), DETAIL(taxes), SUMMARY,
 * PAGE_FOOTER. Two sequential DETAIL bands are how Rule 46's HSN/rate summary
 * is printed without a subreport, and group bands are matched to their detail
 * band BY DATASET rather than by position. A type sort would hoist the tax
 * group header above the item lines and show the user a document the engine
 * will never print.
 *
 * So the canvas shows the array, and reordering bands is a real edit
 * (`bandMoved`) rather than a display preference.
 */
export const selectOrderedBands = createSelector([selectBands], (bands) =>
  bands.map((band, index) => ({ band, index })),
);

export const selectSelectedBand = createSelector(
  [selectBands, selectSelection],
  (bands, selection): { band: Band; index: number } | null => {
    if (selection.bandIndex === null) {
      return null;
    }
    const band = bands[selection.bandIndex];
    return band ? { band, index: selection.bandIndex } : null;
  },
);

export const selectSelectedElements = createSelector(
  [selectBands, selectSelection],
  (bands, selection): ReportElement[] => {
    if (selection.bandIndex === null || !selection.elementIds.length) {
      return [];
    }
    const band = bands[selection.bandIndex];
    if (!band) {
      return [];
    }
    const wanted = new Set(selection.elementIds);
    return band.elements.filter((element) => wanted.has(element.id));
  },
);

/** The single selected element, or null for none and for a multi-selection. */
export const selectSingleSelectedElement = createSelector(
  [selectSelectedElements],
  (elements): ReportElement | null => (elements.length === 1 ? elements[0] : null),
);

export const selectSelectionBounds = createSelector(
  [selectSelectedElements],
  (elements): Rect | null => unionRect(elements.map(elementRect)),
);

export const selectProblems = createSelector([selectDefinition], validateDefinition);

export const selectProblemCounts = createSelector([selectProblems], countBySeverity);

/** Provider descriptor by token, for the dataset tree and sample values. */
export const selectProvidersByToken = createSelector(
  [selectDatasetCatalogue],
  (providers): Record<string, ProviderDescriptor> =>
    Object.fromEntries(providers.map((provider) => [provider.token, provider])),
);

/**
 * The datasets the template has actually bound, joined to their provider so the
 * tree can list fields. A binding whose provider is missing from the catalogue
 * is kept with an empty field list — it means the server dropped a provider the
 * template still references, and hiding it would hide the problem.
 */
export const selectBoundDatasets = createSelector(
  [selectDatasetBindings, selectProvidersByToken],
  (bindings, providersByToken) =>
    bindings.map((binding) => ({
      binding,
      provider: providersByToken[binding.provider] ?? null,
    })),
);

/** Fields available to `row.*` inside a band, via that band's dataset. */
export const makeSelectBandFields = (bandIndex: number) =>
  createSelector([selectBands, selectBoundDatasets], (bands, bound) => {
    const band = bands[bandIndex];
    if (!band?.dataset) {
      return [];
    }
    return bound.find((entry) => entry.binding.name === band.dataset)?.provider?.fields ?? [];
  });

export const selectCanSave = createSelector(
  [selectDirty, selectMeta, selectProblemCounts],
  (dirty, meta, counts) => dirty && !meta.isSystemTemplate && counts.errors === 0,
);
