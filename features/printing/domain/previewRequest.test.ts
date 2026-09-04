import { describe, expect, it } from "vitest";

import { buildPreviewRequest, canPreview } from "./previewRequest";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";

const definition = {
  schemaVersion: 1,
  layoutMode: "GRAPHIC",
  paper: {
    code: "A4",
    widthMm: 210,
    heightMm: 297,
    orientation: "PORTRAIT",
    margins: { top: 8, right: 6, bottom: 8, left: 6 },
  },
  datasets: [{ name: "items", provider: "sales.bill.items", cardinality: "many" }],
  bands: [{ type: "DETAIL", dataset: "items", heightMm: 5, groupLevel: 0, elements: [] }],
} as unknown as TemplateDefinition;

const base = { versionId: "01a0-rev", editable: true, definition };

describe("canPreview", () => {
  it("is false until the revision has been saved", () => {
    // Nothing on the server to point a render at. The Preview button stays
    // visible and says this, rather than vanishing between one save and the next.
    expect(canPreview(undefined)).toBe(false);
    expect(canPreview("01a0-rev")).toBe(true);
  });
});

describe("buildPreviewRequest", () => {
  it("never sends a company", () => {
    // It comes from the authenticated session. A caller-supplied company would
    // make the preview endpoint a cross-tenant read with a friendly name.
    expect(Object.keys(buildPreviewRequest(base))).not.toContain("companyId");
  });

  it("sends the canvas's unsaved bands while the revision is editable", () => {
    const request = buildPreviewRequest(base);
    expect(request.versionId).toBe("01a0-rev");
    expect(request.body).toMatchObject({ bands: definition.bands });
  });

  it("sends NO body for a frozen revision", () => {
    // A published revision cannot be previewed against a different body — it is
    // frozen so print_log can point at it truthfully — so the request asks for
    // the design as stored rather than one the server would refuse.
    const request = buildPreviewRequest({ ...base, editable: false });
    expect(request.body).toBeUndefined();
    expect(request.versionId).toBe("01a0-rev");
  });

  it("omits blanks rather than sending empty strings", () => {
    // `docId: ""` reaches the server as a uuid that fails validation. An absent
    // docId is a render with no document, which a parameterised report is.
    const request = buildPreviewRequest({
      ...base,
      docId: "   ",
      accYear: "",
      outputMode: "  ",
    });

    expect(request).not.toHaveProperty("docId");
    expect(request).not.toHaveProperty("accYear");
    expect(request).not.toHaveProperty("outputMode");
  });

  it("has nowhere to put a branch or a counter — the token carries both", () => {
    const request = buildPreviewRequest({ ...base, docId: "019f-bill" }) as Record<string, unknown>;
    expect(request).not.toHaveProperty("branchId");
    expect(request).not.toHaveProperty("deviceId");
  });

  it("passes the document and its year through, trimmed", () => {
    const request = buildPreviewRequest({
      ...base,
      docId: " 019f-bill ",
      accYear: " 2026-2027 ",
      outputMode: "ESCPOS",
    });

    expect(request).toMatchObject({
      docId: "019f-bill",
      accYear: "2026-2027",
      outputMode: "ESCPOS",
    });
  });

  it("refuses to build a request for an unsaved revision", () => {
    expect(() => buildPreviewRequest({ ...base, versionId: undefined })).toThrow(/not been saved/);
  });

  it("carries the operator's answers to the revision's own prompts", () => {
    const request = buildPreviewRequest({
      ...base,
      params: { from_date: "2026-04-01", note_line: "Goods once sold" },
    });

    expect(request.params).toEqual({
      from_date: "2026-04-01",
      note_line: "Goods once sold",
    });
  });

  it("drops an answer to a server-owned prompt, however the revision declares it", () => {
    // A revision may now put `company_id` in ptv_params — the closed set is
    // gone — but its VALUE is still the session's, and the render endpoint
    // refuses an answer to it. Sending one would fail the preview on a field
    // the operator has no way to correct.
    const request = buildPreviewRequest({
      ...base,
      params: { company_id: "11111111-2222-3333-4444-555555555555", from_date: "2026-04-01" },
    });

    expect(request.params).toEqual({ from_date: "2026-04-01" });
  });

  it("keeps an answer to a declared context name that is not server-owned", () => {
    // :doc_id declared as a prompt is an OVERRIDE — the whole point of being
    // able to type it into the table.
    const request = buildPreviewRequest({
      ...base,
      params: { doc_id: "99999999-8888-7777-6666-555555555555" },
    });

    expect(request.params).toEqual({ doc_id: "99999999-8888-7777-6666-555555555555" });
  });

  it("says nothing about parameters when the revision asks nothing", () => {
    // A revision with no prompts must not send `params: {}` — the key's
    // presence is a statement, and the statement would be about nothing.
    expect(buildPreviewRequest({ ...base, params: {} })).not.toHaveProperty("params");
    expect(buildPreviewRequest(base)).not.toHaveProperty("params");
  });
});
