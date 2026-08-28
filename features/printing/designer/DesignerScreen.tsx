"use client";

/**
 * The Print Designer: three tabs, ONE save.
 *
 * The tabs are a reading convenience, not three forms. Everything on them is
 * two halves of a single request body -- the `ptl*` identity and one entry of
 * `versions[]` -- and every section is labelled with the slice it fills so that
 * stays visible. `useDesigner` owns the state and assembles the payload; nothing
 * in `tabs/` posts anything.
 *
 * There is no separate create screen either. "New template" opens this blank: no
 * `ptlId`, no `ptvId`, and the one call creates the template and revision 1
 * together.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useGetCompanyListQuery } from "@/store/api/businessContextApi";
import { useListPrintingTemplatesQuery } from "@/features/printing/api/templates";
import { useListPrintingAssignmentsQuery } from "@/features/printing/api/assignments";
import { collectPurposes } from "@/features/printing/domain/purposes";
import {
  PRINTING_TEMPLATES_ROUTE,
  printingAssignmentsForTemplateRoute,
} from "@/features/printing/routes";
import type { PrintTemplateVersionPayload } from "@/features/printing/types/printing";
import DataTab from "./tabs/DataTab";
import LayoutTab from "./tabs/LayoutTab";
import TemplateTab from "./tabs/TemplateTab";
import { useDesigner, type DesignerTab } from "./useDesigner";
import { Chip, Note, ScreenShell } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

const TABS: { id: DesignerTab; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "layout", label: "Layout" },
  { id: "data", label: "Data" },
];

export default function DesignerScreen({ ptlId }: { ptlId: string | null }) {
  const router = useRouter();
  const designer = useDesigner(ptlId);
  const { draft, editable, workingStored } = designer;

  const [approver, setApprover] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [compareWith, setCompareWith] = useState<PrintTemplateVersionPayload | null>(null);

  const { data: companies = [] } = useGetCompanyListQuery();
  const companyName =
    draft.ptlCompanyId === null
      ? "Shipped"
      : (companies.find((company) => company.id === draft.ptlCompanyId)?.name ?? null);

  /*
   * The purpose list, from the purposes something already refers to -- this only
   * needs each row's joined purpose columns. `includeVersions: false` asks for
   * the light pick list and is DROPPED in transit, because a query boolean
   * cannot express false (see `toParams`); the intent is right and it starts
   * working when the server stops coercing.
   */
  const { data: templatePage } = useListPrintingTemplatesQuery({
    limit: 100,
    includeVersions: false,
  });
  const { data: assignmentPage } = useListPrintingAssignmentsQuery({ limit: 100 });
  const purposes = useMemo(
    () =>
      collectPurposes({
        templates: templatePage?.items ?? [],
        assignments: assignmentPage?.items ?? [],
      }),
    [templatePage, assignmentPage],
  );

  /** How widely this design is used — the question a designer has before changing it. */
  const usedBy = (assignmentPage?.items ?? []).filter(
    (assignment) => assignment.ptaTemplateId === draft.ptlId,
  );

  if (designer.isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <p className={styles.muted}>Loading the design…</p>
        </div>
      </div>
    );
  }

  const canSave =
    editable &&
    draft.ptlName.trim() !== "" &&
    draft.ptlCode.trim() !== "" &&
    draft.ptlPurposeId !== "";

  const publishedRevNo =
    draft.history.find((version) => version.ptvId === draft.publishedRevId)?.ptvRevNo ?? null;

  return (
    <ScreenShell
      title="Print Designer"
      subtitle={[
        designer.isNew ? "New template" : draft.ptlName || "Print template",
        companyName,
      ]}
      tabs={TABS}
      activeTab={designer.tab}
      onTabChange={designer.setTab}
      footerNote={
        designer.dirty ? "Unsaved changes" : editable ? null : "This revision is read-only"
      }
      footer={
        <>
          <button
            type="button"
            className={styles.btn}
            onClick={() => router.push(PRINTING_TEMPLATES_ROUTE)}
          >
            Close
          </button>
          {editable ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!canSave || designer.isSaving}
              onClick={() => void designer.save()}
              title="Identity, the page, the layout, the datasets and the prompts — one request"
            >
              {designer.isSaving ? "Saving…" : "Save"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={designer.startNewDraft}
            >
              New draft from this
            </button>
          )}
        </>
      }
    >
      {/* The state chips: what is open, what prints, and where the save goes. */}
      <div className={styles.chipRow}>
        <Chip tone={editable ? "amber" : "green"}>
          {workingStored
            ? `${editable ? "editing" : "reading"} rev ${workingStored.ptvRevNo} · ${workingStored.ptvStatus}`
            : designer.isNew
              ? "new template · rev 1 DRAFT"
              : "new draft · unsaved"}
        </Chip>
        {publishedRevNo !== null ? (
          <Chip tone="green" title="The revision a render actually uses">
            published: rev {publishedRevNo}
          </Chip>
        ) : (
          <Chip tone="red" title="No counter can print this, whatever the assignments say">
            publishes nothing
          </Chip>
        )}
        {draft.ptlId && usedBy.length > 0 ? (
          <Link
            href={printingAssignmentsForTemplateRoute(draft.ptlId)}
            className={`${styles.chip} ${styles.chipBlue}`}
            title="Which branches and counters are set to use this design"
          >
            used by {usedBy.length} assignment{usedBy.length === 1 ? "" : "s"} ↗
          </Link>
        ) : draft.ptlId ? (
          <Chip>not assigned to any branch or counter</Chip>
        ) : null}
        {draft.ptlForkedFromCode ? (
          <Chip title={`${draft.ptlForkedFromCode} rev ${draft.ptlForkedFromRev ?? "?"}`}>
            cloned from {draft.ptlForkedFromCode}
          </Chip>
        ) : null}
        <Chip mono>one save · POST /print-templates/create</Chip>
      </div>

      {designer.readError ? (
        <Note
          tone="red"
          action={
            <button type="button" className={styles.btn} onClick={() => void designer.refetch()}>
              Try again
            </button>
          }
        >
          {designer.readError}
        </Note>
      ) : null}

      {/* The loud state: a design that resolves for nobody. */}
      {!designer.isNew && draft.publishedRevId === null ? (
        <Note tone="amber">
          Nothing is published, so this design resolves for nobody — no counter can print it,
          whatever the assignments say. Publish a revision to make it printable.
        </Note>
      ) : null}

      {publishing ? (
        <section className={styles.section}>
          <div className={styles.toolbar}>
            <label className={styles.fieldInline}>
              <span className={styles.fieldLabel}>Approved by</span>
              <input
                className={styles.input}
                value={approver}
                placeholder="user id — 019e7281-…"
                data-uppercase="off"
                onChange={(event) => setApprover(event.target.value.trim())}
              />
            </label>
            {/*
             * RULE 6. `ck_ptv_published` refuses a null signature, and the
             * signature is captured DELIBERATELY. Defaulting it to the session
             * user would make it mean nothing — so the session id is offered as
             * a click, not as a prefilled value.
             */}
            {designer.sessionUserId ? (
              <button
                type="button"
                className={styles.link}
                onClick={() => setApprover(designer.sessionUserId ?? "")}
              >
                Sign as me
              </button>
            ) : null}
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!approver || designer.isSaving}
              onClick={() => {
                void designer.publish(approver).then(() => setPublishing(false));
              }}
            >
              Publish revision
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setPublishing(false)}
            >
              Cancel
            </button>
          </div>
          <Note tone="amber">
            A revision whose datasets carry stored SQL is, in every meaningful sense, code — so
            publishing takes a signature. Publishing moves{" "}
            <span className={styles.mono}>ptl_published_rev_id</span> to this revision and freezes
            it.
          </Note>
        </section>
      ) : null}

      {designer.tab === "template" ? (
        <TemplateTab
          designer={designer}
          purposes={purposes}
          compareWith={compareWith}
          onCompare={setCompareWith}
          onPublish={() => setPublishing(true)}
        />
      ) : null}
      {designer.tab === "layout" ? <LayoutTab designer={designer} /> : null}
      {designer.tab === "data" ? <DataTab designer={designer} /> : null}
    </ScreenShell>
  );
}
