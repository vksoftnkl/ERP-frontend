import { all, put, takeEvery } from "redux-saga/effects";
import { toast } from "react-toastify";
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

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Request failed.";
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
  meta: { arg: { originalArgs: { moduleKey?: string } } };
}): Generator {
  const moduleKey = extractModuleKey(action);
  if (moduleKey) {
    yield put(editModalClosed({ moduleKey }));
  }
  toast.success("Deleted successfully.");
}

function* handleSaveFailureWorker(action: { payload?: unknown }): Generator {
  toast.error(extractErrorMessage(action.payload));
}

function* handleDeleteFailureWorker(action: { payload?: unknown }): Generator {
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
