/**
 * What every grid popup shares — Qt `NexTable::openGridPopup` (091bf5b): a
 * title ("Select <column heading>" unless the caller names one — Qt
 * `PopupConfig::title`) and the key hint under it.
 */

export const GRID_POPUP_KEY_HINT = "type to search · ↑↓ · Enter picks · Esc closes";

/** An explicit title wins; else "Select " + the heading of the cell the popup opened from. */
export function gridPopupTitle(title: string | undefined, columnHeading: string | undefined): string {
  const explicit = (title ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const heading = (columnHeading ?? "").trim();
  return heading ? `Select ${heading}` : "Select";
}

export function GridPopupHint({ className }: { className?: string }) {
  return (
    <p className={className} data-grid-popup-hint="true">
      {GRID_POPUP_KEY_HINT}
    </p>
  );
}
