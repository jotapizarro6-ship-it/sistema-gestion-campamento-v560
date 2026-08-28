(()=>{
  'use strict';
  if(typeof window==='undefined'||window.__PUBLIC_WORKER_V2__)return;
  const form=document.getElementById('workerLookupForm');
  const result=document.getElementById('workerLookupResult');
  const input=document.getElementById('workerRut');
  const button=form?.querySelector('button[type="submit"]');
  if(!form||!result||!input||!button)return;
  window.__PUBLIC_WORKER_V2__=true;

  const originalButton=button.innerHTML;
  let fallbackTimer=null;

  const setBusy=busy=>{
    result.setAttribute('aria-busy',busy?'true':'false');
    button.disabled=busy;
    button.innerHTML=busy?'<span class="public-spinner" aria-hidden="true"></span> CONSULTANDO…':originalButton;
    if(!busy&&fallbackTimer){clearTimeout(fallbackTimer);fallbackTimer=null;}
  };

  const text=v=>String(v??'').trim();
  const itemValue=item=>text(item?.querySelector('b')?.textContent)||'—';
  const itemLabel=item=>text(item?.querySelector('small')?.textContent)||'Dato';

  async function copyText(value){
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
    const area=document.createElement('textarea');
    area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
    document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }

  function enhanceSuccess(notice){
    if(notice.dataset.workerV2==='1')return;
    notice.dataset.workerV2='1';
    notice.setAttribute('tabindex','-1');
    notice.setAttribute('role','status');
    const grid=notice.querySelector('.assignment-grid');
    const items=grid?[...grid.querySelectorAll('.assignment-item')]:[];
    if(items.length<3)return;

    const moduleValue=itemValue(items[0]);
    const roomValue=itemValue(items[1]);
    const bedValue=itemValue(items[2]);
    const shiftValue=items[3]?itemValue(items[3]):'—';
    const worker=text(notice.querySelector(':scope > strong:first-of-type')?.textContent)||'Trabajador';

    const summary=document.createElement('div');
    summary.className='public-location-path';
    summary.setAttribute('aria-label','Ubicación asignada');
    summary.innerHTML=`
      <div class="public-location-node"><small>${itemLabel(items[0])}</small><strong>${moduleValue}</strong></div>
      <div class="public-location-node"><small>${itemLabel(items[1])}</small><strong>${roomValue}</strong></div>
      <div class="public-location-node"><small>${itemLabel(items[2])}</small><strong>${bedValue}</strong></div>`;
    grid.insertAdjacentElement('beforebegin',summary);

    const toolbar=document.createElement('div');
    toolbar.className='public-result-toolbar';
    toolbar.innerHTML=`
      <button type="button" class="public-result-action primary" data-worker-copy>📋 COPIAR ASIGNACIÓN</button>
      <button type="button" class="public-result-action" data-worker-new>↻ NUEVA CONSULTA</button>`;
    grid.insertAdjacentElement('afterend',toolbar);

    const status=document.createElement('div');
    status.className='public-result-status';
    status.textContent='Ubicación vigente según la última asignación cargada por Administración de Campamento.';
    toolbar.insertAdjacentElement('afterend',status);

    const copyBtn=toolbar.querySelector('[data-worker-copy]');
    copyBtn.addEventListener('click',async()=>{
      const old=copyBtn.innerHTML;
      const payload=`${worker} · ${itemLabel(items[0])}: ${moduleValue} · ${itemLabel(items[1])}: ${roomValue} · ${itemLabel(items[2])}: ${bedValue}${items[3]?` · ${itemLabel(items[3])}: ${shiftValue}`:''}`;
      try{await copyText(payload);copyBtn.textContent='✓ ASIGNACIÓN COPIADA';}
      catch(_){copyBtn.textContent='NO SE PUDO COPIAR';}
      setTimeout(()=>{copyBtn.innerHTML=old;},1800);
    });

    toolbar.querySelector('[data-worker-new]').addEventListener('click',()=>{
      result.innerHTML='';
      input.value='';
      input.focus();
      window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
  }

  function processResult(){
    const notice=result.querySelector('.notice');
    if(!notice)return;
    const isFinal=notice.classList.contains('ok')||notice.classList.contains('error')||notice.classList.contains('warn');
    if(!isFinal)return;
    setBusy(false);
    if(notice.classList.contains('ok'))enhanceSuccess(notice);
    else{notice.setAttribute('tabindex','-1');notice.setAttribute('role','alert');}
    requestAnimationFrame(()=>{
      notice.focus({preventScroll:true});
      result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
    });
  }

  const observer=new MutationObserver(processResult);
  observer.observe(result,{childList:true,subtree:true});

  form.addEventListener('submit',()=>{
    setBusy(true);
    result.removeAttribute('data-last-result');
    fallbackTimer=setTimeout(()=>setBusy(false),15000);
  });

  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&input.value){input.value='';}
  });

  processResult();
})();
