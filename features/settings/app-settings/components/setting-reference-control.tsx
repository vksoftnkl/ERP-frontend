"use client";

import { useCallback, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGetMasterNameByIdQuery } from "@/store/api/lookupsApi";
import type { SettingValueSource } from "../lib/value-sources";
import type { SettingRow } from "../use-app-settings";
import styles from "../page.module.scss";

/**
 * A setting whose value is another master's id: picked by name, stored as the id.
 *
 * The draft is still the TEXT the rest of the screen works in — the dropdown
 * writes an id into it and nothing else about saving, dirtiness, validation or
 * Reset changes. Which master it is comes from `lib/value-sources.ts`.
 *
 * The two halves are asymmetric and that is the whole design of this file. The
 * dropdown can pick (it searches the master server-side, paged) but cannot
 * resolve — its SQL filters on text columns, so a stored uuid matches no row in
 * it. The name lookup can resolve one id and does not search. So the field's
 * text comes from whichever half last spoke: the pick, while the operator is on
 * the row; the lookup, for a value that was already stored when the screen
 * opened.
 */
export default function SettingReferenceControl({
  row,
  source,
  onChange,
}: {
  row: SettingRow;
  source: SettingValueSource;
  onChange: (value: string) => void;
}) {
  const dropdownId = useDropdownId(source.dropdownKey);
  const storedId = row.draft.trim();

  const { data: named, isFetching } = useGetMasterNameByIdQuery(
    { module: source.lookupModule, id: storedId },
    { skip: !storedId },
  );

  /**
   * The name of what was just picked, so the field reads back immediately
   * rather than after a round trip.
   *
   * It is USED only while it still describes the draft. Discard and Reset both
   * put another id in this field without the dropdown being touched, and a name
   * left over from the last pick would be a lie about what is about to be saved.
   */
  const [picked, setPicked] = useState<DropdownSelection | null>(null);
  const pickedText = picked && picked.id === storedId ? picked.text : null;

  const handleChange = useCallback(
    (selection: DropdownSelection | null) => {
      setPicked(selection);
      onChange(selection?.id ?? "");
    },
    [onChange],
  );

  // An id the master does not know is shown AS the id, not as a blank: a
  // mis-set setting must look wrong rather than look unset.
  const resolved = named?.value === storedId ? named.label : null;
  const value: DropdownSelection | null = storedId
    ? { id: storedId, text: pickedText ?? resolved ?? (isFetching ? "" : storedId) }
    : null;
  const missing = Boolean(storedId && !pickedText && !isFetching && !resolved);

  return (
    <div className={styles.referenceControl}>
      <NexDropdownSingle
        id={`app-setting-${row.asdKey}`}
        dropdownId={dropdownId}
        value={value}
        onChange={handleChange}
        disabled={!row.editable}
        invalid={Boolean(row.error) || missing}
        placeholder={source.placeholder}
        // A settings row is not a form to walk: the next control belongs to
        // another setting, and landing in it invites an edit nobody asked for.
        advanceFocusOnSelect={false}
        aria-label={row.asdLabel}
        aria-describedby={row.error ? `app-setting-${row.asdKey}-error` : undefined}
      />
      {missing ? <p className={styles.referenceMissing}>{source.missingText}</p> : null}
    </div>
  );
}
