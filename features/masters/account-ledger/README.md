# Account Ledger Master - Refactored Structure

## Overview
This directory contains the refactored Account Ledger Master module, separated into focused modules for better maintainability, testability, and reusability.

## File Structure

### Core Files
- **`page.tsx`** - Main page component (simplified, ~650 lines)
- **`constants.ts`** - All configuration constants and keys
- **`types.ts`** - TypeScript type definitions
- **`transformers.ts`** - Data transformation and conversion utilities
- **`form-builder.ts`** - Form values initialization and payload building
- **`fields-schema.ts`** - Form field definitions and section organization
- **`table-builder.ts`** - Table row and column building utilities
- **`form-navigation.ts`** - Form field navigation and focus management

## Module Breakdown

### Constants (`constants.ts`)
Exports all configuration values:
- API endpoints
- Debounce delays, pagination defaults
- Lookup queries and grid configuration
- Field mapping keys
- CSS selectors for form navigation

**Benefits:**
- Centralized configuration
- Easy to modify without touching logic
- Single source of truth for constants

### Types (`types.ts`)
Defines all TypeScript types:
- `LedgerFormFieldName` - Union type of all form field names
- `LedgerFormValues` - Form data structure
- `LedgerTableRow` - Table row shape
- `PaginationInfo` - Pagination metadata
- `ModalMode` - Create/Update/View modes
- Navigation and focusing types

**Benefits:**
- Type safety across modules
- Self-documenting code
- Easy to extend for new fields

### Transformers (`transformers.ts`)
Pure functions for data transformation:
- **Value Conversion**: `toDisplayValue()`, `toNumber()`, `toSelectBoolean()`
- **Array Extraction**: `extractRows()`, `extractDetailSource()`
- **Option Building**: `buildLookupOptions()`, `buildStateNameOptions()`
- **Pagination**: `extractPaginationInfo()`
- **Grid Details**: `resolveAccountLedgerGridDetails()`

**Benefits:**
- Reusable across components
- Easy to test (pure functions)
- Clear responsibility separation
- Handles complex data mapping logic

### Form Builder (`form-builder.ts`)
Form initialization and payload building:
- `createInitialLedgerFormValues()` - Initialize empty form
- `toLedgerFormValues()` - Convert API response to form values
- `buildLedgerRequestPayload()` - Convert form values to API request
- `getLedgerValidationError()` - Form-level validation

**Benefits:**
- Centralized form logic
- Type-safe form operations
- Consistent data transformation
- Easy to modify validation rules

### Fields Schema (`fields-schema.ts`)
Form field definitions and organization:
- `buildLedgerFormFields()` - Create all field definitions
- `toLedgerFormSections()` - Organize fields into logical sections

**Benefits:**
- Field definitions separate from rendering
- Easy to add/remove/modify fields
- Clean separation of structure and display
- Reusable field configuration

### Table Builder (`table-builder.ts`)
Table structure and row building:
- `DEFAULT_LEDGER_COLUMNS` - Default column definitions
- `buildLedgerRows()` - Transform API data to table rows
- `resolveLedgerRecordId()` - Extract record ID from row
- `buildColumnsFromGridColumns()` - Build columns from grid config

**Benefits:**
- Centralized column/row logic
- Handles complex data extraction
- Configurable from grid metadata
- Supports custom column mappings

### Form Navigation (`form-navigation.ts`)
Field navigation and focus management:
- `getLedgerFocusableFieldControl()` - Find focusable element
- `getLedgerFocusableFieldTargets()` - Get all focusable targets
- `findNextLedgerFieldTarget()` - Navigate between fields
- `focusLedgerFieldControl()` - Set focus with scroll

**Benefits:**
- Keyboard navigation logic separated
- Reusable navigation utilities
- DOM query logic isolated
- Easier to test focus behavior

### Main Component (`page.tsx`)
The simplified main component orchestrates all modules:
- ~650 lines (down from 3,191!)
- Uses modular functions
- Clean imports from individual modules
- Focuses on component logic, not utilities
- Includes `LedgerFieldRenderer` sub-component for field rendering

**Benefits:**
- Much easier to understand
- Clear dependency structure
- Focused on component concerns
- Easier to maintain and debug

## Architecture Patterns

### Separation of Concerns
- **Constants**: Configuration
- **Types**: Data shapes
- **Transformers**: Data transformation
- **Form Builder**: Form logic
- **Table Builder**: Table logic
- **Navigation**: Focus management
- **Page**: Component orchestration

### Pure Functions
Most utilities are pure functions (transformers, builders):
- No side effects
- Easier to test
- Reusable across contexts
- Predictable behavior

### Type Safety
All modules are fully typed with TypeScript:
- Type errors caught at compile time
- Better IDE support
- Self-documenting code

## Maintenance Guidelines

### Adding a New Field
1. Add type to `LedgerFormFieldName` in `types.ts`
2. Add default value to `LEDGER_INITIAL_FORM_VALUES` in `form-builder.ts`
3. Add field definition to `buildLedgerFormFields()` in `fields-schema.ts`
4. Add mapping to `toLedgerFormValues()` in `form-builder.ts`
5. Add to request payload in `buildLedgerRequestPayload()` in `form-builder.ts`

### Modifying API Mapping
Edit the lookup key arrays in `constants.ts` (e.g., `LOOKUP_KEYS.id`, `LOOKUP_KEYS.name`)

### Updating Validation Rules
Modify `getLedgerValidationError()` in `form-builder.ts`

### Changing Table Columns
Modify column definitions in `table-builder.ts` or adjust grid configuration

## Testing Opportunities

Each module can be unit tested independently:
```typescript
// Example: Test transformers
describe('transformers', () => {
  it('converts value to display format', () => {
    expect(toDisplayValue(123)).toBe('123');
    expect(toDisplayValue(true)).toBe('true');
  });
});

// Example: Test form builder
describe('form-builder', () => {
  it('creates initial form values', () => {
    const values = createInitialLedgerFormValues();
    expect(values.masterName).toBe('');
    expect(values.ledIsActive).toBe('true');
  });
});
```

## Migration Notes

- Old file backed up as `page.tsx.backup`
- All logic preserved from original 3,191-line file
- No functional changes, only structural reorganization
- Backwards compatible - same API, same behavior

## Future Improvements

- Extract `LedgerFieldRenderer` into separate component
- Create custom hooks (`useFormState`, `useTableData`, etc.)
- Move table rendering to separate component
- Add comprehensive test coverage
- Consider creating shared utilities for other masters
- Extract modal rendering to reusable component
