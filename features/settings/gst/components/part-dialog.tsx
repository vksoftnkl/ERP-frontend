"use client";

/**
 * The popup that edits ONE row under a provider — service, endpoint, field
 * map, error map, provider account (Qt `GstPartForm`). Each row saves on its
 * own route; the provider dialog's Save writes only the provider's header.
 *
 * A row with a /get (endpoint, account) is re-read on open; the others are
 * filled from the row in hand — the provider's `services[]`, an endpoint's
 * `fieldMaps[]`, or the error-map grid row (`partialRow`: the grid does not
 * carry every column, and those are left off the save).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/notify";
import { useLoadGstPartMutation, useSaveGstPartMutation } from "@/store/api/gstConfigApi";
import type { PartFormSpec } from "../domain/forms";
import { gstErrorText } from "../domain/format";
import {
  buildPartBody,
  emptyPartState,
  fillPartState,
  setPartValue,
  setSecretText,
  toggleSecretClear,
  validatePart,
  type PartField,
  type PartFormState,
} from "../domain/part-form";
import { GstDialog } from "./gst-dialog";
import { fieldElementId, PartFields } from "./part-fields";
import styles from "../gst.module.scss";

type JsonRecord = Record<string, unknown>;

export type PartCustomContext = {
  /** The row's id once it exists. */
  id: string | null;
  /** The row as the server last answered it (its /get, or the save). */
  data: JsonRecord | null;
  /** Re-read the row for what hangs below it, leaving the form's edits alone. */
  reload: () => void;
  readOnly: boolean;
};

export type PartDialogProps = {
  spec: PartFormSpec;
  parentId: string;
  /** Edit this row by id — re-read through the spec's /get … */
  id?: string | null;
  /** … or from the row in hand, for a row with no /get. */
  row?: JsonRecord | null;
  partialRow?: boolean;
  /** No edit right: everything shows, nothing saves. */
  readOnly?: boolean;
  /** Stay open after a CREATE — a new endpoint's field map is added next. */
  stayOpenOnCreate?: boolean;
  /** Where the row sits: "EINVOICE · SANDBOX". */
  context?: string;
  renderCustom?: (field: PartField, ctx: PartCustomContext) => ReactNode;
  onClose: () => void;
  /** After each successful save, with the server's answer. */
  onSaved: (data: JsonRecord) => void;
};

function firstEditableKey(fields: readonly PartField[]): string | undefined {
  return fields.find((field) => field.kind !== "heading" && field.kind !== "custom")?.key;
}

export function PartDialog({
  spec,
  parentId,
  id,
  row,
  partialRow,
  readOnly = false,
  stayOpenOnCreate,
  context,
  renderCustom,
  onClose,
  onSaved,
}: PartDialogProps) {
  const idPrefix = `gst-part-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const initialId = id ?? (row ? String(row[spec.idKey] ?? "") || null : null);
  const [currentId, setCurrentId] = useState<string | null>(initialId);
  const [state, setState] = useState<PartFormState>(() =>
    row ? fillPartState(spec.fields, row, { partial: partialRow }) : emptyPartState(spec.fields),
  );
  const [data, setData] = useState<JsonRecord | null>(row ?? null);
  const [loading, setLoading] = useState(Boolean(initialId && spec.getUrl && !row));
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [loadPart] = useLoadGstPartMutation();
  const [savePart, { isLoading: saving }] = useSaveGstPartMutation();
  const loadGeneration = useRef(0);
  const savingRef = useRef(false);

  const fetchRow = useCallback(
    (applyToForm: boolean) => {
      if (!currentId || !spec.getUrl) {
        return;
      }
      const generation = (loadGeneration.current += 1);
      loadPart({ url: spec.getUrl, idKey: spec.idKey, id: currentId })
        .unwrap()
        .then((result) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          setData(result);
          if (applyToForm) {
            setState(fillPartState(spec.fields, result));
          }
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (generation !== loadGeneration.current) {
            return;
          }
          setLoading(false);
          toast.error(gstErrorText(error, `The ${spec.title.toLowerCase()} could not be read.`));
          if (applyToForm) {
            onClose();
          }
        });
    },
    [currentId, loadPart, onClose, spec],
  );

  // The first read fills the form. Keyed on nothing but the mount: a later
  // re-read (`reload`) refreshes `data` only, never the operator's edits.
  const firstRead = useRef(loading);
  useEffect(() => {
    if (firstRead.current) {
      fetchRow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => fetchRow(false), [fetchRow]);

  const onValue = useCallback((key: string, value: string | boolean) => {
    setState((current) => setPartValue(current, key, value));
  }, []);
  const onSecretText = useCallback((key: string, text: string) => {
    setState((current) => setSecretText(current, key, text));
  }, []);
  const onSecretClear = useCallback((key: string) => {
    setState((current) => toggleSecretClear(current, key));
  }, []);

  const save = useCallback(async () => {
    if (readOnly || loading || savingRef.current) {
      return;
    }
    const problem = validatePart(spec.fields, state);
    if (problem) {
      setInvalidKey(problem.key);
      toast.warning(problem.message);
      document.getElementById(fieldElementId(idPrefix, problem.key))?.focus();
      return;
    }
    setInvalidKey(null);
    const body = buildPartBody(spec.fields, state, {
      idKey: spec.idKey,
      id: currentId,
      parentKey: spec.parentKey,
      parentId,
    });
    savingRef.current = true;
    try {
      const result = await savePart({ url: spec.createUrl, body }).unwrap();
      const created = !currentId;
      onSaved(result);
      if (created && stayOpenOnCreate) {
        const newId = String(result[spec.idKey] ?? "");
        setCurrentId(newId || null);
        setData(result);
        setState(fillPartState(spec.fields, result));
        toast.success(`${spec.title} saved — add its field map below.`);
        return;
      }
      toast.success(`${spec.title} saved.`);
      onClose();
    } catch (error) {
      toast.error(gstErrorText(error, `The ${spec.title.toLowerCase()} could not be saved.`));
    } finally {
      savingRef.current = false;
    }
  }, [currentId, idPrefix, loading, onClose, onSaved, parentId, readOnly, savePart, spec, state, stayOpenOnCreate]);

  const keys = [{ key: "F5", run: () => void save() }];

  const subtitleParts = [
    context,
    readOnly ? "view only" : currentId ? null : "new",
    spec.subtitle,
  ].filter(Boolean);

  return (
    <GstDialog
      title={spec.title}
      subtitle={subtitleParts.join("  ·  ")}
      width={spec.width}
      keys={keys}
      onClose={onClose}
      footer={
        <>
          <span className={styles.keys}>
            {readOnly ? "Esc Close" : "F5 Save  ·  Esc Close  ·  Enter next field"}
          </span>
          <button type="button" className={styles.button} onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {readOnly ? null : (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <PartFields
          fields={spec.fields}
          state={state}
          idPrefix={idPrefix}
          readOnly={readOnly}
          invalidKey={invalidKey}
          autoFocusKey={firstEditableKey(spec.fields)}
          onValue={onValue}
          onSecretText={onSecretText}
          onSecretClear={onSecretClear}
          renderCustom={
            renderCustom
              ? (field) => renderCustom(field, { id: currentId, data, reload, readOnly })
              : undefined
          }
        />
      )}
    </GstDialog>
  );
}
