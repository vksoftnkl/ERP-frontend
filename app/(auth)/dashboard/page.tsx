import Link from "next/link";
import styles from "./page.module.css";

const kpis = [
  { label: "Revenue", value: "$1.82M", delta: "+6.4% MoM" },
  { label: "Open POs", value: "128", delta: "-12 pending" },
  { label: "Expenses", value: "$402k", delta: "+3.1% MoM" },
  { label: "Headcount", value: "214", delta: "+4 this month" },
];

const approvals = [
  { title: "Purchase Order", owner: "Operations", count: 18 },
  { title: "Expense Claims", owner: "Finance", count: 11 },
  { title: "Access Requests", owner: "IT", count: 6 },
  { title: "Payroll Adjustments", owner: "HR", count: 3 },
];

const activities = [
  { time: "09:24", text: "PO-4412 approved by Mira Patel" },
  { time: "08:58", text: "New warehouse added: South Hub" },
  { time: "08:31", text: "Expense report 2026-02 closed" },
  { time: "07:50", text: "Role update: AP Reviewer → AP Manager" },
];

export default function DashboardPage() {
  return (
    <main className={styles.page}>
      <div className={styles.mesh} aria-hidden />
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Control Tower</p>
          <h1>Dashboard</h1>
        </div>
        <div className={styles.actions}>
          <button className={styles.ghost}>Export</button>
          <button className={styles.primary}>New Request</button>
        </div>
      </header>

      <section className={styles.kpiGrid}>
        {kpis.map((item) => (
          <article key={item.label} className={styles.kpiCard}>
            <p>{item.label}</p>
            <h3>{item.value}</h3>
            <span>{item.delta}</span>
          </article>
        ))}
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Approvals</h2>
            <Link href="/login" className={styles.link}>
              View all
            </Link>
          </div>
          <ul className={styles.approvals}>
            {approvals.map((item) => (
              <li key={item.title}>
                <div>
                  <p className={styles.title}>{item.title}</p>
                  <p className={styles.muted}>{item.owner}</p>
                </div>
                <span className={styles.badge}>{item.count}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Activity</h2>
            <Link href="/login" className={styles.link}>
              View log
            </Link>
          </div>
          <ul className={styles.activity}>
            {activities.map((item) => (
              <li key={item.text}>
                <time>{item.time}</time>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Cash Flow</h2>
            <span className={styles.muted}>Trailing 6 weeks</span>
          </div>
          <div className={styles.chart} aria-hidden>
            {Array.from({ length: 12 }).map((_, idx) => (
              <span key={idx} style={{
                height: `${38 + ((idx * 37) % 52)}%`,
              }} />
            ))}
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.dotIncome} /> Income
            <span className={styles.dotExpense} /> Expense
          </div>
        </article>
      </section>
    </main>
  );
}
