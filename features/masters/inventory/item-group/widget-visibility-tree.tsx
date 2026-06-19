"use client";
import { useCallback, useState } from "react";
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

  if (loading) {
    return <div className={styles.state}>Loading…</div>;
  }
  if (error) {
    return <div className={styles.stateError}>{error}</div>;
  }
  if (sections.length === 0) {
    return <div className={styles.state}>No fields configured.</div>;
  }

  const totalFields = sections.reduce((count, section) => count + section.fields.length, 0);

  return (
    <div className={styles.tree}>
      <div className={styles.tableScroll}>
        <div className={styles.headRow}>
          <div className={styles.headCell}>Widget</div>
          <div className={styles.headCell}>Secondary Text</div>
        </div>
        {sections.map((section) => {
          const isExpanded = !collapsed.has(section.sectionId);
          return (
            <div key={section.sectionId} className={styles.sectionGroup}>
              <div className={`${styles.row} ${styles.sectionRow}`}>
                <div className={styles.widgetCell}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => toggleCollapsed(section.sectionId)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={section.visible}
                      disabled={disabled}
                      onChange={(event) =>
                        onToggleSection(section.sectionId, event.target.checked)
                      }
                    />
                    <span className={styles.sectionLabel}>{section.label}</span>
                  </label>
                </div>
                <div className={styles.secondaryCell} />
              </div>
              {isExpanded
                ? section.fields.map((field) => (
                    <div key={field.fieldId} className={`${styles.row} ${styles.fieldRow}`}>
                      <div className={`${styles.widgetCell} ${styles.indent}`}>
                        <label className={styles.checkLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={field.checked}
                            disabled={disabled}
                            onChange={(event) =>
                              onToggleField(field.fieldName, event.target.checked)
                            }
                          />
                          <span className={styles.fieldLabel}>{field.label}</span>
                          {!field.controllable ? (
                            <span className={styles.fieldHint}>not on form</span>
                          ) : null}
                        </label>
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
      <div className={styles.caption}>{totalFields}</div>
    </div>
  );
}
