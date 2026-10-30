"use client";

/**
 * Ctrl+A — the attachments of a purchase document (Qt `PurchaseAttachDialog`,
 * NexERP 4c09536 ENT-26): the supplier's bill scan, damage photos, kept by the
 * server in `public.txn_attachment` (/txn-attachments). Add (PDF / JPEG / PNG /
 * WebP, at most 5 MB each), Open (in a new tab, else downloaded), Remove.
 *
 * Attachments hang on the document's id: an unsaved document (`docId` null)
 * says so and offers nothing. Keys: ↑ / ↓ pick a row, Enter opens it, Delete
 * removes it, Esc closes.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { confirm } from "@/lib/confirm";
import { formatDateTime } from "@/lib/date-format";
import {
  usePurchaseAttachmentDeleteMutation,
  usePurchaseAttachmentFileMutation,
  usePurchaseAttachmentListMutation,
  usePurchaseAttachmentUploadMutation,
  type TxnAttachment,
} from "../purchase-dialogs.api";
import type { PurchaseAttachDialogProps } from "../purchase-dialogs.types";
import { purchaseRefusalText } from "../purchase.format";
import styles from "./purchase-dialogs.module.scss";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const HINT = "The supplier's bill scan, damage photos — PDF, JPEG, PNG or WebP, at most 5 MB each.";

/** The server's MIME by extension (Qt `mimeOf`); "" = not a kind it takes. */
export function attachmentMimeOf(fileName: string, browserType = ""): string {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return byExtension[extension] ?? (Object.values(byExtension).includes(browserType) ? browserType : "");
}

/** 2.3 MB / 140 KB (Qt `sizeText`). */
export function attachmentSizeText(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.floor(bytes / 1024))} KB`;
}

function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function blobOf(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

export function PurchaseAttachDialog(props: PurchaseAttachDialogProps) {
  return props.open ? <OpenAttachDialog {...props} /> : null;
}

function OpenAttachDialog({ docType, docId, companyId, branchId, accYear, docLabel, readOnly, onClose, onChanged }: PurchaseAttachDialogProps) {
  const [rows, setRows] = useState<TxnAttachment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState(HINT);
  const [loading, setLoading] = useState(Boolean(docId));
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [list] = usePurchaseAttachmentListMutation();
  const [readFile] = usePurchaseAttachmentFileMutation();
  const [upload] = usePurchaseAttachmentUploadMutation();
  const [remove] = usePurchaseAttachmentDeleteMutation();
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  const load = useCallback(async () => {
    if (!docId) {
      return;
    }
    try {
      const loaded = await list({ docType, docId }).unwrap();
      setRows(loaded);
      setSelected((current) => (current && loaded.some((row) => row.tatId === current) ? current : (loaded[0]?.tatId ?? null)));
      onChangedRef.current?.(loaded.length);
    } catch (error) {
      setHint(purchaseRefusalText(error));
    } finally {
      setLoading(false);
    }
  }, [docId, docType, list]);

  // The first read: its answer lands in a callback, after the effect.
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const current = rows.find((row) => row.tatId === selected) ?? null;

  const addFiles = async (files: readonly File[]) => {
    if (!docId || readOnly) {
      return;
    }
    setWorking(true);
    let attached = 0;
    try {
      for (const file of files) {
        const mime = attachmentMimeOf(file.name, file.type);
        if (!mime) {
          setHint(`${file.name}: only PDF, JPEG, PNG or WebP.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setHint(`${file.name} is over 5 MB.`);
          continue;
        }
        setHint(`Attaching ${file.name}…`);
        try {
          const contentBase64 = await base64Of(file);
          await upload({ companyId, branchId, accYear, docType, docId, fileName: file.name, mime, contentBase64 }).unwrap();
          attached += 1;
          setHint("Attached.");
        } catch (error) {
          setHint(error instanceof Error && !("data" in error) ? `${file.name} could not be read.` : purchaseRefusalText(error));
        }
      }
    } finally {
      setWorking(false);
    }
    if (attached > 0) {
      await load();
    }
  };

  const openRow = async (row: TxnAttachment | null) => {
    if (!row) {
      return;
    }
    // Opened now, while the click still counts as the user's: a window opened
    // after the read would be blocked as a popup.
    const tab = window.open("", "_blank");
    setWorking(true);
    try {
      const file = await readFile({ tatId: row.tatId, accYear: row.accYear }).unwrap();
      const url = URL.createObjectURL(blobOf(file.contentBase64, file.mime));
      if (tab) {
        tab.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.fileName || row.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setHint(`Opened ${file.fileName || row.fileName}`);
    } catch (error) {
      tab?.close();
      setHint(purchaseRefusalText(error));
    } finally {
      setWorking(false);
    }
  };

  const removeRow = async (row: TxnAttachment | null) => {
    if (!row || readOnly) {
      return;
    }
    const sure = await confirm({
      title: "Remove attachment",
      message: `Remove ${row.fileName} from this document?`,
      confirmLabel: "Remove",
      iconVariant: "delete",
    });
    if (!sure) {
      return;
    }
    setWorking(true);
    try {
      await remove({ tatId: row.tatId, accYear: row.accYear }).unwrap();
      setHint(`Removed ${row.fileName}.`);
    } catch (error) {
      setHint(purchaseRefusalText(error));
    } finally {
      setWorking(false);
    }
    await load();
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const index = rows.findIndex((row) => row.tatId === selected);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        setSelected(next.tatId);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      void openRow(current);
    } else if (event.key === "Delete") {
      event.preventDefault();
      void removeRow(current);
    }
  };

  const footer = (
    <div className={styles.actions}>
      {docId && !readOnly ? (
        <button type="button" className={cx(quotationStyles.button, styles.actionsLeft)} disabled={working} onClick={() => fileRef.current?.click()}>
          Add…
        </button>
      ) : null}
      {docId ? (
        <button type="button" className={quotationStyles.button} disabled={working || !current} onClick={() => void openRow(current)}>
          Open · Enter
        </button>
      ) : null}
      {docId && !readOnly ? (
        <button type="button" className={quotationStyles.button} disabled={working || !current} onClick={() => void removeRow(current)}>
          Remove · Del
        </button>
      ) : null}
      <button type="button" className={quotationStyles.button} onClick={onClose}>
        Close · Esc
      </button>
    </div>
  );

  return (
    <ModalShell title={`Attachments — ${docLabel}`} isOpen fixedHeight panelClassName={styles.attachPanel} onClose={onClose} footer={footer}>
      <div className={styles.body}>
        {!docId ? (
          <p className={styles.hint}>Save the document first — attachments hang on its number.</p>
        ) : (
          <>
            <div
              className={cx(quotationStyles.gridViewport, styles.viewport)}
              tabIndex={0}
              autoFocus
              aria-label="Attachments"
              onKeyDown={onListKeyDown}
            >
              <table className={cx(quotationStyles.grid, styles.table)}>
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "46%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "24%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">File</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Size</th>
                    <th scope="col">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        {loading ? "Loading…" : "Nothing attached yet."}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((row, index) => (
                    <tr
                      key={row.tatId}
                      className={cx(index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven, row.tatId === selected && styles.selectedRow)}
                      aria-selected={row.tatId === selected}
                      onMouseDown={() => setSelected(row.tatId)}
                      onDoubleClick={() => void openRow(row)}
                    >
                      <td>
                        <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{row.pageNo}</div>
                      </td>
                      <td>
                        <div className={quotationStyles.cellText} title={row.fileName}>
                          {row.fileName}
                        </div>
                      </td>
                      <td>
                        <div className={quotationStyles.cellText}>{(row.mime.split("/").pop() ?? "").toUpperCase()}</div>
                      </td>
                      <td>
                        <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{attachmentSizeText(Number(row.size) || 0)}</div>
                      </td>
                      <td>
                        <div className={quotationStyles.cellText}>{formatDateTime(row.createdOn)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.hint}>{hint}</p>
            <input
              ref={fileRef}
              className={styles.fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addFiles(files);
              }}
            />
          </>
        )}
      </div>
    </ModalShell>
  );
}
