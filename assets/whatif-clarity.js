(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof renderPlanning!=='function'||window.__CAMP_WHATIF_CLARITY__)return;
  window.__CAMP_WHATIF_CLARITY__=true;

  const originalRenderPlanning=renderPlanning;
  const help={
    delta:{
      title:'Variación de camas-día',
      body:()=>`<div class="notice info"><strong>No representa la capacidad física del campamento.</strong><br>Es la carga adicional o reducción acumulada del escenario respecto de la proyección base.</div><div class="metric-row"><span>Ejemplo</span><strong>10 camas × 30 días = 300 camas-día</strong></div><p class="muted">Un resultado de +300 significa 300 camas-día adicionales acumuladas durante la ventana analizada; no significa que existan 300 camas disponibles en un día.</p>`
    },
    daily:{
      title:'Capacidad diaria',
      body:ctx=>`<div class="notice ok"><strong>${fmtInt(ctx.daily)} camas</strong> de capacidad base al inicio de la ventana seleccionada.</div><p class="muted">Esta es la capacidad programada para un día. Si existen bloqueos o cambios de capacidad en fechas posteriores, la capacidad efectiva puede variar día a día.</p>`
    },
    window:{
      title:'Capacidad total de la ventana',
      body:ctx=>`<div class="notice info"><strong>${fmtInt(ctx.windowCapacity)} camas-día</strong> acumuladas en ${fmtInt(ctx.days)} día(s).</div><p class="muted">Se calcula sumando la capacidad efectiva de cada día de la ventana. Cuando la capacidad diaria es constante y no hay bloqueos, equivale a capacidad diaria × número de días.</p>`
    }
  };

  function helpButton(kind,label){
    return `<button type="button" class="ops-help-btn" data-whatif-help="${kind}" aria-label="Explicar ${esc(label)}" title="Ver explicación" data-tooltip="Ver explicación">i</button>`;
  }

  function enhanceWhatIfClarity(){
    const root=document.querySelector('#view-planning [data-ops-planning]');
    const kpis=root?.querySelector('.ops-whatif-kpis');
    const sim=A.currentSimulation;
    if(!root||!kpis||!sim?.rows?.length)return;

    const rows=sim.rows;
    const summary=sim.summary||{};
    const daily=Number(rows[0]?.base_capacity ?? rows[0]?.capacity ?? 0);
    const windowCapacity=rows.reduce((s,r)=>s+Math.max(0,Number(r.capacity)||0),0);
    const days=rows.length;
    const ctx={daily,windowCapacity,days};

    const deltaCard=[...kpis.children].find(card=>/CAMAS-D[IÍ]A/i.test(card.querySelector('span')?.textContent||''));
    if(deltaCard){
      const delta=Number(summary.bedDaysDelta)||0;
      deltaCard.className=`${delta>0?'amber':'navy'} ops-clarity-delta`;
      deltaCard.innerHTML=`<div class="ops-clarity-label"><span>Variación de camas-día</span>${helpButton('delta','variación de camas-día')}</div><strong>${delta>=0?'+':''}${fmtInt(delta)}</strong><small>Carga acumulada del escenario vs. base</small>`;
    }

    root.querySelector('.ops-capacity-context')?.remove();
    const context=document.createElement('div');
    context.className='ops-capacity-context';
    context.innerHTML=`
      <div class="ops-capacity-metric"><div class="ops-clarity-label"><span>Capacidad diaria</span>${helpButton('daily','capacidad diaria')}</div><strong>${fmtInt(daily)} <small>camas</small></strong><p>Capacidad base del primer día de la ventana.</p></div>
      <div class="ops-capacity-metric"><div class="ops-clarity-label"><span>Capacidad total ventana</span>${helpButton('window','capacidad total de la ventana')}</div><strong>${fmtInt(windowCapacity)} <small>camas-día</small></strong><p>Suma de la capacidad efectiva de ${fmtInt(days)} día(s).</p></div>
      <div class="ops-capacity-formula"><span>Cómo interpretar camas-día</span><strong>Personas/camas adicionales × días afectados</strong><p>Ej.: 10 camas durante 30 días = 300 camas-día. No son 300 camas físicas.</p></div>`;
    kpis.insertAdjacentElement('afterend',context);

    root.querySelectorAll('[data-whatif-help]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const item=help[btn.dataset.whatifHelp];
        if(item&&typeof showDialog==='function')showDialog(item.title,item.body(ctx));
      });
    });
  }

  renderPlanning=function(...args){
    const result=originalRenderPlanning.apply(this,args);
    enhanceWhatIfClarity();
    return result;
  };
})();
