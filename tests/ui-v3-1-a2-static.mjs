import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path =>
  fs.readFileSync(path,'utf8');

const admin =
  read('admin.html');

const sw =
  read('service-worker.js');

const js =
  read('assets/ui-v3-1-a2.js');

const css =
  read('assets/ui-v3-1-a2.css');

assert.match(
  admin,
  /ui-v3-1-a2\.css\?v=20260913-v31a21/
);

assert.match(
  admin,
  /ui-v3-1-a2\.js\?v=20260913-v31a21/
);

assert.match(
  sw,
  /ui-v3-1-a2/
);

assert.match(
  sw,
  /assets\/ui-v3-1-a2\.css/
);

assert.match(
  sw,
  /assets\/ui-v3-1-a2\.js/
);

assert.match(
  js,
  /decorateCapacityProvenance/
);

assert.match(
  js,
  /makePercentSvg/
);

assert.match(
  js,
  /enhanceZeroFlow/
);

assert.match(
  js,
  /enhanceActionState/
);

assert.match(
  js,
  /renderSelectionBar/
);

assert.match(
  js,
  /buildRoadmap/
);

assert.match(
  js,
  /v31a2RoomName/
);

assert.match(
  css,
  /\.v31a2-selection-bar/
);

assert.match(
  css,
  /\.v31a2-roadmap/
);

assert.match(
  css,
  /\.v31a2-percent-chart/
);

assert.match(
  css,
  /\.v31a2-empty-signal/
);

assert.match(
  css,
  /data-v31a2-state/
);

console.log(
  'UI V3.1 A2 static contract: OK'
);