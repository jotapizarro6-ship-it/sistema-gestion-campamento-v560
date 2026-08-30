(()=>{
  'use strict';
  const W=window as any;
  if(W.__CAMP_CHART_PERFORMANCE__)return;
  W.__CAMP_CHART_PERFORMANCE__=true;
  const VERSION='2026.08.30-chartperf1';
  const observed=new WeakSet<Element>();
  const metrics={resizes:0,largeChartsOptimized:0,lastPassMs:0};
  let scheduled=false;
  const visible=(el:Element)=>{const r=(el as HTMLElement).getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>=0&&r.top<=innerHeight};
  function points(option:any){let total=0;for(const s of Array.isArray(option?.series)?option.series:[]){if(Array.isArray(s?.data))total+=s.data.length}return total}
  function optimize(el:Element){
    const ec=W.echarts;if(!ec?.getInstanceByDom||!visible(el))return;
    const chart=ec.getInstanceByDom(el as HTMLElement);if(!chart)return;
    const host=el as HTMLElement;
    try{
      const count=points(chart.getOption?.());
      if(count>=800&&host.dataset.campLargeOptimized!=='1'){chart.setOption({animation:false,animationDuration:0,animationDurationUpdate:0},{lazyUpdate:true,silent:true});host.dataset.campLargeOptimized='1';metrics.largeChartsOptimized++}
      chart.resize({silent:true});metrics.resizes++;
    }catch(_){/* un gráfico defectuoso no debe afectar el dashboard */}
  }
  const io='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)requestAnimationFrame(()=>optimize(entry.target))},{rootMargin:'120px'}):null;
  function observe(){document.querySelectorAll('.ec-chart').forEach(el=>{if(observed.has(el))return;observed.add(el);io?.observe(el);if(!io&&visible(el))optimize(el)})}
  function pass(){scheduled=false;const started=performance.now();observe();document.querySelectorAll('.ec-chart').forEach(el=>{if(visible(el))optimize(el)});metrics.lastPassMs=Math.round((performance.now()-started)*100)/100}
  function schedule(){if(scheduled)return;scheduled=true;(window.requestIdleCallback?window.requestIdleCallback(()=>pass(),{timeout:700}):setTimeout(pass,80))}
  window.addEventListener('campamento:data-ready',schedule);
  window.addEventListener('camp:view-rendered',schedule);
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setTimeout(schedule,1800);
  W.CampChartPerformance={VERSION,schedule,getMetrics:()=>({...metrics})};
})();
