/**
 * Getting rendered bytes to a printer, outside React.
 *
 * -- WHY THIS IS NOT A HOOK ------------------------------------------------
 *
 * Because the document has to OUTLIVE the component that asked for it.
 *
 * The print dialog reads the frame it was opened on, and it stays open for as
 * long as the operator takes to choose a printer. A preview popup that fires
 * `print()` and then closes — which is what an operator wants, rather than a
 * dead dialog sitting behind the print page — would, if it owned the frame,
 * unmount it and revoke its blob URL mid-print. What comes out then is a blank
 * page, and blank paper is the one failure that cannot be undone.
 *
 * So the frame and the blob live at module scope: there is exactly one printing
 * frame in a tab, it belongs to the tab, and the previous one is only reclaimed
 * when a NEW print replaces it. That is late — a blob is held until then — but
 * it is the only point at which the browser is certainly finished with it.
 *
 * -- WHY AN IFRAME AND NOT `window.open` -----------------------------------
 *
 * A render is a round trip, so the object URL only exists inside an async
 * callback; by then the click's user-activation is spent and every popup
 * blocker treats `window.open` as unsolicited. A same-origin blob in a hidden
 * iframe needs no activation, and `contentWindow.print()` opens the operating
 * system's print dialog on the PDF directly — which is what the legacy screen's
 * button did.
 */

type Delivery = { frame: HTMLIFrameElement; objectUrl: string };

let current: Delivery | null = null;

/**
 * Reclaim the previous print's frame and blob.
 *
 * Called only when a new print replaces it, never on unmount — see above.
 * Exported for tests and for a caller that genuinely knows printing is over.
 */
export function releasePrintDelivery(): void {
  if (!current) return;
  const previous = current;
  current = null;
  previous.frame.remove();
  URL.revokeObjectURL(previous.objectUrl);
}

/**
 * Show the operating system's print dialog for an already-rendered PDF.
 *
 * TAKES OWNERSHIP of `objectUrl`: the caller must not revoke it afterwards.
 *
 * Returns immediately. The dialog opens from the frame's LOAD event, because
 * the bytes arriving and the browser's PDF viewer laying them out are different
 * moments, and printing between the two prints an empty frame.
 */
export function sendToPrinter(objectUrl: string): void {
  // Only now is the previous print certainly finished with its bytes.
  releasePrintDelivery();

  const frame = document.createElement("iframe");
  // Off-screen rather than `display: none` — a display-none iframe does not lay
  // out in every browser, and a PDF viewer that never laid out has nothing to
  // print.
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.opacity = "0";
  frame.style.border = "0";
  frame.style.pointerEvents = "none";

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // Some builds refuse `print()` on a plugin-rendered PDF. The bytes are
      // good either way, so hand the operator the document rather than
      // reporting a failure that did not happen.
      window.open(objectUrl, "_blank", "noopener");
    }
  };

  current = { frame, objectUrl };
  frame.src = objectUrl;
  document.body.appendChild(frame);
}
