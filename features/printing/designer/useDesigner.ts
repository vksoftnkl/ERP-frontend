"use client";

/**
 * The Designer's whole state, and the only place a save is assembled.
 *
 * ONE SCREEN, ONE SAVE. The three tabs are a reading convenience over two
 * halves of a single request body -- the `ptl*` identity and one entry of
 * `versions[]` -- and this hook is what keeps that true. A component that
 * posted its own tab would be a second, rival idea of what the design is.
 *
 * Every rule the database does not enforce is applied here by calling into
 * `domain/`. Nothing in `tabs/` or `components/` decides whether something may
 * be edited, published or renumbered; they ask.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectBusinessContext } from "@/store/slices/authSlice";
import {
  useGetPrintingTemplateQuery,
  useSavePrintingTemplateMutation,
} from "@/features/printing/api/templates";
import {
  buildIdentitySavePayload,
  buildPublishPayload,
  buildSavePayload,
} from "@/features/printing/domain/buildSavePayload";
import {
  blankDraft,
  checkPublishable,
  isEditable,
  newDraftFrom,
  rollbackTo,
  toDesignerDraft,
  toDraftVersion,
  type DesignerDraft,
  type DraftDataset,
  type DraftVersion,
} from "@/features/printing/domain/draft";
import { printingDesignerRoute } from "@/features/printing/routes";
import type { PrintTemplateVersionPayload } from "@/features/printing/types/printing";

export type DesignerTab = "template" | "layout" | "data";

export function useDesigner(
  ptlId: string | null,
  /**
   * Open this revision rather than the newest one.
   *
   * The canvas is a separate route, so the version rail's selection does not
   * survive the navigation -- without this it would re-derive the newest
   * revision and silently edit something other than what the operator was
   * looking at, including opening a published revision as editable.
   */
  preferRevId?: string | null,
) {
  const router = useRouter();
  const businessContext = useAppSelector(selectBusinessContext);
  const sessionUserId = useAppSelector(selectAuthUserId);

  const { data, isLoading, isFetching, error, refetch } = useGetPrintingTemplateQuery(ptlId ?? "", {
    skip: !ptlId,
  });
  const [saveTemplate, { isLoading: isSaving }] = useSavePrintingTemplateMutation();

  const [tab, setTab] = useState<DesignerTab>("template");
  const [draft, setDraft] = useState<DesignerDraft>(() => blankDraft());
  const [dirty, setDirty] = useState(false);

  /*
   * The draft is adopted from the server ONCE per load, and re-adopted only
   * when the server's version of the template actually changes identity or
   * revision. Re-seeding on every `data` reference would throw away whatever
   * has been typed the moment any cache invalidation fires.
   */
  const adoptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const stamp = `${data.ptlId}:${data.ptlModifiedOn ?? ""}:${data.versions?.length ?? 0}:${
      data.ptlPublishedRevId ?? ""
    }:${preferRevId ?? ""}`;
    if (adoptedRef.current === stamp) return;
    adoptedRef.current = stamp;

    const adopted = toDesignerDraft(data);
    const preferred = preferRevId
      ? adopted.history.find((version) => version.ptvId === preferRevId)
      : undefined;
    setDraft(preferred ? { ...adopted, working: toDraftVersion(preferred) } : adopted);
    setDirty(false);
  }, [data, preferRevId]);

  /*
   * A brand new template opens blank and belongs to the company in context --
   * but auth hydrates asynchronously, so the company can land after mount.
   *
   * Adjusted DURING RENDER rather than in an effect. React sanctions exactly
   * this shape for "reset state when something changes" ("You Might Not Need an
   * Effect"): the re-render happens before anything is painted, where an effect
   * would paint the wrong company first and cascade a second pass. `dirty`
   * guards it, so it can never overwrite a choice already made.
   */
  const sessionCompanyId = businessContext?.companyId ?? null;
  /*
   * `undefined` means "not seeded yet", and it is NOT the same as `null`, which
   * is a real owner meaning "shipped for every company".
   *
   * Seeding this to `sessionCompanyId` was a bug: on the first render the two
   * already matched, the adjustment never ran, and a new design kept
   * `blankDraft`'s null owner — so the Owner field opened on "Shipped — every
   * company" and a private design would have been created public.
   */
  const [seededCompanyId, setSeededCompanyId] = useState<string | null | undefined>(undefined);
  if (!ptlId && !dirty && seededCompanyId !== sessionCompanyId) {
    setSeededCompanyId(sessionCompanyId);
    setDraft((current) => ({ ...current, ptlCompanyId: sessionCompanyId }));
  }

  const patchDraft = useCallback((patch: Partial<DesignerDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }, []);

  const patchWorking = useCallback((patch: Partial<DraftVersion>) => {
    setDraft((current) => ({ ...current, working: { ...current.working, ...patch } }));
    setDirty(true);
  }, []);

  const setDatasets = useCallback(
    (next: DraftDataset[] | ((current: DraftDataset[]) => DraftDataset[])) => {
      setDraft((current) => ({
        ...current,
        working: {
          ...current.working,
          datasets:
            typeof next === "function" ? next(current.working.datasets) : next,
        },
      }));
      setDirty(true);
    },
    [],
  );

  /** RULE 1. A published revision is read-only; the only move on one is "new draft". */
  const editable = useMemo(
    () => isEditable(draft.working, draft.history),
    [draft.working, draft.history],
  );

  /**
   * The revision currently in the tabs, as the server last described it -- what
   * the rail highlights and what "read-only" is being said about.
   */
  const workingStored = useMemo(
    () => draft.history.find((version) => version.ptvId === draft.working.ptvId) ?? null,
    [draft.history, draft.working.ptvId],
  );

  const reportError = useCallback((thrown: unknown, fallback: string) => {
    toast.error(getApiErrorMessage(thrown as never) ?? fallback);
  }, []);

  /**
   * The full save: identity plus the working revision, with its datasets.
   *
   * `includeDatasets` is true, which means the `datasets` array is PRESENT and
   * REPLACES the revision's set. That is right here and only here, because the
   * Designer holds the whole set -- a save from this screen genuinely means
   * "this is the set".
   */
  const save = useCallback(async () => {
    if (!editable) {
      toast.error("This revision is published and cannot be edited. Start a new draft instead.");
      return;
    }
    try {
      // `preservePublishedRevId` defends against a server defect that nulls the
      // published pointer on every update that does not itself publish. See the
      // note on `IdentityOptions`; delete it once the server is fixed.
      const saved = await saveTemplate(
        buildSavePayload(draft, { preservePublishedRevId: true }),
      ).unwrap();
      setDirty(false);
      toast.success(draft.ptlId ? "Design saved." : "Design created.");
      if (!draft.ptlId) {
        // A create answers with the id; the route has to become the real one or
        // the next save would create a second template.
        router.replace(printingDesignerRoute(saved.ptlId));
      }
    } catch (thrown) {
      reportError(thrown, "Could not save the design.");
    }
  }, [draft, editable, reportError, router, saveTemplate]);

  /**
   * TRAP 4 -- the rename path, which sends `ptl*` ALONE.
   *
   * `print_template` has no `ptl_row_version`, so round-tripping the whole
   * draft to change a name is how a publish gets silently reverted. This is a
   * separate call for a reason.
   */
  const saveIdentityOnly = useCallback(async () => {
    if (!draft.ptlId) {
      toast.error("Save the design once before renaming it.");
      return;
    }
    try {
      await saveTemplate(
        buildIdentitySavePayload(draft, { preservePublishedRevId: true }),
      ).unwrap();
      toast.success("Details saved. The design itself was not touched.");
    } catch (thrown) {
      reportError(thrown, "Could not save the details.");
    }
  }, [draft, reportError, saveTemplate]);

  /**
   * RULE 6. Publishing takes a signature, and it is captured deliberately --
   * the caller passes an approver rather than this hook defaulting it to the
   * session user, because a signature filled in automatically is not one.
   */
  const publish = useCallback(
    async (approvedBy: string) => {
      const refusal = checkPublishable(draft.working, approvedBy);
      if (refusal) {
        toast.error(refusal.reason);
        return;
      }
      try {
        // An unsaved revision is composed and published in one call, which the
        // server allows: a revision being published BY this request is not yet
        // frozen. A saved one is published without re-posting its body.
        const payload =
          draft.working.ptvId && !dirty
            ? buildPublishPayload(draft, draft.working.ptvId, approvedBy)
            : buildSavePayload(draft, { intent: { kind: "PUBLISH", approvedBy } });
        // No pointer echo on either branch: both MOVE the pointer, and the
        // server refuses the two ways of doing that in one request.
        const saved = await saveTemplate(payload).unwrap();
        setDirty(false);
        toast.success("Published. This is now the revision that prints.");
        if (!draft.ptlId) {
          router.replace(printingDesignerRoute(saved.ptlId));
        }
      } catch (thrown) {
        reportError(thrown, "Could not publish.");
      }
    },
    [draft, dirty, reportError, router, saveTemplate],
  );

  /** RULE 2. A new draft brings the datasets forward, or it renders nothing. */
  const startNewDraft = useCallback(() => {
    setDraft((current) => ({ ...current, working: newDraftFrom(current.working) }));
    setDirty(true);
    toast.info("New draft started from this revision. Save it to write revision.");
  }, []);

  /** RULE 4. Rolling back WRITES FORWARD; the pointer never moves backwards. */
  const startRollback = useCallback((version: PrintTemplateVersionPayload) => {
    setDraft((current) => ({ ...current, working: rollbackTo(version) }));
    setDirty(true);
    toast.info(
      `Revision ${version.ptvRevNo} copied into a new draft. Publish it to roll back — the history stays intact.`,
    );
  }, []);

  /** Point the tabs at another revision, to read it. */
  const openRevision = useCallback(
    (version: PrintTemplateVersionPayload) => {
      if (dirty && !window.confirm("Discard the unsaved changes to this draft?")) {
        return;
      }
      setDraft((current) => ({ ...current, working: toDraftVersion(version) }));
      setDirty(false);
    },
    [dirty],
  );

  return {
    tab,
    setTab,
    draft,
    dirty,
    editable,
    workingStored,
    isNew: !ptlId,
    isLoading: Boolean(ptlId) && isLoading,
    isFetching,
    isSaving,
    readError: error ? getApiErrorMessage(error as never) : null,
    sessionUserId: sessionUserId ?? null,
    /** The company a new design, or one switched off "shipped", belongs to. */
    sessionCompanyId,
    refetch,
    patchDraft,
    patchWorking,
    setDatasets,
    save,
    saveIdentityOnly,
    publish,
    startNewDraft,
    startRollback,
    openRevision,
  };
}

export type DesignerController = ReturnType<typeof useDesigner>;
