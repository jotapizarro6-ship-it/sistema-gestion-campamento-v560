(()=>{
  'use strict';
  const CSS_ID='camp-responsive-admin-css';
  const MOBILE_MAX=720;
  const TABLET_MAX=1100;
  let scheduled=false,pendingRoot=null;

  function ensureStyles(){
    if(document.getElementById(CSS_ID))return;
    const link=document.createElement('link');
    link.id=CSS_ID;
    link.rel='stylesheet';
    link.href='assets/responsive-admin.css';
    document.head.appendChild(link);
  }

  function layoutName(){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    return w<=MOBILE_MAX?'phone':w<=TABLET_MAX?'tablet':'desktop';
  }

  function syncLayout(){
    const body=document.body;
    if(!body)return;
    const layout=layoutName();
    body.dataset.adminLayout=layout;
    const sidebar=document.getElementById('sidebar');
    const menu=document.getElementById('menuBtn');
    if(layout==='desktop'){
      sidebar?.classList.remove('open');
      body.classList.remove('admin-nav-open');
      menu?.setAttribute('aria-expanded','false');
    }else{
      const open=Boolean(sidebar?.classList.contains('open'));
      body.classList.toggle('admin-nav-open',open);
      menu?.setAttribute('aria-expanded',open?'true':'false');
    }
  }

  function enhanceTables(root=document){
    const nodes=[];
    if(root?.matches?.('.table-wrap'))nodes.push(root);
    root?.querySelectorAll?.('.table-wrap').forEach(x=>nodes.push(x));
    nodes.forEach(wrap=>{
      const table=wrap.querySelector('.data-table');
      if(!table)return;
      const labels=[...table.querySelectorAll('thead th')].map(th=>(th.textContent||'').trim());
      table.querySelectorAll('tbody tr').forEach(tr=>{
        [...tr.children].forEach((td,i)=>{
          if(!td.dataset.label)td.dataset.label=labels[i]||'Dato';
        });
      });
      wrap.classList.add('responsive-data-wrap');
    });
  }

  function clarifyOperationalCapacity(root=document){
    root?.querySelectorAll?.('.kpi .label').forEach(el=>{
      if((el.textContent||'').trim()==='Capacidad total'){
        el.textContent='Capacidad operativa';
        el.title='Capacidad habilitada para la fecha. El inventario físico del Excel se muestra por separado.';
      }
    });
  }

  function enhance(root=document.querySelector('.view.active')||document){
    scheduled=false;
    pendingRoot=null;
    enhanceTables(root);
    clarifyOperationalCapacity(root);
    syncLayout();
  }

  function scheduleEnhance(root=document.querySelector('.view.active')||document){
    pendingRoot=root||pendingRoot;
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>enhance(pendingRoot||document.querySelector('.view.active')||document));
  }

  function closeNav(){
    const sidebar=document.getElementById('sidebar');
    sidebar?.classList.remove('open');
    document.body?.classList.remove('admin-nav-open');
    document.getElementById('menuBtn')?.setAttribute('aria-expanded','false');
  }

  function start(){
    ensureStyles();
    syncLayout();
    enhance(document.querySelector('.view.active')||document);

    // En lugar de observar todo el DOM, respondemos a eventos explícitos del único controlador
    // de navegación/renderizado. Así una tabla oculta nunca provoca recorridos globales.
    window.addEventListener('camp:view-rendered',event=>scheduleEnhance(event.detail?.root||document.querySelector('.view.active')));
    window.addEventListener('camp:view-changed',()=>syncLayout());

    document.addEventListener('click',e=>{
      const target=e.target;
      if(!(target instanceof Element))return;
      const menu=target.closest('#menuBtn');
      const sidebar=document.getElementById('sidebar');
      if(menu){setTimeout(syncLayout,0);return;}
      if(target.closest('.nav-btn')&&layoutName()!=='desktop'){setTimeout(closeNav,0);return;}
      if(layoutName()!=='desktop'&&sidebar?.classList.contains('open')&&!target.closest('#sidebar'))closeNav();
    },true);

    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&layoutName()!=='desktop')closeNav()});
    window.addEventListener('resize',()=>{syncLayout();scheduleEnhance(document.querySelector('.view.active'))},{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(()=>{syncLayout();scheduleEnhance(document.querySelector('.view.active'))},120),{passive:true});
  }

  ensureStyles();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
