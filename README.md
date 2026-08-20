# ERP Frontend

Frontend web application for the ERP client, built with Next.js App Router and TypeScript.

## Tech Stack

- Next.js
- React
- TypeScript
- CSS Modules
- Tailwind CSS
- SCSS (Sass)

## Current Screens

- `/` -> Marketing landing page
- `/login` -> Sign-in page
- `/dashboard` -> ERP dashboard UI
- `/ui-library` -> Custom Tailwind + SCSS component library showcase

## Key Capabilities

- Theme toggle with persisted user preference (`light` / `dark`)
- Reusable API hooks for GET and mutations in `hooks/useApi.ts`
- Feature-oriented folder structure for scaling modules
- Token-driven UI library at `styles/library` and `components/library`

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

App runs at `https://localhost:3000`.

### Production build

```bash
npm run build
npm run start
```

`npm run start` serves plain HTTP on `$PORT` (default `3000`), building first if no
production build exists. For local HTTPS use `npm run start:local-https` instead.

## Deploying to CloudJiffy (Jelastic Node.js layer)

- The app must serve **plain HTTP on port 3000** — TLS terminates at the platform
  NGINX balancer, and 3000 is the only application port the Jelastic Node.js layer
  whitelists (binding 8080 leaves the app healthy but unreachable: the balancer
  answers 502). `npm run start` already does both.
- `.env` is not committed, so `NEXT_PUBLIC_API_BASE` **must be set as an environment
  variable on the CloudJiffy node before the build runs** — it is baked into the
  client bundle at build time. Point it at the deployed API's public URL
  (e.g. `https://<backend-env>.cloudjiffy.net/api/v1`), never at a localhost address.
- The deployed API must allowlist this frontend's origin in its `CORS_ORIGINS`
  (see `ecosystem.config.js` in the ERP server repo).
- The node is launched by PM2 through `ecosystem.config.cjs`. Set
  **`PROCESS_MANAGER_FILE=ecosystem.config.cjs`** in the node's environment
  variables: without it `/usr/local/sbin/nodejs start` falls back to hunting for a
  `server.js`/`app.js`/`index.js` in the app root, finds none (this is a Next.js
  app), and the `nodejs.service` unit fails in milliseconds with no app running.
- `ecosystem.config.cjs` must run **`npm start`**, never
  `node_modules/next/dist/bin/next start`. Only `npm start` runs
  `scripts/ensure-build.js`, which is what turns a pulled commit into a served
  bundle. Pointing PM2 at the Next binary directly means a `git pull` lands new
  code on disk that the browser never sees -- and a hard failure (exit 1, 502 at
  the balancer) whenever `.next/BUILD_ID` is absent.
- Confirm a real build exists after deploying: `.next` should be tens of MB and
  contain `BUILD_ID`. A `.next` of a few hundred KB means there is no build.
- `max_memory_restart` must stay above ~1.5G. `next build` peaks near 1 GB and
  runs inside the PM2 process tree, so a 1G ceiling kills it mid-build in a loop.
- A `.env.production` on the node does **not** override a `NEXT_PUBLIC_*` variable
  already set in the platform environment -- Next.js leaves existing `process.env`
  values alone. If the two disagree, the dashboard variable is what gets baked in.

## Environment Variables

Use `.env.local` for local config.

- `NEXT_PUBLIC_API_BASE` (optional): Base URL used by API hooks in `hooks/useApi.ts`
  - If not set, the app auto-targets `https://<current-host>:3010/api/v1`, which works for LAN access when frontend and backend run on the same machine.
- `HTTPS_CERT_PATH` (optional): Cert path for `npm run start`
- `HTTPS_KEY_PATH` (optional): Key path for `npm run start`
- `HTTPS_PASSPHRASE` (optional): Passphrase for encrypted private keys
- `GOOGLE_TRANSLATE_PROJECT_ID` (optional): Google Cloud project ID used for Tamil transliteration suggestions
- `GOOGLE_TRANSLATE_CLIENT_EMAIL` (optional): Service account client email for Cloud Translation Advanced
- `GOOGLE_TRANSLATE_PRIVATE_KEY` (optional): Service account private key for Cloud Translation Advanced
- `GOOGLE_TRANSLATE_LOCATION` (optional): Translation location, defaults to `global`
- `GOOGLE_TRANSLATE_SOURCE_LANGUAGE` (optional): Source language code, defaults to `ta`
- `GOOGLE_TRANSLATE_TARGET_LANGUAGE` (optional): Target language code, defaults to `ta`
- `GOOGLE_TRANSLATE_TIMEOUT_MS` (optional): Upstream request timeout in milliseconds, defaults to `4000`

Example:

```bash
NEXT_PUBLIC_API_BASE=https://api.example.com
```

Tamil suggestions can be backed by Google Cloud Translation Advanced by adding a service account to `.env.local`:

```bash
GOOGLE_TRANSLATE_PROJECT_ID=your-gcp-project-id
GOOGLE_TRANSLATE_CLIENT_EMAIL=translator@your-gcp-project-id.iam.gserviceaccount.com
GOOGLE_TRANSLATE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_TRANSLATE_LOCATION=global
GOOGLE_TRANSLATE_SOURCE_LANGUAGE=ta
GOOGLE_TRANSLATE_TARGET_LANGUAGE=ta
```

If these variables are not set, the app falls back to the built-in local Tamil transliteration logic.

## Project Structure

```text
app/
  (marketing)/page.tsx     # Landing page route "/"
  (auth)/login/page.tsx    # Login route "/login"
  (auth)/dashboard/page.tsx # Dashboard route "/dashboard"
components/
  ui/
hooks/
  useApi.ts
features/
lib/
services/
types/
```

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

- Runs on push and pull requests to `main` and `master`
- Installs dependencies and performs a production build
