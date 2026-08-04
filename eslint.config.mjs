import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat ESLint config.
 *
 * This codebase ran unlinted for its whole life, so the baseline is chosen to
 * be **green today**: CI can block on it from day one instead of landing a
 * few-thousand-warning backlog that everyone learns to ignore. Rules are graded
 * by what they buy:
 *
 *  - `error`  — catches real defects, and the codebase already complies.
 *  - `warn`   — worth fixing, too many existing hits to block a merge on.
 *  - `off`    — stylistic noise, or a pattern this codebase uses deliberately.
 *
 * Tighten by promoting a `warn` to `error` once its count reaches zero.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
      "https-server.cjs",
    ],
  },

  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // ── Correctness ──────────────────────────────────────────────────────
      // Hook-order violations are the single defect class that most reliably
      // produces the "works until it doesn't" bugs this app is prone to, given
      // 3,000-line screens with 40+ useState calls.
      "react-hooks/rules-of-hooks": "error",

      // ── Pre-existing backlog: warn, don't block ──────────────────────────
      // Each of these has a real hit count in code written before linting
      // existed. They are worth fixing but cannot gate a merge today; promote
      // to "error" as each reaches zero. Counts at the time this was written:
      //
      //   @typescript-eslint/no-unused-vars           102
      //   react-hooks/set-state-in-effect              81
      //   react-hooks/refs                             80
      //   react-hooks/exhaustive-deps                  61
      //   react-hooks/immutability                      9
      //   react-hooks/preserve-manual-memoization       3
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",

      // Dead locals are the cheapest signal for the copy-paste duplication in
      // features/**. Underscore-prefixed names stay legal as intent markers.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // The codebase is at ~1 `as any` and 0 `: any` annotations. Locking that
      // in now is free; letting it slip is not.
      "@typescript-eslint/no-explicit-any": "error",

      // ── Deliberate opt-outs ──────────────────────────────────────────────
      // `<img>` is used for base64 photo previews from the master forms, which
      // next/image cannot optimise anyway.
      "@next/next/no-img-element": "off",
    },
  },

  {
    // Tests and workflow-style scripts are allowed looser typing.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
