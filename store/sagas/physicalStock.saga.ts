import { all, put, takeEvery } from "redux-saga/effects";
import { toast } from "react-toastify";
import { physicalStockApi } from "@/store/api/physicalStockApi";
import {
  rowsReset,
  selectedDocumentIdSet,
  saveLoadingSet,
  saveErrorSet,
} from "@/store/slices/physicalStockSlice";

function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Request failed.";
}

function* handleSaveSuccessWorker(): Generator {
  yield put(saveLoadingSet(false));
  yield put(saveErrorSet(null));
  toast.success("Physical stock saved successfully.");
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
  toast.success("Physical stock document deleted.");
}

function* handleDeleteFailureWorker(action: { payload?: unknown }): Generator {
  toast.error(extractErrorMessage(action.payload));
}

export default function* physicalStockSaga(): Generator {
  yield all([
    takeEvery(
      physicalStockApi.endpoints.savePhysicalStockDoc.matchFulfilled,
      handleSaveSuccessWorker as never,
    ),
    takeEvery(
      physicalStockApi.endpoints.savePhysicalStockDoc.matchRejected,
      handleSaveFailureWorker as never,
    ),
    takeEvery(
      physicalStockApi.endpoints.deletePhysicalStockDoc.matchFulfilled,
      handleDeleteSuccessWorker as never,
    ),
    takeEvery(
      physicalStockApi.endpoints.deletePhysicalStockDoc.matchRejected,
      handleDeleteFailureWorker as never,
    ),
  ]);
}
