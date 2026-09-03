import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = process.cwd();

const contract = JSON.parse(
  fs.readFileSync(
    path.join(root, 'performance.json'),
    'utf8'
  )
);

assert.equal(contract.schema, 1);
assert.equal(
  contract.policy.percentile_algorithm,
  'nearest-rank'
);
assert.equal(
  contract.policy.regression_budget_breach,
  'FAIL'
);
assert.equal(
  contract.policy.production_load_allowed,
  false
);
assert.equal(
  contract.policy.synthetic_data_only,
  true
);

function percentile(values, p) {
  const ordered = values
    .slice()
    .sort((a, b) => a - b);

  assert.ok(ordered.length > 0);

  let rank = Math.ceil(
    (p / 100) * ordered.length
  );

  rank = Math.max(
    1,
    Math.min(rank, ordered.length)
  );

  return ordered[rank - 1];
}

function parseNumber(value) {
  const parsed = Number(
    String(value).replace(',', '.')
  );

  assert.ok(
    Number.isFinite(parsed),
    `Invalid numeric benchmark value: ${value}`
  );

  return parsed;
}

function collectJsCss(dir) {
  const output = [];

  for (const entry of fs.readdirSync(
    dir,
    { withFileTypes: true }
  )) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      output.push(...collectJsCss(full));
      continue;
    }

    if (
      entry.isFile() &&
      (
        entry.name.endsWith('.js') ||
        entry.name.endsWith('.css')
      )
    ) {
      output.push(full);
    }
  }

  return output;
}

// ------------------------------------------------------------
// Static payload budgets
// ------------------------------------------------------------

const indexBytes = fs.statSync(
  path.join(root, 'index.html')
).size;

const adminBytes = fs.statSync(
  path.join(root, 'admin.html')
).size;

const assetFiles = collectJsCss(
  path.join(root, 'assets')
);

const assetSizes = assetFiles.map(
  file => fs.statSync(file).size
);

const totalAssetBytes = assetSizes.reduce(
  (sum, value) => sum + value,
  0
);

const largestAssetBytes =
  assetSizes.length === 0
    ? 0
    : Math.max(...assetSizes);

assert.ok(
  indexBytes <=
    contract.static_payload.index_html_max_bytes,
  `index.html budget breach: ${indexBytes}`
);

assert.ok(
  adminBytes <=
    contract.static_payload.admin_html_max_bytes,
  `admin.html budget breach: ${adminBytes}`
);

assert.ok(
  assetFiles.length <=
    contract.static_payload.js_css_file_count_max,
  `JS/CSS file-count budget breach: ${assetFiles.length}`
);

assert.ok(
  totalAssetBytes <=
    contract.static_payload.js_css_total_max_bytes,
  `JS/CSS total-size budget breach: ${totalAssetBytes}`
);

assert.ok(
  largestAssetBytes <=
    contract.static_payload.largest_js_css_asset_max_bytes,
  `Largest JS/CSS asset budget breach: ${largestAssetBytes}`
);

// ------------------------------------------------------------
// Repeated 2000x2000 benchmark
// ------------------------------------------------------------

const runs =
  Number(contract.high_volume.regression_runs);

assert.equal(runs, 10);

const metrics = [];

const pattern =
  /analytics\s+([0-9]+(?:[.,][0-9]+)?)\s+ms.*semantic\s+([0-9]+(?:[.,][0-9]+)?)\s+ms.*cache\s+([0-9]+(?:[.,][0-9]+)?)\s+ms.*25 cache\s+([0-9]+(?:[.,][0-9]+)?)\s+ms.*heap\s+([0-9]+(?:[.,][0-9]+)?)\s+MB/is;

for (let run = 1; run <= runs; run += 1) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        'tests',
        'high-volume-performance-smoke.mjs'
      )
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    }
  );

  const combined =
    `${result.stdout || ''}\n${result.stderr || ''}`;

  assert.equal(
    result.status,
    0,
    `High-volume run ${run} failed:\n${combined}`
  );

  assert.match(combined, /2000 trabajadores/i);
  assert.match(combined, /2000 camas/i);
  assert.match(combined, /300 reservas/i);
  assert.match(combined, /180 movimientos/i);
  assert.match(combined, /120 bloqueos/i);

  const match = combined.match(pattern);

  assert.ok(
    match,
    `Unable to parse high-volume run ${run}:\n${combined}`
  );

  const row = {
    run,
    analyticsMs: parseNumber(match[1]),
    semanticMs: parseNumber(match[2]),
    cacheMs: parseNumber(match[3]),
    cache25Ms: parseNumber(match[4]),
    heapMb: parseNumber(match[5])
  };

  metrics.push(row);

  console.log(
    `performance run ${run}/${runs}` +
    ` analytics=${row.analyticsMs}ms` +
    ` semantic=${row.semanticMs}ms` +
    ` cache=${row.cacheMs}ms` +
    ` cache25=${row.cache25Ms}ms` +
    ` heap=${row.heapMb}MB`
  );
}

const analytics = metrics.map(
  row => row.analyticsMs
);

const semantic = metrics.map(
  row => row.semanticMs
);

const cache = metrics.map(
  row => row.cacheMs
);

const cache25 = metrics.map(
  row => row.cache25Ms
);

const heap = metrics.map(
  row => row.heapMb
);

const summary = {
  analyticsP95Ms: percentile(analytics, 95),
  semanticP95Ms: percentile(semantic, 95),
  cacheP95Ms: percentile(cache, 95),
  cache25P95Ms: percentile(cache25, 95),
  heapP95Mb: percentile(heap, 95)
};

assert.ok(
  summary.analyticsP95Ms <=
    contract.high_volume.p95.analytics_ms,
  `Analytics p95 budget breach: ${summary.analyticsP95Ms} ms`
);

assert.ok(
  summary.semanticP95Ms <=
    contract.high_volume.p95.semantic_ms,
  `Semantic p95 budget breach: ${summary.semanticP95Ms} ms`
);

assert.ok(
  summary.cacheP95Ms <=
    contract.high_volume.p95.cache_single_ms,
  `Cache p95 budget breach: ${summary.cacheP95Ms} ms`
);

assert.ok(
  summary.cache25P95Ms <=
    contract.high_volume.p95.cache_25_ms,
  `25-cache p95 budget breach: ${summary.cache25P95Ms} ms`
);

assert.ok(
  summary.heapP95Mb <=
    contract.high_volume.p95.heap_mb,
  `Heap p95 budget breach: ${summary.heapP95Mb} MB`
);

console.log('');
console.log(
  'Performance budget smoke: OK'
);

console.log(
  `static index=${indexBytes}` +
  ` admin=${adminBytes}` +
  ` js-css-files=${assetFiles.length}` +
  ` js-css-bytes=${totalAssetBytes}` +
  ` largest=${largestAssetBytes}`
);

console.log(
  `2000x2000 p95` +
  ` analytics=${summary.analyticsP95Ms}ms` +
  ` semantic=${summary.semanticP95Ms}ms` +
  ` cache=${summary.cacheP95Ms}ms` +
  ` cache25=${summary.cache25P95Ms}ms` +
  ` heap=${summary.heapP95Mb}MB`
);