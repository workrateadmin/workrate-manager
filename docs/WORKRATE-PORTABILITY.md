# WorkRate portability layer

This patch removes the requirement for Replit-specific runtime infrastructure while preserving Replit as a temporary host if desired.

## What stays unchanged

- WorkRate UI and business logic
- PostgreSQL/Drizzle data model and migrations
- Clerk authentication
- Stripe, Vapi, Resend, WhatsApp and HMRC integration code
- Existing `/objects/...` database references
- Existing production legacy object paths

## Database

WorkRate already uses standard PostgreSQL through `DATABASE_URL`. No Replit-specific database SDK is required.

For an external production database set:

- `DATABASE_URL`
- `WORKRATE_ENV=production`

The `_workrate_environment` singleton marker must exist and equal `production` before startup.

## External object storage

The patched app supports ordinary Google Cloud Storage without the Replit object-storage sidecar.

Set:

- `WORKRATE_STORAGE_BACKEND=gcs`
- `GCS_PROJECT_ID=<google-cloud-project-id>`
- `GCS_SERVICE_ACCOUNT_JSON=<single-line service-account JSON>`
- `WORKRATE_STORAGE_BUCKET=<bucket-name>`
- `WORKRATE_STORAGE_PRIVATE_ROOT=<bucket-name>/.private`
- `WORKRATE_STORAGE_PUBLIC_ROOTS=<bucket-name>/public`
- `WORKRATE_STORAGE_ENV=production`
- `WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT=<12-char sha256 prefix of bucket name>`

Legacy Replit variable names remain supported during transition:
`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, and `PUBLIC_OBJECT_SEARCH_PATHS`.

The existing storage export can be copied into the external bucket preserving paths exactly, including `.private/...` and `public/...`.

The new bucket also needs `.workrate/environment-binding-v1.json` containing:

```json
{"schemaVersion":1,"environment":"production","bucketFingerprint":"<fingerprint>"}
```

## Public URL

Set one canonical URL:

- `WORKRATE_PUBLIC_URL=https://<production-domain>`

The server now uses this for Stripe return URLs/webhook URLs, storage-serving links and WhatsApp webhook output. `PROPOSAL_BASE_URL` remains an optional proposal-only override.

## Safe migration order

1. Keep WorkRate Manager untouched as source of truth.
2. Create external PostgreSQL and GCS resources.
3. Restore a database backup into external PostgreSQL.
4. Copy the 25 exported objects to external GCS preserving object names.
5. Add the database and bucket production markers.
6. Run the patched app against the new resources in a non-public deployment.
7. Verify companies, enquiries, jobs, quotes, invoices, attachments and finance receipts.
8. Only then repoint Stripe/Meta/Vapi/HMRC/domain callbacks.

Do not overwrite the original Replit production database or bucket during this process.
