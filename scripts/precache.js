#!/usr/bin/env node
// Walk dist/ and write a JSON list of every asset path the service worker
// should precache. Excludes the SW itself and source maps.

const fs = require('fs');
const path = require('path');

const dist = process.argv[2];
if (!dist) {
  console.error('usage: precache.js <dist-dir>');
  process.exit(1);
}

const SKIP = new Set(['sw.js', 'precache.json', 'register-sw.js.map']);

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (SKIP.has(rel) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, rel));
    } else if (entry.isFile() && !entry.name.endsWith('.map')) {
      out.push(rel);
    }
  }
  return out;
}

const list = walk(dist).sort();
fs.writeFileSync(path.join(dist, 'precache.json'), JSON.stringify(list, null, 2));
console.log(`    precached ${list.length} files -> precache.json`);
