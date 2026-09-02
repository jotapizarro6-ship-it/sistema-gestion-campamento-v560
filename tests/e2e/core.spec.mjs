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

test('cabecera smartphone replica referencia final aprobada en múltiples anchos',async({page})=>{
  const widths=[320,360,375,390,412,430];
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

  for(const width of widths){
    await page.setViewportSize({width,height:844});
    const mobile=await page.evaluate(()=>{
      const data=id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,fontSize:parseFloat(s.fontSize),text:el.textContent.trim(),display:s.display,bg:s.backgroundColor,color:s.color}};
      const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const topbar=document.querySelector('.admin-topbar');
      const menu=document.getElementById('menuBtn');
      const menuStyle=getComputedStyle(menu);
      const menuBefore=getComputedStyle(menu,'::before');
      const brand=document.querySelector('.camp-topbar-title .brand');
      return {
        refresh:data('refreshAllBtn'),profile:data('profileBadge'),sync:data('syncBadge'),menu:data('menuBtn'),brand:rect(brand),
        roleDisplay:getComputedStyle(document.querySelector('.camp-topbar-mobile-role')).display,
        menuStyle:{display:menuStyle.display,placeItems:menuStyle.placeItems,bg:menuBefore.backgroundImage,pseudoWidth:parseFloat(menuBefore.width),pseudoHeight:parseFloat(menuBefore.height)},
        topbarHeight:topbar.getBoundingClientRect().height,
        scrollWidth:topbar.scrollWidth,clientWidth:topbar.clientWidth
      };
    });

    expect(mobile.profile.display).not.toBe('none');
    expect(mobile.profile.text).toContain('Administrador');
    expect(mobile.profile.height).toBeGreaterThanOrEqual(24);
    expect(mobile.profile.height).toBeLessThanOrEqual(27);
    expect(mobile.profile.width).toBeLessThan(mobile.refresh.width);
    expect(mobile.profile.bg).toBe('rgb(255, 242, 207)');
    expect(mobile.roleDisplay).toBe('none');

    expect(mobile.sync.display).not.toBe('none');
    expect(mobile.sync.text).toMatch(/Actualizado|No actualizado|Sincronizando/i);
    expect(mobile.sync.height).toBeGreaterThanOrEqual(25);
    expect(mobile.sync.height).toBeLessThanOrEqual(28);
    expect(Math.abs(mobile.sync.left-mobile.menu.left)).toBeLessThanOrEqual(2);

    expect(mobile.refresh.display).not.toBe('none');
    expect(mobile.refresh.width).toBeGreaterThanOrEqual(120);
    expect(mobile.refresh.height).toBeGreaterThanOrEqual(44);
    expect(mobile.refresh.height).toBeLessThanOrEqual(45);
    expect(mobile.refresh.fontSize).toBeGreaterThan(0);
    expect(mobile.refresh.text).toContain('Actualizar');
    expect(Math.abs(mobile.refresh.right-mobile.profile.right)).toBeLessThanOrEqual(2);

    /* Primera fila superior: Actualizado y Administrador. Segunda fila: menú/título y Actualizar. */
    expect(Math.abs(mobile.sync.top-mobile.profile.top)).toBeLessThanOrEqual(3);
    expect(mobile.menu.top).toBeGreaterThan(mobile.sync.top);
    expect(mobile.refresh.top).toBeGreaterThan(mobile.profile.top);
    expect(Math.abs(mobile.menu.top-mobile.refresh.top)).toBeLessThanOrEqual(3);
    expect(mobile.menu.top).toBeGreaterThanOrEqual(mobile.sync.bottom+2);
    expect(mobile.refresh.top).toBeGreaterThanOrEqual(mobile.profile.bottom+2);

    expect(mobile.menuStyle.display).toBe('grid');
    expect(mobile.menuStyle.placeItems).toContain('center');
    expect(mobile.menu.width).toBeGreaterThanOrEqual(width<=380?44:48);
    expect(mobile.menu.width).toBeLessThanOrEqual(width<=380?45:49);
    expect(mobile.menu.height).toBe(mobile.menu.width);
    expect(mobile.menuStyle.bg).toContain('linear-gradient');
    expect(mobile.menuStyle.pseudoWidth).toBeGreaterThanOrEqual(18);
    expect(mobile.menuStyle.pseudoHeight).toBeGreaterThanOrEqual(11);
    expect(Math.abs(mobile.brand.top-mobile.menu.top)).toBeLessThanOrEqual(18);

    expect(mobile.topbarHeight).toBeLessThanOrEqual(92);
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.clientWidth+1);
  }

  await page.setViewportSize({width:390,height:844});
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
  expect(installable.width).toBeGreaterThanOrEqual(122);
  expect(installable.height).toBeGreaterThanOrEqual(31);
  expect(installable.fontSize).toBeGreaterThan(0);
  expect(installable.text).toContain('Instalar aplicación');
  expect(installable.topbarHeight).toBeLessThanOrEqual(126);
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
