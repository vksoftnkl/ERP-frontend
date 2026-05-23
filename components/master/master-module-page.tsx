"use client";
import { useRouter } from "next/navigation";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import styles from "./master-module-page.module.css";
type MasterModulePageProps = {
  title: string;
  description: string;
};
const MASTER_MENU_LINKS: Array<{ label: string; href: string }> = [
  { label: "Customer Master", href: "/master/customer" },
  { label: "Item Master", href: "/master/item-master" },
  { label: "Item Group Master", href: "/master/item-group-master" },
  { label: "Item Category Master", href: "/master/item-category-master" },
  { label: "Item Brand Master", href: "/master/item-brand-master" },
  { label: "Item Section Master", href: "/master/item-section-master" },
  { label: "Unit Master", href: "/master/unit-master" },
  { label: "Godown Master", href: "/master/godown-master" },
  { label: "Tax Master", href: "/master/tax-master" },
  { label: "State Master", href: "/master/state-master" },
  { label: "City Master", href: "/master/city-master" },
  { label: "Area Master", href: "/master/area-master" },
  { label: "Widget Master", href: "/master/widget-master" },
  { label: "Grid Designer", href: "/master/grid-designer" },
  { label: "Dropdown Designer", href: "/master/dropdown-designer" },
  { label: "UI Table Designer", href: "/master/ui-table-designer" },
];
export default function MasterModulePage({ title, description }: MasterModulePageProps) {
  const router = useRouter();
  return (
    <main className={styles.page}>
      <div className={styles.board}>
        <section className={styles.content}>
          <section className={styles.modulePanel}>
            <header className={styles.moduleHeader}>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.description}>{description}</p>
            </header>
            <div className={styles.moduleBody}>
              <p className={styles.shortcutLabel}>Master Screens</p>
              <div className={styles.shortcutGrid}>
                {MASTER_MENU_LINKS.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    className={styles.shortcutCard}
                    onClick={() => {
                      notifyGlobalNavigationStart();
                      router.push(item.href);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </section>
        <footer className={styles.statusBar}>
          <span className={styles.statusText}>Click Menu to open Screen</span>
          <span className={styles.statusCode}>Master Module</span>
        </footer>
      </div>
    </main>
  );
}
