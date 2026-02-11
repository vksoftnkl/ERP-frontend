import Link from "next/link";
import styles from "./page.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.gradientOrb} aria-hidden />
      <section className={styles.card} aria-labelledby="login-heading">
        <div className={styles.brand}>
          <p className={styles.kicker}>ERP Client</p>
          <h1 id="login-heading">Sign in to your workspace</h1>
          <p className={styles.subtitle}>
            Continue with your assigned company credentials.
          </p>
        </div>

        <form className={styles.form}>
          <label htmlFor="email">Work Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />

          <div className={styles.row}>
            <label className={styles.check}>
              <input type="checkbox" name="remember" />
              <span>Remember me</span>
            </label>
            <a href="#" className={styles.link}>
              Forgot password?
            </a>
          </div>

          <button type="submit">Sign In</button>
        </form>

        <div className={styles.footer}>
          <p>Need access? Contact your administrator.</p>
          <Link href="/">Back to landing page</Link>
        </div>
      </section>
    </main>
  );
}
