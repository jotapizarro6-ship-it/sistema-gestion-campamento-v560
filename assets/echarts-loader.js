(()=>{
  'use strict';
  if(typeof document==='undefined'||window.__CAMP_ECHARTS_LAZY_LOADER__)return;
  window.__CAMP_ECHARTS_LAZY_LOADER__=true;
  const VERSION='6.1.0';
  const BUST='20260829-deepnav1';
  const SRC=`https://cdn.jsdelivr.net/npm/echarts@${VERSION}/dist/echarts.min.js`;
  let started=false,enhanced=false,idleHandle=null;
  const idle=(fn,timeout=1600)=>typeof requestIdleCallback==='function'?requestIdleCallback(fn,{timeout}):setTimeout(fn,Math.min(timeout,450));
  const addEnhancement=(src,attr)=>{
    if(document.querySelector(`script[${attr}]`))return;
    const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,'1');document.head.appendChild(s);
  };
  const loadEnhancement=()=>{
    if(enhanced)return;enhanced=true;
    if(typeof A!=='undefined'&&!window.A)window.A=A;
    addEnhancement('assets/echarts-dashboard.js','data-camp-echarts-enhancement');
    addEnhancement('assets/control-center-echarts.js','data-camp-control-echarts');
    addEnhancement('assets/advanced-sections-echarts.js','data-camp-advanced-echarts');
    addEnhancement('assets/advanced-gauge-fix.js','data-camp-gauge-fix');
    addEnhancement('assets/operations-suite-echarts.js','data-camp-operations-echarts');
    addEnhancement(`assets/echarts-layout-stabilizer.js?v=${BUST}`,'data-camp-echarts-layout-stabilizer');
  };
  const start=()=>{
    if(started)return;started=true;
    if(window.echarts){loadEnhancement();return}
    const script=document.createElement('script');script.src=SRC;script.async=true;script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';script.dataset.campEcharts='1';
    script.onload=()=>{window.__CAMP_ECHARTS_VERSION__=VERSION;loadEnhancement()};
    script.onerror=()=>{window.__CAMP_ECHARTS_FALLBACK__=true};
    document.head.appendChild(script);
  };
  const schedule=()=>{
    if(started||idleHandle)return;
    idleHandle=idle(()=>{idleHandle=null;start()},1800);
  };
  window.CampEChartsLazy={ensure:start,schedule,get started(){return started}};
  window.addEventListener?.('campamento:data-ready',schedule);
  document.addEventListener?.('visibilitychange',()=>{if(!document.hidden&&window.__CAMP_DATA_READY__)schedule()});
  if(window.__CAMP_DATA_READY__)schedule();
  else setTimeout(()=>{if(typeof A!=='undefined'&&A?.data)schedule()},4000);
})();
