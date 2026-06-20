"use client";
import { useCallback, useMemo, useState } from "react";
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
                    <span className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={section.visible}
                        disabled={disabled}
                        onChange={(event) =>
                          onToggleSection(section.sectionId, event.target.checked)
                        }
                      />
                      <span className={styles.slider} />
                    </span>
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
                          <span className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={field.checked}
                              disabled={disabled}
                              onChange={(event) =>
                                onToggleField(field.fieldName, event.target.checked)
                              }
                            />
                            <span className={styles.slider} />
                          </span>
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
