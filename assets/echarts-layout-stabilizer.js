(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined'||window.__CAMP_ECHARTS_LAYOUT_STABILIZER__)return;
  window.__CAMP_ECHARTS_LAYOUT_STABILIZER__=true;

  const ATTR='_echarts_instance_';
  const CHART_VIEWS=new Set(['overview','control','planning','management','history','control-room','governance']);
  const timers=new Set();
  const observed=new WeakSet();
  let resizeObserver=null,layoutTimer=null,lastViewport=`${window.innerWidth}x${window.innerHeight}`;

  const echartsReady=()=>window.echarts&&typeof window.echarts.getInstanceByDom==='function';
  const isVisible=el=>{if(!el||!el.isConnected)return false;const style=window.getComputedStyle?getComputedStyle(el):null;if(style&&(style.display==='none'||style.visibility==='hidden'))return false;const r=el.getBoundingClientRect();return r.width>40&&r.height>40};
  const chartNodes=(scope=document)=>{const out=[];if(scope?.nodeType===1&&scope.hasAttribute?.(ATTR))out.push(scope);if(scope?.querySelectorAll)out.push(...scope.querySelectorAll(`[${ATTR}]`));return out};
  const resizeChart=el=>{if(!echartsReady()||!isVisible(el))return false;const chart=window.echarts.getInstanceByDom(el);if(!chart||chart.isDisposed?.())return false;const r=el.getBoundingClientRect(),width=Math.max(1,Math.round(r.width)),height=Math.max(1,Math.round(r.height));try{chart.resize({width,height,silent:true,animation:{duration:0}});el.dataset.campChartWidth=String(width);el.dataset.campChartHeight=String(height);return true}catch(_){return false}};
  const observeChart=el=>{if(!el||observed.has(el))return;observed.add(el);try{resizeObserver?.observe(el)}catch(_){}};
  const resizeVisible=(scope=document)=>{if(!echartsReady())return 0;let count=0;for(const el of chartNodes(scope)){observeChart(el);if(resizeChart(el))count++}return count};
  const schedule=(reason='layout',scope=document)=>{if(!echartsReady())return;const active=scope||document.querySelector('.view.active')||document;const run=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resizeVisible(active)));run();for(const delay of [80,220]){const t=setTimeout(()=>{timers.delete(t);run()},delay);timers.add(t)}try{window.dispatchEvent(new CustomEvent('camp:charts:layout',{detail:{reason}}))}catch(_){}};
  const installInitHook=()=>{if(!echartsReady()||window.echarts.__campInitHooked)return;const original=window.echarts.init;if(typeof original!=='function')return;window.echarts.init=function(dom,...args){const instance=original.call(this,dom,...args);observeChart(dom);requestAnimationFrame(()=>resizeChart(dom));return instance};window.echarts.__campInitHooked=true};
  const install=()=>{if(!echartsReady())return false;installInitHook();if(typeof ResizeObserver==='function'&&!resizeObserver){resizeObserver=new ResizeObserver(entries=>{for(const entry of entries){const el=entry.target;if(!isVisible(el))continue;const r=entry.contentRect,oldW=Number(el.dataset.campChartWidth||0),oldH=Number(el.dataset.campChartHeight||0);if(Math.abs(r.width-oldW)>2||Math.abs(r.height-oldH)>2)resizeChart(el)}})}chartNodes(document.querySelector('.view.active')||document).forEach(observeChart);return true};
  const queueLayout=(reason,scope,delay=40)=>{clearTimeout(layoutTimer);layoutTimer=setTimeout(()=>{chartNodes(scope||document.querySelector('.view.active')||document).forEach(observeChart);schedule(reason,scope)},delay)};

  // Sin MutationObserver global: los gráficos se ajustan solo cuando el controlador de vistas
  // informa que una vista con gráficos fue mostrada/renderizada.
  window.addEventListener('camp:view-changed',event=>{const view=event.detail?.view;if(CHART_VIEWS.has(view))queueLayout('view-change',event.detail?.root,30)});
  window.addEventListener('camp:view-rendered',event=>{const view=event.detail?.view;if(CHART_VIEWS.has(view))queueLayout('view-rendered',event.detail?.root,20)});
  window.addEventListener('pageshow',()=>queueLayout('pageshow',document.querySelector('.view.active'),60));
  window.addEventListener('orientationchange',()=>queueLayout('orientationchange',document.querySelector('.view.active'),100));
  window.addEventListener('resize',()=>{const viewport=`${window.innerWidth}x${window.innerHeight}`;if(viewport===lastViewport)return;lastViewport=viewport;queueLayout('viewport-resize',document.querySelector('.view.active'),90)},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueLayout('visibility',document.querySelector('.view.active'),60)});

  let attempts=0;const wait=setInterval(()=>{attempts++;if(install()||attempts>=80)clearInterval(wait)},100);install();
  window.CampEChartsLayout={resizeVisible,schedule,CHART_VIEWS};
})();
