(()=>{
  'use strict';
  if(typeof window==='undefined'||window.__CAMP_HIGH_VOLUME_POST_INLINE__)return;
  window.__CAMP_HIGH_VOLUME_POST_INLINE__=true;

  const MAX_VISIBLE_MATCHES=60;
  const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
  const rutCompact=v=>String(v??'').toUpperCase().replace(/[^0-9K]/g,'');
  const cleanText=v=>typeof clean==='function'?clean(v):String(v??'').trim();
  const safeValue=v=>esc(cleanText(v)||'No informado');
  const debounce=(fn,ms=90)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}};

  let cachedData=null,cachedIndex=[];
  function getIndex(data){
    if(cachedData!==data){
      cachedData=data;
      cachedIndex=window.CampHighVolume?.buildWorkerIndex?.(data?.workers||[])||[];
    }
    return cachedIndex;
  }
  function fastMatches(data,query){
    const raw=String(query??'').trim();if(!raw)return[];
    const rq=rutCompact(raw),index=getIndex(data);
    if(rq.length>=4){
      const byRut=index.filter(x=>rutCompact(x.worker?.rut).includes(rq));
      if(byRut.length)return byRut.map(x=>x.worker);
    }
    return (window.CampHighVolume?.filterWorkerIndex?.(index,raw)||[]).map(x=>x.worker);
  }
  function workerDetail(worker){
    const assigned=Boolean(cleanText(worker.modulo)&&cleanText(worker.habitacion)&&cleanText(worker.cama));
    return `<section class="worker-result-card mb"><div class="worker-result-header"><div><div class="eyebrow">TRABAJADOR ENCONTRADO</div><h2 class="worker-name">${safeValue(worker.nombre)}</h2><div class="worker-rut">RUT ${safeValue(worker.rut)}</div></div><span class="badge ${assigned?'green':'amber'}">${assigned?'Asignación vigente':'Asignación incompleta'}</span></div><div class="worker-assignment-grid"><div class="worker-assignment-tile module"><span>Módulo</span><strong>${safeValue(worker.modulo)}</strong><small>Pabellón / piso</small></div><div class="worker-assignment-tile room"><span>Habitación</span><strong>${safeValue(worker.habitacion)}</strong><small>Habitación asignada</small></div><div class="worker-assignment-tile bed"><span>Cama</span><strong>${safeValue(worker.cama)}</strong><small>Cama asignada</small></div></div><div class="worker-meta-grid"><div class="worker-meta-item worker-meta-wide"><span>Empresa</span><strong>${safeValue(worker.empresa)}</strong></div><div class="worker-meta-item"><span>Turno</span><strong>${safeValue(worker.turno)}</strong></div><div class="worker-meta-item worker-meta-wide"><span>Residencia</span><strong>${safeValue(worker.residencia)}</strong></div><div class="worker-meta-item"><span>Sexo</span><strong>${safeValue(worker.sexo)}</strong></div><div class="worker-meta-item"><span>Especialidad</span><strong>${safeValue(worker.especialidad)}</strong></div><div class="worker-meta-item worker-meta-wide"><span>Categoría</span><strong>${safeValue(worker.categoria)}</strong></div></div></section>`;
  }
  function workerMatchCard(worker){
    const assigned=Boolean(cleanText(worker.modulo)&&cleanText(worker.habitacion)&&cleanText(worker.cama));
    return `<article class="worker-match-card"><div class="worker-match-head"><div><h3 class="worker-match-name">${safeValue(worker.nombre)}</h3><div class="worker-match-rut">RUT ${safeValue(worker.rut)}</div></div><span class="badge ${assigned?'green':'amber'}">${assigned?'Asignado':'Pendiente'}</span></div><div class="worker-match-assignment"><div><span>Módulo</span><b>${safeValue(worker.modulo)}</b></div><div><span>Hab.</span><b>${safeValue(worker.habitacion)}</b></div><div><span>Cama</span><b>${safeValue(worker.cama)}</b></div></div><div class="worker-match-meta">${safeValue(worker.empresa)} · ${safeValue(worker.turno)} · ${safeValue(worker.residencia)}</div><button class="btn btn-secondary small-btn" type="button" data-worker-rut="${esc(worker.rut)}">Ver asignación</button></article>`;
  }

  function installWorkerRenderer(){
    if(typeof renderWorkers!=='function'||typeof A==='undefined')return false;
    renderWorkers=function(){
      const d=A.data,view=document.getElementById('view-workers');if(!d||!view)return;
      getIndex(d);
      view.innerHTML=`<div class="worker-consult-shell"><div class="section-head"><div><h2>Trabajadores y asignaciones</h2><div class="muted">Consulta rápida indexada para dotaciones de alto volumen.</div></div><span class="badge blue">${fmtInt(d.workers.length)} trabajadores</span></div><section class="panel worker-search-panel mb"><div class="worker-search-row"><label class="field"><span>Buscar trabajador</span><input id="workerSearch" autocomplete="off" placeholder="RUT, nombre o apellido"></label><button id="workerSearchBtn" class="btn btn-primary" type="button">Buscar</button></div><p class="worker-search-help">RUT con o sin puntos/guion · nombre completo · uno o más apellidos. La búsqueda está preparada para cientos de trabajadores.</p></section><div id="workerSearchResults"><div class="notice info">Ingresa un RUT, nombre o apellido para visualizar la asignación del trabajador.</div></div></div>`;
      const input=document.getElementById('workerSearch'),results=document.getElementById('workerSearchResults');
      const render=query=>{
        const q=String(query??'').trim();
        if(!q){results.innerHTML='<div class="notice info">Ingresa un RUT, nombre o apellido para visualizar la asignación del trabajador.</div>';return}
        const rows=fastMatches(d,q),shown=rows.slice(0,MAX_VISIBLE_MATCHES);
        if(!rows.length){results.innerHTML=`<div class="notice error">No se encontraron trabajadores para <strong>${esc(q)}</strong>. Revisa el RUT, nombre o apellido ingresado.</div>`;return}
        if(rows.length===1){results.innerHTML=workerDetail(rows[0]);return}
        const suffix=rows.length>shown.length?` Se muestran los primeros ${shown.length}; agrega más caracteres para acotar la búsqueda.`:'';
        results.innerHTML=`<div class="notice info worker-match-summary">Se encontraron ${fmtInt(rows.length)} coincidencias.${esc(suffix)}</div><div class="worker-match-grid">${shown.map(workerMatchCard).join('')}</div>`;
        results.querySelectorAll('[data-worker-rut]').forEach(button=>button.addEventListener('click',()=>{
          const worker=shown.find(w=>cleanText(w.rut)===cleanText(button.dataset.workerRut));
          if(worker){results.innerHTML=workerDetail(worker);results.scrollIntoView({behavior:'smooth',block:'start'})}
        }));
      };
      const auto=debounce(()=>{const q=input.value.trim();if(q.length>=3)render(q);else if(!q)render('')},90);
      document.getElementById('workerSearchBtn')?.addEventListener('click',()=>render(input.value));
      input?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();render(input.value)}});
      input?.addEventListener('input',auto);
    };
    return true;
  }

  let uploadWarm=false;
  function warmUploadApi(){
    if(uploadWarm||!window.fetch)return;uploadWarm=true;
    const url='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-upload-api?action=warm';
    window.fetch(url,{method:'OPTIONS'}).catch(()=>{uploadWarm=false});
  }
  function installExcelPrewarm(){
    if(typeof switchView!=='function'||switchView.__campUploadWarm)return;
    const base=switchView;
    const wrapped=function(view){const result=base(view);if(view==='excel')warmUploadApi();return result};
    wrapped.__campUploadWarm=true;switchView=wrapped;
  }

  // Este archivo se carga antes del script inline de admin.html. El timer corre después,
  // por lo que la versión indexada queda instalada como implementación final.
  setTimeout(()=>{installWorkerRenderer();installExcelPrewarm()},0);
  window.CampHighVolumePostInline={installWorkerRenderer,warmUploadApi,fastMatches,MAX_VISIBLE_MATCHES};
})();
