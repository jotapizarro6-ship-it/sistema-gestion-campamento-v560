(()=>{
  'use strict';
  if(typeof window==='undefined')return;
  const patch=()=>{
    if(!window.echarts||typeof A==='undefined'||!A.data)return;
    const el=document.getElementById('advMgmtGauge');if(!el)return;
    const chart=window.echarts.getInstanceByDom(el);if(!chart)return;
    const an=analytics(A.data),peak=Math.max(100,...an.forecast.map(x=>Number(x.pct||0))),max=Math.max(120,Math.ceil(peak/20)*20),stop=v=>Math.min(1,Math.max(0,v/max));
    chart.setOption({series:[{axisLine:{lineStyle:{color:[[stop(80),'#dff2e5'],[stop(90),'#f4dc93'],[stop(100),'#f0aa70'],[1,'#ed9ca5']]}}}]});
  };
  addEventListener('camp:advanced-render',e=>{if(!e.detail?.view||e.detail.view==='management')setTimeout(patch,0)});
  setTimeout(patch,100);
})();
