import { describe, expect, it } from "vitest";
import { ISSUED_VOCABULARY, RECEIVED_VOCABULARY } from "./domain/vocabulary";
import { KEY_TABLE, bindingFor, buttonText, isReservedKey } from "./keys";

type KeyEvent = Parameters<typeof bindingFor>[0];

function press(key: string, modifiers: Partial<Omit<KeyEvent, "key">> = {}): KeyEvent {
  return { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers };
}

function bindingOf(verb: string) {
  const binding = KEY_TABLE.find((candidate) => candidate.verb === verb);
  if (!binding) {
    throw new Error(`no binding for ${verb}`);
  }
  return binding;
}

describe("KEY_TABLE", () => {
  it("lists every verb once", () => {
    const verbs = KEY_TABLE.map((binding) => binding.verb);
    expect(new Set(verbs).size).toBe(verbs.length);
  });

  it("gives no two bindings the same key", () => {
    const keys = KEY_TABLE.map((binding) => binding.keyLabel).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("bindingFor", () => {
  it("maps each function key to its verb", () => {
    expect(bindingFor(press("F5"))?.verb).toBe("deposit");
    expect(bindingFor(press("F7"))?.verb).toBe("clear");
    expect(bindingFor(press("F8"))?.verb).toBe("bounce");
    expect(bindingFor(press("F3"))?.verb).toBe("return");
    expect(bindingFor(press("F6"))?.verb).toBe("printSlip");
  });

  it("maps Ctrl+H to history, either case", () => {
    expect(bindingFor(press("h", { ctrlKey: true }))?.verb).toBe("history");
    expect(bindingFor(press("H", { ctrlKey: true, shiftKey: true }))?.verb).toBe("history");
  });

  it("ignores a bare H", () => {
    expect(bindingFor(press("h"))).toBeNull();
  });

  it("does not fire a function key held with Ctrl, Alt or Meta", () => {
    expect(bindingFor(press("F5", { ctrlKey: true }))).toBeNull();
    expect(bindingFor(press("F5", { altKey: true }))).toBeNull();
    expect(bindingFor(press("F5", { metaKey: true }))).toBeNull();
  });

  it("still fires a function key held with Shift", () => {
    expect(bindingFor(press("F5", { shiftKey: true }))?.verb).toBe("deposit");
  });

  it("gives Re-present and Replace no key", () => {
    expect(bindingOf("represent").keyLabel).toBeNull();
    expect(bindingOf("replace").keyLabel).toBeNull();
    expect(bindingOf("represent").matches(press("Enter"))).toBe(false);
  });

  it("does not claim Enter — Enter opens the receipt", () => {
    expect(bindingFor(press("Enter"))).toBeNull();
  });
});

describe("isReservedKey", () => {
  it("swallows every browser key the screen binds", () => {
    for (const key of ["F3", "F5", "F6", "F7", "F8"]) {
      expect(isReservedKey(press(key))).toBe(true);
    }
    expect(isReservedKey(press("h", { ctrlKey: true }))).toBe(true);
  });

  it("leaves unbound keys to the browser", () => {
    expect(isReservedKey(press("F1"))).toBe(false);
    expect(isReservedKey(press("Enter"))).toBe(false);
    expect(isReservedKey(press("F5", { ctrlKey: true }))).toBe(false);
  });
});

describe("buttonText", () => {
  it("writes the key after the label", () => {
    expect(buttonText(bindingOf("clear"), RECEIVED_VOCABULARY)).toBe("Clear - F7");
    expect(buttonText(bindingOf("history"), RECEIVED_VOCABULARY)).toBe("History - Ctrl+H");
  });

  it("takes the bulk verb from the vocabulary", () => {
    expect(buttonText(bindingOf("deposit"), RECEIVED_VOCABULARY)).toBe("Deposit - F5");
    expect(buttonText(bindingOf("deposit"), ISSUED_VOCABULARY)).toBe("Present - F5");
  });

  it("writes only the label for a binding with no key", () => {
    expect(buttonText(bindingOf("replace"), RECEIVED_VOCABULARY)).toBe("Replace");
  });
});
