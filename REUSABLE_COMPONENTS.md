# Reusable Component Guide (ERP Client)

This document defines a reusable, component-based structure for the ERP frontend.

## 1. Shared UI Components (`components/ui`)

Use these as pure presentational building blocks:

- `button.tsx`
- `input.tsx`
- `select.tsx`
- `textarea.tsx`
- `card.tsx`
- `badge.tsx`
- `modal.tsx`
- `drawer.tsx`
- `table.tsx`
- `pagination.tsx`
- `tabs.tsx`
- `spinner.tsx`
- `skeleton.tsx`
- `empty-state.tsx`
- `toast.tsx`

Rule: keep these components stateless or minimally stateful, with no API calls.

## 2. Layout Components (`components/layout`)

Reusable layout wrappers:

- `app-shell.tsx` (sidebar + topbar + content area)
- `page-header.tsx` (title, breadcrumb, actions)
- `section.tsx` (consistent page section spacing/wrapper)

Rule: layout components control structure, not business logic.

## 3. Feature Components (`features/*/components`)

Reusable business-level components within each feature:

- `entity-table.tsx` (list views with sort/filter/action support)
- `entity-form.tsx` (create/edit forms)
- `filter-bar.tsx` (search + filters like status/date)
- `status-chip.tsx` (Draft, Paid, Overdue, etc.)
- `kpi-cards.tsx` (dashboard summaries)

Rule: feature components may use hooks/services but should stay domain-focused.

## 4. Data & Logic Placement

- `services/`: API clients and request functions.
- `hooks/`: reusable state/data hooks (loading, caching, form state).
- `types/`: shared TypeScript interfaces and DTOs.
- `features/masters/shared/`: master CRUD normalizers, typed module definitions, lookup hooks, and inline-related modal wrappers.

Rule: keep business/data logic out of `components/ui`.

## 5. Recommended Reuse Flow

1. Build primitive UI once in `components/ui`.
2. Compose feature components in `features/<domain>/components`.
3. Assemble pages using layout components + feature components.
4. Keep API and state logic in hooks/services for reuse across pages.

## 6. Example File Layout

```text
components/
  ui/
    button.tsx
    input.tsx
    table.tsx
  layout/
    app-shell.tsx
    page-header.tsx

features/
  sales/
    components/
      invoice-table.tsx
      invoice-form.tsx
      invoice-filter-bar.tsx
```

## 7. Quality Checklist

- Component has clear props and typed interfaces.
- UI components are reusable across multiple features.
- No duplicated form/table/filter patterns.
- Loading, empty, and error states are handled.
- Domain logic is not mixed into shared UI primitives.
- Master routes are thin and point to `features/masters/<module>/page.tsx`.
