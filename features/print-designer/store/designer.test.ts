import { describe, expect, it } from "vitest";
import reducer, {
  clipboardPasted,
  elementAdded,
  elementPatched,
  hostSaved,
  moveCommitted,
  redo,
  selectElement,
  selectElements,
  selectionAligned,
  selectionCopied,
  selectionDeleted,
  selectionDuplicated,
  templateLoaded,
  undo,
  type DesignerState,
} from "@/features/print-designer/store/designerSlice";
import { MAX_HISTORY } from "@/features/print-designer/store/history";
import { validateDefinition } from "@/features/print-designer/lib/validate";
import {
  selectFieldsByDataset,
  selectProblems,
} from "@/features/print-designer/store/selectors";
import type { RootState } from "@/store";
import type {
  TemplateDefinition,
  TemplatePayload,
  TextElement,
} from "@/features/print-designer/types/template-definition";

const textElement = (id: string, x: number, y: number, w = 20): TextElement => ({
  kind: "TEXT",
  id,
  x,
  y,
  w,
  h: 6,
  z: 0,
  value: id,
  align: "left",
  vAlign: "top",
  wrap: false,
  ellipsis: false,
  blankWhenZero: false,
});

const definition = (): TemplateDefinition => ({
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
  bands: [
    {
      type: "PAGE_HEADER",
      heightMm: 30,
      groupLevel: 0,
      printOn: "ALL_PAGES",
      autoGrow: false,
      keepTogether: false,
      keepWithNext: false,
      keepWithLastDetail: false,
      spacingRows: 0,
      elements: [textElement("a", 10, 4), textElement("b", 50, 10), textElement("c", 90, 16)],
    },
    {
      type: "DETAIL",
      heightMm: 6,
      dataset: "items",
      groupLevel: 0,
      printOn: "ALL_PAGES",
      autoGrow: true,
      keepTogether: false,
      keepWithNext: false,
      keepWithLastDetail: false,
      spacingRows: 0,
      elements: [],
    },
  ],
});

const payload = (): TemplatePayload => ({
  ptId: "01931f8a-0000-0000-0000-000000000001",
  ptCompanyId: "c1",
  ptBranchId: null,
  ptDocType: "SALE_INVOICE",
  ptOutputMode: "PDF",
  ptPaperCode: "A4",
  ptName: "Invoice A4",
  ptVersion: 3,
  ptParentId: null,
  ptSchemaVer: 1,
  ptIsDefault: false,
  ptIsActive: true,
  isSystemTemplate: false,
  ptCreatedOn: "2026-08-01T10:00:00.000Z",
  ptCreatedBy: null,
  ptModifiedOn: "2026-08-20T10:00:00.000Z",
  ptModifiedBy: null,
  definition: definition(),
  definitionMigrated: false,
});

function loaded(): DesignerState {
  const initial = reducer(undefined, { type: "@@init" });
  return reducer(initial, templateLoaded(payload()));
}

const elementsOf = (state: DesignerState, bandIndex = 0) =>
  state.definition.bands[bandIndex].elements;

describe("templateLoaded", () => {
  it("opens clean, with no history", () => {
    const state = loaded();
    expect(state.status).toBe("LOADED");
    expect(state.dirty).toBe(false);
    expect(state.history.past).toHaveLength(0);
    expect(state.meta.version).toBe(3);
  });

  it("opens DIRTY when the stored definition had to be migrated", () => {
    // The in-memory definition already differs from what is stored, and saving
    // is how that upgrade is persisted.
    const state = reducer(
      reducer(undefined, { type: "@@init" }),
      templateLoaded({ ...payload(), definitionMigrated: true }),
    );
    expect(state.dirty).toBe(true);
  });
});

describe("hostSaved", () => {
  /*
   * The host owns the storage and has nothing to hand back, so the canvas is
   * the record of what was written. Replacing the definition here -- which is
   * what re-seeding through `draftStarted` used to do -- reinstates the host's
   * pre-save copy and loses the edit that was just saved.
   */
  it("marks the design clean WITHOUT touching the definition", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    state = reducer(
      state,
      moveCommitted({ dx: 5, dy: 0, dCol: 0, dRow: 0, label: "Move" }),
    );
    expect(state.dirty).toBe(true);
    const edited = state.definition;

    state = reducer(state, hostSaved());

    expect(state.dirty).toBe(false);
    expect(state.definition).toBe(edited);
    expect(state.lastSavedAt).not.toBeNull();
  });

  it("keeps the history, so undoing across a save works and dirties again", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    state = reducer(
      state,
      moveCommitted({ dx: 5, dy: 0, dCol: 0, dRow: 0, label: "Move" }),
    );
    state = reducer(state, hostSaved());
    state = reducer(state, undo());

    expect(state.dirty).toBe(true);
    expect(state.definition.bands[0].elements[0].x).toBe(10);
  });
});

describe("geometry edits", () => {
  it("commits one history entry per gesture and undoes exactly", () => {
    const before = loaded();
    const selected = reducer(before, selectElement({ bandIndex: 0, elementId: "a" }));
    const moved = reducer(selected, moveCommitted({ dx: 5, dy: 2 }));

    expect(elementsOf(moved)[0]).toMatchObject({ x: 15, y: 6 });
    expect(moved.history.past).toHaveLength(1);
    expect(moved.dirty).toBe(true);

    const undone = reducer(moved, undo());
    expect(undone.definition).toEqual(before.definition);

    const redone = reducer(undone, redo());
    expect(redone.definition).toEqual(moved.definition);
  });

  it("records nothing for a zero-distance gesture", () => {
    const state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    const after = reducer(state, moveCommitted({ dx: 0, dy: 0 }));
    expect(after.history.past).toHaveLength(0);
  });

  it("clamps a move to the page width, not the printable width", () => {
    const state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    const after = reducer(state, moveCommitted({ dx: 500, dy: 0 }));
    // `x` is page-relative: 210mm page, 20mm element. Crossing the margin is
    // allowed (the shipped invoices' frames do exactly that); leaving the sheet
    // is not, because the server rejects it.
    expect(elementsOf(after)[0].x).toBe(190);
  });

  it("moves every selected element by the same delta", () => {
    const state = reducer(
      loaded(),
      selectElements({ bandIndex: 0, elementIds: ["a", "b", "c"] }),
    );
    const after = reducer(state, moveCommitted({ dx: 3, dy: 0 }));
    expect(elementsOf(after).map((element) => element.x)).toEqual([13, 53, 93]);
    expect(after.history.past).toHaveLength(1);
  });
});

describe("history", () => {
  it("coalesces same-key edits inside the window into one entry", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    const original = state.definition;
    for (let index = 0; index < 5; index += 1) {
      state = reducer(state, moveCommitted({ dx: 0.5, dy: 0, coalesceKey: "nudge" }));
    }
    expect(elementsOf(state)[0].x).toBe(12.5);
    expect(state.history.past).toHaveLength(1);
    // One Ctrl+Z returns the whole run, not one nudge of it.
    expect(reducer(state, undo()).definition).toEqual(original);
  });

  it("restores state exactly across 50 operations", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    const original = structuredClone(state.definition);

    for (let index = 0; index < 50; index += 1) {
      state = reducer(
        state,
        // Distinct labels and no coalesce key, so each is its own entry.
        moveCommitted({ dx: 1, dy: 0, label: `Move ${index}` }),
      );
    }
    expect(state.history.past).toHaveLength(50);

    for (let index = 0; index < 50; index += 1) {
      state = reducer(state, undo());
    }
    expect(state.definition).toEqual(original);

    for (let index = 0; index < 50; index += 1) {
      state = reducer(state, redo());
    }
    expect(elementsOf(state)[0].x).toBe(60);
  });

  it("caps the stack and drops the oldest entry", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    for (let index = 0; index < MAX_HISTORY + 10; index += 1) {
      state = reducer(state, moveCommitted({ dx: 0.5, dy: 0, label: `Move ${index}` }));
    }
    expect(state.history.past).toHaveLength(MAX_HISTORY);
  });

  it("abandons the redo branch after a new edit", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    state = reducer(state, moveCommitted({ dx: 5, dy: 0, label: "one" }));
    state = reducer(state, undo());
    expect(state.history.future).toHaveLength(1);
    state = reducer(state, moveCommitted({ dx: 1, dy: 0, label: "two" }));
    expect(state.history.future).toHaveLength(0);
  });

  it("keeps view and selection out of history", () => {
    const state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    expect(state.history.past).toHaveLength(0);
    expect(state.dirty).toBe(false);
  });
});

describe("clipboard and creation", () => {
  it("gives a pasted element a fresh id", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "a" }));
    state = reducer(state, selectionCopied());
    state = reducer(state, clipboardPasted({ bandIndex: 0 }));

    const ids = elementsOf(state).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
    // The copy is offset so it is visibly not the original.
    const pasted = elementsOf(state)[3];
    expect(pasted).toMatchObject({ x: 12, y: 6 });
    expect(state.selection.elementIds).toEqual([pasted.id]);
  });

  it("duplicates without colliding ids", () => {
    let state = reducer(
      loaded(),
      selectElements({ bandIndex: 0, elementIds: ["a", "b"] }),
    );
    state = reducer(state, selectionDuplicated());
    const ids = elementsOf(state).map((element) => element.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("adds an element with a unique id and selects it", () => {
    const state = reducer(
      loaded(),
      elementAdded({ bandIndex: 1, kind: "FIELD", xMm: 4, yMm: 0 }),
    );
    const added = elementsOf(state, 1)[0];
    expect(added.kind).toBe("FIELD");
    expect(state.selection).toEqual({ bandIndex: 1, elementIds: [added.id] });
  });

  it("drops deleted ids from the selection", () => {
    let state = reducer(loaded(), selectElements({ bandIndex: 0, elementIds: ["a", "b"] }));
    state = reducer(state, selectionDeleted());
    expect(elementsOf(state).map((element) => element.id)).toEqual(["c"]);
    expect(state.selection.elementIds).toEqual([]);
  });
});

describe("alignment", () => {
  it("aligns a multi-selection to its own bounding box", () => {
    let state = reducer(
      loaded(),
      selectElements({ bandIndex: 0, elementIds: ["a", "b", "c"] }),
    );
    state = reducer(state, selectionAligned("left"));
    expect(elementsOf(state).map((element) => element.x)).toEqual([10, 10, 10]);
  });

  it("aligns a single element to the page", () => {
    let state = reducer(loaded(), selectElement({ bandIndex: 0, elementId: "b" }));
    state = reducer(state, selectionAligned("right"));
    // 210mm page minus the 20mm element.
    expect(elementsOf(state)[1].x).toBe(190);
  });
});

describe("property edits", () => {
  it("applies one patch to every selected element", () => {
    let state = reducer(loaded(), selectElements({ bandIndex: 0, elementIds: ["a", "c"] }));
    state = reducer(
      state,
      elementPatched({
        bandIndex: 0,
        elementIds: ["a", "c"],
        patch: { align: "right" },
      }),
    );
    expect(elementsOf(state).map((element) => (element as TextElement).align)).toEqual([
      "right",
      "left",
      "right",
    ]);
  });
});

describe("inserting a crosstab", () => {
  /** The fixture has only a page header and a detail band; neither may hold one. */
  const withSummary = (datasets = [{ name: "items", provider: "sales.invoice.lines", cardinality: "many" as const }]) => {
    const base = loaded();
    return {
      ...base,
      definition: {
        ...base.definition,
        datasets,
        bands: [
          ...base.definition.bands,
          {
            type: "SUMMARY" as const,
            heightMm: 30,
            groupLevel: 0,
            printOn: "ALL_PAGES" as const,
            autoGrow: false,
            keepTogether: false,
            keepWithNext: false,
            keepWithLastDetail: false,
            spacingRows: 0,
            elements: [],
          },
        ],
      },
    } as DesignerState;
  };

  const summaryIndex = 2;

  it("binds it to the first repeating dataset, because an unbound one breaks the whole template", () => {
    // `dataset` is a required identifier on the server, so a crosstab left at
    // "" makes the ENTIRE definition fail to parse — the template stops
    // rendering and the error names bands.N.elements.M.dataset rather than the
    // element the user just dropped.
    const state = reducer(
      withSummary(),
      elementAdded({ bandIndex: summaryIndex, kind: "CROSSTAB", xMm: 10, yMm: 2 }),
    );
    const added = elementsOf(state, summaryIndex)[0];
    if (added?.kind !== "CROSSTAB") {
      throw new Error("not a crosstab");
    }

    expect(added.dataset).toBe("items");
    // The whole point: a freshly inserted crosstab is immediately renderable.
    expect(validateDefinition(state.definition)).toEqual([]);
  });

  it("leaves the dataset empty when the template has nothing repeating to pivot", () => {
    // Nothing to bind to is a real state, and the designer's problem list is
    // what tells the user — silently inventing a dataset name would be worse.
    const state = reducer(
      withSummary([]),
      elementAdded({ bandIndex: summaryIndex, kind: "CROSSTAB", xMm: 10, yMm: 2 }),
    );
    const added = elementsOf(state, summaryIndex)[0];
    if (added?.kind !== "CROSSTAB") {
      throw new Error("not a crosstab");
    }

    expect(added.dataset).toBe("");
    expect(validateDefinition(state.definition).map((problem) => problem.message)).toContain(
      `'${added.id}' has no dataset to pivot.`,
    );
  });
});

describe("problems, as the designer computes them", () => {
  /*
   * The wiring test for the catalogue-aware checks: `validateDefinition` can
   * only report a field the dataset does not return if something hands it the
   * column list, and that something is the store.
   */
  const stateWithCatalogue = (definitionState: DesignerState): RootState =>
    ({
      printDesigner: {
        ...definitionState,
        datasets: [
          {
            token: "sales.invoice.lines",
            label: "Invoice lines",
            cardinality: "many" as const,
            docTypes: [],
            fields: [
              { name: "itemName", type: "string" as const, label: "Item" },
              { name: "hsnCode", type: "string" as const, label: "HSN" },
              { name: "netAmount", type: "number" as const, label: "Amount" },
            ],
          },
        ],
      },
    }) as unknown as RootState;

  it("keys the column lists by the name the template binds, not the provider token", () => {
    expect(selectFieldsByDataset(stateWithCatalogue(loaded()))).toEqual({
      items: ["itemName", "hsnCode", "netAmount"],
    });
  });

  it("catches a crosstab left on its placeholder fields", () => {
    const base = loaded();
    const withCrosstab = {
      ...base,
      definition: {
        ...base.definition,
        bands: [
          ...base.definition.bands,
          {
            type: "SUMMARY" as const,
            heightMm: 30,
            groupLevel: 0,
            printOn: "ALL_PAGES" as const,
            autoGrow: false,
            keepTogether: false,
            keepWithNext: false,
            keepWithLastDetail: false,
            spacingRows: 0,
            elements: [],
          },
        ],
      },
    } as DesignerState;

    const state = reducer(
      withCrosstab,
      elementAdded({ bandIndex: 2, kind: "CROSSTAB", xMm: 10, yMm: 2 }),
    );

    const problems = selectProblems(stateWithCatalogue(state));
    expect(problems).toHaveLength(3);
    expect(problems.map((problem) => problem.message).join(" ")).toMatch(
      /reads 'name'.*reads 'period'.*reads 'amount'/,
    );
  });
});
