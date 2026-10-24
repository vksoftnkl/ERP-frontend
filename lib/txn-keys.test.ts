import { describe, expect, it } from "vitest";
import { isHelpKey, keySheetRows, txnKeyOf, withKey, type KeyLike } from "./txn-keys";

function key(k: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

describe("txnKeyOf", () => {
  it("reads the Qt chords", () => {
    expect(txnKeyOf(key("s", { ctrlKey: true }))).toBe("saveDraft");
    expect(txnKeyOf(key("Enter", { ctrlKey: true }))).toBe("post");
    expect(txnKeyOf(key("F2"))).toBe("edit");
    expect(txnKeyOf(key("x", { altKey: true }))).toBe("cancelDoc");
    expect(txnKeyOf(key("o", { ctrlKey: true }))).toBe("open");
    expect(txnKeyOf(key("Escape"))).toBe("close");
    expect(txnKeyOf(key("p", { ctrlKey: true }))).toBe("print");
    expect(txnKeyOf(key("f", { ctrlKey: true }))).toBe("find");
    expect(txnKeyOf(key("h", { ctrlKey: true }))).toBe("history");
    expect(txnKeyOf(key("d", { ctrlKey: true }))).toBe("duplicateLine");
    expect(txnKeyOf(key("r", { ctrlKey: true }))).toBe("changeRate");
  });

  it("takes the browser-safe New / Previous / Next, and the Qt ones when they arrive", () => {
    expect(txnKeyOf(key("n", { altKey: true }))).toBe("new");
    expect(txnKeyOf(key("n", { ctrlKey: true }))).toBe("new");
    expect(txnKeyOf(key("PageUp", { altKey: true }))).toBe("previous");
    expect(txnKeyOf(key("PageDown", { altKey: true }))).toBe("next");
    expect(txnKeyOf(key("PageUp", { ctrlKey: true }))).toBe("previous");
  });

  it("is case-blind, reads the physical key, and treats ⌘ as Ctrl", () => {
    expect(txnKeyOf(key("S", { ctrlKey: true }))).toBe("saveDraft");
    expect(txnKeyOf(key("≈", { altKey: true, code: "KeyX" }))).toBe("cancelDoc");
    expect(txnKeyOf(key("s", { metaKey: true }))).toBe("saveDraft");
  });

  it("is nothing with Shift, with AltGr, or unmodified", () => {
    expect(txnKeyOf(key("s", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(txnKeyOf(key("s", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(txnKeyOf(key("s"))).toBeNull();
    expect(txnKeyOf(key("Enter"))).toBeNull();
    expect(txnKeyOf(key("Enter", { shiftKey: true, ctrlKey: true }))).toBeNull();
  });
});

describe("the key sheet", () => {
  it("is bare F1 only", () => {
    expect(isHelpKey(key("F1"))).toBe(true);
    expect(isHelpKey(key("F1", { shiftKey: true }))).toBe(false);
  });

  it("puts captions on buttons and splits document from line keys", () => {
    expect(withKey("Save Draft", "saveDraft")).toBe("Save Draft · Ctrl+S");
    const rows = keySheetRows(
      ["saveDraft", { action: "duplicateLine", label: "Split batch" }, { action: "post", label: "Post it" }],
      [{ label: "Next cell", keyText: "Enter" }],
    );
    expect(rows.document).toEqual([
      { label: "Save Draft", keyText: "Ctrl+S" },
      // A document action keeps the shared caption, whatever its button says.
      { label: "Save & Post", keyText: "Ctrl+Enter" },
    ]);
    expect(rows.lines).toEqual([
      { label: "Split batch", keyText: "Ctrl+D" },
      { label: "Next cell", keyText: "Enter" },
    ]);
  });
});
