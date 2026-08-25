import { describe, expect, it } from "vitest";

import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_REFERENCE_HEIGHT,
  UI_SCALE_REFERENCE_WIDTH,
  computeUiScale,
  normaliseUiScalePreference,
  resolveUiScale,
  uiScaleBootstrapScript,
} from "./ui-scale";

/**
 * Runs the pre-paint bootstrap against a stub window/document and returns the
 * scale it wrote to the root element. This is the guard on the one piece of
 * duplicated logic in the feature: the inline script cannot import
 * `computeUiScale`, so the test proves the copy still agrees with it.
 */
function runBootstrap(
  viewportWidth: number,
  viewportHeight: number,
  storedPreference: string | null = null,
): number | null {
  let written: string | null = null;
  const documentStub = {
    documentElement: {
      style: {
        setProperty(_name: string, value: string) {
          written = value;
        },
      },
    },
  };
  const windowStub = {
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    localStorage: { getItem: () => storedPreference },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("window", "document", uiScaleBootstrapScript())(windowStub, documentStub);
  return written === null ? null : Number.parseFloat(written);
}

const VIEWPORTS: Array<[number, number]> = [
  [1024, 600],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1600, 900],
  [1680, 1050],
  [1920, 1080],
  [2048, 1152],
  [2560, 1080],
  [2560, 1440],
  [3440, 1440],
  [3840, 2160],
  [900, 1600],
];

describe("computeUiScale", () => {
  it("renders the reference viewport untouched", () => {
    expect(computeUiScale(UI_SCALE_REFERENCE_WIDTH, UI_SCALE_REFERENCE_HEIGHT)).toBe(1);
  });

  it("shrinks proportionally below the reference so the layout still fits", () => {
    expect(computeUiScale(1366, 768)).toBe(0.89);
    expect(computeUiScale(1280, 720)).toBe(0.83);
  });

  it("spends only part of a larger screen on size", () => {
    // 1920×1080 is 1.25× the reference; damped growth turns that into 1.15,
    // leaving the rest of the room for more visible rows.
    expect(computeUiScale(1920, 1080)).toBe(1.15);
  });

  it("scales to the tighter axis", () => {
    // Ultrawide but short: the height is what limits an ERP grid.
    expect(computeUiScale(3440, 864)).toBe(1);
    expect(computeUiScale(1536, 720)).toBe(0.83);
  });

  it("stays inside the floor and ceiling", () => {
    expect(computeUiScale(320, 240)).toBe(UI_SCALE_MIN);
    expect(computeUiScale(7680, 4320)).toBe(UI_SCALE_MAX);
  });

  it("falls back to 1 for a viewport it cannot measure", () => {
    expect(computeUiScale(0, 0)).toBe(1);
    expect(computeUiScale(Number.NaN, 900)).toBe(1);
  });

  it("never leaves a fractional percentage that would thrash layout", () => {
    for (const [width, height] of VIEWPORTS) {
      const scale = computeUiScale(width, height);
      expect(scale).toBeCloseTo(Math.round(scale * 100) / 100, 10);
    }
  });
});

describe("preferences", () => {
  it("treats missing or unusable storage as automatic", () => {
    expect(normaliseUiScalePreference(null)).toBe("auto");
    expect(normaliseUiScalePreference("auto")).toBe("auto");
    expect(normaliseUiScalePreference("")).toBe("auto");
    expect(normaliseUiScalePreference("banana")).toBe("auto");
    expect(normaliseUiScalePreference("0")).toBe("auto");
  });

  it("clamps a pinned scale to the supported range", () => {
    expect(normaliseUiScalePreference("1.1")).toBe(1.1);
    expect(normaliseUiScalePreference("9")).toBe(UI_SCALE_MAX);
    expect(normaliseUiScalePreference("0.1")).toBe(UI_SCALE_MIN);
  });

  it("lets a pinned scale win over the screen", () => {
    expect(resolveUiScale(3840, 2160, 0.9)).toBe(0.9);
    expect(resolveUiScale(3840, 2160, "auto")).toBe(UI_SCALE_MAX);
  });
});

describe("pre-paint bootstrap", () => {
  it("agrees with computeUiScale on every viewport", () => {
    for (const [width, height] of VIEWPORTS) {
      expect(runBootstrap(width, height)).toBe(computeUiScale(width, height));
    }
  });

  it("honours a pinned preference", () => {
    expect(runBootstrap(1920, 1080, "0.9")).toBe(0.9);
    expect(runBootstrap(1920, 1080, "auto")).toBe(computeUiScale(1920, 1080));
  });

  it("survives a viewport it cannot measure", () => {
    expect(runBootstrap(0, 0)).toBe(1);
  });
});
