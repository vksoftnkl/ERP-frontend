import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import type { AppSettingDataType, EffectiveSetting } from "@/features/settings/app-settings/types";
import { parseBool } from "@/features/settings/app-settings/lib/value-text";

/**
 * The settings the RUNNING app is under — the resolved answer for this session,
 * not the catalog and not any one layer of it.
 *
 * It exists so saving does not require a re-login. The Qt screen wrote the
 * override, re-read its own list and stopped, so every setting needed a
 * sign-out — including the ones the catalog marks `asdNeedsRelogin: false` —
 * while the success message implied otherwise. Here the screen re-reads the
 * SESSION's own effective settings after a save and pushes them in, and only
 * the settings that really do need a sign-in are named as needing one.
 *
 * Values are kept as the text the column holds, with their data type beside
 * them, so a reader casts the same way `fn_app_settings` does.
 */
export type AppSettingsState = {
  values: Record<string, string | null>;
  types: Record<string, AppSettingDataType>;
  loaded: boolean;
};

const initialState: AppSettingsState = {
  values: {},
  types: {},
  loaded: false,
};

const appSettingsSlice = createSlice({
  name: "appSettings",
  initialState,
  reducers: {
    /**
     * Replace, never merge. Applying only writes the keys it is given, so a
     * just-reset override would otherwise linger as the value nobody set any
     * more — the reset has to be visible as a return to the layer above.
     */
    appSettingsApplied(state, action: PayloadAction<EffectiveSetting[]>) {
      state.values = {};
      state.types = {};
      for (const setting of action.payload) {
        state.values[setting.asdKey] = setting.value;
        state.types[setting.asdKey] = setting.asdDataType;
      }
      state.loaded = true;
    },
    appSettingsCleared() {
      return initialState;
    },
  },
});

export const { appSettingsApplied, appSettingsCleared } = appSettingsSlice.actions;

export function selectAppSettingsLoaded(state: RootState): boolean {
  return state.appSettings.loaded;
}

/** The stored text, exactly as the column holds it. */
export function selectAppSettingText(
  state: RootState,
  key: string,
): string | null {
  return state.appSettings.values[key] ?? null;
}

export function selectAppSettingBool(state: RootState, key: string, fallback = false): boolean {
  const text = state.appSettings.values[key];
  return text === undefined || text === null ? fallback : parseBool(text);
}

export function selectAppSettingNumber(
  state: RootState,
  key: string,
  fallback: number,
): number {
  const text = state.appSettings.values[key];
  if (text === undefined || text === null || !text.trim()) {
    return fallback;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export default appSettingsSlice.reducer;
