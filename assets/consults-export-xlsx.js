'use strict';
(()=>{
  const SHEETJS_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const PAGE_SIZE=100;
  let sheetJsPromise=null;
  let currentPage=0;

  const text=v=>String(v??'').trim();
  const validDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?null:d};
  const filenameDate=()=>{const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const getConsults=()=>{try{if(typeof A!=='undefined'&&A&&Array.isArray(A.consults))return A.consults}catch{}return Array.isArray(window.A?.consults)?window.A.consults:[]};

  function consultsToRows(consults){
    return (Array.isArray(consults)?consults:[]).map(r=>{
      const d=validDate(r.consultado_at),modulo=text(r.modulo),habitacion=text(r.habitacion),cama=text(r.cama);
      return {'Fecha consulta':d||text(r.consultado_at),'RUT':text(r.rut),'Nombre':text(r.nombre),'Resultado':text(r.status),'Módulo':modulo,'Habitación':habitacion,'Cama':cama,'Asignación':[modulo,habitacion,cama].filter(Boolean).join(' / '),'IP':text(r.ip)};
    });
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
    const rows=consultsToRows(getConsults());
    if(!rows.length){if(typeof showMessage==='function')showMessage('No hay consultas RUT para exportar.','error');return}
    try{
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
    }
  }

  function renderConsultsPaged(){
    const view=document.getElementById('view-consults');
    if(!view)return;
    const rows=getConsults();
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    currentPage=Math.max(0,Math.min(currentPage,pages-1));
    const start=currentPage*PAGE_SIZE,shown=rows.slice(start,start+PAGE_SIZE);
    const countLabel=`${rows.length} consulta${rows.length===1?'':'s'}`;
    view.innerHTML=`<div class="section-head"><div><h2>Consultas por RUT</h2><div class="muted">Trazabilidad de consultas realizadas por trabajadores. La vista muestra como máximo ${PAGE_SIZE} registros por página para mantener la interfaz fluida.</div></div><div id="consultsExportActions" class="toolbar"><span class="badge blue" data-consults-count>${esc(countLabel)}</span><button id="consultsExcelBtn" class="btn btn-success" type="button">Descargar Excel (.xlsx)</button></div></div>${table(shown,[{label:'Fecha',key:'consultado_at'},{label:'RUT',key:'rut'},{label:'Nombre',key:'nombre'},{label:'Resultado',render:r=>`<span class="badge ${r.status==='ASIGNADO'?'green':r.status==='NO_ENCONTRADO'?'red':'amber'}">${esc(r.status)}</span>`},{label:'Asignación',render:r=>esc([r.modulo,r.habitacion,r.cama].filter(Boolean).join(' / ')||'—')},{label:'IP',key:'ip'}],{limit:PAGE_SIZE})}<div class="toolbar mt" data-consults-pagination><button class="btn btn-secondary small-btn" type="button" data-consults-prev ${currentPage===0?'disabled':''}>← Anterior</button><span class="muted">Página ${currentPage+1} de ${pages}${rows.length?` · registros ${start+1}-${start+shown.length} de ${rows.length}`:''}</span><button class="btn btn-secondary small-btn" type="button" data-consults-next ${currentPage>=pages-1?'disabled':''}>Siguiente →</button></div>`;
    view.querySelector('#consultsExcelBtn')?.addEventListener('click',exportConsultsXlsx);
    view.querySelector('[data-consults-prev]')?.addEventListener('click',()=>{if(currentPage>0){currentPage--;renderConsultsPaged();notifyRendered(view)}});
    view.querySelector('[data-consults-next]')?.addEventListener('click',()=>{if(currentPage<pages-1){currentPage++;renderConsultsPaged();notifyRendered(view)}});
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

  // Sustituye el render de 1000 filas por una vista paginada. No usa MutationObserver,
  // intervalos ni listeners de focus/hash; el controlador de navegación decide cuándo renderizar.
  if(typeof renderConsults==='function')renderConsults=renderConsultsPaged;
  window.addEventListener?.('camp:view-rendered',event=>{if(event.detail?.view==='consults'&&event.detail?.source!=='consults-pagination')enhanceConsultsView()});

  window.CampConsultExport={consultsToRows,exportConsultsXlsx,enhanceConsultsView,getConsults,renderConsultsPaged,PAGE_SIZE};
})();
