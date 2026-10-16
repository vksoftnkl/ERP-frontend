/**
 * A refusal said inline — a popup's own red error line (Qt
 * `ApiErrorText::inlineHtml`, ec9d92d): the plain words in bold, "Do: …" under
 * them, and the server's status · code · field and sentence small and grey for
 * support. A code with no wording yet shows the server's sentence, with the
 * status · code · field grey under it.
 *
 * Renders bare inline content: the caller's own error box (the till dialogs'
 * `.warn.warnDanger` paragraph …) supplies the colour and the frame.
 */
import type { ApiRefusal } from "@/lib/api/error-text";

const GREY = { color: "#8a8aa8", fontSize: "11px", fontWeight: 400, whiteSpace: "pre-line", userSelect: "text" } as const;

export default function RefusalText({ refusal }: { refusal: ApiRefusal }) {
  const { plain } = refusal;
  if (plain) {
    return (
      <>
        <b>{plain.title}</b> {plain.line}
        {plain.todo ? (
          <>
            <br />
            Do: {plain.todo}
          </>
        ) : null}
        {refusal.detail ? (
          <>
            <br />
            <span style={GREY}>{refusal.detail}</span>
          </>
        ) : null}
      </>
    );
  }
  // No wording: the server's sentence as the line, status · code · field in grey.
  if (!refusal.sentence || refusal.head === refusal.sentence) {
    return <span style={GREY}>{refusal.detail}</span>;
  }
  return (
    <>
      {refusal.sentence}
      {refusal.head ? (
        <>
          <br />
          <span style={GREY}>{refusal.head}</span>
        </>
      ) : null}
    </>
  );
}
