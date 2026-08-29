(()=>{
  'use strict';
  const VERSION='20260829-modmoi1';
  const API='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-workforce-api';
  const state={rules:{},loaded:false,loading:null,turno:'TODOS',empresa:'TODAS',expanded:new Set(),saving:false,error:''};
  const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const assigned=w=>Boolean(String(w?.modulo??'').trim()&&String(w?.habitacion??'').trim()&&String(w?.cama??'').trim());
  const classification=(w,rules)=>rules[fold(w?.categoria)]||'POR_DEFINIR';
  const uniq=xs=>[...new Set(xs.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es',{sensitivity:'base'}));

  function compute(workers,rules,filters={}){
    const turno=filters.turno||'TODOS',empresa=filters.empresa||'TODAS';
    const rows=(Array.isArray(workers)?workers:[]).filter(assigned).filter(w=>(turno==='TODOS'||String(w.turno||'')===turno)&&(empresa==='TODAS'||String(w.empresa||'')===empresa));
    const totals={total:rows.length,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:0};
    const companies=new Map();
    for(const w of rows){
      const cls=classification(w,rules);totals[cls]=(totals[cls]||0)+1;
      const company=String(w.empresa||'SIN EMPRESA').trim()||'SIN EMPRESA';
      const cargo=String(w.categoria||'SIN CATEGORÍA').trim()||'SIN CATEGORÍA';
      if(!companies.has(company))companies.set(company,{label:company,total:0,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:0,cargos:new Map()});
      const c=companies.get(company);c.total++;c[cls]++;
      if(!c.cargos.has(cargo))c.cargos.set(cargo,{label:cargo,total:0,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:0,classification:cls});
      const g=c.cargos.get(cargo);g.total++;g[cls]++;g.classification=cls;
    }
    const companyRows=[...companies.values()].map(c=>({...c,cargos:[...c.cargos.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'es'))})).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'es'));
    return {rows,totals,companies:companyRows,turnos:uniq((workers||[]).filter(assigned).map(w=>String(w.turno||'').trim())),empresas:uniq((workers||[]).filter(assigned).map(w=>String(w.empresa||'').trim()))};
  }

  async function api(method='GET',body){
    const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),12000);
    try{
      const res=await fetch(API,{method,headers:{authorization:`Bearer ${window.A?.token||''}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctl.signal});
      const out=await res.json().catch(()=>({}));
      if(!res.ok||out?.ok===false)throw new Error(out?.error||`Error ${res.status}`);
      return out;
    }finally{clearTimeout(tm)}
  }
  async function loadRules(force=false){
    if(state.loaded&&!force)return state.rules;
    if(state.loading&&!force)return state.loading;
    state.loading=(async()=>{
      try{const out=await api('GET');state.rules=out.rules&&typeof out.rules==='object'?out.rules:{};state.loaded=true;state.error='';return state.rules}
      catch(err){state.loaded=true;state.error=err?.message||'No fue posible cargar la clasificación';return state.rules}
      finally{state.loading=null}
    })();
    return state.loading;
  }
  async function saveRule(category,cls){
    if(state.saving)return;
    state.saving=true;
    try{
      const out=await api('POST',{category,classification:cls});
      state.rules=out.rules&&typeof out.rules==='object'?out.rules:{...state.rules,[fold(category)]:cls};
      state.error='';
    }catch(err){state.error=err?.message||'No fue posible guardar la clasificación';throw err}
    finally{state.saving=false}
  }

  function pct(n,total){return total?Math.round(n/total*1000)/10:0}
  function option(value,label,current){return `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`}
  function renderMatrix(model){
    if(!model.companies.length)return '<div class="wm-matrix"><div class="wm-empty">No hay trabajadores alojados para los filtros seleccionados.</div></div>';
    if(model.companies.length===1&&state.expanded.size===0)state.expanded.add(model.companies[0].label);
    const rows=model.companies.map(c=>{
      const open=state.expanded.has(c.label);
      const cargoRows=open?c.cargos.map(g=>`<div class="wm-row wm-cargo-row" data-company="${esc(c.label)}"><div class="wm-cargo">${esc(g.label)}</div><div class="wm-num">${g.DIRECTA||0}</div><div class="wm-num">${g.INDIRECTA||0}</div><div class="wm-num">${g.total}</div><div><select class="wm-class" data-category="${encodeURIComponent(g.label)}" aria-label="Clasificación ${esc(g.label)}"><option value="DIRECTA" ${g.classification==='DIRECTA'?'selected':''}>Directa</option><option value="INDIRECTA" ${g.classification==='INDIRECTA'?'selected':''}>Indirecta</option><option value="POR_DEFINIR" ${g.classification==='POR_DEFINIR'?'selected':''}>Por definir</option></select></div></div>`).join(''):'';
      return `<div class="wm-row wm-company" data-company-toggle="${encodeURIComponent(c.label)}"><div class="wm-company-name"><button class="wm-toggle" type="button" aria-label="${open?'Contraer':'Expandir'} ${esc(c.label)}">${open?'−':'+'}</button><span>${esc(c.label)}</span></div><div class="wm-num">${c.DIRECTA||0}</div><div class="wm-num">${c.INDIRECTA||0}</div><div class="wm-num">${c.total}</div><div class="wm-num">${c.POR_DEFINIR?`${c.POR_DEFINIR} por definir`:'✓ clasificado'}</div></div>${cargoRows}`;
    }).join('');
    return `<div class="wm-matrix"><div class="wm-row wm-header"><div>Empresa / cargo</div><div class="wm-num">MOD</div><div class="wm-num">MOI</div><div class="wm-num">Total</div><div>Clasificación</div></div>${rows}</div>`;
  }

  function buildHost(){
    const management=document.getElementById('view-management');if(!management)return null;
    let host=document.getElementById('workforce-mod-moi');
    if(!host){host=document.createElement('section');host.id='workforce-mod-moi';host.className='panel';const anchor=management.querySelector('.kpi-grid');anchor?.insertAdjacentElement('afterend',host);if(!host.isConnected)management.appendChild(host)}
    return host;
  }
  function bind(host,model){
    host.querySelector('#wmTurno')?.addEventListener('change',e=>{state.turno=e.target.value;render()});
    host.querySelector('#wmEmpresa')?.addEventListener('change',e=>{state.empresa=e.target.value;render()});
    host.querySelectorAll('[data-company-toggle]').forEach(el=>el.addEventListener('click',()=>{const name=decodeURIComponent(el.dataset.companyToggle||'');state.expanded.has(name)?state.expanded.delete(name):state.expanded.add(name);render()}));
    host.querySelectorAll('.wm-class').forEach(sel=>sel.addEventListener('change',async()=>{const category=decodeURIComponent(sel.dataset.category||''),next=sel.value,prev=state.rules[fold(category)]||'POR_DEFINIR';sel.disabled=true;try{state.rules[fold(category)]=next;render();await saveRule(category,next);render()}catch(err){state.rules[fold(category)]=prev;render();if(typeof window.showMessage==='function')window.showMessage(err?.message||'No fue posible guardar MOD/MOI','error')}finally{sel.disabled=false}}));
  }
  async function render(){
    if(typeof document==='undefined'||!window.A?.data?.workers)return;
    const active=document.getElementById('view-management');if(!active?.classList.contains('active'))return;
    const host=buildHost();if(!host)return;
    if(!state.loaded){host.innerHTML='<div class="muted">Preparando clasificación de mano de obra…</div>';await loadRules();if(!active.classList.contains('active'))return}
    const workers=window.A.data.workers||[],model=compute(workers,state.rules,{turno:state.turno,empresa:state.empresa}),t=model.totals;
    if(state.turno!=='TODOS'&&!model.turnos.includes(state.turno))state.turno='TODOS';
    if(state.empresa!=='TODAS'&&!model.empresas.includes(state.empresa))state.empresa='TODAS';
    const dPct=pct(t.DIRECTA,t.total),iPct=pct(t.INDIRECTA,t.total),uPct=pct(t.POR_DEFINIR,t.total);
    host.innerHTML=`<div class="wm-head"><div><div class="eyebrow">DOTACIÓN EN TURNO</div><h3 class="wm-title">Mano de Obra Directa / Indirecta</h3><div class="wm-sub">Cuenta trabajadores con módulo + habitación + cama asignados. Matriz interactiva empresa → cargo, inspirada en análisis jerárquico de Power BI.</div></div><div class="wm-filters"><label class="field small"><span>Turno</span><select id="wmTurno">${option('TODOS','Todos los turnos',state.turno)}${model.turnos.map(x=>option(x,x,state.turno)).join('')}</select></label><label class="field small"><span>Empresa</span><select id="wmEmpresa">${option('TODAS','Todas las empresas',state.empresa)}${model.empresas.map(x=>option(x,x,state.empresa)).join('')}</select></label></div></div>
    <div class="wm-kpis"><div class="wm-kpi"><span>En turno</span><strong>${t.total}</strong><small>trabajadores alojados</small></div><div class="wm-kpi"><span>MOD</span><strong>${t.DIRECTA}</strong><small>${dPct}% de la dotación</small></div><div class="wm-kpi"><span>MOI</span><strong>${t.INDIRECTA}</strong><small>${iPct}% de la dotación</small></div><div class="wm-kpi"><span>Por definir</span><strong>${t.POR_DEFINIR}</strong><small>cargos pendientes</small></div><div class="wm-kpi"><span>Índice MOD</span><strong>${dPct}%</strong><small>MOD / total en turno</small></div></div>
    <div class="wm-stack" role="img" aria-label="Composición MOD ${dPct}%, MOI ${iPct}%, por definir ${uPct}%"><span class="direct" style="width:${dPct}%"></span><span class="indirect" style="width:${iPct}%"></span><span class="undef" style="width:${uPct}%"></span></div><div class="wm-legend"><span><i class="d"></i>MOD ${t.DIRECTA}</span><span><i class="i"></i>MOI ${t.INDIRECTA}</span><span><i class="u"></i>Por definir ${t.POR_DEFINIR}</span></div>
    ${renderMatrix(model)}${state.error?`<div class="notice warn mt">${esc(state.error)}</div>`:''}<div class="wm-note"><strong>Criterio editable:</strong> la clasificación se guarda por cargo y se reutiliza en futuras cargas Excel. Si aparece un cargo nuevo, queda como <b>Por definir</b> hasta que Administración lo clasifique.</div>`;
    bind(host,model);
  }

  if(typeof window!=='undefined'){
    window.addEventListener('camp:view-rendered',e=>{if(e?.detail?.view==='management')setTimeout(render,0)});
    window.CampWorkforceMODMOI={VERSION,fold,assigned,classification,compute,loadRules,render,state};
  }else globalThis.CampWorkforceMODMOI={VERSION,fold,assigned,classification,compute,state};
})();
