import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block'});

const jsonClone=value=>JSON.parse(JSON.stringify(value));

const INITIAL_WORKERS=[
  {
    id:1,
    rut:'11.111.111-1',
    nombre:'ANA PEREZ',
    empresa:'EMPRESA NORTE',
    turno:'A',
    modulo:'M1',
    habitacion:'101',
    cama:'A',
    especialidad:'ELECTRICA',
    categoria:'TECNICO',
    sexo:'F',
    residencia:'SANTIAGO'
  },
  {
    id:2,
    rut:'22.222.222-2',
    nombre:'ANA SILVA',
    empresa:'EMPRESA SUR',
    turno:'B',
    modulo:'M1',
    habitacion:'101',
    cama:'B',
    especialidad:'MECANICA',
    categoria:'SUPERVISOR',
    sexo:'F',
    residencia:'CALAMA'
  },
  {
    id:3,
    rut:'12.345.678-5',
    nombre:'BRUNO ROJAS',
    empresa:'EMPRESA NORTE',
    turno:'A',
    modulo:'M2',
    habitacion:'201',
    cama:'A',
    especialidad:'OPERACIONES',
    categoria:'OPERADOR',
    sexo:'M',
    residencia:'ANTOFAGASTA'
  }
];

const INITIAL_INVENTORY=[
  {id:1,module:'M1',room:'101',bed:'A',estado_turno:'EN TURNO'},
  {id:2,module:'M1',room:'101',bed:'B',estado_turno:'EN TURNO'},
  {id:3,module:'M2',room:'201',bed:'A',estado_turno:'EN TURNO'}
];

function initialState(){
  return {
    workers:jsonClone(INITIAL_WORKERS),
    inventory:jsonClone(INITIAL_INVENTORY),
    blocks:[],
    reservations:[],
    movements:[],
    capacities:[],
    snapshots:[],
    imports:[
      {
        id:1,
        imported_at:'2026-09-02T01:30:00Z',
        filename:'base-r5.xlsx',
        worker_count:3,
        bed_count:3,
        status:'OK',
        notes:'Base R5 inicial'
      }
    ],
    settings:{
      source_file:'base-r5.xlsx',
      last_update:'2026-09-02T01:30:00Z',
      daily_capacity_default:'3',
      cost_per_bed_day:'0'
    }
  };
}

async function installMockBackend(page,{uploadFails=false}={}){
  let state=initialState();
  let stateVersion=7;

  const calls=[];
  const uploads=[];
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
    const service=url.pathname.split('/').filter(Boolean).pop()||'';
    const action=url.searchParams.get('action')||'';
    const method=request.method().toUpperCase();

    calls.push({
      service,
      action,
      method,
      stateVersion:url.searchParams.get('state_version')
    });

    if(method==='OPTIONS'){
      return route.fulfill({
        status:204,
        headers:cors,
        body:''
      });
    }

    if(service==='campamento-web-api'){
      if(action==='admin_login'&&method==='POST'){
        return fulfillJson(route,{
          ok:true,
          token:'r5-e2e-token'
        });
      }

      if(action==='consults'&&method==='GET'){
        return fulfillJson(route,{ok:true,data:[]});
      }

      if(action==='imports'&&method==='GET'){
        return fulfillJson(route,{
          ok:true,
          data:jsonClone(state.imports)
        });
      }

      if(action==='lookup'&&method==='POST'){
        return fulfillJson(route,{
          ok:true,
          status:'NO_ENCONTRADO',
          worker:null
        });
      }

      if(action==='upload_excel'&&method==='POST'){
        const raw=request.postDataBuffer()?.toString('utf8')||'';

        uploads.push({
          method,
          auth:request.headers()['authorization']||'',
          contentType:request.headers()['content-type']||'',
          stateVersion:url.searchParams.get('state_version'),
          body:raw
        });

        if(uploadFails){
          return fulfillJson(
            route,
            {ok:false,error:'Planilla R5 invalida'},
            400
          );
        }

        if(url.searchParams.get('state_version')!==String(stateVersion)){
          return fulfillJson(
            route,
            {ok:false,error:'STATE_CONFLICT'},
            409
          );
        }

        stateVersion++;

        state={
          ...state,
          workers:[
            {
              id:11,
              rut:'11.111.111-1',
              nombre:'ANA PEREZ',
              empresa:'EMPRESA NORTE',
              turno:'A',
              modulo:'M1',
              habitacion:'101',
              cama:'A',
              especialidad:'ELECTRICA',
              categoria:'TECNICO',
              sexo:'F',
              residencia:'SANTIAGO'
            },
            {
              id:12,
              rut:'22.222.222-2',
              nombre:'ANA SILVA',
              empresa:'EMPRESA SUR',
              turno:'B',
              modulo:'M1',
              habitacion:'101',
              cama:'B',
              especialidad:'MECANICA',
              categoria:'SUPERVISOR',
              sexo:'F',
              residencia:'CALAMA'
            }
          ],
          inventory:[
            {id:11,module:'M1',room:'101',bed:'A',estado_turno:'EN TURNO'},
            {id:12,module:'M1',room:'101',bed:'B',estado_turno:'EN TURNO'}
          ],
          settings:{
            ...state.settings,
            source_file:'r5-workers.xlsx',
            last_update:'2026-09-02T05:45:00Z'
          },
          imports:[
            {
              id:2,
              imported_at:'2026-09-02T05:45:00Z',
              filename:'r5-workers.xlsx',
              worker_count:2,
              bed_count:2,
              status:'OK',
              notes:'Carga R5 E2E'
            },
            ...state.imports
          ]
        };

        return fulfillJson(route,{
          ok:true,
          data:{
            workers:2,
            beds:2
          }
        });
      }
    }

    if(service==='campamento-v560-safe'){
      if(action==='advanced_state'&&method==='GET'){
        return fulfillJson(route,{
          ok:true,
          state_version:String(stateVersion),
          data:jsonClone(state)
        });
      }

      if(action==='snapshot_today'&&method==='POST'){
        return fulfillJson(route,{
          ok:true,
          data:{
            snapshot_date:'2026-09-02'
          }
        });
      }

      if(action==='health'&&method==='GET'){
        return fulfillJson(route,{
          ok:true,
          status:'healthy',
          database:true
        });
      }
    }

    if(service==='campamento-control-api'){
      if(action==='state'&&method==='GET'){
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

      if(action==='audit'&&method==='POST'){
        return fulfillJson(route,{ok:true,data:{}});
      }
    }

    if(service==='campamento-workforce-api'&&method==='GET'){
      return fulfillJson(route,{
        ok:true,
        rules:{}
      });
    }

    unexpected.push({service,action,method,url:url.toString()});

    return fulfillJson(
      route,
      {
        ok:false,
        error:`Unexpected R5 E2E request: ${service}/${action}/${method}`
      },
      503
    );
  });

  return {
    get calls(){
      return calls;
    },
    get uploads(){
      return uploads;
    },
    get unexpected(){
      return unexpected;
    },
    get state(){
      return state;
    },
    get stateVersion(){
      return stateVersion;
    }
  };
}

async function loginAdmin(page,view){
  await page.goto(`/admin.html#${view}`);

  await expect(
    page.getByRole('heading',{name:'Acceso administración'})
  ).toBeVisible();

  await page.locator('#adminPassword').fill('R5-E2E-PASSWORD');

  await page
    .locator('#adminLoginForm')
    .getByRole('button',{name:'Ingresar'})
    .click();

  await expect(page.locator('#adminApp')).not.toHaveClass(/hidden/);

  await expect.poll(
    ()=>page.evaluate(()=>Boolean(window.__CAMP_DATA_READY__))
  ).toBe(true);

  await expect(page.locator('#syncBadge')).toHaveText('Actualizado');
}

test(
  'R5B1 trabajadores: consulta real por RUT, coincidencias y ausencia sin escrituras',
  async({page})=>{
    const backend=await installMockBackend(page);

    await loginAdmin(page,'workers');

    await expect(page.locator('#view-workers')).toHaveClass(/active/);

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.stateVersion||'')
    ).toBe('7');

    const search=page.locator('#workerSearch');

    await search.fill('11.111.111-1');

    await expect(
      page.locator('#workerSearchResults .worker-result-card')
    ).toBeVisible();

    await expect(
      page.locator('#workerSearchResults .worker-name')
    ).toHaveText('ANA PEREZ');

    await expect(
      page.locator(
        '#workerSearchResults .worker-assignment-tile.module strong'
      )
    ).toHaveText('M1');

    await expect(
      page.locator(
        '#workerSearchResults .worker-assignment-tile.room strong'
      )
    ).toHaveText('101');

    await expect(
      page.locator(
        '#workerSearchResults .worker-assignment-tile.bed strong'
      )
    ).toHaveText('A');

    await search.fill('ANA');

    await expect(
      page.locator('#workerSearchResults .worker-match-card')
    ).toHaveCount(2);

    await expect(
      page.locator('#workerSearchResults')
    ).toContainText('Se encontraron 2 coincidencias');

    const anaSilva=page
      .locator('#workerSearchResults .worker-match-card')
      .filter({hasText:'ANA SILVA'});

    await expect(anaSilva).toBeVisible();

    await anaSilva
      .getByRole('button',{name:'Ver asignación'})
      .click();

    await expect(
      page.locator('#workerSearchResults .worker-name')
    ).toHaveText('ANA SILVA');

    await search.fill('PERSONA QUE NO EXISTE');

    await expect(
      page.locator('#workerSearchResults .notice.error')
    ).toContainText('No se encontraron trabajadores');

    expect(
      backend.calls.some(
        call=>
          call.action==='save_worker'||
          call.action==='upload_excel'
      )
    ).toBe(false);

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B1 Excel: carga unica, autenticada y versionada actualiza dotacion visible',
  async({page})=>{
    const backend=await installMockBackend(page);

    await loginAdmin(page,'excel');

    await expect(page.locator('#view-excel')).toHaveClass(/active/);

    await expect(page.locator('#view-excel')).toContainText(
      'base-r5.xlsx'
    );

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.stateVersion||'')
    ).toBe('7');

    await page.locator('#excelFile').setInputFiles({
      name:'r5-workers.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer:Buffer.from('GARPI R5 SAFE MOCK XLSX')
    });

    await page
      .locator('#excelForm')
      .getByRole('button',{name:'Validar y cargar planilla'})
      .click();

    await expect.poll(()=>backend.uploads.length).toBe(1);

    await expect(page.locator('#globalMessage')).toContainText(
      'Excel cargado correctamente'
    );

    await expect(page.locator('#globalMessage')).toContainText(
      '2 trabajadores'
    );

    await expect(page.locator('#globalMessage')).toContainText(
      '2 camas'
    );

    await expect(page.locator('#view-excel')).toContainText(
      'r5-workers.xlsx'
    );

    await expect(page.locator('#view-excel')).toContainText(
      'Carga R5 E2E'
    );

    await expect(page.locator('#systemMeta')).toContainText(
      'r5-workers.xlsx'
    );

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.data?.workers?.length||0)
    ).toBe(2);

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.data?.inventory?.length||0)
    ).toBe(2);

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.stateVersion||'')
    ).toBe('8');

    const upload=backend.uploads[0];

    expect(upload.method).toBe('POST');
    expect(upload.auth).toBe('Bearer r5-e2e-token');
    expect(upload.contentType).toContain('multipart/form-data');
    expect(upload.stateVersion).toBe('7');
    expect(upload.body).toContain('name="file"');
    expect(upload.body).toContain('r5-workers.xlsx');

    expect(backend.stateVersion).toBe(8);
    expect(backend.state.settings.source_file).toBe('r5-workers.xlsx');

    expect(backend.unexpected).toEqual([]);
  }
);

test(
  'R5B1 Excel: rechazo preserva base vigente y no avanza revision',
  async({page})=>{
    const backend=await installMockBackend(page,{
      uploadFails:true
    });

    await loginAdmin(page,'excel');

    await expect(page.locator('#view-excel')).toContainText(
      'base-r5.xlsx'
    );

    await page.locator('#excelFile').setInputFiles({
      name:'r5-invalid.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer:Buffer.from('GARPI R5 INVALID MOCK XLSX')
    });

    await page
      .locator('#excelForm')
      .getByRole('button',{name:'Validar y cargar planilla'})
      .click();

    await expect.poll(()=>backend.uploads.length).toBe(1);

    await expect(page.locator('#globalMessage')).toContainText(
      'Planilla R5 invalida'
    );

    await expect(page.locator('#view-excel')).toContainText(
      'base-r5.xlsx'
    );

    expect(backend.state.settings.source_file).toBe('base-r5.xlsx');
    expect(backend.state.workers).toHaveLength(3);
    expect(backend.state.inventory).toHaveLength(3);
    expect(backend.stateVersion).toBe(7);

    await expect.poll(
      ()=>page.evaluate(()=>window.A?.stateVersion||'')
    ).toBe('7');

    expect(backend.uploads[0].stateVersion).toBe('7');
    expect(backend.unexpected).toEqual([]);
  }
);