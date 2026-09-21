/**
 * The message queue behind the popup — the part that decides what an operator
 * is actually made to read.
 *
 * These are the rules that matter at a counter: a success gets out of the way on
 * its own, an error does not; a burst of the same news is one popup, not five;
 * and nothing is silently dropped on the way.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  SUCCESS_AUTO_CLOSE_MS,
  dismissMessage,
  getMessages,
  subscribeToMessages,
  toast,
} from "./notify";

beforeEach(() => {
  dismissMessage();
});

describe("what gets queued", () => {
  it("keeps messages in the order they were raised", () => {
    toast.warn("Stock is negative on line 3.");
    toast.info("Price level reset.");
    expect(getMessages().map((message) => message.content)).toEqual([
      "Stock is negative on line 3.",
      "Price level reset.",
    ]);
  });

  it("carries the kind, which is what the popup is coloured and titled by", () => {
    toast.success("Saved.");
    toast.error("Not saved.");
    toast.warning("Careful.");
    expect(getMessages().map((message) => message.kind)).toEqual(["success", "error", "warn"]);
  });

  it("ignores a message with nothing in it", () => {
    // An error with no message text should not stop the operator with a blank
    // popup — the caller has nothing to say.
    toast.error("");
    expect(getMessages()).toHaveLength(0);
  });
});

describe("a success gets out of the way; everything else waits", () => {
  it("closes a success by itself", () => {
    toast.success("Bill B-1042 saved.");
    expect(getMessages()[0].autoClose).toBe(SUCCESS_AUTO_CLOSE_MS);
  });

  it("makes an error, a warning and a note wait for the operator", () => {
    toast.error("Add at least one item before saving the bill.");
    toast.warn("Stock is negative.");
    toast.info("Nothing to print.");
    expect(getMessages().every((message) => message.autoClose === false)).toBe(true);
  });

  it("lets the caller override either way", () => {
    toast.error("Fix 4 validation errors.", { autoClose: 8000 });
    toast.success("Saved.", { autoClose: false });
    expect(getMessages().map((message) => message.autoClose)).toEqual([8000, false]);
  });
});

describe("the same news is not told twice", () => {
  it("collapses identical messages instead of queueing them", () => {
    // A dead network fails every dropdown on the screen at once, and each
    // failure raises the same sentence.
    toast.error("The network is unreachable.");
    toast.error("The network is unreachable.");
    toast.error("The network is unreachable.");
    expect(getMessages()).toHaveLength(1);
  });

  it("still treats the same words from a different kind as different news", () => {
    toast.error("Loaded.");
    toast.info("Loaded.");
    expect(getMessages()).toHaveLength(2);
  });

  it("replaces a message raised under the caller's own key", () => {
    // `toastId` is what the stock screens have always used to keep one live
    // validation message rather than a pile of them.
    toast.error("Fix 4 validation errors.", { toastId: "stock-save:validation" });
    toast.error("Fix 1 validation error.", { toastId: "stock-save:validation" });
    expect(getMessages()).toHaveLength(1);
    expect(getMessages()[0].content).toBe("Fix 1 validation error.");
  });

  it("does not collapse a message that is not a plain sentence", () => {
    // Rendered content (the stock screens' validation lists) cannot be compared
    // by text, so each one is its own message.
    const list = { type: "div", props: {} } as unknown as React.ReactNode;
    toast.error(list);
    toast.error(list);
    expect(getMessages()).toHaveLength(2);
  });
});

describe("dismissing", () => {
  it("closes one message by its id and leaves the rest queued", () => {
    const first = toast.error("First.");
    toast.error("Second.");
    dismissMessage(first);
    expect(getMessages().map((message) => message.content)).toEqual(["Second."]);
  });

  it("empties the queue when given nothing", () => {
    toast.error("First.");
    toast.error("Second.");
    toast.dismiss();
    expect(getMessages()).toHaveLength(0);
  });

  it("tells its subscribers on every change, so the popup follows the queue", () => {
    let changes = 0;
    const unsubscribe = subscribeToMessages(() => {
      changes += 1;
    });
    toast.error("First.");
    dismissMessage();
    unsubscribe();
    toast.error("Not seen.");
    expect(changes).toBe(2);
  });

  it("hands React a new array only when something changed", () => {
    toast.error("First.");
    const queue = getMessages();
    expect(getMessages()).toBe(queue);
    toast.error("Second.");
    expect(getMessages()).not.toBe(queue);
  });
});
