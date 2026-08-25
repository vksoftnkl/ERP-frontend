"use client";

/**
 * The field tree, and the place datasets get bound.
 *
 * Two lists in one panel, because they are two halves of the same act: the
 * template declares `items -> sales.invoice.lines`, and only then does
 * `row.itemName` mean anything. A tree that showed every provider's fields
 * regardless of what the template had bound would offer fields the engine
 * cannot resolve.
 *
 * Fields are dragged onto a band with the native drag API rather than pointer
 * events: a drag that starts in one scroll container and ends in another is
 * exactly what HTML drag-and-drop is for, and it gives the OS drag cursor for
 * free.
 */

import { useMemo, useState, type DragEvent as ReactDragEvent } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { FieldMeta } from "@/features/print-designer/types/template-definition";
import { suggestDatasetName } from "@/features/print-designer/lib/defaults";
import {
  datasetRemoved,
  datasetUpserted,
} from "@/features/print-designer/store/designerSlice";
import {
  selectBoundDatasets,
  selectDatasetCatalogue,
} from "@/features/print-designer/store/selectors";
import { FIELD_DRAG_MIME, type FieldDragPayload } from "@/features/print-designer/components/BandBody";
import styles from "@/features/print-designer/components/designer.module.scss";

const TYPE_MARK: Record<FieldMeta["type"], string> = {
  string: "abc",
  number: "1.0",
  integer: "123",
  boolean: "y/n",
  date: "date",
  datetime: "time",
  object: "{ }",
};

export function DatasetTree() {
  const dispatch = useAppDispatch();
  const bound = useAppSelector(selectBoundDatasets);
  const catalogue = useAppSelector(selectDatasetCatalogue);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pendingProvider, setPendingProvider] = useState("");

  const boundNames = useMemo(
    () => new Set(bound.map((entry) => entry.binding.name)),
    [bound],
  );

  const needle = query.trim().toLowerCase();

  const toggle = (name: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleBind = () => {
    const provider = catalogue.find((entry) => entry.token === pendingProvider);
    if (!provider) {
      return;
    }
    dispatch(
      datasetUpserted({
        name: suggestDatasetName(provider.token, boundNames),
        provider: provider.token,
        cardinality: provider.cardinality,
      }),
    );
    setPendingProvider("");
  };

  const startDrag = (
    event: ReactDragEvent<HTMLButtonElement>,
    payload: FieldDragPayload,
  ) => {
    event.dataTransfer.setData(FIELD_DRAG_MIME, JSON.stringify(payload));
    // Text fallback so dropping outside the canvas is inert rather than
    // navigating the browser somewhere.
    event.dataTransfer.setData("text/plain", payload.field.name);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <>
      <div className={styles.bindRow}>
        <select
          className={styles.toolSelect}
          style={{ flex: 1, minWidth: 0 }}
          value={pendingProvider}
          onChange={(event) => setPendingProvider(event.target.value)}
          aria-label="Dataset provider"
        >
          <option value="">Bind a dataset…</option>
          {catalogue.map((provider) => (
            <option key={provider.token} value={provider.token}>
              {`${provider.label} (${provider.cardinality})`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.button}
          onClick={handleBind}
          disabled={!pendingProvider}
        >
          Add
        </button>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search fields"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className={styles.panelScroll}>
        {bound.length === 0 ? (
          <p className={styles.treeEmpty}>
            No datasets bound yet. Pick a provider above — a DETAIL band needs one before it can
            repeat.
          </p>
        ) : null}

        {bound.map((entry) => {
          const fields = entry.provider?.fields ?? [];
          const matching = needle
            ? fields.filter(
                (field) =>
                  field.name.toLowerCase().includes(needle) ||
                  field.label.toLowerCase().includes(needle),
              )
            : fields;
          // A search hit inside a collapsed group would otherwise be invisible.
          const isOpen = expanded.has(entry.binding.name) || (needle.length > 0 && matching.length > 0);

          return (
            <div key={entry.binding.name} className={styles.treeGroup}>
              <button
                type="button"
                className={styles.treeGroupHead}
                onClick={() => toggle(entry.binding.name)}
              >
                <span>{isOpen ? "▾" : "▸"}</span>
                <span>{entry.binding.name}</span>
                <span className={styles.treeGroupMeta}>
                  {entry.provider
                    ? `${entry.binding.cardinality} · ${fields.length}`
                    : "provider missing"}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.bandFlag}
                  title="Remove this dataset binding"
                  onClick={(event) => {
                    event.stopPropagation();
                    dispatch(datasetRemoved(entry.binding.name));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      dispatch(datasetRemoved(entry.binding.name));
                    }
                  }}
                >
                  ✕
                </span>
              </button>

              {isOpen
                ? matching.map((field) => (
                    <button
                      key={field.name}
                      type="button"
                      className={styles.treeField}
                      draggable
                      onDragStart={(event) =>
                        startDrag(event, {
                          datasetName: entry.binding.name,
                          cardinality: entry.binding.cardinality,
                          field,
                        })
                      }
                      title={field.description ?? field.label}
                    >
                      <span>{field.label}</span>
                      <span className={styles.treeFieldType}>{TYPE_MARK[field.type]}</span>
                    </button>
                  ))
                : null}

              {isOpen && matching.length === 0 ? (
                <p className={styles.treeEmpty}>
                  {entry.provider ? "No matching fields." : "This provider is not registered on the server."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default DatasetTree;
