'use strict';
(()=>{
  const SHEETJS_URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let sheetJsPromise=null;

  const text=v=>String(v??'').trim();
  const validDate=v=>{
    const d=new Date(v);
    return Number.isNaN(d.getTime())?null:d;
  };
  const filenameDate=()=>{
    const d=new Date();
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };

  function consultsToRows(consults){
    return (Array.isArray(consults)?consults:[]).map(r=>{
      const d=validDate(r.consultado_at);
      const modulo=text(r.modulo),habitacion=text(r.habitacion),cama=text(r.cama);
      return {
        'Fecha consulta':d||text(r.consultado_at),
        'RUT':text(r.rut),
        'Nombre':text(r.nombre),
        'Resultado':text(r.status),
        'Módulo':modulo,
        'Habitación':habitacion,
        'Cama':cama,
        'Asignación':[modulo,habitacion,cama].filter(Boolean).join(' / '),
        'IP':text(r.ip)
      };
    });
  }

  function ensureSheetJS(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(sheetJsPromise)return sheetJsPromise;
    sheetJsPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=SHEETJS_URL;
      s.async=true;
      s.referrerPolicy='no-referrer';
      const timer=setTimeout(()=>reject(new Error('Tiempo de espera agotado al preparar el generador Excel.')),12000);
      s.onload=()=>{clearTimeout(timer);window.XLSX?resolve(window.XLSX):reject(new Error('No fue posible inicializar el generador Excel.'));};
      s.onerror=()=>{clearTimeout(timer);reject(new Error('No fue posible cargar el generador Excel. Revisa la conexión e inténtalo nuevamente.'));};
      document.head.appendChild(s);
    }).catch(err=>{sheetJsPromise=null;throw err;});
    return sheetJsPromise;
  }

  async function exportConsultsXlsx(){
    const rows=consultsToRows(window.A?.consults||[]);
    if(!rows.length){
      if(typeof showMessage==='function')showMessage('No hay consultas RUT para exportar.','error');
      return;
    }
    try{
      const XLSX=await ensureSheetJS();
      const headers=['Fecha consulta','RUT','Nombre','Resultado','Módulo','Habitación','Cama','Asignación','IP'];
      const ws=XLSX.utils.json_to_sheet(rows,{header:headers,cellDates:true,dateNF:'dd-mm-yyyy hh:mm'});
      const lastRow=rows.length+1;
      ws['!autofilter']={ref:`A1:I${lastRow}`};
      ws['!cols']=[
        {wch:21},{wch:17},{wch:34},{wch:18},{wch:16},{wch:13},{wch:10},{wch:28},{wch:18}
      ];
      for(let i=2;i<=lastRow;i++){
        const c=ws[`A${i}`];
        if(c&&c.t==='d')c.z='dd-mm-yyyy hh:mm';
      }
      const wb=XLSX.utils.book_new();
      wb.Props={
        Title:'Consultas RUT - Sistema de Gestión de Campamento',
        Subject:'Trazabilidad de consultas realizadas por trabajadores',
        Author:'Sistema de Gestión de Campamento',
        CreatedDate:new Date()
      };
      XLSX.utils.book_append_sheet(wb,ws,'Consultas RUT');
      XLSX.writeFile(wb,`consultas_rut_${filenameDate()}.xlsx`,{compression:true,cellDates:true});
      if(typeof showMessage==='function')showMessage(`Excel generado correctamente: ${rows.length} consulta${rows.length===1?'':'s'}.`);
    }catch(err){
      if(typeof showMessage==='function')showMessage(err?.message||'No fue posible generar el archivo Excel.','error');
      else alert(err?.message||'No fue posible generar el archivo Excel.');
    }
  }

  function enhanceConsultsView(){
    const view=document.querySelector('#view-consults');
    if(!view)return;
    const head=view.querySelector('.section-head');
    if(!head||head.querySelector('#consultsExcelBtn'))return;
    const count=(window.A?.consults||[]).length;
    const actions=document.createElement('div');
    actions.className='toolbar';
    actions.innerHTML=`<span class="badge blue">${count} consulta${count===1?'':'s'}</span><button id="consultsExcelBtn" class="btn btn-success" type="button">Descargar Excel (.xlsx)</button>`;
    head.appendChild(actions);
    actions.querySelector('#consultsExcelBtn')?.addEventListener('click',exportConsultsXlsx);
  }

  if(typeof window.renderConsults==='function'){
    const baseRenderConsults=window.renderConsults;
    window.renderConsults=function(){
      const out=baseRenderConsults.apply(this,arguments);
      enhanceConsultsView();
      return out;
    };
  }

  window.CampConsultExport={consultsToRows,exportConsultsXlsx,enhanceConsultsView};
})();
