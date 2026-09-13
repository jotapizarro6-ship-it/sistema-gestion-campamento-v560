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

      // RUT matemÃ¡ticamente invÃ¡lido:
      // debe quedar fuera de ocupaciÃ³n canÃ³nica.
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

    if(
      service==='campamento-recovery-api' &&
      action==='status' &&
      method==='GET'
    ){
      return fulfillJson(route,{
        ok:true,
        data:{
          tests:[]
        }
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
    page.locator('#adminPassword')
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

const UI_V3_VIEWPORTS = [
  {name:'desktop',width:1440,height:900},
  {name:'tablet-landscape',width:1024,height:768},
  {name:'tablet-portrait',width:768,height:1024},
  {name:'phone-430',width:430,height:900},
  {name:'phone-390',width:390,height:844},
  {name:'phone-375',width:375,height:812},
  {name:'phone-340',width:340,height:760},
  {name:'phone-320',width:320,height:720}
];

async function closeDetailDialog(page){
  await page.evaluate(()=>{
    const dialog=document.querySelector('#detailDialog');

    if(
      dialog &&
      typeof dialog.close==='function' &&
      dialog.open
    ){
      dialog.close();
    }
  });
}

test(
  'UI V3 dashboard gerencial responde sin overflow en PC tablet y smartphone',
  async({page},testInfo)=>{

    test.skip(
      testInfo.project.name!=='chromium',
      'La matriz exacta de viewports se ejecuta en Chromium desktop.'
    );

    const pageErrors=[];
    const failedRequests=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    page.on(
      'requestfailed',
      request=>failedRequests.push({
        url:request.url(),
        failure:
          request.failure()?.errorText||''
      })
    );

    const backend=await login(
      page,
      dailyCapacityFixture()
    );

    await openView(
      page,
      'management'
    );

    const management=
      page.locator('#view-management');

    await expect(
      management.locator('.v3-management')
    ).toBeVisible();

    const managementText =
      await management.innerText();

    expect(
      managementText.includes('\\u00b7')
    ).toBe(false);


    for(const viewport of UI_V3_VIEWPORTS){

      await page.setViewportSize({
        width:viewport.width,
        height:viewport.height
      });

      await page.waitForTimeout(180);

      await expect(
        management.locator('.v3-management')
      ).toBeVisible();

      const report=await page.evaluate(
        ({width,height})=>{

          const doc=document.documentElement;
          const view=
            document.querySelector(
              '#view-management'
            );

          const v3=
            view?.querySelector(
              '.v3-management'
            );

          const visible=
            Boolean(
              v3 &&
              getComputedStyle(v3).display!=='none'
            );

          const kpis=[
            ...view.querySelectorAll(
              '.v3-kpi'
            )
          ].map(
            el=>el.textContent.trim()
          );

          const companies=[
            ...view.querySelectorAll(
              '.v3-company-row'
            )
          ];

          const modules=[
            ...view.querySelectorAll(
              '.v3-module-row'
            )
          ];

          const days=[
            ...view.querySelectorAll(
              '.v3-day'
            )
          ];

          return {
            width,
            height,
            visible,
            kpiCount:kpis.length,
            kpis,
            companies:companies.length,
            modules:modules.length,
            days:days.length,

            hasSummary:
              Boolean(
                view.querySelector(
                  '.v3-summary'
                )
              ),

            hasFocus:
              [...view.querySelectorAll(
                '.v3-card h3'
              )].some(
                x=>
                  x.textContent
                    .toLowerCase()
                    .includes(
                      'foco ejecutivo'
                    )
              ),

            hasCompanyPanel:
              [...view.querySelectorAll(
                '.v3-card h3'
              )].some(
                x=>
                  x.textContent
                    .toLowerCase()
                    .includes(
                      'empresas en campamento'
                    )
              ),

            hasModulePanel:
              [...view.querySelectorAll(
                '.v3-card h3'
              )].some(
                x=>
                  x.textContent
                    .toLowerCase()
                    .includes(
                      'personal alojado por m\u00f3dulo'
                    )
              ),

            hasForecast:
              [...view.querySelectorAll(
                '.v3-card h3'
              )].some(
                x=>
                  x.textContent
                    .toLowerCase()
                    .includes(
                      'proyeccion'
                    )
              ),

            hasTrace:
              Boolean(
                view.querySelector(
                  '#v3TraceInput'
                )
              ),

            documentOverflow:
              Math.max(
                0,
                doc.scrollWidth-
                doc.clientWidth
              ),

            viewOverflow:
              Math.max(
                0,
                view.scrollWidth-
                view.clientWidth
              )
          };
        },
        viewport
      );

      console.log(
        'UI V3 VIEWPORT',
        viewport.name,
        JSON.stringify(report)
      );

      expect(report.visible).toBe(true);

      // Contracto principal:
      // exactamente 8 KPI ejecutivos.
      expect(report.kpiCount).toBe(8);

      expect(
        report.kpis.some(
          x=>x.includes('Camas ocupadas')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Camas libres')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .includes('Ocupacion fisica')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Reservadas hoy')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Fuera de servicio')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Movimientos hoy')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Empresas alojando')
        )
      ).toBe(true);

      expect(
        report.kpis.some(
          x=>x.includes('Personal alojando')
        )
      ).toBe(true);

      expect(report.hasSummary).toBe(true);
      expect(report.hasFocus).toBe(true);
      expect(report.hasCompanyPanel).toBe(true);
      expect(report.hasModulePanel).toBe(true);
      expect(report.hasForecast).toBe(true);
      expect(report.hasTrace).toBe(true);

      expect(report.companies)
        .toBeGreaterThan(0);

      expect(report.modules)
        .toBeGreaterThan(0);

      expect(report.days)
        .toBeGreaterThan(0);

      // No debe existir scroll horizontal global.
      expect(
        report.documentOverflow
      ).toBeLessThanOrEqual(1);

      expect(
        report.viewOverflow
      ).toBeLessThanOrEqual(1);
    }

    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);


test(
  'UI V3 empresas MOD MOI modulos forecast y trazabilidad son interactivos',
  async({page})=>{

    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const backend=await login(
      page,
      dailyCapacityFixture()
    );

    await openView(
      page,
      'management'
    );

    const view=
      page.locator('#view-management');

    const dashboard=
      view.locator('.v3-management');

    await expect(dashboard).toBeVisible();

    // --------------------------------------------------------
    // 8 KPI
    // --------------------------------------------------------

    await expect(
      dashboard.locator('.v3-kpi')
    ).toHaveCount(8);

    // --------------------------------------------------------
    // EMPRESA
    // --------------------------------------------------------

    const company=
      dashboard
        .locator('.v3-company-row')
        .first();

    await expect(company).toBeVisible();

    const companyText=
      await company.innerText();

    expect(companyText)
      .toContain('alojando');

    expect(companyText)
      .toContain('MOD');

    expect(companyText)
      .toContain('MOI');

    // Debe informar la proporcion de su dotacion.
    expect(
      companyText
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .includes(
          'dotacion registrada'
        ) ||
      companyText
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .includes(
          'proporcion no disponible'
        )
    ).toBe(true);

    // Boton nativo = acceso teclado.
    await company.focus();

    await expect(company)
      .toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      page.locator('#detailDialog')
    ).toBeVisible();

    await expect(
      page.locator('#detailDialog')
    ).toContainText('Empresa');

    await closeDetailDialog(page);

    // --------------------------------------------------------
    // MODULO
    // --------------------------------------------------------

    const module=
      dashboard
        .locator('.v3-module-row')
        .first();

    await expect(module).toBeVisible();

    const moduleText=
      await module.innerText();

    expect(moduleText)
      .toContain('persona');

    await module.focus();
    await expect(module).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      page.locator('#detailDialog')
    ).toBeVisible();

    await expect(
      page.locator('#detailDialog')
    ).toContainText(/M[o\u00f3]dulo/i);

    await closeDetailDialog(page);

    // --------------------------------------------------------
    // FORECAST
    // --------------------------------------------------------

    const day=
      dashboard
        .locator('.v3-day')
        .first();

    await expect(day).toBeVisible();

    await day.focus();
    await expect(day).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      page.locator('#detailDialog')
    ).toBeVisible();

    await expect(
      page.locator('#detailDialog')
    ).toContainText('Proyeccion');

    await closeDetailDialog(page);

    // --------------------------------------------------------
    // TRAZABILIDAD TRABAJADOR -> CAMA
    // --------------------------------------------------------

    const worker=
      await page.evaluate(()=>{

        const rows=
          (
            typeof A!=='undefined' &&
            A.data?.workers
          )
            ? A.data.workers
            : [];

        const w=
          rows.find(
            x=>
              String(x.rut||'').trim() &&
              String(x.modulo||'').trim() &&
              String(x.habitacion||'').trim() &&
              String(x.cama||'').trim()
          );

        if(!w)return null;

        return {
          rut:String(w.rut||''),
          nombre:String(w.nombre||''),
          empresa:String(w.empresa||''),
          modulo:String(w.modulo||''),
          habitacion:String(
            w.habitacion||''
          ),
          cama:String(w.cama||'')
        };
      });

    expect(worker).not.toBeNull();

    const trace=
      dashboard.locator(
        '#v3TraceInput'
      );

    await trace.fill(worker.rut);

    await expect(
      dashboard.locator(
        '.v3-trace-card'
      ).first()
    ).toContainText(
      worker.nombre
    );

    await expect(
      dashboard.locator(
        '.v3-trace-card'
      ).first()
    ).toContainText(
      `Cama ${worker.cama}`
    );

    // --------------------------------------------------------
    // TRAZABILIDAD CAMA -> TRABAJADOR
    // --------------------------------------------------------

    const bedQuery=[
      worker.modulo,
      worker.habitacion,
      worker.cama
    ].join(' ');

    await trace.fill(bedQuery);

    await expect(
      dashboard.locator(
        '.v3-trace-card'
      ).first()
    ).toContainText(
      worker.nombre
    );

    // --------------------------------------------------------
    // DETALLE AVANZADO HEREDADO
    // --------------------------------------------------------

    const legacy=
      view.locator(
        'details.dc-legacy-details'
      );

    await expect(legacy).toBeVisible();

    await legacy.locator('summary').click();

    await expect(legacy)
      .toHaveAttribute('open','');

    // --------------------------------------------------------
    // NAVEGACION HACIA ALOJAMIENTO
    // --------------------------------------------------------

    await dashboard
      .locator(
        '[data-v3-goto="control"]'
      )
      .click();

    await expect(
      page.locator('#view-control')
    ).toBeVisible();

    await openView(
      page,
      'management'
    );

    await expect(
      page.locator(
        '#view-management .v3-management'
      )
    ).toBeVisible();

    // --------------------------------------------------------
    // NAVEGACION HACIA PLANIFICACION
    // --------------------------------------------------------

    await page
      .locator(
        '#view-management [data-v3-goto="planning"]'
      )
      .click();

    await expect(
      page.locator('#view-planning')
    ).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);



test(
  'UI V3 A3.1 filtros capacidad movimientos y puente al mapa conservan contratos',
  async({page})=>{
    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const state=dailyCapacityFixture();

    // --------------------------------------------------------
    // Test-only dimensional split.
    // Keeps total occupied/capacity unchanged while providing
    // two companies, shifts and modules for real filter checks.
    // --------------------------------------------------------

    const bruno=
      state.workers.find(
        worker=>
          worker.nombre==='BRUNO CAPACIDAD'
      );

    expect(bruno).toBeTruthy();

    bruno.empresa='EMPRESA B';
    bruno.turno='B';
    bruno.modulo='M2';
    bruno.habitacion='201';
    bruno.cama='A';

    const brunoBed=
      state.inventory.find(
        bed=>
          bed.module==='M1' &&
          bed.room==='101' &&
          bed.bed==='B'
      );

    expect(brunoBed).toBeTruthy();

    brunoBed.module='M2';
    brunoBed.room='201';
    brunoBed.bed='A';

    const backend=await login(
      page,
      state
    );

    await openView(
      page,
      'management'
    );

    const view=
      page.locator('#view-management');

    const dashboard=
      view.locator('.v3-management');

    await expect(
      dashboard
    ).toBeVisible();

    // --------------------------------------------------------
    // FILTER BAR / DATE
    // --------------------------------------------------------

    const date=
      dashboard.locator('#v3FilterDate');

    const company=
      dashboard.locator('#v3FilterCompany');

    const shift=
      dashboard.locator('#v3FilterShift');

    const module=
      dashboard.locator('#v3FilterModule');

    const reset=
      dashboard.locator(
        '[data-v3-reset-filters]'
      );

    const scope=
      dashboard.locator(
        '[data-v3-scope]'
      );

    await expect(date).toBeVisible();
    await expect(company).toBeVisible();
    await expect(shift).toBeVisible();
    await expect(module).toBeVisible();

    await expect(
      date
    ).toHaveAttribute(
      'readonly',
      ''
    );

    await expect(
      date
    ).toHaveValue(
      chileToday()
    );

    await expect(scope).toContainText('2');

    // --------------------------------------------------------
    // GLOBAL KPI MUST NOT CHANGE WITH EXPLORATION FILTERS
    // --------------------------------------------------------

    const initialKpis=
      await dashboard
        .locator('.v3-kpi')
        .allInnerTexts();

    expect(initialKpis).toHaveLength(8);

    // --------------------------------------------------------
    // COMPANY FILTER
    // --------------------------------------------------------

    await company.selectOption('EMPRESA A');

    await expect(scope).toContainText('1');

    await expect(
      dashboard.locator('.v3-company-row')
    ).toHaveCount(1);

    await expect(
      dashboard.locator('.v3-company-row').first()
    ).toContainText('EMPRESA A');

    expect(
      await dashboard
        .locator('.v3-kpi')
        .allInnerTexts()
    ).toEqual(initialKpis);

    await reset.click();

    await expect(scope).toContainText('2');

    // --------------------------------------------------------
    // SHIFT FILTER
    // --------------------------------------------------------

    await shift.selectOption('B');

    await expect(scope).toContainText('1');

    expect(
      await dashboard
        .locator('.v3-kpi')
        .allInnerTexts()
    ).toEqual(initialKpis);

    await reset.click();

    await expect(scope).toContainText('2');

    // --------------------------------------------------------
    // MODULE FILTER
    // --------------------------------------------------------

    await module.selectOption('M2');

    await expect(scope).toContainText('1');

    await expect(
      dashboard.locator('.v3-module-row')
    ).toHaveCount(1);

    await expect(
      dashboard.locator('.v3-module-row').first()
    ).toContainText('M2');

    expect(
      await dashboard
        .locator('.v3-kpi')
        .allInnerTexts()
    ).toEqual(initialKpis);

    // --------------------------------------------------------
    // CAPACITY V1 COMPACT CARD
    // --------------------------------------------------------

    const capacityCard=
      dashboard
        .locator('.v3-ops-card')
        .filter({
          hasText:/Capacidad y ocupaci[o\u00f3]n/i
        })
        .first();

    await expect(capacityCard).toBeVisible();

    await expect(
      capacityCard
    ).toContainText('Capacidad efectiva');

    await expect(
      capacityCard
    ).toContainText('5');

    await expect(
      capacityCard
    ).toContainText('Ocupadas');

    await expect(
      capacityCard
    ).toContainText('2');

    await expect(
      capacityCard
    ).toContainText('Reservadas');

    await expect(
      capacityCard
    ).toContainText('1');

    await expect(
      capacityCard
    ).toContainText('Fuera servicio');

    await expect(
      capacityCard
    ).toContainText('Libres reales');

    await expect(
      capacityCard
    ).toContainText(/40,0%|40\.0%/);

    // --------------------------------------------------------
    // MOVEMENTS TODAY
    // --------------------------------------------------------

    const movementsCard=
      dashboard
        .locator('.v3-ops-card')
        .filter({
          hasText:'Movimientos hoy'
        })
        .first();

    await expect(movementsCard).toBeVisible();

    await expect(
      movementsCard
    ).toContainText('Subidas');

    await expect(
      movementsCard
    ).toContainText('Bajadas');

    // Fixture has no canonical movements today.
    await expect(
      movementsCard
        .locator('.v3-movement-grid .up strong')
    ).toHaveText('0');

    await expect(
      movementsCard
        .locator('.v3-movement-grid .down strong')
    ).toHaveText('0');

    // --------------------------------------------------------
    // MAP BRIDGE MUST PRESERVE SELECTED MODULE
    // --------------------------------------------------------

    await dashboard
      .locator('[data-v3-open-map]')
      .first()
      .click();

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.currentView||''
      )
    ).toBe('control');

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.mapModule||''
      )
    ).toBe('M2');

    await expect(
      page.locator('#view-control')
    ).toBeVisible();

    await expect(
      page.locator('#view-control')
    ).toContainText('M2');

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);



test(
  'UI V3 A3.2 presion por modulo y MOD MOI global usan el alcance gerencial',
  async({page})=>{
    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const state=dailyCapacityFixture();

    const bruno=
      state.workers.find(
        worker=>
          worker.nombre==='BRUNO CAPACIDAD'
      );

    expect(bruno).toBeTruthy();

    bruno.empresa='EMPRESA B';
    bruno.turno='B';
    bruno.modulo='M2';
    bruno.habitacion='201';
    bruno.cama='A';

    const brunoBed=
      state.inventory.find(
        bed=>
          bed.module==='M1' &&
          bed.room==='101' &&
          bed.bed==='B'
      );

    expect(brunoBed).toBeTruthy();

    brunoBed.module='M2';
    brunoBed.room='201';
    brunoBed.bed='A';

    const backend=await login(
      page,
      state
    );

    await openView(
      page,
      'management'
    );

    const dashboard=
      page.locator(
        '#view-management .v3-management'
      );

    await expect(
      dashboard
    ).toBeVisible();

    // --------------------------------------------------------
    // MODULE PRESSURE
    // --------------------------------------------------------

    const pressure=
      dashboard.locator(
        '[data-v3-pressure-card]'
      );

    await expect(pressure).toBeVisible();

    await expect(
      pressure
    ).toContainText(
      /Presi[o\u00f3]n de capacidad por m[o\u00f3]dulo/i
    );

    await expect(
      pressure.locator(
        '[data-v3-pressure-module]'
      ).first()
    ).toBeVisible();

    const pressureCount=
      await pressure
        .locator(
          '[data-v3-pressure-module]'
        )
        .count();

    expect(
      pressureCount
    ).toBeGreaterThan(0);

    const toggle=
      pressure.locator(
        '[data-v3-toggle-modules]'
      );

    if(await toggle.count()){
      const before=
        await pressure
          .locator(
            '[data-v3-pressure-module]'
          )
          .count();

      await toggle.click();

      await expect(
        dashboard.locator(
          '[data-v3-toggle-modules]'
        )
      ).toHaveAttribute(
        'aria-expanded',
        'true'
      );

      const after=
        await dashboard
          .locator(
            '[data-v3-pressure-module]'
          )
          .count();

      expect(after).toBeGreaterThanOrEqual(
        before
      );
    }

    // --------------------------------------------------------
    // PERSONNEL MODULE CARD NO LONGER OWNS PRESSURE SEMANTICS
    // --------------------------------------------------------

    const lodgingModuleCard=
      dashboard
        .locator('.v3-card')
        .filter({
          hasText:/Personal alojado por m[o\u00f3]dulo/i
        })
        .first();

    await expect(
      lodgingModuleCard
    ).toBeVisible();

    const lodgingModuleRow=
      lodgingModuleCard
        .locator('.v3-module-row')
        .first();

    await expect(
      lodgingModuleRow
    ).toBeVisible();

    const personnelMeter=
      lodgingModuleRow.locator(
        '.v3-personnel-meter'
      );

    await expect(
      personnelMeter
    ).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    await expect(
      lodgingModuleRow
    ).toContainText('%');

    // --------------------------------------------------------
    // GLOBAL MOD/MOI TABS
    // --------------------------------------------------------

    const workforce=
      dashboard.locator(
        '[data-v3-workforce-card]'
      );

    await expect(workforce).toBeVisible();

    await expect(
      workforce
    ).toContainText('MOD');

    await expect(
      workforce
    ).toContainText('MOI');

    await expect(
      workforce.locator(
        '[data-v3-workforce-dim]'
      )
    ).toHaveCount(3);

    await expect(
      workforce.locator(
        '[data-v3-workforce-dim="company"]'
      )
    ).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await expect(
      workforce.locator(
        '[data-v3-workforce-row]'
      )
    ).toHaveCount(2);

    await workforce
      .locator(
        '[data-v3-workforce-dim="shift"]'
      )
      .click();

    await expect(
      dashboard.locator(
        '[data-v3-workforce-dim="shift"]'
      )
    ).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await expect(
      dashboard.locator(
        '[data-v3-workforce-card] [data-v3-workforce-row]'
      )
    ).toHaveCount(2);

    await dashboard
      .locator(
        '[data-v3-workforce-dim="module"]'
      )
      .click();

    await expect(
      dashboard.locator(
        '[data-v3-workforce-dim="module"]'
      )
    ).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await expect(
      dashboard.locator(
        '[data-v3-workforce-card] [data-v3-workforce-row]'
      )
    ).toHaveCount(2);

    // --------------------------------------------------------
    // A3.1 FILTER MUST SCOPE MOD/MOI DETAIL
    // --------------------------------------------------------

    await dashboard
      .locator('#v3FilterCompany')
      .selectOption('EMPRESA A');

    await expect(
      dashboard.locator(
        '[data-v3-scope]'
      )
    ).toContainText('1');

    await expect(
      dashboard.locator(
        '[data-v3-workforce-card] [data-v3-workforce-row]'
      )
    ).toHaveCount(1);

    await expect(
      dashboard.locator(
        '[data-v3-workforce-card]'
      )
    ).toContainText('1 PERSONAS');

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);



test(
  'UI V3 A3.3 integra mapa hotel compartido y conserva estado del Centro de Gestion',
  async({page})=>{
    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const state=dailyCapacityFixture();

    const bruno=
      state.workers.find(
        worker=>
          worker.nombre==='BRUNO CAPACIDAD'
      );

    expect(bruno).toBeTruthy();

    bruno.modulo='M2';
    bruno.habitacion='201';
    bruno.cama='A';

    const brunoBed=
      state.inventory.find(
        bed=>
          bed.module==='M1' &&
          bed.room==='101' &&
          bed.bed==='B'
      );

    expect(brunoBed).toBeTruthy();

    brunoBed.module='M2';
    brunoBed.room='201';
    brunoBed.bed='A';

    const backend=await login(
      page,
      state
    );

    await openView(
      page,
      'management'
    );

    const dashboard=
      page.locator(
        '#view-management .v3-management'
      );

    await expect(
      dashboard
    ).toBeVisible();

    const hotel=
      dashboard.locator(
        '[data-v3-hotel-map]'
      );

    await expect(hotel).toBeVisible();

    await expect(
      hotel
    ).toContainText(
      'Mapa hotel de camas'
    );

    expect(
      await page.evaluate(
        ()=>Boolean(
          window.GarpiControlCenterMap?.snapshot &&
          window.GarpiControlCenterMap?.bedMap &&
          window.GarpiControlCenterMap?.detailHTML &&
          window.GarpiControlCenterMap?.bedKey
        )
      )
    ).toBe(true);

    const moduleSelect=
      hotel.locator(
        '#v3HotelModule'
      );

    await expect(
      moduleSelect
    ).toBeVisible();

    await moduleSelect.selectOption('M2');

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.mapModule||''
      )
    ).toBe('M2');

    const refreshedHotel=
      dashboard.locator(
        '[data-v3-hotel-map]'
      );

    await expect(
      refreshedHotel.locator(
        '#v3HotelModule'
      )
    ).toHaveValue('M2');

    const beds=
      refreshedHotel.locator(
        '[data-cc-bed]'
      );

    expect(
      await beds.count()
    ).toBeGreaterThan(0);

    const bed=
      beds.first();

    await expect(bed).toBeVisible();

    const bedKey=
      await bed.getAttribute(
        'data-cc-bed'
      );

    expect(bedKey).toBeTruthy();

    await bed.click();

    await expect(
      refreshedHotel.locator(
        '#v3HotelDetail'
      )
    ).toContainText('M2');

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.controlBedKey||''
      )
    ).toBe(bedKey);

    await expect(
      bed
    ).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await refreshedHotel
      .locator(
        '[data-v3-open-map]'
      )
      .click();

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.currentView||''
      )
    ).toBe('control');

    await expect(
      page.locator('#view-control')
    ).toBeVisible();

    await expect(
      page.locator('#ccModule')
    ).toHaveValue('M2');

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.controlBedKey||''
      )
    ).toBe(bedKey);

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);



test(
  'UI V3 A3.4 organiza advanced historial costos y reportes sin duplicar analytics',
  async({page})=>{
    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const state=
      dailyCapacityFixture();

    const backend=
      await login(
        page,
        state
      );

    await openView(
      page,
      'management'
    );

    const management=
      page.locator(
        '#view-management'
      );

    const dashboard=
      management.locator(
        '.v3-management'
      );

    await expect(
      dashboard
    ).toBeVisible();

    await expect(
      dashboard.locator(
        '.v3-kpi'
      )
    ).toHaveCount(8);

    const advanced=
      dashboard.locator(
        '[data-v3-advanced]'
      );

    await expect(
      advanced
    ).toBeVisible();

    await expect(
      advanced
    ).toContainText(
      'Advanced'
    );

    await expect(
      advanced
    ).toContainText(
      /Costos y camas-d[i\u00ed]a/i
    );

    await expect(
      advanced
    ).toContainText(
      /Hist[o\u00f3]rico/i
    );

    await expect(
      advanced
    ).toContainText(
      'Reportes / respaldo'
    );

    const legacy=
      management.locator(
        ':scope > details.dc-legacy-details'
      );

    await expect(
      legacy
    ).toHaveCount(1);

    expect(
      await legacy.evaluate(
        node=>node.open
      )
    ).toBe(false);

    await advanced
      .locator(
        '[data-v3-open-advanced="analysis"]'
      )
      .click();

    await expect.poll(
      ()=>legacy.evaluate(
        node=>node.open
      )
    ).toBe(true);

    await expect(
      legacy.locator(
        '.dc-legacy-slot'
      )
    ).toBeVisible();

    await advanced
      .locator(
        '[data-v3-open-advanced="cost"]'
      )
      .click();

    await expect.poll(
      ()=>legacy.evaluate(
        node=>node.open
      )
    ).toBe(true);

    await expect(
      legacy.locator(
        '#costForm'
      )
    ).toBeVisible();

    await advanced
      .locator(
        '[data-v3-goto="history"]'
      )
      .click();

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.currentView||''
      )
    ).toBe('history');

    await expect(
      page.locator(
        '#view-history'
      )
    ).toBeVisible();

    await expect(
      page.locator(
        '#view-history'
      )
    ).toContainText(
      /Hist[o\u00f3]rico completo/i
    );

    await openView(
      page,
      'management'
    );

    const advancedAgain=
      page.locator(
        '#view-management [data-v3-advanced]'
      );

    await expect(
      advancedAgain
    ).toBeVisible();

    await advancedAgain
      .locator(
        '[data-v3-goto="exports"]'
      )
      .click();

    await expect.poll(
      ()=>page.evaluate(
        ()=>window.A?.currentView||''
      )
    ).toBe('exports');

    await expect(
      page.locator(
        '#view-exports'
      )
    ).toBeVisible();

    await expect(
      page.locator(
        '#view-exports'
      )
    ).toContainText(
      /Reportes y respaldos/i
    );

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);


test(
  'UI V3 conserva experiencia movil real',
  async({page},testInfo)=>{

    test.skip(
      testInfo.project.name!=='mobile-chrome',
      'Este contrato es exclusivo del perfil movil.'
    );

    const pageErrors=[];

    page.on(
      'pageerror',
      error=>pageErrors.push(
        String(error?.message||error)
      )
    );

    const backend=await login(
      page,
      dailyCapacityFixture()
    );

    await openView(
      page,
      'management'
    );

    await expect(
      page.locator(
        '#view-management .v3-management'
      )
    ).toBeVisible();

    await expect(
      page.locator(
        '#view-management .v3-kpi'
      )
    ).toHaveCount(8);

    const overflow=
      await page.evaluate(()=>{

        const doc=document.documentElement;

        return {
          width:window.innerWidth,
          document:
            Math.max(
              0,
              doc.scrollWidth-
              doc.clientWidth
            ),
          dashboard:
            Math.max(
              0,
              document
                .querySelector(
                  '#view-management'
                )
                .scrollWidth -
              document
                .querySelector(
                  '#view-management'
                )
                .clientWidth
            )
        };
      });

    console.log(
      'UI V3 MOBILE',
      JSON.stringify(overflow)
    );

    expect(
      overflow.document
    ).toBeLessThanOrEqual(1);

    expect(
      overflow.dashboard
    ).toBeLessThanOrEqual(1);

    await expect(
      page.locator(
        '#v3TraceInput'
      )
    ).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);
