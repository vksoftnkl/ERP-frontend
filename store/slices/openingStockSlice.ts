import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import type {
  OpeningStockRow,
  RowValidationIssue,
} from "@/features/stocks/opening-stock/opening-stock.types";

export type OpeningStockState = {
  rows: OpeningStockRow[];
  validationIssues: RowValidationIssue[];
  selectedDocumentId: string | null;
  isDirty: boolean;
  rowCascadeLoading: Record<string, boolean>;
  isListModalOpen: boolean;
  isAuditNotesModalOpen: boolean;
  isDeleteConfirmOpen: boolean;
  deleteTargetId: string | null;
  columnWidths: Record<string, number>;
  saveLoading: boolean;
  saveError: string | null;
};

const initialState: OpeningStockState = {
  rows: [],
  validationIssues: [],
  selectedDocumentId: null,
  isDirty: false,
  rowCascadeLoading: {},
  isListModalOpen: false,
  isAuditNotesModalOpen: false,
  isDeleteConfirmOpen: false,
  deleteTargetId: null,
  columnWidths: {},
  saveLoading: false,
  saveError: null,
};

const openingStockSlice = createSlice({
  name: "openingStock",
  initialState,
  reducers: {
    rowsSet(state, action: PayloadAction<OpeningStockRow[]>) {
      state.rows = action.payload;
      state.isDirty = false;
    },
    rowsReset(state) {
      state.rows = [];
      state.validationIssues = [];
      state.isDirty = false;
    },
    rowUpdated(
      state,
      action: PayloadAction<{ rowId: number; changes: Partial<OpeningStockRow> }>,
    ) {
      const idx = state.rows.findIndex((r) => r.id === action.payload.rowId);
      if (idx !== -1) {
        Object.assign(state.rows[idx], action.payload.changes);
        state.isDirty = true;
      }
    },
    validationIssuesSet(state, action: PayloadAction<RowValidationIssue[]>) {
      state.validationIssues = action.payload;
    },
    selectedDocumentIdSet(state, action: PayloadAction<string | null>) {
      state.selectedDocumentId = action.payload;
    },
    isDirtySet(state, action: PayloadAction<boolean>) {
      state.isDirty = action.payload;
    },
    rowCascadeLoadingSet(
      state,
      action: PayloadAction<{ rowId: number; loading: boolean }>,
    ) {
      const key = String(action.payload.rowId);
      if (action.payload.loading) {
        state.rowCascadeLoading[key] = true;
      } else {
        delete state.rowCascadeLoading[key];
      }
    },
    listModalToggled(state, action: PayloadAction<boolean>) {
      state.isListModalOpen = action.payload;
    },
    auditNotesModalToggled(state, action: PayloadAction<boolean>) {
      state.isAuditNotesModalOpen = action.payload;
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
    columnWidthSet(
      state,
      action: PayloadAction<{ columnKey: string; width: number }>,
    ) {
      state.columnWidths[action.payload.columnKey] = action.payload.width;
    },
    saveLoadingSet(state, action: PayloadAction<boolean>) {
      state.saveLoading = action.payload;
    },
    saveErrorSet(state, action: PayloadAction<string | null>) {
      state.saveError = action.payload;
    },
    rowAutofilled(
      state,
      action: PayloadAction<{
        rowId: number;
        priceDetails: unknown;
        taxDetails: unknown;
      }>,
    ) {
      const idx = state.rows.findIndex((r) => r.id === action.payload.rowId);
      if (idx !== -1) {
        // Autofill logic is applied in the page component by reading this action
        // via useEffect; the slice just marks the row dirty.
        state.isDirty = true;
      }
    },
  },
});

export const {
  rowsSet,
  rowsReset,
  rowUpdated,
  validationIssuesSet,
  selectedDocumentIdSet,
  isDirtySet,
  rowCascadeLoadingSet,
  listModalToggled,
  auditNotesModalToggled,
  deleteConfirmToggled,
  columnWidthSet,
  saveLoadingSet,
  saveErrorSet,
  rowAutofilled,
} = openingStockSlice.actions;

export const selectOpeningStockRows = (state: RootState) => state.openingStock.rows;
export const selectOpeningStockValidationIssues = (state: RootState) =>
  state.openingStock.validationIssues;
export const selectOpeningStockSelectedDocId = (state: RootState) =>
  state.openingStock.selectedDocumentId;
export const selectOpeningStockIsDirty = (state: RootState) => state.openingStock.isDirty;
export const selectOpeningStockRowCascadeLoading = (state: RootState) =>
  state.openingStock.rowCascadeLoading;
export const selectOpeningStockColumnWidths = (state: RootState) =>
  state.openingStock.columnWidths;
export const selectOpeningStockSaveLoading = (state: RootState) =>
  state.openingStock.saveLoading;
export const selectOpeningStockSaveError = (state: RootState) =>
  state.openingStock.saveError;

export default openingStockSlice.reducer;
