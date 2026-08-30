import {test,expect} from '@playwright/test';

test('cockpit de decisión carga como capa progresiva sin sustituir el acceso administrativo',async({page,request})=>{
  await page.goto('/admin.html');
  await expect(page.getByRole('heading',{name:'Acceso administración'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.CampDecisionCockpit?.VERSION||'')).toBe('20260830-decision1');
  await expect(page.locator('link[href*="decision-cockpit.css"]')).toHaveCount(1);
  const grouped=await page.evaluate(()=>window.CampDecisionCockpit.group([{empresa:'A'},{empresa:'B'},{empresa:'A'}],'empresa'));
  expect(grouped).toEqual([{label:'A',n:2},{label:'B',n:1}]);
  for(const path of ['/assets/decision-cockpit.js','/assets/decision-cockpit.css']){
    const r=await request.get(path);expect(r.ok()).toBeTruthy();
  }
});

test('componentes del cockpit permanecen responsivos entre 320 y 430 px',async({page})=>{
  await page.goto('/admin.html');
  await expect.poll(()=>page.evaluate(()=>Boolean(window.CampDecisionCockpit))).toBe(true);
  await page.evaluate(()=>{
    const host=document.createElement('div');host.id='dcResponsiveFixture';host.innerHTML=`<div class="dc-shell"><section class="dc-hero"><div class="dc-hero-top"><div><div class="dc-eyebrow">OPERACIÓN</div><h2>Centro de Control Operacional</h2><p>Resumen para decisión.</p></div><span class="dc-status normal"><i></i>OPERACIÓN NORMAL</span></div><div class="dc-hero-grid"><div class="dc-hero-kpi"><span>Ocupación</span><strong>94 / 132</strong><small>71,2% física</small></div><div class="dc-hero-kpi"><span>Compromiso</span><strong>95 / 132</strong><small>72%</small></div><div class="dc-hero-kpi"><span>Libres</span><strong>37</strong><small>efectivas</small></div><div class="dc-hero-kpi"><span>Movimientos</span><strong>↑ 0 · ↓ 0</strong><small>hoy</small></div><div class="dc-hero-kpi"><span>Integridad</span><strong>100%</strong><small>controlada</small></div></div></section><div class="dc-grid"><section class="dc-card dc-span-4"><div class="dc-card-head"><div><h3>Requiere atención</h3></div></div></section><section class="dc-card dc-span-8"><div class="dc-card-head"><div><h3>Proyección</h3></div></div></section></div></div>`;document.body.appendChild(host);
  });
  for(const width of [320,360,375,390,412,430]){
    await page.setViewportSize({width,height:844});
    const m=await page.evaluate(()=>{const h=document.getElementById('dcResponsiveFixture'),r=h.getBoundingClientRect();return {right:r.right,width:r.width,scroll:h.scrollWidth,client:h.clientWidth,hero:getComputedStyle(h.querySelector('.dc-hero-grid')).gridTemplateColumns,cards:[...h.querySelectorAll('.dc-card')].map(x=>x.getBoundingClientRect().width)}});
    expect(m.right).toBeLessThanOrEqual(width+1);
    expect(m.scroll).toBeLessThanOrEqual(m.client+1);
    expect(m.cards.every(x=>x<=width+1)).toBeTruthy();
  }
});

test('PWA modern.9 precachea los nuevos recursos y mantiene actualización controlada',async({request})=>{
  const version=await request.get('/version.json');expect(version.ok()).toBeTruthy();expect((await version.json()).version).toBe('5.6.1-modern.9');
  const sw=await request.get('/service-worker.js');expect(sw.ok()).toBeTruthy();const text=await sw.text();
  expect(text).toContain("campamento-shell-5.6.1-modern.9");
  expect(text).toContain("./assets/decision-cockpit.css");
  expect(text).toContain("./assets/decision-cockpit.js");
  expect(text).not.toContain('supabase.co');
});
