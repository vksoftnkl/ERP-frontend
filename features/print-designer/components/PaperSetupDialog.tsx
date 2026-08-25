"use client";

/**
 * The four questions a new template cannot start without.
 *
 * Paper is asked before anything is drawn because it decides the LAYOUT MODE,
 * and layout mode decides what the canvas even is — a millimetre sheet or a
 * character grid. Asking afterwards would mean rewriting every coordinate the
 * user had already placed.
 *
 * The document type list comes from the registered providers' `docTypes`, so it
 * can only offer document types the engine has data for; free text stays
 * available for a doc type whose provider ships later.
 */

import { useMemo, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { PAPER_PRESETS, defaultOutputModeForPaper } from "@/features/print-designer/lib/vocabulary";
import {
  useGetPrintDatasetsQuery,
  useGetPrintTemplateSchemaQuery,
} from "@/features/print-designer/api/printTemplateApi";
import styles from "@/features/print-designer/components/designer.module.scss";

export type PaperSetupResult = {
  name: string;
  docType: string;
  paperCode: string;
  outputMode: string;
};

export type PaperSetupDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: PaperSetupResult) => void;
};

export function PaperSetupDialog({ open, onClose, onConfirm }: PaperSetupDialogProps) {
  const { data: vocabulary } = useGetPrintTemplateSchemaQuery(undefined, { skip: !open });
  const { data: providers } = useGetPrintDatasetsQuery(undefined, { skip: !open });

  const presets = vocabulary?.papers ?? PAPER_PRESETS;

  const [name, setName] = useState("");
  const [docType, setDocType] = useState("SALE_INVOICE");
  const [paperCode, setPaperCode] = useState("A4");

  const preset = useMemo(
    () => presets.find((entry) => entry.code === paperCode) ?? presets[0],
    [paperCode, presets],
  );

  const [modeOverride, setModeOverride] = useState<string | null>(null);
  const outputMode = modeOverride ?? (preset ? defaultOutputModeForPaper(preset) : "PDF");

  const docTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const provider of providers ?? []) {
      for (const type of provider.docTypes) {
        seen.add(type);
      }
    }
    return [...seen].sort();
  }, [providers]);

  if (!open) {
    return null;
  }

  const confirm = () => {
    if (!name.trim() || !docType.trim() || !preset) {
      return;
    }
    onConfirm({
      name: name.trim(),
      docType: docType.trim().toUpperCase(),
      paperCode: preset.code,
      outputMode,
    });
  };

  return (
    <ModalPortal>
      <div className={`${styles.overlayTokens} ${styles.backdrop}`} onClick={onClose} />
      <div className={`${styles.overlayTokens} ${styles.dialogLayer}`}>
        <div className={`${styles.dialog} ${styles.dialogNarrow}`} data-uppercase="off">
          <header className={styles.dialogHead}>
            <span>New print template</span>
          </header>

          <div className={styles.dialogBody}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={name}
                autoFocus
                placeholder="GST invoice A4"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Document type</span>
              <input
                className={styles.input}
                list="print-designer-doc-types"
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
              />
              <datalist id="print-designer-doc-types">
                {docTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Paper</span>
              <select
                className={styles.input}
                value={paperCode}
                onChange={(event) => {
                  setPaperCode(event.target.value);
                  // The paper decides the mode; an override only survives while
                  // the same paper is selected.
                  setModeOverride(null);
                }}
              >
                {presets.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Output mode</span>
              <select
                className={styles.input}
                value={outputMode}
                onChange={(event) => setModeOverride(event.target.value)}
              >
                {(vocabulary?.outputModes ?? ["PDF", "ESCPOS", "ESCP_DOTMATRIX", "HTML"]).map(
                  (mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ),
                )}
              </select>
            </div>

            <p className={styles.listRowMeta}>
              {preset?.layoutMode === "GRID"
                ? `${preset.columns ?? "?"} character columns. The canvas will be a character grid, not a millimetre sheet.`
                : `${preset?.widthMm ?? 0}mm wide. Millimetre canvas.`}
            </p>
          </div>

          <footer className={styles.dialogFoot}>
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={!name.trim() || !docType.trim()}
              onClick={confirm}
            >
              Start designing
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

export default PaperSetupDialog;
