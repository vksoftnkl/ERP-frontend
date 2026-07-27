import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        'erp-teal': '#0f766e',
        'erp-teal-dark': '#0d5c59',
        'erp-slate': '#0f172a',
        'erp-slate-light': '#f7fbfb',
        'erp-slate-lighter': '#f8fbfb',
        
        // Semantic colors
        'erp-surface': '#ffffff',
        'erp-surface-alt': '#f8fbfb',
      },
      backgroundColor: {
        'erp-page': 'linear-gradient(180deg, #f7fbfb 0%, #eef4f4 100%)',
        'erp-modal': 'linear-gradient(180deg, #ffffff 0%, #f8fbfb 100%)',
      },
      spacing: {
        'shell-offset': '132px',
      },
      minHeight: {
        'shell-offset': 'calc(100dvh - 132px)',
      },
      height: {
        'shell-offset': 'calc(100dvh - 132px)',
      },
      boxShadow: {
        'erp-panel': '0 18px 50px rgba(15, 23, 42, 0.08)',
        'erp-modal': '0 16px 40px rgba(15, 23, 42, 0.24)',
        'erp-tab-underline': '0 10px 18px -18px rgba(15, 23, 42, 0.45)',
      },
      borderColor: {
        'erp-border': 'rgba(15, 23, 42, 0.08)',
        'erp-border-subtle': 'rgba(15, 23, 42, 0.12)',
      },
      textColor: {
        'erp-text-subtle': 'rgba(15, 23, 42, 0.6)',
        'erp-text-muted': 'rgba(15, 23, 42, 0.65)',
      },
      backgroundImage: {
        'erp-gradient-teal': 'radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 34%)',
        'erp-gradient-modal': 'radial-gradient(circle at top right, rgba(15, 118, 110, 0.05), transparent 28%)',
      },
      fontSize: {
        'eyebrow': ['0.74rem', { lineHeight: '1', letterSpacing: '0.12em' }],
        'xs-compact': '0.84rem',
        'table-header': '0.86rem',
        'sm-compact': '0.92rem',
        'input': '0.94rem',
        'section-title': '1.05rem',
      },
      fontWeight: {
        'eyebrow': '700',
      },
      gridTemplateColumns: {
        'auto-fit-220': 'repeat(auto-fit, minmax(220px, 1fr))',
      },
      gap: {
        'form': '18px',
        'filter': '12px',
        'checkbox': '10px',
      },
      borderRadius: {
        'field': '14px',
        'pill': '999px',
      },
      // HEADS UP: nothing in this file is applied. The project is on Tailwind
      // v4, where app/globals.css does `@import "tailwindcss"` with no
      // `@config` directive, so this JS config is never loaded and none of the
      // named utilities below are emitted. Classes referencing them (`z-status`,
      // `rounded-pill`, `text-sm-compact`, …) silently produce no CSS.
      // For z-index specifically, use an arbitrary value pointing at the
      // overlay scale on :root — `z-[var(--erp-z-toast)]` — not a name here.
      zIndex: {
        'sticky': '1',
        'modal': '4',
        'status': '140',
        'modal-high': '2000',
      },
    },
  },
  plugins: [],
};

export default config;
