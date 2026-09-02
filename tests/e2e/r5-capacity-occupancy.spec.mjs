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

function addDays(ds,days){
  const d=new Date(`${ds}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}

function baseState(overrides={}){
  return {
    workers:[],
    inventory:[],
    blocks:[],
    reservations:[],
    movements:[],
    capacities:[],
    snapshots:[],
    imports:[],
    settings:{
      source_file:'r5-capacity-fixture.xlsx',
      last_update:'2026-09-02T05:50:00Z',
      daily_capacity_default:'',
      cost_per_bed_day:'0'
    },
    ...overrides
  };
}

function dailyCapacityFixture(){
  const today=chileToday();

  return baseState({
    workers:[
      {
        id:1,
        rut:'11.111.111-1',
        nombre:'ANA CAPACIDAD',
        empresa:'EMPRESA A',
        turno:'A',
        modulo:'M1',
        habitacion:'101',
        cama:'A',
        sexo:'F',
        residencia:'SANTIAGO'
      },
      {
        id:2,
        rut:'22.222.222-2',
        nombre:'BRUNO CAPACIDAD',
        empresa:'EMPRESA A',
        turno:'A',
        modulo:'M1',
        habitacion:'101',
        cama:'B',
        sexo:'M',
        residencia:'CALAMA'
      },

      // RUT matemáticamente inválido:
      // debe quedar fuera de ocupación canónica.
      {
        id:3,
        rut:'11.111.111-2',
        nombre:'INVALIDO CANONICO',
        empresa:'EMPRESA B',
        turno:'B',
        modulo:'M1',
        habitacion:'102',
        cama:'E',
        sexo:'M',
        residencia:'CALAMA'
      }
    ],

    inventory:[
      {id:1,module:'M1',room:'101',bed:'A'},
      {id:2,module:'M1',room:'101',bed:'B'},
      {id:3,module:'M1',room:'101',bed:'C'},
      {id:4,module:'M1',room:'102',bed:'D'},
      {id:5,module:'M1',room:'102',bed:'E'}
    ],

    blocks:[
      {
        id:1,
        module:'M1',
        room:'102',
        bed:'D',
        start_date:today,
        end_date:today,
        status:'ACTIVO',
        reason:'Mantenimiento R5B2'
      },

      // No pertenece al universo:
      // nunca debe descontar capacidad efectiva.
      {
        id:2,
        module:'M9',
        room:'999',
        bed:'Z',
        start_date:today,
        end_date:today,
        status:'ACTIVO',
        reason:'Bloqueo fantasma'
      }
    ],

    reservations:[
      {
        id:1,
        person_name:'RESERVA R5B2',
        arrival_date:today,
        departure_date:addDays(today,1),
        bed_count:1,
        status:'CONFIRMADA',
        module:'M1',
        room:'101',
        bed:'C'
      }
    ],

    capacities:[
      {
        id:1,
        capacity_date:today,
        capacity:6
      }
    ]
  });
}

function universeFallbackFixture(){
  return baseState({
    workers:[
      {
        id:1,
        rut:'12.345.678-5',
        nombre:'WORKER UNIVERSO',
        empresa:'EMPRESA C',
        turno:'A',
        modulo:'M2',
        habitacion:'201',
        cama:'A'
      },
      {
        id:2,
        rut:'11.111.111-1',
        nombre:'FUERA INVENTARIO',
        empresa:'EMPRESA C',
        turno:'A',
        modulo:'M9',
        habitacion:'999',
        cama:'Z'
      }
    ],

    inventory:[
      {id:1,module:'M2',room:'201',bed:'A'},
      {id:2,module:'M2',room:'201',bed:'B'},
      {id:3,module:'M2',room:'202',bed:'A'},
      {id:4,module:'M2',room:'202',bed:'B'}
    ],

    capacities:[]
  });
}

function exactZeroFixture(){
  const today=chileToday();

  return baseState({
    inventory:[
      {id:1,module:'M3',room:'301',bed:'A'},
      {id:2,module:'M3',room:'301',bed:'B'},
      {id:3,module:'M3',room:'302',bed:'A'},
      {id:4,module:'M3',room:'302',bed:'B'}
    ],

    capacities:[
      {
        id:1,
        capacity_date:today,
        capacity:0
      }
    ]
  });
}

function unavailableFixture(){
  return baseState({
    workers:[],
    inventory:[],
    capacities:[]
  });
}

async function installBackend(page,state){
  const calls=[];
  const unexpected=[];

  const cors={
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'authorization,content-type'
  };

  const fulfillJson=(route,payload,status=200)=>route.fulfill({
    status,
    contentType:'application/json',
    headers:cors,
    body:JSON.stringify(payload)
  });

  await page.route('**/functions/v1/**',async route=>{
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
      url:url.toString()
    });

    if(method==='OPTIONS'){
      return route.fulfill({
        status:204,
        headers:cors,
        body:''
      });
    }

    if(
      service==='campamento-web-api' &&
      action==='admin_login' &&
      method==='POST'
    ){
      return fulfillJson(route,{
        ok:true,
        token:'r5b2-e2e-token'
      });
    }

    if(
      service==='campamento-web-api' &&
      action==='consults' &&
      method==='GET'
    ){
      return fulfillJson(route,{
        ok:true,
        data:[]
      });
    }

    if(
      service==='campamento-web-api' &&
      action==='imports' &&
      method==='GET'
    ){
      return fulfillJson(route,{
        ok:true,
        data:[]
      });
    }

    if(
      service==='campamento-v560-safe' &&
      action==='advanced_state' &&
      method==='GET'
    ){
      return fulfillJson(route,{
        ok:true,
        state_version:'21',
        data:JSON.parse(JSON.stringify(state))
      });
    }

    if(
      service==='campamento-v560-safe' &&
      action==='snapshot_today' &&
      method==='POST'
    ){
      return fulfillJson(route,{
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
      return fulfillJson(route,{
        ok:true,
        status:'healthy',
        database:true
      });
    }

    if(
      service==='campamento-control-api' &&
      action==='state' &&
      method==='GET'
    ){
      return fulfillJson(route,{
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
      return fulfillJson(route,{
        ok:true,
        data:{}
      });
    }

    if(
      service==='campamento-workforce-api' &&
      method==='GET'
    ){
      return fulfillJson(route,{
        ok:true,
        rules:{}
      });
    }

    unexpected.push({
      service,
      action,
      method,
      url:url.toString()
    });

    return fulfillJson(
      route,
      {
        ok:false,
        error:`Unexpected R5B2 request: ${service}/${action}/${method}`
      },
      503
    );
  });

  return {
    calls,
    unexpected
  };
}

async function login(page,state,view='overview'){
  const backend=await installBackend(page,state);

  await page.goto(`/admin.html#${view}`);

  await expect(
    page.getByRole(
      'heading',
      {name:'Acceso administración'}
    )
  ).toBeVisible();

  await page.locator('#adminPassword').fill('R5B2-E2E-PASSWORD');

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
    page.locator('#syncBadge')
  ).toHaveText('Actualizado');

  await expect.poll(
    ()=>page.evaluate(
      ()=>Boolean(
        typeof A!=='undefined' &&
        A.data
      )
    )
  ).toBe(true);

  return backend;
}

async function openView(page,name){
  const button=page.locator(`[data-view="${name}"]`);

  const layout=await page.evaluate(
    ()=>document.body?.dataset?.adminLayout||'desktop'
  );

  if(layout!=='desktop'){
    const sidebar=page.locator('#sidebar');
    const menu=page.locator('#menuBtn');

    const sidebarOpen=await sidebar.evaluate(
      element=>element.classList.contains('open')
    );

    if(!sidebarOpen){
      await expect(menu).toBeVisible();
      await menu.click();

      await expect(sidebar).toHaveClass(/open/);
    }
  }

  await button.scrollIntoViewIfNeeded();
  await button.click();

  await expect(
    page.locator(`#view-${name}`)
  ).toHaveClass(/active/);

  await expect(
    page.locator(`[data-view="${name}"]`)
  ).toHaveClass(/active/);
}

async function expectHeroKpi(
  page,
  label,
  value,
  detail=null
){
  const card=page
    .locator('#view-overview .dc-primary .dc-hero-kpi')
    .filter({hasText:label})
    .first();

  await expect(card).toBeVisible();

  await expect(
    card.locator('span')
  ).toHaveText(label);

  await expect(
    card.locator('strong')
  ).toHaveText(String(value));

  if(detail!==null){
    await expect(
      card.locator('small')
    ).toContainText(detail);
  }
}

function runtimeAnalytics(){
  const an=analytics(A.data);

  return {
    capacityAvailable:an.capacityAvailable,
    capacitySource:an.capacitySource,
    capacityCode:an.capacityCode,
    operationalUniverseCount:
      an.operationalUniverseCount,

    baseCapacity:an.baseCapacity,
    blockedToday:an.blockedToday,
    effectiveCapacity:an.effectiveCapacity,

    occupied:an.occupied,
    reservedToday:an.reservedToday,
    committed:an.committed,
    free:an.free,

    occupancyPct:an.occupancyPct,
    committedPct:an.committedPct,

    status:an.status
  };
}

test(
  'R5B2 daily_capacity prevalece, bloqueo operativo descuenta y ocupacion es canonica',
  async({page})=>{
    const backend=await login(
      page,
      dailyCapacityFixture()
    );

    const an=await page.evaluate(runtimeAnalytics);

    expect(an).toMatchObject({
      capacityAvailable:true,
      capacitySource:'DAILY_CAPACITY',
      capacityCode:null,
      operationalUniverseCount:5,

      baseCapacity:6,
      blockedToday:1,
      effectiveCapacity:5,

      occupied:2,
      reservedToday:1,
      committed:3,
      free:2,

      occupancyPct:40,
      committedPct:60
    });

    await expect(
      page.locator('#view-overview .dc-primary')
    ).toBeVisible();

    await expectHeroKpi(
      page,
      'Ocupación',
      '2 / 5',
      '40,0% física'
    );

    await expectHeroKpi(
      page,
      'Comprometidas',
      '3 / 5',
      '60,0% capacidad'
    );

    await expectHeroKpi(
      page,
      'Libres efectivas',
      '2',
      '1 fuera de servicio'
    );

    await openView(page,'control');

    await expect(
      page.locator(
        '#view-control .cc-bed-map .cc-bed-btn.occupied'
      )
    ).toHaveCount(2);

    await expect(
      page.locator(
        '#view-control .cc-bed-map .cc-bed-btn.reserved'
      )
    ).toHaveCount(1);

    await expect(
      page.locator(
        '#view-control .cc-bed-map .cc-bed-btn.blocked'
      )
    ).toHaveCount(1);

    await expect(
      page.locator(
        '#view-control .cc-bed-map .cc-bed-btn.free'
      )
    ).toHaveCount(1);

    await expect(
      page.locator('#view-control')
    ).toContainText('Camas módulo');

    await expect(
      page.locator('#view-control')
    ).toContainText('Libres');

    expect(backend.unexpected).toEqual([]);

    const forbidden=backend.calls.filter(
      call=>
        call.method==='POST' &&
        ![
          'admin_login',
          'snapshot_today',
          'audit'
        ].includes(call.action)
    );

    expect(forbidden).toEqual([]);
  }
);

test(
  'R5B2 usa universo operacional cuando no existe daily_capacity',
  async({page})=>{
    const backend=await login(
      page,
      universeFallbackFixture()
    );

    const an=await page.evaluate(runtimeAnalytics);

    expect(an).toMatchObject({
      capacityAvailable:true,
      capacitySource:'OPERATIONAL_UNIVERSE',
      capacityCode:null,
      operationalUniverseCount:4,

      baseCapacity:4,
      blockedToday:0,
      effectiveCapacity:4,

      occupied:1,
      reservedToday:0,
      committed:1,
      free:3,

      occupancyPct:25,
      committedPct:25
    });

    await expectHeroKpi(
      page,
      'Ocupación',
      '1 / 4',
      '25,0% física'
    );

    await expectHeroKpi(
      page,
      'Comprometidas',
      '1 / 4',
      '25,0% capacidad'
    );

    await expectHeroKpi(
      page,
      'Libres efectivas',
      '3',
      '0 fuera de servicio'
    );

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B2 daily_capacity exacta cero no cae al universo operacional',
  async({page})=>{
    const backend=await login(
      page,
      exactZeroFixture()
    );

    const an=await page.evaluate(runtimeAnalytics);

    expect(an).toMatchObject({
      capacityAvailable:true,
      capacitySource:'DAILY_CAPACITY',
      capacityCode:null,
      operationalUniverseCount:4,

      baseCapacity:0,
      blockedToday:0,
      effectiveCapacity:0,

      occupied:0,
      reservedToday:0,
      committed:0,
      free:0,

      occupancyPct:0,
      committedPct:0
    });

    await expectHeroKpi(
      page,
      'Ocupación',
      '0 / 0',
      '0,0% física'
    );

    await expectHeroKpi(
      page,
      'Comprometidas',
      '0 / 0',
      '0,0% capacidad'
    );

    await expectHeroKpi(
      page,
      'Libres efectivas',
      '0',
      '0 fuera de servicio'
    );

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B2 sin fuente de capacidad entra fail-closed y no fabrica metricas',
  async({page})=>{
    const backend=await login(
      page,
      unavailableFixture()
    );

    const an=await page.evaluate(runtimeAnalytics);

    expect(an.capacityAvailable).toBe(false);
    expect(an.capacitySource).toBe(null);
    expect(an.capacityCode).toBe('CAPACITY_UNAVAILABLE');
    expect(an.operationalUniverseCount).toBe(0);

    expect(an.baseCapacity).toBe(null);
    expect(an.blockedToday).toBe(null);
    expect(an.effectiveCapacity).toBe(null);
    expect(an.free).toBe(null);
    expect(an.occupancyPct).toBe(null);
    expect(an.committedPct).toBe(null);
    expect(an.status).toBe('unavailable');

    await openView(page,'management');

    await expect(
      page.locator('#view-management')
    ).toContainText('CAPACIDAD INCOMPLETA');

    await expect(
      page.locator('#view-management')
    ).toContainText('CAPACIDAD NO DISPONIBLE');

    await expect(
      page.locator('#view-management')
    ).toContainText('porcentaje no disponible');

    await openView(page,'planning');

    await expect(
      page.locator('#view-planning')
    ).toContainText('CAPACIDAD NO DISPONIBLE');

    await expect(
      page.locator('#view-planning')
    ).toContainText(
      'No se fabrican libres, porcentajes ni deficit'
    );

    expect(backend.unexpected).toEqual([]);
  }
);