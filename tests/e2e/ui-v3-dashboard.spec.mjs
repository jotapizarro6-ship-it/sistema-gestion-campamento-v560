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
              '[data-v3-workforce-card] [data-v3-workforce-row][data-v3-workforce-row-dim="company"]'
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

            hasWorkforcePanel:
              [...view.querySelectorAll(
                '.v3-card h3'
              )].some(
                x=>
                  x.textContent
                    .toLowerCase()
                    .includes(
                      'distribución del personal alojado'
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
      expect(report.hasWorkforcePanel).toBe(true);
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
    // KEYBOARD BASELINES BEFORE STATEFUL COMPANY CROSSFILTER

    // Módulo: native button keyboard activation.
    const moduleKeyboardBaseline=
      dashboard
        .locator('.v3-module-row')
        .first();

    await expect(
      moduleKeyboardBaseline
    ).toBeVisible();

    await moduleKeyboardBaseline.focus();

    await expect(
      moduleKeyboardBaseline
    ).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      page.locator('#detailDialog')
    ).toBeVisible();

    await expect(
      page.locator('#detailDialog')
    ).toContainText('Modulo');

    await closeDetailDialog(page);


    // Forecast: native day button keyboard activation.
    const dayKeyboardBaseline=
      dashboard
        .locator('.v3-day')
        .first();

    await expect(
      dayKeyboardBaseline
    ).toBeVisible();

    await dayKeyboardBaseline.focus();

    await expect(
      dayKeyboardBaseline
    ).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      page.locator('#detailDialog')
    ).toBeVisible();

    await expect(
      page.locator('#detailDialog')
    ).toContainText('Proyeccion');

    await closeDetailDialog(page);

    // TRACE BLOCK MOVED BEFORE STATEFUL COMPANY CROSSFILTER

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

    // EMPRESA
    // --------------------------------------------------------

    const company=
      dashboard
        .locator('[data-v3-workforce-card] [data-v3-workforce-row][data-v3-workforce-row-dim="company"]')
        .first();

    await expect(company).toBeVisible();

    const companyText=
      await company.innerText();

    expect(companyText)
      .toContain('persona(s)');

    expect(companyText)
      .toContain('MOD');

    expect(companyText)
      .toContain('MOI');

    // V3.2: porcentaje = empresa alojada / total alojado campamento.
    expect(companyText).toContain('%');

    // Botón nativo = acceso teclado + cross-filter V3.2.
    const companyName=
      await company.getAttribute(
        'data-v3-workforce-row'
      );

    expect(companyName).toBeTruthy();

    await company.focus();

    await expect(company)
      .toBeFocused();

    await page.keyboard.press('Enter');

    await expect(
      dashboard.locator('#v3FilterCompany')
    ).toHaveValue(companyName);

    await expect(
      dashboard.locator('[data-v32-role-card]')
    ).toContainText(companyName);

    await expect(
      dashboard.locator('[data-v32-role-card]')
    ).toContainText(/Cargo|Especialidad/);

    // COMPANY CROSSFILTER MUST NOT OPEN LEGACY DETAIL
    await expect(
      page.locator('#detailDialog')
    ).toBeHidden();


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

    // V3.2: la fila Empresa aplica cross-filter real.
    // Restaurar alcance neutro antes del contrato independiente de Módulo.
    const companyFilterAfterCross=
      dashboard.locator('#v3FilterCompany');

    await companyFilterAfterCross
      .selectOption('');

    await expect(
      companyFilterAfterCross
    ).toHaveValue('');

    await expect(
      dashboard.locator(
        '[data-v3-workforce-card]'
      )
    ).toContainText('2 PERSONAS');

    await expect(
      module
    ).toBeVisible();

    await expect(
      module
    ).toHaveAttribute(
      'type',
      'button'
    );

    // --------------------------------------------------------
    // FORECAST
    // --------------------------------------------------------

    const day=
      dashboard
        .locator('.v3-day')
        .first();

    await expect(day).toBeVisible();

    await expect(
      day
    ).toBeVisible();

    await expect(
      day
    ).toHaveAttribute(
      'type',
      'button'
    );

    // --------------------------------------------------------
    // DETALLE AVANZADO HEREDADO
    // --------------------------------------------------------

    const legacy=
      view.locator(
        'details.dc-legacy-details'
      );

    // V3.1: el dashboard heredado no debe reaparecer
    // debajo del dashboard principal.
    await expect(legacy).toBeHidden();

    expect(
      await legacy.evaluate(
        node=>node.open
      )
    ).toBe(false);

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
      dashboard.locator('[data-v3-workforce-card] [data-v3-workforce-row][data-v3-workforce-row-dim="company"]')
    ).toHaveCount(1);

    await expect(
      dashboard.locator('[data-v3-workforce-card] [data-v3-workforce-row][data-v3-workforce-row-dim="company"]').first()
    ).toContainText('EMPRESA A');

    expect(
      await dashboard
        .locator('.v3-kpi')
        .allInnerTexts()
    ).toEqual(initialKpis);

    await reset.evaluate(
      element=>
        element.scrollIntoView({
          block:'center',
          inline:'nearest'
        })
    );

    await expect(reset)
      .toBeVisible();

    await reset.press('Enter');

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

    await reset.evaluate(
      element =>
        element.scrollIntoView({
          block:'center',
          inline:'nearest'
        })
    );

    await expect(
      reset
    ).toBeVisible();

    await reset.press('Enter');

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
      'Herramientas especializadas'
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

    // V3.1: segundo nivel oculto mientras no exista
    // una acción explícita del usuario.
    await expect(
      legacy
    ).toBeHidden();

    await advanced
      .locator(
        '[data-v31-open-tool="drillthrough"]'
      )
      .click();

    await expect.poll(
      ()=>legacy.evaluate(
        node=>node.open
      )
    ).toBe(true);

    // V3.1: sólo después del clic explícito puede
    // aparecer como modal de segundo nivel.
    await expect(
      legacy
    ).toHaveClass(
      /v31-modal-open/
    );

    await expect(
      legacy
    ).toBeVisible();

    await expect(
      legacy.locator(
        '.dc-legacy-slot'
      )
    ).toBeVisible();

    // A2.2: selected drillthrough only; repeated analytics stay hidden.
    await expect(
      legacy.locator('#drillTable')
    ).toBeVisible();

    await expect(
      legacy.locator('#costForm')
    ).toBeHidden();

    await expect(
      legacy.locator('.kpi-grid')
    ).toBeHidden();

    const closeAdvanced=
      legacy.locator(
        '[data-v31-close-advanced]'
      );

    await expect(
      closeAdvanced
    ).toBeVisible();

    // V3.1 modal contract:
    // a second tool is selected only after closing
    // the currently open advanced modal.
    await closeAdvanced.click();

    await expect(
      legacy
    ).toBeHidden();

    expect(
      await legacy.evaluate(
        node=>node.open
      )
    ).toBe(false);

    await advanced
      .locator(
        '[data-v31-open-tool="cost"]'
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

    // A2.2: selected cost form only; drillthrough and KPI legacy stay hidden.
    await expect(
      legacy.locator('#drillTable')
    ).toBeHidden();

    await expect(
      legacy.locator('.kpi-grid')
    ).toBeHidden();

    await expect(
      legacy
    ).toHaveClass(
      /v31-modal-open/
    );

    await legacy
      .locator(
        '[data-v31-close-advanced]'
      )
      .click();

    await expect(
      legacy
    ).toBeHidden();

    expect(
      await legacy.evaluate(
        node=>node.open
      )
    ).toBe(false);

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


test(
  'UI V3.1.1 A2.2 elimina filtros redundantes del Resumen Operativo',
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
      'overview'
    );

    const overview=
      page.locator(
        '#view-overview'
      );

    await expect(
      overview.locator(
        '.dc-primary'
      )
    ).toBeVisible();

    await expect(
      overview.locator(
        '.dc-filter-strip'
      )
    ).toHaveCount(0);

    await expect(
      overview.locator(
        '[data-dc-filter-toggle]'
      )
    ).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'UI V3.1.1 A2.2 mobile 412 mantiene deduplicacion funcional',
  async({page})=>{
    await page.setViewportSize({
      width:412,
      height:915
    });

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
      'overview'
    );

    const overview=
      page.locator(
        '#view-overview'
      );

    await expect(
      overview.locator(
        '.dc-primary'
      )
    ).toBeVisible();

    await expect(
      overview.locator(
        '.dc-filter-strip'
      )
    ).toHaveCount(0);

    await expect(
      overview.locator(
        '[data-dc-filter-toggle]'
      )
    ).toHaveCount(0);

    const overviewOverflow=
      await page.evaluate(
        ()=>{
          const doc=
            document.documentElement;

          return Math.max(
            0,
            doc.scrollWidth-
            doc.clientWidth
          );
        }
      );

    expect(
      overviewOverflow
    ).toBe(0);


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
      dashboard.locator(
        '.v3-kpi'
      )
    ).toHaveCount(8);

    const specialized=
      dashboard.locator(
        '[data-v3-advanced]'
      );

    await expect(
      specialized
    ).toContainText(
      'Herramientas especializadas'
    );

    await expect(
      specialized
    ).toContainText(
      /Drillthrough de dotaci[o\u00f3]n/i
    );

    await expect(
      specialized.locator(
        '[data-v3-open-advanced="analysis"]'
      )
    ).toHaveCount(0);


    const legacy=
      management.locator(
        ':scope > details.dc-legacy-details'
      );

    await specialized
      .locator(
        '[data-v31-open-tool="drillthrough"]'
      )
      .click();

    await expect(
      legacy
    ).toHaveClass(
      /v31-modal-open/
    );

    await expect(
      legacy.locator(
        '#drillTable'
      )
    ).toBeVisible();

    await expect(
      legacy.locator(
        '#costForm'
      )
    ).toBeHidden();

    await expect(
      legacy.locator(
        '.kpi-grid'
      )
    ).toBeHidden();

    await legacy
      .locator(
        '[data-v31-close-advanced]'
      )
      .click();

    await expect(
      legacy
    ).toBeHidden();


    await specialized
      .locator(
        '[data-v31-open-tool="cost"]'
      )
      .click();

    await expect(
      legacy.locator(
        '#costForm'
      )
    ).toBeVisible();

    await expect(
      legacy.locator(
        '#drillTable'
      )
    ).toBeHidden();

    await expect(
      legacy.locator(
        '.kpi-grid'
      )
    ).toBeHidden();

    const managementOverflow=
      await page.evaluate(
        ()=>{
          const doc=
            document.documentElement;

          return Math.max(
            0,
            doc.scrollWidth-
            doc.clientWidth
          );
        }
      );

    expect(
      managementOverflow
    ).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  }
);

// ============================================================
// GARPI V3.2 A1 FINAL SPECIFIC CONTRACT
// ============================================================

test(
  'UI V3.2 A1 workforce analytics cumple responsive semantica y cross-filter',
  async({page})=>{

    test.setTimeout(60000);

    const pageErrors=[];

    page.on(
      'pageerror',
      error=>
        pageErrors.push(
          String(
            error?.message ||
            error
          )
        )
    );

    await login(
      page,
      dailyCapacityFixture()
    );

    await openView(
      page,
      'management'
    );

    const view=
      page.locator(
        '#view-management'
      );

    const dashboard=
      view.locator(
        '.v3-management'
      );

    await expect(
      dashboard
    ).toBeVisible();

    const viewports=[
      {
        name:'phone-320',
        width:320,
        height:720
      },
      {
        name:'phone-375',
        width:375,
        height:812
      },
      {
        name:'phone-390',
        width:390,
        height:844
      },
      {
        name:'phone-412',
        width:412,
        height:915
      },
      {
        name:'tablet-768',
        width:768,
        height:1024
      },
      {
        name:'tablet-1024',
        width:1024,
        height:768
      },
      {
        name:'desktop-1440',
        width:1440,
        height:900
      }
    ];

    for(
      const viewport of viewports
    ){

      await page.setViewportSize({
        width:viewport.width,
        height:viewport.height
      });

      await expect(
        dashboard
      ).toBeVisible();

      await expect(
        dashboard.locator(
          '.v3-kpi'
        )
      ).toHaveCount(8);

      const compositionTitle=
        dashboard.getByText(
          'Composición del personal alojado',
          {
            exact:true
          }
        );

      await expect(
        compositionTitle
      ).toHaveCount(1);

      await expect(
        compositionTitle
      ).toBeVisible();

      const exportButton=
        dashboard.locator(
          '[data-v32-export-xlsx]'
        );

      await expect(
        exportButton
      ).toBeVisible();

      await expect(
        exportButton
      ).toHaveText(
        'Descargar resumen Excel'
      );

      const touchBox=
        await exportButton.boundingBox();

      expect(
        touchBox
      ).not.toBeNull();

      expect(
        touchBox.height
      ).toBeGreaterThanOrEqual(44);

      expect(
        touchBox.width
      ).toBeGreaterThanOrEqual(44);

      await expect(
        dashboard.locator(
          '[data-v3-workforce-card]'
        )
      ).toBeVisible();

      await expect(
        dashboard.locator(
          '[data-v32-role-card]'
        )
      ).toBeVisible();

      const overflow=
        await page.evaluate(()=>{

          const root=
            document.querySelector(
              '#view-management .v3-management'
            );

          const documentWidth=
            Math.max(
              document.documentElement.scrollWidth,
              document.body?.scrollWidth || 0
            );

          const documentClient=
            document.documentElement.clientWidth;

          return {
            documentOverflow:
              Math.max(
                0,
                documentWidth-documentClient
              ),

            viewOverflow:
              root
                ? Math.max(
                    0,
                    root.scrollWidth-root.clientWidth
                  )
                : 999
          };
        });

      console.log(
        'UI V3.2 VIEWPORT',
        viewport.name,
        JSON.stringify(
          overflow
        )
      );

      expect(
        overflow.documentOverflow
      ).toBe(0);

      expect(
        overflow.viewOverflow
      ).toBe(0);
    }


    // --------------------------------------------------------
    // Desktop semantic / ordering checks.
    // --------------------------------------------------------

    await page.setViewportSize({
      width:1440,
      height:900
    });


    const expertLayout=
      await page.evaluate(
        ()=>{
          const rect=
            selector=>
              document
                .querySelector(selector)
                ?.getBoundingClientRect();

          const grid=
            rect(
              '#view-management .v3-grid'
            );

          const filters=
            rect(
              '#view-management .v3-filterbar'
            );

          const context=
            rect(
              '#view-management .v31a2-selection-bar'
            );

          const workforce=
            rect(
              '#view-management [data-v3-workforce-card]'
            );

          return {
            grid:grid?.width || 0,
            filters:filters?.width || 0,
            context:context?.width || 0,
            workforce:workforce?.width || 0
          };
        }
      );

    expect(
      expertLayout.grid
    ).toBeGreaterThan(0);

    expect(
      expertLayout.filters /
      expertLayout.grid
    ).toBeGreaterThan(0.95);

    expect(
      expertLayout.context /
      expertLayout.grid
    ).toBeGreaterThan(0.95);

    expect(
      expertLayout.workforce /
      expertLayout.grid
    ).toBeGreaterThan(0.95);

    const focus=
      dashboard
        .getByText(
          /Foco Ejecutivo/i
        )
        .first();

    const composition=
      dashboard
        .getByText(
          'Composición del personal alojado',
          {
            exact:true
          }
        )
        .first();

    const workforce=
      dashboard
        .locator(
          '[data-v3-workforce-card]'
        )
        .first();

    await expect(
      focus
    ).toBeVisible();

    await expect(
      composition
    ).toBeVisible();

    await expect(
      workforce
    ).toBeVisible();

    const focusBox=
      await focus.boundingBox();

    const compositionBox=
      await composition.boundingBox();

    const workforceBox=
      await workforce.boundingBox();

    expect(
      focusBox
    ).not.toBeNull();

    expect(
      compositionBox
    ).not.toBeNull();

    expect(
      workforceBox
    ).not.toBeNull();

    expect(
      compositionBox.y
    ).toBeGreaterThan(
      focusBox.y
    );

    expect(
      workforceBox.y
    ).toBeGreaterThan(
      compositionBox.y
    );


    // --------------------------------------------------------
    // Company graph = count + % + MOD / MOI.
    // --------------------------------------------------------

    const companyRows=
      dashboard.locator(
        '[data-v3-workforce-card] ' +
        '[data-v3-workforce-row]' +
        '[data-v3-workforce-row-dim="company"]'
      );

    const companyCount=
      await companyRows.count();

    expect(
      companyCount
    ).toBeGreaterThan(0);

    const company=
      companyRows.first();

    await expect(
      company
    ).toBeVisible();

    await expect(
      company
    ).toContainText(
      /\d[\d.]*\s+persona\(s\)\s+·\s+\d+(?:[.,]\d+)?%/
    );

    await expect(
      company.locator(
        '.v3-workforce-stack'
      )
    ).toHaveAttribute(
      'aria-label',
      /MOD\s+\d+.*MOI\s+\d+/i
    );


    await expect(
      company
    ).toContainText(
      /MOD\s+\d[\d.]*\s+\(\d+(?:[.,]\d+)?%\)/i
    );

    await expect(
      company
    ).toContainText(
      /MOI\s+\d[\d.]*\s+\(\d+(?:[.,]\d+)?%\)/i
    );

    const companyShareWidth=
      await company
        .locator(
          '.v3-workforce-stack'
        )
        .evaluate(
          element=>
            Number.parseFloat(
              element.style.width ||
              '0'
            )
        );

    expect(
      companyShareWidth
    ).toBeGreaterThan(0);

    expect(
      companyShareWidth
    ).toBeLessThanOrEqual(100);

    const companyName=
      await company.getAttribute(
        'data-v3-workforce-row'
      );

    expect(
      companyName
    ).toBeTruthy();


    // --------------------------------------------------------
    // Determine expected cargo/specialty semantics from actual
    // fixture data; never invent a cargo.
    // --------------------------------------------------------

    const sampleWorker=
      await page.evaluate(
        company=>{

          const clean=
            value=>
              String(
                value ?? ''
              ).trim();

          const norm=
            value=>
              clean(value)
                .normalize('NFD')
                .replace(
                  /[̀-ͯ]/g,
                  ''
                )
                .toUpperCase();

          const rows=
            (
              typeof A!=='undefined' &&
              A.data?.workers
            )
              ? A.data.workers
              : [];

          const occupied=
            rows.filter(
              row=>
                clean(row.rut) &&
                clean(row.modulo) &&
                clean(row.habitacion) &&
                clean(row.cama)
            );

          const selected=
            occupied.find(
              row=>
                norm(
                  clean(row.empresa) ||
                  'SIN EMPRESA'
                )===
                norm(company)
            );

          if(!selected){
            return null;
          }

          const cargo=
            clean(
              selected.cargo
            );

          const especialidad=
            clean(
              selected.especialidad
            );

          const categoria=
            clean(
              selected.categoria
            );

          return {
            label:
              cargo ||
              especialidad ||
              'SIN CARGO / ESPECIALIDAD REGISTRADA',

            source:
              cargo
                ? 'Cargo'
                : especialidad
                  ? 'Especialidad'
                  : 'Sin dato',

            category:
              categoria ||
              'SIN CATEGORÍA REGISTRADA'
          };
        },
        companyName
      );

    expect(
      sampleWorker
    ).not.toBeNull();


    // --------------------------------------------------------
    // Company row = cross-filter only.
    // --------------------------------------------------------

    await company.press(
      'Enter'
    );

    await expect(
      dashboard.locator(
        '#v3FilterCompany'
      )
    ).toHaveValue(
      companyName
    );

    await expect(
      page.locator(
        '#detailDialog'
      )
    ).toBeHidden();

    const roleCard=
      dashboard.locator(
        '[data-v32-role-card]'
      );

    await expect(
      roleCard
    ).toContainText(
      companyName
    );

    await expect(
      roleCard
    ).toContainText(
      /Cargo|Especialidad/
    );

    await expect(
      roleCard
    ).toContainText(
      sampleWorker.label
    );

    await expect(
      roleCard
    ).toContainText(
      sampleWorker.source
    );

    await expect(
      roleCard
    ).toContainText(
      sampleWorker.category
    );

    await expect(
      roleCard
    ).toContainText(
      /No se infieren cargos/i
    );


    // --------------------------------------------------------
    // Return to neutral scope.
    // --------------------------------------------------------

    await dashboard
      .locator(
        '#v3FilterCompany'
      )
      .selectOption('');

    await expect(
      dashboard.locator(
        '#v3FilterCompany'
      )
    ).toHaveValue('');


    // --------------------------------------------------------
    // Explicit V3.2 empty-state contract.
    // This exercises only the V3.2 scoped analytics enhancer;
    // it does not mutate application/backend data.
    // --------------------------------------------------------

    await page.evaluate(()=>{

      const select=
        document.querySelector(
          '#view-management #v3FilterCompany'
        );

      if(!select){
        throw new Error(
          'company filter unavailable'
        );
      }

      const option=
        document.createElement(
          'option'
        );

      option.value=
        '__V32_NO_MATCH__';

      option.textContent=
        '__V32_NO_MATCH__';

      option.dataset.v32Test=
        'empty-state';

      select.append(
        option
      );

      select.value=
        option.value;

      window.GarpiUIV32A1
        ?.enhance
        ?.();
    });

    await expect(
      roleCard
    ).toContainText(
      'Sin personal alojado para este contexto.'
    );

    await page.evaluate(()=>{

      const select=
        document.querySelector(
          '#view-management #v3FilterCompany'
        );

      if(!select){
        return;
      }

      select.value='';

      select
        .querySelector(
          '[data-v32-test="empty-state"]'
        )
        ?.remove();

      window.GarpiUIV32A1
        ?.enhance
        ?.();
    });

    await expect(
      roleCard
    ).not.toContainText(
      'Sin personal alojado para este contexto.'
    );

    expect(
      pageErrors
    ).toEqual([]);
  }
);


test(
  'UI V3.2 A1 descarga XLSX real con cinco hojas y denominadores correctos',
  async({page})=>{

    test.setTimeout(60000);


    // --------------------------------------------------------
    // Deterministic browser XLSX adapter.
    //
    // The application still exercises its real workbook
    // construction path. This adapter replaces only the remote
    // SheetJS transport and serializes the resulting workbook
    // into a valid uncompressed OOXML ZIP package.
    // --------------------------------------------------------

    await page.addInitScript(()=>{

      const encoder=
        new TextEncoder();

      const xml=
        value=>
          String(
            value ?? ''
          )
            .replace(
              /&/g,
              '&amp;'
            )
            .replace(
              /</g,
              '&lt;'
            )
            .replace(
              />/g,
              '&gt;'
            )
            .replace(
              /"/g,
              '&quot;'
            )
            .replace(
              /'/g,
              '&apos;'
            );

      const concat=
        parts=>{

          const length=
            parts.reduce(
              (sum,part)=>
                sum+part.length,
              0
            );

          const out=
            new Uint8Array(
              length
            );

          let offset=0;

          for(
            const part of parts
          ){
            out.set(
              part,
              offset
            );

            offset+=
              part.length;
          }

          return out;
        };

      const u16=
        value=>
          new Uint8Array([
            value & 255,
            value >>> 8 & 255
          ]);

      const u32=
        value=>
          new Uint8Array([
            value & 255,
            value >>> 8 & 255,
            value >>> 16 & 255,
            value >>> 24 & 255
          ]);

      const crc32=
        bytes=>{

          let crc=
            0xffffffff;

          for(
            const byte of bytes
          ){

            crc^=
              byte;

            for(
              let bit=0;
              bit<8;
              bit++
            ){

              crc=
                (
                  crc & 1
                )
                  ? (
                      crc >>> 1
                    ) ^ 0xedb88320
                  : crc >>> 1;
            }
          }

          return (
            crc ^ 0xffffffff
          ) >>> 0;
        };

      const zip=
        entries=>{

          const locals=[];
          const centrals=[];

          let offset=0;

          for(
            const entry of entries
          ){

            const name=
              encoder.encode(
                entry.name
              );

            const data=
              encoder.encode(
                entry.text
              );

            const crc=
              crc32(
                data
              );

            const local=
              concat([
                u32(0x04034b50),
                u16(20),
                u16(0x0800),
                u16(0),
                u16(0),
                u16(0x0021),
                u32(crc),
                u32(data.length),
                u32(data.length),
                u16(name.length),
                u16(0),
                name,
                data
              ]);

            locals.push(
              local
            );

            centrals.push(
              concat([
                u32(0x02014b50),
                u16(20),
                u16(20),
                u16(0x0800),
                u16(0),
                u16(0),
                u16(0x0021),
                u32(crc),
                u32(data.length),
                u32(data.length),
                u16(name.length),
                u16(0),
                u16(0),
                u16(0),
                u16(0),
                u32(0),
                u32(offset),
                name
              ])
            );

            offset+=
              local.length;
          }

          const central=
            concat(
              centrals
            );

          const end=
            concat([
              u32(0x06054b50),
              u16(0),
              u16(0),
              u16(entries.length),
              u16(entries.length),
              u32(central.length),
              u32(offset),
              u16(0)
            ]);

          return concat([
            ...locals,
            central,
            end
          ]);
        };

      const columnName=
        number=>{

          let value=
            number;

          let out='';

          while(
            value>0
          ){

            value--;

            out=
              String.fromCharCode(
                65 + value % 26
              ) +
              out;

            value=
              Math.floor(
                value / 26
              );
          }

          return out;
        };

      const worksheetXml=
        rows=>{

          const rowXml=
            rows.map(
              (
                row,
                rowIndex
              )=>{

                const cells=
                  (
                    Array.isArray(row)
                      ? row
                      : []
                  )
                    .map(
                      (
                        value,
                        columnIndex
                      )=>{

                        if(
                          value===null ||
                          typeof value==='undefined'
                        ){
                          return '';
                        }

                        const ref=
                          columnName(
                            columnIndex+1
                          ) +
                          (
                            rowIndex+1
                          );

                        if(
                          typeof value==='number' &&
                          Number.isFinite(value)
                        ){
                          return (
                            '<c r="' +
                            ref +
                            '"><v>' +
                            value +
                            '</v></c>'
                          );
                        }

                        return (
                          '<c r="' +
                          ref +
                          '" t="inlineStr">' +
                          '<is><t xml:space="preserve">' +
                          xml(value) +
                          '</t></is></c>'
                        );
                      }
                    )
                    .join('');

                return (
                  '<row r="' +
                  (
                    rowIndex+1
                  ) +
                  '">' +
                  cells +
                  '</row>'
                );
              }
            )
            .join('');

          return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<sheetData>' +
            rowXml +
            '</sheetData>' +
            '</worksheet>'
          );
        };

      const book_new=
        ()=>({
          SheetNames:[],
          Sheets:{}
        });

      const aoa_to_sheet=
        rows=>({
          __aoa:
            (
              Array.isArray(rows)
                ? rows
                : []
            )
              .map(
                row=>
                  Array.isArray(row)
                    ? [...row]
                    : []
              )
        });

      const book_append_sheet=
        (
          workbook,
          sheet,
          name
        )=>{

          workbook
            .SheetNames
            .push(name);

          workbook
            .Sheets[name]=
              sheet;
        };

      const writeFile=
        (
          workbook,
          filename
        )=>{

          const names=[
            ...workbook.SheetNames
          ];

          const snapshot={
            name:filename,
            SheetNames:names,
            Sheets:{}
          };

          for(
            const name of names
          ){

            snapshot
              .Sheets[name]=
                (
                  workbook
                    .Sheets[name]
                    ?.__aoa ||
                  []
                )
                  .map(
                    row=>[
                      ...row
                    ]
                  );
          }

          window.__GARPI_XLSX_SNAPSHOT__=
            snapshot;

          const overrides=
            names
              .map(
                (
                  name,
                  index
                )=>
                  '<Override PartName="/xl/worksheets/sheet' +
                  (
                    index+1
                  ) +
                  '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
              )
              .join('');

          const contentTypes=
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            overrides +
            '</Types>';

          const rootRels=
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
            '</Relationships>';

          const sheetsXml=
            names
              .map(
                (
                  name,
                  index
                )=>
                  '<sheet name="' +
                  xml(name) +
                  '" sheetId="' +
                  (
                    index+1
                  ) +
                  '" r:id="rId' +
                  (
                    index+1
                  ) +
                  '"/>'
              )
              .join('');

          const workbookXml=
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<sheets>' +
            sheetsXml +
            '</sheets>' +
            '</workbook>';

          const workbookRels=
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            names
              .map(
                (
                  name,
                  index
                )=>
                  '<Relationship Id="rId' +
                  (
                    index+1
                  ) +
                  '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
                  'Target="worksheets/sheet' +
                  (
                    index+1
                  ) +
                  '.xml"/>'
              )
              .join('') +
            '</Relationships>';

          const files=[
            {
              name:'[Content_Types].xml',
              text:contentTypes
            },
            {
              name:'_rels/.rels',
              text:rootRels
            },
            {
              name:'xl/workbook.xml',
              text:workbookXml
            },
            {
              name:'xl/_rels/workbook.xml.rels',
              text:workbookRels
            }
          ];

          names.forEach(
            (
              name,
              index
            )=>{

              files.push({
                name:
                  'xl/worksheets/sheet' +
                  (
                    index+1
                  ) +
                  '.xml',

                text:
                  worksheetXml(
                    snapshot
                      .Sheets[name]
                  )
              });
            }
          );

          const bytes=
            zip(
              files
            );

          const blob=
            new Blob(
              [bytes],
              {
                type:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              }
            );

          const url=
            URL.createObjectURL(
              blob
            );

          const anchor=
            document.createElement(
              'a'
            );

          anchor.href=
            url;

          anchor.download=
            filename;

          anchor.style.display=
            'none';

          document.body.append(
            anchor
          );

          anchor.click();
          anchor.remove();

          setTimeout(
            ()=>
              URL.revokeObjectURL(
                url
              ),
            1000
          );
        };

      window.XLSX={
        utils:{
          book_new,
          aoa_to_sheet,
          book_append_sheet
        },
        writeFile
      };
    });


    await login(
      page,
      dailyCapacityFixture()
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

    const exportButton=
      dashboard.locator(
        '[data-v32-export-xlsx]'
      );

    await expect(
      exportButton
    ).toBeVisible();

    await expect(
      exportButton
    ).toBeEnabled();


    // --------------------------------------------------------
    // Obtain visible authoritative lodged-person KPI.
    // --------------------------------------------------------

    const personalKpi=
      dashboard
        .locator(
          '.v3-kpi'
        )
        .filter({
          hasText:
            'Personal alojando'
        })
        .first();

    await expect(
      personalKpi
    ).toBeVisible();

    const personalText=
      await personalKpi.innerText();

    const personalMatch=
      personalText.match(
        /([\d.]+)/
      );

    expect(
      personalMatch
    ).not.toBeNull();

    const visibleOccupied=
      Number(
        personalMatch[1]
          .replace(
            /\./g,
            ''
          )
      );

    expect(
      visibleOccupied
    ).toBeGreaterThan(0);


    // --------------------------------------------------------
    // Real .xlsx download.
    // --------------------------------------------------------

    const downloadPromise=
      page.waitForEvent(
        'download'
      );

    await exportButton.press(
      'Enter'
    );

    const download=
      await downloadPromise;

    expect(
      await download.failure()
    ).toBeNull();

    expect(
      download.suggestedFilename()
    ).toMatch(
      /^GARPI_resumen_gerencial_\d{4}-\d{2}-\d{2}\.xlsx$/
    );

    const stream=
      await download.createReadStream();

    expect(
      stream
    ).not.toBeNull();

    const chunks=[];

    for await(
      const chunk of stream
    ){
      chunks.push(
        Buffer.from(chunk)
      );
    }

    const binary=
      Buffer.concat(
        chunks
      );

    expect(
      binary.length
    ).toBeGreaterThan(1000);

    expect(
      Array.from(
        binary.subarray(
          0,
          4
        )
      )
    ).toEqual([
      0x50,
      0x4b,
      0x03,
      0x04
    ]);

    const zipText=
      binary.toString(
        'utf8'
      );

    expect(
      zipText
    ).toContain(
      'xl/workbook.xml'
    );

    expect(
      zipText
    ).toContain(
      'xl/worksheets/sheet1.xml'
    );

    expect(
      zipText
    ).toContain(
      'Resumen Ejecutivo'
    );

    expect(
      zipText
    ).toContain(
      'Alojamiento Empresas'
    );


    // --------------------------------------------------------
    // Validate workbook model passed by GARPI to the XLSX layer.
    // --------------------------------------------------------

    const workbook=
      await page.evaluate(
        ()=>
          window
            .__GARPI_XLSX_SNAPSHOT__
      );

    expect(
      workbook
    ).toBeTruthy();

    expect(
      workbook.SheetNames
    ).toEqual([
      'Resumen Ejecutivo',
      'Alojamiento Empresas',
      'MOD-MOI y Cargos',
      'Datos Grafico',
      'Contexto'
    ]);

    const summary=
      workbook
        .Sheets[
          'Resumen Ejecutivo'
        ];

    const companies=
      workbook
        .Sheets[
          'Alojamiento Empresas'
        ];

    const roles=
      workbook
        .Sheets[
          'MOD-MOI y Cargos'
        ];

    const chart=
      workbook
        .Sheets[
          'Datos Grafico'
        ];

    const context=
      workbook
        .Sheets[
          'Contexto'
        ];

    const rowValue=
      (
        rows,
        label
      )=>{

        const row=
          rows.find(
            item=>
              String(
                item?.[0] ?? ''
              )===label
          );

        return row?.[1];
      };

    expect(
      Number(
        rowValue(
          summary,
          'Personal alojando en campamento'
        )
      )
    ).toBe(
      visibleOccupied
    );

    expect(
      companies[0]
    ).toEqual(
      expect.arrayContaining([
        'Empresa',
        'Personal alojado',
        '% personal alojado campamento',
        'MOD',
        'MOI',
        'Por definir',
        'Dotación registrada en GARPI'
      ])
    );

    const exportedOccupied=
      companies
        .slice(1)
        .reduce(
          (
            total,
            row
          )=>
            total +
            Number(
              row?.[1] || 0
            ),
          0
        );

    expect(
      exportedOccupied
    ).toBe(
      visibleOccupied
    );

    expect(
      roles[0]
    ).toEqual(
      expect.arrayContaining([
        'Empresa',
        'Cargo / especialidad',
        'Fuente',
        'Categoría registrada',
        'MOD',
        'MOI',
        'Por definir',
        'Total',
        '% empresa'
      ])
    );

    expect(
      chart[0]
    ).toEqual(
      expect.arrayContaining([
        'Empresa',
        'Personal alojado',
        'MOD',
        'MOI',
        'Por definir',
        '% personal alojado campamento'
      ])
    );

    expect(
      rowValue(
        context,
        'Denominador % empresa'
      )
    ).toBe(
      'Total de personal alojando en campamento'
    );

    expect(
      rowValue(
        context,
        'Denominador alternativo'
      )
    ).toBe(
      'Dotación registrada en GARPI'
    );

    expect(
      rowValue(
        context,
        'Cargo'
      )
    ).toContain(
      'Cargo real si existe'
    );
  }
);
