import Link from "next/link";
import ErpHeader, { type ErpHeaderItem } from "@/components/layout/erp-header";
import styles from "./master-module-page.module.css";

type MasterModulePageProps = {
  title: string;
  description: string;
};

const MASTER_MENU_LINKS: Array<{ label: string; href: string }> = [
  { label: "Item Group Master", href: "/master/item-group-master" },
  { label: "Item Brand Master", href: "/master/item-brand-master" },
  { label: "Item Section Master", href: "/master/item-section-master" },
  { label: "Unit Master", href: "/master/unit-master" },
  { label: "Godown Master", href: "/master/godown-master" },
  { label: "Tax Master", href: "/master/tax-master" },
];

const QUICK_TABS: ErpHeaderItem[] = [
  { label: "Master", children: MASTER_MENU_LINKS.map((item) => ({ label: item.label, href: item.href })) },
];

export default function MasterModulePage({ title, description }: MasterModulePageProps) {
  return (
    <main className={styles.page}>
      <div className={styles.board}>
        <ErpHeader
          searchMenuCount={0}
          cartCount={6}
          goLabel="K Go"
          quickTabs={QUICK_TABS}
          selectedCustomer="Customers"
          billPlaceholder="Enter Bill No"
        />

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
                  <Link key={item.href} href={item.href} className={styles.shortcutCard}>
                    {item.label}
                  </Link>
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
