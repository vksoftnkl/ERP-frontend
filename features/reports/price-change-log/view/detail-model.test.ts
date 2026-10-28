import { describe, expect, it } from "vitest";
import { detailOf, priceA, priceB, slabUpd } from "../testing/fixtures";
import { detailMetaParts, detailTitle, fieldLines, sameSaveText } from "./detail-model";

describe("the detail dialog", () => {
  it("titles the change", () => {
    expect(detailTitle(priceB)).toBe("Price change · ZT-ITEM-A · PCS · Acme Foods - Coimbatore Branch");
    expect(detailTitle(slabUpd)).toBe("Qty slab change · ZT-ITEM-A · PCS · Coimbatore");
    expect(detailTitle({ ...priceA })).toBe("Price change · Samsung H1 · PCS · All branches");
  });

  it("says who, which device, which screen", () => {
    const parts = detailMetaParts(detailOf(priceA));
    expect(parts[0]).toMatch(/^Fri 23\/10\/2026 \d{2}:\d{2}:07 (AM|PM)$/);
    expect(parts.slice(1)).toEqual(["VKPOS", "dbg (192.168.0.103)", "Desktop", "Change selling (menu 30)", "Changed", "MRP 150"]);
    expect(detailMetaParts(detailOf(priceB)).slice(1, 3)).toEqual(["VKPOS", "(no device) 192.168.0.103"]);
  });

  it("lists the changed fields, then the unchanged ones on request", () => {
    const detail = detailOf(priceB, {
      fields: [
        { column: "ipm_sales_price_b", label: "Price B", before: 118, after: 119 },
        { column: "ipm_price_b_wot", label: "Price B (w/o tax)", before: 100, after: 100.85 },
      ],
      before: { ipm_sales_price_a: 118, ipm_sales_price_b: 118, ipm_max_price: 153.4, ipm_id: "x", ipm_is_active: true },
      after: { ipm_sales_price_a: 118, ipm_sales_price_b: 119, ipm_max_price: 153.4, ipm_id: "x", ipm_is_active: true },
    });
    const changed = fieldLines(detail, false);
    expect(changed.map((l) => [l.label, l.before, l.after, l.change, l.direction])).toEqual([
      ["Price B", "118", "119", "+1  ▲0.8%", 1],
      ["Price B (w/o tax)", "100", "100.85", "+0.85  ▲0.8%", 1],
    ]);
    const all = fieldLines(detail, true);
    expect(all.filter((l) => !l.changed).map((l) => [l.label, l.before, l.after])).toEqual([
      ["Price A", "118", "118"],
      ["MRP", "153.40", "153.40"],
      ["Active", "Yes", "Yes"],
    ]);
  });

  it("rebuilds the changed fields from changed[] when fields[] is absent", () => {
    const lines = fieldLines(
      detailOf(slabUpd, { before: { iqp_price: 111 }, after: { iqp_price: 109 } }),
      false,
    );
    expect(lines.map((l) => [l.label, l.change, l.direction])).toEqual([["Slab price", "−2  ▼1.8%", -1]]);
  });

  it("counts the same save", () => {
    expect(sameSaveText(-1)).toBe("");
    expect(sameSaveText(0)).toBe("");
    expect(sameSaveText(1)).toBe("Same save: 1 other row");
    expect(sameSaveText(3)).toBe("Same save: 3 other rows");
  });
});
