/**
 * The screen's keys, as the Qt entry binds them (QShortcut, widget-with-
 * children context) and as its key line prints them:
 *
 *   F5       Refresh (every list, and the open payout)
 *   Ctrl+M   Run match                       Match tab
 *   Ctrl+P   Post TSet                       Match tab
 *   Enter    Confirm the suggestion          the lines table
 *   Del      Not this one (unlink)           the lines table
 *   Ctrl+W   Write off                       Not received tab
 *   Ctrl+R   Resolve                         Unexplained tab
 *
 * Ctrl+P / Ctrl+W / Ctrl+R are the browser's print / close-tab / reload: the
 * screen takes them (preventDefault) only on the tab whose verb they are, and
 * the verb itself still checks that its button is open. Ctrl+W cannot be taken
 * from every browser (Chrome keeps it); the button stays.
 */
/** The route (menu 278 "Settlement Reconciliation" under "&5 Accounts"). */
export const SETTLEMENT_HREF = "/accounts/settlement-reconciliation";

export const SETTLEMENT_TABS = ["match", "notReceived", "unexplained", "duplicates", "suspense"] as const;
export type SettlementTab = (typeof SETTLEMENT_TABS)[number];

export const TAB_LABELS: Record<SettlementTab, string> = {
  match: "Match",
  notReceived: "Not received",
  unexplained: "Unexplained",
  duplicates: "Duplicate refs",
  suspense: "Suspense",
};

export type ScreenAction = "refresh" | "runMatch" | "post" | "confirm" | "unlink" | "writeOff" | "resolve";

export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function screenAction(
  event: KeyInput,
  context: { tab: SettlementTab; inLinesTable: boolean },
): ScreenAction | null {
  const ctrl = event.ctrlKey || event.metaKey;
  if (event.altKey) return null;
  if (event.key === "F5" && !ctrl && !event.shiftKey) return "refresh";
  if (ctrl && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (context.tab === "match" && key === "m") return "runMatch";
    if (context.tab === "match" && key === "p") return "post";
    if (context.tab === "notReceived" && key === "w") return "writeOff";
    if (context.tab === "unexplained" && key === "r") return "resolve";
    return null;
  }
  if (context.tab === "match" && context.inLinesTable && !event.shiftKey) {
    if (event.key === "Enter") return "confirm";
    if (event.key === "Delete") return "unlink";
  }
  return null;
}

export const MATCH_KEYS_HINT =
  "Enter confirm · Del not this one · Ctrl+M run match · Ctrl+P post · rows settle SETTLED / PARTIAL on post";

export const OVERRIDE_HINT =
  "Write-off and resolve need the Settlement Reconciliation override right — it stands in for the " +
  "NONCASH_WRITE_OFF / SETTLEMENT_RESOLVE approvals until the approval gate ships.";

export const SCREEN_SUBTITLE =
  "Card / UPI money is proven by the provider's statement, not counted · one TSet voucher per payout · " +
  "runs on the store server";
