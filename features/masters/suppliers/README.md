# Suppliers Master Module

A comprehensive ERP supplier management module featuring advanced form handling, related master management, and GST lookup integration.

## Module Structure

```
features/masters/suppliers/
├── page.tsx                    # Main React component (647 lines)
├── constants.ts               # Configuration and constants (7.4 KB)
├── types.ts                   # TypeScript type definitions (4.1 KB)
├── transformers.ts            # Data transformation utilities (18 KB)
├── form-builder.ts            # Form validation and payload building (5.5 KB)
├── fields-schema.ts           # Form field definitions (13 KB)
├── table-builder.ts           # Table rendering utilities (2.3 KB)
├── form-navigation.ts         # Keyboard navigation utilities (3.1 KB)
├── page.tsx.backup            # Original 1,786-line file (backup)
├── REFACTORING_SUMMARY.md     # Detailed refactoring information
└── README.md                  # This file
```

## Features

### Core Functionality
- **Master Data Management**: Create, read, update, delete supplier records
- **Advanced Form**: 50+ fields organized in 5 sections (Primary, Contact, Credit, Region, Status)
- **Grid Display**: Sortable supplier list with customizable columns
- **Search & Filter**: Find suppliers by name, code, or other criteria

### Advanced Features
- **GST Lookup**: Auto-populate supplier details from GSTIN
  - Pattern validation: ^[0-9A-Z]{15}$
  - Automatic extraction of legal name, address, tax details
  - State code and name resolution
  - Response caching for performance
- **Related Masters**: Inline management of related entities
  - Supplier Groups (create/edit within supplier form)
  - State Masters (create/edit within supplier form)
  - Real-time option synchronization
- **Validation**
  - GST number format and mandatory rules
  - PAN number validation (10-character format)
  - Field-level validation with custom rules
  - Context-aware validation (GST required for REGULAR type)
- **Keyboard Navigation**: Arrow keys to move between form fields
- **Form Organization**: Tab-based sections for better UX

### Data Fields

#### Primary Details Section
- GST No* (15-char GSTIN with auto-lookup)
- GST Type* (REGULAR, COMPOSITION)
- Supplier Name* (2-200 characters)
- Supplier Group*
- Company
- Purchase Type* (Goods Supplier)
- Branch
- Short Name (max 50 chars)
- PAN No (10-character format validation)
- Drug License No

#### Address & Contact Details Section
- Address Line 1, 2, 3 (250 chars each)
- City, District, PIN Code
- State* (with auto-code resolution)
- Country (default: India)
- Phone, Telephone, WhatsApp No, Email
- Website Address

#### Credit Details Section
- Credit Days (non-negative integer)
- Cash Discount % (non-negative decimal)
- Collection Days (multi-select)

#### Region Details Section
- Region Name, Address (1, 2, 3)
- Region City, District
- Region State, Country (default: India)

#### Status & Notes Section
- Cheque Prefix Name
- Sort Order (0-based position)
- Status (Active/Inactive toggle)
- Notes (description, max 250 chars)
- Billing Date
- Created By / Modified By (auto-set)

## API Integration

### Main Endpoints
```typescript
const API_ENDPOINTS = {
  list: "/suppliers/list",           // GET: List all suppliers
  getById: "/suppliers/get",         // GET: Fetch supplier details
  create: "/suppliers/create",       // POST: Create or update supplier
  delete: "/suppliers/delete",       // DELETE: Delete supplier
};
```

### Related Master Endpoints
```typescript
// Supplier Groups
GET    /master-lookups/name-id/all-accounts-and-masters?module=supplierGroups
POST   /supplier-groups/create
GET    /supplier-groups/get

// States
GET    /master-lookups/name-id/all-accounts-and-masters?module=stateCodes
POST   /state-code-masters/create
GET    /state-code-masters/get

// Companies
GET    /master-lookups/name-id/all-accounts-and-masters?module=companies

// Branches
GET    /master-lookups/name-id/all-accounts-and-masters?module=branches

// GST Lookup (External)
GET    /api/gst/search?gstin=24ABCDE1234F1Z5
```

## Request/Response Examples

### Create Supplier Request
```javascript
{
  supName: "ABC Distributors",
  supGroupId: "GRP001",
  supGstNo: "24ABCDE1234F1Z5",
  supGstType: "REGULAR",
  supPurchaseType: "Goods Supplier",
  supAddr1: "123 Business Park",
  supCity: "Mumbai",
  supStateName: "Maharashtra",
  supStateCode: "27",
  supPincode: "400001",
  supPhone: "9999999999",
  supIsActive: true,
  supCreditDays: 30,
  supCashDiscPerc: 2.5,
  supCollectionDays: [5, 10, 15],
  // ... other fields
}
```

### GST Lookup Response (Auto-filled)
```javascript
{
  supGstNo: "24ABCDE1234F1Z5",
  supName: "ABC Distribution Services",
  supGstType: "REGULAR",
  supAddr1: "123 Business Park",
  supCity: "Mumbai",
  supDistrict: "Mumbai",
  supStateName: "Maharashtra",
  supStateCode: "27",
  supPincode: "400001",
  supPanNo: "ABCDE1234F"
}
```

## Development Guide

### Adding a New Field

1. **Add to constants.ts**:
```typescript
export const SUPPLIER_INITIAL_FORM_VALUES = {
  // ... existing fields
  newFieldName: "", // or appropriate default
};
```

2. **Add to types.ts**:
```typescript
export type SupplierFormFieldName = 
  | "existingField"
  | "newFieldName"; // Add to union type

export interface SupplierFormValues {
  newFieldName: string;
}
```

3. **Add to fields-schema.ts**:
```typescript
{
  name: "newFieldName",
  label: "New Field",
  gridColumnStart: 1,
  gridRowStart: 10,
  // ... other props
}
```

4. **Add to form-builder.ts** (if validation needed):
```typescript
newFieldName: toNullableString(values.newFieldName ?? ""),
```

### Adding Validation

1. Create validator function in `form-builder.ts`:
```typescript
export function validateNewField(value: string): string | null {
  if (!value.trim()) return null;
  return /pattern/.test(value) ? null : "Error message";
}
```

2. Add to field definition in `fields-schema.ts`:
```typescript
{
  name: "newFieldName",
  validation: {
    custom: (value) => validateNewField(value),
  }
}
```

### Using Transformers

```typescript
import {
  buildSupplierGroupOptions,
  toSupplierFormValues,
} from "./transformers";

// Transform API response to form values
const formValues = toSupplierFormValues(apiRow, defaults, stateCodeByName);

// Build lookup options
const groupOptions = buildSupplierGroupOptions(lookupResponse);
```

### Testing Utilities

All transformer functions are pure and easily testable:

```typescript
import { buildStateCodeByName } from "./transformers";

// Test case
const result = buildStateCodeByName({
  data: [
    { stateName: "Maharashtra", stateCode: "27" }
  ]
});
expect(result["Maharashtra"]).toBe("27");
```

## Performance Considerations

1. **GST Lookup Caching**: Results cached in `gstLookupCacheRef` to prevent duplicate API calls
2. **Memoization**: useCallback/useMemo used for stable function references
3. **Lazy Loading**: Field definitions built on demand
4. **Event Delegation**: Single handlers for multiple field changes
5. **Async Operations**: All API calls async with proper loading states

## Error Handling

- **Form Validation**: Field-level errors shown inline
- **API Errors**: Toast notifications for user feedback
- **GST Lookup Errors**: Specific error messages for lookup failures
- **Network Errors**: Graceful fallbacks with retry options

## Accessibility

- Semantic HTML with proper labels
- Keyboard navigation support (Tab, Arrow keys)
- ARIA attributes for form controls
- Error messages linked to fields
- Color contrast compliance for form elements

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (responsive design)

## Dependencies

### External Libraries
- `react`: UI framework
- `react-toastify`: Notification system
- `next`: Framework

### Internal Dependencies
- `@/components/master/crud-master-page`: Table and form component
- `@/components/library/ui/dynamic-modal-form`: Modal form system
- `@/features/masters/shared/inline-related-master`: Modal for related masters
- `@/app/master/_shared/crud-utils`: Shared data transformation utilities
- `@/hooks/useApi`: Custom hook for API calls

## Troubleshooting

### GST Lookup Not Working
- Check GSTIN format (must be 15 characters, alphanumeric)
- Verify GST API endpoint is accessible
- Check browser console for network errors
- Clear GST cache by reloading form

### Form Not Saving
- Verify required fields are filled (marked with *)
- Check field-level validation errors
- Ensure API endpoint is correct
- Check browser console for error details

### State Code Not Resolving
- Verify State lookup API returns data
- Check state name matching (case-sensitive)
- Clear and reload state options dropdown

## Maintenance

- Review and update field validations quarterly
- Monitor API response times for lookups
- Update GST validation pattern if tax rules change
- Keep documentation synchronized with code changes

## References

- [ERP Form Patterns Documentation](../../docs/form-patterns.md)
- [GSTIN Format Specification](https://www.gst.gov.in/help/knowledge-base/gstin)
- [State Code Reference](../state-master/README.md)

## Support

For issues or questions about this module:
1. Check error messages and troubleshooting section
2. Review code comments and type definitions
3. Check related modules for similar patterns
4. Consult the architecture documentation
