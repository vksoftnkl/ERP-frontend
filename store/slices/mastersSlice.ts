import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export type MasterModuleState = {
  currentPage: number;
  pageSize: number;
  searchTerm: string;
  totalEntries: number;
};

export type MastersState = {
  modules: Record<string, MasterModuleState>;
};

const DEFAULT_MODULE_STATE: MasterModuleState = {
  currentPage: DEFAULT_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  searchTerm: "",
  totalEntries: 0,
};

function getOrInit(state: MastersState, moduleKey: string): MasterModuleState {
  if (!state.modules[moduleKey]) {
    state.modules[moduleKey] = { ...DEFAULT_MODULE_STATE };
  }
  return state.modules[moduleKey];
}

const mastersSlice = createSlice({
  name: "masters",
  initialState: { modules: {} } as MastersState,
  reducers: {
    pageChanged(state, action: PayloadAction<{ moduleKey: string; page: number }>) {
      const m = getOrInit(state, action.payload.moduleKey);
      m.currentPage = action.payload.page;
    },
    pageSizeChanged(state, action: PayloadAction<{ moduleKey: string; size: number }>) {
      const m = getOrInit(state, action.payload.moduleKey);
      m.pageSize = action.payload.size;
      m.currentPage = DEFAULT_PAGE;
    },
    searchChanged(state, action: PayloadAction<{ moduleKey: string; term: string }>) {
      const m = getOrInit(state, action.payload.moduleKey);
      m.searchTerm = action.payload.term;
      m.currentPage = DEFAULT_PAGE;
    },
    totalEntriesUpdated(
      state,
      action: PayloadAction<{ moduleKey: string; total: number; page?: number; pageSize?: number }>,
    ) {
      const m = getOrInit(state, action.payload.moduleKey);
      m.totalEntries = action.payload.total;
      if (action.payload.page !== undefined) m.currentPage = action.payload.page;
      if (action.payload.pageSize !== undefined) m.pageSize = action.payload.pageSize;
    },
    editModalOpened(
      state,
      action: PayloadAction<{ moduleKey: string; recordId: string | null }>,
    ) {
      const m = getOrInit(state, action.payload.moduleKey);
      (m as MasterModuleState & { editingRecordId?: string | null; isModalOpen?: boolean }).editingRecordId =
        action.payload.recordId;
      (m as MasterModuleState & { isModalOpen?: boolean }).isModalOpen = true;
    },
    editModalClosed(state, action: PayloadAction<{ moduleKey: string }>) {
      const m = state.modules[action.payload.moduleKey];
      if (m) {
        (m as MasterModuleState & { editingRecordId?: string | null; isModalOpen?: boolean }).editingRecordId =
          null;
        (m as MasterModuleState & { isModalOpen?: boolean }).isModalOpen = false;
      }
    },
    moduleStateReset(state, action: PayloadAction<string>) {
      delete state.modules[action.payload];
    },
  },
});

export const {
  pageChanged,
  pageSizeChanged,
  searchChanged,
  totalEntriesUpdated,
  editModalOpened,
  editModalClosed,
  moduleStateReset,
} = mastersSlice.actions;

export function selectMasterModule(
  state: RootState,
  moduleKey: string,
): MasterModuleState {
  return state.masters.modules[moduleKey] ?? DEFAULT_MODULE_STATE;
}

export default mastersSlice.reducer;
