"use client";

/**
 * TEMPLATE tab -- identity, the page, and the version rail.
 *
 * Three sections filling three different parts of ONE request body, each
 * labelled with which. That is not decoration: `ptl*` is the design's IDENTITY
 * and survives every revision, while `versions[0].ptv*` describes THIS revision
 * and is frozen the moment it publishes. Editing a name and editing a margin are
 * not the same kind of act, and the labels are what makes that visible.
 *
 * Identity carries its own save (TRAP 4). `print_template` has no
 * `ptl_row_version`, so renaming through the full save is how a publish gets
 * silently reverted -- a separate button is the honest way to offer the cheap
 * operation.
 */

import PurposePicker from "../components/PurposePicker";
import VersionRail from "../components/VersionRail";
import type { DesignerController } from "../useDesigner";
import type { PrintPurposeRef, PrintTemplateVersionPayload } from "@/features/printing/types/printing";
import {
  PTV_ENGINE_VALUES,
  PTV_ORIENTATION_VALUES,
  type PtvEngine,
  type PtvOrientation,
} from "@/features/printing/types/printing";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

const MARGINS = [
  { side: "Top", key: "ptvMarginTopMm" },
  { side: "Bottom", key: "ptvMarginBottomMm" },
  { side: "Left", key: "ptvMarginLeftMm" },
  { side: "Right", key: "ptvMarginRightMm" },
] as const;

export default function TemplateTab({
  designer,
  purposes,
  compareWith,
  onCompare,
  onPublish,
}: {
  designer: DesignerController;
  purposes: PrintPurposeRef[];
  compareWith: PrintTemplateVersionPayload | null;
  onCompare: (version: PrintTemplateVersionPayload | null) => void;
  onPublish: () => void;
}) {
  const { draft, editable, patchDraft, patchWorking, workingStored } = designer;
  const working = draft.working;

  const revLabel = working.ptvId
    ? `rev ${workingStored?.ptvRevNo ?? "?"} · ${workingStored?.ptvStatus ?? "DRAFT"}`
    : draft.ptlId
      ? "new draft"
      : "rev 1 · DRAFT";

  return (
    <>
      <section className={styles.section}>
        <SectionHead title="Identity" table="print_template" slice="ptl*" />

        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Code</span>
            <input
              className={styles.input}
              value={draft.ptlCode}
              maxLength={60}
              placeholder="SALE_INVOICE_A4"
              data-uppercase="off"
              onChange={(event) => patchDraft({ ptlCode: event.target.value.trim() })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={draft.ptlName}
              maxLength={120}
              onChange={(event) => patchDraft({ ptlName: event.target.value })}
            />
          </label>

          <PurposePicker
            value={draft.ptlPurposeId}
            purposes={purposes}
            onChange={(ppoId) => patchDraft({ ptlPurposeId: ppoId })}
          />

          {/*
           * The ONLY scope column on a template. Branch, device and "is default"
           * are RESOLUTION questions and live on the assignment; a shipped
           * design belongs to no company and every company can use it.
           */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Owner</span>
            <select
              className={styles.select}
              value={draft.ptlCompanyId === null ? "shipped" : "company"}
              onChange={(event) =>
                patchDraft({
                  ptlCompanyId:
                    event.target.value === "shipped" ? null : designer.sessionCompanyId,
                })
              }
              disabled={!designer.sessionCompanyId && draft.ptlCompanyId === null}
            >
              <option value="company">This company</option>
              <option value="shipped">Shipped — every company</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Active</span>
            <span className={styles.checkRow}>
              <input
                type="checkbox"
                checked={draft.ptlIsActive}
                onChange={(event) => patchDraft({ ptlIsActive: event.target.checked })}
              />
              Yes
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cloned from</span>
            <input
              className={styles.input}
              value={
                draft.ptlForkedFromCode
                  ? `${draft.ptlForkedFromCode}${
                      draft.ptlForkedFromRev ? ` rev ${draft.ptlForkedFromRev}` : ""
                    }`
                  : "—"
              }
              disabled
            />
          </label>

          <label className={`${styles.field} ${styles.fieldSpan}`}>
            <span className={styles.fieldLabel}>Description</span>
            <input
              className={styles.input}
              value={draft.ptlDescription ?? ""}
              onChange={(event) => patchDraft({ ptlDescription: event.target.value || null })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sort order</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              value={draft.ptlSortOrder}
              onChange={(event) => patchDraft({ ptlSortOrder: Number(event.target.value) })}
            />
          </label>
        </div>

        {draft.ptlId ? (
          <Note
            action={
              <button
                type="button"
                className={styles.btn}
                disabled={designer.isSaving}
                onClick={() => void designer.saveIdentityOnly()}
              >
                Save details only
              </button>
            }
          >
            Sends <span className={styles.mono}>ptl*</span> alone, with no{" "}
            <span className={styles.mono}>versions</span> key — so a publish that happened while
            this was open cannot be reverted by a rename.
          </Note>
        ) : null}
      </section>

      <section className={styles.section}>
        <SectionHead
          title="The page"
          table="print_template_version"
          qualifier={revLabel}
          slice="versions[0].ptv*"
        />

        <div className={styles.grid3}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Engine</span>
            <select
              className={styles.select}
              value={working.ptvEngine}
              disabled={!editable}
              onChange={(event) => patchWorking({ ptvEngine: event.target.value as PtvEngine })}
            >
              {PTV_ENGINE_VALUES.map((engine) => (
                <option key={engine} value={engine}>
                  {engine}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Paper</span>
            <input
              className={styles.input}
              value={working.ptvPaperCode}
              maxLength={20}
              disabled={!editable}
              data-uppercase="off"
              onChange={(event) => patchWorking({ ptvPaperCode: event.target.value.trim() })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Orientation</span>
            <select
              className={styles.select}
              value={working.ptvOrientation}
              disabled={!editable}
              onChange={(event) =>
                patchWorking({ ptvOrientation: event.target.value as PtvOrientation })
              }
            >
              {PTV_ORIENTATION_VALUES.map((orientation) => (
                <option key={orientation} value={orientation}>
                  {orientation}
                </option>
              ))}
            </select>
          </label>

          {/* Four boxes that read as one control, in the schema's own order. */}
          <div className={`${styles.field} ${styles.fieldSpan}`}>
            <span className={styles.fieldLabel} title="Top, bottom, left, right">
              Margins mm
            </span>
            <span className={styles.marginGroup}>
              {MARGINS.map((margin) => (
                <input
                  key={margin.key}
                  className={`${styles.input} ${styles.marginBox}`}
                  type="number"
                  min={0}
                  title={margin.side}
                  value={working[margin.key]}
                  disabled={!editable}
                  onChange={(event) =>
                    patchWorking({ [margin.key]: Number(event.target.value) })
                  }
                />
              ))}
            </span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Language</span>
            <input
              className={styles.input}
              value={working.ptvLang}
              maxLength={5}
              disabled={!editable}
              data-uppercase="off"
              placeholder="en-IN"
              title="A default, not a resolution key — a render may override it. Language must never fork a template."
              onChange={(event) => patchWorking({ ptvLang: event.target.value.trim() })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Font</span>
            <input
              className={styles.input}
              value={working.ptvFontFamily ?? ""}
              maxLength={80}
              disabled={!editable}
              placeholder="Noto Sans"
              onChange={(event) => patchWorking({ ptvFontFamily: event.target.value || null })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Width mm</span>
            <input
              className={styles.input}
              type="number"
              value={working.ptvWidthMm ?? ""}
              disabled={!editable}
              placeholder="from the paper"
              onChange={(event) =>
                patchWorking({
                  ptvWidthMm: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Height mm</span>
            <input
              className={styles.input}
              type="number"
              value={working.ptvHeightMm ?? ""}
              disabled={!editable}
              placeholder="from the paper"
              onChange={(event) =>
                patchWorking({
                  ptvHeightMm: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Columns</span>
            <input
              className={styles.input}
              type="number"
              min={20}
              max={250}
              value={working.ptvColumns ?? ""}
              disabled={!editable}
              placeholder="text engines only"
              title="Characters per line. Meaningless for a page engine — leave it empty."
              onChange={(event) =>
                patchWorking({
                  ptvColumns: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>

          <label className={`${styles.field} ${styles.fieldSpan}`}>
            <span className={styles.fieldLabel}>Revision note</span>
            <input
              className={styles.input}
              value={working.ptvNote ?? ""}
              maxLength={250}
              disabled={!editable}
              placeholder="What changed in this revision"
              onChange={(event) => patchWorking({ ptvNote: event.target.value || null })}
            />
          </label>
        </div>
      </section>

      <VersionRail
        history={draft.history}
        publishedRevId={draft.publishedRevId}
        workingRevId={working.ptvId}
        isNewDraft={working.ptvId === undefined && !designer.isNew}
        isNewTemplate={designer.isNew}
        compareRevId={compareWith?.ptvId ?? null}
        onOpen={designer.openRevision}
        onNewDraft={designer.startNewDraft}
        onPublish={onPublish}
        onRollback={designer.startRollback}
        onCompare={onCompare}
      />

      {compareWith ? (
        <section className={styles.section}>
          <SectionHead
            title="Compare"
            qualifier={`rev ${compareWith.ptvRevNo} against what is open`}
            slice="read only"
          />
          <div className={styles.splitRow}>
            <div>
              <p className={styles.sectionNote}>rev {compareWith.ptvRevNo}</p>
              <textarea className={styles.textarea} readOnly value={compareWith.ptvBody} />
            </div>
            <div>
              <p className={styles.sectionNote}>
                {working.ptvId ? `rev ${workingStored?.ptvRevNo ?? "?"}` : "the draft being edited"}
              </p>
              <textarea
                className={styles.textarea}
                readOnly
                value={
                  typeof working.ptvBody === "string"
                    ? working.ptvBody
                    : JSON.stringify(working.ptvBody, null, 2)
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      {designer.isNew ? (
        <Note>
          On a NEW template the tab opens blank: no <span className={styles.mono}>ptlId</span>, no{" "}
          <span className={styles.mono}>ptvId</span>, and the one call creates the template and rev
          1 DRAFT together.
        </Note>
      ) : null}
    </>
  );
}
