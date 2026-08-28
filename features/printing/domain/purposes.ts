/**
 * WHAT can be printed -- as far as a client with no purpose endpoint can see.
 *
 * `print_purpose` ships twelve rows and has NO routes at all (section 9.6), so
 * there is nothing to read the catalogue from. Section 12 forbids the obvious
 * shortcut, and rightly: a hard-coded list of purposes is precisely 3.0's
 * `PrintUtil(this, 9)`, where an integer meant "sales bill" at ten call sites
 * and nothing anywhere said so. The list is not closed -- a sweet shop wants a
 * Kitchen Order Ticket -- which is why it is a table.
 *
 * So this module collects the purposes that something ALREADY REFERS TO:
 * every template carries `ptlPurposeId/Code/Name`, and every assignment carries
 * the `pta` equivalents, both joined server-side. That is honest and it is
 * enough to edit an installation that has any templates at all.
 *
 * It is NOT enough for two things, and the screens say so rather than pretend:
 *
 *   * A brand new installation has no templates, so this returns nothing and
 *     the Designer falls back to accepting a purpose id directly.
 *   * The Assignments matrix cannot show a purpose that has NEITHER a template
 *     NOR an assignment -- which is exactly the "prints nothing" row section 8
 *     wants to be loud about. That gap closes when the endpoint lands, and
 *     until then the screen carries a banner saying which rows it cannot draw.
 */

import type {
  PrintPurposeRef,
  PrintTemplateAssignmentPayload,
  PrintTemplatePayload,
} from "../types/printing";

/** How a purpose reads when only its id is known. */
export function purposeLabel(purpose: PrintPurposeRef): string {
  return purpose.ppoName ?? purpose.ppoCode ?? purpose.ppoId;
}

/**
 * The purposes referenced by the rows in hand, de-duplicated by id and sorted
 * by the label an operator would look for.
 *
 * A later row never overwrites an earlier one's name with a blank: the two
 * sources join the same table, but a payload can carry a null name, and losing
 * a label to a null is worse than keeping the one we had.
 */
export function collectPurposes(sources: {
  templates?: PrintTemplatePayload[];
  assignments?: PrintTemplateAssignmentPayload[];
}): PrintPurposeRef[] {
  const byId = new Map<string, PrintPurposeRef>();

  const add = (ppoId: string, ppoCode: string | null, ppoName: string | null): void => {
    if (!ppoId) return;
    const existing = byId.get(ppoId);
    byId.set(ppoId, {
      ppoId,
      ppoCode: ppoCode ?? existing?.ppoCode ?? null,
      ppoName: ppoName ?? existing?.ppoName ?? null,
    });
  };

  for (const template of sources.templates ?? []) {
    add(template.ptlPurposeId, template.ptlPurposeCode ?? null, template.ptlPurposeName ?? null);
  }
  for (const assignment of sources.assignments ?? []) {
    add(
      assignment.ptaPurposeId,
      assignment.ptaPurposeCode ?? null,
      assignment.ptaPurposeName ?? null,
    );
  }

  return [...byId.values()].sort((left, right) =>
    purposeLabel(left).localeCompare(purposeLabel(right)),
  );
}

/** A pasted-in purpose id, accepted only when it looks like one. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPurposeId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}
