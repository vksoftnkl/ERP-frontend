"use client";

/**
 * The React side of `lib/screen-memory`: thin glue, so every decision stays in
 * pure functions the node-only test run can reach.
 *
 * A screen opts in when its page passes `memory={{ key, resume }}`:
 *   - `key`    — the screen's slot name, e.g. "sales/testbill";
 *   - `resume` — true only when the page reopened ON a remembered entry (the
 *                operator came back), false for an explicit Create / Open.
 * A screen given no `memory` (a deep link, an embedded use) never reads or
 * writes it.
 */
import { useEffect, useRef, useState } from "react";
import { screenMemory, type ScreenScope } from "@/lib/screen-memory";

export type ScreenMemoryOption = {
  key: string;
  resume: boolean;
};

/**
 * The remembered value, read ONCE when the screen mounts and only when the page
 * is resuming. Stable for the screen's life.
 */
export function useRecalledOnce<T>(
  memory: ScreenMemoryOption | undefined,
  scope: ScreenScope,
): T | null {
  const [recalled] = useState<T | null>(() =>
    memory?.resume ? screenMemory.recall<T>(memory.key, scope) : null,
  );
  return recalled;
}

export type RememberWriteOptions<T> = {
  /** The tenant the VALUE belongs to — a document keeps the one it was started in. */
  scopeOf: (value: T) => ScreenScope;
  /** False drops the slot: nothing on screen is worth bringing back. */
  shouldKeep: (value: T) => boolean;
  /** False holds every write — the screen has not decided what it is showing yet. */
  armed?: boolean;
};

/** Write-through on every change of `value`. */
export function useRememberWrite<T>(
  memory: ScreenMemoryOption | undefined,
  value: T,
  options: RememberWriteOptions<T>,
): void {
  const { armed = true, scopeOf, shouldKeep } = options;
  const key = memory?.key ?? "";
  // `scopeOf` / `shouldKeep` are module functions at every call site; an inline
  // one only costs a repeated `Map.set`.
  useEffect(() => {
    if (!key || !armed) {
      return;
    }
    const scope = scopeOf(value);
    if (shouldKeep(value)) {
      screenMemory.remember(key, scope, value);
    } else {
      screenMemory.forget(key, scope);
    }
  }, [armed, key, scopeOf, shouldKeep, value]);
}

/**
 * Forget the entry when the screen unmounts while a write (save, post, hold …)
 * is still in flight. The write lands after the screen is gone, so the entry
 * would otherwise come back as unsaved work and could be billed twice.
 *
 * Only an unmount during a write forgets: StrictMode's simulated unmount
 * happens before anything can be busy.
 */
export function useForgetIfWritingOnUnmount(
  memory: ScreenMemoryOption | undefined,
  /** Read at unmount: is a save / post / hold still in flight? */
  isWriting: () => boolean,
  /** Read at unmount: the tenant of the entry on screen. */
  scopeNow: () => ScreenScope,
): void {
  const key = memory?.key ?? "";
  const probes = useRef({ isWriting, scopeNow });
  // Refreshed after every commit, so the unmount below reads the last ones.
  useEffect(() => {
    probes.current = { isWriting, scopeNow };
  });
  useEffect(() => {
    if (!key) {
      return undefined;
    }
    return () => {
      if (probes.current.isWriting()) {
        screenMemory.forget(key, probes.current.scopeNow());
      }
    };
  }, [key]);
}
