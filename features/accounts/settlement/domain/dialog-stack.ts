/**
 * Which of this screen's dialogs is on top.
 *
 * Every dialog listens for Escape on the document; with two open (the format
 * dialog and its "Clear map?" question, the import dialog over the screen)
 * every listener sees the same key, and React may commit the inner one's close
 * between two listeners (memory: erp-nested-dialog-escape-race). So a dialog
 * registers when it opens, and Escape is answered by the TOP one only — a
 * decision read off this stack at event time, not off component state.
 */
let stack: string[] = [];

export function openDialog(id: string): void {
  stack = [...stack.filter((entry) => entry !== id), id];
}

export function closeDialog(id: string): void {
  stack = stack.filter((entry) => entry !== id);
}

export function isTopDialog(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

export function openDialogCount(): number {
  return stack.length;
}

export function resetDialogsForTests(): void {
  stack = [];
}
