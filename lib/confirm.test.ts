/**
 * The confirmation queue.
 *
 * What is worth pinning is the contract the call sites lean on: the promise
 * always settles, settles ONCE, and reads a non-answer as "no" — because every
 * caller writes `if (await confirm(…))` and a question that hung or rejected
 * would strand the flow behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelAllConfirmations,
  confirm,
  getConfirmations,
  subscribeToConfirmations,
} from "./confirm";

// The module bails to `false` off the browser, which is right in a page render
// and useless in a test — so the tests run with a window in place.
const hadWindow = "window" in globalThis;

beforeEach(() => {
  if (!hadWindow) {
    (globalThis as unknown as { window: unknown }).window = {};
  }
});

afterEach(() => {
  cancelAllConfirmations();
  if (!hadWindow) {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

describe("confirm", () => {
  it("queues the question and hands the dialog what to draw", async () => {
    const answer = confirm({ title: "Discard?", message: "It cannot be undone." });
    const [pending] = getConfirmations();
    expect(pending).toMatchObject({ title: "Discard?", message: "It cannot be undone." });
    pending.settle(true);
    await expect(answer).resolves.toBe(true);
  });

  it("resolves false for a cancel, and clears the queue either way", async () => {
    const answer = confirm({ title: "Leave?", message: "…" });
    getConfirmations()[0].settle(false);
    await expect(answer).resolves.toBe(false);
    expect(getConfirmations()).toHaveLength(0);
  });

  it("keeps the FIRST answer when the dialog settles twice", async () => {
    // Esc while a click is already in flight. A promise resolved twice silently
    // keeps the first value; dropping the second is the same outcome, stated.
    const answer = confirm({ title: "Discard?", message: "…" });
    const pending = getConfirmations()[0];
    pending.settle(true);
    pending.settle(false);
    await expect(answer).resolves.toBe(true);
  });

  it("asks one at a time, oldest first, and drops neither", async () => {
    const first = confirm({ title: "First", message: "…" });
    const second = confirm({ title: "Second", message: "…" });
    expect(getConfirmations().map((entry) => entry.title)).toEqual(["First", "Second"]);
    getConfirmations()[0].settle(true);
    await expect(first).resolves.toBe(true);
    // The second is now the one on screen, with its own caller still waiting.
    expect(getConfirmations().map((entry) => entry.title)).toEqual(["Second"]);
    getConfirmations()[0].settle(false);
    await expect(second).resolves.toBe(false);
  });

  it("tells its subscribers when the queue moves", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToConfirmations(listener);
    const answer = confirm({ title: "Discard?", message: "…" });
    expect(listener).toHaveBeenCalledTimes(1);
    getConfirmations()[0].settle(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    void confirm({ title: "Another", message: "…" });
    expect(listener).toHaveBeenCalledTimes(2);
    return answer;
  });

  it("answers everything outstanding with NO when the asker goes away", async () => {
    // A hard navigation leaves the asking screen behind; a caller still waiting
    // on an answer that can never come would hold its closure alive.
    const first = confirm({ title: "First", message: "…" });
    const second = confirm({ title: "Second", message: "…" });
    cancelAllConfirmations();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(getConfirmations()).toHaveLength(0);
  });

  it("returns a NEW array identity per change, so React can compare it", () => {
    const before = getConfirmations();
    const answer = confirm({ title: "Discard?", message: "…" });
    expect(getConfirmations()).not.toBe(before);
    getConfirmations()[0].settle(false);
    return answer;
  });
});
