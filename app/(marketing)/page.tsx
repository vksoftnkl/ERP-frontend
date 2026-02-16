import ErpHeader, { type ErpHeaderItem } from "@/components/layout/erp-header";
import styles from "./page.module.css";

const quickTabs: ErpHeaderItem[] = [
  { label: "Sales Entry" },
  { label: "Sales Return" },
  { label: "SO Management" },
  { label: "Cashier Screen" },
  { label: "Import Invoices" },
  { label: "Item Group Master", href: "/item-group-master" },
  { label: "Gate Inward Entry" },
  { label: "SO Stock Position" },
  { label: "Profit & Loss" },
];

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.board}>
        <ErpHeader
          searchMenuCount={9}
          cartCount={6}
          goLabel="K Go"
          quickTabs={quickTabs}
          selectedCustomer="Customers"
          billPlaceholder="Enter Bill No"
        />

        <section className={styles.hero} aria-label="ERP landing screen">
          <div className={styles.heroGlow} aria-hidden />

          <div className={styles.logoBadge}>
            <div className={styles.logoMark} aria-hidden>
              <span className={styles.markTop} />
              <span className={styles.markMid} />
              <span className={styles.markBottom} />
            </div>
            <p className={styles.brandName}>VK SOFTWARES</p>
          </div>

          <p className={styles.tagline}>
            EXPERIENCE + SYSTEMATIC + BEST TECHNOLOGY = NEW HEIGHT OF BUSINESS
          </p>
        </section>

        <footer className={styles.statusBar}>
          <span className={styles.statusLeft}>Click Menu to open Screen</span>
          <span className={styles.statusCenter}>2023-2024</span>
          <div className={styles.statusRight}>
            <span>NAMAKKAL BROILERS</span>
            <span>VKPOS @ 02:06 PM | Client</span>
            <span>Version : 4.6</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
