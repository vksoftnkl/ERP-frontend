import { configureStore } from "@reduxjs/toolkit";
import gridColumnsReducer from "@/store/slices/gridColumnsSlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      gridColumns: gridColumnsReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
