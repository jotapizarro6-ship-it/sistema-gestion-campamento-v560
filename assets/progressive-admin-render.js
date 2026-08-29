(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof A==='undefined'||window.__CAMP_PROGRESSIVE_ADMIN_RENDER__)return;
  window.__CAMP_PROGRESSIVE_ADMIN_RENDER__=true;

  const renderers={
    overview:()=>renderOverview(),
    control:()=>renderControl(),
    planning:()=>renderPlanning(),
    management:()=>renderManagement(),
    history:()=>renderHistory(),
    movements:()=>renderMovements(),
    reservations:()=>renderReservations(),
    blocks:()=>renderBlocks(),
    workers:()=>renderWorkers(),
    consults:()=>renderConsults(),
    excel:()=>renderExcel(),
    exports:()=>renderExports()
  };

  let renderSeq=0;
  const nextFrame=fn=>typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):setTimeout(fn,0);

  function activeView(){
    const hash=String(location.hash||'').replace(/^#/,'');
    if(hash&&document.getElementById(`view-${hash}`))return hash;
    if(A.currentView&&document.getElementById(`view-${A.currentView}`))return A.currentView;
    return document.querySelector('.view.active')?.id?.replace(/^view-/,'')||'overview';
  }

  function loadingState(view){
    const host=document.getElementById(`view-${view}`);
    if(!host||host.children.length)return;
    host.innerHTML='<section class="panel"><div class="muted">Preparando información…</div></section>';
  }

  function renderOne(view,{refreshOps=false}={}){
    if(!A.data)return false;
    const fn=renderers[view];
    if(typeof fn!=='function'){
      if(refreshOps)window.CampOps?.renderOpsViews?.();
      return false;
    }
    const started=performance?.now?.()||Date.now();
    try{
      fn();
      window.CampOps?.applyProfileUi?.();
      if(refreshOps)setTimeout(()=>window.CampOps?.renderOpsViews?.(),0);
      const elapsed=(performance?.now?.()||Date.now())-started;
      if(elapsed>250)console.info(`[Campamento] Vista ${view} renderizada en ${Math.round(elapsed)} ms`);
      setTimeout(()=>window.CampEChartsLayout?.resizeVisible?.(),0);
      return true;
    }catch(err){
      console.error(`[Campamento] Error al renderizar ${view}`,err);
      const host=document.getElementById(`view-${view}`);
      if(host)host.innerHTML=`<div class="notice error"><strong>No fue posible mostrar esta sección.</strong><br>${esc(err?.message||'Error de visualización')}</div>`;
      if(typeof showMessage==='function')showMessage(`No fue posible mostrar ${view}. Las demás secciones siguen disponibles.`,'error');
      return false;
    }
  }

  // Reemplaza el render masivo: solo dibuja primero la vista que el usuario está mirando.
  renderAll=function(){
    if(!A.data)return;
    const view=activeView();
    A.currentView=view;
    loadingState(view);
    const seq=++renderSeq;
    nextFrame(()=>{if(seq===renderSeq||activeView()===view)renderOne(view)});
  };

  const baseSwitchView=switchView;
  switchView=function(view){
    baseSwitchView(view);
    A.currentView=view;
    loadingState(view);
    const seq=++renderSeq;
    nextFrame(()=>{
      if(seq!==renderSeq&&activeView()!==view)return;
      const rendered=renderOne(view,{refreshOps:true});
      if(!rendered)window.CampOps?.renderOpsViews?.();
    });
  };

  // Si la pestaña vuelve a primer plano, ajusta solamente lo visible; no vuelve a dibujar todo.
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&A.data){
      const v=activeView();
      setTimeout(()=>window.CampEChartsLayout?.resizeVisible?.(),0);
      if(!document.getElementById(`view-${v}`)?.children.length)renderOne(v,{refreshOps:true});
    }
  });

  window.CampProgressiveAdminRender={activeView,renderOne};
})();
