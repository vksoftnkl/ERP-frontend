import { describe, expect, it } from "vitest";

import {
  blankVersion,
  checkPublishable,
  isEditable,
  newDraftFrom,
  parseBody,
  parseParams,
  renumberDataset,
  reorderDatasets,
  resolvesForNobody,
  rollbackTo,
  toDesignerDraft,
  type DraftDataset,
} from "./draft";
import type { PrintTemplatePayload, PrintTemplateVersionPayload } from "../types/printing";

const APPROVER = "019cc7fc-3547-74a6-b65b-179b9db989a6";

function storedVersion(
  overrides: Partial<PrintTemplateVersionPayload> = {},
): PrintTemplateVersionPayload {
  return {
    ptvId: "v1",
    ptvTemplateId: "t1",
    ptvRevNo: 1,
    ptvStatus: "DRAFT",
    ptvEngine: "JSON_BANDS",
    ptvBody: '{"bands":[]}',
    ptvSchemaVer: 1,
    ptvPaperCode: "A4",
    ptvOrientation: "PORTRAIT",
    ptvWidthMm: null,
    ptvHeightMm: null,
    ptvMarginTopMm: 0,
    ptvMarginBottomMm: 0,
    ptvMarginLeftMm: 0,
    ptvMarginRightMm: 0,
    ptvColumns: null,
    ptvLang: "en-IN",
    ptvFontFamily: null,
    ptvParams: [],
    ptvNote: null,
    ptvApprovedOn: null,
    ptvApprovedBy: null,
    ptvIsDeleted: false,
    ptvSyncDate: null,
    ptvCreatedOn: "2026-08-27T00:00:00.000Z",
    ptvCreatedBy: null,
    ptvModifiedOn: null,
    ptvModifiedBy: null,
    ptvIsPublishedRev: false,
    ptvIsEditable: true,
    datasets: [],
    ...overrides,
  } as PrintTemplateVersionPayload;
}

function template(overrides: Partial<PrintTemplatePayload> = {}): PrintTemplatePayload {
  return {
    ptlId: "t1",
    ptlCompanyId: null,
    ptlPurposeId: "p1",
    ptlCode: "INV_A4",
    ptlName: "Invoice A4",
    ptlSortOrder: 100,
    ptlIsActive: true,
    ptlIsDeleted: false,
    ptlCreatedOn: "2026-08-27T00:00:00.000Z",
    versions: [storedVersion()],
    ...overrides,
  } as PrintTemplatePayload;
}

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

describe("rule 1 — a published revision is read-only", () => {
  it("is not editable once the server says so", () => {
    const history = [storedVersion({ ptvStatus: "PUBLISHED", ptvIsEditable: false })];

    expect(isEditable({ ...blankVersion(), ptvId: "v1" }, history)).toBe(false);
  });

  it("is editable while it is a DRAFT", () => {
    expect(isEditable({ ...blankVersion(), ptvId: "v1" }, [storedVersion()])).toBe(true);
  });

  it("treats an unsaved revision as editable — it has not been written yet", () => {
    expect(isEditable(blankVersion(), [])).toBe(true);
  });

  it("refuses to edit a revision that is not in the history at all", () => {
    expect(isEditable({ ...blankVersion(), ptvId: "ghost" }, [storedVersion()])).toBe(false);
  });
});

describe("rule 2 — a new draft copies the datasets forward", () => {
  const source = { ...blankVersion(), ptvId: "v1", ptvRevNo: 3, datasets: [dataset({ ptdId: "d1" })] };

  it("brings the datasets with it", () => {
    expect(newDraftFrom(source).datasets).toHaveLength(1);
  });

  it("strips their ptdId so they are INSERTed onto the new revision", () => {
    expect(newDraftFrom(source).datasets[0].ptdId).toBeUndefined();
  });

  it("drops ptvId, which is what appends the next revision instead of updating a frozen one", () => {
    const draft = newDraftFrom(source);

    expect(draft.ptvId).toBeUndefined();
    expect(draft.ptvRevNo).toBeUndefined();
  });

  it("clones the body so editing the draft cannot reach back into the revision it came from", () => {
    const original = { ...source, ptvBody: { bands: [{ kind: "HEADER" }] } };
    const draft = newDraftFrom(original);

    (draft.ptvBody as { bands: unknown[] }).bands.push({ kind: "FOOTER" });

    expect((original.ptvBody as { bands: unknown[] }).bands).toHaveLength(1);
  });
});

describe("rule 4 — roll back writes forward", () => {
  it("produces a new revision, never a backwards pointer", () => {
    const draft = rollbackTo(storedVersion({ ptvId: "v2", ptvRevNo: 2 }));

    expect(draft.ptvId).toBeUndefined();
    expect(draft.ptvRevNo).toBeUndefined();
  });

  it("records where it came from", () => {
    expect(rollbackTo(storedVersion({ ptvRevNo: 2 })).ptvNote).toBe("Rolled back from revision 2");
  });

  it("carries the old revision's datasets, as a new draft does", () => {
    const source = storedVersion({
      datasets: [
        {
          ptdId: "d1",
          ptdVersionId: "v1",
          ptdRole: "DETAIL",
          ptdDatasetNo: 1,
          ptdSortOrder: 0,
          ptdName: "items",
          ptdSourceKind: "PROVIDER",
          ptdProviderCode: "sales.bill.items",
          ptdRowLimit: 5_000,
          ptdTimeoutMs: 15_000,
        },
      ],
    } as Partial<PrintTemplateVersionPayload>);

    const draft = rollbackTo(source);

    expect(draft.datasets).toHaveLength(1);
    expect(draft.datasets[0].ptdId).toBeUndefined();
  });
});

describe("rule 3 — reordering is not renumbering", () => {
  const datasets = [
    dataset({ ptdDatasetNo: 1, ptdName: "items", ptdSortOrder: 0 }),
    dataset({ ptdDatasetNo: 2, ptdName: "taxes", ptdSortOrder: 1 }),
    dataset({ ptdDatasetNo: 3, ptdName: "batches", ptdSortOrder: 2 }),
  ];

  it("reordering rewrites ptdSortOrder and leaves every binding alone", () => {
    const moved = reorderDatasets(datasets, 2, 0);

    expect(moved.map((entry) => entry.ptdName)).toEqual(["batches", "items", "taxes"]);
    // THE BINDING travels with the row. This is the 3.0 bug, as an assertion.
    expect(moved.map((entry) => entry.ptdDatasetNo)).toEqual([3, 1, 2]);
    expect(moved.map((entry) => entry.ptdSortOrder)).toEqual([0, 1, 2]);
  });

  it("renumbering is a separate operation that changes only the binding", () => {
    const renumbered = renumberDataset(datasets, 1, 7);

    expect(renumbered[1].ptdDatasetNo).toBe(7);
    expect(renumbered.map((entry) => entry.ptdName)).toEqual(["items", "taxes", "batches"]);
    expect(renumbered.map((entry) => entry.ptdSortOrder)).toEqual([0, 1, 2]);
  });

  it("ignores an out-of-range move rather than corrupting the list", () => {
    expect(reorderDatasets(datasets, 0, 9)).toBe(datasets);
    expect(reorderDatasets(datasets, 1, 1)).toBe(datasets);
  });
});

describe("rule 6 — publishing needs an approver", () => {
  it("refuses without a signature", () => {
    const working = { ...blankVersion(), datasets: [dataset()] };

    expect(checkPublishable(working, null)?.reason).toMatch(/approver/i);
  });

  it("refuses a revision with no datasets, which would render nothing", () => {
    expect(checkPublishable(blankVersion(), APPROVER)?.reason).toMatch(/no datasets/i);
  });

  it("allows a signed revision that has something to render", () => {
    expect(checkPublishable({ ...blankVersion(), datasets: [dataset()] }, APPROVER)).toBeNull();
  });
});

describe("ptvBody is parsed per the engine (trap 5, inbound)", () => {
  it("parses JSON_BANDS into an object", () => {
    expect(parseBody("JSON_BANDS", '{"bands":[]}')).toEqual({ bands: [] });
  });

  it("leaves every other engine as text, even when the text is valid JSON", () => {
    expect(parseBody("RAW", '{"bands":[]}')).toBe('{"bands":[]}');
  });

  it("hands back unparseable JSON_BANDS text rather than showing an empty design", () => {
    expect(parseBody("JSON_BANDS", "{broken")).toBe("{broken");
  });

  it("does not coerce a stored array into an object", () => {
    expect(parseBody("JSON_BANDS", "[1,2]")).toEqual([1, 2]);
  });
});

describe("ptvParams is untyped JSON on the wire", () => {
  it("keeps only entries that name something", () => {
    expect(parseParams([{ name: "a", type: "DATE" }, { type: "TEXT" }, null, "x"])).toEqual([
      { name: "a", type: "DATE", required: false, label: null },
    ]);
  });

  it("reads a non-array as no prompts at all", () => {
    expect(parseParams(null)).toEqual([]);
    expect(parseParams({ name: "a" })).toEqual([]);
  });
});

describe("the working revision is the newest, and the published one is separate", () => {
  it("opens on the newest revision even when an older one is published", () => {
    const draft = toDesignerDraft(
      template({
        ptlPublishedRevId: "v3",
        versions: [
          storedVersion({ ptvId: "v3", ptvRevNo: 3, ptvStatus: "PUBLISHED", ptvIsEditable: false }),
          storedVersion({ ptvId: "v5", ptvRevNo: 5 }),
        ],
      }),
    );

    expect(draft.working.ptvId).toBe("v5");
    // Joined on the POINTER, never on max(ptvRevNo).
    expect(draft.publishedRevId).toBe("v3");
  });

  it("ignores deleted revisions when choosing what to open", () => {
    const draft = toDesignerDraft(
      template({
        versions: [
          storedVersion({ ptvId: "v1", ptvRevNo: 1 }),
          storedVersion({ ptvId: "v2", ptvRevNo: 2, ptvIsDeleted: true }),
        ],
      }),
    );

    expect(draft.working.ptvId).toBe("v1");
    expect(draft.history).toHaveLength(1);
  });

  it("opens a template with no revisions on a blank one", () => {
    expect(toDesignerDraft(template({ versions: [] })).working.ptvId).toBeUndefined();
  });
});

describe("a design with no published revision resolves for nobody", () => {
  it("is true when the pointer is null", () => {
    expect(resolvesForNobody({ ptlPublishedRevId: null })).toBe(true);
    expect(resolvesForNobody({})).toBe(true);
  });

  it("is false once something is published", () => {
    expect(resolvesForNobody({ ptlPublishedRevId: "v1" })).toBe(false);
  });
});
