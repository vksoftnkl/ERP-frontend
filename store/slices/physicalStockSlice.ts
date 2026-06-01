import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import type { PhysicalStockRow } from "@/features/stocks/physical-stock/physical-stock.types";

type PhysicalStockValidationIssue = {
  rowId: number;
  fieldKey: string;
  message: string;
};

export type PhysicalStockState = {
  rows: PhysicalStockRow[];
  validationIssues: PhysicalStockValidationIssue[];
  selectedDocumentId: string | null;
  isListModalOpen: boolean;
  isDeleteConfirmOpen: boolean;
  deleteTargetId: string | null;
  saveLoading: boolean;
  saveError: string | null;
};

const initialState: PhysicalStockState = {
  rows: [],
  validationIssues: [],
  selectedDocumentId: null,
  isListModalOpen: false,
  isDeleteConfirmOpen: false,
  deleteTargetId: null,
  saveLoading: false,
  saveError: null,
};

const physicalStockSlice = createSlice({
  name: "physicalStock",
  initialState,
  reducers: {
    rowsSet(state, action: PayloadAction<PhysicalStockRow[]>) {
      state.rows = action.payload;
    },
    rowsReset(state) {
      state.rows = [];
      state.validationIssues = [];
    },
    rowUpdated(
      state,
      action: PayloadAction<{ rowId: number; changes: Partial<PhysicalStockRow> }>,
    ) {
      const idx = state.rows.findIndex((r) => r.id === action.payload.rowId);
      if (idx !== -1) {
        Object.assign(state.rows[idx], action.payload.changes);
      }
    },
    validationIssuesSet(state, action: PayloadAction<PhysicalStockValidationIssue[]>) {
      state.validationIssues = action.payload;
    },
    selectedDocumentIdSet(state, action: PayloadAction<string | null>) {
      state.selectedDocumentId = action.payload;
    },
    listModalToggled(state, action: PayloadAction<boolean>) {
      state.isListModalOpen = action.payload;
    },
    deleteConfirmToggled(
      state,
      action: PayloadAction<{ open: boolean; targetId?: string | null }>,
    ) {
      state.isDeleteConfirmOpen = action.payload.open;
      state.deleteTargetId = action.payload.open
        ? (action.payload.targetId ?? null)
        : null;
    },
    saveLoadingSet(state, action: PayloadAction<boolean>) {
      state.saveLoading = action.payload;
    },
    saveErrorSet(state, action: PayloadAction<string | null>) {
      state.saveError = action.payload;
    },
  },
});

export const {
  rowsSet,
  rowsReset,
  rowUpdated,
  validationIssuesSet,
  selectedDocumentIdSet,
  listModalToggled,
  deleteConfirmToggled,
  saveLoadingSet,
  saveErrorSet,
} = physicalStockSlice.actions;

export const selectPhysicalStockRows = (state: RootState) => state.physicalStock.rows;
export const selectPhysicalStockValidationIssues = (state: RootState) =>
  state.physicalStock.validationIssues;
export const selectPhysicalStockSelectedDocId = (state: RootState) =>
  state.physicalStock.selectedDocumentId;
export const selectPhysicalStockSaveLoading = (state: RootState) =>
  state.physicalStock.saveLoading;
export const selectPhysicalStockSaveError = (state: RootState) =>
  state.physicalStock.saveError;

export default physicalStockSlice.reducer;
