import fs from 'node:fs';
import path from 'node:path';

const roots = [
  'artifacts/api-server/src',
  'artifacts/workrate/src',
  'lib/db/src',
];
const forbidden = [
  'https://work-rate-manager.replit.app',
  'REPLIT_DOMAINS is required',
];
const findings = [];
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(p) {
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const next = path.join(p, entry.name);
    if (entry.isDirectory()) walk(next);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const text = withoutComments(fs.readFileSync(next, 'utf8'));
      for (const needle of forbidden) if (text.includes(needle)) findings.push(`${next}: ${needle}`);
    }
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);
if (findings.length) {
  console.error('Portability verification failed:\n' + findings.join('\n'));
  process.exit(1);
}
console.log('Portability verification passed. No hard-coded WorkRate Manager production URL or mandatory REPLIT_DOMAINS dependency remains in runtime source.');
