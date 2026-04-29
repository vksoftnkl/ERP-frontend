# Redux Usage Plan

## Goal

Introduce Redux only where the application has shared, cacheable, or cross-route state. Use `Redux Toolkit` for client state and `RTK Query` for shared server state. Keep short-lived form and interaction state in local React state.

## Current-State Findings

- The app already mounts a Redux provider at the root in `app/layout.tsx`.
- The store currently contains one slice only: `store/slices/gridColumnsSlice.ts`.
- `@reduxjs/toolkit` and `react-redux` are installed and active.
- `zustand` is installed in `package.json` but there is no runtime usage in the client code.
- There is no `RTK Query` setup yet.
- The client currently uses `useApi` heavily for request state. Repository scan found about `140` `useApi(...)` call sites.
- `useApi` performs cache refresh with a custom browser event (`erp:api-data-invalidated`) instead of Redux-managed invalidation.
- Authentication is mirrored in the Redux store and persisted through cookie-backed helpers in `lib/auth/session.ts`.
- Shared master pages already converge in `components/master/crud-master-page.tsx`, which is reused by about `25` master screens. This is the best migration point for broad Redux adoption.
- Several large screens still keep substantial duplicated local request and lookup state:
  - `features/masters/account-ledger/page.tsx`
  - `features/masters/customer/page.tsx`
  - `features/masters/suppliers/page.tsx`
  - `features/masters/item/item-master-page.tsx`
  - `features/stocks/opening-stock/page.tsx`
  - `features/masters/grid-designer/page.tsx`
  - `features/masters/dropdown-designer/page.tsx`
  - `features/masters/ui-table-designer/page.tsx`

## Recommended Redux Boundaries

### Put in Redux

- Auth session state, bootstrap status, and logout flow.
- Shared shell data used across the layout, such as menu master labels and user/session-aware header state.
- Lookup and reference data reused across screens, for example company, branch, state, tax, ledger, item, and godown options.
- Grid metadata and UI-table metadata shared by multiple pages.
- Shared server collections that benefit from caching, invalidation, and request deduplication.
- Cross-section state inside very large screens when the same data is read and updated by multiple child areas.

### Keep Local

- In-progress form field typing.
- Modal open or close flags.
- Focus, hover, expanded row, open dropdown, and temporary cell editor state.
- One-off page state that is not shared outside the page.

## Recommended Architecture

Use `Redux Toolkit` in two layers:

1. Plain slices for client-only application state.
2. `RTK Query` endpoints for shared API-backed state.

Suggested structure:

- `store/store.ts`
- `store/api/baseApi.ts`
- `store/api/authApi.ts`
- `store/api/lookupsApi.ts`
- `store/api/masterApi.ts`
- `store/api/designerApi.ts`
- `store/slices/authSlice.ts`
- `store/slices/uiSlice.ts`
- `store/selectors/*`

## Why RTK Query Instead of More Async Thunks

- The main issue in this client is duplicated request state, not a lack of dispatch calls.
- `useApi` already acts like a lightweight data layer; `RTK Query` is the Redux-native replacement for that role.
- It gives request deduplication, cache lifetime control, tag-based invalidation, and generated loading/error flags without repeating the same patterns in each page.
- It removes the need for the current window event invalidation mechanism in `hooks/useApi.ts`.

## Phased Rollout

### Phase 1: Foundation

- Add a shared `baseApi` with auth-aware headers and common error handling.
- Register `baseApi.reducer` and `baseApi.middleware` in `store/store.ts`.
- Keep the existing `useApi` hook temporarily so migration can happen incrementally.
- Add typed selector and dispatch conventions for new slices and endpoints.

Success criteria:

- Redux and RTK Query can coexist without breaking current pages.
- New shared API work stops being added to `useApi`.

### Phase 2: Auth and Shell State

- Create `authSlice` for token presence, auth bootstrap status, and logout actions.
- Refactor `app/(auth)/login/page.tsx` to dispatch auth success instead of writing session state directly.
- Refactor `components/auth/global-route-guard.tsx` to read auth state from the store.
- Refactor `components/layout/erp-header.tsx` logout flow to dispatch store-owned logout logic.
- Keep cookie persistence behind shared helpers so route guards and API clients do not read browser storage directly.

Success criteria:

- No route guard reads auth state directly from browser storage.
- Login and logout flows are driven by Redux state changes.

### Phase 3: Shared Lookup and Metadata Caching

- Move high-reuse lookups to `lookupsApi`.
- Start with menu master labels, company, branch, state, ledger, item, and godown lookups.
- Migrate grid metadata loading from `gridColumnsSlice` toward RTK Query endpoints, or keep the slice only as a temporary compatibility layer.
- Replace custom browser-event invalidation with endpoint tags.

Primary migration targets:

- `components/layout/erp-header.tsx`
- `components/master/crud-master-page.tsx`
- `features/stocks/opening-stock/page.tsx`
- `features/masters/item/item-master-page.tsx`

Success criteria:

- Reused lookups are fetched once per cache key instead of once per page mount.
- Grid and lookup refresh behavior is handled by RTK Query invalidation.

### Phase 4: Generic Master CRUD

- Refactor `features/masters/shared/use-master-crud.ts` and `components/master/crud-master-page.tsx` to consume RTK Query list, detail, create, update, and delete operations.
- Keep search text, current page, and modal visibility local at first unless route persistence is required.
- If list filters need to survive route changes, add a small `uiSlice` or `masterPageSlice` keyed by route or module name.

Primary migration targets:

- Reusable CRUD pages first, because one migration point affects many screens.
- Good initial modules: `city`, `unit`, `tax`, `branches`, `gsp-provider`, `employee-department`.

Success criteria:

- Reusable CRUD screens no longer manage repeated request/loading/error logic through local hooks.
- Mutations refresh list data through endpoint invalidation instead of custom event listeners.

### Phase 5: Designer Modules

- Move `grid-designer`, `dropdown-designer`, and `ui-table-designer` to dedicated RTK Query endpoints.
- Keep active row editing local, but store fetched definitions and mutation lifecycle in Redux.
- If row sets become large and heavily edited, use `createEntityAdapter` for normalized column state inside a feature slice.

Success criteria:

- Designer pages stop duplicating fetch/save/delete boilerplate.
- Shared metadata can be reused by other screens without new fetch code.

### Phase 6: Large Composite Screens

- Migrate the most state-heavy pages after the shared foundation is stable.
- Prioritize:
  - `features/masters/account-ledger/page.tsx`
  - `features/masters/customer/page.tsx`
  - `features/masters/suppliers/page.tsx`
  - `features/masters/item/item-master-page.tsx`
  - `features/stocks/opening-stock/page.tsx`
- Use Redux only for data that is shared across sections or should survive internal navigation.
- Keep raw form editing local unless draft persistence becomes a requirement.

Success criteria:

- Shared lookups, related records, and metadata come from selectors or RTK Query hooks.
- Large pages lose duplicated request orchestration code without turning every input into global state.

### Phase 7: Cleanup

- Remove or deprecate the custom invalidation event in `hooks/useApi.ts`.
- Reduce remaining `useApi` usage to purely local transitional cases, then remove it.
- Remove unused `zustand` dependency if it remains unused after migration.
- Add store-level tests for selectors, reducers, and endpoint invalidation behavior.

Success criteria:

- Shared application state has one clear ownership model.
- There is no parallel global-state approach left in the client.

## Priority Order

1. Auth and shell.
2. Shared lookups and grid metadata.
3. Reusable CRUD page infrastructure.
4. Designer modules.
5. Large composite pages.

## Guardrails

- Do not move every `useState` to Redux. That would increase coupling and make forms harder to maintain.
- Prefer RTK Query for API data and plain slices for UI state.
- Migrate through shared abstractions first. `CrudMasterPage` and shared lookup loaders give the highest return.
- Keep the rollout incremental so old and new patterns can coexist safely during migration.

## Definition of Done

- Auth state is store-driven.
- Shared lookups and metadata are cached in Redux or RTK Query.
- `CrudMasterPage` no longer depends on repeated per-page request wiring.
- Custom window-event invalidation is removed.
- Unused state libraries are removed.
- New feature work follows the Redux boundary rules above.
