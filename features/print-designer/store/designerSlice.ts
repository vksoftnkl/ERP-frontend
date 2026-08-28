/**
 * Designer state.
 *
 * `definition` is the single source of truth and the only thing a save sends.
 * `interaction` is transient — a live drag delta lives there so that moving one
 * element re-renders one element instead of the whole canvas, and it is never
 * persisted or recorded in history. `selection` and `view` are neither
 * persisted nor undoable: a Ctrl+Z that changed the zoom would be a bug.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { current, isDraft } from "immer";
import type {
  Band,
  BandType,
  DatasetBinding,
  ElementKind,
  FieldMeta,
  ImageElement,
  LineElement,
  OutputMode,
  PaperSpec,
  ProviderDescriptor,
  QrcodeElement,
  ReportElement,
  RectElement,
  TemplateDefinition,
  TemplatePayload,
  TemplateSchemaVocabulary,
  TextElement,
  FieldElement,
  BarcodeElement,
  PagebreakElement,
} from "@/features/print-designer/types/template-definition";
import {
  bandContentSize,
  clampRectToBand,
  elementRect,
  moveElement,
  resizeRect,
  unionRect,
  withRect,
  type Rect,
  type ResizeHandle,
} from "@/features/print-designer/lib/geometry";
import { roundMm } from "@/features/print-designer/lib/units";
import type { Guide } from "@/features/print-designer/lib/snap";
import {
  createBand,
  createElement,
  createFieldElement,
  nextElementId,
  paperFromPreset,
} from "@/features/print-designer/lib/defaults";
import {
  canRedo,
  canUndo,
  commitDefinitionEdit,
  emptyHistory,
  redoDefinition,
  undoDefinition,
  type HistoryState,
} from "@/features/print-designer/store/history";
import {
  getClipboard,
  PASTE_OFFSET_MM,
  setClipboard,
} from "@/features/print-designer/lib/clipboard";
import { PAPER_PRESETS, findPaperPreset } from "@/features/print-designer/lib/vocabulary";
import { cellOf, gridMetrics } from "@/features/print-designer/lib/grid";

/**
 * A patch for one element. The union's members are flattened into one optional
 * shape because the property panel edits by field name — `align`, `w`,
 * `symbology` — and cannot know at the call site which member it is editing.
 * `kind` and `id` are excluded: changing either is a different operation with
 * its own invariants (id uniqueness, geometry translation).
 */
export type ElementPatch = Partial<
  // `kind` is stripped from each member BEFORE the intersection: intersecting
  // the literal types "TEXT" & "FIELD" is `never`, which would collapse the
  // whole patch type to an unusable `Partial<never>`.
  Omit<TextElement, "kind" | "id"> &
    Omit<FieldElement, "kind" | "id"> &
    Omit<LineElement, "kind" | "id"> &
    Omit<RectElement, "kind" | "id"> &
    Omit<ImageElement, "kind" | "id"> &
    Omit<BarcodeElement, "kind" | "id"> &
    Omit<QrcodeElement, "kind" | "id"> &
    Omit<PagebreakElement, "kind" | "id">
>;

export type BandPatch = Partial<Omit<Band, "elements">>;

export type DesignerMeta = {
  name: string;
  docType: string;
  outputMode: OutputMode | string;
  paperCode: string;
  version: number;
  isDefault: boolean;
  isSystemTemplate: boolean;
  companyId: string | null;
  branchId: string | null;
  isActive: boolean;
};

export type Selection = {
  bandIndex: number | null;
  elementIds: string[];
};

export type DesignerView = {
  zoom: number;
  showGrid: boolean;
  snapEnabled: boolean;
  gridMm: number;
  /** Raw `{{ … }}` versus sample values substituted for display. */
  showExpressions: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
};

export type InteractionMode = "IDLE" | "DRAGGING" | "RESIZING" | "MARQUEE" | "PLACING";

export type DesignerInteraction = {
  mode: InteractionMode;
  placingKind: ElementKind | null;
  /** Millimetres; live preview only, never committed from here. */
  dragDelta: { dx: number; dy: number } | null;
  resizeHandle: ResizeHandle | null;
  /** Marquee rectangle in band-relative millimetres. */
  marquee: (Rect & { bandIndex: number }) | null;
  guides: Guide[];
};

export type DesignerStatus = "EMPTY" | "DRAFT" | "LOADED";

export type DesignerState = {
  status: DesignerStatus;
  /** Null while a brand-new template has not been saved yet. */
  templateId: string | null;
  meta: DesignerMeta;
  definition: TemplateDefinition;
  datasets: ProviderDescriptor[];
  vocabulary: TemplateSchemaVocabulary | null;
  selection: Selection;
  view: DesignerView;
  interaction: DesignerInteraction;
  history: HistoryState;
  dirty: boolean;
  lastSavedAt: string | null;
};

const A4 = PAPER_PRESETS[0];

const emptyDefinition = (): TemplateDefinition => ({
  schemaVersion: 1,
  layoutMode: "GRAPHIC",
  paper: paperFromPreset(A4),
  datasets: [],
  bands: [],
});

const freshSelection = (): Selection => ({ bandIndex: null, elementIds: [] });

const freshInteraction = (): DesignerInteraction => ({
  mode: "IDLE",
  placingKind: null,
  dragDelta: null,
  resizeHandle: null,
  marquee: null,
  guides: [],
});

const initialState: DesignerState = {
  status: "EMPTY",
  templateId: null,
  meta: {
    name: "",
    docType: "",
    outputMode: "PDF",
    paperCode: "A4",
    version: 0,
    isDefault: false,
    isSystemTemplate: false,
    companyId: null,
    branchId: null,
    isActive: true,
  },
  definition: emptyDefinition(),
  datasets: [],
  vocabulary: null,
  selection: freshSelection(),
  view: {
    zoom: 1,
    showGrid: true,
    snapEnabled: true,
    gridMm: 1,
    showExpressions: true,
    leftPanelOpen: true,
    rightPanelOpen: true,
  },
  interaction: freshInteraction(),
  history: emptyHistory(),
  dirty: false,
  lastSavedAt: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const bandAt = (definition: TemplateDefinition, index: number): Band | undefined =>
  definition.bands[index];

function allElementIds(definition: TemplateDefinition): Set<string> {
  const ids = new Set<string>();
  for (const band of definition.bands) {
    for (const element of band.elements) {
      ids.add(element.id);
    }
  }
  return ids;
}

/** The selected elements, in band order. Empty when the selection is a band. */
function selectedElements(state: DesignerState): ReportElement[] {
  const { bandIndex, elementIds } = state.selection;
  if (bandIndex === null || !elementIds.length) {
    return [];
  }
  const band = bandAt(state.definition, bandIndex);
  if (!band) {
    return [];
  }
  const wanted = new Set(elementIds);
  // Unwrap the immer drafts before handing these out: callers clone them
  // (clipboard, duplicate) and `structuredClone` refuses a Proxy.
  return band.elements
    .filter((element) => wanted.has(element.id))
    .map((element) => (isDraft(element) ? (current(element) as ReportElement) : element));
}

/**
 * The box an element is clamped to, in CANVAS UNITS.
 *
 * GRAPHIC: the full page width in millimetres, because `x` is page-relative
 * (see lib/geometry.ts for why margins are not the origin).
 * GRID: the printable character columns, and the band's height in rows.
 */
const boundsOf = (definition: TemplateDefinition, band: Band) =>
  isGrid(definition)
    ? {
        widthMm: gridMetrics(definition.paper).columns,
        heightMm: band.heightRows ?? band.heightMm,
      }
    : bandContentSize(definition, band);

/**
 * Mutate the selected elements of one band inside a recorded edit.
 * Centralised because every geometry operation needs the same three things:
 * the band, the selection, and the band bounds to clamp against.
 */
function editSelectedElements(
  state: DesignerState,
  label: string,
  mutate: (element: ReportElement, band: Band, bounds: { widthMm: number; heightMm: number }) => ReportElement,
  coalesceKey?: string,
): void {
  const { bandIndex, elementIds } = state.selection;
  if (bandIndex === null || !elementIds.length) {
    return;
  }
  const wanted = new Set(elementIds);

  commitDefinitionEdit(
    state,
    label,
    (definition) => {
      const band = definition.bands[bandIndex];
      if (!band) {
        return;
      }
      const bounds = boundsOf(definition, band);
      band.elements = band.elements.map((element) =>
        wanted.has(element.id) ? mutate(element, band, bounds) : element,
      );
    },
    { coalesceKey },
  );
}

const applyPatchToElement = (element: ReportElement, patch: ElementPatch): ReportElement =>
  ({ ...element, ...patch }) as ReportElement;

/** GRID templates address elements by cell; GRAPHIC ones by millimetre. */
const isGrid = (definition: TemplateDefinition): boolean => definition.layoutMode === "GRID";

/**
 * Rewrite an element's millimetre geometry from its cell coordinates.
 *
 * In GRID mode `col`/`row`/`cols` are the truth the renderers read; `x`/`y`/`w`
 * exist only so the canvas and the position inputs have one code path for both
 * layout modes. Keeping them derived — rather than letting the two drift — is
 * what makes that shortcut safe.
 */
function syncGridGeometry(definition: TemplateDefinition, element: ReportElement): void {
  if (!isGrid(definition) || element.kind === "PAGEBREAK") {
    return;
  }
  if (element.kind === "LINE") {
    // A GRID line is a run of `gridChar` along one row, so its endpoints are
    // column indices on that row.
    element.y1 = element.row ?? element.y1;
    element.y2 = element.y1;
    return;
  }
  const cell = cellOf(element);
  element.col = cell.col;
  element.row = cell.row;
  element.cols = cell.cols;
  // The mm-named fields carry the same cell counts in GRID mode — that is how
  // the shipped templates are written, and what the renderers read back.
  element.x = cell.col;
  element.y = cell.row;
  if (element.kind === "QRCODE") {
    return;
  }
  element.w = cell.cols;
  element.h = element.h ?? 1;
}

/** Move an element by whole character cells. GRID mode's drag commit. */
function moveElementByCells(
  definition: TemplateDefinition,
  element: ReportElement,
  dCol: number,
  dRow: number,
): void {
  if (element.kind === "PAGEBREAK") {
    return;
  }
  if (element.kind === "LINE") {
    element.x1 = Math.max(0, element.x1 + dCol);
    element.x2 = Math.max(0, element.x2 + dCol);
    element.y1 = Math.max(0, element.y1 + dRow);
    element.y2 = element.y1;
    element.row = element.y1;
    return;
  }
  const cell = cellOf(element);
  element.col = Math.max(0, cell.col + dCol);
  element.row = Math.max(0, cell.row + dRow);
  element.cols = cell.cols;
  syncGridGeometry(definition, element);
}

// ─── Slice ───────────────────────────────────────────────────────────────────

const designerSlice = createSlice({
  name: "printDesigner",
  initialState,
  reducers: {
    /** An existing template arrived from `GET /reports/templates/:id`. */
    templateLoaded(state, action: PayloadAction<TemplatePayload>) {
      const template = action.payload;
      state.status = "LOADED";
      state.templateId = template.ptId;
      state.meta = {
        name: template.ptName,
        docType: template.ptDocType,
        outputMode: template.ptOutputMode,
        paperCode: template.ptPaperCode,
        version: template.ptVersion,
        isDefault: template.ptIsDefault,
        isSystemTemplate: template.isSystemTemplate,
        companyId: template.ptCompanyId,
        branchId: template.ptBranchId,
        isActive: template.ptIsActive,
      };
      state.definition = template.definition;
      state.selection = freshSelection();
      state.interaction = freshInteraction();
      state.history = emptyHistory();
      // A migrated definition is already different from what is stored, so the
      // designer opens dirty on purpose: saving is how the upgrade is persisted.
      state.dirty = template.definitionMigrated;
      state.lastSavedAt = template.ptModifiedOn ?? template.ptCreatedOn;
    },

    /** The paper wizard produced a definition that has never been saved. */
    draftStarted(
      state,
      action: PayloadAction<{
        meta: Partial<DesignerMeta>;
        definition: TemplateDefinition;
        /**
         * Whether the seeded design counts as unsaved work.
         *
         * True for a genuinely NEW template — nothing has been written yet, so
         * the guard should stop a careless close. FALSE when a host seeds an
         * existing revision it has just loaded: nothing has been modified, and
         * saying so would flag every freshly-opened design as dirty and make the
         * unsaved-changes guard cry wolf. Defaults to true, which is what the
         * standalone /new route means.
         */
        dirty?: boolean;
      }>,
    ) {
      state.status = "DRAFT";
      state.templateId = null;
      state.meta = { ...initialState.meta, ...action.payload.meta };
      state.definition = action.payload.definition;
      state.selection = freshSelection();
      state.interaction = freshInteraction();
      state.history = emptyHistory();
      state.dirty = action.payload.dirty ?? true;
      state.lastSavedAt = null;
    },

    designerClosed() {
      return {
        ...initialState,
        meta: { ...initialState.meta },
        view: { ...initialState.view },
        selection: freshSelection(),
        interaction: freshInteraction(),
        definition: emptyDefinition(),
        datasets: [],
        history: emptyHistory(),
      };
    },

    /** A save or publish came back; the server's row is now the truth. */
    templateSaved(state, action: PayloadAction<TemplatePayload>) {
      const template = action.payload;
      state.status = "LOADED";
      state.templateId = template.ptId;
      state.meta = {
        ...state.meta,
        name: template.ptName,
        version: template.ptVersion,
        isDefault: template.ptIsDefault,
        isSystemTemplate: template.isSystemTemplate,
        companyId: template.ptCompanyId,
        branchId: template.ptBranchId,
        isActive: template.ptIsActive,
      };
      state.definition = template.definition;
      state.history = emptyHistory();
      state.dirty = false;
      state.lastSavedAt = template.ptModifiedOn ?? new Date().toISOString();
    },

    datasetsLoaded(state, action: PayloadAction<ProviderDescriptor[]>) {
      state.datasets = action.payload;
    },

    vocabularyLoaded(state, action: PayloadAction<TemplateSchemaVocabulary>) {
      state.vocabulary = action.payload;
    },

    // ── View ───────────────────────────────────────────────────────────
    setZoom(state, action: PayloadAction<number>) {
      state.view.zoom = action.payload;
    },
    setShowGrid(state, action: PayloadAction<boolean>) {
      state.view.showGrid = action.payload;
    },
    setSnapEnabled(state, action: PayloadAction<boolean>) {
      state.view.snapEnabled = action.payload;
    },
    setGridMm(state, action: PayloadAction<number>) {
      state.view.gridMm = Math.max(0, action.payload);
    },
    setShowExpressions(state, action: PayloadAction<boolean>) {
      state.view.showExpressions = action.payload;
    },
    setLeftPanelOpen(state, action: PayloadAction<boolean>) {
      state.view.leftPanelOpen = action.payload;
    },
    setRightPanelOpen(state, action: PayloadAction<boolean>) {
      state.view.rightPanelOpen = action.payload;
    },

    // ── Selection ──────────────────────────────────────────────────────
    selectBand(state, action: PayloadAction<number | null>) {
      state.selection = { bandIndex: action.payload, elementIds: [] };
    },

    selectElement(
      state,
      action: PayloadAction<{ bandIndex: number; elementId: string; additive?: boolean }>,
    ) {
      const { bandIndex, elementId, additive } = action.payload;
      // A multi-selection cannot span bands: element coordinates are
      // band-relative, so a shared bounding box across two bands would be
      // meaningless and every alignment op would move things unpredictably.
      if (!additive || state.selection.bandIndex !== bandIndex) {
        state.selection = { bandIndex, elementIds: [elementId] };
        return;
      }
      const existing = state.selection.elementIds;
      state.selection.elementIds = existing.includes(elementId)
        ? existing.filter((id) => id !== elementId)
        : [...existing, elementId];
    },

    selectElements(state, action: PayloadAction<{ bandIndex: number; elementIds: string[] }>) {
      state.selection = {
        bandIndex: action.payload.bandIndex,
        elementIds: [...action.payload.elementIds],
      };
    },

    selectAllInBand(state, action: PayloadAction<number>) {
      const band = bandAt(state.definition, action.payload);
      if (!band) {
        return;
      }
      state.selection = {
        bandIndex: action.payload,
        elementIds: band.elements.map((element) => element.id),
      };
    },

    clearSelection(state) {
      state.selection = freshSelection();
    },

    // ── Interaction (transient) ────────────────────────────────────────
    dragStarted(state) {
      state.interaction.mode = "DRAGGING";
      state.interaction.dragDelta = { dx: 0, dy: 0 };
      state.interaction.guides = [];
    },

    dragMoved(state, action: PayloadAction<{ dx: number; dy: number; guides?: Guide[] }>) {
      if (state.interaction.mode !== "DRAGGING") {
        return;
      }
      state.interaction.dragDelta = { dx: action.payload.dx, dy: action.payload.dy };
      state.interaction.guides = action.payload.guides ?? [];
    },

    resizeStarted(state, action: PayloadAction<ResizeHandle>) {
      state.interaction.mode = "RESIZING";
      state.interaction.resizeHandle = action.payload;
      state.interaction.dragDelta = { dx: 0, dy: 0 };
      state.interaction.guides = [];
    },

    resizeMoved(state, action: PayloadAction<{ dx: number; dy: number; guides?: Guide[] }>) {
      if (state.interaction.mode !== "RESIZING") {
        return;
      }
      state.interaction.dragDelta = { dx: action.payload.dx, dy: action.payload.dy };
      state.interaction.guides = action.payload.guides ?? [];
    },

    marqueeStarted(state, action: PayloadAction<{ bandIndex: number; x: number; y: number }>) {
      state.interaction.mode = "MARQUEE";
      state.interaction.marquee = {
        bandIndex: action.payload.bandIndex,
        x: action.payload.x,
        y: action.payload.y,
        w: 0,
        h: 0,
      };
    },

    marqueeMoved(state, action: PayloadAction<Rect>) {
      if (state.interaction.mode !== "MARQUEE" || !state.interaction.marquee) {
        return;
      }
      state.interaction.marquee = { ...state.interaction.marquee, ...action.payload };
    },

    placingStarted(state, action: PayloadAction<ElementKind>) {
      state.interaction.mode = "PLACING";
      state.interaction.placingKind = action.payload;
    },

    interactionEnded(state) {
      state.interaction = freshInteraction();
    },

    // ── Geometry edits ─────────────────────────────────────────────────
    /**
     * Commit a completed move. `dx`/`dy` are the whole gesture, which is why
     * the drag preview keeps its delta out of `definition` — one gesture, one
     * history entry, however many pointermove events it took.
     */
    moveCommitted(
      state,
      action: PayloadAction<{
        dx: number;
        dy: number;
        /** GRID mode: the gesture in whole character cells. */
        dCol?: number;
        dRow?: number;
        coalesceKey?: string;
        label?: string;
      }>,
    ) {
      const { dx, dy, dCol = 0, dRow = 0 } = action.payload;
      const grid = isGrid(state.definition);
      if (grid ? !dCol && !dRow : !dx && !dy) {
        state.interaction = freshInteraction();
        return;
      }
      editSelectedElements(
        state,
        action.payload.label ?? "Move element",
        (element, _band, bounds) => {
          if (grid) {
            const next = { ...element } as ReportElement;
            moveElementByCells(state.definition, next, dCol, dRow);
            return next;
          }
          const moved = moveElement(element, dx, dy);
          const rect = clampRectToBand(elementRect(moved), bounds);
          return withRect(moved, rect);
        },
        action.payload.coalesceKey,
      );
      state.interaction = freshInteraction();
    },

    resizeCommitted(
      state,
      action: PayloadAction<{
        handle: ResizeHandle;
        dx: number;
        dy: number;
        /** GRID mode: change in the element's column span. */
        dCols?: number;
      }>,
    ) {
      const { handle, dx, dy, dCols = 0 } = action.payload;
      const grid = isGrid(state.definition);
      if (grid ? !dCols : !dx && !dy) {
        state.interaction = freshInteraction();
        return;
      }
      editSelectedElements(state, "Resize element", (element, _band, bounds) => {
        if (grid) {
          const next = { ...element } as ReportElement;
          if (next.kind !== "LINE" && next.kind !== "PAGEBREAK") {
            const cell = cellOf(next);
            // A zero-column element would be invisible and unselectable.
            next.cols = Math.max(1, cell.cols + dCols);
            syncGridGeometry(state.definition, next);
          }
          return next;
        }
        const resized = resizeRect(elementRect(element), handle, dx, dy);
        return withRect(element, clampRectToBand(resized, bounds));
      });
      state.interaction = freshInteraction();
    },

    /** Absolute geometry from the position section's numeric inputs. */
    elementRectSet(
      state,
      action: PayloadAction<{ bandIndex: number; elementId: string; rect: Partial<Rect> }>,
    ) {
      const { bandIndex, elementId, rect } = action.payload;
      commitDefinitionEdit(state, "Set position", (definition) => {
        const band = definition.bands[bandIndex];
        const index = band?.elements.findIndex((element) => element.id === elementId) ?? -1;
        if (!band || index < 0) {
          return;
        }
        const current = elementRect(band.elements[index]);
        const merged = { ...current, ...rect };
        band.elements[index] = withRect(
          band.elements[index],
          clampRectToBand(merged, boundsOf(definition, band)),
        );
      });
    },

    // ── Property edits ─────────────────────────────────────────────────
    elementPatched(
      state,
      action: PayloadAction<{
        bandIndex: number;
        elementIds: string[];
        patch: ElementPatch;
        label?: string;
        coalesceKey?: string;
      }>,
    ) {
      const { bandIndex, elementIds, patch } = action.payload;
      const wanted = new Set(elementIds);
      commitDefinitionEdit(
        state,
        action.payload.label ?? "Edit element",
        (definition) => {
          const band = definition.bands[bandIndex];
          if (!band) {
            return;
          }
          band.elements = band.elements.map((element) =>
            wanted.has(element.id) ? applyPatchToElement(element, patch) : element,
          );
        },
        { coalesceKey: action.payload.coalesceKey },
      );
    },

    /** Rename an element, refusing an id that is already taken. */
    elementRenamed(
      state,
      action: PayloadAction<{ bandIndex: number; elementId: string; nextId: string }>,
    ) {
      const { bandIndex, elementId, nextId } = action.payload;
      const trimmed = nextId.trim();
      if (!trimmed || allElementIds(state.definition).has(trimmed)) {
        return;
      }
      commitDefinitionEdit(state, "Rename element", (definition) => {
        const band = definition.bands[bandIndex];
        const element = band?.elements.find((candidate) => candidate.id === elementId);
        if (element) {
          element.id = trimmed;
        }
      });
      if (state.selection.bandIndex === bandIndex) {
        state.selection.elementIds = state.selection.elementIds.map((id) =>
          id === elementId ? trimmed : id,
        );
      }
    },

    // ── Creation and removal ───────────────────────────────────────────
    elementAdded(
      state,
      action: PayloadAction<{
        bandIndex: number;
        kind: ElementKind;
        xMm: number;
        yMm: number;
        col?: number;
        row?: number;
      }>,
    ) {
      const { bandIndex, kind, xMm, yMm } = action.payload;
      const id = nextElementId(kind, allElementIds(state.definition));

      commitDefinitionEdit(state, `Add ${kind.toLowerCase()}`, (definition) => {
        const band = definition.bands[bandIndex];
        if (!band) {
          return;
        }
        const element = createElement({
          kind,
          id,
          xMm,
          yMm,
          layoutMode: definition.layoutMode,
          col: action.payload.col,
          row: action.payload.row,
        });
        const bounds = boundsOf(definition, band);
        band.elements.push(withRect(element, clampRectToBand(elementRect(element), bounds)));
        syncGridGeometry(definition, band.elements[band.elements.length - 1]);
      });

      state.selection = { bandIndex, elementIds: [id] };
      state.interaction = freshInteraction();
    },

    /** A field dragged out of the dataset tree. */
    fieldDropped(
      state,
      action: PayloadAction<{
        bandIndex: number;
        xMm: number;
        yMm: number;
        datasetName: string;
        cardinality: "one" | "many";
        field: FieldMeta;
        col?: number;
        row?: number;
      }>,
    ) {
      const id = nextElementId("FIELD", allElementIds(state.definition));
      const { bandIndex } = action.payload;

      commitDefinitionEdit(state, `Add field ${action.payload.field.name}`, (definition) => {
        const band = definition.bands[bandIndex];
        if (!band) {
          return;
        }
        const element = createFieldElement({
          id,
          xMm: action.payload.xMm,
          yMm: action.payload.yMm,
          layoutMode: definition.layoutMode,
          datasetName: action.payload.datasetName,
          cardinality: action.payload.cardinality,
          field: action.payload.field,
          col: action.payload.col,
          row: action.payload.row,
        });
        band.elements.push(
          withRect(element, clampRectToBand(elementRect(element), boundsOf(definition, band))),
        );
        syncGridGeometry(definition, band.elements[band.elements.length - 1]);
      });

      state.selection = { bandIndex, elementIds: [id] };
    },

    selectionDeleted(state) {
      const { bandIndex, elementIds } = state.selection;
      if (bandIndex === null || !elementIds.length) {
        return;
      }
      const wanted = new Set(elementIds);
      commitDefinitionEdit(
        state,
        elementIds.length > 1 ? `Delete ${elementIds.length} elements` : "Delete element",
        (definition) => {
          const band = definition.bands[bandIndex];
          if (!band) {
            return;
          }
          band.elements = band.elements.filter((element) => !wanted.has(element.id));
        },
      );
      state.selection = { bandIndex, elementIds: [] };
    },

    selectionCopied(state) {
      setClipboard(selectedElements(state));
    },

    selectionCut(state) {
      const elements = selectedElements(state);
      if (!elements.length) {
        return;
      }
      setClipboard(elements);
      const wanted = new Set(elements.map((element) => element.id));
      const bandIndex = state.selection.bandIndex;
      commitDefinitionEdit(state, "Cut element", (definition) => {
        const band = bandIndex === null ? undefined : definition.bands[bandIndex];
        if (!band) {
          return;
        }
        band.elements = band.elements.filter((element) => !wanted.has(element.id));
      });
      state.selection = { bandIndex, elementIds: [] };
    },

    /**
     * Paste into a band, offset so the copy is visible.
     * Ids are regenerated: the definition demands globally unique ids, and a
     * paste that reused them would fail validation on save.
     */
    clipboardPasted(state, action: PayloadAction<{ bandIndex: number }>) {
      const incoming = getClipboard();
      if (!incoming.length) {
        return;
      }
      const { bandIndex } = action.payload;
      const taken = allElementIds(state.definition);
      const pastedIds: string[] = [];

      commitDefinitionEdit(state, "Paste", (definition) => {
        const band = definition.bands[bandIndex];
        if (!band) {
          return;
        }
        const bounds = boundsOf(definition, band);
        for (const element of incoming) {
          const id = nextElementId(element.kind, taken);
          taken.add(id);
          pastedIds.push(id);
          const moved = moveElement({ ...element, id }, PASTE_OFFSET_MM, PASTE_OFFSET_MM);
          band.elements.push(withRect(moved, clampRectToBand(elementRect(moved), bounds)));
        }
      });

      if (pastedIds.length) {
        state.selection = { bandIndex, elementIds: pastedIds };
      }
    },

    selectionDuplicated(state) {
      const elements = selectedElements(state);
      const bandIndex = state.selection.bandIndex;
      if (bandIndex === null || !elements.length) {
        return;
      }
      const taken = allElementIds(state.definition);
      const newIds: string[] = [];

      commitDefinitionEdit(state, "Duplicate", (definition) => {
        const band = definition.bands[bandIndex];
        if (!band) {
          return;
        }
        const bounds = boundsOf(definition, band);
        for (const element of elements) {
          const id = nextElementId(element.kind, taken);
          taken.add(id);
          newIds.push(id);
          const moved = moveElement(
            structuredClone({ ...element, id }),
            PASTE_OFFSET_MM,
            PASTE_OFFSET_MM,
          );
          band.elements.push(withRect(moved, clampRectToBand(elementRect(moved), bounds)));
        }
      });

      if (newIds.length) {
        state.selection = { bandIndex, elementIds: newIds };
      }
    },

    // ── Alignment, distribution, z-order ───────────────────────────────
    selectionAligned(
      state,
      action: PayloadAction<"left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom">,
    ) {
      const elements = selectedElements(state);
      const mode = action.payload;
      // One element aligns to the band, several align to their shared box —
      // which is what makes "align left" useful in both situations.
      const reference =
        elements.length > 1
          ? unionRect(elements.map(elementRect))
          : null;

      editSelectedElements(state, `Align ${mode}`, (element, band, bounds) => {
        const rect = elementRect(element);
        const box = reference ?? { x: 0, y: 0, w: bounds.widthMm, h: band.heightMm };
        const next: Rect = { ...rect };
        switch (mode) {
          case "left":
            next.x = box.x;
            break;
          case "hcenter":
            next.x = box.x + (box.w - rect.w) / 2;
            break;
          case "right":
            next.x = box.x + box.w - rect.w;
            break;
          case "top":
            next.y = box.y;
            break;
          case "vmiddle":
            next.y = box.y + (box.h - rect.h) / 2;
            break;
          case "bottom":
            next.y = box.y + box.h - rect.h;
            break;
        }
        return withRect(element, clampRectToBand(next, bounds));
      });
    },

    selectionDistributed(state, action: PayloadAction<"horizontal" | "vertical">) {
      const elements = selectedElements(state);
      if (elements.length < 3) {
        // Two elements are already evenly spaced; distributing them is a no-op
        // that would still cost a history entry.
        return;
      }
      const axis = action.payload;
      const bandIndex = state.selection.bandIndex;
      if (bandIndex === null) {
        return;
      }

      const rects = elements.map((element) => ({ id: element.id, rect: elementRect(element) }));
      rects.sort((left, right) =>
        axis === "horizontal" ? left.rect.x - right.rect.x : left.rect.y - right.rect.y,
      );

      const first = rects[0].rect;
      const last = rects[rects.length - 1].rect;
      const span =
        axis === "horizontal"
          ? last.x + last.w - first.x
          : last.y + last.h - first.y;
      const totalExtent = rects.reduce(
        (sum, entry) => sum + (axis === "horizontal" ? entry.rect.w : entry.rect.h),
        0,
      );
      const gap = (span - totalExtent) / (rects.length - 1);

      const positions = new Map<string, number>();
      let cursor = axis === "horizontal" ? first.x : first.y;
      for (const entry of rects) {
        positions.set(entry.id, roundMm(cursor));
        cursor += (axis === "horizontal" ? entry.rect.w : entry.rect.h) + gap;
      }

      editSelectedElements(state, `Distribute ${axis}`, (element, _band, bounds) => {
        const position = positions.get(element.id);
        if (position === undefined) {
          return element;
        }
        const rect = elementRect(element);
        const next = axis === "horizontal" ? { ...rect, x: position } : { ...rect, y: position };
        return withRect(element, clampRectToBand(next, bounds));
      });
    },

    /**
     * Move the selection through the band's draw order.
     *
     * `z` is the schema's paint order and array position is the tiebreak, so
     * both are updated: raising `z` alone leaves two elements at the same depth
     * ordered by an array index the user cannot see.
     */
    selectionReordered(state, action: PayloadAction<"forward" | "backward" | "front" | "back">) {
      const { bandIndex, elementIds } = state.selection;
      if (bandIndex === null || !elementIds.length) {
        return;
      }
      const direction = action.payload;
      const wanted = new Set(elementIds);

      commitDefinitionEdit(state, `Bring ${direction}`, (definition) => {
        const band = definition.bands[bandIndex];
        if (!band) {
          return;
        }
        const others = band.elements.filter((element) => !wanted.has(element.id));
        const moving = band.elements.filter((element) => wanted.has(element.id));
        if (!moving.length) {
          return;
        }

        const maxZ = band.elements.reduce((max, element) => Math.max(max, element.z), 0);
        const minZ = band.elements.reduce((min, element) => Math.min(min, element.z), maxZ);

        switch (direction) {
          case "front":
            band.elements = [...others, ...moving];
            for (const element of moving) {
              element.z = Math.min(1_000, maxZ + 1);
            }
            break;
          case "back":
            band.elements = [...moving, ...others];
            for (const element of moving) {
              element.z = Math.max(0, minZ - 1);
            }
            break;
          case "forward":
            for (const element of moving) {
              element.z = Math.min(1_000, element.z + 1);
            }
            band.elements = [...others, ...moving];
            break;
          case "backward":
            for (const element of moving) {
              element.z = Math.max(0, element.z - 1);
            }
            band.elements = [...moving, ...others];
            break;
        }
      });
    },

    // ── Bands ──────────────────────────────────────────────────────────
    bandPatched(state, action: PayloadAction<{ bandIndex: number; patch: BandPatch; coalesceKey?: string }>) {
      const { bandIndex, patch } = action.payload;
      commitDefinitionEdit(
        state,
        "Edit band",
        (definition) => {
          const band = definition.bands[bandIndex];
          if (!band) {
            return;
          }
          Object.assign(band, patch);
        },
        { coalesceKey: action.payload.coalesceKey },
      );
    },

    bandHeightSet(state, action: PayloadAction<{ bandIndex: number; heightMm: number }>) {
      const { bandIndex, heightMm } = action.payload;
      commitDefinitionEdit(
        state,
        "Resize band",
        (definition) => {
          const band = definition.bands[bandIndex];
          if (!band) {
            return;
          }
          band.heightMm = roundMm(Math.max(0, heightMm));
        },
        { coalesceKey: `band-height-${bandIndex}` },
      );
    },

    bandAdded(state, action: PayloadAction<BandType>) {
      commitDefinitionEdit(state, `Add ${action.payload} band`, (definition) => {
        definition.bands.push(createBand(action.payload, definition.layoutMode));
      });
      state.selection = { bandIndex: state.definition.bands.length - 1, elementIds: [] };
    },

    bandRemoved(state, action: PayloadAction<number>) {
      const bandIndex = action.payload;
      commitDefinitionEdit(state, "Remove band", (definition) => {
        if (definition.bands.length <= 1) {
          // The schema requires at least one band; removing the last one would
          // make the template unsaveable and the canvas undroppable.
          return;
        }
        definition.bands.splice(bandIndex, 1);
      });
      state.selection = freshSelection();
    },

    bandMoved(state, action: PayloadAction<{ from: number; to: number }>) {
      const { from, to } = action.payload;
      commitDefinitionEdit(state, "Reorder bands", (definition) => {
        if (to < 0 || to >= definition.bands.length || from === to) {
          return;
        }
        const [band] = definition.bands.splice(from, 1);
        definition.bands.splice(to, 0, band);
      });
      if (state.selection.bandIndex === from) {
        state.selection.bandIndex = to;
      }
    },

    // ── Paper and datasets ─────────────────────────────────────────────
    paperPatched(state, action: PayloadAction<Partial<PaperSpec>>) {
      commitDefinitionEdit(state, "Edit paper", (definition) => {
        Object.assign(definition.paper, action.payload);
      });
    },

    /** Swap the whole paper for a preset, keeping the user's margins. */
    paperPresetApplied(state, action: PayloadAction<string>) {
      const preset = findPaperPreset(action.payload, state.vocabulary?.papers ?? PAPER_PRESETS);
      if (!preset) {
        return;
      }
      commitDefinitionEdit(state, `Paper ${preset.code}`, (definition) => {
        const margins = definition.paper.margins;
        definition.paper = { ...paperFromPreset(preset), margins };
        definition.layoutMode = preset.layoutMode;
      });
      state.meta.paperCode = preset.code;
    },

    marginsPatched(state, action: PayloadAction<Partial<PaperSpec["margins"]>>) {
      commitDefinitionEdit(
        state,
        "Edit margins",
        (definition) => {
          Object.assign(definition.paper.margins, action.payload);
        },
        { coalesceKey: "margins" },
      );
    },

    datasetUpserted(state, action: PayloadAction<DatasetBinding>) {
      const incoming = action.payload;
      commitDefinitionEdit(state, `Bind dataset ${incoming.name}`, (definition) => {
        const index = definition.datasets.findIndex((dataset) => dataset.name === incoming.name);
        if (index < 0) {
          definition.datasets.push(incoming);
        } else {
          definition.datasets[index] = incoming;
        }
      });
    },

    datasetRemoved(state, action: PayloadAction<string>) {
      const name = action.payload;
      commitDefinitionEdit(state, `Remove dataset ${name}`, (definition) => {
        definition.datasets = definition.datasets.filter((dataset) => dataset.name !== name);
        // Bands referencing it would fail validation; clear the reference so
        // the problems list says "needs a dataset" instead of "unknown dataset".
        for (const band of definition.bands) {
          if (band.dataset === name) {
            delete band.dataset;
          }
        }
      });
    },

    // ── Meta ───────────────────────────────────────────────────────────
    nameChanged(state, action: PayloadAction<string>) {
      state.meta.name = action.payload;
      state.dirty = true;
    },

    metaPatched(state, action: PayloadAction<Partial<DesignerMeta>>) {
      state.meta = { ...state.meta, ...action.payload };
      state.dirty = true;
    },

    // ── History ────────────────────────────────────────────────────────
    undo(state) {
      if (!canUndo(state.history)) {
        return;
      }
      undoDefinition(state);
      // The undone edit may have removed the selected elements.
      pruneSelection(state);
    },

    redo(state) {
      if (!canRedo(state.history)) {
        return;
      }
      redoDefinition(state);
      pruneSelection(state);
    },

    /** After an out-of-band save (rollback, import) the definition is fresh. */
    definitionReplaced(state, action: PayloadAction<TemplateDefinition>) {
      state.definition = action.payload;
      state.history = emptyHistory();
      state.selection = freshSelection();
      state.dirty = true;
    },
  },
});

/** Drop selected ids that no longer exist, keeping the band if it survives. */
function pruneSelection(state: DesignerState): void {
  const { bandIndex, elementIds } = state.selection;
  if (bandIndex === null) {
    return;
  }
  const band = bandAt(state.definition, bandIndex);
  if (!band) {
    state.selection = freshSelection();
    return;
  }
  if (!elementIds.length) {
    return;
  }
  const alive = new Set(band.elements.map((element) => element.id));
  state.selection.elementIds = elementIds.filter((id) => alive.has(id));
}

export const designerActions = designerSlice.actions;

export const {
  templateLoaded,
  draftStarted,
  designerClosed,
  templateSaved,
  datasetsLoaded,
  vocabularyLoaded,
  setZoom,
  setShowGrid,
  setSnapEnabled,
  setGridMm,
  setShowExpressions,
  setLeftPanelOpen,
  setRightPanelOpen,
  selectBand,
  selectElement,
  selectElements,
  selectAllInBand,
  clearSelection,
  dragStarted,
  dragMoved,
  resizeStarted,
  resizeMoved,
  marqueeStarted,
  marqueeMoved,
  placingStarted,
  interactionEnded,
  moveCommitted,
  resizeCommitted,
  elementRectSet,
  elementPatched,
  elementRenamed,
  elementAdded,
  fieldDropped,
  selectionDeleted,
  selectionCopied,
  selectionCut,
  clipboardPasted,
  selectionDuplicated,
  selectionAligned,
  selectionDistributed,
  selectionReordered,
  bandPatched,
  bandHeightSet,
  bandAdded,
  bandRemoved,
  bandMoved,
  paperPatched,
  paperPresetApplied,
  marginsPatched,
  datasetUpserted,
  datasetRemoved,
  nameChanged,
  metaPatched,
  undo,
  redo,
  definitionReplaced,
} = designerSlice.actions;

export { isGrid };

export default designerSlice.reducer;
