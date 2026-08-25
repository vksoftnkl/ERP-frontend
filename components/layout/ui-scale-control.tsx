"use client";

/**
 * Header control for the interface size.
 *
 * `Auto` — the default — sizes the application from the screen. The fixed
 * percentages are the escape hatch for the cases the formula cannot see: a
 * user sitting further from a wall-mounted screen, a shared terminal whose
 * operator wants more rows than the automatic scale gives, an unusual DPI. The
 * choice is stored per browser, so it follows the machine rather than the login.
 */

import { useCallback, useEffect, useState } from "react";

import {
  UI_SCALE_PREFERENCE_EVENT,
  UI_SCALE_PRESETS,
  readUiScalePreference,
  writeUiScalePreference,
  type UiScalePreference,
} from "@/lib/ui-scale";

import styles from "./erp-header.module.css";

const AUTO_VALUE = "auto";

export default function UiScaleControl() {
  // Starts on `auto` so the server-rendered markup and the first client render
  // agree; the stored preference is adopted immediately afterwards.
  const [preference, setPreference] = useState<UiScalePreference>(AUTO_VALUE);

  useEffect(() => {
    const adopt = () => setPreference(readUiScalePreference());
    adopt();
    window.addEventListener(UI_SCALE_PREFERENCE_EVENT, adopt);
    window.addEventListener("storage", adopt);
    return () => {
      window.removeEventListener(UI_SCALE_PREFERENCE_EVENT, adopt);
      window.removeEventListener("storage", adopt);
    };
  }, []);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next: UiScalePreference =
      event.target.value === AUTO_VALUE ? AUTO_VALUE : Number(event.target.value);
    setPreference(next);
    // The controller listens for this and re-applies; it also persists here so
    // the next page load starts at the chosen size.
    writeUiScalePreference(next);
  }, []);

  return (
    <select
      className={`${styles.contextSelect} ${styles.uiScaleSelect}`}
      value={preference === AUTO_VALUE ? AUTO_VALUE : String(preference)}
      onChange={handleChange}
      aria-label="Interface size"
      title="Interface size"
    >
      <option value={AUTO_VALUE}>Size: Auto</option>
      {UI_SCALE_PRESETS.map((scale) => (
        <option key={scale} value={String(scale)}>
          {Math.round(scale * 100)}%
        </option>
      ))}
    </select>
  );
}
