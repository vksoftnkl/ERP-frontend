import { describe, expect, it } from "vitest";
import { buildPayload, buildPostBody } from "./branch-inward.payload";
import { addDamagedLine, editLine, setUnloading } from "./branch-inward.state";
import { opened } from "./branch-inward.test-fixtures";

describe("buildPayload", () => {
  it("links the despatch, copies both godowns, and sends no total", () => {
    const { dto } = buildPayload(opened());
    expect(dto.header).toMatchObject({
      accYear: "2026-2027",
      companyId: "co-1",
      branchId: "br-2",
      deviceId: "dev-1",
      fromGodownId: "gd-from",
      toGodownId: "gd-to",
      linkSrcDocId: "out-1",
      linkSrcAccYear: "2026-2027",
      unloadEnabled: false,
    });
    expect(JSON.stringify(dto)).not.toMatch(/total|unloadingCharge|unloadCharge/i);
    expect(dto.header).not.toHaveProperty("svhId");
    expect(dto.header).not.toHaveProperty("unloadmanIds");
  });

  it("a line is the transit row: destination godown, lot, base unit, factor 1", () => {
    const { dto } = buildPayload(opened());
    expect(dto.lines[0]).toEqual({
      lineNo: 1,
      itemId: "item-1",
      uomId: "uom-pcs",
      baseUomId: "uom-pcs",
      toBaseFactor: 1,
      godownId: "gd-to",
      lotId: "lot-1",
      bucket: "SALEABLE",
      qty: 6,
      baseQty: 6,
      unloadRate: 0,
    });
  });

  it("what never arrived gets no line, and the sent keys follow the payload order", () => {
    let draft = opened();
    draft = addDamagedLine(draft, draft.lines[0].key).draft;
    draft = editLine(draft, draft.lines[0].key, { qty: "5" });
    draft = editLine(draft, draft.lines[1].key, { qty: "1" });
    draft = editLine(draft, draft.lines[2].key, { qty: "0" });
    const { dto, sentKeys } = buildPayload(draft);
    expect(dto.lines.map((l) => [l.lineNo, l.itemId, l.bucket, l.qty])).toEqual([
      [1, "item-1", "SALEABLE", 5],
      [2, "item-1", "DAMAGED", 1],
    ]);
    expect(sentKeys).toEqual([draft.lines[0].key, draft.lines[1].key]);
  });

  it("Unloading ticked sends the crew and the rate; un-ticked sends rate 0 even if one was keyed", () => {
    let draft = opened();
    draft = editLine(draft, draft.lines[0].key, { unloadRate: "0.5" });
    expect(buildPayload(draft).dto.lines[0].unloadRate).toBe(0);
    draft = setUnloading(draft, {
      unloadEnabled: true,
      unloadAt: "2026-10-26T09:30",
      unloadmen: [{ id: "e1", text: "Ravi" }],
      unloadSupervisor: { id: "s1", text: "Meena" },
    });
    const { dto } = buildPayload(draft);
    expect(dto.lines[0].unloadRate).toBe(0.5);
    expect(dto.header).toMatchObject({ unloadEnabled: true, unloadmanIds: ["e1"], unloadSupervisorId: "s1" });
    expect(typeof dto.header.unloadDatetime).toBe("string");
  });

  it("a saved draft sends its svhId; remarks are trimmed and omitted when blank", () => {
    let draft = { ...opened(), svhId: "in-1", remarks: "  one torn  " };
    expect(buildPayload(draft).dto.header).toMatchObject({ svhId: "in-1", remarks: "one torn" });
    draft = { ...draft, remarks: "   " };
    expect(buildPayload(draft).dto.header).not.toHaveProperty("remarks");
  });
});

describe("buildPostBody", () => {
  it("is the receipt's own identity, not the despatch's", () => {
    expect(buildPostBody({ ...opened(), svhId: "in-1" })).toEqual({
      svhId: "in-1",
      accYear: "2026-2027",
      companyId: "co-1",
      branchId: "br-2",
    });
  });
});
