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
    const addQuality=(level,code,title,count,detail,action)=>{if(Number(count)>0)out.push({level,code,title,count,detail,action})};
    const movements=Array.isArray(data.movements)?data.movements:[];
    const validIsoDate=v=>{
      const x=clean(v),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
      if(!m)return false;
      const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));
      return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d;
    };
    const movementStatus=m=>plain(m?.lifecycle_status||'LEGACY_UNRESOLVED');
    const badMovementDate=movements.filter(m=>!validIsoDate(m.movement_date)).length;
    const badMovementType=movements.filter(m=>!['SUBIDA','BAJADA'].includes(plain(m.movement_type))).length;
    const badMovementCount=movements.filter(m=>{const n=Number(m.people_count);return !Number.isInteger(n)||n<0||n>10000}).length;
    const badMovementStatus=movements.filter(m=>!['PROGRAMADO','EJECUTADO','CANCELADO','LEGACY_UNRESOLVED'].includes(movementStatus(m))).length;
    addQuality('high','MOV_FECHA_INVALIDA','Movimientos con fecha invalida',badMovementDate,'Existen movimientos sin una fecha calendario valida en formato YYYY-MM-DD.','Corregir la fecha del registro antes de usarlo en calculos operacionales.');
    addQuality('high','MOV_TIPO_INVALIDO','Movimientos con tipo invalido',badMovementType,'Existen movimientos cuyo tipo no corresponde a SUBIDA o BAJADA.','Regularizar el tipo del movimiento segun el contrato operacional.');
    addQuality('high','MOV_CANTIDAD_INVALIDA','Movimientos con cantidad invalida',badMovementCount,'Existen movimientos cuya cantidad no es un entero entre 0 y 10.000.','Corregir la cantidad de personas del movimiento.');
    addQuality('high','MOV_ESTADO_INVALIDO','Movimientos con estado invalido',badMovementStatus,'Existen movimientos con lifecycle fuera del contrato vigente.','Revisar el origen del registro y regularizar su lifecycle sin reinterpretar movimientos legacy.');
    const reservations=Array.isArray(data.reservations)?data.reservations:[];
    const reservationStatus=r=>plain(r?.status);
    const badResArrival=reservations.filter(r=>!validIsoDate(r.arrival_date)).length;
    const badResDeparture=reservations.filter(r=>clean(r.departure_date)&&!validIsoDate(r.departure_date)).length;
    const badResInterval=reservations.filter(r=>validIsoDate(r.arrival_date)&&clean(r.departure_date)&&validIsoDate(r.departure_date)&&clean(r.departure_date)<=clean(r.arrival_date)).length;
    const badResCount=reservations.filter(r=>{const n=Number(r.bed_count);return !Number.isInteger(n)||n<1||n>1000}).length;
    const badResStatus=reservations.filter(r=>!['PENDIENTE','CONFIRMADA','ANULADA','CANCELADA'].includes(reservationStatus(r))).length;
    const missingResName=reservations.filter(r=>!clean(r.person_name)).length;
    const incompleteExactBed=reservations.filter(r=>clean(r.bed)&&(!clean(r.module)||!clean(r.room))).length;
    const badExactBedCount=reservations.filter(r=>clean(r.module)&&clean(r.room)&&clean(r.bed)&&Number(r.bed_count)!==1).length;
    addQuality('high','RES_FECHA_INVALIDA','Reservas con fecha invalida',badResArrival+badResDeparture,'Existen reservas con fechas ausentes o que no corresponden a una fecha calendario valida.','Corregir las fechas de la reserva antes de utilizarla en planificacion.');
    addQuality('high','RES_INTERVALO_INVALIDO','Reservas con intervalo invalido',badResInterval,'Existen reservas cuya salida no es posterior a la llegada.','Corregir el intervalo respetando llegada inclusiva y salida exclusiva.');
    addQuality('high','RES_CANTIDAD_INVALIDA','Reservas con cantidad invalida',badResCount,'Existen reservas cuya cantidad de camas no es un entero entre 1 y 1.000.','Corregir la cantidad de camas de la reserva.');
    addQuality('high','RES_ESTADO_INVALIDO','Reservas con estado invalido',badResStatus,'Existen reservas con estado fuera del contrato vigente.','Regularizar el estado sin reinterpretar reservas historicas.');
    addQuality('high','RES_NOMBRE_FALTANTE','Reservas sin nombre',missingResName,'Existen reservas sin persona identificada.','Completar el nombre asociado a la reserva.');
    addQuality('high','RES_CAMA_INCOMPLETA','Reservas con cama exacta incompleta',incompleteExactBed,'Existen reservas que indican cama pero no modulo y habitacion completos.','Completar modulo y habitacion o retirar la cama exacta del registro.');
    addQuality('high','RES_CAMA_CANTIDAD','Reservas exactas con cantidad incoherente',badExactBedCount,'Una reserva con modulo, habitacion y cama exacta debe corresponder a una sola cama.','Ajustar la reserva exacta a una cama o retirar la asignacion exacta.');
    const consistencyBedKey=(m,r,b)=>typeof lkey==='function'?lkey(m,r,b):[plain(m),plain(r),plain(b)].join('|');
    const qualityInventory=Array.isArray(data.inventory)?data.inventory:[];
    const qualityBlocks=Array.isArray(data.blocks)?data.blocks:[];
    const inventoryBedKeys=new Set(qualityInventory.map(x=>consistencyBedKey(x.module,x.room,x.bed)));
    const activeExactReservations=reservations.filter(r=>{
      const status=reservationStatus(r),arrival=clean(r.arrival_date),departure=clean(r.departure_date);
      return ['PENDIENTE','CONFIRMADA'].includes(status)&&validIsoDate(arrival)&&(!departure||validIsoDate(departure))&&(!departure||departure>arrival)&&clean(r.module)&&clean(r.room)&&clean(r.bed)&&Number(r.bed_count)===1;
    });
    const resBedOutsideInventory=activeExactReservations.filter(r=>!inventoryBedKeys.has(consistencyBedKey(r.module,r.room,r.bed))).length;
    const reservationsByBed=new Map();
    for(const r of activeExactReservations){
      const k=consistencyBedKey(r.module,r.room,r.bed);
      if(!reservationsByBed.has(k))reservationsByBed.set(k,[]);
      reservationsByBed.get(k).push(r);
    }
    let reservationOverlapPairs=0;
    for(const rows of reservationsByBed.values()){
      rows.sort((a,b)=>clean(a.arrival_date).localeCompare(clean(b.arrival_date)));
      for(let i=0;i<rows.length;i++){
        const endA=clean(rows[i].departure_date)||'9999-12-31';
        for(let j=i+1;j<rows.length;j++){
          const startB=clean(rows[j].arrival_date);
          if(startB>=endA)break;
          const endB=clean(rows[j].departure_date)||'9999-12-31';
          if(clean(rows[i].arrival_date)<endB)reservationOverlapPairs++;
        }
      }
    }
    const activeValidBlocks=qualityBlocks.filter(b=>{
      const start=clean(b.start_date),end=clean(b.end_date);
      return plain(b.status)==='ACTIVO'&&clean(b.module)&&clean(b.room)&&clean(b.bed)&&validIsoDate(start)&&(!end||validIsoDate(end))&&(!end||end>=start);
    });
    let reservationBlockCrosses=0;
    for(const r of activeExactReservations){
      const rk=consistencyBedKey(r.module,r.room,r.bed),rStart=clean(r.arrival_date),rEnd=clean(r.departure_date)||'9999-12-31';
      for(const b of activeValidBlocks){
        if(consistencyBedKey(b.module,b.room,b.bed)!==rk)continue;
        const bStart=clean(b.start_date),bEnd=clean(b.end_date);
        if(bStart<rEnd&&(!bEnd||bEnd>=rStart))reservationBlockCrosses++;
      }
    }
    addQuality('high','RES_CAMA_FUERA_INVENTARIO','Reservas con cama fuera de inventario',resBedOutsideInventory,'Existen reservas activas exactas que apuntan a camas inexistentes en el inventario vigente.','Regularizar la cama de la reserva contra el inventario operacional.');
    addQuality('critical','RES_SOLAPE_CAMA','Reservas exactas solapadas',reservationOverlapPairs,'Existen pares de reservas activas que se cruzan en fechas sobre una misma cama exacta.','Resolver el cruce antes de confirmar alojamiento o movimientos asociados.');
    addQuality('critical','RES_BLOQUEO_CRUCE','Reservas cruzadas con bloqueos',reservationBlockCrosses,'Existen reservas activas exactas que se cruzan con periodos de bloqueo activo de la misma cama.','Reasignar la reserva o regularizar el bloqueo antes del periodo afectado.');
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
    if(an.capacityAvailable&&an.committedPct!=null&&histAvg!=null&&Math.abs(an.committedPct-histAvg)>=15){
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
