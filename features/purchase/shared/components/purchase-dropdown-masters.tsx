"use client";

/**
 * Alt+C / Alt+A on a purchase screen's Supplier, Agent and Godown dropdowns
 * (Qt NexERP 6b81080 COM-05: `registerPurchaseDropdownMasters` 35 → the
 * Supplier master, menu 22; 74 → the Agent master, menu 28;
 * `registerInventoryDropdownMasters` 26 → the Godown master, menu 39).
 *
 * Alt+C adds a record from the field (the typed text as its name), Alt+A amends
 * the one picked; the saved record is selected in the field. The MASTER's own
 * menu rights decide whether each is offered (`useDropdownMaster`). The master
 * is the real screen mounted with its list hidden (the customer bridge's way,
 * features/masters/sales/customer/inline-customer-master.tsx), loaded only when
 * a key is pressed.
 *
 * Opt-in: `usePurchaseDropdownMasters({...ids})` registers for as long as the
 * calling screen is mounted. Purchase Entry calls it. Sizes / colours are not
 * dropdowns on the web line grid (pick-list cells), so 70 / 71 are not here.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CrudMasterPageController } from "@/components/master/crud-master-page";
import type { DropdownMasterEntryProps } from "@/components/design-system/dropdown/masters";
import { useRegisterDropdownMaster } from "@/components/design-system/dropdown/use-register-dropdown-master";

export const SUPPLIER_MASTER_MENU_ID = 22;
export const AGENT_MASTER_MENU_ID = 28;
export const GODOWN_MASTER_MENU_ID = 39;

const SupplierPage = dynamic(() => import("@/features/masters/purchase/suppliers/page"), { ssr: false });
const AgentPage = dynamic(() => import("@/features/masters/purchase/agents/purchase-agent-master").then((m) => m.PurchaseAgentMasterPage), {
  ssr: false,
});
const GodownPage = dynamic(() => import("@/features/masters/inventory/godown/page"), { ssr: false });

type MasterKind = "supplier" | "agent" | "godown";

/** The form field a create opens with the typed text in it. */
const NAME_FIELD: Record<MasterKind, string> = { supplier: "supName", agent: "name", godown: "masterName" };

/**
 * The registry's `{mode, selectionId, query}` → the controller call that opens
 * the right popup; the save → `{id, text}` for the field. A close that follows a
 * save is the save's own (no second, contradictory answer).
 */
function InlineMasterBridge({ kind, mode, selectionId, query, onSaved, onClose }: DropdownMasterEntryProps & { kind: MasterKind }) {
  const [controller, setController] = useState<CrudMasterPageController | null>(null);
  const onControllerReady = useCallback((next: CrudMasterPageController | null) => {
    if (next) {
      setController((current) => current ?? next);
    }
  }, []);
  const openedRef = useRef(false);
  const savedRef = useRef(false);

  // Deferred a tick, cancelled by the cleanup: the master reads its record through a lazy RTK
  // trigger, which fired while its own screen mounts would open a blank record (memory:
  // erp-nex-dropdown-component, "openUpdateById must NOT be called from the mount phase").
  useEffect(() => {
    if (!controller || openedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      openedRef.current = true;
      if (mode === "create") {
        const typed = query.trim();
        controller.openCreate({ values: typed ? { [NAME_FIELD[kind]]: typed.toUpperCase() } : undefined });
        return;
      }
      if (selectionId) {
        void controller.openUpdateById(selectionId);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controller, kind, mode, query, selectionId]);

  const onModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !savedRef.current) {
        onClose();
      }
    },
    [onClose],
  );
  const onRecordSaved = useCallback(
    (id: string, text: string) => {
      savedRef.current = true;
      onSaved({ id, text });
    },
    [onSaved],
  );

  if (kind === "supplier") {
    return (
      <SupplierPage
        inlineModalOnly
        onCrudControllerReady={onControllerReady}
        onModalOpenChange={onModalOpenChange}
        onSupplierSaved={({ supplierId, supplierName }) => onRecordSaved(supplierId, supplierName)}
      />
    );
  }
  if (kind === "agent") {
    return (
      <AgentPage
        inlineModalOnly
        onCrudControllerReady={onControllerReady}
        onModalOpenChange={onModalOpenChange}
        onAgentSaved={({ agentId, agentName }) => onRecordSaved(agentId, agentName)}
      />
    );
  }
  return (
    <GodownPage
      inlineModalOnly
      onCrudControllerReady={onControllerReady}
      onModalOpenChange={onModalOpenChange}
      onGodownSaved={({ godownId, values }) => onRecordSaved(godownId, String(values.masterName ?? "").trim())}
    />
  );
}

export function usePurchaseDropdownMasters(ids: { supplier?: string | null; agent?: string | null; godown?: string | null }): void {
  useRegisterDropdownMaster(ids.supplier, {
    menuId: SUPPLIER_MASTER_MENU_ID,
    render: (props) => <InlineMasterBridge {...props} kind="supplier" />,
  });
  useRegisterDropdownMaster(ids.agent, {
    menuId: AGENT_MASTER_MENU_ID,
    render: (props) => <InlineMasterBridge {...props} kind="agent" />,
  });
  useRegisterDropdownMaster(ids.godown, {
    menuId: GODOWN_MASTER_MENU_ID,
    render: (props) => <InlineMasterBridge {...props} kind="godown" />,
  });
}
