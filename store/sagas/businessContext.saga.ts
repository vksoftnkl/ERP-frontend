import { all, put, select, take, takeLatest } from "redux-saga/effects";
import { businessContextApi } from "@/store/api/businessContextApi";
import { authSessionChanged } from "@/store/slices/authSlice";
import { businessContextChanged, selectBusinessContext } from "@/store/slices/authSlice";
import type { PersistedBusinessContext } from "@/store/slices/authSlice";
import { logoutRequested } from "./auth.saga";

// ─── Workers ─────────────────────────────────────────────────────────────────

/**
 * When company selection changes, waits for the branch list to load via RTK
 * Query, then auto-selects the first branch if the current branch is no longer
 * valid in the new company's branch list. Uses takeLatest so rapid company
 * switches cancel the previous in-flight resolution.
 */
function* handleCompanyChangedWorker(companyId: string): Generator {
  if (!companyId) {
    yield put(
      businessContextChanged({
        companyId: null,
        companyName: null,
        compFinYearFrom: null,
        compFinYearTo: null,
        branchId: null,
        branchName: null,
      }),
    );
    return;
  }

  // Initiate the RTK Query branch fetch (idempotent if already cached)
  yield put(
    businessContextApi.endpoints.getBranchesByCompany.initiate(companyId) as never,
  );

  // Wait for the branch query to complete
  const fulfilledPattern = businessContextApi.endpoints.getBranchesByCompany.matchFulfilled;
  const rejectedPattern = businessContextApi.endpoints.getBranchesByCompany.matchRejected;

  const result: unknown = yield take(
    (action: unknown) =>
      (fulfilledPattern(action as never) || rejectedPattern(action as never)) &&
      (action as { meta: { arg: { originalArgs: string } } }).meta.arg.originalArgs === companyId,
  );

  if (!businessContextApi.endpoints.getBranchesByCompany.matchFulfilled(result as never)) {
    return;
  }

  const branches = (result as { payload: Array<{ id: string; name: string }> }).payload;

  // Determine which branch to select
  const existingContext = (yield select(selectBusinessContext)) as PersistedBusinessContext | null;
  const currentBranchId = existingContext?.branchId ?? "";

  const branchStillValid = branches.some((b) => b.id === currentBranchId);
  const newBranchId = branchStillValid
    ? currentBranchId
    : (branches[0]?.id ?? null);
  const newBranch = branches.find((b) => b.id === newBranchId) ?? null;

  yield put(
    businessContextChanged({
      companyId,
      companyName: existingContext?.companyName ?? null,
      compFinYearFrom: existingContext?.compFinYearFrom ?? null,
      compFinYearTo: existingContext?.compFinYearTo ?? null,
      branchId: newBranchId,
      branchName: newBranch?.name ?? null,
    }),
  );
}

function* handleLogoutWorker(): Generator {
  // Invalidate business context API cache on logout
  yield put(
    businessContextApi.util.invalidateTags(["CompanyList", "BranchList"]) as never,
  );
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

export default function* businessContextSaga(): Generator {
  yield all([
    takeLatest(
      (action: unknown) =>
        authSessionChanged.match(action as never) &&
        Boolean(
          (action as { payload: { businessContext?: unknown } }).payload?.businessContext,
        ),
      function* (action: ReturnType<typeof authSessionChanged>) {
        const companyId = action.payload.businessContext?.companyId ?? "";
        if (companyId) {
          yield* handleCompanyChangedWorker(companyId);
        }
      },
    ),
    takeLatest(logoutRequested, handleLogoutWorker),
  ]);
}
