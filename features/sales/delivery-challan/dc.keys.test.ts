import { describe, expect, it } from "vitest";
import { dcScreenKeyOf } from "./dc.keys";

const press = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; code?: string } = {}) => ({
  key,
  code: mods.code,
  ctrlKey: Boolean(mods.ctrl),
  altKey: Boolean(mods.alt),
  shiftKey: Boolean(mods.shift),
  metaKey: false,
});

describe("the challan's own keys (Qt QShortcuts)", () => {
  it("names the bare F-keys", () => {
    expect(
      ["F3", "F5", "F6", "F7", "F8", "F9", "F10"].map((key) => dcScreenKeyOf(press(key))),
    ).toEqual(["deleteDraft", "primary", "primaryPrint", "clear", "showList", "hold", "pickHeld"]);
  });

  it("names the chords", () => {
    expect(dcScreenKeyOf(press("F7", { ctrl: true }))).toBe("validate");
    expect(dcScreenKeyOf(press("F4", { ctrl: true }))).toBe("importOrder");
    expect(dcScreenKeyOf(press("d", { alt: true }))).toBe("discountAll");
    expect(dcScreenKeyOf(press("o", { alt: true }))).toBe("showCost");
    expect(dcScreenKeyOf(press("y", { alt: true }))).toBe("copyAsNew");
  });

  it("imports order lines on Alt+I as well — Chrome keeps Ctrl+F4 for closing the tab", () => {
    expect(dcScreenKeyOf(press("i", { alt: true }))).toBe("importOrder");
    // A layout where Alt+letter composes a character still reports the key's code.
    expect(dcScreenKeyOf(press("ˆ", { alt: true, code: "KeyI" }))).toBe("importOrder");
  });

  it("takes every reload chord from the browser, acting on none", () => {
    expect(dcScreenKeyOf(press("F5", { ctrl: true }))).toBe("swallow");
    expect(dcScreenKeyOf(press("F5", { shift: true }))).toBe("swallow");
  });

  it("leaves the shared TxnKeys and typing alone", () => {
    for (const event of [press("F2"), press("Escape"), press("F1"), press("s", { ctrl: true }), press("i"), press("F4"), press("F3", { shift: true })]) {
      expect(dcScreenKeyOf(event)).toBeNull();
    }
  });
});
