"use client";

/**
 * Version history.
 *
 * Rollback is append-only on the server: restoring version 3 writes version 3's
 * body forward as version 9 rather than deleting 4 through 8. So "restore" is
 * safe to offer without a diff — nothing is lost, and the user can roll back the
 * rollback.
 */

import { useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { getApiErrorMessage } from "@/store/api";
import {
  useListPrintTemplateRevisionsQuery,
  useRollbackPrintTemplateMutation,
} from "@/features/print-designer/api/printTemplateApi";
import type { TemplatePayload } from "@/features/print-designer/types/template-definition";
import styles from "@/features/print-designer/components/designer.module.scss";

export type RevisionsDrawerProps = {
  open: boolean;
  templateId: string | null;
  currentVersion: number;
  onClose: () => void;
  onRestored: (template: TemplatePayload) => void;
};

const TIMESTAMP = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

export function RevisionsDrawer({
  open,
  templateId,
  currentVersion,
  onClose,
  onRestored,
}: RevisionsDrawerProps) {
  const { data, isFetching, error } = useListPrintTemplateRevisionsQuery(templateId ?? "", {
    skip: !open || !templateId,
  });
  const [rollback, { isLoading }] = useRollbackPrintTemplateMutation();
  const [confirming, setConfirming] = useState<number | null>(null);

  if (!open) {
    return null;
  }

  const restore = async (version: number) => {
    if (!templateId) {
      return;
    }
    try {
      const restored = await rollback({ ptId: templateId, version }).unwrap();
      onRestored(restored);
      onClose();
    } finally {
      setConfirming(null);
    }
  };

  return (
    <ModalPortal>
      <div className={`${styles.overlayTokens} ${styles.backdrop}`} onClick={onClose} />
      <div className={`${styles.overlayTokens} ${styles.dialogLayer}`}>
        <aside className={styles.drawer} data-uppercase="off">
          <header className={styles.dialogHead}>
            <span>Version history</span>
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Close
            </button>
          </header>

          <div className={styles.panelScroll}>
            {isFetching ? <p className={styles.emptyPanel}>Loading…</p> : null}
            {error ? <p className={styles.issueLine}>{getApiErrorMessage(error)}</p> : null}
            {data?.length === 0 ? (
              <p className={styles.emptyPanel}>
                No archived versions yet. One is written every time a definition is saved.
              </p>
            ) : null}

            {(data ?? []).map((revision) => (
              <div key={revision.ptrId} className={styles.listRow}>
                <div className={styles.listRowMain}>
                  <span>{`Version ${revision.ptrVersion}`}</span>
                  <span className={styles.listRowMeta}>
                    {`${formatTimestamp(revision.ptrCreatedOn)}${revision.ptrNote ? ` · ${revision.ptrNote}` : ""}`}
                  </span>
                </div>
                <span className={styles.spacer} />
                {revision.ptrVersion === currentVersion ? (
                  <span className={styles.badge}>current</span>
                ) : confirming === revision.ptrVersion ? (
                  <>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      disabled={isLoading}
                      onClick={() => void restore(revision.ptrVersion)}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setConfirming(revision.ptrVersion)}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>

          <footer className={styles.dialogFoot}>
            <span className={styles.listRowMeta}>
              Restoring writes the old body forward as a new version; nothing is deleted.
            </span>
          </footer>
        </aside>
      </div>
    </ModalPortal>
  );
}

export default RevisionsDrawer;
