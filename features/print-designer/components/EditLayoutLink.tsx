"use client";

/**
 * "Edit this layout" — the second entry point in the plan.
 *
 * The moment a customer says "move the logo" is while they are looking at a
 * printed document, not while browsing a settings list. This is the one click
 * from that complaint to the designer, and it belongs on every print preview
 * the app grows.
 *
 * It opens in a NEW TAB on purpose: the document the user was checking stays
 * where it is, which is what makes the two comparable side by side.
 *
 * No print preview screen exists in this client yet. When one lands, it gets
 * the template id for free — every render response carries
 * `X-Report-Template-Id` precisely so the client can answer "which template
 * produced this?" — so read it with `templateIdFromPrintResponse` and drop this
 * component next to the print button.
 */

import Link from "next/link";
import { printDesignerRoute } from "@/features/print-designer/routes";
import styles from "@/features/print-designer/components/designer.module.scss";

export type EditLayoutLinkProps = {
  /** From the render response's `X-Report-Template-Id` header. */
  templateId: string | null | undefined;
  label?: string;
  className?: string;
};

export function EditLayoutLink({
  templateId,
  label = "Edit this layout",
  className,
}: EditLayoutLinkProps) {
  if (!templateId) {
    return null;
  }

  return (
    <Link
      href={printDesignerRoute(templateId)}
      target="_blank"
      rel="noopener"
      className={className ?? styles.button}
    >
      {label}
    </Link>
  );
}

/**
 * The diagnostics every render response carries.
 *
 * "Which template printed this?" is the first question on every print
 * complaint, and the answer is in the headers rather than the body because the
 * body is a PDF.
 *
 * CAVEAT: the API sends no `Access-Control-Expose-Headers`, so these are only
 * readable when the page and the API share an origin. Production does (nginx
 * fronts both), local dev does not (client :3000, API :3011) — so expect nulls
 * locally, and add the header to the server's `enableCors` if this entry point
 * needs to work in dev.
 */
export function templateIdFromPrintResponse(headers: Headers): {
  templateId: string | null;
  version: number | null;
  source: string | null;
  pageCount: number | null;
} {
  const version = Number(headers.get("X-Report-Template-Version"));
  const pageCount = Number(headers.get("X-Report-Page-Count"));
  return {
    templateId: headers.get("X-Report-Template-Id"),
    version: Number.isFinite(version) && version > 0 ? version : null,
    source: headers.get("X-Report-Template-Source"),
    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null,
  };
}

export default EditLayoutLink;
