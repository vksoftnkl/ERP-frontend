import { call, put } from "redux-saga/effects";
import type { CallEffect, PutEffect } from "redux-saga/effects";
import {
  globalLoaderFinished,
  globalLoaderStarted,
} from "@/store/slices/globalLoaderSlice";

/**
 * Wraps any saga worker with global loader increment/decrement so that
 * the top-bar spinner reflects all saga-driven async operations automatically.
 *
 * Usage: yield call(withGlobalLoader, myWorker, arg1, arg2)
 */
export function* withGlobalLoader<TArgs extends unknown[], TReturn>(
  worker: (...args: TArgs) => Generator,
  ...args: TArgs
): Generator<CallEffect | PutEffect, TReturn, unknown> {
  yield put(globalLoaderStarted());
  try {
    return (yield call(worker as (...a: unknown[]) => Generator, ...args)) as TReturn;
  } finally {
    yield put(globalLoaderFinished());
  }
}
