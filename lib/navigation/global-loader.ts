export const ERP_GLOBAL_NAVIGATION_START_EVENT = "erp:global-navigation-start";
export function notifyGlobalNavigationStart(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(ERP_GLOBAL_NAVIGATION_START_EVENT));
}