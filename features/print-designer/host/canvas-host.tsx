"use client";

/**
 * Who owns the design the canvas is editing.
 *
 * -- WHY THE CANVAS NEEDS A HOST -------------------------------------------
 *
 * This designer was written against `/reports/templates`, and that API does not
 * exist: templates, schema, datasets/catalogue and preview all answer 404
 * (verified 27-08-2026). Everything the canvas needs to EDIT is client-side --
 * the band types, element kinds and paper presets are local constants in
 * `lib/vocabulary.ts` -- so the only thing missing was somewhere to load from
 * and save to.
 *
 * A host supplies that. When one is mounted, `useTemplateSave` hands the
 * definition to it instead of posting to `/reports/templates`, and the toolbar's
 * server-only affordances (Revisions, Set default) go quiet. The printing
 * module is the first host: `print_template_version` becomes the canvas's
 * storage, and it brings a publish pointer and a revision history the canvas
 * never had.
 *
 * -- PREVIEW CAME BACK, AS A HOST CAPABILITY -------------------------------
 *
 * Preview was hidden with the rest: it called `POST /reports/preview`, which
 * 404'd. The server-side renderer now exists on the printing module's own
 * tables, and Preview is reachable again — but NOT as something the canvas can
 * do by itself, which is why it is on the host rather than restored to the
 * toolbar unconditionally.
 *
 * The renderer takes a REVISION ID, not a definition, because the printing
 * engine rests on `print_log.plg_version_id` pointing at the exact bytes that
 * were rendered. The canvas does not know which revision it is editing; the
 * host does. So a host that can name its revision supplies `preview`, and the
 * Preview button appears; one that cannot leaves it out, and the button stays
 * gone. Nothing in the canvas has to know why.
 *
 * A CONTEXT RATHER THAN PROPS, deliberately: `useTemplateSave` is called from
 * three places -- the shell, the top bar and the menu bar -- and threading a
 * callback through two toolbars to reach a hook would touch every component
 * between. The host is ambient because saving is.
 *
 * With no host mounted the designer behaves exactly as before, so nothing here
 * changes the standalone route.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";

/** What one preview render produced, once the blob has been consumed. */
export type CanvasPreviewResult = {
  /** Set for PDF output; the CALLER owns revoking it. */
  objectUrl: string | null;
  /** Set for the raw printer modes, which have no viewer. */
  text: string | null;
  contentType: string;
  pageCount: number | null;
  copies: number | null;
  revNo: number | null;
  outputMode: string | null;
  warnings: number | null;
  byteLength: number;
};

/**
 * One question the revision asks its operator before it can render.
 *
 * Declared here rather than imported from the printing module: the canvas must
 * not know which backend is hosting it, and `ptv_params` is that backend's
 * word for this. What the dialog needs is the four things any prompt has.
 */
export type CanvasPreviewPrompt = {
  name: string;
  label: string;
  /** TEXT | NUMBER | DATE | DATETIME | BOOLEAN | UUID — used to pick an input. */
  type: string;
  required: boolean;
};

/** What the dialog asks for. Everything is optional but the design itself. */
export type CanvasPreviewRequest = {
  /**
   * The canvas's CURRENT definition. The host decides what to do with it: send
   * it as an unsaved body where the revision allows that, or ignore it and let
   * the server render what is stored.
   */
  definition: TemplateDefinition;
  docId?: string;
  accYear?: string;
  outputMode?: string;
  copies?: number;
  /**
   * The operator's answers, by prompt name. Blank answers are left OUT rather
   * than sent empty: an absent optional prompt falls back to the revision's own
   * default, where an empty string would override it with nothing.
   */
  params?: Record<string, string>;
};

/**
 * Rendering, when the host can name the revision it is editing.
 *
 * Present means the Preview button is shown; absent means it is not. The canvas
 * never decides — see the note at the top of this file.
 */
export type CanvasPreview = {
  /**
   * False when there is nothing on the server to render yet — a design that has
   * never been saved. The button stays visible and says why, rather than
   * vanishing between one save and the next.
   */
  ready: boolean;
  /** Shown in place of the render when `ready` is false. */
  notReadyReason?: string;
  /**
   * True when the canvas's unsaved bands can be previewed as they stand. False
   * for a frozen revision, where the dialog previews what is STORED and says so
   * — the alternative is showing a design nothing will ever print.
   */
  previewsUnsaved: boolean;
  /** Seeded into the dialog's inputs, so the common case needs no typing. */
  defaults?: { docId?: string; accYear?: string };
  /**
   * What this revision asks the operator, from `ptv_params`.
   *
   * Empty for most designs. A revision that declares a REQUIRED prompt cannot
   * render until it is answered — the server refuses with the prompt's own
   * label — so the dialog has to ask, and this is what it asks.
   */
  prompts: readonly CanvasPreviewPrompt[];
  render: (request: CanvasPreviewRequest) => Promise<CanvasPreviewResult>;
};

export type CanvasHost = {
  /** Shown in the top bar, so it is obvious what a save will write to. */
  label: string;
  /**
   * True when the design may be read but not written -- a PUBLISHED revision.
   * The canvas stays fully interactive so the design can be inspected and
   * measured; only saving is refused, with `readOnlyReason`.
   */
  readOnly: boolean;
  readOnlyReason?: string;
  /** Persist the definition. Throwing or rejecting leaves the draft dirty. */
  onSave: (definition: TemplateDefinition) => Promise<void>;
  /** Leave the canvas and go back where the host came from. */
  onClose: () => void;
  /** Rendering, when this host can name its revision. Absent = no Preview. */
  preview?: CanvasPreview;
};

const CanvasHostContext = createContext<CanvasHost | null>(null);

export function CanvasHostProvider({
  host,
  children,
}: {
  host: CanvasHost;
  children: ReactNode;
}) {
  return <CanvasHostContext.Provider value={host}>{children}</CanvasHostContext.Provider>;
}

/** The host, or null when the designer is running on its own route. */
export function useCanvasHost(): CanvasHost | null {
  return useContext(CanvasHostContext);
}
