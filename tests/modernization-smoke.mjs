import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.devDependencies.typescript,'7.0.2');
assert.equal(pkg.devDependencies['@playwright/test'],'1.62.1');
const ts=JSON.parse(read('tsconfig.json'));assert.equal(ts.compilerOptions.strict,true);assert.equal(ts.compilerOptions.outDir,'assets/ts');
for(const p of ['assets/ts/pwa/runtime.js','assets/ts/analytics/powerbi-engine.js','assets/ts/charts/performance.js']){assert.ok(fs.existsSync(p),`${p} debe generarse con TypeScript`)}
const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.start_url,'./');assert.ok(manifest.shortcuts.some(x=>x.url==='./admin.html'));
const sw=read('service-worker.js');assert.match(sw,/SKIP_WAITING/);assert.match(sw,/url\.origin!==self\.location\.origin/);assert.doesNotMatch(sw,/supabase\.co/);
const app4=read('assets/app-4.js');assert.ok(app4.indexOf('resilience-runtime.js')<app4.indexOf('powerbi-engine.js'));assert.match(app4,/assets\/ts\/pwa\/runtime\.js/);
const pwaTs=read('src/pwa/runtime.ts');assert.match(pwaTs,/activateRequested/);assert.match(pwaTs,/activateRequested&&!reloading/);
const chartTs=read('src/charts/performance.ts');assert.doesNotMatch(chartTs,/MutationObserver/);assert.match(chartTs,/IntersectionObserver/);
const index=read('index.html');assert.match(index,/rel="manifest" href="manifest\.webmanifest"/);
const workflow=read('.github/workflows/validate-modernization.yml');assert.match(workflow,/playwright install --with-deps chromium/);assert.match(workflow,/npm run typecheck/);assert.match(workflow,/analytics-engine-smoke\.mjs/);
const pages=read('.github/workflows/pages.yml');assert.match(pages,/npm run build/);assert.match(pages,/modernization-smoke\.mjs/);assert.match(pages,/analytics-engine-smoke\.mjs/);
console.log('Modernización smoke: OK');
