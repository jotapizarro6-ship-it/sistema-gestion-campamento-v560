import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path =>
  fs.readFileSync(path, 'utf8');

const admin =
  read('admin.html');

const sw =
  read('service-worker.js');

const js =
  read('assets/ui-v3-1-clarity.js');

const css =
  read('assets/ui-v3-1-clarity.css');

assert.match(
  admin,
  /ui-v3-1-clarity\.css\?v=20260914-v311a22/
);

assert.match(
  admin,
  /ui-v3-1-clarity\.js\?v=20260914-v311a22/
);

/*
 * A1 contract validates that the clarity layer remains shipped.
 * The active Service Worker cache version may advance in later
 * V3.1 iterations; the latest iteration owns that exact version.
 */
assert.match(
  sw,
  /assets\/ui-v3-1-clarity\.css/
);

assert.match(
  sw,
  /assets\/ui-v3-1-clarity\.js/
);





assert.match(
  js,
  /renderPlanTimeline/
);

assert.match(
  js,
  /planningRows/
);

assert.match(
  js,
  /capacitySourceLabel/
);

assert.match(
  js,
  /v31-modal-open/
);

assert.match(
  js,
  /data-v31-open-tool/
);

assert.match(
  css,
  /#view-overview\s*>\s*details\.dc-legacy-details/
);

assert.match(
  css,
  /#view-management\s*>\s*details\.dc-legacy-details\.v31-modal-open/
);

assert.match(
  css,
  /\.cc-bed-btn\.occupied/
);

assert.match(
  css,
  /\.cc-bed-btn\.reserved/
);

assert.match(
  css,
  /\.cc-bed-btn\.blocked/
);

assert.match(
  css,
  /\.cc-bed-btn\.free/
);

assert.match(
  css,
  /\.v3-workforce-stack \.direct/
);

assert.match(
  css,
  /\.v3-workforce-stack \.indirect/
);

assert.match(
  css,
  /\.v31-plan-scroll/
);

console.log(
  'UI V3.1 static contract: OK'
);