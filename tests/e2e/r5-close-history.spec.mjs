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

function makeSnapshot(
  date,
  {
    closed=false,
    occupied=1,
    reserved=1,
    capacity=3,
    baseCapacity=4,
    blocked=1,
    sourceRevision=71
  }={}
){
  const committed=
    occupied+
    reserved;

  const occupancy=
    capacity>0
      ? Math.round(
          occupied/
          capacity*
          1000
        )/10
      : (
          occupied>0
            ? 100
            : 0
        );

  const committedOccupancy=
    capacity>0
      ? Math.round(
          committed/
          capacity*
          1000
        )/10
      : (
          committed>0
            ? 100
            : 0
        );

  return {
    id:
      Number(
        date.replaceAll('-','')
      ),

    snapshot_date:
      date,

    base_capacity:
      baseCapacity,

    blocked,

    capacity,

    occupied,

    reserved,
    reserved_today:
      reserved,

    free:
      Math.max(
        capacity-
        committed,
        0
      ),

    occupancy,

    committed_occupancy:
      committedOccupancy,

    total_workers:
      occupied,

    female:0,
    male:
      occupied,

    companies_json:
      JSON.stringify([
        {
          label:'EMPRESA R5',
          n:occupied
        }
      ]),

    shifts_json:
      JSON.stringify([
        {
          label:'A',
          n:occupied
        }
      ]),

    modules_json:
      JSON.stringify([
        {
          label:'M1',
          n:occupied
        }
      ]),

    movements_json:
      JSON.stringify([]),

    reservations_json:
      JSON.stringify(
        reserved
          ? [
              {
                id:500,
                person_name:
                  'RESERVA R5B6',
                arrival_date:
                  date,
                departure_date:
                  addDays(
                    date,
                    1
                  ),
                module:'M1',
                room:'101',
                bed:'B',
                bed_count:
                  reserved
              }
            ]
          : []
      ),

    provenance_status:
      'CAPTURED',

    provenance_version:
      'CAPACITY_V1',

    capacity_source:
      'DAILY_CAPACITY',

    operational_universe_count:
      4,

    operational_universe_fingerprint:
      'r5b6-operational-universe',

    source_import_id:
      55,

    source_operational_revision:
      sourceRevision,

    semantic_version:
      'R4_CAPACITY_V1',

    created_at:
      '2026-09-02T05:00:00Z',

    updated_at:
      closed
        ? '2026-09-02T06:30:00Z'
        : '2026-09-02T06:20:00Z',

    closed_at:
      closed
        ? '2026-09-02T06:30:00Z'
        : ''
  };
}

function makeState(
  snapshots=[]
){
  const today=
    chileToday();

  return {
    workers:[
      {
        id:1,
        rut:'12.345.678-5',
        nombre:
          'WORKER R5B6',
        empresa:
          'EMPRESA R5',
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

    blocks:[
      {
        id:1,
        module:'M1',
        room:'102',
        bed:'B',
        start_date:
          today,
        end_date:
          today,
        reason:
          'R5B6 BLOCK',
        status:
          'ACTIVO'
      }
    ],

    reservations:[
      {
        id:1,
        arrival_date:
          today,
        departure_date:
          addDays(
            today,
            1
          ),
        person_name:
          'RESERVA R5B6',
        role_area:
          'OPERACIONES',
        module:'M1',
        room:'101',
        bed:'B',
        bed_count:1,
        status:
          'CONFIRMADA'
      }
    ],

    movements:[],

    capacities:[
      {
        id:1,
        capacity_date:
          today,
        capacity:4
      }
    ],

    snapshots:
      clone(snapshots),

    imports:[
      {
        id:55,
        status:'OK',
        file_name:
          'r5b6.xlsx'
      }
    ],

    settings:{
      source_file:
        'r5b6.xlsx',

      last_update:
        '2026-09-02T06:35:00Z',

      cost_per_bed_day:
        '0'
    }
  };
}

async function installBackend(
  page,
  {
    snapshots=[],
    closeMode='success'
  }={}
){
  let state=
    makeState(
      snapshots
    );

  let stateVersion=71;

  let armedSnapshotPatch=null;
  let currentCloseMode=
    closeMode;

  const snapshotCalls=[];
  const closeCalls=[];
  const unexpected=[];

  const cors={
    'access-control-allow-origin':'*',

    'access-control-allow-methods':
      'GET,POST,OPTIONS',

    'access-control-allow-headers':
      'authorization,content-type',

    'cache-control':
      'no-store'
  };

  const json=(
    route,
    payload,
    status=200,
    headers={}
  )=>
    route.fulfill({
      status,

      contentType:
        'application/json',

      headers:{
        ...cors,
        ...headers
      },

      body:
        JSON.stringify(
          payload
        )
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

  function todaySnapshot(){
    return state.snapshots.find(
      row=>
        String(
          row.snapshot_date
        )===
        chileToday()
    );
  }

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
      // Login / support
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
              'r5b6-e2e-token'
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
      // SNAPSHOT TODAY
      //
      // VERSION EXEMPT:
      // no state_version must arrive from browser.
      // A closed snapshot is immutable.
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='snapshot_today' &&
        method==='POST'
      ){
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
            bodyOf(request)
        };

        snapshotCalls.push(
          call
        );

        let snapshot=
          todaySnapshot();

        if(!snapshot){
          snapshot=
            makeSnapshot(
              chileToday()
            );

          state.snapshots.push(
            snapshot
          );
        }

        if(
          !String(
            snapshot.closed_at||
            ''
          ).trim() &&
          armedSnapshotPatch
        ){
          Object.assign(
            snapshot,
            clone(
              armedSnapshotPatch
            )
          );

          armedSnapshotPatch=
            null;
        }

        return json(
          route,
          {
            ok:true,
            data:
              clone(snapshot)
          }
        );
      }

      // --------------------------------------------------------
      // SAFE CLOSE DAY
      //
      // VERSION EXEMPT from browser.
      // Safe owns internal revision fencing.
      // Successful non-idempotent close:
      //   source revision 71
      //   next operational revision 72
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='close_day' &&
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

        closeCalls.push(
          call
        );

        if(
          currentCloseMode===
          'conflict'
        ){
          return json(
            route,
            {
              ok:false,
              code:
                'STATE_CONFLICT',

              error:
                'STATE_CONFLICT current=72 expected=71'
            },
            409,
            {
              'x-camp-state-version':
                '72'
            }
          );
        }

        let snapshot=
          todaySnapshot();

        if(!snapshot){
          return json(
            route,
            {
              ok:false,
              code:
                'SNAPSHOT_REQUIRED',

              error:
                'SNAPSHOT_REQUIRED'
            },
            409
          );
        }

        // Already closed => preserve exactly.
        if(
          String(
            snapshot.closed_at||
            ''
          ).trim()
        ){
          return json(
            route,
            {
              ok:true,
              data:
                clone(snapshot),

              message:
                `El dia ${chileToday()} ya estaba cerrado. Se conserva sin recalcular.`,

              state_version:
                String(
                  stateVersion
                ),

              semantic_version:
                'R4_CAPACITY_V1'
            },
            200,
            {
              'x-camp-state-version':
                String(
                  stateVersion
                ),

              'x-garpi-capacity-version':
                'R4_CAPACITY_V1'
            }
          );
        }

        // Simulate close_day_r4 atomic close.
        const sourceRevision=
          stateVersion;

        snapshot={
          ...snapshot,

          provenance_status:
            'CAPTURED',

          provenance_version:
            'CAPACITY_V1',

          capacity_source:
            'DAILY_CAPACITY',

          operational_universe_count:
            4,

          operational_universe_fingerprint:
            'r5b6-operational-universe',

          source_import_id:
            55,

          source_operational_revision:
            sourceRevision,

          semantic_version:
            'R4_CAPACITY_V1',

          closed_at:
            '2026-09-02T06:45:00Z',

          updated_at:
            '2026-09-02T06:45:00Z'
        };

        const index=
          state.snapshots.findIndex(
            row=>
              row.snapshot_date===
              chileToday()
          );

        state.snapshots[index]=
          snapshot;

        // close_day_r4 increments operational_revision.
        stateVersion++;

        return json(
          route,
          {
            ok:true,

            data:
              clone(snapshot),

            message:
              'Cierre Capacity V1 guardado con provenance atomica.',

            capacity_available:
              true,

            capacity_source:
              'DAILY_CAPACITY',

            operational_universe_count:
              4,

            operational_universe_fingerprint:
              'r5b6-operational-universe',

            source_import_id:
              55,

            source_operational_revision:
              sourceRevision,

            provenance_version:
              'CAPACITY_V1',

            semantic_version:
              'R4_CAPACITY_V1',

            state_version:
              String(
                stateVersion
              )
          },
          200,
          {
            'x-camp-state-version':
              String(
                stateVersion
              ),

            'x-garpi-capacity-version':
              'R4_CAPACITY_V1'
          }
        );
      }

      // --------------------------------------------------------
      // Progressive admin support
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
            `Unexpected R5B6 request: `+
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

    get snapshotCalls(){
      return snapshotCalls;
    },

    get closeCalls(){
      return closeCalls;
    },

    get unexpected(){
      return unexpected;
    },

    armSnapshot(patch){
      armedSnapshotPatch=
        clone(patch);
    },

    setCloseMode(mode){
      currentCloseMode=
        mode;
    }
  };
}

async function login(
  page,
  backend
){
  await page.goto(
    '/admin.html#history'
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
      'R5B6-E2E-PASSWORD'
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
      '#view-history'
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
    page.getByRole(
      'heading',
      {
        name:
          'Histórico completo y cierre diario'
      }
    )
  ).toBeVisible();

  await expect(
    page.locator(
      '#historyDate'
    )
  ).toBeVisible();
}

function historyKpi(
  page,
  label
){
  return page
    .locator(
      '#view-history .kpi'
    )
    .filter({
      hasText:label
    })
    .first();
}

async function expectHistoryKpi(
  page,
  label,
  value
){
  const card=
    historyKpi(
      page,
      label
    );

  await expect(card)
    .toBeVisible();

  await expect(
    card.locator(
      '.label'
    )
  ).toHaveText(
    label
  );

  await expect(
    card.locator(
      '.value'
    )
  ).toHaveText(
    String(value)
  );
}

test(
  'R5B6 cierre histórico permanece congelado y navegación pasada es read-only',
  async({page})=>{
    const today=
      chileToday();

    const yesterday=
      addDays(
        today,
        -1
      );

    const todayClosed=
      makeSnapshot(
        today,
        {
          closed:true,
          occupied:2,
          reserved:0,
          capacity:3,
          sourceRevision:70
        }
      );

    const previousClosed=
      makeSnapshot(
        yesterday,
        {
          closed:true,
          occupied:1,
          reserved:1,
          capacity:4,
          baseCapacity:4,
          blocked:0,
          sourceRevision:69
        }
      );

    const backend=
      await installBackend(
        page,
        {
          snapshots:[
            previousClosed,
            todayClosed
          ]
        }
      );

    await login(
      page,
      backend
    );

    const immutableBefore=
      clone(
        backend.state.snapshots.find(
          row=>
            row.snapshot_date===
            today
        )
      );

    const snapshotBaseline=
      backend.snapshotCalls.length;

    // A closed current snapshot can be refreshed from UI,
    // but backend must preserve it unchanged.
    await page
      .locator(
        '#snapshotBtn'
      )
      .click();

    await expect.poll(
      ()=>
        backend.snapshotCalls.length
    ).toBe(
      snapshotBaseline+1
    );

    expect(
      backend.snapshotCalls.at(-1)
        .stateVersion
    ).toBeNull();

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Snapshot actualizado.'
    );

    expect(
      backend.state.snapshots.find(
        row=>
          row.snapshot_date===
          today
      )
    ).toEqual(
      immutableBefore
    );

    expect(
      backend.stateVersion
    ).toBe(71);

    await expect(
      page.locator(
        `#historyDate option[value="${today}"]`
      )
    ).toContainText(
      'cerrado'
    );

    // Navigate to prior closed day.
    await page
      .locator(
        '#historyDate'
      )
      .selectOption(
        yesterday
      );

    await expect(
      page.locator(
        '#historyDate'
      )
    ).toHaveValue(
      yesterday
    );

    await expect(
      page.locator(
        '#snapshotBtn'
      )
    ).toHaveCount(0);

    await expect(
      page.locator(
        '#closeDayBtn'
      )
    ).toHaveCount(0);

    await expectHistoryKpi(
      page,
      'Capacidad',
      '4'
    );

    await expectHistoryKpi(
      page,
      'Ocupadas',
      '1'
    );

    await expectHistoryKpi(
      page,
      'Reservadas',
      '1'
    );

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B6 snapshot abierto se actualiza sin avanzar revision operacional',
  async({page})=>{
    const today=
      chileToday();

    const backend=
      await installBackend(
        page,
        {
          snapshots:[
            makeSnapshot(
              today,
              {
                closed:false,
                occupied:1,
                reserved:1,
                capacity:3,
                sourceRevision:71
              }
            )
          ]
        }
      );

    await login(
      page,
      backend
    );

    await expect(
      page.locator(
        `#historyDate option[value="${today}"]`
      )
    ).toContainText(
      'actual'
    );

    await expectHistoryKpi(
      page,
      'Ocupadas',
      '1'
    );

    await expectHistoryKpi(
      page,
      'Reservadas',
      '1'
    );

    backend.armSnapshot({
      occupied:2,
      reserved:0,
      reserved_today:0,
      free:1,
      occupancy:66.7,
      committed_occupancy:66.7,
      total_workers:2,
      updated_at:
        '2026-09-02T06:42:00Z'
    });

    const baseline=
      backend.snapshotCalls.length;

    await page
      .locator(
        '#snapshotBtn'
      )
      .click();

    await expect.poll(
      ()=>
        backend.snapshotCalls.length
    ).toBe(
      baseline+1
    );

    const call=
      backend.snapshotCalls.at(-1);

    expect(call.auth)
      .toBe(
        'Bearer r5b6-e2e-token'
      );

    // Client must not attach its revision.
    expect(call.stateVersion)
      .toBeNull();

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Snapshot actualizado.'
    );

    await expectHistoryKpi(
      page,
      'Ocupadas',
      '2'
    );

    await expectHistoryKpi(
      page,
      'Reservadas',
      '0'
    );

    await expectHistoryKpi(
      page,
      'Libres',
      '1'
    );

    const snapshot=
      backend.state.snapshots.find(
        row=>
          row.snapshot_date===
          today
      );

    expect(snapshot.closed_at)
      .toBe('');

    expect(
      snapshot
        .source_operational_revision
    ).toBe(71);

    // Open snapshot write does not change
    // operational_revision.
    expect(
      backend.stateVersion
    ).toBe(71);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('71');

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B6 cierre Safe congela snapshot con provenance y avanza revision',
  async({page})=>{
    const today=
      chileToday();

    const backend=
      await installBackend(
        page,
        {
          snapshots:[
            makeSnapshot(
              today,
              {
                closed:false,
                occupied:1,
                reserved:1,
                capacity:3,
                sourceRevision:71
              }
            )
          ]
        }
      );

    await login(
      page,
      backend
    );

    const closeBaseline=
      backend.closeCalls.length;

    page.once(
      'dialog',
      async dialog=>{
        expect(
          dialog.message()
        ).toContain(
          'Confirmas CERRAR DÍA'
        );

        await dialog.accept();
      }
    );

    await page
      .locator(
        '#closeDayBtn'
      )
      .click();

    await expect.poll(
      ()=>
        backend.closeCalls.length
    ).toBe(
      closeBaseline+1
    );

    const call=
      backend.closeCalls.at(-1);

    expect(call.auth)
      .toBe(
        'Bearer r5b6-e2e-token'
      );

    // close_day is intentionally version-exempt in
    // browser. Safe owns its internal concurrency fence.
    expect(call.stateVersion)
      .toBeNull();

    expect(call.body)
      .toMatchObject({
        snapshot_date:
          today
      });

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'Cierre Capacity V1 guardado'
    );

    // close_day_r4 advances revision 71 -> 72.
    expect(
      backend.stateVersion
    ).toBe(72);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('72');

    await expect(
      page.locator(
        `#historyDate option[value="${today}"]`
      )
    ).toContainText(
      'cerrado'
    );

    const persisted=
      await page.evaluate(
        date=>{
          const row=
            A.data.snapshots.find(
              snapshot=>
                snapshot.snapshot_date===
                date
            );

          return {
            closed_at:
              row?.closed_at,

            provenance_status:
              row?.provenance_status,

            provenance_version:
              row?.provenance_version,

            capacity_source:
              row?.capacity_source,

            operational_universe_count:
              row?.operational_universe_count,

            operational_universe_fingerprint:
              row?.operational_universe_fingerprint,

            source_import_id:
              row?.source_import_id,

            source_operational_revision:
              row?.source_operational_revision,

            semantic_version:
              row?.semantic_version
          };
        },
        today
      );

    expect(
      String(
        persisted.closed_at||
        ''
      )
    ).not.toBe('');

    expect(persisted)
      .toMatchObject({
        provenance_status:
          'CAPTURED',

        provenance_version:
          'CAPACITY_V1',

        capacity_source:
          'DAILY_CAPACITY',

        operational_universe_count:
          4,

        operational_universe_fingerprint:
          'r5b6-operational-universe',

        source_import_id:
          55,

        source_operational_revision:
          71,

        semantic_version:
          'R4_CAPACITY_V1'
      });

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5B6 conflicto de cierre preserva snapshot abierto y revision local',
  async({page})=>{
    const today=
      chileToday();

    const open=
      makeSnapshot(
        today,
        {
          closed:false,
          occupied:1,
          reserved:1,
          capacity:3,
          sourceRevision:71
        }
      );

    const backend=
      await installBackend(
        page,
        {
          snapshots:[
            open
          ],

          closeMode:
            'conflict'
        }
      );

    await login(
      page,
      backend
    );

    const before=
      clone(
        backend.state.snapshots
      );

    page.once(
      'dialog',
      async dialog=>{
        await dialog.accept();
      }
    );

    await page
      .locator(
        '#closeDayBtn'
      )
      .click();

    await expect.poll(
      ()=>
        backend.closeCalls.length
    ).toBe(1);

    expect(
      backend.closeCalls[0]
        .stateVersion
    ).toBeNull();

    await expect(
      page.locator(
        '#globalMessage'
      )
    ).toContainText(
      'STATE_CONFLICT'
    );

    // Resilience runtime marks conflict,
    // but does not fabricate a refresh.
    await expect(
      page.locator(
        '#syncBadge'
      )
    ).toContainText(
      'Cambios externos'
    );

    expect(
      backend.state.snapshots
    ).toEqual(
      before
    );

    expect(
      backend.stateVersion
    ).toBe(71);

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            window.A
              ?.stateVersion||
            ''
        )
    ).toBe('71');

    await expect(
      page.locator(
        `#historyDate option[value="${today}"]`
      )
    ).toContainText(
      'actual'
    );

    const localSnapshot=
      await page.evaluate(
        date=>{
          const row=
            A.data.snapshots.find(
              snapshot=>
                snapshot.snapshot_date===
                date
            );

          return {
            closed_at:
              row?.closed_at||
              '',

            source_operational_revision:
              row?.source_operational_revision
          };
        },
        today
      );

    expect(
      localSnapshot.closed_at
    ).toBe('');

    expect(
      localSnapshot
        .source_operational_revision
    ).toBe(71);

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);