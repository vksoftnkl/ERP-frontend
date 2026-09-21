import { describe, expect, it } from "vitest";

import {
  buildDocumentPreviewRequest,
  firstAssignment,
  printableAssignments,
  revisionForPreview,
  templateFormatOptions,
} from "./printOptions";
import type {
  PrintTemplateAssignmentPayload,
  PrintTemplatePayload,
} from "@/features/printing/types/printing";

const assignment = (
  over: Partial<PrintTemplateAssignmentPayload> & { ptaId: string },
): PrintTemplateAssignmentPayload =>
  ({
    ptaPurposeId: "purpose-quote",
    ptaTemplateId: `tpl-${over.ptaId}`,
    ptaTemplateCompanyKey: "00000000-0000-0000-0000-000000000000",
    ptaTemplateIsShipped: true,
    ptaOutputMode: "PRINT",
    ptaScope: "COMPANY",
    ptaIsActive: true,
    ptaIsDeleted: false,
    ...over,
  }) as PrintTemplateAssignmentPayload;

const designs = (
  over: Partial<PrintTemplatePayload>[],
): PrintTemplatePayload[] =>
  over.map(
    (one) =>
      ({ ptlId: "t", ptlIsActive: true, ...one }) as PrintTemplatePayload,
  );

describe("templateFormatOptions", () => {
  it("reads code then name — the legacy '43 - SS-Sales Order' shape", () => {
    const [option] = templateFormatOptions(
      designs([{ ptlId: "t1", ptlCode: "QUOTE_A4", ptlName: "QUOTATION_A4" }]),
    );
    expect(option).toEqual({ ptlId: "t1", label: "QUOTE_A4 — QUOTATION_A4" });
  });

  it("falls back to the id when the row carries neither", () => {
    // A blank line in a chooser is worse than an id nobody recognises.
    const [option] = templateFormatOptions(
      designs([{ ptlId: "t2", ptlCode: undefined }]),
    );
    expect(option.label).toBe("t2");
  });

  it("drops a withdrawn design", () => {
    // `ptlIsActive` false is kept in the table so history and print_log still
    // resolve — which is exactly why it must not be offered to print now.
    const options = templateFormatOptions(
      designs([
        { ptlId: "live", ptlCode: "A" },
        { ptlId: "gone", ptlCode: "B", ptlIsActive: false },
      ]),
    );
    expect(options.map((option) => option.ptlId)).toEqual(["live"]);
  });

  it("sorts by what the operator reads, not by fetch order", () => {
    const options = templateFormatOptions(
      designs([
        { ptlId: "b", ptlCode: "ZZ" },
        { ptlId: "a", ptlCode: "AA" },
      ]),
    );
    expect(options.map((option) => option.ptlId)).toEqual(["a", "b"]);
  });

  it("is empty rather than throwing before the list has loaded", () => {
    expect(templateFormatOptions(undefined)).toEqual([]);
  });
});

describe("printableAssignments", () => {
  const rows = [
    assignment({ ptaId: "company", ptaScope: "COMPANY" }),
    assignment({ ptaId: "counter", ptaScope: "COUNTER" }),
    assignment({ ptaId: "global", ptaScope: "GLOBAL" }),
    assignment({ ptaId: "branch", ptaScope: "BRANCH" }),
  ];

  it("orders narrowest rung first, so 'the first one' is predictable", () => {
    expect(
      printableAssignments(rows, "purpose-quote").map((row) => row.ptaId),
    ).toEqual(["counter", "branch", "company", "global"]);
  });

  it("tie-breaks one rung by output mode rather than by fetch order", () => {
    const pair = [
      assignment({
        ptaId: "print",
        ptaScope: "COUNTER",
        ptaOutputMode: "PRINT",
      }),
      assignment({ ptaId: "pdf", ptaScope: "COUNTER", ptaOutputMode: "PDF" }),
    ];
    expect(
      printableAssignments(pair, "purpose-quote").map((r) => r.ptaId),
    ).toEqual(["pdf", "print"]);
  });

  it("drops other purposes, and rows that are not choices any more", () => {
    const mixed = [
      assignment({ ptaId: "other", ptaPurposeId: "purpose-invoice" }),
      assignment({ ptaId: "inactive", ptaIsActive: false }),
      assignment({ ptaId: "deleted", ptaIsDeleted: true }),
      assignment({ ptaId: "live" }),
    ];
    expect(
      printableAssignments(mixed, "purpose-quote").map((r) => r.ptaId),
    ).toEqual(["live"]);
  });

  it("is empty rather than throwing when nothing has loaded", () => {
    expect(printableAssignments(undefined, "purpose-quote")).toEqual([]);
  });
});

describe("firstAssignment", () => {
  it("is what Pdf takes: the narrowest configured design", () => {
    const rows = [
      assignment({ ptaId: "company", ptaScope: "COMPANY" }),
      assignment({ ptaId: "counter", ptaScope: "COUNTER" }),
    ];
    expect(firstAssignment(rows, "purpose-quote")?.ptaId).toBe("counter");
  });

  it("is null when nothing is configured, so Pdf can say so", () => {
    expect(firstAssignment([], "purpose-quote")).toBeNull();
  });
});

const version = (ptvId: string, revNo: number, deleted = false) =>
  ({
    ptvId,
    ptvRevNo: revNo,
    ptvIsDeleted: deleted,
  }) as PrintTemplatePayload["versions"][number];

const template = (over: Partial<PrintTemplatePayload>): PrintTemplatePayload =>
  ({ ptlId: "tpl-1", versions: [], ...over }) as PrintTemplatePayload;

describe("revisionForPreview", () => {
  it("takes the revision the caller named", () => {
    const payload = template({
      versions: [version("rev-1", 1), version("rev-2", 2)],
      ptlPublishedRevId: "rev-1",
    });
    expect(revisionForPreview(payload, "rev-2")).toBe("rev-2");
  });

  it("prefers the PUBLISHED revision over a newer draft", () => {
    // A preview is meant to show what would actually print, and the newest
    // revision of a design under active editing is a draft nobody approved.
    const payload = template({
      versions: [version("rev-1", 1), version("rev-2", 2)],
      ptlPublishedRevId: "rev-1",
    });
    expect(revisionForPreview(payload)).toBe("rev-1");
  });

  it("falls back to the newest when nothing is published", () => {
    // The only way a design still being drawn can be looked at against real
    // data — `ptlPublishedRevId` is null until somebody publishes.
    const payload = template({
      versions: [version("rev-1", 1), version("rev-2", 2)],
    });
    expect(revisionForPreview(payload)).toBe("rev-2");
  });

  it("never chooses a deleted revision", () => {
    const payload = template({
      versions: [version("rev-1", 1), version("rev-2", 2, true)],
    });
    expect(revisionForPreview(payload)).toBe("rev-1");
  });

  it("is null when there is nothing to render", () => {
    expect(revisionForPreview(undefined)).toBeNull();
    expect(revisionForPreview(template({ versions: [] }))).toBeNull();
  });
});

describe("buildDocumentPreviewRequest", () => {
  const base = { versionId: "rev-1", docIds: ["doc-1"] };

  it("names the revision and the document", () => {
    expect(buildDocumentPreviewRequest(base)).toEqual({
      versionId: "rev-1",
      docId: "doc-1",
    });
  });

  it("never sends a body — there is no canvas in the room", () => {
    // The designer's Preview may send unsaved bands. This one is a reading of a
    // document through a design already configured; a body would be invented.
    expect(
      buildDocumentPreviewRequest({ ...base, accYear: "2026-2027" }),
    ).not.toHaveProperty("body");
  });

  it("sends the document's own company — the token's is the user's home, not the working one", () => {
    // Every dataset filters on :company_id. The header picker can be on a
    // company the token does not name, and a bill raised there rendered as
    // blank paper while the render bound the token's.
    expect(
      buildDocumentPreviewRequest({ ...base, companyId: "comp-acme" }),
    ).toMatchObject({ companyId: "comp-acme" });
  });

  it("omits a blank company rather than sending it empty", () => {
    expect(
      buildDocumentPreviewRequest({ ...base, companyId: "  " }),
    ).not.toHaveProperty("companyId");
    expect(
      buildDocumentPreviewRequest({ ...base, companyId: null }),
    ).not.toHaveProperty("companyId");
  });

  it("never sends a branch or a counter — the token carries both", () => {
    const request = buildDocumentPreviewRequest({
      ...base,
      companyId: "comp-acme",
      accYear: "2026-2027",
    }) as Record<string, unknown>;
    expect(request).not.toHaveProperty("branchId");
    expect(request).not.toHaveProperty("deviceId");
  });

  it("omits a blank year rather than sending it empty", () => {
    // Absent means "the year this session is working in", which the server binds
    // from the company's own fy_is_current.
    expect(buildDocumentPreviewRequest({ ...base, accYear: "  " })).not.toHaveProperty("accYear");
  });

  it("refuses a document that has not been saved", () => {
    expect(() => buildDocumentPreviewRequest({ ...base, docIds: [" "] })).toThrow(
      /no saved document/i,
    );
    expect(() => buildDocumentPreviewRequest({ ...base, docIds: [] })).toThrow(
      /no saved document/i,
    );
  });

  // -- A BATCH ------------------------------------------------------------
  // Several ticked rows, one file. The server refuses docId and docIds
  // together, so exactly one of the two may ever appear.

  it("sends docIds when several documents are named", () => {
    expect(
      buildDocumentPreviewRequest({
        versionId: "rev-1",
        docIds: ["doc-1", "doc-2", "doc-3"],
      }),
    ).toEqual({ versionId: "rev-1", docIds: ["doc-1", "doc-2", "doc-3"] });
  });

  it("keeps the single-document wire exactly as it was", () => {
    // One ticked row must not start sending a one-element batch: the ordinary
    // print is the overwhelmingly common case and its request should not change
    // shape because a list screen learned to tick two.
    const request = buildDocumentPreviewRequest({
      versionId: "rev-1",
      docIds: ["doc-1"],
    }) as Record<string, unknown>;
    expect(request).toHaveProperty("docId", "doc-1");
    expect(request).not.toHaveProperty("docIds");
  });

  it("never sends both docId and docIds", () => {
    const request = buildDocumentPreviewRequest({
      versionId: "rev-1",
      docIds: ["doc-1", "doc-2"],
    }) as Record<string, unknown>;
    expect(request).not.toHaveProperty("docId");
  });

  it("drops a blank id rather than failing the whole batch", () => {
    // One row whose id never loaded would otherwise reach the server as an
    // empty string and fail UUID validation for every document with it.
    expect(
      buildDocumentPreviewRequest({
        versionId: "rev-1",
        docIds: ["doc-1", "  ", "doc-2"],
      }),
    ).toEqual({ versionId: "rev-1", docIds: ["doc-1", "doc-2"] });
  });

  it("collapses to docId when only one id survives trimming", () => {
    expect(
      buildDocumentPreviewRequest({ versionId: "rev-1", docIds: ["doc-1", ""] }),
    ).toEqual({ versionId: "rev-1", docId: "doc-1" });
  });

  it("keeps the order the rows were listed in", () => {
    // The pages come out in the order they are sent, and the operator expects
    // the paper to match what they were looking at.
    expect(
      buildDocumentPreviewRequest({
        versionId: "rev-1",
        docIds: ["doc-c", "doc-a", "doc-b"],
      }),
    ).toMatchObject({ docIds: ["doc-c", "doc-a", "doc-b"] });
  });

  it("names the file when asked, and omits a blank name", () => {
    expect(
      buildDocumentPreviewRequest({ ...base, filename: "bills-3" }),
    ).toMatchObject({ filename: "bills-3" });
    expect(
      buildDocumentPreviewRequest({ ...base, filename: "  " }),
    ).not.toHaveProperty("filename");
  });
});
