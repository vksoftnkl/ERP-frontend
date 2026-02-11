import Link from "next/link";
import styles from "./page.module.css";

const modules = [
  {
    title: "Inventory Intelligence",
    description:
      "Track stock movement in real time across warehouses, branches, and vendors.",
  },
  {
    title: "Finance and Billing",
    description:
      "Automate invoicing, reconciliation, and monthly close with clear audit trails.",
  },
  {
    title: "People Operations",
    description:
      "Manage attendance, payroll inputs, and approvals from one workflow.",
  },
];

const outcomes = [
  { value: "43%", label: "faster monthly close" },
  { value: "2.7x", label: "quicker approvals" },
  { value: "99.9%", label: "uptime availability" },
];

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.mesh} aria-hidden />
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          ERP Client
        </Link>
        <nav className={styles.nav}>
          <a href="#modules">Modules</a>
          <a href="#results">Results</a>
          <a href="#workflow">Workflow</a>
        </nav>
        <Link href="/login" className={styles.headerCta}>
          Sign In
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.kicker}>Operations Command Center</p>
          <h1>Run finance, inventory, and teams from one modern ERP platform.</h1>
          <p className={styles.subtitle}>
            Replace disconnected tools with one workflow engine your operations
            team can trust every day.
          </p>
          <div className={styles.heroActions}>
            <Link href="/login" className={styles.primaryButton}>
              Launch Workspace
            </Link>
            <a href="#workflow" className={styles.secondaryButton}>
              See Workflow
            </a>
          </div>
          <ul className={styles.trust}>
            <li>Role-based access</li>
            <li>Audit-ready logs</li>
            <li>Cloud backup every hour</li>
          </ul>
        </div>

        <div className={styles.heroPanel} aria-hidden>
          <article className={styles.metricCard}>
            <p>Daily Revenue</p>
            <h3>$182,430</h3>
            <span className={styles.positive}>+14.2% vs yesterday</span>
          </article>
          <article className={styles.queueCard}>
            <h4>Approval Queue</h4>
            <ul>
              <li>
                <span>Purchase Orders</span>
                <strong>12</strong>
              </li>
              <li>
                <span>Expense Claims</span>
                <strong>7</strong>
              </li>
              <li>
                <span>Payroll Revisions</span>
                <strong>3</strong>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section id="modules" className={styles.modules}>
        {modules.map((item) => (
          <article key={item.title} className={styles.moduleCard}>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section id="results" className={styles.results}>
        {outcomes.map((item) => (
          <article key={item.label}>
            <h3>{item.value}</h3>
            <p>{item.label}</p>
          </article>
        ))}
      </section>

      <section id="workflow" className={styles.workflow}>
        <h2>One connected workflow from request to reporting.</h2>
        <div className={styles.steps}>
          <article>
            <span>01</span>
            <h3>Capture</h3>
            <p>Collect requests from teams and vendors in structured forms.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Approve</h3>
            <p>Route tasks through policy-driven approval chains automatically.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Analyze</h3>
            <p>View operational KPIs and export clean reports in one click.</p>
          </article>
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Deploy your ERP workspace in minutes, not months.</h2>
        <Link href="/login" className={styles.primaryButton}>
          Start with Sign In
        </Link>
      </section>
    </main>
  );
}
