import { createHash } from 'node:crypto';
const bucket = process.argv[2]?.trim();
if (!bucket) {
  console.error('Usage: node scripts/compute-storage-fingerprint.mjs <bucket-name>');
  process.exit(1);
}
console.log(createHash('sha256').update(bucket).digest('hex').slice(0, 12));
