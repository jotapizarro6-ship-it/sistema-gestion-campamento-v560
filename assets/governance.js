(()=>{
  'use strict';
  if(typeof window==='undefined'||!window.CampOps||window.__CAMP_GOVERNANCE__)return;
  window.__CAMP_GOVERNANCE__=true;

  const profileInfo={
    ADMINISTRADOR:{title:'Administrador',detail:'Acceso completo a la interfaz administrativa, configuración, cargas y nuevas funciones de control.'},
    OPERADOR:{title:'Operador',detail:'Gestión operacional diaria: acciones, reservas, movimientos, bloqueos e hitos. Sin cambios de Excel, costos, capacidad o cierres definitivos.'},
    JEFATURA:{title:'Jefatura · solo lectura',detail:'Consulta ejecutiva y simulación What-if local. Las escrituras se bloquean en la interfaz.'}
  };
  const formatDateTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'medium'})}catch{return String(v)}};
  const auditDetail=d=>{if(!d||typeof d!=='object')return'—';return Object.entries(d).slice(0,4).map(([k,v])=>`${k}: ${v}`).join(' · ')||'—'};

  function render(){
    const view=document.getElementById('view-governance');if(!view)return;
    const r=CampOps.resilience(),audit=A.ops?.audit||[],queue=CampOps.auditQueue(),p=profileInfo[A.profile]||profileInfo.ADMINISTRADOR,online=navigator.onLine&&!A.opsOffline;
    const source=A.data?.settings?.source_file||r?.source_file||'—',updated=A.data?.settings?.last_update||r?.last_update||'—';
    const recent=audit.slice(0,100),fail=recent.filter(x=>x.result&&x.result!=='OK').length,profiles=new Map();for(const x of recent)profiles.set(x.profile,(profiles.get(x.profile)||0)+1);
    view.innerHTML=`<div class="section-head"><div><h2>Resiliencia, Trazabilidad y Perfiles</h2><div class="muted">Gobierno operativo, continuidad de lectura y registro de acciones administrativas.</div></div><div class="section-actions"><span class="badge ${online?'green':'red'}">${online?'Conectado':'Modo resiliente'}</span><span class="badge blue">${esc(p.title)}</span></div></div>
      <div class="ops-governance-grid">
        <section class="panel ops-panel ops-profile-panel"><div class="ops-panel-head"><div><h3>Perfil activo de sesión</h3><p>Controla qué operaciones quedan habilitadas en esta sesión.</p></div><span class="ops-tag">PERFILES</span></div>
          <label class="field"><span>Perfil</span><select id="opsProfileSelect" data-profile-switch="1"><option value="ADMINISTRADOR" ${A.profile==='ADMINISTRADOR'?'selected':''}>Administrador</option><option value="OPERADOR" ${A.profile==='OPERADOR'?'selected':''}>Operador</option><option value="JEFATURA" ${A.profile==='JEFATURA'?'selected':''}>Jefatura · solo lectura</option></select></label>
          <div class="ops-profile-description"><strong>${esc(p.title)}</strong><p>${esc(p.detail)}</p></div>
          <div class="notice warn"><strong>Alcance de seguridad:</strong> estos perfiles operan dentro de la sesión administrativa actual. No son todavía cuentas independientes con contraseñas separadas. Las restricciones son de interfaz y trazabilidad; la autenticación HMAC administrativa permanece intacta.</div>
          <div class="ops-permission-grid"><div><span>Administrador</span><b>Todo</b></div><div><span>Operador</span><b>Operación diaria</b></div><div><span>Jefatura</span><b>Lectura / simulación</b></div></div>
        </section>
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Continuidad operacional</h3><p>Estado de conexión y última lectura agregada disponible.</p></div><span class="ops-tag ${online?'normal':'critical'}">${online?'ONLINE':'RESILIENTE'}</span></div>
          <div class="ops-resilience-metrics"><div><span>Estado API nueva</span><strong>${online?'En línea':'Sin conexión'}</strong></div><div><span>Última sincronización</span><strong>${esc(formatDateTime(A.opsLastSync||r?.saved_at))}</strong></div><div><span>Planilla vigente</span><strong>${esc(source)}</strong></div><div><span>Actualización base</span><strong>${esc(updated)}</strong></div><div><span>Auditorías pendientes</span><strong>${fmtInt(queue.length)}</strong></div><div><span>Respaldo agregado</span><strong>${r?.saved_at?'Disponible':'Sin respaldo'}</strong></div></div>
          ${r?`<div class="ops-last-good"><span>Última lectura válida</span><strong>${fmtInt(r.occupied)} ocupadas · ${fmtInt(r.free)} libres · ${fmt1(r.committed_pct)}% comprometido</strong><small>${esc(formatDateTime(r.saved_at))} · sin RUT/nombres almacenados en este respaldo local.</small></div>`:''}
          <div class="ops-action-buttons"><button id="opsPingBtn" class="btn btn-secondary" data-ops-local="1">Probar conectividad</button><button id="opsFlushAudit" class="btn btn-secondary" data-ops-local="1">Reintentar auditorías</button></div>
        </section>
      </div>
      <div class="ops-grid two mt">
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Estado de seguridad</h3><p>Controles aplicados a esta nueva etapa.</p></div><span class="ops-tag">DEFENSA EN PROFUNDIDAD</span></div>
          <div class="ops-security-list"><div class="ok"><b>RLS</b><span>Las cuatro tablas nuevas tienen Row Level Security habilitado.</span></div><div class="ok"><b>Sin acceso directo</b><span>anon/authenticated no tienen grants sobre las tablas nuevas.</span></div><div class="ok"><b>API separada</b><span>Centro de Control usa una Edge Function independiente; no reemplaza las APIs actuales.</span></div><div class="ok"><b>Token existente</b><span>La API nueva valida el mismo token HMAC administrativo y no expone service_role.</span></div><div class="ok"><b>What-if aislado</b><span>Los escenarios guardan supuestos, pero nunca escriben movimientos, reservas ni capacidad.</span></div></div>
        </section>
        <section class="panel ops-panel"><div class="ops-panel-head"><div><h3>Resumen de trazabilidad</h3><p>Últimas ${fmtInt(recent.length)} acciones registradas por la nueva capa.</p></div><span class="ops-tag ${fail?'critical':'normal'}">${fail?`${fail} ERROR(ES)`:'OK'}</span></div>
          <div class="ops-resilience-metrics"><div><span>Registros</span><strong>${fmtInt(audit.length)}</strong></div><div><span>Administrador</span><strong>${fmtInt(profiles.get('ADMINISTRADOR')||0)}</strong></div><div><span>Operador</span><strong>${fmtInt(profiles.get('OPERADOR')||0)}</strong></div><div><span>Jefatura</span><strong>${fmtInt(profiles.get('JEFATURA')||0)}</strong></div></div>
          <button id="opsAuditCsv" class="btn btn-secondary mt" data-ops-local="1">Exportar auditoría CSV</button>
        </section>
      </div>
      <section class="panel ops-panel mt"><div class="ops-panel-head"><div><h3>Registro de auditoría</h3><p>Quién, qué, cuándo y sobre qué entidad se realizó una acción.</p></div><div class="toolbar"><label class="field small"><span>Perfil</span><select id="opsAuditProfile"><option value="">Todos</option><option>ADMINISTRADOR</option><option>OPERADOR</option><option>JEFATURA</option></select></label><label class="field"><span>Buscar</span><input id="opsAuditSearch" placeholder="acción, entidad, endpoint…"></label></div></div><div id="opsAuditTable"></div></section>`;

    const drawAudit=()=>{const prof=clean(view.querySelector('#opsAuditProfile')?.value),q=plain(view.querySelector('#opsAuditSearch')?.value),rows=audit.filter(x=>(!prof||x.profile===prof)&&(!q||plain([x.action,x.entity_type,x.entity_id,x.endpoint,x.result,auditDetail(x.details)].join(' ')).includes(q)));view.querySelector('#opsAuditTable').innerHTML=table(rows,[{label:'Fecha',render:x=>formatDateTime(x.occurred_at)},{label:'Perfil',render:x=>`<span class="badge blue">${esc(x.profile)}</span>`},{label:'Acción',key:'action'},{label:'Entidad',render:x=>esc([x.entity_type,x.entity_id].filter(Boolean).join(' #')||'—')},{label:'Endpoint',key:'endpoint'},{label:'Resultado',render:x=>`<span class="badge ${x.result==='OK'?'green':'red'}">${esc(x.result)}</span>`},{label:'Detalle',render:x=>esc(auditDetail(x.details))}],{limit:300})};
    drawAudit();view.querySelector('#opsAuditProfile')?.addEventListener('change',drawAudit);view.querySelector('#opsAuditSearch')?.addEventListener('input',drawAudit);
    view.querySelector('#opsProfileSelect')?.addEventListener('change',e=>CampOps.setProfile(e.target.value));
    view.querySelector('#opsPingBtn')?.addEventListener('click',async()=>{try{const r=await CampOps.controlApi('ping');showMessage(`Conectividad correcta · ${formatDateTime(r.data?.time)}`,'info')}catch(e){showMessage(e.message,'error')}});
    view.querySelector('#opsFlushAudit')?.addEventListener('click',async()=>{await CampOps.flushAuditQueue();await CampOps.loadOpsState();CampOps.renderOpsViews();showMessage('Cola de auditoría revisada.','info')});
    view.querySelector('#opsAuditCsv')?.addEventListener('click',()=>{const cols=[{label:'Fecha',get:x=>x.occurred_at},{label:'Perfil',key:'profile'},{label:'Acción',key:'action'},{label:'Entidad',get:x=>[x.entity_type,x.entity_id].filter(Boolean).join(' #')},{label:'Endpoint',key:'endpoint'},{label:'Resultado',key:'result'},{label:'Detalle',get:x=>auditDetail(x.details)}];download(`auditoria_campamento_${todayISO()}.csv`,toCSV(audit,cols),'text/csv;charset=utf-8')});
    CampOps.applyProfileUi();
  }

  CampOps.registerRenderer(render);
})();
