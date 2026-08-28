(()=>{
  'use strict';
  if(typeof document==='undefined')return;
  const VERSION='6.1.0';
  const SRC=`https://cdn.jsdelivr.net/npm/echarts@${VERSION}/dist/echarts.min.js`;
  const loadEnhancement=()=>{
    // A es un binding global lexical del núcleo, no una propiedad de window.
    // Se expone solo como referencia en memoria para que la capa gráfica lea el mismo estado.
    if(typeof A!=='undefined'&&!window.A)window.A=A;
    if(document.querySelector('script[data-camp-echarts-enhancement]'))return;
    const s=document.createElement('script');
    s.src='assets/echarts-dashboard.js';
    s.defer=true;
    s.dataset.campEchartsEnhancement='1';
    document.head.appendChild(s);
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
