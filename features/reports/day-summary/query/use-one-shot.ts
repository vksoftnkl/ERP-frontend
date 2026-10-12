"use client";
/**
 * One request for a dialog (group ledgers, check detail): asked when `key`
 * appears, aborted when it changes or the dialog closes, and an answer for an
 * old key is never shown. `key = null` means closed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isAborted } from "@/features/reports/shared/api/abort";

type Settled<T> = { key: string; attempt: number; data: T | null; error: unknown };

export function useOneShot<T>(key: string | null, request: (signal: AbortSignal) => Promise<T>) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  // `request` is a new closure every render; the key says when it is a new ask.
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    requestRef.current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSettled({ key, attempt, data, error: null });
      })
      .catch((error: unknown) => {
        if (!isAborted(error, controller.signal)) setSettled({ key, attempt, data: null, error });
      });
    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = settled && settled.key === key && settled.attempt === attempt ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: Boolean(key) && current === null,
    retry,
  };
}
