'use strict';
(()=>{
  const SHEETJS_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const CONSULTS_API='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-consults-api';
  const PAGE_SIZE=100;
  const EXPORT_PAGE_SIZE=500;
  const REQUEST_TIMEOUT_MS=15000;
  let sheetJsPromise=null;
  let currentPage=0;
  let loadingPage=false;
  let exporting=false;

  const text=v=>String(v??'').trim();
  const validDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?null:d};
  const filenameDate=()=>{const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const state=()=>{try{if(typeof A!=='undefined'&&A)return A}catch{}return window.A||{}};
  const getConsults=()=>Array.isArray(state().consults)?state().consults:[];
  const getTotal=()=>Math.max(0,Number(state().consultsTotal??getConsults().length)||0);

  function consultsToRows(consults){
    return (Array.isArray(consults)?consults:[]).map(r=>{
      const d=validDate(r.consultado_at),modulo=text(r.modulo),habitacion=text(r.habitacion),cama=text(r.cama);
      return {'Fecha consulta':d||text(r.consultado_at),'RUT':text(r.rut),'Nombre':text(r.nombre),'Resultado':text(r.status),'Módulo':modulo,'Habitación':habitacion,'Cama':cama,'Asignación':[modulo,habitacion,cama].filter(Boolean).join(' / '),'IP':text(r.ip)};
    });
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
      const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data={ok:false,error:raw||`HTTP ${res.status}`}}
      if(!res.ok||data?.ok===false){const e=new Error(data?.error||`Error HTTP ${res.status}`);e.status=res.status;throw e}
      return {ok:true,data:Array.isArray(data.data)?data.data:[],total:Math.max(0,Number(data.total)||0),page:Math.max(1,Number(data.page)||safePage+1),page_size:Math.max(1,Number(data.page_size)||safeSize),pages:Math.max(1,Number(data.pages)||1)};
    }catch(err){
      if(err?.name==='AbortError')throw new Error('La consulta del historial tardó demasiado. Inténtalo nuevamente.');
      throw err;
    }finally{if(timer)clearTimeout(timer)}
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

  function renderConsultsPaged(){
    const view=document.getElementById('view-consults');
    if(!view)return;
    const rows=getConsults(),total=getTotal();
    currentPage=Math.max(0,Number(state().consultsPage??currentPage)||0);
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    currentPage=Math.min(currentPage,pages-1);
    const start=currentPage*PAGE_SIZE,shown=rows.slice(0,PAGE_SIZE);
    const countLabel=`${total} consulta${total===1?'':'s'}`;
    view.innerHTML=`<div class="section-head"><div><h2>Consultas por RUT</h2><div class="muted">Trazabilidad completa almacenada en Supabase. Se solicitan solo ${PAGE_SIZE} registros por página para mantener la interfaz fluida.</div></div><div id="consultsExportActions" class="toolbar"><span class="badge blue" data-consults-count>${esc(countLabel)}</span><button id="consultsExcelBtn" class="btn btn-success" type="button">Descargar Excel (.xlsx)</button></div></div>${table(shown,[{label:'Fecha',key:'consultado_at'},{label:'RUT',key:'rut'},{label:'Nombre',key:'nombre'},{label:'Resultado',render:r=>`<span class="badge ${r.status==='ASIGNADO'?'green':r.status==='NO_ENCONTRADO'?'red':'amber'}">${esc(r.status)}</span>`},{label:'Asignación',render:r=>esc([r.modulo,r.habitacion,r.cama].filter(Boolean).join(' / ')||'—')},{label:'IP',key:'ip'}],{limit:PAGE_SIZE})}<div class="toolbar mt" data-consults-pagination><button class="btn btn-secondary small-btn" type="button" data-consults-prev ${currentPage===0||loadingPage?'disabled':''}>← Anterior</button><span class="muted">Página ${currentPage+1} de ${pages}${total?` · registros ${start+1}-${Math.min(start+shown.length,total)} de ${total}`:''}</span><button class="btn btn-secondary small-btn" type="button" data-consults-next ${currentPage>=pages-1||loadingPage?'disabled':''}>Siguiente →</button></div>`;
    view.querySelector('#consultsExcelBtn')?.addEventListener('click',exportConsultsXlsx);
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

  window.CampConsultExport={consultsToRows,exportConsultsXlsx,enhanceConsultsView,getConsults,getTotal,renderConsultsPaged,loadConsultPage,requestConsultPage,fetchAllConsults,PAGE_SIZE,EXPORT_PAGE_SIZE};
})();
