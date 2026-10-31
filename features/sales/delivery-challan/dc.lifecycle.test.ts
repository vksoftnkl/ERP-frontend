import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/domain/pricing";
import {
  dcRowPolicy,
  gstBadgeText,
  postingStateOf,
  sourceSummary,
  verbsOf,
  type VerbInputs,
} from "./dc.lifecycle";

const ALL_RIGHTS = { post: true, cancel: true, amend: true, override: true };
const posted = (overrides: Record<string, unknown> = {}) => ({
  sdcStatus: "POSTED",
  rights: ALL_RIGHTS,
  locks: { ewbLive: false, irnLive: false, dayClosed: false, editable: { document: false, transportBand: true, purpose: true } },
  posting: { cogsAmt: 120, voucherRefno: "DCh-1", ewb: { status: "NA" } },
  ...overrides,
});
const none = [{ billedQty: 0, returnedQty: 0 }];

describe("posting state (Qt applyPostingState)", () => {
  it("a clean posted challan may be cancelled and amended", () => {
    const s = postingStateOf(posted(), none);
    expect(s).toMatchObject({ canCancel: true, canAmend: true, purposeEditable: true, cogsAmt: 120, bandEditable: true });
  });

  it("names why Cancel is refused, in Qt's order", () => {
    expect(postingStateOf(posted({ rights: { ...ALL_RIGHTS, cancel: false } }), none).cancelBlockedReason).toBe(
      "You don't have permission to cancel challans.",
    );
    expect(postingStateOf(posted(), [{ billedQty: 1, returnedQty: 0 }]).cancelBlockedReason).toBe(
      "A bill has drawn on this challan. Cancel the bill first.",
    );
    expect(postingStateOf(posted(), [{ billedQty: 0, returnedQty: 1 }]).cancelBlockedReason).toBe(
      "Goods have been returned against this challan. Cancel the DC return first.",
    );
    const ewb = posted({ locks: { ewbLive: true, editable: {} } });
    expect(postingStateOf(ewb, none).cancelBlockedReason).toBe(
      "A live e-way bill is on this challan. Cancel it first, or let it expire.",
    );
    expect(postingStateOf(posted({ locks: { dayClosed: true, editable: {} } }), none).cancelBlockedReason).toBe("The day is closed.");
  });

  it("names why Amend is refused", () => {
    expect(postingStateOf(posted({ locks: { ewbLive: true, editable: {} } }), none).amendBlockedReason).toMatch(/live e-way bill/);
    expect(postingStateOf(posted(), [{ billedQty: 2, returnedQty: 0 }]).amendBlockedReason).toMatch(/its lines are history/);
    expect(postingStateOf(posted({ rights: { ...ALL_RIGHTS, amend: false } }), none).amendBlockedReason).toBe(
      "You don't have permission to amend posted challans.",
    );
  });

  it("a draft has nothing to cancel or amend, and its band follows the screen", () => {
    const s = postingStateOf({ sdcStatus: "DRAFT", rights: {}, locks: { editable: { document: true } } }, none);
    expect(s).toMatchObject({ canCancel: false, canAmend: false, cancelBlockedReason: "", bandEditable: true, documentEditable: true });
  });
});

const inputs = (overrides: Partial<VerbInputs> = {}): VerbInputs => ({
  status: "DRAFT",
  isNew: true,
  editable: true,
  amending: false,
  autoPost: false,
  maySaveDraft: () => true,
  canEditRight: true,
  posting: null,
  revisionNo: 0,
  ...overrides,
});

describe("verbs (Qt refreshVerbButtons)", () => {
  it("a new draft: Save draft, Post, Post & Print, Hold, Pick held, Clear; no Delete, no Edit", () => {
    const v = verbsOf(inputs());
    expect(v.save).toMatchObject({ visible: true, enabled: true, label: "Save draft - F5" });
    expect(v.post).toMatchObject({ visible: true, enabled: true });
    expect(v.postPrint).toMatchObject({ visible: true, enabled: true, label: "Post & Print - F6" });
    expect([v.hold, v.pickHeld, v.clear, v.delete, v.edit.visible, v.copyAsNew]).toEqual([true, true, true, false, false, false]);
  });

  it("auto post: F5 is Post and the separate Post button goes", () => {
    const v = verbsOf(inputs({ autoPost: true }));
    expect(v.save.label).toBe("Post - F5");
    expect(v.post.visible).toBe(false);
  });

  it("a user with Post but not Create keeps no drafts", () => {
    const v = verbsOf(inputs({ maySaveDraft: () => false }));
    expect(v.save).toMatchObject({ enabled: false, title: "You may post, not keep drafts — use Post" });
  });

  it("a saved draft read-only: Edit, Delete, Copy; Post needs the right", () => {
    const posting = postingStateOf({ sdcStatus: "DRAFT", rights: { post: false }, locks: { editable: { document: true } } }, none);
    const v = verbsOf(inputs({ isNew: false, editable: false, posting }));
    expect(v.edit).toMatchObject({ visible: true, label: "Edit - F2", enabled: true });
    expect(v.delete).toBe(true);
    expect(v.copyAsNew).toBe(true);
    expect(v.save.visible).toBe(false);
    const keying = verbsOf(inputs({ isNew: false, editable: true, posting }));
    expect(keying.post.enabled).toBe(false);
    expect(keying.hold).toBe(false);
  });

  it("a posted challan: Amend - F2 with the revision, Cancel, Convert; nothing to save", () => {
    const v = verbsOf(inputs({ status: "POSTED", isNew: false, editable: false, posting: postingStateOf(posted(), none), revisionNo: 1 }));
    expect(v.edit).toMatchObject({ visible: true, label: "Amend - F2", enabled: true, title: "Reopen for correction. Posts revision 2." });
    expect(v.cancelDoc).toMatchObject({ visible: true, enabled: true });
    expect(v.convert.enabled).toBe(true);
    expect(v.save.visible).toBe(false);
    expect(v.delete).toBe(false);
    expect([v.returnLink, v.billLink, v.eway.enabled]).toEqual([true, true, true]);
  });

  it("amending: F5 posts the amendment, the list and Cancel go away", () => {
    const v = verbsOf(inputs({ status: "POSTED", isNew: false, editable: true, amending: true, posting: postingStateOf(posted(), none) }));
    expect(v.save).toMatchObject({ visible: true, enabled: true, label: "Post amendment - F5" });
    expect(v.postPrint.label).toBe("Post amendment & Print - F6");
    expect([v.showList, v.cancelDoc.visible, v.edit.visible, v.copyAsNew]).toEqual([false, false, false, false]);
  });

  it("a cancelled challan: no Edit, no save verbs", () => {
    const v = verbsOf(inputs({ status: "CANCELLED", isNew: false, editable: false }));
    expect([v.edit.visible, v.save.visible, v.delete, v.cancelDoc.visible]).toEqual([false, false, false, false]);
  });
});

describe("list row policy (Qt deliveryChallanRowPolicy)", () => {
  it("cancelled: no edit, no delete; posted: no delete; draft: both", () => {
    expect(dcRowPolicy("CANCELLED")).toEqual({ canEdit: false, canDelete: false, reason: "Cancelled — raise a new challan instead." });
    expect(dcRowPolicy("posted")).toMatchObject({ canEdit: true, canDelete: false });
    expect(dcRowPolicy("DRAFT")).toEqual({ canEdit: true, canDelete: true, reason: "" });
  });
});

describe("source chip (Qt updateSourceChip)", () => {
  it("direct lines say so", () => {
    expect(sourceSummary([{ srcDocId: null, billQty: 1 }], null, {})).toEqual({
      chip: "",
      rows: [],
      emptyText: "direct lines — no order behind this challan",
    });
  });

  it("one row per order, with line count and quantity", () => {
    const s = sourceSummary(
      [
        { srcDocId: "so-1", billQty: 2 },
        { srcDocId: "so-1", billQty: 1.5 },
        { srcDocId: "so-2", billQty: 1 },
      ],
      null,
      { "so-1": "SO-7" },
    );
    expect(s.chip).toBe("FROM ORDER SO-7 · (unnumbered)");
    expect(s.rows[0]).toEqual({ refno: "SO-7", detail: "2 lines · 3.500 to deliver" });
  });
});

describe("GST badge line (Qt paintGstBadges)", () => {
  it("only on posted or cancelled; COGS posted or deferred; never an IRN", () => {
    expect(gstBadgeText("DRAFT", null)).toBeNull();
    const s = postingStateOf(posted(), none);
    expect(gstBadgeText("POSTED", s)).toBe(
      `EWB NA  |  COGS ${formatCurrency(120, 2, true)} posted · voucher DCh-1  |  IRN — never on a challan`,
    );
    const periodic = postingStateOf(posted({ posting: { cogsAmt: 0, ewb: { status: "GENERATED", number: "EWB1" } } }), none);
    expect(gstBadgeText("POSTED", periodic)).toBe("EWB GENERATED EWB1  |  COGS deferred (PERIODIC)  |  IRN — never on a challan");
  });
});
