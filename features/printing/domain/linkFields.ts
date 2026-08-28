/**
 * `ptd_link_fields` -- how a nested band says which of its rows belong to which
 * parent row.
 *
 * The format is `parent=child`, comma separated, NO SPACES. Both sides are
 * OUTPUT COLUMNS: the left is a column the PARENT dataset returns, the right is
 * one THIS dataset returns. Neither is a bound parameter, and that is the whole
 * point -- the child query runs ONCE for the whole render with the same context
 * as everything else, returns the parent key as an ordinary column, and the
 * renderer groups on it. Per-parent execution would be N+1 against partitioned
 * tables.
 *
 * The pattern below is `ck_ptd_link_fields_shape`, character for character:
 *
 *   ^[a-z][a-z0-9_]*=[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*=[a-z][a-z0-9_]*)*$
 *
 * A single regex tells an author "that is not the right shape" and nothing
 * else, so `parseLinkFields` walks the string instead and names the pair that
 * is wrong.
 */

export const LINK_FIELDS_PATTERN =
  /^[a-z][a-z0-9_]*=[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*=[a-z][a-z0-9_]*)*$/;

export const LINK_FIELDS_MAX_LENGTH = 200;

/** `ck_ptd_name_shape`, which each side of a pair has to satisfy. */
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export type LinkPair = { parent: string; child: string };

export type LinkFieldsParse =
  | { ok: true; pairs: LinkPair[] }
  | { ok: false; pairs: LinkPair[]; errors: string[] };

/**
 * The authoritative yes/no, and the one the server will also apply. Use
 * `parseLinkFields` when you want to say WHY.
 */
export function isValidLinkFields(value: string): boolean {
  return value.length <= LINK_FIELDS_MAX_LENGTH && LINK_FIELDS_PATTERN.test(value);
}

/**
 * Split the string into pairs, collecting every problem rather than stopping at
 * the first -- a five-pair link with two typos should be fixed in one pass.
 *
 * `pairs` is populated for the pairs that DID parse even when `ok` is false, so
 * the grid can still show what it understood.
 */
export function parseLinkFields(value: string): LinkFieldsParse {
  const errors: string[] = [];
  const pairs: LinkPair[] = [];

  if (value.length === 0) {
    return { ok: false, pairs, errors: ["Nesting needs at least one parent=child pair."] };
  }
  if (value.length > LINK_FIELDS_MAX_LENGTH) {
    errors.push(`At most ${LINK_FIELDS_MAX_LENGTH} characters; this is ${value.length}.`);
  }
  if (/\s/.test(value)) {
    errors.push('No spaces are allowed — write "sb_id=bill_id,sbi_slno=slno".');
  }

  const segments = value.split(",");
  segments.forEach((segment, index) => {
    const position = segments.length === 1 ? "The pair" : `Pair ${index + 1}`;
    if (segment === "") {
      errors.push(`${position} is empty — check for a stray or trailing comma.`);
      return;
    }
    const sides = segment.split("=");
    if (sides.length !== 2) {
      errors.push(
        sides.length === 1
          ? `${position} ("${segment}") has no "=" — write parent_column=child_column.`
          : `${position} ("${segment}") has more than one "=".`,
      );
      return;
    }
    const [parent, child] = sides;
    if (!IDENTIFIER.test(parent)) {
      errors.push(
        `${position}: "${parent}" is not a column name — lower case, starting with a letter.`,
      );
    }
    if (!IDENTIFIER.test(child)) {
      errors.push(
        `${position}: "${child}" is not a column name — lower case, starting with a letter.`,
      );
    }
    if (IDENTIFIER.test(parent) && IDENTIFIER.test(child)) {
      pairs.push({ parent, child });
    }
  });

  return errors.length === 0 ? { ok: true, pairs } : { ok: false, pairs, errors };
}

/** Pairs back to the stored form. Round-trips anything `parseLinkFields` accepted. */
export function formatLinkFields(pairs: LinkPair[]): string {
  return pairs.map((pair) => `${pair.parent}=${pair.child}`).join(",");
}

/**
 * `ptdParentNo` and `ptdLinkFields` are a biconditional -- neither works alone.
 * Returns a sentence naming the missing half, or null.
 */
export function nestingIncoherence(dataset: {
  ptdParentNo?: number | null;
  ptdLinkFields?: string | null;
}): string | null {
  const hasParent = dataset.ptdParentNo !== null && dataset.ptdParentNo !== undefined;
  const hasLink = Boolean(dataset.ptdLinkFields);
  if (hasParent && !hasLink) {
    return "A nested dataset needs link fields — which column of the parent matches which of this one.";
  }
  if (hasLink && !hasParent) {
    return "Link fields describe nesting, so this dataset needs a parent dataset number.";
  }
  return null;
}
