# Project Structure

This project uses Next.js App Router with route groups and feature-oriented folders.

## Routes (`app/`)

- `app/layout.tsx`: Root layout.
- `app/globals.css`: Global styles.
- `app/(marketing)/page.tsx`: Landing page route (`/`).
- `app/(auth)/login/page.tsx`: Login page route (`/login`).

`(marketing)` and `(auth)` are route groups used for organization and do not change URL paths.

## Shared UI (`components/`)

- `components/ui/`: Reusable presentational UI components (buttons, inputs, cards).
- `components/layout/`: Reusable layout components (header, footer, wrappers).

## Features (`features/`)

- `features/auth/`: Auth-specific UI and logic.
- `features/landing/`: Landing-page-specific sections and logic.

## Utilities (`lib/`)

- `lib/utils/`: Generic helpers and utility functions.
- `lib/config/`: App-level configuration constants.

## Other folders

- `services/`: API clients / data access layer.
- `hooks/`: Shared React hooks.
- `types/`: Global TypeScript types and interfaces.
- `public/`: Static assets.
