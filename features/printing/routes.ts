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
 * -- NAV REGISTRATION, AND WHY IT IS NOT DONE YET --------------------------
 *
 * Neither route is in `DEFAULT_PRIMARY_MENU`, and that is deliberate. Binding
 * an href there does two things at once: it gives a DB menu row its route, and
 * it makes the route GOVERNED. A governed route the user's `/menu-masters/
 * usermenu` does not carry is DENIED -- "You do not have access to this
 * screen". `fixed.menu_master` has no row for either screen, so binding them
 * today locks every user, administrators included, out of a screen that
 * otherwise works. Verified in a browser on 27-08-2026.
 *
 * An ungoverned route fails open, which is why both screens are reachable now.
 *
 * TO PUT THEM IN THE MENU, both halves have to land together:
 *
 *   1. Seed two rows under Configuration (menu_parent 60), whose menu_name
 *      matches the labels below EXACTLY -- the merge is by label path:
 *
 *      INSERT INTO fixed.menu_master
 *        (menu_id, menu_parent, menu_name, menu_visiblity, menu_position, menu_is_active)
 *      VALUES (<id>, 60, 'Print Templates',   true, 5.00, true),
 *             (<id>, 60, 'Print Assignments', true, 5.50, true);
 *
 *   2. Add the matching entries to DEFAULT_PRIMARY_MENU's Configuration block:
 *
 *      {label:"Print Templates",href:"/settings/printing/templates"},
 *      {label:"Print Assignments",href:"/settings/printing/assignments"}
 *
 *   3. Grant the two menus in Settings -> User Administration, or nobody can
 *      open them -- step 2 is what makes them refusable.
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
