"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  registerDropdownMaster,
  unregisterDropdownMaster,
  type DropdownMasterEntryProps,
  type DropdownMasterRegistration,
} from "./masters";

/**
 * Register the master screen behind a dropdown for as long as the caller is
 * mounted, so Alt+C / Alt+A on any field bound to that dropdown open it.
 *
 * Registering from a hook rather than at module scope is what the configured
 * dropdown registry forces: ids are resolved BY NAME at runtime (see
 * `lib/configured-dropdowns`), so a feature does not know the number to register
 * under until it has rendered. `masters.ts` publishes a subscription for exactly
 * this reason — a late registration reaches the fields already on screen.
 *
 * The entry kept in the registry is a STABLE object whose `render` delegates to
 * a ref. A screen that rebuilds its render closure every render (all of them do
 * — it closes over the screen's own state) would otherwise re-register on every
 * keystroke, and every subscribed field would re-render with it.
 *
 * `dropdownId` may be empty while the registry is still resolving; nothing is
 * registered until it is real, and changing it moves the registration.
 */
export function useRegisterDropdownMaster(
  dropdownId: string | number | null | undefined,
  registration: {
    menuId: number;
    render: (props: DropdownMasterEntryProps) => ReactNode;
    /** Skip registering entirely — the screen is not offering the master. */
    disabled?: boolean;
  },
): void {
  const latest = useRef(registration);
  latest.current = registration;

  const stable = useMemo<DropdownMasterRegistration>(
    () => ({
      get menuId() {
        return latest.current.menuId;
      },
      render: (props) => latest.current.render(props),
    }),
    [],
  );

  const id = String(dropdownId ?? "").trim();
  const enabled = Boolean(id) && registration.disabled !== true;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    registerDropdownMaster(id, stable);
    return () => {
      unregisterDropdownMaster(id);
    };
  }, [enabled, id, stable]);
}
