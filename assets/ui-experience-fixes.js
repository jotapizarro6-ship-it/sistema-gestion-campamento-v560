(()=>{
  'use strict';
  if(typeof window==='undefined'||window.__CAMP_UI_EXPERIENCE_FIXES__)return;
  window.__CAMP_UI_EXPERIENCE_FIXES__=true;

  const escText=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtIntSafe=v=>typeof fmtInt==='function'?fmtInt(v):String(Math.round(Number(v)||0));
  const fmt1Safe=v=>typeof fmt1==='function'?fmt1(v):Number(v||0).toFixed(1);
  const fmtDateSafe=v=>typeof fmtDate==='function'?fmtDate(v):String(v||'—');

  function ensureMobileTopbarFinalStyles(){
    if(document.getElementById('campMobileTopbarFinal'))return;
    const style=document.createElement('style');
    style.id='campMobileTopbarFinal';
    style.textContent=`
      @media(max-width:700px){
        .admin-topbar .topbar-admin{gap:8px!important;padding:max(9px,env(safe-area-inset-top)) 12px 10px!important}
        .camp-topbar-context{grid-template-columns:48px minmax(0,1fr)!important;gap:10px!important}
        .camp-topbar-title .brand{font-size:17px!important;line-height:1.18!important}
        .camp-topbar-mobile-role{display:none!important}
        #menuBtn{display:grid!important;place-items:center!important;width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;padding:0!important;font-size:0!important;line-height:1!important;border-radius:12px!important}
        #menuBtn::before{content:"";display:block;width:25px;height:18px;background:linear-gradient(currentColor,currentColor) center top/25px 3px no-repeat,linear-gradient(currentColor,currentColor) center/25px 3px no-repeat,linear-gradient(currentColor,currentColor) center bottom/25px 3px no-repeat}
        .top-actions.camp-topbar-actions{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;width:100%!important}
        .camp-topbar-status{display:flex!important;align-items:center!important;justify-content:flex-start!important;flex-wrap:wrap!important;gap:7px!important;max-width:none!important;padding:0!important;border:0!important;background:transparent!important;backdrop-filter:none!important}
        .ops-profile-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:38px!important;padding:8px 12px!important;border-radius:999px!important;font-size:11px!important;line-height:1!important;white-space:nowrap!important}
        #syncBadge.status-pill{min-height:38px!important;padding:8px 11px!important;font-size:11px!important}
        .camp-topbar-buttons{display:flex!important;width:100%!important;justify-content:flex-start!important;align-items:center!important;flex-wrap:wrap!important;gap:7px!important}
        #refreshAllBtn,#campPwaInstall{width:auto!important;min-width:108px!important;max-width:100%!important;height:42px!important;min-height:42px!important;padding:0 13px!important;margin:0!important;border-radius:11px!important;font-size:12px!important;font-weight:800!important;line-height:1!important;flex:0 0 auto!important}
        #campPwaInstall{min-width:142px!important}
      }
      @media(max-width:380px){
        .ops-profile-badge,#syncBadge.status-pill{font-size:10.5px!important}
        #refreshAllBtn,#campPwaInstall{min-width:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function organizeTopbar(){
    const inner=document.querySelector('.topbar-inner.topbar-admin');
    const actions=inner?.querySelector('.top-actions');
    if(!inner||!actions)return;

    let context=inner.querySelector('.camp-topbar-context');
    if(!context){
      context=document.createElement('div');
      context.className='camp-topbar-context';
      const menu=inner.querySelector('#menuBtn');
      const title=Array.from(inner.children).find(el=>el!==actions&&el!==menu);
      if(menu)context.appendChild(menu);
      if(title){title.classList.add('camp-topbar-title');context.appendChild(title)}
      inner.insertBefore(context,actions);
    }

    const title=context.querySelector('.camp-topbar-title');
    actions.classList.add('camp-topbar-actions');
    let status=actions.querySelector('.camp-topbar-status');
    let buttons=actions.querySelector('.camp-topbar-buttons');
    if(!status){status=document.createElement('div');status.className='camp-topbar-status';actions.appendChild(status)}
    if(!buttons){buttons=document.createElement('div');buttons.className='camp-topbar-buttons';actions.appendChild(buttons)}

    const profile=document.getElementById('profileBadge');
    const sync=document.getElementById('syncBadge');
    const refresh=document.getElementById('refreshAllBtn');
    const install=document.getElementById('campPwaInstall');
    if(profile&&profile.parentElement!==status)status.appendChild(profile);
    if(sync&&sync.parentElement!==status)status.appendChild(sync);
    if(refresh&&refresh.parentElement!==buttons)buttons.appendChild(refresh);
    if(install){
      if(install.style.marginTop!=='0px')install.style.marginTop='0';
      if(install.parentElement!==buttons)buttons.appendChild(install);
    }

    if(title){
      let mobileRole=title.querySelector('.camp-topbar-mobile-role');
      if(!mobileRole){mobileRole=document.createElement('div');mobileRole.className='camp-topbar-mobile-role';title.appendChild(mobileRole)}
      const roleText=(profile?.textContent||'Administrador').trim()||'Administrador';
      if(mobileRole.textContent!==roleText)mobileRole.textContent=roleText;
    }
    if(refresh){
      if(refresh.getAttribute('aria-label')!=='Actualizar datos del sistema')refresh.setAttribute('aria-label','Actualizar datos del sistema');
      if(refresh.getAttribute('title')!=='Actualizar datos')refresh.setAttribute('title','Actualizar datos');
    }
    if(install){
      if(install.getAttribute('aria-label')!=='Instalar aplicación')install.setAttribute('aria-label','Instalar aplicación');
      if(install.getAttribute('title')!=='Instalar aplicación')install.setAttribute('title','Instalar aplicación');
    }
  }

  function executiveReportMarkup(r){
    const s=r?.state||{},an=r?.an||{},peak=r?.peak||{},reasons=Array.isArray(s.reasons)?s.reasons:[],milestones=Array.isArray(r?.milestones)?r.milestones:[];
    const stateLabelSafe=s.level==='CRITICO'?'CRÍTICO':s.level==='ATENCION'?'ATENCIÓN':'OPERACIÓN NORMAL';
    const narrative=s.level==='CRITICO'
      ?`El campamento presenta condiciones críticas que requieren revisión: ${reasons.join('; ')}.`
      :s.level==='ATENCION'
        ?`La operación se mantiene controlada, con puntos de atención: ${reasons.join('; ')}.`
        :`La operación se encuentra normal, con ${fmtIntSafe(an.free)} cama(s) libres y sin déficit proyectado en la información disponible.`;
    const generated=r?.generated instanceof Date?r.generated:new Date();
    const kpis=[
      ['Capacidad efectiva',fmtIntSafe(an.effectiveCapacity)],['Ocupadas',fmtIntSafe(an.occupied)],['Libres',fmtIntSafe(an.free)],['Comprometido',`${fmt1Safe(an.committedPct)}%`],
      ['Integridad',`${fmtIntSafe(s.diag?.score)}%`],['Pico 30 días',`${fmt1Safe(peak.pct)}%`],['Días con déficit',fmtIntSafe(s.futureOver?.length||0)],['Acciones críticas',fmtIntSafe(r?.critical?.length||0)]
    ];
    return `<div class="camp-print-report"><h1>Informe Ejecutivo · Gestión de Campamento</h1><div class="camp-print-meta">Generado ${escText(generated.toLocaleString('es-CL'))} · Fuente: ${escText(r?.source||'—')} · Actualización: ${escText(r?.updated||'—')}</div><div class="camp-print-state"><span>Estado general</span><strong>${escText(stateLabelSafe)}</strong><p>${escText(narrative)}</p></div><div class="camp-print-grid">${kpis.map(([label,value])=>`<div class="camp-print-kpi"><span>${escText(label)}</span><b>${escText(value)}</b></div>`).join('')}</div><div class="camp-print-section"><h2>Focos para decisión</h2><table class="camp-print-table"><tbody>${reasons.length?reasons.map(x=>`<tr><td>${escText(x)}</td></tr>`).join(''):'<tr><td>Sin focos críticos registrados.</td></tr>'}</tbody></table></div><div class="camp-print-section"><h2>Próximos hitos</h2><table class="camp-print-table"><thead><tr><th>Fecha</th><th>Hito</th><th>Estado</th></tr></thead><tbody>${milestones.length?milestones.map(x=>`<tr><td>${escText(fmtDateSafe(x.start_date))}</td><td>${escText(x.title)}</td><td>${escText(x.status)}</td></tr>`).join(''):'<tr><td colspan="3">Sin hitos próximos registrados.</td></tr>'}</tbody></table></div><div class="camp-print-foot">Reporte ejecutivo automático. Resume indicadores para toma de decisiones y no reemplaza el detalle operacional del sistema.</div></div>`;
  }

  let printHost=null;
  function cleanupPrint(){
    document.body.classList.remove('camp-print-executive');
    printHost?.remove();printHost=null;
  }
  function printExecutive(){
    const api=window.CampIntegrityExecutive;
    if(!api?.reportData){if(typeof showMessage==='function')showMessage('No fue posible preparar el informe ejecutivo.','error');return}
    cleanupPrint();
    const r=api.reportData();
    printHost=document.createElement('section');
    printHost.id='campExecutivePrintHost';
    printHost.setAttribute('aria-hidden','true');
    printHost.innerHTML=executiveReportMarkup(r);
    document.body.appendChild(printHost);
    document.body.classList.add('camp-print-executive');
    window.addEventListener('afterprint',cleanupPrint,{once:true});
    try{
      window.print();
      window.CampOps?.emitAudit?.({action:'GENERAR_INFORME_EJECUTIVO',entity_type:'executive_report',endpoint:'frontend',details:{state:r.state?.level,integrity:r.state?.diag?.score,committed:r.an?.committedPct,method:'same-page-print'}});
    }catch(err){cleanupPrint();if(typeof showMessage==='function')showMessage('No fue posible abrir el diálogo de impresión/PDF.','error')}
  }

  document.addEventListener('click',event=>{
    const btn=event.target instanceof Element?event.target.closest('[data-print-executive]'):null;
    if(!btn)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    printExecutive();
  },true);

  let observerQueued=false;
  const scheduleTopbar=()=>{
    if(observerQueued)return;
    observerQueued=true;
    requestAnimationFrame(()=>{observerQueued=false;organizeTopbar()});
  };
  const observer=new MutationObserver(scheduleTopbar);
  ensureMobileTopbarFinalStyles();
  document.addEventListener('DOMContentLoaded',()=>{ensureMobileTopbarFinalStyles();organizeTopbar();observer.observe(document.body,{childList:true,subtree:true})},{once:true});
  if(document.readyState!=='loading'){ensureMobileTopbarFinalStyles();organizeTopbar();observer.observe(document.body,{childList:true,subtree:true})}

  window.CampUiExperience={organizeTopbar,printExecutive};
})();
