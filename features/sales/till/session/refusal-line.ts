/**
 * A refusal as one plain line, for a till screen's "why it waits" text — a
 * disabled button's tooltip, the warning line once the popup is gone, the
 * warning a key press past a greyed button raises. The plain words and "Do: …"
 * when the code has them (Qt ec9d92d `ApiErrorText`), else the server's sentence.
 *
 * The inline error box itself renders the whole reading, grey detail and all,
 * with `components/feedback/refusal-text`.
 */
import type { ApiRefusal } from "@/lib/api/error-text";

export function refusalLine(refusal: ApiRefusal, fallback = "Something went wrong."): string {
  const plain = refusal.plain;
  if (plain && (plain.title || plain.line)) {
    const head = plain.title && plain.line ? `${plain.title} — ${plain.line}` : plain.line || plain.title;
    return plain.todo ? `${head} Do: ${plain.todo}` : head;
  }
  return refusal.sentence || fallback;
}
