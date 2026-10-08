"use client";

/**
 * Quick-add Customer (§7.7) — the quick strip's "+", a port of the Qt
 * `CustomerQuickAddDialog`.
 *
 * Name* · Phone · GSTIN · GST Type · Area* · Group* · State*, then
 * `POST /customers/create`, which writes the customer and its ledger together.
 * The dialog opens on the Customer Template (`masters.customer_form_defaults`,
 * read for this session like the customer master reads it): its GST type, area,
 * group and state fill the boxes — the company's own state when it names none —
 * and its price level, credit terms, charges and flags go with the create, so a
 * customer added here matches one added in the master. The new id goes back to the screen, which puts it on the bill
 * exactly as if the operator had picked it — the same confirm when the change
 * costs something, the same customer-detail and party-context reads. The rules
 * live in `salebill.quick-add.ts`.
 *
 * Keyboard: Enter moves to the next field (Qt's EnterNavigation — no default
 * button), so a half-filled dialog is never saved by a stray Enter; from State
 * it lands on Save & Select, and Enter there saves. Esc cancels.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DropdownCombo, Field, SelectField } from "@/features/sales/quotation/components/fields";
import { AREA_DROPDOWN_KEY, POS_DROPDOWN_KEY } from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { CUSTOMER_FORM_DEFAULTS_SETTING_KEY } from "@/features/masters/shared/form-defaults-setting";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { quotationApi } from "@/store/api/quotationApi";
import { useCreateQuickCustomerMutation } from "@/store/api/saleBillApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAppSettingText } from "@/store/slices/appSettingsSlice";
import { errorMessageOf } from "../salebill.notes";
import {
  QUICK_ADD_GST_TYPES,
  buildQuickAddCustomerDto,
  gstinLeftPatch,
  openingQuickAddForm,
  quickAddTemplateFrom,
  quickAddViolation,
  type QuickAddField,
  type QuickAddForm,
  type QuickAddGstType,
} from "../salebill.quick-add";

const FIELD_IDS: Record<QuickAddField, string> = {
  name: "sale-bill-quick-add-name",
  gstin: "sale-bill-quick-add-gstin",
  area: "sale-bill-quick-add-area",
  group: "sale-bill-quick-add-group",
  state: "sale-bill-quick-add-state",
};
const PHONE_ID = "sale-bill-quick-add-phone";
const GST_TYPE_ID = "sale-bill-quick-add-gst-type";
const SAVE_ID = "sale-bill-quick-add-save";
/**
 * Where Enter goes next — the dialog's fields by id, ending on Save & Select
 * rather than the Cancel beside it, so Enter, Enter saves. A fixed walk, not
 * "the next focusable element": a combo opens its menu on focus, and the next
 * focusable elements are then its option buttons — Enter would land on the
 * first row and the one after would pick it over what the box held.
 */
const ENTER_WALK = [
  FIELD_IDS.name,
  PHONE_ID,
  FIELD_IDS.gstin,
  GST_TYPE_ID,
  FIELD_IDS.area,
  FIELD_IDS.group,
  FIELD_IDS.state,
  SAVE_ID,
];

export type CustomerQuickAddProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  /** The company's own state — where most counter customers are — for a template that names none. */
  defaultStateCode: string;
  /** May still be blank while the bill resolves it; the dialog then looks it up. */
  defaultStateName: string;
  onClose: () => void;
  /** The customer the server made, to be picked onto the bill. */
  onCreated: (customerId: string, customerName: string) => void;
};

export function CustomerQuickAdd({
  isOpen,
  companyId,
  branchId,
  defaultStateCode,
  defaultStateName,
  onClose,
  onCreated,
}: CustomerQuickAddProps) {
  const dispatch = useAppDispatch();
  const areaDropdownId = useDropdownId(AREA_DROPDOWN_KEY);
  const groupDropdownId = useDropdownId("customerGroup");
  const stateDropdownId = useDropdownId(POS_DROPDOWN_KEY);
  const [createCustomer, { isLoading: busy }] = useCreateQuickCustomerMutation();
  // The session's effective settings, already resolved for this company and
  // branch — the same value the customer master's create form opens on.
  const templateText = useAppSelector((state) => selectAppSettingText(state, CUSTOMER_FORM_DEFAULTS_SETTING_KEY));
  const template = useMemo(() => quickAddTemplateFrom(templateText), [templateText]);
  const [form, setForm] = useState<QuickAddForm>(() =>
    openingQuickAddForm(template, { code: defaultStateCode, name: defaultStateName }),
  );
  /** The save's refusal, shown in the dialog beside the field it names. */
  const [refusal, setRefusal] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<QuickAddForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setRefusal(null);
  }, []);

  /**
   * A GST state code's name, off the same list the State box picks from — a
   * GSTIN names only the code. Through the store rather than a lazy trigger:
   * it can run as the dialog opens, before a hook subscription exists.
   */
  const lookUpStateName = useCallback(
    async (code: string): Promise<string> => {
      try {
        const page = await dispatch(
          quotationApi.endpoints.runDropdown.initiate(
            { dropdownId: stateDropdownId, search: code, limit: 25 },
            { subscribe: false },
          ),
        ).unwrap();
        const match = (page.items ?? []).find((row) => String(row.state_code ?? "").trim() === code);
        return match ? String(match.state_name ?? "").trim() : "";
      } catch {
        return "";
      }
    },
    [dispatch, stateDropdownId],
  );

  /** Lands the State box on `code`'s name — unless it has moved on, or has one. */
  const landStateName = useCallback((code: string, name: string) => {
    if (name) {
      setForm((current) => (current.stateCode === code && !current.stateName ? { ...current, stateName: name } : current));
    }
  }, []);

  // Every open starts on the template, not on the last customer. Reset on the
  // open itself, during render: an effect keyed on the defaults would also fire
  // when the bill resolves its state name while the dialog is up, and wipe what
  // the operator has typed.
  const [openedFor, setOpenedFor] = useState(isOpen);
  if (isOpen !== openedFor) {
    setOpenedFor(isOpen);
    if (isOpen) {
      setForm(openingQuickAddForm(template, { code: defaultStateCode, name: defaultStateName }));
      setRefusal(null);
    }
  }
  // A state known only by its code — the company's before the bill has its
  // name, a template that stored none, or one a GSTIN just moved to — gets its
  // name off the state list.
  const pendingStateCode = isOpen && form.stateCode && !form.stateName ? form.stateCode : "";
  useEffect(() => {
    if (!pendingStateCode) {
      return;
    }
    let cancelled = false;
    void lookUpStateName(pendingStateCode).then((name) => {
      if (!cancelled) {
        landStateName(pendingStateCode, name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [landStateName, lookUpStateName, pendingStateCode]);

  const refuse = (field: QuickAddField, message: string) => {
    setRefusal(message);
    // Qt's `fail(…, focus)`: the caret goes where the fix is.
    document.getElementById(FIELD_IDS[field])?.focus();
  };

  /** Qt's `editingFinished` on the GSTIN box. */
  const onGstinLeft = () => {
    const patch = gstinLeftPatch(form);
    if (Object.keys(patch).length === 0) {
      return;
    }
    // A moved state arrives nameless; the lookup above names it.
    patchForm(patch);
  };

  /** Set from the first click: the state lookup below runs before `busy` does. */
  const savingRef = useRef(false);
  const save = async () => {
    if (busy || savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      await saveOnce();
    } finally {
      savingRef.current = false;
    }
  };
  const saveOnce = async () => {
    // What leaving the GSTIN box writes, again: a click on Save straight from
    // it can arrive before the state it moved to has its name.
    let current: QuickAddForm = { ...form, ...gstinLeftPatch(form) };
    if (current.stateCode && !current.stateName) {
      current = { ...current, stateName: await lookUpStateName(current.stateCode) };
    }
    setForm(current);
    const violation = quickAddViolation(current);
    if (violation) {
      refuse(violation.field, violation.message);
      return;
    }
    const dto = buildQuickAddCustomerDto(current, { companyId, branchId }, template);
    try {
      const saved = await createCustomer(dto).unwrap();
      const customerId = saved?.cusId ?? "";
      if (!customerId) {
        // A 2xx with no id is not a customer the bill can carry; saving again
        // would only clash on the name.
        toast.warn("The customer was saved but no id came back — pick them from the customer list.");
        onClose();
        return;
      }
      onCreated(customerId, saved?.cusName || dto.cusName);
    } catch (error) {
      // A name clash is a 409 naming the ledger — shown as the server says it.
      toast.error(errorMessageOf(error));
    }
  };

  /**
   * Qt's EnterNavigation: Enter moves on, and an open combo that the operator
   * has arrowed or typed into keeps it to commit its row (it prevents default).
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const index = ENTER_WALK.indexOf((event.target as HTMLElement).id);
    const next = index >= 0 ? document.getElementById(ENTER_WALK[index + 1] ?? "") : null;
    if (!next) {
      return;
    }
    event.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement) {
      next.select();
    }
  };

  return (
    <ModalShell
      title="Quick-add Customer"
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            id={SAVE_ID}
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save & Select"}
          </button>
        </>
      }
    >
      <div className={quotationStyles.fieldGrid} onKeyDown={onKeyDown}>
        <Field label="Name" htmlFor={FIELD_IDS.name} required>
          <input
            id={FIELD_IDS.name}
            className={quotationStyles.input}
            value={form.name}
            maxLength={200}
            disabled={busy}
            placeholder="As it should print on the bill"
            autoComplete="off"
            // Not a rAF focus(): the portal mounts a commit late and the frame
            // can win, leaving the caret on the bill behind the dialog.
            autoFocus
            onChange={(event) => patchForm({ name: event.target.value })}
          />
        </Field>
        <Field label="Phone" htmlFor={PHONE_ID}>
          <input
            id={PHONE_ID}
            className={quotationStyles.input}
            value={form.phone}
            maxLength={15}
            disabled={busy}
            inputMode="tel"
            autoComplete="off"
            onChange={(event) => patchForm({ phone: event.target.value })}
          />
        </Field>
        <Field label="GSTIN" htmlFor={FIELD_IDS.gstin}>
          <input
            id={FIELD_IDS.gstin}
            className={quotationStyles.input}
            value={form.gstin}
            maxLength={15}
            disabled={busy}
            placeholder="Leave blank for an unregistered customer"
            autoComplete="off"
            data-uppercase="off"
            onChange={(event) => patchForm({ gstin: event.target.value.toUpperCase() })}
            onBlur={onGstinLeft}
          />
        </Field>
        <SelectField
          id={GST_TYPE_ID}
          label="GST Type"
          value={form.gstType}
          disabled={busy}
          options={QUICK_ADD_GST_TYPES}
          onChange={(value) => patchForm({ gstType: value as QuickAddGstType })}
        />
        <DropdownCombo
          id={FIELD_IDS.area}
          label="Area"
          required
          dropdownId={areaDropdownId}
          valueKey="arm_id"
          labelKey="arm_name"
          value={form.areaId}
          selectedLabel={form.areaName}
          disabled={busy}
          placeholder="Search areas…"
          onSelect={(areaId, areaName) => patchForm({ areaId, areaName })}
        />
        <DropdownCombo
          id={FIELD_IDS.group}
          label="Group"
          required
          dropdownId={groupDropdownId}
          valueKey="cgr_id"
          labelKey="cgr_name"
          value={form.groupId}
          selectedLabel={form.groupName}
          disabled={busy}
          placeholder="Search groups…"
          onSelect={(groupId, groupName) => patchForm({ groupId, groupName })}
        />
        <DropdownCombo
          id={FIELD_IDS.state}
          label="State"
          required
          dropdownId={stateDropdownId}
          valueKey="state_code"
          labelKey="state_name"
          value={form.stateCode}
          selectedLabel={form.stateName}
          disabled={busy}
          placeholder="Search states…"
          onSelect={(stateCode, stateName) => patchForm({ stateCode, stateName })}
        />
      </div>
      {refusal ? (
        <p className={quotationStyles.warning} role="alert">
          {refusal}
        </p>
      ) : null}
      {/* What goes with the create without a box of its own, said out loud. */}
      {template.priceLevelId !== null || Object.keys(template.extras).length > 0 ? (
        <p className={quotationStyles.modalNote}>
          Price level, credit terms, charges and other settings come from the Customer Template.
        </p>
      ) : null}
    </ModalShell>
  );
}
