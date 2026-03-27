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

`npm run start` serves the client over HTTPS using cert/key files.
Default cert paths:
- `../ERP server/certs/server.crt`
- `../ERP server/certs/server.key`

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
