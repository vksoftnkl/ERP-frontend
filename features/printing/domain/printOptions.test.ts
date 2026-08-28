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
  const base = { versionId: "rev-1", docId: "doc-1" };

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

  it("never sends a company — the server takes it from the session", () => {
    expect(buildDocumentPreviewRequest(base)).not.toHaveProperty("companyId");
  });

  it("omits blanks rather than sending them empty", () => {
    const request = buildDocumentPreviewRequest({
      ...base,
      accYear: "  ",
      branchId: "",
      deviceId: null,
    });
    expect(request).not.toHaveProperty("accYear");
    expect(request).not.toHaveProperty("branchId");
    expect(request).not.toHaveProperty("deviceId");
  });

  it("refuses a document that has not been saved", () => {
    expect(() => buildDocumentPreviewRequest({ ...base, docId: " " })).toThrow(
      /no saved document/i,
    );
  });
});
