// copies the extension into dist/<target>/ with a manifest tweaked for that browser
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['inject.js', 'style.css'];

const TARGETS = {
  // chromium browsers (chrome, edge, brave, opera) are fine with the base manifest
  chrome: (m) => m,
  firefox: (m) => ({
    ...m,
    browser_specific_settings: {
      gecko: {
        id: 'youtube-live-anticensor@catedev',
        // "world": "MAIN" needs 128+, but data_collection_permissions needs 140+
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    },
  }),
};

const [target, version] = process.argv.slice(2);
if (!TARGETS[target]) {
  console.error(`usage: build.mjs <${Object.keys(TARGETS).join('|')}> [version]`);
  process.exit(1);
}

const manifest = TARGETS[target](JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
if (version) manifest.version = version.replace(/^v/, '');

const out = join(root, 'dist', target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(out, f));
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`built ${target} ${manifest.version} -> ${out}`);
