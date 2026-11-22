# WorkRate Manager portability patch manifest

Purpose: make the existing WorkRate Manager codebase portable without changing its product/business logic or touching any database/storage data during patch application.

## Runtime changes

- `artifacts/api-server/src/lib/objectStorage.ts`
  - retains Replit Object Storage compatibility
  - adds standard Google Cloud Storage credentials/service-account support
  - uses native GCS V4 signed URLs when running on external GCS
- `artifacts/api-server/src/lib/storage-environment.ts`
  - adds provider-neutral WorkRate storage variable names while preserving legacy Replit variable support
- `artifacts/api-server/src/lib/runtime-environment.ts`
  - validates both portable and legacy storage variable names
- `artifacts/api-server/src/lib/public-url.ts`
  - central canonical public URL resolver
  - production requires `WORKRATE_PUBLIC_URL`
  - Replit hostname fallback is development-only
- `artifacts/api-server/src/lib/storageUpload.ts`
  - storage URLs use canonical public URL rather than Replit host variables
- `artifacts/api-server/src/services/billing/provider.ts`
- `artifacts/api-server/src/services/billing/topups.ts`
  - Stripe return/webhook URLs use canonical public URL
- `artifacts/api-server/src/routes/quotes.ts`
  - proposal links use explicit/canonical public URL
- `artifacts/api-server/src/routes/integrations.ts`
  - WhatsApp webhook URL is generated from canonical public URL
- `artifacts/workrate/src/pages/integrations/whatsapp.tsx`
  - UI displays the current app origin rather than a hard-coded Replit URL
- `artifacts/workrate/src/pages/integrations/website-widget.tsx`
- `artifacts/workrate/src/pages/settings.tsx`
  - development warnings use Vite development mode rather than `.replit.dev` hostname matching

## Added migration/support files

- `docs/WORKRATE-PORTABILITY.md`
- `docs/PORTABILITY-PATCH-MANIFEST.md`
- `scripts/verify-portability.mjs`
- `scripts/compute-storage-fingerprint.mjs`
- `PORTABLE-ENVIRONMENT.template`
- `REPLIT-AGENT-PORTABILITY-PROMPT.txt`

## Explicitly not changed by this patch

- database schema or migrations
- customer/business data
- existing object files
- Replit secrets
- Replit bucket binding
- Publishing settings
- Clerk/Stripe/Vapi/Resend/Meta/HMRC credentials
- payment pricing/business rules
- WorkRate UI/workflows except portable URLs shown to the operator

Applying this patch alone must not perform a database write, storage write, publish, provider call or infrastructure migration.
