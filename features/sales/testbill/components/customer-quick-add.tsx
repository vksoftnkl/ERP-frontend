"use client";

/**
 * Quick add (§7.7): Name* · Phone · GSTIN · GST type (Unregistered | Regular |
 * Composition; SEZ / Overseas 400 on the ledger) · Area* (dropdown 13; it is
 * also the ledger group) · Group* (33) · State* (21, default the company's).
 *
 * A GSTIN must be 15 characters, valid and start with the state code;
 * Unregistered must have none. The caller posts `/customers/create` and then
 * handles the new customer EXACTLY like an operator pick.
 */
import { useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DropdownCombo, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { QuickAddCustomerDto } from "@/features/sales/testbill/api/bills";

const GST_TYPES = [
  { value: "UNREGISTERED", label: "Unregistered" },
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
] as const;

/** GSTIN: 2-digit state, 10-char PAN, entity code, Z, check char. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function quickAddViolation(input: {
  name: string;
  gstin: string;
  gstType: string;
  areaId: string;
  groupId: string;
  stateCode: string;
}): string | null {
  if (!input.name.trim()) {
    return "The customer needs a name.";
  }
  if (!input.areaId) {
    return "Pick the customer's area — it is also the ledger group.";
  }
  if (!input.groupId) {
    return "Pick the customer group.";
  }
  if (!input.stateCode) {
    return "Pick the customer's state.";
  }
  const gstin = input.gstin.trim().toUpperCase();
  if (input.gstType === "UNREGISTERED" && gstin) {
    return "An unregistered customer has no GSTIN — clear it, or pick Regular / Composition.";
  }
  if (input.gstType !== "UNREGISTERED") {
    if (gstin.length !== 15 || !GSTIN_PATTERN.test(gstin)) {
      return "That is not a valid 15-character GSTIN.";
    }
    if (!gstin.startsWith(input.stateCode)) {
      return `The GSTIN must start with the state code ${input.stateCode}.`;
    }
  }
  return null;
}

export type CustomerQuickAddProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  defaultStateCode: string;
  defaultStateName: string;
  defaultPriceLevel: number;
  /** What the operator had typed into the customer box, as the starting name. */
  initialName?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (dto: QuickAddCustomerDto) => void | Promise<void>;
};

export function CustomerQuickAdd({
  isOpen,
  companyId,
  branchId,
  defaultStateCode,
  defaultStateName,
  defaultPriceLevel,
  initialName = "",
  busy,
  onClose,
  onSubmit,
}: CustomerQuickAddProps) {
  const areaDropdownId = useDropdownId("area");
  const groupDropdownId = useDropdownId("customerGroup");
  const stateDropdownId = useDropdownId("gstStateCode");
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [gstType, setGstType] = useState<string>("UNREGISTERED");
  const [area, setArea] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [group, setGroup] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [state, setState] = useState<{ code: string; name: string }>({ code: defaultStateCode, name: defaultStateName });

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setPhone("");
      setGstin("");
      setGstType("UNREGISTERED");
      setArea({ id: "", name: "" });
      setGroup({ id: "", name: "" });
      setState({ code: defaultStateCode, name: defaultStateName });
    }
  }, [defaultStateCode, defaultStateName, initialName, isOpen]);

  const submit = () => {
    const violation = quickAddViolation({ name, gstin, gstType, areaId: area.id, groupId: group.id, stateCode: state.code });
    if (violation) {
      toast.error(violation);
      return;
    }
    void onSubmit({
      cusName: name.trim().toUpperCase(),
      cusPhone1: phone.trim() || null,
      cusGstNo: gstType === "UNREGISTERED" ? null : gstin.trim().toUpperCase(),
      cusGstType: gstType,
      cusAreaId: area.id,
      cusGroupId: group.id,
      cusStateCode: state.code,
      cusStateName: state.name,
      cusPriceLevelId: defaultPriceLevel,
      cusCompanyId: companyId,
      cusBranchId: branchId,
      cusIsActive: true,
    });
  };

  return (
    <ModalShell
      title="Quick add customer"
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={busy} onClick={onClose}>
            Cancel <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={busy} onClick={submit}>
            {busy ? "Adding…" : "Add and use"}
          </button>
        </>
      }
    >
      <div
        className={quotationStyles.fieldGrid}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.defaultPrevented && !(event.target as HTMLElement).closest("[role='combobox']")) {
            event.preventDefault();
            submit();
          }
        }}
      >
        <TextField id="qa-name" label="Name" value={name} required maxLength={200} disabled={busy} onChange={(value) => setName(value.toUpperCase())} />
        <TextField id="qa-phone" label="Phone" value={phone} maxLength={20} disabled={busy} onChange={setPhone} />
        <SelectField id="qa-gst-type" label="GST type" value={gstType} disabled={busy} options={GST_TYPES.map((row) => ({ ...row }))} onChange={setGstType} />
        <TextField id="qa-gstin" label="GSTIN" value={gstin} maxLength={15} disabled={busy || gstType === "UNREGISTERED"} onChange={(value) => setGstin(value.toUpperCase())} />
        <DropdownCombo id="qa-area" label="Area *" dropdownId={areaDropdownId} valueKey="arm_id" labelKey="arm_name" value={area.id} selectedLabel={area.name} disabled={busy} placeholder="Search areas…" onSelect={(id, label) => setArea({ id, name: label })} />
        <DropdownCombo id="qa-group" label="Group *" dropdownId={groupDropdownId} valueKey="cgr_id" labelKey="cgr_name" value={group.id} selectedLabel={group.name} disabled={busy} placeholder="Search groups…" onSelect={(id, label) => setGroup({ id, name: label })} />
        <DropdownCombo id="qa-state" label="State *" dropdownId={stateDropdownId} valueKey="state_code" labelKey="state_name" value={state.code} selectedLabel={state.name} disabled={busy} placeholder="Search states…" onSelect={(code, label) => setState({ code, name: label })} />
      </div>
      <p className={quotationStyles.modalNote}>
        The new customer is put on the bill the moment it is saved — the same as picking one. The area doubles as the ledger group.
      </p>
    </ModalShell>
  );
}
