/**
 * Route constants for the printing module.
 *
 * These sit under `/settings/printing/**` and are deliberately NOT
 * `/settings/print-templates`, which belongs to `features/print-designer` --
 * a different subsystem over `/reports/templates`, with its own `pt*` tables,
 * its own canvas and an `is_default` concept this one does not have. The two
 * coexist until one is retired; nothing here touches that one.
 */

/**
 * -- NAV REGISTRATION -------------------------------------------------------
 *
 * Both routes are bound by menu id in `MENU_ROUTES`
 * (components/layout/constants.ts): templates to 62 "Printing Configuration"
 * and assignments to 248 "Printing Assignments", both under Configuration.
 * Binding makes a route GOVERNED: a user whose `/menu-masters/usermenu` lacks
 * the menu is refused it ("You do not have access to this screen"), so grant
 * both in Settings -> User Administration.
 */
export const PRINTING_TEMPLATES_ROUTE = "/settings/printing/templates";
export const PRINTING_ASSIGNMENTS_ROUTE = "/settings/printing/assignments";

export const printingDesignerRoute = (ptlId: string): string =>
  `${PRINTING_TEMPLATES_ROUTE}/${ptlId}`;

export const NEW_PRINTING_TEMPLATE_ROUTE = `${PRINTING_TEMPLATES_ROUTE}/new`;

/**
 * The band canvas for a design's working revision.
 *
 * It is `features/print-designer` hosted by this module — see
 * `domain/canvasBridge.ts` for why that designer needs a host at all.
 */
export const printingLayoutCanvasRoute = (ptlId: string, ptvId?: string | null): string =>
  ptvId
    ? `${printingDesignerRoute(ptlId)}/layout?rev=${encodeURIComponent(ptvId)}`
    : `${printingDesignerRoute(ptlId)}/layout`;

/**
 * The Assignments screen, filtered to one template.
 *
 * This is the link behind the Designer's read-only "used by" chip. It is a
 * FILTER on a scope-shaped screen, not a per-design view: the row that
 * OVERRIDES a design lives on a DIFFERENT template, so a screen scoped to one
 * `ptaTemplateId` could never show it. Section 8 is about that distinction.
 */
export const printingAssignmentsForTemplateRoute = (ptlId: string): string =>
  `${PRINTING_ASSIGNMENTS_ROUTE}?ptaTemplateId=${encodeURIComponent(ptlId)}`;
