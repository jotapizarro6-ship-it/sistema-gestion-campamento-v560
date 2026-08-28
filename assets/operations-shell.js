(()=>{
  'use strict';
  if(typeof document==='undefined'||window.__CAMP_OPS_SHELL__)return;
  window.__CAMP_OPS_SHELL__=true;
  const nav=document.getElementById('adminNav'),main=document.querySelector('main.content');if(!nav||!main)return;
  if(!nav.querySelector('[data-view="control-room"]')){
    const overview=nav.querySelector('[data-view="overview"]'),b=document.createElement('button');b.type='button';b.dataset.view='control-room';b.className='nav-btn';b.textContent='Centro de Control';overview?.insertAdjacentElement('afterend',b);
  }
  if(!nav.querySelector('[data-view="governance"]')){
    const exportsBtn=nav.querySelector('[data-view="exports"]'),b=document.createElement('button');b.type='button';b.dataset.view='governance';b.className='nav-btn';b.textContent='Seguridad / Trazabilidad';exportsBtn?.insertAdjacentElement('afterend',b);
  }
  if(!document.getElementById('view-control-room')){const s=document.createElement('section');s.id='view-control-room';s.className='view';const overview=document.getElementById('view-overview');overview?.insertAdjacentElement('afterend',s)}
  if(!document.getElementById('view-governance')){const s=document.createElement('section');s.id='view-governance';s.className='view';main.appendChild(s)}
})();
