import { all } from "redux-saga/effects";
import authSaga from "./auth.saga";
import businessContextSaga from "./businessContext.saga";
import mastersSaga from "./masters.saga";
import openingStockSaga from "./openingStock.saga";
import physicalStockSaga from "./physicalStock.saga";

export default function* rootSaga() {
  yield all([
    authSaga(),
    businessContextSaga(),
    mastersSaga(),
    openingStockSaga(),
    physicalStockSaga(),
  ]);
}
