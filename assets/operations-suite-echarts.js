(()=>{
  'use strict';
  if(typeof window==='undefined'||!window.echarts||typeof A==='undefined'||window.__CAMP_OPS_ECHARTS__)return;
  window.__CAMP_OPS_ECHARTS__=true;
  const mobile=()=>window.matchMedia('(max-width:760px)').matches;
  const chart=id=>{const el=document.getElementById(id);if(!el)return null;let c=echarts.getInstanceByDom(el);if(c)c.dispose();c=echarts.init(el,null,{renderer:mobile()?'svg':'canvas'});return c};
  const baseText={color:'#425a6a',fontFamily:'system-ui,-apple-system,Segoe UI,sans-serif'};

  function renderActions(){
    const c=chart('opsActionsChart');if(!c)return;const rows=A.ops?.actions||[],counts={PENDIENTE:0,EN_GESTION:0,RESUELTO:0,CANCELADO:0};for(const x of rows)counts[x.status]=(counts[x.status]||0)+1;
    const labels={PENDIENTE:'Pendiente',EN_GESTION:'En gestión',RESUELTO:'Resuelto',CANCELADO:'Cancelado'};
    c.setOption({animationDuration:350,textStyle:baseText,aria:{enabled:true,description:'Distribución de acciones operacionales por estado.'},tooltip:{trigger:'item',formatter:p=>`${p.name}<br><strong>${p.value}</strong> acción(es) · ${p.percent}%`},legend:{bottom:0,left:'center',textStyle:{fontSize:10,color:'#607585'}},series:[{name:'Acciones',type:'pie',radius:['52%','74%'],center:['50%','43%'],avoidLabelOverlap:true,label:{show:true,formatter:'{c}',fontWeight:800,fontSize:11},data:Object.entries(counts).map(([k,v])=>({name:labels[k]||k,value:v}))}]});
  }

  function renderWhatIf(){
    const c=chart('opsWhatIfChart'),rows=A.currentSimulation?.rows||[];if(!c||!rows.length)return;const dates=rows.map(x=>x.date),base=rows.map(x=>x.base_pct),sim=rows.map(x=>x.sim_pct),max=Math.max(105,...base,...sim);
    c.setOption({animationDuration:350,textStyle:baseText,aria:{enabled:true,description:'Comparación entre ocupación comprometida base y escenario simulado.'},grid:{left:mobile()?42:52,right:18,top:28,bottom:mobile()?58:48},tooltip:{trigger:'axis',formatter:ps=>{const i=ps[0]?.dataIndex??0,r=rows[i];return `<strong>${fmtDate(r.date)}</strong><br>Base: ${fmt1(r.base_pct)}%<br>Simulado: ${fmt1(r.sim_pct)}%<br>Capacidad simulada: ${fmtInt(r.sim_capacity)}<br>Libres simuladas: ${fmtInt(r.sim_free)}${r.sim_over?`<br><strong>Déficit: ${fmtInt(r.sim_over)}</strong>`:''}`}},legend:{top:0,left:'center',textStyle:{fontSize:10}},xAxis:{type:'category',data:dates,axisLabel:{fontSize:9,formatter:v=>fmtShort(v),rotate:mobile()?45:0}},yAxis:{type:'value',min:0,max:Math.ceil(max/10)*10,axisLabel:{formatter:'{value}%',fontSize:9},splitLine:{lineStyle:{color:'#e8edf1'}}},series:[{name:'Base',type:'line',data:base,symbol:'none',smooth:.18,lineStyle:{width:2},areaStyle:{opacity:.04}},{name:'Simulado',type:'line',data:sim,symbol:'circle',symbolSize:mobile()?4:5,smooth:.18,lineStyle:{width:3},markLine:{silent:true,symbol:'none',label:{fontSize:8,formatter:'{c}%'},data:[{yAxis:80},{yAxis:90},{yAxis:100}]}}]});
  }

  function renderGantt(){
    const c=chart('opsPlanGantt'),events=(A.currentSimulation?.events||[]).slice(0,40);if(!c)return;if(!events.length){c.dispose();return}
    const day=86400000,labels=events.map(e=>e.title),data=events.map((e,i)=>{const s=Date.parse(`${e.start_date}T00:00:00Z`),end=Date.parse(`${e.end_date||e.start_date}T00:00:00Z`)+day;return {value:[i,s,end],raw:e}});
    const min=Math.min(...data.map(x=>x.value[1]))-day,max=Math.max(...data.map(x=>x.value[2]))+day;
    const renderItem=(params,api)=>{const idx=api.value(0),start=api.coord([api.value(1),idx]),end=api.coord([api.value(2),idx]),height=Math.max(10,api.size([0,1])[1]*.55),raw=data[params.dataIndex]?.raw||{},style=api.style();const rect=echarts.graphic.clipRectByRect({x:start[0],y:start[1]-height/2,width:Math.max(end[0]-start[0],5),height},{x:params.coordSys.x,y:params.coordSys.y,width:params.coordSys.width,height:params.coordSys.height});return rect&&{type:'rect',transition:['shape'],shape:rect,style:{...style,opacity:raw.status==='CANCELADO'?.38:raw.status==='COMPLETADO'?.62:.9,borderRadius:4}}};
    c.setOption({animationDuration:350,textStyle:baseText,aria:{enabled:true,description:'Línea de tiempo del Plan Maestro Operacional.'},grid:{left:mobile()?92:180,right:18,top:24,bottom:50},tooltip:{formatter:p=>{const e=p.data.raw;return `<strong>${esc(e.title)}</strong><br>${fmtDate(e.start_date)}${e.end_date?` → ${fmtDate(e.end_date)}`:''}<br>Estado: ${esc(e.status)}<br>Impacto: ${esc(e.impact_type)} ${fmtInt(e.impact_value||0)}<br>Responsable: ${esc(e.owner_name||'Sin responsable')}`}},xAxis:{type:'time',min,max,axisLabel:{fontSize:9,formatter:v=>new Date(v).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})},splitLine:{show:true,lineStyle:{color:'#edf1f4'}}},yAxis:{type:'category',inverse:true,data:labels,axisLabel:{fontSize:mobile()?8:9,width:mobile()?78:165,overflow:'truncate'}},series:[{type:'custom',renderItem,encode:{x:[1,2],y:0},data}]});
  }

  function renderPlanning(){renderWhatIf();renderGantt()}
  function renderAll(){renderActions();renderPlanning()}
  window.CampOpsECharts={renderActions,renderPlanning,renderAll};
  requestAnimationFrame(renderAll);
  window.addEventListener('resize',()=>{clearTimeout(window.__opsResizeTimer);window.__opsResizeTimer=setTimeout(()=>{document.querySelectorAll('#opsActionsChart,#opsWhatIfChart,#opsPlanGantt').forEach(el=>echarts.getInstanceByDom(el)?.resize())},120)});
})();
