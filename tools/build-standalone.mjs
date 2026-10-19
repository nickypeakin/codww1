// Bundles index.html and everything in js/ into one self-contained file,
// dist/one-tap.html, that works offline: download it and double-click.
//
//   node tools/build-standalone.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${code}\n</script>`;
});

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'one-tap.html'), html);
console.log(`wrote dist/one-tap.html (${Math.round(html.length / 1024)} KB)`);
