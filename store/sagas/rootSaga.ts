import { all } from "redux-saga/effects";
import authSaga from "./auth.saga";
import businessContextSaga from "./businessContext.saga";
import mastersSaga from "./masters.saga";

export default function* rootSaga() {
  yield all([
    authSaga(),
    businessContextSaga(),
    mastersSaga(),
  ]);
}
