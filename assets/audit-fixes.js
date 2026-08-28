(()=>{
  'use strict';
  // Corrección auditada: Event.currentTarget puede quedar null después de await.
  // Se conserva una referencia estable al formulario y se mantiene la misma API/regla de negocio.
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement))return;
    if(!['reservationForm','blockForm','movementForm'].includes(form.id))return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try{
      if(form.id==='reservationForm'){
        const body=Object.fromEntries(new FormData(form));
        body.bed_count=Number(body.bed_count);
        await advApi('add_res_advanced',{method:'POST',body,token:A.token});
        form.reset();
        await loadAll();
        showMessage('Reserva registrada.');
        return;
      }

      if(form.id==='blockForm'){
        const body=Object.fromEntries(new FormData(form));
        await advApi('add_block',{method:'POST',body,token:A.token});
        form.reset();
        await loadAll();
        showMessage('Cama marcada fuera de servicio.');
        return;
      }

      if(form.id==='movementForm'){
        const body=Object.fromEntries(new FormData(form));
        body.people_count=Number(body.people_count);
        await advApi('add_movement',{method:'POST',body,token:A.token});
        form.reset();
        await loadAll();
        showMessage('Movimiento registrado.');
      }
    }catch(err){
      showMessage(err?.message||'No fue posible completar la operación.','error');
    }
  },true);
})();
