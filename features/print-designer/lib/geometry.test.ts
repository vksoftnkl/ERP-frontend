import { describe, expect, it } from "vitest";
import type {
  LineElement,
  QrcodeElement,
  TextElement,
} from "@/features/print-designer/types/template-definition";
import {
  MIN_ELEMENT_MM,
  clampRectToBand,
  elementRect,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  unionRect,
  withRect,
} from "@/features/print-designer/lib/geometry";

const text = (overrides: Partial<TextElement> = {}): TextElement => ({
  kind: "TEXT",
  id: "t1",
  x: 10,
  y: 5,
  w: 40,
  h: 6,
  z: 0,
  value: "Hello",
  align: "left",
  vAlign: "top",
  wrap: false,
  ellipsis: false,
  blankWhenZero: false,
  ...overrides,
});

const line = (overrides: Partial<LineElement> = {}): LineElement => ({
  kind: "LINE",
  id: "l1",
  x: 0,
  y: 0,
  z: 0,
  x1: 10,
  y1: 4,
  x2: 60,
  y2: 4,
  widthPt: 0.5,
  gridChar: "-",
  ...overrides,
});

describe("elementRect", () => {
  it("normalises a text box", () => {
    expect(elementRect(text())).toEqual({ x: 10, y: 5, w: 40, h: 6 });
  });

  it("normalises a line from its endpoints, in either direction", () => {
    expect(elementRect(line())).toEqual({ x: 10, y: 4, w: 50, h: 0 });
    expect(elementRect(line({ x1: 60, x2: 10 }))).toEqual({ x: 10, y: 4, w: 50, h: 0 });
  });

  it("uses size for a QR code", () => {
    const qr: QrcodeElement = {
      kind: "QRCODE",
      id: "q1",
      x: 3,
      y: 4,
      z: 0,
      size: 25,
      value: "{{ row.qr }}",
      errorCorrection: "M",
    };
    expect(elementRect(qr)).toEqual({ x: 3, y: 4, w: 25, h: 25 });
  });
});

describe("withRect", () => {
  it("keeps a line's direction when it is written back", () => {
    const reversed = line({ x1: 60, x2: 10 });
    const moved = withRect(reversed, { x: 20, y: 4, w: 50, h: 0 });
    // Still right-to-left: a drag must not silently flip the line.
    expect(moved.x1).toBe(70);
    expect(moved.x2).toBe(20);
  });

  it("keeps a QR code square, taking the smaller axis", () => {
    const qr = withRect(
      {
        kind: "QRCODE",
        id: "q1",
        x: 0,
        y: 0,
        z: 0,
        size: 25,
        value: "x",
        errorCorrection: "M",
      },
      { x: 0, y: 0, w: 40, h: 18 },
    );
    expect(qr.size).toBe(18);
  });
});

describe("resizeRect", () => {
  const base = { x: 10, y: 10, w: 40, h: 20 };

  it("moves only the edges the handle owns", () => {
    expect(resizeRect(base, "e", 5, 99)).toEqual({ x: 10, y: 10, w: 45, h: 20 });
    expect(resizeRect(base, "s", 99, 5)).toEqual({ x: 10, y: 10, w: 40, h: 25 });
  });

  it("moves the origin when a west or north handle is dragged", () => {
    expect(resizeRect(base, "nw", 4, 4)).toEqual({ x: 14, y: 14, w: 36, h: 16 });
  });

  it("holds the anchor edge still rather than inverting the box", () => {
    const collapsed = resizeRect(base, "w", 1000, 0);
    expect(collapsed.w).toBe(MIN_ELEMENT_MM);
    expect(collapsed.x).toBe(base.x + base.w - MIN_ELEMENT_MM);
  });
});

describe("clampRectToBand", () => {
  const bounds = { widthMm: 190, heightMm: 40 };

  it("holds an element inside the printable width", () => {
    expect(clampRectToBand({ x: 180, y: 0, w: 40, h: 5 }, bounds)).toMatchObject({ x: 150, w: 40 });
    expect(clampRectToBand({ x: -10, y: 0, w: 40, h: 5 }, bounds)).toMatchObject({ x: 0 });
  });

  it("does not clamp vertically, because an autoGrow band reflows", () => {
    expect(clampRectToBand({ x: 0, y: 90, w: 10, h: 5 }, bounds).y).toBe(90);
  });
});

describe("rect helpers", () => {
  it("builds a rect from two corners in any order", () => {
    expect(rectFromPoints(30, 20, 10, 5)).toEqual({ x: 10, y: 5, w: 20, h: 15 });
  });

  it("detects intersection for marquee selection", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it("unions a multi-selection into one box", () => {
    expect(
      unionRect([
        { x: 10, y: 10, w: 10, h: 5 },
        { x: 30, y: 4, w: 10, h: 5 },
      ]),
    ).toEqual({ x: 10, y: 4, w: 30, h: 11 });
    expect(unionRect([])).toBeNull();
  });
});
