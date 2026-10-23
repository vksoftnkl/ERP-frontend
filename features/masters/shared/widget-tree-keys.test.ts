import { describe, expect, it } from "vitest";
import { treeExpandKeyAction } from "./widget-tree-keys";

const key = (k: string, mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe("treeExpandKeyAction", () => {
  it("Ctrl++ and Ctrl+= expand every section", () => {
    expect(treeExpandKeyAction(key("+", { ctrlKey: true }))).toBe("expand");
    expect(treeExpandKeyAction(key("=", { ctrlKey: true }))).toBe("expand");
    expect(treeExpandKeyAction(key("+", { metaKey: true }))).toBe("expand");
  });

  it("Ctrl+- collapses them", () => {
    expect(treeExpandKeyAction(key("-", { ctrlKey: true }))).toBe("collapse");
  });

  it("leaves the plain keys, Alt chords and other letters alone", () => {
    expect(treeExpandKeyAction(key("+"))).toBeNull();
    expect(treeExpandKeyAction(key("-"))).toBeNull();
    expect(treeExpandKeyAction(key("+", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(treeExpandKeyAction(key("s", { ctrlKey: true }))).toBeNull();
  });
});
