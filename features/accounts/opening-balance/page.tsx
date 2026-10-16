"use client";

/**
 * Opening Balance — the route (menu 55). There is no list: the menu opens on
 * the set itself.
 *
 * A set left with unsaved changes when the operator went to another screen is
 * kept in screen memory (lib/screen-memory), and the route then reopens ON it
 * instead of on the server's copy.
 */
import { useMemo, useState } from "react";
import { isCompleteScope, screenMemory } from "@/lib/screen-memory";
import OpeningBalanceScreen from "./opening-balance-screen";
import { scopeSignature } from "./scope";
import { OPENING_BALANCE_MEMORY_KEY } from "./state/memory";
import { useOpeningTenant } from "./state/use-opening-draft";

type Mount = { tenant: string; resume: boolean };

export default function OpeningBalancePage() {
  const tenant = useOpeningTenant();
  const signature = scopeSignature(tenant);
  const [mount, setMount] = useState<Mount>(() => ({
    tenant: signature,
    resume: screenMemory.has(OPENING_BALANCE_MEMORY_KEY, tenant),
  }));
  // Each tenant on the header is a mount of its own, so switching it puts this
  // set back in its slot and brings the new tenant's back — the screen never
  // writes one tenant's set into another's slot. Decided while rendering, not
  // in an effect, so the old screen never commits under the new tenant. A
  // header still resolving (a company switch blanks branch and year for a
  // moment) is not a tenant yet.
  if (isCompleteScope(tenant) && mount.tenant !== signature) {
    setMount({ tenant: signature, resume: screenMemory.has(OPENING_BALANCE_MEMORY_KEY, tenant) });
  }
  const memory = useMemo(
    () => ({ key: OPENING_BALANCE_MEMORY_KEY, resume: mount.resume }),
    [mount.resume],
  );

  return (
    <OpeningBalanceScreen
      key={`${mount.tenant}|${mount.resume ? "resume" : "fresh"}`}
      memory={memory}
    />
  );
}
