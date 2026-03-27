"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { extractAuthToken, setAuthSession } from "@/lib/auth/session";
import {
  canUseClientSideRouting,
  normalizeInternalRoute,
} from "@/lib/navigation/safe-route";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useLoginMutation } from "@/store/api/authApi";
import { useAppDispatch } from "@/store/hooks";
import { authSessionChanged } from "@/store/slices/authSlice";

type Errors = {
  username?: string;
  password?: string;
};

function normalizeNextRoute(nextRoute: string | null): string {
  const normalizedRoute = normalizeInternalRoute(nextRoute, "/");
  return normalizedRoute.startsWith("/login") ? "/" : normalizedRoute;
}

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [values, setValues] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [login, { isLoading, error }] = useLoginMutation();
  const loginError = getApiErrorMessage(error);

  const validate = () => {
    const next: Errors = {};
    const username = values.username.trim();

    if (!username) next.username = "User Name is required.";
    else if (username.length < 3) next.username = "Minimum 3 characters.";

    if (!values.password) next.password = "Password is required.";
    else if (values.password.length < 4) next.password = "Minimum 4 characters.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setAuthError(null);

    try {
      const response = await login({
        user_name: values.username.trim(),
        user_password: values.password,
      }).unwrap();
      const token = extractAuthToken(response);
      const hasSession = setAuthSession(token);
      if (!hasSession) {
        setAuthError("Token missing in login response.");
        if (canUseClientSideRouting()) {
          router.replace("/login");
        } else {
          window.location.replace("/login");
        }
        return;
      }
      dispatch(authSessionChanged(token));

      const nextRoute = normalizeNextRoute(
        new URLSearchParams(window.location.search).get("next")
      );
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

  const inputBase =
    "w-full rounded-xl border px-3.5 py-2.5 text-[0.95rem] outline-none transition " +
    "placeholder:text-slate-500/80 " +
    "bg-white text-slate-900 border-slate-300/90 " +
    "focus:border-sky-500 focus:ring-4 focus:ring-sky-500/20";

  const inputError =
    "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/20";

  return (
    <main
      className={[
        "relative min-h-screen overflow-hidden",
        "grid place-items-center",
        "px-5 py-6 sm:px-6",
        "bg-[linear-gradient(145deg,#eef4fb_0%,#f8fafb_42%,#f4f8f4_100%)]",
        "bg-[radial-gradient(circle_at_14%_20%,#c9ecff_0%,transparent_48%),radial-gradient(circle_at_86%_82%,#d2f5d7_0%,transparent_50%),linear-gradient(145deg,#eef4fb_0%,#f8fafb_42%,#f4f8f4_100%)]",
        "font-sans",
      ].join(" ")}
    >
      {/* gradient orb */}
      <div
        aria-hidden
        className={[
          "pointer-events-none absolute -top-28 -right-20",
          "h-[22rem] w-[22rem] rounded-full blur-[64px] opacity-[0.22]",
          "bg-[radial-gradient(circle_at_30%_30%,#6fc8ff_0%,#1a91d2_76%)]",
          "animate-[drift_12s_ease-in-out_infinite]",
        ].join(" ")}
      />

      {/* card */}
      <section
        aria-labelledby="login-heading"
        className={[
          "relative w-full max-w-[28rem]",
          "rounded-[1.2rem] border p-6 sm:p-7",
          "bg-white/90 border-slate-900/10 shadow-[0_1.2rem_3rem_rgba(31,62,87,0.16)]",
          "backdrop-blur-[8px]",
          "animate-[rise_0.5s_ease_both]",
          "max-[480px]:rounded-[1rem] max-[480px]:p-[1.1rem]",
        ].join(" ")}
      >
        <div className="mb-5">
          <p className="mb-1 text-[0.72rem] font-bold tracking-[0.1em] text-sky-700 uppercase">
            ERP Client
          </p>

          <h1
            id="login-heading"
            className="m-0 text-[1.45rem] sm:text-[1.8rem] leading-tight font-semibold text-slate-900"
          >
            Login to your workspace
          </h1>

          <p className="mt-2 text-[0.94rem] text-slate-600">
            Continue with your assigned company credentials.
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid gap-3">
          {/* username */}
          <div>
            <label
              htmlFor="username"
              className="text-[0.84rem] font-semibold text-slate-700"
            >
              User Name
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="off"
              required
              value={values.username}
              onChange={onChange}
              placeholder="Enter user name"
              className={`${inputBase} ${errors.username ? inputError : ""}`}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-rose-600">
                {errors.username}
              </p>
            )}
          </div>

          {/* password */}
          <div>
            <label
              htmlFor="password"
              className="text-[0.84rem] font-semibold text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="off"
              required
              value={values.password}
              onChange={onChange}
              placeholder="Enter password"
              className={`${inputBase} ${errors.password ? inputError : ""}`}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-rose-600">
                {errors.password}
              </p>
            )}
          </div>

        

          {/* button */}
          <button
            type="submit"
            disabled={isLoading}
            className={[
              "mt-1 rounded-xl px-4 py-3 font-bold text-[0.96rem] text-white",
              "bg-[linear-gradient(120deg,#0d7ebf,#0b6ca4)]",
              "transition duration-150",
              "hover:-translate-y-[1px] hover:shadow-[0_0.6rem_1.4rem_rgba(13,126,191,0.28)]",
              "active:translate-y-0",
              "disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0",
            ].join(" ")}
          >
            {isLoading ? "LOGGING IN..." : "LOGIN"}
          </button>
          {loginError && (
            <p className="text-sm text-rose-600">{loginError}</p>
          )}
          {authError && (
            <p className="text-sm text-rose-600">{authError}</p>
          )}

        
        </form>
      </section>

      {/* Tailwind keyframes (works with arbitrary animate-[...]) */}
      <style jsx global>{`
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes drift {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-18px, 12px);
          }
        }
      `}</style>
    </main>
  );
}
