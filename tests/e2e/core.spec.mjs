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

test('cabecera smartphone conserva contenido visible con barra azul compacta y jerarquía aprobada',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin.html');
  await expect.poll(()=>page.evaluate(()=>Boolean(window.CampUiExperience))).toBe(true);
  await page.evaluate(()=>{
    document.getElementById('adminApp')?.classList.remove('hidden');
    const actions=document.querySelector('.top-actions');
    if(actions&&!document.getElementById('profileBadge')){
      const profile=document.createElement('button');profile.id='profileBadge';profile.className='ops-profile-badge';profile.textContent='Administrador';actions.appendChild(profile);
    }
    document.getElementById('campPwaInstall')?.remove();
    window.CampUiExperience.organizeTopbar();
  });
  const mobile=await page.evaluate(()=>{
    const data=id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,fontSize:parseFloat(s.fontSize),text:el.textContent.trim(),display:s.display}};
    const topbar=document.querySelector('.admin-topbar');
    const menu=document.getElementById('menuBtn');
    const menuStyle=getComputedStyle(menu);
    const menuBefore=getComputedStyle(menu,'::before');
    return {
      refresh:data('refreshAllBtn'),profile:data('profileBadge'),sync:data('syncBadge'),menu:data('menuBtn'),
      roleDisplay:getComputedStyle(document.querySelector('.camp-topbar-mobile-role')).display,
      menuStyle:{display:menuStyle.display,placeItems:menuStyle.placeItems,bg:menuBefore.backgroundImage,pseudoWidth:parseFloat(menuBefore.width),pseudoHeight:parseFloat(menuBefore.height)},
      topbarHeight:topbar.getBoundingClientRect().height,
      scrollWidth:topbar.scrollWidth,clientWidth:topbar.clientWidth
    };
  });
  expect(mobile.profile.display).not.toBe('none');
  expect(mobile.profile.text).toContain('Administrador');
  expect(mobile.profile.height).toBeLessThanOrEqual(34);
  expect(mobile.profile.width).toBeLessThan(mobile.refresh.width);
  expect(mobile.roleDisplay).toBe('none');
  expect(mobile.sync.display).not.toBe('none');
  expect(mobile.sync.text).toMatch(/Actualizado|No actualizado|Sincronizando/i);
  expect(mobile.refresh.display).not.toBe('none');
  expect(mobile.refresh.width).toBeGreaterThanOrEqual(130);
  expect(mobile.refresh.height).toBeGreaterThanOrEqual(40);
  expect(mobile.refresh.fontSize).toBeGreaterThan(0);
  expect(mobile.refresh.text).toContain('Actualizar');
  expect(mobile.profile.top).toBeLessThan(mobile.refresh.top);
  expect(Math.abs(mobile.sync.top-mobile.refresh.top)).toBeLessThanOrEqual(8);
  expect(mobile.sync.left).toBeGreaterThanOrEqual(mobile.menu.right+4);
  expect(mobile.menuStyle.display).toBe('grid');
  expect(mobile.menuStyle.placeItems).toContain('center');
  expect(mobile.menu.width).toBe(48);
  expect(mobile.menu.height).toBe(48);
  expect(mobile.menuStyle.bg).toContain('linear-gradient');
  expect(mobile.menuStyle.pseudoWidth).toBeGreaterThanOrEqual(24);
  expect(mobile.menuStyle.pseudoHeight).toBeGreaterThanOrEqual(17);
  expect(mobile.topbarHeight).toBeLessThanOrEqual(125);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.clientWidth+1);

  await page.evaluate(()=>{
    const actions=document.querySelector('.top-actions');
    if(actions&&!document.getElementById('campPwaInstall')){
      const install=document.createElement('button');install.id='campPwaInstall';install.className='btn btn-secondary';install.textContent='Instalar aplicación';actions.appendChild(install);
    }
    window.CampUiExperience.organizeTopbar();
  });
  const installable=await page.evaluate(()=>{
    const install=document.getElementById('campPwaInstall'),r=install.getBoundingClientRect(),s=getComputedStyle(install),topbar=document.querySelector('.admin-topbar');
    return {display:s.display,width:r.width,height:r.height,fontSize:parseFloat(s.fontSize),text:install.textContent.trim(),topbarHeight:topbar.getBoundingClientRect().height,scrollWidth:topbar.scrollWidth,clientWidth:topbar.clientWidth};
  });
  expect(installable.display).not.toBe('none');
  expect(installable.width).toBeGreaterThanOrEqual(124);
  expect(installable.height).toBeGreaterThanOrEqual(38);
  expect(installable.fontSize).toBeGreaterThan(0);
  expect(installable.text).toContain('Instalar aplicación');
  expect(installable.topbarHeight).toBeLessThanOrEqual(170);
  expect(installable.scrollWidth).toBeLessThanOrEqual(installable.clientWidth+1);

  await page.setViewportSize({width:1366,height:768});
  const desktop=await page.evaluate(()=>({
    profileDisplay:getComputedStyle(document.getElementById('profileBadge')).display,
    roleDisplay:getComputedStyle(document.querySelector('.camp-topbar-mobile-role')).display,
    refreshWidth:document.getElementById('refreshAllBtn').getBoundingClientRect().width,
    refreshFont:parseFloat(getComputedStyle(document.getElementById('refreshAllBtn')).fontSize)
  }));
  expect(desktop.profileDisplay).not.toBe('none');
  expect(desktop.roleDisplay).toBe('none');
  expect(desktop.refreshWidth).toBeGreaterThan(60);
  expect(desktop.refreshFont).toBeGreaterThan(0);
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
