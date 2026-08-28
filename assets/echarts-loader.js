(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const VERSION='6.1.0';
  const SRC=`https://cdn.jsdelivr.net/npm/echarts@${VERSION}/dist/echarts.min.js`;
  const addEnhancement=(src,attr)=>{
    if(document.querySelector(`script[${attr}]`))return;
    const s=document.createElement('script');
    s.src=src;
    s.async=false;
    s.setAttribute(attr,'1');
    document.head.appendChild(s);
  };
  const loadEnhancement=()=>{
    if(typeof A!=='undefined'&&!window.A)window.A=A;
    addEnhancement('assets/echarts-dashboard.js','data-camp-echarts-enhancement');
    addEnhancement('assets/control-center-echarts.js','data-camp-control-echarts');
    addEnhancement('assets/advanced-sections-echarts.js','data-camp-advanced-echarts');
    addEnhancement('assets/advanced-gauge-fix.js','data-camp-gauge-fix');
  };
  if(window.echarts){loadEnhancement();return;}
  const script=document.createElement('script');
  script.src=SRC;
  script.async=true;
  script.crossOrigin='anonymous';
  script.referrerPolicy='no-referrer';
  script.dataset.campEcharts='1';
  script.onload=()=>{window.__CAMP_ECHARTS_VERSION__=VERSION;loadEnhancement()};
  script.onerror=()=>{window.__CAMP_ECHARTS_FALLBACK__=true};
  document.head.appendChild(script);
})();
