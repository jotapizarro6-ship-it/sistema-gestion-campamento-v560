(()=>{
  'use strict';
  if(typeof window==='undefined'||!window.echarts)return;
  const EC=window.echarts,colors={occupied:'#1769aa',reserved:'#7357bf',blocked:'#b33c49',free:'#79aa8d',green:'#2f7a56',amber:'#d5a43f',red:'#c94b59',navy:'#173f5f',grid:'#e6edf1',text:'#526475',muted:'#81909a'};
  const mobile=()=>window.innerWidth<=760;
  const fmt=v=>Number(v||0).toLocaleString('es-CL');
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateColor=p=>p>=90?colors.red:p>=80?colors.amber:colors.green;
  const base=description=>({animationDuration:420,animationDurationUpdate:260,aria:{show:true,description},textStyle:{fontFamily:'Inter,system-ui,-apple-system,Segoe UI,sans-serif',color:colors.text},tooltip:{trigger:'item',confine:true,backgroundColor:'rgba(16,37,53,.96)',borderWidth:0,textStyle:{color:'#fff',fontSize:mobile()?11:12},extraCssText:'border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.18);'}});

  function dispose(host){const old=host&&EC.getInstanceByDom(host);if(old)try{old.dispose()}catch(_){}}
  function init(host){if(!host)return null;dispose(host);host.innerHTML='';return EC.init(host,null,{renderer:mobile()?'svg':'canvas'})}

  function mountComposition(data,hm,mod){
    const host=document.querySelector('#controlModuleChart');if(!host)return;const c=init(host);if(!c)return;
    const values=[{name:'Ocupadas',value:Number(mod.occupied||0),status:'occupied',itemStyle:{color:colors.occupied}},{name:'Reservadas',value:Number(mod.reserved||0),status:'reserved',itemStyle:{color:colors.reserved}},{name:'Bloqueadas',value:Number(mod.blocked||0),status:'blocked',itemStyle:{color:colors.blocked}},{name:'Libres',value:Number(mod.free||0),status:'free',itemStyle:{color:colors.free}}],pct=Number(mod.pct||0);
    c.setOption({...base(`Composición de camas del módulo ${mod.label}.`),legend:{type:'scroll',bottom:0,left:'center',itemWidth:10,itemHeight:8,textStyle:{fontSize:mobile()?9:10,color:colors.text}},series:[{name:'Camas',type:'pie',radius:mobile()?['45%','70%']:['50%','74%'],center:['50%',mobile()?'43%':'45%'],avoidLabelOverlap:true,label:{show:false},emphasis:{scale:true,scaleSize:7,label:{show:true,fontSize:12,fontWeight:800,formatter:'{b}\n{c}'}},data:values}],graphic:[{type:'text',left:'center',top:mobile()?'35%':'37%',style:{text:`${pct.toFixed(1)}%\ncomprometido`,textAlign:'center',fill:'#17384d',font:'800 15px system-ui',lineHeight:20}}]});
    c.on('click',p=>{const item=values[p.dataIndex];if(!item)return;A.controlStatus=item.status;A.controlBedKey='';renderControl()});
  }

  function mountModules(hm){
    const host=document.querySelector('#controlAvailabilityChart');if(!host)return;const c=init(host);if(!c)return;const rows=[...hm.modules].sort((a,b)=>Number(b.pct||0)-Number(a.pct||0));
    c.setOption({...base('Comparación del porcentaje de capacidad comprometida entre módulos.'),grid:{left:mobile()?92:120,right:mobile()?24:38,top:20,bottom:28},tooltip:{...base().tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const i=ps?.[0]?.dataIndex??0,x=rows[i];return `<b>${escHtml(x.label)}</b><br>Comprometido: <b>${Number(x.pct||0).toFixed(1)}%</b><br>Ocupadas: <b>${fmt(x.occupied)}</b><br>Reservadas: <b>${fmt(x.reserved)}</b><br>Bloqueadas: <b>${fmt(x.blocked)}</b><br>Libres: <b>${fmt(x.free)}</b>`}},xAxis:{type:'value',min:0,max:Math.max(100,Math.ceil(Math.max(...rows.map(x=>Number(x.pct||0)),100)/10)*10),axisLabel:{formatter:'{value}%',fontSize:9,color:colors.muted},splitLine:{lineStyle:{color:colors.grid}},axisLine:{show:false}},yAxis:{type:'category',data:rows.map(x=>x.label),axisLabel:{fontSize:mobile()?8:9,color:colors.text,width:mobile()?76:104,overflow:'truncate'},axisLine:{show:false},axisTick:{show:false}},series:[{name:'% comprometido',type:'bar',barMaxWidth:24,data:rows.map(x=>({value:Number(x.pct||0),itemStyle:{color:stateColor(Number(x.pct||0)),borderRadius:[0,5,5,0]}})),label:{show:true,position:'right',formatter:p=>`${Number(p.value).toFixed(0)}%`,fontSize:9,color:'#385161'},markLine:{silent:true,symbol:'none',label:{fontSize:8,color:'#7a8791'},lineStyle:{type:'dashed',width:1},data:[{xAxis:80,label:{formatter:'80%'}},{xAxis:90,label:{formatter:'90%'}}]}}]});
    c.on('click',p=>{const row=rows[p.dataIndex];if(!row)return;A.mapModule=row.label;A.controlBedKey='';renderControl()});
  }

  window.__mountControlCenterEcharts=function(){
    try{
      if(typeof A==='undefined'||!A.data||typeof analytics!=='function'||!document.querySelector('#view-control'))return;
      const hm=analytics(A.data).hm,mod=hm.modules.find(x=>norm(x.label)===norm(A.mapModule))||hm.modules[0];if(!mod)return;
      mountComposition(A.data,hm,mod);mountModules(hm);
    }catch(err){console.error('ECharts Centro de Gestión: fallback HTML',err)}
  };

  let timer=null;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{if(document.querySelector('#view-control.active'))window.__mountControlCenterEcharts()},180)},{passive:true});
  setTimeout(()=>window.__mountControlCenterEcharts(),0);
})();
