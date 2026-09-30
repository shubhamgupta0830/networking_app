'use strict';

/**
 * Copies third-party browser bundles out of node_modules into public/vendor,
 * so the page loads them from our own origin: no CDN dependency at runtime,
 * and the service worker can cache them for offline use.
 *
 * Runs on postinstall, including on Render.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'vendor');

const ASSETS = [
  {
    // The published package has moved this file between releases.
    candidates: [
      'html5-qrcode/html5-qrcode.min.js',
      'html5-qrcode/dist/html5-qrcode.min.js',
      'html5-qrcode/minified/html5-qrcode.min.js',
    ],
    out: 'html5-qrcode.min.js',
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let failed = false;
for (const asset of ASSETS) {
  const source = asset.candidates
    .map((relative) => path.join(ROOT, 'node_modules', relative))
    .find((candidate) => fs.existsSync(candidate));

  if (!source) {
    console.error(`copy-vendor: could not find ${asset.out} in node_modules`);
    failed = true;
    continue;
  }

  fs.copyFileSync(source, path.join(OUT_DIR, asset.out));
  console.log(`copy-vendor: ${asset.out} <- ${path.relative(ROOT, source)}`);
}

// A missing scanner bundle would only show up as a broken camera at runtime,
// so fail the build instead.
if (failed) process.exit(1);
