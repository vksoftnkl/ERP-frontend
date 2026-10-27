/**
 * The voucher's keyboard — the shared transaction set (`lib/txn-keys.ts`, Qt
 * `TxnKeys`) bound in the entry view with `useTxnKeys`, exactly as Stock
 * Adjustment binds it: Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Post (it still
 * asks), F2 Edit, Alt+X Cancel, Ctrl+H History, Ctrl+O Show List, Esc Close,
 * Alt+PgUp / Alt+PgDn the previous / next transfer, F1 the sheet of them.
 *
 * The screen's own: F12 Pick from stock (the grid's F12 claims it first on the
 * line it is pressed on), and bare F5 swallowed so a habit press cannot reload
 * the page and take the unsaved document with it. Both are Stock Adjustment's
 * rules, used as they are.
 */
export { KEY_SHEET, LINE_KEYS, screenKeyAction } from "@/features/stocks/stock-adjustment/stock-adjustment.keys";
