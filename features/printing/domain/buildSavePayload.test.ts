import { describe, expect, it } from "vitest";

import {
  bodyForWire,
  buildIdentitySavePayload,
  buildPublishPayload,
  buildSavePayload,
  buildVersionPayload,
} from "./buildSavePayload";
import { blankDraft, blankVersion, type DesignerDraft, type DraftDataset } from "./draft";

const APPROVER = "019cc7fc-3547-74a6-b65b-179b9db989a6";

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

function draftWith(overrides: Partial<DesignerDraft> = {}): DesignerDraft {
  return {
    ...blankDraft("019cc7fc-0000-7000-8000-000000000001"),
    ptlCode: "INV_A4",
    ptlName: "Invoice A4",
    ...overrides,
  };
}

describe("trap 4 — identity-only saves omit versions", () => {
  it("emits no `versions` key at all, not an empty array", () => {
    const payload = buildIdentitySavePayload(
      draftWith({ ptlId: "t1", working: { ...blankVersion(), ptvId: "v1" } }),
    );

    expect("versions" in payload).toBe(false);
    expect(payload.ptlName).toBe("Invoice A4");
  });

  /*
   * The server treats every declared DTO field as "present" (see the note on
   * IdentityOptions), so a key this client omits is a key the server OVERWRITES
   * with a default. For `ptlCompanyId` that default is null, which means
   * "shipped with the product, visible to EVERY company" — a rename would hand
   * one tenant's private design to all of them.
   *
   * The defence is that identity payloads are never a diff. This asserts it.
   */
  it("always carries the whole identity, so no field can be defaulted away", () => {
    const draft = draftWith({
      ptlId: "t1",
      ptlCompanyId: "019cc7fc-0000-7000-8000-00000000000c",
      ptlDescription: "keep me",
      ptlIsActive: false,
    });

    for (const payload of [buildIdentitySavePayload(draft), buildSavePayload(draft)]) {
      expect(payload.ptlCompanyId).toBe("019cc7fc-0000-7000-8000-00000000000c");
      expect(payload.ptlDescription).toBe("keep me");
      expect(payload.ptlIsActive).toBe(false);
      expect(payload.ptlPurposeId).toBe(draft.ptlPurposeId);
      expect(payload.ptlCode).toBe(draft.ptlCode);
      expect(payload.ptlSortOrder).toBe(draft.ptlSortOrder);
    }
  });

  it("keeps a shipped design shipped, rather than silently adopting it", () => {
    const draft = draftWith({ ptlId: "t1", ptlCompanyId: null });

    expect(buildIdentitySavePayload(draft).ptlCompanyId).toBeNull();
  });

  it("differs from a full save precisely by that key", () => {
    const draft = draftWith({ ptlId: "t1" });
    const identity = buildIdentitySavePayload(draft);
    const full = buildSavePayload(draft);

    expect(Object.keys(full)).toContain("versions");
    expect({ ...full, versions: undefined }).toEqual({ ...identity, versions: undefined });
  });
});

describe("trap 1 — datasets omitted is not datasets empty", () => {
  it("omits the key when includeDatasets is false", () => {
    const version = buildVersionPayload(
      { ...blankVersion(), datasets: [dataset()] },
      { includeDatasets: false },
    );

    expect("datasets" in version).toBe(false);
  });

  it("sends [] when the designer genuinely holds none — that means delete every one", () => {
    const version = buildVersionPayload({ ...blankVersion(), datasets: [] });

    expect(version.datasets).toEqual([]);
  });

  it("produces two different bodies for the two cases", () => {
    const working = { ...blankVersion(), datasets: [] };
    const omitted = buildVersionPayload(working, { includeDatasets: false });
    const emptied = buildVersionPayload(working, { includeDatasets: true });

    expect(omitted).not.toEqual(emptied);
  });
});

describe("trap 2 — a version is deleted only by asking", () => {
  it("carries the id and the flag and nothing else", () => {
    const payload = buildSavePayload(draftWith({ ptlId: "t1" }), {
      deleteVersionIds: ["v-old"],
    });

    expect(payload.versions).toHaveLength(2);
    expect(payload.versions?.[1]).toEqual({ ptvId: "v-old", ptvIsDeleted: true });
  });

  it("deletes nothing when no ids are given, however short versions[] is", () => {
    const payload = buildSavePayload(draftWith({ ptlId: "t1" }));

    expect(payload.versions).toHaveLength(1);
    expect(payload.versions?.[0].ptvIsDeleted).toBeUndefined();
  });
});

describe("trap 3 — ptlPublishedRevId is never sent", () => {
  it("is absent from an identity save", () => {
    expect("ptlPublishedRevId" in buildIdentitySavePayload(draftWith({ ptlId: "t1" }))).toBe(false);
  });

  it("is absent from a full save, a publish and a rail publish", () => {
    const draft = draftWith({ ptlId: "t1", publishedRevId: "v-already-published" });

    for (const payload of [
      buildSavePayload(draft),
      buildSavePayload(draft, { intent: { kind: "PUBLISH", approvedBy: APPROVER } }),
      buildPublishPayload(draft, "v1", APPROVER),
    ]) {
      expect("ptlPublishedRevId" in payload).toBe(false);
    }
  });

  /*
   * The one exception, and it can only ever DEFEND a pointer, never move one.
   * The server nulls `ptl_published_rev_id` on every update that does not
   * publish (verified 27-08-2026), which silently unpublishes a live design.
   */
  describe("preservePublishedRevId — the workaround for that defect", () => {
    it("echoes the current pointer back on an identity save", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: "v-live" });

      expect(
        buildIdentitySavePayload(draft, { preservePublishedRevId: true }).ptlPublishedRevId,
      ).toBe("v-live");
    });

    it("echoes it on a full save too", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: "v-live" });

      expect(buildSavePayload(draft, { preservePublishedRevId: true }).ptlPublishedRevId).toBe(
        "v-live",
      );
    });

    it("stays silent when the template publishes nothing — there is nothing to defend", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: null });

      expect(
        "ptlPublishedRevId" in buildSavePayload(draft, { preservePublishedRevId: true }),
      ).toBe(false);
    });

    it("REFUSES to ride along with a publish, which the server rejects as two ways of one move", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: "v-live" });

      const payload = buildSavePayload(draft, {
        preservePublishedRevId: true,
        intent: { kind: "PUBLISH", approvedBy: APPROVER },
      });

      expect("ptlPublishedRevId" in payload).toBe(false);
      expect(payload.versions?.[0].ptvStatus).toBe("PUBLISHED");
    });

    it("is off unless asked for, so the plan's rule holds by default", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: "v-live" });

      expect("ptlPublishedRevId" in buildSavePayload(draft)).toBe(false);
      expect("ptlPublishedRevId" in buildIdentitySavePayload(draft)).toBe(false);
    });

    it("never rides along with buildPublishPayload either", () => {
      const draft = draftWith({ ptlId: "t1", publishedRevId: "v-live" });

      expect("ptlPublishedRevId" in buildPublishPayload(draft, "v2", APPROVER)).toBe(false);
    });
  });

  it("publishes by status and signature on the version instead", () => {
    const payload = buildSavePayload(draftWith({ ptlId: "t1" }), {
      intent: { kind: "PUBLISH", approvedBy: APPROVER },
    });

    expect(payload.versions?.[0].ptvStatus).toBe("PUBLISHED");
    expect(payload.versions?.[0].ptvApprovedBy).toBe(APPROVER);
  });
});

describe("trap 5 — ptvBody is polymorphic on the engine", () => {
  /*
   * The plan says a JSON_BANDS body may be sent as an OBJECT. Against the
   * running API it may not: `enableImplicitConversion` coerces it to
   * "[object Object]" before the DTO's transform runs, and the save 400s with
   * "it did not parse as JSON". Everything on the wire is a string.
   */
  it("JSON-encodes a JSON_BANDS body rather than sending the object", () => {
    const body = bodyForWire("JSON_BANDS", { bands: [{ kind: "HEADER" }] });

    expect(body).toBe('{"bands":[{"kind":"HEADER"}]}');
  });

  it("always produces a string", () => {
    expect(typeof bodyForWire("JSON_BANDS", { a: 1 })).toBe("string");
    expect(typeof bodyForWire("RAW", "text")).toBe("string");
  });

  it("sends a string for every text and markup engine", () => {
    for (const engine of ["HTML_CSS", "QTRPT_XML", "ESCPOS_TEXT", "RAW"] as const) {
      expect(bodyForWire(engine, "<html></html>")).toBe("<html></html>");
    }
  });

  it("switches on the engine, not on what the value looks like", () => {
    // An XML body that happens to start with a brace is still a string...
    expect(bodyForWire("QTRPT_XML", "{not json}")).toBe("{not json}");
    // ...and a JSON_BANDS body held as an unparseable string is passed through
    // rather than double-encoded into a quoted string.
    expect(bodyForWire("JSON_BANDS", "{broken")).toBe("{broken");
  });

  it("stringifies an object that reaches a text engine rather than sending [object Object]", () => {
    expect(bodyForWire("ESCPOS_TEXT", { a: 1 })).toBe('{"a":1}');
  });
});

describe("trap 6 — ptvId is emitted, never silently dropped", () => {
  it("is present when the draft names an existing revision", () => {
    expect(buildVersionPayload({ ...blankVersion(), ptvId: "v1" }).ptvId).toBe("v1");
  });

  it("is absent for a new revision, which is what appends the next number", () => {
    const version = buildVersionPayload(blankVersion());

    expect("ptvId" in version).toBe(false);
    expect(version.ptvStatus).toBe("DRAFT");
  });
});

describe("dataset rows", () => {
  it("sends ptdId for an existing row and omits it for a new one", () => {
    const version = buildVersionPayload({
      ...blankVersion(),
      datasets: [dataset({ ptdId: "d1" }), dataset({ ptdDatasetNo: 2, ptdName: "batches" })],
    });

    expect(version.datasets?.[0].ptdId).toBe("d1");
    expect("ptdId" in (version.datasets?.[1] ?? {})).toBe(false);
  });

  it("nulls the other source when the kind changes, so a stale query cannot survive", () => {
    const version = buildVersionPayload({
      ...blankVersion(),
      datasets: [
        dataset({
          ptdSourceKind: "SQL",
          ptdSql: "SELECT 1 FROM t WHERE c = :company_id",
          ptdProviderCode: "left.over.code",
        }),
      ],
    });

    expect(version.datasets?.[0].ptdSql).toBe("SELECT 1 FROM t WHERE c = :company_id");
    expect(version.datasets?.[0].ptdProviderCode).toBeNull();
  });

  it("never sends ptdSqlNorm, which is GENERATED ALWAYS", () => {
    const version = buildVersionPayload({
      ...blankVersion(),
      datasets: [dataset()],
    });

    expect("ptdSqlNorm" in (version.datasets?.[0] ?? {})).toBe(false);
  });
});

describe("prompts", () => {
  it("normalises `required` to a real boolean and drops a blank label", () => {
    const version = buildVersionPayload({
      ...blankVersion(),
      ptvParams: [
        { name: "from_date", type: "DATE", required: true, label: "From date" },
        { name: "godown_id", type: "UUID", label: null },
      ],
    });

    expect(version.ptvParams).toEqual([
      { name: "from_date", type: "DATE", required: true, label: "From date" },
      { name: "godown_id", type: "UUID", required: false },
    ]);
  });
});
