import { describe, expect, it } from "vitest";
import { hasVisibilityChanges, mergeLoadedVisibility } from "./visibility-memory";

const maps = (entries: Array<[number, boolean]>) => new Map(entries);

describe("screen memory", () => {
  it("keeps the ticks only while one differs from the server", () => {
    expect(hasVisibilityChanges({ visibility: maps([]), original: maps([]) })).toBe(false);
    const original = maps([
      [1, true],
      [2, false],
    ]);
    expect(hasVisibilityChanges({ visibility: new Map(original), original })).toBe(false);
    expect(
      hasVisibilityChanges({
        visibility: maps([
          [1, true],
          [2, true],
        ]),
        original,
      }),
    ).toBe(true);
  });

  it("takes a fresh load as is when nothing was kept", () => {
    const loaded = maps([
      [1, true],
      [2, false],
    ]);
    const merged = mergeLoadedVisibility(loaded, null);
    expect([...merged.visibility]).toEqual([...loaded]);
    expect([...merged.original]).toEqual([...loaded]);
    expect(merged.visibility).not.toBe(loaded);
  });

  it("lays the operator's changed ticks over a fresh load", () => {
    const kept = {
      // 1 hidden and 3 shown by the operator; 2 untouched.
      visibility: maps([
        [1, false],
        [2, true],
        [3, true],
        [4, true],
      ]),
      original: maps([
        [1, true],
        [2, true],
        [3, false],
        [4, false],
      ]),
    };
    const loaded = maps([
      [1, true],
      // Changed by someone else meanwhile: the operator never touched it.
      [2, false],
      // The server now agrees with the operator's tick.
      [3, true],
      // 4 is gone from the tree.
      [5, true],
    ]);
    const merged = mergeLoadedVisibility(loaded, kept);
    expect(Object.fromEntries(merged.visibility)).toEqual({ 1: false, 2: false, 3: true, 5: true });
    expect(Object.fromEntries(merged.original)).toEqual(Object.fromEntries(loaded));
    // Only menu 1 is still a change.
    expect(hasVisibilityChanges(merged)).toBe(true);
    expect(
      hasVisibilityChanges(
        mergeLoadedVisibility(loaded, { visibility: maps([[3, true]]), original: maps([[3, false]]) }),
      ),
    ).toBe(false);
  });
});
