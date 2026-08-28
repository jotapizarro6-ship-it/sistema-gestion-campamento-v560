(()=>{
  'use strict';
  if(typeof window==='undefined'||!window.CampOps||typeof renderPlanning!=='function'||window.__CAMP_PLANNING_SUITE__)return;
  window.__CAMP_PLANNING_SUITE__=true;

  A.whatIfAssumptions=A.whatIfAssumptions||[];
  A.whatIfIncludePlan=Boolean(A.whatIfIncludePlan);
  A.whatIfScenarioId=A.whatIfScenarioId||null;
  A.whatIfScenarioName=A.whatIfScenarioName||'';

  const impactLabel={SUBIDA:'Subida adicional',BAJADA:'Bajada adicional',CAPACIDAD_MAS:'Aumento de capacidad',CAPACIDAD_MENOS:'Reducción de capacidad',INFORMATIVO:'Informativo'};
  const activePlan=e=>!['COMPLETADO','CANCELADO'].includes(e.status);
  const normalizeAssumption=a=>({type:plain(a.type),date:clean(a.date),end_date:clean(a.end_date),value:Math.max(0,Number(a.value)||0),label:clean(a.label)});
  const planAssumptions=()=>A.whatIfIncludePlan?(A.ops.plan_events||[]).filter(activePlan).filter(e=>e.impact_type!=='INFORMATIVO'&&Number(e.impact_value)>0).map(e=>normalizeAssumption({type:e.impact_type,date:e.start_date,end_date:e.end_date,value:e.impact_value,label:`Plan: ${e.title}`})):[];

  function simulate(rows,extras=[]){
    const assumptions=[...A.whatIfAssumptions.map(normalizeAssumption),...extras.map(normalizeAssumption)].filter(x=>x.date&&x.value>0);
    return rows.map(r=>{
      let physicalDelta=0,capacityDelta=0;
      for(const a of assumptions){
        if((a.type==='SUBIDA'||a.type==='BAJADA')&&a.date<=r.date)physicalDelta+=a.type==='SUBIDA'?a.value:-a.value;
        if((a.type==='CAPACIDAD_MAS'||a.type==='CAPACIDAD_MENOS')&&a.date<=r.date&&(!a.end_date||r.date<=a.end_date))capacityDelta+=a.type==='CAPACIDAD_MAS'?a.value:-a.value;
      }
      const simCapacity=Math.max(0,Number(r.capacity)+capacityDelta),simOccupied=Math.max(0,Number(r.occupied)+physicalDelta),simCommitted=simOccupied+Number(r.reserved||0),simPct=simCapacity?Math.round(simCommitted/simCapacity*1000)/10:(simCommitted?100:0);
      return {...r,base_committed:Number(r.occupied)+Number(r.reserved||0),base_pct:Number(r.committed_occupancy||0),sim_capacity:simCapacity,sim_occupied:simOccupied,sim_committed:simCommitted,sim_pct:simPct,sim_free:Math.max(simCapacity-simCommitted,0),sim_over:Math.max(simCommitted-simCapacity,0),physical_delta:physicalDelta,capacity_delta:capacityDelta};
    })
  }
  function simSummary(rows){
    const peakBase=rows.reduce((a,b)=>b.base_pct>(a?.base_pct??-1)?b:a,rows[0]||{}),peakSim=rows.reduce((a,b)=>b.sim_pct>(a?.sim_pct??-1)?b:a,rows[0]||{}),def=rows.filter(x=>x.sim_over>0),maxDef=Math.max(0,...rows.map(x=>x.sim_over)),bedDelta=rows.reduce((s,x)=>s+(x.sim_committed-x.base_committed),0);
    return {peakBase:Number(peakBase?.base_pct||0),peakBaseDate:peakBase?.date||'',peakSim:Number(peakSim?.sim_pct||0),peakSimDate:peakSim?.date||'',firstDeficit:def[0]?.date||'',maxDeficit:maxDef,bedDaysDelta:bedDelta};
  }
  const assumptionRow=(a,i)=>`<div class="ops-assumption"><span class="ops-assumption-type">${esc(impactLabel[a.type]||a.type)}</span><strong>${fmtInt(a.value)}</strong><span>${esc(fmtDate(a.date))}${a.end_date?` → ${esc(fmtDate(a.end_date))}`:''}</span><small>${esc(a.label||'Supuesto manual')}</small><button type="button" class="icon-btn" data-remove-assumption="${i}" data-ops-local="1" aria-label="Quitar supuesto">×</button></div>`;

  async function refreshPlan(){await CampOps.loadOpsState();renderPlanning()}
  async function saveScenario(summary){
    if(!CampOps.canWrite())return showMessage('El perfil Jefatura puede simular, pero no guardar escenarios.','error');
    const name=clean(document.getElementById('opsScenarioName')?.value)||`Escenario ${fmtDate(A.planStart)}`;
    try{const r=await CampOps.controlApi('scenario_save',{method:'POST',body:{id:A.whatIfScenarioId,name,base_date:A.planStart,days:A.planDays,assumptions:A.whatIfAssumptions,summary:{peak_sim:summary.peakSim,first_deficit:summary.firstDeficit,max_deficit:summary.maxDeficit,bed_days_delta:summary.bedDaysDelta,include_plan:A.whatIfIncludePlan}}});A.whatIfScenarioId=r.data.id;A.whatIfScenarioName=r.data.name;showMessage('Escenario What-if guardado.');await refreshPlan()}catch(e){showMessage(e.message,'error')}
  }
  function loadScenario(id){const s=(A.ops.scenarios||[]).find(x=>Number(x.id)===Number(id));if(!s)return;A.whatIfScenarioId=s.id;A.whatIfScenarioName=s.name;A.planStart=s.base_date;A.planDays=Math.min(31,Math.max(1,Number(s.days)||30));A.whatIfAssumptions=Array.isArray(s.assumptions)?s.assumptions.map(normalizeAssumption):[];A.whatIfIncludePlan=Boolean(s.summary?.include_plan);renderPlanning();showMessage(`Escenario cargado: ${s.name}`,'info')}
  async function deleteScenario(id){if(!CampOps.isAdmin())return showMessage('Solo Administrador puede eliminar escenarios.','error');if(!confirm('¿Eliminar este escenario guardado?'))return;try{await CampOps.controlApi('scenario_delete',{method:'POST',body:{id}});if(Number(A.whatIfScenarioId)===Number(id)){A.whatIfScenarioId=null;A.whatIfScenarioName=''}showMessage('Escenario eliminado.');await refreshPlan()}catch(e){showMessage(e.message,'error')}}

  async function planStatus(id,status){if(!CampOps.canWrite())return showMessage('El perfil Jefatura es de solo lectura.','error');try{await CampOps.controlApi('plan_update',{method:'POST',body:{id,status}});showMessage('Hito actualizado.');await refreshPlan()}catch(e){showMessage(e.message,'error')}}
  async function deletePlan(id){if(!CampOps.isAdmin())return showMessage('Solo Administrador puede eliminar hitos.','error');if(!confirm('¿Eliminar este hito del Plan Maestro?'))return;try{await CampOps.controlApi('plan_delete',{method:'POST',body:{id}});showMessage('Hito eliminado.');await refreshPlan()}catch(e){showMessage(e.message,'error')}}

  function enhancePlanningSuite(){
    const view=document.getElementById('view-planning');if(!view||!A.data)return;
    view.querySelector('[data-ops-planning]')?.remove();
    const baseRows=planningRows(A.planStart,A.planDays,A.data),simRows=simulate(baseRows,planAssumptions()),sum=simSummary(simRows),scenarios=A.ops.scenarios||[],events=[...(A.ops.plan_events||[])].sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))||Number(a.id)-Number(b.id));
    A.currentSimulation={rows:simRows,summary:sum,events};
    const block=document.createElement('div');block.dataset.opsPlanning='1';block.className='ops-planning-suite';
    block.innerHTML=`
      <div class="ops-section-divider"><span>PLANIFICACIÓN AVANZADA</span><strong>What-if + Plan Maestro Operacional</strong><small>Los escenarios no modifican la base real hasta que una decisión se registre por los flujos operacionales normales.</small></div>
      <section class="panel ops-panel mt"><div class="ops-panel-head"><div><h3>Simulador What-if de capacidad</h3><p>Compara la proyección vigente con supuestos adicionales sin alterar movimientos, reservas ni capacidad real.</p></div><span class="ops-tag">ESCENARIO AISLADO</span></div>
        <div class="ops-whatif-kpis">
          <div><span>Pico base</span><strong>${fmt1(sum.peakBase)}%</strong><small>${sum.peakBaseDate?fmtDate(sum.peakBaseDate):'—'}</small></div>
          <div class="${sum.peakSim>=100?'red':sum.peakSim>=90?'amber':'green'}"><span>Pico simulado</span><strong>${fmt1(sum.peakSim)}%</strong><small>${sum.peakSimDate?fmtDate(sum.peakSimDate):'—'}</small></div>
          <div class="${sum.firstDeficit?'red':'green'}"><span>Primer déficit</span><strong>${sum.firstDeficit?fmtDate(sum.firstDeficit):'Sin déficit'}</strong><small>ventana actual</small></div>
          <div><span>Déficit máximo</span><strong>${fmtInt(sum.maxDeficit)}</strong><small>camas</small></div>
          <div class="${sum.bedDaysDelta>0?'amber':'navy'}"><span>Δ camas-día</span><strong>${sum.bedDaysDelta>=0?'+':''}${fmtInt(sum.bedDaysDelta)}</strong><small>vs. escenario base</small></div>
        </div>
        <div class="ops-grid two ops-whatif-layout">
          <div>
            <form id="opsAssumptionForm" class="ops-inline-form">
              <label class="field"><span>Tipo de supuesto</span><select name="type"><option value="SUBIDA">Subida adicional</option><option value="BAJADA">Bajada adicional</option><option value="CAPACIDAD_MAS">Aumento de capacidad</option><option value="CAPACIDAD_MENOS">Reducción de capacidad</option></select></label>
              <label class="field"><span>Desde</span><input name="date" type="date" min="${todayISO()}" value="${esc(A.planStart)}" required></label>
              <label class="field"><span>Hasta (solo capacidad)</span><input name="end_date" type="date"></label>
              <label class="field"><span>Personas / camas</span><input name="value" type="number" min="1" max="10000" value="10" required></label>
              <label class="field span2"><span>Descripción</span><input name="label" maxlength="160" placeholder="Ej.: ingreso contratista / módulo temporal"></label>
              <button class="btn btn-primary" type="submit" data-ops-local="1">Agregar supuesto</button>
            </form>
            <label class="ops-check"><input id="opsIncludePlan" type="checkbox" ${A.whatIfIncludePlan?'checked':''} data-ops-local="1"> Incluir impactos activos del Plan Maestro en la simulación</label>
            <div class="ops-assumption-list">${A.whatIfAssumptions.map(assumptionRow).join('')||'<div class="empty">Agrega uno o más supuestos para comparar escenarios.</div>'}</div>
          </div>
          <div><div id="opsWhatIfChart" class="ops-chart tall"><div class="ops-chart-fallback">Base ${fmt1(sum.peakBase)}% · Simulado ${fmt1(sum.peakSim)}%</div></div><div class="ops-chart-note">Líneas de referencia: 80% atención · 90% crítico · 100% capacidad.</div></div>
        </div>
        <div class="ops-scenario-bar">
          <label class="field"><span>Nombre del escenario</span><input id="opsScenarioName" value="${esc(A.whatIfScenarioName)}" placeholder="Ej.: Contratista septiembre"></label>
          <button id="opsSaveScenario" class="btn btn-primary" data-ops-write="OPERATOR">${A.whatIfScenarioId?'Actualizar escenario':'Guardar escenario'}</button>
          <label class="field"><span>Escenarios guardados</span><select id="opsScenarioSelect"><option value="">Seleccionar…</option>${scenarios.map(s=>`<option value="${s.id}" ${Number(s.id)===Number(A.whatIfScenarioId)?'selected':''}>${esc(s.name)} · ${esc(fmtDate(s.base_date))}</option>`).join('')}</select></label>
          <button id="opsLoadScenario" class="btn btn-secondary" data-ops-local="1">Cargar</button>
          ${A.whatIfScenarioId&&CampOps.isAdmin()?'<button id="opsDeleteScenario" class="btn btn-danger" data-ops-write="ADMIN">Eliminar</button>':''}
        </div>
        <div class="table-wrap ops-sim-table"><table class="data-table"><thead><tr><th>Fecha</th><th>Base</th><th>Simulado</th><th>Capacidad sim.</th><th>Libres sim.</th><th>Déficit</th></tr></thead><tbody>${simRows.map(r=>`<tr><td>${esc(fmtDate(r.date))}</td><td>${fmt1(r.base_pct)}%</td><td><strong class="${r.sim_over?'text-danger':''}">${fmt1(r.sim_pct)}%</strong></td><td>${fmtInt(r.sim_capacity)}</td><td>${fmtInt(r.sim_free)}</td><td>${r.sim_over?`<span class="badge red">${fmtInt(r.sim_over)}</span>`:'—'}</td></tr>`).join('')}</tbody></table></div>
      </section>

      <section class="panel ops-panel mt"><div class="ops-panel-head"><div><h3>Plan Maestro Operacional</h3><p>Línea de tiempo tipo Planner / Project para hitos que pueden afectar capacidad u operación.</p></div><span class="ops-tag">TIMELINE</span></div>
        <div id="opsPlanGantt" class="ops-chart gantt"><div class="ops-chart-fallback">${events.length?`${events.length} hito(s) registrados`:'Sin hitos registrados'}</div></div>
        <div class="ops-grid two mt">
          <form id="opsPlanForm" class="form-grid ops-plan-form">
            <label class="field span2"><span>Hito / evento</span><input name="title" maxlength="160" required></label>
            <label class="field"><span>Categoría</span><input name="category" value="HITO"></label>
            <label class="field"><span>Responsable</span><input name="owner_name" placeholder="Nombre / área"></label>
            <label class="field"><span>Inicio</span><input name="start_date" type="date" value="${esc(A.planStart)}" required></label>
            <label class="field"><span>Fin</span><input name="end_date" type="date"></label>
            <label class="field"><span>Impacto</span><select name="impact_type"><option value="INFORMATIVO">Solo informativo</option><option value="SUBIDA">Subida</option><option value="BAJADA">Bajada</option><option value="CAPACIDAD_MAS">Aumenta capacidad</option><option value="CAPACIDAD_MENOS">Reduce capacidad</option></select></label>
            <label class="field"><span>Valor impacto</span><input name="impact_value" type="number" min="0" max="10000" value="0"></label>
            <label class="field"><span>Estado</span><select name="status"><option>PLANIFICADO</option><option>EN_CURSO</option><option>COMPLETADO</option><option>CANCELADO</option></select></label>
            <label class="field"><span>Dependencia</span><select name="dependency_id"><option value="">Sin dependencia</option>${events.filter(x=>x.status!=='CANCELADO').map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select></label>
            <label class="field span2"><span>Notas</span><textarea name="notes" rows="2" maxlength="1500"></textarea></label>
            <div><button class="btn btn-primary" type="submit" data-ops-write="OPERATOR">Registrar hito</button></div>
          </form>
          <div class="ops-plan-list">${events.map(e=>`<article class="ops-plan-event ${plain(e.status).toLowerCase()}"><div class="ops-plan-date"><strong>${esc(fmtDate(e.start_date))}</strong>${e.end_date?`<small>hasta ${esc(fmtDate(e.end_date))}</small>`:'<small>hito puntual</small>'}</div><div class="ops-plan-body"><div><span class="badge ${e.status==='EN_CURSO'?'amber':e.status==='COMPLETADO'?'green':e.status==='CANCELADO'?'red':'blue'}">${esc(e.status)}</span><h4>${esc(e.title)}</h4><p>${esc(e.category)} · ${esc(e.owner_name||'Sin responsable')}</p><small>${esc(impactLabel[e.impact_type]||e.impact_type)}${Number(e.impact_value)?` · ${fmtInt(e.impact_value)}`:''}${e.dependency_id?` · depende #${e.dependency_id}`:''}</small></div><div class="ops-plan-actions">${!['COMPLETADO','CANCELADO'].includes(e.status)?`<button class="btn btn-secondary small-btn" data-plan-progress="${e.id}" data-ops-write="OPERATOR">En curso</button><button class="btn btn-success small-btn" data-plan-complete="${e.id}" data-ops-write="OPERATOR">Completar</button>`:''}${CampOps.isAdmin()?`<button class="btn btn-danger small-btn" data-plan-delete="${e.id}" data-ops-write="ADMIN">Eliminar</button>`:''}</div></div></article>`).join('')||'<div class="empty">Aún no existen hitos del Plan Maestro.</div>'}</div>
        </div>
      </section>`;
    const anchor=view.querySelector('[data-adv-planning]')||view.lastElementChild;anchor?.insertAdjacentElement('afterend',block);

    block.querySelector('#opsAssumptionForm')?.addEventListener('submit',e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget)),a=normalizeAssumption(b);if(!a.date||a.value<=0)return showMessage('Completa fecha y valor del supuesto.','error');if(a.end_date&&a.end_date<a.date)return showMessage('La fecha final no puede ser anterior al inicio.','error');A.whatIfAssumptions.push(a);renderPlanning()});
    block.querySelectorAll('[data-remove-assumption]').forEach(b=>b.addEventListener('click',()=>{A.whatIfAssumptions.splice(Number(b.dataset.removeAssumption),1);renderPlanning()}));
    block.querySelector('#opsIncludePlan')?.addEventListener('change',e=>{A.whatIfIncludePlan=e.target.checked;renderPlanning()});
    block.querySelector('#opsSaveScenario')?.addEventListener('click',()=>saveScenario(sum));
    block.querySelector('#opsLoadScenario')?.addEventListener('click',()=>{const id=Number(block.querySelector('#opsScenarioSelect')?.value);if(id)loadScenario(id)});
    block.querySelector('#opsDeleteScenario')?.addEventListener('click',()=>deleteScenario(A.whatIfScenarioId));
    block.querySelector('#opsPlanForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!CampOps.canWrite())return showMessage('El perfil Jefatura es de solo lectura.','error');const body=Object.fromEntries(new FormData(e.currentTarget));body.impact_value=Number(body.impact_value)||0;try{await CampOps.controlApi('plan_create',{method:'POST',body});showMessage('Hito del Plan Maestro registrado.');e.currentTarget.reset();await refreshPlan()}catch(err){showMessage(err.message,'error')}});
    block.querySelectorAll('[data-plan-progress]').forEach(b=>b.addEventListener('click',()=>planStatus(Number(b.dataset.planProgress),'EN_CURSO')));
    block.querySelectorAll('[data-plan-complete]').forEach(b=>b.addEventListener('click',()=>planStatus(Number(b.dataset.planComplete),'COMPLETADO')));
    block.querySelectorAll('[data-plan-delete]').forEach(b=>b.addEventListener('click',()=>deletePlan(Number(b.dataset.planDelete))));
    CampOps.applyProfileUi();try{window.CampOpsECharts?.renderPlanning?.()}catch(_){ }
  }

  const basePlanning=renderPlanning;
  renderPlanning=function(){basePlanning();enhancePlanningSuite()};
  CampOps.simulate=simulate;CampOps.simSummary=simSummary;CampOps.planAssumptions=planAssumptions;CampOps.enhancePlanningSuite=enhancePlanningSuite;
})();
