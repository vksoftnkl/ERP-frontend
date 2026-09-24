/**
 * Every writing verb, by id. The screen looks a spec up here and never names
 * one — which is what lets a seventh verb land without touching it.
 */
import { bounceSpec } from "./bounce";
import { clearSpec } from "./clear";
import { depositSpec, representSpec } from "./deposit";
import { replaceSpec } from "./replace";
import { returnSpec } from "./returnCancel";
import type { ActionSpec, WritingVerb } from "./types";

// Each spec is typed over its own form; the registry forgets which, and the
// dialog carries the form as an opaque value between a spec's own functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyActionSpec = ActionSpec<any>;

export const ACTION_SPECS: Record<WritingVerb, AnyActionSpec> = {
  deposit: depositSpec,
  clear: clearSpec,
  bounce: bounceSpec,
  represent: representSpec,
  replace: replaceSpec,
  return: returnSpec,
};

export type { ActionSpec, WritingVerb } from "./types";
export { applyPatch } from "./types";
