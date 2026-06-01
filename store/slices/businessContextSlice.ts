import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";

export type BusinessContextUiState = {
  isCompanySelectionLocked: boolean;
  isBranchSelectionLocked: boolean;
};

const initialState: BusinessContextUiState = {
  isCompanySelectionLocked: false,
  isBranchSelectionLocked: false,
};

const businessContextSlice = createSlice({
  name: "businessContextUi",
  initialState,
  reducers: {
    companySelectionLockChanged(state, action: PayloadAction<boolean>) {
      state.isCompanySelectionLocked = action.payload;
    },
    branchSelectionLockChanged(state, action: PayloadAction<boolean>) {
      state.isBranchSelectionLocked = action.payload;
    },
  },
});

export const { companySelectionLockChanged, branchSelectionLockChanged } =
  businessContextSlice.actions;

export function selectIsCompanySelectionLocked(state: RootState): boolean {
  return state.businessContextUi.isCompanySelectionLocked;
}
export function selectIsBranchSelectionLocked(state: RootState): boolean {
  return state.businessContextUi.isBranchSelectionLocked;
}

export default businessContextSlice.reducer;
