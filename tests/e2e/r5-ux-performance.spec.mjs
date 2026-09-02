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
          item=>
            item.type!=='literal'
        )
        .map(
          item=>[
            item.type,
            item.value
          ]
        )
    );

  return (
    `${map.year}-${map.month}-${map.day}`
  );
}

function addDays(
  iso,
  amount
){
  const date=
    new Date(
      `${iso}T12:00:00Z`
    );

  date.setUTCDate(
    date.getUTCDate()+
    amount
  );

  return date
    .toISOString()
    .slice(0,10);
}

function clone(value){
  return JSON.parse(
    JSON.stringify(value)
  );
}

function sleep(ms){
  return new Promise(
    resolve=>
      setTimeout(
        resolve,
        ms
      )
  );
}

function makeState(
  source='R5C-BASE.xlsx'
){
  const today=
    chileToday();

  const capacities=[];

  for(let i=0;i<=35;i++){
    capacities.push({
      id:i+1,
      capacity_date:
        addDays(
          today,
          i
        ),
      capacity:4
    });
  }

  return {
    workers:[
      {
        id:1,
        rut:'12.345.678-5',
        nombre:'WORKER R5C',
        empresa:'EMPRESA R5',
        turno:'A',
        modulo:'M1',
        habitacion:'101',
        cama:'A',
        sexo:'MASCULINO',
        especialidad:'OPERACIONES',
        categoria:'MOI',
        residencia:'LOCAL'
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
    movements:[],
    capacities,
    snapshots:[],
    imports:[],

    settings:{
      source_file:
        source,

      last_update:
        '2026-09-02T18:10:00Z',

      cost_per_bed_day:
        '0'
    }
  };
}

async function installBackend(page){
  let stateVersion=81;

  let defaultState=
    makeState();

  const stateQueue=[];
  const advancedDelayQueue=[];
  const snapshotDelayQueue=[];

  const delayedConsultCalls=
    new Map();

  const delayedImportCalls=
    new Map();

  let snapshotCalls=0;
  let advancedCalls=0;
  let consultCalls=0;
  let importCalls=0;

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
    status=200
  )=>
    route.fulfill({
      status,
      contentType:
        'application/json',

      headers:cors,

      body:
        JSON.stringify(
          payload
        )
    });

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
      // Login
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
              'r5c-e2e-token'
          }
        );
      }

      // --------------------------------------------------------
      // WEB supporting reads
      // --------------------------------------------------------

      if(
        service==='campamento-web-api' &&
        action==='consults' &&
        method==='GET'
      ){
        consultCalls++;

        const delay=
          delayedConsultCalls.get(
            consultCalls
          )||
          0;

        if(delay){
          await sleep(delay);
        }

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
        importCalls++;

        const delay=
          delayedImportCalls.get(
            importCalls
          )||
          0;

        if(delay){
          await sleep(delay);
        }

        return json(
          route,
          {
            ok:true,
            data:[]
          }
        );
      }

      // --------------------------------------------------------
      // SAFE state
      // --------------------------------------------------------

      if(
        service==='campamento-v560-safe' &&
        action==='snapshot_today' &&
        method==='POST'
      ){
        snapshotCalls++;

        const snapshotDelay=
          snapshotDelayQueue.length
            ? snapshotDelayQueue.shift()
            : 0;

        if(snapshotDelay){
          await sleep(
            snapshotDelay
          );
        }

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
        action==='advanced_state' &&
        method==='GET'
      ){
        advancedCalls++;

        const delay=
          advancedDelayQueue.length
            ? advancedDelayQueue.shift()
            : 0;

        if(delay){
          await sleep(delay);
        }

        const next=
          stateQueue.length
            ? stateQueue.shift()
            : defaultState;

        return json(
          route,
          {
            ok:true,

            state_version:
              String(
                stateVersion
              ),

            data:
              clone(next)
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
            `Unexpected R5C request: `+
            `${service}/${action}/${method}`
        },
        503
      );
    }
  );

  return {
    get snapshotCalls(){
      return snapshotCalls;
    },

    get advancedCalls(){
      return advancedCalls;
    },

    get consultCalls(){
      return consultCalls;
    },

    get importCalls(){
      return importCalls;
    },

    get unexpected(){
      return unexpected;
    },

    queueState(source){
      stateQueue.push(
        makeState(source)
      );
    },

    delayNextAdvanced(ms){
      advancedDelayQueue.push(ms);
    },

    delayNextSnapshot(ms){
      snapshotDelayQueue.push(ms);
    },
    delayConsultCall(
      callNumber,
      ms
    ){
      delayedConsultCalls.set(
        callNumber,
        ms
      );
    },

    delayImportCall(
      callNumber,
      ms
    ){
      delayedImportCalls.set(
        callNumber,
        ms
      );
    }
  };
}

async function login(
  page,
  backend,
  hash='overview'
){
  await page.goto(
    `/admin.html#${hash}`
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
      'R5C-E2E-PASSWORD'
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
      `#view-${hash}`
    )
  ).toHaveClass(
    /active/
  );

  await expect(
    page.locator(
      '#syncBadge'
    )
  ).toHaveText(
    'Actualizado',
    {
      timeout:10000
    }
  );

  await expect(
    page.locator(
      '#refreshAllBtn'
    )
  ).toBeEnabled();

  await expect.poll(
    ()=>
      page.evaluate(
        ()=>
          typeof A!=='undefined' &&
          A.data
            ? A.data.settings.source_file
            : ''
      )
  ).toBe(
    'R5C-BASE.xlsx'
  );

  expect(
    backend.unexpected
  ).toEqual([]);
}

test(
  'R5C doble refresh manual produce una sola sincronización y feedback accesible',
  async({page})=>{
    const backend=
      await installBackend(page);

    await login(
      page,
      backend
    );

    const baseline={
      snapshots:
        backend.snapshotCalls
    };

    /*
     * The busy contract is synchronous.
     *
     * We do NOT require an arbitrary minimum busy duration.
     * Network speed is allowed to vary.
     *
     * The second event is dispatched explicitly so the listener
     * itself runs even though the native button is disabled.
     * data-syncing must reject that concurrent refresh.
     */
    const immediate=
      await page.evaluate(
        ()=>{
          const button=
            document.querySelector(
              '#refreshAllBtn'
            );

          const badge=
            document.querySelector(
              '#syncBadge'
            );

          if(!button){
            throw new Error(
              'refreshAllBtn missing'
            );
          }

          const before={
            disabled:
              button.disabled,

            ariaBusy:
              button.getAttribute(
                'aria-busy'
              ),

            syncing:
              button.getAttribute(
                'data-syncing'
              )
          };

          button.click();

          const afterFirst={
            disabled:
              button.disabled,

            ariaBusy:
              button.getAttribute(
                'aria-busy'
              ),

            syncing:
              button.getAttribute(
                'data-syncing'
              ),

            badge:
              badge?.textContent||
              ''
          };

          /*
           * dispatchEvent intentionally bypasses the native
           * disabled-button click suppression. This means the
           * actual listener is invoked a second time and only
           * data-syncing can prevent another loadAll().
           */
          button.dispatchEvent(
            new MouseEvent(
              'click',
              {
                bubbles:true,
                cancelable:true,
                view:window
              }
            )
          );

          const afterSecond={
            disabled:
              button.disabled,

            ariaBusy:
              button.getAttribute(
                'aria-busy'
              ),

            syncing:
              button.getAttribute(
                'data-syncing'
              )
          };

          return {
            before,
            afterFirst,
            afterSecond
          };
        }
      );

    expect(immediate.before)
      .toEqual({
        disabled:false,
        ariaBusy:null,
        syncing:null
      });

    expect(immediate.afterFirst)
      .toEqual({
        disabled:true,
        ariaBusy:'true',
        syncing:'true',
        badge:'Sincronizando'
      });

    expect(immediate.afterSecond)
      .toEqual({
        disabled:true,
        ariaBusy:'true',
        syncing:'true'
      });

    /*
     * Allow the real refresh to finish naturally.
     */
    await expect.poll(
      ()=>
        backend.snapshotCalls,
      {
        timeout:10000
      }
    ).toBe(
      baseline.snapshots+1
    );

    await expect(
      page.locator(
        '#syncBadge'
      )
    ).toHaveText(
      'Actualizado',
      {
        timeout:10000
      }
    );

    await expect(
      page.locator(
        '#refreshAllBtn'
      )
    ).toBeEnabled();

    await expect(
      page.locator(
        '#refreshAllBtn'
      )
    ).not.toHaveAttribute(
      'aria-busy',
      'true'
    );

    await expect(
      page.locator(
        '#refreshAllBtn'
      )
    ).not.toHaveAttribute(
      'data-syncing',
      'true'
    );

    /*
     * Give any accidentally queued second refresh a chance to
     * surface. The count must remain exactly +1.
     */
    await page.waitForTimeout(
      250
    );

    expect(
      backend.snapshotCalls
    ).toBe(
      baseline.snapshots+1
    );

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5C respuesta antigua no puede sobrescribir una sincronización más nueva',
  async({page})=>{
    const backend=
      await installBackend(page);

    await login(
      page,
      backend
    );

    const advancedBaseline=
      backend.advancedCalls;

    const consultBaseline=
      backend.consultCalls;

    const importBaseline=
      backend.importCalls;

    /*
     * First load gets OLD state immediately,
     * but its consults/imports are delayed.
     */
    backend.queueState(
      'R5C-OLD.xlsx'
    );

    backend.delayConsultCall(
      consultBaseline+1,
      800
    );

    backend.delayImportCall(
      importBaseline+1,
      800
    );

    await page.evaluate(
      ()=>{
        window.__r5cFirst=
          loadAll({
            snapshot:false
          });
      }
    );

    await expect.poll(
      ()=>
        backend.advancedCalls
    ).toBe(
      advancedBaseline+1
    );

    /*
     * advanced_state of the first load has already
     * resolved; wait until the performance dedupe
     * releases that promise, while the first load
     * remains blocked on the delayed WEB reads.
     */
    await page.waitForTimeout(
      180
    );

    backend.queueState(
      'R5C-NEW.xlsx'
    );

    await page.evaluate(
      ()=>{
        window.__r5cSecond=
          loadAll({
            snapshot:false
          });
      }
    );

    await expect.poll(
      ()=>
        backend.advancedCalls
    ).toBe(
      advancedBaseline+2
    );

    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            typeof A!=='undefined' &&
            A.data
              ? A.data.settings.source_file
              : ''
        )
    ).toBe(
      'R5C-NEW.xlsx'
    );

    await expect(
      page.locator(
        '#systemMeta'
      )
    ).toContainText(
      'R5C-NEW.xlsx'
    );

    await page.evaluate(
      ()=>
        Promise.all([
          window.__r5cFirst,
          window.__r5cSecond
        ])
    );

    /*
     * OLD completes last, but latest-request-wins
     * must preserve NEW.
     */
    await expect.poll(
      ()=>
        page.evaluate(
          ()=>
            A.data.settings.source_file
        )
    ).toBe(
      'R5C-NEW.xlsx'
    );

    await expect(
      page.locator(
        '#systemMeta'
      )
    ).not.toContainText(
      'R5C-OLD.xlsx'
    );

    await expect(
      page.locator(
        '#syncBadge'
      )
    ).toHaveText(
      'Actualizado'
    );

    await expect(
      page.locator(
        '#refreshAllBtn'
      )
    ).toBeEnabled();

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5C navegación rápida renderiza sólo la vista final y cancela render obsoleto',
  async({page})=>{
    const backend=
      await installBackend(page);

    await login(
      page,
      backend
    );

    /*
     * Base progressive rendering should not eagerly
     * materialize unrelated operational forms.
     */
    await expect(
      page.locator(
        '#view-reservations'
      )
    ).toBeEmpty();

    await expect(
      page.locator(
        '#view-blocks'
      )
    ).toBeEmpty();

    await page.evaluate(
      ()=>{
        window.__r5cRendered=[];

        window.addEventListener(
          'camp:view-rendered',
          event=>{
            window.__r5cRendered.push(
              event.detail?.view
            );
          }
        );

        /*
         * Same task: reservations schedules a deferred
         * render, then blocks supersedes it.
         */
        switchView(
          'reservations'
        );

        switchView(
          'blocks'
        );
      }
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
        '#blockForm'
      )
    ).toBeVisible();

        await expect(
      page.locator(
        '#view-reservations #reservationForm'
      )
    ).toHaveCount(0);

    await expect(
      page.locator(
        '#view-reservations'
      )
    ).toContainText(
      'Preparando información…'
    );

    const rendered=
      await page.evaluate(
        ()=>
          window.__r5cRendered
      );

    expect(
      rendered
    ).toContain(
      'blocks'
    );

    expect(
      rendered
    ).not.toContain(
      'reservations'
    );

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);

test(
  'R5C topbar mantiene actualización accesible y layout estable en escritorio y móvil',
  async({page})=>{
    const backend=
      await installBackend(page);

    await login(
      page,
      backend
    );

    const refresh=
      page.locator(
        '#refreshAllBtn'
      );

    await expect(refresh)
      .toBeVisible();

    await expect(refresh)
      .toHaveAttribute(
        'aria-label',
        'Actualizar datos del sistema'
      );

    await expect(
      page.locator(
        '#syncBadge'
      )
    ).toBeVisible();

    const metrics=
      await page.evaluate(
        ()=>{
          const viewport=
            document.documentElement.clientWidth;

          const topbar=
            document.querySelector(
              '.admin-topbar .topbar-admin'
            );

          const menu=
            document.querySelector(
              '#menuBtn'
            );

          const refresh=
            document.querySelector(
              '#refreshAllBtn'
            );

          const menuRect=
            menu.getBoundingClientRect();

          const refreshRect=
            refresh.getBoundingClientRect();

          return {
            viewport,

            bodyOverflow:
              document.documentElement.scrollWidth-
              document.documentElement.clientWidth,

            topbarOverflow:
              topbar.scrollWidth-
              topbar.clientWidth,

            menuWidth:
              menuRect.width,

            menuHeight:
              menuRect.height,

            refreshWidth:
              refreshRect.width,

            refreshHeight:
              refreshRect.height
          };
        }
      );

    expect(
      metrics.bodyOverflow
    ).toBeLessThanOrEqual(1);

    expect(
      metrics.topbarOverflow
    ).toBeLessThanOrEqual(1);

    expect(
      metrics.refreshHeight
    ).toBeGreaterThanOrEqual(38);

    if(metrics.viewport<=700){
      expect(
        metrics.menuWidth
      ).toBeGreaterThanOrEqual(44);

      expect(
        metrics.menuHeight
      ).toBeGreaterThanOrEqual(44);

      expect(
        metrics.refreshWidth
      ).toBeGreaterThanOrEqual(120);
    }

    expect(
      backend.unexpected
    ).toEqual([]);
  }
);