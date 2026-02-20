import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.board}>
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
