# ERP Client

The web frontend of the ERP system. It is the browser port of the NexERP Qt
desktop client and covers masters, sales and billing, tills and the cash office,
accounts, stock, reports, settings and the print designer. It talks to the NestJS
API in the sibling [ERP-Server](https://github.com/vksoftnkl/ERP-Server) repo.

| | |
| --- | --- |
| Production | https://169-58-213-171.sslip.io/ (branch `dev`, deployed by hand on the VPS) |
| API | same origin, under `/api/v1` |
| Working branch | `dev` (`main` is the PR target) |

## Stack

Next.js 16 (App Router; Turbopack in dev) · React 19 · TypeScript 5.9 · Redux
Toolkit + RTK Query (redux-saga for a few flows) · react-hook-form + zod ·
TanStack Table / Virtual · SCSS and CSS Modules, plus Tailwind v4 · Vitest.

Node 22 everywhere: CI uses 22.x and production runs 22.23. Install with `npm ci` so
the versions in `package-lock.json` are the ones you get (`next`, `react` and
`typescript` are `latest` in `package.json`).

## What's in the app

| Area | Routes | Code |
| --- | --- | --- |
| Masters: items, parties, ledgers, tax, users, and the grid / dropdown / UI-table designers | `/master/*` | `features/masters` |
| Sales: quotation, sale order, sale bill, bill delivery, temp credits, loyalty points | `/sales/*` | `features/sales` |
| Tills: till masters, counters, sessions, business day, cash office, approvals, till reports | `/sales/till/*`, `/sales/till-masters` | `features/sales/till`, `features/sales/till-masters` |
| Accounts: vouchers, receipt and payment, cheques, opening balance, settlement | `/accounts/*` | `features/accounts` |
| Stock: opening stock, physical stock, adjustment, selling price | `/stock/*` | `features/stocks` |
| Reports: day summary, ledger statement, party outstanding | `/reports/*` | `features/reports` |
| Settings: app settings, themes, GST, ledger map, print templates and assignments | `/settings/*` | `features/settings`, `features/printing` |
| Print designer | `/print-designer/*` | `features/print-designer` |

`/` sends a signed-out visitor to `/login` and a signed-in one to `/home`.
`/sales/testbill` is a parallel build of the sale bill against the REV 2 plan.
`/dev/nex-dropdown`, `/ui-library` and `/erp-data-demo` are developer showcases.

## Local development

You need Node 22 and a local ERP-Server running over HTTPS on port 3011, with its
Postgres and Redis. mkcert is optional; `cert:local` falls back to openssl.

```bash
npm ci
npm run cert:local     # writes certs/localhost.crt + .key (gitignored)
echo 'NEXT_PUBLIC_API_BASE=https://127.0.0.1:3011/api/v1' > .env.local
npm run dev            # https://localhost:3000
```

- **Serve the client over HTTPS.** The API only speaks TLS. When the page is
  served over plain HTTP, `resolveApiBase()` (`lib/api/client.ts`, duplicated in
  `hooks/useApi.ts`) rewrites an `https://` API base to `http://`, and every
  request fails. `dev:http` and `start:http` only work against an API that also
  runs over HTTP.
- Without `NEXT_PUBLIC_API_BASE` the client guesses `https://<page host>:3010/api/v1`.
  The local server listens on 3011, so set the variable.
- **LAN access:** `next dev` accepts `192.168.0.*` origins, and a localhost API
  base is rewritten to the page's host. The server's certificate only covers
  `localhost` and `127.0.0.1`, so LAN browsers need that certificate regenerated
  with the LAN IP.
- A running process keeps the certificate it started with. Restart it after
  `cert:local`.
- If every route returns 500 with a CSS parse error at `app/globals.css`, stop
  the dev server and `rm -rf .next`. Tailwind v4 scans `.next/dev/logs`, so a
  malformed class-like string in the log keeps regenerating itself. For the same
  reason, never point a second dev server at a dist directory that `.gitignore`
  does not cover.

### Scripts

| Script | What it does |
| --- | --- |
| `dev` | Turbopack dev server over HTTPS using `certs/localhost.*` |
| `dev:http` | The same over plain HTTP |
| `dev:webpack` | HTTPS dev server on webpack (CI builds with webpack) |
| `build` | `next build` |
| `start` | Runs the build gate, then `next start` on `0.0.0.0:$PORT` (default 3000) over plain HTTP. Production runs this |
| `start:https`, `start:local-https` | A production build over HTTPS through `https-server.cjs` |
| `start:http` | `next start` without the build gate |
| `cert:local` | Generates the local TLS certificate |
| `test`, `test:watch` | Vitest |
| `typecheck` | `tsc --noEmit` |
| `lint`, `lint:fix` | ESLint (see [Known issues](#known-issues)) |
| `gen:printing-types` | Regenerates `features/printing/types/printing.generated.ts` from a running API's OpenAPI documents |
| `gen:print-vocab` | Regenerates the print designer's palette vocabulary from the server's schema (needs the sibling server checkout) |

The build gate is `scripts/ensure-build.js`. It rebuilds when a source file is
newer than `.next/BUILD_ID`, or when the `NEXT_PUBLIC_*` values differ from the
ones the last build baked in.

### Tests

`npm test` runs Vitest in a Node environment over the `*.test.ts` files in
`domain/`, `features/`, `lib/`, `components/` and `store/`. They test pure logic
(the pricing engine, payload builders, reducers, validation); nothing renders
React.

The `*.integration.test.ts` files call a real API and are skipped unless their
variables are set (`CHEQUES_IT_*`, `OPENING_IT_*`, `PRINTING_IT_*`,
`USER_ADMIN_IT_*`). The comment at the top of each file lists what it needs.

## Environment variables

`.env`, `.env.local` and `.env.production` are all gitignored.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | build | API base URL including `/api/v1`. It is inlined into the bundle at build time, so a change needs a rebuild |
| `NEXT_DIST_DIR` | build | Build output directory (default `.next`). Deploys build into `.next-build` and swap it in |
| `PORT`, `HOST` | `start`, `start:https` | Listen port (default 3000) and host |
| `HTTPS_CERT_PATH`, `HTTPS_KEY_PATH`, `HTTPS_PASSPHRASE` | `start:https` | Defaults to `certs/localhost.crt` and `.key` |
| `GOOGLE_TRANSLATE_PROJECT_ID`, `_CLIENT_EMAIL`, `_PRIVATE_KEY` | `/api/tamil/suggest` | Optional. Tamil suggestions through Cloud Translation Advanced. Unset means the built-in transliteration is used. Also `_LOCATION` (`global`), `_SOURCE_LANGUAGE` and `_TARGET_LANGUAGE` (`ta`), `_TIMEOUT_MS` (`4000`) |
| `GST_LOOKUP_*` | `/api/gst/search` | Legacy GSTIN lookup handler. The UI now calls the API's own `/gst/search` |
| `NEXT_PUBLIC_ENABLE_FIGMA_CAPTURE` | build | `true` loads Figma's html-to-design capture script. Leave it unset |

## Project layout

```text
app/               routes (App Router), one folder per menu area; api/ holds the gst and tamil route handlers
features/<area>/   screens, domain logic, API slices and tests for each module
components/        shared UI: layout (header, menu), master (CrudMasterPage + modal forms), txn, design-system, library, feedback
lib/               API client, configured grid/dropdown/UI-table registries, data freshness, permissions, navigation, screen memory, UI scale, notify
store/             Redux Toolkit store, RTK Query base API, slices, sagas
domain/pricing/    document pricing engine (quotation, order, bill)
hooks/, services/  shared hooks (useApi) and older service wrappers
styles/library/    SCSS tokens for components/library
docs/              quotation user guide; live-sync SQL
plan/              Qt parity plans
scripts/           build gate, cert and codegen scripts, legacy CloudJiffy deploy script
```

## Before you build a screen

- **Screen configuration lives in the database.** Lists, popups, dropdowns and
  entry grids take their SQL and columns from Grid Master, Dropdown Master and UI
  Table Master rows. Those rows are looked up **by name** (`lib/configured-grids`,
  `lib/configured-dropdowns`, `lib/ui-tables`), so never hardcode an id. When a
  name is missing from the target database, the screen shows "No matches" or an
  empty grid with no error. See [Live config sync](#live-config-sync).
- **Menu:** the database supplies the menu tree. `DEFAULT_PRIMARY_MENU` in
  `components/layout/constants.ts` maps each label to a route and icon. A route is
  permission-gated only after it is listed there.
- **UI scale:** the whole UI scales with `zoom` on `<html>` (`lib/ui-scale.ts`).
  Divide new `vw`/`vh` values by `var(--erp-ui-scale)`. Convert
  `getBoundingClientRect()` and pointer coordinates with `toLayoutPx`. Use
  container queries, not `@media`, for layout breakpoints.
- **Messages** go through `@/lib/notify`, which shows one central popup. Do not
  use toasts.
- **Freshness:** saves reach other open screens without any extra code. The
  client listens to the API's `/data-changes/stream` feed and revalidates when the
  window regains focus (`lib/data-freshness`).
- **Capitalization:** free-text inputs are uppercased according to the
  `system.font_capitalization` setting. To opt a field out, add
  `data-uppercase="off"`.

## Deployment

### Production

The frontend and the API run on one Ubuntu 24.04 VPS and share one origin,
https://169-58-213-171.sslip.io/, behind nginx with a Let's Encrypt certificate.
Because they share an origin, there is no CORS entry and only one certificate.

```text
nginx :443
  /api/v1, /api/docs  ->  API       127.0.0.1:3000   ERP-Server, /opt/erp-server, branch DEV-v1
  everything else     ->  frontend  127.0.0.1:3001   this repo,  /opt/erp-front/app, branch dev
```

The API location must stay `/api/v1`, never `/api`, because this app serves its
own `/api/gst` and `/api/tamil` route handlers.

None of the following files are in this repo. They live only on the server:

| Path | Purpose |
| --- | --- |
| `/opt/erp-front/app` | Clone of this repo on `dev`, pull-only |
| `/opt/erp-front/app/.env.production` | `NEXT_PUBLIC_API_BASE` (mode 600) |
| `/opt/erp-front/ecosystem.config.js` | PM2 app `erp-front`: runs `npm start` with `PORT=3001`. It sits outside the git tree so `git reset --hard` cannot overwrite it |
| `/opt/erp-front/bin/deploy.sh` | Redeploy script |
| `/etc/nginx/snippets/erp-proxy.conf` | The routing shown above |

PM2 runs as the `erp-front` user under the systemd unit `pm2-erp-front.service`.
The API runs separately under its own user; see the ERP-Server README for its
deployment.

### Deploying a new version

Pushing to `dev` does **not** update production. After you push, run:

```bash
ssh root@<vps-host> 'cd /opt/erp-front && sudo -u erp-front HOME=/opt/erp-front /opt/erp-front/bin/deploy.sh dev'
```

`deploy.sh` does the following:

1. `git fetch` and `git reset --hard origin/dev`.
2. `npm ci --omit=dev`, but only when `package.json` or the lockfile changed, or
   when HEAD did not move (a forced redeploy).
3. Refuses to build if `.env.production` has no `NEXT_PUBLIC_API_BASE`. Without
   it the bundle would point at localhost.
4. Builds into `.next-build` with `ensure-build.js --strict`. A failed build
   fails the deploy; it never falls back to the old bundle.
5. Swaps `.next-build` into `.next` and keeps the previous build as `.next.previous`.
6. Runs `pm2 reload` and `pm2 save`, then waits up to 90 s for a 200 on `:3001`.

The old bundle keeps serving the site during the build, and a failed build
changes nothing.

To roll back, run as `erp-front` from `/opt/erp-front`:

```bash
cd app && mv .next .next.failed && mv .next.previous .next && pm2 reload erp-front
```

To see which commit is live, run
`git -c safe.directory='*' -C /opt/erp-front/app log -1 --oneline`.

Traps:

- `NEXT_PUBLIC_API_BASE` is baked in at build time. After you edit
  `.env.production`, rerun `deploy.sh`. A PM2 restart alone keeps the old value:
  the build gate cannot see `.env.production`, so it does not rebuild.
- Run PM2 commands as `erp-front` from `/opt/erp-front`. Run from root's home
  directory, the daemon fails with a misleading `spawn /usr/bin/node EACCES`.
- The deploy installs only production dependencies. Anything `next build` needs
  (TypeScript, `@types/*`, Tailwind, PostCSS, Sass) must stay in `dependencies`.
  `tsconfig.build.json` keeps test files and `vitest.config.ts` out of the
  production typecheck.
- Production must run `npm start`, never `next start` directly, because only
  `npm start` runs the build gate.
- `next build` peaks at about 1 GB of memory. `deploy.sh` sets
  `--max-old-space-size=2048`.

### Live config sync

Grid, dropdown and UI-table rows are made with the designer screens in the dev
database, and no migration carries them to live. Having the same commit on both
sides proves nothing here: compare the config tables by name.

When a screen depends on new configuration rows:

1. Generate a sync script into `docs/live-sync/`. It should upsert by name and
   device type, keep the dev id when it is free on live, and reset the sequences.
   Use `docs/live-sync/2026-10-15-till-grids.sql` as the pattern.
2. Back up the `fixed.*` tables the script touches.
3. Apply the script to the live database after the deploy.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, `master`
and `dev`. The order is typecheck, lint, test, then a webpack build. Every gate
runs even when an earlier one fails, so one run reports every problem.

The workflow also has a `deploy` job for pushes to `dev`, which connects over SSH
to the old CloudJiffy node. That environment no longer exists (the URL answers
`502 No such environment`), so the job cannot succeed. It never reaches
production.

## Known issues

- **`npm run lint` fails before any change.** ESLint crashes on
  `ecosystem.config.cjs` ("react-hooks" plugin not defined): the config applies
  the rule to every file but registers the plugin only for JS/TS globs. With that
  file ignored, the repo is still over the `--max-warnings=344` budget. Until this
  is fixed, the CI lint gate stays red. Lint only the files you touch:
  `npx eslint <files>`.
- **The CI deploy job targets the retired CloudJiffy node** (see [CI](#ci)).

## Legacy: CloudJiffy

`ecosystem.config.cjs`, `scripts/deploy-on-node.sh` and the CI `deploy` job were
written for the earlier CloudJiffy (Jelastic) deployment at
`vknexttimber-front.cloudjiffy.net`, which has been retired. They are still in
the repo, but nothing uses them. The VPS setup reuses their approach: the build
gate, the scratch-directory build and swap, and the health check.

## More documentation

- `docs/quotation-module-guide.html` / `.pdf`: user guide for the quotation screen.
- `plan/*.md`: Qt parity plans (company and branch, sale order, stocks).
- `PROJECT_STRUCTURE.md`, `REUSABLE_COMPONENTS.md`, `REDUX_USAGE_PLAN.md`: early
  design notes. Some of their details, such as the route list, are out of date.
