/**
 * Which line documents come back after the operator leaves the screen
 * (`document-memory.ts`), and that a remembered bill drops back into both bill
 * reducers untouched.
 */
import { describe, expect, it } from "vitest";
import {
  canResumeLineDocument,
  documentScopeOf,
  isLineDocumentWorthRemembering,
  sliceResumeSource,
} from "@/features/sales/document-memory";
import { createScreenMemory } from "@/lib/screen-memory";
import {
  billReducer,
  draftReplaced,
  lineFieldSet,
  tenantSet,
} from "@/features/sales/testbill/state/draft";
import {
  copyBillDraftAsNew,
  createBillDraft,
  createBillDraftLine,
  resetBillDraft,
} from "@/features/sales/testbill/state/factories";
import { draftFromAutosave, type BillAutosave } from "@/features/sales/testbill/state/hold";
import type { SaleBillDraft } from "@/features/sales/testbill/types";
import { createBillDraft as createSlipBillDraft } from "@/features/sales/salebill/salebill.state";
import type { SaleBillDraft as SlipBillDraft } from "@/features/sales/salebill/salebill.types";
import {
  saleBillReducer,
  tenantSet as slipTenantSet,
} from "@/store/slices/saleBillSlice";

const CONTEXT = {
  companyId: "11111111-1111-1111-1111-111111111111",
  branchId: "22222222-2222-2222-2222-222222222222",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
  billDatetime: "2026-09-12T09:30:00",
};
const SCOPE = { companyId: CONTEXT.companyId, branchId: CONTEXT.branchId, accYear: CONTEXT.accYear };

function withItem(draft: SaleBillDraft): SaleBillDraft {
  return {
    ...draft,
    lines: [createBillDraftLine({ itemId: "i1", itemName: "TEAK PLANK", billQty: 4, rate: 250 })],
  };
}

function blank(): SaleBillDraft {
  return createBillDraft(CONTEXT);
}

describe("isLineDocumentWorthRemembering", () => {
  const cases: Array<[string, SaleBillDraft, boolean]> = [
    ["a blank bill", blank(), false],
    [
      "a blank bill with only the walk-in customer seeded (a non-edit)",
      { ...blank(), customer: { ...blank().customer, custId: "walk-in", name: "CASH" } },
      false,
    ],
    ["a dirty header", { ...blank(), isDirty: true }, true],
    ["a resumed held cart, not yet touched", { ...withItem(blank()), holdId: "txh-1", holdNo: "H-1" }, true],
    ["an import, not yet touched", withItem(blank()), true],
    ["a stored bill being browsed", { ...withItem(blank()), docId: "sb-1", mode: "browse" }, false],
    ["a saved draft that is no longer dirty", { ...withItem(blank()), docId: "sb-1" }, false],
    ["a stored bill being amended", { ...withItem(blank()), docId: "sb-1", isDirty: true }, true],
    ["copy-as-new", copyBillDraftAsNew({ ...withItem(blank()), docId: "sb-1" }, "2026-09-13"), true],
    [
      "after Clear",
      resetBillDraft({ ...withItem(blank()), isDirty: true }, CONTEXT, { keepCrew: true }),
      false,
    ],
    ["a deleted bill", { ...withItem(blank()), isDirty: true, isDeleted: true }, false],
  ];
  it.each(cases)("%s", (_label, draft, expected) => {
    expect(isLineDocumentWorthRemembering(draft)).toBe(expected);
  });

  it("keeps an accepted crash recovery", () => {
    const record: BillAutosave = {
      ...SCOPE,
      deviceId: "browser-abc",
      savedAt: "2026-09-12T09:31:00",
      itemCount: 1,
      netAmount: 1000,
      partyName: "",
      draft: withItem(blank()),
    };
    expect(isLineDocumentWorthRemembering(draftFromAutosave(record))).toBe(true);
  });
});

describe("canResumeLineDocument", () => {
  it("resumes a dirty document in its own tenant only", () => {
    const draft = { ...withItem(blank()), isDirty: true };
    expect(canResumeLineDocument(draft, SCOPE)).toBe(true);
    expect(canResumeLineDocument(draft, { ...SCOPE, branchId: "other" })).toBe(false);
  });

  it("does not resume a document a late save already cleaned", () => {
    expect(canResumeLineDocument(blank(), SCOPE)).toBe(false);
  });
});

describe("sliceResumeSource", () => {
  const dirty = { ...withItem(blank()), isDirty: true };

  it("resumes nothing when nothing is remembered, however dirty the slice", () => {
    expect(sliceResumeSource(dirty, null, SCOPE)).toBeNull();
  });

  it("prefers the live slice document when it is still worth resuming", () => {
    expect(sliceResumeSource(dirty, dirty, SCOPE)).toBe("live");
  });

  it("falls back to the remembered one when the slice moved to another tenant", () => {
    const elsewhere = { ...dirty, branchId: "other-branch" };
    expect(sliceResumeSource(elsewhere, dirty, SCOPE)).toBe("recalled");
    expect(sliceResumeSource(blank(), dirty, SCOPE)).toBe("recalled");
  });

  it("resumes nothing when the remembered one is not worth it either", () => {
    expect(sliceResumeSource(blank(), blank(), SCOPE)).toBeNull();
  });
});

describe("a remembered bill (testbill, useReducer)", () => {
  const memory = createScreenMemory({ currentUserId: () => "u1" });

  it("comes back as the same draft and keeps working", () => {
    const start = withItem(blank());
    const draft = billReducer(
      start,
      lineFieldSet({ key: start.lines[0].key, field: "billQty", value: 5 }),
    );
    expect(draft.isDirty).toBe(true);
    memory.remember("sales/testbill", documentScopeOf(draft), draft);
    const restored = memory.recall<SaleBillDraft>("sales/testbill", SCOPE);
    expect(restored).toBe(draft);
    if (!restored) return;

    // The tenant seed that follows a mount must not disturb it.
    const seeded = billReducer(restored, tenantSet(SCOPE));
    expect(seeded.isDirty).toBe(true);
    expect(seeded.lines.filter((line) => line.itemId)).toHaveLength(1);

    // Edits still apply.
    const key = seeded.lines[0].key;
    const edited = billReducer(seeded, lineFieldSet({ key, field: "rate", value: 300 }));
    expect(edited.lines[0].rate).toBe(300);
  });

  it("is no longer worth keeping once cleared", () => {
    const draft = { ...withItem(blank()), isDirty: true };
    const cleared = billReducer(
      draft,
      draftReplaced(resetBillDraft(draft, CONTEXT, { keepCrew: true })),
    );
    expect(isLineDocumentWorthRemembering(cleared)).toBe(false);
  });
});

describe("a resumed Sale Bill (Redux slice)", () => {
  it("is not re-stamped by the tenant seed — the slice hands back the same draft", () => {
    const base = createSlipBillDraft(CONTEXT);
    const fresh = saleBillReducer(base, { type: "@@init" });
    const draft: SlipBillDraft = { ...fresh, isDirty: true };
    const seeded = saleBillReducer(draft, slipTenantSet(SCOPE));
    expect(seeded).toBe(draft);
  });
});
