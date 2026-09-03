import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_ORIGIN=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const UPSTREAM=`${SUPABASE_ORIGIN}/functions/v1/campamento-v560-fast`;
const TZ='America/Santiago';
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff'
};
const enc=new TextEncoder();

const db=createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth:{
      persistSession:false
    }
  }
);

const R4_CAPACITY_VERSION=
  'R4_CAPACITY_V1';
const CONCURRENCY_EXEMPT=new Set(['snapshot_today','close_day']);
function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
async function upstream(req:Request,url:string,body?:ArrayBuffer){const h=new Headers();const auth=req.headers.get('authorization');if(auth)h.set('authorization',auth);const ct=req.headers.get('content-type');if(ct)h.set('content-type',ct);const init:any={method:req.method,headers:h};if(req.method!=='GET'&&req.method!=='HEAD'&&body!==undefined)init.body=body;return await fetch(url,init)}
function respond(body:ArrayBuffer,status:number,contentType:string|null,extra:Record<string,string>={}){const h=new Headers({...cors,...extra});h.set('content-type',contentType||'application/json; charset=utf-8');return new Response(body,{status,headers:h})}
function json(data:any,status=200,extra:Record<string,string>={}){const b=enc.encode(JSON.stringify(data));return respond(b.buffer,status,'application/json; charset=utf-8',extra)}
async function currentState(req:Request){const auth=req.headers.get('authorization')||'';const r=await fetch(`${UPSTREAM}?action=advanced_state`,{headers:{authorization:auth}});const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}return {response:r,data}}
async function claimRevision(req:Request,expected:string){
  const auth=req.headers.get('authorization')||'';
  const q=new URLSearchParams({action:'claim_revision'});if(expected)q.set('expected',expected);
  const r=await fetch(`${UPSTREAM}?${q.toString()}`,{method:'POST',headers:{authorization:auth}});
  const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}
  return {response:r,data};
}
async function refreshTodaySnapshot(
  req:Request
){
  const auth=
    req.headers.get(
      'authorization'
    )||'';

  const r=
    await fetch(
      UPSTREAM+
      '?action=snapshot_today',
      {
        method:'POST',
        headers:{
          authorization:auth,
          'content-type':
            'application/json'
        },
        body:'{}'
      }
    );

  const text=
    await r.text();

  let data:any;

  try{
    data=JSON.parse(text);
  }catch{
    data={
      ok:false,
      error:text||('HTTP '+r.status)
    };
  }

  return{
    response:r,
    data
  };
}

function r4CloseStatus(
  message:string
){
  if(
    message.includes('CAPACITY_UNAVAILABLE')||
    message.includes('PROVENANCE_UNAVAILABLE')
  ){
    return 422;
  }

  if(
    message.includes('STATE_CONFLICT')||
    message.includes('SNAPSHOT_REQUIRED')||
    message.includes('OPERATIONAL_REVISION_UNAVAILABLE')
  ){
    return 409;
  }

  return 500;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const u=new URL(req.url),action=u.searchParams.get('action')||'';
    if(req.method==='GET'&&action==='health'){
      const r=await fetch(`${UPSTREAM}?action=health&cid=${encodeURIComponent(u.searchParams.get('cid')||'')}`);
      return respond(await r.arrayBuffer(),r.status,r.headers.get('content-type'));
    }
    const body=req.method!=='GET'&&req.method!=='HEAD'?await req.arrayBuffer():undefined;
    if(req.method==='POST'&&action==='close_day'){
      const before=
        await currentState(req);

      if(!before.response.ok){
        return json(
          before.data,
          before.response.status
        );
      }

      const d=
        today();

      const existing=
        before.data
          ?.data
          ?.snapshots
          ?.find(
            (x:any)=>
              String(
                x?.snapshot_date||
                ''
              )===d&&
              String(
                x?.closed_at||
                ''
              ).trim()
          );

      if(existing){
        return json(
          {
            ok:true,
            data:existing,
            message:
              'El dia '+
              d+
              ' ya estaba cerrado. Se conserva sin recalcular.',
            state_version:
              before.data?.state_version||
              null,
            semantic_version:
              R4_CAPACITY_VERSION
          }
        );
      }

      const refreshed=
        await refreshTodaySnapshot(req);

      if(!refreshed.response.ok){
        return json(
          refreshed.data,
          refreshed.response.status
        );
      }

      const current=
        await currentState(req);

      if(!current.response.ok){
        return json(
          current.data,
          current.response.status
        );
      }

      const expected=
        String(
          current.data?.state_version||
          ''
        );

      if(!/^\d+$/.test(expected)){
        return json(
          {
            ok:false,
            code:
              'OPERATIONAL_REVISION_UNAVAILABLE',
            error:
              'No fue posible certificar la revision operacional.'
          },
          409
        );
      }

      const {
        data,
        error
      }=
        await db.rpc(
          'close_day_r4',
          {
            p_snapshot_date:d,
            p_expected_revision:expected
          }
        );

      if(error){
        const message=
          String(
            error.message||
            error.details||
            error.code||
            'R4_CLOSE_FAILED'
          );

        console.error(
          'close_day_r4',
          error
        );

        const code=
          message.includes(
            'CAPACITY_UNAVAILABLE'
          )
            ? 'CAPACITY_UNAVAILABLE'
            : message.includes(
                'PROVENANCE_UNAVAILABLE'
              )
              ? 'PROVENANCE_UNAVAILABLE'
              : message.includes(
                  'STATE_CONFLICT'
                )
                ? 'STATE_CONFLICT'
                : 'R4_CLOSE_FAILED';

        return json(
          {
            ok:false,
            code,
            error:message
          },
          r4CloseStatus(message)
        );
      }

      const result=
        data&&
        typeof data==='object'
          ? data
          : {};

      const snapshot=
        result.snapshot||
        null;

      if(
        result.legacy!==true&&
        (
          !snapshot||
          snapshot.provenance_status!==
            'CAPTURED'||
          snapshot.provenance_version!==
            'CAPACITY_V1'||
          !snapshot.capacity_source||
          snapshot.operational_universe_count===
            null||
          snapshot.operational_universe_count===
            undefined||
          snapshot.source_import_id===
            null||
          snapshot.source_import_id===
            undefined||
          snapshot.source_operational_revision===
            null||
          snapshot.source_operational_revision===
            undefined
        )
      ){
        return json(
          {
            ok:false,
            code:
              'R4_PROVENANCE_INCOMPLETE',
            error:
              'El cierre R4 no devolvio provenance completa.'
          },
          500
        );
      }

      const stateVersion=
        String(
          result.state_version||
          expected
        );

      return json(
        {
          ok:true,
          data:snapshot,

          message:
            result.legacy===true
              ? 'Cierre legacy preservado.'
              : 'Cierre Capacity V1 guardado con provenance atomica.',

          capacity_available:
            result.capacity_available??
            true,

          capacity_source:
            result.capacity_source??
            snapshot?.capacity_source??
            null,

          operational_universe_count:
            result.operational_universe_count??
            snapshot?.operational_universe_count??
            null,

          operational_universe_fingerprint:
            result.operational_universe_fingerprint??
            snapshot?.operational_universe_fingerprint??
            null,

          source_import_id:
            result.source_import_id??
            snapshot?.source_import_id??
            null,

          source_operational_revision:
            result.source_operational_revision??
            snapshot?.source_operational_revision??
            null,

          provenance_version:
            result.provenance_version??
            snapshot?.provenance_version??
            null,

          semantic_version:
            R4_CAPACITY_VERSION,

          state_version:
            stateVersion
        },
        200,
        {
          'x-camp-state-version':
            stateVersion,

          'x-garpi-capacity-version':
            R4_CAPACITY_VERSION
        }
      );
    }if(req.method==='POST'&&!CONCURRENCY_EXEMPT.has(action)){
      const c=await claimRevision(req,u.searchParams.get('state_version')||'');
      if(!c.response.ok)return json(c.data,c.response.status,{'x-camp-state-version':String(c.data?.current_state_version||c.data?.state_version||'')});
    }
    const r=await upstream(req,UPSTREAM+u.search,body);
    return respond(await r.arrayBuffer(),r.status,r.headers.get('content-type'));
  }catch(e){console.error(e);return json({ok:false,error:'Error temporal del servidor'},500)}
});
