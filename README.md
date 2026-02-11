# ERP Frontend

Frontend web application for the ERP client, built with Next.js App Router and TypeScript.

## Tech Stack

- Next.js
- React
- TypeScript
- CSS Modules
- Tailwind CSS (dependency installed)

## Current Screens

- `/` -> Marketing landing page
- `/login` -> Sign-in page
- `/dashboard` -> ERP dashboard UI

## Key Capabilities

- Theme toggle with persisted user preference (`light` / `dark`)
- Reusable API hooks for GET and mutations in `hooks/useApi.ts`
- Feature-oriented folder structure for scaling modules

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

App runs at `http://localhost:3000`.

### Production build

```bash
npm run build
npm run start
```

## Environment Variables

Use `.env.local` for local config.

- `NEXT_PUBLIC_API_BASE` (optional): Base URL used by API hooks in `hooks/useApi.ts`

Example:

```bash
NEXT_PUBLIC_API_BASE=https://api.example.com
```

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
