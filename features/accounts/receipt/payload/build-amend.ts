/**
 * `POST /receipts/amend` — a POSTED receipt restated in place (R20).
 *
 * The body is the draft body AND the post body in one, plus the two things
 * only an amend carries. It keeps the receipt's number, because the customer
 * is holding a slip with that number on it; `avh_revision_no` goes up by one
 * and no reversal voucher is written.
 *
 * `baseRevision` is the optimistic lock and is never computed here: it is the
 * `avhRevisionNo` the document was LOADED with, held and sent straight back.
 * An amend carries the WHOLE document, so without it the second of two clients
 * silently undoes the first one's correction — on ledger legs, not on a master
 * record. On the 409 the screen RELOADS rather than retrying with the number
 * the server named, which would defeat the lock.
 */
import type { AmendReceiptBody } from "../receipt.types";
import { buildDraftPayload, type DraftPayloadInput } from "./build-draft";
import { buildPostPayload, type PostPayloadInput } from "./build-post";

export type AmendPayloadInput = DraftPayloadInput &
  PostPayloadInput & {
    /** The revision that was loaded. Not the one the server may now hold. */
    baseRevision: number;
    /** Why. Asked for BEFORE sending; an empty one cancels the amend. */
    editRemark: string;
  };

export function buildAmendPayload(input: AmendPayloadInput): AmendReceiptBody {
  const draft = buildDraftPayload(input);
  const post = buildPostPayload(input);
  return {
    ...draft,
    ...post,
    // `/amend` requires the id where `/create` may be handed none.
    avhVoucherId: input.header.voucherId ?? "",
    baseRevision: input.baseRevision,
    editRemark: input.editRemark.trim(),
  };
}
