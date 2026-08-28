"use client";

/**
 * VERSION RAIL -- the revision history, as a table under The Page.
 *
 * Append-only, and a rollback WRITES FORWARD. The four buttons are the only
 * moves there are, and each is decided by two derived server fields --
 * `ptvIsEditable` (DRAFT and nothing else) and whether the row is the one
 * `ptl_published_rev_id` names. Neither is recomputed here.
 *
 * A PUBLISHED revision offers exactly one move: NEW DRAFT. It is never editable,
 * because `plg_version_id` is a real reference to the exact bytes that were
 * rendered, and letting someone type into a published row would make that
 * reference a lie. The database has no trigger to stop that edit; this screen is
 * the enforcement.
 */

import type { PrintTemplateVersionPayload } from "@/features/printing/types/printing";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : WHEN.format(parsed).replace(",", "");
}

/** A uuid actor column with no name join; show enough to recognise, not a wall. */
function actor(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 8 ? value.slice(0, 8) : value;
}

export default function VersionRail({
  history,
  publishedRevId,
  workingRevId,
  isNewDraft,
  isNewTemplate,
  compareRevId,
  onOpen,
  onNewDraft,
  onPublish,
  onRollback,
  onCompare,
}: {
  history: PrintTemplateVersionPayload[];
  publishedRevId: string | null;
  workingRevId: string | undefined;
  /** True while the tabs hold an unwritten revision, which is not in the history. */
  isNewDraft: boolean;
  isNewTemplate: boolean;
  compareRevId: string | null;
  onOpen: (version: PrintTemplateVersionPayload) => void;
  onNewDraft: () => void;
  onPublish: () => void;
  onRollback: (version: PrintTemplateVersionPayload) => void;
  onCompare: (version: PrintTemplateVersionPayload | null) => void;
}) {
  const ordered = [...history].sort((left, right) => right.ptvRevNo - left.ptvRevNo);
  const selected = ordered.find((version) => version.ptvId === workingRevId) ?? null;
  const publishedIsWorking = selected !== null && selected.ptvId === publishedRevId;

  return (
    <section className={styles.section}>
      <SectionHead
        title="Version rail"
        qualifier="append-only; a rollback writes forward"
        slice="versions[]"
      />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btn}
          disabled={isNewDraft || isNewTemplate}
          title={
            isNewDraft
              ? "Already on an unsaved draft"
              : "Copies this revision — body and datasets — into a new one"
          }
          onClick={onNewDraft}
        >
          New draft
        </button>
        <button type="button" className={styles.btn} onClick={onPublish}>
          Publish…
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!selected || publishedIsWorking || publishedRevId === null}
          title={
            publishedRevId === null
              ? "Nothing is published yet, so there is nothing to roll back from"
              : "Copies this revision into a new draft; publishing it rolls back, and the history stays intact"
          }
          onClick={() => selected && onRollback(selected)}
        >
          Roll back to
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!selected && compareRevId === null}
          onClick={() => onCompare(compareRevId ? null : selected)}
        >
          {compareRevId ? "Stop comparing" : "Compare"}
        </button>

        <span className={styles.toolbarRight}>
          <span className={styles.muted}>
            Publish is a FIELD in the same body —{" "}
            <span className={styles.mono}>ptvStatus + ptvApprovedBy</span> — not a second call.
          </span>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colNum}>Rev</th>
              <th className={styles.colSmall}>Status</th>
              <th className={styles.colSmall}>Created</th>
              <th className={styles.colTiny}>By</th>
              <th className={styles.colTiny}>Approved by</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {isNewDraft ? (
              <tr className={styles.rowSelected}>
                <td className={styles.muted}>next</td>
                <td>
                  <span className={`${styles.pill} ${styles.pillDraft}`}>UNSAVED</span>
                </td>
                <td className={styles.muted}>—</td>
                <td className={styles.muted}>—</td>
                <td className={styles.muted}>—</td>
                <td className={styles.muted}>
                  Saving writes the next revision number. The one it came from is untouched.
                </td>
              </tr>
            ) : null}

            {ordered.map((version) => {
              const isWorking = !isNewDraft && version.ptvId === workingRevId;
              const isPublished = publishedRevId !== null && version.ptvId === publishedRevId;

              return (
                <tr
                  key={version.ptvId}
                  className={[
                    styles.rowClickable,
                    isPublished ? styles.rowPublished : "",
                    isWorking ? styles.rowSelected : "",
                    version.ptvId === compareRevId ? styles.rowWarning : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onOpen(version)}
                >
                  <td>{version.ptvRevNo}</td>
                  <td>
                    <span
                      className={`${styles.pill} ${
                        isPublished
                          ? styles.pillPublished
                          : version.ptvStatus === "DRAFT"
                            ? styles.pillDraft
                            : ""
                      }`}
                      title={isPublished ? "The revision a render actually uses" : undefined}
                    >
                      {version.ptvStatus}
                    </span>
                  </td>
                  <td>{when(version.ptvCreatedOn)}</td>
                  <td className={styles.mono}>{actor(version.ptvCreatedBy)}</td>
                  <td className={styles.mono}>{actor(version.ptvApprovedBy)}</td>
                  <td className={styles.muted}>{version.ptvNote ?? "—"}</td>
                </tr>
              );
            })}

            {ordered.length === 0 && !isNewDraft ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No revisions yet. Saving writes revision 1 as a draft.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Note tone="red">
        A PUBLISHED revision is READ-ONLY on this screen — the only action on one is New draft. The
        database has no trigger to stop an edit; this screen is the enforcement.
      </Note>
    </section>
  );
}
