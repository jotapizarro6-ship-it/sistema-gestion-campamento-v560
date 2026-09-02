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
        .filter(
          x=>x.type!=='literal'
        )
        .map(
          x=>[
            x.type,
            x.value
          ]
        )
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

function makeState(movements=[]){
  const today=
    chileToday();

  return {
    workers:[
      {
        id:1,
        rut:'12.345.678-5',
        nombre:'WORKER R5B4',
        empresa:'EMPRESA R5',
        turno:'A',
        modulo:'M1',
        habitacion:'101',
        cama:'A'
      }
    ],

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
        room:'102',
        bed:'A'
      },
      {
        id:4,
        module:'M1',
        room:'102',
        bed:'B'
      }
    ],

    blocks:[],
    reservations:[],

    movements:
      clone(movements),

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
      source_file:
        'r5-movements.xlsx',

      last_update:
        '2026-09-02T06:25:00Z',

      cost_per_bed_day:'0'
    }
  };
}

async function installBackend(
  page,
  initialMovements=[]
){
  let state=
    makeState(
      initialMovements
    );

  let stateVersion=51;
  let nextId=100;

  const adds=[];
  const statuses=[];
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
      // Login / read support
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
              'r5b4-e2e-token'
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
      // Safe state
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
      // New movement
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='add_movement' &&
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

        const movementDate=
          String(
            body.movement_date||
            ''
          );

        const movementType=
          String(
            body.movement_type||
            ''
          ).toUpperCase();

        const peopleCount=
          Number(
            body.people_count
          );

        if(!movementDate){
          return json(
            route,
            {
              ok:false,
              error:
                'Indica una fecha válida para el movimiento.'
            },
            400
          );
        }

        if(
          ![
            'SUBIDA',
            'BAJADA'
          ].includes(
            movementType
          )
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'El tipo de movimiento no es válido.'
            },
            400
          );
        }

        if(
          !Number.isInteger(
            peopleCount
          )||
          peopleCount<0||
          peopleCount>10000
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'La cantidad de personas debe estar entre 0 y 10.000.'
            },
            400
          );
        }

        const row={
          id:nextId++,

          movement_date:
            movementDate,

          movement_type:
            movementType,

          people_count:
            peopleCount,

          shift:
            String(
              body.shift||
              ''
            ),

          company:
            String(
              body.company||
              ''
            ),

          bus_time:
            String(
              body.bus_time||
              ''
            ),

          bus:
            String(
              body.bus||
              ''
            ),

          notes:
            String(
              body.notes||
              ''
            ),

          lifecycle_status:
            'PROGRAMADO',

          executed_at:null,
          cancelled_at:null
        };

        state.movements.push(row);

        stateVersion++;

        return json(
          route,
          {
            ok:true,
            data:
              clone(row)
          }
        );
      }

      // --------------------------------------------------------
      // Atomic terminal transition mock
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='movement_status' &&
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

        statuses.push(call);

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
          state.movements.find(
            movement=>
              Number(
                movement.id
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
                'Movimiento no encontrado.'
            },
            404
          );
        }

        if(
          String(
            row.lifecycle_status
          ).toUpperCase()!==
          'PROGRAMADO'
        ){
          return json(
            route,
            {
              ok:false,

              code:
                'MOVEMENT_TERMINAL',

              error:
                'Sólo un movimiento PROGRAMADO puede cambiar de estado.'
            },
            409
          );
        }

        const next=
          String(
            body.status||
            ''
          ).toUpperCase();

        if(
          ![
            'EJECUTADO',
            'CANCELADO'
          ].includes(next)
        ){
          return json(
            route,
            {
              ok:false,
              error:
                'Estado de movimiento no válido.'
            },
            400
          );
        }

        row.lifecycle_status=
          next;

        if(next==='EJECUTADO'){
          row.executed_at=
            '2026-09-02T06:25:00.000Z';

          row.cancelled_at=
            null;
        }else{
          row.executed_at=
            null;

          row.cancelled_at=
            '2026-09-02T06:25:00.000Z';
        }

        stateVersion++;

        return json(
          route,
          {
            ok:true,
            data:
              clone(row)
          }
        );
      }

      // --------------------------------------------------------
      // Supporting progressive layers
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
            `Unexpected R5B4 request: `+
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

    get statuses(){
      return statuses;
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
    '/admin.html#movements'
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
      'R5B4-E2E-PASSWORD'
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
      '#view-movements'
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
      '#movementForm'
    )
  ).toBeVisible();
}

function movementRow(
  page,
  text
){
  return page
    .locator(
      '#view-movements tbody tr'
    )
    .filter({
      hasText:text
    })
    .first();
}

test(
  'R5B4 nuevo movimiento queda PROGRAMADO y entra al forecast futuro',
  async({page})=>{
    const backend=
      await installBackend(
        page
      );

    await login(
      page,
      backend
    );

    const future=
      addDays(
        chileToday(),
        2
      );

    await page
      .locator(
        '#movementForm input[name="movement_date"]'
      )
      .fill(future);

    await page
      .locator(
        '#movementForm select[name="movement_type"]'
      )
      .selectOption(
        'SUBIDA'
      );

    await page
      .locator(
        '#movementForm input[name="people_count"]'
      )
      .fill('3');

    await page
      .locator(
        '#movementForm input[name="shift"]'
      )
      .fill('A');

    await page
      .locator(
        '#movementForm input[name="company"]'
      )
      .fill(
        'EMPRESA R5'
      );

    await page
      .locator(
        '#movementForm input[name="bus_time"]'
      )
      .fill('08:30');

    await page
      .locator(
        '#movementForm input[name="bus"]'
      )
      .fill(
        'BUS R5B4'
      );

    await page
      .locator(
        '#movementForm input[name="notes"]'
      )
      .fill(
        'PROGRAMADO R5B4'
      );

    await page
      .locator(
        '#movementForm'
      )
      .getByRole(
        'button',
        {
          name:
            'Registrar movimiento'
        }
      )
      .click();

    await expect.poll(
      ()=>
        backend.adds.length
    ).toBe(1);

    expect(
      backend.adds[0]
    ).toMatchObject({
      auth:
        'Bearer r5b4-e2e-token',

      stateVersion:'51',

      body:{
        movement_date:
          future,

        movement_type:
          'SUBIDA',

        people_count:3,

        shift:'A',

        company:
          'EMPRESA R5',

        bus_time:
          '08:30',

        bus:
          'BUS R5B4',

        notes:
          'PROGRAMADO R5B4'
      }
    });

    expect(
      backend
        .state
        .movements[0]
        .lifecycle_status
    ).toBe(
      'PROGRAMADO'
    );

    expect(
      backend.stateVersion
    ).toBe(52);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('52');

    const row=
      movementRow(
        page,
        'BUS R5B4'
      );

    await expect(row)
      .toContainText(
        'PROGRAMADO'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Marcar ejecutado'
        }
      )
    ).toBeVisible();

    await expect(
      row.getByRole(
        'button',
        {
          name:'Cancelar'
        }
      )
    ).toBeVisible();

    const projection=
      await page.evaluate(
        date=>({
          projected:
            projectedPhysical(
              date,
              A.data
            ),

          totals:
            movementTotals(
              date,
              A.data
            )
        }),
        future
      );

    expect(
      projection.projected
    ).toBe(4);

    expect(
      projection.totals
    ).toEqual({
      SUBIDA:3,
      BAJADA:0
    });

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B4 CANCELADO deja de afectar forecast y queda terminal',
  async({page})=>{
    const future=
      addDays(
        chileToday(),
        3
      );

    const backend=
      await installBackend(
        page,
        [
          {
            id:20,
            movement_date:future,
            movement_type:'SUBIDA',
            people_count:4,
            shift:'A',
            company:'EMPRESA R5',
            bus_time:'09:00',
            bus:'BUS CANCEL',
            notes:'',
            lifecycle_status:
              'PROGRAMADO',
            executed_at:null,
            cancelled_at:null
          }
        ]
      );

    await login(
      page,
      backend
    );

    expect(
      await page.evaluate(
        date=>
          projectedPhysical(
            date,
            A.data
          ),
        future
      )
    ).toBe(5);

    let row=
      movementRow(
        page,
        'BUS CANCEL'
      );

    await row
      .getByRole(
        'button',
        {
          name:'Cancelar'
        }
      )
      .click();

    await expect.poll(
      ()=>
        backend.statuses.length
    ).toBe(1);

    expect(
      backend.statuses[0]
    ).toMatchObject({
      auth:
        'Bearer r5b4-e2e-token',

      stateVersion:
        '51',

      body:{
        id:20,
        status:
          'CANCELADO'
      }
    });

    expect(
      backend
        .state
        .movements[0]
        .lifecycle_status
    ).toBe(
      'CANCELADO'
    );

    expect(
      backend
        .state
        .movements[0]
        .cancelled_at
    ).not.toBeNull();

    expect(
      backend.stateVersion
    ).toBe(52);

    row=
      movementRow(
        page,
        'BUS CANCEL'
      );

    await expect(row)
      .toContainText(
        'CANCELADO'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:'Cancelar'
        }
      )
    ).toHaveCount(0);

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Marcar ejecutado'
        }
      )
    ).toHaveCount(0);

    expect(
      await page.evaluate(
        date=>
          projectedPhysical(
            date,
            A.data
          ),
        future
      )
    ).toBe(1);

    expect(
      await page.evaluate(
        date=>
          movementTotals(
            date,
            A.data
          ),
        future
      )
    ).toEqual({
      SUBIDA:0,
      BAJADA:0
    });

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B4 EJECUTADO queda terminal y deja de representar plan futuro',
  async({page})=>{
    const future=
      addDays(
        chileToday(),
        4
      );

    const backend=
      await installBackend(
        page,
        [
          {
            id:30,
            movement_date:future,
            movement_type:'BAJADA',
            people_count:1,
            shift:'B',
            company:'EMPRESA R5',
            bus_time:'18:00',
            bus:'BUS EXEC',
            notes:'',
            lifecycle_status:
              'PROGRAMADO',
            executed_at:null,
            cancelled_at:null
          }
        ]
      );

    await login(
      page,
      backend
    );

    expect(
      await page.evaluate(
        date=>
          projectedPhysical(
            date,
            A.data
          ),
        future
      )
    ).toBe(0);

    let row=
      movementRow(
        page,
        'BUS EXEC'
      );

    await row
      .getByRole(
        'button',
        {
          name:
            'Marcar ejecutado'
        }
      )
      .click();

    await expect.poll(
      ()=>
        backend.statuses.length
    ).toBe(1);

    expect(
      backend.statuses[0]
    ).toMatchObject({
      stateVersion:'51',

      body:{
        id:30,
        status:
          'EJECUTADO'
      }
    });

    expect(
      backend
        .state
        .movements[0]
        .lifecycle_status
    ).toBe(
      'EJECUTADO'
    );

    expect(
      backend
        .state
        .movements[0]
        .executed_at
    ).not.toBeNull();

    row=
      movementRow(
        page,
        'BUS EXEC'
      );

    await expect(row)
      .toContainText(
        'EJECUTADO'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Marcar ejecutado'
        }
      )
    ).toHaveCount(0);

    await expect(
      row.getByRole(
        'button',
        {
          name:'Cancelar'
        }
      )
    ).toHaveCount(0);

    expect(
      await page.evaluate(
        date=>
          projectedPhysical(
            date,
            A.data
          ),
        future
      )
    ).toBe(1);

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B4 LEGACY_UNRESOLVED se preserva y no contamina forecast futuro',
  async({page})=>{
    const future=
      addDays(
        chileToday(),
        5
      );

    const backend=
      await installBackend(
        page,
        [
          {
            id:40,
            movement_date:future,
            movement_type:'SUBIDA',
            people_count:9,
            shift:'LEGACY',
            company:'HISTORICO',
            bus_time:'07:00',
            bus:'BUS LEGACY',
            notes:'',
            lifecycle_status:
              'LEGACY_UNRESOLVED',
            executed_at:null,
            cancelled_at:null
          }
        ]
      );

    await login(
      page,
      backend
    );

    const row=
      movementRow(
        page,
        'BUS LEGACY'
      );

    await expect(row)
      .toContainText(
        'LEGACY_UNRESOLVED'
      );

    await expect(
      row.getByRole(
        'button',
        {
          name:
            'Marcar ejecutado'
        }
      )
    ).toHaveCount(0);

    await expect(
      row.getByRole(
        'button',
        {
          name:'Cancelar'
        }
      )
    ).toHaveCount(0);

    expect(
      await page.evaluate(
        date=>
          projectedPhysical(
            date,
            A.data
          ),
        future
      )
    ).toBe(1);

    expect(
      await page.evaluate(
        date=>
          movementTotals(
            date,
            A.data
          ),
        future
      )
    ).toEqual({
      SUBIDA:0,
      BAJADA:0
    });

    expect(
      backend.statuses
    ).toHaveLength(0);

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);