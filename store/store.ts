import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/store/api/baseApi";
import authReducer from "@/store/slices/authSlice";
import gridColumnsReducer from "@/store/slices/gridColumnsSlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
      gridColumns: gridColumnsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
