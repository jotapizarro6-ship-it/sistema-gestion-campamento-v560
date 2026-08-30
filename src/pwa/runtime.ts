(()=>{
  'use strict';
  const W=window as any;
  if(W.__CAMP_PWA_RUNTIME__)return;
  W.__CAMP_PWA_RUNTIME__=true;
  const VERSION='5.6.1-modern.1';
  type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
  let deferredPrompt:InstallPromptEvent|null=null;
  let registration:ServiceWorkerRegistration|null=null;
  let reloading=false;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||W.navigator?.standalone===true;
  const secure=()=>location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
  function ensureManifest(){
    if(document.querySelector('link[rel="manifest"]'))return;
    const link=document.createElement('link');link.rel='manifest';link.href='manifest.webmanifest';document.head.appendChild(link);
  }
  function ensureMeta(){
    if(!document.querySelector('link[rel="icon"]')){const icon=document.createElement('link');icon.rel='icon';icon.type='image/svg+xml';icon.href='assets/icons/campamento.svg';document.head.appendChild(icon)}
    document.documentElement.dataset.campAppVersion=VERSION;
    document.body.dataset.campDisplayMode=standalone()?'standalone':'browser';
  }
  function adminShortcut(){
    if(location.pathname.endsWith('/admin.html')||document.getElementById('campPwaAdminLink'))return;
    const anchor=document.createElement('a');anchor.id='campPwaAdminLink';anchor.href='admin.html';anchor.className='link-back';anchor.textContent='Acceso administración';anchor.style.cssText='display:block;text-align:center;margin-top:14px';
    const card=document.querySelector('.public-card');card?.appendChild(anchor);
  }
  function installButton(){
    let button=document.getElementById('campPwaInstall') as HTMLButtonElement|null;
    if(standalone()){button?.remove();return}
    if(!deferredPrompt)return;
    if(!button){
      button=document.createElement('button');button.id='campPwaInstall';button.type='button';button.className='btn btn-secondary';button.textContent='Instalar aplicación';button.style.cssText='margin-top:10px';
      const target=document.querySelector('.top-actions')||document.querySelector('.public-query-panel');target?.appendChild(button);
      button.addEventListener('click',async()=>{
        if(!deferredPrompt)return;await deferredPrompt.prompt();await deferredPrompt.userChoice.catch(()=>({outcome:'dismissed'}));deferredPrompt=null;installButton();
      });
    }
  }
  function updateBanner(reg:ServiceWorkerRegistration){
    if(document.getElementById('campPwaUpdate'))return;
    const box=document.createElement('div');box.id='campPwaUpdate';box.setAttribute('role','status');box.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10000;max-width:min(92vw,560px);background:#0f2d4a;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;font:600 13px system-ui';
    const text=document.createElement('span');text.textContent='Nueva versión de Sistema Campamento disponible.';
    const button=document.createElement('button');button.type='button';button.textContent='Actualizar';button.style.cssText='border:0;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer';
    button.addEventListener('click',async()=>{
      button.disabled=true;
      const current=reg.waiting;if(current){current.postMessage({type:'SKIP_WAITING'});return}
      await reg.update();
      const next=(reg as any).waiting as ServiceWorker|null;
      if(next)next.postMessage({type:'SKIP_WAITING'});else location.reload();
    });
    box.append(text,button);document.body.appendChild(box);
  }
  function watchRegistration(reg:ServiceWorkerRegistration){
    registration=reg;
    if(reg.waiting&&navigator.serviceWorker.controller)updateBanner(reg);
    reg.addEventListener('updatefound',()=>{
      const worker=reg.installing;if(!worker)return;
      worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)updateBanner(reg)});
    });
  }
  async function pollVersion(){
    if(!registration||!navigator.onLine)return;
    try{
      const response=await fetch(`version.json?ts=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;
      const info=await response.json() as {version?:string};
      if(info.version&&info.version!==VERSION){document.documentElement.dataset.campUpdateAvailable='true';await registration.update();if(registration.waiting)updateBanner(registration)}
    }catch(_){/* la resiliencia general maneja el estado de red */}
  }
  async function register(){
    if(!('serviceWorker' in navigator)||!secure())return;
    try{const reg=await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});watchRegistration(reg);await pollVersion()}catch(err){console.warn('PWA no disponible',err)}
  }
  function connection(){document.body.dataset.campNetwork=navigator.onLine?'online':'offline'}
  ensureManifest();
  window.addEventListener('DOMContentLoaded',()=>{ensureMeta();adminShortcut();installButton();connection()},{once:true});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event as InstallPromptEvent;installButton()});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;installButton()});
  window.addEventListener('online',()=>{connection();pollVersion()});
  window.addEventListener('offline',connection);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollVersion()});
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload()}});
  setInterval(pollVersion,10*60*1000);
  register();
  W.CampPWA={VERSION,isStandalone:standalone,checkForUpdates:pollVersion,get registration(){return registration}};
})();
