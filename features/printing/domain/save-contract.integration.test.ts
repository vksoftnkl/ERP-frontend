/**
 * The save contract, against a REAL backend.
 *
 * The pure tests beside this one prove that `buildSavePayload` emits the right
 * body. They cannot prove that the right body does the right thing, and five of
 * the six traps are SILENT when they are wrong -- the request succeeds and
 * something else is true afterwards. This is the test that catches that.
 *
 * SKIPPED BY DEFAULT. It needs a running API and a valid bearer token, which no
 * ordinary `npm test` has. To run it:
 *
 *   PRINTING_IT_API=https://localhost:3011/api/v1 \
 *   PRINTING_IT_TOKEN=<access token> \
 *   PRINTING_IT_PURPOSE_ID=<print_purpose.ppo_id> \
 *   PRINTING_IT_USER_ID=<user_master.usr_id> \
 *     npx vitest run features/printing/domain/save-contract.integration.test.ts
 *
 * `PRINTING_IT_USER_ID` must be a REAL user row: ptv_approved_by carries a
 * foreign key to user_master, unlike the varchar actor columns most masters in
 * this codebase use.
 *
 * The sequence is the plan's, in order, and the LAST PAIR is the one worth
 * having: `datasets` omitted versus `datasets: []` is the difference between
 * "leave them alone" and "delete every one", and it is silent when wrong.
 */

import { afterAll, describe, expect, it } from "vitest";

import {
  buildIdentitySavePayload,
  buildPublishPayload,
  buildSavePayload,
  buildVersionPayload,
} from "./buildSavePayload";
import { blankDraft, newDraftFrom, toDesignerDraft, type DesignerDraft } from "./draft";
import type { PrintTemplatePayload, SavePrintTemplate } from "../types/printing";

const API = process.env.PRINTING_IT_API;
const TOKEN = process.env.PRINTING_IT_TOKEN;
const PURPOSE_ID = process.env.PRINTING_IT_PURPOSE_ID;
const USER_ID = process.env.PRINTING_IT_USER_ID;

const configured = Boolean(API && TOKEN && PURPOSE_ID && USER_ID);
const suite = configured ? describe : describe.skip;

// The API is served over a mkcert certificate node does not trust.
if (configured) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as { success: boolean; data: T; errors?: unknown };
  if (!body.success) {
    throw new Error(`${path} -> ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data;
}

const save = (payload: SavePrintTemplate) =>
  call<PrintTemplatePayload>("/print-templates/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const get = (ptlId: string) =>
  call<PrintTemplatePayload>(`/print-templates/get?ptlId=${ptlId}`);

/** A code no other run can collide with, since ux_ptl_code is unique per owner. */
const code = `IT_${Date.now().toString(36).toUpperCase()}`;

function seedDraft(): DesignerDraft {
  const draft = blankDraft(PURPOSE_ID as string);
  return {
    ...draft,
    ptlCode: code,
    ptlName: `Integration ${code}`,
    // Shipped-for-everyone, so the test needs no company in context.
    ptlCompanyId: null,
    working: {
      ...draft.working,
      datasets: [
        {
          ptdRole: "MASTER",
          ptdDatasetNo: 0,
          ptdSortOrder: 0,
          ptdName: "header",
          ptdSourceKind: "PROVIDER",
          ptdProviderCode: "sales.bill.header",
          ptdRequiresCompany: true,
          ptdRowLimit: 5_000,
          ptdTimeoutMs: 15_000,
        },
        {
          ptdRole: "DETAIL",
          ptdDatasetNo: 1,
          ptdSortOrder: 1,
          ptdName: "items",
          ptdSourceKind: "SQL",
          ptdSql:
            "SELECT sbi_item_name AS item_name FROM sales.sale_bill_items WHERE sbi_comp_id = :company_id AND sbi_sb_id = :doc_id",
          ptdRequiresCompany: true,
          ptdRowLimit: 5_000,
          ptdTimeoutMs: 15_000,
        },
      ],
    },
  };
}

suite("the save contract, end to end", () => {
  let ptlId = "";
  let rev1Id = "";
  let rev2Id = "";

  afterAll(async () => {
    if (!ptlId) return;
    // Soft delete, so the run leaves nothing behind that a later run collides
    // with. A failure here is not worth failing the suite over.
    await call(`/print-templates/delete?ptlId=${ptlId}`, { method: "DELETE" }).catch(() => undefined);
  });

  it("creates a template and revision 1 from one call with no ptlId and no ptvId", async () => {
    const created = await save(buildSavePayload(seedDraft()));

    ptlId = created.ptlId;
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0].ptvRevNo).toBe(1);
    expect(created.versions[0].ptvStatus).toBe("DRAFT");
    expect(created.versions[0].datasets).toHaveLength(2);
    // Nothing is published, so the design resolves for nobody.
    expect(created.ptlPublishedRevId).toBeNull();

    rev1Id = created.versions[0].ptvId;
  });

  it("TRAP 4 — an identity-only save changes the name and leaves revision 1 untouched", async () => {
    const before = await get(ptlId);
    const draft = { ...toDesignerDraft(before), ptlName: `Renamed ${code}` };

    const payload = buildIdentitySavePayload(draft, { preservePublishedRevId: true });
    expect("versions" in payload).toBe(false);

    await save(payload);
    const after = await get(ptlId);

    expect(after.ptlName).toBe(`Renamed ${code}`);
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0].ptvId).toBe(rev1Id);
    expect(after.versions[0].ptvModifiedOn).toBe(before.versions[0].ptvModifiedOn);
  });

  it("updates the draft in place when the payload carries its ptvId", async () => {
    const draft = toDesignerDraft(await get(ptlId));
    await save(
      buildSavePayload(
        { ...draft, working: { ...draft.working, ptvNote: "edited" } },
        { preservePublishedRevId: true },
      ),
    );

    const after = await get(ptlId);
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0].ptvId).toBe(rev1Id);
    expect(after.versions[0].ptvNote).toBe("edited");
  });

  it("TRAP 3 — publishing moves the pointer without ptlPublishedRevId ever being sent", async () => {
    const draft = toDesignerDraft(await get(ptlId));

    const payload = buildPublishPayload(draft, rev1Id, USER_ID as string);
    expect("ptlPublishedRevId" in payload).toBe(false);

    await save(payload);
    const after = await get(ptlId);

    expect(after.ptlPublishedRevId).toBe(rev1Id);
    expect(after.ptlPublishedRevNo).toBe(1);

    const published = after.versions.find((version) => version.ptvId === rev1Id);
    expect(published?.ptvStatus).toBe("PUBLISHED");
    // RULE 1: it is frozen now, and the server says so.
    expect(published?.ptvIsEditable).toBe(false);
    expect(published?.ptvApprovedOn).not.toBeNull();
  });

  it("RULE 1 — the server refuses an edit to the published revision", async () => {
    const draft = toDesignerDraft(await get(ptlId));

    await expect(
      save(buildSavePayload({ ...draft, working: { ...draft.working, ptvNote: "should fail" } })),
    ).rejects.toThrow();
  });

  it("RULE 2 — a new draft becomes revision 2 and carries the datasets forward", async () => {
    const draft = toDesignerDraft(await get(ptlId));
    const next = { ...draft, working: newDraftFrom(draft.working) };

    const created = await save(buildSavePayload(next, { preservePublishedRevId: true }));
    const rev2 = created.versions.find((version) => version.ptvRevNo === 2);
    rev2Id = rev2?.ptvId ?? "";

    expect(rev2).toBeDefined();
    expect(rev2?.ptvStatus).toBe("DRAFT");
    // The whole point: a new draft with an empty datasets[] renders nothing.
    expect(rev2?.datasets).toHaveLength(2);
    // The published pointer has NOT moved; rev 1 is still what prints.
    expect(created.ptlPublishedRevId).toBe(rev1Id);
  });

  /*
   * THE PAIR WORTH WRITING FIRST. Both of these are silent when wrong: one
   * deletes work that should have survived, the other keeps rows the author
   * removed. They are one line apart in buildSavePayload.
   */
  it('TRAP 1a — "datasets": [] deletes every dataset on that revision', async () => {
    const draft = toDesignerDraft(await get(ptlId));
    const rev2Draft = draft.history.find((version) => version.ptvId === rev2Id);
    expect(rev2Draft?.datasets).toHaveLength(2);

    const payload: SavePrintTemplate = {
      ...buildIdentitySavePayload(draft, { preservePublishedRevId: true }),
      versions: [
        buildVersionPayload(
          { ...draft.working, ptvId: rev2Id, datasets: [] },
          { includeDatasets: true },
        ),
      ],
    };
    expect(payload.versions?.[0].datasets).toEqual([]);

    await save(payload);
    const after = await get(ptlId);

    expect(after.versions.find((version) => version.ptvId === rev2Id)?.datasets).toHaveLength(0);
    // Revision 1 is intact. The datasets hang off the VERSION, so emptying one
    // revision cannot reach into another -- which is what makes print_log's
    // version reference true.
    expect(after.versions.find((version) => version.ptvId === rev1Id)?.datasets).toHaveLength(2);
  });

  it("TRAP 1b — omitting the key leaves the datasets alone", async () => {
    // Put two rows back on revision 2, then save it again WITHOUT the key.
    const seeded = toDesignerDraft(await get(ptlId));
    const restored = seedDraft().working.datasets;
    await save({
      ...buildIdentitySavePayload(seeded, { preservePublishedRevId: true }),
      versions: [
        buildVersionPayload({ ...seeded.working, ptvId: rev2Id, datasets: restored }),
      ],
    });
    expect(
      (await get(ptlId)).versions.find((version) => version.ptvId === rev2Id)?.datasets,
    ).toHaveLength(2);

    const draft = toDesignerDraft(await get(ptlId));
    const payload: SavePrintTemplate = {
      ...buildIdentitySavePayload(draft, { preservePublishedRevId: true }),
      versions: [
        buildVersionPayload(
          { ...draft.working, ptvId: rev2Id, ptvNote: "untouched datasets" },
          { includeDatasets: false },
        ),
      ],
    };
    expect("datasets" in (payload.versions?.[0] ?? {})).toBe(false);

    await save(payload);
    const after = await get(ptlId);
    const rev2 = after.versions.find((version) => version.ptvId === rev2Id);

    expect(rev2?.ptvNote).toBe("untouched datasets");
    expect(rev2?.datasets).toHaveLength(2);
  });

  it("TRAP 2 — a revision missing from versions[] is left alone, never deleted", async () => {
    const draft = toDesignerDraft(await get(ptlId));

    // Save revision 2 alone. Revision 1 is not in the array at all.
    await save({
      ...buildIdentitySavePayload(draft, { preservePublishedRevId: true }),
      versions: [buildVersionPayload({ ...draft.working, ptvId: rev2Id })],
    });

    const after = await get(ptlId);
    expect(after.versions.filter((version) => !version.ptvIsDeleted)).toHaveLength(2);
    expect(after.ptlPublishedRevId).toBe(rev1Id);
  });
});
