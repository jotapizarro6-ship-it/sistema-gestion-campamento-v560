(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof A==='undefined'||window.__CAMP_PROGRESSIVE_ADMIN_RENDER__)return;
  window.__CAMP_PROGRESSIVE_ADMIN_RENDER__=true;

  const VERSION='20260829-deepnav1';
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
  const OPS_VIEWS=new Set(['overview','management','planning','exports','control-room','governance']);

  let renderSeq=0;
  const afterPaint=fn=>{
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(()=>setTimeout(fn,0));
      return;
    }
    setTimeout(fn,0);
  };
  const emit=(name,detail)=>{
    try{window.dispatchEvent(new CustomEvent(name,{detail}))}catch(_){ }
  };

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
    if(!A.data||activeView()!==view)return false;
    const fn=renderers[view];
    if(typeof fn!=='function'){
      if(refreshOps&&OPS_VIEWS.has(view))setTimeout(()=>{if(activeView()===view)window.CampOps?.renderOpsViews?.(view)},0);
      return false;
    }
    const started=globalThis.performance?.now?.()||Date.now();
    const host=document.getElementById(`view-${view}`);
    try{
      fn();
      if(activeView()!==view)return false;
      window.CampOps?.applyProfileUi?.();
      if(refreshOps&&OPS_VIEWS.has(view))setTimeout(()=>{if(activeView()===view)window.CampOps?.renderOpsViews?.(view)},0);
      const elapsed=(globalThis.performance?.now?.()||Date.now())-started;
      emit('camp:view-rendered',{view,root:host,elapsed,version:VERSION});
      if(elapsed>250)console.info(`[Campamento] Vista ${view} renderizada en ${Math.round(elapsed)} ms`);
      if(OPS_VIEWS.has(view))setTimeout(()=>{if(activeView()===view)window.CampEChartsLayout?.resizeVisible?.(host)},0);
      return true;
    }catch(err){
      console.error(`[Campamento] Error al renderizar ${view}`,err);
      if(host)host.innerHTML=`<div class="notice error"><strong>No fue posible mostrar esta sección.</strong><br>${esc(err?.message||'Error de visualización')}</div>`;
      if(typeof showMessage==='function')showMessage(`No fue posible mostrar ${view}. Las demás secciones siguen disponibles.`,'error');
      return false;
    }
  }

  // Carga inicial: dibuja únicamente la vista activa y cede un frame al navegador.
  renderAll=function(){
    if(!A.data)return;
    const view=activeView();
    A.currentView=view;
    loadingState(view);
    const seq=++renderSeq;
    afterPaint(()=>{
      if(seq!==renderSeq||activeView()!==view)return;
      renderOne(view,{refreshOps:OPS_VIEWS.has(view)});
    });
  };

  // Único controlador de cambio de vista. Primero cambia clases/URL, permite que Chrome pinte
  // la nueva sección y recién después ejecuta el render de datos. Esto evita que una vista pesada
  // bloquee el repintado y que varias capas compitan por el mismo clic.
  const baseSwitchView=switchView;
  switchView=function(view){
    const host=document.getElementById(`view-${view}`);
    if(!host)return false;
    const previous=activeView();
    const result=baseSwitchView(view);
    A.currentView=view;
    const seq=++renderSeq;
    loadingState(view);
    emit('camp:view-changed',{view,previous,root:host,version:VERSION});
    afterPaint(()=>{
      if(seq!==renderSeq||activeView()!==view)return;
      renderOne(view,{refreshOps:OPS_VIEWS.has(view)});
    });
    return result;
  };
  switchView.__campSingleNavigationOwner=true;

  // Al volver a primer plano solo se ajusta lo que está visible; no se reconstruyen otras vistas.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden||!A.data)return;
    const view=activeView(),host=document.getElementById(`view-${view}`);
    if(!host?.children.length){
      const seq=++renderSeq;
      afterPaint(()=>{if(seq===renderSeq&&activeView()===view)renderOne(view,{refreshOps:OPS_VIEWS.has(view)})});
    }else if(OPS_VIEWS.has(view)){
      setTimeout(()=>window.CampEChartsLayout?.resizeVisible?.(host),0);
    }
  });

  window.CampProgressiveAdminRender={VERSION,activeView,renderOne,afterPaint,OPS_VIEWS};
})();
