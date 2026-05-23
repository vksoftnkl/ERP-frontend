import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";

export type GlobalLoaderState = {
  pendingRequests: number;
};

const initialState: GlobalLoaderState = {
  pendingRequests: 0,
};

const globalLoaderSlice = createSlice({
  name: "globalLoader",
  initialState,
  reducers: {
    globalLoaderStarted(state) {
      state.pendingRequests += 1;
    },
    globalLoaderFinished(state) {
      state.pendingRequests = Math.max(0, state.pendingRequests - 1);
    },
    globalLoaderReset(state) {
      state.pendingRequests = 0;
    },
  },
});

export const {
  globalLoaderFinished,
  globalLoaderReset,
  globalLoaderStarted,
} = globalLoaderSlice.actions;

export function selectGlobalLoaderPendingRequests(state: RootState): number {
  return state.globalLoader.pendingRequests;
}

export default globalLoaderSlice.reducer;
