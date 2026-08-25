import { describe, expect, it } from "vitest";
import { snapRect, snapResizedRect, snapThresholdMm, type SnapContext } from "@/features/print-designer/lib/snap";

const context = (overrides: Partial<SnapContext> = {}): SnapContext => ({
  gridMm: 1,
  snapEnabled: true,
  zoom: 1,
  bounds: { widthMm: 190, heightMm: 40 },
  neighbours: [],
  ...overrides,
});

describe("snapRect", () => {
  it("does nothing when snapping is off", () => {
    const rect = { x: 10.37, y: 4.21, w: 20, h: 6 };
    expect(snapRect(rect, context({ snapEnabled: false })).rect).toEqual(rect);
  });

  it("snaps to the millimetre grid without drawing a guide", () => {
    const result = snapRect({ x: 10.3, y: 4.2, w: 20, h: 6 }, context());
    expect(result.rect.x).toBe(10);
    expect(result.rect.y).toBe(4);
    // The dotted background already shows the grid; a line per millimetre
    // would be noise.
    expect(result.guides).toHaveLength(0);
  });

  it("prefers a neighbour edge over the grid and reports the guide", () => {
    const result = snapRect(
      { x: 30.4, y: 20, w: 20, h: 6 },
      context({ neighbours: [{ x: 30.6, y: 2, w: 25, h: 6 }] }),
    );
    expect(result.rect.x).toBeCloseTo(30.6, 5);
    expect(result.guides).toContainEqual({
      orientation: "vertical",
      positionMm: 30.6,
      source: "element",
    });
  });

  it("snaps a centre to a neighbour's centre", () => {
    const result = snapRect(
      { x: 40, y: 0, w: 20, h: 6 },
      // Neighbour centre at 50.4; the moving centre is 50.
      context({ neighbours: [{ x: 40.4, y: 10, w: 20, h: 6 }], gridMm: 0 }),
    );
    expect(result.rect.x).toBeCloseTo(40.4, 5);
  });

  it("snaps to the band's own edges", () => {
    const result = snapRect({ x: 0.4, y: 0.3, w: 20, h: 6 }, context({ gridMm: 0 }));
    expect(result.rect.x).toBe(0);
    expect(result.guides.some((guide) => guide.source === "band")).toBe(true);
  });

  it("tightens the threshold as the user zooms in", () => {
    expect(snapThresholdMm(1)).toBeCloseTo(1.5, 5);
    expect(snapThresholdMm(2)).toBeCloseTo(0.75, 5);
    // A far-away neighbour that snapped at 100% must not snap at 200%.
    const far = { x: 31.2, y: 20, w: 20, h: 6 };
    const neighbours = [{ x: 30, y: 2, w: 25, h: 6 }];
    expect(snapRect(far, context({ neighbours, gridMm: 0, zoom: 1 })).rect.x).toBe(30);
    expect(snapRect(far, context({ neighbours, gridMm: 0, zoom: 4 })).rect.x).toBe(31.2);
  });
});

describe("snapResizedRect", () => {
  it("snaps only the edge the handle moved", () => {
    const result = snapResizedRect(
      { x: 10.4, y: 5, w: 49.2, h: 6 },
      "e",
      context({ neighbours: [{ x: 60, y: 0, w: 10, h: 6 }], gridMm: 0 }),
    );
    // The right edge lands on the neighbour's left edge; x is untouched.
    expect(result.rect.x).toBe(10.4);
    expect(result.rect.x + result.rect.w).toBeCloseTo(60, 5);
  });

  it("moves the origin when a west handle snaps", () => {
    const result = snapResizedRect(
      { x: 30.4, y: 5, w: 20, h: 6 },
      "w",
      context({ neighbours: [{ x: 30, y: 0, w: 10, h: 6 }], gridMm: 0 }),
    );
    expect(result.rect.x).toBe(30);
    expect(result.rect.w).toBeCloseTo(20.4, 5);
  });
});
