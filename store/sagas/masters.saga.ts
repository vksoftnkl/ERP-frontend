import { all, put, takeEvery } from "redux-saga/effects";
import { toast } from "@/lib/notify";
import { mastersApi } from "@/store/api/mastersApi";
import { baseApi } from "@/store/api/baseApi";
import { editModalClosed } from "@/store/slices/mastersSlice";

// Modules whose save should also invalidate the shared lookup caches so that
// dropdowns in other pages (e.g. Opening Stock item dropdown) stay fresh.
const LOOKUP_INVALIDATION_MAP: Record<string, string[]> = {
  items: ["ItemLookup"],
  "item-brands": ["ItemLookup"],
  "item-categories": ["ItemLookup"],
  "item-groups": ["ItemLookup"],
  "item-sections": ["ItemLookup"],
  units: ["UnitLookup"],
  "item-taxes": ["TaxLookup"],
  godowns: ["GodownLookup"],
  "branch-masters": ["BranchLookup"],
  "company-masters": ["CompanyLookup"],
  "user-administration": ["UserLookup"],
};

function extractModuleKey(action: {
  meta: { arg: { originalArgs: { moduleKey?: string } } };
}): string {
  return action.meta?.arg?.originalArgs?.moduleKey ?? "";
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}

function extractErrorMessage(payload: unknown): string {
  return extractMessage(payload, "Request failed.");
}

// ─── Workers ─────────────────────────────────────────────────────────────────

function* handleSaveSuccessWorker(action: {
  meta: { arg: { originalArgs: { moduleKey?: string } } };
}): Generator {
  const moduleKey = extractModuleKey(action);
  if (moduleKey) {
    yield put(editModalClosed({ moduleKey }));
  }
  toast.success("Saved successfully.");

  // Cross-module lookup cache invalidation
  const tagsToInvalidate = LOOKUP_INVALIDATION_MAP[moduleKey] ?? [];
  if (tagsToInvalidate.length > 0) {
    yield put(baseApi.util.invalidateTags(tagsToInvalidate as never) as never);
  }
}

function* handleDeleteSuccessWorker(action: {
  payload?: unknown;
  meta: { arg: { originalArgs: { moduleKey?: string } } };
}): Generator {
  const moduleKey = extractModuleKey(action);
  if (moduleKey) {
    yield put(editModalClosed({ moduleKey }));
  }
  // The delete endpoint toggles soft-delete: deleting an active record returns a
  // "… deleted successfully" message, while hitting it on an already-deleted record
  // restores it and returns "… restored successfully". Surface the server message so
  // the toast reflects which action actually happened.
  toast.success(extractMessage(action.payload, "Deleted successfully."));
}

/**
 * Notes 120: a refusal the server words itself (`errors[].user {title, line,
 * todo}`) is shown in those words, not as its bare headline ("Validation
 * failed"). The party masters' GST-type / GSTIN / balance refusals need this;
 * every other unworded failure keeps the one sentence it always had.
 */
function hasServerWording(payload: unknown): boolean {
  const data = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : null;
  const errors = data && typeof data === "object" ? (data as { errors?: unknown }).errors : null;
  const first = Array.isArray(errors) ? (errors[0] as { user?: { line?: unknown } } | undefined) : undefined;
  return typeof first?.user?.line === "string" && first.user.line.trim().length > 0;
}

function* handleSaveFailureWorker(action: { payload?: unknown }): Generator {
  if (hasServerWording(action.payload)) {
    toast.apiError(action.payload);
    return;
  }
  toast.error(extractErrorMessage(action.payload));
}

function* handleDeleteFailureWorker(action: { payload?: unknown }): Generator {
  if (hasServerWording(action.payload)) {
    toast.apiError(action.payload, { refusedTitle: "Cannot delete" });
    return;
  }
  toast.error(extractErrorMessage(action.payload));
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

export default function* mastersSaga(): Generator {
  yield all([
    takeEvery(mastersApi.endpoints.masterSave.matchFulfilled, handleSaveSuccessWorker as never),
    takeEvery(mastersApi.endpoints.masterDelete.matchFulfilled, handleDeleteSuccessWorker as never),
    takeEvery(mastersApi.endpoints.masterSave.matchRejected, handleSaveFailureWorker as never),
    takeEvery(mastersApi.endpoints.masterDelete.matchRejected, handleDeleteFailureWorker as never),
  ]);
}
