"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import styles from "./price-level-configuration.module.scss";
// Settings -> Configuration -> Price Level Configuration.
// Loads data from GET /price-level-masters/get and saves via PATCH /price-level-masters/bulk
// with the full row set (priceLvlId, priceLvlName, priceLvlShort, priceLvlIsActive).
const PRICE_LEVEL_GET_ENDPOINT = "/price-level-masters/get";
const PRICE_LEVEL_SAVE_ENDPOINT = "/price-level-masters/bulk";
type PriceLevelRow = {
  priceLvlId: number;
  priceLvlName: string;
  priceLvlShort: string;
  priceLvlIsActive: boolean;
  priceLvlIsAdmin: boolean;
};
type EditableField = "priceLvlName" | "priceLvlShort";
type FlagField = "priceLvlIsActive" | "priceLvlIsAdmin";
type PriceLevelApiItem = {
  priceLvlId?: number | string | null;
  priceLvlName?: string | null;
  priceLvlShort?: string | null;
  priceLvlIsActive?: boolean | null;
  priceLvlIsAdmin?: boolean | null;
};
type PriceLevelListResponse = { data?: PriceLevelApiItem[] | null };
type SavePayload = {
  priceLevels: Array<{
    priceLvlId: number;
    priceLvlName: string;
    priceLvlShort: string;
    priceLvlIsActive: boolean;
    priceLvlIsAdmin: boolean;
  }>;
};
function extractItems(response: PriceLevelListResponse | undefined): PriceLevelApiItem[] {
  const data = response?.data;
  return Array.isArray(data) ? data : [];
}
// Map API items to grid rows; the grid shows only editable fields.
function toRows(items: PriceLevelApiItem[]): PriceLevelRow[] {
  const rows: PriceLevelRow[] = [];
  for (const item of items) {
    const id = Number(item.priceLvlId);
    if (!Number.isFinite(id)) {
      continue;
    }
    rows.push({
      priceLvlId: id,
      priceLvlName: item.priceLvlName ?? "",
      priceLvlShort: item.priceLvlShort ?? "",
      priceLvlIsActive: Boolean(item.priceLvlIsActive),
      priceLvlIsAdmin: Boolean(item.priceLvlIsAdmin),
    });
  }
  return rows;
}
export default function PriceLevelConfigurationPage() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PriceLevelRow[]>([]);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const { getAll: getPriceLevels } = useApi<PriceLevelListResponse>(PRICE_LEVEL_GET_ENDPOINT, {
    toast: { error: false },
  });
  const { run: savePriceLevels } = useApi<unknown, SavePayload>(PRICE_LEVEL_SAVE_ENDPOINT, {
    method: "PATCH",
  });
  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getPriceLevels();
      const items = extractItems(response);
      setRows(toRows(items));
    } finally {
      setLoading(false);
    }
  }, [getPriceLevels]);
  // (Re)load whenever the popup opens — from the mount auto-open or the launch card.
  useEffect(() => {
    if (open) {
      void loadRows();
    }
  }, [open, loadRows]);
  // Esc closes the popup.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
  const setField = useCallback((id: number, field: EditableField, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.priceLvlId === id ? { ...row, [field]: value } : row)),
    );
  }, []);
  const toggleFlag = useCallback((id: number, field: FlagField) => {
    setRows((prev) =>
      prev.map((row) => (row.priceLvlId === id ? { ...row, [field]: !row[field] } : row)),
    );
  }, []);
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await savePriceLevels({
        body: { priceLevels: rows },
      });
    } catch {
      // useApi toasts the error; keep the popup open so the user can retry.
    } finally {
      setSaving(false);
    }
  }, [rows, savePriceLevels]);
  return (
    <div className={styles.page}>
      {!open ? (
        <div className={styles.launchCard}>
          <h1 className={styles.launchTitle}>Price Level Configuration</h1>
          <p className={styles.launchText}>
            Configure the pricing tiers — edit names and toggle the Active / Admin flags.
          </p>
          <button
            type="button"
            className={styles.launchButton}
            onClick={() => setOpen(true)}
          >
            Open Price Level
          </button>
        </div>
      ) : (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Price Level">
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close Price Level"
            onClick={() => setOpen(false)}
          />
          <div ref={modalRef} className={styles.modal}>
            <div className={styles.header}>
              <h2 className={styles.title}>Price Level</h2>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.body}>
              <div className={styles.gridWrap}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.levelHead}>Level Name</th>
                      <th>Short Name</th>
                      <th>Active</th>
                      <th>Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className={styles.stateRow} colSpan={4}>
                          Loading price levels…
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td className={styles.stateRow} colSpan={4}>
                          No price levels found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.priceLvlId}>
                          <td>
                            <input
                              className={styles.cellInput}
                              value={row.priceLvlName}
                              aria-label={`Level name for row ${row.priceLvlId}`}
                              onChange={(event) =>
                                setField(row.priceLvlId, "priceLvlName", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className={`${styles.cellInput} ${styles.shortInput}`}
                              value={row.priceLvlShort}
                              aria-label={`Short name for ${row.priceLvlName || row.priceLvlId}`}
                              onChange={(event) =>
                                setField(row.priceLvlId, "priceLvlShort", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.flagButton} ${
                                row.priceLvlIsActive ? styles.flagYes : styles.flagNo
                              }`}
                              aria-pressed={row.priceLvlIsActive}
                              aria-label={`Active for ${row.priceLvlName || row.priceLvlId}`}
                              onClick={() => toggleFlag(row.priceLvlId, "priceLvlIsActive")}
                            >
                              {row.priceLvlIsActive ? "Y" : "N"}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.flagButton} ${
                                row.priceLvlIsAdmin ? styles.flagYes : styles.flagNo
                              }`}
                              aria-pressed={row.priceLvlIsAdmin}
                              aria-label={`Admin for ${row.priceLvlName || row.priceLvlId}`}
                              onClick={() => toggleFlag(row.priceLvlId, "priceLvlIsAdmin")}
                            >
                              {row.priceLvlIsAdmin ? "Y" : "N"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saving || loading}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
