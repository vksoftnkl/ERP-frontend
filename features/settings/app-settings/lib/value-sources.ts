import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import type { EffectiveSetting } from "../types";

/**
 * WHICH MASTER a setting's id points at.
 *
 * Read `components/setting-control.tsx` first: the control a setting gets is
 * chosen by DATA and never by key, and that rule stands. This table does not
 * break it, because it does not name a control — it names a FACT the catalog
 * does not record.
 *
 * `app_setting_def` says `sales.default_customer_id` is a UUID. It does not, and
 * today cannot, say that the uuid is a `sales.customers.cus_id`. Without that
 * one fact the only honest control is a text box, which is what the screen drew:
 * a 36-character id, typed by hand, with no way to tell a customer from a
 * supplier from a typo. With it, every UUID setting draws the same control — the
 * app's ordinary searchable master picker — and stores the id it picks.
 *
 * So a new referencing setting is still an INSERT plus ONE LINE here, and the
 * line is a reference, not a widget. When `app_setting_def` grows a column for
 * it (`asd_ref_module`, or its like), `valueSourceFor` reads that column instead
 * and this table is deleted; nothing above it changes.
 */
export type SettingValueSource = {
  /**
   * The Dropdown Master row that picks the value, by name — see
   * `lib/configured-dropdowns`. Its first configured column is the id that gets
   * stored, so the picker needs nothing else from us.
   */
  dropdownKey: ConfiguredDropdownKey;
  /**
   * The server's own `LOOKUP_MODULE_KEYS` spelling for the same master, which
   * turns a STORED id back into a name (`/master-lookups/name-id/all-masters`).
   * The dropdown cannot: its SQL searches text columns, and a uuid matches none.
   */
  lookupModule: string;
  /** What the empty field invites. A noun, because the operator is choosing a thing. */
  placeholder: string;
  /** Shown when the stored id names nothing — a mis-set value, said plainly. */
  missingText: string;
};

export const SETTING_VALUE_SOURCES: Record<string, SettingValueSource> = {
  "sales.default_customer_id": {
    dropdownKey: "customer",
    lookupModule: "customers",
    placeholder: "Search a customer…",
    missingText: "No customer carries this id any more.",
  },
};

/**
 * The master behind a setting, or `null` for the ordinary typed controls.
 *
 * Two guards, both deliberate. Only a UUID references anything — a TEXT setting
 * that happens to be bound would silently start storing ids. And an allowed-value
 * list always wins: the catalog has pinned that setting to a fixed set, and a
 * picker offering the whole master would offer values the write trigger refuses.
 */
export function valueSourceFor(setting: EffectiveSetting): SettingValueSource | null {
  if (setting.asdDataType !== "UUID") {
    return null;
  }
  if (setting.asdAllowedValues && setting.asdAllowedValues.length > 0) {
    return null;
  }
  return SETTING_VALUE_SOURCES[setting.asdKey] ?? null;
}
