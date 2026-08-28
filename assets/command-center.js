(()=>{
  'use strict';
  if(typeof window==='undefined'||!window.CampOps||window.__CAMP_COMMAND_CENTER__)return;
  window.__CAMP_COMMAND_CENTER__=true;

  const sevRank={CRITICO:0,ATENCION:1,INFO:2};
  const statusLabel={PENDIENTE:'Pendiente',EN_GESTION:'En gestión',RESUELTO:'Resuelto',CANCELADO:'Cancelado'};
  const severity=(level)=>level==='critical'||level==='high'?'CRITICO':level==='medium'?'ATENCION':'INFO';
  const active=x=>!['RESUELTO','CANCELADO'].includes(x.status);
  const overdue=x=>active(x)&&x.due_date&&x.due_date<todayISO();
  const autoAlerts=()=>{
    if(!A.data)return[];const an=analytics(A.data),all=[...an.exceptions,...an.anomalies];
    return all.map((e,i)=>({
      key:`${e.code||plain(e.title).replace(/[^A-Z0-9]+/g,'_')}:${e.detail?.match(/\d{2}-\d{2}-\d{4}/)?.[0]||an.today}:${i}`,
      code:e.code||'ANOMALIA',title:e.title,detail:e.detail||'',recommendation:e.action||'Revisar el indicador y documentar la decisión.',severity:severity(e.level),count:Number(e.count||0),related_date:an.today
    })).sort((a,b)=>sevRank[a.severity]-sevRank[b.severity]||b.count-a.count||a.title.localeCompare(b.title,'es'));
  };
  const actionCard=a=>{
    const cls=a.severity==='CRITICO'?'critical':a.severity==='ATENCION'?'attention':'info';
    const due=a.due_date?fmtDate(a.due_date):'Sin fecha límite';
    return `<article class="ops-action-card ${cls} ${overdue(a)?'overdue':''}">
      <div class="ops-action-head"><span class="ops-severity ${cls}">${esc(a.severity)}</span><span class="ops-action-status ${plain(a.status).toLowerCase()}">${esc(statusLabel[a.status]||a.status)}</span></div>
      <h4>${esc(a.title)}</h4><p>${esc(a.detail||'Sin detalle adicional.')}</p>
      <div class="ops-action-meta"><span>👤 ${esc(a.owner_name||'Sin responsable')}</span><span>📅 ${esc(due)}</span><span>${esc(a.category||'OPERACIONAL')}</span></div>
      ${a.resolution_note?`<div class="ops-resolution">Cierre: ${esc(a.resolution_note)}</div>`:''}
      ${active(a)?`<div class="ops-action-buttons"><button class="btn btn-secondary small-btn" data-action-progress="${a.id}" data-ops-write="OPERATOR">En gestión</button><button class="btn btn-success small-btn" data-action-resolve="${a.id}" data-ops-write="OPERATOR">Resolver</button>${CampOps.isAdmin()?`<button class="btn btn-danger small-btn" data-action-delete="${a.id}" data-ops-write="ADMIN">Eliminar</button>`:''}</div>`:''}
    </article>`;
  };

  async function refresh(){await CampOps.loadOpsState();CampOps.renderOpsViews()}
  async function createFromAlert(alert){
    if(!CampOps.canWrite())return showMessage('El perfil Jefatura es de solo lectura.','error');
    const existing=(A.ops.actions||[]).find(x=>x.source_key===alert.key&&active(x));if(existing){showMessage('Esta alerta ya tiene una acción abierta.','info');return}
    try{await CampOps.controlApi('action_create',{method:'POST',body:{title:alert.title,detail:`${alert.detail}${alert.recommendation?` · Recomendación: ${alert.recommendation}`:''}`,category:'ALERTA AUTOMÁTICA',severity:alert.severity,status:'PENDIENTE',due_date:alert.related_date,related_date:alert.related_date,source_type:'AUTO',source_key:alert.key}});showMessage('Acción creada desde la alerta.');await refresh()}catch(e){showMessage(e.message,'error')}
  }
  async function updateAction(id,status){
    if(!CampOps.canWrite())return showMessage('El perfil Jefatura es de solo lectura.','error');
    let resolution_note='';if(status==='RESUELTO')resolution_note=prompt('Observación de cierre (opcional):','')||'';
    try{await CampOps.controlApi('action_update',{method:'POST',body:{id,status,resolution_note}});showMessage(status==='RESUELTO'?'Acción resuelta.':'Acción actualizada.');await refresh()}catch(e){showMessage(e.message,'error')}
  }
  async function deleteAction(id){if(!CampOps.isAdmin())return;if(!confirm('¿Eliminar esta acción? La eliminación quedará registrada en auditoría.'))return;try{await CampOps.controlApi('action_delete',{method:'POST',body:{id}});showMessage('Acción eliminada.');await refresh()}catch(e){showMessage(e.message,'error')}}

  function render(){
    const view=document.getElementById('view-control-room');if(!view)return;
    if(!A.data){view.innerHTML='<div class="notice info">Cargando Centro de Control…</div>';return}
    const alerts=autoAlerts(),actions=[...(A.ops.actions||[])],open=actions.filter(active),critical=open.filter(x=>x.severity==='CRITICO'),late=open.filter(overdue),plan=(A.ops.plan_events||[]).filter(x=>!['COMPLETADO','CANCELADO'].includes(x.status)&&x.start_date>=todayISO()).sort((a,b)=>a.start_date.localeCompare(b.start_date)),nextPlan=plan.slice(0,6),existingKeys=new Set(open.map(x=>x.source_key).filter(Boolean));
    const openSorted=open.sort((a,b)=>(overdue(b)?1:0)-(overdue(a)?1:0)||sevRank[a.severity]-sevRank[b.severity]||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
    const resolved=actions.filter(x=>x.status==='RESUELTO').slice(0,12);
    const sync=A.opsOffline?'Sin conexión':A.opsLastSync?new Date(A.opsLastSync).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'Pendiente';
    view.innerHTML=`<div class="section-head"><div><h2>Centro de Alertas y Acciones Operacionales</h2><div class="muted">Detecta riesgos, asigna responsables y da seguimiento hasta su resolución.</div></div><div class="section-actions"><span class="badge ${A.opsOffline?'red':'green'}">${A.opsOffline?'Modo resiliente':'En línea'}</span><span class="badge blue">Perfil ${esc(A.profile)}</span></div></div>
      <div class="ops-kpi-grid">
        <div class="ops-kpi red"><span>Alertas críticas</span><strong>${fmtInt(alerts.filter(x=>x.severity==='CRITICO').length)}</strong><small>señales automáticas actuales</small></div>
        <div class="ops-kpi amber"><span>Acciones abiertas</span><strong>${fmtInt(open.length)}</strong><small>${fmtInt(critical.length)} críticas</small></div>
        <div class="ops-kpi ${late.length?'red':'green'}"><span>Acciones vencidas</span><strong>${fmtInt(late.length)}</strong><small>${late.length?'requieren gestión':'sin vencimientos'}</small></div>
        <div class="ops-kpi blue"><span>Próximos hitos</span><strong>${fmtInt(plan.filter(x=>x.start_date<=addDays(todayISO(),7)).length)}</strong><small>en los próximos 7 días</small></div>
        <div class="ops-kpi navy"><span>Última sincronización</span><strong>${esc(sync)}</strong><small>${esc(A.data.settings?.source_file||'Base central')}</small></div>
      </div>
      <div class="ops-grid two">
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Señales automáticas</h3><p>Excepciones y anomalías calculadas con la base vigente.</p></div><span class="ops-tag">AUTO</span></div>
          <div class="ops-alert-list">${alerts.slice(0,10).map((x,i)=>`<article class="ops-alert ${x.severity.toLowerCase()}"><div><span class="ops-severity ${x.severity.toLowerCase()}">${esc(x.severity)}</span><h4>${esc(x.title)}</h4><p>${esc(x.detail)}</p><small>${esc(x.recommendation)}</small></div><div>${existingKeys.has(x.key)?'<span class="badge green">Acción abierta</span>':`<button class="btn btn-primary small-btn" data-auto-alert="${i}" data-ops-write="OPERATOR">Crear acción</button>`}</div></article>`).join('')||'<div class="notice ok">Sin alertas automáticas relevantes.</div>'}</div>
        </section>
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Estado de acciones</h3><p>Distribución por estado y criticidad.</p></div><span class="ops-tag">SEGUIMIENTO</span></div><div id="opsActionsChart" class="ops-chart"><div class="ops-chart-fallback">${fmtInt(open.length)} abiertas · ${fmtInt(resolved.length)} resueltas recientes</div></div><div class="ops-sync-note">La resolución de una acción no modifica automáticamente reservas, movimientos ni capacidad.</div></section>
      </div>
      <section class="panel ops-panel mt"><div class="ops-panel-head"><div><h3>Nueva acción operacional</h3><p>Registra compromisos, responsables y fecha objetivo.</p></div><span class="ops-tag">CONTROL</span></div>
        <form id="opsActionForm" class="form-grid">
          <label class="field span2"><span>Acción / asunto</span><input name="title" maxlength="160" required></label>
          <label class="field span2"><span>Detalle</span><textarea name="detail" rows="2" maxlength="1200"></textarea></label>
          <label class="field"><span>Criticidad</span><select name="severity"><option>ATENCION</option><option>CRITICO</option><option>INFO</option></select></label>
          <label class="field"><span>Categoría</span><input name="category" value="OPERACIONAL"></label>
          <label class="field"><span>Responsable</span><input name="owner_name" placeholder="Nombre / área"></label>
          <label class="field"><span>Fecha límite</span><input name="due_date" type="date"></label>
          <div><button class="btn btn-primary" type="submit" data-ops-write="OPERATOR">Registrar acción</button></div>
        </form>
      </section>
      <div class="ops-grid two mt">
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Acciones prioritarias</h3><p>Ordenadas por vencimiento y criticidad.</p></div><span class="ops-tag ${late.length?'critical':'normal'}">${late.length?'VENCIDAS':'AL DÍA'}</span></div><div class="ops-action-list">${openSorted.slice(0,20).map(actionCard).join('')||'<div class="notice ok">No existen acciones pendientes.</div>'}</div></section>
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Próximos hitos del Plan Maestro</h3><p>Eventos que pueden afectar la operación o capacidad.</p></div><button class="btn btn-secondary small-btn" id="opsGoPlanning" data-ops-local="1">Abrir planificación</button></div><div class="ops-milestone-list">${nextPlan.map(x=>`<div class="ops-milestone"><time>${esc(fmtDate(x.start_date))}</time><div><strong>${esc(x.title)}</strong><small>${esc(x.category)} · ${esc(x.owner_name||'Sin responsable')}</small></div><span class="badge ${x.status==='EN_CURSO'?'amber':'blue'}">${esc(x.status)}</span></div>`).join('')||'<div class="empty">Aún no hay hitos futuros registrados.</div>'}</div></section>
      </div>`;

    view.querySelectorAll('[data-auto-alert]').forEach(b=>b.addEventListener('click',()=>createFromAlert(alerts[Number(b.dataset.autoAlert)])));
    view.querySelector('#opsActionForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!CampOps.canWrite())return showMessage('El perfil Jefatura es de solo lectura.','error');const body=Object.fromEntries(new FormData(e.currentTarget));try{await CampOps.controlApi('action_create',{method:'POST',body});showMessage('Acción operacional registrada.');e.currentTarget.reset();await refresh()}catch(err){showMessage(err.message,'error')}});
    view.querySelectorAll('[data-action-progress]').forEach(b=>b.addEventListener('click',()=>updateAction(Number(b.dataset.actionProgress),'EN_GESTION')));
    view.querySelectorAll('[data-action-resolve]').forEach(b=>b.addEventListener('click',()=>updateAction(Number(b.dataset.actionResolve),'RESUELTO')));
    view.querySelectorAll('[data-action-delete]').forEach(b=>b.addEventListener('click',()=>deleteAction(Number(b.dataset.actionDelete))));
    view.querySelector('#opsGoPlanning')?.addEventListener('click',()=>switchView('planning'));
    try{window.CampOpsECharts?.renderActions?.()}catch(_){ }
  }

  CampOps.autoAlerts=autoAlerts;
  CampOps.registerRenderer(render);
})();
