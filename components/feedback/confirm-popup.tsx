"use client";

/**
 * The one dialog every `confirm()` in the app is answered through.
 *
 * Mounted once, beside `MessagePopup`, and reads the module-level queue in
 * `lib/confirm.ts` — so a question asked from outside React (the print
 * designer's navigation guard asks from a capture-phase DOM listener) reaches
 * the same dialog as one asked from a component.
 *
 * The look and the keyboard contract are `DeleteConfirmModal`'s, which is what
 * the screens that already ask properly use. Nothing new is drawn here: a
 * second confirmation style would be the thing this change exists to remove.
 */
import { useSyncExternalStore } from "react";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import {
  getConfirmations,
  getServerConfirmations,
  subscribeToConfirmations,
} from "@/lib/confirm";

export default function ConfirmPopup() {
  // The queue is a module-level array replaced on every change, so identity is
  // the comparison React needs.
  const pending = useSyncExternalStore(
    subscribeToConfirmations,
    getConfirmations,
    getServerConfirmations,
  );
  const current = pending[0];

  return (
    <DeleteConfirmModal
      isOpen={current !== undefined}
      title={current?.title}
      message={current?.message}
      note={current?.note}
      iconVariant={current?.iconVariant ?? "delete"}
      confirmLabel={current?.confirmLabel ?? "Confirm"}
      cancelLabel={current?.cancelLabel ?? "Cancel"}
      onConfirm={() => current?.settle(true)}
      onCancel={() => current?.settle(false)}
    />
  );
}
