"use client";

import type { ModuleTreeNode } from "../use-app-settings";
import styles from "../page.module.scss";

/**
 * Module -> group, built from whatever the catalog returned. Nothing here knows
 * the names of any modules or groups; a new one appears the moment a row is
 * inserted with it.
 */
export default function ModuleTree({
  tree,
  activeKey,
  onSelect,
}: {
  tree: ModuleTreeNode[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (tree.length === 0) {
    return <p className={styles.treeEmpty}>No settings match.</p>;
  }
  return (
    <nav className={styles.tree} aria-label="Setting groups">
      {tree.map((node) => (
        <div key={node.module} className={styles.treeModule}>
          <div className={styles.treeModuleHead}>
            <span>{node.module}</span>
            <span className={styles.treeCount}>{node.total}</span>
          </div>
          {node.groups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={`${styles.treeGroup} ${
                group.key === activeKey ? styles.treeGroupActive : ""
              }`}
              onClick={() => onSelect(group.key)}
            >
              <span className={styles.treeGroupName}>{group.group}</span>
              {group.changed > 0 ? (
                <span className={styles.treeChanged} title={`${group.changed} not at default`}>
                  {group.changed}
                </span>
              ) : null}
              <span className={styles.treeCount}>{group.total}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
