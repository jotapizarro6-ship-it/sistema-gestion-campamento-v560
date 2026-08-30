'use strict';
const CACHE_VERSION='campamento-shell-5.6.1-modern.10';
const SHELL=[
  './','./index.html','./admin.html','./manifest.webmanifest',
  './assets/styles.css','./assets/app-1.js','./assets/app-2a.js','./assets/app-2b.js','./assets/app-3a.js','./assets/app-3b.js','./assets/app-4.js',
  './assets/ui-experience-fixes.css','./assets/ui-experience-fixes.js','./assets/decision-cockpit.css','./assets/decision-cockpit-bridge.js','./assets/decision-cockpit.js',
  './assets/public-assignment.css','./assets/public-assignment-emphasis.css','./assets/public-worker-v2.css','./assets/public-worker-no-duplicate.css','./assets/public-worker-v2.js',
  './assets/ts/public/date.js','./assets/ts/pwa/runtime.js','./assets/ts/analytics/powerbi-engine.js','./assets/ts/charts/performance.js',
  './assets/icons/campamento.svg','./assets/icons/campamento-192.png','./assets/icons/campamento-512.png'
];
const scoped=p=>new URL(p,self.registration.scope).toString();
async function precache(){
  const cache=await caches.open(CACHE_VERSION);
  await Promise.allSettled(SHELL.map(async p=>{
    try{const r=await fetch(scoped(p),{cache:'reload'});if(r.ok)await cache.put(scoped(p),r.clone())}catch(_){/* instalación tolerante */}
  }));
}
self.addEventListener('install',event=>event.waitUntil(precache()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('campamento-shell-')&&k!==CACHE_VERSION).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
async function networkFirstNavigation(request){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6000);
  try{
    const response=await fetch(request,{signal:ctl.signal});
    if(response.ok){const cache=await caches.open(CACHE_VERSION);cache.put(request,response.clone()).catch(()=>{})}
    return response;
  }catch(_){
    const hit=await caches.match(request);if(hit)return hit;
    const pathname=new URL(request.url).pathname;
    const fallback=pathname.endsWith('/admin.html')?'./admin.html':'./index.html';
    const shell=await caches.match(scoped(fallback));if(shell)return shell;
    return new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><h1>Sin conexión</h1><p>La interfaz no está disponible en caché todavía. Conéctate a Internet y vuelve a abrir Sistema Campamento.</p>',{status:503,headers:{'content-type':'text/html; charset=utf-8'}});
  }finally{clearTimeout(timer)}
}
async function cacheFirst(request){
  const cached=await caches.match(request);if(cached)return cached;
  const response=await fetch(request);
  if(response.ok&&response.type==='basic'){const cache=await caches.open(CACHE_VERSION);cache.put(request,response.clone()).catch(()=>{})}
  return response;
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/version.json'))return;
  if(request.mode==='navigate'){event.respondWith(networkFirstNavigation(request));return}
  if(/\.(?:css|js|svg|png|webmanifest)$/i.test(url.pathname))event.respondWith(cacheFirst(request));
});