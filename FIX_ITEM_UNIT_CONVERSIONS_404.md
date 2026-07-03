# Fix: Item Unit Conversions API 404 Error

## Problem
The client is making a GET request to fetch item unit conversions:
```
GET http://192.168.0.106:3011/api/v1/item-unit-conversions/get?iuc_item_id=019f22a7-ce7b-7e76-bf94-42dcc696d0b2&limit=100
```
Returns: `404 Not Found - Cannot GET /api/v1/item-unit-conversions/get`

## Root Causes & Solutions

### 1. **Server Endpoint Not Implemented** (Most Likely)
The server doesn't have the `/item-unit-conversions/get` endpoint implemented.

**Solution:**
- Check the ERP server repository for the item-unit-conversions controller/route
- If it doesn't exist, create the endpoint:
  - **Location:** `src/modules/inventory/controllers/item-unit-conversions.controller.ts`
  - **Route:** `GET /api/v1/item-unit-conversions/get`
  - **Parameters:** `iuc_item_id` (required), `limit` (optional, default: 100)
  - **Response:** Array of unit conversion records matching the item ID

### 2. **Server Migration Not Applied**
The database tables for item unit conversions might not exist.

**Solution:**
```bash
# In ERP server directory
npm run migrate:latest
# or
npm run prisma migrate deploy
```

### 3. **Wrong HTTP Method**
The endpoint might require POST instead of GET.

**Solution:**
Update the endpoint call in client from GET to POST:
```typescript
// In item-master-page.tsx or API hooks
// Change from GET to POST if needed
const response = await fetch(
  '/api/v1/item-unit-conversions/get',
  {
    method: 'POST', // Try POST instead
    body: JSON.stringify({ iuc_item_id, limit: 100 })
  }
);
```

### 4. **Missing API Prefix or Wrong URL Path**
The endpoint path might differ from what's configured.

**Solution:**
Verify the endpoint configuration in:
- **Client:** `features/masters/inventory/item/item-master-page.constants.ts` (line 18)
- **Server:** Check router configuration and ensure base path matches

Current client config:
```typescript
export const ITEM_UNIT_CONVERSION_API_ENDPOINTS = {
  list: "/item-unit-conversions/get",
  create: "/item-unit-conversions/create",
  delete: "/item-unit-conversions/delete",
};
```

## Implementation Steps

### Step 1: Verify Server Endpoint Exists
```bash
# Check if the controller exists
find ../ERP -name "*unit-conversion*" -type f
grep -r "item-unit-conversions" ../ERP/src --include="*.ts"
```

### Step 2: Create Missing Endpoint (if needed)
In ERP server `src/modules/inventory/controllers/item-unit-conversions.controller.ts`:
```typescript
@Controller('item-unit-conversions')
export class ItemUnitConversionsController {
  constructor(private readonly service: ItemUnitConversionsService) {}

  @Get('get')
  async getByItemId(
    @Query('iuc_item_id') itemId: string,
    @Query('limit') limit: string = '100',
  ) {
    return this.service.findByItemId(itemId, parseInt(limit));
  }
}
```

### Step 3: Verify Database Schema
Ensure Prisma schema includes `item_unit_conversion` or similar table:
```bash
# In ERP server
grep -A 10 "model ItemUnitConversion" prisma/schema.prisma
```

### Step 4: Apply Migrations
```bash
cd ../ERP
npm run prisma migrate deploy
npm run seed # if needed
```

### Step 5: Restart Server
```bash
cd ../ERP
npm run dev
```

### Step 6: Test in Client
Navigate to item master page and check:
1. Network tab for the endpoint request
2. Response status (should be 200, not 404)
3. Data displays correctly in the UI

## Related Files
- Client: `features/masters/inventory/item/item-master-page.tsx`
- Client Config: `features/masters/inventory/item/item-master-page.constants.ts`
- API Endpoints: Lines 17-21 in constants file

## Debugging Checklist
- [ ] Server endpoint is implemented
- [ ] Database migrations are applied
- [ ] HTTP method is correct (GET vs POST)
- [ ] Query parameters match server expectations (`iuc_item_id`, `limit`)
- [ ] Server is running and responding
- [ ] API base URL is correct (`/api/v1`)
- [ ] CORS is configured if needed
- [ ] Firewall/network access is not blocked

## Alternative: Verify with Similar Endpoints
Compare with working endpoints like `/item-prices/get`:
```typescript
// Both should follow the same pattern
ITEM_PRICE_API_ENDPOINTS.list: "/item-prices/get"
ITEM_UNIT_CONVERSION_API_ENDPOINTS.list: "/item-unit-conversions/get"
```

If item-prices works but item-unit-conversions doesn't, the server likely has the price endpoint but is missing the unit-conversions endpoint.
