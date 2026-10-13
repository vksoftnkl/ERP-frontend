/**
 * `POST /receipts/create` with `post: true` — Post is ONE gesture and ONE call
 * (server notes 106, Qt 6f15977).
 *
 * It used to be two: `/create` for the draft, then `/post` off its id — and
 * when the post was refused, the draft it had just made was left behind (or
 * deleted again, which needed the Delete right). `/create` now saves and posts
 * in ONE transaction: a refusal rolls everything back, so nothing is left on
 * the server and nothing on screen has to change. A reopened draft keeps its
 * id; a new receipt stays unsaved.
 *
 * The body is the DRAFT body — header, instruments, role lines, and the
 * draft's `avhVoucherId` when a reopened one is being posted — with the
 * SETTLEMENT keys of the post body on top:
 *
 *  - `allocations` / `creditsApplied` in the POST shape (money + settling
 *    deductions + credits per bill), NOT the remembered memo the draft sends.
 *    With `post: true` the server applies them, so the memo shape would
 *    understate every bill carrying a TDS line and be refused on `onAccount`.
 *  - `otherLineBills` and `onAccount`, which only a post reads. `onAccount` is
 *    REQUIRED when posting (400 without it).
 *
 * NOT the post body's voucher key: on a new receipt its `avhVoucherId` is ""
 * and would be refused as "not a valid UUID". The draft body has the key right.
 *
 * The server judges this on the Post right alone, so a Post-only user (no
 * Create) posts a new receipt here without ever owning a draft.
 */
import type { SaveAndPostReceiptBody } from "../receipt.types";
import { buildDraftPayload, type DraftPayloadInput } from "./build-draft";
import { buildPostPayload } from "./build-post";

export function buildSaveAndPostPayload(input: DraftPayloadInput): SaveAndPostReceiptBody {
  const { allocations, creditsApplied, otherLineBills, onAccount } = buildPostPayload(input);
  return {
    ...buildDraftPayload(input),
    allocations,
    creditsApplied,
    otherLineBills,
    onAccount,
    post: true,
  };
}
