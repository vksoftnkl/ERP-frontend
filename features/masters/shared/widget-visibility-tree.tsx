"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./widget-visibility-tree.module.scss";

/** One field leaf in the visibility tree. */
export type WidgetTreeFieldView = {
  fieldId: number;
  fieldName: string;
  label: string;
  /** fieldSecondaryText — editable value shown in the Secondary Text column. */
  secondaryText: string;
  /** fieldVisibility — drives whether the matching form field is rendered. */
  checked: boolean;
  /** True when this backend field maps to an actual form field on this screen. */
  controllable: boolean;
};
/** A section node with its nested field leaves. */
export type WidgetTreeSectionView = {
  sectionId: number;
  label: string;
  /** sectionVisibility. */
  visible: boolean;
  fields: WidgetTreeFieldView[];
};

type WidgetVisibilityTreeProps = {
  sections: WidgetTreeSectionView[];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onToggleSection: (sectionId: number, checked: boolean) => void;
  onToggleField: (fieldName: string, checked: boolean) => void;
  onChangeSecondaryText: (fieldId: number, value: string) => void;
};

/** Right-pointing chevron; rotated to point down via the `.chevronOpen` class. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
    >
      <path
        d="M3 1.5 L6.5 5 L3 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The on/off slider. `partial` drives the native `indeterminate` flag (a section
 * that has only some of its fields on), which cannot be expressed as an
 * attribute and has to be written to the DOM node.
 */
function Switch({
  checked,
  partial = false,
  disabled,
  onChange,
}: {
  checked: boolean;
  partial?: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = partial;
    }
  }, [partial]);
  return (
    <span className={`${styles.switch} ${partial ? styles.switchPartial : ""}`}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.slider} />
    </span>
  );
}

export default function WidgetVisibilityTree({
  sections,
  loading,
  error,
  disabled,
  onToggleSection,
  onToggleField,
  onChangeSecondaryText,
}: WidgetVisibilityTreeProps) {
  // Sections are expanded unless their id is collapsed here.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  const toggleCollapsed = useCallback((sectionId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Section and field toggles are kept consistent with each other, so an operator
  // never has to switch the section on first to make its fields count:
  //   - toggling a section carries every one of its fields with it;
  //   - switching a field on switches its section on;
  //   - switching the last remaining field off switches the section off.
  // Both callbacks are plain state setters on the hosting screen (section and field
  // visibility live in separate maps and every one of them updates functionally), so
  // fanning several calls out of one change event accumulates correctly.
  const handleSectionToggle = useCallback(
    (section: WidgetTreeSectionView, checked: boolean) => {
      onToggleSection(section.sectionId, checked);
      for (const field of section.fields) {
        if (field.checked !== checked) {
          onToggleField(field.fieldName, checked);
        }
      }
    },
    [onToggleField, onToggleSection],
  );

  const handleFieldToggle = useCallback(
    (section: WidgetTreeSectionView, field: WidgetTreeFieldView, checked: boolean) => {
      onToggleField(field.fieldName, checked);
      const sectionStaysOn =
        checked || section.fields.some((other) => other.fieldId !== field.fieldId && other.checked);
      if (section.visible !== sectionStaysOn) {
        onToggleSection(section.sectionId, sectionStaysOn);
      }
    },
    [onToggleField, onToggleSection],
  );

  // Visible/total across every field — drives the footer count and progress bar.
  const stats = useMemo(() => {
    let total = 0;
    let visible = 0;
    for (const section of sections) {
      for (const field of section.fields) {
        total += 1;
        if (field.checked) {
          visible += 1;
        }
      }
    }
    return { total, visible };
  }, [sections]);

  const allCollapsed = useMemo(
    () => sections.length > 0 && sections.every((section) => collapsed.has(section.sectionId)),
    [collapsed, sections],
  );

  const setAllCollapsed = useCallback(
    (collapse: boolean) =>
      setCollapsed(collapse ? new Set(sections.map((section) => section.sectionId)) : new Set()),
    [sections],
  );

  if (loading) {
    return (
      <div className={styles.tree}>
        <div className={styles.state}>
          <span className={styles.spinner} aria-hidden />
          Loading widgets…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.tree}>
        <div className={styles.stateError}>{error}</div>
      </div>
    );
  }
  if (sections.length === 0) {
    return (
      <div className={styles.tree}>
        <div className={styles.state}>No fields configured.</div>
      </div>
    );
  }

  const percent = stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0;

  return (
    <div className={styles.tree}>
      <div className={styles.tableScroll}>
        <div className={styles.headRow}>
          <div className={styles.headCell}>
            <button
              type="button"
              className={styles.expandAll}
              onClick={() => setAllCollapsed(!allCollapsed)}
              aria-label={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            >
              <Chevron open={!allCollapsed} />
            </button>
            Widget
          </div>
          <div className={styles.headCell}>Secondary Text</div>
        </div>
        {sections.map((section) => {
          const isExpanded = !collapsed.has(section.sectionId);
          const visibleCount = section.fields.reduce(
            (count, field) => count + (field.checked ? 1 : 0),
            0,
          );
          return (
            <div key={section.sectionId} className={styles.sectionGroup}>
              <div
                className={`${styles.row} ${styles.sectionRow} ${
                  section.visible ? "" : styles.rowOff
                }`}
              >
                <div className={styles.widgetCell}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => toggleCollapsed(section.sectionId)}
                    aria-label={isExpanded ? "Collapse section" : "Expand section"}
                    aria-expanded={isExpanded}
                  >
                    <Chevron open={isExpanded} />
                  </button>
                  <label className={styles.switchLabel}>
                    <Switch
                      checked={section.visible}
                      partial={
                        section.visible &&
                        visibleCount > 0 &&
                        visibleCount < section.fields.length
                      }
                      disabled={disabled}
                      onChange={(checked) => handleSectionToggle(section, checked)}
                    />
                    <span className={styles.sectionLabel}>{section.label}</span>
                  </label>
                  {section.fields.length > 0 ? (
                    <span className={styles.countBadge}>
                      {visibleCount}/{section.fields.length}
                    </span>
                  ) : null}
                </div>
                <div className={styles.secondaryCell} />
              </div>
              {isExpanded
                ? section.fields.map((field) => (
                    <div
                      key={field.fieldId}
                      className={`${styles.row} ${styles.fieldRow} ${
                        field.checked ? "" : styles.rowOff
                      }`}
                    >
                      <div className={`${styles.widgetCell} ${styles.indent}`}>
                        <label className={styles.switchLabel}>
                          <Switch
                            checked={field.checked}
                            disabled={disabled}
                            onChange={(checked) => handleFieldToggle(section, field, checked)}
                          />
                          <span className={styles.fieldLabel}>{field.label}</span>
                        </label>
                        {!field.controllable ? (
                          <span className={styles.fieldHint}>not on form</span>
                        ) : null}
                      </div>
                      <div className={styles.secondaryCell}>
                        <input
                          type="text"
                          className={styles.secondaryInput}
                          value={field.secondaryText}
                          disabled={disabled}
                          placeholder="—"
                          onChange={(event) =>
                            onChangeSecondaryText(field.fieldId, event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <span className={styles.footerCount}>
          <strong>{stats.visible}</strong> of {stats.total} widgets visible
        </span>
        <span className={styles.footerBar} aria-hidden>
          <span className={styles.footerBarFill} style={{ width: `${percent}%` }} />
        </span>
      </div>
    </div>
  );
}
