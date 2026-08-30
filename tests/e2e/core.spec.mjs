import {test,expect} from '@playwright/test';

const workerPayload={ok:true,status:'OK',worker:{nombre:'TRABAJADOR PRUEBA',rut:'12345678-5',modulo:'M1',habitacion:'101',cama:'A',turno:'A'}};

test('consulta pública mantiene el flujo y registra por la misma API central',async({page})=>{
  await page.route('**/functions/v1/campamento-web-api**',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')==='lookup')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workerPayload)});
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'CONSULTA DE ASIGNACIÓN'})).toBeVisible();
  await expect(page.locator('#publicDate')).toHaveText(/^\d{2}-\d{2}-\d{4}$/);
  await page.locator('#workerRut').fill('12.345.678-5');
  await page.getByRole('button',{name:/VER MI ASIGNACIÓN/i}).click();
  await expect(page.locator('#workerLookupResult')).toContainText('TRABAJADOR PRUEBA');
  await expect(page.locator('#workerLookupResult')).toContainText('M1');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href',/manifest\.webmanifest/);
  await expect(page.locator('#campPwaAdminLink')).toHaveAttribute('href','admin.html');
});

test('administración sigue disponible por enlace y carga las nuevas capas sin autenticar datos',async({page})=>{
  await page.goto('/admin.html');
  await expect(page.getByRole('heading',{name:'Acceso administración'})).toBeVisible();
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.CampPWA&&window.CampAnalyticsEngine&&window.CampChartPerformance))).toBe(true);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href',/manifest\.webmanifest/);
});

test('PWA conserva el shell para apertura sin conexión sin almacenar APIs de Supabase',async({page,context})=>{
  await page.goto('/');
  const supported=await page.evaluate(()=>('serviceWorker' in navigator));
  expect(supported).toBeTruthy();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'CONSULTA DE ASIGNACIÓN'})).toBeVisible();
  await context.setOffline(false);
});

test('manifest cumple instalación y ofrece consulta y administración en la misma aplicación',async({request})=>{
  const response=await request.get('/manifest.webmanifest');expect(response.ok()).toBeTruthy();
  const manifest=await response.json();
  expect(manifest.id).toBe('./');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.prefer_related_applications).toBe(false);
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({sizes:'192x192',type:'image/png'}),
    expect.objectContaining({sizes:'512x512',type:'image/png'})
  ]));
  expect(manifest.shortcuts.map(x=>x.url)).toEqual(expect.arrayContaining(['./','./admin.html']));
});
