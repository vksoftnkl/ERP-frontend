import { describe, expect, it } from "vitest";
import {
  displayNameOf,
  initialsOf,
  isShortcutSheetKey,
  roleLabelOf,
  validatePasswordChange,
} from "./user-account";

describe("initialsOf", () => {
  it("takes the first and last word's first letters", () => {
    expect(initialsOf("Arun Kumar")).toBe("AK");
    expect(initialsOf("  arun  s  kumar ")).toBe("AK");
  });

  it("takes two letters of a single word", () => {
    expect(initialsOf("ADMIN")).toBe("AD");
    expect(initialsOf("k")).toBe("K");
  });

  it("is blank without a name", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
    expect(initialsOf(null)).toBe("");
  });
});

describe("roleLabelOf", () => {
  it("title-cases the stored role", () => {
    expect(roleLabelOf("SUPER ADMIN")).toBe("Super Admin");
    expect(roleLabelOf("ADMIN")).toBe("Admin");
    expect(roleLabelOf("till_operator")).toBe("Till Operator");
  });

  it("is blank for no role", () => {
    expect(roleLabelOf(null)).toBe("");
    expect(roleLabelOf(" ")).toBe("");
  });
});

describe("displayNameOf", () => {
  it("prefers the display name, then the full name, then the login name", () => {
    expect(displayNameOf({ usrDisplayName: "Arun", usrFullName: "Arun Kumar" }, "ADMIN")).toBe("Arun");
    expect(displayNameOf({ usrDisplayName: " ", usrFullName: "Arun Kumar" }, "ADMIN")).toBe("Arun Kumar");
    expect(displayNameOf({ usrDisplayName: "", usrFullName: null, usrLoginName: "arun" }, "ADMIN")).toBe("arun");
  });

  it("falls back to the session's login name, then a generic word", () => {
    expect(displayNameOf(null, "ADMIN")).toBe("ADMIN");
    expect(displayNameOf(null, null)).toBe("User");
  });
});

describe("isShortcutSheetKey", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });

  it("is the bare question mark", () => {
    expect(isShortcutSheetKey(key("?"))).toBe(true);
  });

  it("is not with Ctrl, Cmd or Alt, nor any other key", () => {
    expect(isShortcutSheetKey(key("?", { ctrlKey: true }))).toBe(false);
    expect(isShortcutSheetKey(key("?", { metaKey: true }))).toBe(false);
    expect(isShortcutSheetKey(key("?", { altKey: true }))).toBe(false);
    expect(isShortcutSheetKey(key("/"))).toBe(false);
    expect(isShortcutSheetKey(key("F1"))).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  it("asks for a password first", () => {
    expect(validatePasswordChange({ password: "", confirm: "" })).toEqual({
      password: "Enter a new password.",
    });
    expect(validatePasswordChange({ password: "   ", confirm: "   " })).toEqual({
      password: "Enter a new password.",
    });
  });

  it("refuses a confirmation that differs", () => {
    expect(validatePasswordChange({ password: "secret1", confirm: "secret2" })).toEqual({
      confirm: "The two passwords do not match.",
    });
  });

  it("compares trimmed text, as the server stores it", () => {
    expect(validatePasswordChange({ password: "secret1 ", confirm: " secret1" })).toEqual({});
  });
});
