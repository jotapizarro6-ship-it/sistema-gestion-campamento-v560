import {test,expect} from '@playwright/test';

test.use({
  serviceWorkers:'block',
  timezoneId:'America/Santiago'
});

function chileToday(){
  const parts=new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:'America/Santiago',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }
  ).formatToParts(new Date());

  const map=Object.fromEntries(
    parts
      .filter(x=>x.type!=='literal')
      .map(x=>[x.type,x.value])
  );

  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(ds,n){
  const d=new Date(`${ds}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}

function clone(x){
  return JSON.parse(JSON.stringify(x));
}

function active(r){
  return ['PENDIENTE','CONFIRMADA']
    .includes(String(r.status||'').toUpperCase());
}

function overlaps(aStart,aEnd,bStart,bEnd){
  const ae=aEnd||'9999-12-31';
  const be=bEnd||'9999-12-31';

  return aStart<be && ae>bStart;
}

function makeState(reservations=[]){
  const today=chileToday();

  return {
    workers:[],

    inventory:[
      {id:1,module:'M1',room:'101',bed:'A'},
      {id:2,module:'M1',room:'101',bed:'B'},
      {id:3,module:'M1',room:'102',bed:'A'},
      {id:4,module:'M2',room:'201',bed:'A'}
    ],

    blocks:[],

    reservations:clone(reservations),

    movements:[],

    capacities:[
      {
        id:1,
        capacity_date:today,
        capacity:4
      }
    ],

    snapshots:[],

    imports:[],

    settings:{
      source_file:'r5-reservations.xlsx',
      last_update:'2026-09-02T06:10:00Z',
      cost_per_bed_day:'0'
    }
  };
}

async function installBackend(
  page,
  initialReservations=[]
){
  let state=makeState(initialReservations);
  let stateVersion=41;
  let nextReservationId=100;

  const calls=[];
  const adds=[];
  const statuses=[];
  const unexpected=[];

  const cors={
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'authorization,content-type'
  };

  const json=(route,payload,status=200)=>route.fulfill({
    status,
    contentType:'application/json',
    headers:cors,
    body:JSON.stringify(payload)
  });

  function bodyOf(request){
    try{
      return JSON.parse(request.postData()||'{}');
    }catch{
      return {};
    }
  }

  await page.route(
    '**/functions/v1/**',
    async route=>{
      const request=route.request();
      const url=new URL(request.url());

      const service=
        url.pathname
          .split('/')
          .filter(Boolean)
          .pop()||'';

      const action=url.searchParams.get('action')||'';
      const method=request.method().toUpperCase();

      calls.push({
        service,
        action,
        method,
        stateVersion:
          url.searchParams.get('state_version'),
        auth:
          request.headers()['authorization']||''
      });

      if(method==='OPTIONS'){
        return route.fulfill({
          status:204,
          headers:cors,
          body:''
        });
      }

      // ---------------------------------------------------------
      // WEB API
      // ---------------------------------------------------------

      if(service==='campamento-web-api'){
        if(
          action==='admin_login' &&
          method==='POST'
        ){
          return json(route,{
            ok:true,
            token:'r5b3-e2e-token'
          });
        }

        if(
          action==='consults' &&
          method==='GET'
        ){
          return json(route,{
            ok:true,
            data:[]
          });
        }

        if(
          action==='imports' &&
          method==='GET'
        ){
          return json(route,{
            ok:true,
            data:[]
          });
        }
      }

      // ---------------------------------------------------------
      // SAFE STATE
      // ---------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='advanced_state' &&
        method==='GET'
      ){
        return json(route,{
          ok:true,
          state_version:String(stateVersion),
          data:clone(state)
        });
      }

      if(
        service==='campamento-v560-safe' &&
        action==='snapshot_today' &&
        method==='POST'
      ){
        return json(route,{
          ok:true,
          data:{
            snapshot_date:chileToday()
          }
        });
      }

      if(
        service==='campamento-v560-safe' &&
        action==='health' &&
        method==='GET'
      ){
        return json(route,{
          ok:true,
          status:'healthy',
          database:true
        });
      }

      // ---------------------------------------------------------
      // ADD RESERVATION
      // ---------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='add_res_advanced' &&
        method==='POST'
      ){
        const b=bodyOf(request);

        const call={
          auth:
            request.headers()['authorization']||'',

          stateVersion:
            url.searchParams.get('state_version'),

          body:clone(b)
        };

        adds.push(call);

        if(call.stateVersion!==String(stateVersion)){
          return json(
            route,
            {
              ok:false,
              code:'STATE_CONFLICT',
              error:'Los datos cambiaron en otra sesión.'
            },
            409
          );
        }

        const arrival=String(
          b.arrival_date||''
        ).trim();

        const departure=String(
          b.departure_date||''
        ).trim()||null;

        const personName=String(
          b.person_name||''
        ).trim();

        const count=Number(b.bed_count||1);

        const module=String(
          b.module||''
        ).trim();

        const room=String(
          b.room||''
        ).trim();

        const bed=String(
          b.bed||''
        ).trim().toUpperCase();

        if(!arrival||!personName){
          return json(
            route,
            {
              ok:false,
              error:
                'Fecha de llegada y nombre son obligatorios.'
            },
            400
          );
        }

        if(departure&&departure<=arrival){
          return json(
            route,
            {
              ok:false,
              error:
                'La salida debe ser posterior a la llegada.'
            },
            400
          );
        }

        if(
          !Number.isInteger(count) ||
          count<1 ||
          count>1000
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'La cantidad de camas debe estar entre 1 y 1.000.'
            },
            400
          );
        }

        if(
          module &&
          room &&
          bed &&
          count!==1
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'Una reserva con cama exacta debe corresponder a 1 cama.'
            },
            400
          );
        }

        if(module&&room&&bed){
          const exists=state.inventory.some(
            x=>
              x.module===module &&
              String(x.room)===room &&
              String(x.bed).toUpperCase()===bed
          );

          if(!exists){
            return json(
              route,
              {
                ok:false,
                error:
                  'No fue posible identificar esa cama en el inventario actual.'
              },
              400
            );
          }

          const conflict=state.reservations.find(
            r=>
              active(r) &&
              r.module===module &&
              String(r.room)===room &&
              String(r.bed).toUpperCase()===bed &&
              overlaps(
                String(r.arrival_date),
                r.departure_date
                  ? String(r.departure_date)
                  : null,
                arrival,
                departure
              )
          );

          if(conflict){
            return json(
              route,
              {
                ok:false,
                error:
                  'Esa cama ya tiene una reserva que se cruza con las fechas indicadas.'
              },
              400
            );
          }
        }

        const created={
          id:nextReservationId++,
          arrival_date:arrival,
          departure_date:departure,
          person_name:personName,
          role_area:String(
            b.role_area||''
          ).trim(),

          module:module||null,
          room:room||null,
          bed:bed||null,

          bed_count:count,

          notes:String(
            b.notes||''
          ).trim(),

          status:'PENDIENTE'
        };

        state.reservations.push(created);

        stateVersion++;

        return json(route,{
          ok:true,
          data:clone(created)
        });
      }

      // ---------------------------------------------------------
      // RESERVATION STATUS
      // ---------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='reservation_status' &&
        method==='POST'
      ){
        const b=bodyOf(request);

        const call={
          auth:
            request.headers()['authorization']||'',

          stateVersion:
            url.searchParams.get('state_version'),

          body:clone(b)
        };

        statuses.push(call);

        if(call.stateVersion!==String(stateVersion)){
          return json(
            route,
            {
              ok:false,
              code:'STATE_CONFLICT',
              error:'Los datos cambiaron en otra sesión.'
            },
            409
          );
        }

        const id=Number(b.id);
        const status=String(
          b.status||''
        ).toUpperCase();

        if(
          ![
            'PENDIENTE',
            'CONFIRMADA',
            'ANULADA',
            'CANCELADA'
          ].includes(status)
        ){
          return json(
            route,
            {
              ok:false,
              error:'Estado de reserva no válido.'
            },
            400
          );
        }

        const row=state.reservations.find(
          r=>Number(r.id)===id
        );

        if(!row){
          return json(
            route,
            {
              ok:false,
              error:'Reserva no encontrada'
            },
            404
          );
        }

        row.status=status;

        stateVersion++;

        return json(route,{
          ok:true,
          data:{
            id,
            status
          }
        });
      }

      // ---------------------------------------------------------
      // NON-MUTATING SUPPORT SERVICES
      // ---------------------------------------------------------

      if(
        service==='campamento-control-api' &&
        action==='state' &&
        method==='GET'
      ){
        return json(route,{
          ok:true,
          data:{
            actions:[],
            plan_events:[],
            scenarios:[],
            audit:[]
          }
        });
      }

      if(
        service==='campamento-control-api' &&
        action==='audit' &&
        method==='POST'
      ){
        return json(route,{
          ok:true,
          data:{}
        });
      }

      if(
        service==='campamento-workforce-api' &&
        method==='GET'
      ){
        return json(route,{
          ok:true,
          rules:{}
        });
      }

      if(
        service==='campamento-consults-api' &&
        method==='GET'
      ){
        return json(route,{
          ok:true,
          data:[],
          count:0
        });
      }

      unexpected.push({
        service,
        action,
        method,
        url:url.toString()
      });

      return json(
        route,
        {
          ok:false,
          error:
            `Unexpected R5B3 request: ${service}/${action}/${method}`
        },
        503
      );
    }
  );

  return {
    get state(){
      return state;
    },

    get stateVersion(){
      return stateVersion;
    },

    get calls(){
      return calls;
    },

    get adds(){
      return adds;
    },

    get statuses(){
      return statuses;
    },

    get unexpected(){
      return unexpected;
    }
  };
}

async function login(page,backend){
  await page.goto('/admin.html#reservations');

  await expect(
    page.getByRole(
      'heading',
      {name:'Acceso administración'}
    )
  ).toBeVisible();

  await page
    .locator('#adminPassword')
    .fill('R5B3-E2E-PASSWORD');

  await page
    .locator('#adminLoginForm')
    .getByRole(
      'button',
      {name:'Ingresar'}
    )
    .click();

  await expect(
    page.locator('#adminApp')
  ).not.toHaveClass(/hidden/);

  await expect(
    page.locator('#view-reservations')
  ).toHaveClass(/active/);

  await expect(
    page.locator('#syncBadge')
  ).toHaveText('Actualizado');

  await expect.poll(
    ()=>page.evaluate(
      ()=>window.A?.stateVersion||''
    )
  ).toBe(String(backend.stateVersion));

  await expect(
    page.locator('#reservationForm')
  ).toBeVisible();
}

async function selectBed(
  page,
  module,
  room,
  bed
){
  await page
    .locator('#resModule')
    .selectOption(module);

  await page
    .locator('#resRoom')
    .selectOption(room);

  await page
    .locator('#resBed')
    .selectOption(bed);
}

function reservationRow(page,name){
  return page
    .locator('#view-reservations tbody tr')
    .filter({hasText:name})
    .first();
}

test(
  'R5B3 crea reserva exacta PENDIENTE con revision y selectores de inventario',
  async({page})=>{
    const backend=await installBackend(page);

    await login(page,backend);

    const today=chileToday();
    const arrival=addDays(today,1);
    const departure=addDays(today,3);

    await page
      .locator(
        '#reservationForm input[name="arrival_date"]'
      )
      .fill(arrival);

    await page
      .locator(
        '#reservationForm input[name="departure_date"]'
      )
      .fill(departure);

    await page
      .locator(
        '#reservationForm input[name="person_name"]'
      )
      .fill('RESERVA R5B3 NUEVA');

    await page
      .locator(
        '#reservationForm input[name="role_area"]'
      )
      .fill('OPERACIONES');

    await page
      .locator(
        '#reservationForm input[name="bed_count"]'
      )
      .fill('1');

    await selectBed(
      page,
      'M1',
      '101',
      'B'
    );

    await page
      .locator(
        '#reservationForm input[name="notes"]'
      )
      .fill('Journey R5B3');

    await page
      .locator('#reservationForm')
      .getByRole(
        'button',
        {name:'Registrar reserva'}
      )
      .click();

    await expect.poll(
      ()=>backend.adds.length
    ).toBe(1);

    await expect(
      page.locator('#globalMessage')
    ).toContainText('Reserva registrada');

    const row=reservationRow(
      page,
      'RESERVA R5B3 NUEVA'
    );

    await expect(row).toBeVisible();
    await expect(row).toContainText('PENDIENTE');
    await expect(row).toContainText('M1 / 101 / B');
    await expect(row).toContainText('OPERACIONES');

    const call=backend.adds[0];

    expect(call.auth)
      .toBe('Bearer r5b3-e2e-token');

    expect(call.stateVersion)
      .toBe('41');

    expect(call.body).toMatchObject({
      arrival_date:arrival,
      departure_date:departure,
      person_name:'RESERVA R5B3 NUEVA',
      role_area:'OPERACIONES',
      bed_count:1,
      module:'M1',
      room:'101',
      bed:'B',
      notes:'Journey R5B3'
    });

    expect(backend.stateVersion).toBe(42);

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.stateVersion||''
      )
    ).toBe('42');

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B3 ciclo PENDIENTE a CONFIRMADA y luego ANULADA conserva revision',
  async({page})=>{
    const today=chileToday();

    const seeded={
      id:9,
      arrival_date:addDays(today,2),
      departure_date:addDays(today,4),
      person_name:'RESERVA R5B3 CICLO',
      role_area:'MANTENCION',
      module:'M1',
      room:'101',
      bed:'A',
      bed_count:1,
      notes:'',
      status:'PENDIENTE'
    };

    const backend=await installBackend(
      page,
      [seeded]
    );

    await login(page,backend);

    let row=reservationRow(
      page,
      'RESERVA R5B3 CICLO'
    );

    await expect(row).toContainText('PENDIENTE');

    await row
      .getByRole(
        'button',
        {name:'Confirmar'}
      )
      .click();

    await expect.poll(
      ()=>backend.statuses.length
    ).toBe(1);

    expect(backend.statuses[0])
      .toMatchObject({
        auth:'Bearer r5b3-e2e-token',
        stateVersion:'41',
        body:{
          id:9,
          status:'CONFIRMADA'
        }
      });

    row=reservationRow(
      page,
      'RESERVA R5B3 CICLO'
    );

    await expect(row).toContainText('CONFIRMADA');

    expect(backend.stateVersion).toBe(42);

    await row
      .getByRole(
        'button',
        {name:'Anular'}
      )
      .click();

    await expect.poll(
      ()=>backend.statuses.length
    ).toBe(2);

    expect(backend.statuses[1])
      .toMatchObject({
        auth:'Bearer r5b3-e2e-token',
        stateVersion:'42',
        body:{
          id:9,
          status:'ANULADA'
        }
      });

    row=reservationRow(
      page,
      'RESERVA R5B3 CICLO'
    );

    await expect(row).toContainText('ANULADA');

    await expect(
      row.getByRole(
        'button',
        {name:'Confirmar'}
      )
    ).toHaveCount(0);

    await expect(
      row.getByRole(
        'button',
        {name:'Anular'}
      )
    ).toHaveCount(0);

    expect(backend.stateVersion).toBe(43);

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.stateVersion||''
      )
    ).toBe('43');

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B3 rechaza cruce de cama y preserva estado y revision',
  async({page})=>{
    const today=chileToday();

    const existing={
      id:20,
      arrival_date:addDays(today,2),
      departure_date:addDays(today,5),
      person_name:'RESERVA EXISTENTE',
      role_area:'PROYECTO',
      module:'M1',
      room:'101',
      bed:'B',
      bed_count:1,
      notes:'',
      status:'CONFIRMADA'
    };

    const backend=await installBackend(
      page,
      [existing]
    );

    await login(page,backend);

    await page
      .locator(
        '#reservationForm input[name="arrival_date"]'
      )
      .fill(addDays(today,3));

    await page
      .locator(
        '#reservationForm input[name="departure_date"]'
      )
      .fill(addDays(today,4));

    await page
      .locator(
        '#reservationForm input[name="person_name"]'
      )
      .fill('RESERVA EN CONFLICTO');

    await selectBed(
      page,
      'M1',
      '101',
      'B'
    );

    await page
      .locator('#reservationForm')
      .getByRole(
        'button',
        {name:'Registrar reserva'}
      )
      .click();

    await expect.poll(
      ()=>backend.adds.length
    ).toBe(1);

    await expect(
      page.locator('#globalMessage')
    ).toContainText(
      'Esa cama ya tiene una reserva que se cruza'
    );

    expect(backend.state.reservations)
      .toHaveLength(1);

    expect(backend.stateVersion)
      .toBe(41);

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.stateVersion||''
      )
    ).toBe('41');

    await expect(
      reservationRow(
        page,
        'RESERVA EXISTENTE'
      )
    ).toBeVisible();

    await expect(
      reservationRow(
        page,
        'RESERVA EN CONFLICTO'
      )
    ).toHaveCount(0);

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B3 permite misma cama exactamente desde el dia de salida anterior',
  async({page})=>{
    const today=chileToday();

    const departureBoundary=
      addDays(today,5);

    const existing={
      id:30,
      arrival_date:addDays(today,2),
      departure_date:departureBoundary,
      person_name:'RESERVA PREVIA',
      role_area:'PROYECTO',
      module:'M1',
      room:'101',
      bed:'B',
      bed_count:1,
      notes:'',
      status:'CONFIRMADA'
    };

    const backend=await installBackend(
      page,
      [existing]
    );

    await login(page,backend);

    await expect(
      page.locator('#view-reservations')
    ).toContainText(
      'Intervalo operacional [llegada, salida)'
    );

    await page
      .locator(
        '#reservationForm input[name="arrival_date"]'
      )
      .fill(departureBoundary);

    await page
      .locator(
        '#reservationForm input[name="departure_date"]'
      )
      .fill(addDays(today,7));

    await page
      .locator(
        '#reservationForm input[name="person_name"]'
      )
      .fill('RESERVA CONTIGUA');

    await selectBed(
      page,
      'M1',
      '101',
      'B'
    );

    await page
      .locator('#reservationForm')
      .getByRole(
        'button',
        {name:'Registrar reserva'}
      )
      .click();

    await expect.poll(
      ()=>backend.adds.length
    ).toBe(1);

    await expect(
      page.locator('#globalMessage')
    ).toContainText('Reserva registrada');

    expect(backend.state.reservations)
      .toHaveLength(2);

    await expect(
      reservationRow(
        page,
        'RESERVA PREVIA'
      )
    ).toBeVisible();

    const newRow=reservationRow(
      page,
      'RESERVA CONTIGUA'
    );

    await expect(newRow).toBeVisible();
    await expect(newRow).toContainText('PENDIENTE');
    await expect(newRow).toContainText('M1 / 101 / B');

    expect(backend.stateVersion)
      .toBe(42);

    expect(backend.unexpected).toEqual([]);
  }
);