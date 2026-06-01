import {
  all,
  call,
  cancel,
  fork,
  put,
  take,
  takeEvery,
} from "redux-saga/effects";
import type { Task } from "redux-saga";
import { createAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { openingStockApi } from "@/store/api/openingStockApi";
import { lookupsApi } from "@/store/api/lookupsApi";
import {
  isDirtySet,
  rowAutofilled,
  rowCascadeLoadingSet,
  rowsReset,
  selectedDocumentIdSet,
  saveLoadingSet,
  saveErrorSet,
} from "@/store/slices/openingStockSlice";

// ─── Public action creators ───────────────────────────────────────────────────

/** Dispatch when the user selects an item in an Opening Stock row. */
export const itemSelectedInOpeningStockRow = createAction<{
  rowId: number;
  itemId: string;
}>("openingStock/itemSelectedInRow");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Request failed.";
}

// ─── Item-selection cascade (per-row, cancelable) ────────────────────────────

function* itemSelectionCascadeWorker({
  rowId,
  itemId,
}: {
  rowId: number;
  itemId: string;
}): Generator {
  yield put(rowCascadeLoadingSet({ rowId, loading: true }));
  try {
    // Step 1 – price details (item + prices + default tax)
    const priceResult = (yield call(() =>
      (
        lookupsApi.endpoints.getItemPriceDetails.initiate({ itemId }) as unknown as {
          unwrap: () => Promise<unknown>;
        }
      ).unwrap(),
    )) as Awaited<
      ReturnType<typeof lookupsApi.endpoints.getItemPriceDetails.initiate>
    >;

    let taxDetails: unknown = null;
    const defaultTaxId = (priceResult as { item?: { item_default_tax_id?: string } })?.item
      ?.item_default_tax_id;

    if (defaultTaxId) {
      // Step 2 – tax details (only if an item-level tax is set)
      taxDetails = (yield call(() =>
        (
          lookupsApi.endpoints.getItemTaxById.initiate({
            taxId: defaultTaxId,
          }) as unknown as { unwrap: () => Promise<unknown> }
        ).unwrap(),
      )) as unknown;
    }

    yield put(rowAutofilled({ rowId, priceDetails: priceResult as never, taxDetails: taxDetails as unknown }));
  } catch {
    // Cascade failure is silent — the row stays at whatever the user typed
  } finally {
    yield put(rowCascadeLoadingSet({ rowId, loading: false }));
  }
}

/**
 * Keeps one task per rowId. When a new item-selection arrives for the same
 * row, the previous cascade is cancelled before starting the new one.
 */
function* watchItemSelectionWithPerRowCancellation(): Generator {
  const tasks: Record<string, Task> = {};

  while (true) {
    const action = (yield take(itemSelectedInOpeningStockRow)) as ReturnType<
      typeof itemSelectedInOpeningStockRow
    >;
    const { rowId, itemId } = action.payload;
    const key = String(rowId);

    if (tasks[key]) {
      yield cancel(tasks[key]);
    }

    tasks[key] = (yield fork(itemSelectionCascadeWorker, {
      rowId,
      itemId,
    })) as Task;
  }
}

// ─── Save / delete lifecycle watchers ────────────────────────────────────────

function* handleSaveSuccessWorker(): Generator {
  yield put(isDirtySet(false));
  yield put(saveLoadingSet(false));
  yield put(saveErrorSet(null));
  toast.success("Opening stock saved successfully.");
}

function* handleSaveFailureWorker(action: { payload?: unknown }): Generator {
  const message = extractErrorMessage(action.payload);
  yield put(saveLoadingSet(false));
  yield put(saveErrorSet(message));
  toast.error(message);
}

function* handleDeleteSuccessWorker(): Generator {
  yield put(selectedDocumentIdSet(null));
  yield put(rowsReset());
  toast.success("Opening stock document deleted.");
}

function* handleDeleteFailureWorker(action: { payload?: unknown }): Generator {
  toast.error(extractErrorMessage(action.payload));
}

// ─── Root watcher ─────────────────────────────────────────────────────────────

export default function* openingStockSaga(): Generator {
  yield all([
    fork(watchItemSelectionWithPerRowCancellation),
    takeEvery(
      openingStockApi.endpoints.saveOpeningStockDoc.matchFulfilled,
      handleSaveSuccessWorker as never,
    ),
    takeEvery(
      openingStockApi.endpoints.saveOpeningStockDoc.matchRejected,
      handleSaveFailureWorker as never,
    ),
    takeEvery(
      openingStockApi.endpoints.deleteOpeningStockDoc.matchFulfilled,
      handleDeleteSuccessWorker as never,
    ),
    takeEvery(
      openingStockApi.endpoints.deleteOpeningStockDoc.matchRejected,
      handleDeleteFailureWorker as never,
    ),
  ]);
}
