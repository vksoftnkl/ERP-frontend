import { describe, expect, it } from "vitest";

import {
  bindingsFor,
  bodyFromDefinition,
  isTemplateDefinition,
  layoutModeFor,
  paperFor,
  selectListColumns,
  sqlToken,
  toProviderDescriptors,
  toTemplateDefinition,
} from "./canvasBridge";
import { blankVersion, type DraftDataset, type DraftVersion } from "./draft";

function dataset(overrides: Partial<DraftDataset> = {}): DraftDataset {
  return {
    ptdRole: "DETAIL",
    ptdDatasetNo: 1,
    ptdSortOrder: 0,
    ptdName: "items",
    ptdSourceKind: "PROVIDER",
    ptdProviderCode: "sales.bill.items",
    ptdRowLimit: 5_000,
    ptdTimeoutMs: 15_000,
    ...overrides,
  };
}

function version(overrides: Partial<DraftVersion> = {}): DraftVersion {
  return { ...blankVersion(), ...overrides };
}

describe("layout mode follows the engine", () => {
  it("puts the text engines on a character grid", () => {
    expect(layoutModeFor("ESCPOS_TEXT", null)).toBe("GRID");
    expect(layoutModeFor("RAW", null)).toBe("GRID");
  });

  it("puts the page engines in millimetres", () => {
    expect(layoutModeFor("JSON_BANDS", 48)).toBe("GRAPHIC");
    expect(layoutModeFor("HTML_CSS", null)).toBe("GRAPHIC");
    expect(layoutModeFor("QTRPT_XML", null)).toBe("GRAPHIC");
  });
});

describe("the page comes from the version, not the body", () => {
  it("takes the margins and orientation as stored", () => {
    const paper = paperFor(
      version({
        ptvMarginTopMm: 8,
        ptvMarginBottomMm: 9,
        ptvMarginLeftMm: 10,
        ptvMarginRightMm: 11,
        ptvOrientation: "LANDSCAPE",
      }),
    );

    expect(paper.margins).toEqual({ top: 8, right: 11, bottom: 9, left: 10 });
    expect(paper.orientation).toBe("LANDSCAPE");
  });

  it("keeps a paper code no preset knows, rather than renaming it to A4", () => {
    expect(paperFor(version({ ptvPaperCode: "SITE_FORM" })).code).toBe("SITE_FORM");
  });

  it("keeps a null height — continuous stationery is not a missing value", () => {
    const paper = paperFor(version({ ptvPaperCode: "T80", ptvHeightMm: null }));

    // Whatever the T80 preset says, an explicit width still wins.
    expect(paperFor(version({ ptvWidthMm: 76 })).widthMm).toBe(76);
    expect(paper.code).toBe("T80");
  });

  it("passes columns through only when the version sets them", () => {
    expect(paperFor(version({ ptvColumns: 42 })).columns).toBe(42);
    expect("columns" in paperFor(version({ ptvColumns: null }))).toBe(false);
  });
});

describe("dataset bindings", () => {
  it("maps MASTER to one and DETAIL to many", () => {
    const bindings = bindingsFor([
      dataset({ ptdRole: "MASTER", ptdDatasetNo: 0, ptdName: "header" }),
      dataset(),
    ]);

    expect(bindings[0].cardinality).toBe("one");
    expect(bindings[1].cardinality).toBe("many");
  });

  it("uses the provider code for a PROVIDER dataset", () => {
    expect(bindingsFor([dataset()])[0].provider).toBe("sales.bill.items");
  });

  it("gives a SQL dataset a synthetic token, since it has none", () => {
    const bindings = bindingsFor([dataset({ ptdSourceKind: "SQL", ptdProviderCode: null })]);

    expect(bindings[0].provider).toBe(sqlToken("items"));
  });

  it("drops an unnamed row rather than binding a band to an empty name", () => {
    expect(bindingsFor([dataset({ ptdName: "" })])).toEqual([]);
  });
});

describe("opening a revision on the canvas", () => {
  it("takes the bands from the stored body, normalised, and keeps its meta", () => {
    const stored = { bands: [{ type: "DETAIL" }], meta: { note: "mine" } };
    const definition = toTemplateDefinition(version({ ptvBody: stored }));

    expect(definition.bands).toHaveLength(1);
    expect(definition.bands[0].type).toBe("DETAIL");
    // The canvas's own free-form metadata survives a round trip.
    expect(definition.meta).toEqual({ note: "mine" });
  });

  it("OVERRIDES the body's paper and datasets with the version's", () => {
    // A stale copy in the body must never outrank the Template and Data tabs.
    const stored = {
      bands: [],
      paper: { code: "WRONG", widthMm: 1, heightMm: 1, orientation: "LANDSCAPE", margins: {} },
      datasets: [{ name: "ghost", provider: "nope", cardinality: "many" }],
    };

    const definition = toTemplateDefinition(
      version({ ptvBody: stored, ptvPaperCode: "A4", datasets: [dataset()] }),
    );

    expect(definition.paper.code).toBe("A4");
    expect(definition.datasets).toEqual([
      { name: "items", provider: "sales.bill.items", cardinality: "many" },
    ]);
  });

  /*
   * The body is a text column with no schema check beyond "parses as an object",
   * so a `bands` array is not a canvas `bands` array. Handing one straight to
   * the canvas crashed it on `band.elements is not iterable`.
   */
  describe("a stored body is never trusted to hold real bands", () => {
    it("gives a band with no elements an empty array rather than crashing", () => {
      const definition = toTemplateDefinition(
        version({ ptvBody: { bands: [{ type: "DETAIL" }] } }),
      );

      expect(definition.bands[0].elements).toEqual([]);
    });

    it("drops a band whose type it does not recognise, rather than guessing", () => {
      const definition = toTemplateDefinition(
        version({ ptvBody: { bands: [{ kind: "HEADER" }, { type: "NOT_A_BAND" }] } }),
      );

      // Nothing survived, so the starting pair is offered instead of a blank sheet.
      expect(definition.bands.every((band) => String(band.type) !== "NOT_A_BAND")).toBe(true);
      expect(definition.bands.length).toBeGreaterThan(0);
    });

    it("keeps the values a partial band DID carry", () => {
      const definition = toTemplateDefinition(
        version({
          ptvBody: { bands: [{ type: "DETAIL", heightMm: 42, dataset: "items", autoGrow: false }] },
        }),
      );

      expect(definition.bands[0]).toMatchObject({
        type: "DETAIL",
        heightMm: 42,
        dataset: "items",
        autoGrow: false,
      });
    });

    it("keeps a stored printOn, and falls back only on an unknown one", () => {
      const definition = toTemplateDefinition(
        version({
          ptvBody: {
            bands: [
              { type: "PAGE_HEADER", printOn: "NOT_FIRST_PAGE" },
              { type: "PAGE_FOOTER", printOn: "SOMETHING_ELSE" },
            ],
          },
        }),
      );

      // It saved fine and was thrown away on the way back in, resetting every
      // band to ALL_PAGES on reopen.
      expect(definition.bands[0].printOn).toBe("NOT_FIRST_PAGE");
      expect(definition.bands[1].printOn).toBe("ALL_PAGES");
    });

    it("filters non-object elements out of a band", () => {
      const definition = toTemplateDefinition(
        version({ ptvBody: { bands: [{ type: "DETAIL", elements: [null, "x", { id: "e1" }] }] } }),
      );

      expect(definition.bands[0].elements).toEqual([{ id: "e1" }]);
    });

    it("keeps the good bands out of a mixed array", () => {
      const definition = toTemplateDefinition(
        version({ ptvBody: { bands: [{ type: "PAGE_HEADER" }, null, { type: "DETAIL" }] } }),
      );

      expect(definition.bands.map((band) => band.type)).toEqual(["PAGE_HEADER", "DETAIL"]);
    });
  });

  it("opens an empty design when the body is not a canvas definition", () => {
    for (const body of ["<html></html>", "{broken", { bands: undefined }] as unknown[]) {
      const definition = toTemplateDefinition(version({ ptvBody: body as never }));
      expect(Array.isArray(definition.bands)).toBe(true);
    }
  });

  it("recognises a definition only by its bands array", () => {
    expect(isTemplateDefinition({ bands: [] })).toBe(true);
    expect(isTemplateDefinition({ bands: "no" })).toBe(false);
    expect(isTemplateDefinition([{ bands: [] }])).toBe(false);
    expect(isTemplateDefinition(null)).toBe(false);
    expect(isTemplateDefinition("{}")).toBe(false);
  });

  it("round-trips through the body", () => {
    const first = toTemplateDefinition(version({ datasets: [dataset()] }));
    const second = toTemplateDefinition(
      version({ ptvBody: bodyFromDefinition(first), datasets: [dataset()] }),
    );

    expect(second.bands).toEqual(first.bands);
    expect(second.paper).toEqual(first.paper);
    expect(second.datasets).toEqual(first.datasets);
  });
});

describe("selectListColumns — the stand-in for a catalogue that does not exist", () => {
  it("reads plain columns and aliases", () => {
    expect(
      selectListColumns(
        "SELECT i.sbi_slno, i.sbi_item_name AS item_name, i.sbi_qty AS qty FROM t",
      ),
    ).toEqual(["sbi_slno", "item_name", "qty"]);
  });

  it("takes the last dotted segment when there is no alias", () => {
    expect(selectListColumns("SELECT a.one, b.two FROM t")).toEqual(["one", "two"]);
  });

  it("ignores a sub-select's own columns", () => {
    expect(
      selectListColumns("SELECT a, (SELECT x, y FROM z WHERE q = 1) AS total FROM t"),
    ).toEqual(["a", "total"]);
  });

  it("does not split on a comma inside a function call", () => {
    expect(selectListColumns("SELECT coalesce(a, b) AS amount, c FROM t")).toEqual([
      "amount",
      "c",
    ]);
  });

  it("stops at the top-level FROM, not one inside a function", () => {
    expect(
      selectListColumns("SELECT extract(year from d) AS yr, b FROM t"),
    ).toEqual(["yr", "b"]);
  });

  it("contributes nothing for a star, because nothing here knows what it expands to", () => {
    expect(selectListColumns("SELECT * FROM t")).toEqual([]);
    expect(selectListColumns("SELECT t.* FROM t")).toEqual([]);
  });

  it("ignores columns named only inside a literal or a comment", () => {
    expect(
      selectListColumns("SELECT a -- , not_a_column\n, b FROM t"),
    ).toEqual(["a", "b"]);
    expect(selectListColumns("SELECT 'x, y' AS label FROM t")).toEqual(["label"]);
  });

  it("handles DISTINCT and DISTINCT ON", () => {
    expect(selectListColumns("SELECT DISTINCT a, b FROM t")).toEqual(["a", "b"]);
    expect(selectListColumns("SELECT DISTINCT ON (a) a, b FROM t")).toEqual(["a", "b"]);
  });

  it("de-duplicates and survives no query at all", () => {
    expect(selectListColumns("SELECT a, x.a FROM t")).toEqual(["a"]);
    expect(selectListColumns(null)).toEqual([]);
    expect(selectListColumns("")).toEqual([]);
  });

  it("is case-insensitive about the keywords", () => {
    expect(selectListColumns("select a as one from t")).toEqual(["one"]);
  });
});

describe("the data panel's descriptors", () => {
  it("gives a SQL dataset the fields its query returns", () => {
    const [descriptor] = toProviderDescriptors([
      dataset({
        ptdSourceKind: "SQL",
        ptdProviderCode: null,
        ptdSql: "SELECT a AS item_name, b AS qty FROM t WHERE c = :company_id",
      }),
    ]);

    expect(descriptor.token).toBe(sqlToken("items"));
    expect(descriptor.fields.map((field) => field.name)).toEqual(["item_name", "qty"]);
    expect(descriptor.fields[0].description).toMatch(/SELECT list/);
  });

  it("gives a PROVIDER dataset no fields — there is no catalogue to look them up in", () => {
    const [descriptor] = toProviderDescriptors([dataset()]);

    expect(descriptor.token).toBe("sales.bill.items");
    expect(descriptor.fields).toEqual([]);
  });

  it("prefers the dataset's label over its name", () => {
    expect(toProviderDescriptors([dataset({ ptdLabel: "Bill lines" })])[0].label).toBe(
      "Bill lines",
    );
    expect(toProviderDescriptors([dataset({ ptdLabel: null })])[0].label).toBe("items");
  });

  it("scopes to no document type — the list is already one revision's", () => {
    expect(toProviderDescriptors([dataset()])[0].docTypes).toEqual([]);
  });
});
