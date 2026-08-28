(()=>{
  'use strict';
  // Ajustes finales de cálculo alineados con la auditoría v5.5.8.
  // No cambian reglas operativas de reservas, camas, movimientos ni cierres.

  const originalCalcExceptions=calcExceptions;
  calcExceptions=function(data,an){
    const out=originalCalcExceptions(data,an);
    const invalidRut=data.workers.filter(w=>clean(w.rut)&&!rutValid(w.rut)).length;
    if(invalidRut>0){
      out.push({
        level:'high',
        code:'RUT_DV_INVALIDO',
        title:'RUT con dígito verificador inválido',
        count:invalidRut,
        detail:`Se detectaron ${invalidRut} registro(s) cuyo RUT no supera la validación matemática del dígito verificador.`,
        action:'Corregir el RUT en la planilla Excel base y volver a cargarla.'
      });
    }
    const sev={critical:0,high:1,medium:2,low:3};
    out.sort((a,b)=>(sev[a.level]??9)-(sev[b.level]??9)||Number(b.count||0)-Number(a.count||0)||String(a.title||'').localeCompare(String(b.title||''),'es'));
    return out;
  };

  calcAnomalies=function(data,an){
    const out=[],today=todayISO();
    // v5.5.8: usar hasta los siete cierres confirmados inmediatamente anteriores,
    // aunque estén separados por días sin cierre.
    const previousClosed=closedSnapshots(data).filter(s=>clean(s.snapshot_date)<today).slice(-7);
    const histAvg=previousClosed.length?previousClosed.reduce((a,s)=>a+Number(s.committed_occupancy||0),0)/previousClosed.length:null;
    if(histAvg!=null&&Math.abs(an.committedPct-histAvg)>=15){
      out.push({level:'medium',title:'Variación inusual de ocupación',detail:`La ocupación comprometida de hoy (${fmt1(an.committedPct)}%) difiere ${fmt1(Math.abs(an.committedPct-histAvg))} puntos del promedio reciente (${fmt1(histAvg)}%).`});
    }

    // v5.5.8: la ventana de movimientos es siempre de 30 días e incluye días sin movimiento.
    const historyStart=addDays(today,-30),histMoves=data.movements.filter(m=>clean(m.movement_date)>=historyStart&&clean(m.movement_date)<today),sums={SUBIDA:0,BAJADA:0};
    for(const m of histMoves){const k=plain(m.movement_type);if(k in sums)sums[k]+=Number(m.people_count)||0}
    const avgUp=sums.SUBIDA/30,avgDown=sums.BAJADA/30;
    if(avgUp>0&&an.mv.SUBIDA>=Math.max(avgUp*1.75,avgUp+10))out.push({level:'medium',title:'Subida inusual',detail:`Hoy se registran ${an.mv.SUBIDA} subidas frente a un promedio reciente de ${fmt1(avgUp)}.`});
    if(avgDown>0&&an.mv.BAJADA>=Math.max(avgDown*1.75,avgDown+10))out.push({level:'medium',title:'Bajada inusual',detail:`Hoy se registran ${an.mv.BAJADA} bajadas frente a un promedio reciente de ${fmt1(avgDown)}.`});
    return out;
  };

  const originalAnalytics=analytics;
  analytics=function(data){
    const an=originalAnalytics(data);
    const previousClosed=closedSnapshots(data).filter(s=>clean(s.snapshot_date)<an.today).slice(-7);
    an.histAvg=previousClosed.length?Math.round(previousClosed.reduce((a,s)=>a+Number(s.committed_occupancy||0),0)/previousClosed.length*10)/10:null;
    return an;
  };

  // Evita confundir capacidad operacional diaria con inventario físico (504 camas).
  const originalKpi=kpi;
  kpi=function(label,value,detail='',kind=''){
    return originalKpi(label==='Capacidad total'?'Capacidad operativa':label,value,detail,kind);
  };
})();
