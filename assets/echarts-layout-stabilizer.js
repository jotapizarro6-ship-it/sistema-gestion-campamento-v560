(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined'||window.__CAMP_ECHARTS_LAYOUT_STABILIZER__)return;
  window.__CAMP_ECHARTS_LAYOUT_STABILIZER__=true;

  const ATTR='_echarts_instance_';
  const timers=new Set();
  const observed=new WeakSet();
  let resizeObserver=null;
  let layoutTimer=null;
  let lastViewport=`${window.innerWidth}x${window.innerHeight}`;

  const echartsReady=()=>window.echarts&&typeof window.echarts.getInstanceByDom==='function';
  const isVisible=el=>{
    if(!el||!el.isConnected)return false;
    const style=window.getComputedStyle?getComputedStyle(el):null;
    if(style&&(style.display==='none'||style.visibility==='hidden'))return false;
    const r=el.getBoundingClientRect();
    return r.width>40&&r.height>40;
  };
  const chartNodes=(scope=document)=>{
    const out=[];
    if(scope?.nodeType===1&&scope.hasAttribute?.(ATTR))out.push(scope);
    if(scope?.querySelectorAll)out.push(...scope.querySelectorAll(`[${ATTR}]`));
    return out;
  };
  const resizeChart=el=>{
    if(!echartsReady()||!isVisible(el))return false;
    const chart=window.echarts.getInstanceByDom(el);
    if(!chart||chart.isDisposed?.())return false;
    const r=el.getBoundingClientRect();
    const width=Math.max(1,Math.round(r.width));
    const height=Math.max(1,Math.round(r.height));
    try{
      chart.resize({width,height,silent:true,animation:{duration:0}});
      el.dataset.campChartWidth=String(width);
      el.dataset.campChartHeight=String(height);
      return true;
    }catch(_){return false}
  };
  const observeChart=el=>{
    if(!el||observed.has(el))return;
    observed.add(el);
    try{resizeObserver?.observe(el)}catch(_){}
  };
  const resizeVisible=(scope=document)=>{
    if(!echartsReady())return 0;
    let count=0;
    for(const el of chartNodes(scope)){
      observeChart(el);
      if(resizeChart(el))count++;
    }
    return count;
  };
  const schedule=(reason='layout',scope=document)=>{
    if(!echartsReady())return;
    const active=document.querySelector('.view.active')||scope||document;
    const run=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resizeVisible(active)));
    run();
    for(const delay of [60,160,320,650]){
      const t=setTimeout(()=>{timers.delete(t);run()},delay);
      timers.add(t);
    }
    try{window.dispatchEvent(new CustomEvent('camp:charts:layout',{detail:{reason}}))}catch(_){}
  };
  const installInitHook=()=>{
    if(!echartsReady()||window.echarts.__campInitHooked)return;
    const original=window.echarts.init;
    if(typeof original!=='function')return;
    window.echarts.init=function(dom,...args){
      const instance=original.call(this,dom,...args);
      observeChart(dom);
      requestAnimationFrame(()=>requestAnimationFrame(()=>resizeChart(dom)));
      const t=setTimeout(()=>{timers.delete(t);resizeChart(dom)},180);timers.add(t);
      return instance;
    };
    window.echarts.__campInitHooked=true;
  };
  const install=()=>{
    if(!echartsReady())return false;
    installInitHook();
    if(typeof ResizeObserver==='function'&&!resizeObserver){
      resizeObserver=new ResizeObserver(entries=>{
        for(const entry of entries){
          const el=entry.target;
          if(!isVisible(el))continue;
          const r=entry.contentRect;
          const oldW=Number(el.dataset.campChartWidth||0),oldH=Number(el.dataset.campChartHeight||0);
          if(Math.abs(r.width-oldW)>2||Math.abs(r.height-oldH)>2)resizeChart(el);
        }
      });
    }
    chartNodes().forEach(observeChart);
    schedule('install');
    return true;
  };
  const queueLayout=(reason,delay=30)=>{
    clearTimeout(layoutTimer);
    layoutTimer=setTimeout(()=>{chartNodes().forEach(observeChart);schedule(reason)},delay);
  };

  document.addEventListener('click',event=>{
    const nav=event.target.closest?.('.nav-btn,[data-view]');
    if(nav)setTimeout(()=>schedule('view-change'),0);
  },true);
  window.addEventListener('hashchange',()=>schedule('hashchange'));
  window.addEventListener('pageshow',()=>schedule('pageshow'));
  window.addEventListener('load',()=>schedule('window-load'));
  window.addEventListener('orientationchange',()=>schedule('orientationchange'));
  window.addEventListener('resize',()=>{
    const viewport=`${window.innerWidth}x${window.innerHeight}`;
    if(viewport===lastViewport)return;
    lastViewport=viewport;
    queueLayout('viewport-resize',90);
  },{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule('visibility')});

  if(typeof MutationObserver==='function'){
    const layoutTarget=el=>el?.matches?.('.view,.app-shell,.main-shell,.content,.sidebar,.bi-grid,.ec-advanced-grid,.cc-grid,.adv-grid,.ops-grid');
    const mo=new MutationObserver(mutations=>{
      let relevant=false;
      for(const m of mutations){
        if(m.type==='attributes'){
          if(m.attributeName===ATTR){relevant=true;break}
          if((m.attributeName==='class'||m.attributeName==='style')&&layoutTarget(m.target)){relevant=true;break}
        }
        if(m.addedNodes?.length){
          for(const n of m.addedNodes){
            if(n.nodeType!==1)continue;
            if(n.hasAttribute?.(ATTR)||n.querySelector?.(`[${ATTR}]`)||layoutTarget(n)){relevant=true;break}
          }
          if(relevant)break;
        }
      }
      if(relevant)queueLayout('dom-change',30);
    });
    mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style',ATTR]});
  }

  let attempts=0;
  const wait=setInterval(()=>{
    attempts++;
    if(install()||attempts>=80)clearInterval(wait);
  },100);
  install();
})();
