'use strict';
(()=>{
  const SHEETJS_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const CONSULTS_API=window.GARPI_ENV.functionUrl('campamento-consults-api');
  const PAGE_SIZE=100;
  const EXPORT_PAGE_SIZE=500;
  const REQUEST_TIMEOUT_MS=15000;
  const CAMP_TIMEZONE='America/Santiago';
  let sheetJsPromise=null;
  let currentPage=0;
  let loadingPage=false;
  let exporting=false;
  let cleanupBusy=false;

  const text=v=>String(v??'').trim();
  const validDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?null:d};
  const validDateKey=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v));
  const filenameDate=()=>{const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const state=()=>{try{if(typeof A!=='undefined'&&A)return A}catch{}return window.A||{}};
  const getConsults=()=>Array.isArray(state().consults)?state().consults:[];
  const getTotal=()=>Math.max(0,Number(state().consultsTotal??getConsults().length)||0);

  function todayChileKey(){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:CAMP_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const m=Object.fromEntries(p.map(x=>[x.type,x.value]));
    return `${m.year}-${m.month}-${m.day}`;
  }
  function addDaysKey(dateKey,days){
    const d=new Date(`${dateKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate()+Number(days||0));
    return d.toISOString().slice(0,10);
  }
  function humanDateKey(dateKey){
    if(!validDateKey(dateKey))return text(dateKey);
    return new Intl.DateTimeFormat('es-CL',{timeZone:'UTC',dateStyle:'long'}).format(new Date(`${dateKey}T12:00:00Z`));
  }

  function consultsToRows(consults){
    return (Array.isArray(consults)?consults:[]).map(r=>{
      const d=validDate(r.consultado_at),modulo=text(r.modulo),habitacion=text(r.habitacion),cama=text(r.cama);
      return {'Fecha consulta':d||text(r.consultado_at),'RUT':text(r.rut),'Nombre':text(r.nombre),'Resultado':text(r.status),'Módulo':modulo,'Habitación':habitacion,'Cama':cama,'Asignación':[modulo,habitacion,cama].filter(Boolean).join(' / '),'IP':text(r.ip)};
    });
  }

  async function parseApiResponse(res){
    const raw=await res.text();let data;
    try{data=JSON.parse(raw)}catch{data={ok:false,error:raw||`HTTP ${res.status}`}}
    if(!res.ok||data?.ok===false){const e=new Error(data?.error||`Error HTTP ${res.status}`);e.status=res.status;throw e}
    return data;
  }

  async function requestConsultPage(pageIndex=0,pageSize=PAGE_SIZE,tokenOverride=null){
    const s=state(),token=tokenOverride||s.token;
    if(!token)throw new Error('Sesión administrativa no disponible. Vuelve a ingresar.');
    const safePage=Math.max(0,Number(pageIndex)||0),safeSize=Math.max(1,Math.min(500,Number(pageSize)||PAGE_SIZE));
    const params=new URLSearchParams({page:String(safePage+1),page_size:String(safeSize)});
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS):null;
    try{
      const res=await fetch(`${CONSULTS_API}?${params.toString()}`,{headers:{Authorization:`Bearer ${token}`},signal:controller?.signal});
      const data=await parseApiResponse(res);
      return {ok:true,data:Array.isArray(data.data)?data.data:[],total:Math.max(0,Number(data.total)||0),page:Math.max(1,Number(data.page)||safePage+1),page_size:Math.max(1,Number(data.page_size)||safeSize),pages:Math.max(1,Number(data.pages)||1)};
    }catch(err){
      if(err?.name==='AbortError')throw new Error('La consulta del historial tardó demasiado. Inténtalo nuevamente.');
      throw err;
    }finally{if(timer)clearTimeout(timer)}
  }

  async function requestCleanupPreview(dateKey){
    const s=state(),token=s.token;
    if(!token)throw new Error('Sesión administrativa no disponible. Vuelve a ingresar.');
    if(!validDateKey(dateKey))throw new Error('Selecciona una fecha válida.');
    const params=new URLSearchParams({action:'delete_preview',date:dateKey});
    const res=await fetch(`${CONSULTS_API}?${params.toString()}`,{headers:{Authorization:`Bearer ${token}`}});
    const data=await parseApiResponse(res);
    return {date:text(data.date)||dateKey,count:Math.max(0,Number(data.count)||0),timezone:text(data.timezone)||CAMP_TIMEZONE};
  }

  async function deleteConsultDate(dateKey){
    const s=state(),token=s.token;
    if(!token)throw new Error('Sesión administrativa no disponible. Vuelve a ingresar.');
    if(!validDateKey(dateKey))throw new Error('Selecciona una fecha válida.');
    const params=new URLSearchParams({date:dateKey});
    const res=await fetch(`${CONSULTS_API}?${params.toString()}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    const data=await parseApiResponse(res);
    return {date:text(data.date)||dateKey,deleted:Math.max(0,Number(data.deleted)||0),timezone:text(data.timezone)||CAMP_TIMEZONE};
  }

  function applyPage(result){
    const s=state();
    s.consults=result.data;
    s.consultsTotal=result.total;
    s.consultsPage=Math.max(0,result.page-1);
    s.consultsPageSize=result.page_size;
    currentPage=s.consultsPage;
    return result;
  }

  async function loadConsultPage(pageIndex=0,{render=true}={}){
    if(loadingPage)return null;
    loadingPage=true;
    try{
      const result=applyPage(await requestConsultPage(pageIndex,PAGE_SIZE));
      if(render)renderConsultsPaged();
      return result;
    }catch(err){
      if(typeof showMessage==='function')showMessage(err?.message||'No fue posible cargar las consultas RUT.','error');
      else throw err;
      return null;
    }finally{loadingPage=false}
  }

  async function fetchAllConsults(){
    const first=await requestConsultPage(0,EXPORT_PAGE_SIZE);
    const all=[...first.data],total=first.total;
    const pages=Math.max(1,Math.ceil(total/EXPORT_PAGE_SIZE));
    for(let page=1;page<pages;page++){
      const result=await requestConsultPage(page,EXPORT_PAGE_SIZE);
      all.push(...result.data);
      if(!result.data.length)break;
    }
    return all.slice(0,total||all.length);
  }

  function ensureSheetJS(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(sheetJsPromise)return sheetJsPromise;
    sheetJsPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=SHEETJS_URL;s.async=true;s.referrerPolicy='no-referrer';
      const timer=setTimeout(()=>reject(new Error('Tiempo de espera agotado al preparar el generador Excel.')),12000);
      s.onload=()=>{clearTimeout(timer);window.XLSX?resolve(window.XLSX):reject(new Error('No fue posible inicializar el generador Excel.'))};
      s.onerror=()=>{clearTimeout(timer);reject(new Error('No fue posible cargar el generador Excel. Revisa la conexión e inténtalo nuevamente.'))};
      document.head.appendChild(s);
    }).catch(err=>{sheetJsPromise=null;throw err});
    return sheetJsPromise;
  }

  async function exportConsultsXlsx(){
    if(exporting)return;
    exporting=true;
    try{
      if(typeof showMessage==='function')showMessage(`Preparando historial completo de ${getTotal()} consultas…`,'info');
      const all=await fetchAllConsults(),rows=consultsToRows(all);
      if(!rows.length){if(typeof showMessage==='function')showMessage('No hay consultas RUT para exportar.','error');return}
      const XLSX=await ensureSheetJS();
      const headers=['Fecha consulta','RUT','Nombre','Resultado','Módulo','Habitación','Cama','Asignación','IP'];
      const ws=XLSX.utils.json_to_sheet(rows,{header:headers,cellDates:true,dateNF:'dd-mm-yyyy hh:mm'}),lastRow=rows.length+1;
      ws['!autofilter']={ref:`A1:I${lastRow}`};
      ws['!cols']=[{wch:21},{wch:17},{wch:34},{wch:18},{wch:16},{wch:13},{wch:10},{wch:28},{wch:18}];
      for(let i=2;i<=lastRow;i++){const c=ws[`A${i}`];if(c&&c.t==='d')c.z='dd-mm-yyyy hh:mm'}
      const wb=XLSX.utils.book_new();
      wb.Props={Title:'Consultas RUT - Sistema de Gestión de Campamento',Subject:'Trazabilidad de consultas realizadas por trabajadores',Author:'Sistema de Gestión de Campamento',CreatedDate:new Date()};
      XLSX.utils.book_append_sheet(wb,ws,'Consultas RUT');
      XLSX.writeFile(wb,`consultas_rut_${filenameDate()}.xlsx`,{compression:true,cellDates:true});
      if(typeof showMessage==='function')showMessage(`Excel generado correctamente: ${rows.length} consulta${rows.length===1?'':'s'}.`);
    }catch(err){
      if(typeof showMessage==='function')showMessage(err?.message||'No fue posible generar el archivo Excel.','error');
      else alert(err?.message||'No fue posible generar el archivo Excel.');
    }finally{exporting=false}
  }

  function ensureCleanupDialog(){
    let dialog=document.getElementById('consultsCleanupDialog');
    if(dialog)return dialog;
    dialog=document.createElement('dialog');
    dialog.id='consultsCleanupDialog';
    dialog.className='detail-dialog';
    dialog.innerHTML=`<div class="dialog-head"><h3>Limpiar registros de Consultas RUT</h3><button type="button" class="icon-btn" data-consults-cleanup-close aria-label="Cerrar">×</button></div><div class="dialog-body"><p class="muted">Elimina únicamente el historial de consultas de una fecha. No modifica trabajadores, asignaciones, camas, reservas ni cierres operacionales.</p><div class="tabs-inline"><button type="button" class="tab-chip" data-consults-cleanup-preset="today">Hoy</button><button type="button" class="tab-chip" data-consults-cleanup-preset="yesterday">Ayer</button></div><label class="field"><span>Fecha a limpiar</span><input id="consultsCleanupDate" type="date"></label><div id="consultsCleanupPreview" class="notice info mt" aria-live="polite">Selecciona una fecha para revisar cuántos registros se eliminarán.</div><div class="toolbar mt"><button type="button" class="btn btn-secondary" data-consults-cleanup-cancel>Cancelar</button><button type="button" class="btn btn-danger" data-consults-cleanup-delete disabled>Borrar registros de esta fecha</button></div></div>`;
    document.body.appendChild(dialog);
    const dateInput=dialog.querySelector('#consultsCleanupDate');
    const close=()=>{if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')};
    dialog.querySelector('[data-consults-cleanup-close]')?.addEventListener('click',close);
    dialog.querySelector('[data-consults-cleanup-cancel]')?.addEventListener('click',close);
    dialog.querySelector('[data-consults-cleanup-preset="today"]')?.addEventListener('click',()=>{dateInput.value=todayChileKey();void refreshCleanupPreview(dialog)});
    dialog.querySelector('[data-consults-cleanup-preset="yesterday"]')?.addEventListener('click',()=>{dateInput.value=addDaysKey(todayChileKey(),-1);void refreshCleanupPreview(dialog)});
    dateInput?.addEventListener('change',()=>void refreshCleanupPreview(dialog));
    dialog.querySelector('[data-consults-cleanup-delete]')?.addEventListener('click',()=>void confirmCleanupDelete(dialog));
    return dialog;
  }

  async function refreshCleanupPreview(dialog=ensureCleanupDialog()){
    if(cleanupBusy)return null;
    const input=dialog.querySelector('#consultsCleanupDate'),box=dialog.querySelector('#consultsCleanupPreview'),del=dialog.querySelector('[data-consults-cleanup-delete]');
    const dateKey=text(input?.value);
    del.disabled=true;
    if(!validDateKey(dateKey)){box.className='notice warn mt';box.textContent='Selecciona una fecha válida.';return null}
    cleanupBusy=true;
    box.className='notice info mt';box.textContent='Revisando registros…';
    try{
      const preview=await requestCleanupPreview(dateKey);
      dialog.dataset.cleanupCount=String(preview.count);
      box.className=`notice ${preview.count?'warn':'ok'} mt`;
      box.textContent=preview.count?`${preview.count} registro${preview.count===1?'':'s'} del ${humanDateKey(dateKey)} se eliminará${preview.count===1?'':'n'} de forma permanente.`:`No hay registros de Consultas RUT para ${humanDateKey(dateKey)}.`;
      del.disabled=preview.count===0;
      return preview;
    }catch(err){
      dialog.dataset.cleanupCount='0';
      box.className='notice error mt';box.textContent=err?.message||'No fue posible revisar los registros.';
      return null;
    }finally{cleanupBusy=false}
  }

  async function confirmCleanupDelete(dialog=ensureCleanupDialog()){
    if(cleanupBusy)return;
    const input=dialog.querySelector('#consultsCleanupDate'),del=dialog.querySelector('[data-consults-cleanup-delete]');
    const dateKey=text(input?.value);
    cleanupBusy=true;del.disabled=true;
    try{
      const preview=await requestCleanupPreview(dateKey);
      if(!preview.count){if(typeof showMessage==='function')showMessage('No hay registros para borrar en esa fecha.','info');await refreshCleanupPreview(dialog);return}
      const accepted=typeof window.confirm==='function'?window.confirm(`Se eliminarán ${preview.count} registro${preview.count===1?'':'s'} de Consultas RUT del ${humanDateKey(dateKey)}.\n\nEsta acción no se puede deshacer. ¿Confirmas la eliminación?`):false;
      if(!accepted)return;
      const result=await deleteConsultDate(dateKey);
      const s=state();s.consultsTotal=null;s.consults=[];s.consultsPage=0;
      if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
      await loadConsultPage(0,{render:true});
      if(typeof showMessage==='function')showMessage(`Limpieza completada: ${result.deleted} registro${result.deleted===1?'':'s'} eliminado${result.deleted===1?'':'s'} del ${humanDateKey(dateKey)}.`);
    }catch(err){
      if(typeof showMessage==='function')showMessage(err?.message||'No fue posible borrar los registros.','error');
    }finally{cleanupBusy=false;del.disabled=false}
  }

  function openCleanupDialog(){
    const dialog=ensureCleanupDialog(),input=dialog.querySelector('#consultsCleanupDate');
    input.value=todayChileKey();input.max=todayChileKey();
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
    void refreshCleanupPreview(dialog);
    return dialog;
  }

  function renderConsultsPaged(){
    const view=document.getElementById('view-consults');
    if(!view)return;
    const rows=getConsults(),total=getTotal();
    currentPage=Math.max(0,Number(state().consultsPage??currentPage)||0);
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    currentPage=Math.min(currentPage,pages-1);
    const start=currentPage*PAGE_SIZE,shown=rows.slice(0,PAGE_SIZE);
    const countLabel=`${total} consulta${total===1?'':'s'}`;
    view.innerHTML=`<div class="section-head"><div><h2>Consultas por RUT</h2><div class="muted">Trazabilidad completa almacenada en Supabase. Se solicitan solo ${PAGE_SIZE} registros por página para mantener la interfaz fluida.</div></div><div id="consultsExportActions" class="toolbar"><span class="badge blue" data-consults-count>${esc(countLabel)}</span><button id="consultsExcelBtn" class="btn btn-success" type="button">Descargar Excel (.xlsx)</button><button id="consultsCleanupBtn" class="btn btn-danger" type="button">Limpiar registros</button></div></div>${table(shown,[{label:'Fecha',key:'consultado_at'},{label:'RUT',key:'rut'},{label:'Nombre',key:'nombre'},{label:'Resultado',render:r=>`<span class="badge ${r.status==='ASIGNADO'?'green':r.status==='NO_ENCONTRADO'?'red':'amber'}">${esc(r.status)}</span>`},{label:'Asignación',render:r=>esc([r.modulo,r.habitacion,r.cama].filter(Boolean).join(' / ')||'—')},{label:'IP',key:'ip'}],{limit:PAGE_SIZE})}<div class="toolbar mt" data-consults-pagination><button class="btn btn-secondary small-btn" type="button" data-consults-prev ${currentPage===0||loadingPage?'disabled':''}>← Anterior</button><span class="muted">Página ${currentPage+1} de ${pages}${total?` · registros ${start+1}-${Math.min(start+shown.length,total)} de ${total}`:''}</span><button class="btn btn-secondary small-btn" type="button" data-consults-next ${currentPage>=pages-1||loadingPage?'disabled':''}>Siguiente →</button></div>`;
    view.querySelector('#consultsExcelBtn')?.addEventListener('click',exportConsultsXlsx);
    view.querySelector('#consultsCleanupBtn')?.addEventListener('click',openCleanupDialog);
    view.querySelector('[data-consults-prev]')?.addEventListener('click',()=>{if(currentPage>0&&!loadingPage)void loadConsultPage(currentPage-1).then(()=>notifyRendered(view))});
    view.querySelector('[data-consults-next]')?.addEventListener('click',()=>{if(currentPage<pages-1&&!loadingPage)void loadConsultPage(currentPage+1).then(()=>notifyRendered(view))});
  }

  function notifyRendered(view){
    try{window.dispatchEvent(new CustomEvent('camp:view-rendered',{detail:{view:'consults',root:view,source:'consults-pagination'}}))}catch(_){ }
  }

  function enhanceConsultsView(){
    const view=document.getElementById('view-consults');
    if(!view||!view.classList.contains('active'))return false;
    if(!view.querySelector('#consultsExportActions')&&typeof renderConsults==='function')renderConsultsPaged();
    return true;
  }

  // Redirige únicamente la carga administrativa del historial a la API paginada.
  // La API principal del campamento permanece intacta.
  try{
    if(typeof webApi==='function'&&!window.__campConsultsWebApiWrapped){
      const originalWebApi=webApi;
      webApi=async function(action,options={}){
        if(action==='consults'&&options?.token){
          const result=applyPage(await requestConsultPage(0,PAGE_SIZE,options.token));
          return result;
        }
        return originalWebApi(action,options);
      };
      window.__campConsultsWebApiWrapped=true;
    }
  }catch(_){ }

  if(typeof renderConsults==='function')renderConsults=renderConsultsPaged;
  window.addEventListener?.('camp:view-rendered',event=>{
    if(event.detail?.view!=='consults'||event.detail?.source==='consults-pagination')return;
    enhanceConsultsView();
    if(state().consultsTotal==null&&!loadingPage)void loadConsultPage(0);
  });

  window.CampConsultExport={consultsToRows,exportConsultsXlsx,enhanceConsultsView,getConsults,getTotal,renderConsultsPaged,loadConsultPage,requestConsultPage,fetchAllConsults,requestCleanupPreview,deleteConsultDate,openCleanupDialog,todayChileKey,addDaysKey,humanDateKey,PAGE_SIZE,EXPORT_PAGE_SIZE,CAMP_TIMEZONE};
})();
