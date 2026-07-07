"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateClientDeviceId, setAuthUserId } from "@/lib/auth/session";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import {
  canUseClientSideRouting,
  normalizeInternalRoute,
} from "@/lib/navigation/safe-route";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useLoginMutation } from "@/store/api/authApi";
import "./login-global.css";
import styles from "./login.module.css";

async function getClientIp(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json() as { ip?: string };
    return data.ip ?? "";
  } catch {
    return "";
  }
}
type Errors = {
  username?: string;
  password?: string;
};
function normalizeNextRoute(nextRoute: string | null): string {
  const normalizedRoute = normalizeInternalRoute(nextRoute, "/");
  return normalizedRoute.startsWith("/login") ? "/" : normalizedRoute;
}
export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [login, { isLoading, error }] = useLoginMutation();
  const loginError = getApiErrorMessage(error);
  const validate = () => {
    const next: Errors = {};
    const username = values.username.trim();
    if (!username) next.username = "Enter your email or username.";
    if (!values.password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setAuthError(null);
    try {
      const ip = await getClientIp();
      const response = await login({
        usrLoginName: values.username.trim(),
        usrPassword: values.password,
        device_id: getOrCreateClientDeviceId() ?? undefined,
        app_version: "v1",
        ip_address: ip,
        device_type: "Web",
      }).unwrap();
      setAuthUserId(response.userId ?? null);
      if (!response.authenticated) {
        setAuthError("Token missing in login response.");
        notifyGlobalNavigationStart();
        if (canUseClientSideRouting()) {
          router.replace("/login");
        } else {
          window.location.replace("/login");
        }
        return;
      }
      const nextRoute = normalizeNextRoute(
        new URLSearchParams(window.location.search).get("next")
      );
      notifyGlobalNavigationStart();
      if (!canUseClientSideRouting()) {
        window.location.assign(nextRoute);
        return;
      }
      router.push(nextRoute);
    } catch {
      // Error state is surfaced by the RTK Query mutation hook.
    }
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: "" }));
    setAuthError(null);
  };
  return (
    <main className={styles.stage}>
      <div className={styles.shell}>
        {/* Brand panel (left) - hidden on mobile */}
        <aside className={styles.brand} aria-label="VK Nex ERP modules">
          <div className={styles.brandTop}>
            <svg className={styles.mark} viewBox="0 0 132 84" fill="none" aria-label="VK Softwares">
              <rect x="2" y="2" width="128" height="80" rx="16" fill="none" strokeWidth="1.5" opacity="0.55" />
              <path className={styles.v} d="M24 24 L45 60 L66 24" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <path className={styles.k} d="M86 24 L86 60 M86 42 L110 24 M86 42 L110 60" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.wordmark}>
              VK Nex ERP<small>VK Softwares</small>
            </span>
          </div>
          <div className={styles.brandMid}>
            <h1>One system for billing, stock, and <span>GST — end to end.</span></h1>
            <div className={styles.modules}>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><path d="M6 2.5h9l3.5 3.5v15.5h-12.5z" /><path d="M15 2.5v3.5h3.5" /><path d="M9 10.5h6M9 13.5h6M9 16.5h3.5" /></svg>
                <b>Sales &amp; Invoicing</b>
                <i>E-invoice · IRN</i>
              </div>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 3v9M4 7.5l8 4.5 8-4.5M12 12l0 9" opacity="0.85" /></svg>
                <b>Inventory</b>
                <i>Multi-UOM · Batch</i>
              </div>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><path d="M7 4h10M7 8.5h10M7 4c4 0 6.5 1.6 6.5 4.5S11 13 7 13l6.5 7" /></svg>
                <b>GST Returns</b>
                <i>GSTR-1 · E-way bill</i>
              </div>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>
                <b>Receivables</b>
                <i>Outstanding · Ageing</i>
              </div>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><path d="M4 20.5h16.5" /><path d="M6.5 20.5v-7M11.5 20.5V6.5M16.5 20.5v-10.5" /></svg>
                <b>Reports</b>
                <i>Day book · P&amp;L</i>
              </div>
              <div className={styles.module}>
                <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.5-3.5M4 13a8 8 0 0 0 14.5 3.5" /><path d="M5.5 3.5v4h4M18.5 20.5v-4h-4" /></svg>
                <b>Tally Sync</b>
                <i>Two-way · XML</i>
              </div>
            </div>
          </div>
          <div className={styles.brandFoot}>
            <span>© 2026 VK Softwares · Trichy</span>
            <span>v1.0.0</span>
          </div>
        </aside>
        {/* Mobile header */}
        <div className={styles.mhead}>
          <svg viewBox="0 0 132 84" fill="none" aria-hidden="true">
            <path d="M24 24 L45 60 L66 24" stroke="#EBC06A" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M86 24 L86 60 M86 42 L110 24 M86 42 L110 60" stroke="#FBEEEA" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.wordmark}>VK Nex ERP</span>
        </div>
        {/* Login panel (right) */}
        <section className={styles.panel} aria-label="Sign in">
          <div className={styles.forminner}>
            <h2>Sign in</h2>
            <p className={styles.sub}>to access VK Nex ERP</p>
            <form onSubmit={onSubmit} noValidate>
              <div className={`${styles.field} ${errors.username ? styles.invalid : ""}`} id="f-user">
                <label htmlFor="user">Email or username</label>
                <div className={styles.control}>
                  <input
                    id="user"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="you@company.in"
                    value={values.username}
                    onChange={onChange}
                    autoFocus
                  />
                </div>
                <div className={styles.err}>{errors.username}</div>
              </div>
              <div className={`${styles.field} ${styles.pw} ${errors.password ? styles.invalid : ""}`} id="f-pass">
                <label htmlFor="pass">Password</label>
                <div className={styles.control}>
                  <input
                    id="pass"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={values.password}
                    onChange={onChange}
                  />
                  <button
                    type="button"
                    className={styles.reveal}
                    id="reveal"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className={styles.err}>{errors.password}</div>
              </div>
              <button
                type="submit"
                className={styles.cta}
                id="signin"
                data-loading={isLoading ? "true" : "false"}
                disabled={isLoading}
              >
                Sign in
                <span className={styles.spinner} aria-hidden="true"></span>
              </button>
              <div className={styles.aux}>
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    id="remember"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Keep me signed in
                </label>
                <a className={styles.link} href="#">Forgot password?</a>
              </div>
              {(loginError || authError) && (
                <div className={`${styles.notice} ${styles.show}`}>
                  {loginError || authError}
                </div>
              )}
              <p className={styles.formfoot}>Accounts are provisioned by your administrator.</p>
              <p className={styles.panelfoot}>
                <a href="#">Privacy</a> <span className={styles.sep}>·</span>
                <a href="#">Terms</a> <span className={styles.sep}>·</span>
                Help
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}