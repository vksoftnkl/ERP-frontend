/**
 * The Visible Settings tree's expand / collapse keys (Qt MenuWidgetSetting,
 * 4ae6575): Ctrl++ shows every section's fields, Ctrl+- shows the sections
 * only. Ctrl+= counts as Ctrl++ — it is the same key unshifted — and Cmd
 * stands in for Ctrl on a Mac. Shift is allowed (it is how "+" is typed);
 * Alt is not.
 */
export type TreeExpandKeyAction = "expand" | "collapse" | null;

export function treeExpandKeyAction(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): TreeExpandKeyAction {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  if (event.key === "+" || event.key === "=") {
    return "expand";
  }
  if (event.key === "-") {
    return "collapse";
  }
  return null;
}
