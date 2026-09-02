import {
  test,
  expect
} from '@playwright/test';

test.use({
  serviceWorkers:'block',
  timezoneId:'America/Santiago'
});

function chileToday(){
  const parts=
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:'America/Santiago',
        year:'numeric',
        month:'2-digit',
        day:'2-digit'
      }
    ).formatToParts(
      new Date()
    );

  const map=
    Object.fromEntries(
      parts
        .filter(x=>x.type!=='literal')
        .map(x=>[
          x.type,
          x.value
        ])
    );

  return (
    `${map.year}-${map.month}-${map.day}`
  );
}

function addDays(ds,n){
  const d=
    new Date(
      `${ds}T12:00:00Z`
    );

  d.setUTCDate(
    d.getUTCDate()+n
  );

  return d
    .toISOString()
    .slice(0,10);
}

function clone(value){
  return JSON.parse(
    JSON.stringify(value)
  );
}

function sameBed(a,b){
  return (
    String(a.module||'')===
      String(b.module||'') &&

    String(a.room||'')===
      String(b.room||'') &&

    String(a.bed||'')
      .toUpperCase()===
      String(b.bed||'')
        .toUpperCase()
  );
}

function activeReservation(row){
  return [
    'PENDIENTE',
    'CONFIRMADA'
  ].includes(
    String(
      row.status||
      ''
    ).toUpperCase()
  );
}

function makeState({
  blocks=[],
  reservations=[],
  workers=[]
}={}){
  const today=
    chileToday();

  const capacities=[];

  for(let i=0;i<=10;i++){
    capacities.push({
      id:i+1,
      capacity_date:
        addDays(today,i),
      capacity:4
    });
  }

  return {
    workers:
      clone(workers),

    inventory:[
      {
        id:1,
        module:'M1',
        room:'101',
        bed:'A'
      },
      {
        id:2,
        module:'M1',
        room:'101',
        bed:'B'
      },
      {
        id:3,
        module:'M1',
        room:'101',
        bed:'C'
      },
      {
        id:4,
        module:'M2',
        room:'201',
        bed:'A'
      }
    ],

    blocks:
      clone(blocks),

    reservations:
      clone(reservations),

    movements:[],

    capacities,

    snapshots:[],
    imports:[],

    settings:{
      source_file:
        'r5-blocks.xlsx',

      last_update:
        '2026-09-02T06:40:00Z',

      cost_per_bed_day:'0'
    }
  };
}

async function installBackend(
  page,
  initial={}
){
  let state=
    makeState(initial);

  let stateVersion=61;
  let nextBlockId=100;

  const adds=[];
  const closes=[];
  const unexpected=[];

  const cors={
    'access-control-allow-origin':'*',

    'access-control-allow-methods':
      'GET,POST,OPTIONS',

    'access-control-allow-headers':
      'authorization,content-type'
  };

  const json=(
    route,
    payload,
    status=200
  )=>
    route.fulfill({
      status,
      contentType:
        'application/json',

      headers:cors,

      body:
        JSON.stringify(payload)
    });

  const bodyOf=request=>{
    try{
      return JSON.parse(
        request.postData()||
        '{}'
      );
    }catch{
      return {};
    }
  };

  await page.route(
    '**/functions/v1/**',
    async route=>{
      const request=
        route.request();

      const url=
        new URL(
          request.url()
        );

      const service=
        url.pathname
          .split('/')
          .filter(Boolean)
          .pop()||
        '';

      const action=
        url.searchParams.get(
          'action'
        )||
        '';

      const method=
        request
          .method()
          .toUpperCase();

      if(method==='OPTIONS'){
        return route.fulfill({
          status:204,
          headers:cors,
          body:''
        });
      }

      // --------------------------------------------------------
      // Login/support
      // --------------------------------------------------------

      if(
        service==='campamento-web-api' &&
        action==='admin_login' &&
        method==='POST'
      ){
        return json(
          route,
          {
            ok:true,
            token:
              'r5b5-e2e-token'
          }
        );
      }

      if(
        service==='campamento-web-api' &&
        action==='consults' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            data:[]
          }
        );
      }

      if(
        service==='campamento-web-api' &&
        action==='imports' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            data:[]
          }
        );
      }

      // --------------------------------------------------------
      // State
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='advanced_state' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,

            state_version:
              String(
                stateVersion
              ),

            data:
              clone(state)
          }
        );
      }

      if(
        service==='campamento-v560-safe' &&
        action==='snapshot_today' &&
        method==='POST'
      ){
        return json(
          route,
          {
            ok:true,
            data:{
              snapshot_date:
                chileToday()
            }
          }
        );
      }

      if(
        service==='campamento-v560-safe' &&
        action==='health' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            status:'healthy',
            database:true
          }
        );
      }

      // --------------------------------------------------------
      // ADD BLOCK
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='add_block' &&
        method==='POST'
      ){
        const body=
          bodyOf(request);

        const call={
          auth:
            request.headers()[
              'authorization'
            ]||
            '',

          stateVersion:
            url.searchParams.get(
              'state_version'
            ),

          body:
            clone(body)
        };

        adds.push(call);

        if(
          call.stateVersion!==
          String(stateVersion)
        ){
          return json(
            route,
            {
              ok:false,
              code:'STATE_CONFLICT',
              error:
                'Los datos cambiaron.'
            },
            409
          );
        }

        let module=
          String(
            body.module||
            ''
          ).trim();

        let room=
          String(
            body.room||
            ''
          ).trim();

        let bed=
          String(
            body.bed||
            ''
          )
            .trim()
            .toUpperCase();

        const start=
          String(
            body.start_date||
            ''
          ).trim();

        const end=
          String(
            body.end_date||
            ''
          ).trim()||
          null;

        const reason=
          String(
            body.reason||
            ''
          ).trim()||
          'Fuera de servicio';

        if(
          !module||
          !room||
          !bed
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'Indica módulo, habitación y cama para el bloqueo.'
            },
            400
          );
        }

        if(
          !/^\d{4}-\d{2}-\d{2}$/.test(start)||
          (
            end &&
            !/^\d{4}-\d{2}-\d{2}$/.test(end)
          )
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'Las fechas del bloqueo no son válidas.'
            },
            400
          );
        }

        if(
          end &&
          end<start
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'La fecha de término no puede ser anterior al inicio.'
            },
            400
          );
        }

        const inv=
          state.inventory.find(
            item=>
              sameBed(
                item,
                {
                  module,
                  room,
                  bed
                }
              )
          );

        if(!inv){
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

        module=inv.module;
        room=String(inv.room);
        bed=String(inv.bed);

        if(start<=chileToday()){
          const occupant=
            state.workers.find(
              worker=>
                String(
                  worker.rut||
                  ''
                ).trim() &&

                sameBed(
                  {
                    module:
                      worker.modulo,

                    room:
                      worker.habitacion,

                    bed:
                      worker.cama
                  },
                  {
                    module,
                    room,
                    bed
                  }
                )
            );

          if(occupant){
            return json(
              route,
              {
                ok:false,
                error:
                  `No se puede bloquear desde hoy una cama ocupada por ${occupant.nombre||'un trabajador'}.`
              },
              400
            );
          }
        }

        const effectiveEnd=
          end||
          '9999-12-31';

        const overlappingBlock=
          state.blocks.find(
            row=>
              String(
                row.status||
                ''
              ).toUpperCase()==='ACTIVO' &&

              sameBed(
                row,
                {
                  module,
                  room,
                  bed
                }
              ) &&

              String(
                row.start_date||
                ''
              )<=effectiveEnd &&

              (
                !row.end_date ||
                String(
                  row.end_date
                )>=start
              )
          );

        if(overlappingBlock){
          return json(
            route,
            {
              ok:false,
              error:
                'Ya existe un bloqueo activo que se cruza con esas fechas.'
            },
            400
          );
        }

        const reservation=
          state.reservations.find(
            row=>
              activeReservation(row) &&

              sameBed(
                row,
                {
                  module,
                  room,
                  bed
                }
              ) &&

              String(
                row.arrival_date||
                ''
              )<=effectiveEnd &&

              (
                !row.departure_date ||
                String(
                  row.departure_date
                )>start
              )
          );

        if(reservation){
          return json(
            route,
            {
              ok:false,

              error:
                `No se puede bloquear: existe una reserva cruzada para ${reservation.person_name}.`
            },
            400
          );
        }

        const created={
          id:
            nextBlockId++,

          module,
          room,
          bed,

          start_date:start,
          end_date:end,

          reason,

          status:'ACTIVO'
        };

        state.blocks.push(
          created
        );

        stateVersion++;

        return json(
          route,
          {
            ok:true,
            data:
              clone(created)
          }
        );
      }

      // --------------------------------------------------------
      // CLOSE BLOCK
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='close_block' &&
        method==='POST'
      ){
        const body=
          bodyOf(request);

        const call={
          auth:
            request.headers()[
              'authorization'
            ]||
            '',

          stateVersion:
            url.searchParams.get(
              'state_version'
            ),

          body:
            clone(body)
        };

        closes.push(call);

        if(
          call.stateVersion!==
          String(stateVersion)
        ){
          return json(
            route,
            {
              ok:false,
              code:'STATE_CONFLICT',
              error:
                'Los datos cambiaron.'
            },
            409
          );
        }

        const row=
          state.blocks.find(
            block=>
              Number(
                block.id
              )===
              Number(
                body.id
              )
          );

        if(!row){
          return json(
            route,
            {
              ok:false,
              error:
                'Bloqueo no encontrado'
            },
            404
          );
        }

        row.status=
          'CERRADO';

        stateVersion++;

        return json(
          route,
          {
            ok:true,
            data:{
              id:
                Number(row.id),

              status:
                'CERRADO'
            }
          }
        );
      }

      // --------------------------------------------------------
      // Progressive layers
      // --------------------------------------------------------

      if(
        service==='campamento-control-api' &&
        action==='state' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            data:{
              actions:[],
              plan_events:[],
              scenarios:[],
              audit:[]
            }
          }
        );
      }

      if(
        service==='campamento-control-api' &&
        action==='audit' &&
        method==='POST'
      ){
        return json(
          route,
          {
            ok:true,
            data:{}
          }
        );
      }

      if(
        service==='campamento-workforce-api' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            rules:{}
          }
        );
      }

      if(
        service==='campamento-consults-api' &&
        method==='GET'
      ){
        return json(
          route,
          {
            ok:true,
            data:[],
            count:0
          }
        );
      }

      unexpected.push({
        service,
        action,
        method,
        url:
          url.toString()
      });

      return json(
        route,
        {
          ok:false,

          error:
            `Unexpected R5B5 request: `+
            `${service}/${action}/${method}`
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

    get adds(){
      return adds;
    },

    get closes(){
      return closes;
    },

    get unexpected(){
      return unexpected;
    }
  };
}

async function login(
  page,
  backend
){
  await page.goto(
    '/admin.html#blocks'
  );

  await expect(
    page.getByRole(
      'heading',
      {
        name:
          'Acceso administración'
      }
    )
  ).toBeVisible();

  await page
    .locator(
      '#adminPassword'
    )
    .fill(
      'R5B5-E2E-PASSWORD'
    );

  await page
    .locator(
      '#adminLoginForm'
    )
    .getByRole(
      'button',
      {
        name:'Ingresar'
      }
    )
    .click();

  await expect(
    page.locator(
      '#adminApp'
    )
  ).not.toHaveClass(
    /hidden/
  );

  await expect(
    page.locator(
      '#view-blocks'
    )
  ).toHaveClass(
    /active/
  );

  await expect(
    page.locator(
      '#syncBadge'
    )
  ).toHaveText(
    'Actualizado'
  );

  await expect.poll(
    ()=>
      page.evaluate(
        ()=>
          window.A
            ?.stateVersion||
          ''
      )
  ).toBe(
    String(
      backend.stateVersion
    )
  );

  await expect(
    page.locator(
      '#blockForm'
    )
  ).toBeVisible();
}

async function selectBed(
  page,
  module,
  room,
  bed
){
  await page
    .locator(
      '#blockModule'
    )
    .selectOption(module);

  await page
    .locator(
      '#blockRoom'
    )
    .selectOption(room);

  await page
    .locator(
      '#blockBed'
    )
    .selectOption(bed);
}

async function fillBlock(
  page,
  {
    module,
    room,
    bed,
    start,
    end='',
    reason
  }
){
  await selectBed(
    page,
    module,
    room,
    bed
  );

  await page
    .locator(
      '#blockForm input[name="start_date"]'
    )
    .fill(start);

  await page
    .locator(
      '#blockForm input[name="end_date"]'
    )
    .fill(end);

  await page
    .locator(
      '#blockForm input[name="reason"]'
    )
    .fill(reason);
}

async function submitBlock(page){
  await page
    .locator(
      '#blockForm'
    )
    .getByRole(
      'button',
      {
        name:
          'Bloquear cama'
      }
    )
    .click();
}

function blockRow(
  page,
  text
){
  return page
    .locator(
      '#view-blocks tbody tr'
    )
    .filter({
      hasText:text
    })
    .first();
}

async function capacityAt(
  page,
  date
){
  return page.evaluate(
    ds=>{
      const result=
        effectiveCapacityV1(
          ds,
          A.data
        );

      return {
        base:
          result.base_capacity,

        blocked:
          result.blocked,

        capacity:
          result.capacity,

        available:
          result.capacity_available
      };
    },
    date
  );
}

test(
  'R5B5 crea bloqueo inclusivo y reduce capacidad sólo dentro del intervalo',
  async({page})=>{
    const backend=
      await installBackend(
        page
      );

    await login(
      page,
      backend
    );

    const today=
      chileToday();

    const before=
      addDays(today,1);

    const start=
      addDays(today,2);

    const end=
      addDays(today,4);

    const after=
      addDays(today,5);

    await fillBlock(
      page,
      {
        module:'M1',
        room:'101',
        bed:'B',
        start,
        end,
        reason:
          'MANTENCION R5B5'
      }
    );

    await submitBlock(page);

    await expect.poll(
      ()=>
        backend.adds.length
    ).toBe(1);

    expect(
      backend.adds[0]
    ).toMatchObject({
      auth:
        'Bearer r5b5-e2e-token',

      stateVersion:'61',

      body:{
        module:'M1',
        room:'101',
        bed:'B',
        start_date:start,
        end_date:end,
        reason:
          'MANTENCION R5B5'
      }
    });

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Cama marcada fuera de servicio.'
    );

    const row=
      blockRow(
        page,
        'MANTENCION R5B5'
      );

    await expect(row)
      .toBeVisible();

    await expect(row)
      .toContainText(
        'ACTIVO'
      );

    await expect(row)
      .toContainText(
        'M1'
      );

    await expect(row)
      .toContainText(
        '101'
      );

    await expect(row)
      .toContainText(
        'B'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Cerrar bloqueo'
        }
      )
    ).toBeVisible();

    expect(
      await capacityAt(
        page,
        before
      )
    ).toMatchObject({
      base:4,
      blocked:0,
      capacity:4,
      available:true
    });

    expect(
      await capacityAt(
        page,
        start
      )
    ).toMatchObject({
      base:4,
      blocked:1,
      capacity:3,
      available:true
    });

    expect(
      await capacityAt(
        page,
        end
      )
    ).toMatchObject({
      base:4,
      blocked:1,
      capacity:3,
      available:true
    });

    expect(
      await capacityAt(
        page,
        after
      )
    ).toMatchObject({
      base:4,
      blocked:0,
      capacity:4,
      available:true
    });

    expect(
      backend.stateVersion
    ).toBe(62);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('62');

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B5 cerrar bloqueo restaura capacidad y elimina la acción terminal',
  async({page})=>{
    const today=
      chileToday();

    const start=
      addDays(today,2);

    const end=
      addDays(today,4);

    const middle=
      addDays(today,3);

    const backend=
      await installBackend(
        page,
        {
          blocks:[
            {
              id:10,
              module:'M1',
              room:'101',
              bed:'B',
              start_date:start,
              end_date:end,
              reason:
                'BLOQUEO A CERRAR',
              status:'ACTIVO'
            }
          ]
        }
      );

    await login(
      page,
      backend
    );

    expect(
      await capacityAt(
        page,
        middle
      )
    ).toMatchObject({
      base:4,
      blocked:1,
      capacity:3
    });

    let row=
      blockRow(
        page,
        'BLOQUEO A CERRAR'
      );

    await row
      .getByRole(
        'button',
        {
          name:
            'Cerrar bloqueo'
        }
      )
      .click();

    await expect.poll(
      ()=>
        backend.closes.length
    ).toBe(1);

    expect(
      backend.closes[0]
    ).toMatchObject({
      auth:
        'Bearer r5b5-e2e-token',

      stateVersion:'61',

      body:{
        id:10
      }
    });

    expect(
      backend.state.blocks[0]
        .status
    ).toBe(
      'CERRADO'
    );

    expect(
      backend.stateVersion
    ).toBe(62);

    row=
      blockRow(
        page,
        'BLOQUEO A CERRAR'
      );

    await expect(row)
      .toContainText(
        'CERRADO'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Cerrar bloqueo'
        }
      )
    ).toHaveCount(0);

    expect(
      await capacityAt(
        page,
        middle
      )
    ).toMatchObject({
      base:4,
      blocked:0,
      capacity:4
    });

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B5 rechaza dos bloqueos activos que comparten incluso el día límite',
  async({page})=>{
    const today=
      chileToday();

    const existingStart=
      addDays(today,2);

    const boundary=
      addDays(today,4);

    const backend=
      await installBackend(
        page,
        {
          blocks:[
            {
              id:20,
              module:'M1',
              room:'101',
              bed:'B',
              start_date:
                existingStart,
              end_date:
                boundary,
              reason:
                'BLOQUEO EXISTENTE',
              status:'ACTIVO'
            }
          ]
        }
      );

    await login(
      page,
      backend
    );

    await fillBlock(
      page,
      {
        module:'M1',
        room:'101',
        bed:'B',

        // Mismo día de término:
        // los bloqueos son inclusivos.
        start:
          boundary,

        end:
          addDays(today,6),

        reason:
          'BLOQUEO SUPERPUESTO'
      }
    );

    await submitBlock(page);

    await expect.poll(
      ()=>
        backend.adds.length
    ).toBe(1);

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Ya existe un bloqueo activo que se cruza con esas fechas.'
    );

    expect(
      backend.state.blocks
    ).toHaveLength(1);

    expect(
      backend.stateVersion
    ).toBe(61);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('61');

    await expect(
      blockRow(
        page,
        'BLOQUEO EXISTENTE'
      )
    ).toBeVisible();

    await expect(
      blockRow(
        page,
        'BLOQUEO SUPERPUESTO'
      )
    ).toHaveCount(0);

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B5 respeta reserva [llegada,salida): rechaza durante estadía y permite desde salida',
  async({page})=>{
    const today=
      chileToday();

    const arrival=
      addDays(today,3);

    const departure=
      addDays(today,5);

    const backend=
      await installBackend(
        page,
        {
          reservations:[
            {
              id:30,
              arrival_date:
                arrival,

              departure_date:
                departure,

              person_name:
                'RESERVA R5B5',

              role_area:
                'OPERACIONES',

              module:'M1',
              room:'101',
              bed:'C',

              bed_count:1,

              status:
                'CONFIRMADA'
            }
          ]
        }
      );

    await login(
      page,
      backend
    );

    // ----------------------------------------------------------
    // 1. Dentro de la estadía: debe rechazar.
    // ----------------------------------------------------------

    await fillBlock(
      page,
      {
        module:'M1',
        room:'101',
        bed:'C',

        start:
          addDays(today,4),

        end:
          addDays(today,4),

        reason:
          'CONFLICTO RESERVA R5B5'
      }
    );

    await submitBlock(page);

    await expect.poll(
      ()=>
        backend.adds.length
    ).toBe(1);

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'No se puede bloquear: existe una reserva cruzada para RESERVA R5B5.'
    );

    expect(
      backend.state.blocks
    ).toHaveLength(0);

    expect(
      backend.stateVersion
    ).toBe(61);

    // ----------------------------------------------------------
    // 2. Exactamente en departure: la reserva ya no consume cama.
    //    El bloqueo inclusivo de ese día sí puede comenzar.
    // ----------------------------------------------------------

    await page
      .locator(
        '#blockForm input[name="start_date"]'
      )
      .fill(departure);

    await page
      .locator(
        '#blockForm input[name="end_date"]'
      )
      .fill(departure);

    await page
      .locator(
        '#blockForm input[name="reason"]'
      )
      .fill(
        'POST SALIDA R5B5'
      );

    await submitBlock(page);

    await expect.poll(
      ()=>
        backend.adds.length
    ).toBe(2);

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Cama marcada fuera de servicio.'
    );

    expect(
      backend.state.blocks
    ).toHaveLength(1);

    expect(
      backend.state.blocks[0]
    ).toMatchObject({
      module:'M1',
      room:'101',
      bed:'C',
      start_date:
        departure,
      end_date:
        departure,
      status:
        'ACTIVO'
    });

    expect(
      backend.stateVersion
    ).toBe(62);

    const row=
      blockRow(
        page,
        'POST SALIDA R5B5'
      );

    await expect(row)
      .toBeVisible();

    await expect(row)
      .toContainText(
        'ACTIVO'
      );

    expect(
      await capacityAt(
        page,
        departure
      )
    ).toMatchObject({
      base:4,
      blocked:1,
      capacity:3
    });

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);